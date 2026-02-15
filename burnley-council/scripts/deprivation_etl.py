#!/usr/bin/env python3
"""
deprivation_etl.py — Generate ward-level deprivation data for AI DOGE councils.

Uses the English Indices of Deprivation 2019 (IMD2019) data from MHCLG.
Downloads LSOA-level IMD scores and aggregates to ward level using
ONS LSOA-to-ward lookup tables.

Data sources:
- IMD 2019 scores: opendatacommunities.org / GOV.UK
- LSOA → Ward mapping: ONS Open Geography Portal

Output: burnley-council/data/{council_id}/deprivation.json
"""

import json
import csv
import os
import sys
import io
import urllib.request
from pathlib import Path
from collections import defaultdict

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"

# IMD 2019 LSOA-level data — File 7: all scores, ranks, deciles (CSV)
# Source: GOV.UK English indices of deprivation 2019
IMD_CSV_URL = "https://assets.publishing.service.gov.uk/media/5dc407b440f0b6379a7acc8d/File_7_-_All_IoD2019_Scores__Ranks__Deciles_and_Population_Denominators_3.csv"

# LSOA (2011) to Ward (2019) lookup — from ONS Open Geography Portal
# Uses the 2011 LSOA to 2019 Ward mapping (aligns with IMD 2019 data)
LSOA_WARD_URL = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/LSOA11_WD19_LAD19_EW_LU_V2/FeatureServer/0/query"

# Council → LAD name mapping (must match ONS LAD names exactly)
COUNCIL_LAD_NAMES = {
    "burnley": "Burnley",
    "hyndburn": "Hyndburn",
    "pendle": "Pendle",
    "rossendale": "Rossendale",
    "lancaster": "Lancaster",
    "ribble_valley": "Ribble Valley",
    "chorley": "Chorley",
    "south_ribble": "South Ribble",
    "blackpool": "Blackpool",
    "west_lancashire": "West Lancashire",
    "blackburn": "Blackburn with Darwen",
    "wyre": "Wyre",
    "preston": "Preston",
    "fylde": "Fylde",
}


