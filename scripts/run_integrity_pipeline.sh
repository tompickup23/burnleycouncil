#!/bin/bash
# Weekly integrity pipeline — runs councillor_integrity_etl.py for all councils
# and auto-commits/pushes results to trigger deploy

set -e
cd /root/aidoge

# Pull latest code first
git pull --ff-only origin main

echo "[$(date)] Starting integrity ETL for all councils..."
python3 burnley-council/scripts/councillor_integrity_etl.py --all 2>&1

echo "[$(date)] ETL complete. Checking for changes..."

# Check if any integrity files changed
if git diff --quiet burnley-council/data/*/integrity.json burnley-council/data/shared/integrity_cross_council.json 2>/dev/null; then
    echo "[$(date)] No integrity changes detected. Skipping commit."
    exit 0
fi

echo "[$(date)] Changes detected. Committing and pushing..."
git add burnley-council/data/*/integrity.json
git add burnley-council/data/shared/integrity_cross_council.json 2>/dev/null || true
git commit -m "data: refresh integrity analysis (v7 weekly pipeline)"
git push origin main

echo "[$(date)] Pushed to main. Deploy will trigger automatically."
