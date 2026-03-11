"""
LangGraph workflow for IoT anomaly investigation.

3-node workflow:
1. collect_context - Gather device, alert, telemetry, and group data
2. llm_agent - ReAct agent that uses tools + Gemini to investigate
3. save_report - Persist final analysis

Uses Aerospike checkpointer for workflow state persistence.
"""

import os
import re
import json
import time
import logging
from datetime import datetime, timezone

import httpx
from langgraph.graph import StateGraph, END

from app.agent.state import InvestigationState
from app.agent.tools import InvestigationTools

logger = logging.getLogger("investigation.workflow")

MAX_ITERATIONS = 12
MAX_TOOL_CALLS = 10

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")

_as_client_ref = None
_as_namespace_ref = None


def _get_gemini_api_key() -> str:
    """Resolve Gemini API key: user override in Aerospike > environment variable."""
    if _as_client_ref is not None:
        try:
            _, _, bins = _as_client_ref.get((_as_namespace_ref, "config", "gemini_api_key"))
            user_key = bins.get("value", "")
            if user_key:
                return user_key
        except Exception:
            pass
    return os.environ.get("GEMINI_API_KEY", "")


def _call_gemini(prompt: str) -> str:
    api_key = _get_gemini_api_key()
    if not api_key:
        raise ValueError("GEMINI_API_KEY not set. Configure it in Admin > Settings or set the GEMINI_API_KEY environment variable.")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

    with httpx.Client(timeout=120.0) as client:
        resp = client.post(
            url,
            headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.3, "maxOutputTokens": 2000},
            },
        )
        resp.raise_for_status()
        data = resp.json()
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            if parts:
                return parts[0].get("text", "")
    return ""


def _parse_tool_call(response: str):
    if not response:
        return None, {}
    cleaned = response.strip()
    for prefix in ("```json", "```"):
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix):]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    # Try direct parse
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict) and "tool" in data:
            return data["tool"], data.get("params", {})
    except Exception:
        pass

    # Extract first JSON object
    try:
        start = cleaned.find("{")
        if start >= 0:
            depth, end = 0, start
            for i, c in enumerate(cleaned[start:], start):
                if c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            data = json.loads(cleaned[start:end])
            if isinstance(data, dict) and "tool" in data:
                return data["tool"], data.get("params", {})
    except Exception:
        pass

    return None, {}


def _safe_json(raw):
    if isinstance(raw, str) and raw:
        try:
            return json.loads(raw)
        except Exception:
            return None
    return raw if raw else None


def _build_context_summary(state: InvestigationState) -> str:
    dev = state.get("device_info", {})
    alert = state.get("alert_info", {})
    group = state.get("group_info", {})
    telemetry = state.get("telemetry", [])
    rules = state.get("active_rules", [])

    metric_type = dev.get("metric_type", "")
    dev_tags = _safe_json(dev.get("tags")) or {}
    lat = dev.get("latitude", 0.0) or 0.0
    lon = dev.get("longitude", 0.0) or 0.0
    rg = dev.get("redundancy_group", "") or dev.get("redun_group", "")

    lines = [
        "# IOT ANOMALY INVESTIGATION CONTEXT",
        "",
        "## Alert",
        f"- Message: {alert.get('message', 'N/A')}",
        f"- Severity: {alert.get('severity', 'N/A')}",
        f"- Time: {alert.get('created_at', 'N/A')}",
        "",
        "## Device Under Investigation",
        f"- ID: {dev.get('id', 'N/A')}",
        f"- Name: {dev.get('name', 'N/A')}",
        f"- Type: {dev.get('type', 'N/A')}",
        f"- Status: {dev.get('status', 'N/A')}",
        f"- Location: {dev.get('location', 'N/A')}",
        f"- IP: {dev.get('ip_address', 'N/A')}",
        f"- Firmware: {dev.get('firmware_ver', 'N/A')}",
        f"- Last Seen: {dev.get('last_seen', 'N/A')}",
    ]

    if lat and lon:
        lines.append(f"- Coordinates: {lat}, {lon}")
    if rg:
        lines.append(f"- Redundancy Group: {rg} (other sensors in same location measuring the same things)")
    if metric_type:
        lines.append(f"- Metric Type: {metric_type} (this sensor reports a single metric)")
    if dev_tags:
        lines.append(f"- Tags: {', '.join(f'{k}={v}' for k, v in dev_tags.items())}")

    lines.extend([
        "",
        f"## Group: {group.get('name', 'N/A')}",
        f"- Description: {group.get('description', 'N/A')}",
    ])

    # Peer/redundancy hints
    peer_info = state.get("redundancy_peers", [])
    if peer_info:
        lines.extend(["", f"## Redundancy Group Peers ({len(peer_info)} sensors)"])
        for p in peer_info[:5]:
            lines.append(f"- {p.get('name', p.get('id', ''))} (status: {p.get('status', '')}, type: {p.get('type', '')})")
        lines.append("→ Use find_redundant_sensors tool to compare readings with these peers")

    # Nearby device hints
    nearby_info = state.get("nearby_devices", [])
    if nearby_info:
        lines.extend(["", f"## Nearby Devices ({len(nearby_info)} within radius)"])
        for n in nearby_info[:5]:
            lines.append(f"- {n.get('name', '')} ({n.get('type', '')}) at {n.get('distance_km', '?')} km — status: {n.get('status', '')}")
        lines.append("→ Use find_nearby_devices or get_environmental_context to establish local baselines")

    if telemetry:
        latest = telemetry[0]
        lines.extend(["", "## Latest Telemetry Reading"])
        for k, v in latest.items():
            if k not in ("device_id", "timestamp") and v is not None:
                lines.append(f"- {k}: {v}")

    if rules:
        lines.extend(["", "## Active Rules That May Have Triggered"])
        for r in rules:
            op_map = {"gt": ">", "lt": "<", "gte": "≥", "lte": "≤"}
            lines.append(f"- {r.get('name', '')}: {r.get('metric', '')} {op_map.get(r.get('operator', ''), '?')} {r.get('threshold', '')} → {r.get('severity', '')}")

    return "\n".join(lines)


