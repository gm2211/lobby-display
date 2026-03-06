#!/bin/bash
set -e

# promote.sh — Promote a tag to production.
# Usage: ./promote.sh              (interactive — lists recent tags, E2E gate enforced)
#        ./promote.sh v1.0.5       (direct — promote that tag, E2E gate enforced)
#        ./promote.sh --force v1.0.5   (override E2E gate for emergencies)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FORCE=false

pick_tag() {
  git fetch --tags --quiet
  echo "Recent tags:"
  echo ""
  git tag -l 'v*' --sort=-version:refname | head -10 | while read -r TAG; do
    DATE=$(git log -1 --format='%ci' "$TAG" 2>/dev/null | cut -d' ' -f1)
    SHORT=$(git rev-list -n 1 "$TAG" 2>/dev/null | cut -c1-7)
    echo "  $TAG  $SHORT  $DATE"
  done
  echo ""
  read -rp "Tag to promote to prod: " TAG
  echo "$TAG"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --force)
      FORCE=true
      shift
      ;;
    *)
      TAG="$1"
      shift
      ;;
  esac
done

if [ -z "$TAG" ]; then
  TAG=$(pick_tag)
fi

if [ -z "$TAG" ]; then
  echo "No tag specified. Aborted."
  exit 1
fi

if ! git rev-parse --verify "$TAG" >/dev/null 2>&1; then
  echo "Error: tag '$TAG' not found"
  exit 1
fi

SHORT=$(git rev-list -n 1 "$TAG" | cut -c1-7)
COMMIT=$(git rev-list -n 1 "$TAG")

# --- E2E gate check ---
echo ""
echo "Checking E2E status for $TAG ($SHORT)..."

E2E_STATUS=$(gh run list \
  --workflow="E2E Regression (Staging)" \
  --commit="$COMMIT" \
  --json conclusion,status \
  --jq '.[0] | if .status == "completed" then .conclusion else .status end' \
  2>/dev/null || echo "unknown")

if [ "$E2E_STATUS" = "success" ]; then
  echo "E2E passed for $TAG"
elif [ "$FORCE" = "true" ]; then
  echo "WARNING: E2E status is '$E2E_STATUS' but --force was used. Proceeding anyway."
else
  echo ""
  echo "BLOCKED: E2E status for $TAG is '$E2E_STATUS'"
  echo ""
  echo "  View results:  gh run list --workflow='E2E Regression (Staging)' --commit=$SHORT"
  echo "  Force promote:  ./promote.sh --force $TAG"
  echo ""
  exit 1
fi
# --- End E2E gate check ---

echo ""
echo "Will promote $TAG ($SHORT) to production."
read -rp "Continue? [y/N]: " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

"$SCRIPT_DIR/deploy.sh" prod "$TAG"
