#!/bin/bash
# daily_audit_cron.sh — Run daily audit and commit results to git
#
# Designed for Oracle Free Tier VPS (ARM, always-free) — zero cost.
# Add to crontab: 0 6 * * * /home/aidoge/burnleycouncil/scripts/daily_audit_cron.sh
#
# What it does:
#   1. Pulls latest code from main/feature branch
#   2. Runs daily_audit.py (no npm needed for basic audit)
#   3. Commits audit report to burnley-council/reports/
#   4. Pushes (optional — set AUDIT_PUSH=true)
#   5. Sends webhook notification (optional — set AUDIT_WEBHOOK_URL)

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="${PROJECT_DIR}/burnley-council/logs"
REPORT_DIR="${PROJECT_DIR}/burnley-council/reports"
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
LOG_FILE="${LOG_DIR}/audit_${TIMESTAMP}.log"

# Set these in your environment or .env file:
AUDIT_BRANCH="${AUDIT_BRANCH:-main}"
AUDIT_PUSH="${AUDIT_PUSH:-false}"
AUDIT_BUILD="${AUDIT_BUILD:-false}"  # Set to "true" to also run npm test + build
AUDIT_WEBHOOK_URL="${AUDIT_WEBHOOK_URL:-}"  # Discord/Slack webhook URL

# ── Setup ─────────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR" "$REPORT_DIR"

exec > >(tee -a "$LOG_FILE") 2>&1
echo "=== Daily Audit: $(date) ==="
echo "Project: $PROJECT_DIR"
echo "Branch: $AUDIT_BRANCH"

cd "$PROJECT_DIR"

# ── Pull Latest ───────────────────────────────────────────────────────
echo ""
echo "[1] Pulling latest from origin/$AUDIT_BRANCH..."
git fetch origin "$AUDIT_BRANCH" 2>/dev/null || echo "  (fetch failed — running on local state)"
git checkout "$AUDIT_BRANCH" 2>/dev/null || echo "  (already on branch)"
git pull origin "$AUDIT_BRANCH" 2>/dev/null || echo "  (pull failed — running on local state)"

# ── Run Audit ─────────────────────────────────────────────────────────
echo ""
echo "[2] Running audit..."

AUDIT_FLAGS=""
if [ "$AUDIT_BUILD" = "true" ]; then
    AUDIT_FLAGS="--build"
fi

python3 "$SCRIPT_DIR/daily_audit.py" $AUDIT_FLAGS 2>&1 || true
AUDIT_EXIT=$?

# Check if report was generated
DATE_STR=$(date +%Y-%m-%d)
REPORT_FILE="${REPORT_DIR}/audit_${DATE_STR}.md"

if [ ! -f "$REPORT_FILE" ]; then
    echo "ERROR: Audit report not generated!"
    exit 1
fi

# ── Extract Score ─────────────────────────────────────────────────────
SCORE=$(grep -oP 'Health: \K\d+' "$REPORT_FILE" 2>/dev/null || echo "?")
ERRORS=$(grep -oP 'Errors: \K\d+' "$REPORT_FILE" 2>/dev/null || echo "?")
WARNINGS=$(grep -oP 'Warnings: \K\d+' "$REPORT_FILE" 2>/dev/null || echo "?")

echo ""
echo "[3] Results: Score ${SCORE}/100 — ${ERRORS} errors, ${WARNINGS} warnings"

# ── Commit Report ─────────────────────────────────────────────────────
echo ""
echo "[4] Committing report..."

git add "$REPORT_DIR/" 2>/dev/null || true

if git diff --cached --quiet 2>/dev/null; then
    echo "  No changes to commit (report unchanged)"
else
    git commit -m "audit: ${DATE_STR} — score ${SCORE}/100 (${ERRORS}E/${WARNINGS}W)" \
        --author="AI DOGE Audit Bot <audit@aidoge.co.uk>" 2>/dev/null || true

    if [ "$AUDIT_PUSH" = "true" ]; then
        echo "[5] Pushing to origin..."
        git push origin "$AUDIT_BRANCH" 2>/dev/null || echo "  Push failed"
    else
        echo "[5] Push skipped (set AUDIT_PUSH=true to enable)"
    fi
fi

# ── Webhook Notification ──────────────────────────────────────────────
if [ -n "$AUDIT_WEBHOOK_URL" ]; then
    echo ""
    echo "[6] Sending notification..."

    # Format for Discord/Slack
    EMOJI="✅"
    if [ "$ERRORS" != "0" ] && [ "$ERRORS" != "?" ]; then
        EMOJI="🚨"
    elif [ "$WARNINGS" != "0" ] && [ "$WARNINGS" != "?" ]; then
        EMOJI="⚠️"
    fi

    PAYLOAD=$(cat <<EOJSON
{
  "content": "${EMOJI} **AI DOGE Daily Audit** — ${DATE_STR}\nScore: **${SCORE}/100** | Errors: ${ERRORS} | Warnings: ${WARNINGS}"
}
EOJSON
)

    curl -s -H "Content-Type: application/json" -d "$PAYLOAD" "$AUDIT_WEBHOOK_URL" >/dev/null 2>&1 || true
fi

# ── Cleanup Old Logs ──────────────────────────────────────────────────
# Keep last 30 days of logs
find "$LOG_DIR" -name "audit_*.log" -mtime +30 -delete 2>/dev/null || true
find "$REPORT_DIR" -name "audit_*.md" -mtime +90 -delete 2>/dev/null || true

echo ""
echo "=== Audit complete: $(date) ==="
