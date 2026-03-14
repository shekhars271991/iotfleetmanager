"""Consumes IoT telemetry from Kafka, writes to Aerospike, and detects anomalies.

New format: each message has {device_id, metric, value, timestamp}.
"""

import os
import json
import time
import uuid
from datetime import datetime, timezone
from collections import defaultdict

import aerospike
from aerospike import exception as aerospike_ex
from kafka import KafkaConsumer
from kafka.errors import NoBrokersAvailable

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "localhost:9094")
AEROSPIKE_HOST = os.getenv("AEROSPIKE_HOST", "localhost")
AEROSPIKE_PORT = int(os.getenv("AEROSPIKE_PORT", "3000"))
CONFIG_NAMESPACE = "iotfleet"

_active_ns = "iotfleet"
_ns_last_checked = 0
NS_CHECK_INTERVAL = 30


def get_active_namespace(as_client):
    try:
        _, _, bins = as_client.get((CONFIG_NAMESPACE, "config", "showcase_mode"))
        mode = bins.get("value", "iot")
        return {"iot": "iotfleet", "security": "secfleet"}.get(mode, "iotfleet")
    except Exception:
        return "iotfleet"


def refresh_namespace(as_client):
    global _active_ns, _ns_last_checked
    now = time.time()
    if now - _ns_last_checked > NS_CHECK_INTERVAL:
        _active_ns = get_active_namespace(as_client)
        _ns_last_checked = now
    return _active_ns


TOPIC = "iot-telemetry"
TELEMETRY_SET = "telemetry"
ALERT_SET = "alerts"
RULE_SET = "rules"

METRIC_LABELS = {
    "temp": "Temperature", "humidity": "Humidity", "battery_pct": "Battery",
    "cpu_usage": "CPU Usage", "mem_usage": "Memory Usage", "storage_pct": "Storage",
    "fps": "FPS", "uplink_kbps": "Uplink", "pressure": "Pressure",
    "noise_db": "Noise", "vibration": "Vibration", "lux": "Light",
    "position": "Position", "power_on": "Power",
    "failed_logins": "Failed Logins", "network_anomalies": "Network Anomaly",
    "port_scans": "Port Scans", "malware_detections": "Malware",
    "firewall_blocks": "Firewall Blocks", "auth_failures": "Auth Failures",
    "data_transfer_mb": "Data Transfer",
}

METRIC_UNITS = {
    "temp": "°C", "humidity": "%", "battery_pct": "%", "cpu_usage": "%",
    "mem_usage": "%", "storage_pct": "%", "fps": "", "uplink_kbps": "kbps",
    "pressure": "hPa", "noise_db": "dB", "vibration": "g", "lux": "lx",
    "position": "%", "power_on": "",
    "failed_logins": "/min", "network_anomalies": "", "port_scans": "/min",
    "malware_detections": "", "firewall_blocks": "/min", "auth_failures": "/min",
    "data_transfer_mb": "MB/min",
}

OP_FNS = {
    "gt": lambda v, t: v > t,
    "lt": lambda v, t: v < t,
    "gte": lambda v, t: v >= t,
    "lte": lambda v, t: v <= t,
}

OP_LABELS = {"gt": ">", "lt": "<", "gte": "≥", "lte": "≤"}

_alert_cache = defaultdict(float)
ALERT_COOLDOWN_SEC = 60

_rules_cache = []
_rules_last_loaded = 0
RULES_RELOAD_INTERVAL = 15

_device_group_cache = {}
_device_group_last_loaded = 0
DEVICE_GROUP_RELOAD_INTERVAL = 30


def connect_kafka():
    while True:
        try:
            consumer = KafkaConsumer(
                TOPIC,
                bootstrap_servers=KAFKA_BOOTSTRAP,
                value_deserializer=lambda m: json.loads(m.decode("utf-8")),
                group_id="iotfleet-consumer",
                auto_offset_reset="latest",
            )
            print(f"Connected to Kafka at {KAFKA_BOOTSTRAP}, subscribed to '{TOPIC}'")
            return consumer
        except NoBrokersAvailable:
            print("Kafka not ready, retrying in 5s...")
            time.sleep(5)


def connect_aerospike():
    config = {"hosts": [(AEROSPIKE_HOST, AEROSPIKE_PORT)]}
    client = aerospike.client(config).connect()
    ensure_index(client)
    print(f"Connected to Aerospike at {AEROSPIKE_HOST}:{AEROSPIKE_PORT}")
    return client


def ensure_index(client):
    for ns in ("iotfleet", "secfleet"):
        try:
            client.index_string_create(ns, TELEMETRY_SET, "device_id", "idx_telem_device")
        except aerospike_ex.IndexFoundError:
            pass


