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
    'lancaster': {
        'search_terms': ['"Lancaster City Council"'],
        'match_names': ['lancaster city council', 'lancaster council', 'city of lancaster'],
    },
    'ribble_valley': {
        'search_terms': ['"Ribble Valley Borough Council"'],
        'match_names': ['ribble valley borough council', 'ribble valley bc', 'ribble valley council'],
    },
    'chorley': {
        'search_terms': ['"Chorley Borough Council"', '"Chorley Council"'],
        'match_names': ['chorley borough council', 'chorley bc', 'chorley council'],
    },
    'south_ribble': {
        'search_terms': ['"South Ribble Borough Council"'],
        'match_names': ['south ribble borough council', 'south ribble bc', 'south ribble council'],
    },
    'lancashire_cc': {
        'search_terms': ['"Lancashire County Council"'],
        'match_names': ['lancashire county council', 'lancashire cc', 'county of lancashire'],
    },
    'blackpool': {
        'search_terms': ['"Blackpool Council"', '"Blackpool Borough Council"'],
        'match_names': ['blackpool council', 'blackpool borough council', 'blackpool bc'],
    },
    'west_lancashire': {
        'search_terms': ['"West Lancashire Borough Council"'],
        'match_names': ['west lancashire borough council', 'west lancashire bc', 'west lancashire council', 'west lancs'],
    },
    'blackburn': {
        'search_terms': ['"Blackburn with Darwen Borough Council"', '"Blackburn with Darwen Council"'],
        'match_names': ['blackburn with darwen borough council', 'blackburn with darwen council', 'blackburn with darwen bc'],
    },
    'wyre': {
        'search_terms': ['"Wyre Council"', '"Wyre Borough Council"'],
        'match_names': ['wyre council', 'wyre borough council', 'wyre bc'],
    },
    'preston': {
        'search_terms': ['"Preston City Council"'],
        'match_names': ['preston city council', 'preston council', 'preston cc'],
    },
    'fylde': {
        'search_terms': ['"Fylde Borough Council"', '"Fylde Council"'],
        'match_names': ['fylde borough council', 'fylde council', 'fylde bc'],
    },
}

CF_SEARCH_URL = 'https://www.contractsfinder.service.gov.uk/api/rest/2/search_notices/json'
CF_NOTICE_URL = 'https://www.contractsfinder.service.gov.uk/Published/Notice/'
CF_OCDS_URL = 'https://www.contractsfinder.service.gov.uk/api/rest/2/ocds'

# Rate limit: 1 request per second, backoff on 403
REQUEST_DELAY = 1.0
OCDS_DELAY = 0.5  # Lighter requests, can be faster
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


def enrich_with_ocds(contracts):
    """Enrich contracts with OCDS data: procedure type, bid count, contract period.

    Fetches /api/rest/2/ocds/{notice_id} for each awarded contract.
    No auth required. Returns enriched contracts list.
    """
    enriched = 0
    total = len([c for c in contracts if c.get('id') and c.get('status') == 'awarded'])
    log(f'  Enriching {total} awarded contracts with OCDS data...')

    for i, contract in enumerate(contracts):
        if not contract.get('id') or contract.get('status') != 'awarded':
            continue

        notice_id = contract['id']
        url = f'{CF_OCDS_URL}/{notice_id}'

        for attempt in range(MAX_RETRIES):
            try:
                resp = requests.get(url, timeout=30, headers={'Accept': 'application/json'})
                if resp.status_code == 404:
                    break  # No OCDS data for this notice
                if resp.status_code == 403:
                    wait = min(120, 30 * (attempt + 1))
                    log(f'    OCDS rate limited, waiting {wait}s...')
                    time.sleep(wait)
                    continue
                resp.raise_for_status()

                ocds = resp.json()
                releases = ocds.get('releases', [])
                if not releases:
                    break

                release = releases[0]
                tender = release.get('tender', {})
                awards = release.get('awards', [])
                award = awards[0] if awards else {}

                # Procedure type
                proc_method = tender.get('procurementMethod', '')
                proc_detail = tender.get('procurementMethodDetails', '')
                contract['procedure_type'] = proc_detail or proc_method or None

                # Bid count from tender.numberOfTenderers or awards statistics
                num_tenderers = tender.get('numberOfTenderers')
                if num_tenderers:
                    contract['bid_count'] = num_tenderers
                elif award:
                    # Some OCDS releases have bid statistics
                    stats = award.get('statistics', [])
                    for stat in stats:
                        if stat.get('id') == 'numberOfTenderers':
                            contract['bid_count'] = stat.get('value')
                            break

                # Contract period
                contracts_list = release.get('contracts', [])
                if contracts_list:
                    period = contracts_list[0].get('period', {})
                    contract['contract_start'] = (period.get('startDate') or '')[:10] or None
                    contract['contract_end'] = (period.get('endDate') or '')[:10] or None

                # Framework flag
                if tender.get('procurementMethodDetails', '').lower().find('framework') >= 0:
                    contract['framework'] = True

                enriched += 1
                break

            except requests.RequestException:
                if attempt < MAX_RETRIES - 1:
                    time.sleep(2 * (attempt + 1))
                break
            except (KeyError, IndexError, ValueError):
                break

        time.sleep(OCDS_DELAY)

        # Progress every 20 contracts
        if (i + 1) % 20 == 0:
            log(f'    Progress: {i + 1}/{total} checked, {enriched} enriched')

    log(f'  OCDS enrichment complete: {enriched}/{total} contracts enriched')
    return contracts


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

    # Competition analysis (from OCDS enrichment)
    bid_counts = [c.get('bid_count') for c in awarded if c.get('bid_count') is not None]
    single_bidder = sum(1 for b in bid_counts if b == 1)
    avg_bids = round(sum(bid_counts) / len(bid_counts), 1) if bid_counts else None

    # Procedure type breakdown
    proc_counts = {}
    for c in contracts:
        pt = c.get('procedure_type')
        if pt:
            proc_counts[pt] = proc_counts.get(pt, 0) + 1

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
        'competition': {
            'contracts_with_bid_data': len(bid_counts),
            'average_bids': avg_bids,
            'single_bidder_count': single_bidder,
            'single_bidder_pct': round(single_bidder / len(bid_counts) * 100, 1) if bid_counts else None,
        } if bid_counts else None,
        'by_procedure_type': proc_counts if proc_counts else None,
    }


def fetch_council_procurement(council_id, published_from='2015-01-01', published_to=None,
                              enrich_ocds=False):
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

    # Optional OCDS enrichment
    if enrich_ocds and all_contracts:
        all_contracts = enrich_with_ocds(all_contracts)

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
    parser.add_argument('--enrich-ocds', action='store_true',
                        help='Enrich awarded contracts with OCDS data (procedure, bids, period)')
    args = parser.parse_args()

    councils = [args.council] if args.council else list(COUNCILS.keys())

    log(f'Procurement ETL starting — {len(councils)} council(s), from {args.since}')
    log(f'Source: Contracts Finder API (no auth required)')
    if args.enrich_ocds:
        log(f'OCDS enrichment: ENABLED (procedure type, bid count, contract period)')
    log('')

    total_contracts = 0
    for council_id in councils:
        log(f'=== {council_id.upper()} ===')
        contracts = fetch_council_procurement(council_id, args.since, args.until,
                                              enrich_ocds=args.enrich_ocds)
        save_procurement(council_id, contracts, dry_run=args.dry_run)
        total_contracts += len(contracts)
        log('')

    log(f'Done — {total_contracts} total contracts across {len(councils)} council(s)')


if __name__ == '__main__':
    main()
