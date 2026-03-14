import uuid
import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.database import get_client, get_namespace
from app.schemas import AggJobOut, AggResultOut

router = APIRouter(tags=["aggregations"])

AGG_SET = "agg_jobs"
AGG_RESULT_SET = "agg_results"

SUPPORTED_METRICS = [
    {"key": "temp", "label": "Temperature", "unit": "°C"},
    {"key": "humidity", "label": "Humidity", "unit": "%"},
    {"key": "battery_pct", "label": "Battery", "unit": "%"},
    {"key": "cpu_usage", "label": "CPU Usage", "unit": "%"},
    {"key": "mem_usage", "label": "Memory Usage", "unit": "%"},
    {"key": "uplink_kbps", "label": "Uplink", "unit": "kbps"},
    {"key": "fps", "label": "FPS", "unit": ""},
    {"key": "storage_pct", "label": "Storage", "unit": "%"},
]

SUPPORTED_FUNCTIONS = ["avg", "min", "max", "count", "sum"]

WINDOW_PRESETS = [
    {"secs": 300, "label": "5 minutes"},
    {"secs": 900, "label": "15 minutes"},
    {"secs": 1800, "label": "30 minutes"},
    {"secs": 3600, "label": "1 hour"},
    {"secs": 14400, "label": "4 hours"},
    {"secs": 86400, "label": "24 hours"},
]


def _job_bins_to_out(bins: dict) -> AggJobOut:
    return AggJobOut(
        id=bins.get("id", ""),
        group_id=bins.get("group_id", ""),
        name=bins.get("name", ""),
        metric=bins.get("metric", ""),
        function=bins.get("function", "avg"),
        level=bins.get("level", "group"),
        window_secs=bins.get("window_secs", 3600),
        enabled=bool(bins.get("enabled", 1)),
        created_at=bins.get("created_at", ""),
    )


def _result_bins_to_out(bins: dict) -> AggResultOut:
    return AggResultOut(
        job_id=bins.get("job_id", ""),
        job_name=bins.get("job_name", ""),
        group_id=bins.get("group_id", ""),
        device_id=bins.get("device_id", ""),
        metric=bins.get("metric", ""),
        function=bins.get("function", ""),
        level=bins.get("level", ""),
        value=bins.get("value"),
        sample_count=bins.get("sample_count", 0),
        window_secs=bins.get("window_secs", 3600),
        computed_at=bins.get("computed_at", ""),
    )


@router.get("/aggregations/meta")
async def get_meta():
    return {
        "metrics": SUPPORTED_METRICS,
        "functions": SUPPORTED_FUNCTIONS,
        "windows": WINDOW_PRESETS,
    }


@router.get("/groups/{group_id}/aggregations", response_model=list[AggJobOut])
async def list_jobs(group_id: str):
    client = get_client()
    query = client.query(get_namespace(), AGG_SET)
    results = []

    def callback(record):
        _, _, bins = record
        if bins.get("group_id") == group_id:
            results.append(_job_bins_to_out(bins))

    query.foreach(callback)
    results.sort(key=lambda j: j.created_at or "", reverse=True)
    return results


@router.post("/groups/{group_id}/aggregations", response_model=AggJobOut, status_code=201)
async def create_job(group_id: str, body: dict):
    client = get_client()
    metric = body.get("metric", "")
    func = body.get("function", "avg")
    level = body.get("level", "group")

    if metric not in {m["key"] for m in SUPPORTED_METRICS}:
        raise HTTPException(status_code=400, detail=f"Unsupported metric: {metric}")
    if func not in SUPPORTED_FUNCTIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported function: {func}")
    if level not in ("group", "device"):
        raise HTTPException(status_code=400, detail=f"Level must be 'group' or 'device'")

    metric_label = next((m["label"] for m in SUPPORTED_METRICS if m["key"] == metric), metric)
    auto_name = f"{func.upper()}({metric_label})"

    job_id = str(uuid.uuid4())
    bins = {
        "id": job_id,
        "group_id": group_id,
        "name": body.get("name") or auto_name,
        "metric": metric,
        "function": func,
        "level": level,
        "window_secs": int(body.get("window_secs", 3600)),
        "enabled": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    client.put((get_namespace(), AGG_SET, job_id), bins)
    return _job_bins_to_out(bins)


@router.put("/aggregations/{job_id}/toggle", response_model=AggJobOut)
async def toggle_job(job_id: str):
    client = get_client()
    key = (get_namespace(), AGG_SET, job_id)
    try:
        _, _, bins = client.get(key)
    except Exception:
        raise HTTPException(status_code=404, detail="Job not found")

    bins["enabled"] = 0 if bins.get("enabled", 1) else 1
    client.put(key, bins)
    return _job_bins_to_out(bins)


@router.delete("/aggregations/{job_id}", status_code=204)
async def delete_job(job_id: str):
    client = get_client()
    key = (get_namespace(), AGG_SET, job_id)
    try:
        client.remove(key)
    except Exception:
        raise HTTPException(status_code=404, detail="Job not found")

    # Clean up results for this job
    query = client.query(get_namespace(), AGG_RESULT_SET)
    to_delete = []

    def callback(record):
        k, _, bins = record
        if bins.get("job_id") == job_id:
            to_delete.append(k)

    query.foreach(callback)
    for k in to_delete:
        try:
            client.remove(k)
        except Exception:
            pass


@router.get("/groups/{group_id}/aggregations/results", response_model=list[AggResultOut])
async def get_group_results(group_id: str):
    client = get_client()
    query = client.query(get_namespace(), AGG_RESULT_SET)
    results = []

    def callback(record):
        _, _, bins = record
        if bins.get("group_id") == group_id and bins.get("level") == "group":
            results.append(_result_bins_to_out(bins))

    query.foreach(callback)
    return results


@router.get("/devices/{device_id}/aggregations", response_model=list[AggResultOut])
async def get_device_results(device_id: str):
    client = get_client()

    # Find which group this device belongs to
    try:
        _, _, dev_bins = client.get((get_namespace(), "devices", device_id))
    except Exception:
        raise HTTPException(status_code=404, detail="Device not found")

    group_id = dev_bins.get("group_id", "")
    if not group_id:
        return []

    query = client.query(get_namespace(), AGG_RESULT_SET)
    results = []

    def callback(record):
        _, _, bins = record
        if bins.get("group_id") == group_id:
            if bins.get("level") == "device" and bins.get("device_id") == device_id:
                results.append(_result_bins_to_out(bins))
            elif bins.get("level") == "group":
                results.append(_result_bins_to_out(bins))

    query.foreach(callback)
    return results
