#!/usr/bin/env bash
set -euo pipefail

# ===========================================================================
# AI Investigation Demo: Cold Storage HVAC Failure
#
# Creates a scenario where anomaly injection across correlated sensors in
# "Cold Storage A" gives the AI agent rich data to uncover non-obvious
# inferences (redundancy confirmation, cross-metric correlation, spatial
# localization) that a human would miss from a single temperature alert.
#
# Usage:  ./setuptestcase.sh [--backend-url=URL]
# ===========================================================================

API="${1:-http://localhost:4000}"
for arg in "$@"; do
  case "$arg" in
    --backend-url=*) API="${arg#*=}" ;;
  esac
done

# -- Helpers ----------------------------------------------------------------

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

step()  { echo -e "\n${CYAN}${BOLD}==> $1${NC}"; }
ok()    { echo -e "    ${GREEN}✓${NC} $1"; }
warn()  { echo -e "    ${YELLOW}⚠${NC} $1"; }
fail()  { echo -e "    ${RED}✗ $1${NC}"; exit 1; }

post() { curl -sf -X POST "$API$1" -H 'Content-Type: application/json' -d "$2"; }
get()  { curl -sf "$API$1"; }

# -- Preflight check --------------------------------------------------------

step "Checking backend at $API"
if ! curl -sf "$API/health" > /dev/null 2>&1; then
  fail "Backend not reachable at $API. Is dev.sh running?"
fi
ok "Backend is healthy"

# ===========================================================================
# Step 1: Clear all existing data
# ===========================================================================

step "Clearing all existing data"
CLEAR_RESULT=$(post "/api/admin/clear-data" '{
  "sets": ["alerts","telemetry","rules","simulations","devices","groups",
           "investigations","agg_jobs","agg_results"]
}')
ok "Cleared: $(echo "$CLEAR_RESULT" | jq -c '.cleared')"

sleep 1

# ===========================================================================
# Step 2: Create device groups
# ===========================================================================

step "Creating device groups"

CSA_GROUP=$(post "/api/groups" '{"name":"Cold Storage A","description":"Primary cold storage zone — HVAC-controlled environment with redundant sensors"}' | jq -r '.id')
ok "Cold Storage A  -> $CSA_GROUP"

SRV_GROUP=$(post "/api/groups" '{"name":"Server Room","description":"Indoor server room with climate monitoring"}' | jq -r '.id')
ok "Server Room     -> $SRV_GROUP"

LD_GROUP=$(post "/api/groups" '{"name":"Loading Dock","description":"Outdoor loading area with environmental sensors"}' | jq -r '.id')
ok "Loading Dock    -> $LD_GROUP"

FLD_GROUP=$(post "/api/groups" '{"name":"Field Sensors","description":"Remote outdoor sensor array (~1km away)"}' | jq -r '.id')
ok "Field Sensors   -> $FLD_GROUP"

# ===========================================================================
# Step 3: Create devices with meaningful metadata
# ===========================================================================

step "Creating devices — Cold Storage A (anomaly zone)"

create_device() {
  local result
  result=$(post "/api/devices" "$1")
  echo "$result" | jq -r '.id'
}

# Cold Storage A — 6 devices: 2 temp (redundant), 2 humidity (redundant), 1 pressure, 1 gateway
CSA_DEV_IDS=()

id=$(create_device "{
  \"name\":\"TMP-CSA-01\",\"type\":\"sensor\",\"status\":\"online\",
  \"group_id\":\"$CSA_GROUP\",\"metric_type\":\"temp\",
  \"redundancy_group\":\"csa-temp\",
  \"latitude\":37.77490,\"longitude\":-122.41940,
  \"tags\":{\"zone\":\"cold-storage-a\",\"environment\":\"indoor\",\"floor\":\"1\",\"measures\":\"temperature\"}
}")
ok "TMP-CSA-01 (temp, redundancy: csa-temp)    -> $id"
CSA_DEV_IDS+=("$id")

