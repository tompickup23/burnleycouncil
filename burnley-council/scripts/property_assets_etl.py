#!/usr/bin/env python3
"""
Property Assets ETL for AI DOGE
Reads Codex-enriched LCC property CSVs, adds CED mapping,
fills enrichment gaps, and generates JSON for the frontend.

Usage:
    python3 property_assets_etl.py --input-dir ~/Documents/New\ project/ --council lancashire_cc
"""
import argparse
import csv
import json
import os
import sys
from pathlib import Path

# CED mapping via shapely point-in-polygon
try:
    from shapely.geometry import Point, shape
    HAS_SHAPELY = True
except ImportError:
    HAS_SHAPELY = False
    print("WARNING: shapely not installed — CED mapping will be skipped")

# --- Configuration ---
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"

# Core fields for lean JSON (property_assets.json)
LEAN_FIELDS = [
    'id', 'name', 'address', 'postcode', 'ward', 'ced', 'district',
    'constituency', 'category', 'ownership', 'land_only', 'active',
    'lat', 'lng', 'imd_decile', 'epc_rating', 'epc_potential',
    'floor_area_sqm', 'epc_expired',
    'linked_spend', 'linked_txns', 'linked_suppliers',
    'condition_spend', 'condition_txns',
    'nearby_500m', 'nearby_1000m', 'nearest_asset_name', 'nearest_asset_distance',
    'sell_score', 'keep_score', 'colocate_score', 'primary_option',
    'flags',
    'flood_areas_1km', 'crime_total', 'crime_density',
]


def safe_float(val, default=0.0):
    """Safely convert to float."""
    if val is None:
        return default
    s = str(val).strip()
    if not s or s.lower() in ('', 'nan', 'none', 'null'):
        return default
    try:
        return float(s)
    except (ValueError, TypeError):
        return default


def safe_int(val, default=0):
    """Safely convert to int."""
    return int(safe_float(val, default))


def safe_str(val, default=''):
    """Safely convert to string."""
    if val is None:
        return default
    s = str(val).strip()
    if s.lower() in ('nan', 'none', 'null'):
        return default
    return s


