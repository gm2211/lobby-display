#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

DB_CONTAINER="lobby-db"
DB_NAME="lobby"
DB_USER="postgres"
DB_PASS="postgres"
DB_PORT="5432"

# ── Ensure Docker is available ───────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "❌ Docker not found."
  echo "   Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
  echo "   Or via Homebrew:  brew install --cask docker"
  exit 1
fi

if ! docker info &>/dev/null; then
  echo "⏳ Docker daemon not running. Attempting to start..."
  open -a Docker 2>/dev/null || true
  for i in {1..30}; do
    docker info &>/dev/null && break
    sleep 2
  done
  if ! docker info &>/dev/null; then
    echo "❌ Could not start Docker. Please start Docker Desktop manually."
    exit 1
  fi
fi

# ── Start PostgreSQL container ───────────────────────────────────────
if docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  echo "✅ PostgreSQL container already running"
elif docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  echo "🔄 Starting existing PostgreSQL container..."
  docker start "$DB_CONTAINER"
else
  echo "🐘 Creating PostgreSQL container..."
  docker run -d \
    --name "$DB_CONTAINER" \
    -e POSTGRES_USER="$DB_USER" \
    -e POSTGRES_PASSWORD="$DB_PASS" \
    -e POSTGRES_DB="$DB_NAME" \
    -p "${DB_PORT}:5432" \
    postgres:16-alpine
fi

# Wait for postgres to be ready
echo "⏳ Waiting for PostgreSQL..."
for i in {1..30}; do
  docker exec "$DB_CONTAINER" pg_isready -U "$DB_USER" &>/dev/null && break
  sleep 1
done

if ! docker exec "$DB_CONTAINER" pg_isready -U "$DB_USER" &>/dev/null; then
  echo "❌ PostgreSQL failed to start"
  exit 1
fi
echo "✅ PostgreSQL ready"

# ── Ensure .env exists ───────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "📝 Creating .env from .env.example..."
  cp .env.example .env
fi

# ── Install dependencies if needed ───────────────────────────────────
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  echo "📦 Installing dependencies..."
  npm ci
fi

# ── Sync schema + generate client ────────────────────────────────────
echo "🔧 Syncing database schema..."
npx prisma generate
npx prisma db push

# ── Start dev server ─────────────────────────────────────────────────
echo "🚀 Starting dev server..."
npm run dev
