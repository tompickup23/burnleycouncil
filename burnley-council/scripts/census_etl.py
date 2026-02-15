#!/usr/bin/env python3
"""
census_etl.py — Pull Census 2021 ward-level demographics from Nomis API.

Fetches age, sex, ethnicity, religion, country of birth and economic activity
data at ward level for all AI DOGE councils. No API key needed.

Data source: ONS Census 2021 via Nomis (nomisweb.co.uk)
Output: burnley-council/data/{council_id}/demographics.json

Usage:
    python3 burnley-council/scripts/census_etl.py                    # All councils
    python3 burnley-council/scripts/census_etl.py --council burnley   # Single council
    python3 burnley-council/scripts/census_etl.py --stdout            # Print to stdout
"""

import csv
import io
import json
import sys
import time
import urllib.request
import urllib.parse
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"

NOMIS_BASE = "https://www.nomisweb.co.uk/api/v01"

# ONS codes for our councils
COUNCILS = {
    "burnley": {"ons": "E07000117", "name": "Burnley"},
    "hyndburn": {"ons": "E07000120", "name": "Hyndburn"},
    "pendle": {"ons": "E07000122", "name": "Pendle"},
    "rossendale": {"ons": "E07000125", "name": "Rossendale"},
    "lancaster": {"ons": "E07000121", "name": "Lancaster"},
    "ribble_valley": {"ons": "E07000124", "name": "Ribble Valley"},
    "chorley": {"ons": "E07000118", "name": "Chorley"},
    "south_ribble": {"ons": "E07000126", "name": "South Ribble"},
    "blackpool": {"ons": "E06000009", "name": "Blackpool"},
    "west_lancashire": {"ons": "E07000127", "name": "West Lancashire"},
    "blackburn": {"ons": "E06000008", "name": "Blackburn with Darwen"},
    "wyre": {"ons": "E07000128", "name": "Wyre"},
    "preston": {"ons": "E07000123", "name": "Preston"},
    "fylde": {"ons": "E07000119", "name": "Fylde"},
    "lancashire_cc": {
        "ons": "E10000017",
        "name": "Lancashire",
        "type": "county",
        # County councils don't have TYPE153 wards directly — must query via constituent districts
        "district_codes": [
            "E07000117",  # Burnley
            "E07000118",  # Chorley
            "E07000119",  # Fylde
            "E07000120",  # Hyndburn
            "E07000121",  # Lancaster
            "E07000122",  # Pendle
            "E07000123",  # Preston
            "E07000124",  # Ribble Valley
            "E07000125",  # Rossendale
            "E07000126",  # South Ribble
            "E07000127",  # West Lancashire
            "E07000128",  # Wyre
        ],
    },
}

# Census 2021 Topic Summary datasets on Nomis
# Each entry: dataset_id on Nomis, the category column name in CSV
DATASETS = {
    "age": {
        "id": "NM_2027_1",
        "cat_col": "C2021_AGE_102_NAME",
    },
    "sex": {
        "id": "NM_2028_1",
        "cat_col": "C_SEX_NAME",
    },
    "ethnicity": {
        "id": "NM_2041_1",
        "cat_col": "C2021_ETH_20_NAME",
    },
    "religion": {
        "id": "NM_2049_1",
        "cat_col": "C2021_RELIGION_10_NAME",
    },
    "country_of_birth": {
        "id": "NM_2024_1",
        "cat_col": "C2021_COB_12_NAME",
    },
    "economic_activity": {
        "id": "NM_2083_1",
        "cat_col": "C2021_EASTAT_20_NAME",
    },
}


def nomis_fetch_csv(url, desc="data"):
    """Fetch CSV from Nomis API with retry. Returns list of dicts."""
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "AI-DOGE-Census-ETL/1.0",
            })
            with urllib.request.urlopen(req, timeout=60) as resp:
                text = resp.read().decode("utf-8")
                reader = csv.DictReader(io.StringIO(text))
                return list(reader)
        except Exception as e:
            if attempt < 2:
                print(f"  Retry {attempt+1} for {desc}: {e}", file=sys.stderr)
                time.sleep(2)
            else:
                raise


def fetch_data_csv(dataset_id, geography, cat_col):
    """Fetch Census data as CSV. Returns parsed rows."""
    params = {
        "geography": geography,
        "measures": "20100",
    }
    url = f"{NOMIS_BASE}/dataset/{dataset_id}.data.csv?{urllib.parse.urlencode(params)}"
    return nomis_fetch_csv(url, f"{dataset_id} for {geography}")


