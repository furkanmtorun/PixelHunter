#!/usr/bin/env bash
set -e

echo "📦 Installing backend dependencies..."
pip install -r backend/requirements.txt

# echo "🧪 Running backend tests..."
# PYTHONPATH=$PWD/backend pytest backend/tests/

# echo "📦 Installing frontend dependencies..."
# cd frontend
# npm install
# echo "🧪 Running frontend tests..."
# npm test
# cd ..

echo ""
echo "🚀 Starting PixelHunter server..."
echo "   Open http://localhost:8000 in your browser"
echo "   Open multiple tabs to see real-time sync!"
echo ""

cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