id=$(create_device "{
  \"name\":\"TMP-CSA-02\",\"type\":\"sensor\",\"status\":\"online\",
  \"group_id\":\"$CSA_GROUP\",\"metric_type\":\"temp\",
  \"redundancy_group\":\"csa-temp\",
  \"latitude\":37.77491,\"longitude\":-122.41930,
  \"tags\":{\"zone\":\"cold-storage-a\",\"environment\":\"indoor\",\"floor\":\"1\",\"measures\":\"temperature\"}
}")
ok "TMP-CSA-02 (temp, redundancy: csa-temp)    -> $id"
CSA_DEV_IDS+=("$id")

id=$(create_device "{
  \"name\":\"HUM-CSA-01\",\"type\":\"sensor\",\"status\":\"online\",
  \"group_id\":\"$CSA_GROUP\",\"metric_type\":\"humidity\",
  \"redundancy_group\":\"csa-humidity\",
  \"latitude\":37.77500,\"longitude\":-122.41940,
  \"tags\":{\"zone\":\"cold-storage-a\",\"environment\":\"indoor\",\"floor\":\"1\",\"measures\":\"humidity\"}
}")
ok "HUM-CSA-01 (humidity, redundancy: csa-hum) -> $id"
CSA_DEV_IDS+=("$id")

id=$(create_device "{
  \"name\":\"HUM-CSA-02\",\"type\":\"sensor\",\"status\":\"online\",
  \"group_id\":\"$CSA_GROUP\",\"metric_type\":\"humidity\",
  \"redundancy_group\":\"csa-humidity\",
  \"latitude\":37.77501,\"longitude\":-122.41930,
  \"tags\":{\"zone\":\"cold-storage-a\",\"environment\":\"indoor\",\"floor\":\"1\",\"measures\":\"humidity\"}
}")
ok "HUM-CSA-02 (humidity, redundancy: csa-hum) -> $id"
CSA_DEV_IDS+=("$id")

id=$(create_device "{
  \"name\":\"PRS-CSA-01\",\"type\":\"sensor\",\"status\":\"online\",
  \"group_id\":\"$CSA_GROUP\",\"metric_type\":\"pressure\",
  \"latitude\":37.77492,\"longitude\":-122.41950,
  \"tags\":{\"zone\":\"cold-storage-a\",\"environment\":\"indoor\",\"floor\":\"1\",\"measures\":\"pressure\"}
}")
ok "PRS-CSA-01 (pressure)                      -> $id"
CSA_DEV_IDS+=("$id")

id=$(create_device "{
  \"name\":\"GW-CSA-01\",\"type\":\"gateway\",\"status\":\"online\",
  \"group_id\":\"$CSA_GROUP\",\"metric_type\":\"cpu_usage\",
  \"latitude\":37.77510,\"longitude\":-122.41940,
  \"tags\":{\"zone\":\"cold-storage-a\",\"environment\":\"indoor\",\"floor\":\"1\",\"role\":\"edge-compute\"}
}")
ok "GW-CSA-01  (gateway, cpu_usage)             -> $id"
CSA_DEV_IDS+=("$id")

step "Creating devices — Server Room (nearby indoor contrast)"

SRV_DEV_IDS=()

id=$(create_device "{
  \"name\":\"TMP-SRV-01\",\"type\":\"sensor\",\"status\":\"online\",
  \"group_id\":\"$SRV_GROUP\",\"metric_type\":\"temp\",
  \"redundancy_group\":\"srv-temp\",
  \"latitude\":37.77550,\"longitude\":-122.41900,
  \"tags\":{\"zone\":\"server-room\",\"environment\":\"indoor\",\"floor\":\"2\",\"measures\":\"temperature\"}
}")
ok "TMP-SRV-01 (temp, redundancy: srv-temp)    -> $id"
SRV_DEV_IDS+=("$id")

