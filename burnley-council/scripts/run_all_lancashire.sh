#!/bin/bash
# run_all_lancashire.sh — Process all Lancashire borough councils in one hit
#
# Designed to run on Thurinus VPS (Oracle ARM, free tier) — zero cost.
# Downloads CSVs, runs ETL, generates supplier profiles, validates data.
#
# Usage:
#   ./scripts/run_all_lancashire.sh                     # ETL only (no download)
#   ./scripts/run_all_lancashire.sh --download           # Download + ETL
#   ./scripts/run_all_lancashire.sh --download --build   # Download + ETL + SPA build
#   ./scripts/run_all_lancashire.sh --validate-only      # Just run validation
#   ./scripts/run_all_lancashire.sh --profiles-only      # Just regenerate supplier profiles

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="${PROJECT_DIR}/logs"
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
LOG_FILE="${LOG_DIR}/lancashire_${TIMESTAMP}.log"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# All currently active councils
COUNCILS="burnley hyndburn pendle rossendale"

# Councils planned for expansion (uncomment as parsers are added):
# COUNCILS="$COUNCILS ribble_valley lancaster chorley south_ribble"
# COUNCILS="$COUNCILS west_lancashire wyre fylde preston"

# Parse arguments
DO_DOWNLOAD=false
DO_BUILD=false
DO_VALIDATE_ONLY=false
DO_PROFILES_ONLY=false
DO_CH=false

for arg in "$@"; do
    case $arg in
        --download)       DO_DOWNLOAD=true ;;
        --build)          DO_BUILD=true ;;
        --validate-only)  DO_VALIDATE_ONLY=true ;;
        --profiles-only)  DO_PROFILES_ONLY=true ;;
        --companies-house) DO_CH=true ;;
        *) echo "Unknown option: $arg"; exit 1 ;;
    esac
done

# Header
echo "============================================================" | tee -a "$LOG_FILE"
echo "AI DOGE — Lancashire Borough Council Batch ETL" | tee -a "$LOG_FILE"
echo "Date:     $(date)" | tee -a "$LOG_FILE"
echo "Councils: $COUNCILS" | tee -a "$LOG_FILE"
echo "Options:  download=$DO_DOWNLOAD build=$DO_BUILD ch=$DO_CH" | tee -a "$LOG_FILE"
echo "Log:      $LOG_FILE" | tee -a "$LOG_FILE"
echo "============================================================" | tee -a "$LOG_FILE"

# ─── Validate-only mode ─────────────────────────────────────────
if $DO_VALIDATE_ONLY; then
    echo "" | tee -a "$LOG_FILE"
    echo "Running validation only..." | tee -a "$LOG_FILE"
    python3 "$SCRIPT_DIR/validate_data.py" --all 2>&1 | tee -a "$LOG_FILE"
    echo "Done." | tee -a "$LOG_FILE"
    exit 0
fi

# ─── Profiles-only mode ─────────────────────────────────────────
if $DO_PROFILES_ONLY; then
    echo "" | tee -a "$LOG_FILE"
    echo "Generating supplier profiles only..." | tee -a "$LOG_FILE"
    python3 "$SCRIPT_DIR/generate_supplier_profiles.py" 2>&1 | tee -a "$LOG_FILE"
    echo "Done." | tee -a "$LOG_FILE"
    exit 0
fi

# ─── Main ETL Pipeline ──────────────────────────────────────────
FAILED=""
SUCCEEDED=""

