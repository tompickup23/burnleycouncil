#!/usr/bin/env python3
"""
ward_constituency_map.py — Map council wards to parliamentary constituencies

Uses ONS Ward to Parliamentary Constituency lookup (July 2024 boundaries)
to populate overlapping_wards in constituencies.json and generate
per-council ward_constituency_map.json files.

Data source: ONS Open Geography Portal — WD24_PCON24_LAD24_UTLA24_UK_LU
(ArcGIS FeatureServer, fetched by constituency_etl.py or downloaded manually)

Usage:
    python3 ward_constituency_map.py              # All councils
    python3 ward_constituency_map.py --council burnley  # Single council
    python3 ward_constituency_map.py --dry-run     # Preview without saving

Output:
    - Updates burnley-council/data/shared/constituencies.json (overlapping_wards)
    - Creates burnley-council/data/{council_id}/ward_constituency_map.json per council
"""

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent / 'data'
SHARED_DIR = DATA_DIR / 'shared'
ONS_LOOKUP = SCRIPT_DIR / 'ons_ward_constituency_lookup.json'

# Maps LAD24NM → our council_id
LAD_TO_COUNCIL = {
    'Burnley': 'burnley',
    'Hyndburn': 'hyndburn',
    'Pendle': 'pendle',
    'Rossendale': 'rossendale',
    'Lancaster': 'lancaster',
    'Ribble Valley': 'ribble_valley',
    'Chorley': 'chorley',
    'South Ribble': 'south_ribble',
    'Preston': 'preston',
    'West Lancashire': 'west_lancashire',
    'Fylde': 'fylde',
    'Wyre': 'wyre',
    'Blackpool': 'blackpool',
    'Blackburn with Darwen': 'blackburn',
}

# Maps PCON24NM → our constituency_id in constituencies.json
PCON_TO_CONSTITUENCY_ID = {
    'Burnley': 'burnley',
    'Hyndburn': 'hyndburn',
    'Pendle and Clitheroe': 'pendle_and_clitheroe',
    'Rossendale and Darwen': 'rossendale_and_darwen',
    'Lancaster and Wyre': 'lancaster_and_wyre',
    'Morecambe and Lunesdale': 'morecambe_and_lunesdale',
    'Ribble Valley': 'ribble_valley',
    'Chorley': 'chorley',
    'South Ribble': 'south_ribble',
    'Preston': 'preston',
    'West Lancashire': 'west_lancashire',
    'Fylde': 'fylde',
    'Blackpool North and Fleetwood': 'blackpool_north_and_fleetwood',
    'Blackpool South': 'blackpool_south',
    'Blackburn': 'blackburn',
    'Southport': 'southport',
}


def log(msg):
    print(f'[{datetime.now().strftime("%H:%M:%S")}] {msg}', file=sys.stderr)


def normalize_ward_name(name):
    """Normalize ward name for matching.

    Handles known discrepancies between ONS and elections.json:
    1. '&' vs 'and'
    2. Trailing ' Ward' suffix
    3. Apostrophe differences
    4. Space differences ('Coal Clough' vs 'Coalclough', 'High Cross' vs 'Highcross')
    """
    n = name.strip()
    # Remove trailing ' Ward'
    n = re.sub(r'\s+Ward$', '', n, flags=re.IGNORECASE)
    # Replace & with and, also handle comma separator (Gisburn, Rimington → Gisburn and Rimington)
    n = n.replace(' & ', ' and ')
    n = n.replace(', ', ' and ')
    # Lowercase for comparison
    n = n.lower()
    # Remove apostrophes and dots (St Andrew's vs St. Andrews vs St Andrews)
    n = n.replace("'", '').replace('\u2019', '').replace('.', '')
    # Normalize 's' at end of saint names: 'st andrews' = 'st andrews', 'st oswalds' = 'st oswalds'
    # Collapse multiple spaces
    n = re.sub(r'\s+', ' ', n)
    return n


def build_normalized_index(ward_names):
    """Build a mapping from normalized name → original ward name."""
    index = {}
    for name in ward_names:
        normalized = normalize_ward_name(name)
        index[normalized] = name
    return index


def fuzzy_match_ward(ons_name, elections_index):
    """Try to match an ONS ward name to an elections.json ward name.

    Returns the elections.json ward name if matched, else None.
    Uses progressively more aggressive normalization.
    """
    # 1. Direct normalized match
    n = normalize_ward_name(ons_name)
    if n in elections_index:
        return elections_index[n]

    # 2. Try removing all spaces for compound word matching
    #    ('coal clough' vs 'coalclough', 'high cross' vs 'highcross')
    n_nospace = n.replace(' ', '')
    for norm_key, orig_name in elections_index.items():
        if norm_key.replace(' ', '') == n_nospace:
            return orig_name

    # 3. Try removing hyphens
    n_nohyphen = n.replace('-', ' ')
    for norm_key, orig_name in elections_index.items():
        if norm_key.replace('-', ' ') == n_nohyphen:
            return orig_name

    return None


