#!/bin/bash

echo "[staging] Node $(node --version) | PORT=${PORT:-not set}"

cd /app

# Apply schema changes BEFORE starting servers
echo "[staging] Running prisma db push..."
npx prisma db push --skip-generate 2>&1 || echo "[staging] WARNING: prisma db push failed"

# Verify db connectivity
echo "[staging] Testing DB connection..."
node -e "
  import('@prisma/client').then(({ PrismaClient }) => {
    const p = new PrismaClient();
    return p.\$queryRaw\`SELECT 1\`.then(() => {
      console.log('[staging] DB connection OK');
      p.\$disconnect();
    });
  }).catch(e => {
    console.error('[staging] DB connection FAILED:', e.message);
    process.exit(0); // don't crash, let server try
  });
" 2>&1

# Start renzo-ai (non-critical)
echo "[staging] Starting renzo-ai on port 3001..."
cd /app/renzo-ai
AI_PORT=3001 LOG_LEVEL=info node dist/server.js 2>&1 &
AI_PID=$!

# Start main server
echo "[staging] Starting main server on PORT=${PORT:-3000}..."
cd /app
NODE_ENV=production node dist-server/index.js 2>&1 &
MAIN_PID=$!

echo "[staging] PIDs: main=$MAIN_PID ai=$AI_PID"

# Wait for the MAIN server
wait $MAIN_PID
MAIN_EXIT=$?

echo "[staging] Main server exited ($MAIN_EXIT)"
kill $AI_PID 2>/dev/null || true
exit $MAIN_EXIT
