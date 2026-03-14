import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.database import get_client, NAMESPACE
from app.schemas import RuleOut

router = APIRouter(tags=["rules"])

RULE_SET = "rules"

OPERATORS = {
    "gt": {"label": ">", "desc": "greater than"},
    "lt": {"label": "<", "desc": "less than"},
    "gte": {"label": "≥", "desc": "greater than or equal"},
    "lte": {"label": "≤", "desc": "less than or equal"},
}

METRICS = [
    {"key": "temp", "label": "Temperature", "unit": "°C"},
    {"key": "humidity", "label": "Humidity", "unit": "%"},
    {"key": "pressure", "label": "Pressure", "unit": "hPa"},
    {"key": "battery_pct", "label": "Battery", "unit": "%"},
    {"key": "cpu_usage", "label": "CPU Usage", "unit": "%"},
    {"key": "mem_usage", "label": "Memory Usage", "unit": "%"},
    {"key": "storage_pct", "label": "Storage", "unit": "%"},
    {"key": "fps", "label": "FPS", "unit": ""},
    {"key": "uplink_kbps", "label": "Uplink", "unit": "kbps"},
    {"key": "noise_db", "label": "Noise Level", "unit": "dB"},
    {"key": "vibration", "label": "Vibration", "unit": "g"},
    {"key": "lux", "label": "Illuminance", "unit": "lux"},
]

RULE_TEMPLATES = [
    {
        "id": "anomaly_detection",
        "name": "Standard Anomaly Detection",
        "description": "Monitors temperature, humidity, battery, and CPU with warning and critical thresholds",
        "icon": "warning",
        "rules": [
            {"metric": "temp", "operator": "gt", "threshold": 40, "severity": "warning", "name": "High Temperature (Warning)"},
            {"metric": "temp", "operator": "gt", "threshold": 48, "severity": "critical", "name": "High Temperature (Critical)"},
            {"metric": "temp", "operator": "lt", "threshold": 5, "severity": "warning", "name": "Low Temperature (Warning)"},
            {"metric": "temp", "operator": "lt", "threshold": 0, "severity": "critical", "name": "Low Temperature (Critical)"},
            {"metric": "humidity", "operator": "gt", "threshold": 85, "severity": "warning", "name": "High Humidity"},
            {"metric": "humidity", "operator": "gt", "threshold": 95, "severity": "critical", "name": "Critical Humidity"},
            {"metric": "battery_pct", "operator": "lt", "threshold": 15, "severity": "warning", "name": "Low Battery (Warning)"},
            {"metric": "battery_pct", "operator": "lt", "threshold": 5, "severity": "critical", "name": "Low Battery (Critical)"},
            {"metric": "cpu_usage", "operator": "gt", "threshold": 85, "severity": "warning", "name": "High CPU (Warning)"},
            {"metric": "cpu_usage", "operator": "gt", "threshold": 95, "severity": "critical", "name": "High CPU (Critical)"},
        ],
    },
    {
        "id": "resource_monitoring",
        "name": "Resource Monitoring",
        "description": "Tracks CPU, memory, and storage utilization thresholds",
        "icon": "server",
        "rules": [
            {"metric": "cpu_usage", "operator": "gt", "threshold": 80, "severity": "warning", "name": "CPU > 80%"},
            {"metric": "cpu_usage", "operator": "gt", "threshold": 95, "severity": "critical", "name": "CPU > 95%"},
            {"metric": "mem_usage", "operator": "gt", "threshold": 80, "severity": "warning", "name": "Memory > 80%"},
            {"metric": "mem_usage", "operator": "gt", "threshold": 90, "severity": "critical", "name": "Memory > 90%"},
            {"metric": "storage_pct", "operator": "gt", "threshold": 85, "severity": "warning", "name": "Storage > 85%"},
            {"metric": "storage_pct", "operator": "gt", "threshold": 95, "severity": "critical", "name": "Storage > 95%"},
        ],
    },
    {
        "id": "battery_watch",
        "name": "Battery Watch",
        "description": "Alerts when device battery drops below safe levels",
        "icon": "battery",
        "rules": [
            {"metric": "battery_pct", "operator": "lt", "threshold": 20, "severity": "warning", "name": "Battery < 20%"},
            {"metric": "battery_pct", "operator": "lt", "threshold": 10, "severity": "critical", "name": "Battery < 10%"},
            {"metric": "battery_pct", "operator": "lt", "threshold": 5, "severity": "critical", "name": "Battery Critical < 5%"},
        ],
    },
    {
        "id": "temperature_bounds",
        "name": "Temperature Bounds",
        "description": "Strict temperature monitoring for sensitive environments",
        "icon": "thermometer",
        "rules": [
            {"metric": "temp", "operator": "gt", "threshold": 35, "severity": "warning", "name": "Temp > 35°C"},
            {"metric": "temp", "operator": "gt", "threshold": 45, "severity": "critical", "name": "Temp > 45°C"},
            {"metric": "temp", "operator": "lt", "threshold": 5, "severity": "warning", "name": "Temp < 5°C"},
            {"metric": "temp", "operator": "lt", "threshold": 0, "severity": "critical", "name": "Temp < 0°C"},
        ],
    },
    {
        "id": "connectivity",
        "name": "Connectivity & Performance",
        "description": "Monitors uplink speed and camera FPS for performance issues",
        "icon": "signal",
        "rules": [
            {"metric": "uplink_kbps", "operator": "lt", "threshold": 100, "severity": "warning", "name": "Low Uplink < 100 kbps"},
            {"metric": "uplink_kbps", "operator": "lt", "threshold": 10, "severity": "critical", "name": "Uplink Critical < 10 kbps"},
            {"metric": "fps", "operator": "lt", "threshold": 10, "severity": "warning", "name": "Low FPS < 10"},
            {"metric": "fps", "operator": "lt", "threshold": 5, "severity": "critical", "name": "FPS Critical < 5"},
        ],
    },
]


