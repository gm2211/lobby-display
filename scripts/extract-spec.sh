#!/usr/bin/env bash
# extract-spec.sh — Set up product spec reference screenshots
#
# Usage:
#   ./scripts/extract-spec.sh [path/to/cc-product-spec.zip]
#
# If no path is provided, the script looks for cc-product-spec.zip in the
# project root and in the current directory.
#
# What it does:
#   1. Validates that `unzip` is available
#   2. Locates the spec ZIP file
#   3. Creates docs/platform-spec/screenshots/
#   4. Extracts ZIP contents into docs/platform-spec/screenshots/
#   5. Copies any top-level *.md file from the ZIP into screenshots for local reference

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SPEC_DIR="$PROJECT_ROOT/docs/platform-spec"
SCREENSHOTS_DIR="$SPEC_DIR/screenshots"
SOURCE_MD="$SCREENSHOTS_DIR/source-spec.md"

# ── helpers ──────────────────────────────────────────────────────────────────

info()    { echo "[extract-spec] $*"; }
success() { echo "[extract-spec] ✓ $*"; }
error()   { echo "[extract-spec] ERROR: $*" >&2; exit 1; }

# ── 1. Check for unzip ───────────────────────────────────────────────────────

if ! command -v unzip &>/dev/null; then
  error "'unzip' is not installed. Install it with your package manager:
  macOS:  brew install unzip
  Ubuntu: sudo apt-get install unzip"
fi

# ── 2. Locate the ZIP file ───────────────────────────────────────────────────

if [[ $# -ge 1 ]]; then
  ZIP_FILE="$1"
else
  # Try common locations in order
  CANDIDATES=(
    "$PROJECT_ROOT/cc-product-spec.zip"
    "$(pwd)/cc-product-spec.zip"
  )
  ZIP_FILE=""
  for candidate in "${CANDIDATES[@]}"; do
    if [[ -f "$candidate" ]]; then
      ZIP_FILE="$candidate"
      break
    fi
  done
fi

if [[ -z "$ZIP_FILE" ]]; then
  error "cc-product-spec.zip not found.

Provide the path as an argument:
  ./scripts/extract-spec.sh /path/to/cc-product-spec.zip

Or place cc-product-spec.zip in the project root:
  $PROJECT_ROOT/cc-product-spec.zip"
fi

if [[ ! -f "$ZIP_FILE" ]]; then
  error "ZIP file not found: $ZIP_FILE"
fi

info "Using ZIP file: $ZIP_FILE"

# ── 3. Create output directories ─────────────────────────────────────────────

info "Creating $SCREENSHOTS_DIR"
mkdir -p "$SCREENSHOTS_DIR"

# ── 4. Extract ZIP into screenshots/ ─────────────────────────────────────────

info "Extracting ZIP contents..."
unzip -q -o "$ZIP_FILE" -d "$SCREENSHOTS_DIR"
success "Extracted to $SCREENSHOTS_DIR"

# ── 5. Copy source markdown (if present) ─────────────────────────────────────

# Look for a top-level markdown file inside the extracted content
FIRST_MD="$(find "$SCREENSHOTS_DIR" -maxdepth 2 -name "*.md" | sort | head -n 1)"

if [[ -n "$FIRST_MD" ]]; then
  cp "$FIRST_MD" "$SOURCE_MD"
  success "Copied source markdown to $SOURCE_MD"
else
  info "No markdown file found in ZIP — skipping source markdown copy"
fi

# ── Done ─────────────────────────────────────────────────────────────────────

success "Setup complete."
echo ""
echo "Reference screenshots are in: $SCREENSHOTS_DIR"
if [[ -f "$SOURCE_MD" ]]; then
  echo "Source markdown copy:         $SOURCE_MD"
fi
echo ""
echo "Everything under screenshots/ is gitignored and for local reference only."
