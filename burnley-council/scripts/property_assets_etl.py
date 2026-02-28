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
    # World-class assessment bands
    'disposal_band', 'repurpose_band', 'service_band', 'net_zero_band', 'resilience_band',
    # Disposal/sales evidence
    'sales_signal_score', 'sales_total_value',
    # Innovative reuse
    'innovative_use',
    # Fire risk (LFRS proximity)
    'fire_station_distance_km', 'fire_station_nearest',
    # Deprivation context (from deprivation.json ward lookup)
    'deprivation_level', 'deprivation_score',
    # Demographics context (from demographics.json ward lookup)
    'ward_population',
    # Smart disposal intelligence (computed by engine)
    'occupancy_status', 'disposal_complexity', 'market_readiness',
    'revenue_potential', 'disposal_pathway', 'disposal_pathway_secondary',
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


def load_ward_deprivation(council_dir):
    """Load deprivation.json for ward-level deprivation enrichment."""
    dep_path = Path(council_dir) / 'deprivation.json'
    if not dep_path.exists():
        print(f"  deprivation.json not found — skipping ward deprivation enrichment")
        return {}
    try:
        with open(dep_path) as f:
            dep_data = json.load(f)
        wards = dep_data.get('wards', {})
        print(f"  Loaded deprivation data for {len(wards)} wards")
        return wards
    except Exception as e:
        print(f"  Error loading deprivation.json: {e}")
        return {}


def load_ward_demographics(council_dir):
    """Load demographics.json for ward-level demographic enrichment."""
    demo_path = Path(council_dir) / 'demographics.json'
    if not demo_path.exists():
        print(f"  demographics.json not found — skipping demographic enrichment")
        return {}
    try:
        with open(demo_path) as f:
            demo_data = json.load(f)
        wards = demo_data.get('wards', {})
        # Build name-keyed lookup (demographics uses ward codes as keys)
        by_name = {}
        for code, val in wards.items():
            name = val.get('name') or val.get('ward_name', '')
            if name:
                by_name[name] = val
        print(f"  Loaded demographics data for {len(by_name)} wards")
        return by_name
    except Exception as e:
        print(f"  Error loading demographics.json: {e}")
        return {}


# Lancashire Fire & Rescue Service (LFRS) fire stations — lat/lng for proximity calculation
# Source: LFRS public station listing
LANCASHIRE_FIRE_STATIONS = [
    ('Burnley', 53.7920, -2.2430), ('Nelson', 53.8360, -2.2130),
    ('Colne', 53.8561, -2.1763), ('Hyndburn', 53.7530, -2.3700),
    ('Rawtenstall', 53.7010, -2.2900), ('Bacup', 53.7050, -2.2030),
    ('Blackburn', 53.7480, -2.4820), ('Darwen', 53.6960, -2.4610),
    ('Preston', 53.7590, -2.7100), ('Fulwood', 53.7780, -2.6990),
    ('Penwortham', 53.7440, -2.7240), ('Bamber Bridge', 53.7340, -2.6630),
    ('Leyland', 53.6970, -2.6870), ('Chorley', 53.6530, -2.6290),
    ('Lancaster', 54.0490, -2.8010), ('Morecambe', 54.0720, -2.8680),
    ('Carnforth', 54.1290, -2.7690), ('Fleetwood', 53.9220, -3.0080),
    ('Blackpool', 53.8170, -3.0510), ('South Shore', 53.7910, -3.0520),
    ('St Annes', 53.7520, -2.9930), ('Lytham', 53.7360, -2.9660),
    ('Fulwood', 53.7780, -2.6990), ('Longridge', 53.8290, -2.5960),
    ('Ormskirk', 53.5680, -2.8820), ('Skelmersdale', 53.5510, -2.7760),
    ('Wyre (Thornton)', 53.8750, -3.0080), ('Garstang', 53.8990, -2.7730),
    ('Clitheroe', 53.8710, -2.3930), ('Haslingden', 53.7080, -2.3280),
]


def compute_fire_proximity(lat, lng):
    """Compute distance to nearest LFRS fire station in km (Haversine)."""
    import math
    if not lat or not lng:
        return None, None
    min_dist = float('inf')
    nearest_name = None
    for name, slat, slng in LANCASHIRE_FIRE_STATIONS:
        R = 6371
        dLat = math.radians(slat - lat)
        dLng = math.radians(slng - lng)
        a = math.sin(dLat/2)**2 + math.cos(math.radians(lat)) * math.cos(math.radians(slat)) * math.sin(dLng/2)**2
        d = 2 * R * math.asin(math.sqrt(min(1, a)))
        if d < min_dist:
            min_dist = d
            nearest_name = name
    return round(min_dist, 2), nearest_name


# ── Smart Disposal Intelligence Engine ──────────────────────────────────────
# Replaces naive Codex binary recommendations with computed, market-conscious
# scoring using all available signals. No new data sources needed.

SERVICE_OCCUPIED_KEYWORDS = [
    'school', 'academy', 'library', 'fire station', 'children',
    'day centre', 'care home', 'depot', 'office', 'civic',
    'museum', 'leisure', 'sports', 'swimming', 'youth',
    'register office', 'coroner', 'court', 'police', 'ambulance',
    'health centre', 'clinic', 'surgery', 'hospital', 'nursery',
]

PATHWAY_LABELS = {
    'quick_win_auction':      'Quick Win — Auction',
    'private_treaty_sale':    'Private Treaty Sale',
    'development_partnership':'Development Partnership',
    'community_asset_transfer':'Community Asset Transfer',
    'long_lease_income':      'Long Lease / Income',
    'meanwhile_use':          'Meanwhile Use',
    'energy_generation':      'Energy Generation',
    'carbon_offset_woodland': 'Carbon Offset / Woodland',
    'housing_partnership':    'Housing Partnership',
    'co_locate_consolidate':  'Co-locate & Consolidate',
    'strategic_hold':         'Strategic Hold',
    'governance_review':      'Governance Review',
    'refurbish_relet':        'Refurbish & Re-let',
}