def _rule_bins_to_out(bins: dict) -> RuleOut:
    return RuleOut(
        id=bins.get("id", ""),
        name=bins.get("name", ""),
        scope=bins.get("scope", "group"),
        scope_id=bins.get("scope_id", ""),
        metric=bins.get("metric", ""),
        operator=bins.get("operator", "gt"),
        threshold=float(bins.get("threshold", 0)),
        severity=bins.get("severity", "warning"),
        enabled=bool(bins.get("enabled", 1)),
        created_at=bins.get("created_at", ""),
    )


@router.get("/rules/meta")
async def get_meta():
    return {
        "operators": OPERATORS,
        "metrics": METRICS,
        "templates": [
            {"id": t["id"], "name": t["name"], "description": t["description"], "icon": t["icon"], "rule_count": len(t["rules"])}
            for t in RULE_TEMPLATES
        ],
    }


@router.get("/rules", response_model=list[RuleOut])
async def list_rules(scope: str = "", scope_id: str = ""):
    client = get_client()
    query = client.query(NAMESPACE, RULE_SET)
    results = []

    def callback(record):
        _, _, bins = record
        if scope and bins.get("scope") != scope:
            return
        if scope_id and bins.get("scope_id") != scope_id:
            return
        results.append(_rule_bins_to_out(bins))

    query.foreach(callback)
    results.sort(key=lambda r: r.created_at or "", reverse=True)
    return results


@router.post("/rules", response_model=RuleOut, status_code=201)
async def create_rule(body: dict):
    client = get_client()
    metric = body.get("metric", "")
    operator = body.get("operator", "gt")
    scope = body.get("scope", "group")

    if metric not in {m["key"] for m in METRICS}:
        raise HTTPException(status_code=400, detail=f"Unsupported metric: {metric}")
    if operator not in OPERATORS:
        raise HTTPException(status_code=400, detail=f"Invalid operator: {operator}")
    if scope not in ("group", "device"):
        raise HTTPException(status_code=400, detail="Scope must be 'group' or 'device'")

    rule_id = str(uuid.uuid4())
    bins = {
        "id": rule_id,
        "name": body.get("name", ""),
        "scope": scope,
        "scope_id": body.get("scope_id", ""),
        "metric": metric,
        "operator": operator,
        "threshold": float(body.get("threshold", 0)),
        "severity": body.get("severity", "warning"),
        "enabled": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    client.put((NAMESPACE, RULE_SET, rule_id), bins)
    return _rule_bins_to_out(bins)


@router.post("/rules/apply-template", response_model=list[RuleOut])
async def apply_template(body: dict):
    """Apply a predefined rule template to a scope."""
    template_id = body.get("template_id", "")
    scope = body.get("scope", "group")
    scope_id = body.get("scope_id", "")

    template = next((t for t in RULE_TEMPLATES if t["id"] == template_id), None)
    if not template:
        raise HTTPException(status_code=400, detail=f"Unknown template: {template_id}")
    if not scope_id:
        raise HTTPException(status_code=400, detail="scope_id is required")

    client = get_client()
    created = []
    now = datetime.now(timezone.utc).isoformat()

    for rule_def in template["rules"]:
        rule_id = str(uuid.uuid4())
        bins = {
            "id": rule_id,
            "name": rule_def["name"],
            "scope": scope,
            "scope_id": scope_id,
            "metric": rule_def["metric"],
            "operator": rule_def["operator"],
            "threshold": float(rule_def["threshold"]),
            "severity": rule_def["severity"],
            "enabled": 1,
            "created_at": now,
        }
        client.put((NAMESPACE, RULE_SET, rule_id), bins)
        created.append(_rule_bins_to_out(bins))

    return created


@router.put("/rules/{rule_id}/toggle", response_model=RuleOut)
async def toggle_rule(rule_id: str):
    client = get_client()
    key = (NAMESPACE, RULE_SET, rule_id)
    try:
        _, _, bins = client.get(key)
    except Exception:
        raise HTTPException(status_code=404, detail="Rule not found")

    bins["enabled"] = 0 if bins.get("enabled", 1) else 1
    client.put(key, bins)
    return _rule_bins_to_out(bins)


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(rule_id: str):
    client = get_client()
    key = (NAMESPACE, RULE_SET, rule_id)
    try:
        client.remove(key)
    except Exception:
        raise HTTPException(status_code=404, detail="Rule not found")