id=$(create_device "{
  \"name\":\"TMP-SRV-02\",\"type\":\"sensor\",\"status\":\"online\",
  \"group_id\":\"$SRV_GROUP\",\"metric_type\":\"temp\",
  \"redundancy_group\":\"srv-temp\",
  \"latitude\":37.77551,\"longitude\":-122.41890,
  \"tags\":{\"zone\":\"server-room\",\"environment\":\"indoor\",\"floor\":\"2\",\"measures\":\"temperature\"}
}")
ok "TMP-SRV-02 (temp, redundancy: srv-temp)    -> $id"
SRV_DEV_IDS+=("$id")

id=$(create_device "{
  \"name\":\"HUM-SRV-01\",\"type\":\"sensor\",\"status\":\"online\",
  \"group_id\":\"$SRV_GROUP\",\"metric_type\":\"humidity\",
  \"latitude\":37.77560,\"longitude\":-122.41900,
  \"tags\":{\"zone\":\"server-room\",\"environment\":\"indoor\",\"floor\":\"2\",\"measures\":\"humidity\"}
}")
ok "HUM-SRV-01 (humidity)                      -> $id"
SRV_DEV_IDS+=("$id")

id=$(create_device "{
  \"name\":\"GW-SRV-01\",\"type\":\"gateway\",\"status\":\"online\",
  \"group_id\":\"$SRV_GROUP\",\"metric_type\":\"mem_usage\",
  \"latitude\":37.77560,\"longitude\":-122.41910,
  \"tags\":{\"zone\":\"server-room\",\"environment\":\"indoor\",\"floor\":\"2\",\"role\":\"edge-compute\"}
}")
ok "GW-SRV-01  (gateway, mem_usage)             -> $id"
SRV_DEV_IDS+=("$id")

step "Creating devices — Loading Dock (outdoor contrast)"

LD_DEV_IDS=()

id=$(create_device "{
  \"name\":\"TMP-LD-01\",\"type\":\"sensor\",\"status\":\"online\",
  \"group_id\":\"$LD_GROUP\",\"metric_type\":\"temp\",
  \"latitude\":37.77600,\"longitude\":-122.41850,
  \"tags\":{\"zone\":\"loading-dock\",\"environment\":\"outdoor\",\"floor\":\"G\",\"measures\":\"temperature\"}
}")
ok "TMP-LD-01  (temp)                          -> $id"
LD_DEV_IDS+=("$id")

id=$(create_device "{
  \"name\":\"HUM-LD-01\",\"type\":\"sensor\",\"status\":\"online\",
  \"group_id\":\"$LD_GROUP\",\"metric_type\":\"humidity\",
  \"latitude\":37.77600,\"longitude\":-122.41840,
  \"tags\":{\"zone\":\"loading-dock\",\"environment\":\"outdoor\",\"floor\":\"G\",\"measures\":\"humidity\"}
}")
ok "HUM-LD-01  (humidity)                      -> $id"
LD_DEV_IDS+=("$id")

id=$(create_device "{
  \"name\":\"PRS-LD-01\",\"type\":\"sensor\",\"status\":\"online\",
  \"group_id\":\"$LD_GROUP\",\"metric_type\":\"pressure\",
  \"latitude\":37.77610,\"longitude\":-122.41850,
  \"tags\":{\"zone\":\"loading-dock\",\"environment\":\"outdoor\",\"floor\":\"G\",\"measures\":\"pressure\"}
}")
ok "PRS-LD-01  (pressure)                      -> $id"
LD_DEV_IDS+=("$id")

step "Creating devices — Field Sensors (remote baseline, ~1km away)"

FLD_DEV_IDS=()

id=$(create_device "{
  \"name\":\"TMP-FLD-01\",\"type\":\"sensor\",\"status\":\"online\",
  \"group_id\":\"$FLD_GROUP\",\"metric_type\":\"temp\",
  \"latitude\":37.78000,\"longitude\":-122.41000,
  \"tags\":{\"zone\":\"field-north\",\"environment\":\"outdoor\",\"floor\":\"G\",\"measures\":\"temperature\"}
}")
ok "TMP-FLD-01 (temp)                          -> $id"
FLD_DEV_IDS+=("$id")

