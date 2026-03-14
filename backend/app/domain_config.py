"""Per-showcase-mode configuration for IoT Fleet and Network Security domains."""

CONFIG_NAMESPACE = "iotfleet"
CONFIG_SET = "config"
MODE_KEY = "showcase_mode"

NAMESPACES = {
    "iot": "iotfleet",
    "security": "secfleet",
}

MODES = {
    "iot": {
        "namespace": "iotfleet",
        "label": "IoT Fleet Manager",
        "subtitle": "Control Panel",
        "accent": "indigo",
        "entity_labels": {
            "device": "Device",
            "devices": "Devices",
            "group": "Group",
            "groups": "Groups",
            "alert": "Alert",
            "alerts": "Alerts",
            "telemetry": "Telemetry",
            "investigation": "Investigation",
            "investigations": "Investigations",
            "simulation": "Simulation",
            "simulations": "Simulations",
            "rule": "Rule",
            "rules": "Rules",
        },
        "device_types": ["sensor", "gateway", "actuator", "camera", "controller"],
        "metrics": [
            {"key": "temp", "label": "Temperature", "unit": "°C"},
            {"key": "humidity", "label": "Humidity", "unit": "%"},
            {"key": "pressure", "label": "Pressure", "unit": "hPa"},
            {"key": "battery_pct", "label": "Battery", "unit": "%"},
            {"key": "cpu_usage", "label": "CPU Usage", "unit": "%"},
            {"key": "mem_usage", "label": "Memory Usage", "unit": "%"},
            {"key": "storage_pct", "label": "Storage", "unit": "%"},
            {"key": "fps", "label": "FPS", "unit": ""},
            {"key": "uplink_kbps", "label": "Uplink", "unit": "kbps"},
            {"key": "noise_db", "label": "Noise Level", "unit": "dB"},
            {"key": "vibration", "label": "Vibration", "unit": "g"},
            {"key": "lux", "label": "Illuminance", "unit": "lux"},
        ],
        "simulation_templates": [
            {
                "id": "normal",
                "name": "Normal",
                "description": "Standard telemetry within expected operating ranges",
                "icon": "chart",
                "color": "blue",
                "options": [],
            },
            {
                "id": "anomaly",
                "name": "Anomaly Injection",
                "description": "Injects random anomalies like temperature spikes, battery drops, and metric drifts",
                "icon": "warning",
                "color": "amber",
                "options": [
                    {"key": "anomaly_rate", "label": "Anomaly Rate (%)", "type": "number", "default": 15, "min": 1, "max": 50},
                ],
            },
            {
                "id": "stress",
                "name": "Stress Test",
                "description": "Pushes all metrics to near-critical levels to test alerting thresholds",
                "icon": "bolt",
                "color": "red",
                "options": [
                    {"key": "intensity", "label": "Intensity (%)", "type": "number", "default": 80, "min": 50, "max": 100},
                ],
            },
            {
                "id": "degradation",
                "name": "Gradual Degradation",
                "description": "Simulates device aging with slowly worsening metrics over time",
                "icon": "trending_down",
                "color": "orange",
                "options": [
                    {"key": "degrade_rate", "label": "Degradation Speed", "type": "number", "default": 5, "min": 1, "max": 20},
                ],
            },
            {
                "id": "intermittent",
                "name": "Intermittent Connectivity",
                "description": "Devices randomly drop offline and reconnect, simulating network issues",
                "icon": "wifi_off",
                "color": "purple",
                "options": [
                    {"key": "offline_pct", "label": "Offline Chance (%)", "type": "number", "default": 20, "min": 5, "max": 50},
                ],
            },
        ],
        "rule_templates": [
            {
                "id": "anomaly_detection",
                "name": "Standard Anomaly Detection",
                "description": "Monitors temperature, humidity, battery, and CPU with warning and critical thresholds",
                "icon": "warning",
                "rules": [
                    {"metric": "temp", "operator": "gt", "threshold": 40, "severity": "warning", "name": "High Temperature (Warning)"},
                    {"metric": "temp", "operator": "gt", "threshold": 48, "severity": "critical", "name": "High Temperature (Critical)"},
                    {"metric": "temp", "operator": "lt", "threshold": 5, "severity": "warning", "name": "Low Temperature (Warning)"},
                    {"metric": "temp", "operator": "lt", "threshold": 0, "severity": "critical", "name": "Low Temperature (Critical)"},
                    {"metric": "humidity", "operator": "gt", "threshold": 85, "severity": "warning", "name": "High Humidity"},
                    {"metric": "humidity", "operator": "gt", "threshold": 95, "severity": "critical", "name": "Critical Humidity"},
                    {"metric": "battery_pct", "operator": "lt", "threshold": 15, "severity": "warning", "name": "Low Battery (Warning)"},
                    {"metric": "battery_pct", "operator": "lt", "threshold": 5, "severity": "critical", "name": "Low Battery (Critical)"},
                    {"metric": "cpu_usage", "operator": "gt", "threshold": 85, "severity": "warning", "name": "High CPU (Warning)"},
                    {"metric": "cpu_usage", "operator": "gt", "threshold": 95, "severity": "critical", "name": "High CPU (Critical)"},
                ],
            },
            {
                "id": "resource_monitoring",
                "name": "Resource Monitoring",
                "description": "Tracks CPU, memory, and storage utilization thresholds",
                "icon": "server",
                "rules": [
                    {"metric": "cpu_usage", "operator": "gt", "threshold": 80, "severity": "warning", "name": "CPU > 80%"},
                    {"metric": "cpu_usage", "operator": "gt", "threshold": 95, "severity": "critical", "name": "CPU > 95%"},
                    {"metric": "mem_usage", "operator": "gt", "threshold": 80, "severity": "warning", "name": "Memory > 80%"},
                    {"metric": "mem_usage", "operator": "gt", "threshold": 90, "severity": "critical", "name": "Memory > 90%"},
                    {"metric": "storage_pct", "operator": "gt", "threshold": 85, "severity": "warning", "name": "Storage > 85%"},
                    {"metric": "storage_pct", "operator": "gt", "threshold": 95, "severity": "critical", "name": "Storage > 95%"},
                ],
            },
            {
                "id": "battery_watch",
                "name": "Battery Watch",
                "description": "Alerts when device battery drops below safe levels",
                "icon": "battery",
                "rules": [
                    {"metric": "battery_pct", "operator": "lt", "threshold": 20, "severity": "warning", "name": "Battery < 20%"},
                    {"metric": "battery_pct", "operator": "lt", "threshold": 10, "severity": "critical", "name": "Battery < 10%"},
                    {"metric": "battery_pct", "operator": "lt", "threshold": 5, "severity": "critical", "name": "Battery Critical < 5%"},
                ],
            },
            {
                "id": "temperature_bounds",
                "name": "Temperature Bounds",
                "description": "Strict temperature monitoring for sensitive environments",
                "icon": "thermometer",
                "rules": [
                    {"metric": "temp", "operator": "gt", "threshold": 35, "severity": "warning", "name": "Temp > 35°C"},
                    {"metric": "temp", "operator": "gt", "threshold": 45, "severity": "critical", "name": "Temp > 45°C"},
                    {"metric": "temp", "operator": "lt", "threshold": 5, "severity": "warning", "name": "Temp < 5°C"},
                    {"metric": "temp", "operator": "lt", "threshold": 0, "severity": "critical", "name": "Temp < 0°C"},
                ],
            },
            {
                "id": "connectivity",
                "name": "Connectivity & Performance",
                "description": "Monitors uplink speed and camera FPS for performance issues",
                "icon": "signal",
                "rules": [
                    {"metric": "uplink_kbps", "operator": "lt", "threshold": 100, "severity": "warning", "name": "Low Uplink < 100 kbps"},
                    {"metric": "uplink_kbps", "operator": "lt", "threshold": 10, "severity": "critical", "name": "Uplink Critical < 10 kbps"},
                    {"metric": "fps", "operator": "lt", "threshold": 10, "severity": "warning", "name": "Low FPS < 10"},
                    {"metric": "fps", "operator": "lt", "threshold": 5, "severity": "critical", "name": "FPS Critical < 5"},
                ],
            },
        ],
        "agent_role": "SENIOR IOT SYSTEMS ENGINEER",
        "agent_context_title": "IOT ANOMALY INVESTIGATION CONTEXT",
        "agent_investigation_noun": "anomaly",
    },

    # -----------------------------------------------------------------------
    # SECURITY MODE
    # -----------------------------------------------------------------------
    "security": {
        "namespace": "secfleet",
        "label": "Security Operations Center",
        "subtitle": "Threat Dashboard",
        "accent": "red",
        "entity_labels": {
            "device": "Endpoint",
            "devices": "Endpoints",
            "group": "Security Zone",
            "groups": "Security Zones",
            "alert": "Incident",
            "alerts": "Incidents",
            "telemetry": "Events",
            "investigation": "Threat Investigation",
            "investigations": "Threat Investigations",
            "simulation": "Attack Simulation",
            "simulations": "Attack Simulations",
            "rule": "Detection Rule",
            "rules": "Detection Rules",
        },
        "device_types": ["server", "workstation", "firewall", "router", "switch", "endpoint"],
        "metrics": [
            {"key": "failed_logins", "label": "Failed Logins", "unit": "/min"},
            {"key": "network_anomalies", "label": "Network Anomaly Score", "unit": ""},
            {"key": "port_scans", "label": "Port Scans", "unit": "/min"},
            {"key": "malware_detections", "label": "Malware Detections", "unit": ""},
            {"key": "firewall_blocks", "label": "Firewall Blocks", "unit": "/min"},
            {"key": "auth_failures", "label": "Auth Failures", "unit": "/min"},
            {"key": "data_transfer_mb", "label": "Data Transfer", "unit": "MB/min"},
            {"key": "cpu_usage", "label": "CPU Usage", "unit": "%"},
            {"key": "mem_usage", "label": "Memory Usage", "unit": "%"},
        ],
        "simulation_templates": [
            {
                "id": "normal",
                "name": "Normal Traffic",
                "description": "Baseline network traffic with low security event counts",
                "icon": "chart",
                "color": "blue",
                "options": [],
            },
            {
                "id": "brute_force",
                "name": "Brute Force Attack",
                "description": "Simulates credential stuffing with high failed login and auth failure rates",
                "icon": "warning",
                "color": "amber",
                "options": [
                    {"key": "intensity", "label": "Attack Intensity (%)", "type": "number", "default": 70, "min": 30, "max": 100},
                ],
            },
            {
                "id": "port_scan",
                "name": "Port Scan Attack",
                "description": "Simulates network reconnaissance with elevated port scan counts",
                "icon": "bolt",
                "color": "red",
                "options": [
                    {"key": "intensity", "label": "Scan Intensity (%)", "type": "number", "default": 60, "min": 20, "max": 100},
                ],
            },
            {
                "id": "malware",
                "name": "Malware Outbreak",
                "description": "Simulates malware propagation across endpoints with detections and CPU spikes",
                "icon": "bug",
                "color": "red",
                "options": [
                    {"key": "spread_rate", "label": "Spread Rate (%)", "type": "number", "default": 40, "min": 10, "max": 80},
                ],
            },
            {
                "id": "exfiltration",
                "name": "Data Exfiltration",
                "description": "Simulates data theft with abnormally high outbound data transfer",
                "icon": "upload",
                "color": "orange",
                "options": [
                    {"key": "volume_mb", "label": "Transfer Volume (MB/min)", "type": "number", "default": 500, "min": 100, "max": 2000},
                ],
            },
            {
                "id": "ddos",
                "name": "DDoS Attack",
                "description": "Simulates distributed denial-of-service with high firewall blocks and network anomaly scores",
                "icon": "flood",
                "color": "purple",
                "options": [
                    {"key": "intensity", "label": "Attack Intensity (%)", "type": "number", "default": 80, "min": 40, "max": 100},
                ],
            },
        ],
        "rule_templates": [
            {
                "id": "brute_force_detection",
                "name": "Brute Force Detection",
                "description": "Detects credential attacks via failed login and auth failure spikes",
                "icon": "warning",
                "rules": [
                    {"metric": "failed_logins", "operator": "gt", "threshold": 10, "severity": "warning", "name": "Elevated Failed Logins"},
                    {"metric": "failed_logins", "operator": "gt", "threshold": 50, "severity": "critical", "name": "Brute Force Detected"},
                    {"metric": "auth_failures", "operator": "gt", "threshold": 15, "severity": "warning", "name": "Auth Failure Spike"},
                    {"metric": "auth_failures", "operator": "gt", "threshold": 50, "severity": "critical", "name": "Credential Attack"},
                ],
            },
            {
                "id": "intrusion_detection",
                "name": "Intrusion Detection",
                "description": "Detects network reconnaissance and anomalous activity",
                "icon": "shield",
                "rules": [
                    {"metric": "port_scans", "operator": "gt", "threshold": 5, "severity": "warning", "name": "Port Scan Activity"},
                    {"metric": "port_scans", "operator": "gt", "threshold": 20, "severity": "critical", "name": "Active Reconnaissance"},
                    {"metric": "network_anomalies", "operator": "gt", "threshold": 40, "severity": "warning", "name": "Network Anomaly"},
                    {"metric": "network_anomalies", "operator": "gt", "threshold": 75, "severity": "critical", "name": "Critical Network Anomaly"},
                    {"metric": "firewall_blocks", "operator": "gt", "threshold": 100, "severity": "warning", "name": "Elevated Firewall Blocks"},
                    {"metric": "firewall_blocks", "operator": "gt", "threshold": 500, "severity": "critical", "name": "Possible DDoS"},
                ],
            },
            {
                "id": "malware_detection",
                "name": "Malware Detection",
                "description": "Alerts on malware detections and associated CPU spikes",
                "icon": "bug",
                "rules": [
                    {"metric": "malware_detections", "operator": "gt", "threshold": 0, "severity": "critical", "name": "Malware Detected"},
                    {"metric": "cpu_usage", "operator": "gt", "threshold": 90, "severity": "warning", "name": "Suspicious CPU Spike"},
                ],
            },
            {
                "id": "exfiltration_detection",
                "name": "Data Exfiltration Detection",
                "description": "Detects abnormal outbound data transfer indicative of data theft",
                "icon": "upload",
                "rules": [
                    {"metric": "data_transfer_mb", "operator": "gt", "threshold": 200, "severity": "warning", "name": "High Data Transfer"},
                    {"metric": "data_transfer_mb", "operator": "gt", "threshold": 500, "severity": "critical", "name": "Possible Exfiltration"},
                ],
            },
        ],
        "agent_role": "SENIOR SECURITY ANALYST",
        "agent_context_title": "SECURITY EVENT INVESTIGATION CONTEXT",
        "agent_investigation_noun": "security incident",
    },
}

DEFAULT_MODE = "iot"


def get_mode_config(mode: str) -> dict:
    return MODES.get(mode, MODES[DEFAULT_MODE])
