import os
import uuid
import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.database import get_client, NAMESPACE
from app.schemas import SimulationOut

router = APIRouter(tags=["admin"])

SIM_SET = "simulations"
CONFIG_SET = "config"


# ---------------------------------------------------------------------------
# System status
# ---------------------------------------------------------------------------

def _read_heartbeat(client, key_id):
    try:
        _, _, bins = client.get((NAMESPACE, CONFIG_SET, key_id))
        return bins
    except Exception:
        return None


GEMINI_KEY_ID = "gemini_api_key"


@router.get("/admin/gemini-key")
async def get_gemini_key_status():
    """Returns whether a Gemini key is configured (never exposes the actual key)."""
    client = get_client()
    env_key = os.environ.get("GEMINI_API_KEY", "")
    user_key = ""
    try:
        _, _, bins = client.get((NAMESPACE, CONFIG_SET, GEMINI_KEY_ID))
        user_key = bins.get("value", "")
    except Exception:
        pass

    active_source = "user" if user_key else ("env" if env_key else "none")
    active_key = user_key or env_key
    return {
        "env_available": bool(env_key),
        "user_override": bool(user_key),
        "user_key_hint": f"{user_key[:4]}...{user_key[-4:]}" if len(user_key) > 8 else "",
        "active_source": active_source,
        "active": bool(active_key),
    }