id=$(create_device "{
  \"name\":\"TMP-FLD-02\",\"type\":\"sensor\",\"status\":\"online\",
  \"group_id\":\"$FLD_GROUP\",\"metric_type\":\"temp\",
  \"redundancy_group\":\"fld-temp\",
  \"latitude\":37.78001,\"longitude\":-122.40990,
  \"tags\":{\"zone\":\"field-north\",\"environment\":\"outdoor\",\"floor\":\"G\",\"measures\":\"temperature\"}
}")
ok "TMP-FLD-02 (temp, redundancy: fld-temp)    -> $id"
FLD_DEV_IDS+=("$id")

id=$(create_device "{
  \"name\":\"HUM-FLD-01\",\"type\":\"sensor\",\"status\":\"online\",
  \"group_id\":\"$FLD_GROUP\",\"metric_type\":\"humidity\",
  \"latitude\":37.78010,\"longitude\":-122.41000,
  \"tags\":{\"zone\":\"field-north\",\"environment\":\"outdoor\",\"floor\":\"G\",\"measures\":\"humidity\"}
}")
ok "HUM-FLD-01 (humidity)                      -> $id"
FLD_DEV_IDS+=("$id")

# ===========================================================================
# Step 4: Create alert rules on Cold Storage A
# ===========================================================================

step "Applying alert rules to Cold Storage A"

RULES_CREATED=$(post "/api/rules/apply-template" "{
  \"template_id\":\"anomaly_detection\",
  \"scope\":\"group\",
  \"scope_id\":\"$CSA_GROUP\"
}" | jq 'length')
ok "Applied 'Standard Anomaly Detection' template — $RULES_CREATED rules"

CUSTOM_RULE=$(post "/api/rules" "{
  \"name\":\"Extreme Temperature — Cold Storage\",
  \"scope\":\"group\",
  \"scope_id\":\"$CSA_GROUP\",
  \"metric\":\"temp\",
  \"operator\":\"gt\",
  \"threshold\":45,
  \"severity\":\"critical\"
}" | jq -r '.id')
ok "Custom rule: temp > 45°C (critical)        -> $CUSTOM_RULE"

PRESSURE_RULE=$(post "/api/rules" "{
  \"name\":\"Abnormal Pressure Drop\",
  \"scope\":\"group\",
  \"scope_id\":\"$CSA_GROUP\",
  \"metric\":\"pressure\",
  \"operator\":\"lt\",
  \"threshold\":970,
  \"severity\":\"warning\"
}" | jq -r '.id')
ok "Custom rule: pressure < 970 hPa (warning)  -> $PRESSURE_RULE"

# ===========================================================================
# Step 5: Create simulations
# ===========================================================================

step "Creating simulations"

CSA_IDS_JSON=$(printf '%s\n' "${CSA_DEV_IDS[@]}" | jq -R . | jq -sc .)
SRV_IDS_JSON=$(printf '%s\n' "${SRV_DEV_IDS[@]}" | jq -R . | jq -sc .)
LD_IDS_JSON=$(printf '%s\n' "${LD_DEV_IDS[@]}" | jq -R . | jq -sc .)
FLD_IDS_JSON=$(printf '%s\n' "${FLD_DEV_IDS[@]}" | jq -R . | jq -sc .)

SIM_ANOMALY=$(post "/api/admin/simulations" "{
  \"name\":\"Cold Storage A — Stress Test (HVAC Failure)\",
  \"template\":\"stress\",
  \"device_ids\":$CSA_IDS_JSON,
  \"group_ids\":[\"$CSA_GROUP\"],
  \"interval\":3,
  \"config\":{\"intensity\":85}
}" | jq -r '.id')
ok "Stress sim  (CSA, intensity=85%, 3s)  -> $SIM_ANOMALY"

