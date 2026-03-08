#!/bin/bash

echo "[staging] Node $(node --version) | PORT=${PORT:-not set}"

cd /app

# Run prisma db push in background so it doesn't block server startup
# Render may kill the container if it doesn't bind PORT quickly
echo "[staging] Running prisma db push (background)..."
npx prisma db push --skip-generate 2>&1 | sed 's/^/[prisma] /' &
PRISMA_PID=$!

# Start renzo-ai (non-critical)
echo "[staging] Starting renzo-ai on port 3001..."
cd /app/renzo-ai
AI_PORT=3001 LOG_LEVEL=info node dist/server.js 2>&1 | sed 's/^/[ai] /' &
AI_PID=$!

# Start main server — this MUST bind PORT for Render health check
echo "[staging] Starting main server on PORT=${PORT:-3000}..."
cd /app
NODE_ENV=production node dist-server/index.js 2>&1 | sed 's/^/[main] /'  &
MAIN_PID=$!

echo "[staging] PIDs: main=$MAIN_PID ai=$AI_PID prisma=$PRISMA_PID"

# Wait for the MAIN server — that's the critical one
wait $MAIN_PID
MAIN_EXIT=$?

echo "[staging] Main server exited ($MAIN_EXIT)"
kill $AI_PID $PRISMA_PID 2>/dev/null || true
exit $MAIN_EXIT
