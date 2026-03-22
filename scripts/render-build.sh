#!/bin/bash
set -e

npm ci --include=dev

# Apply any schema changes to the database (additive only — no data loss)
npx prisma db push

# Write build version for auto-reload detection
BUILD_HASH="${RENDER_GIT_COMMIT:-$(date +%s)}"
echo "{\"hash\":\"$BUILD_HASH\"}" > build-version.json
echo "Build version: $BUILD_HASH"

npm run build
