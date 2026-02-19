#!/usr/bin/env python3
"""
elections_etl.py — Election results ETL for AI DOGE Lancashire

Ingests DCLEAPIL bulk CSV (2006-2024) and outputs elections.json per council.
Data source: DCLEAPIL v1.0, CC BY-SA 4.0 (Figshare)

Usage:
    python3 elections_etl.py --council burnley
    python3 elections_etl.py --all
    python3 elections_etl.py --council burnley --download   # Force re-download

Output: burnley-council/data/{council_id}/elections.json
"""

import argparse
import csv
import json
import os
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, '..', 'data')
CACHE_DIR = os.path.join(SCRIPT_DIR, 'election_data_cache')

DCLEAPIL_URL = 'https://ndownloader.figshare.com/files/54165896'
DCLEAPIL_FILE = os.path.join(CACHE_DIR, 'dcleapil_results.csv')

# Map our council_id to DCLEAPIL council name
COUNCIL_MAP = {
    'burnley': 'Burnley',
    'hyndburn': 'Hyndburn',
    'pendle': 'Pendle',
    'rossendale': 'Rossendale',
    'lancaster': 'Lancaster',
    'ribble_valley': 'Ribble Valley',
    'chorley': 'Chorley',
    'south_ribble': 'South Ribble',
    'preston': 'Preston',
    'west_lancashire': 'West Lancashire',
    'wyre': 'Wyre',
    'fylde': 'Fylde',
    'lancashire_cc': 'Lancashire',
    'blackpool': 'Blackpool',
    'blackburn': 'Blackburn with Darwen',
}

# Council metadata
COUNCIL_META = {
    'burnley':          {'tier': 'district', 'cycle': 'thirds', 'seats_per_ward': 3},
    'hyndburn':         {'tier': 'district', 'cycle': 'thirds', 'seats_per_ward': 3},
    'pendle':           {'tier': 'district', 'cycle': 'thirds', 'seats_per_ward': 3},
    'rossendale':       {'tier': 'district', 'cycle': 'thirds', 'seats_per_ward': 3},
    'lancaster':        {'tier': 'district', 'cycle': 'thirds', 'seats_per_ward': 3},
    'ribble_valley':    {'tier': 'district', 'cycle': 'all_out', 'seats_per_ward': None},  # varies
    'chorley':          {'tier': 'district', 'cycle': 'thirds', 'seats_per_ward': 3},
    'south_ribble':     {'tier': 'district', 'cycle': 'thirds', 'seats_per_ward': 3},
    'preston':          {'tier': 'district', 'cycle': 'thirds', 'seats_per_ward': 3},
    'west_lancashire':  {'tier': 'district', 'cycle': 'thirds', 'seats_per_ward': 3},
    'wyre':             {'tier': 'district', 'cycle': 'all_out', 'seats_per_ward': 3},
    'fylde':            {'tier': 'district', 'cycle': 'all_out', 'seats_per_ward': None},  # varies
    'lancashire_cc':    {'tier': 'county', 'cycle': 'all_out', 'seats_per_ward': 1},
    'blackpool':        {'tier': 'unitary', 'cycle': 'thirds', 'seats_per_ward': 3},
    'blackburn':        {'tier': 'unitary', 'cycle': 'thirds', 'seats_per_ward': 3},
}

# Councils with May 2026 elections confirmed
MAY_2026_COUNCILS = {'burnley', 'chorley', 'hyndburn', 'pendle', 'preston', 'west_lancashire', 'blackburn'}

