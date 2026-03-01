#!/usr/bin/env python3
"""
Property Assets ETL for AI DOGE
Reads Codex-enriched LCC property CSVs, adds CED mapping,
fills enrichment gaps via live APIs, and generates JSON for the frontend.

Usage:
    python3 property_assets_etl.py --input-dir "~/Documents/New project/" --council lancashire_cc --include-all
    python3 property_assets_etl.py --input-dir "~/Documents/New project/" --council lancashire_cc --include-all --live-enrich
"""
import argparse
import csv
import json
import math
import os
import sys
import time
import urllib.request
import urllib.parse
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
    # Heritage / environmental constraints (from live enrichment)
    'listed_building_grade', 'flood_zone', 'sssi_nearby',
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


def _extract_population(demo):
    """Extract total population from demographics ward data.
    Raw census: demo['age']['Total: All usual residents'].
    Pre-computed: demo.get('population') or demo.get('total_population')."""
    if not demo:
        return None
    # Pre-computed format
    pop = demo.get('population') or demo.get('total_population')
    if pop:
        return safe_int(pop) or None
    # Raw census format
    age = demo.get('age', {})
    pop = age.get('Total: All usual residents') or age.get('Total')
    return safe_int(pop) or None


def _extract_demographics(demo):
    """Extract key demographics from raw census ward data for detail JSON."""
    if not demo:
        return None
    pop = _extract_population(demo)
    age = demo.get('age', {})

    # Over 65: sum of 65-74, 75-84, 85+
    over65 = sum(safe_int(age.get(k)) for k in [
        'Aged 65 to 74 years', 'Aged 75 to 84 years', 'Aged 85 years and over'
    ])

    # Under 18: 0-4, 5-9, 10-15, 16, 17
    under18 = sum(safe_int(age.get(k)) for k in [
        'Aged 4 years and under', 'Aged 5 to 9 years', 'Aged 10 to 15 years',
        'Aged 16 years', 'Aged 17 years'
    ])

    # White British from ethnicity data
    eth = demo.get('ethnicity', {})
    white_british = safe_int(eth.get('White: English, Welsh, Scottish, Northern Irish or British'))

    # Economically active from economic_activity data
    econ = demo.get('economic_activity', {})
    ea_total = safe_int(econ.get('Total: All usual residents aged 16 years and over'))
    ea_active = safe_int(econ.get('Economically active (excluding full-time students)'))
    ea_active += safe_int(econ.get('Economically active and a full-time student'))

    return {
        'population': pop,
        'over_65_pct': round(over65 / pop * 100, 1) if pop and over65 else demo.get('over_65_pct'),
        'under_18_pct': round(under18 / pop * 100, 1) if pop and under18 else demo.get('under_18_pct'),
        'white_british_pct': round(white_british / pop * 100, 1) if pop and white_british else demo.get('white_british_pct'),
        'economically_active_pct': round(ea_active / ea_total * 100, 1) if ea_total and ea_active else demo.get('economically_active_pct'),
    }


