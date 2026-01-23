#!/bin/bash
# Run the Rehab CV Coach application

set -e

echo "🔨 Building frontend..."
npm run build

echo "🚀 Starting server at http://localhost:8000"
cd backend
python -m uvicorn server:app --host 0.0.0.0 --port 8000
