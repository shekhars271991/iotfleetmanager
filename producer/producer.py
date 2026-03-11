"""Simulation-driven telemetry producer for IoT Fleet Manager.

Each device reports a single metric (defined by its metric_type field).
Kafka message: key=deviceid:epoch, value={"device_id","metric","value","timestamp"}
"""

import os
import json
import time
import random
from datetime import datetime, timezone

import aerospike
from kafka import KafkaProducer
from kafka.errors import NoBrokersAvailable

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "localhost:9094")
AEROSPIKE_HOST = os.getenv("AEROSPIKE_HOST", "localhost")
AEROSPIKE_PORT = int(os.getenv("AEROSPIKE_PORT", "3000"))
NAMESPACE = os.getenv("AEROSPIKE_NAMESPACE", "iotfleet")
TOPIC = "iot-telemetry"
SIM_SET = "simulations"


def connect_kafka():
    while True:
        try:
            producer = KafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP,
                key_serializer=lambda k: k.encode("utf-8") if k else None,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            )
            print(f"Connected to Kafka at {KAFKA_BOOTSTRAP}")
            return producer
        except NoBrokersAvailable:
            print("Kafka not ready, retrying in 5s...")
            time.sleep(5)


def connect_aerospike():
    config = {"hosts": [(AEROSPIKE_HOST, AEROSPIKE_PORT)]}
    client = aerospike.client(config).connect()
    print(f"Connected to Aerospike at {AEROSPIKE_HOST}:{AEROSPIKE_PORT}")
    return client


def load_active_simulations(as_client):
    query = as_client.query(NAMESPACE, SIM_SET)
    sims = []
    def cb(record):
        _, _, bins = record
        if bins.get("status") == "running":
            sims.append({
                "id": bins.get("id", ""),
                "template": bins.get("template", "normal"),
                "device_ids": json.loads(bins.get("device_ids", "[]")),
                "interval": bins.get("interval", 5),
                "config": json.loads(bins.get("config", "{}")),
                "msgs_sent": bins.get("msgs_sent", 0),
                "cycle_count": bins.get("cycle_count", 0),
            })
    query.foreach(cb)
    return sims


_device_cache = {}
_device_cache_ts = 0
DEVICE_CACHE_TTL = 30


def get_device(as_client, device_id):
    global _device_cache, _device_cache_ts
    now = time.time()
    if now - _device_cache_ts > DEVICE_CACHE_TTL:
        _device_cache = {}
        _device_cache_ts = now

    if device_id in _device_cache:
        return _device_cache[device_id]

    try:
        _, _, bins = as_client.get((NAMESPACE, "devices", device_id))
        dev = {
            "id": bins.get("id", device_id),
            "type": bins.get("type", "sensor"),
            "status": bins.get("status", "online"),
            "metric_type": bins.get("metric_type", ""),
        }
        _device_cache[device_id] = dev
        return dev
    except Exception:
        return None


def update_sim_stats(as_client, sim_id, sent, cycle_count):
    key = (NAMESPACE, SIM_SET, sim_id)
    try:
        _, _, bins = as_client.get(key)
        bins["msgs_sent"] = bins.get("msgs_sent", 0) + sent
        bins["cycle_count"] = cycle_count
        as_client.put(key, bins)
    except Exception:
        pass


_total_msgs = 0

def write_heartbeat(as_client, sent_this_cycle=0):
    global _total_msgs
    _total_msgs += sent_this_cycle
    key = (NAMESPACE, "config", "hb_producer")
    try:
        as_client.put(key, {
            "id": "hb_producer",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "msgs_total": _total_msgs,
        })
    except Exception:
        pass


def set_device_status(as_client, device_id, status):
    key = (NAMESPACE, "devices", device_id)
    try:
        as_client.put(key, {"status": status, "last_seen": datetime.now(timezone.utc).isoformat()})
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Normal/stress ranges per metric_type
# ---------------------------------------------------------------------------

NORMAL_RANGES = {
    "temp": (18.0, 32.0),
    "humidity": (30.0, 70.0),
    "battery_pct": (40.0, 100.0),
    "cpu_usage": (10.0, 60.0),
    "mem_usage": (20.0, 50.0),
    "uplink_kbps": (500.0, 5000.0),
    "position": (10.0, 90.0),
    "power_on": (0.0, 1.0),
    "fps": (25.0, 60.0),
    "storage_pct": (10.0, 60.0),
    "pressure": (990.0, 1030.0),
    "noise_db": (30.0, 65.0),
    "vibration": (0.1, 2.0),
    "lux": (100.0, 800.0),
}

STRESS_RANGES = {
    "temp": (42.0, 55.0),
    "humidity": (85.0, 99.0),
    "battery_pct": (2.0, 15.0),
    "cpu_usage": (88.0, 100.0),
    "mem_usage": (82.0, 98.0),
    "uplink_kbps": (8500.0, 10000.0),
    "position": (0.0, 100.0),
    "power_on": (0.0, 1.0),
    "fps": (2.0, 10.0),
    "storage_pct": (88.0, 99.0),
    "pressure": (960.0, 985.0),
    "noise_db": (85.0, 110.0),
    "vibration": (5.0, 15.0),
    "lux": (0.0, 30.0),
}