def load_ons_lookup():
    """Load the ONS ward-constituency lookup JSON (ArcGIS format)."""
    if not ONS_LOOKUP.exists():
        log(f'ERROR: ONS lookup not found at {ONS_LOOKUP}')
        log('Run: python3 constituency_etl.py to download it, or fetch manually from')
        log('https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/WD24_PCON24_LAD24_UTLA24_UK_LU/FeatureServer/0/query')
        sys.exit(1)

    data = json.loads(ONS_LOOKUP.read_text(encoding='utf-8'))
    features = data.get('features', [])
    log(f'Loaded ONS lookup: {len(features)} ward records')
    return features


def load_elections_wards(council_id):
    """Load ward names from a council's elections.json."""
    elections_path = DATA_DIR / council_id / 'elections.json'
    if not elections_path.exists():
        return None

    data = json.loads(elections_path.read_text(encoding='utf-8'))
    wards = data.get('wards', {})
    if isinstance(wards, dict):
        return list(wards.keys())
    return None


def build_council_ward_map(features, council_id, elections_ward_names):
    """Build ward→constituency mapping for a single council.

    Returns:
        {
            "council_id": "burnley",
            "wards": {
                "Bank Hall": {
                    "ons_code": "E05005150",
                    "constituency_id": "burnley",
                    "constituency_name": "Burnley",
                    "constituency_ons_code": "E14001142"
                },
                ...
            },
            "constituencies": ["burnley"],
            "unmatched_ons": [],
            "unmatched_elections": []
        }
    """
    # Find the LAD name for this council_id
    lad_name = None
    for lad, cid in LAD_TO_COUNCIL.items():
        if cid == council_id:
            lad_name = lad
            break

    if not lad_name:
        log(f'  ERROR: No LAD mapping for council {council_id}')
        return None

    # Extract ONS wards for this LAD
    ons_wards = []
    for f in features:
        attrs = f.get('attributes', {})
        if attrs.get('LAD24NM') == lad_name:
            ons_wards.append(attrs)

    if not ons_wards:
        log(f'  WARNING: No ONS wards found for {lad_name}')
        return None

    # Build normalized index from elections.json ward names
    if elections_ward_names:
        elections_index = build_normalized_index(elections_ward_names)
    else:
        elections_index = {}

    result = {
        'council_id': council_id,
        'lad_name': lad_name,
        'wards': {},
        'constituencies': set(),
        'unmatched_ons': [],
        'unmatched_elections': list(elections_ward_names) if elections_ward_names else [],
    }

    matched_elections_wards = set()

    for attrs in ons_wards:
        ons_name = attrs['WD24NM']
        ons_code = attrs['WD24CD']
        pcon_name = attrs['PCON24NM']
        pcon_code = attrs['PCON24CD']
        constituency_id = PCON_TO_CONSTITUENCY_ID.get(pcon_name, pcon_name.lower().replace(' ', '_'))

        result['constituencies'].add(constituency_id)

        # Match to elections.json ward name
        elections_name = fuzzy_match_ward(ons_name, elections_index) if elections_index else None

        ward_key = elections_name or ons_name

        # Handle split wards (same ONS code in multiple constituencies)
        # The ONS lookup can have a ward appearing in 2 constituencies (SPLIT_WARD)
        if ward_key in result['wards']:
            # Ward already mapped — this is a split ward
            existing = result['wards'][ward_key]
            if isinstance(existing.get('constituency_id'), list):
                existing['constituency_id'].append(constituency_id)
                existing['constituency_name'].append(pcon_name)
            else:
                existing['constituency_id'] = [existing['constituency_id'], constituency_id]
                existing['constituency_name'] = [existing['constituency_name'], pcon_name]
            continue

        result['wards'][ward_key] = {
            'ons_code': ons_code,
            'ons_name': ons_name,
            'constituency_id': constituency_id,
            'constituency_name': pcon_name,
            'constituency_ons_code': pcon_code,
        }

        if elections_name:
            matched_elections_wards.add(elections_name)
        else:
            result['unmatched_ons'].append(ons_name)

    # Find elections wards not in ONS data
    if elections_ward_names:
        result['unmatched_elections'] = [
            w for w in elections_ward_names if w not in matched_elections_wards
        ]

    result['constituencies'] = sorted(result['constituencies'])
    return result


def update_constituencies_json(constituencies_data, all_council_maps):
    """Update overlapping_wards in constituencies.json from ward maps."""
    updated = 0

    for const in constituencies_data.get('constituencies', []):
        cid = const['id']
        overlapping_councils = const.get('overlapping_councils', [])

        # Build overlapping_wards: ward_name → True for each council's wards in this constituency
        overlapping_wards = {}

        for council_id in overlapping_councils:
            ward_map = all_council_maps.get(council_id)
            if not ward_map:
                continue

            for ward_name, ward_info in ward_map['wards'].items():
                ward_const_id = ward_info.get('constituency_id')

                # Handle split wards (list of constituency IDs)
                if isinstance(ward_const_id, list):
                    if cid in ward_const_id:
                        overlapping_wards[ward_name] = {
                            'ons_code': ward_info['ons_code'],
                            'council_id': council_id,
                            'split': True,
                        }
                elif ward_const_id == cid:
                    overlapping_wards[ward_name] = {
                        'ons_code': ward_info['ons_code'],
                        'council_id': council_id,
                    }

        if overlapping_wards:
            const['overlapping_wards'] = overlapping_wards
            updated += 1

    return updated