def _lr_median(comps):
    """Get median price from Land Registry comparables list."""
    prices = sorted([c['price'] for c in (comps or []) if c.get('price')])
    return int(prices[len(prices)//2]) if prices else None


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


# ── Live Enrichment Engine ───────────────────────────────────────────────────
# Queries free UK public APIs to fill data gaps left by Codex CSV errors.
# Gated behind --live-enrich flag. All APIs are free, no keys required.

LANCASHIRE_BBOX = (-3.15, 53.35, -1.95, 54.25)  # SW lng, SW lat, NE lng, NE lat


def _api_get(url, timeout=15):
    """GET a URL, return parsed JSON. Returns None on error.
    Handles SSL/TLS compatibility across Python versions."""
    import ssl
    req = urllib.request.Request(url, headers={
        'User-Agent': 'AI-DOGE-PropertyETL/1.0 (Lancashire County Council transparency tool)',
        'Accept': 'application/json',
    })
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            return json.loads(resp.read())
    except ssl.SSLError:
        # Fallback for old Python / LibreSSL
        try:
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS)
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                return json.loads(resp.read())
        except Exception:
            return None
    except Exception:
        return None


def enrich_crime_data(primary_rows, date=None):
    """Enrich assets with street-level crime data from data.police.uk.
    Free API, no auth, 15 req/sec limit. ~80 seconds for 1,134 assets."""
    if date is None:
        # Use 3 months ago (latest available — police data has ~2 month lag)
        from datetime import datetime, timedelta
        d = datetime.now() - timedelta(days=90)
        date = d.strftime('%Y-%m')

    print(f"\n  --- Crime enrichment (data.police.uk, date={date}) ---")
    enriched = 0
    skipped = 0
    errors = 0
    batch_start = time.time()

    for i, row in enumerate(primary_rows):
        lat = safe_float(row.get('latitude_wgs84'))
        lng = safe_float(row.get('longitude_wgs84'))

        # Skip if already has crime data (non-zero)
        if safe_int(row.get('crime_total_within_1mi')) > 0:
            continue

        if not lat or not lng:
            skipped += 1
            continue

        url = f"https://data.police.uk/api/crimes-at-location?lat={lat}&lng={lng}&date={date}"
        data = _api_get(url, timeout=10)

        if data is None:
            errors += 1
            if errors <= 5:
                pass  # silent
            continue

        total = len(data)
        violent = sum(1 for c in data if c.get('category') in (
            'violent-crime', 'violence-and-sexual-offences'))
        antisocial = sum(1 for c in data if c.get('category') == 'anti-social-behaviour')

        # Density band (calibrated against Lancashire averages)
        if total >= 80:
            density = 'high'
        elif total >= 25:
            density = 'medium'
        else:
            density = 'low'

        # Top 3 categories
        cats = {}
        for c in data:
            cat = c.get('category', 'other')
            cats[cat] = cats.get(cat, 0) + 1
        top3 = ', '.join(f"{k}: {v}" for k, v in sorted(cats.items(), key=lambda x: -x[1])[:3])

        row['crime_total_within_1mi'] = str(total)
        row['crime_violent_within_1mi'] = str(violent)
        row['crime_antisocial_within_1mi'] = str(antisocial)
        row['crime_density_band'] = density
        row['crime_top3_categories'] = top3
        row['crime_snapshot_month'] = date
        row['_crime_enriched'] = True
        if density == 'high':
            row['flag_high_crime_area'] = 'Y'

        enriched += 1

        # Rate limit: 15 req/sec — sleep every 14 requests
        if enriched % 14 == 0:
            time.sleep(1.05)

        # Progress every 200
        if (enriched + skipped + errors) % 200 == 0:
            elapsed = time.time() - batch_start
            print(f"    Crime: {enriched} enriched, {errors} errors ({elapsed:.0f}s)")

    elapsed = time.time() - batch_start
    print(f"  Crime: {enriched} enriched, {skipped} skipped (no coords), {errors} errors ({elapsed:.0f}s)")
    return enriched


def enrich_flood_data(primary_rows):
    """Enrich assets with flood risk data using EA Flood Monitoring stations API.
    Finds nearby flood monitoring stations (rivers/reservoirs) within 1km.
    Free API, no auth. Works reliably (unlike the OGC Features API which returns 500)."""
    print(f"\n  --- Flood risk enrichment (EA Flood Monitoring API) ---")
    enriched = 0
    skipped = 0
    errors = 0
    batch_start = time.time()

    # Deduplicate by approximate location (~500m grid) to avoid redundant queries
    # Flood monitoring stations serve large areas — 500m resolution is ample
    loc_cache = {}
    api_calls = 0

    for i, row in enumerate(primary_rows):
        lat = safe_float(row.get('latitude_wgs84'))
        lng = safe_float(row.get('longitude_wgs84'))

        if not lat or not lng:
            skipped += 1
            continue

        # Cache key at ~500m resolution (2 decimal places ≈ 500m at UK latitudes)
        cache_key = f"{round(lat, 2)},{round(lng, 2)}"
        if cache_key in loc_cache:
            cached = loc_cache[cache_key]
            row['_flood_zone'] = cached.get('zone', 0)
            row['_flood_stations_1km'] = cached.get('stations', 0)
            row['_flood_nearest_river'] = cached.get('river', '')
            if cached.get('stations', 0) > 0:
                row['flood_areas_within_1km'] = str(max(safe_int(row.get('flood_areas_within_1km')), cached['stations']))
                row['flag_flood_exposure'] = 'Y'
                enriched += 1
            continue

        # Query EA for flood monitoring stations within 1km
        url = f"https://environment.data.gov.uk/flood-monitoring/id/stations?lat={lat}&long={lng}&dist=1"
        data = _api_get(url, timeout=10)
        api_calls += 1

        if data is None:
            errors += 1
            loc_cache[cache_key] = {'zone': 0, 'stations': 0, 'river': ''}
            continue

        stations = data.get('items', [])
        n_stations = len(stations)

        # Extract river names from nearby stations
        rivers = set()
        for s in stations:
            river = s.get('riverName', '')
            if river:
                rivers.add(river)

        nearest_river = ', '.join(sorted(rivers)[:3]) if rivers else ''

        # Flood risk level based on station proximity:
        # Multiple stations within 1km = high flood monitoring = high risk area
        if n_stations >= 3:
            zone = 3  # High risk — multiple flood stations very close
        elif n_stations >= 1:
            zone = 2  # Medium risk — flood monitoring present
        else:
            zone = 0

        loc_cache[cache_key] = {'zone': zone, 'stations': n_stations, 'river': nearest_river}

        row['_flood_zone'] = zone
        row['_flood_stations_1km'] = n_stations
        row['_flood_nearest_river'] = nearest_river

        if n_stations > 0:
            row['flood_areas_within_1km'] = str(max(safe_int(row.get('flood_areas_within_1km')), n_stations))
            row['flag_flood_exposure'] = 'Y'
            enriched += 1

        # Rate limit: generous but be polite
        if api_calls % 50 == 0:
            time.sleep(0.5)

        # Progress every 100 API calls
        if api_calls % 100 == 0:
            elapsed = time.time() - batch_start
            print(f"    Flood: {api_calls} API calls, {enriched} near stations, {errors} errors ({elapsed:.0f}s)")

    elapsed = time.time() - batch_start
    print(f"  Flood: {enriched} near flood areas, {skipped} skipped, {errors} errors ({elapsed:.0f}s)")
    print(f"    API calls: {api_calls}, unique grid cells: {len(loc_cache)}")
    return enriched


def download_listed_buildings():
    """Download Historic England National Heritage List for Lancashire.
    Free ArcGIS FeatureServer, no auth. Returns list of (name, grade, lat, lng, list_entry)."""
    print(f"\n  --- Listed buildings download (Historic England ArcGIS) ---")

    bbox = LANCASHIRE_BBOX
    # ArcGIS expects xmin,ymin,xmax,ymax
    envelope = f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"

    base_url = (
        "https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/arcgis/rest/services/"
        "National_Heritage_List_for_England_NHLE_v02_VIEW/FeatureServer/0/query"
    )

    buildings = []
    offset = 0
    batch_size = 2000

    while True:
        params = {
            'where': '1=1',
            'geometry': envelope,
            'geometryType': 'esriGeometryEnvelope',
            'spatialRel': 'esriSpatialRelIntersects',
            'returnGeometry': 'true',
            'outFields': 'Name,Grade,ListEntry',
            'f': 'json',
            'resultRecordCount': str(batch_size),
            'resultOffset': str(offset),
            'inSR': '4326',
            'outSR': '4326',
        }
        url = f"{base_url}?{urllib.parse.urlencode(params)}"
        data = _api_get(url, timeout=120)

        if not data or 'features' not in data:
            if data and data.get('error'):
                print(f"    HE ArcGIS error: {data['error']}")
            break

        features = data['features']
        for f in features:
            attrs = f.get('attributes', {})
            geom = f.get('geometry', {})
            if geom and 'x' in geom and 'y' in geom:
                buildings.append({
                    'name': attrs.get('Name', ''),
                    'grade': attrs.get('Grade', ''),
                    'list_entry': str(attrs.get('ListEntry', '')),
                    'lat': geom['y'],
                    'lng': geom['x'],
                })

        if len(features) < batch_size:
            break
        offset += batch_size
        print(f"    Downloaded {offset + len(features)} listed buildings so far...")

    print(f"  Listed buildings: {len(buildings)} in Lancashire region")
    return buildings


def _swap_coords(geom):
    """Swap [lat,lng] to [lng,lat] in a GeoJSON geometry dict.
    data.gov.uk WFS returns WGS84 coords as [lat,lng] but GeoJSON/Shapely expects [lng,lat]."""
    def swap(coords):
        if isinstance(coords, list):
            if coords and isinstance(coords[0], (int, float)):
                # It's a coordinate pair [lat, lng] → [lng, lat]
                return [coords[1], coords[0]] + coords[2:]
            else:
                return [swap(c) for c in coords]
        return coords

    return {**geom, 'coordinates': swap(geom.get('coordinates', []))}


def _haversine_m(lat1, lng1, lat2, lng2):
    """Haversine distance in metres between two lat/lng points."""
    R = 6371000
    dLat = math.radians(lat2 - lat1)
    dLng = math.radians(lng2 - lng1)
    a = (math.sin(dLat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dLng / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(min(1, a)))


def enrich_listed_buildings(primary_rows, listed_buildings, radius_m=200):
    """Enrich assets: is this asset itself listed? Any listed buildings within radius?"""
    if not listed_buildings:
        return 0

    print(f"  --- Listed buildings enrichment (radius={radius_m}m) ---")
    enriched = 0

    for row in primary_rows:
        lat = safe_float(row.get('latitude_wgs84'))
        lng = safe_float(row.get('longitude_wgs84'))
        if not lat or not lng:
            continue

        # Find closest listed building and all within radius
        closest_dist = float('inf')
        closest = None
        within_radius = []

        for lb in listed_buildings:
            d = _haversine_m(lat, lng, lb['lat'], lb['lng'])
            if d < closest_dist:
                closest_dist = d
                closest = lb
            if d <= radius_m:
                within_radius.append({**lb, 'distance_m': round(d)})

        # Check if asset itself is likely listed (within 30m of a listed building)
        if closest and closest_dist <= 30:
            row['_listed_building_grade'] = closest['grade']
            row['_listed_building_name'] = closest['name']
            row['_listed_building_entry'] = closest.get('list_entry', '')
        else:
            row['_listed_building_grade'] = ''
            row['_listed_building_name'] = ''

        row['_listed_buildings_nearby'] = len(within_radius)
        row['_listed_buildings_detail'] = sorted(within_radius, key=lambda x: x['distance_m'])[:5]

        if within_radius:
            enriched += 1

    print(f"  Listed buildings: {enriched} assets have listed buildings within {radius_m}m")
    # Count directly listed
    directly_listed = sum(1 for r in primary_rows if r.get('_listed_building_grade'))
    print(f"  Directly listed (within 30m): {directly_listed} assets")
    return enriched


def download_natural_england_designations():
    """Download SSSI and AONB/National Landscape boundaries for Lancashire.
    Uses data.gov.uk OGC WFS (free, no auth) instead of NE ArcGIS (requires token)."""
    print(f"\n  --- Environmental designations download (data.gov.uk WFS) ---")

    bbox = LANCASHIRE_BBOX
    # WFS BBOX: lat_min,lng_min,lat_max,lng_max,crs
    wfs_bbox = f"{bbox[1]},{bbox[0]},{bbox[3]},{bbox[2]},urn:ogc:def:crs:EPSG::4326"
    designations = {'sssi': [], 'aonb': []}

    # SSSI boundaries via data.gov.uk WFS
    # Request WGS84 output via srsName — but data.gov.uk returns [lat,lng] not [lng,lat]
    sssi_url = (
        "https://environment.data.gov.uk/spatialdata/"
        "sites-of-special-scientific-interest-units-england/wfs"
        "?service=WFS&version=2.0.0&request=GetFeature"
        "&typeNames=Sites_of_Special_Scientific_Interest_Units_England"
        f"&count=5000&outputFormat=GEOJSON&srsName=urn:ogc:def:crs:EPSG::4326&BBOX={wfs_bbox}"
    )
    data = _api_get(sssi_url, timeout=120)

    if data and 'features' in data:
        from shapely.geometry import shape as shp_shape
        seen_sssi = set()  # Deduplicate by name (units → sites)
        for feat in data['features']:
            geom = feat.get('geometry')
            props = feat.get('properties', {})
            name = props.get('sssi_name', '')
            if not geom or not name or name in seen_sssi:
                continue
            try:
                # data.gov.uk WFS returns WGS84 [lat,lng] — swap to GeoJSON standard [lng,lat]
                swapped_geom = _swap_coords(geom)
                poly = shp_shape(swapped_geom)
                if not poly.is_valid:
                    poly = poly.buffer(0)
                designations['sssi'].append({
                    'name': name,
                    'geometry': poly,
                })
                seen_sssi.add(name)
            except Exception:
                pass
        print(f"    SSSIs: {len(designations['sssi'])} unique in Lancashire")
    else:
        print(f"    SSSIs: download failed")

    # AONB / National Landscapes via data.gov.uk WFS
    aonb_url = (
        "https://environment.data.gov.uk/spatialdata/"
        "areas-of-outstanding-natural-beauty-england/wfs"
        "?service=WFS&version=2.0.0&request=GetFeature"
        "&typeNames=Areas_of_Outstanding_Natural_Beauty_England"
        f"&count=100&outputFormat=GEOJSON&srsName=urn:ogc:def:crs:EPSG::4326&BBOX={wfs_bbox}"
    )
    data = _api_get(aonb_url, timeout=120)

    if data and 'features' in data:
        from shapely.geometry import shape as shp_shape
        for feat in data['features']:
            geom = feat.get('geometry')
            props = feat.get('properties', {})
            name = props.get('name', '')
            if not geom or not name:
                continue
            try:
                swapped_geom = _swap_coords(geom)
                poly = shp_shape(swapped_geom)
                if not poly.is_valid:
                    poly = poly.buffer(0)
                designations['aonb'].append({
                    'name': name,
                    'geometry': poly,
                })
            except Exception:
                pass
        print(f"    AONBs/National Landscapes: {len(designations['aonb'])} in Lancashire")
    else:
        print(f"    AONBs: download failed")

    return designations


def enrich_environmental_designations(primary_rows, designations):
    """Check if assets are within SSSIs or AONBs."""
    if not designations or not HAS_SHAPELY:
        return 0

    print(f"  --- Environmental designation enrichment ---")
    sssi_count = 0
    aonb_count = 0

    for row in primary_rows:
        lat = safe_float(row.get('latitude_wgs84'))
        lng = safe_float(row.get('longitude_wgs84'))
        if not lat or not lng:
            row['_sssi_nearby'] = False
            row['_sssi_name'] = ''
            row['_aonb_name'] = ''
            continue

        pt = Point(lng, lat)
        # ~0.005 degrees ≈ 500m buffer
        buffered = pt.buffer(0.005)

        # Check SSSIs
        sssi_hit = ''
        for sssi in designations.get('sssi', []):
            if sssi['geometry'].intersects(buffered):
                sssi_hit = sssi['name']
                break
        row['_sssi_nearby'] = bool(sssi_hit)
        row['_sssi_name'] = sssi_hit
        if sssi_hit:
            sssi_count += 1

        # Check AONBs
        aonb_hit = ''
        for aonb in designations.get('aonb', []):
            if aonb['geometry'].intersects(buffered):
                aonb_hit = aonb['name']
                break
        row['_aonb_name'] = aonb_hit
        if aonb_hit:
            aonb_count += 1

    print(f"  SSSIs: {sssi_count} assets near SSSIs")
    print(f"  AONBs: {aonb_count} assets in AONBs/National Landscapes")
    return sssi_count + aonb_count


def enrich_land_registry_comparables(primary_rows):
    """Find nearby Land Registry Price Paid comparables for each asset.
    Uses the LR Linked Data API (free, no auth) to find recent sales in the same town/district.
    Cached by district to minimise API calls (~14 distinct districts in Lancashire)."""
    print(f"\n  --- Land Registry Price Paid comparables ---")
    batch_start = time.time()

    # Group assets by district to batch API calls
    district_cache = {}
    enriched = 0
    errors = 0

    for row in primary_rows:
        district = safe_str(row.get('admin_district'))
        postcode = safe_str(row.get('norm_postcode') or row.get('postcode'))
        if not district and not postcode:
            continue

        # Try postcode area first (more local), fall back to district/town
        pc_area = postcode[:4].strip().replace(' ', '') if postcode else ''
        cache_key = pc_area or district

        if cache_key in district_cache:
            row['_lr_comparables'] = district_cache[cache_key]
            if district_cache[cache_key]:
                enriched += 1
            continue

        # Query LR by town name (district as proxy)
        town = district.upper().replace(' DISTRICT', '').replace(' BOROUGH', '').strip()
        if not town:
            district_cache[cache_key] = []
            continue

        url = (f"https://landregistry.data.gov.uk/data/ppi/transaction-record.json"
               f"?propertyAddress.town={urllib.parse.quote(town)}"
               f"&min-pricePaid=50000&_pageSize=50&_sort=-transactionDate")
        data = _api_get(url, timeout=30)

        if not data:
            errors += 1
            district_cache[cache_key] = []
            continue

        items = data.get('result', {}).get('items', [])
        comps = []
        for item in items[:50]:
            addr = item.get('propertyAddress', {})
            ptype = item.get('propertyType', {})
            if isinstance(ptype, dict):
                ptype = ptype.get('_about', '').split('/')[-1]
            comps.append({
                'price': item.get('pricePaid', 0),
                'date': (item.get('transactionDate') or '')[:10],
                'address': f"{addr.get('paon', '')} {addr.get('street', '')}".strip(),
                'postcode': addr.get('postcode', ''),
                'type': str(ptype),
                'town': addr.get('town', ''),
            })

        district_cache[cache_key] = comps
        row['_lr_comparables'] = comps
        if comps:
            enriched += 1

    # Apply cached to remaining
    for row in primary_rows:
        if '_lr_comparables' not in row:
            district = safe_str(row.get('admin_district'))
            postcode = safe_str(row.get('norm_postcode') or row.get('postcode'))
            pc_area = postcode[:4].strip().replace(' ', '') if postcode else ''
            cache_key = pc_area or district
            row['_lr_comparables'] = district_cache.get(cache_key, [])
            if row['_lr_comparables']:
                enriched += 1

    elapsed = time.time() - batch_start
    total_comps = sum(len(v) for v in district_cache.values())
    print(f"  Land Registry: {enriched} assets with comparables, {total_comps} total sales")
    print(f"    Districts queried: {len(district_cache)}, errors: {errors} ({elapsed:.0f}s)")
    return enriched


def derive_deprivation_from_imd(imd_decile):
    """Derive deprivation_level and approximate score from IMD decile.
    Used when ward-level deprivation.json is not available (e.g. LCC county).
    Returns (level, approximate_score) tuple."""
    if not imd_decile:
        return None, None

    # IMD decile 1 = most deprived 10%, 10 = least deprived 10%
    # Map to human-readable levels and approximate IMD scores
    if imd_decile <= 1:
        return 'very_high', 45.0  # Top 10% most deprived
    elif imd_decile <= 2:
        return 'high', 35.0
    elif imd_decile <= 3:
        return 'above_average', 28.0
    elif imd_decile <= 5:
        return 'average', 20.0
    elif imd_decile <= 7:
        return 'below_average', 14.0
    elif imd_decile <= 9:
        return 'low', 8.0
    else:
        return 'very_low', 4.0


def load_ward_demographics_improved(council_dir, ced_polygons=None):
    """Enhanced demographics loader with better name matching.
    Tries multiple matching strategies: exact name, normalised name,
    name without suffix, CED-to-ward spatial matching."""
    demo_path = Path(council_dir) / 'demographics.json'
    if not demo_path.exists():
        print(f"  demographics.json not found — skipping demographic enrichment")
        return {}
    try:
        with open(demo_path) as f:
            demo_data = json.load(f)
        wards = demo_data.get('wards', {})
        by_name = {}
        by_normalised = {}

        for code, val in wards.items():
            name = val.get('name') or val.get('ward_name', '')
            if name:
                by_name[name] = val
                # Normalised: lowercase, strip "ward", strip commas, collapse spaces
                norm = name.lower().replace(' ward', '').replace(',', '').strip()
                norm = ' '.join(norm.split())
                by_normalised[norm] = val
                # Also store without common suffixes
                for suffix in [' north', ' south', ' east', ' west', ' central',
                               ' rural', ' urban', ' and ', ' with ']:
                    pass  # Keep full name as key

        print(f"  Loaded demographics data for {len(by_name)} wards (improved matching)")
        return {'by_name': by_name, 'by_normalised': by_normalised}
    except Exception as e:
        print(f"  Error loading demographics.json: {e}")
        return {}


def match_demographics(ward_name, ced_name, demo_lookup):
    """Try multiple strategies to match a ward/CED to demographics data."""
    if not demo_lookup:
        return None

    by_name = demo_lookup.get('by_name', {})
    by_normalised = demo_lookup.get('by_normalised', {})

    # Strategy 1: Exact match on ward name
    if ward_name and ward_name in by_name:
        return by_name[ward_name]

    # Strategy 2: Exact match on CED name
    if ced_name and ced_name in by_name:
        return by_name[ced_name]

    # Strategy 3: Normalised match
    if ward_name:
        norm = ward_name.lower().replace(' ward', '').replace(',', '').strip()
        norm = ' '.join(norm.split())
        if norm in by_normalised:
            return by_normalised[norm]

    if ced_name:
        norm = ced_name.lower().replace(' ward', '').replace(',', '').strip()
        norm = ' '.join(norm.split())
        if norm in by_normalised:
            return by_normalised[norm]

    # Strategy 4: Partial match — find best overlap
    if ward_name:
        ward_lower = ward_name.lower()
        for name, val in by_name.items():
            if ward_lower in name.lower() or name.lower() in ward_lower:
                return val

    return None


def run_live_enrichment(primary_rows):
    """Run all live API enrichment on primary rows. Called when --live-enrich is set."""
    print(f"\n=== Live API Enrichment ===")

    # 1. Crime data from Police API (free, no auth, 15 req/sec)
    enrich_crime_data(primary_rows)

    # 2. Flood risk from EA Flood Monitoring API (free, no auth)
    enrich_flood_data(primary_rows)

    # 3. Listed buildings from Historic England ArcGIS (free, no auth)
    listed_buildings = download_listed_buildings()
    if listed_buildings:
        enrich_listed_buildings(primary_rows, listed_buildings)

    # 4. Environmental designations (SSSI, AONB) from data.gov.uk WFS
    designations = download_natural_england_designations()
    if designations:
        enrich_environmental_designations(primary_rows, designations)

    # 5. Land Registry Price Paid comparables (free, no auth)
    enrich_land_registry_comparables(primary_rows)

    print(f"\n=== Live Enrichment Complete ===\n")


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
    # Heritage constraints (from live enrichment)
    listed_grade = asset.get('listed_building_grade') or ''
    if listed_grade in ('I', 'II*'):
        score += 25
        breakdown.append((f'Grade {listed_grade} listed building — severe planning constraints', 25))
    elif listed_grade == 'II':
        score += 15
        breakdown.append(('Grade II listed building — planning consent required', 15))
    # SSSI proximity
    if asset.get('sssi_nearby'):
        score += 10
        breakdown.append(('Near SSSI — environmental constraints on development', 10))
    # Confirmed flood zone (from EA data, not just Codex)
    fz = asset.get('flood_zone') or 0
    if fz >= 3 and (asset.get('flood_areas_1km') or 0) <= 0:
        # EA confirmed flood zone but Codex didn't catch it
        score += 15
        breakdown.append(('In EA Flood Zone 3 — high flood risk, development restricted', 15))
    elif fz >= 2 and (asset.get('flood_areas_1km') or 0) <= 0:
        score += 10
        breakdown.append(('In EA Flood Zone 2 — medium flood risk disclosure required', 10))

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


# Lancashire average values for revenue estimation (£/sqm ranges by use)
# Based on VOA, RICS and public auction evidence for East/Central Lancashire
REVENUE_RATES = {
    'quick_win_auction': {'land_per_ha': 75000, 'building_per_sqm': 350, 'label': 'Auction sale'},
    'private_treaty_sale': {'land_per_ha': 120000, 'building_per_sqm': 550, 'label': 'Private sale'},
    'development_partnership': {'land_per_ha': 200000, 'building_per_sqm': 0, 'label': 'Dev partnership (land value share)'},
    'community_asset_transfer': {'land_per_ha': 15000, 'building_per_sqm': 50, 'label': 'CAT (below market)'},
    'long_lease_income': {'annual_per_sqm': 45, 'label': 'Annual rental income'},
    'meanwhile_use': {'annual_per_sqm': 25, 'label': 'Meanwhile rent (short-term)'},
    'energy_generation': {'land_per_ha': 8000, 'label': 'Annual FIT/PPA income'},
    'carbon_offset_woodland': {'land_per_ha': 5000, 'label': 'Woodland carbon credits (annual)'},
    'housing_partnership': {'land_per_ha': 180000, 'building_per_sqm': 0, 'label': 'Housing land value'},
    'refurbish_relet': {'annual_per_sqm': 60, 'capex_per_sqm': 150, 'label': 'Net annual rent after refurb'},
}


def estimate_revenue(asset, pathway, occupancy):
    """Estimate revenue/value for the given disposal pathway.
    Returns (capital_estimate, annual_estimate, methodology) tuple.
    Uses conservative Lancashire-level rates adjusted by IMD and EPC."""
    floor = asset.get('floor_area_sqm') or 0
    is_land = asset.get('land_only', False)
    imd = asset.get('imd_decile') or 5
    epc = asset.get('epc_rating') or ''

    # Location multiplier: affluent areas command premium
    loc_mult = 0.7 + (imd / 10) * 0.6  # IMD 1 → 0.76, IMD 5 → 1.0, IMD 10 → 1.3

    # EPC quality multiplier for buildings
    epc_mult = {'A': 1.15, 'B': 1.1, 'C': 1.05, 'D': 1.0, 'E': 0.9, 'F': 0.8, 'G': 0.7}.get(epc, 0.95)

    rates = REVENUE_RATES.get(pathway, {})

    # Estimate land area from floor area or assume 0.1 hectare for small sites
    land_ha = (floor / 10000) * 2 if floor > 0 else 0.1  # crude: 2x plot ratio

    capital = 0
    annual = 0
    method = rates.get('label', pathway)

    if pathway in ('quick_win_auction', 'private_treaty_sale', 'development_partnership',
                    'community_asset_transfer', 'housing_partnership'):
        if is_land:
            capital = round(land_ha * rates.get('land_per_ha', 0) * loc_mult)
        else:
            capital = round(floor * rates.get('building_per_sqm', 0) * loc_mult * epc_mult)
            if capital == 0 and land_ha > 0:
                capital = round(land_ha * rates.get('land_per_ha', 0) * loc_mult)

    elif pathway in ('long_lease_income', 'meanwhile_use'):
        if floor > 0:
            annual = round(floor * rates.get('annual_per_sqm', 0) * loc_mult * epc_mult)
        else:
            annual = round(land_ha * 10000 * rates.get('annual_per_sqm', 0) * loc_mult * 0.3)

    elif pathway == 'energy_generation':
        annual = round(land_ha * rates.get('land_per_ha', 0))

    elif pathway == 'carbon_offset_woodland':
        annual = round(land_ha * rates.get('land_per_ha', 0))

    elif pathway == 'refurbish_relet':
        if floor > 0:
            capex = round(floor * rates.get('capex_per_sqm', 0))
            annual = round(floor * rates.get('annual_per_sqm', 0) * loc_mult * epc_mult)
            capital = -capex  # negative = investment required
            method = f"{method} (capex: £{capex:,})"

    # Strategic hold and governance review = no direct revenue
    if pathway in ('strategic_hold', 'governance_review', 'co_locate_consolidate'):
        # Cost avoidance: maintenance savings if consolidated
        annual_cost = asset.get('condition_spend') or 0
        if annual_cost > 0:
            method = f"Annual maintenance liability: £{annual_cost:,}"
        else:
            method = 'No direct revenue — retain for service delivery'

    return capital, annual, method


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
    total_capital = 0
    total_annual = 0

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

        # 8. Revenue estimate
        cap_est, ann_est, rev_method = estimate_revenue(asset, pathway, occ_status)
        asset['_revenue_estimate_capital'] = cap_est
        asset['_revenue_estimate_annual'] = ann_est
        asset['_revenue_method'] = rev_method
        total_capital += cap_est
        total_annual += ann_est

    return {
        'pathway_breakdown': dict(sorted(pathway_counts.items(), key=lambda x: -x[1])),
        'occupancy_breakdown': dict(sorted(occupancy_counts.items(), key=lambda x: -x[1])),
        'quick_wins': quick_win_count,
        'complexity_distribution': complexity_bands,
        'estimated_capital_receipts': total_capital,
        'estimated_annual_income': total_annual,
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


def build_lean_asset(row, ced_name='', ward_dep=None, ward_demo=None, fire_dist=None, fire_station=None, imd_dep=None):
    """Build lean asset dict for property_assets.json."""
    # Use ward-level deprivation if available, else derived from per-asset IMD
    dep_level = (ward_dep.get('deprivation_level') if ward_dep else None) or (imd_dep[0] if imd_dep else None)
    dep_score = (round(ward_dep.get('avg_imd_score', 0), 1) if ward_dep and ward_dep.get('avg_imd_score') else None) or (imd_dep[1] if imd_dep else None)
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
        # Deprivation context (ward-level or derived from per-asset IMD)
        'deprivation_level': dep_level,
        'deprivation_score': dep_score,
        # Demographics context (from demographics.json ward lookup)
        'ward_population': _extract_population(ward_demo) if ward_demo else None,
        # Heritage / environmental constraints (from live enrichment)
        'listed_building_grade': safe_str(row.get('_listed_building_grade')) or None,
        'flood_zone': row.get('_flood_zone') or None,
        'sssi_nearby': row.get('_sssi_nearby', False),
        'sssi_name': safe_str(row.get('_sssi_name')) or None,
        'aonb_name': safe_str(row.get('_aonb_name')) or None,
        'flood_nearest_river': safe_str(row.get('_flood_nearest_river')) or None,
        # Land Registry valuation context (from live enrichment)
        'lr_median_price': _lr_median(row.get('_lr_comparables', [])),
        'lr_comparables_count': len(row.get('_lr_comparables', [])),
    }


def build_detail_asset(row, ced_name='', disposal_info=None, supplier_links=None,
                       condition_info=None, assessment_info=None, sales_evidence=None,
                       ward_dep=None, ward_demo=None, fire_dist=None, fire_station=None, imd_dep=None):
    """Build full detail asset dict for property_assets_detail.json."""
    lean = build_lean_asset(row, ced_name, ward_dep, ward_demo, fire_dist, fire_station, imd_dep)

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
        # Heritage constraints (from live enrichment)
        'heritage': {
            'listed_building_grade': safe_str(row.get('_listed_building_grade')) or None,
            'listed_building_name': safe_str(row.get('_listed_building_name')) or None,
            'listed_building_entry': safe_str(row.get('_listed_building_entry')) or None,
            'listed_buildings_nearby': row.get('_listed_buildings_nearby', 0),
            'nearby_detail': row.get('_listed_buildings_detail', []),
        },
        # Environmental designations (from live enrichment)
        'environment': {
            'flood_zone': row.get('_flood_zone') or None,
            'flood_stations_1km': row.get('_flood_stations_1km', 0),
            'flood_nearest_river': safe_str(row.get('_flood_nearest_river')) or None,
            'sssi_nearby': row.get('_sssi_nearby', False),
            'sssi_name': safe_str(row.get('_sssi_name')) or None,
            'aonb_name': safe_str(row.get('_aonb_name')) or None,
        },
        # Ward-level context
        'ward_deprivation': ward_dep if ward_dep else None,
        'ward_demographics': _extract_demographics(ward_demo),
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

    # Land Registry Price Paid comparables (from live enrichment)
    lr_comps = row.get('_lr_comparables', [])
    if lr_comps:
        # Summary stats
        prices = [c['price'] for c in lr_comps if c.get('price')]
        detail['valuation'] = {
            'comparables_count': len(lr_comps),
            'median_price': int(sorted(prices)[len(prices)//2]) if prices else None,
            'mean_price': int(sum(prices) / len(prices)) if prices else None,
            'min_price': min(prices) if prices else None,
            'max_price': max(prices) if prices else None,
            'most_recent_date': lr_comps[0].get('date') if lr_comps else None,
            'oldest_date': lr_comps[-1].get('date') if lr_comps else None,
            'area': safe_str(row.get('admin_district')),
            'comparables': lr_comps[:20],  # Top 20 most recent for frontend
        }
    else:
        detail['valuation'] = None

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

    # Live enrichment stats
    has_crime = sum(1 for a in lean_assets if a.get('crime_density'))  # any density band = enriched
    has_flood = sum(1 for a in lean_assets if a.get('flood_zone'))
    has_listed = sum(1 for a in lean_assets if a.get('listed_building_grade'))
    has_sssi = sum(1 for a in lean_assets if a.get('sssi_nearby'))
    has_deprivation = sum(1 for a in lean_assets if a.get('deprivation_level'))
    has_demographics = sum(1 for a in lean_assets if a.get('ward_population'))
    has_lr_comps = sum(1 for a in lean_assets if (a.get('lr_comparables_count') or 0) > 0)

    return {
        'generated': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
        'source': 'LCC Local Authority Land List + Codex enrichment + AI DOGE CED mapping + live API enrichment (Police/EA/HE/NE)',
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
        'estimated_capital_receipts': round(sum(
            a.get('revenue_estimate_capital', 0) or 0 for a in lean_assets
        )),
        'estimated_annual_income': round(sum(
            a.get('revenue_estimate_annual', 0) or 0 for a in lean_assets
        )),
        'band_distributions': band_dist,
        # Live enrichment coverage
        'has_crime_data': has_crime,
        'has_flood_zone': has_flood,
        'has_listed_building': has_listed,
        'has_sssi': has_sssi,
        'has_deprivation': has_deprivation,
        'has_demographics': has_demographics,
        'has_lr_comparables': has_lr_comps,
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
    parser.add_argument('--live-enrich', action='store_true', default=False,
                        help='Query live APIs for crime, flood, heritage, environment data')
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

    # --- 2b. Live API enrichment (if --live-enrich) ---
    if args.live_enrich:
        run_live_enrichment(primary_rows)

    # --- 2c. Load ward-level enrichment data ---
    print(f"\n--- Loading ward enrichment data ---")
    ward_dep_data = load_ward_deprivation(council_dir)
    # Use improved demographics loader with better name matching
    ward_demo_improved = load_ward_demographics_improved(council_dir)
    ward_demo_data = ward_demo_improved.get('by_name', {}) if ward_demo_improved else {}

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

        # Ward-level enrichment lookups (with improved matching)
        ward_name = safe_str(row.get('admin_ward'))
        ward_dep = ward_dep_data.get(ward_name)
        # Use improved demographics matching (tries ward_name, ced_name, normalised, partial)
        ward_demo = match_demographics(ward_name, ced_name, ward_demo_improved)
        if ward_dep:
            dep_enriched += 1
        if ward_demo:
            demo_enriched += 1

        # Derive deprivation from per-asset IMD decile if ward-level not available
        imd_dep = None
        if not ward_dep:
            imd_val = safe_int(row.get('imd_decile_2025'))
            if imd_val:
                imd_dep = derive_deprivation_from_imd(imd_val)

        # Fire proximity
        lat = safe_float(row.get('latitude_wgs84'))
        lng = safe_float(row.get('longitude_wgs84'))
        fire_dist, fire_station = compute_fire_proximity(lat, lng)
        if fire_dist is not None:
            fire_enriched += 1

        lean = build_lean_asset(row, ced_name, ward_dep, ward_demo, fire_dist, fire_station, imd_dep)

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
                                    ward_dep, ward_demo, fire_dist, fire_station, imd_dep)
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
        detail['disposal']['revenue_estimate_capital'] = lean.get('_revenue_estimate_capital', 0)
        detail['disposal']['revenue_estimate_annual'] = lean.get('_revenue_estimate_annual', 0)
        detail['disposal']['revenue_method'] = lean.get('_revenue_method', '')
        # Also sync top-level lean fields
        detail['occupancy_status'] = lean.get('occupancy_status')
        detail['disposal_complexity'] = lean.get('disposal_complexity')
        detail['market_readiness'] = lean.get('market_readiness')
        detail['revenue_potential'] = lean.get('revenue_potential')
        detail['disposal_pathway'] = lean.get('disposal_pathway')
        detail['disposal_pathway_secondary'] = lean.get('disposal_pathway_secondary')

    # Promote revenue estimates to public lean fields before stripping temp
    for asset in lean_assets:
        asset['revenue_estimate_capital'] = round(asset.get('_revenue_estimate_capital', 0) or 0)
        asset['revenue_estimate_annual'] = round(asset.get('_revenue_estimate_annual', 0) or 0)

    # Clean temporary fields from lean
    for asset in lean_assets:
        for key in ['_occupancy_signals', '_complexity_breakdown', '_readiness_breakdown',
                     '_revenue_breakdown', '_smart_priority', '_pathway_reasoning', '_quick_win', '_timeline',
                     '_revenue_estimate_capital', '_revenue_estimate_annual', '_revenue_method']:
            asset.pop(key, None)

    print(f"  Pathways: {intel_stats['pathway_breakdown']}")
    print(f"  Occupancy: {intel_stats['occupancy_breakdown']}")
    print(f"  Quick wins: {intel_stats['quick_wins']}")
    print(f"  Complexity: {intel_stats['complexity_distribution']}")
    print(f"  Est. capital receipts: £{intel_stats['estimated_capital_receipts']:,.0f}")
    print(f"  Est. annual income: £{intel_stats['estimated_annual_income']:,.0f}")

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
    print(f"\n--- Enrichment Coverage ---")
    print(f"Crime data: {meta.get('has_crime_data', 0)}/{meta['total_assets']}")
    print(f"Flood zone: {meta.get('has_flood_zone', 0)}/{meta['total_assets']}")
    print(f"Listed buildings: {meta.get('has_listed_building', 0)}/{meta['total_assets']}")
    print(f"SSSI nearby: {meta.get('has_sssi', 0)}/{meta['total_assets']}")
    print(f"Deprivation: {meta.get('has_deprivation', 0)}/{meta['total_assets']}")
    print(f"Demographics: {meta.get('has_demographics', 0)}/{meta['total_assets']}")
    print(f"Land Registry comps: {meta.get('has_lr_comparables', 0)}/{meta['total_assets']}")
    print(f"\nFiles written:")
    print(f"  {lean_path} ({lean_size:.0f}KB)")
    print(f"  {detail_path} ({detail_size:.0f}KB)")


if __name__ == '__main__':
    main()
