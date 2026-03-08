#!/bin/bash

echo "[staging] Node $(node --version) | PORT=${PORT:-not set} | PWD=$(pwd)"

# Apply schema changes (non-blocking — don't let this kill startup)
echo "[staging] Running prisma db push..."
cd /app
npx prisma db push --skip-generate 2>&1 || echo "[staging] WARNING: prisma db push failed"

# Start renzo-ai (non-critical — if it dies, main server continues)
echo "[staging] Starting renzo-ai on port 3001..."
cd /app/renzo-ai
AI_PORT=3001 LOG_LEVEL=info node dist/server.js 2>&1 &
AI_PID=$!

# Start main server
echo "[staging] Starting main server..."
cd /app
NODE_ENV=production node dist-server/index.js 2>&1 &
MAIN_PID=$!

echo "[staging] PIDs: main=$MAIN_PID ai=$AI_PID"

# Wait for the MAIN server — that's the critical one
wait $MAIN_PID
MAIN_EXIT=$?

echo "[staging] Main server exited ($MAIN_EXIT)"
kill $AI_PID 2>/dev/null || true
exit $MAIN_EXIT
