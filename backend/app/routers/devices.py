import json
import math
import uuid
from datetime import datetime, timezone
from typing import Optional

import aerospike
from aerospike import predicates as p
from fastapi import APIRouter, HTTPException

from app.database import get_client, get_namespace
from app.schemas import DeviceCreate, DeviceUpdate, DeviceOut, IssueDevice, AlertOut, TelemetryOut

router = APIRouter(tags=["devices"])

SET_NAME = "devices"

# JSON-encoded dict fields stored as strings in Aerospike
_JSON_FIELDS = {"tags"}

# Aerospike bin names are limited to 15 chars; map long API names to short bin names
_API_TO_BIN = {"redundancy_group": "redun_group"}
_BIN_TO_API = {v: k for k, v in _API_TO_BIN.items()}


def _decode_bins(bins: dict) -> dict:
    out = {}
    for k, v in bins.items():
        api_key = _BIN_TO_API.get(k, k)
        out[api_key] = v
    for f in _JSON_FIELDS:
        raw = out.get(f)
        if isinstance(raw, str) and raw:
            try:
                out[f] = json.loads(raw)
            except Exception:
                out[f] = None
        elif raw is None or raw == "":
            out[f] = None
    return out


def _encode_for_aerospike(data: dict) -> dict:
    out = {}
    for k, v in data.items():
        bin_key = _API_TO_BIN.get(k, k)
        out[bin_key] = v
    for f in _JSON_FIELDS:
        mapped = _API_TO_BIN.get(f, f)
        val = out.get(mapped)
        if val is not None:
            out[mapped] = json.dumps(val)
        else:
            out[mapped] = ""
    return out


def _record_to_device(key, _, bins) -> DeviceOut:
    decoded = _decode_bins(bins)
    return DeviceOut(id=decoded.get("id", ""), **{k: v for k, v in decoded.items() if k != "id"})


@router.get("/devices", response_model=list[DeviceOut])
async def list_devices(
    status: Optional[str] = None,
    type: Optional[str] = None,
    group_id: Optional[str] = None,
):
    client = get_client()
    query = client.query(get_namespace(), SET_NAME)

    if status:
        query.where(p.equals("status", status))
    elif type:
        query.where(p.equals("type", type))
    elif group_id:
        query.where(p.equals("group_id", group_id))

    results = []
    def callback(record):
        key, meta, bins = record
        decoded = _decode_bins(bins)
        results.append(DeviceOut(id=decoded.get("id", ""), **{k: v for k, v in decoded.items() if k != "id"}))

    query.foreach(callback)
    results.sort(key=lambda d: d.created_at or "", reverse=True)
    return results


@router.get("/devices/issues", response_model=list[IssueDevice])
async def list_issue_devices():
    client = get_client()

    offline_query = client.query(get_namespace(), SET_NAME)
    offline_query.where(p.equals("status", "offline"))
    offline_devices = []
    def cb_offline(record):
        _, _, bins = record
        decoded = _decode_bins(bins)
        offline_devices.append(DeviceOut(id=decoded.get("id", ""), **{k: v for k, v in decoded.items() if k != "id"}))
    offline_query.foreach(cb_offline)

    warning_query = client.query(get_namespace(), SET_NAME)
    warning_query.where(p.equals("status", "warning"))
    warning_devices = []
    def cb_warning(record):
        _, _, bins = record
        decoded = _decode_bins(bins)
        warning_devices.append(DeviceOut(id=decoded.get("id", ""), **{k: v for k, v in decoded.items() if k != "id"}))
    warning_query.foreach(cb_warning)

    all_issue_devices = offline_devices + warning_devices

    issue_list = []
    for device in all_issue_devices:
        alert_query = client.query(get_namespace(), "alerts")
        alert_query.where(p.equals("device_id", device.id))
        device_alerts = []
        def cb_alert(record, _alerts=device_alerts):
            _, _, bins = record
            _alerts.append(AlertOut(
                id=bins.get("id", ""),
                device_id=bins.get("device_id", ""),
                message=bins.get("message", ""),
                severity=bins.get("severity", "info"),
                created_at=bins.get("created_at"),
                acknowledged=bool(bins.get("acknowledged", 0)),
                rule_scope=bins.get("rule_scope", ""),
                rule_id=bins.get("rule_id", ""),
            ))
        alert_query.foreach(cb_alert)
        issue_list.append(IssueDevice(device=device, alerts=device_alerts))

    severity_order = {"critical": 0, "warning": 1, "info": 2}
    def sort_key(item: IssueDevice):
        if item.alerts:
            min_sev = min(severity_order.get(a.severity, 3) for a in item.alerts)
        else:
            min_sev = 3
        return (min_sev, item.device.last_seen or "")

    issue_list.sort(key=sort_key)
    return issue_list


@router.get("/devices/{device_id}/telemetry", response_model=list[TelemetryOut])
async def get_device_telemetry(device_id: str, limit: int = 50):
    client = get_client()
    query = client.query(get_namespace(), "telemetry")
    query.where(p.equals("device_id", device_id))

    results = []
    def callback(record):
        _, _, bins = record
        results.append(TelemetryOut(
            device_id=bins.get("device_id", ""),
            timestamp=bins.get("timestamp", ""),
            metric=bins.get("metric", ""),
            value=bins.get("value"),
        ))
    query.foreach(callback)

    results.sort(key=lambda t: t.timestamp, reverse=True)
    return results[:limit]


@router.get("/devices/{device_id}", response_model=DeviceOut)
async def get_device(device_id: str):
    client = get_client()
    key = (get_namespace(), SET_NAME, device_id)
    try:
        _, _, bins = client.get(key)
        decoded = _decode_bins(bins)
        return DeviceOut(id=decoded.get("id", device_id), **{k: v for k, v in decoded.items() if k != "id"})
    except Exception:
        raise HTTPException(status_code=404, detail="Device not found")