def parse_csv_rows(rows, cat_col):
    """Parse Nomis CSV rows into ward-level dict of category counts.

    Returns: {ward_code: {"name": ward_name, "categories": {cat: count}}}
    """
    result = {}
    for row in rows:
        geo_code = row.get("GEOGRAPHY_CODE", "")
        geo_name = row.get("GEOGRAPHY_NAME", "")
        category = row.get(cat_col, "Unknown")
        try:
            value = int(float(row.get("OBS_VALUE", "0")))
        except (ValueError, TypeError):
            value = 0

        if geo_code not in result:
            result[geo_code] = {"name": geo_name, "categories": {}}
        result[geo_code]["categories"][category] = value

    return result


def build_council_demographics(council_id, council_info):
    """Build full demographics JSON for one council."""
    ons = council_info["ons"]
    name = council_info["name"]
    print(f"\nProcessing {name} ({ons})...", file=sys.stderr)

    demographics = {
        "meta": {
            "source": "ONS Census 2021 via Nomis API",
            "council_id": council_id,
            "council_name": name,
            "ons_code": ons,
            "census_date": "2021-03-21",
            "generated": time.strftime("%Y-%m-%dT%H:%M:%S"),
        },
        "council_totals": {},
        "wards": {},
    }

    # County councils need ward data from each constituent district
    is_county = council_info.get("type") == "county"
    district_codes = council_info.get("district_codes", [])

    for topic, ds in DATASETS.items():
        print(f"  Fetching {topic}...", file=sys.stderr)
        time.sleep(0.5)  # Be polite to Nomis

        try:
            # Fetch ward-level data
            if is_county and district_codes:
                # County councils: query each district's wards individually
                ward_parsed = {}
                for dc in district_codes:
                    time.sleep(0.3)
                    rows = fetch_data_csv(ds["id"], f"{dc}TYPE153", ds["cat_col"])
                    parsed = parse_csv_rows(rows, ds["cat_col"])
                    ward_parsed.update(parsed)
            else:
                # District/unitary: TYPE153 wards within LA
                ward_rows = fetch_data_csv(ds["id"], f"{ons}TYPE153", ds["cat_col"])
                ward_parsed = parse_csv_rows(ward_rows, ds["cat_col"])

            # Store ward data
            for ward_code, ward_info in ward_parsed.items():
                if ward_code not in demographics["wards"]:
                    demographics["wards"][ward_code] = {"name": ward_info["name"]}
                demographics["wards"][ward_code][topic] = ward_info["categories"]

            # Fetch LA-level totals
            la_rows = fetch_data_csv(ds["id"], ons, ds["cat_col"])
            la_parsed = parse_csv_rows(la_rows, ds["cat_col"])
            if la_parsed:
                la_entry = next(iter(la_parsed.values()), {})
                demographics["council_totals"][topic] = la_entry.get("categories", {})

            print(f"  + {topic}: {len(ward_parsed)} wards", file=sys.stderr)

        except Exception as e:
            print(f"  x {topic} failed: {e}", file=sys.stderr)
            demographics["council_totals"][topic] = {"error": str(e)}

    # Compute summary stats from council totals
    demographics["summary"] = compute_summary(demographics["council_totals"])

    return demographics


