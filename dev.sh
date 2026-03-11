#!/bin/bash

# Local development script for IoT Fleet Manager
# Prerequisites:
#   - Aerospike running (via docker): docker compose up aerospike-db -d
#   - Python 3.11+ with pip
#   - Node.js 20+ with npm

set -e

# Load environment variables from .env file if it exists
if [ -f .env ]; then
  echo "==> Loading environment from .env"
  set -a
  source .env
  set +a
fi

# Stop any Docker-based producer/consumer from previous runs
docker compose stop producer consumer 2>/dev/null || true
docker compose rm -f producer consumer 2>/dev/null || true

# Start Aerospike and Kafka in Docker if not already running
echo "==> Ensuring Aerospike and Kafka are running..."
docker compose up aerospike-db kafka -d 2>/dev/null || true

# Wait for Aerospike to be healthy
echo "==> Waiting for Aerospike to be healthy..."
until docker exec iotfleet-aerospike asinfo -p 3000 -v build &>/dev/null; do
  sleep 2
done
echo "==> Aerospike is ready."

# Wait for Kafka to be healthy
echo "==> Waiting for Kafka to be healthy..."
until docker exec iotfleet-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list &>/dev/null; do
  sleep 3
done
echo "==> Kafka is ready."

# Backend setup
echo "==> Setting up backend..."
cd backend
if [ ! -d "venv" ]; then
  python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt

export AEROSPIKE_HOST=localhost
export AEROSPIKE_PORT=3010
export AEROSPIKE_NAMESPACE=iotfleet
export KAFKA_BOOTSTRAP=localhost:9094
export GEMINI_API_KEY=${GEMINI_API_KEY:-""}

echo "==> Seeding database..."
python -m app.seed

echo "==> Starting backend on http://localhost:4000"
uvicorn app.main:app --host 0.0.0.0 --port 4000 --reload &
BACKEND_PID=$!
cd ..

# Wait for backend to be ready, then seed device metadata
echo "==> Waiting for backend to be ready..."
until curl -sf http://localhost:4000/health >/dev/null 2>&1; do
  sleep 1
done
echo "==> Seeding device metadata (locations, metric types, redundancy groups)..."
curl -sf -X POST http://localhost:4000/api/admin/seed-device-metadata | python3 -m json.tool 2>/dev/null || echo "  (seed skipped or no devices yet)"

# Start producer locally
echo "==> Starting telemetry producer..."
cd producer
if [ ! -d "venv" ]; then
  python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt
python -u producer.py &
PRODUCER_PID=$!
cd ..

# Start consumer locally
echo "==> Starting telemetry consumer..."
cd consumer
if [ ! -d "venv" ]; then
  python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt
python -u consumer.py &
CONSUMER_PID=$!
cd ..

# Frontend setup
echo "==> Setting up frontend..."
cd frontend
npm install --silent
echo "==> Starting frontend on http://localhost:8080"
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "============================================"
echo "  IoT Fleet Manager - Dev Servers Running"
echo "============================================"
echo "  Frontend:  http://localhost:8080"
echo "  Backend:   http://localhost:4000"
echo "  API Docs:  http://localhost:4000/docs"
echo "  Aerospike: localhost:3010 (Docker)"
echo "  Kafka:     localhost:9094 (Docker)"
echo "  Producer:  local (PID $PRODUCER_PID)"
echo "  Consumer:  local (PID $CONSUMER_PID)"
echo "============================================"
echo "  Press Ctrl+C to stop all services"
echo "============================================"
echo ""

cleanup() {
  echo ""
  echo "==> Shutting down..."
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  kill $PRODUCER_PID 2>/dev/null
  kill $CONSUMER_PID 2>/dev/null
  wait $BACKEND_PID 2>/dev/null
  wait $FRONTEND_PID 2>/dev/null
  wait $PRODUCER_PID 2>/dev/null
  wait $CONSUMER_PID 2>/dev/null
  echo "==> Done."
}

trap cleanup EXIT INT TERM

wait
