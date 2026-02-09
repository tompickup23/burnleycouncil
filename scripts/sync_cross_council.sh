#!/usr/bin/env bash
# sync_cross_council.sh — Copy the canonical cross_council.json to all council data dirs.
#
# Canonical source: public/data/cross_council.json
# Targets:          burnley-council/data/{burnley,hyndburn,pendle,rossendale}/cross_council.json
#
# Usage:
#   ./scripts/sync_cross_council.sh          # run from project root
#   bash scripts/sync_cross_council.sh       # alternative

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SOURCE="$PROJECT_ROOT/public/data/cross_council.json"
DATA_DIR="$PROJECT_ROOT/burnley-council/data"

COUNCILS=(burnley hyndburn pendle rossendale)

# Verify canonical source exists
if [ ! -f "$SOURCE" ]; then
  echo "ERROR: Canonical source not found: $SOURCE" >&2
  exit 1
fi

echo "Syncing cross_council.json from canonical source:"
echo "  Source: $SOURCE"
echo ""

copied=0
for council in "${COUNCILS[@]}"; do
  dest="$DATA_DIR/$council/cross_council.json"
  dest_dir="$DATA_DIR/$council"

  if [ ! -d "$dest_dir" ]; then
    echo "  WARNING: Directory does not exist, skipping: $dest_dir" >&2
    continue
  fi

  cp "$SOURCE" "$dest"
  echo "  Copied -> $dest"
  copied=$((copied + 1))
done

echo ""
echo "Done! Copied cross_council.json to $copied council data directories."
