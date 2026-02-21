#!/usr/bin/env python3
"""
sync_polls_to_reference.py — Sync polling.json → elections_reference.json

After poll_aggregator.py produces polling.json, this script updates the
national_polling section of elections_reference.json so the election
prediction model uses the latest data.

Usage:
    python3 scripts/sync_polls_to_reference.py
    python3 scripts/sync_polls_to_reference.py --dry-run
"""

import json
import sys
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
SHARED_DIR = REPO_ROOT / 'burnley-council' / 'data' / 'shared'

POLLING_PATH = SHARED_DIR / 'polling.json'
REFERENCE_PATH = SHARED_DIR / 'elections_reference.json'


def log(msg):
    print(f'[{datetime.now().strftime("%H:%M:%S")}] {msg}', file=sys.stderr)


def main():
    dry_run = '--dry-run' in sys.argv

    if not POLLING_PATH.exists():
        log(f'ERROR: {POLLING_PATH} not found — run poll_aggregator.py first')
        sys.exit(1)

    if not REFERENCE_PATH.exists():
        log(f'ERROR: {REFERENCE_PATH} not found')
        sys.exit(1)

    polling = json.loads(POLLING_PATH.read_text(encoding='utf-8'))
    reference = json.loads(REFERENCE_PATH.read_text(encoding='utf-8'))

    # Extract aggregate from polling.json
    aggregate = polling.get('aggregate', {})
    if not aggregate:
        log('ERROR: No aggregate data in polling.json')
        sys.exit(1)

    # Map to the 6-party format used by elections_reference.json
    # polling.json uses canonical names already
    MAIN_PARTIES = ['Reform UK', 'Labour', 'Conservative', 'Green Party', 'Liberal Democrats']
    new_parties = {}
    total = 0
    for party in MAIN_PARTIES:
        pct = aggregate.get(party, 0)
        new_parties[party] = round(pct, 3)
        total += pct

    # Other = remainder
    new_parties['Other'] = round(max(0, 1.0 - total), 3)

    # Get the latest poll date
    latest_date = polling.get('meta', {}).get('latest_poll_date', datetime.now().strftime('%Y-%m-%d'))
    source = polling.get('meta', {}).get('source', 'poll_aggregator.py weighted average')

    # Show comparison
    old_parties = reference.get('national_polling', {}).get('parties', {})
    old_date = reference.get('national_polling', {}).get('latest_date', 'unknown')

    log(f'\n--- Polling Update: {old_date} → {latest_date} ---')
    for party in MAIN_PARTIES + ['Other']:
        old_val = old_parties.get(party, 0)
        new_val = new_parties.get(party, 0)
        diff = new_val - old_val
        arrow = '↑' if diff > 0.001 else '↓' if diff < -0.001 else '→'
        log(f'  {party:20s}: {old_val*100:5.1f}% → {new_val*100:5.1f}%  {arrow} {diff*100:+.1f}pp')

    if dry_run:
        log('\n--- DRY RUN: No changes written ---')
        return

    # Update reference
    reference['national_polling']['parties'] = new_parties
    reference['national_polling']['latest_date'] = latest_date
    reference['national_polling']['source'] = source
    reference['meta']['generated'] = datetime.now().strftime('%Y-%m-%d')

    REFERENCE_PATH.write_text(
        json.dumps(reference, indent=2, ensure_ascii=False) + '\n',
        encoding='utf-8'
    )
    log(f'\nUpdated: {REFERENCE_PATH}')


if __name__ == '__main__':
    main()
