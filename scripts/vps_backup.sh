#!/bin/bash
# VPS Backup Strategy for AI DOGE Infrastructure
#
# Servers:
#   vps-main (76.13.254.176)  — Hostinger, 16GB RAM, Clawdbot, clawd-worker, email
#   vps-news (141.147.79.228) — Oracle, 1GB RAM, News Lancashire, SQLite DBs, ETL
#
# Run from local machine (Mac) or any machine with SSH access to both servers.
# Cron: 0 2 * * 0  ~/clawd/scripts/vps_backup.sh  (weekly, 2am Sunday)
#
# Backup destinations:
#   ~/backups/vps-main/YYYY-MM-DD/
#   ~/backups/vps-news/YYYY-MM-DD/
#
# Retention: 4 weekly backups (older ones auto-deleted)

set -euo pipefail

DATE=$(date +%Y-%m-%d)
BACKUP_ROOT="$HOME/backups"
RETENTION_WEEKS=4

log() { echo "[$(date '+%H:%M:%S')] $1"; }

# ================================
# VPS-MAIN Backup
# ================================
backup_vps_main() {
  local dest="$BACKUP_ROOT/vps-main/$DATE"
  mkdir -p "$dest"
  log "Backing up vps-main → $dest"

  # Clawdbot config & data
  rsync -az --timeout=30 vps-main:/opt/clawdbot/ "$dest/clawdbot/" 2>/dev/null || log "  WARN: clawdbot sync failed"

  # AI DOGE repo (only scripts & config, not node_modules)
  rsync -az --timeout=60 \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='dist' \
    --exclude='*.json' \
    vps-main:/root/aidoge/ "$dest/aidoge/" 2>/dev/null || log "  WARN: aidoge sync failed"

  # Environment files (contain API keys)
  rsync -az --timeout=10 vps-main:/root/.env "$dest/env-root" 2>/dev/null || true
  rsync -az --timeout=10 vps-main:/root/aidoge/.env "$dest/env-aidoge" 2>/dev/null || true

  # Crontab
  ssh -o ConnectTimeout=10 vps-main "crontab -l" > "$dest/crontab.txt" 2>/dev/null || true

  # ECA CRM config
  rsync -az --timeout=30 vps-main:/root/ECA/.env.local "$dest/eca-env" 2>/dev/null || true

  log "  vps-main backup complete ($(du -sh "$dest" | cut -f1))"
}

# ================================
# VPS-NEWS Backup
# ================================
backup_vps_news() {
  local dest="$BACKUP_ROOT/vps-news/$DATE"
  mkdir -p "$dest"
  log "Backing up vps-news → $dest"

  # SQLite databases (critical — news articles, crawl data)
  rsync -az --timeout=60 vps-news:/home/ubuntu/newslancashire/data/*.db "$dest/" 2>/dev/null || log "  WARN: SQLite sync failed"
  rsync -az --timeout=30 vps-news:/home/ubuntu/newslancashire/data/*.json "$dest/" 2>/dev/null || true

  # News Lancashire scripts & config
  rsync -az --timeout=60 \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='public' \
    --exclude='resources' \
    vps-news:/home/ubuntu/newslancashire/scripts/ "$dest/scripts/" 2>/dev/null || log "  WARN: scripts sync failed"

  # Environment files
  rsync -az --timeout=10 vps-news:/home/ubuntu/newslancashire/.env "$dest/env-news" 2>/dev/null || true
  rsync -az --timeout=10 vps-news:/home/ubuntu/.env "$dest/env-ubuntu" 2>/dev/null || true

  # ECA enrichment data & state
  rsync -az --timeout=30 vps-news:/home/ubuntu/eca-leads/enrichment/ "$dest/eca-enrichment/" 2>/dev/null || true

  # News Burnley data
  rsync -az --timeout=30 \
    --exclude='public' \
    --exclude='node_modules' \
    vps-news:/home/ubuntu/newsburnley/ "$dest/newsburnley/" 2>/dev/null || true

  # Crontab
  ssh -o ConnectTimeout=10 vps-news "crontab -l" > "$dest/crontab.txt" 2>/dev/null || true

  log "  vps-news backup complete ($(du -sh "$dest" | cut -f1))"
}

# ================================
# Retention cleanup
# ================================
cleanup_old_backups() {
  for server in vps-main vps-news; do
    local dir="$BACKUP_ROOT/$server"
    if [ -d "$dir" ]; then
      local count=$(ls -d "$dir"/20* 2>/dev/null | wc -l | tr -d ' ')
      if [ "$count" -gt "$RETENTION_WEEKS" ]; then
        local to_delete=$((count - RETENTION_WEEKS))
        log "Cleaning up $to_delete old $server backups"
        ls -d "$dir"/20* | head -n "$to_delete" | while read old; do
          log "  Deleting $old"
          rm -rf "$old"
        done
      fi
    fi
  done
}

# ================================
# Main
# ================================
log "===== VPS Backup Started ====="
log "Date: $DATE, Retention: $RETENTION_WEEKS weeks"

backup_vps_main
backup_vps_news
cleanup_old_backups

log "===== VPS Backup Complete ====="
log "Total backup size: $(du -sh "$BACKUP_ROOT" 2>/dev/null | cut -f1)"
