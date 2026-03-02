#!/usr/bin/env python3
"""
council_boundaries_etl.py — Fetch Local Authority District (LAD) and County
boundary GeoJSON from ONS ArcGIS for all 15 Lancashire councils.

Downloads super-generalised (BSC) boundary polygons from the ONS Open
Geography Portal. Districts and unitaries come from the LAD service;
Lancashire CC comes from the Counties service. Enriches with population
and total_spend from cross_council.json.

Data sources:
- Districts/Unitaries: Local_Authority_Districts_December_YYYY_Boundaries_UK_BSC
- County (LCC): Counties_December_YYYY_Boundaries_EN_BSC

Output: burnley-council/data/shared/council_boundaries.json

Usage:
    /usr/bin/python3 scripts/council_boundaries_etl.py
    /usr/bin/python3 scripts/council_boundaries_etl.py --dry-run
"""

import json
import time
import urllib.request
import urllib.parse
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "burnley-council" / "data"
OUTPUT_PATH = DATA_DIR / "shared" / "council_boundaries.json"

# ONS ArcGIS service URLs — try newest first, fall back to older
# Long-format names work; short-format returns 400 for LAD/CTY services
LAD_URLS = [
    "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Local_Authority_Districts_December_2024_Boundaries_UK_BSC/FeatureServer/0/query",
    "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Local_Authority_Districts_December_2023_Boundaries_UK_BSC/FeatureServer/0/query",
]

CTY_URLS = [
    "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Counties_December_2024_Boundaries_EN_BSC/FeatureServer/0/query",
    "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Counties_December_2023_Boundaries_EN_BSC/FeatureServer/0/query",
]

# All 15 Lancashire councils with ONS codes, tiers, and slugs
COUNCILS = {
    "burnley":         {"ons_code": "E07000117", "name": "Burnley",                "tier": "district", "slug": "burnleycouncil"},
    "hyndburn":        {"ons_code": "E07000120", "name": "Hyndburn",               "tier": "district", "slug": "hyndburncouncil"},
    "pendle":          {"ons_code": "E07000122", "name": "Pendle",                 "tier": "district", "slug": "pendlecouncil"},
    "rossendale":      {"ons_code": "E07000125", "name": "Rossendale",             "tier": "district", "slug": "rossendalecouncil"},
    "lancaster":       {"ons_code": "E07000121", "name": "Lancaster",              "tier": "district", "slug": "lancastercouncil"},
    "ribble_valley":   {"ons_code": "E07000124", "name": "Ribble Valley",          "tier": "district", "slug": "ribblevalleycouncil"},
    "chorley":         {"ons_code": "E07000118", "name": "Chorley",                "tier": "district", "slug": "chorleycouncil"},
    "south_ribble":    {"ons_code": "E07000126", "name": "South Ribble",           "tier": "district", "slug": "southribblecouncil"},
    "wyre":            {"ons_code": "E07000128", "name": "Wyre",                   "tier": "district", "slug": "wyrecouncil"},
    "fylde":           {"ons_code": "E07000119", "name": "Fylde",                  "tier": "district", "slug": "fyldecouncil"},
    "preston":         {"ons_code": "E07000123", "name": "Preston",                "tier": "district", "slug": "prestoncouncil"},
    "west_lancashire": {"ons_code": "E07000127", "name": "West Lancashire",        "tier": "district", "slug": "westlancashirecouncil"},
    "blackpool":       {"ons_code": "E06000009", "name": "Blackpool",              "tier": "unitary",  "slug": "blackpoolcouncil"},
    "blackburn":       {"ons_code": "E06000008", "name": "Blackburn with Darwen",  "tier": "unitary",  "slug": "blackburncouncil"},
    "lancashire_cc":   {"ons_code": "E10000017", "name": "Lancashire",             "tier": "county",   "slug": "lancashirecc"},
}

# Reverse lookup: ONS code -> council_id
ONS_TO_COUNCIL = {v["ons_code"]: k for k, v in COUNCILS.items()}


def fetch_json(url, desc="data", timeout=60):
    """Fetch JSON from URL with User-Agent header."""
    print(f"  Fetching {desc}...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 AI-DOGE-ETL/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  Warning: Failed to fetch {desc}: {e}")
        return None


def detect_fields(url_base):
    """Detect field names from a service by fetching one record."""
    url = url_base + "?where=1%3D1&outFields=*&returnGeometry=false&f=json&resultRecordCount=1"
    data = fetch_json(url, "field detection")
    if not data or not data.get("features"):
        return None
    attrs = data["features"][0].get("attributes", {})
    fields = list(attrs.keys())

    # Find code and name fields (LAD23CD/LAD24CD or CTY23CD/CTY24CD)
    code_field = next((f for f in fields if (f.startswith("LAD") or f.startswith("CTY")) and f.endswith("CD")), None)
    name_field = next((f for f in fields if (f.startswith("LAD") or f.startswith("CTY")) and f.endswith("NM") and not f.endswith("NMW")), None)

    if code_field and name_field:
        return {"code": code_field, "name": name_field, "all": fields}
    return None


