"""Investigation tools that query Aerospike for IoT anomaly analysis."""

import json
import math
import time
from datetime import datetime, timezone, timedelta
from typing import Any


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


class InvestigationTools:
    """Tools available to the LLM agent for investigating IoT anomalies."""

    TOOL_DESCRIPTIONS = """Available tools (respond with JSON: {"tool": "<name>", "params": {<params>}}):

1. get_device_telemetry - Get recent telemetry readings for a device (single metric per device)
   params: {"device_id": "abc123", "minutes": 60}

2. get_device_alerts - Get recent alerts for a device
   params: {"device_id": "abc123", "hours": 24}

3. get_group_overview - Get status summary of all devices in a group, grouped by metric_type
   params: {"group_id": "xyz789"}

4. compare_to_peers - Compare a device's metric to the group average (peers reporting the same metric)
   params: {"device_id": "abc123", "minutes": 60}

5. check_correlated_alerts - Find if other devices in the same group had alerts around the same time
   params: {"device_id": "abc123", "minutes": 30}

6. get_device_capabilities - Get full device profile: metric_type, tags, redundancy group, coordinates
   params: {"device_id": "abc123"}

7. find_redundant_sensors - Find sensors in the same redundancy group and compare their latest readings
   params: {"device_id": "abc123", "minutes": 30}

8. find_nearby_devices - Find devices within a geographic radius and summarize their status/alerts
   params: {"device_id": "abc123", "radius_km": 5.0}

9. correlate_metrics - Cross-correlate two different metric types from nearby devices by time proximity
   params: {"device_id": "abc123", "metric_a": "temp", "metric_b": "humidity", "minutes": 60}

10. get_environmental_context - Get aggregated readings of a metric from all nearby devices to establish a local baseline
    params: {"device_id": "abc123", "metric": "temp", "radius_km": 10.0, "minutes": 60}

11. submit_analysis - Submit your final analysis (CALL THIS WHEN DONE)
   params: {
     "root_cause": "description of why the anomaly is happening",
     "corrective_actions": ["action 1", "action 2", ...],
     "confidence": "high|medium|low",
     "severity": "critical|warning|info",
     "summary": "one-line summary"
   }"""

    def __init__(self, as_client, namespace: str):
        self.client = as_client
        self.ns = namespace
        self.call_log = []
        self.db_calls = []

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

    def _tracked_scan(self, as_set: str, caller: str = "") -> list:
        """Aerospike query/scan with timing tracking."""
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

    # --- helpers ---

    def _load_device(self, device_id: str) -> dict:
        _, _, bins = self._tracked_get((self.ns, "devices", device_id), caller="_load_device")
        d = dict(bins)
        d["tags"] = _safe_json(d.get("tags"))
        if "redun_group" in d:
            d["redundancy_group"] = d.pop("redun_group")
        return d

    def _load_all_devices(self) -> list:
        records = self._tracked_scan("devices", caller="_load_all_devices")
        for d in records:
            d["tags"] = _safe_json(d.get("tags"))
            if "redun_group" in d:
                d["redundancy_group"] = d.pop("redun_group")
        return records

    def _load_telemetry(self, minutes: int, device_ids: set = None) -> list:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()
        records = self._tracked_scan("telemetry", caller="_load_telemetry")
        out = []
        for r in records:
            if r.get("timestamp", "") < cutoff:
                continue
            if device_ids and r.get("device_id") not in device_ids:
                continue
            out.append(r)
        return out

    # --- tools ---

    def _get_device_telemetry(self, params: dict) -> dict:
        device_id = params.get("device_id", "")
        minutes = int(params.get("minutes", 60))
        readings = self._load_telemetry(minutes, {device_id})
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

        records = self._tracked_scan("alerts", caller="get_device_alerts")

        alerts = [a for a in records if a.get("device_id") == device_id and a.get("created_at", "") >= cutoff]
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
        all_devices = self._load_all_devices()
        devices = [d for d in all_devices if d.get("group_id") == group_id and d.get("status") != "decommissioned"]

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

        all_devices = self._load_all_devices()
        same_metric_peers = {d.get("id") for d in all_devices
                            if d.get("group_id") == group_id
                            and d.get("metric_type") == metric_type
                            and d.get("status") != "decommissioned"}
        telemetry = self._load_telemetry(minutes, same_metric_peers)

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

        all_devices = self._load_all_devices()
        group_devices = {d.get("id"): d.get("name", "") for d in all_devices
                         if d.get("group_id") == group_id and d.get("id") != device_id}

        all_alerts = self._tracked_scan("alerts", caller="check_correlated_alerts")

        correlated = {}
        for a in all_alerts:
            did = a.get("device_id", "")
            if did in group_devices and a.get("created_at", "") >= cutoff:
                if did not in correlated:
                    correlated[did] = {"name": group_devices[did], "alerts": []}
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

        all_devices = self._load_all_devices()
        peers = [d for d in all_devices if d.get("redundancy_group") == rg and d.get("id") != device_id and d.get("status") != "decommissioned"]

        if not peers:
            return {"device_id": device_id, "redundancy_group": rg, "peers": [], "message": "No redundant peers found"}

        peer_ids = {d.get("id") for d in peers} | {device_id}
        telemetry = self._load_telemetry(minutes, peer_ids)

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

        all_devices = self._load_all_devices()
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

        all_alerts = self._tracked_scan("alerts", caller="find_nearby_devices")
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        nearby_ids = {d["id"] for d in nearby}
        alert_counts = {}
        for a in all_alerts:
            did = a.get("device_id", "")
            if did in nearby_ids and a.get("created_at", "") >= cutoff:
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
        rg = dev.get("redundancy_group", "")

        all_devices = self._load_all_devices()
        related_ids = set()
        for d in all_devices:
            did = d.get("id", "")
            mt = d.get("metric_type", "")
            if d.get("status") == "decommissioned":
                continue
            if mt not in (metric_a, metric_b):
                continue
            if group_id and d.get("group_id") == group_id:
                related_ids.add(did)
            elif rg and d.get("redundancy_group") == rg:
                related_ids.add(did)
        related_ids.add(device_id)

        telemetry = self._load_telemetry(minutes, related_ids)

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

        all_devices = self._load_all_devices()
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
        telemetry = self._load_telemetry(minutes, nearby_ids)

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
