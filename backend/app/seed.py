"""Populate Aerospike with sample IoT fleet data."""

import uuid
import random
from datetime import datetime, timezone, timedelta

from app.database import get_client, get_namespace


def _ts(days_ago: int = 0, hours_ago: int = 0) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago, hours=hours_ago)).isoformat()


def seed():
    client = get_client()

    # Check if already seeded
    query = client.query(get_namespace(), "devices")
    existing = []
    query.foreach(lambda r: existing.append(1))
    if existing:
        print("Database already seeded, skipping.")
        return

    # --- Groups ---
    groups = [
        {"id": str(uuid.uuid4()), "name": "Warehouse A", "description": "Main warehouse sensors and gateways"},
        {"id": str(uuid.uuid4()), "name": "Warehouse B", "description": "Secondary warehouse equipment"},
        {"id": str(uuid.uuid4()), "name": "Field Sensors", "description": "Outdoor environmental sensors"},
        {"id": str(uuid.uuid4()), "name": "Office Building", "description": "Office HVAC and security cameras"},
    ]
    for g in groups:
        client.put((get_namespace(), "groups", g["id"]), g)
    print(f"Seeded {len(groups)} groups.")

    # --- Devices ---
    device_templates = [
        ("Temp Sensor WH-A1", "sensor", "online", "192.168.1.10", "2.1.0", "Warehouse A - Zone 1"),
        ("Temp Sensor WH-A2", "sensor", "online", "192.168.1.11", "2.1.0", "Warehouse A - Zone 2"),
        ("Humidity Sensor WH-A3", "sensor", "warning", "192.168.1.12", "2.0.8", "Warehouse A - Zone 3"),
        ("Gateway WH-A", "gateway", "online", "192.168.1.1", "3.4.1", "Warehouse A - Main"),
        ("Motion Cam WH-A", "camera", "online", "192.168.1.20", "1.5.2", "Warehouse A - Entrance"),
        ("Temp Sensor WH-B1", "sensor", "offline", "192.168.2.10", "2.0.5", "Warehouse B - Zone 1"),
        ("Temp Sensor WH-B2", "sensor", "online", "192.168.2.11", "2.1.0", "Warehouse B - Zone 2"),
        ("Gateway WH-B", "gateway", "offline", "192.168.2.1", "3.3.0", "Warehouse B - Main"),
        ("Actuator WH-B Door", "actuator", "warning", "192.168.2.30", "1.2.0", "Warehouse B - Loading"),
        ("Soil Moisture F1", "sensor", "online", "10.0.0.10", "1.8.0", "Field - North Plot"),
        ("Soil Moisture F2", "sensor", "online", "10.0.0.11", "1.8.0", "Field - South Plot"),
        ("Weather Station F", "sensor", "online", "10.0.0.12", "2.3.1", "Field - Central"),
        ("Gateway Field", "gateway", "online", "10.0.0.1", "3.4.1", "Field - Relay Tower"),
        ("Irrigation Valve F1", "actuator", "online", "10.0.0.20", "1.1.0", "Field - North Plot"),
        ("HVAC Controller", "actuator", "online", "172.16.0.10", "2.0.0", "Office - Floor 1"),
        ("HVAC Controller F2", "actuator", "warning", "172.16.0.11", "1.9.5", "Office - Floor 2"),
        ("Security Cam Lobby", "camera", "online", "172.16.0.20", "1.5.2", "Office - Lobby"),
        ("Security Cam Parking", "camera", "offline", "172.16.0.21", "1.4.0", "Office - Parking"),
        ("Access Control Main", "gateway", "online", "172.16.0.1", "3.4.1", "Office - Main Entrance"),
        ("Smoke Detector OF1", "sensor", "online", "172.16.0.30", "1.0.3", "Office - Floor 1"),
    ]

    group_map = {
        "Warehouse A": groups[0]["id"],
        "Warehouse B": groups[1]["id"],
        "Field": groups[2]["id"],
        "Office": groups[3]["id"],
    }

    devices = []
    for i, (name, dtype, status, ip, fwv, loc) in enumerate(device_templates):
        gid = ""
        for prefix, gid_val in group_map.items():
            if prefix in loc:
                gid = gid_val
                break

        days_offset = random.randint(0, 5)
        hours_offset = random.randint(0, 23)
        last_seen = _ts(hours_ago=hours_offset) if status == "online" else _ts(days_ago=days_offset, hours_ago=hours_offset)

        device = {
            "id": str(uuid.uuid4()),
            "name": name,
            "type": dtype,
            "status": status,
            "ip_address": ip,
            "firmware_ver": fwv,
            "location": loc,
            "group_id": gid,
            "last_seen": last_seen,
            "created_at": _ts(days_ago=30 + i),
        }
        client.put((get_namespace(), "devices", device["id"]), device)
        devices.append(device)

    print(f"Seeded {len(devices)} devices.")

    # --- Alerts ---
    problem_devices = [d for d in devices if d["status"] in ("offline", "warning")]
    alerts = []
    alert_messages = {
        "offline": [
            ("Device unreachable - no heartbeat received", "critical"),
            ("Connection timeout after 3 retries", "critical"),
        ],
        "warning": [
            ("High temperature reading detected", "warning"),
            ("Firmware update available", "info"),
            ("Battery level below 20%", "warning"),
        ],
    }

    for dev in problem_devices:
        msgs = alert_messages.get(dev["status"], [])
        for msg, severity in msgs[:random.randint(1, len(msgs))]:
            alert = {
                "id": str(uuid.uuid4()),
                "device_id": dev["id"],
                "message": f"{dev['name']}: {msg}",
                "severity": severity,
                "created_at": _ts(hours_ago=random.randint(0, 48)),
                "acknowledged": 0,
            }
            client.put((get_namespace(), "alerts", alert["id"]), alert)
            alerts.append(alert)

    print(f"Seeded {len(alerts)} alerts.")
    print("Seed complete.")


if __name__ == "__main__":
    seed()