SIM_SRV=$(post "/api/admin/simulations" "{
  \"name\":\"Server Room — Normal Baseline\",
  \"template\":\"normal\",
  \"device_ids\":$SRV_IDS_JSON,
  \"group_ids\":[\"$SRV_GROUP\"],
  \"interval\":3
}" | jq -r '.id')
ok "Normal sim  (Server Room, 3s)    -> $SIM_SRV"

SIM_LD=$(post "/api/admin/simulations" "{
  \"name\":\"Loading Dock — Normal Baseline\",
  \"template\":\"normal\",
  \"device_ids\":$LD_IDS_JSON,
  \"group_ids\":[\"$LD_GROUP\"],
  \"interval\":3
}" | jq -r '.id')
ok "Normal sim  (Loading Dock, 3s)   -> $SIM_LD"

SIM_FLD=$(post "/api/admin/simulations" "{
  \"name\":\"Field Sensors — Normal Baseline\",
  \"template\":\"normal\",
  \"device_ids\":$FLD_IDS_JSON,
  \"group_ids\":[\"$FLD_GROUP\"],
  \"interval\":3
}" | jq -r '.id')
ok "Normal sim  (Field Sensors, 3s)  -> $SIM_FLD"

# ===========================================================================
# Step 6: Wait for alerts to accumulate
# ===========================================================================

step "Simulations are running. Waiting for alerts to trigger..."
echo -e "    Stress test will consistently push temp to 42-55°C (threshold: 45°C)"
echo -e "    Polling for critical alerts...\n"

ALERT_ID=""
ALERT_DEVICE=""
TIMEOUT=120
ELAPSED=0

while [ $ELAPSED -lt $TIMEOUT ]; do
  ALERTS_JSON=$(get "/api/alerts" 2>/dev/null || echo "[]")
  CRITICAL=$(echo "$ALERTS_JSON" | jq '[.[] | select(.severity=="critical")] | length')

  if [ "$CRITICAL" -gt 0 ]; then
    ALERT_ID=$(echo "$ALERTS_JSON" | jq -r '[.[] | select(.severity=="critical")] | sort_by(.created_at) | reverse | .[0].id')
    ALERT_DEVICE=$(echo "$ALERTS_JSON" | jq -r '[.[] | select(.severity=="critical")] | sort_by(.created_at) | reverse | .[0].device_id')
    TOTAL_ALERTS=$(echo "$ALERTS_JSON" | jq 'length')
    ok "Found $CRITICAL critical alert(s) out of $TOTAL_ALERTS total  (after ${ELAPSED}s)"
    break
  fi

  printf "    ⏳ %3ds — no critical alerts yet (total: %s)...\r" "$ELAPSED" \
    "$(echo "$ALERTS_JSON" | jq 'length')"
  sleep 5
  ELAPSED=$((ELAPSED + 5))
done

if [ -z "$ALERT_ID" ]; then
  warn "No critical alerts after ${TIMEOUT}s. Alerts should appear shortly once simulations generate more data."
fi

# ===========================================================================
# Summary
# ===========================================================================

echo ""
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  Demo scenario ready!${NC}"
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Groups:${NC}"
echo "    Cold Storage A  $CSA_GROUP"
echo "    Server Room     $SRV_GROUP"
echo "    Loading Dock    $LD_GROUP"
echo "    Field Sensors   $FLD_GROUP"
echo ""
echo -e "  ${BOLD}Devices:${NC}  $((${#CSA_DEV_IDS[@]} + ${#SRV_DEV_IDS[@]} + ${#LD_DEV_IDS[@]} + ${#FLD_DEV_IDS[@]})) total (6 CSA + 4 SRV + 3 LD + 3 FLD)"
echo -e "  ${BOLD}Rules:${NC}    $((RULES_CREATED + 2)) on Cold Storage A"
echo -e "  ${BOLD}Sims:${NC}     4 running (stress@85% on CSA, normal on rest)"
echo ""
echo -e "  ${BOLD}Next step:${NC}"
echo "    Open ${BOLD}http://localhost:8080/alerts${NC} and trigger an AI investigation"
echo "    on one of the critical temperature alerts."
echo ""
