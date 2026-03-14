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
import pickle
import logging
import threading
from datetime import datetime, timezone

import aerospike
import httpx
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.aerospike import AerospikeSaver

from app.agent.state import InvestigationState
from app.agent.tools import InvestigationTools

logger = logging.getLogger("investigation.workflow")

MAX_ITERATIONS = 20
MAX_TOOL_CALLS = 15

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")

_as_client_ref = None
_as_namespace_ref = None

_checkpoint_local = threading.local()


def _drain_checkpoint_calls() -> list:
    calls = getattr(_checkpoint_local, "calls", [])
    _checkpoint_local.calls = []
    return calls


def _track_call(op, key, success, elapsed, error=None):
    calls = getattr(_checkpoint_local, "calls", None)
    if calls is not None:
        entry = {
            "op": op, "set": key[1], "key": str(key[2])[:40],
            "caller": "checkpointer", "ms": elapsed, "success": success,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        if error:
            entry["error"] = str(error)[:100]
        calls.append(entry)


class TrackedAerospikeSaver(AerospikeSaver):
    """Stores all checkpoint data as pickled blobs to avoid CDT serialization issues."""

    def _put(self, key, bins):
        t0 = time.perf_counter()
        try:
            meta = None
            if self._ttl_minutes is not None and self._ttl_minutes > 0:
                meta = {"ttl": int(self._ttl_minutes) * 60}
            self.client.put(key, {"_pk": pickle.dumps(bins)}, meta)
            _track_call("put", key, True, round((time.perf_counter() - t0) * 1000, 2))
        except Exception as e:
            _track_call("put", key, False, round((time.perf_counter() - t0) * 1000, 2), e)
            raise

    def _get(self, key):
        t0 = time.perf_counter()
        try:
            rec = self.client.get(key)
        except aerospike.exception.RecordNotFound:
            _track_call("get", key, True, round((time.perf_counter() - t0) * 1000, 2))
            return None
        except Exception as e:
            _track_call("get", key, False, round((time.perf_counter() - t0) * 1000, 2), e)
            raise

        elapsed = round((time.perf_counter() - t0) * 1000, 2)
        _track_call("get", key, True, elapsed)

        if self._refresh_on_read and self._ttl_minutes is not None and self._ttl_minutes > 0:
            try:
                self.client.touch(key, int(self._ttl_minutes) * 60)
            except aerospike.exception.AerospikeError:
                pass

        k, meta, raw = rec
        if "_pk" in raw:
            return (k, meta, pickle.loads(raw["_pk"]))
        return (k, meta, raw)


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


def _flush_progress(as_client, namespace, inv_id, messages, tool_calls_list, iteration, db_calls_list=None):
    """Write current agent progress to Aerospike so the frontend can poll it."""
    try:
        if db_calls_list is not None:
            db_calls_list.extend(_drain_checkpoint_calls())
        key = (namespace, "investigations", inv_id)
        bins = {
            "agent_msgs": json.dumps(messages, default=str),
            "tool_detail": json.dumps(tool_calls_list, default=str),
            "iterations": iteration,
            "tool_calls": len(tool_calls_list),
        }
        if db_calls_list is not None:
            bins["db_calls"] = json.dumps(db_calls_list, default=str)
        as_client.put(key, bins)
    except Exception as e:
        logger.debug(f"Progress flush failed (non-fatal): {e}")


# ---- Node 1: Collect Context ----

def _tracked_get(as_client, key, db_calls, caller=""):
    """Aerospike get() with timing tracking for context collection."""
    t0 = time.perf_counter()
    try:
        result = as_client.get(key)
        elapsed = round((time.perf_counter() - t0) * 1000, 2)
        db_calls.append({
            "op": "get", "set": key[1], "key": key[2],
            "caller": caller, "ms": elapsed, "success": True,
            "ts": datetime.now(timezone.utc).isoformat(),
        })
        return result
    except Exception as e:
        elapsed = round((time.perf_counter() - t0) * 1000, 2)
        db_calls.append({
            "op": "get", "set": key[1], "key": key[2],
            "caller": caller, "ms": elapsed, "success": False, "error": str(e),
            "ts": datetime.now(timezone.utc).isoformat(),
        })
        raise


def _tracked_scan(as_client, namespace, as_set, db_calls, caller=""):
    """Aerospike query/scan with timing tracking for context collection."""
    t0 = time.perf_counter()
    try:
        query = as_client.query(namespace, as_set)
        records = []
        query.foreach(lambda r: records.append(r[2]))
        elapsed = round((time.perf_counter() - t0) * 1000, 2)
        db_calls.append({
            "op": "scan", "set": as_set, "rows": len(records),
            "caller": caller, "ms": elapsed, "success": True,
            "ts": datetime.now(timezone.utc).isoformat(),
        })
        return records
    except Exception as e:
        elapsed = round((time.perf_counter() - t0) * 1000, 2)
        db_calls.append({
            "op": "scan", "set": as_set, "rows": 0,
            "caller": caller, "ms": elapsed, "success": False, "error": str(e),
            "ts": datetime.now(timezone.utc).isoformat(),
        })
        raise


def collect_context_node(state: InvestigationState, as_client, namespace: str) -> dict:
    device_id = state["device_id"]
    alert_id = state["alert_id"]
    inv_id = state["investigation_id"]
    db_calls = list(state.get("db_calls") or [])

    # Load device
    device_info = {}
    try:
        _, _, bins = _tracked_get(as_client, (namespace, "devices", device_id), db_calls, "collect_context:device")
        device_info = dict(bins)
    except Exception:
        pass

    # Load alert
    alert_info = {}
    try:
        _, _, bins = _tracked_get(as_client, (namespace, "alerts", alert_id), db_calls, "collect_context:alert")
        alert_info = dict(bins)
    except Exception:
        pass

    # Load group
    group_info = {}
    group_id = device_info.get("group_id", "")
    if group_id:
        try:
            _, _, bins = _tracked_get(as_client, (namespace, "groups", group_id), db_calls, "collect_context:group")
            group_info = dict(bins)
        except Exception:
            pass

    # Load group devices
    group_devices = []
    if group_id:
        all_devs = _tracked_scan(as_client, namespace, "devices", db_calls, "collect_context:group_devices")
        group_devices = [
            {"id": d.get("id"), "name": d.get("name"), "status": d.get("status"), "type": d.get("type"),
             "latitude": d.get("latitude"), "longitude": d.get("longitude"),
             "redun_group": d.get("redun_group", ""), "redundancy_group": d.get("redundancy_group", "")}
            for d in all_devs if d.get("group_id") == group_id
        ]

    # Load recent telemetry
    all_telem = _tracked_scan(as_client, namespace, "telemetry", db_calls, "collect_context:telemetry")
    telemetry = sorted(
        [t for t in all_telem if t.get("device_id") == device_id],
        key=lambda t: t.get("timestamp", ""),
        reverse=True,
    )[:30]

    # Load active rules for this device/group
    rules = _tracked_scan(as_client, namespace, "rules", db_calls, "collect_context:rules")
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
            all_devs = _tracked_scan(as_client, namespace, "devices", db_calls, "collect_context:redundancy_scan")
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

    _flush_progress(as_client, namespace, inv_id, [], [], 0, db_calls)

    return {
        "device_info": device_info,
        "alert_info": alert_info,
        "group_info": group_info,
        "group_devices": group_devices,
        "telemetry": telemetry,
        "active_rules": active_rules,
        "redundancy_peers": redundancy_peers,
        "nearby_devices": nearby_devices[:10],
        "db_calls": db_calls,
        "status": "analyzing",
    }


# ---- Node 2: LLM Agent ----

def _parse_action_response(response: str):
    """Parse an action JSON from the LLM response, allowing preamble text before JSON."""
    if not response:
        return None, {}, ""

    reasoning_text = ""
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
            return data["tool"], data.get("params", {}), data.get("reasoning", "")
    except Exception:
        pass

    # Extract first JSON object, capturing text before it as reasoning
    try:
        start = cleaned.find("{")
        if start >= 0:
            reasoning_text = cleaned[:start].strip()
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
                return data["tool"], data.get("params", {}), data.get("reasoning", "") or reasoning_text
    except Exception:
        pass

    return None, {}, ""


def llm_agent_node(state: InvestigationState, as_client, namespace: str) -> dict:
    if not _get_gemini_api_key():
        raise RuntimeError("Gemini API key is not configured. Set it in Admin > Settings or export GEMINI_API_KEY.")

    tools = InvestigationTools(as_client, namespace)
    tools.db_calls = list(state.get("db_calls") or [])
    context = _build_context_summary(state)
    device_id = state["device_id"]
    inv_id = state["investigation_id"]

    messages = []
    tool_calls = []
    evidence = {}
    last_llm_error = None

    def _format_history():
        parts = []
        for m in messages:
            if m["role"] == "assistant" and m.get("phase") == "analysis":
                parts.append(f"\n[ANALYSIS] {m['content'][:800]}")
            elif m["role"] == "assistant" and m.get("phase") == "action":
                parts.append(f"\n[ACTION] {m['content'][:400]}")
            elif m["role"] == "assistant":
                parts.append(f"\n[AGENT] {m['content'][:600]}")
            elif m["role"] == "tool":
                parts.append(f"\n[TOOL RESULT: {m['tool']}] {m['content'][:1500]}")
        return "".join(parts) if parts else "(First iteration)"

    for iteration in range(1, MAX_ITERATIONS + 1):
        history = _format_history()

        # ---- PHASE 1: ANALYZE — reflect on what we know so far ----
        has_tool_results = any(m["role"] == "tool" for m in messages)
        need_more_evidence = len(tool_calls) < 3

        if has_tool_results or iteration == 1:
            analyze_hint = "Begin by reviewing the alert context and planning your investigation approach." if iteration == 1 else (
                "Analyze the tool results you received. What did you learn? What hypotheses can you form or rule out? What gaps remain?"
            )

            if len(tool_calls) >= MAX_TOOL_CALLS - 1:
                analyze_hint += " You are almost out of tool calls. Summarize your findings."

            analyze_prompt = f"""You are a SENIOR IOT SYSTEMS ENGINEER investigating an anomaly on a device.

{context}

## INVESTIGATION HISTORY
{history}

## STATUS
- Iteration: {iteration}/{MAX_ITERATIONS}
- Tool calls used: {len(tool_calls)}/{MAX_TOOL_CALLS}

## YOUR TASK
{analyze_hint}

Write a thorough analysis paragraph (4-8 sentences). Consider:
- What evidence have you gathered so far? Cite specific device names and readings.
- What patterns or anomalies do you see in the data?
- What hypotheses are supported or ruled out by the evidence?
- Is this an isolated sensor issue, an environmental change, or a systemic group problem?
- Did redundant sensors confirm or contradict the anomaly?
- Are there cross-metric correlations (e.g. temp rising while pressure drops)?
- How do nearby devices in other zones compare?
- Do you have ENOUGH evidence to reach a conclusion, or do you need more data?

If you have gathered sufficient evidence (typically 3+ tool calls with meaningful data), state that you are ready to submit your conclusion with a detailed root cause.

Respond with ONLY your analysis text. No JSON. No tool calls."""

            try:
                analysis_response = _call_gemini(analyze_prompt)
                last_llm_error = None
            except Exception as e:
                logger.error(f"LLM analysis call failed: {e}")
                last_llm_error = str(e)
                if iteration >= 3:
                    break
                continue

            messages.append({
                "role": "assistant",
                "phase": "analysis",
                "content": analysis_response.strip(),
                "ts": datetime.now(timezone.utc).isoformat(),
            })
            _flush_progress(as_client, namespace, inv_id, messages, tool_calls, iteration, tools.db_calls)

        # ---- PHASE 2: ACT — decide next tool call or submit conclusion ----
        remaining_calls = MAX_TOOL_CALLS - len(tool_calls)
        force_conclude = iteration >= MAX_ITERATIONS or remaining_calls <= 0

        action_hint = "Choose the next tool call to gather more evidence."
        if force_conclude:
            action_hint = "You MUST call submit_analysis now with your best findings."
        elif not need_more_evidence and has_tool_results:
            action_hint = "Choose the next tool call to gather more evidence, OR if you have sufficient evidence, call submit_analysis."

        action_prompt = f"""You are a SENIOR IOT SYSTEMS ENGINEER investigating an anomaly.

{context}

{InvestigationTools.TOOL_DESCRIPTIONS}

## INVESTIGATION HISTORY
{history}

## STATUS
- Iteration: {iteration}/{MAX_ITERATIONS}
- Tool calls used: {len(tool_calls)}/{MAX_TOOL_CALLS} (remaining: {remaining_calls})
- {action_hint}

## INVESTIGATION STRATEGY
1. First understand the device: check capabilities, what metric it reports
2. Get telemetry data to understand reading patterns and ranges
3. If the device has redundant peers, compare readings — similar anomalies = environmental; divergence = sensor fault
4. Check nearby devices for environmental baselines
5. Correlate different metric types (temp+humidity, temp+pressure) across nearby devices
6. Check for correlated alerts to identify systemic group issues
7. Get device alerts history for pattern recognition
8. Only submit when you have investigated at least 3-4 different data sources

## ROOT CAUSE REQUIREMENTS (when calling submit_analysis)
Your root_cause MUST be 3-5 sentences minimum. It must:
- Name specific devices and their readings as evidence (e.g. "TMP-CSA-01 read 52°C while normal baseline is 18-32°C")
- Explain how redundant/peer sensors confirmed or contradicted the anomaly
- Describe cross-metric correlations found (e.g. temp rise + pressure drop = air handling issue)
- State what alternative explanations were ruled out and why (e.g. "Ruled out sensor malfunction because redundant sensor TMP-CSA-02 showed identical elevated readings")
- Identify the systemic root cause (e.g. HVAC failure, power issue, network degradation)

Respond with ONLY a JSON object:
{{"reasoning": "brief explanation of why you chose this action", "tool": "<tool_name>", "params": {{...}}}}"""

        try:
            action_response = _call_gemini(action_prompt)
            last_llm_error = None
        except Exception as e:
            logger.error(f"LLM action call failed: {e}")
            last_llm_error = str(e)
            if iteration >= 3:
                break
            continue

        messages.append({
            "role": "assistant",
            "phase": "action",
            "content": action_response.strip(),
            "ts": datetime.now(timezone.utc).isoformat(),
        })
        _flush_progress(as_client, namespace, inv_id, messages, tool_calls, iteration, tools.db_calls)

        tool_name, params, reasoning = _parse_action_response(action_response)
        if not tool_name:
            tool_name, params = _parse_tool_call(action_response)

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
                "db_calls": tools.db_calls,
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
            "reasoning": reasoning,
            "result_keys": list(result.keys()) if isinstance(result, dict) else [],
            "result_summary": result_json[:3000],
            "ts": datetime.now(timezone.utc).isoformat(),
        })
        evidence[f"{tool_name}_{len(tool_calls)}"] = result
        messages.append({
            "role": "tool",
            "tool": tool_name,
            "content": result_json[:2000],
            "ts": datetime.now(timezone.utc).isoformat(),
        })
        _flush_progress(as_client, namespace, inv_id, messages, tool_calls, iteration, tools.db_calls)

    if last_llm_error:
        raise RuntimeError(f"Gemini API error: {last_llm_error}")

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
        "db_calls": tools.db_calls,
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
        "db_calls": json.dumps(state.get("db_calls", []), default=str),
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
    """Create and compile the LangGraph investigation workflow with Aerospike checkpointer."""
    global _as_client_ref, _as_namespace_ref
    _as_client_ref = as_client
    _as_namespace_ref = namespace

    checkpointer = TrackedAerospikeSaver(
        client=as_client,
        namespace=namespace,
        set_cp="lg_cp",
        set_writes="lg_cp_w",
        set_meta="lg_cp_meta",
    )

    workflow = StateGraph(InvestigationState)

    workflow.add_node("collect_context", lambda s: collect_context_node(s, as_client, namespace))
    workflow.add_node("llm_agent", lambda s: llm_agent_node(s, as_client, namespace))
    workflow.add_node("save_report", lambda s: save_report_node(s, as_client, namespace))

    workflow.set_entry_point("collect_context")
    workflow.add_edge("collect_context", "llm_agent")
    workflow.add_edge("llm_agent", "save_report")
    workflow.add_edge("save_report", END)

    compiled = workflow.compile(checkpointer=checkpointer)
    logger.info("Investigation workflow compiled with Aerospike checkpointer")

    return compiled


def run_investigation_sync(workflow, investigation_id: str, alert_id: str, device_id: str) -> dict:
    """Run the investigation workflow synchronously (called from background thread)."""
    _checkpoint_local.calls = []

    initial_state: InvestigationState = {
        "investigation_id": investigation_id,
        "alert_id": alert_id,
        "device_id": device_id,
        "status": "running",
    }

    config = {
        "recursion_limit": 30,
        "configurable": {"thread_id": investigation_id},
    }
    result = workflow.invoke(initial_state, config)

    remaining_cp_calls = _drain_checkpoint_calls()
    if remaining_cp_calls:
        existing = result.get("db_calls") or []
        result["db_calls"] = existing + remaining_cp_calls

    return result
