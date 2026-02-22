#!/usr/bin/env python3
"""
ipsa_etl.py — MP expenses data from IPSA for AI DOGE Lancashire

Downloads annual totalSpend and otherInfo CSVs from IPSA and extracts
expenses data for Lancashire constituency MPs. Merges into constituencies.json.

Data source: https://www.theipsa.org.uk/mp-staffing-business-costs/annual-publications
  - totalSpend: Office, staffing, accommodation, travel, other costs per MP
  - otherInfo: Salary, connected party staff, loans per MP

Usage:
    python3 ipsa_etl.py                    # Merge into constituencies.json
    python3 ipsa_etl.py --year 23_24       # Specific year
    python3 ipsa_etl.py --dry-run          # Preview without saving
    python3 ipsa_etl.py --standalone       # Output standalone expenses.json

Output: Updates mp.expenses in burnley-council/data/shared/constituencies.json
"""

import argparse
import csv
import io
import json
import re
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent / 'data'
SHARED_DIR = DATA_DIR / 'shared'

IPSA_BASE = 'https://www.theipsa.org.uk/api/download'

# Lancashire constituency names as they appear in IPSA data (suffix BC/CC)
# Maps our constituency_id to IPSA constituency name patterns
LANCASHIRE_CONSTITUENCIES = {
    'burnley': 'Burnley',
    'hyndburn': 'Hyndburn',
    'pendle_and_clitheroe': 'Pendle and Clitheroe',
    'rossendale_and_darwen': 'Rossendale and Darwen',
    'lancaster_and_wyre': 'Lancaster and Wyre',
    'morecambe_and_lunesdale': 'Morecambe and Lunesdale',
    'ribble_valley': 'Ribble Valley',
    'chorley': 'Chorley',
    'south_ribble': 'South Ribble',
    'preston': 'Preston',
    'west_lancashire': 'West Lancashire',
    'fylde': 'Fylde',
    'blackpool_north_and_fleetwood': 'Blackpool North and Fleetwood',
    'blackpool_south': 'Blackpool South',
    'blackburn': 'Blackburn',
    'southport': 'Southport',
}

# MP salary for 2024-25 (from IPSA annual determination)
MP_SALARY_2024_25 = 91346


def log(msg):
    print(f'[{datetime.now().strftime("%H:%M:%S")}] {msg}', file=sys.stderr)


def parse_money(val):
    """Parse IPSA money string like '£12,345.67' or '-£1,234.56' to float."""
    if not val or val == 'N/A' or val == '':
        return 0.0
    val = val.strip().replace('£', '').replace(',', '')
    try:
        return float(val)
    except ValueError:
        return 0.0