PATHWAY_TIMELINES = {
    'quick_win_auction':       '3-6 months',
    'private_treaty_sale':     '6-12 months',
    'development_partnership': '12-24 months',
    'community_asset_transfer':'6-12 months',
    'long_lease_income':       '3-6 months',
    'meanwhile_use':           '1-3 months',
    'energy_generation':       '12-24 months',
    'carbon_offset_woodland':  '12-24 months',
    'housing_partnership':     '12-24 months',
    'co_locate_consolidate':   '12-24 months',
    'strategic_hold':          'Ongoing',
    'governance_review':       '6-12 months',
    'refurbish_relet':         '6-12 months',
}


def infer_occupancy(asset):
    """Infer occupancy status from available signals. Returns (status, signals)."""
    signals = []
    name = (asset.get('name') or '').lower()
    is_land = asset.get('land_only', False)
    spend = asset.get('linked_spend', 0) or 0
    txns = asset.get('linked_txns', 0) or 0
    cond_spend = asset.get('condition_spend', 0) or 0
    flags = asset.get('flags', [])

    category = (asset.get('category') or '').lower()

    # Non-owned / unclear → third party
    if 'non_owned' in flags:
        signals.append('Non-owned or partnership asset')
        return 'third_party', signals

    # --- School/education land protection ---
    # School-named land parcels are almost certainly school grounds (playing fields,
    # car parks, access roads) that cannot be sold while the school operates.
    # LCC registers freehold land under academies, VA/VC schools, and maintained schools.
    SCHOOL_KEYWORDS = ['school', 'academy', 'primary', 'secondary', 'high school',
                       'infant', 'junior', 'nursery school', 'sixth form', 'college']
    is_school_name = any(kw in name for kw in SCHOOL_KEYWORDS)
    is_education = category == 'education'

    if (is_school_name or is_education) and is_land:
        # Land named after a school → almost certainly school grounds
        if 'historic_sale' not in flags and 'current_sale' not in flags:
            signals.append(f'School/education land — likely school grounds serving active institution')
            signals.append('LCC retains freehold under academies, VA/VC and maintained schools')
            return 'school_grounds', signals
        else:
            signals.append(f'School-named land with disposal evidence — may be surplus')

    if (is_school_name or is_education) and not is_land:
        # School building — almost certainly in active use
        if spend > 0 or cond_spend > 0:
            signals.append(f'School building with active spend (£{spend:,.0f})')
            return 'occupied', signals
        else:
            # No spend but school-named building — likely academy-managed (trust handles spend)
            signals.append('School building with no LCC spend — likely academy/trust-managed')
            return 'school_grounds', signals

    # Land with no spend → vacant land (NON-school)
    if is_land and spend == 0 and cond_spend == 0:
        signals.append('Land-only asset with zero operational spend')
        return 'vacant_land', signals

    # Service keyword + spend → occupied
    for kw in SERVICE_OCCUPIED_KEYWORDS:
        if kw in name:
            if spend > 0 or cond_spend > 0:
                signals.append(f'Name contains "{kw}" with active spend (£{spend:,.0f})')
                return 'occupied', signals
            else:
                signals.append(f'Name contains "{kw}" but zero spend — may be closed/transferred')
                break

    # High operational activity → occupied
    if spend > 5000 and txns > 5:
        signals.append(f'Significant operational spend: £{spend:,.0f} across {txns} transactions')
        return 'occupied', signals

    # Moderate activity → likely occupied
    if spend > 0 and txns > 2:
        signals.append(f'Moderate spend: £{spend:,.0f} across {txns} transactions')
        return 'occupied', signals

    # Condition spend only → maintained but potentially underused
    if cond_spend > 0 and spend == 0:
        signals.append(f'Condition spend only (£{cond_spend:,.0f}), no operational spend')
        return 'likely_vacant', signals

    # Building with zero spend → likely vacant
    if not is_land and spend == 0 and cond_spend == 0:
        signals.append('Building with zero operational and condition spend')
        return 'likely_vacant', signals

    # Land with some spend → check further
    if is_land and spend > 0:
        signals.append(f'Land with spend (£{spend:,.0f}) — may have structures/use')
        return 'occupied', signals

    signals.append('Insufficient signals for occupancy inference')
    return 'unknown', signals


def compute_complexity(asset, occupancy):
    """Compute disposal complexity score (0-100). Higher = harder to dispose."""
    score = 0
    breakdown = []
    flags = asset.get('flags', [])

    if occupancy == 'school_grounds':
        score += 30
        breakdown.append(('School grounds — disposal requires school closure/relocation', 30))
    elif occupancy == 'occupied':
        score += 25
        breakdown.append(('Service-occupied — needs relocation plan', 25))
    if occupancy == 'third_party':
        score += 20
        breakdown.append(('Third-party occupied — governance/legal sensitivity', 20))
    if (asset.get('ownership') or '').lower() == 'leasehold':
        score += 15
        breakdown.append(('Leasehold — title constraints, consent needed', 15))
    if (asset.get('flood_areas_1km') or 0) > 0:
        score += 15
        breakdown.append(('Flood zone proximity — environmental risk disclosure', 15))
    if 'high_deprivation' in flags:
        score += 10
        breakdown.append(('High deprivation area — equity/political sensitivity', 10))
    if (asset.get('condition_spend') or 0) > 10000:
        score += 10
        breakdown.append(('High condition spend (>£10k) — buyer due diligence concern', 10))
    if (asset.get('imd_decile') or 10) <= 2:
        score += 10
        breakdown.append(('IMD decile 1-2 — regeneration obligation', 10))
    if not asset.get('epc_rating'):
        score += 5
        breakdown.append(('No EPC — compliance gap before marketing', 5))
    if (asset.get('crime_density') or '') == 'high':
        score += 5
        breakdown.append(('High crime density — market perception risk', 5))
    if (asset.get('fire_station_distance_km') or 0) > 10:
        score += 5
        breakdown.append(('Remote from fire station (>10km) — insurance concern', 5))
    if not asset.get('postcode'):
        score += 5
        breakdown.append(('No postcode — address data gap', 5))

    return min(score, 100), breakdown