def main():
    parser = argparse.ArgumentParser(description='Ward-constituency mapping for AI DOGE Lancashire')
    parser.add_argument('--council', help='Single council to process')
    parser.add_argument('--dry-run', action='store_true', help='Preview without saving')
    parser.add_argument('--verbose', action='store_true', help='Show detailed matching info')
    args = parser.parse_args()

    log('Ward-Constituency Mapping')
    log('========================')

    # 1. Load ONS lookup
    features = load_ons_lookup()

    # 2. Determine councils to process
    if args.council:
        councils = [args.council]
    else:
        councils = list(LAD_TO_COUNCIL.values())

    # 3. Process each council
    all_maps = {}
    total_wards = 0
    total_matched = 0
    total_unmatched_ons = 0
    total_unmatched_elections = 0

    for council_id in councils:
        log(f'\n--- {council_id} ---')

        # Load elections.json ward names
        elections_wards = load_elections_wards(council_id)
        if elections_wards:
            log(f'  Elections.json: {len(elections_wards)} wards')
        else:
            log(f'  Elections.json: not found (will use ONS names only)')

        # Build mapping
        ward_map = build_council_ward_map(features, council_id, elections_wards)
        if not ward_map:
            continue

        all_maps[council_id] = ward_map

        n_wards = len(ward_map['wards'])
        n_unmatched_ons = len(ward_map['unmatched_ons'])
        n_unmatched_elections = len(ward_map['unmatched_elections'])
        n_matched = n_wards - n_unmatched_ons

        total_wards += n_wards
        total_matched += n_matched
        total_unmatched_ons += n_unmatched_ons
        total_unmatched_elections += n_unmatched_elections

        log(f'  Mapped: {n_wards} wards → {len(ward_map["constituencies"])} constituencies')
        log(f'  Constituencies: {", ".join(ward_map["constituencies"])}')

        if n_unmatched_ons > 0:
            log(f'  ⚠ {n_unmatched_ons} ONS wards not matched to elections.json:')
            for w in ward_map['unmatched_ons']:
                log(f'    - {w}')

        if n_unmatched_elections > 0 and args.verbose:
            log(f'  ⚠ {n_unmatched_elections} elections.json wards not in ONS data:')
            for w in ward_map['unmatched_elections']:
                log(f'    - {w}')

        # Save per-council ward_constituency_map.json
        if not args.dry_run:
            council_dir = DATA_DIR / council_id
            if council_dir.exists():
                out = {
                    'meta': {
                        'generated': datetime.now().isoformat(timespec='seconds'),
                        'source': 'ONS Open Geography Portal — WD24_PCON24_LAD24_UTLA24_UK_LU',
                        'boundary_revision': 'July 2024',
                    },
                    'council_id': council_id,
                    'constituencies': ward_map['constituencies'],
                    'wards': ward_map['wards'],
                }
                out_path = council_dir / 'ward_constituency_map.json'
                out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding='utf-8')
                log(f'  Written: {out_path}')

    # 4. Update constituencies.json with overlapping_wards
    log(f'\n=== Updating constituencies.json ===')
    const_path = SHARED_DIR / 'constituencies.json'
    if not const_path.exists():
        log(f'ERROR: constituencies.json not found at {const_path}')
        sys.exit(1)

    const_data = json.loads(const_path.read_text(encoding='utf-8'))
    updated = update_constituencies_json(const_data, all_maps)
    log(f'Updated overlapping_wards for {updated} constituencies')

    if not args.dry_run:
        const_data['meta']['ward_mapping_updated'] = datetime.now().isoformat(timespec='seconds')
        const_data['meta']['ward_mapping_source'] = 'ONS WD24_PCON24_LAD24_UTLA24_UK_LU (July 2024)'
        const_path.write_text(json.dumps(const_data, indent=2, ensure_ascii=False), encoding='utf-8')
        log(f'Written: {const_path}')

    # 5. Summary
    log(f'\n=== Summary ===')
    log(f'Councils processed: {len(all_maps)}')
    log(f'Total wards mapped: {total_wards}')
    log(f'Matched to elections.json: {total_matched} ({total_matched/total_wards*100:.1f}%)' if total_wards else '')
    log(f'Unmatched ONS wards: {total_unmatched_ons}')
    log(f'Unmatched elections wards: {total_unmatched_elections}')

    if args.dry_run:
        log('\n--- DRY RUN: No files written ---')

    return 0


if __name__ == '__main__':
    sys.exit(main())
