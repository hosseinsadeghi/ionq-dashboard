#!/usr/bin/env bash
# Launch backend (5181) and frontend (5180) in one shot.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() {
  trap - INT TERM EXIT
  jobs -p | xargs -r kill 2>/dev/null || true
}
trap cleanup INT TERM EXIT

PY="${PYTHON:-python3}"

echo "[ionq-dashboard] starting backend on :5181"
( cd "$HERE" && "$PY" -m uvicorn backend.main:app --host 0.0.0.0 --port 5181 ) &

echo "[ionq-dashboard] starting frontend on :5180"
( cd "$HERE/frontend" && npm run dev ) &

wait