def fetch_url(url, desc="data"):
    """Download URL content with progress."""
    print(f"  Fetching {desc}...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 AI-DOGE-ETL/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    print(f"  ✓ Downloaded {len(data):,} bytes")
    return data


def load_imd_scores():
    """Load IMD 2019 LSOA-level scores.

    Returns dict: {lsoa_code: {score, rank, decile}}
    """
    cache_path = DATA_DIR / "imd2019_cache.json"
    if cache_path.exists():
        print("  Using cached IMD data")
        with open(cache_path) as f:
            return json.load(f)

    raw = fetch_url(IMD_CSV_URL, "IMD 2019 scores")
    text = raw.decode("utf-8-sig")  # BOM handling
    reader = csv.DictReader(io.StringIO(text))

    scores = {}
    for row in reader:
        lsoa = row.get("LSOA code (2011)", "")
        if not lsoa.startswith("E"):
            continue

        try:
            score = float(row.get("Index of Multiple Deprivation (IMD) Score", ""))
        except (ValueError, TypeError):
            continue

        try:
            rank = int(row.get("Index of Multiple Deprivation (IMD) Rank (where 1 is most deprived)", ""))
        except (ValueError, TypeError):
            rank = None

        try:
            decile = int(row.get("Index of Multiple Deprivation (IMD) Decile (where 1 is most deprived 10% of LSOAs)", ""))
        except (ValueError, TypeError):
            decile = None

        lad = row.get("Local Authority District name (2019)", "")
        scores[lsoa] = {"score": score, "rank": rank, "decile": decile, "lad": lad}

    # Cache for future runs
    with open(cache_path, "w") as f:
        json.dump(scores, f)
    print(f"  ✓ Loaded {len(scores):,} LSOA scores (cached)")
    return scores


def load_lsoa_ward_mapping(target_lads):
    """Load LSOA → Ward mapping from ONS ArcGIS.

    Returns dict: {lsoa_code: {ward_name, lad_name}}
    """
    cache_path = DATA_DIR / "lsoa_ward_cache.json"
    if cache_path.exists():
        print("  Using cached LSOA-Ward mapping")
        with open(cache_path) as f:
            return json.load(f)

    # Since the ArcGIS feature service may not have the exact layer name,
    # we build the mapping from the IMD CSV itself (which has LAD names)
    # combined with a simpler lookup approach.
    # Try the ArcGIS service first; fall back to using LAD-filtered IMD data only.
    all_records = []
    offset = 0
    page_size = 2000  # ArcGIS default limit

    # Try multiple service name patterns
    service_names = [
        "LSOA11_WD19_LAD19_EW_LU_cbf3896924a74e58ac96b7ec66a34071",
        "LSOA11_WD20_LAD20_EW_LU_v2_f514a75a131249caa65227cdc6275a21",
        "LSOA11_WD19_LAD19_EW_LU",
    ]

    for service_name in service_names:
        all_records = []
        offset = 0
        success = False
        while True:
            url = (f"https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/"
                   f"{service_name}/FeatureServer/0/query?"
                   f"where=1%3D1&outFields=*&returnGeometry=false"
                   f"&resultOffset={offset}&resultRecordCount={page_size}&f=json")

            try:
                raw = fetch_url(url, f"LSOA-Ward lookup ({service_name}, offset {offset})")
                data = json.loads(raw)
                features = data.get("features", [])
                if not features:
                    if offset == 0:
                        break  # Service returned nothing, try next
                    break  # Pagination done
                all_records.extend(features)
                success = True
                offset += page_size
                # Check if we've exhausted records
                if not data.get("exceededTransferLimit", False) and len(features) < page_size:
                    break
            except Exception as e:
                print(f"  ⚠ Service {service_name} failed: {e}")
                break

        if success and all_records:
            print(f"  ✓ Using service: {service_name}")
            break

    mapping = {}
    if all_records:
        # Detect field names from first record
        sample_attrs = all_records[0].get("attributes", {})
        lsoa_field = next((k for k in sample_attrs if "LSOA" in k and "CD" in k), None)
        ward_field = next((k for k in sample_attrs if "WD" in k and "NM" in k), None)
        lad_field = next((k for k in sample_attrs if "LAD" in k and "NM" in k), None)
        print(f"  Fields detected: LSOA={lsoa_field}, Ward={ward_field}, LAD={lad_field}")

        if lsoa_field and ward_field and lad_field:
            for feat in all_records:
                attrs = feat.get("attributes", {})
                lsoa = attrs.get(lsoa_field, "")
                ward = attrs.get(ward_field, "")
                lad = attrs.get(lad_field, "")
                if lsoa and ward and lad:
                    mapping[lsoa] = {"ward_name": ward, "lad_name": lad}
    else:
        print("  ⚠ No ArcGIS service worked — will use LAD-level grouping only")

    with open(cache_path, "w") as f:
        json.dump(mapping, f)
    print(f"  ✓ Loaded {len(mapping):,} LSOA-Ward mappings (cached)")
    return mapping


def compute_ward_deprivation(imd_scores, lsoa_ward_map, lad_name):
    """Aggregate LSOA-level IMD scores to ward level for a given LAD.

    Uses population-weighted average (approximated by simple average
    since LSOAs are designed to be roughly equal population size).

    Returns dict: {ward_name: {avg_score, avg_rank, avg_decile, lsoa_count, worst_lsoa_rank, best_lsoa_rank}}
    """
    ward_scores = defaultdict(list)

    for lsoa_code, ward_info in lsoa_ward_map.items():
        if ward_info["lad_name"] != lad_name:
            continue
        if lsoa_code not in imd_scores:
            continue
        ward_name = ward_info["ward_name"]
        ward_scores[ward_name].append(imd_scores[lsoa_code])

    result = {}
    # Total LSOAs in England for percentile calculation
    TOTAL_LSOAS = 32_844

    for ward_name, scores in sorted(ward_scores.items()):
        avg_score = round(sum(s["score"] for s in scores) / len(scores), 2)
        avg_rank = round(sum(s["rank"] for s in scores if s["rank"]) / len(scores))
        ranks = [s["rank"] for s in scores if s["rank"]]
        deciles = [s["decile"] for s in scores if s["decile"]]
        avg_decile = round(sum(deciles) / len(deciles), 1) if deciles else None

        # Determine deprivation level from average decile
        if avg_decile:
            if avg_decile <= 1.5:
                level = "Very High"
            elif avg_decile <= 3:
                level = "High"
            elif avg_decile <= 5:
                level = "Medium-High"
            elif avg_decile <= 7:
                level = "Medium"
            elif avg_decile <= 9:
                level = "Low"
            else:
                level = "Very Low"
        else:
            level = "Unknown"

        # Percentile: what % of England is MORE deprived
        # Lower rank = more deprived, so percentile = rank / total * 100
        percentile = round(avg_rank / TOTAL_LSOAS * 100, 1) if avg_rank else None

        result[ward_name] = {
            "avg_imd_score": avg_score,
            "avg_imd_rank": avg_rank,
            "avg_imd_decile": round(avg_decile, 1) if avg_decile else None,
            "deprivation_level": level,
            "national_percentile": percentile,
            "lsoa_count": len(scores),
            "most_deprived_lsoa_rank": min(ranks) if ranks else None,
            "least_deprived_lsoa_rank": max(ranks) if ranks else None,
        }

    return result


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Generate ward-level IMD data")
    parser.add_argument("--council", nargs="*", default=list(COUNCIL_LAD_NAMES.keys()),
                        help="Council IDs to process")
    parser.add_argument("--clear-cache", action="store_true",
                        help="Clear cached data and re-download")
    args = parser.parse_args()

    if args.clear_cache:
        for cache_file in ["imd2019_cache.json", "lsoa_ward_cache.json"]:
            p = DATA_DIR / cache_file
            if p.exists():
                p.unlink()
                print(f"  Cleared {cache_file}")

    print("=" * 60)
    print("DEPRIVATION ETL: Ward-Level IMD 2019 Data")
    print("=" * 60)

    print("\n1. Loading IMD 2019 LSOA scores...")
    imd_scores = load_imd_scores()

    print("\n2. Loading LSOA → Ward mapping...")
    lsoa_ward_map = load_lsoa_ward_mapping(list(COUNCIL_LAD_NAMES.values()))

    print("\n3. Computing ward-level deprivation...")
    for council_id in args.council:
        if council_id not in COUNCIL_LAD_NAMES:
            print(f"  ⚠ Unknown council: {council_id}")
            continue

        lad_name = COUNCIL_LAD_NAMES[council_id]
        ward_data = compute_ward_deprivation(imd_scores, lsoa_ward_map, lad_name)

        if not ward_data:
            print(f"  ⚠ {council_id}: No ward data found for LAD '{lad_name}'")
            continue

        # Compute council-level summary
        all_scores = [w["avg_imd_score"] for w in ward_data.values()]
        all_ranks = [w["avg_imd_rank"] for w in ward_data.values() if w["avg_imd_rank"]]
        avg_council_score = round(sum(all_scores) / len(all_scores), 2)
        most_deprived = min(ward_data.items(), key=lambda x: x[1]["avg_imd_rank"])
        least_deprived = max(ward_data.items(), key=lambda x: x[1]["avg_imd_rank"])

        output = {
            "meta": {
                "source": "English Indices of Deprivation 2019 (MHCLG)",
                "methodology": "LSOA scores averaged per ward (LSOAs ~equal population)",
                "council_id": council_id,
                "lad_name": lad_name,
                "total_wards": len(ward_data),
                "total_lsoas": sum(w["lsoa_count"] for w in ward_data.values()),
            },
            "summary": {
                "avg_imd_score": avg_council_score,
                "most_deprived_ward": most_deprived[0],
                "most_deprived_score": most_deprived[1]["avg_imd_score"],
                "least_deprived_ward": least_deprived[0],
                "least_deprived_score": least_deprived[1]["avg_imd_score"],
            },
            "wards": ward_data,
        }

        output_path = DATA_DIR / council_id / "deprivation.json"
        with open(output_path, "w") as f:
            json.dump(output, f, indent=2)

        print(f"  {council_id.upper()}: {len(ward_data)} wards, "
              f"avg IMD score {avg_council_score}, "
              f"most deprived: {most_deprived[0]} ({most_deprived[1]['deprivation_level']}), "
              f"least deprived: {least_deprived[0]} ({least_deprived[1]['deprivation_level']})")

    print("\n✓ Deprivation ETL complete")


if __name__ == "__main__":
    main()
