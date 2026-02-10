#!/usr/bin/env python3
"""
Charity Commission ETL — Cross-check council suppliers against the Charity Commission register.

Usage:
    python3 charity_etl.py                    # All 4 councils
    python3 charity_etl.py --council pendle   # Single council (Pendle has best data)
    python3 charity_etl.py --dry-run          # Preview without saving

Data source: https://register-of-charities.charitycommission.gov.uk
API: GET /api/v1/charity/{number} (no auth, rate limit ~1000/day)

Also searches by name for suppliers without explicit charity numbers,
using known charity keywords (trust, foundation, charity, etc.).
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent / 'data'

COUNCILS = ['burnley', 'hyndburn', 'pendle', 'rossendale']

CC_API_BASE = 'https://api.charitycommission.gov.uk/register/api'
CC_SEARCH_URL = f'{CC_API_BASE}/allcharitydetailsV2'
CC_REGISTER_URL = 'https://register-of-charities.charitycommission.gov.uk/charity-search/-/charity-details'

# Keywords that suggest a supplier might be a charity
CHARITY_KEYWORDS = [
    'charity', 'trust', 'foundation', 'hospice', 'citizens advice',
    'mind', 'shelter', 'age uk', 'barnardos', 'ymca', 'ywca',
    'red cross', 'samaritans', 'nspcc', 'rspca', 'oxfam',
    'salvation army', 'church', 'parish', 'diocese',
    'community', 'voluntary', 'housing association',
]

# Rate limiting
REQUEST_DELAY = 0.5
MAX_RETRIES = 2
CACHE_FILE = DATA_DIR / 'charity_cache.json'


def log(msg):
    print(f'[{datetime.now().strftime("%H:%M:%S")}] {msg}')


def load_cache():
    """Load cached charity lookups to avoid redundant API calls."""
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def save_cache(cache):
    """Save charity lookup cache."""
    with open(CACHE_FILE, 'w') as f:
        json.dump(cache, f, indent=2)


def lookup_charity_by_number(charity_number, cache):
    """Look up a charity by its registration number."""
    charity_number = str(charity_number).strip()
    if not charity_number or not charity_number.isdigit():
        return None

    cache_key = f'num:{charity_number}'
    if cache_key in cache:
        return cache[cache_key]

    url = f'{CC_API_BASE}/allcharitydetailsV2/{charity_number}/0'
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, timeout=15,
                                headers={'Accept': 'application/json'})
            if resp.status_code == 404:
                cache[cache_key] = None
                return None
            if resp.status_code == 429:
                log(f'  Rate limited, waiting 30s...')
                time.sleep(30)
                continue
            resp.raise_for_status()
            data = resp.json()
            result = parse_charity_data(data, charity_number)
            cache[cache_key] = result
            return result
        except requests.RequestException as e:
            log(f'  API error for {charity_number}: {e}')
            time.sleep(2 * (attempt + 1))

    return None


def search_charity_by_name(name, cache):
    """Search for a charity by name (fuzzy match)."""
    name_clean = re.sub(r'[^a-z0-9 ]', '', name.lower()).strip()
    if not name_clean or len(name_clean) < 5:
        return None

    cache_key = f'name:{name_clean[:50]}'
    if cache_key in cache:
        return cache[cache_key]

    # Use the Charity Commission search API
    url = f'{CC_API_BASE}/searchCharityName/{requests.utils.quote(name_clean[:100])}/1'
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, timeout=15,
                                headers={'Accept': 'application/json'})
            if resp.status_code in (404, 400):
                cache[cache_key] = None
                return None
            if resp.status_code == 429:
                time.sleep(30)
                continue
            resp.raise_for_status()
            results = resp.json()

            if not results:
                cache[cache_key] = None
                return None

            # Take the first result and look up full details
            if isinstance(results, list) and len(results) > 0:
                first = results[0]
                charity_num = first.get('charity_number') or first.get('registered_charity_number')
                if charity_num:
                    result = lookup_charity_by_number(str(charity_num), cache)
                    cache[cache_key] = result
                    return result

            cache[cache_key] = None
            return None
        except requests.RequestException as e:
            log(f'  Search error for "{name_clean[:30]}": {e}')
            time.sleep(2 * (attempt + 1))

    return None


def parse_charity_data(data, charity_number):
    """Parse Charity Commission API response into our schema."""
    if not data:
        return None

    # Handle different API response formats
    if isinstance(data, list):
        data = data[0] if data else {}

    name = data.get('charity_name', data.get('name', ''))
    status = data.get('charity_registration_status', data.get('status', 'unknown'))

    # Parse financial data
    income = data.get('latest_income')
    expenditure = data.get('latest_expenditure')

    return {
        'charity_number': str(charity_number),
        'name': name,
        'status': status.lower() if status else 'unknown',
        'date_of_registration': data.get('date_of_registration'),
        'date_of_removal': data.get('date_of_removal'),
        'latest_income': income,
        'latest_expenditure': expenditure,
        'charity_type': data.get('charity_type', ''),
        'url': f'{CC_REGISTER_URL}/{charity_number}',
        'verified': True,
    }


def is_potential_charity(supplier_name):
    """Check if a supplier name suggests it might be a charity."""
    name_lower = supplier_name.lower()
    return any(kw in name_lower for kw in CHARITY_KEYWORDS)


def process_council(council_id, cache, dry_run=False):
    """Process a single council's spending data for charity cross-checks."""
    spending_path = DATA_DIR / council_id / 'spending.json'
    if not spending_path.exists():
        log(f'  No spending data for {council_id}')
        return {}

    with open(spending_path) as f:
        spending_data = json.load(f)

    # Handle v2 format
    records = spending_data.get('records', spending_data) if isinstance(spending_data, dict) else spending_data
    if isinstance(records, dict):
        records = records.get('records', [])

    # Collect unique suppliers and their charity numbers
    suppliers = {}
    for r in records:
        supplier = r.get('supplier_canonical', r.get('supplier', '')).strip()
        if not supplier:
            continue

        charity_num = r.get('charity_number', '')
        amount = r.get('amount', 0)

        if supplier not in suppliers:
            suppliers[supplier] = {
                'charity_number': charity_num if charity_num else None,
                'total_spend': 0,
                'transaction_count': 0,
                'is_potential': is_potential_charity(supplier),
            }

        suppliers[supplier]['total_spend'] += amount
        suppliers[supplier]['transaction_count'] += 1

        # Update charity number if we find one
        if charity_num and not suppliers[supplier]['charity_number']:
            suppliers[supplier]['charity_number'] = charity_num

    # Phase 1: Look up suppliers with explicit charity numbers
    verified = []
    unverified_potential = []
    not_found = []

    suppliers_with_numbers = {s: d for s, d in suppliers.items() if d['charity_number']}
    potential_charities = {s: d for s, d in suppliers.items()
                          if d['is_potential'] and not d['charity_number'] and d['total_spend'] >= 1000}

    log(f'  {len(suppliers_with_numbers)} suppliers with charity numbers')
    log(f'  {len(potential_charities)} potential charities by name (spend >= £1K)')

    # Look up by number
    for supplier, data in suppliers_with_numbers.items():
        charity_info = lookup_charity_by_number(data['charity_number'], cache)
        time.sleep(REQUEST_DELAY)

        if charity_info:
            verified.append({
                'supplier': supplier,
                'charity': charity_info,
                'total_spend': round(data['total_spend'], 2),
                'transactions': data['transaction_count'],
                'match_method': 'charity_number',
            })
        else:
            not_found.append({
                'supplier': supplier,
                'claimed_number': data['charity_number'],
                'total_spend': round(data['total_spend'], 2),
                'transactions': data['transaction_count'],
            })

    # Phase 2: Search by name for potential charities (limited to top 50 by spend)
    top_potential = sorted(potential_charities.items(), key=lambda x: -x[1]['total_spend'])[:50]
    for supplier, data in top_potential:
        charity_info = search_charity_by_name(supplier, cache)
        time.sleep(REQUEST_DELAY)

        if charity_info:
            verified.append({
                'supplier': supplier,
                'charity': charity_info,
                'total_spend': round(data['total_spend'], 2),
                'transactions': data['transaction_count'],
                'match_method': 'name_search',
            })
        else:
            unverified_potential.append({
                'supplier': supplier,
                'total_spend': round(data['total_spend'], 2),
                'transactions': data['transaction_count'],
            })

    verified.sort(key=lambda x: -x['total_spend'])
    not_found.sort(key=lambda x: -x['total_spend'])
    unverified_potential.sort(key=lambda x: -x['total_spend'])

    result = {
        'verified_charities': verified,
        'invalid_charity_numbers': not_found,
        'potential_unregistered': unverified_potential[:20],
        'stats': {
            'total_suppliers': len(suppliers),
            'with_charity_number': len(suppliers_with_numbers),
            'verified_count': len(verified),
            'invalid_numbers': len(not_found),
            'potential_charities_checked': len(top_potential),
            'total_charity_spend': round(sum(v['total_spend'] for v in verified), 2),
        },
    }

    log(f'  Verified: {len(verified)} charities (£{sum(v["total_spend"] for v in verified):,.0f})')
    log(f'  Invalid numbers: {len(not_found)}')
    log(f'  Potential unregistered: {len(unverified_potential)}')

    return result


