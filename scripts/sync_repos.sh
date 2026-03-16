#!/bin/bash
# AI DOGE — Repository Sync Script
# Keeps vps-main in sync with GitHub, syncs scripts to vps-news
# Runs daily via cron. Safe: won't pull if local changes exist.
# Cron: 0 5 * * * /root/aidoge/scripts/sync_repos.sh

set -euo pipefail
LOG=/root/clawd-worker/logs/sync_repos.log
REPO=/root/aidoge
ALERT_URL='http://127.0.0.1:18789/api/send'
TOKEN="${OPENCLAW_TOKEN:-7fa99c995e62569c0dab81de19b94b998918e33086540b15}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') [$1] $2" >> "$LOG"; }

send_alert() {
    curl -s -X POST "$ALERT_URL" \
        -H "Authorization: Bearer $TOKEN" \
        -H 'Content-Type: application/json' \
        -d "{\"to\": \"+447308907628\", \"body\": \"$1\"}" \
        > /dev/null 2>&1 || true
}

log INFO "=== Sync starting ==="

# --- Step 1: Pull aidoge repo on vps-main ---
cd "$REPO"

# Check for local changes (untracked files are OK, only tracked changes matter)
if [ -n "$(git diff --quiet HEAD 2>/dev/null; echo $?)" ] && ! git diff --quiet HEAD 2>/dev/null; then
    log WARN "Local changes detected in $REPO — skipping pull"
    send_alert "⚠️ Sync: vps-main has uncommitted changes, skipping git pull"
else
    git fetch origin main 2>>"$LOG"
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse origin/main)
    
    if [ "$LOCAL" != "$REMOTE" ]; then
        if git pull origin main --ff-only 2>>"$LOG"; then
            BEHIND=$(git log --oneline "$LOCAL".."$REMOTE" | wc -l)
            log INFO "Pulled $BEHIND new commits"
            send_alert "✅ Sync: vps-main pulled $BEHIND commits from GitHub"
        else
            log ERROR "git pull failed — possible divergence"
            send_alert "❌ Sync: git pull failed on vps-main. Manual fix needed."
        fi
    else
        log INFO "Already up to date"
    fi
fi

# --- Step 2: Sync scripts to vps-news ---
# Only sync if scripts changed in recent commits
SCRIPTS_CHANGED=$(git diff --name-only HEAD~1 HEAD -- burnley-council/scripts/ 2>/dev/null || echo "")

if [ -n "$SCRIPTS_CHANGED" ]; then
    log INFO "Script changes detected, syncing to vps-news..."
    if rsync -az "$REPO/burnley-council/scripts/" vps-news:~/aidoge/scripts/ 2>>"$LOG"; then
        log INFO "Scripts synced to vps-news"
    else
        log ERROR "rsync to vps-news failed"
        send_alert "❌ Sync: Failed to rsync scripts to vps-news"
    fi
else
    log INFO "No script changes — skipping vps-news sync"
fi

log INFO "=== Sync complete ==="
