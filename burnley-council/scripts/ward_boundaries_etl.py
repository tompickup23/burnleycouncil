#!/usr/bin/env python3
"""
ward_boundaries_etl.py — Fetch ward/division boundary GeoJSON from ONS ArcGIS.

Downloads super-generalised (BSC) ward boundary polygons from the ONS Open
Geography Portal for each Lancashire council. Computes centroids and matches
ward names to elections.json.

Data sources:
- Wards (districts/unitaries): WD_DEC_2025_UK_BSC (ONS ArcGIS)
- County divisions (LCC): CED_MAY_2025_EN_BSC (ONS ArcGIS)

Output: burnley-council/data/{council_id}/ward_boundaries.json
"""

import json
import re
import time
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"

# ONS ArcGIS URLs (verified working as of Feb 2026)
# Short-format service names are more reliable than long-format
WARDS_URLS = [
    "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/WD_DEC_2025_UK_BSC/FeatureServer/0/query",
    "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/WD_MAY_2025_UK_BSC_V2/FeatureServer/0/query",
    "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/WD_MAY_2023_UK_BSC/FeatureServer/0/query",
]

CED_URLS = [
    "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/CED_MAY_2025_EN_BSC/FeatureServer/0/query",
    "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/CED_MAY_2024_EN_BGC_V3/FeatureServer/0/query",
]

# Council → ONS code mapping
COUNCIL_ONS = {
    "burnley":         {"code": "E07000117", "type": "ward"},
    "hyndburn":        {"code": "E07000120", "type": "ward"},
    "pendle":          {"code": "E07000122", "type": "ward"},
    "rossendale":      {"code": "E07000125", "type": "ward"},
    "lancaster":       {"code": "E07000121", "type": "ward"},
    "ribble_valley":   {"code": "E07000124", "type": "ward"},
    "chorley":         {"code": "E07000118", "type": "ward"},
    "south_ribble":    {"code": "E07000126", "type": "ward"},
    "preston":         {"code": "E07000123", "type": "ward"},
    "west_lancashire": {"code": "E07000127", "type": "ward"},
    "fylde":           {"code": "E07000119", "type": "ward"},
    "wyre":            {"code": "E07000128", "type": "ward"},
    "blackpool":       {"code": "E06000009", "type": "ward"},
    "blackburn":       {"code": "E06000008", "type": "ward"},
    "lancashire_cc":   {"code": "E10000017", "type": "ced"},
}


def fetch_json(url, desc="data", timeout=60):
    """Fetch JSON from URL."""
    print(f"  Fetching {desc}...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 AI-DOGE-ETL/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  ⚠ Failed: {e}")
        return None


def detect_fields(url_base):
    """Detect field names from a service by fetching one record."""
    url = url_base + "?where=1%3D1&outFields=*&returnGeometry=false&f=json&resultRecordCount=1"
    data = fetch_json(url, "field detection")
    if not data or not data.get("features"):
        return None
    attrs = data["features"][0].get("attributes", {})
    fields = list(attrs.keys())

    # Find LAD/county field, ward name field, ward code field
    lad_field = next((f for f in fields if f.startswith("LAD") and f.endswith("CD")), None)
    name_field = next((f for f in fields if (f.startswith("WD") or f.startswith("CED")) and f.endswith("NM") and not f.endswith("NMW")), None)
    code_field = next((f for f in fields if (f.startswith("WD") or f.startswith("CED")) and f.endswith("CD")), None)

    return {"lad": lad_field, "name": name_field, "code": code_field, "all": fields}


def fetch_ward_boundaries(urls, ons_code, council_id):
    """Fetch ward boundaries for a district/unitary by LAD code."""
    for url_base in urls:
        fields = detect_fields(url_base)
        if not fields or not fields["lad"]:
            continue

        lad_field = fields["lad"]
        where = urllib.request.quote(f"{lad_field}='{ons_code}'")
        url = (f"{url_base}?where={where}&outFields=*"
               f"&returnGeometry=true&outSR=4326&f=geojson&resultRecordCount=5000")

        data = fetch_json(url, f"{council_id} ward boundaries")
        if not data or "error" in data:
            continue

        features = data.get("features", [])
        if features:
            svc = url_base.split("services/")[1].split("/")[0]
            print(f"  ✓ {len(features)} features from {svc} ({lad_field})")
            return features, fields

    return [], None


