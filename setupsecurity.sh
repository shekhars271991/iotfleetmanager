#!/usr/bin/env bash
# setupsecurity.sh — Set up a Network Security demo scenario
# Prerequisites: backend running on port 4000, Aerospike running
set -euo pipefail

API="http://localhost:4000/api"

echo "=== Network Security Demo Setup ==="

# 1. Switch to security mode
echo ">> Switching to security mode..."
curl -sf -X PUT "$API/admin/showcase-mode" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"security"}' | jq .

sleep 1

# 2. Clear any existing security-mode data
echo ">> Clearing existing data..."
curl -sf -X POST "$API/admin/clear-data" \
  -H 'Content-Type: application/json' \
  -d '{"sets":["alerts","telemetry","rules","simulations","devices","groups","investigations","agg_jobs","agg_results"]}' | jq .

sleep 1

# 3. Create Security Zones (groups)
echo ">> Creating Security Zones..."
CORP_LAN=$(curl -sf -X POST "$API/groups" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Corporate LAN","description":"Internal corporate network — desktops, laptops, printers"}' | jq -r '.id')
echo "   Corporate LAN: $CORP_LAN"

DMZ=$(curl -sf -X POST "$API/groups" \
  -H 'Content-Type: application/json' \
  -d '{"name":"DMZ","description":"Demilitarized zone — public-facing web servers and APIs"}' | jq -r '.id')
echo "   DMZ: $DMZ"

SERVER_FARM=$(curl -sf -X POST "$API/groups" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Server Farm","description":"Production data center — application and database servers"}' | jq -r '.id')
echo "   Server Farm: $SERVER_FARM"

REMOTE_VPN=$(curl -sf -X POST "$API/groups" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Remote VPN","description":"Remote access VPN gateway and connected clients"}' | jq -r '.id')
echo "   Remote VPN: $REMOTE_VPN"

sleep 1

# 4. Create Endpoints (devices) in each zone
echo ">> Creating endpoints..."

create_device() {
  local name="$1" type="$2" group="$3" metric="$4"
  local id
  id=$(curl -sf -X POST "$API/devices" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"$name\",\"type\":\"$type\",\"group_id\":\"$group\",\"metric_type\":\"$metric\"}" | jq -r '.id')
  echo "   $name ($type, $metric): $id"
  echo "$id"
}

# Corporate LAN endpoints
CORP_WS1=$(create_device "corp-ws-01" "workstation" "$CORP_LAN" "failed_logins")
CORP_WS2=$(create_device "corp-ws-02" "workstation" "$CORP_LAN" "failed_logins")
CORP_WS3=$(create_device "corp-ws-03" "workstation" "$CORP_LAN" "auth_failures")
CORP_SW1=$(create_device "corp-switch-01" "switch" "$CORP_LAN" "port_scans")
CORP_FW1=$(create_device "corp-fw-01" "firewall" "$CORP_LAN" "firewall_blocks")

# DMZ endpoints
DMZ_WEB1=$(create_device "dmz-web-01" "server" "$DMZ" "network_anomalies")
DMZ_WEB2=$(create_device "dmz-web-02" "server" "$DMZ" "network_anomalies")
DMZ_API1=$(create_device "dmz-api-01" "server" "$DMZ" "auth_failures")
DMZ_FW1=$(create_device "dmz-fw-01" "firewall" "$DMZ" "firewall_blocks")

# Server Farm endpoints
SF_DB1=$(create_device "sf-db-01" "server" "$SERVER_FARM" "cpu_usage")
SF_DB2=$(create_device "sf-db-02" "server" "$SERVER_FARM" "mem_usage")
SF_APP1=$(create_device "sf-app-01" "server" "$SERVER_FARM" "data_transfer_mb")
SF_APP2=$(create_device "sf-app-02" "server" "$SERVER_FARM" "data_transfer_mb")
SF_FW1=$(create_device "sf-fw-01" "firewall" "$SERVER_FARM" "firewall_blocks")

# Remote VPN endpoints
VPN_GW1=$(create_device "vpn-gw-01" "router" "$REMOTE_VPN" "network_anomalies")
VPN_EP1=$(create_device "vpn-endpoint-01" "endpoint" "$REMOTE_VPN" "failed_logins")
VPN_EP2=$(create_device "vpn-endpoint-02" "endpoint" "$REMOTE_VPN" "auth_failures")

sleep 1

# 5. Seed device metadata (lat/lng, tags, redundancy groups)
echo ">> Seeding endpoint metadata..."
curl -sf -X POST "$API/admin/seed-device-metadata" | jq .

sleep 1

# 6. Apply detection rules
echo ">> Applying detection rules..."

# Brute Force Detection on Corporate LAN
curl -sf -X POST "$API/rules/apply-template" \
  -H 'Content-Type: application/json' \
  -d "{\"template_id\":\"brute_force_detection\",\"scope\":\"group\",\"scope_id\":\"$CORP_LAN\"}" | jq length
echo "   Brute Force Detection → Corporate LAN"

# Intrusion Detection on DMZ
curl -sf -X POST "$API/rules/apply-template" \
  -H 'Content-Type: application/json' \
  -d "{\"template_id\":\"intrusion_detection\",\"scope\":\"group\",\"scope_id\":\"$DMZ\"}" | jq length
echo "   Intrusion Detection → DMZ"

# Malware Detection on Server Farm
curl -sf -X POST "$API/rules/apply-template" \
  -H 'Content-Type: application/json' \
  -d "{\"template_id\":\"malware_detection\",\"scope\":\"group\",\"scope_id\":\"$SERVER_FARM\"}" | jq length
echo "   Malware Detection → Server Farm"

# Exfiltration Detection on Server Farm
curl -sf -X POST "$API/rules/apply-template" \
  -H 'Content-Type: application/json' \
  -d "{\"template_id\":\"exfiltration_detection\",\"scope\":\"group\",\"scope_id\":\"$SERVER_FARM\"}" | jq length
echo "   Exfiltration Detection → Server Farm"

# Brute Force Detection on Remote VPN
curl -sf -X POST "$API/rules/apply-template" \
  -H 'Content-Type: application/json' \
  -d "{\"template_id\":\"brute_force_detection\",\"scope\":\"group\",\"scope_id\":\"$REMOTE_VPN\"}" | jq length
echo "   Brute Force Detection → Remote VPN"

sleep 1

# 7. Start attack simulations

# Normal baseline traffic for all zones first
echo ">> Starting normal baseline traffic..."
ALL_DEVICE_IDS=$(echo "$CORP_WS1 $CORP_WS2 $CORP_WS3 $CORP_SW1 $CORP_FW1 $DMZ_WEB1 $DMZ_WEB2 $DMZ_API1 $DMZ_FW1 $SF_DB1 $SF_DB2 $SF_APP1 $SF_APP2 $SF_FW1 $VPN_GW1 $VPN_EP1 $VPN_EP2" | tr ' ' '\n' | jq -R . | jq -s .)
curl -sf -X POST "$API/admin/simulations" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Baseline Traffic\",\"template\":\"normal\",\"device_ids\":$ALL_DEVICE_IDS,\"interval\":5}" | jq '{id:.id, name:.name, status:.status}'

# Brute force attack on Corporate LAN
echo ">> Starting brute force attack on Corporate LAN..."
CORP_IDS=$(echo "$CORP_WS1 $CORP_WS2 $CORP_WS3" | tr ' ' '\n' | jq -R . | jq -s .)
curl -sf -X POST "$API/admin/simulations" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Brute Force on Corporate LAN\",\"template\":\"brute_force\",\"device_ids\":$CORP_IDS,\"interval\":3,\"config\":{\"intensity\":75}}" | jq '{id:.id, name:.name, status:.status}'

# Data exfiltration from Server Farm
echo ">> Starting data exfiltration from Server Farm..."
SF_IDS=$(echo "$SF_APP1 $SF_APP2" | tr ' ' '\n' | jq -R . | jq -s .)
curl -sf -X POST "$API/admin/simulations" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Data Exfiltration - Server Farm\",\"template\":\"exfiltration\",\"device_ids\":$SF_IDS,\"interval\":4,\"config\":{\"volume_mb\":800}}" | jq '{id:.id, name:.name, status:.status}'

echo ""
echo "=== Security Demo Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Wait ~30 seconds for telemetry data and alerts to accumulate"
echo "  2. Go to the Incidents page to see triggered detection rules"
echo "  3. Click 'AI Investigate' on a critical incident to analyze the threat"
echo "  4. The AI agent will correlate events across endpoints and security zones"
echo ""