def compute_readiness(asset, occupancy):
    """Compute market readiness score (0-100). Higher = more sale-ready."""
    score = 50
    breakdown = []
    flags = asset.get('flags', [])

    # Positive factors
    if asset.get('land_only') and occupancy == 'vacant_land':
        score += 20
        breakdown.append(('Vacant land — clean title, no occupancy', +20))
    if 'current_sale' in flags:
        score += 15
        breakdown.append(('Already being marketed', +15))
    if 'historic_sale' in flags:
        score += 10
        breakdown.append(('Historic disposal precedent', +10))
    if asset.get('epc_rating') and not asset.get('epc_expired'):
        score += 10
        breakdown.append(('Valid EPC certificate', +10))
    if (asset.get('floor_area_sqm') or 0) > 0:
        score += 10
        breakdown.append(('Floor area measured — marketable', +10))
    if asset.get('lat') and asset.get('lng'):
        pass  # no penalty
    else:
        score -= 15
        breakdown.append(('No coordinates — can\'t locate on map', -15))

    # Negative factors
    if occupancy == 'school_grounds':
        score -= 25
        breakdown.append(('School grounds — not marketable while institution active', -25))
    elif occupancy == 'occupied':
        score -= 20
        breakdown.append(('Service-occupied — vacancy required first', -20))
    elif occupancy == 'third_party':
        score -= 10
        breakdown.append(('Third-party occupied — requires negotiation', -10))
    if (asset.get('condition_spend') or 0) > 50000:
        score -= 10
        breakdown.append(('High condition liability (>£50k)', -10))
    if not asset.get('postcode'):
        score -= 5
        breakdown.append(('No postcode — data gap', -5))
    if not asset.get('address'):
        score -= 5
        breakdown.append(('No address — data gap', -5))
    if not asset.get('district'):
        score -= 5
        breakdown.append(('No district — data gap', -5))

    return max(0, min(score, 100)), breakdown


def compute_revenue_potential(asset, occupancy):
    """Compute revenue potential score (0-100). Higher = more income opportunity."""
    score = 30  # base
    breakdown = []
    flags = asset.get('flags', [])
    epc = asset.get('epc_rating') or ''
    floor = asset.get('floor_area_sqm') or 0
    imd = asset.get('imd_decile') or 5

    if floor > 500:
        score += 20
        breakdown.append(('Large floor area (>500 sqm)', 20))
    elif floor > 200:
        score += 10
        breakdown.append(('Medium floor area (>200 sqm)', 10))
    elif floor > 0:
        score += 5
        breakdown.append(('Small floor area', 5))

    if epc in ('A', 'B', 'C'):
        score += 15
        breakdown.append(('Good EPC (A-C)', 15))
    elif epc in ('F', 'G'):
        score -= 10
        breakdown.append(('Poor EPC (F-G)', -10))

    if imd >= 7:
        score += 15
        breakdown.append(('Affluent area (IMD 7+)', 15))
    elif imd >= 5:
        score += 5
        breakdown.append(('Mid-range area (IMD 5-6)', 5))
    elif imd <= 2:
        score -= 5
        breakdown.append(('High deprivation (IMD 1-2)', -5))

    if (asset.get('nearby_500m') or 0) > 3:
        score += 10
        breakdown.append(('Clustered assets (>3 nearby)', 10))

    if 'flood_exposure' not in flags and 'high_crime' not in flags:
        score += 10
        breakdown.append(('No flood or crime risk', 10))

    if asset.get('land_only') and floor == 0:
        score -= 15
        breakdown.append(('Land only, no floor area', -15))

    # Occupied assets already generating implicit value
    if occupancy == 'occupied':
        score -= 5
        breakdown.append(('Currently occupied', -5))

    return max(0, min(score, 100)), breakdown


def compute_urgency(asset):
    """Compute urgency factor (0-100) for priority weighting."""
    score = 0
    flags = asset.get('flags', [])

    if 'current_sale' in flags:
        score += 30
    if 'historic_sale' in flags:
        score += 15
    if asset.get('epc_expired'):
        score += 10
    if (asset.get('condition_spend') or 0) > 20000:
        score += 20
    if asset.get('land_only') and (asset.get('linked_spend') or 0) == 0:
        score += 15
    if 'high_condition_spend' in flags:
        score += 10

    return min(score, 100)