def save_results(council_id, results, dry_run=False):
    """Save charity cross-check results."""
    if dry_run:
        log(f'  [DRY RUN] Would save charity data for {council_id}')
        return

    out_dir = DATA_DIR / council_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / 'charity_check.json'

    output = {
        'meta': {
            'council_id': council_id,
            'source': 'Charity Commission Register (charitycommission.gov.uk)',
            'generated': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        },
        **results,
    }

    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2)

    size_kb = out_path.stat().st_size / 1024
    log(f'  Saved {out_path} ({size_kb:.1f} KB)')


def main():
    parser = argparse.ArgumentParser(description='Cross-check council suppliers against Charity Commission')
    parser.add_argument('--council', choices=COUNCILS,
                        help='Single council (default: all)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Preview without saving or API calls')
    args = parser.parse_args()

    councils = [args.council] if args.council else COUNCILS
    cache = load_cache()

    log(f'Charity Commission cross-check starting — {len(councils)} council(s)')
    log(f'Cache: {len(cache)} entries')
    log('')

    for council_id in councils:
        log(f'=== {council_id.upper()} ===')
        results = process_council(council_id, cache, dry_run=args.dry_run)
        save_results(council_id, results, dry_run=args.dry_run)
        log('')

    save_cache(cache)
    log(f'Cache updated: {len(cache)} entries')
    log('Done')


if __name__ == '__main__':
    main()
