#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PYTHON="${PYTHON:-python3}"
PORT="${PORT:-8000}"

echo "📦 Installing backend dependencies..."
"$PYTHON" -m pip install -r backend/requirements-dev.txt

if [[ "${SKIP_TESTS:-0}" != "1" ]]; then
  echo "🧪 Running tests..."
  (cd backend && "$PYTHON" -m pytest -q)
fi

echo ""
echo "🚀 Starting PixelHunter on http://localhost:${PORT}"
echo "   Open two tabs to see real-time sync."
echo ""

cd backend
exec "$PYTHON" -m uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "$PORT" \
  --reload \
  --reload-dir app
