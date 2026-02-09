#!/bin/bash
# AI DOGE — Data Sync to Git
# After ETL runs, copies generated data into the git repo on vps-main
# and optionally commits + pushes. Called by auto_pipeline.py after successful ETL.
# 
# This does NOT auto-push by default. Set AUTOPUSH=1 to enable.
# Cron: Not cron'd directly — called by auto_pipeline.py

set -euo pipefail
LOG=/root/clawd-worker/logs/data_sync.log
REPO=/root/aidoge
DATA_SRC=/root/clawd-worker/aidoge/data
AUTOPUSH="${AUTOPUSH:-0}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') [$1] $2" >> "$LOG"; }

log INFO "=== Data sync to git starting ==="

# Copy generated data files into the git repo
for council in burnley hyndburn pendle rossendale; do
    SRC="$DATA_SRC/$council"
    DST="$REPO/burnley-council/data/$council"
    
    if [ ! -d "$SRC" ]; then
        continue
    fi
    
    mkdir -p "$DST"
    
    # Only sync specific generated files (not supplier_profiles which are huge)
    for file in spending.json taxonomy.json insights.json metadata.json doge_findings.json doge_verification.json; do
        if [ -f "$SRC/$file" ]; then
            cp "$SRC/$file" "$DST/$file"
            log INFO "Copied $council/$file"
        fi
    done
done

# Copy shared data
if [ -d "$DATA_SRC/shared" ]; then
    mkdir -p "$REPO/burnley-council/data/shared"
    cp -r "$DATA_SRC/shared/"* "$REPO/burnley-council/data/shared/" 2>/dev/null || true
fi

cd "$REPO"

# Check if anything changed
if git diff --quiet -- burnley-council/data/; then
    log INFO "No data changes to commit"
else
    CHANGED=$(git diff --stat -- burnley-council/data/ | tail -1)
    log INFO "Data changes: $CHANGED"
    
    if [ "$AUTOPUSH" = "1" ]; then
        git add burnley-council/data/*/spending.json \
              burnley-council/data/*/taxonomy.json \
              burnley-council/data/*/insights.json \
              burnley-council/data/*/metadata.json \
              burnley-council/data/*/doge_findings.json \
              burnley-council/data/*/doge_verification.json \
              burnley-council/data/shared/ 2>/dev/null || true
        
        git commit -m "Auto: Update council data $(date '+%Y-%m-%d')" 2>>"$LOG"
        git push origin main 2>>"$LOG"
        log INFO "Committed and pushed data update"
    else
        log INFO "AUTOPUSH not enabled — data staged in repo but not committed"
        log INFO "Run: cd $REPO && git add burnley-council/data/ && git commit -m 'Update data'"
    fi
fi

log INFO "=== Data sync complete ==="
