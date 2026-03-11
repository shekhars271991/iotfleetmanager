from fastapi import APIRouter

from app.database import get_client, NAMESPACE
from app.schemas import DashboardStats

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/stats", response_model=DashboardStats)
async def get_stats():
    client = get_client()

    total = 0
    online = 0
    offline = 0
    warning = 0
    decommissioned = 0
    by_type = {}
    by_metric_type = {}
    group_data = {}

    groups_map = {}
    gq = client.query(NAMESPACE, "groups")
    def g_cb(record):
        _, _, bins = record
        gid = bins.get("id", "")
        groups_map[gid] = bins.get("name", "Unknown")
    gq.foreach(g_cb)

    query = client.query(NAMESPACE, "devices")
    def callback(record):
        nonlocal total, online, offline, warning, decommissioned
        _, _, bins = record
        total += 1

        status = bins.get("status", "")
        if status == "online":
            online += 1
        elif status == "offline":
            offline += 1
        elif status == "warning":
            warning += 1
        elif status == "decommissioned":
            decommissioned += 1

        dtype = bins.get("type", "unknown")
        by_type[dtype] = by_type.get(dtype, 0) + 1

        mt = bins.get("metric_type", "")
        if mt:
            by_metric_type[mt] = by_metric_type.get(mt, 0) + 1

        gid = bins.get("group_id", "")
        if gid and gid in groups_map:
            if gid not in group_data:
                group_data[gid] = {"id": gid, "name": groups_map[gid], "total": 0, "online": 0, "offline": 0, "warning": 0}
            group_data[gid]["total"] += 1
            if status == "online":
                group_data[gid]["online"] += 1
            elif status == "offline":
                group_data[gid]["offline"] += 1
            elif status == "warning":
                group_data[gid]["warning"] += 1

    query.foreach(callback)

    groups_list = sorted(group_data.values(), key=lambda g: g["total"], reverse=True)

    alerts_by_severity = {}
    unacknowledged = 0
    total_alerts = 0
    try:
        aq = client.query(NAMESPACE, "alerts")
        def alert_cb(record):
            nonlocal unacknowledged, total_alerts
            _, _, bins = record
            total_alerts += 1
            sev = bins.get("severity", "info")
            alerts_by_severity[sev] = alerts_by_severity.get(sev, 0) + 1
            if not bins.get("acknowledged", 0):
                unacknowledged += 1
        aq.foreach(alert_cb)
    except Exception:
        pass

    inv_total = 0
    inv_completed = 0
    inv_running = 0
    inv_failed = 0
    try:
        iq = client.query(NAMESPACE, "investigations")
        def inv_cb(record):
            nonlocal inv_total, inv_completed, inv_running, inv_failed
            _, _, bins = record
            inv_total += 1
            s = bins.get("status", "")
            if s == "completed":
                inv_completed += 1
            elif s == "running":
                inv_running += 1
            elif s == "failed":
                inv_failed += 1
        iq.foreach(inv_cb)
    except Exception:
        pass

    active_rules = 0
    total_rules = 0
    try:
        rq = client.query(NAMESPACE, "rules")
        def rule_cb(record):
            nonlocal active_rules, total_rules
            _, _, bins = record
            total_rules += 1
            if bins.get("enabled"):
                active_rules += 1
        rq.foreach(rule_cb)
    except Exception:
        pass

    active_simulations = 0
    try:
        sq = client.query(NAMESPACE, "simulations")
        def sim_cb(record):
            nonlocal active_simulations
            _, _, bins = record
            if bins.get("status") == "running":
                active_simulations += 1
        sq.foreach(sim_cb)
    except Exception:
        pass

    return DashboardStats(
        total=total,
        online=online,
        offline=offline,
        warning=warning,
        decommissioned=decommissioned,
        issues_count=offline + warning,
        by_type=by_type,
        by_metric_type=by_metric_type,
        groups=groups_list,
        alerts_summary={
            "total": total_alerts,
            "unacknowledged": unacknowledged,
            "by_severity": alerts_by_severity,
        },
        investigations_summary={
            "total": inv_total,
            "completed": inv_completed,
            "running": inv_running,
            "failed": inv_failed,
        },
        active_rules=active_rules,
        active_simulations=active_simulations,
    )