@router.put("/admin/gemini-key")
async def set_gemini_key(body: dict):
    key_value = body.get("api_key", "").strip()
    if not key_value:
        raise HTTPException(status_code=400, detail="api_key is required")
    client = get_client()
    client.put((NAMESPACE, CONFIG_SET, GEMINI_KEY_ID), {
        "value": key_value,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"status": "ok", "hint": f"{key_value[:4]}...{key_value[-4:]}" if len(key_value) > 8 else "***"}


@router.delete("/admin/gemini-key")
async def delete_gemini_key():
    client = get_client()
    try:
        client.remove((NAMESPACE, CONFIG_SET, GEMINI_KEY_ID))
    except Exception:
        pass
    return {"status": "ok"}


CLEARABLE_SETS = {
    "alerts": "alerts",
    "telemetry": "telemetry",
    "rules": "rules",
    "simulations": "simulations",
    "devices": "devices",
    "groups": "groups",
    "investigations": "investigations",
    "agg_jobs": "agg_jobs",
    "agg_results": "agg_results",
}


@router.post("/admin/clear-data")
async def clear_data(body: dict):
    """Truncate selected Aerospike sets."""
    sets_to_clear = body.get("sets", [])
    if not sets_to_clear:
        raise HTTPException(status_code=400, detail="No sets specified")

    client = get_client()
    results = {}
    for s in sets_to_clear:
        set_name = CLEARABLE_SETS.get(s)
        if not set_name:
            results[s] = "unknown"
            continue
        try:
            count = 0
            scan = client.scan(NAMESPACE, set_name)
            keys = []
            scan.foreach(lambda r: keys.append(r[0]))
            for k in keys:
                try:
                    client.remove(k)
                    count += 1
                except Exception:
                    pass
            results[s] = count
        except Exception as e:
            results[s] = f"error: {str(e)}"
    return {"cleared": results}


@router.get("/admin/status")
async def get_system_status():
    client = get_client()
    now = datetime.now(timezone.utc)

    # Aerospike
    try:
        aerospike_ok = client.is_connected()
    except Exception:
        aerospike_ok = False

    # Producer heartbeat
    prod_hb = _read_heartbeat(client, "hb_producer")
    prod_ts = prod_hb.get("timestamp", "") if prod_hb else ""
    prod_age = None
    if prod_ts:
        prod_age = (now - datetime.fromisoformat(prod_ts)).total_seconds()

    # Consumer heartbeat
    cons_hb = _read_heartbeat(client, "hb_consumer")
    cons_ts = cons_hb.get("timestamp", "") if cons_hb else ""
    cons_age = None
    if cons_ts:
        cons_age = (now - datetime.fromisoformat(cons_ts)).total_seconds()

    # Kafka inferred from producer/consumer being alive
    kafka_ok = (prod_age is not None and prod_age < 30) or (cons_age is not None and cons_age < 30)

    return {
        "aerospike": {
            "status": "healthy" if aerospike_ok else "down",
            "port": "3000",
        },
        "backend": {
            "status": "healthy",
            "port": "4000",
        },
        "kafka": {
            "status": "healthy" if kafka_ok else "unknown",
            "port": "9092",
        },
        "producer": {
            "status": "healthy" if prod_age is not None and prod_age < 30 else ("stale" if prod_age is not None else "down"),
            "last_heartbeat": prod_ts,
            "msgs_total": prod_hb.get("msgs_total", 0) if prod_hb else 0,
        },
        "consumer": {
            "status": "healthy" if cons_age is not None and cons_age < 30 else ("stale" if cons_age is not None else "down"),
            "last_heartbeat": cons_ts,
            "records": cons_hb.get("records", 0) if cons_hb else 0,
            "alerts": cons_hb.get("alerts", 0) if cons_hb else 0,
        },
    }

TEMPLATES = [
    {
        "id": "normal",
        "name": "Normal",
        "description": "Standard telemetry within expected operating ranges",
        "icon": "chart",
        "color": "blue",
        "options": [],
    },
    {
        "id": "anomaly",
        "name": "Anomaly Injection",
        "description": "Injects random anomalies like temperature spikes, battery drops, and metric drifts",
        "icon": "warning",
        "color": "amber",
        "options": [
            {"key": "anomaly_rate", "label": "Anomaly Rate (%)", "type": "number", "default": 15, "min": 1, "max": 50},
        ],
    },
    {
        "id": "stress",
        "name": "Stress Test",
        "description": "Pushes all metrics to near-critical levels to test alerting thresholds",
        "icon": "bolt",
        "color": "red",
        "options": [
            {"key": "intensity", "label": "Intensity (%)", "type": "number", "default": 80, "min": 50, "max": 100},
        ],
    },
    {
        "id": "degradation",
        "name": "Gradual Degradation",
        "description": "Simulates device aging with slowly worsening metrics over time",
        "icon": "trending_down",
        "color": "orange",
        "options": [
            {"key": "degrade_rate", "label": "Degradation Speed", "type": "number", "default": 5, "min": 1, "max": 20},
        ],
    },
    {
        "id": "intermittent",
        "name": "Intermittent Connectivity",
        "description": "Devices randomly drop offline and reconnect, simulating network issues",
        "icon": "wifi_off",
        "color": "purple",
        "options": [
            {"key": "offline_pct", "label": "Offline Chance (%)", "type": "number", "default": 20, "min": 5, "max": 50},
        ],
    },
]


def _sim_bins_to_out(bins: dict) -> SimulationOut:
    return SimulationOut(
        id=bins.get("id", ""),
        name=bins.get("name", ""),
        template=bins.get("template", "normal"),
        device_ids=json.loads(bins.get("device_ids", "[]")),
        group_ids=json.loads(bins.get("group_ids", "[]")),
        status=bins.get("status", "stopped"),
        interval=bins.get("interval", 5),
        config=json.loads(bins.get("config", "{}")),
        created_at=bins.get("created_at", ""),
        msgs_sent=bins.get("msgs_sent", 0),
        cycle_count=bins.get("cycle_count", 0),
    )


@router.get("/admin/templates")
async def list_templates():
    return TEMPLATES


@router.get("/admin/simulations", response_model=list[SimulationOut])
async def list_simulations():
    client = get_client()
    query = client.query(NAMESPACE, SIM_SET)
    results = []

    def callback(record):
        _, _, bins = record
        results.append(_sim_bins_to_out(bins))

    query.foreach(callback)
    results.sort(key=lambda s: s.created_at or "", reverse=True)
    return results


@router.post("/admin/simulations", response_model=SimulationOut, status_code=201)
async def create_simulation(body: dict):
    client = get_client()
    sim_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    template = body.get("template", "normal")
    valid_ids = {t["id"] for t in TEMPLATES}
    if template not in valid_ids:
        raise HTTPException(status_code=400, detail=f"Invalid template: {template}")

    device_ids = body.get("device_ids", [])
    if not device_ids:
        raise HTTPException(status_code=400, detail="At least one device must be selected")

    bins = {
        "id": sim_id,
        "name": body.get("name", f"Simulation {sim_id[:8]}"),
        "template": template,
        "device_ids": json.dumps(device_ids),
        "group_ids": json.dumps(body.get("group_ids", [])),
        "status": "running",
        "interval": max(1, min(60, int(body.get("interval", 5)))),
        "config": json.dumps(body.get("config", {})),
        "created_at": now,
        "msgs_sent": 0,
        "cycle_count": 0,
    }
    key = (NAMESPACE, SIM_SET, sim_id)
    client.put(key, bins)
    return _sim_bins_to_out(bins)


@router.put("/admin/simulations/{sim_id}/start", response_model=SimulationOut)
async def start_simulation(sim_id: str):
    client = get_client()
    key = (NAMESPACE, SIM_SET, sim_id)
    try:
        _, _, bins = client.get(key)
    except Exception:
        raise HTTPException(status_code=404, detail="Simulation not found")

    bins["status"] = "running"
    client.put(key, bins)
    return _sim_bins_to_out(bins)


@router.put("/admin/simulations/{sim_id}/pause", response_model=SimulationOut)
async def pause_simulation(sim_id: str):
    client = get_client()
    key = (NAMESPACE, SIM_SET, sim_id)
    try:
        _, _, bins = client.get(key)
    except Exception:
        raise HTTPException(status_code=404, detail="Simulation not found")

    bins["status"] = "paused"
    client.put(key, bins)
    return _sim_bins_to_out(bins)


@router.put("/admin/simulations/{sim_id}/stop", response_model=SimulationOut)
async def stop_simulation(sim_id: str):
    client = get_client()
    key = (NAMESPACE, SIM_SET, sim_id)
    try:
        _, _, bins = client.get(key)
    except Exception:
        raise HTTPException(status_code=404, detail="Simulation not found")

    bins["status"] = "stopped"
    bins["cycle_count"] = 0
    client.put(key, bins)
    return _sim_bins_to_out(bins)


@router.delete("/admin/simulations/{sim_id}", status_code=204)
async def delete_simulation(sim_id: str):
    client = get_client()
    key = (NAMESPACE, SIM_SET, sim_id)
    try:
        client.remove(key)
    except Exception:
        raise HTTPException(status_code=404, detail="Simulation not found")


# ---------------------------------------------------------------------------
# Seed device metadata (lat/lng, redundancy groups, metric_type, tags)
# ---------------------------------------------------------------------------

import random

# Physical zones within a facility — each zone is a tight cluster of coords
_ZONE_TEMPLATES = [
    {"name": "cold-storage-a",  "lat": 37.77490, "lon": -122.41940, "radius": 0.0003, "env": "indoor",  "floor": "1"},
    {"name": "cold-storage-b",  "lat": 37.77510, "lon": -122.41920, "radius": 0.0003, "env": "indoor",  "floor": "1"},
    {"name": "server-room",     "lat": 37.77550, "lon": -122.41900, "radius": 0.0002, "env": "indoor",  "floor": "2"},
    {"name": "loading-dock",    "lat": 37.77600, "lon": -122.41850, "radius": 0.0005, "env": "outdoor", "floor": "G"},
    {"name": "rooftop-solar",   "lat": 37.77555, "lon": -122.41905, "radius": 0.0002, "env": "outdoor", "floor": "R"},
    {"name": "assembly-line",   "lat": 37.77450, "lon": -122.42000, "radius": 0.0004, "env": "indoor",  "floor": "1"},
    {"name": "field-north",     "lat": 37.78000, "lon": -122.41000, "radius": 0.0015, "env": "outdoor", "floor": "G"},
    {"name": "field-south",     "lat": 37.77000, "lon": -122.42500, "radius": 0.0015, "env": "outdoor", "floor": "G"},
    {"name": "parking-east",    "lat": 37.77480, "lon": -122.41700, "radius": 0.0006, "env": "outdoor", "floor": "G"},
    {"name": "office-wing",     "lat": 37.77530, "lon": -122.41960, "radius": 0.0003, "env": "indoor",  "floor": "3"},
]

# What metrics make sense per zone environment
_ZONE_METRIC_MIX = {
    "cold-storage-a":  ["temp", "temp", "humidity", "humidity", "temp", "pressure"],
    "cold-storage-b":  ["temp", "temp", "humidity", "temp", "humidity", "pressure"],
    "server-room":     ["temp", "humidity", "noise_db", "vibration", "temp", "humidity"],
    "loading-dock":    ["temp", "humidity", "lux", "noise_db", "pressure", "temp"],
    "rooftop-solar":   ["lux", "lux", "temp", "lux", "pressure", "temp"],
    "assembly-line":   ["vibration", "noise_db", "temp", "humidity", "vibration", "noise_db"],
    "field-north":     ["temp", "humidity", "pressure", "lux", "temp", "humidity"],
    "field-south":     ["temp", "humidity", "pressure", "noise_db", "temp", "humidity"],
    "parking-east":    ["temp", "lux", "noise_db", "temp", "humidity", "lux"],
    "office-wing":     ["temp", "humidity", "lux", "noise_db", "temp", "humidity"],
}

_GATEWAY_METRICS = ["cpu_usage", "mem_usage", "uplink_kbps"]
_ACTUATOR_METRICS = ["position", "power_on", "battery_pct"]
_CAMERA_METRICS = ["fps", "storage_pct", "battery_pct"]


@router.post("/admin/seed-device-metadata")
async def seed_device_metadata():
    """Intelligently assign locations, metric types, and redundancy groups.

    Strategy:
    - Group devices into physical zones (tight lat/lng clusters).
    - Within each zone, place multiple sensors measuring the same metric nearby
      (these become a redundancy group — verifying each other's readings).
    - Also place sensors measuring different metrics in the same zone
      (co-located but measuring different things, useful for cross-correlation).
    - Some zones share similar coordinates so "nearby device" queries find peers.
    """
    client = get_client()
    query = client.query(NAMESPACE, "devices")
    devices = []
    query.foreach(lambda r: devices.append(r[2]))

    groups = {}
    gq = client.query(NAMESPACE, "groups")
    gq.foreach(lambda r: groups.update({r[2].get("id", ""): r[2].get("name", "")}))

    # Sort devices by group then type for deterministic assignment
    random.seed(42)
    devices.sort(key=lambda d: (d.get("group_id", ""), d.get("type", ""), d.get("id", "")))

    # Build a mapping: group_id -> zone
    group_ids = sorted(set(d.get("group_id", "") for d in devices if d.get("group_id")))
    group_zone_map = {}
    for i, gid in enumerate(group_ids):
        zone = _ZONE_TEMPLATES[i % len(_ZONE_TEMPLATES)]
        group_zone_map[gid] = zone

    # Per-zone sensor placement tracking
    zone_sensor_idx = {}   # zone_name -> index into that zone's metric mix
    zone_rg_members = {}   # rg_key -> count of members

    updated = 0
    stats = {"redundancy_groups": set(), "zones_used": set(), "metric_distribution": {}}

    for dev in devices:
        did = dev.get("id", "")
        dtype = dev.get("type", "sensor")
        gid = dev.get("group_id", "")

        zone = group_zone_map.get(gid)
        if not zone:
            zone = _ZONE_TEMPLATES[hash(did) % len(_ZONE_TEMPLATES)]

        zname = zone["name"]
        stats["zones_used"].add(zname)

        # -- Determine metric_type based on device type --
        if dtype == "sensor":
            mix = _ZONE_METRIC_MIX.get(zname, ["temp", "humidity", "pressure"])
            zone_sensor_idx.setdefault(zname, 0)
            metric_type = mix[zone_sensor_idx[zname] % len(mix)]
            zone_sensor_idx[zname] += 1
        elif dtype == "gateway":
            metric_type = _GATEWAY_METRICS[hash(did) % len(_GATEWAY_METRICS)]
        elif dtype == "actuator":
            metric_type = _ACTUATOR_METRICS[hash(did) % len(_ACTUATOR_METRICS)]
        elif dtype == "camera":
            metric_type = _CAMERA_METRICS[hash(did) % len(_CAMERA_METRICS)]
        else:
            metric_type = "temp"

        stats["metric_distribution"][metric_type] = stats["metric_distribution"].get(metric_type, 0) + 1

        # -- Lat/Lng: tight cluster within zone --
        # Sensors measuring the SAME metric in the same zone sit very close
        # (within ~5-15m — realistic for redundant sensors on the same wall/rack)
        rg_key = f"{zname}-{metric_type}"
        zone_rg_members.setdefault(rg_key, 0)
        member_idx = zone_rg_members[rg_key]
        zone_rg_members[rg_key] += 1

        # Tight sub-cluster: first 2-3 in a redundancy group nearly identical coords
        sub_offset_lat = (member_idx % 3) * 0.00005 + random.uniform(-0.00002, 0.00002)
        sub_offset_lon = (member_idx % 3) * 0.00005 + random.uniform(-0.00002, 0.00002)
        # Spread within zone radius for overall variety
        zone_offset_lat = random.uniform(-zone["radius"], zone["radius"])
        zone_offset_lon = random.uniform(-zone["radius"], zone["radius"])

        lat = round(zone["lat"] + zone_offset_lat + sub_offset_lat, 6)
        lon = round(zone["lon"] + zone_offset_lon + sub_offset_lon, 6)

        # -- Redundancy group --
        # First 2-3 sensors of same metric in same zone share a redundancy group
        # After that, a new redundancy group is started (simulating separate installations)
        rg_batch = member_idx // 3
        redundancy_group = rg_key if rg_batch == 0 else f"{rg_key}-{rg_batch}"
        stats["redundancy_groups"].add(redundancy_group)

        # -- Tags --
        gname = groups.get(gid, "unknown").lower().replace(" ", "-")
        tags = {
            "zone": zname,
            "environment": zone["env"],
            "floor": zone["floor"],
        }
        if dtype == "sensor":
            tags["measures"] = metric_type
        elif dtype == "gateway":
            tags["role"] = "edge-compute"
        elif dtype == "camera":
            tags["resolution"] = "1080p"
        elif dtype == "actuator":
            tags["controls"] = metric_type

        # -- Write --
        key = (NAMESPACE, "devices", did)
        dev["latitude"] = lat
        dev["longitude"] = lon
        dev["redun_group"] = redundancy_group
        dev["metric_type"] = metric_type
        dev["tags"] = json.dumps(tags)
        if "metrics" in dev:
            del dev["metrics"]
        if "redundancy_group" in dev:
            del dev["redundancy_group"]
        client.put(key, dev)
        updated += 1

    return {
        "updated": updated,
        "redundancy_groups": len(stats["redundancy_groups"]),
        "zones_used": len(stats["zones_used"]),
        "metric_distribution": stats["metric_distribution"],
    }