def download_csv(csv_type, year, cache_dir=None):
    """Download an IPSA CSV and return parsed rows.

    Uses curl as fallback when Python's SSL (LibreSSL 2.8.3) can't do TLS 1.3.
    Caches downloads to avoid re-fetching.
    """
    if cache_dir is None:
        cache_dir = Path('/tmp')
    cache_file = cache_dir / f'ipsa_{csv_type}_{year}.csv'

    # Use cached file if fresh (< 24 hours)
    if cache_file.exists():
        import os
        age_hours = (time.time() - os.path.getmtime(cache_file)) / 3600
        if age_hours < 24:
            log(f'  Using cached {csv_type} for {year} ({age_hours:.1f}h old)')
            text = cache_file.read_text(encoding='utf-8-sig')
            reader = csv.DictReader(io.StringIO(text))
            rows = list(reader)
            log(f'    Got {len(rows)} rows')
            return rows

    url = f'{IPSA_BASE}?type={csv_type}&year={year}'
    log(f'  Downloading {csv_type} for {year}...')

    # Try Python urllib first
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'AI-DOGE-Lancashire/1.0 (transparency platform)',
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            text = raw.decode('utf-8-sig')
            cache_file.write_text(text, encoding='utf-8')
            reader = csv.DictReader(io.StringIO(text))
            rows = list(reader)
            log(f'    Got {len(rows)} rows')
            return rows
    except Exception as e:
        log(f'    urllib failed ({e}), trying curl...')

    # Fallback to curl (handles TLS 1.3)
    import subprocess
    try:
        result = subprocess.run(
            ['curl', '-sL', url, '-o', str(cache_file)],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0 and cache_file.exists():
            text = cache_file.read_text(encoding='utf-8-sig')
            reader = csv.DictReader(io.StringIO(text))
            rows = list(reader)
            log(f'    Got {len(rows)} rows (via curl)')
            return rows
        else:
            log(f'    curl failed: {result.stderr}')
    except Exception as e:
        log(f'    curl fallback failed: {e}')

    return []


def match_constituency(row, year):
    """Extract constituency name from a row, handling 2024-25 dual-column format."""
    # 2024-25 has both "Previous constituency" and "Constituency since 5 July 2024"
    # We want the current one for new MPs, or previous for outgoing MPs
    current = row.get('Constituency since 5 July 2024', '').strip()
    previous = row.get('Previous constituency', '').strip()
    legacy = row.get('Constituency', '').strip()

    # Use current constituency if available (new/continuing MPs)
    if current and current != 'N/A':
        return current
    # For pre-2024 years, use the single 'Constituency' column
    if legacy:
        return legacy
    # For outgoing MPs (2024-25), they only have 'Previous constituency'
    if previous and previous != 'N/A':
        return previous
    return ''


def normalize_constituency_name(raw):
    """Strip suffixes like ' BC', ' CC' and normalize to match our IDs."""
    name = raw.strip()
    # Remove BC (Borough Constituency) and CC (County Constituency)
    name = re.sub(r'\s+(BC|CC)$', '', name)
    return name


def find_lancashire_mp(rows, constituency_pattern, year):
    """Find the current Lancashire MP in IPSA rows by constituency match.

    For 2024-25, prefers the current MP (has 'Constituency since 5 July 2024')
    over the outgoing MP (only has 'Previous constituency').
    """
    target = constituency_pattern.lower()

    current_match = None
    previous_match = None

    for row in rows:
        # Check current constituency (post-Jul 2024)
        current_const = row.get('Constituency since 5 July 2024', '').strip()
        if current_const and current_const != 'N/A':
            normalized = normalize_constituency_name(current_const).lower()
            if normalized == target:
                current_match = row
                break  # Current MP found — use them

        # Check previous constituency (pre-Jul 2024)
        prev_const = row.get('Previous constituency', '').strip()
        if prev_const and prev_const != 'N/A':
            normalized = normalize_constituency_name(prev_const).lower()
            if normalized == target and not previous_match:
                previous_match = row

        # Check single constituency column (pre-2024 years)
        legacy_const = row.get('Constituency', '').strip()
        if legacy_const:
            normalized = normalize_constituency_name(legacy_const).lower()
            if normalized == target:
                current_match = row
                break

    return current_match or previous_match


def extract_totalspend(row, year):
    """Extract expense data from a totalSpend row."""
    office_spend = parse_money(row.get('Office spend', ''))
    staffing_spend = parse_money(row.get('Staffing spend', ''))
    accommodation_spend = parse_money(row.get('Accommodation spend', ''))
    travel = parse_money(row.get('Travel and subsistence (uncapped)', ''))
    other = parse_money(row.get('Other costs (uncapped)', ''))
    winding_up = parse_money(row.get('Winding-up spend', ''))

    total = office_spend + staffing_spend + accommodation_spend + travel + other + winding_up

    return {
        'office_costs': round(office_spend, 2),
        'staffing': round(staffing_spend, 2),
        'accommodation': round(accommodation_spend, 2),
        'travel': round(travel, 2),
        'other': round(other, 2),
        'winding_up': round(winding_up, 2),
        'total_claimed': round(total, 2),
        'office_budget': parse_money(row.get('Office budget', '')),
        'staffing_budget': parse_money(row.get('Staffing budget', '')),
        'accommodation_budget': parse_money(row.get('Accommodation budget', '')),
        'pid': row.get('pID', '').strip(),
    }


def extract_otherinfo(row):
    """Extract salary and other info from otherInfo row."""
    salary = parse_money(row.get('Basic salary', ''))
    additional_salary = parse_money(row.get('Additional salary', ''))

    # IPSA returns pro-rata salary for MPs elected mid-year (e.g. July 2024 GE).
    # Always use the annual salary rate for display purposes.
    if salary > 0 and salary < MP_SALARY_2024_25:
        salary = MP_SALARY_2024_25

    return {
        'salary': round(salary, 2),
        'additional_salary': round(additional_salary, 2),
        'additional_salary_reason': row.get('Reason for additional salary', '').strip(),
        'connected_party_name': row.get('Connected party name', '').strip() or None,
        'connected_party_job': row.get('Connected party job title', '').strip() or None,
    }


def compute_rank(all_expenses, mp_total):
    """Compute rank out of all MPs by total claimed."""
    if not all_expenses:
        return None
    totals = sorted([e['total_claimed'] for e in all_expenses], reverse=True)
    for i, t in enumerate(totals):
        if mp_total >= t:
            return i + 1
    return len(totals)


def main():
    parser = argparse.ArgumentParser(
        description='IPSA expenses ETL for AI DOGE Lancashire'
    )
    parser.add_argument('--year', default='24_25',
                        help='IPSA year code (e.g. 24_25, 23_24)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Preview without saving')
    parser.add_argument('--standalone', action='store_true',
                        help='Output standalone expenses.json instead of merging')
    args = parser.parse_args()

    year = args.year
    year_display = f'20{year[:2]}-{year[3:]}'
    log(f'IPSA Expenses ETL — year {year_display}')

    # Download both CSVs
    totalspend_rows = download_csv('totalSpend', year)
    time.sleep(0.5)
    otherinfo_rows = download_csv('otherInfo', year)

    if not totalspend_rows:
        log('ERROR: No totalSpend data downloaded')
        sys.exit(1)

    # Extract ALL MPs' totals for ranking
    all_expenses = []
    for row in totalspend_rows:
        raw_const = match_constituency(row, year)
        if not raw_const:
            continue
        data = extract_totalspend(row, year)
        all_expenses.append(data)

    log(f'  Total MPs in dataset: {len(all_expenses)}')

    # Find Lancashire MPs
    expenses = {}
    for cid, pattern in LANCASHIRE_CONSTITUENCIES.items():
        spend_row = find_lancashire_mp(totalspend_rows, pattern, year)
        if not spend_row:
            log(f'  WARNING: No totalSpend data for {pattern}')
            continue

        data = extract_totalspend(spend_row, year)
        # Column name has BOM + curly quote variations: "MP's name" or "MP\u2019s name"
        mp_name = ''
        for key in spend_row:
            if 'mp' in key.lower() and 'name' in key.lower():
                mp_name = spend_row[key].strip()
                break

        # Find matching otherInfo row by pID or name
        info_data = {}
        pid = data.get('pid', '')
        if pid and otherinfo_rows:
            for orow in otherinfo_rows:
                if orow.get('pID', '').strip() == pid:
                    info_data = extract_otherinfo(orow)
                    break

        # Compute rank
        rank = compute_rank(all_expenses, data['total_claimed'])

        expense_record = {
            'year': year_display,
            'mp_name': mp_name,
            'total_claimed': data['total_claimed'],
            'office_costs': data['office_costs'],
            'staffing': data['staffing'],
            'accommodation': data['accommodation'],
            'travel': data['travel'],
            'other': data['other'],
            'winding_up': data['winding_up'],
            'salary': info_data.get('salary', MP_SALARY_2024_25),
            'additional_salary': info_data.get('additional_salary', 0),
            'total_cost_to_taxpayer': round(
                data['total_claimed'] + info_data.get('salary', MP_SALARY_2024_25)
                + info_data.get('additional_salary', 0), 2
            ),
            'rank_of_650': rank,
            'connected_party': info_data.get('connected_party_name'),
            'connected_party_job': info_data.get('connected_party_job'),
        }

        expenses[cid] = expense_record
        log(f'  {pattern}: {mp_name} — £{data["total_claimed"]:,.2f} claimed (rank {rank}/{len(all_expenses)})')

    log(f'\nFound expenses for {len(expenses)}/{len(LANCASHIRE_CONSTITUENCIES)} constituencies')

    if args.standalone or args.dry_run:
        output = {
            'meta': {
                'generated': datetime.now().isoformat(timespec='seconds'),
                'year': year_display,
                'source': 'IPSA (Independent Parliamentary Standards Authority)',
                'url': 'https://www.theipsa.org.uk/mp-staffing-business-costs/annual-publications',
                'constituencies_count': len(expenses),
            },
            'expenses': expenses,
        }
        print(json.dumps(output, indent=2, ensure_ascii=False))
        if args.dry_run:
            log(f'\n--- DRY RUN complete ---')
        return

    # Merge into constituencies.json
    const_path = SHARED_DIR / 'constituencies.json'
    if not const_path.exists():
        log(f'WARNING: {const_path} not found — saving standalone expenses.json')
        SHARED_DIR.mkdir(parents=True, exist_ok=True)
        out_path = SHARED_DIR / 'expenses.json'
        output = {
            'meta': {
                'generated': datetime.now().isoformat(timespec='seconds'),
                'year': year_display,
                'source': 'IPSA',
            },
            'expenses': expenses,
        }
        out_path.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding='utf-8')
        log(f'Written: {out_path}')
        return

    # Load existing constituencies.json and merge
    data = json.loads(const_path.read_text(encoding='utf-8'))
    merged = 0
    for const in data.get('constituencies', []):
        cid = const.get('id')
        if cid in expenses:
            const['mp']['expenses'] = expenses[cid]
            merged += 1

    # Update meta
    data['meta']['expenses_year'] = year_display
    data['meta']['expenses_source'] = 'IPSA'
    data['meta']['expenses_updated'] = datetime.now().isoformat(timespec='seconds')

    const_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
    log(f'\nMerged expenses for {merged} MPs into {const_path}')


if __name__ == '__main__':
    main()