# ---- Node 1: Collect Context ----

def collect_context_node(state: InvestigationState, as_client, namespace: str) -> dict:
    device_id = state["device_id"]
    alert_id = state["alert_id"]

    # Load device
    device_info = {}
    try:
        _, _, bins = as_client.get((namespace, "devices", device_id))
        device_info = dict(bins)
    except Exception:
        pass

    # Load alert
    alert_info = {}
    try:
        _, _, bins = as_client.get((namespace, "alerts", alert_id))
        alert_info = dict(bins)
    except Exception:
        pass

    # Load group
    group_info = {}
    group_id = device_info.get("group_id", "")
    if group_id:
        try:
            _, _, bins = as_client.get((namespace, "groups", group_id))
            group_info = dict(bins)
        except Exception:
            pass

    # Load group devices
    group_devices = []
    if group_id:
        dq = as_client.query(namespace, "devices")
        dq.foreach(lambda r: group_devices.append({"id": r[2].get("id"), "name": r[2].get("name"), "status": r[2].get("status"), "type": r[2].get("type")}) if r[2].get("group_id") == group_id else None)

    # Load recent telemetry
    tq = as_client.query(namespace, "telemetry")
    all_telem = []
    tq.foreach(lambda r: all_telem.append(r[2]))
    telemetry = sorted(
        [t for t in all_telem if t.get("device_id") == device_id],
        key=lambda t: t.get("timestamp", ""),
        reverse=True,
    )[:30]

    # Load active rules for this device/group
    rq = as_client.query(namespace, "rules")
    rules = []
    rq.foreach(lambda r: rules.append(r[2]))
    active_rules = [
        r for r in rules
        if r.get("enabled") and (
            (r.get("scope") == "device" and r.get("scope_id") == device_id) or
            (r.get("scope") == "group" and r.get("scope_id") == group_id)
        )
    ]

    # Load redundancy peers
    redundancy_peers = []
    rg = device_info.get("redun_group", "") or device_info.get("redundancy_group", "")
    if rg:
        for gd in group_devices:
            gd_rg = gd.get("redun_group", "") or gd.get("redundancy_group", "")
            if gd_rg == rg and gd.get("id") != device_id:
                redundancy_peers.append(gd)
        if not redundancy_peers:
            all_devs_q = as_client.query(namespace, "devices")
            all_devs = []
            all_devs_q.foreach(lambda r: all_devs.append(r[2]))
            for d in all_devs:
                d_rg = d.get("redun_group", "") or d.get("redundancy_group", "")
                if d_rg == rg and d.get("id") != device_id and d.get("status") != "decommissioned":
                    redundancy_peers.append({"id": d.get("id"), "name": d.get("name"), "status": d.get("status"), "type": d.get("type")})

    # Load nearby devices (within 10km)
    nearby_devices = []
    import math
    lat = device_info.get("latitude", 0.0) or 0.0
    lon = device_info.get("longitude", 0.0) or 0.0
    if lat and lon:
        for gd in group_devices:
            glat = gd.get("latitude", 0.0) or 0.0
            glon = gd.get("longitude", 0.0) or 0.0
            if glat and glon and gd.get("id") != device_id:
                R = 6371.0
                dlat = math.radians(glat - lat)
                dlon = math.radians(glon - lon)
                a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat)) * math.cos(math.radians(glat)) * math.sin(dlon / 2) ** 2
                dist = R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                if dist <= 10.0:
                    nearby_devices.append({**gd, "distance_km": round(dist, 3)})
        nearby_devices.sort(key=lambda x: x.get("distance_km", 999))

    return {
        "device_info": device_info,
        "alert_info": alert_info,
        "group_info": group_info,
        "group_devices": group_devices,
        "telemetry": telemetry,
        "active_rules": active_rules,
        "redundancy_peers": redundancy_peers,
        "nearby_devices": nearby_devices[:10],
        "status": "analyzing",
    }


