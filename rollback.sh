#!/bin/bash
set -e

# rollback.sh — Roll back a deploy branch to a previous tag.
# Usage: ./rollback.sh staging v1.0.3
#        ./rollback.sh prod v1.0.1
#        ./rollback.sh                  (interactive)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -n "$1" ] && [ -n "$2" ]; then
  ENV="$1"
  TAG="$2"
else
  git fetch --tags --quiet
  echo "Recent tags:"
  echo ""
  git tag -l 'v*' --sort=-version:refname | head -10 | while read -r T; do
    DATE=$(git log -1 --format='%ci' "$T" 2>/dev/null | cut -d' ' -f1)
    SHORT=$(git rev-list -n 1 "$T" 2>/dev/null | cut -c1-7)
    echo "  $T  $SHORT  $DATE"
  done
  echo ""
  read -rp "Environment (staging/prod): " ENV
  read -rp "Tag to roll back to: " TAG
fi

if [ -z "$ENV" ] || [ -z "$TAG" ]; then
  echo "Usage: ./rollback.sh <staging|prod> <tag>"
  exit 1
fi

case "$ENV" in
  staging|prod) ;;
  *) echo "Error: environment must be 'staging' or 'prod'"; exit 1 ;;
esac

if ! git rev-parse --verify "$TAG" >/dev/null 2>&1; then
  echo "Error: tag '$TAG' not found"
  exit 1
fi

SHORT=$(git rev-list -n 1 "$TAG" | cut -c1-7)
echo ""
echo "Will roll back deploy/$ENV to $TAG ($SHORT)."
read -rp "Continue? [y/N]: " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

"$SCRIPT_DIR/deploy.sh" "$ENV" "$TAG"
