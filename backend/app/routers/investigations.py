import uuid
import json
import threading
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.database import get_client, NAMESPACE
from app.agent.workflow import create_investigation_workflow, run_investigation_sync

router = APIRouter(tags=["investigations"])
logger = logging.getLogger("investigations")

INV_SET = "investigations"

_workflow = None
_workflow_lock = threading.Lock()


def _get_workflow():
    global _workflow
    if _workflow is None:
        with _workflow_lock:
            if _workflow is None:
                client = get_client()
                _workflow = create_investigation_workflow(client, NAMESPACE)
    return _workflow


def _safe_json_parse(raw, fallback=None):
    if fallback is None:
        fallback = []
    if isinstance(raw, str) and raw:
        try:
            return json.loads(raw)
        except Exception:
            return fallback
    return raw if raw else fallback


def _inv_bins_to_dict(bins: dict, include_trace: bool = False) -> dict:
    out = {
        "id": bins.get("id", ""),
        "alert_id": bins.get("alert_id", ""),
        "device_id": bins.get("device_id", ""),
        "device_name": bins.get("device_name", ""),
        "status": bins.get("status", "running"),
        "root_cause": bins.get("root_cause", ""),
        "corrective_actions": _safe_json_parse(bins.get("actions", "[]")),
        "confidence": bins.get("confidence", ""),
        "severity": bins.get("severity", ""),
        "summary": bins.get("summary", ""),
        "iterations": bins.get("iterations", 0),
        "tool_calls": bins.get("tool_calls", 0),
        "created_at": bins.get("created_at", ""),
        "completed_at": bins.get("completed_at", ""),
    }
    if include_trace:
        out["agent_messages"] = _safe_json_parse(bins.get("agent_msgs", "[]"))
        out["tool_calls_detail"] = _safe_json_parse(bins.get("tool_detail", "[]"))
    return out


def _run_in_background(inv_id: str, alert_id: str, device_id: str):
    """Run investigation in background thread."""
    try:
        workflow = _get_workflow()
        run_investigation_sync(workflow, inv_id, alert_id, device_id)
    except Exception as e:
        logger.error(f"Background investigation {inv_id} failed: {e}")
        # Mark as failed
        try:
            client = get_client()
            key = (NAMESPACE, INV_SET, inv_id)
            client.put(key, {
                "status": "failed",
                "root_cause": f"Investigation failed: {str(e)}",
                "completed_at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception:
            pass


@router.post("/investigations", status_code=201)
async def start_investigation(body: dict):
    alert_id = body.get("alert_id", "")
    device_id = body.get("device_id", "")

    if not alert_id or not device_id:
        raise HTTPException(status_code=400, detail="alert_id and device_id are required")

    client = get_client()
    inv_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # Get device name
    device_name = ""
    try:
        _, _, dev = client.get((NAMESPACE, "devices", device_id))
        device_name = dev.get("name", "")
    except Exception:
        pass

    # Create initial record
    bins = {
        "id": inv_id,
        "alert_id": alert_id,
        "device_id": device_id,
        "device_name": device_name,
        "status": "running",
        "root_cause": "",
        "actions": "[]",
        "confidence": "",
        "severity": "",
        "summary": "",
        "iterations": 0,
        "tool_calls": 0,
        "created_at": now,
        "completed_at": "",
    }
    client.put((NAMESPACE, INV_SET, inv_id), bins)

    # Start background thread
    thread = threading.Thread(target=_run_in_background, args=(inv_id, alert_id, device_id), daemon=True)
    thread.start()

    return _inv_bins_to_dict(bins)


@router.get("/investigations/{inv_id}")
async def get_investigation(inv_id: str, trace: bool = False):
    client = get_client()
    try:
        _, _, bins = client.get((NAMESPACE, INV_SET, inv_id))
        return _inv_bins_to_dict(bins, include_trace=trace)
    except Exception:
        raise HTTPException(status_code=404, detail="Investigation not found")


@router.get("/investigations")
async def list_investigations(device_id: str = ""):
    client = get_client()
    query = client.query(NAMESPACE, INV_SET)
    results = []

    def callback(record):
        _, _, bins = record
        if device_id and bins.get("device_id") != device_id:
            return
        results.append(_inv_bins_to_dict(bins))

    query.foreach(callback)
    results.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return results
