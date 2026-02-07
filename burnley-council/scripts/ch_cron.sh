#!/bin/bash
# ch_cron.sh — Companies House batch matching cron job
# Runs monthly on Thurinus. Matches unmatched suppliers for all councils.
# Uses the existing council_etl.py --companies-house flag.
#
# Usage: ./ch_cron.sh (no args — runs all councils)
# Cron:  0 3 1 * * ~/aidoge/scripts/ch_cron.sh >> ~/aidoge/logs/ch_cron.log 2>&1

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$(dirname "$SCRIPT_DIR")/data"
LOG_DIR="$(dirname "$SCRIPT_DIR")/logs"
TIMESTAMP=$(date +"%Y-%m-%d_%H:%M:%S")

echo "=========================================="
echo "CH Matching Cron — $TIMESTAMP"
echo "=========================================="

# Check API key is set
if [ -z "$COMPANIES_HOUSE_API_KEY" ]; then
    # Try loading from .env
    if [ -f ~/aidoge/.env ]; then
        export $(grep -v '^#' ~/aidoge/.env | xargs)
    fi
fi

if [ -z "$COMPANIES_HOUSE_API_KEY" ]; then
    echo "ERROR: COMPANIES_HOUSE_API_KEY not set"
    echo "Set it in ~/aidoge/.env or export it"
    exit 1
fi

COUNCILS="burnley hyndburn pendle"

for COUNCIL in $COUNCILS; do
    echo ""
    echo "--- Processing $COUNCIL ---"

    # Check if data directory exists
    if [ ! -f "$DATA_DIR/$COUNCIL/spending.json" ]; then
        echo "  Skipping $COUNCIL — no spending.json"
        continue
    fi

    # Run CH matching with batch size of 200 (conservative for rate limits)
    python3 "$SCRIPT_DIR/council_etl.py" \
        --council "$COUNCIL" \
        --companies-house \
        --ch-batch-size 200 \
        --ch-api-key "$COMPANIES_HOUSE_API_KEY" \
        --data-dir "$DATA_DIR" \
        --taxonomy "$DATA_DIR/taxonomy.json" \
        2>&1 | tee -a "$LOG_DIR/ch_${COUNCIL}_${TIMESTAMP}.log"

    echo "  $COUNCIL complete"

    # Brief pause between councils
    sleep 10
done

echo ""
echo "All councils processed at $(date)"
echo "=========================================="
