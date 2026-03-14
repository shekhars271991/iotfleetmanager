"""Investigation tools that query Aerospike for IoT anomaly analysis."""

import json
import math
import time
from datetime import datetime, timezone, timedelta
from aerospike import predicates as p
from aerospike_helpers import expressions as exp

from app.database import get_active_mode
from app.domain_config import get_mode_config


def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _safe_json(raw):
    if isinstance(raw, str) and raw:
        try:
            return json.loads(raw)
        except Exception:
            return None
    return raw if raw else None


def _summarize_values(vals):
    if not vals:
        return None
    return {
        "avg": round(sum(vals) / len(vals), 2),
        "min": round(min(vals), 2),
        "max": round(max(vals), 2),
        "count": len(vals),
    }


def _ts_gte_expr(cutoff_iso: str):
    """Build compiled Aerospike expression: timestamp >= cutoff (ISO string comparison)."""
    return exp.GE(exp.StrBin("timestamp"), exp.Val(cutoff_iso)).compile()


def _enabled_expr():
    """Build compiled Aerospike expression: enabled == 1."""
    return exp.Eq(exp.IntBin("enabled"), exp.Val(1)).compile()


class InvestigationTools:
    """Tools available to the LLM agent for investigating IoT anomalies."""

    @classmethod
    def get_tool_descriptions(cls):
        mode_cfg = get_mode_config(get_active_mode())
        labels = mode_cfg["entity_labels"]
        device_label = labels.get("device", "Device").lower()
        group_label = labels.get("group", "Group").lower()
        telemetry_label = labels.get("telemetry", "Telemetry").lower()
        alert_label = labels.get("alert", "Alert").lower()
        # Return the tool descriptions string with labels substituted
        return f"""Available tools (respond with JSON: {{"tool": "<name>", "params": {{<params>}}}}):

1. get_device_telemetry - Get recent {telemetry_label} readings for a {device_label} (single metric per {device_label})
   params: {{"device_id": "abc123", "minutes": 60}}

2. get_device_alerts - Get recent {alert_label}s for a {device_label}
   params: {{"device_id": "abc123", "hours": 24}}

3. get_group_overview - Get status summary of all {device_label}s in a {group_label}, grouped by metric_type
   params: {{"group_id": "xyz789"}}

4. compare_to_peers - Compare a {device_label}'s metric to the {group_label} average (peers reporting the same metric)
   params: {{"device_id": "abc123", "minutes": 60}}

5. check_correlated_alerts - Find if other {device_label}s in the same {group_label} had {alert_label}s around the same time
   params: {{"device_id": "abc123", "minutes": 30}}

6. get_device_capabilities - Get full {device_label} profile: metric_type, tags, redundancy group, coordinates
   params: {{"device_id": "abc123"}}

7. find_redundant_sensors - Find sensors in the same redundancy group and compare their latest readings
   params: {{"device_id": "abc123", "minutes": 30}}

8. find_nearby_devices - Find {device_label}s within a geographic radius and summarize their status/{alert_label}s
   params: {{"device_id": "abc123", "radius_km": 5.0}}

9. correlate_metrics - Cross-correlate two different metric types from nearby {device_label}s by time proximity
   params: {{"device_id": "abc123", "metric_a": "temp", "metric_b": "humidity", "minutes": 60}}

10. get_environmental_context - Get aggregated readings of a metric from all nearby {device_label}s to establish a local baseline
    params: {{"device_id": "abc123", "metric": "temp", "radius_km": 10.0, "minutes": 60}}

11. submit_analysis - Submit your final analysis (CALL THIS WHEN DONE)
   params: {{
     "root_cause": "DETAILED root cause (3-5 sentences minimum). Explain WHAT is happening, WHY it is happening, cite specific sensor readings and {device_label} names as evidence, describe how you ruled out alternative explanations, and explain the chain of causation.",
     "corrective_actions": ["action 1", "action 2", ...],
     "confidence": "high|medium|low",
     "severity": "critical|warning|info",
     "summary": "one-line summary"
   }}"""

    def __init__(self, as_client, namespace: str):
        self.client = as_client
        self.ns = namespace
        self.call_log = []
        self.db_calls = []
        self._device_cache = None

    # ------------------------------------------------------------------
    # Tracked DB access helpers
    # ------------------------------------------------------------------

    def _tracked_get(self, key, caller: str = ""):
        """Aerospike get() with timing tracking."""
        t0 = time.perf_counter()
        try:
            result = self.client.get(key)
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            self.db_calls.append({
                "op": "get", "set": key[1], "key": key[2],
                "caller": caller, "ms": elapsed, "success": True,
                "ts": datetime.now(timezone.utc).isoformat(),
            })
            return result
        except Exception as e:
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            self.db_calls.append({
                "op": "get", "set": key[1], "key": key[2],
                "caller": caller, "ms": elapsed, "success": False, "error": str(e),
                "ts": datetime.now(timezone.utc).isoformat(),
            })
            raise

    def _tracked_query(self, as_set: str, bin_name: str, value, caller: str = "", expr=None) -> list:
        """Secondary-index query with optional expression filter. Returns list of bin dicts."""
        t0 = time.perf_counter()
        try:
            query = self.client.query(self.ns, as_set)
            query.where(p.equals(bin_name, value))
            policy = {"expressions": expr} if expr else None
            records = []
            query.foreach(lambda r: records.append(r[2]), policy=policy)
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            self.db_calls.append({
                "op": "query", "set": as_set, "key": f"{bin_name}={value}",
                "rows": len(records), "caller": caller, "ms": elapsed, "success": True,
                "ts": datetime.now(timezone.utc).isoformat(),
            })
            return records
        except Exception as e:
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            self.db_calls.append({
                "op": "query", "set": as_set, "key": f"{bin_name}={value}",
                "rows": 0, "caller": caller, "ms": elapsed, "success": False, "error": str(e),
                "ts": datetime.now(timezone.utc).isoformat(),
            })
            raise

    def _tracked_scan(self, as_set: str, caller: str = "") -> list:
        """Full-table scan (fallback only). Prefer _tracked_query when an index exists."""
        t0 = time.perf_counter()
        try:
            query = self.client.query(self.ns, as_set)
            records = []
            query.foreach(lambda r: records.append(r[2]))
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            self.db_calls.append({
                "op": "scan", "set": as_set, "rows": len(records),
                "caller": caller, "ms": elapsed, "success": True,
                "ts": datetime.now(timezone.utc).isoformat(),
            })
            return records
        except Exception as e:
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            self.db_calls.append({
                "op": "scan", "set": as_set, "rows": 0,
                "caller": caller, "ms": elapsed, "success": False, "error": str(e),
                "ts": datetime.now(timezone.utc).isoformat(),
            })
            raise

    def _batch_query_telemetry(self, device_ids: set, minutes: int, caller: str = "") -> list:
        """Query telemetry for multiple devices via per-device SI queries with timestamp filter."""
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()
        ts_expr = _ts_gte_expr(cutoff)
        all_records = []
        for did in device_ids:
            rows = self._tracked_query("telemetry", "device_id", did, caller=caller, expr=ts_expr)
            all_records.extend(rows)
        return all_records

    def _batch_query_alerts(self, device_ids: set, cutoff_iso: str, caller: str = "") -> list:
        """Query alerts for multiple devices via per-device SI queries with timestamp filter."""
        ts_expr = _ts_gte_expr(cutoff_iso)
        all_records = []
        for did in device_ids:
            rows = self._tracked_query("alerts", "device_id", did, caller=caller, expr=ts_expr)
            all_records.extend(rows)
        return all_records

    # ------------------------------------------------------------------
    # Tool dispatch
    # ------------------------------------------------------------------

    def execute(self, tool_name: str, params: dict) -> dict:
        dispatch = {
            "get_device_telemetry": self._get_device_telemetry,
            "get_device_alerts": self._get_device_alerts,
            "get_group_overview": self._get_group_overview,
            "compare_to_peers": self._compare_to_peers,
            "check_correlated_alerts": self._check_correlated_alerts,
            "get_device_capabilities": self._get_device_capabilities,
            "find_redundant_sensors": self._find_redundant_sensors,
            "find_nearby_devices": self._find_nearby_devices,
            "correlate_metrics": self._correlate_metrics,
            "get_environmental_context": self._get_environmental_context,
        }

        fn = dispatch.get(tool_name)
        if not fn:
            return {"error": f"Unknown tool: {tool_name}"}

        try:
            result = fn(params)
            self.call_log.append({"tool": tool_name, "params": params, "success": True})
            return result
        except Exception as e:
            self.call_log.append({"tool": tool_name, "params": params, "success": False, "error": str(e)})
            return {"error": str(e)}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _load_device(self, device_id: str) -> dict:
        _, _, bins = self._tracked_get((self.ns, "devices", device_id), caller="_load_device")
        d = dict(bins)
        d["tags"] = _safe_json(d.get("tags"))
        if "redun_group" in d:
            d["redundancy_group"] = d.pop("redun_group")
        return d

    def _devices_by_group(self, group_id: str, caller: str = "") -> list:
        """Query devices by group_id using secondary index."""
        records = self._tracked_query("devices", "group_id", group_id, caller=caller)
        for d in records:
            d["tags"] = _safe_json(d.get("tags"))
            if "redun_group" in d:
                d["redundancy_group"] = d.pop("redun_group")
        return records

    def _devices_by_redun_group(self, rg: str, caller: str = "") -> list:
        """Query devices by redundancy group using secondary index."""
        records = self._tracked_query("devices", "redun_group", rg, caller=caller)
        for d in records:
            d["tags"] = _safe_json(d.get("tags"))
            if "redun_group" in d:
                d["redundancy_group"] = d.pop("redun_group")
        return records

    def _load_all_devices_cached(self, caller: str = "") -> list:
        """Load all active devices via per-status SI queries (cached per investigation)."""
        if self._device_cache is not None:
            return self._device_cache
        records = []
        for status in ("online", "offline", "warning"):
            records.extend(self._tracked_query("devices", "status", status, caller=caller))
        for d in records:
            d["tags"] = _safe_json(d.get("tags"))
            if "redun_group" in d:
                d["redundancy_group"] = d.pop("redun_group")
        self._device_cache = records
        return records

    def _query_device_telemetry(self, device_id: str, minutes: int, caller: str = "") -> list:
        """Query telemetry for a single device using SI + timestamp expression."""
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()
        ts_expr = _ts_gte_expr(cutoff)
        return self._tracked_query("telemetry", "device_id", device_id, caller=caller, expr=ts_expr)

    def _query_device_alerts(self, device_id: str, cutoff_iso: str, caller: str = "") -> list:
        """Query alerts for a single device using SI + timestamp expression."""
        ts_expr = _ts_gte_expr(cutoff_iso)
        return self._tracked_query("alerts", "device_id", device_id, caller=caller, expr=ts_expr)

    # ------------------------------------------------------------------
    # Tools
    # ------------------------------------------------------------------

    def _get_device_telemetry(self, params: dict) -> dict:
        device_id = params.get("device_id", "")
        minutes = int(params.get("minutes", 60))
        readings = self._query_device_telemetry(device_id, minutes, caller="get_device_telemetry")
        readings.sort(key=lambda r: r.get("timestamp", ""), reverse=True)

        if not readings:
            return {"device_id": device_id, "readings": [], "count": 0, "message": "No telemetry in window"}

        metric = readings[0].get("metric", "")
        vals = [float(r.get("value", 0)) for r in readings if r.get("value") is not None]

        return {
            "device_id": device_id,
            "metric": metric,
            "window_minutes": minutes,
            "total_readings": len(readings),
            "summary": _summarize_values(vals),
            "latest_value": readings[0].get("value"),
            "latest_timestamp": readings[0].get("timestamp"),
            "recent_values": [{"value": r.get("value"), "timestamp": r.get("timestamp")} for r in readings[:10]],
        }

    def _get_device_alerts(self, params: dict) -> dict:
        device_id = params.get("device_id", "")
        hours = int(params.get("hours", 24))
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

        alerts = self._query_device_alerts(device_id, cutoff, caller="get_device_alerts")
        alerts.sort(key=lambda a: a.get("created_at", ""), reverse=True)

        severity_counts = {}
        for a in alerts:
            sev = a.get("severity", "unknown")
            severity_counts[sev] = severity_counts.get(sev, 0) + 1

        return {
            "device_id": device_id,
            "window_hours": hours,
            "total_alerts": len(alerts),
            "severity_breakdown": severity_counts,
            "recent_alerts": [
                {"message": a.get("message", ""), "severity": a.get("severity", ""), "time": a.get("created_at", ""), "acknowledged": bool(a.get("acknowledged", 0))}
                for a in alerts[:10]
            ],
        }

    def _get_group_overview(self, params: dict) -> dict:
        group_id = params.get("group_id", "")
        devices = self._devices_by_group(group_id, caller="get_group_overview")
        devices = [d for d in devices if d.get("status") != "decommissioned"]

        status_counts = {}
        metric_type_groups = {}
        for d in devices:
            s = d.get("status", "unknown")
            status_counts[s] = status_counts.get(s, 0) + 1
            mt = d.get("metric_type", "unassigned")
            metric_type_groups.setdefault(mt, []).append(d.get("id", ""))

        return {
            "group_id": group_id,
            "total_devices": len(devices),
            "status_breakdown": status_counts,
            "metric_type_subgroups": {mt: len(ids) for mt, ids in metric_type_groups.items()},
            "devices": [
                {"id": d.get("id", ""), "name": d.get("name", ""), "type": d.get("type", ""),
                 "status": d.get("status", ""), "last_seen": d.get("last_seen", ""),
                 "metric_type": d.get("metric_type", ""), "redundancy_group": d.get("redundancy_group", "")}
                for d in devices
            ],
        }

    def _compare_to_peers(self, params: dict) -> dict:
        device_id = params.get("device_id", "")
        minutes = int(params.get("minutes", 60))

        dev = self._load_device(device_id)
        group_id = dev.get("group_id", "")
        metric_type = dev.get("metric_type", "")
        if not group_id:
            return {"error": "Device has no group"}

        group_devices = self._devices_by_group(group_id, caller="compare_to_peers:devices")
        same_metric_peers = {d.get("id") for d in group_devices
                            if d.get("metric_type") == metric_type
                            and d.get("status") != "decommissioned"}
        telemetry = self._batch_query_telemetry(same_metric_peers, minutes, caller="compare_to_peers:telemetry")

        device_vals, peer_vals = [], []
        for r in telemetry:
            val = r.get("value")
            if val is None:
                continue
            did = r.get("device_id", "")
            if did == device_id:
                device_vals.append(float(val))
            elif did in same_metric_peers:
                peer_vals.append(float(val))

        result = {"device_id": device_id, "metric": metric_type, "window_minutes": minutes, "peer_count": len(same_metric_peers) - 1}

        if device_vals:
            result["device_avg"] = round(sum(device_vals) / len(device_vals), 2)
            result["device_min"] = round(min(device_vals), 2)
            result["device_max"] = round(max(device_vals), 2)
        else:
            result["device_avg"] = None

        if peer_vals:
            result["peer_avg"] = round(sum(peer_vals) / len(peer_vals), 2)
            result["peer_min"] = round(min(peer_vals), 2)
            result["peer_max"] = round(max(peer_vals), 2)
        else:
            result["peer_avg"] = None

        if device_vals and peer_vals:
            dev_avg = sum(device_vals) / len(device_vals)
            peer_avg = sum(peer_vals) / len(peer_vals)
            result["deviation_pct"] = round(((dev_avg - peer_avg) / peer_avg) * 100, 1) if peer_avg else 0

        return result

    def _check_correlated_alerts(self, params: dict) -> dict:
        device_id = params.get("device_id", "")
        minutes = int(params.get("minutes", 30))
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()

        dev = self._load_device(device_id)
        group_id = dev.get("group_id", "")
        if not group_id:
            return {"device_id": device_id, "correlated_devices": [], "message": "Device has no group"}

        group_devices = self._devices_by_group(group_id, caller="correlated_alerts:devices")
        peer_map = {d.get("id"): d.get("name", "") for d in group_devices if d.get("id") != device_id}

        peer_alerts = self._batch_query_alerts(set(peer_map.keys()), cutoff, caller="correlated_alerts:alerts")

        correlated = {}
        for a in peer_alerts:
            did = a.get("device_id", "")
            if did in peer_map:
                if did not in correlated:
                    correlated[did] = {"name": peer_map[did], "alerts": []}
                correlated[did]["alerts"].append({"message": a.get("message", ""), "severity": a.get("severity", "")})

        return {
            "device_id": device_id,
            "window_minutes": minutes,
            "correlated_devices": len(correlated),
            "details": [{"device_id": did, "device_name": info["name"], "alert_count": len(info["alerts"]), "alerts": info["alerts"][:5]} for did, info in correlated.items()],
        }

    def _get_device_capabilities(self, params: dict) -> dict:
        device_id = params.get("device_id", "")
        dev = self._load_device(device_id)

        return {
            "device_id": device_id,
            "name": dev.get("name", ""),
            "type": dev.get("type", ""),
            "status": dev.get("status", ""),
            "firmware": dev.get("firmware_ver", ""),
            "ip_address": dev.get("ip_address", ""),
            "location": dev.get("location", ""),
            "coordinates": {"lat": dev.get("latitude", 0.0), "lon": dev.get("longitude", 0.0)},
            "group_id": dev.get("group_id", ""),
            "redundancy_group": dev.get("redundancy_group", ""),
            "metric_type": dev.get("metric_type", ""),
            "tags": dev.get("tags") or {},
        }

    def _find_redundant_sensors(self, params: dict) -> dict:
        device_id = params.get("device_id", "")
        minutes = int(params.get("minutes", 30))
        dev = self._load_device(device_id)
        rg = dev.get("redundancy_group", "")

        if not rg:
            return {"device_id": device_id, "redundancy_group": None, "peers": [], "message": "Device has no redundancy group"}

        rg_devices = self._devices_by_redun_group(rg, caller="find_redundant:devices")
        peers = [d for d in rg_devices if d.get("id") != device_id and d.get("status") != "decommissioned"]

        if not peers:
            return {"device_id": device_id, "redundancy_group": rg, "peers": [], "message": "No redundant peers found"}

        peer_ids = {d.get("id") for d in peers} | {device_id}
        telemetry = self._batch_query_telemetry(peer_ids, minutes, caller="find_redundant:telemetry")

        per_device = {}
        for r in telemetry:
            did = r.get("device_id", "")
            val = r.get("value")
            if val is not None:
                per_device.setdefault(did, []).append(float(val))

        comparison = []
        for peer in peers:
            pid = peer.get("id", "")
            vals = per_device.get(pid, [])
            comparison.append({
                "id": pid, "name": peer.get("name", ""), "status": peer.get("status", ""),
                "metric_type": peer.get("metric_type", ""),
                "distance_km": _haversine_km(
                    dev.get("latitude", 0) or 0, dev.get("longitude", 0) or 0,
                    peer.get("latitude", 0) or 0, peer.get("longitude", 0) or 0
                ) if (dev.get("latitude") and peer.get("latitude")) else None,
                "summary": _summarize_values(vals),
            })

        this_vals = per_device.get(device_id, [])
        return {
            "device_id": device_id,
            "metric_type": dev.get("metric_type", ""),
            "redundancy_group": rg,
            "this_device_summary": _summarize_values(this_vals),
            "peer_count": len(peers),
            "peers": comparison,
        }

    def _find_nearby_devices(self, params: dict) -> dict:
        device_id = params.get("device_id", "")
        radius_km = float(params.get("radius_km", 5.0))
        dev = self._load_device(device_id)

        lat = dev.get("latitude", 0.0) or 0.0
        lon = dev.get("longitude", 0.0) or 0.0
        if lat == 0.0 and lon == 0.0:
            return {"device_id": device_id, "nearby": [], "message": "Device has no coordinates"}

        all_devices = self._load_all_devices_cached(caller="find_nearby:devices")
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
                nearby.append({
                    "id": did, "name": d.get("name", ""), "type": d.get("type", ""),
                    "status": d.get("status", ""), "distance_km": round(dist, 3),
                    "metric_type": d.get("metric_type", ""),
                    "redundancy_group": d.get("redundancy_group", ""),
                    "group_id": d.get("group_id", ""),
                })

        cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        nearby_ids = {d["id"] for d in nearby}
        nearby_alerts = self._batch_query_alerts(nearby_ids, cutoff, caller="find_nearby:alerts")
        alert_counts = {}
        for a in nearby_alerts:
            did = a.get("device_id", "")
            alert_counts[did] = alert_counts.get(did, 0) + 1

        for d in nearby:
            d["recent_alert_count"] = alert_counts.get(d["id"], 0)

        nearby.sort(key=lambda x: x["distance_km"])
        return {
            "device_id": device_id,
            "radius_km": radius_km,
            "nearby_count": len(nearby),
            "devices": nearby[:20],
        }

    def _correlate_metrics(self, params: dict) -> dict:
        """Cross-correlate two different metric types from related devices by aligning on time buckets."""
        device_id = params.get("device_id", "")
        metric_a = params.get("metric_a", "temp")
        metric_b = params.get("metric_b", "humidity")
        minutes = int(params.get("minutes", 60))

        dev = self._load_device(device_id)
        group_id = dev.get("group_id", "")

        if not group_id:
            return {"error": "Device has no group for correlation"}

        group_devices = self._devices_by_group(group_id, caller="correlate:devices")
        related_ids = set()
        for d in group_devices:
            mt = d.get("metric_type", "")
            if d.get("status") == "decommissioned":
                continue
            if mt in (metric_a, metric_b):
                related_ids.add(d.get("id", ""))
        related_ids.add(device_id)

        telemetry = self._batch_query_telemetry(related_ids, minutes, caller="correlate:telemetry")

        bucket_size = 30
        a_buckets = {}
        b_buckets = {}
        for r in telemetry:
            metric = r.get("metric", "")
            val = r.get("value")
            if val is None:
                continue
            ts = r.get("timestamp", "")
            try:
                epoch = int(datetime.fromisoformat(ts).timestamp())
            except Exception:
                continue
            bucket = epoch // bucket_size
            if metric == metric_a:
                a_buckets.setdefault(bucket, []).append(float(val))
            elif metric == metric_b:
                b_buckets.setdefault(bucket, []).append(float(val))

        common_buckets = sorted(set(a_buckets.keys()) & set(b_buckets.keys()))
        if len(common_buckets) < 3:
            return {
                "device_id": device_id, "metric_a": metric_a, "metric_b": metric_b,
                "message": f"Insufficient overlapping data ({len(common_buckets)} time buckets)",
            }

        a_vals = [sum(a_buckets[b]) / len(a_buckets[b]) for b in common_buckets]
        b_vals = [sum(b_buckets[b]) / len(b_buckets[b]) for b in common_buckets]
        n = len(a_vals)
        a_mean = sum(a_vals) / n
        b_mean = sum(b_vals) / n
        cov = sum((a - a_mean) * (b - b_mean) for a, b in zip(a_vals, b_vals)) / n
        std_a = (sum((a - a_mean) ** 2 for a in a_vals) / n) ** 0.5
        std_b = (sum((b - b_mean) ** 2 for b in b_vals) / n) ** 0.5
        corr = cov / (std_a * std_b) if std_a > 0 and std_b > 0 else 0

        return {
            "device_id": device_id,
            "metric_a": metric_a,
            "metric_b": metric_b,
            "window_minutes": minutes,
            "time_buckets": n,
            f"{metric_a}_summary": _summarize_values(a_vals),
            f"{metric_b}_summary": _summarize_values(b_vals),
            "correlation": round(corr, 3),
        }

    def _get_environmental_context(self, params: dict) -> dict:
        device_id = params.get("device_id", "")
        metric = params.get("metric", "temp")
        radius_km = float(params.get("radius_km", 10.0))
        minutes = int(params.get("minutes", 60))

        dev = self._load_device(device_id)
        lat = dev.get("latitude", 0.0) or 0.0
        lon = dev.get("longitude", 0.0) or 0.0

        if lat == 0.0 and lon == 0.0:
            return {"device_id": device_id, "message": "Device has no coordinates, cannot compute environmental context"}

        all_devices = self._load_all_devices_cached(caller="env_context:devices")
        nearby_ids = set()
        for d in all_devices:
            did = d.get("id", "")
            if d.get("status") == "decommissioned":
                continue
            if d.get("metric_type") != metric:
                continue
            dlat = d.get("latitude", 0.0) or 0.0
            dlon = d.get("longitude", 0.0) or 0.0
            if dlat == 0.0 and dlon == 0.0:
                continue
            dist = _haversine_km(lat, lon, dlat, dlon)
            if dist <= radius_km:
                nearby_ids.add(did)

        nearby_ids.add(device_id)
        telemetry = self._batch_query_telemetry(nearby_ids, minutes, caller="env_context:telemetry")

        this_vals = []
        env_vals = []
        for r in telemetry:
            if r.get("metric", "") != metric:
                continue
            val = r.get("value")
            if val is None:
                continue
            did = r.get("device_id", "")
            if did == device_id:
                this_vals.append(float(val))
            elif did in nearby_ids:
                env_vals.append(float(val))

        result = {
            "device_id": device_id,
            "metric": metric,
            "radius_km": radius_km,
            "window_minutes": minutes,
            "nearby_devices_count": len(nearby_ids) - 1,
        }

        if this_vals:
            result["this_device"] = _summarize_values(this_vals)
        if env_vals:
            result["environment_baseline"] = _summarize_values(env_vals)
        if this_vals and env_vals:
            dev_avg = sum(this_vals) / len(this_vals)
            env_avg = sum(env_vals) / len(env_vals)
            result["deviation_from_environment_pct"] = round(((dev_avg - env_avg) / env_avg) * 100, 1) if env_avg else 0

        return result