# Party name normalisation
PARTY_NORMALISE = {
    'Labour Party': 'Labour',
    'Labour and Co-operative Party': 'Labour & Co-operative',
    'Conservative and Unionist Party': 'Conservative',
    'Conservative Party': 'Conservative',
    'Liberal Democrats': 'Liberal Democrats',
    'Liberal Democrat': 'Liberal Democrats',
    'Green Party': 'Green Party',
    'The Green Party': 'Green Party',
    'UK Independence Party (UKIP)': 'UKIP',
    'UK Independence Party': 'UKIP',
    'Reform UK': 'Reform UK',
    'The Brexit Party': 'Brexit Party',
    'British National Party': 'BNP',
    'Trade Unionist and Socialist Coalition': 'TUSC',
    'English Democrats': 'English Democrats',
    'The Yorkshire Party': 'Yorkshire Party',
    'Heritage Party': 'Heritage Party',
    'Social Democratic Party': 'SDP',
    'Workers Party of Britain': 'Workers Party',
    "Workers' Party of Britain": 'Workers Party',
    'Plaid Cymru - The Party of Wales': 'Plaid Cymru',
    'Scottish National Party (SNP)': 'SNP',
}

# Party colors (matching councillors_etl.py)
PARTY_COLORS = {
    'Labour': '#DC241F',
    'Labour & Co-operative': '#DC241F',
    'Conservative': '#0087DC',
    'Liberal Democrats': '#FAA61A',
    'Green Party': '#6AB023',
    'Reform UK': '#12B6CF',
    'UKIP': '#70147A',
    'Brexit Party': '#12B6CF',
    'BNP': '#2C2863',
    'Independent': '#808080',
    'TUSC': '#EC008C',
    'English Democrats': '#800020',
    'SDP': '#FF6B00',
    'Workers Party': '#C41E3A',
    'Heritage Party': '#8B4513',
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def normalise_party(raw_name):
    """Normalise party name from DCLEAPIL format to our standard."""
    raw = raw_name.strip()
    if raw in PARTY_NORMALISE:
        return PARTY_NORMALISE[raw]
    # Independent variants
    if 'independent' in raw.lower() or raw.startswith('Ind ') or raw == 'Ind':
        return 'Independent'
    return raw


def normalise_ward_name(name):
    """Normalise ward name for matching (case-insensitive, space-normalised, strip 'Ward' suffix)."""
    n = ' '.join(name.lower().split())
    # Strip trailing ' ward' suffix (Lancaster uses 'Bare Ward', 'Bulk Ward' etc.)
    if n.endswith(' ward'):
        n = n[:-5].strip()
    return n


def match_ward_name(dcleapil_ward, known_wards):
    """Match a DCLEAPIL ward name to our wards.json names.
    Returns the matched name or None."""
    norm = normalise_ward_name(dcleapil_ward)
    for kw in known_wards:
        if normalise_ward_name(kw) == norm:
            return kw
    # Try without 'with' spacing: 'Coal Clough With' -> 'Coalclough with'
    norm_nospace = norm.replace(' with ', 'with').replace('coal clough', 'coalclough')
    for kw in known_wards:
        kw_norm = normalise_ward_name(kw).replace(' with ', 'with').replace('coal clough', 'coalclough')
        if kw_norm == norm_nospace:
            return kw
    # Try 'and' vs '&' and hyphen variations
    norm_and = norm.replace(' and ', '-').replace('-with-', ' with ')
    for kw in known_wards:
        kw_norm = normalise_ward_name(kw).replace(' and ', '-').replace('-with-', ' with ')
        if kw_norm == norm_and:
            return kw
    # Try substring matching — only if name is 5+ chars to avoid false matches
    # e.g. DCLEAPIL 'Carnforth' matches 'Carnforth and Millhead Ward'
    if len(norm) >= 5:
        for kw in known_wards:
            kw_norm = normalise_ward_name(kw)
            if norm in kw_norm or kw_norm in norm:
                return kw
    return None


def safe_float(val, default=None):
    """Safely parse float from CSV field."""
    try:
        return float(val) if val and val.strip() else default
    except (ValueError, TypeError):
        return default


def safe_int(val, default=None):
    """Safely parse int from CSV field."""
    try:
        return int(float(val)) if val and val.strip() else default
    except (ValueError, TypeError):
        return default


def download_dcleapil(force=False):
    """Download DCLEAPIL CSV if not cached."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    if os.path.exists(DCLEAPIL_FILE) and not force:
        size_mb = os.path.getsize(DCLEAPIL_FILE) / 1024 / 1024
        print(f'  DCLEAPIL CSV cached ({size_mb:.1f}MB)')
        return
    print(f'  Downloading DCLEAPIL CSV (~133MB)...')
    urllib.request.urlretrieve(DCLEAPIL_URL, DCLEAPIL_FILE)
    size_mb = os.path.getsize(DCLEAPIL_FILE) / 1024 / 1024
    print(f'  Downloaded {size_mb:.1f}MB')


# ---------------------------------------------------------------------------
# Load existing council data
# ---------------------------------------------------------------------------

def load_wards_json(council_id):
    """Load wards.json for the council to get current ward names."""
    path = os.path.join(DATA_DIR, council_id, 'wards.json')
    if os.path.exists(path):
        with open(path, 'r') as f:
            return json.load(f)
    return {}


def load_councillors_json(council_id):
    """Load councillors.json for current holders."""
    path = os.path.join(DATA_DIR, council_id, 'councillors.json')
    if os.path.exists(path):
        with open(path, 'r') as f:
            return json.load(f)
    return []


def load_politics_summary(council_id):
    """Load politics_summary.json for seat counts."""
    path = os.path.join(DATA_DIR, council_id, 'politics_summary.json')
    if os.path.exists(path):
        with open(path, 'r') as f:
            return json.load(f)
    return {}


# ---------------------------------------------------------------------------
# Parse DCLEAPIL for one council
# ---------------------------------------------------------------------------

def parse_dcleapil_for_council(council_id):
    """Parse DCLEAPIL CSV and extract all rows for a specific council."""
    dcleapil_name = COUNCIL_MAP[council_id]
    rows = []
    with open(DCLEAPIL_FILE, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['council'] == dcleapil_name:
                rows.append(row)
    return rows


# ---------------------------------------------------------------------------
# Build elections.json for one council
# ---------------------------------------------------------------------------

def build_elections_json(council_id, dcleapil_rows):
    """Transform DCLEAPIL rows into elections.json format."""
    meta = COUNCIL_META[council_id]
    wards_json = load_wards_json(council_id)
    councillors = load_councillors_json(council_id)
    politics = load_politics_summary(council_id)
    known_wards = list(wards_json.keys())

    # Group rows by election (ward + date)
    elections_by_ward = defaultdict(list)
    legacy_wards = defaultdict(list)
    unmatched_wards = set()

    for row in dcleapil_rows:
        ward_raw = row['ward']
        matched = match_ward_name(ward_raw, known_wards)
        if matched:
            elections_by_ward[matched].append(row)
        else:
            legacy_wards[ward_raw].append(row)
            unmatched_wards.add(ward_raw)

    if unmatched_wards:
        print(f'    Legacy/unmatched wards ({len(unmatched_wards)}): {sorted(unmatched_wards)[:5]}...')

    # Build ward data
    wards_output = {}
    for ward_name in sorted(known_wards):
        ward_rows = elections_by_ward.get(ward_name, [])
        if not ward_rows:
            # Ward exists in wards.json but no DCLEAPIL data
            wards_output[ward_name] = {
                'seats': meta['seats_per_ward'] or len(wards_json.get(ward_name, {}).get('councillors', [])),
                'current_holders': _get_current_holders(ward_name, councillors),
                'history': [],
                'gss_code': None,
            }
            continue

        # Group by election date (merge_ballot_paper = council.ward.date)
        by_election = defaultdict(list)
        for r in ward_rows:
            key = r['merge_ballot_paper']
            by_election[key].append(r)

        # Build history entries
        history = []
        gss_code = None
        for ballot_key, candidates in sorted(by_election.items(), key=lambda x: x[0]):
            first = candidates[0]
            year = int(first['year'])
            # Extract date from merge_ballot_paper (e.g. burnley.bank-hall.2024-05-02)
            parts = ballot_key.split('.')
            date_str = parts[-1] if len(parts) >= 3 else f'{year}-05-01'

            # Get GSS code
            if first.get('GSS'):
                gss_code = first['GSS']

            seats_contested = safe_int(first.get('seats_contested_calc'), 1)
            turnout_valid = safe_int(first.get('turnout_valid'))
            electorate = safe_int(first.get('electorate'))
            turnout_pct = safe_float(first.get('turnout_percentage'))
            if turnout_pct and turnout_pct > 1:
                turnout_pct = turnout_pct / 100.0  # Convert 32 -> 0.32

            # Build candidate list sorted by votes (descending)
            cand_list = []
            for c in candidates:
                votes = safe_int(c.get('votes_cast'), 0)
                party = normalise_party(c['party_name'])
                vs = safe_float(c.get('vote_share'))
                if vs and vs > 1:
                    vs = vs / 100.0
                cand_list.append({
                    'name': c['person_name'].strip(),
                    'party': party,
                    'votes': votes,
                    'pct': round(vs, 4) if vs else None,
                    'elected': c.get('elected', 'f') == 't',
                })
            cand_list.sort(key=lambda x: x['votes'], reverse=True)

            # Calculate majority
            if len(cand_list) >= 2:
                majority = cand_list[0]['votes'] - cand_list[1]['votes']
                majority_pct = round(majority / turnout_valid, 4) if turnout_valid else None
            else:
                majority = cand_list[0]['votes'] if cand_list else 0
                majority_pct = None

            entry = {
                'date': date_str,
                'year': year,
                'type': 'county' if meta['tier'] == 'county' else 'borough',
                'seats_contested': seats_contested,
                'turnout_votes': turnout_valid,
                'turnout': round(turnout_pct, 4) if turnout_pct else None,
                'electorate': electorate,
                'candidates': cand_list,
                'majority': majority,
                'majority_pct': majority_pct,
            }
            history.append(entry)

        # Sort history chronologically
        history.sort(key=lambda x: x['date'])

        # Determine seats from wards.json
        ward_info = wards_json.get(ward_name, {})
        n_seats = len(ward_info.get('councillors', [])) or meta['seats_per_ward'] or 1

        wards_output[ward_name] = {
            'gss_code': gss_code,
            'seats': n_seats,
            'current_holders': _get_current_holders(ward_name, councillors),
            'electorate': history[-1].get('electorate') if history else None,
            'history': history,
        }

    # Build council-level history (aggregate per year)
    council_history = _build_council_history(wards_output, meta)

    # Build turnout trends
    turnout_trends = _build_turnout_trends(council_history)

    # Build legacy wards
    legacy_output = {}
    for ward_name, rows in legacy_wards.items():
        by_election = defaultdict(list)
        for r in rows:
            by_election[r['merge_ballot_paper']].append(r)
        years = sorted(set(r['year'] for r in rows))
        legacy_output[ward_name] = {
            'years': years,
            'elections': len(by_election),
            'note': 'Ward existed under previous boundaries. Not used for predictions.',
        }

    # Compute which wards are up in 2026 (for thirds councils)
    wards_up_2026 = []
    if council_id in MAY_2026_COUNCILS:
        wards_up_2026 = _compute_wards_up(wards_output, meta, 2026)

    # Total seats
    total_seats = politics.get('total_councillors', sum(w.get('seats', 0) for w in wards_output.values()))
    total_wards = len(known_wards)

    output = {
        'meta': {
            'council_id': council_id,
            'council_name': COUNCIL_MAP[council_id],
            'council_tier': meta['tier'],
            'election_cycle': meta['cycle'],
            'seats_per_ward': meta['seats_per_ward'],
            'total_seats': total_seats,
            'total_wards': total_wards,
            'generated': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
            'data_sources': [
                'DCLEAPIL v1.0 (Leman 2025, CC BY-SA 4.0)',
                'Democracy Club (CC BY 4.0)',
                'Andrew Teale LEAP (CC BY-SA 3.0)',
            ],
        },
        'wards': wards_output,
        'council_history': council_history,
        'turnout_trends': turnout_trends,
        'legacy_wards': legacy_output if legacy_output else None,
    }

    # Add next election info for May 2026 councils
    if council_id in MAY_2026_COUNCILS:
        # For thirds councils, identify which councillor is defending each ward
        # The seat up in 2026 is the one won in 2022 (4-year term)
        # Unless a by-election occurred since, in which case that winner defends
        defenders = {}
        if meta['cycle'] == 'thirds':
            target_year = 2022  # Councillors elected in 2022 are up in 2026
            for ward_name in wards_up_2026:
                ward = wards_output.get(ward_name, {})
                history = ward.get('history', [])
                # Find the 2022 election, or the most recent by-election after 2022
                defender = None
                for e in sorted(history, key=lambda x: x.get('date', '') or '', reverse=True):
                    yr = e.get('year', 0)
                    if yr == target_year:
                        # The 2022 winner
                        for c in e.get('candidates', []):
                            if c.get('elected'):
                                defender = {'name': c['name'], 'party': c['party'], 'elected_year': yr}
                                break
                        break
                    elif yr > target_year and 'by' in (e.get('type', '') or '').lower():
                        # By-election after 2022 overrides
                        for c in e.get('candidates', []):
                            if c.get('elected'):
                                defender = {'name': c['name'], 'party': c['party'], 'elected_year': yr, 'by_election': True}
                                break
                        break
                if defender:
                    defenders[ward_name] = defender

        output['meta']['next_election'] = {
            'date': '2026-05-07',
            'type': 'borough_thirds' if meta['cycle'] == 'thirds' else 'borough_all_out',
            'seats_up': len(wards_up_2026),
            'wards_up': wards_up_2026,
        }
        if defenders:
            output['meta']['next_election']['defenders'] = defenders

    return output


def _get_current_holders(ward_name, councillors):
    """Get current councillors for a ward."""
    holders = []
    for c in councillors:
        if c.get('ward') == ward_name:
            holders.append({
                'name': c['name'],
                'party': c.get('party', 'Unknown'),
            })
    return holders


def _build_council_history(wards_output, meta):
    """Build council-level summary per election year."""
    # Collect all elections across all wards, group by year
    year_data = defaultdict(lambda: {'seats_contested': 0, 'by_party': defaultdict(lambda: {'won': 0, 'votes': 0}), 'total_votes': 0, 'turnout_sum': 0, 'turnout_count': 0})

    for ward_name, ward in wards_output.items():
        for election in ward.get('history', []):
            year = election['year']
            yd = year_data[year]
            yd['seats_contested'] += election.get('seats_contested', 1)
            if election.get('turnout') is not None:
                yd['turnout_sum'] += election['turnout']
                yd['turnout_count'] += 1
            for cand in election.get('candidates', []):
                party = cand['party']
                yd['by_party'][party]['votes'] += cand.get('votes', 0)
                yd['total_votes'] += cand.get('votes', 0)
                if cand.get('elected'):
                    yd['by_party'][party]['won'] += 1

    history = []
    for year in sorted(year_data.keys()):
        yd = year_data[year]
        results = {}
        for party, data in sorted(yd['by_party'].items(), key=lambda x: -x[1]['won']):
            total = yd['total_votes'] or 1
            results[party] = {
                'won': data['won'],
                'votes': data['votes'],
                'pct': round(data['votes'] / total, 4),
            }
        avg_turnout = round(yd['turnout_sum'] / yd['turnout_count'], 4) if yd['turnout_count'] > 0 else None
        election_type = 'county' if meta['tier'] == 'county' else 'borough'
        if meta['cycle'] == 'thirds' and yd['seats_contested'] < 20:
            election_type = 'borough_thirds'
        elif meta['cycle'] == 'all_out' or yd['seats_contested'] >= 20:
            election_type = 'borough_all_out' if meta['tier'] != 'county' else 'county'

        history.append({
            'year': year,
            'type': election_type,
            'seats_contested': yd['seats_contested'],
            'results_by_party': results,
            'turnout': avg_turnout,
            'total_votes': yd['total_votes'],
        })

    return history


def _build_turnout_trends(council_history):
    """Extract turnout trend from council history."""
    trends = []
    for entry in council_history:
        if entry.get('turnout') is not None:
            trends.append({
                'year': entry['year'],
                'type': entry['type'],
                'turnout': entry['turnout'],
                'total_votes': entry.get('total_votes', 0),
            })
    return trends


def _compute_wards_up(wards_output, meta, target_year):
    """For thirds/halves councils, determine which wards are up for election.

    In a 'thirds' council (e.g. Burnley): ALL wards contest 1 seat every year
    for 3 consecutive years, then a fallow year. So all wards are up every
    election year — 15 wards × 1 seat = 15 seats per year.

    In a 'halves' council: ALL wards contest seats every year, alternating
    between 1 and 2 seats per ward.

    In an 'all_out' council: ALL wards contest all seats every 4 years.
    """
    if meta['cycle'] in ('all_out', 'thirds', 'halves'):
        # All wards are up in every election year for all these cycle types
        return sorted(wards_output.keys())

    # Fallback: use historical election frequency to guess
    ward_latest = {}
    for ward_name, ward in wards_output.items():
        if ward.get('history'):
            latest = max(e['year'] for e in ward['history'])
            ward_latest[ward_name] = latest
        else:
            ward_latest[ward_name] = 0  # No history = due for election

    sorted_wards = sorted(ward_latest.items(), key=lambda x: x[1])
    total = len(sorted_wards)
    up_count = max(1, total)  # Default: all wards up

    wards_up = [w[0] for w in sorted_wards[:up_count]]
    return sorted(wards_up)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def process_council(council_id, force_download=False):
    """Process a single council."""
    print(f'\nProcessing {council_id} ({COUNCIL_MAP[council_id]})...')

    # Ensure data downloaded
    download_dcleapil(force=force_download)

    # Parse DCLEAPIL
    print(f'  Parsing DCLEAPIL data...')
    rows = parse_dcleapil_for_council(council_id)
    print(f'  Found {len(rows)} candidate rows')

    if not rows:
        print(f'  WARNING: No data found for {council_id}')
        return

    # Build elections.json
    print(f'  Building elections.json...')
    elections = build_elections_json(council_id, rows)

    # Count stats
    n_wards = len(elections['wards'])
    n_elections = sum(len(w.get('history', [])) for w in elections['wards'].values())
    n_legacy = len(elections.get('legacy_wards') or {})
    years = sorted(set(e['year'] for e in elections['council_history']))

    if years:
        print(f'  {n_wards} wards, {n_elections} ward-elections, {len(years)} years ({years[0]}-{years[-1]})')
    else:
        print(f'  {n_wards} wards, {n_elections} ward-elections (all data in legacy wards)')
    if n_legacy:
        print(f'  {n_legacy} legacy/boundary-changed wards')
    if elections['meta'].get('next_election'):
        ne = elections['meta']['next_election']
        print(f'  Next election: {ne["date"]} ({ne["seats_up"]} seats up)')

    # Write output
    out_dir = os.path.join(DATA_DIR, council_id)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'elections.json')
    with open(out_path, 'w') as f:
        json.dump(elections, f, indent=2, ensure_ascii=False)

    size_kb = os.path.getsize(out_path) / 1024
    print(f'  Written {out_path} ({size_kb:.1f}KB)')


def main():
    parser = argparse.ArgumentParser(description='Election results ETL for AI DOGE')
    parser.add_argument('--council', type=str, help='Council ID (e.g. burnley)')
    parser.add_argument('--all', action='store_true', help='Process all 15 councils')
    parser.add_argument('--download', action='store_true', help='Force re-download of DCLEAPIL CSV')
    args = parser.parse_args()

    if not args.council and not args.all:
        parser.print_help()
        sys.exit(1)

    councils = list(COUNCIL_MAP.keys()) if args.all else [args.council]

    for cid in councils:
        if cid not in COUNCIL_MAP:
            print(f'ERROR: Unknown council ID: {cid}')
            print(f'Valid IDs: {", ".join(sorted(COUNCIL_MAP.keys()))}')
            sys.exit(1)

    for cid in councils:
        process_council(cid, force_download=args.download)

    print(f'\nDone. Processed {len(councils)} council(s).')


if __name__ == '__main__':
    main()