for COUNCIL in $COUNCILS; do
    echo "" | tee -a "$LOG_FILE"
    echo "────────────────────────────────────────────────────────" | tee -a "$LOG_FILE"
    echo "Processing: $COUNCIL" | tee -a "$LOG_FILE"
    echo "────────────────────────────────────────────────────────" | tee -a "$LOG_FILE"

    # Step 1: Download CSVs (if requested and council supports it)
    if $DO_DOWNLOAD; then
        echo "  [1/5] Downloading CSVs..." | tee -a "$LOG_FILE"
        python3 "$SCRIPT_DIR/council_etl.py" --council "$COUNCIL" --download 2>&1 | tee -a "$LOG_FILE" || true
        sleep 5  # Rate limit between councils
    fi

    # Step 2: Run ETL (parse + normalise + insights)
    echo "  [2/5] Running ETL pipeline..." | tee -a "$LOG_FILE"
    if python3 "$SCRIPT_DIR/council_etl.py" --council "$COUNCIL" 2>&1 | tee -a "$LOG_FILE"; then
        SUCCEEDED="$SUCCEEDED $COUNCIL"
    else
        echo "  WARNING: ETL failed for $COUNCIL" | tee -a "$LOG_FILE"
        FAILED="$FAILED $COUNCIL"
        continue  # Skip remaining steps for this council
    fi

    # Step 3: Companies House matching (if requested)
    if $DO_CH; then
        echo "  [3/5] Companies House matching..." | tee -a "$LOG_FILE"
        python3 "$SCRIPT_DIR/council_etl.py" --council "$COUNCIL" --companies-house --ch-batch-size 200 2>&1 | tee -a "$LOG_FILE" || true
        sleep 10  # Respect CH API rate limits (600 req/5min)
    fi

    echo "  Council $COUNCIL complete." | tee -a "$LOG_FILE"
    sleep 2  # Brief pause between councils
done

# ─── Post-Processing (cross-council) ────────────────────────────

echo "" | tee -a "$LOG_FILE"
echo "────────────────────────────────────────────────────────" | tee -a "$LOG_FILE"
echo "Post-processing: Cross-council operations" | tee -a "$LOG_FILE"
echo "────────────────────────────────────────────────────────" | tee -a "$LOG_FILE"

# Step 4: Generate supplier profiles (aggregates across ALL councils)
echo "  [4/5] Generating supplier profiles..." | tee -a "$LOG_FILE"
python3 "$SCRIPT_DIR/generate_supplier_profiles.py" 2>&1 | tee -a "$LOG_FILE" || true

# Step 5: Validate all data
echo "  [5/5] Running data validation..." | tee -a "$LOG_FILE"
python3 "$SCRIPT_DIR/validate_data.py" --all 2>&1 | tee -a "$LOG_FILE" || true

# ─── Build SPAs (if requested) ──────────────────────────────────
if $DO_BUILD; then
    echo "" | tee -a "$LOG_FILE"
    echo "────────────────────────────────────────────────────────" | tee -a "$LOG_FILE"
    echo "Building SPAs" | tee -a "$LOG_FILE"
    echo "────────────────────────────────────────────────────────" | tee -a "$LOG_FILE"

    # Council → base path mapping (matches aidoge.co.uk/lancashire/{council}council/)
    declare -A BASE_PATHS
    BASE_PATHS[burnley]="/lancashire/burnleycouncil/"
    BASE_PATHS[hyndburn]="/lancashire/hyndburncouncil/"
    BASE_PATHS[pendle]="/lancashire/pendlecouncil/"
    BASE_PATHS[rossendale]="/lancashire/rossendalecouncil/"
    # BASE_PATHS[ribble_valley]="/lancashire/ribblevalleycouncil/"

    for COUNCIL in $COUNCILS; do
        BASE="${BASE_PATHS[$COUNCIL]}"
        if [ -n "$BASE" ]; then
            echo "  Building SPA: $COUNCIL (base: $BASE)" | tee -a "$LOG_FILE"
            bash "$SCRIPT_DIR/build_council.sh" "$COUNCIL" "$BASE" 2>&1 | tee -a "$LOG_FILE" || true
        else
            echo "  WARNING: No base path for $COUNCIL, skipping build" | tee -a "$LOG_FILE"
        fi
    done
fi

# ─── Summary ────────────────────────────────────────────────────
echo "" | tee -a "$LOG_FILE"
echo "============================================================" | tee -a "$LOG_FILE"
echo "BATCH COMPLETE" | tee -a "$LOG_FILE"
echo "  Succeeded: $SUCCEEDED" | tee -a "$LOG_FILE"
echo "  Failed:    ${FAILED:-none}" | tee -a "$LOG_FILE"
echo "  Log:       $LOG_FILE" | tee -a "$LOG_FILE"
echo "  Time:      $(date)" | tee -a "$LOG_FILE"
echo "============================================================" | tee -a "$LOG_FILE"