def create_alert(as_client, device_id, severity, message, rule_scope="", rule_id=""):
    alert_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    key = (_active_ns, ALERT_SET, alert_id)
    bins = {
        "id": alert_id, "device_id": device_id, "severity": severity,
        "message": message, "created_at": now, "acknowledged": 0,
        "rule_scope": rule_scope, "rule_id": rule_id,
    }
    as_client.put(key, bins)
    return alert_id


def load_rules(as_client):
    global _rules_cache, _rules_last_loaded
    now = time.time()
    if now - _rules_last_loaded < RULES_RELOAD_INTERVAL:
        return _rules_cache

    rules = []
    try:
        query = as_client.query(_active_ns, RULE_SET)
        query.foreach(lambda r: rules.append(r[2]))
    except Exception as e:
        print(f"Error loading rules: {e}")
        return _rules_cache

    _rules_cache = [r for r in rules if r.get("enabled", 0)]
    _rules_last_loaded = now
    return _rules_cache


def load_device_groups(as_client):
    global _device_group_cache, _device_group_last_loaded
    now = time.time()
    if now - _device_group_last_loaded < DEVICE_GROUP_RELOAD_INTERVAL:
        return _device_group_cache

    mapping = {}
    try:
        query = as_client.query(_active_ns, "devices")
        query.foreach(lambda r: mapping.update({r[2].get("id", ""): r[2].get("group_id", "")}))
    except Exception:
        return _device_group_cache

    _device_group_cache = mapping
    _device_group_last_loaded = now
    return mapping


def evaluate_rules(device_id, metric, value, as_client):
    """Check a single metric value against rules and create alerts."""
    now = time.time()
    alerts_created = 0

    rules = load_rules(as_client)
    if not rules:
        return 0

    device_groups = load_device_groups(as_client)
    group_id = device_groups.get(device_id, "")

    for rule in rules:
        scope = rule.get("scope", "")
        scope_id = rule.get("scope_id", "")

        if scope == "device" and scope_id != device_id:
            continue
        if scope == "group" and scope_id != group_id:
            continue

        rule_metric = rule.get("metric", "")
        if rule_metric != metric:
            continue

        try:
            threshold = float(rule.get("threshold", 0))
        except (ValueError, TypeError):
            continue

        operator = rule.get("operator", "gt")
        check_fn = OP_FNS.get(operator)
        if not check_fn or not check_fn(value, threshold):
            continue

        rule_id = rule.get("id", "")
        cache_key = (device_id, rule_id)
        if now - _alert_cache[cache_key] < ALERT_COOLDOWN_SEC:
            continue

        severity = rule.get("severity", "warning")
        rule_name = rule.get("name", "")
        label = METRIC_LABELS.get(metric, metric)
        unit = METRIC_UNITS.get(metric, "")
        op_label = OP_LABELS.get(operator, operator)

        msg = f"{rule_name}: {label} = {value}{unit} ({op_label} {threshold}{unit})"
        create_alert(as_client, device_id, severity, msg, rule_scope=scope, rule_id=rule_id)
        _alert_cache[cache_key] = now
        alerts_created += 1

    return alerts_created


def write_heartbeat(as_client, records, alerts):
    key = (CONFIG_NAMESPACE, "config", "hb_consumer")
    try:
        as_client.put(key, {
            "id": "hb_consumer",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "records": records,
            "alerts": alerts,
        })
    except Exception:
        pass


def main():
    kafka_consumer = connect_kafka()
    as_client = connect_aerospike()
    refresh_namespace(as_client)

    count = 0
    alert_count = 0
    last_hb = 0

    for message in kafka_consumer:
        data = message.value
        device_id = data.get("device_id", "")
        timestamp = data.get("timestamp", "")
        metric = data.get("metric", "")
        value = data.get("value")

        if not device_id or not timestamp or not metric or value is None:
            continue

        try:
            value = float(value)
        except (ValueError, TypeError):
            continue

        ts_ms = int(datetime.fromisoformat(timestamp).timestamp() * 1000)
        record_key = f"{device_id}:{ts_ms}"
        key = (_active_ns, TELEMETRY_SET, record_key)

        bins = {
            "device_id": device_id,
            "metric": metric,
            "value": value,
            "timestamp": timestamp,
        }
        as_client.put(key, bins)

        device_key = (_active_ns, "devices", device_id)
        try:
            as_client.put(device_key, {"last_seen": timestamp})
        except Exception:
            pass

        new_alerts = evaluate_rules(device_id, metric, value, as_client)
        alert_count += new_alerts
        count += 1

        if count % 50 == 0:
            refresh_namespace(as_client)

        if count - last_hb >= 10:
            write_heartbeat(as_client, count, alert_count)
            last_hb = count

        if count % 50 == 0:
            print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] "
                  f"Wrote {count} telemetry records | {alert_count} anomaly alerts created")


if __name__ == "__main__":
    main()