def fetch_ced_boundaries(urls, elections_wards, council_id):
    """Fetch CED boundaries for LCC by matching division names.

    CED services don't have a county filter field, so we download all
    English CEDs and filter by matching names against elections.json.
    """
    normalised_elections = {normalise_name(w): w for w in elections_wards}

    for url_base in urls:
        fields = detect_fields(url_base)
        if not fields or not fields["name"]:
            continue

        name_field = fields["name"]

        # Paginate through all CEDs
        all_features = []
        offset = 0
        page_size = 2000

        while True:
            url = (f"{url_base}?where=1%3D1&outFields=*"
                   f"&returnGeometry=true&outSR=4326&f=geojson"
                   f"&resultOffset={offset}&resultRecordCount={page_size}")

            data = fetch_json(url, f"{council_id} CED boundaries (offset {offset})")
            if not data or "error" in data:
                break

            features = data.get("features", [])
            if not features:
                break

            all_features.extend(features)
            offset += page_size

            if len(features) < page_size:
                break
            time.sleep(0.3)

        if not all_features:
            continue

        print(f"  Downloaded {len(all_features)} total CEDs from {url_base.split('services/')[1].split('/')[0]}")

        # Filter to Lancashire divisions by name matching
        matched = []
        for feature in all_features:
            ons_name = feature.get("properties", {}).get(name_field, "")
            # Strip " ED" suffix that ONS adds
            clean = re.sub(r'\s+ED$', '', ons_name, flags=re.IGNORECASE)
            norm = normalise_name(clean)

            if norm in normalised_elections:
                matched.append(feature)

        if matched:
            print(f"  ✓ Matched {len(matched)}/{len(elections_wards)} Lancashire divisions")
            return matched, fields

    return [], None


def normalise_name(name):
    """Normalise ward/division name for matching."""
    if not name:
        return ""
    name = re.sub(r'\s+', ' ', name.strip())
    name = name.replace('&', 'and')  # ONS uses &, elections.json uses "and"
    name = name.replace(',', '')     # Handle comma-separated names
    name = re.sub(r'[^a-z0-9 ]', '', name.lower())
    return re.sub(r'\s+', ' ', name).strip()  # collapse double spaces


def compute_centroid(geometry):
    """Compute centroid from GeoJSON geometry."""
    coords = []
    geo_type = geometry.get("type", "")

    if geo_type == "Polygon":
        ring = geometry.get("coordinates", [[]])[0]
        coords.extend(ring[:-1] if len(ring) > 1 else ring)  # exclude closing vertex
    elif geo_type == "MultiPolygon":
        for polygon in geometry.get("coordinates", []):
            if polygon and polygon[0]:
                ring = polygon[0]
                coords.extend(ring[:-1] if len(ring) > 1 else ring)

    if not coords:
        return None

    avg_lng = sum(c[0] for c in coords) / len(coords)
    avg_lat = sum(c[1] for c in coords) / len(coords)
    return [round(avg_lng, 6), round(avg_lat, 6)]


def match_ward_names(features, elections_wards, name_field):
    """Match ONS features to elections.json ward names.

    Returns dict: {feature_index: elections_ward_name}
    """
    elections_normalised = {normalise_name(w): w for w in elections_wards}
    matches = {}
    unmatched = []

    for i, feature in enumerate(features):
        ons_name = feature.get("properties", {}).get(name_field, "")
        # Strip ED suffix for CED divisions
        clean = re.sub(r'\s+ED$', '', ons_name, flags=re.IGNORECASE)
        norm = normalise_name(clean)

        # Exact match
        if norm in elections_normalised:
            matches[i] = elections_normalised[norm]
            continue

        # Strip "ward" suffix from ONS name
        stripped = re.sub(r'\s+ward$', '', norm)
        if stripped in elections_normalised:
            matches[i] = elections_normalised[stripped]
            continue

        # Strip "ward" suffix from elections names too (bidirectional)
        elections_no_ward = {re.sub(r'\s+ward$', '', k): v for k, v in elections_normalised.items()}
        if norm in elections_no_ward:
            matches[i] = elections_no_ward[norm]
            continue
        if stripped in elections_no_ward:
            matches[i] = elections_no_ward[stripped]
            continue

        # Space-collapsed match (catches "Coal Clough" vs "Coalclough", "High Cross" vs "Highcross")
        norm_spaceless = norm.replace(' ', '')
        found = False
        for enorm, ename in elections_normalised.items():
            if enorm.replace(' ', '') == norm_spaceless:
                matches[i] = ename
                found = True
                break
        if found:
            continue

        # Prefix match
        for enorm, ename in elections_normalised.items():
            if enorm.startswith(norm) or norm.startswith(enorm):
                matches[i] = ename
                found = True
                break
        if found:
            continue

        unmatched.append(ons_name)
        matches[i] = clean or ons_name  # Best effort

    if unmatched:
        print(f"  ⚠ {len(unmatched)} unmatched: {unmatched[:5]}{'...' if len(unmatched) > 5 else ''}")

    return matches


