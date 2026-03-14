"""Pre-built demo scenarios that can be triggered from the Admin UI.

Each scenario function switches the mode, clears the active namespace,
creates groups / devices / rules / simulations, and returns a step log.
"""

import json
import uuid
from datetime import datetime, timezone

from app.database import get_client, get_namespace, get_active_mode
from app.domain_config import CONFIG_NAMESPACE, CONFIG_SET, MODE_KEY, get_mode_config


def _now():
    return datetime.now(timezone.utc).isoformat()


def _set_mode(client, mode: str):
    client.put(
        (CONFIG_NAMESPACE, CONFIG_SET, MODE_KEY),
        {"value": mode, "updated_at": _now()},
    )


def _clear_all(client, namespace: str):
    sets = [
        "alerts", "telemetry", "rules", "simulations", "devices",
        "groups", "investigations", "agg_jobs", "agg_results",
    ]
    total = 0
    for s in sets:
        keys = []
        try:
            scan = client.scan(namespace, s)
            scan.foreach(lambda r, _keys=keys: _keys.append(r[0]))
        except Exception:
            continue
        for k in keys:
            try:
                client.remove(k)
                total += 1
            except Exception:
                pass
    return total


def _make_group(client, ns, name, description):
    gid = str(uuid.uuid4())
    client.put((ns, "groups", gid), {"id": gid, "name": name, "description": description})
    return gid


def _make_device(client, ns, *, name, dtype, status="online", group_id="",
                 metric_type="", redundancy_group="", latitude=0.0, longitude=0.0,
                 tags=None):
    did = str(uuid.uuid4())
    now = _now()
    bins = {
        "id": did,
        "name": name,
        "type": dtype,
        "status": status,
        "ip_address": "",
        "firmware_ver": "",
        "location": "",
        "group_id": group_id,
        "latitude": latitude,
        "longitude": longitude,
        "redun_group": redundancy_group,
        "metric_type": metric_type,
        "last_seen": now,
        "created_at": now,
        "tags": json.dumps(tags) if tags else "",
    }
    client.put((ns, "devices", did), bins)
    return did


def _make_rule(client, ns, *, name, scope, scope_id, metric, operator, threshold,
               severity):
    rid = str(uuid.uuid4())
    now = _now()
    bins = {
        "id": rid,
        "name": name,
        "scope": scope,
        "scope_id": scope_id,
        "metric": metric,
        "operator": operator,
        "threshold": float(threshold),
        "severity": severity,
        "enabled": 1,
        "created_at": now,
    }
    client.put((ns, "rules", rid), bins)
    return rid