# ---- Node 2: LLM Agent ----

def llm_agent_node(state: InvestigationState, as_client, namespace: str) -> dict:
    # Fail fast if Gemini is not configured
    if not _get_gemini_api_key():
        raise RuntimeError("Gemini API key is not configured. Set it in Admin > Settings or export GEMINI_API_KEY.")

    tools = InvestigationTools(as_client, namespace)
    context = _build_context_summary(state)
    device_id = state["device_id"]
    device_info = state.get("device_info", {})

    messages = []
    tool_calls = []
    evidence = {}
    last_llm_error = None

    for iteration in range(1, MAX_ITERATIONS + 1):
        history = ""
        for m in messages:
            if m["role"] == "assistant":
                history += f"\nAssistant: {m['content'][:600]}"
            elif m["role"] == "tool":
                history += f"\nTool Result ({m['tool']}): {m['content'][:1500]}"

        hint = "Investigate thoroughly. Use tools to gather evidence before concluding."
        if iteration >= MAX_ITERATIONS:
            hint = "FINAL ITERATION. You must call submit_analysis now."

        prompt = f"""You are a SENIOR IOT SYSTEMS ENGINEER investigating an anomaly on a device.

Your goal: Determine the ROOT CAUSE of the anomaly and suggest CORRECTIVE ACTIONS a human operator can take.

{context}

{InvestigationTools.TOOL_DESCRIPTIONS}

## INVESTIGATION STATUS
- Iteration: {iteration}/{MAX_ITERATIONS}
- Tool calls: {len(tool_calls)}/{MAX_TOOL_CALLS}
- Note: {hint}

## CONVERSATION HISTORY
{history if history else "(First iteration)"}

## INVESTIGATION STRATEGY
1. Start by reviewing the alert and device context above
2. Check device capabilities to understand what this sensor measures
3. If the device has a redundancy group, compare its readings against redundant peers — if both show similar anomalies, the cause is likely environmental; if only this device is anomalous, it's likely a sensor fault
4. If the device has coordinates, check environmental context from nearby devices to establish a local baseline
5. Correlate metrics (e.g. temp+humidity, cpu+memory) to detect compound failures
6. Check for correlated alerts across the group to identify systemic issues
7. When you have enough evidence, call submit_analysis with your findings
8. Focus on actionable root causes and practical corrective actions

Respond with ONLY a JSON object. No other text.

YOUR JSON RESPONSE:"""

        try:
            response = _call_gemini(prompt)
            last_llm_error = None
        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            last_llm_error = str(e)
            if iteration >= 3:
                break
            continue

        messages.append({"role": "assistant", "content": response, "ts": datetime.now(timezone.utc).isoformat()})

        tool_name, params = _parse_tool_call(response)
        if not tool_name:
            continue

        if tool_name == "submit_analysis":
            return {
                "analysis": {
                    "root_cause": params.get("root_cause", "Unable to determine"),
                    "corrective_actions": params.get("corrective_actions", []),
                    "confidence": params.get("confidence", "medium"),
                    "severity": params.get("severity", "warning"),
                    "summary": params.get("summary", ""),
                    "iterations": iteration,
                    "tool_calls_made": len(tool_calls),
                },
                "agent_messages": messages,
                "tool_calls": tool_calls,
                "iterations": iteration,
                "status": "saving",
            }

        if len(tool_calls) >= MAX_TOOL_CALLS:
            continue

        result = tools.execute(tool_name, params)
        result_json = json.dumps(result, default=str)
        tool_calls.append({
            "tool": tool_name,
            "params": params,
            "result_keys": list(result.keys()) if isinstance(result, dict) else [],
            "result_summary": result_json[:3000],
            "ts": datetime.now(timezone.utc).isoformat(),
        })
        evidence[f"{tool_name}_{len(tool_calls)}"] = result
        messages.append({"role": "tool", "tool": tool_name, "content": result_json[:2000], "ts": datetime.now(timezone.utc).isoformat()})

    # If we broke out due to LLM errors, propagate as failure
    if last_llm_error:
        raise RuntimeError(f"Gemini API error: {last_llm_error}")

    # Fallback if agent exhausted iterations without submitting
    return {
        "analysis": {
            "root_cause": "Investigation inconclusive - agent did not reach a conclusion within iteration limits.",
            "corrective_actions": ["Review device telemetry manually", "Check physical device connectivity", "Verify sensor calibration"],
            "confidence": "low",
            "severity": "warning",
            "summary": "Automated investigation did not converge",
            "iterations": MAX_ITERATIONS,
            "tool_calls_made": len(tool_calls),
        },
        "agent_messages": messages,
        "tool_calls": tool_calls,
        "iterations": MAX_ITERATIONS,
        "status": "saving",
    }