def read_csv(path):
    """Read CSV file, return list of dicts."""
    if not os.path.exists(path):
        print(f"  WARNING: File not found: {path}")
        return []
    with open(path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    print(f"  Read {len(rows)} rows from {Path(path).name}")
    return rows


def build_ced_lookup(ward_boundaries_path):
    """Build CED polygons from ward_boundaries.json for point-in-polygon."""
    if not HAS_SHAPELY:
        return None
    if not os.path.exists(ward_boundaries_path):
        print(f"  WARNING: Ward boundaries not found: {ward_boundaries_path}")
        return None

    with open(ward_boundaries_path) as f:
        geojson = json.load(f)

    polygons = []
    for feature in geojson.get('features', []):
        props = feature.get('properties', {})
        name = props.get('name', '')
        geom = feature.get('geometry')
        if not geom or not name:
            continue
        try:
            poly = shape(geom)
            if poly.is_valid:
                polygons.append((name, poly))
        except Exception as e:
            print(f"  WARNING: Invalid geometry for {name}: {e}")
    print(f"  Loaded {len(polygons)} CED polygons")
    return polygons


def find_ced(lat, lng, ced_polygons):
    """Find which CED a point falls in."""
    if not ced_polygons or not lat or not lng:
        return ''
    try:
        pt = Point(float(lng), float(lat))
        for name, poly in ced_polygons:
            if poly.contains(pt):
                return name
        # Fallback: nearest polygon within 500m
        min_dist = float('inf')
        nearest = ''
        for name, poly in ced_polygons:
            d = poly.distance(pt)
            if d < min_dist:
                min_dist = d
                nearest = name
        # ~0.005 degrees ≈ ~500m
        if min_dist < 0.005:
            return nearest
    except Exception:
        pass
    return ''


def build_flags(row):
    """Build flags array from row data."""
    flags = []
    if safe_str(row.get('flag_energy_risk')) == 'Y':
        flags.append('energy_risk')
    if safe_str(row.get('flag_high_deprivation')) == 'Y':
        flags.append('high_deprivation')
    if safe_str(row.get('flag_high_condition_spend')) == 'Y':
        flags.append('high_condition_spend')
    if safe_str(row.get('flag_co_location_opportunity')) == 'Y':
        flags.append('co_location')
    if safe_str(row.get('flag_flood_exposure')) == 'Y':
        flags.append('flood_exposure')
    if safe_str(row.get('flag_high_crime_area')) == 'Y':
        flags.append('high_crime')
    if safe_str(row.get('flag_non_owned_or_unclear')) == 'Y':
        flags.append('non_owned')
    if safe_str(row.get('flag_current_sale_listing')) == 'Y':
        flags.append('current_sale')
    if safe_str(row.get('flag_historic_disposal_sale_evidence')) == 'Y':
        flags.append('historic_sale')
    if safe_str(row.get('flag_cat_transfer')) == 'Y':
        flags.append('cat_transfer')
    return flags


def build_lean_asset(row, ced_name=''):
    """Build lean asset dict for property_assets.json."""
    return {
        'id': safe_str(row.get('unique_asset_id')),
        'name': safe_str(row.get('asset_name')),
        'address': safe_str(row.get('full_address')),
        'postcode': safe_str(row.get('norm_postcode') or row.get('postcode')),
        'ward': safe_str(row.get('admin_ward')),
        'ced': ced_name,
        'district': safe_str(row.get('admin_district')),
        'constituency': safe_str(row.get('parliamentary_constituency')),
        'category': safe_str(row.get('asset_category')),
        'ownership': safe_str(row.get('ownership')),
        'land_only': safe_str(row.get('land_only')) == 'Y',
        'active': safe_str(row.get('active', 'Y')) == 'Y',
        'lat': safe_float(row.get('latitude_wgs84')) or None,
        'lng': safe_float(row.get('longitude_wgs84')) or None,
        'imd_decile': safe_int(row.get('imd_decile_2025')) or None,
        'epc_rating': safe_str(row.get('epc_rating')) or None,
        'epc_potential': safe_str(row.get('epc_potential_rating')) or None,
        'floor_area_sqm': safe_float(row.get('epc_total_floor_area_sqm')) or None,
        'epc_expired': safe_str(row.get('epc_is_expired')) == 'Y' if safe_str(row.get('epc_is_expired')) else None,
        'linked_spend': safe_float(row.get('linked_supplier_spend_total')),
        'linked_txns': safe_int(row.get('linked_supplier_transactions')),
        'linked_suppliers': safe_int(row.get('linked_supplier_unique_count')),
        'condition_spend': safe_float(row.get('condition_related_spend_total')),
        'condition_txns': safe_int(row.get('condition_related_transactions')),
        'nearby_500m': safe_int(row.get('nearby_assets_500m')),
        'nearby_1000m': safe_int(row.get('nearby_assets_1000m')),
        'nearest_asset_name': safe_str(row.get('nearest_asset_name')),
        'nearest_asset_distance': safe_float(row.get('nearest_asset_distance_m')) or None,
        'sell_score': safe_int(row.get('screen_sell_score')),
        'keep_score': safe_int(row.get('screen_keep_score')),
        'colocate_score': safe_int(row.get('screen_colocate_score')),
        'primary_option': safe_str(row.get('screen_primary_option')),
        'flags': build_flags(row),
        'flood_areas_1km': safe_int(row.get('flood_areas_within_1km')),
        'crime_total': safe_int(row.get('crime_total_within_1mi')),
        'crime_density': safe_str(row.get('crime_density_band')),
    }


def build_detail_asset(row, ced_name='', disposal_info=None, supplier_links=None, condition_info=None):
    """Build full detail asset dict for property_assets_detail.json."""
    lean = build_lean_asset(row, ced_name)

    # Add full enrichment data
    detail = {
        **lean,
        # Ownership detail
        'ownership_scope': safe_str(row.get('ownership_scope')),
        'is_owned': safe_str(row.get('is_owned_in_lcc_register')) == 'Y',
        'ownership_details': safe_str(row.get('ownership_details')),
        # Location detail
        'easting': safe_float(row.get('easting')) or None,
        'northing': safe_float(row.get('northing')) or None,
        'google_maps_url': safe_str(row.get('google_maps_url')),
        'lsoa': safe_str(row.get('lsoa_name')),
        'msoa': safe_str(row.get('msoa_name')),
        # Deprivation detail
        'deprivation': {
            'imd_rank': safe_int(row.get('imd_rank_2025')) or None,
            'imd_decile': safe_int(row.get('imd_decile_2025')) or None,
            'income_decile': safe_int(row.get('income_decile_2025')) or None,
            'employment_decile': safe_int(row.get('employment_decile_2025')) or None,
            'education_decile': safe_int(row.get('education_decile_2025')) or None,
            'health_decile': safe_int(row.get('health_decile_2025')) or None,
            'crime_decile': safe_int(row.get('crime_decile_2025')) or None,
            'housing_decile': safe_int(row.get('housing_barriers_decile_2025')) or None,
            'living_env_decile': safe_int(row.get('living_env_decile_2025')) or None,
        },
        # EPC detail
        'energy': {
            'rating': safe_str(row.get('epc_rating')) or None,
            'potential_rating': safe_str(row.get('epc_potential_rating')) or None,
            'match_status': safe_str(row.get('epc_match_status')),
            'match_score': safe_float(row.get('epc_match_score')) or None,
            'floor_area_sqm': safe_float(row.get('epc_total_floor_area_sqm')) or None,
            'floor_area_text': safe_str(row.get('epc_total_floor_area_text')),
            'property_type': safe_str(row.get('epc_property_type')),
            'main_heating': safe_str(row.get('epc_main_heating')),
            'expired': safe_str(row.get('epc_is_expired')) == 'Y' if safe_str(row.get('epc_is_expired')) else None,
            'valid_until': safe_str(row.get('epc_valid_until_text')),
            'lodgement_date': safe_str(row.get('epc_lodgement_date')),
            'certificate_url': safe_str(row.get('epc_certificate_url')),
            'data_type': safe_str(row.get('epc_data_type')),
        },
        # Flood/crime context
        'flood': {
            'areas_1km': safe_int(row.get('flood_areas_within_1km')),
            'areas_3km': safe_int(row.get('flood_areas_within_3km')),
            'nearest_label': safe_str(row.get('nearest_flood_area_label')),
            'nearest_distance_km': safe_float(row.get('nearest_flood_area_distance_km')) or None,
            'nearest_river_or_sea': safe_str(row.get('nearest_flood_area_river_or_sea')),
        },
        'crime': {
            'snapshot_month': safe_str(row.get('crime_snapshot_month')),
            'total_1mi': safe_int(row.get('crime_total_within_1mi')),
            'violent_1mi': safe_int(row.get('crime_violent_within_1mi')),
            'antisocial_1mi': safe_int(row.get('crime_antisocial_within_1mi')),
            'density_band': safe_str(row.get('crime_density_band')),
            'top3_categories': safe_str(row.get('crime_top3_categories')),
        },
        # Co-location detail
        'co_location': {
            'same_postcode': safe_int(row.get('co_locate_same_postcode_count')),
            'nearby_500m': safe_int(row.get('nearby_assets_500m')),
            'nearby_1000m': safe_int(row.get('nearby_assets_1000m')),
            'nearest_id': safe_str(row.get('nearest_asset_id')),
            'nearest_name': safe_str(row.get('nearest_asset_name')),
            'nearest_distance_m': safe_float(row.get('nearest_asset_distance_m')) or None,
        },
        # Supplier spend detail
        'spending': {
            'total': safe_float(row.get('linked_supplier_spend_total')),
            'transactions': safe_int(row.get('linked_supplier_transactions')),
            'unique_suppliers': safe_int(row.get('linked_supplier_unique_count')),
            'top1_name': safe_str(row.get('linked_supplier_top1_name')),
            'top1_spend': safe_float(row.get('linked_supplier_top1_spend')),
            'top1_share_pct': safe_float(row.get('linked_supplier_top1_share_pct')),
            'avg_match_score': safe_float(row.get('linked_supplier_avg_match_score')),
            'months': safe_str(row.get('linked_supplier_months')),
            'top5': safe_str(row.get('linked_supplier_top5')),
            'condition_spend': safe_float(row.get('condition_related_spend_total')),
            'condition_txns': safe_int(row.get('condition_related_transactions')),
            'condition_samples': safe_str(row.get('condition_sample_lines')),
        },
        # Procurement
        'procurement': {
            'contract_count': safe_int(row.get('procurement_contract_count')),
            'awarded_total': safe_float(row.get('procurement_awarded_total')),
            'sample_contracts': safe_str(row.get('procurement_sample_contracts')),
        },
    }

    # Add disposal data if available
    if disposal_info:
        detail['disposal'] = {
            'recommendation': safe_str(disposal_info.get('recommendation')),
            'category': safe_str(disposal_info.get('recommendation_category')),
            'priority': safe_int(disposal_info.get('priority_score')) or None,
            'confidence': safe_str(disposal_info.get('confidence')),
            'reasoning': safe_str(disposal_info.get('reasoning')),
            'key_risks': safe_str(disposal_info.get('key_risks')),
            'next_steps': safe_str(disposal_info.get('next_steps')),
        }
    else:
        detail['disposal'] = {
            'recommendation': None,
            'category': None,
            'priority': None,
            'confidence': None,
            'reasoning': None,
            'key_risks': None,
            'next_steps': None,
        }

    # Add external supplier links if available
    if supplier_links:
        detail['supplier_links'] = supplier_links

    # Add condition signals if available
    if condition_info:
        detail['spending']['condition_spend'] = safe_float(condition_info.get('condition_related_spend_total'))
        detail['spending']['condition_txns'] = safe_int(condition_info.get('condition_related_transactions'))
        detail['spending']['condition_samples'] = safe_str(condition_info.get('sample_condition_lines'))

    return detail


def compute_meta(lean_assets, detail_assets):
    """Compute meta block for JSON files."""
    total = len(lean_assets)
    owned = sum(1 for a in lean_assets if not any(f == 'non_owned' for f in a.get('flags', [])))
    has_epc = sum(1 for a in lean_assets if a.get('epc_rating'))
    has_spend = sum(1 for a in lean_assets if a.get('linked_spend', 0) > 0)
    total_spend = sum(a.get('linked_spend', 0) for a in lean_assets)
    has_condition = sum(1 for a in lean_assets if a.get('condition_spend', 0) > 0)
    total_condition = sum(a.get('condition_spend', 0) for a in lean_assets)
    disposal_candidates = sum(1 for d in detail_assets if d.get('disposal', {}).get('priority'))
    has_ced = sum(1 for a in lean_assets if a.get('ced'))
    has_latlon = sum(1 for a in lean_assets if a.get('lat'))

    # Category breakdown
    categories = {}
    for a in lean_assets:
        cat = a.get('category', 'unknown')
        categories[cat] = categories.get(cat, 0) + 1

    # District breakdown
    districts = {}
    for a in lean_assets:
        d = a.get('district', 'Unknown')
        if d:
            districts[d] = districts.get(d, 0) + 1

    # CED summary
    ced_summary = {}
    for a in lean_assets:
        ced = a.get('ced')
        if not ced:
            continue
        if ced not in ced_summary:
            ced_summary[ced] = {'count': 0, 'linked_spend': 0, 'disposal_candidates': 0}
        ced_summary[ced]['count'] += 1
        ced_summary[ced]['linked_spend'] += a.get('linked_spend', 0)
    # Add disposal counts to CED
    for d in detail_assets:
        ced = d.get('ced')
        if ced and d.get('disposal', {}).get('priority'):
            if ced in ced_summary:
                ced_summary[ced]['disposal_candidates'] += 1

    # Ownership breakdown
    freehold = sum(1 for a in lean_assets if a.get('ownership') == 'Freehold')
    leasehold = sum(1 for a in lean_assets if a.get('ownership') == 'Leasehold')
    land_only = sum(1 for a in lean_assets if a.get('land_only'))

    # EPC rating distribution
    epc_dist = {}
    for a in lean_assets:
        r = a.get('epc_rating')
        if r:
            epc_dist[r] = epc_dist.get(r, 0) + 1

    return {
        'generated': __import__('datetime').datetime.utcnow().isoformat() + 'Z',
        'source': 'LCC Local Authority Land List + Codex enrichment + AI DOGE CED mapping',
        'total_assets': total,
        'owned_assets': owned,
        'has_latlon': has_latlon,
        'has_epc': has_epc,
        'has_linked_spend': has_spend,
        'total_linked_spend': round(total_spend, 2),
        'has_condition_spend': has_condition,
        'total_condition_spend': round(total_condition, 2),
        'disposal_candidates': disposal_candidates,
        'has_ced': has_ced,
        'freehold': freehold,
        'leasehold': leasehold,
        'land_only': land_only,
        'category_breakdown': dict(sorted(categories.items(), key=lambda x: -x[1])),
        'district_breakdown': dict(sorted(districts.items(), key=lambda x: -x[1])),
        'epc_distribution': dict(sorted(epc_dist.items())),
        'ced_summary': dict(sorted(ced_summary.items())),
    }


def main():
    parser = argparse.ArgumentParser(description='Property Assets ETL for AI DOGE')
    parser.add_argument('--input-dir', required=True, help='Directory with Codex CSV files')
    parser.add_argument('--council', default='lancashire_cc', help='Council ID')
    parser.add_argument('--owned-only', action='store_true', default=True,
                        help='Only include LCC-owned assets (default: true)')
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    council_dir = DATA_DIR / args.council
    boundaries_path = council_dir / 'ward_boundaries.json'

    print(f"\n=== Property Assets ETL ===")
    print(f"Input: {input_dir}")
    print(f"Output: {council_dir}")
    print(f"Council: {args.council}")

    # --- 1. Read primary dataset ---
    print(f"\n--- Reading primary dataset ---")
    # Try multiple filenames (Codex may rename)
    primary_candidates = [
        'LCC property and land data.csv',
        'lcc_owned_property_land_enriched.csv',
        'lcc_property_land_mega_spreadsheet.csv',
    ]
    primary_rows = []
    for fname in primary_candidates:
        fpath = input_dir / fname
        if fpath.exists():
            primary_rows = read_csv(str(fpath))
            if primary_rows:
                break

    if not primary_rows:
        print("ERROR: No primary CSV found!")
        sys.exit(1)

    # Filter to owned only
    if args.owned_only:
        before = len(primary_rows)
        primary_rows = [r for r in primary_rows
                        if safe_str(r.get('is_owned_in_lcc_register', 'Y')) != 'N']
        print(f"  Filtered to owned: {before} → {len(primary_rows)}")

    # Index by ID
    primary_by_id = {}
    for row in primary_rows:
        aid = safe_str(row.get('unique_asset_id'))
        if aid:
            primary_by_id[aid] = row

    # --- 2. Read supplementary datasets ---
    print(f"\n--- Reading supplementary datasets ---")

    # Disposal recommendations
    disposal_rows = read_csv(str(input_dir / 'lcc_disposal_repurpose_candidate_register.csv'))
    disposal_by_id = {}
    for row in disposal_rows:
        aid = safe_str(row.get('unique_asset_id'))
        if aid:
            disposal_by_id[aid] = row

    # Supplier links
    supplier_link_rows = read_csv(str(input_dir / 'lcc_asset_supplier_links.csv'))
    supplier_links_by_id = {}
    for row in supplier_link_rows:
        aid = safe_str(row.get('unique_asset_id'))
        if not aid:
            continue
        if aid not in supplier_links_by_id:
            supplier_links_by_id[aid] = []
        supplier_links_by_id[aid].append({
            'supplier': safe_str(row.get('supplier')),
            'spend': safe_float(row.get('linked_spend')),
            'transactions': safe_int(row.get('linked_transactions')),
        })

    # Condition spend signals
    condition_rows = read_csv(str(input_dir / 'lcc_asset_condition_spend_signals.csv'))
    condition_by_id = {}
    for row in condition_rows:
        aid = safe_str(row.get('unique_asset_id'))
        if aid:
            condition_by_id[aid] = row

    # Decision screen (for screening scores if not in primary)
    screen_rows = read_csv(str(input_dir / 'lcc_property_decision_screen.csv'))
    screen_by_id = {}
    for row in screen_rows:
        aid = safe_str(row.get('unique_asset_id'))
        if aid:
            screen_by_id[aid] = row

    # --- 3. Build CED lookup ---
    print(f"\n--- Building CED lookup ---")
    ced_polygons = build_ced_lookup(str(boundaries_path))

    # --- 4. Map assets to CEDs ---
    print(f"\n--- Mapping assets to CEDs ---")
    ced_mapped = 0
    ced_cache = {}  # Cache lat/lng → CED to avoid redundant lookups
    for aid, row in primary_by_id.items():
        lat = safe_float(row.get('latitude_wgs84'))
        lng = safe_float(row.get('longitude_wgs84'))
        if lat and lng and ced_polygons:
            cache_key = f"{round(lat, 5)},{round(lng, 5)}"
            if cache_key in ced_cache:
                row['_ced'] = ced_cache[cache_key]
            else:
                ced = find_ced(lat, lng, ced_polygons)
                row['_ced'] = ced
                ced_cache[cache_key] = ced
            if row['_ced']:
                ced_mapped += 1
        else:
            row['_ced'] = ''

    print(f"  CED mapped: {ced_mapped}/{len(primary_by_id)} ({100*ced_mapped/max(1,len(primary_by_id)):.1f}%)")

    # Merge screening scores from decision screen if missing from primary
    for aid, row in primary_by_id.items():
        if not safe_str(row.get('screen_sell_score')) and aid in screen_by_id:
            screen = screen_by_id[aid]
            for key in ['screen_sell_score', 'screen_keep_score', 'screen_colocate_score', 'screen_primary_option']:
                if safe_str(screen.get(key)):
                    row[key] = screen[key]

    # --- 5. Build output ---
    print(f"\n--- Building output ---")
    lean_assets = []
    detail_assets = []

    for aid, row in primary_by_id.items():
        ced_name = row.get('_ced', '')
        disposal_info = disposal_by_id.get(aid)
        supplier_links = supplier_links_by_id.get(aid, [])
        condition_info = condition_by_id.get(aid)

        lean = build_lean_asset(row, ced_name)
        lean_assets.append(lean)

        # Add disposal to lean
        if disposal_info:
            lean['disposal'] = {
                'category': safe_str(disposal_info.get('recommendation_category')),
                'priority': safe_int(disposal_info.get('priority_score')) or None,
                'confidence': safe_str(disposal_info.get('confidence')),
            }
        else:
            lean['disposal'] = {'category': None, 'priority': None, 'confidence': None}

        detail = build_detail_asset(row, ced_name, disposal_info, supplier_links, condition_info)
        detail_assets.append(detail)

    # Sort by priority (disposal candidates first) then by name
    lean_assets.sort(key=lambda a: (
        -(a.get('disposal', {}).get('priority') or 0),
        a.get('name', '')
    ))
    detail_assets.sort(key=lambda a: (
        -(a.get('disposal', {}).get('priority') or 0),
        a.get('name', '')
    ))

    # --- 6. Compute meta ---
    meta = compute_meta(lean_assets, detail_assets)

    # --- 7. Write outputs ---
    print(f"\n--- Writing outputs ---")
    os.makedirs(council_dir, exist_ok=True)

    # Lean JSON
    lean_output = {'meta': meta, 'assets': lean_assets}
    lean_path = council_dir / 'property_assets.json'
    with open(lean_path, 'w') as f:
        json.dump(lean_output, f, separators=(',', ':'), default=str)
    lean_size = lean_path.stat().st_size / 1024
    print(f"  property_assets.json: {lean_size:.0f}KB ({len(lean_assets)} assets)")

    # Detail JSON
    detail_output = {'meta': meta, 'assets': detail_assets}
    detail_path = council_dir / 'property_assets_detail.json'
    with open(detail_path, 'w') as f:
        json.dump(detail_output, f, separators=(',', ':'), default=str)
    detail_size = detail_path.stat().st_size / 1024
    print(f"  property_assets_detail.json: {detail_size:.0f}KB ({len(detail_assets)} assets)")

    # --- 8. Summary ---
    print(f"\n=== Summary ===")
    print(f"Total assets: {meta['total_assets']}")
    print(f"Owned: {meta['owned_assets']}")
    print(f"Has lat/lng: {meta['has_latlon']}")
    print(f"CED mapped: {meta['has_ced']}")
    print(f"Has EPC: {meta['has_epc']}")
    print(f"Has linked spend: {meta['has_linked_spend']} (£{meta['total_linked_spend']:,.0f})")
    print(f"Disposal candidates: {meta['disposal_candidates']}")
    print(f"Categories: {meta['category_breakdown']}")
    print(f"Top districts: {dict(list(meta['district_breakdown'].items())[:5])}")
    print(f"\nFiles written:")
    print(f"  {lean_path} ({lean_size:.0f}KB)")
    print(f"  {detail_path} ({detail_size:.0f}KB)")


if __name__ == '__main__':
    main()