def determine_pathway(asset, occupancy, complexity, readiness, revenue):
    """Determine the best disposal pathway and secondary option."""
    name = (asset.get('name') or '').lower()
    flags = asset.get('flags', [])
    is_land = asset.get('land_only', False)
    floor = asset.get('floor_area_sqm') or 0
    epc = asset.get('epc_rating') or ''
    imd = asset.get('imd_decile') or 5
    nearby = asset.get('nearby_500m') or 0
    flood_1km = asset.get('flood_areas_1km') or 0

    # --- Governance review: non-owned ---
    if 'non_owned' in flags:
        secondary = 'community_asset_transfer' if imd <= 3 else None
        return 'governance_review', secondary, \
            'Non-owned or partnership asset — ownership and governance must be clarified before any disposal action'

    # --- School grounds: land/buildings serving active educational institutions ---
    if occupancy == 'school_grounds':
        return 'strategic_hold', 'long_lease_income', \
            'School/education land or building — retained freehold serving active institution. ' \
            'Disposal requires school closure or relocation which is outside estate management scope'

    # --- Strategic hold: actively occupied + high service criticality ---
    if occupancy == 'occupied' and (asset.get('linked_spend') or 0) > 10000:
        secondary = 'co_locate_consolidate' if nearby > 2 else None
        return 'strategic_hold', secondary, \
            f'Active service asset with £{asset.get("linked_spend", 0):,.0f} operational spend — retain for service delivery'

    # --- Occupied but low spend — co-location or long lease ---
    if occupancy == 'occupied':
        if nearby > 2:
            return 'co_locate_consolidate', 'long_lease_income', \
                f'{nearby} nearby LCC assets within 500m — consolidation opportunity to release this site'
        return 'long_lease_income', 'strategic_hold', \
            'Occupied with modest spend — formalise as income-generating lease or retain'

    # --- Third-party occupied ---
    if occupancy == 'third_party':
        return 'long_lease_income', 'governance_review', \
            'Third-party use (NHS/police/foundation) — formalise lease arrangements for rental income'

    # --- Vacant land pathways ---
    if is_land and occupancy == 'vacant_land':
        # Flood land → carbon offset
        if flood_1km > 0:
            return 'carbon_offset_woodland', 'energy_generation', \
                'Flood-zone land unsuitable for development — woodland creation for carbon credits and biodiversity net gain'
        # Deprived area → housing
        if imd <= 3 and 'high_deprivation' in flags:
            return 'housing_partnership', 'community_asset_transfer', \
                'Vacant land in deprived area — housing association partnership for social/affordable housing'
        # Clustered land → development
        if nearby > 3:
            return 'development_partnership', 'quick_win_auction', \
                f'Clustered with {nearby} nearby assets — development partnership for higher combined value'
        # Default vacant land → quick win auction
        if complexity <= 30 and readiness >= 60:
            return 'quick_win_auction', 'private_treaty_sale', \
                'Low-complexity vacant land with good market readiness — auction for fast receipt'
        return 'private_treaty_sale', 'energy_generation', \
            'Vacant land — private treaty sale or explore energy generation potential'

    # --- Likely vacant buildings ---
    if occupancy in ('likely_vacant', 'unknown'):
        # Poor EPC → refurbish first
        if epc in ('F', 'G') and floor > 100:
            return 'refurbish_relet', 'meanwhile_use', \
                f'Vacant building with poor EPC ({epc}) — refurbish to improve rating, then let at higher yield'
        # Good building → private treaty
        if epc in ('A', 'B', 'C') and floor > 200:
            return 'private_treaty_sale', 'meanwhile_use', \
                f'Vacant building with good EPC ({epc}), {floor:.0f}sqm — sell via agent for best price'
        # Large site → development or meanwhile
        if floor > 500:
            return 'development_partnership', 'private_treaty_sale', \
                f'Large vacant building ({floor:.0f}sqm) — development partnership for maximum value'
        # Deprived area → community
        if imd <= 3:
            return 'community_asset_transfer', 'meanwhile_use', \
                'Vacant building in deprived area — community asset transfer opportunity'
        # Urban + vacant → meanwhile use
        if readiness < 50:
            return 'meanwhile_use', 'refurbish_relet', \
                'Vacant building not yet market-ready — meanwhile commercial use while preparing for disposal'
        # Default → private treaty
        if complexity <= 40:
            return 'quick_win_auction', 'private_treaty_sale', \
                'Low-complexity vacant building — auction for quick receipt'
        return 'private_treaty_sale', 'meanwhile_use', \
            'Vacant building — sell via agent to maximise price'

    # Fallback
    return 'governance_review', None, 'Insufficient data for pathway determination'


def compute_disposal_intelligence(lean_assets):
    """Run the full disposal intelligence engine on all assets.
    Mutates lean_assets in-place, returns stats dict for meta."""
    pathway_counts = {}
    occupancy_counts = {}
    quick_win_count = 0
    complexity_bands = {'low': 0, 'medium': 0, 'high': 0}

    for asset in lean_assets:
        # 1. Infer occupancy
        occ_status, occ_signals = infer_occupancy(asset)
        asset['occupancy_status'] = occ_status
        asset['_occupancy_signals'] = occ_signals  # stripped before output
        occupancy_counts[occ_status] = occupancy_counts.get(occ_status, 0) + 1

        # 2. Compute scores
        complexity, comp_breakdown = compute_complexity(asset, occ_status)
        readiness, read_breakdown = compute_readiness(asset, occ_status)
        revenue, rev_breakdown = compute_revenue_potential(asset, occ_status)
        urgency = compute_urgency(asset)

        asset['disposal_complexity'] = complexity
        asset['market_readiness'] = readiness
        asset['revenue_potential'] = revenue
        asset['_complexity_breakdown'] = comp_breakdown
        asset['_readiness_breakdown'] = read_breakdown
        asset['_revenue_breakdown'] = rev_breakdown

        # 3. Smart priority
        priority = round(
            readiness * 0.3 +
            (100 - complexity) * 0.3 +
            revenue * 0.2 +
            urgency * 0.2
        )
        asset['_smart_priority'] = max(1, min(priority, 100))

        # 4. Determine pathway
        pathway, pathway2, reasoning = determine_pathway(
            asset, occ_status, complexity, readiness, revenue)
        asset['disposal_pathway'] = pathway
        asset['disposal_pathway_secondary'] = pathway2
        asset['_pathway_reasoning'] = reasoning

        pathway_counts[pathway] = pathway_counts.get(pathway, 0) + 1

        # 5. Quick win flag
        is_quick_win = (
            complexity <= 30 and
            readiness >= 60 and
            occ_status in ('vacant_land', 'likely_vacant') and
            pathway in ('quick_win_auction', 'private_treaty_sale')
        )
        asset['_quick_win'] = is_quick_win
        if is_quick_win:
            quick_win_count += 1

        # 6. Complexity band
        if complexity >= 60:
            complexity_bands['high'] += 1
        elif complexity >= 30:
            complexity_bands['medium'] += 1
        else:
            complexity_bands['low'] += 1

        # 7. Timeline
        asset['_timeline'] = PATHWAY_TIMELINES.get(pathway, '6-12 months')

    return {
        'pathway_breakdown': dict(sorted(pathway_counts.items(), key=lambda x: -x[1])),
        'occupancy_breakdown': dict(sorted(occupancy_counts.items(), key=lambda x: -x[1])),
        'quick_wins': quick_win_count,
        'complexity_distribution': complexity_bands,
    }