def compute_centroid(geometry):
    """Compute centroid from GeoJSON geometry (average of all vertices)."""
    coords = []
    geo_type = geometry.get("type", "")

    if geo_type == "Polygon":
        ring = geometry.get("coordinates", [[]])[0]
        coords.extend(ring[:-1] if len(ring) > 1 else ring)
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


def compute_bbox(features):
    """Compute bounding box from a list of GeoJSON features."""
    bbox = [180.0, 90.0, -180.0, -90.0]
    for feature in features:
        centroid = feature.get("properties", {}).get("centroid")
        if centroid:
            bbox[0] = min(bbox[0], centroid[0])
            bbox[1] = min(bbox[1], centroid[1])
            bbox[2] = max(bbox[2], centroid[0])
            bbox[3] = max(bbox[3], centroid[1])
    if bbox[0] >= 180.0:
        return None
    return [round(b, 4) for b in bbox]


def fetch_lad_boundaries(ons_codes):
    """Fetch LAD boundaries for districts and unitaries.

    Tries multiple service URLs (newest first), auto-detects field names.
    Returns list of (council_id, feature) tuples.
    """
    codes_str = ",".join(f"'{c}'" for c in ons_codes)

    for url_base in LAD_URLS:
        fields = detect_fields(url_base)
        if not fields:
            print(f"  Skipping {url_base.split('services/')[1].split('/')[0]} (field detection failed)")
            continue

        code_field = fields["code"]
        name_field = fields["name"]
        svc_name = url_base.split("services/")[1].split("/")[0]

        where = urllib.parse.quote(f"{code_field} IN ({codes_str})")
        url = (f"{url_base}?where={where}&outFields=*"
               f"&returnGeometry=true&outSR=4326&f=geojson&resultRecordCount=5000")

        data = fetch_json(url, f"LAD boundaries from {svc_name}")
        if not data or "error" in data:
            continue

        features = data.get("features", [])
        if not features:
            continue

        print(f"  Got {len(features)} LAD features from {svc_name} (code field: {code_field})")

        results = []
        for feature in features:
            props = feature.get("properties", {})
            ons_code = props.get(code_field, "")
            council_id = ONS_TO_COUNCIL.get(ons_code)
            if council_id:
                results.append((council_id, feature, code_field, name_field))

        return results

    return []


def fetch_county_boundary():
    """Fetch county boundary for Lancashire CC.

    Tries Counties service URLs (newest first).
    Returns (council_id, feature) tuple or None.
    """
    for url_base in CTY_URLS:
        fields = detect_fields(url_base)
        if not fields:
            continue

        code_field = fields["code"]
        name_field = fields["name"]
        svc_name = url_base.split("services/")[1].split("/")[0]

        where = urllib.parse.quote(f"{code_field}='E10000017'")
        url = (f"{url_base}?where={where}&outFields=*"
               f"&returnGeometry=true&outSR=4326&f=geojson&resultRecordCount=10")

        data = fetch_json(url, f"County boundary from {svc_name}")
        if not data or "error" in data:
            continue

        features = data.get("features", [])
        if not features:
            continue

        print(f"  Got county boundary from {svc_name} (code field: {code_field})")
        return ("lancashire_cc", features[0], code_field, name_field)

    return None


def load_cross_council_data():
    """Load population and total_spend from cross_council.json files.

    Returns dict: council_id -> {population, total_spend, annual_spend, ...}
    """
    enrichment = {}

    # Try any council's cross_council.json (they all contain the same council list)
    for council_id in COUNCILS:
        cc_path = DATA_DIR / council_id / "cross_council.json"
        if cc_path.exists():
            try:
                with open(cc_path) as f:
                    data = json.load(f)
                councils_list = data.get("councils", [])
                for c in councils_list:
                    cid = c.get("council_id")
                    if cid and cid in COUNCILS:
                        enrichment[cid] = {
                            "population": c.get("population"),
                            "total_spend": c.get("total_spend"),
                            "annual_spend": c.get("annual_spend"),
                            "total_records": c.get("total_records"),
                            "per_capita_spend": c.get("per_capita_spend"),
                        }
                if enrichment:
                    print(f"  Loaded cross-council data from {council_id}/cross_council.json ({len(enrichment)} councils)")
                    return enrichment
            except Exception as e:
                print(f"  Warning: Failed to load {cc_path}: {e}")

    print("  Warning: No cross_council.json found for enrichment")
    return enrichment


