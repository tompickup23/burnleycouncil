#!/bin/bash
# build_council.sh — Build a council SPA from shared React codebase
# Usage: ./scripts/build_council.sh <council_id> <base_path>
# Example: ./scripts/build_council.sh hyndburn /hyndburn/
#          ./scripts/build_council.sh burnley /burnleycouncil/

set -e

# Ensure homebrew tools are available (macOS)
export PATH="/opt/homebrew/bin:$PATH"

COUNCIL=${1:?Usage: $0 <council_id> <base_path>}
BASE=${2:?Usage: $0 <council_id> <base_path>}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
APP_DIR="$(dirname "$PROJECT_DIR")"    # clawd root (contains src/, public/, package.json)
DATA_DIR="$PROJECT_DIR/data/$COUNCIL"
DEPLOY_DIR="$PROJECT_DIR/burnley-app"  # gh-pages deployment directory

echo "============================================================"
echo "AI DOGE — Building SPA for: $COUNCIL (base: $BASE)"
echo "  SPA source:  $APP_DIR"
echo "  Data source:  $DATA_DIR"
echo "  Deploy target: $DEPLOY_DIR"
echo "============================================================"

# Check data directory exists
if [ ! -d "$DATA_DIR" ]; then
    echo "ERROR: Data directory not found: $DATA_DIR"
    echo "Run: python scripts/council_etl.py --council $COUNCIL first"
    exit 1
fi

# Check spending.json exists
if [ ! -f "$DATA_DIR/spending.json" ]; then
    echo "ERROR: spending.json not found in $DATA_DIR"
    exit 1
fi

# Clean council-specific data from previous build
echo "  Cleaning previous data..."
rm -f "$APP_DIR/public/data/"*.json
rm -rf "$APP_DIR/public/data/articles"

# Copy council-specific data to the SPA's public/data directory
echo "  Copying data files..."
cp "$DATA_DIR/spending.json" "$APP_DIR/public/data/spending.json"
cp "$DATA_DIR/insights.json" "$APP_DIR/public/data/insights.json"
cp "$DATA_DIR/metadata.json" "$APP_DIR/public/data/metadata.json"

# Copy config.json (council-specific)
if [ -f "$DATA_DIR/config.json" ]; then
    cp "$DATA_DIR/config.json" "$APP_DIR/public/data/config.json"
    echo "  Using council config: $DATA_DIR/config.json"
fi

# Copy optional data files if they exist
for OPTIONAL in revenue_trends.json budgets_govuk.json budgets_summary.json crime_stats.json budgets.json budget_insights.json councillors.json politics_summary.json wards.json doge_findings.json articles-index.json meetings.json doge_knowledge.json foi_templates.json pay_comparison.json doge_insights.json; do
    if [ -f "$DATA_DIR/$OPTIONAL" ]; then
        cp "$DATA_DIR/$OPTIONAL" "$APP_DIR/public/data/$OPTIONAL"
        echo "  Copied: $OPTIONAL"
    fi
done

# Copy articles directory if it exists
if [ -d "$DATA_DIR/articles" ]; then
    mkdir -p "$APP_DIR/public/data/articles"
    cp "$DATA_DIR/articles/"*.json "$APP_DIR/public/data/articles/"
    ARTICLE_COUNT=$(ls "$DATA_DIR/articles/"*.json 2>/dev/null | wc -l | tr -d ' ')
    echo "  Copied: articles/ ($ARTICLE_COUNT files)"
fi

# Build with the specified base path
echo "  Building SPA with VITE_BASE=$BASE ..."
cd "$APP_DIR"

# Ensure node_modules exist
if [ ! -d "node_modules" ]; then
    echo "  Installing dependencies..."
    npm install
fi

VITE_BASE="$BASE" npx vite build 2>&1

# Output directory
DIST_DIR="$APP_DIR/dist"
echo ""
echo "  Build complete!"
echo "  Output: $DIST_DIR"
echo "  Files: $(find "$DIST_DIR" -type f | wc -l | tr -d ' ') files"
echo "  Size: $(du -sh "$DIST_DIR" | cut -f1)"

# Copy to deployment directory
DEPLOY_SUBDIR="$DEPLOY_DIR/${BASE#/}"
DEPLOY_SUBDIR="${DEPLOY_SUBDIR%/}"
if [ -d "$DEPLOY_DIR" ]; then
    echo ""
    echo "  Deploying to: $DEPLOY_SUBDIR"
    rm -rf "$DEPLOY_SUBDIR"
    mkdir -p "$DEPLOY_SUBDIR"
    cp -r "$DIST_DIR/"* "$DEPLOY_SUBDIR/"
    echo "  Deployed!"
fi

echo ""
echo "============================================================"