# ---- Node 3: Save Report ----

def save_report_node(state: InvestigationState, as_client, namespace: str) -> dict:
    inv_id = state["investigation_id"]
    analysis = state.get("analysis", {})

    key = (namespace, "investigations", inv_id)
    bins = {
        "id": inv_id,
        "alert_id": state["alert_id"],
        "device_id": state["device_id"],
        "device_name": state.get("device_info", {}).get("name", ""),
        "status": "completed",
        "root_cause": analysis.get("root_cause", ""),
        "actions": json.dumps(analysis.get("corrective_actions", [])),
        "confidence": analysis.get("confidence", "medium"),
        "severity": analysis.get("severity", "warning"),
        "summary": analysis.get("summary", ""),
        "iterations": analysis.get("iterations", 0),
        "tool_calls": analysis.get("tool_calls_made", 0),
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "agent_msgs": json.dumps(state.get("agent_messages", []), default=str),
        "tool_detail": json.dumps(state.get("tool_calls", []), default=str),
    }

    # Load existing record to preserve created_at
    try:
        _, _, existing = as_client.get(key)
        bins["created_at"] = existing.get("created_at", bins["completed_at"])
    except Exception:
        bins["created_at"] = bins["completed_at"]

    as_client.put(key, bins)
    return {"status": "completed"}


# ---- Workflow Builder ----

def create_investigation_workflow(as_client, namespace: str):
    """Create and compile the LangGraph investigation workflow."""
    global _as_client_ref, _as_namespace_ref
    _as_client_ref = as_client
    _as_namespace_ref = namespace

    workflow = StateGraph(InvestigationState)

    workflow.add_node("collect_context", lambda s: collect_context_node(s, as_client, namespace))
    workflow.add_node("llm_agent", lambda s: llm_agent_node(s, as_client, namespace))
    workflow.add_node("save_report", lambda s: save_report_node(s, as_client, namespace))

    workflow.set_entry_point("collect_context")
    workflow.add_edge("collect_context", "llm_agent")
    workflow.add_edge("llm_agent", "save_report")
    workflow.add_edge("save_report", END)

    compiled = workflow.compile()
    logger.info("Investigation workflow compiled")

    return compiled


def run_investigation_sync(workflow, investigation_id: str, alert_id: str, device_id: str) -> dict:
    """Run the investigation workflow synchronously (called from background thread)."""
    initial_state: InvestigationState = {
        "investigation_id": investigation_id,
        "alert_id": alert_id,
        "device_id": device_id,
        "status": "running",
    }

    config = {"recursion_limit": 30}
    result = workflow.invoke(initial_state, config)
    return result
