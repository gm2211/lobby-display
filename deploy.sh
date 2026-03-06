#!/bin/bash
set -e

# deploy.sh — Advance a deploy branch to a given ref.
# Usage: ./deploy.sh <staging|prod> <tag-or-commit>

ENV="$1"
REF="$2"

if [ -z "$ENV" ] || [ -z "$REF" ]; then
  echo "Usage: ./deploy.sh <staging|prod> <tag-or-commit>"
  exit 1
fi

case "$ENV" in
  staging|prod) BRANCH="deploy/$ENV" ;;
  *) echo "Error: environment must be 'staging' or 'prod'"; exit 1 ;;
esac

# Resolve ref to a commit
if ! COMMIT=$(git rev-parse --verify "$REF" 2>/dev/null); then
  echo "Error: ref '$REF' not found"
  exit 1
fi

SHORT=$(echo "$COMMIT" | cut -c1-7)
echo "Advancing $BRANCH to $SHORT ($REF)"
git push origin "$COMMIT:refs/heads/$BRANCH" --force
echo "Done. Render will auto-deploy from $BRANCH."
