#!/bin/bash
# Deploy News Burnley from vps-main (NOT vps-news — 1GB OOM risk)
# Pattern: rsync output from vps-news → wrangler deploy from vps-main (16GB)
# Created: 9 Feb 2026
# Fixed: 9 Feb 2026 — removed hardcoded credentials, removed NVM dependency

set -euo pipefail
DEPLOY_DIR=/tmp/newsburnley-deploy
VPS_NEWS=vps-news
LOG_TAG="[NB Deploy]"

echo "$(date '+%Y-%m-%d %H:%M') $LOG_TAG Starting..."

# Create local deploy dir
rm -rf $DEPLOY_DIR
mkdir -p $DEPLOY_DIR

# Rsync News Burnley output from vps-news
rsync -az --delete $VPS_NEWS:/home/ubuntu/newsburnley/public/ $DEPLOY_DIR/

# Check we have content
if [ ! -f $DEPLOY_DIR/index.html ]; then
    echo "ERROR: No index.html in deploy dir — aborting"
    exit 1
fi

FILE_COUNT=$(find $DEPLOY_DIR -type f | wc -l)
echo "$LOG_TAG Files to deploy: $FILE_COUNT"

# Load Cloudflare credentials from vps-news .env
eval $(ssh $VPS_NEWS "grep CLOUDFLARE /home/ubuntu/newslancashire/.env")
export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID

# Deploy via wrangler (runs on vps-main with 16GB RAM)
npx wrangler pages deploy $DEPLOY_DIR \
    --project-name=newsburnley \
    --branch=main 2>&1 | tail -5

echo "$(date '+%Y-%m-%d %H:%M') $LOG_TAG Deploy complete"
rm -rf $DEPLOY_DIR