def build_flags(row, fire_dist=None):
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
    # Fire risk: >10km from nearest fire station
    if fire_dist is not None and fire_dist > 10:
        flags.append('fire_risk')
    return flags


def build_lean_asset(row, ced_name='', ward_dep=None, ward_demo=None, fire_dist=None, fire_station=None):
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
        'flags': build_flags(row, fire_dist),
        'flood_areas_1km': safe_int(row.get('flood_areas_within_1km')),
        'crime_total': safe_int(row.get('crime_total_within_1mi')),
        'crime_density': safe_str(row.get('crime_density_band')),
        # World-class assessment bands
        'disposal_band': safe_str(row.get('world_class_disposal_band')) or None,
        'repurpose_band': safe_str(row.get('world_class_repurpose_band')) or None,
        'service_band': safe_str(row.get('world_class_service_band')) or None,
        'net_zero_band': safe_str(row.get('world_class_net_zero_band')) or None,
        'resilience_band': safe_str(row.get('world_class_resilience_band')) or None,
        # Disposal/sales evidence
        'sales_signal_score': safe_float(row.get('disposals_sales_signal_score')) or None,
        'sales_total_value': safe_str(row.get('disposals_sales_total_known_value')) or None,
        # Innovative reuse
        'innovative_use': safe_str(row.get('innovative_use_primary')) or None,
        # Fire risk (LFRS proximity)
        'fire_station_distance_km': fire_dist,
        'fire_station_nearest': fire_station,
        # Deprivation context (from deprivation.json ward lookup)
        'deprivation_level': ward_dep.get('deprivation_level') if ward_dep else None,
        'deprivation_score': round(ward_dep.get('avg_imd_score', 0), 1) if ward_dep else None,
        # Demographics context (from demographics.json ward lookup)
        'ward_population': ward_demo.get('population') or ward_demo.get('total_population') if ward_demo else None,
    }