def process_council(council_id, dry_run=False):
    """Fetch and process boundaries for a single council."""
    if council_id not in COUNCIL_ONS:
        print(f"  ⚠ Unknown council: {council_id}")
        return False

    info = COUNCIL_ONS[council_id]
    ons_code = info["code"]
    boundary_type = info["type"]

    print(f"\n=== {council_id.upper()} ({ons_code}, {boundary_type}) ===")

    # Load elections.json for ward name matching
    elections_path = DATA_DIR / council_id / "elections.json"
    elections_wards = []
    if elections_path.exists():
        with open(elections_path) as f:
            elections = json.load(f)
        elections_wards = list(elections.get("wards", {}).keys())
        print(f"  Elections.json: {len(elections_wards)} wards/divisions")
    else:
        print(f"  ⚠ No elections.json")

    if dry_run:
        print(f"  DRY RUN: type={boundary_type}, code={ons_code}")
        return True

    # Fetch boundaries based on type
    if boundary_type == "ced":
        features, fields = fetch_ced_boundaries(CED_URLS, elections_wards, council_id)
    else:
        features, fields = fetch_ward_boundaries(WARDS_URLS, ons_code, council_id)

    if not features or not fields:
        print(f"  ✗ No boundary features found")
        return False

    name_field = fields["name"]
    code_field = fields["code"]

    # Match ward names
    name_matches = match_ward_names(features, elections_wards, name_field)

    # Build output GeoJSON
    output_features = []
    bbox = [180, 90, -180, -90]

    for i, feature in enumerate(features):
        geometry = feature.get("geometry")
        if not geometry:
            continue

        props = feature.get("properties", {})
        ward_code = props.get(code_field, "") if code_field else ""
        ward_name = name_matches.get(i, "Unknown")
        centroid = compute_centroid(geometry)

        if centroid:
            bbox[0] = min(bbox[0], centroid[0])
            bbox[1] = min(bbox[1], centroid[1])
            bbox[2] = max(bbox[2], centroid[0])
            bbox[3] = max(bbox[3], centroid[1])

        output_features.append({
            "type": "Feature",
            "properties": {
                "ons_code": ward_code,
                "name": ward_name,
                "centroid": centroid,
            },
            "geometry": geometry,
        })

    output = {
        "meta": {
            "source": "ONS Open Geography Portal",
            "boundary_type": "CED BSC" if boundary_type == "ced" else "Ward BSC",
            "council_id": council_id,
            "ons_code": ons_code,
            "total_wards": len(output_features),
            "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "bbox": [round(b, 4) for b in bbox] if bbox[0] < 180 else None,
        },
        "type": "FeatureCollection",
        "features": output_features,
    }

    output_path = DATA_DIR / council_id / "ward_boundaries.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output, f)

    file_size = output_path.stat().st_size
    matched = sum(1 for n in name_matches.values() if n in elections_wards)
    print(f"  ✓ {len(output_features)} boundaries, {matched}/{len(elections_wards)} matched, {file_size:,} bytes")
    return True


def main():
    import argparse
    parser = argparse.ArgumentParser(
        description="Fetch ward boundary GeoJSON from ONS ArcGIS"
    )
    parser.add_argument("--council", nargs="*", default=None,
                        help="Council IDs to process (default: all 15)")
    parser.add_argument("--all", action="store_true",
                        help="Process all 15 councils")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview without API calls")
    args = parser.parse_args()

    councils = args.council if args.council else list(COUNCIL_ONS.keys())

    print("=" * 60)
    print("WARD BOUNDARIES ETL: ONS ArcGIS GeoJSON")
    print(f"Processing {len(councils)} council(s)")
    print("=" * 60)

    success = 0
    failed = 0
    for council_id in councils:
        try:
            if process_council(council_id, dry_run=args.dry_run):
                success += 1
            else:
                failed += 1
        except Exception as e:
            print(f"  ✗ Error: {e}")
            import traceback
            traceback.print_exc()
            failed += 1

    print(f"\n{'=' * 60}")
    print(f"DONE: {success} succeeded, {failed} failed")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
