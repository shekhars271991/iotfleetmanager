from fastapi import APIRouter, HTTPException

from app.database import get_client, NAMESPACE
from app.schemas import AlertOut

router = APIRouter(tags=["alerts"])

SET_NAME = "alerts"


@router.get("/alerts", response_model=list[AlertOut])
async def list_alerts(device_id: str = "", limit: int = 0):
    client = get_client()
    query = client.query(NAMESPACE, SET_NAME)
    results = []

    def callback(record):
        _, _, bins = record
        if device_id and bins.get("device_id") != device_id:
            return
        results.append(AlertOut(
            id=bins.get("id", ""),
            device_id=bins.get("device_id", ""),
            message=bins.get("message", ""),
            severity=bins.get("severity", "info"),
            created_at=bins.get("created_at"),
            acknowledged=bool(bins.get("acknowledged", 0)),
            rule_scope=bins.get("rule_scope", ""),
            rule_id=bins.get("rule_id", ""),
        ))

    query.foreach(callback)
    results.sort(key=lambda a: a.created_at or "", reverse=True)
    if limit > 0:
        results = results[:limit]
    return results


@router.put("/alerts/acknowledge-bulk")
async def acknowledge_alerts_bulk(body: dict):
    """Acknowledge multiple alerts at once."""
    alert_ids = body.get("alert_ids", [])
    if not alert_ids:
        return {"acknowledged": 0}
    client = get_client()
    count = 0
    for aid in alert_ids:
        try:
            key = (NAMESPACE, SET_NAME, aid)
            _, _, bins = client.get(key)
            if not bins.get("acknowledged"):
                bins["acknowledged"] = 1
                client.put(key, bins)
                count += 1
        except Exception:
            continue
    return {"acknowledged": count}


@router.put("/alerts/{alert_id}/acknowledge", response_model=AlertOut)
async def acknowledge_alert(alert_id: str):
    client = get_client()
    key = (NAMESPACE, SET_NAME, alert_id)
    try:
        _, _, bins = client.get(key)
    except Exception:
        raise HTTPException(status_code=404, detail="Alert not found")

    bins["acknowledged"] = 1
    client.put(key, bins)

    return AlertOut(
        id=bins.get("id", alert_id),
        device_id=bins.get("device_id", ""),
        message=bins.get("message", ""),
        severity=bins.get("severity", "info"),
        created_at=bins.get("created_at"),
        acknowledged=True,
        rule_scope=bins.get("rule_scope", ""),
        rule_id=bins.get("rule_id", ""),
    )
