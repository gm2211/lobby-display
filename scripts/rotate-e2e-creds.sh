#!/bin/bash
set -euo pipefail

# rotate-e2e-creds.sh — Rotate E2E test user passwords on staging
# and update GitHub Actions secrets. No passwords are printed to stdout.
#
# Usage:
#   ./scripts/rotate-e2e-creds.sh <connect.sid cookie value>
#
# The cookie is invalidated (logged out) at the end.

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <connect.sid cookie value>"
  exit 1
fi

BASE_URL="https://renzo-staging.onrender.com"
COOKIE="$1"

# --- Get CSRF token ---
echo "Fetching CSRF token..."
CSRF=$(curl -sf -b "connect.sid=$COOKIE" "$BASE_URL/api/auth/csrf" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
if [ -z "$CSRF" ]; then
  echo "ERROR: Failed to get CSRF token. Is the cookie valid?"
  exit 1
fi
echo "Got CSRF token."

# --- Get user IDs ---
echo "Fetching user list..."
USERS_JSON=$(curl -sf -b "connect.sid=$COOKIE" "$BASE_URL/api/users")

get_user_id() {
  echo "$USERS_JSON" | python3 -c "
import sys, json
users = json.load(sys.stdin)
match = [u for u in users if u['username'] == '$1']
print(match[0]['id'] if match else '')
"
}

ADMIN_ID=$(get_user_id "e2e-admin")
EDITOR_ID=$(get_user_id "e2e-editor")
VIEWER_ID=$(get_user_id "e2e-viewer")

for PAIR in "e2e-admin:$ADMIN_ID" "e2e-editor:$EDITOR_ID" "e2e-viewer:$VIEWER_ID"; do
  NAME="${PAIR%%:*}"
  UID_VAL="${PAIR##*:}"
  if [ -z "$UID_VAL" ]; then
    echo "ERROR: User '$NAME' not found on staging."
    exit 1
  fi
done
echo "Found all 3 test users."

# --- Generate new passwords (never printed) ---
ADMIN_PW=$(openssl rand -base64 24)
EDITOR_PW=$(openssl rand -base64 24)
VIEWER_PW=$(openssl rand -base64 24)

# --- Update passwords via API ---
update_password() {
  local user_id="$1"
  local username="$2"
  local new_pw="$3"
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -b "connect.sid=$COOKIE" \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $CSRF" \
    -X PUT "$BASE_URL/api/users/$user_id" \
    -d "{\"password\":\"$new_pw\"}")
  if [ "$http_code" != "200" ]; then
    echo "ERROR: Failed to update password for $username (HTTP $http_code)"
    exit 1
  fi
  echo "  Updated $username"
}

echo "Rotating passwords..."
update_password "$ADMIN_ID"  "e2e-admin"  "$ADMIN_PW"
update_password "$EDITOR_ID" "e2e-editor" "$EDITOR_PW"
update_password "$VIEWER_ID" "e2e-viewer" "$VIEWER_PW"

# --- Set GitHub secrets ---
echo "Setting GitHub secrets..."
echo "e2e-admin"  | gh secret set E2E_ADMIN_USER  --repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)" 2>/dev/null
printf '%s' "$ADMIN_PW"  | gh secret set E2E_ADMIN_PASS  --repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)" 2>/dev/null
echo "e2e-editor" | gh secret set E2E_EDITOR_USER --repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)" 2>/dev/null
printf '%s' "$EDITOR_PW" | gh secret set E2E_EDITOR_PASS --repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)" 2>/dev/null
echo "e2e-viewer" | gh secret set E2E_VIEWER_USER --repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)" 2>/dev/null
printf '%s' "$VIEWER_PW" | gh secret set E2E_VIEWER_PASS --repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)" 2>/dev/null
echo "  All 6 secrets updated."

# --- Logout (invalidate cookie) ---
echo "Logging out (invalidating session)..."
curl -sf -b "connect.sid=$COOKIE" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -X POST "$BASE_URL/api/auth/logout" > /dev/null 2>&1 || true

# --- Clear variables ---
unset COOKIE CSRF ADMIN_PW EDITOR_PW VIEWER_PW ADMIN_ID EDITOR_ID VIEWER_ID USERS_JSON

echo ""
echo "Done. Passwords rotated, secrets updated, session invalidated."
echo "No passwords were printed to stdout."