def build_detail_asset(row, ced_name='', disposal_info=None, supplier_links=None,
                       condition_info=None, assessment_info=None, sales_evidence=None,
                       ward_dep=None, ward_demo=None, fire_dist=None, fire_station=None):
    """Build full detail asset dict for property_assets_detail.json."""
    lean = build_lean_asset(row, ced_name, ward_dep, ward_demo, fire_dist, fire_station)

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
        # Fire risk (LFRS proximity)
        'fire': {
            'nearest_station': fire_station,
            'distance_km': fire_dist,
            'high_risk': fire_dist is not None and fire_dist > 10,
        },
        # Ward-level context
        'ward_deprivation': ward_dep if ward_dep else None,
        'ward_demographics': {
            'population': ward_demo.get('population') or ward_demo.get('total_population'),
            'over_65_pct': ward_demo.get('over_65_pct'),
            'under_18_pct': ward_demo.get('under_18_pct'),
            'white_british_pct': ward_demo.get('white_british_pct'),
            'economically_active_pct': ward_demo.get('economically_active_pct'),
        } if ward_demo else None,
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

    # World-class assessment scores (from full assessment)
    if assessment_info:
        detail['assessment'] = {
            'recommendation': safe_str(assessment_info.get('recommendation')),
            'recommendation_category': safe_str(assessment_info.get('recommendation_category')),
            'priority_score': safe_int(assessment_info.get('priority_score')) or None,
            'confidence': safe_str(assessment_info.get('confidence')),
            'disposal_readiness': safe_float(assessment_info.get('world_class_disposal_readiness')) or None,
            'repurpose_potential': safe_float(assessment_info.get('world_class_repurpose_potential')) or None,
            'service_criticality': safe_float(assessment_info.get('world_class_service_criticality')) or None,
            'net_zero_priority': safe_float(assessment_info.get('world_class_net_zero_priority')) or None,
            'resilience_need': safe_float(assessment_info.get('world_class_resilience_need')) or None,
            'disposal_band': safe_str(assessment_info.get('world_class_disposal_band')) or None,
            'repurpose_band': safe_str(assessment_info.get('world_class_repurpose_band')) or None,
            'service_band': safe_str(assessment_info.get('world_class_service_band')) or None,
            'net_zero_band': safe_str(assessment_info.get('world_class_net_zero_band')) or None,
            'resilience_band': safe_str(assessment_info.get('world_class_resilience_band')) or None,
            'innovative_use_primary': safe_str(assessment_info.get('innovative_use_primary')),
            'innovative_use_secondary': safe_str(assessment_info.get('innovative_use_secondary')),
            'innovative_use_count': safe_int(assessment_info.get('innovative_use_count')),
            'reasoning': safe_str(assessment_info.get('reasoning')),
            'key_risks': safe_str(assessment_info.get('key_risks')),
            'next_steps': safe_str(assessment_info.get('next_steps')),
        }
    else:
        detail['assessment'] = None

    # Sales evidence (auction lots, current market listings)
    if sales_evidence:
        detail['sales_evidence'] = sales_evidence
    else:
        detail['sales_evidence'] = []

    # Add disposal data — smart engine fields populated later by compute_disposal_intelligence()
    # Preserve Codex original as reference
    codex_rec = None
    if disposal_info:
        codex_rec = {
            'recommendation': safe_str(disposal_info.get('recommendation')),
            'category': safe_str(disposal_info.get('recommendation_category')),
            'priority': safe_int(disposal_info.get('priority_score')) or None,
            'confidence': safe_str(disposal_info.get('confidence')),
            'reasoning': safe_str(disposal_info.get('reasoning')),
            'key_risks': safe_str(disposal_info.get('key_risks')),
            'next_steps': safe_str(disposal_info.get('next_steps')),
        }
    elif assessment_info and safe_str(assessment_info.get('reasoning')):
        codex_rec = {
            'recommendation': safe_str(assessment_info.get('recommendation')),
            'category': safe_str(assessment_info.get('recommendation_category')),
            'priority': safe_int(assessment_info.get('priority_score')) or None,
            'confidence': safe_str(assessment_info.get('confidence')),
            'reasoning': safe_str(assessment_info.get('reasoning')),
            'key_risks': safe_str(assessment_info.get('key_risks')),
            'next_steps': safe_str(assessment_info.get('next_steps')),
        }
    detail['disposal'] = {
        # Smart engine fields — populated by compute_disposal_intelligence()
        'pathway': None,
        'pathway_label': None,
        'pathway_secondary': None,
        'pathway_secondary_label': None,
        'pathway_reasoning': None,
        'complexity_score': None,
        'complexity_breakdown': [],
        'market_readiness_score': None,
        'readiness_breakdown': [],
        'revenue_potential_score': None,
        'occupancy_inferred': None,
        'occupancy_signals': [],
        'estimated_timeline': None,
        'quick_win': False,
        'smart_priority': None,
        # Codex original for comparison
        'codex': codex_rec,
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
    disposal_candidates = sum(1 for d in detail_assets if d.get('disposal', {}).get('smart_priority'))
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
        if ced and d.get('disposal', {}).get('smart_priority'):
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

    # Disposal recommendation / pathway breakdown
    disposal_recs = {}
    for a in lean_assets:
        rec = (a.get('disposal', {}) or {}).get('recommendation')
        if rec:
            disposal_recs[rec] = disposal_recs.get(rec, 0) + 1

    # Smart disposal intelligence breakdowns
    pathway_breakdown = {}
    occupancy_breakdown = {}
    quick_wins = 0
    complexity_bands = {'low': 0, 'medium': 0, 'high': 0}
    for a in lean_assets:
        pw = a.get('disposal_pathway')
        if pw:
            pathway_breakdown[pw] = pathway_breakdown.get(pw, 0) + 1
        occ = a.get('occupancy_status')
        if occ:
            occupancy_breakdown[occ] = occupancy_breakdown.get(occ, 0) + 1
        dc = a.get('disposal_complexity', 0)
        if dc >= 60:
            complexity_bands['high'] += 1
        elif dc >= 30:
            complexity_bands['medium'] += 1
        else:
            complexity_bands['low'] += 1
        # Quick win: must match engine definition exactly (complexity<=30, readiness>=60, vacant, disposal pathway)
        mr = a.get('market_readiness') or 0
        if a.get('disposal_pathway') in ('quick_win_auction', 'private_treaty_sale') and dc <= 30 and mr >= 60:
            if a.get('occupancy_status') in ('vacant_land', 'likely_vacant'):
                quick_wins += 1

    # World-class band distributions
    band_dist = {}
    for band_key in ['disposal_band', 'repurpose_band', 'service_band', 'net_zero_band', 'resilience_band']:
        dist = {}
        for a in lean_assets:
            v = a.get(band_key)
            if v:
                dist[v] = dist.get(v, 0) + 1
        band_dist[band_key] = dict(sorted(dist.items()))

    # Sales evidence stats
    has_sales = sum(1 for d in detail_assets if d.get('sales_evidence'))
    has_assessment = sum(1 for d in detail_assets if d.get('assessment'))

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
        'has_assessment': has_assessment,
        'has_sales_evidence': has_sales,
        'freehold': freehold,
        'leasehold': leasehold,
        'land_only': land_only,
        'category_breakdown': dict(sorted(categories.items(), key=lambda x: -x[1])),
        'district_breakdown': dict(sorted(districts.items(), key=lambda x: -x[1])),
        'epc_distribution': dict(sorted(epc_dist.items())),
        'disposal_recommendations': dict(sorted(disposal_recs.items(), key=lambda x: -x[1])),
        'pathway_breakdown': dict(sorted(pathway_breakdown.items(), key=lambda x: -x[1])),
        'occupancy_breakdown': dict(sorted(occupancy_breakdown.items(), key=lambda x: -x[1])),
        'quick_wins': quick_wins,
        'complexity_distribution': complexity_bands,
        'band_distributions': band_dist,
        'ced_summary': dict(sorted(ced_summary.items())),
        # Estate strategy context (from LCC Property Asset Management Strategy 2020 + Council Estate Report 2023)
        'estate_context': {
            'strategy_total_assets': 2000,
            'strategy_note': 'LCC Property Asset Management Strategy (Feb 2020) states just under 2,000 assets including ~600 schools',
            'portfolio_value': '£2 billion',
            'running_cost_annual': '£21 million (2021-22)',
            'condition_backlog': '£56.6 million (P1-P4)',
            'rm_budget': '£4.7 million (2022-23)',
            'carbon_tonnes_co2': 5581,
            'gia_sqm': 332516,
            'disposals_since_2016': 272,
            'disposals_value_since_2016': '£63.2 million',
            'community_transfers_since_2016': 10,
            'register_coverage_pct': round(100 * total / 2000, 1),
            'sources': [
                'LCC Property Asset Management Strategy (Feb 2020)',
                'Council Estate, Use and Occupancy of Council Buildings and Asset Disposal (Sep 2023)',
                'LCC Local Authority Land Register (Transparency Code)',
            ],
        },
    }


