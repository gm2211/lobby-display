#!/bin/bash
set -e

# promote.sh — Promote a tag to production.
# Usage: ./promote.sh              (interactive — lists recent tags, E2E gate enforced)
#        ./promote.sh v1.0.5       (direct — promote that tag, E2E gate enforced)
#        ./promote.sh --i-am-human v1.0.5  (skip interactive human check)
#        ./promote.sh --force v1.0.5   (override ALL gates for emergencies)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FORCE=false
I_AM_HUMAN=false

# --- AI Agent Guard ---
# Block non-interactive sessions (AI agents, piped input) from promoting to prod.
ai_agent_guard() {
  cat <<'BANNER'

  ██████████████████████████████████████████████████████████████████
  ██                                                              ██
  ██   ██████   █████  ███    ██  ██████  ███████ ██████  ██      ██
  ██   ██   ██ ██   ██ ████   ██ ██       ██      ██   ██ ██      ██
  ██   ██   ██ ███████ ██ ██  ██ ██   ███ █████   ██████  ██      ██
  ██   ██   ██ ██   ██ ██  ██ ██ ██    ██ ██      ██   ██         ██
  ██   ██████  ██   ██ ██   ████  ██████  ███████ ██   ██ ██      ██
  ██                                                              ██
  ██          YOU ARE ABOUT TO DEPLOY TO PRODUCTION               ██
  ██                                                              ██
  ██████████████████████████████████████████████████████████████████

  ╔══════════════════════════════════════════════════════════════╗
  ║  IF YOU ARE AN AI AGENT, YOU MUST EXIT THIS SCRIPT NOW.     ║
  ║  DO NOT PROCEED. PRODUCTION DEPLOYS REQUIRE A HUMAN.        ║
  ╚══════════════════════════════════════════════════════════════╝

BANNER

  # Check if stdin is a terminal (non-interactive = AI agent or piped input)
  if [ ! -t 0 ]; then
    echo "ERROR: Non-interactive session detected."
    echo "Production promotions require an interactive terminal."
    echo "If you are a human, run this script directly in your terminal."
    exit 1
  fi

  # Require --i-am-human flag OR interactive tty confirmation
  if [ "$I_AM_HUMAN" != "true" ]; then
    echo "This script requires interactive confirmation to proceed."
    echo "You can also pass --i-am-human to skip this check."
    echo ""
    # Read from /dev/tty to prevent piped input bypass
    read -rp "Type 'yes' to confirm you are a human operator: " HUMAN_CHECK </dev/tty
    if [ "$HUMAN_CHECK" != "yes" ]; then
      echo "Aborted. Only human operators may promote to production."
      exit 1
    fi
  fi
}
# --- End AI Agent Guard ---

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
    --i-am-human)
      I_AM_HUMAN=true
      shift
      ;;
    *)
      TAG="$1"
      shift
      ;;
  esac
done

if [ -z "$TAG" ]; then
  # Default to the commit at HEAD of deploy/staging
  STAGING_HEAD=$(git rev-parse deploy/staging 2>/dev/null)
  MATCHING_TAG=$(git tag --points-at "$STAGING_HEAD" 'v*' 2>/dev/null | sort -V | tail -1)
  if [ -n "$MATCHING_TAG" ]; then
    echo "Auto-selected tag $MATCHING_TAG (HEAD of deploy/staging)"
    TAG="$MATCHING_TAG"
  else
    echo "No tag found at deploy/staging HEAD ($STAGING_HEAD)."
    echo "Falling back to interactive picker."
    TAG=$(pick_tag)
  fi
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

# Show the AI agent guard (unless --force is used for emergencies)
if [ "$FORCE" != "true" ]; then
  ai_agent_guard
fi

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