def compute_summary(totals):
    """Compute high-level summary stats from council totals."""
    summary = {}

    # Population from age total
    age = totals.get("age", {})
    total_pop = 0
    for k, v in age.items():
        if isinstance(v, int) and "total" in k.lower():
            total_pop = v
            break
    summary["population"] = total_pop

    # Sex breakdown
    sex = totals.get("sex", {})
    for k, v in sex.items():
        if not isinstance(v, int):
            continue
        kl = k.lower()
        if "female" in kl and "total" not in kl:
            summary["female"] = v
            summary["female_pct"] = round(v / total_pop * 100, 1) if total_pop else 0
        elif "male" in kl and "total" not in kl:
            summary["male"] = v
            summary["male_pct"] = round(v / total_pop * 100, 1) if total_pop else 0

    # Ethnicity summary — use only top-level categories (no ":" = not a sub-category)
    eth = totals.get("ethnicity", {})
    eth_summary = {}
    for k, v in eth.items():
        if not isinstance(v, int):
            continue
        if "total" in k.lower():
            continue
        # Skip sub-categories (contain ":" after the group name)
        if ": " in k:
            continue
        # Map to broad groups
        kl = k.lower()
        if "white" in kl:
            eth_summary["White"] = v
        elif "asian" in kl:
            eth_summary["Asian"] = v
        elif "black" in kl:
            eth_summary["Black"] = v
        elif "mixed" in kl:
            eth_summary["Mixed"] = v
        else:
            eth_summary["Other"] = eth_summary.get("Other", 0) + v
    if total_pop and eth_summary:
        summary["ethnicity"] = {
            k: {"count": v, "pct": round(v / total_pop * 100, 1)}
            for k, v in sorted(eth_summary.items(), key=lambda x: -x[1])
        }

    # Religion summary
    rel = totals.get("religion", {})
    rel_summary = {}
    for k, v in rel.items():
        if not isinstance(v, int):
            continue
        if "total" in k.lower():
            continue
        rel_summary[k] = v
    if total_pop and rel_summary:
        summary["religion"] = {
            k: {"count": v, "pct": round(v / total_pop * 100, 1)}
            for k, v in sorted(rel_summary.items(), key=lambda x: -x[1])
        }

    # Country of birth summary — extract UK-born from hierarchical categories
    # Categories: "Europe: United Kingdom" is UK. Top-level "Europe" includes UK + EU.
    # We specifically pick "Europe: United Kingdom" for UK-born, then sum non-UK from
    # the other top-level regions (Africa, Middle East, Americas, etc.) + EU.
    cob = totals.get("country_of_birth", {})
    uk_born = 0
    cob_total = 0
    for k, v in cob.items():
        if not isinstance(v, int):
            continue
        kl = k.lower()
        if "total" in kl:
            cob_total = v
        elif "united kingdom" in kl:
            uk_born = v
    if cob_total:
        non_uk = cob_total - uk_born
        summary["born_uk_pct"] = round(uk_born / cob_total * 100, 1)
        summary["born_outside_uk_pct"] = round(non_uk / cob_total * 100, 1)

    # Economic activity summary — use specific top-level categories
    # "Economically active (excluding full-time students)" = main employed group
    # "Economically active (excluding...): Unemployed" = unemployed within active
    # "Economically inactive" = not in labour force
    econ = totals.get("economic_activity", {})
    econ_total = 0
    econ_active_excl = 0
    econ_active_student = 0
    econ_inactive = 0
    unemployed = 0
    for k, v in econ.items():
        if not isinstance(v, int):
            continue
        if k.startswith("Total"):
            econ_total = v
        elif k == "Economically active (excluding full-time students)":
            econ_active_excl = v
        elif k == "Economically active and a full-time student":
            econ_active_student = v
        elif k == "Economically inactive":
            econ_inactive = v
        # Pick out unemployed from sub-categories
        elif k.endswith("Unemployed"):
            unemployed += v
    if econ_total:
        employed = econ_active_excl + econ_active_student - unemployed
        summary["economically_active"] = econ_active_excl + econ_active_student
        summary["economically_inactive"] = econ_inactive
        summary["employment_rate_pct"] = round(employed / econ_total * 100, 1)
        summary["unemployment_rate_pct"] = round(unemployed / econ_total * 100, 1)

    return summary


def main():
    import argparse
    parser = argparse.ArgumentParser(
        description="Fetch Census 2021 ward-level demographics from Nomis"
    )
    parser.add_argument("--council", help="Single council ID (default: all)")
    parser.add_argument("--stdout", action="store_true", help="Print to stdout only")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be fetched")
    args = parser.parse_args()

    targets = {args.council: COUNCILS[args.council]} if args.council else COUNCILS

    if args.dry_run:
        for cid, info in targets.items():
            print(f"Would fetch Census 2021 data for {info['name']} ({info['ons']})")
            for topic, ds in DATASETS.items():
                print(f"  - {topic}: dataset {ds['id']}")
        return

    for council_id, council_info in targets.items():
        demographics = build_council_demographics(council_id, council_info)

        output = json.dumps(demographics, indent=2, ensure_ascii=False)

        if args.stdout:
            print(output)
        else:
            out_path = DATA_DIR / council_id / "demographics.json"
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(output, encoding="utf-8")
            print(f"  Written: {out_path}", file=sys.stderr)

    print("\nDone.", file=sys.stderr)


if __name__ == "__main__":
    main()
