import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.database import get_client, get_namespace, get_active_mode
from app.domain_config import get_mode_config
from app.schemas import RuleOut

router = APIRouter(tags=["rules"])

RULE_SET = "rules"

OPERATORS = {
    "gt": {"label": ">", "desc": "greater than"},
    "lt": {"label": "<", "desc": "less than"},
    "gte": {"label": "≥", "desc": "greater than or equal"},
    "lte": {"label": "≤", "desc": "less than or equal"},
}


def _get_metrics():
    return get_mode_config(get_active_mode()).get("metrics", [])


def _get_rule_templates():
    return get_mode_config(get_active_mode()).get("rule_templates", [])


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
        "metrics": _get_metrics(),
        "templates": [
            {"id": t["id"], "name": t["name"], "description": t["description"], "icon": t["icon"], "rule_count": len(t["rules"])}
            for t in _get_rule_templates()
        ],
    }


@router.get("/rules", response_model=list[RuleOut])
async def list_rules(scope: str = "", scope_id: str = ""):
    client = get_client()
    query = client.query(get_namespace(), RULE_SET)
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

    if metric not in {m["key"] for m in _get_metrics()}:
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
    client.put((get_namespace(), RULE_SET, rule_id), bins)
    return _rule_bins_to_out(bins)


@router.post("/rules/apply-template", response_model=list[RuleOut])
async def apply_template(body: dict):
    """Apply a predefined rule template to a scope."""
    template_id = body.get("template_id", "")
    scope = body.get("scope", "group")
    scope_id = body.get("scope_id", "")

    template = next((t for t in _get_rule_templates() if t["id"] == template_id), None)
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
        client.put((get_namespace(), RULE_SET, rule_id), bins)
        created.append(_rule_bins_to_out(bins))

    return created


@router.put("/rules/{rule_id}/toggle", response_model=RuleOut)
async def toggle_rule(rule_id: str):
    client = get_client()
    key = (get_namespace(), RULE_SET, rule_id)
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
    key = (get_namespace(), RULE_SET, rule_id)
    try:
        client.remove(key)
    except Exception:
        raise HTTPException(status_code=404, detail="Rule not found")
