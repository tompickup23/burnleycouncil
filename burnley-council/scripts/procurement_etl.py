#!/usr/bin/env python3
"""
Procurement ETL — Fetch contract data from Contracts Finder API for East Lancashire councils.

Usage:
    python3 procurement_etl.py                    # All 4 councils
    python3 procurement_etl.py --council burnley   # Single council
    python3 procurement_etl.py --since 2020-01-01  # Custom date range
    python3 procurement_etl.py --dry-run           # Preview without saving

Output:
    burnley-council/data/{council_id}/procurement.json

Data source: https://www.contractsfinder.service.gov.uk
API: POST /api/rest/2/search_notices/json (no auth required)
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

# Council name variants to search (Contracts Finder uses free-text keyword search)
COUNCILS = {
    'burnley': {
        'search_terms': ['"Burnley Borough Council"'],
        'match_names': ['burnley borough council', 'burnley bc', 'burnley council'],
    },
    'hyndburn': {
        'search_terms': ['"Hyndburn Borough Council"', '"Borough of Hyndburn"'],
        'match_names': ['hyndburn borough council', 'borough of hyndburn', 'hyndburn bc', 'hyndburn council'],
    },
    'pendle': {
        'search_terms': ['"Pendle Borough Council"', '"Borough of Pendle"'],
        'match_names': ['pendle borough council', 'borough of pendle', 'pendle bc', 'pendle council'],
    },
    'rossendale': {
        'search_terms': ['"Rossendale Borough Council"', '"Borough of Rossendale"'],
        'match_names': ['rossendale borough council', 'borough of rossendale', 'rossendale bc', 'rossendale council'],
    },
}

CF_SEARCH_URL = 'https://www.contractsfinder.service.gov.uk/api/rest/2/search_notices/json'
CF_NOTICE_URL = 'https://www.contractsfinder.service.gov.uk/Published/Notice/'

# Rate limit: 1 request per second, backoff on 403
REQUEST_DELAY = 1.0
MAX_RETRIES = 3

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent / 'data'


def log(msg):
    print(f'[{datetime.now().strftime("%H:%M:%S")}] {msg}')


def search_contracts(keyword, published_from='2015-01-01', published_to=None, page_size=100):
    """Search Contracts Finder V2 API for notices matching keyword."""
    if published_to is None:
        published_to = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    else:
        published_to = f'{published_to}T23:59:59Z'

    published_from = f'{published_from}T00:00:00Z'

    all_notices = []
    page = 1

    while True:
        payload = {
            'searchCriteria': {
                'keyword': keyword,
                'publishedFrom': published_from,
                'publishedTo': published_to,
            },
            'size': page_size,
            'from': (page - 1) * page_size,
        }

        for attempt in range(MAX_RETRIES):
            try:
                resp = requests.post(CF_SEARCH_URL, json=payload, timeout=60,
                                     headers={'Content-Type': 'application/json'})

                if resp.status_code == 403:
                    wait = min(300, 60 * (attempt + 1))
                    log(f'  Rate limited (403), waiting {wait}s...')
                    time.sleep(wait)
                    continue

                resp.raise_for_status()
                break
            except requests.RequestException as e:
                log(f'  Request error (attempt {attempt + 1}): {e}')
                time.sleep(5 * (attempt + 1))
        else:
            log(f'  Failed after {MAX_RETRIES} attempts for keyword "{keyword}", page {page}')
            break

        data = resp.json()
        raw_notices = data.get('noticeList', [])

        if not raw_notices:
            break

        # API returns {"score": N, "item": {...fields...}} — unwrap item
        notices = [n.get('item', n) for n in raw_notices]
        all_notices.extend(notices)
        total = data.get('hitCount', 0)
        log(f'  Page {page}: {len(notices)} notices (total: {total})')

        # Cap at 1000 raw results per keyword — filter happens client-side
        if len(all_notices) >= min(total, 1000):
            break

        page += 1
        time.sleep(REQUEST_DELAY)

    return all_notices


def matches_council(notice, match_names):
    """Check if a notice belongs to the target council."""
    org = (notice.get('organisationName') or '').lower().strip()
    return any(name in org for name in match_names)


def parse_notice(notice):
    """Convert raw Contracts Finder notice to our internal schema."""
    # Parse dates safely
    def parse_date(val):
        if not val:
            return None
        try:
            # Handle various ISO formats
            for fmt in ['%Y-%m-%dT%H:%M:%S.%fZ', '%Y-%m-%dT%H:%M:%SZ', '%Y-%m-%dT%H:%M:%S']:
                try:
                    return datetime.strptime(val[:26], fmt).strftime('%Y-%m-%d')
                except ValueError:
                    continue
            return val[:10] if len(val) >= 10 else None
        except (ValueError, TypeError):
            return None

    # Extract awarded info
    awarded_value = notice.get('awardedValue')
    awarded_supplier = notice.get('awardedSupplier')
    awarded_date = parse_date(notice.get('awardedDate'))

    # Determine contract status
    status = (notice.get('noticeStatus') or 'unknown').lower()

    return {
        'id': notice.get('id', ''),
        'title': (notice.get('title') or '').strip(),
        'description': (notice.get('description') or '').strip()[:500],  # Truncate long descriptions
        'organisation': (notice.get('organisationName') or '').strip(),
        'status': status,
        'notice_type': (notice.get('noticeType') or '').strip(),
        'published_date': parse_date(notice.get('publishedDate')),
        'deadline_date': parse_date(notice.get('deadlineDate')),
        'awarded_date': awarded_date,
        'value_low': notice.get('valueLow'),
        'value_high': notice.get('valueHigh'),
        'awarded_value': awarded_value,
        'awarded_supplier': (awarded_supplier or '').strip() if awarded_supplier else None,
        'awarded_to_sme': notice.get('awardedToSme'),
        'cpv_codes': notice.get('cpvCodes', []),
        'cpv_description': (notice.get('cpvDescription') or '').strip(),
        'region': (notice.get('regionText') or '').strip(),
        'postcode': (notice.get('postcode') or '').strip(),
        'suitable_for_sme': notice.get('isSuitableForSme'),
        'url': f"{CF_NOTICE_URL}{notice.get('id', '')}" if notice.get('id') else None,
    }


def compute_stats(contracts):
    """Compute summary statistics for a set of contracts."""
    total = len(contracts)
    awarded = [c for c in contracts if c['status'] == 'awarded']
    open_notices = [c for c in contracts if c['status'] == 'open']

    # Value stats
    awarded_values = [c['awarded_value'] for c in awarded if c['awarded_value'] and c['awarded_value'] > 0]
    total_awarded_value = sum(awarded_values)
    avg_value = total_awarded_value / len(awarded_values) if awarded_values else 0

    # SME stats
    sme_awarded = sum(1 for c in awarded if c.get('awarded_to_sme'))

    # Top suppliers
    supplier_counts = {}
    supplier_values = {}
    for c in awarded:
        s = c.get('awarded_supplier')
        if s:
            supplier_counts[s] = supplier_counts.get(s, 0) + 1
            if c.get('awarded_value'):
                supplier_values[s] = supplier_values.get(s, 0) + c['awarded_value']

    top_suppliers = sorted(supplier_counts.items(), key=lambda x: x[1], reverse=True)[:10]

    # Notice types breakdown
    type_counts = {}
    for c in contracts:
        t = c.get('notice_type', 'Unknown')
        type_counts[t] = type_counts.get(t, 0) + 1

    # Year breakdown
    year_counts = {}
    for c in contracts:
        d = c.get('published_date', '')
        if d and len(d) >= 4:
            year = d[:4]
            year_counts[year] = year_counts.get(year, 0) + 1

    return {
        'total_notices': total,
        'awarded_count': len(awarded),
        'open_count': len(open_notices),
        'total_awarded_value': round(total_awarded_value, 2),
        'average_awarded_value': round(avg_value, 2),
        'sme_awarded_count': sme_awarded,
        'sme_awarded_pct': round(sme_awarded / len(awarded) * 100, 1) if awarded else 0,
        'top_suppliers': [{'name': s, 'contracts': c, 'total_value': round(supplier_values.get(s, 0), 2)} for s, c in top_suppliers],
        'by_type': type_counts,
        'by_year': dict(sorted(year_counts.items())),
    }


def fetch_council_procurement(council_id, published_from='2015-01-01', published_to=None):
    """Fetch all procurement data for a single council."""
    config = COUNCILS[council_id]
    all_contracts = []
    seen_ids = set()

    for term in config['search_terms']:
        log(f'Searching: "{term}"')
        raw_notices = search_contracts(term, published_from, published_to)
        log(f'  Found {len(raw_notices)} raw notices')

        # Filter to actual matches (keyword search can be broad)
        for notice in raw_notices:
            if not matches_council(notice, config['match_names']):
                continue

            notice_id = notice.get('id', '')
            if notice_id in seen_ids:
                continue
            seen_ids.add(notice_id)

            parsed = parse_notice(notice)
            all_contracts.append(parsed)

    # Sort by published date descending
    all_contracts.sort(key=lambda c: c.get('published_date') or '', reverse=True)

    log(f'  Matched {len(all_contracts)} contracts for {council_id}')
    return all_contracts


def save_procurement(council_id, contracts, dry_run=False):
    """Save procurement data to JSON file."""
    stats = compute_stats(contracts)

    output = {
        'meta': {
            'council_id': council_id,
            'source': 'Contracts Finder (contractsfinder.service.gov.uk)',
            'generated': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'total_notices': stats['total_notices'],
        },
        'stats': stats,
        'contracts': contracts,
    }

    if dry_run:
        log(f'  [DRY RUN] Would save {len(contracts)} contracts for {council_id}')
        log(f'  Stats: {stats["total_notices"]} total, {stats["awarded_count"]} awarded, '
            f'£{stats["total_awarded_value"]:,.0f} total value')
        if stats['top_suppliers']:
            log(f'  Top supplier: {stats["top_suppliers"][0]["name"]} ({stats["top_suppliers"][0]["contracts"]} contracts)')
        return

    out_dir = DATA_DIR / council_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / 'procurement.json'

    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2)

    size_kb = out_path.stat().st_size / 1024
    log(f'  Saved {out_path} ({size_kb:.1f} KB, {len(contracts)} contracts)')


def main():
    parser = argparse.ArgumentParser(description='Fetch procurement data from Contracts Finder')
    parser.add_argument('--council', choices=list(COUNCILS.keys()),
                        help='Single council to fetch (default: all)')
    parser.add_argument('--since', default='2015-01-01',
                        help='Start date for search (YYYY-MM-DD, default: 2015-01-01)')
    parser.add_argument('--until', default=None,
                        help='End date for search (YYYY-MM-DD, default: today)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Preview without saving files')
    args = parser.parse_args()

    councils = [args.council] if args.council else list(COUNCILS.keys())

    log(f'Procurement ETL starting — {len(councils)} council(s), from {args.since}')
    log(f'Source: Contracts Finder API (no auth required)')
    log('')

    total_contracts = 0
    for council_id in councils:
        log(f'=== {council_id.upper()} ===')
        contracts = fetch_council_procurement(council_id, args.since, args.until)
        save_procurement(council_id, contracts, dry_run=args.dry_run)
        total_contracts += len(contracts)
        log('')

    log(f'Done — {total_contracts} total contracts across {len(councils)} council(s)')


if __name__ == '__main__':
    main()