def _apply_rule_template(client, ns, mode, template_id, scope, scope_id):
    cfg = get_mode_config(mode)
    tpl = next((t for t in cfg.get("rule_templates", []) if t["id"] == template_id), None)
    if not tpl:
        return 0
    now = _now()
    count = 0
    for rule_def in tpl["rules"]:
        rid = str(uuid.uuid4())
        bins = {
            "id": rid,
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
        client.put((ns, "rules", rid), bins)
        count += 1
    return count


def _make_simulation(client, ns, *, name, template, device_ids, group_ids=None,
                     interval=5, config=None):
    sid = str(uuid.uuid4())
    now = _now()
    bins = {
        "id": sid,
        "name": name,
        "template": template,
        "device_ids": json.dumps(device_ids),
        "group_ids": json.dumps(group_ids or []),
        "status": "running",
        "interval": interval,
        "config": json.dumps(config or {}),
        "created_at": now,
        "msgs_sent": 0,
        "cycle_count": 0,
    }
    client.put((ns, "simulations", sid), bins)
    return sid


# ============================================================================
# IoT Fleet Demo — Cold Storage HVAC Failure
# ============================================================================

def setup_iot_scenario() -> dict:
    """Create the full IoT Fleet HVAC Failure demo scenario."""
    steps = []
    client = get_client()

    # 1. Switch to IoT mode
    _set_mode(client, "iot")
    steps.append({"step": "Switch mode", "detail": "Set to IoT Fleet Management"})

    ns = "iotfleet"

    # 2. Clear data
    cleared = _clear_all(client, ns)
    steps.append({"step": "Clear data", "detail": f"Removed {cleared} records from {ns}"})

    # 3. Create groups
    csa = _make_group(client, ns, "Cold Storage A",
                      "Primary cold storage zone — HVAC-controlled environment with redundant sensors")
    srv = _make_group(client, ns, "Server Room",
                      "Indoor server room with climate monitoring")
    ld = _make_group(client, ns, "Loading Dock",
                     "Outdoor loading area with environmental sensors")
    fld = _make_group(client, ns, "Field Sensors",
                      "Remote outdoor sensor array (~1km away)")
    steps.append({"step": "Create groups", "detail": "Cold Storage A, Server Room, Loading Dock, Field Sensors"})

    # 4. Create devices
    def tag(zone, env, floor, **extra):
        t = {"zone": zone, "environment": env, "floor": floor}
        t.update(extra)
        return t

    # -- Cold Storage A (anomaly zone) --
    csa_ids = []
    csa_ids.append(_make_device(client, ns, name="TMP-CSA-01", dtype="sensor", group_id=csa,
        metric_type="temp", redundancy_group="csa-temp",
        latitude=37.77490, longitude=-122.41940,
        tags=tag("cold-storage-a", "indoor", "1", measures="temperature")))
    csa_ids.append(_make_device(client, ns, name="TMP-CSA-02", dtype="sensor", group_id=csa,
        metric_type="temp", redundancy_group="csa-temp",
        latitude=37.77491, longitude=-122.41930,
        tags=tag("cold-storage-a", "indoor", "1", measures="temperature")))
    csa_ids.append(_make_device(client, ns, name="HUM-CSA-01", dtype="sensor", group_id=csa,
        metric_type="humidity", redundancy_group="csa-humidity",
        latitude=37.77500, longitude=-122.41940,
        tags=tag("cold-storage-a", "indoor", "1", measures="humidity")))
    csa_ids.append(_make_device(client, ns, name="HUM-CSA-02", dtype="sensor", group_id=csa,
        metric_type="humidity", redundancy_group="csa-humidity",
        latitude=37.77501, longitude=-122.41930,
        tags=tag("cold-storage-a", "indoor", "1", measures="humidity")))
    csa_ids.append(_make_device(client, ns, name="PRS-CSA-01", dtype="sensor", group_id=csa,
        metric_type="pressure",
        latitude=37.77492, longitude=-122.41950,
        tags=tag("cold-storage-a", "indoor", "1", measures="pressure")))
    csa_ids.append(_make_device(client, ns, name="GW-CSA-01", dtype="gateway", group_id=csa,
        metric_type="cpu_usage",
        latitude=37.77510, longitude=-122.41940,
        tags=tag("cold-storage-a", "indoor", "1", role="edge-compute")))

    # -- Server Room --
    srv_ids = []
    srv_ids.append(_make_device(client, ns, name="TMP-SRV-01", dtype="sensor", group_id=srv,
        metric_type="temp", redundancy_group="srv-temp",
        latitude=37.77550, longitude=-122.41900,
        tags=tag("server-room", "indoor", "2", measures="temperature")))
    srv_ids.append(_make_device(client, ns, name="TMP-SRV-02", dtype="sensor", group_id=srv,
        metric_type="temp", redundancy_group="srv-temp",
        latitude=37.77551, longitude=-122.41890,
        tags=tag("server-room", "indoor", "2", measures="temperature")))
    srv_ids.append(_make_device(client, ns, name="HUM-SRV-01", dtype="sensor", group_id=srv,
        metric_type="humidity",
        latitude=37.77560, longitude=-122.41900,
        tags=tag("server-room", "indoor", "2", measures="humidity")))
    srv_ids.append(_make_device(client, ns, name="GW-SRV-01", dtype="gateway", group_id=srv,
        metric_type="mem_usage",
        latitude=37.77560, longitude=-122.41910,
        tags=tag("server-room", "indoor", "2", role="edge-compute")))

    # -- Loading Dock --
    ld_ids = []
    ld_ids.append(_make_device(client, ns, name="TMP-LD-01", dtype="sensor", group_id=ld,
        metric_type="temp",
        latitude=37.77600, longitude=-122.41850,
        tags=tag("loading-dock", "outdoor", "G", measures="temperature")))
    ld_ids.append(_make_device(client, ns, name="HUM-LD-01", dtype="sensor", group_id=ld,
        metric_type="humidity",
        latitude=37.77600, longitude=-122.41840,
        tags=tag("loading-dock", "outdoor", "G", measures="humidity")))
    ld_ids.append(_make_device(client, ns, name="PRS-LD-01", dtype="sensor", group_id=ld,
        metric_type="pressure",
        latitude=37.77610, longitude=-122.41850,
        tags=tag("loading-dock", "outdoor", "G", measures="pressure")))

    # -- Field Sensors --
    fld_ids = []
    fld_ids.append(_make_device(client, ns, name="TMP-FLD-01", dtype="sensor", group_id=fld,
        metric_type="temp",
        latitude=37.78000, longitude=-122.41000,
        tags=tag("field-north", "outdoor", "G", measures="temperature")))
    fld_ids.append(_make_device(client, ns, name="TMP-FLD-02", dtype="sensor", group_id=fld,
        metric_type="temp", redundancy_group="fld-temp",
        latitude=37.78001, longitude=-122.40990,
        tags=tag("field-north", "outdoor", "G", measures="temperature")))
    fld_ids.append(_make_device(client, ns, name="HUM-FLD-01", dtype="sensor", group_id=fld,
        metric_type="humidity",
        latitude=37.78010, longitude=-122.41000,
        tags=tag("field-north", "outdoor", "G", measures="humidity")))

    total_devices = len(csa_ids) + len(srv_ids) + len(ld_ids) + len(fld_ids)
    steps.append({"step": "Create devices", "detail": f"{total_devices} devices across 4 groups"})

    # 5. Alert rules on Cold Storage A
    rules_count = _apply_rule_template(client, ns, "iot", "anomaly_detection", "group", csa)
    _make_rule(client, ns, name="Extreme Temperature — Cold Storage", scope="group",
               scope_id=csa, metric="temp", operator="gt", threshold=45, severity="critical")
    _make_rule(client, ns, name="Abnormal Pressure Drop", scope="group",
               scope_id=csa, metric="pressure", operator="lt", threshold=970, severity="warning")
    rules_count += 2
    steps.append({"step": "Apply rules", "detail": f"{rules_count} rules on Cold Storage A"})

    # 6. Simulations
    _make_simulation(client, ns, name="Cold Storage A — Stress Test (HVAC Failure)",
                     template="stress", device_ids=csa_ids, group_ids=[csa],
                     interval=3, config={"intensity": 85})
    _make_simulation(client, ns, name="Server Room — Normal Baseline",
                     template="normal", device_ids=srv_ids, group_ids=[srv], interval=3)
    _make_simulation(client, ns, name="Loading Dock — Normal Baseline",
                     template="normal", device_ids=ld_ids, group_ids=[ld], interval=3)
    _make_simulation(client, ns, name="Field Sensors — Normal Baseline",
                     template="normal", device_ids=fld_ids, group_ids=[fld], interval=3)
    steps.append({"step": "Start simulations", "detail": "4 simulations (stress on CSA, normal on others)"})

    return {
        "scenario": "iot",
        "label": "IoT Fleet — Cold Storage HVAC Failure",
        "steps": steps,
        "summary": {
            "groups": 4,
            "devices": total_devices,
            "rules": rules_count,
            "simulations": 4,
        },
    }


# ============================================================================
# Security Operations — Network Threat Scenario
# ============================================================================

def setup_security_scenario() -> dict:
    """Create the full Security Operations demo scenario."""
    steps = []
    client = get_client()

    # 1. Switch to Security mode
    _set_mode(client, "security")
    steps.append({"step": "Switch mode", "detail": "Set to Security Operations Center"})

    ns = "secfleet"

    # 2. Clear data
    cleared = _clear_all(client, ns)
    steps.append({"step": "Clear data", "detail": f"Removed {cleared} records from {ns}"})

    # 3. Create security zones
    corp = _make_group(client, ns, "Corporate LAN",
                       "Internal corporate network — desktops, laptops, printers")
    dmz = _make_group(client, ns, "DMZ",
                      "Demilitarized zone — public-facing web servers and APIs")
    sf = _make_group(client, ns, "Server Farm",
                     "Production data center — application and database servers")
    vpn = _make_group(client, ns, "Remote VPN",
                      "Remote access VPN gateway and connected clients")
    steps.append({"step": "Create zones", "detail": "Corporate LAN, DMZ, Server Farm, Remote VPN"})

    # 4. Create endpoints
    def stag(zone, env, floor, segment, reports):
        return {"zone": zone, "environment": env, "floor": floor,
                "segment": segment, "reports": reports}

    # -- Corporate LAN --
    corp_ids = []
    corp_ws = []
    corp_ws.append(_make_device(client, ns, name="corp-ws-01", dtype="workstation", group_id=corp,
        metric_type="failed_logins", latitude=37.77490, longitude=-122.41940,
        tags=stag("corp-lan", "office", "2", "corp-lan", "failed_logins")))
    corp_ws.append(_make_device(client, ns, name="corp-ws-02", dtype="workstation", group_id=corp,
        metric_type="failed_logins", latitude=37.77491, longitude=-122.41935,
        tags=stag("corp-lan", "office", "2", "corp-lan", "failed_logins")))
    corp_ws.append(_make_device(client, ns, name="corp-ws-03", dtype="workstation", group_id=corp,
        metric_type="auth_failures", latitude=37.77492, longitude=-122.41930,
        tags=stag("corp-lan", "office", "2", "corp-lan", "auth_failures")))
    corp_ids.extend(corp_ws)
    corp_ids.append(_make_device(client, ns, name="corp-switch-01", dtype="switch", group_id=corp,
        metric_type="port_scans", latitude=37.77495, longitude=-122.41945,
        tags=stag("corp-lan", "office", "2", "corp-lan", "port_scans")))
    corp_ids.append(_make_device(client, ns, name="corp-fw-01", dtype="firewall", group_id=corp,
        metric_type="firewall_blocks", latitude=37.77498, longitude=-122.41950,
        tags=stag("corp-lan", "office", "2", "corp-lan", "firewall_blocks")))

    # -- DMZ --
    dmz_ids = []
    dmz_ids.append(_make_device(client, ns, name="dmz-web-01", dtype="server", group_id=dmz,
        metric_type="network_anomalies", latitude=37.77520, longitude=-122.41910,
        tags=stag("dmz", "datacenter", "1", "dmz", "network_anomalies")))
    dmz_ids.append(_make_device(client, ns, name="dmz-web-02", dtype="server", group_id=dmz,
        metric_type="network_anomalies", latitude=37.77522, longitude=-122.41905,
        tags=stag("dmz", "datacenter", "1", "dmz", "network_anomalies")))
    dmz_ids.append(_make_device(client, ns, name="dmz-api-01", dtype="server", group_id=dmz,
        metric_type="auth_failures", latitude=37.77525, longitude=-122.41915,
        tags=stag("dmz", "datacenter", "1", "dmz", "auth_failures")))
    dmz_ids.append(_make_device(client, ns, name="dmz-fw-01", dtype="firewall", group_id=dmz,
        metric_type="firewall_blocks", latitude=37.77528, longitude=-122.41920,
        tags=stag("dmz", "datacenter", "1", "dmz", "firewall_blocks")))

    # -- Server Farm --
    sf_ids = []
    sf_app_ids = []
    sf_ids.append(_make_device(client, ns, name="sf-db-01", dtype="server", group_id=sf,
        metric_type="cpu_usage", latitude=37.77550, longitude=-122.41880,
        tags=stag("server-farm", "datacenter", "1", "server-farm", "cpu_usage")))
    sf_ids.append(_make_device(client, ns, name="sf-db-02", dtype="server", group_id=sf,
        metric_type="mem_usage", latitude=37.77552, longitude=-122.41875,
        tags=stag("server-farm", "datacenter", "1", "server-farm", "mem_usage")))
    app1 = _make_device(client, ns, name="sf-app-01", dtype="server", group_id=sf,
        metric_type="data_transfer_mb", latitude=37.77555, longitude=-122.41870,
        tags=stag("server-farm", "datacenter", "1", "server-farm", "data_transfer_mb"))
    sf_ids.append(app1)
    sf_app_ids.append(app1)
    app2 = _make_device(client, ns, name="sf-app-02", dtype="server", group_id=sf,
        metric_type="data_transfer_mb", latitude=37.77558, longitude=-122.41865,
        tags=stag("server-farm", "datacenter", "1", "server-farm", "data_transfer_mb"))
    sf_ids.append(app2)
    sf_app_ids.append(app2)
    sf_ids.append(_make_device(client, ns, name="sf-fw-01", dtype="firewall", group_id=sf,
        metric_type="firewall_blocks", latitude=37.77560, longitude=-122.41885,
        tags=stag("server-farm", "datacenter", "1", "server-farm", "firewall_blocks")))

    # -- Remote VPN --
    vpn_ids = []
    vpn_ids.append(_make_device(client, ns, name="vpn-gw-01", dtype="router", group_id=vpn,
        metric_type="network_anomalies", latitude=37.78000, longitude=-122.41000,
        tags=stag("remote-vpn", "remote", "N/A", "remote-vpn", "network_anomalies")))
    vpn_ids.append(_make_device(client, ns, name="vpn-endpoint-01", dtype="endpoint", group_id=vpn,
        metric_type="failed_logins", latitude=37.78005, longitude=-122.40995,
        tags=stag("remote-vpn", "remote", "N/A", "remote-vpn", "failed_logins")))
    vpn_ids.append(_make_device(client, ns, name="vpn-endpoint-02", dtype="endpoint", group_id=vpn,
        metric_type="auth_failures", latitude=37.78010, longitude=-122.40990,
        tags=stag("remote-vpn", "remote", "N/A", "remote-vpn", "auth_failures")))

    all_ids = corp_ids + dmz_ids + sf_ids + vpn_ids
    total_devices = len(all_ids)
    steps.append({"step": "Create endpoints", "detail": f"{total_devices} endpoints across 4 zones"})

    # 5. Detection rules
    rules_count = 0
    rules_count += _apply_rule_template(client, ns, "security", "brute_force_detection", "group", corp)
    rules_count += _apply_rule_template(client, ns, "security", "intrusion_detection", "group", dmz)
    rules_count += _apply_rule_template(client, ns, "security", "malware_detection", "group", sf)
    rules_count += _apply_rule_template(client, ns, "security", "exfiltration_detection", "group", sf)
    rules_count += _apply_rule_template(client, ns, "security", "brute_force_detection", "group", vpn)
    steps.append({"step": "Apply rules", "detail": f"{rules_count} detection rules across zones"})

    # 6. Simulations
    _make_simulation(client, ns, name="Baseline Traffic",
                     template="normal", device_ids=all_ids, interval=5)
    _make_simulation(client, ns, name="Brute Force on Corporate LAN",
                     template="brute_force", device_ids=corp_ws,
                     interval=3, config={"intensity": 75})
    _make_simulation(client, ns, name="Data Exfiltration - Server Farm",
                     template="exfiltration", device_ids=sf_app_ids,
                     interval=4, config={"volume_mb": 800})
    steps.append({"step": "Start simulations", "detail": "3 simulations (baseline, brute force, exfiltration)"})

    return {
        "scenario": "security",
        "label": "Security Ops — Network Threat Scenario",
        "steps": steps,
        "summary": {
            "groups": 4,
            "devices": total_devices,
            "rules": rules_count,
            "simulations": 3,
        },
    }