def main():
    parser = argparse.ArgumentParser(description='Property Assets ETL for AI DOGE')
    parser.add_argument('--input-dir', required=True, help='Directory with Codex CSV files')
    parser.add_argument('--council', default='lancashire_cc', help='Council ID')
    parser.add_argument('--owned-only', action='store_true', default=True,
                        help='Only include LCC-owned assets (default: true)')
    parser.add_argument('--include-all', action='store_true', default=False,
                        help='Include non-owned/partnership records (overrides --owned-only)')
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

    # Filter to owned only (unless --include-all)
    if args.owned_only and not args.include_all:
        before = len(primary_rows)
        primary_rows = [r for r in primary_rows
                        if safe_str(r.get('is_owned_in_lcc_register', 'Y')) != 'N']
        print(f"  Filtered to owned: {before} → {len(primary_rows)}")
    else:
        print(f"  Including ALL records (owned + non-owned): {len(primary_rows)}")

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

    # Non-owned records (merge any not already in primary)
    if args.include_all:
        non_owned_rows = read_csv(str(input_dir / 'lcc_non_owned_or_unclear_records.csv'))
        added = 0
        for row in non_owned_rows:
            aid = safe_str(row.get('unique_asset_id'))
            if aid and aid not in primary_by_id:
                primary_rows.append(row)
                primary_by_id[aid] = row
                added += 1
        if added:
            print(f"  Added {added} non-owned records from supplementary CSV")

    # Full assessment (world-class scores, innovative use, reasoning, risks, next steps)
    assessment_rows = read_csv(str(input_dir / 'lcc_property_full_assessment.csv'))
    assessment_by_id = {}
    for row in assessment_rows:
        aid = safe_str(row.get('unique_asset_id'))
        if aid:
            assessment_by_id[aid] = row

    # Disposals/sales evidence (auction lots, current market listings)
    sales_evidence_rows = read_csv(str(input_dir / 'lcc_disposals_sales_lot_evidence.csv'))
    sales_by_asset_id = {}
    for row in sales_evidence_rows:
        aid = safe_str(row.get('matched_asset_id'))
        if not aid:
            continue
        if aid not in sales_by_asset_id:
            sales_by_asset_id[aid] = []
        sales_by_asset_id[aid].append({
            'type': safe_str(row.get('lot_source_type')),
            'title': safe_str(row.get('lot_title')),
            'status': safe_str(row.get('lot_status')),
            'price': safe_str(row.get('lot_price')),
            'date': safe_str(row.get('lot_date')),
            'method': safe_str(row.get('lot_method')),
            'url': safe_str(row.get('lot_url')),
            'confidence': safe_str(row.get('match_confidence')),
        })
    print(f"  Sales evidence: {len(sales_evidence_rows)} lots across {len(sales_by_asset_id)} assets")

    # Decision screen (for screening scores if not in primary)
    screen_rows = read_csv(str(input_dir / 'lcc_property_decision_screen.csv'))
    screen_by_id = {}
    for row in screen_rows:
        aid = safe_str(row.get('unique_asset_id'))
        if aid:
            screen_by_id[aid] = row

    # --- 2b. Load ward-level enrichment data ---
    print(f"\n--- Loading ward enrichment data ---")
    ward_dep_data = load_ward_deprivation(council_dir)
    ward_demo_data = load_ward_demographics(council_dir)

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

    fire_enriched = 0
    dep_enriched = 0
    demo_enriched = 0
    for aid, row in primary_by_id.items():
        ced_name = row.get('_ced', '')
        disposal_info = disposal_by_id.get(aid)
        supplier_links = supplier_links_by_id.get(aid, [])
        condition_info = condition_by_id.get(aid)
        assessment_info = assessment_by_id.get(aid)
        sales_evidence = sales_by_asset_id.get(aid, [])

        # Ward-level enrichment lookups
        ward_name = safe_str(row.get('admin_ward'))
        ward_dep = ward_dep_data.get(ward_name)
        ward_demo = ward_demo_data.get(ward_name)
        if ward_dep:
            dep_enriched += 1
        if ward_demo:
            demo_enriched += 1

        # Fire proximity
        lat = safe_float(row.get('latitude_wgs84'))
        lng = safe_float(row.get('longitude_wgs84'))
        fire_dist, fire_station = compute_fire_proximity(lat, lng)
        if fire_dist is not None:
            fire_enriched += 1

        lean = build_lean_asset(row, ced_name, ward_dep, ward_demo, fire_dist, fire_station)

        # Merge supplier spend from separate CSV if primary has 0
        if lean['linked_spend'] == 0 and supplier_links:
            agg_spend = sum(sl['spend'] for sl in supplier_links)
            agg_txns = sum(sl['transactions'] for sl in supplier_links)
            if agg_spend > 0:
                lean['linked_spend'] = round(agg_spend, 2)
                lean['linked_txns'] = agg_txns
                lean['linked_suppliers'] = len(supplier_links)

        # Merge condition spend from separate CSV if primary has 0
        if lean['condition_spend'] == 0 and condition_info:
            cs = safe_float(condition_info.get('condition_related_spend_total'))
            ct = safe_int(condition_info.get('condition_related_transactions'))
            if cs > 0:
                lean['condition_spend'] = round(cs, 2)
                lean['condition_txns'] = ct

        # Merge world-class bands from full assessment if missing from primary
        if assessment_info:
            for band_key, assess_key in [
                ('disposal_band', 'world_class_disposal_band'),
                ('repurpose_band', 'world_class_repurpose_band'),
                ('service_band', 'world_class_service_band'),
                ('net_zero_band', 'world_class_net_zero_band'),
                ('resilience_band', 'world_class_resilience_band'),
            ]:
                if not lean.get(band_key):
                    lean[band_key] = safe_str(assessment_info.get(assess_key)) or None
            # Merge innovative use
            if not lean.get('innovative_use'):
                lean['innovative_use'] = safe_str(assessment_info.get('innovative_use_primary')) or None
            # Merge disposal/sales signal from assessment
            if not lean.get('sales_signal_score') and assessment_info.get('disposals_sales_signal_score'):
                lean['sales_signal_score'] = safe_float(assessment_info.get('disposals_sales_signal_score')) or None
                lean['sales_total_value'] = safe_str(assessment_info.get('disposals_sales_total_known_value')) or None

        lean_assets.append(lean)

        # Disposal stub — populated by intelligence engine below
        lean['disposal'] = {'recommendation': None, 'category': None, 'priority': None, 'confidence': None}

        detail = build_detail_asset(row, ced_name, disposal_info, supplier_links,
                                    condition_info, assessment_info, sales_evidence,
                                    ward_dep, ward_demo, fire_dist, fire_station)
        detail_assets.append(detail)

    print(f"  Fire proximity: {fire_enriched}/{len(primary_by_id)} assets")
    print(f"  Ward deprivation: {dep_enriched}/{len(primary_by_id)} assets")
    print(f"  Ward demographics: {demo_enriched}/{len(primary_by_id)} assets")

    # --- 5b. Run Smart Disposal Intelligence Engine ---
    print(f"\n--- Running Smart Disposal Intelligence Engine ---")
    intel_stats = compute_disposal_intelligence(lean_assets)

    # Populate lean disposal fields from engine results
    for lean, detail in zip(lean_assets, detail_assets):
        lean['disposal'] = {
            'recommendation': PATHWAY_LABELS.get(lean.get('disposal_pathway'), lean.get('disposal_pathway')),
            'category': lean.get('disposal_pathway'),
            'priority': lean.get('_smart_priority'),
            'confidence': 'computed',
        }
        # Populate detail disposal from engine
        detail['disposal']['pathway'] = lean.get('disposal_pathway')
        detail['disposal']['pathway_label'] = PATHWAY_LABELS.get(lean.get('disposal_pathway'), '')
        detail['disposal']['pathway_secondary'] = lean.get('disposal_pathway_secondary')
        detail['disposal']['pathway_secondary_label'] = PATHWAY_LABELS.get(lean.get('disposal_pathway_secondary'), '')
        detail['disposal']['pathway_reasoning'] = lean.get('_pathway_reasoning', '')
        detail['disposal']['complexity_score'] = lean.get('disposal_complexity', 0)
        detail['disposal']['complexity_breakdown'] = [
            {'factor': f, 'points': p} for f, p in lean.get('_complexity_breakdown', [])
        ]
        detail['disposal']['market_readiness_score'] = lean.get('market_readiness', 0)
        detail['disposal']['readiness_breakdown'] = [
            {'factor': f, 'points': p} for f, p in lean.get('_readiness_breakdown', [])
        ]
        detail['disposal']['revenue_potential_score'] = lean.get('revenue_potential', 0)
        detail['disposal']['revenue_breakdown'] = [
            {'factor': f, 'points': p} for f, p in lean.get('_revenue_breakdown', [])
        ]
        detail['disposal']['occupancy_inferred'] = lean.get('occupancy_status')
        detail['disposal']['occupancy_signals'] = lean.get('_occupancy_signals', [])
        detail['disposal']['estimated_timeline'] = lean.get('_timeline')
        detail['disposal']['quick_win'] = lean.get('_quick_win', False)
        detail['disposal']['smart_priority'] = lean.get('_smart_priority')
        # Also sync top-level lean fields
        detail['occupancy_status'] = lean.get('occupancy_status')
        detail['disposal_complexity'] = lean.get('disposal_complexity')
        detail['market_readiness'] = lean.get('market_readiness')
        detail['revenue_potential'] = lean.get('revenue_potential')
        detail['disposal_pathway'] = lean.get('disposal_pathway')
        detail['disposal_pathway_secondary'] = lean.get('disposal_pathway_secondary')

    # Clean temporary fields from lean
    for asset in lean_assets:
        for key in ['_occupancy_signals', '_complexity_breakdown', '_readiness_breakdown',
                     '_revenue_breakdown', '_smart_priority', '_pathway_reasoning', '_quick_win', '_timeline']:
            asset.pop(key, None)

    print(f"  Pathways: {intel_stats['pathway_breakdown']}")
    print(f"  Occupancy: {intel_stats['occupancy_breakdown']}")
    print(f"  Quick wins: {intel_stats['quick_wins']}")
    print(f"  Complexity: {intel_stats['complexity_distribution']}")

    # Sort by smart priority (high first) then by name
    lean_assets.sort(key=lambda a: (
        -(a.get('disposal', {}).get('priority') or 0),
        a.get('name', '')
    ))
    detail_assets.sort(key=lambda a: (
        -(a.get('disposal', {}).get('smart_priority') or 0),
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
