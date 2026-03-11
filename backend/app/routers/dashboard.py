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
    group_data = {}

    # Collect all groups first
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

    return DashboardStats(
        total=total,
        online=online,
        offline=offline,
        warning=warning,
        decommissioned=decommissioned,
        issues_count=offline + warning,
        by_type=by_type,
        groups=groups_list,
    )