def main():
    import argparse
    parser = argparse.ArgumentParser(
        description="Fetch council boundary GeoJSON from ONS ArcGIS for all 15 Lancashire councils"
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview without making API calls")
    args = parser.parse_args()

    print("=" * 60)
    print("COUNCIL BOUNDARIES ETL: ONS ArcGIS GeoJSON")
    print(f"Output: {OUTPUT_PATH}")
    print("=" * 60)

    if args.dry_run:
        print("\nDRY RUN — no API calls will be made")
        for council_id, info in COUNCILS.items():
            endpoint = "CTY" if info["tier"] == "county" else "LAD"
            print(f"  {council_id}: {info['ons_code']} ({info['tier']}) -> {endpoint} service")
        return

    # Step 1: Load cross-council enrichment data
    print("\n--- Loading cross-council enrichment data ---")
    enrichment = load_cross_council_data()

    # Step 2: Fetch LAD boundaries (districts + unitaries = 14 councils)
    print("\n--- Fetching LAD boundaries (14 districts + unitaries) ---")
    lad_codes = [info["ons_code"] for cid, info in COUNCILS.items() if info["tier"] != "county"]
    lad_results = fetch_lad_boundaries(lad_codes)

    if not lad_results:
        print("ERROR: Failed to fetch any LAD boundaries")
        return

    # Step 3: Fetch county boundary (Lancashire CC)
    print("\n--- Fetching county boundary (Lancashire CC) ---")
    cty_result = fetch_county_boundary()

    # Step 4: Build output GeoJSON
    print("\n--- Building output GeoJSON ---")

    all_results = list(lad_results)
    if cty_result:
        all_results.append(cty_result)

    output_features = []
    matched_councils = set()

    for council_id, feature, code_field, name_field in all_results:
        info = COUNCILS[council_id]
        geometry = feature.get("geometry")
        if not geometry:
            print(f"  Warning: No geometry for {council_id}")
            continue

        centroid = compute_centroid(geometry)
        enrich = enrichment.get(council_id, {})

        properties = {
            "council_id": council_id,
            "council_name": info["name"],
            "council_tier": info["tier"],
            "ons_code": info["ons_code"],
            "slug": info["slug"],
            "centroid": centroid,
        }

        # Add enrichment data if available
        if enrich.get("population"):
            properties["population"] = enrich["population"]
        if enrich.get("total_spend"):
            properties["total_spend"] = round(enrich["total_spend"], 2)
        if enrich.get("annual_spend"):
            properties["annual_spend"] = round(enrich["annual_spend"], 2)
        if enrich.get("total_records"):
            properties["total_records"] = enrich["total_records"]
        if enrich.get("per_capita_spend"):
            properties["per_capita_spend"] = round(enrich["per_capita_spend"], 2)

        output_features.append({
            "type": "Feature",
            "properties": properties,
            "geometry": geometry,
        })

        matched_councils.add(council_id)
        pop_str = f", pop={enrich.get('population', '?')}" if enrich.get("population") else ""
        print(f"  {council_id}: {info['name']} ({info['tier']}){pop_str}")

    # Check for missing councils
    missing = set(COUNCILS.keys()) - matched_councils
    if missing:
        print(f"\n  Warning: Missing boundaries for: {', '.join(sorted(missing))}")

    bbox = compute_bbox(output_features)

    output = {
        "meta": {
            "source": "ONS Open Geography Portal",
            "description": "Local Authority District + County boundaries for all 15 Lancashire councils",
            "boundary_type": "BSC (super-generalised)",
            "total_councils": len(output_features),
            "tiers": {
                "district": sum(1 for f in output_features if f["properties"]["council_tier"] == "district"),
                "unitary": sum(1 for f in output_features if f["properties"]["council_tier"] == "unitary"),
                "county": sum(1 for f in output_features if f["properties"]["council_tier"] == "county"),
            },
            "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "bbox": bbox,
        },
        "type": "FeatureCollection",
        "features": output_features,
    }

    # Step 5: Write output
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f)

    file_size = OUTPUT_PATH.stat().st_size
    enriched_count = sum(1 for f in output_features if f["properties"].get("population"))

    print(f"\n{'=' * 60}")
    print(f"DONE: {len(output_features)} council boundaries written")
    print(f"  Districts: {output['meta']['tiers']['district']}")
    print(f"  Unitaries: {output['meta']['tiers']['unitary']}")
    print(f"  County: {output['meta']['tiers']['county']}")
    print(f"  Enriched with cross-council data: {enriched_count}/{len(output_features)}")
    print(f"  File size: {file_size:,} bytes ({file_size/1024:.1f} KB)")
    print(f"  Output: {OUTPUT_PATH}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