ANOMALY_RANGES = {
    "temp": (48.0, 60.0),
    "humidity": (92.0, 100.0),
    "battery_pct": (0.0, 3.0),
    "cpu_usage": (96.0, 100.0),
    "mem_usage": (95.0, 100.0),
    "uplink_kbps": (9500.0, 10000.0),
    "position": (0.0, 100.0),
    "power_on": (0.0, 1.0),
    "fps": (0.0, 3.0),
    "storage_pct": (96.0, 100.0),
    "pressure": (940.0, 960.0),
    "noise_db": (100.0, 130.0),
    "vibration": (12.0, 25.0),
    "lux": (0.0, 5.0),
}

INT_METRICS = {"battery_pct", "uplink_kbps", "position", "fps", "lux"}


def _gen_value(metric, lo, hi):
    if metric == "power_on":
        return float(random.choice([0, 1]))
    if metric in INT_METRICS:
        return float(random.randint(int(lo), int(hi)))
    return round(random.uniform(lo, hi), 1)


def _lerp(lo1, hi1, lo2, hi2, factor):
    return (lo1 + (lo2 - lo1) * factor, hi1 + (hi2 - hi1) * factor)


def _fallback_metric(device_type):
    defaults = {"sensor": "temp", "gateway": "cpu_usage", "actuator": "position", "camera": "fps"}
    return defaults.get(device_type, "temp")


# ---------------------------------------------------------------------------
# Template generators — each returns a single (metric, value) or None
# ---------------------------------------------------------------------------

def gen_normal(device):
    metric = device.get("metric_type") or _fallback_metric(device["type"])
    lo, hi = NORMAL_RANGES.get(metric, (0, 100))
    return metric, _gen_value(metric, lo, hi)


def gen_anomaly(device, anomaly_rate):
    metric = device.get("metric_type") or _fallback_metric(device["type"])
    if random.random() * 100 < anomaly_rate:
        lo, hi = ANOMALY_RANGES.get(metric, STRESS_RANGES.get(metric, (0, 100)))
    else:
        lo, hi = NORMAL_RANGES.get(metric, (0, 100))
    return metric, _gen_value(metric, lo, hi)


def gen_stress(device, intensity):
    metric = device.get("metric_type") or _fallback_metric(device["type"])
    factor = max(0.5, min(1.0, intensity / 100.0))
    n_lo, n_hi = NORMAL_RANGES.get(metric, (0, 100))
    s_lo, s_hi = STRESS_RANGES.get(metric, (0, 100))
    lo, hi = _lerp(n_lo, n_hi, s_lo, s_hi, factor)
    return metric, _gen_value(metric, lo, hi)


def gen_degradation(device, degrade_rate, cycle):
    metric = device.get("metric_type") or _fallback_metric(device["type"])
    factor = min(1.0, cycle * degrade_rate / 1000.0)
    n_lo, n_hi = NORMAL_RANGES.get(metric, (0, 100))
    s_lo, s_hi = STRESS_RANGES.get(metric, (0, 100))
    lo, hi = _lerp(n_lo, n_hi, s_lo, s_hi, factor)
    return metric, _gen_value(metric, lo, hi)


def gen_intermittent(device, offline_pct, as_client):
    if random.random() * 100 < offline_pct:
        set_device_status(as_client, device["id"], "offline")
        return None, None
    set_device_status(as_client, device["id"], "online")
    return gen_normal(device)


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main():
    kafka_producer = connect_kafka()
    as_client = connect_aerospike()

    last_send_times = {}
    print("Producer ready. Waiting for active simulations...")

    while True:
        try:
            sims = load_active_simulations(as_client)
        except Exception as e:
            print(f"Error loading simulations: {e}")
            time.sleep(2)
            continue

        if not sims:
            write_heartbeat(as_client)
            time.sleep(2)
            continue

        now = time.time()
        for sim in sims:
            sid = sim["id"]
            interval = sim["interval"]
            last = last_send_times.get(sid, 0)

            if now - last < interval:
                continue

            last_send_times[sid] = now
            template = sim["template"]
            cfg = sim["config"]
            cycle = sim["cycle_count"] + 1
            sent = 0

            for device_id in sim["device_ids"]:
                device = get_device(as_client, device_id)
                if not device or device["status"] == "decommissioned":
                    continue

                metric, value = None, None
                if template == "normal":
                    metric, value = gen_normal(device)
                elif template == "anomaly":
                    metric, value = gen_anomaly(device, cfg.get("anomaly_rate", 15))
                elif template == "stress":
                    metric, value = gen_stress(device, cfg.get("intensity", 80))
                elif template == "degradation":
                    metric, value = gen_degradation(device, cfg.get("degrade_rate", 5), cycle)
                elif template == "intermittent":
                    metric, value = gen_intermittent(device, cfg.get("offline_pct", 20), as_client)

                if metric is not None and value is not None:
                    ts = datetime.now(timezone.utc).isoformat()
                    epoch = int(time.time() * 1000)
                    msg_key = f"{device_id}:{epoch}"
                    reading = {
                        "device_id": device_id,
                        "metric": metric,
                        "value": value,
                        "timestamp": ts,
                    }
                    kafka_producer.send(TOPIC, key=msg_key, value=reading)
                    sent += 1

            kafka_producer.flush()
            update_sim_stats(as_client, sid, sent, cycle)
            write_heartbeat(as_client, sent)
            print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] sim={sid[:8]} tpl={template} sent={sent} cycle={cycle}")

        active_ids = {s["id"] for s in sims}
        last_send_times = {k: v for k, v in last_send_times.items() if k in active_ids}

        time.sleep(1)


if __name__ == "__main__":
    main()
