#!/usr/bin/env bash
# Push spending chunk data directly to the deploy repo (gh-pages branch).
# This bootstraps the CI restore chain for councils whose chunk data is gitignored.
#
# Usage:
#   ./scripts/push_spending_data.sh                    # Push all councils with local data
#   ./scripts/push_spending_data.sh lancashire_cc      # Push only LCC
#   ./scripts/push_spending_data.sh blackpool blackburn # Push specific councils
#
# Prerequisites:
#   - Local spending data files in burnley-council/data/{council}/
#   - DEPLOY_TOKEN env var or git credential helper for tompickup23/lancashire
#   - Node.js and git installed
#
# What this does:
#   1. Clones the deploy repo (gh-pages branch)
#   2. Copies spending-index.json + chunk files from local data
#   3. Updates config.json to enable spending
#   4. Pushes to gh-pages
#   After this, the CI deploy.yml will sustain the chain by restoring from the deploy repo.

set -euo pipefail
cd "$(dirname "$0")/.."

DEPLOY_REPO="https://github.com/tompickup23/lancashire.git"
if [ -n "${DEPLOY_TOKEN:-}" ]; then
  DEPLOY_REPO="https://x-access-token:${DEPLOY_TOKEN}@github.com/tompickup23/lancashire.git"
fi

# Council ID → deploy slug mapping (POSIX-compatible, no associative arrays)
slug_for() {
  case "$1" in
    lancashire_cc)    echo "lancashirecc" ;;
    blackpool)        echo "blackpoolcouncil" ;;
    blackburn)        echo "blackburncouncil" ;;
    burnley)          echo "burnleycouncil" ;;
    hyndburn)         echo "hyndburncouncil" ;;
    pendle)           echo "pendlecouncil" ;;
    rossendale)       echo "rossendalecouncil" ;;
    lancaster)        echo "lancastercouncil" ;;
    ribble_valley)    echo "ribblevalleycouncil" ;;
    chorley)          echo "chorleycouncil" ;;
    south_ribble)     echo "southribblecouncil" ;;
    west_lancashire)  echo "westlancashirecouncil" ;;
    wyre)             echo "wyrecouncil" ;;
    preston)          echo "prestoncouncil" ;;
    fylde)            echo "fyldecouncil" ;;
    *) echo "" ;;
  esac
}

ALL_IDS="lancashire_cc blackpool blackburn burnley hyndburn pendle rossendale lancaster ribble_valley chorley south_ribble west_lancashire wyre preston fylde"

# v4 monthly councils (spending: false in git config, needs flip)
V4_COUNCILS="lancashire_cc blackpool blackburn"

# Determine which councils to push
if [ $# -gt 0 ]; then
  COUNCILS="$*"
else
  # Default: push all councils that have spending-index.json locally
  COUNCILS=""
  for ID in $ALL_IDS; do
    if [ -f "burnley-council/data/${ID}/spending-index.json" ]; then
      COUNCILS="${COUNCILS} ${ID}"
    fi
  done
fi

COUNCILS="$(echo "$COUNCILS" | xargs)"
if [ -z "$COUNCILS" ]; then
  echo "No councils with spending-index.json found. Run council_etl.py first."
  exit 1
fi

echo "Councils to push: ${COUNCILS}"

# Clone deploy repo
WORK_DIR=$(mktemp -d)
echo "Cloning deploy repo..."
git clone --depth 1 --branch gh-pages "${DEPLOY_REPO}" "${WORK_DIR}" 2>/dev/null || {
  echo "Failed to clone deploy repo. Check your DEPLOY_TOKEN or git credentials."
  rm -rf "${WORK_DIR}"
  exit 1
}

PUSHED=0
for ID in ${COUNCILS}; do
  SLUG="$(slug_for "$ID")"
  if [ -z "$SLUG" ]; then
    echo "Warning: Unknown council: $ID — skipping"
    continue
  fi

  SRC="burnley-council/data/${ID}"
  DEST="${WORK_DIR}/${SLUG}/data"

  if [ ! -f "${SRC}/spending-index.json" ]; then
    echo "Warning: ${ID}: no spending-index.json — skipping"
    continue
  fi

  mkdir -p "${DEST}"

  # Determine v3 (year chunks) vs v4 (monthly chunks) from the index
  IS_V4=$(node -e "const d=require('$(pwd)/${SRC}/spending-index.json'); console.log(d.meta?.monthly ? 'yes' : 'no')")

  # Copy spending-index.json
  cp "${SRC}/spending-index.json" "${DEST}/spending-index.json"

  # Copy chunk files
  COUNT=0
  for f in "${SRC}"/spending-20??-??.json; do
    [ -f "$f" ] || continue
    BASE=$(basename "$f")
    if [ "$IS_V4" = "yes" ]; then
      # v4: only copy monthly chunks (01-12), skip year chunks (13-99)
      SUFFIX=$(echo "$BASE" | sed 's/.*-\([0-9][0-9]\)\.json/\1/')
      if [ "$SUFFIX" -le 12 ] 2>/dev/null; then
        cp "$f" "${DEST}/${BASE}"
        COUNT=$((COUNT + 1))
      fi
    else
      # v3: copy all year chunk files
      cp "$f" "${DEST}/${BASE}"
      COUNT=$((COUNT + 1))
    fi
  done

  # For v4 councils: update config.json to enable spending
  if echo " ${V4_COUNCILS} " | grep -q " ${ID} "; then
    if [ -f "${DEST}/config.json" ]; then
      sed -i.bak 's/"spending": false/"spending": true/' "${DEST}/config.json"
      rm -f "${DEST}/config.json.bak"
    fi
  fi

  echo "Done: ${ID} (${SLUG}): spending-index.json + ${COUNT} chunks ($([ "$IS_V4" = "yes" ] && echo "v4 monthly" || echo "v3 yearly"))"
  PUSHED=$((PUSHED + 1))
done

if [ $PUSHED -eq 0 ]; then
  echo "No data to push."
  rm -rf "${WORK_DIR}"
  exit 0
fi

# Commit and push
cd "${WORK_DIR}"
git config user.name "AI DOGE Deploy"
git config user.email "deploy@aidoge.co.uk"
git add -A
if git diff --cached --quiet; then
  echo "No changes to deploy — spending data already up to date"
else
  git commit -m "Push spending data for ${PUSHED} council(s)"
  git push origin gh-pages
  echo ""
  echo "Pushed spending data for ${PUSHED} council(s) to deploy repo"
  echo "  The next CI deploy will restore this data automatically."
fi

# Clean up
cd /
rm -rf "${WORK_DIR}"
