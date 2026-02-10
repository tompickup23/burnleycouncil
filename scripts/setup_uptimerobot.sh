#!/bin/bash
# UptimeRobot Monitoring Setup for AI DOGE
#
# Prerequisites:
#   1. Create free account at https://uptimerobot.com
#   2. Get API key from: Dashboard → Integrations & API → API → Main API key
#   3. Set UPTIMEROBOT_API_KEY env var
#
# Free plan: 50 monitors, 5-minute intervals, email alerts
# This script creates monitors for all 4 council sites + key data endpoints
#
# Usage: UPTIMEROBOT_API_KEY=your_key_here bash scripts/setup_uptimerobot.sh

set -euo pipefail

API_KEY="${UPTIMEROBOT_API_KEY:-}"
API_URL="https://api.uptimerobot.com/v2"

if [ -z "$API_KEY" ]; then
  echo "ERROR: Set UPTIMEROBOT_API_KEY environment variable"
  echo "Get your key from: UptimeRobot Dashboard → Integrations & API → API"
  exit 1
fi

# Rate limit: 10 req/min on free plan. Space requests 7s apart to be safe.
DELAY=7

create_monitor() {
  local name="$1"
  local url="$2"
  local type="${3:-1}"  # 1=HTTP(s), 3=keyword, 4=port, 5=ping
  local keyword="${4:-}"

  echo "Creating monitor: $name → $url"

  local payload="api_key=$API_KEY&format=json&type=$type&friendly_name=$name&url=$url&interval=300"

  # For keyword monitors, add keyword params
  if [ "$type" = "2" ] && [ -n "$keyword" ]; then
    payload="$payload&keyword_type=1&keyword_value=$keyword"
  fi

  response=$(curl -s -X POST "$API_URL/newMonitor" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "$payload")

  status=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('stat',''))" 2>/dev/null || echo "error")

  if [ "$status" = "ok" ]; then
    echo "  ✓ Created successfully"
  else
    error=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',{}).get('message','Unknown error'))" 2>/dev/null || echo "$response")
    echo "  ✗ Failed: $error"
  fi

  sleep "$DELAY"
}

echo "======================================="
echo "AI DOGE — UptimeRobot Monitor Setup"
echo "======================================="
echo ""

# Council homepages (HTTP keyword monitors — check for actual content)
echo "--- Council Site Monitors ---"
create_monitor "DOGE Burnley - Homepage" "https://aidoge.co.uk/lancashire/burnleycouncil/" "2" "Spending Explorer"
create_monitor "DOGE Hyndburn - Homepage" "https://aidoge.co.uk/lancashire/hyndburncouncil/" "2" "Spending Explorer"
create_monitor "DOGE Pendle - Homepage" "https://aidoge.co.uk/lancashire/pendlecouncil/" "2" "Spending Explorer"
create_monitor "DOGE Rossendale - Homepage" "https://aidoge.co.uk/lancashire/rossendalecouncil/" "2" "Spending Explorer"

# Data endpoints (JSON files — check they return valid JSON)
echo ""
echo "--- Data Endpoint Monitors ---"
create_monitor "DOGE Burnley - Config" "https://aidoge.co.uk/lancashire/burnleycouncil/data/config.json" "2" "council_id"
create_monitor "DOGE Burnley - Spending Index" "https://aidoge.co.uk/lancashire/burnleycouncil/data/spending-index.json" "2" "years"
create_monitor "DOGE Burnley - DOGE Findings" "https://aidoge.co.uk/lancashire/burnleycouncil/data/doge_findings.json" "2" "findings"
create_monitor "DOGE Burnley - Articles" "https://aidoge.co.uk/lancashire/burnleycouncil/data/articles-index.json" "2" "title"

# Hub / root domain
echo ""
echo "--- Hub Monitor ---"
create_monitor "DOGE Hub - Root" "https://aidoge.co.uk/" "1"

# RSS feeds
echo ""
echo "--- RSS Feed Monitors ---"
create_monitor "DOGE Burnley - RSS" "https://aidoge.co.uk/lancashire/burnleycouncil/rss.xml" "2" "rss"
create_monitor "DOGE Hyndburn - RSS" "https://aidoge.co.uk/lancashire/hyndburncouncil/rss.xml" "2" "rss"

echo ""
echo "======================================="
echo "Setup complete! 11 monitors created."
echo "View dashboard: https://dashboard.uptimerobot.com"
echo "======================================="
