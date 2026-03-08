#!/bin/bash
set -e

echo "[staging] Starting renzo-ai server on port 3001..."
cd /app/renzo-ai
AI_PORT=3001 LOG_LEVEL=info node dist/server.js &
AI_PID=$!

echo "[staging] Starting main Renzo server on port 3000..."
cd /app
NODE_ENV=production node dist-server/index.js &
MAIN_PID=$!

echo "[staging] Both servers running (main=$MAIN_PID, ai=$AI_PID)"

# Wait for either to exit
wait -n $MAIN_PID $AI_PID
EXIT_CODE=$?

echo "[staging] A server exited with code $EXIT_CODE — shutting down"
kill $MAIN_PID $AI_PID 2>/dev/null || true
exit $EXIT_CODE
