import asyncio
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import get_client, get_namespace
from app.routers import devices, groups, dashboard, alerts, admin, aggregations, rules, investigations

app = FastAPI(title="IoT Fleet Manager API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices.router, prefix="/api")
app.include_router(groups.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(aggregations.router, prefix="/api")
app.include_router(rules.router, prefix="/api")
app.include_router(investigations.router, prefix="/api")

OFFLINE_THRESHOLD_SECS = 120
ONLINE_THRESHOLD_SECS = 60


async def device_health_monitor():
    """Periodically check device last_seen and update statuses."""
    await asyncio.sleep(10)
    while True:
        try:
            client = get_client()
            now = datetime.now(timezone.utc)
            query = client.query(get_namespace(), "devices")
            records = []
            query.foreach(lambda r: records.append(r))

            for _, meta, bins in records:
                status = bins.get("status", "")
                if status == "decommissioned":
                    continue

                last_seen = bins.get("last_seen", "")
                if not last_seen:
                    continue

                try:
                    age = (now - datetime.fromisoformat(last_seen)).total_seconds()
                except Exception:
                    continue

                device_id = bins.get("id", "")
                if not device_id:
                    continue

                key = (get_namespace(), "devices", device_id)
                if status in ("online", "warning") and age > OFFLINE_THRESHOLD_SECS:
                    client.put(key, {"status": "offline"})
                elif status == "offline" and age < ONLINE_THRESHOLD_SECS:
                    client.put(key, {"status": "online"})
        except Exception:
            pass

        await asyncio.sleep(30)


async def aggregation_worker():
    """Periodically compute aggregation results for enabled jobs."""
    await asyncio.sleep(15)
    while True:
        try:
            client = get_client()
            now = datetime.now(timezone.utc)

            # Load all enabled jobs
            jobs = []
            query = client.query(get_namespace(), "agg_jobs")
            query.foreach(lambda r: jobs.append(r[2]))
            enabled_jobs = [j for j in jobs if j.get("enabled", 0)]

            for job in enabled_jobs:
                job_id = job["id"]
                group_id = job["group_id"]
                metric = job["metric"]
                func = job["function"]
                level = job["level"]
                window = job.get("window_secs", 3600)
                job_name = job.get("name", "")

                cutoff = (now - __import__("datetime").timedelta(seconds=window)).isoformat()

                # Find devices in this group
                dev_query = client.query(get_namespace(), "devices")
                device_ids = []
                dev_query.foreach(lambda r: device_ids.append(r[2]["id"]) if r[2].get("group_id") == group_id and r[2].get("status") != "decommissioned" else None)

                if not device_ids:
                    continue

                # Fetch telemetry within window for these devices
                device_values = {}
                telem_query = client.query(get_namespace(), "telemetry")
                all_values = []

                def collect(record):
                    _, _, bins = record
                    did = bins.get("device_id", "")
                    ts = bins.get("timestamp", "")
                    rec_metric = bins.get("metric", "")
                    if did in device_ids and ts >= cutoff and rec_metric == metric:
                        val = bins.get("value")
                        if val is not None:
                            try:
                                v = float(val)
                                all_values.append(v)
                                if did not in device_values:
                                    device_values[did] = []
                                device_values[did].append(v)
                            except (ValueError, TypeError):
                                pass

                telem_query.foreach(collect)

                def compute(values):
                    if not values:
                        return None, 0
                    n = len(values)
                    if func == "avg":
                        return round(sum(values) / n, 2), n
                    elif func == "min":
                        return round(min(values), 2), n
                    elif func == "max":
                        return round(max(values), 2), n
                    elif func == "sum":
                        return round(sum(values), 2), n
                    elif func == "count":
                        return n, n
                    return None, 0

                ts_now = now.isoformat()

                if level == "group":
                    value, count = compute(all_values)
                    result_key = f"agg:{job_id}:group"
                    client.put((get_namespace(), "agg_results", result_key), {
                        "job_id": job_id,
                        "job_name": job_name,
                        "group_id": group_id,
                        "device_id": "",
                        "metric": metric,
                        "function": func,
                        "level": "group",
                        "value": value,
                        "sample_count": count,
                        "window_secs": window,
                        "computed_at": ts_now,
                    })
                elif level == "device":
                    for did, vals in device_values.items():
                        value, count = compute(vals)
                        result_key = f"agg:{job_id}:{did}"
                        client.put((get_namespace(), "agg_results", result_key), {
                            "job_id": job_id,
                            "job_name": job_name,
                            "group_id": group_id,
                            "device_id": did,
                            "metric": metric,
                            "function": func,
                            "level": "device",
                            "value": value,
                            "sample_count": count,
                            "window_secs": window,
                            "computed_at": ts_now,
                        })

        except Exception as e:
            print(f"Aggregation worker error: {e}")

        await asyncio.sleep(30)


@app.on_event("startup")
async def startup():
    get_client()
    asyncio.create_task(device_health_monitor())
    asyncio.create_task(aggregation_worker())


@app.get("/health")
async def health():
    try:
        client = get_client()
        client.is_connected()
        return {"status": "healthy"}
    except Exception:
        return {"status": "unhealthy"}