@router.post("/devices", response_model=DeviceOut, status_code=201)
async def create_device(device: DeviceCreate):
    client = get_client()
    device_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    key = (get_namespace(), SET_NAME, device_id)
    api_bins = {
        "id": device_id,
        "name": device.name,
        "type": device.type,
        "status": device.status,
        "ip_address": device.ip_address or "",
        "firmware_ver": device.firmware_ver or "",
        "location": device.location or "",
        "group_id": device.group_id or "",
        "latitude": device.latitude if device.latitude is not None else 0.0,
        "longitude": device.longitude if device.longitude is not None else 0.0,
        "redundancy_group": device.redundancy_group or "",
        "metric_type": device.metric_type or "",
        "last_seen": now,
        "created_at": now,
        "tags": device.tags,
    }
    bins_enc = _encode_for_aerospike(api_bins)
    client.put(key, bins_enc)
    return DeviceOut(**_decode_bins(bins_enc))


@router.put("/devices/{device_id}", response_model=DeviceOut)
async def update_device(device_id: str, device: DeviceUpdate):
    client = get_client()
    key = (get_namespace(), SET_NAME, device_id)
    try:
        _, _, existing = client.get(key)
    except Exception:
        raise HTTPException(status_code=404, detail="Device not found")

    update_data = device.model_dump(exclude_none=True)
    if update_data:
        for f in _JSON_FIELDS:
            if f in update_data:
                update_data[f] = json.dumps(update_data[f])
        # Translate API field names to Aerospike bin names
        for api_name, bin_name in _API_TO_BIN.items():
            if api_name in update_data:
                update_data[bin_name] = update_data.pop(api_name)
        existing.update(update_data)
        existing["last_seen"] = datetime.now(timezone.utc).isoformat()
        client.put(key, existing)

    decoded = _decode_bins(existing)
    return DeviceOut(id=decoded.get("id", device_id), **{k: v for k, v in decoded.items() if k != "id"})


@router.put("/devices/{device_id}/decommission", response_model=DeviceOut)
async def decommission_device(device_id: str):
    client = get_client()
    key = (get_namespace(), SET_NAME, device_id)
    try:
        _, _, existing = client.get(key)
    except Exception:
        raise HTTPException(status_code=404, detail="Device not found")

    existing["status"] = "decommissioned"
    existing["last_seen"] = datetime.now(timezone.utc).isoformat()
    client.put(key, existing)
    decoded = _decode_bins(existing)
    return DeviceOut(id=decoded.get("id", device_id), **{k: v for k, v in decoded.items() if k != "id"})


@router.put("/devices/{device_id}/recommission", response_model=DeviceOut)
async def recommission_device(device_id: str):
    client = get_client()
    key = (get_namespace(), SET_NAME, device_id)
    try:
        _, _, existing = client.get(key)
    except Exception:
        raise HTTPException(status_code=404, detail="Device not found")

    existing["status"] = "online"
    existing["last_seen"] = datetime.now(timezone.utc).isoformat()
    client.put(key, existing)
    decoded = _decode_bins(existing)
    return DeviceOut(id=decoded.get("id", device_id), **{k: v for k, v in decoded.items() if k != "id"})


@router.delete("/devices/{device_id}", status_code=204)
async def delete_device(device_id: str):
    client = get_client()
    key = (get_namespace(), SET_NAME, device_id)
    try:
        client.remove(key)
    except Exception:
        raise HTTPException(status_code=404, detail="Device not found")


def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@router.get("/devices/{device_id}/nearby")
async def get_nearby_devices(device_id: str, radius_km: float = 5.0, limit: int = 20):
    client = get_client()
    try:
        _, _, bins = client.get((get_namespace(), SET_NAME, device_id))
    except Exception:
        raise HTTPException(status_code=404, detail="Device not found")

    lat = bins.get("latitude", 0.0) or 0.0
    lon = bins.get("longitude", 0.0) or 0.0
    if lat == 0.0 and lon == 0.0:
        return []

    query = client.query(get_namespace(), SET_NAME)
    all_devices = []
    query.foreach(lambda r: all_devices.append(r[2]))

    nearby = []
    for d in all_devices:
        did = d.get("id", "")
        if did == device_id or d.get("status") == "decommissioned":
            continue
        dlat = d.get("latitude", 0.0) or 0.0
        dlon = d.get("longitude", 0.0) or 0.0
        if dlat == 0.0 and dlon == 0.0:
            continue
        dist = _haversine_km(lat, lon, dlat, dlon)
        if dist <= radius_km:
            decoded = _decode_bins(d)
            nearby.append({**decoded, "distance_km": round(dist, 3)})

    nearby.sort(key=lambda x: x["distance_km"])
    return nearby[:limit]


@router.get("/devices/{device_id}/redundancy-peers")
async def get_redundancy_peers(device_id: str):
    client = get_client()
    try:
        _, _, bins = client.get((get_namespace(), SET_NAME, device_id))
    except Exception:
        raise HTTPException(status_code=404, detail="Device not found")

    rg = bins.get("redun_group", "") or bins.get("redundancy_group", "")
    if not rg:
        return []

    query = client.query(get_namespace(), SET_NAME)
    peers = []
    def cb(record):
        _, _, d = record
        d_rg = d.get("redun_group", "") or d.get("redundancy_group", "")
        if d_rg == rg and d.get("id") != device_id and d.get("status") != "decommissioned":
            decoded = _decode_bins(d)
            peers.append(decoded)
    query.foreach(cb)
    return peers
