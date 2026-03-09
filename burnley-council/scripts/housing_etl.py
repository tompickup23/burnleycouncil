#!/usr/bin/env python3
"""
housing_etl.py — Housing data ETL for AI DOGE.

Fetches Census 2021 ward-level housing data from Nomis API,
plus hardcoded Article 4 / Selective Licensing policy data.

Data sources:
  - Census 2021 via Nomis (tenure, overcrowding, accommodation, bedrooms, household size)
  - Article 4 / Selective Licensing directions (manually compiled per council)

Output: burnley-council/data/{council_id}/housing.json

Usage:
    python3 burnley-council/scripts/housing_etl.py                    # All councils
    python3 burnley-council/scripts/housing_etl.py --council burnley   # Single council
    python3 burnley-council/scripts/housing_etl.py --stdout            # Print to stdout
    python3 burnley-council/scripts/housing_etl.py --dry-run           # Show what would be fetched
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

# ONS codes for our councils (same as census_etl.py)
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
        "district_codes": [
            "E07000117", "E07000118", "E07000119", "E07000120",
            "E07000121", "E07000122", "E07000123", "E07000124",
            "E07000125", "E07000126", "E07000127", "E07000128",
        ],
    },
}

# Census 2021 housing-related datasets on Nomis
CENSUS_DATASETS = {
    "tenure": {
        "id": "NM_2072_1",
        "cat_col": "C2021_TENURE_9_NAME",
    },
    "accommodation_type": {
        "id": "NM_2062_1",
        "cat_col": "C2021_ACCTYPE_9_NAME",
    },
    "overcrowding": {
        "id": "NM_2070_1",
        "cat_col": "C2021_OCCRAT_BEDROOMS_6_NAME",
    },
    "bedrooms": {
        "id": "NM_2068_1",
        "cat_col": "C2021_BEDROOMS_5_NAME",
    },
    "household_size": {
        "id": "NM_2037_1",
        "cat_col": "C2021_HHSIZE_10_NAME",
    },
}

# Article 4 directions and Selective Licensing — manually compiled
POLICY_DATA = {
    "burnley": {
        "article_4": {
            "active": True,
            "date": "Oct 2024",
            "scope": "Selected wards",
            "wards": [
                "Bank Hall", "Brunshaw", "Daneshouse with Stoneyholme",
                "Gannow", "Gawthorpe", "Queensgate",
                "Rosehill with Burnley Wood", "Rosegrove with Lowerhouse", "Trinity",
            ],
        },
        "selective_licensing": {
            "active": True,
            "date": "Apr 2025",
            "wards": ["Trinity", "Queensgate", "Gannow", "Daneshouse with Stoneyholme", "Padiham"],
        },
    },
    "hyndburn": {
        "article_4": {
            "active": True,
            "date": "Incoming",
            "scope": "Selected wards",
            "wards": [
                "Barnfield", "Central", "Church", "Clayton-Le-Moors",
                "Netherton", "Peel", "Rishton", "Spring Hill", "St Andrews",
            ],
        },
        "selective_licensing": {"active": False},
    },
    "pendle": {
        "article_4": {"active": False},
        "selective_licensing": {"active": False},
    },
    "rossendale": {
        "article_4": {
            "active": True,
            "date": "Sep 2025",
            "scope": "Borough-wide",
            "wards": [],
        },
        "selective_licensing": {"active": False},
    },
    "lancaster": {
        "article_4": {
            "active": True,
            "date": "Nov 2021",
            "scope": "Selected wards",
            "wards": [
                "Bulk", "Castle", "John O'Gaunt", "Marsh",
                "Scotforth East", "Scotforth West", "Skerton East", "Skerton West", "Galgate",
            ],
        },
        "selective_licensing": {"active": False},
    },
    "ribble_valley": {
        "article_4": {"active": False},
        "selective_licensing": {"active": False},
    },
    "chorley": {
        "article_4": {
            "active": True,
            "date": "Sep 2025",
            "scope": "TBC",
            "wards": [],
        },
        "selective_licensing": {"active": False},
    },
    "south_ribble": {
        "article_4": {"active": False},
        "selective_licensing": {"active": False},
    },
    "preston": {
        "article_4": {
            "active": True,
            "date": "2012 (expanding 2026)",
            "scope": "Selected areas — 2026 consultation for expansion",
            "wards": [],
        },
        "selective_licensing": {"active": False},
    },
    "west_lancashire": {
        "article_4": {
            "active": True,
            "date": "Dec 2011",
            "scope": "Ormskirk, parts of Aughton and Westhead",
            "wards": [],
        },
        "selective_licensing": {"active": False},
    },
    "wyre": {
        "article_4": {
            "active": True,
            "date": "Feb 2026",
            "scope": "Parts of Fleetwood and Thornton-Cleveleys",
            "wards": [],
        },
        "selective_licensing": {"active": False},
    },
    "fylde": {
        "article_4": {"active": False},
        "selective_licensing": {"active": False},
    },
    "blackpool": {
        "article_4": {
            "active": True,
            "date": "Borough-wide",
            "scope": "Borough-wide",
            "wards": [],
        },
        "selective_licensing": {
            "active": True,
            "date": "Apr 2025",
            "wards": [],
        },
    },
    "blackburn": {
        "article_4": {
            "active": True,
            "date": "Aug 2023",
            "scope": "Borough-wide",
            "wards": [],
        },
        "selective_licensing": {
            "active": False,
            "note": "Consultation 2024 (Hollins Bank area, 42 streets)",
        },
    },
    "lancashire_cc": {
        "article_4": {"active": False, "note": "Not a planning authority"},
        "selective_licensing": {"active": False, "note": "Not a housing authority"},
    },
}


def nomis_fetch_csv(url, desc="data"):
    """Fetch CSV from Nomis API with retry. Returns list of dicts."""
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "AI-DOGE-Housing-ETL/1.0",
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


def compute_summary(census_totals):
    """Compute high-level summary stats from census council totals."""
    summary = {}

    # Tenure breakdown
    ten = census_totals.get("tenure", {})
    ten_total = 0
    owned = 0
    social_rent = 0
    private_rent = 0
    rent_free = 0
    for k, v in ten.items():
        if not isinstance(v, int):
            continue
        kl = k.lower()
        if kl.startswith("total"):
            ten_total = v
        elif kl == "owned":
            owned = v
        elif "social rented" in kl and ":" not in kl:
            social_rent = v
        elif "private rented" in kl and ":" not in kl:
            private_rent = v
        elif "rent free" in kl:
            rent_free = v

    summary["total_households"] = ten_total
    if ten_total:
        summary["owned"] = owned
        summary["owned_pct"] = round(owned / ten_total * 100, 1)
        summary["social_rented"] = social_rent
        summary["social_rented_pct"] = round(social_rent / ten_total * 100, 1)
        summary["private_rented"] = private_rent
        summary["private_rented_pct"] = round(private_rent / ten_total * 100, 1)
        summary["rent_free"] = rent_free
        summary["rent_free_pct"] = round(rent_free / ten_total * 100, 1)

    # Overcrowding — categories like "Occupancy rating of bedrooms: -1"
    oc = census_totals.get("overcrowding", {})
    oc_total = 0
    overcrowded = 0
    for k, v in oc.items():
        if not isinstance(v, int):
            continue
        kl = k.lower()
        if kl.startswith("total"):
            oc_total = v
        elif ": -1" in kl or ": -2" in kl:
            overcrowded += v
    if oc_total:
        summary["overcrowded"] = overcrowded
        summary["overcrowding_pct"] = round(overcrowded / oc_total * 100, 1)

    # Accommodation type summary
    acc = census_totals.get("accommodation_type", {})
    acc_total = 0
    detached = 0
    semi = 0
    terraced = 0
    flat = 0
    for k, v in acc.items():
        if not isinstance(v, int):
            continue
        kl = k.lower()
        if kl.startswith("total"):
            acc_total = v
        elif "semi-detached" in kl:
            semi = v
        elif "detached" in kl:
            detached = v
        elif "terraced" in kl:
            terraced = v
        elif "purpose-built" in kl or "converted" in kl or "commercial" in kl:
            flat += v
    if acc_total:
        summary["detached_pct"] = round(detached / acc_total * 100, 1)
        summary["semi_detached_pct"] = round(semi / acc_total * 100, 1)
        summary["terraced_pct"] = round(terraced / acc_total * 100, 1)
        summary["flat_pct"] = round(flat / acc_total * 100, 1)

    # Average household size
    hs = census_totals.get("household_size", {})
    hs_total = 0
    hs_sum = 0
    for k, v in hs.items():
        if not isinstance(v, int):
            continue
        kl = k.lower()
        if kl.startswith("total"):
            hs_total = v
            continue
        # Extract number from "1 person in household", "2 people in household", etc.
        try:
            num = int(kl.split()[0])
            hs_sum += num * v
        except (ValueError, IndexError):
            pass
    if hs_total:
        summary["avg_household_size"] = round(hs_sum / hs_total, 2)

    return summary


def build_housing_data(council_id, council_info):
    """Build full housing JSON for one council."""
    ons = council_info["ons"]
    name = council_info["name"]
    print(f"\nProcessing {name} ({ons})...", file=sys.stderr)

    housing = {
        "meta": {
            "source": "ONS Census 2021 via Nomis API + policy compilation",
            "council_id": council_id,
            "council_name": name,
            "ons_code": ons,
            "census_date": "2021-03-21",
            "generated": time.strftime("%Y-%m-%dT%H:%M:%S"),
        },
        "census": {
            "council_totals": {},
            "wards": {},
        },
        "policy": POLICY_DATA.get(council_id, {
            "article_4": {"active": False},
            "selective_licensing": {"active": False},
        }),
        "summary": {},
    }

    # County councils need ward data from each constituent district
    is_county = council_info.get("type") == "county"
    district_codes = council_info.get("district_codes", [])

    for topic, ds in CENSUS_DATASETS.items():
        print(f"  Fetching {topic}...", file=sys.stderr)
        time.sleep(0.5)  # Be polite to Nomis

        try:
            # Fetch ward-level data
            if is_county and district_codes:
                ward_parsed = {}
                for dc in district_codes:
                    time.sleep(0.3)
                    rows = fetch_data_csv(ds["id"], f"{dc}TYPE153", ds["cat_col"])
                    parsed = parse_csv_rows(rows, ds["cat_col"])
                    ward_parsed.update(parsed)
            else:
                ward_rows = fetch_data_csv(ds["id"], f"{ons}TYPE153", ds["cat_col"])
                ward_parsed = parse_csv_rows(ward_rows, ds["cat_col"])

            # Store ward data
            for ward_code, ward_info in ward_parsed.items():
                if ward_code not in housing["census"]["wards"]:
                    housing["census"]["wards"][ward_code] = {"name": ward_info["name"]}
                housing["census"]["wards"][ward_code][topic] = ward_info["categories"]

            # Fetch LA-level totals
            la_rows = fetch_data_csv(ds["id"], ons, ds["cat_col"])
            la_parsed = parse_csv_rows(la_rows, ds["cat_col"])
            if la_parsed:
                la_entry = next(iter(la_parsed.values()), {})
                housing["census"]["council_totals"][topic] = la_entry.get("categories", {})

            print(f"  + {topic}: {len(ward_parsed)} wards", file=sys.stderr)

        except Exception as e:
            print(f"  x {topic} failed: {e}", file=sys.stderr)
            housing["census"]["council_totals"][topic] = {"error": str(e)}

    # Compute summary stats
    housing["summary"] = compute_summary(housing["census"]["council_totals"])

    # Add policy summary flags
    policy = housing["policy"]
    housing["summary"]["has_article_4"] = policy.get("article_4", {}).get("active", False)
    housing["summary"]["has_selective_licensing"] = policy.get("selective_licensing", {}).get("active", False)

    return housing


def main():
    import argparse
    parser = argparse.ArgumentParser(
        description="Fetch Census 2021 ward-level housing data from Nomis"
    )
    parser.add_argument("--council", help="Single council ID (default: all)")
    parser.add_argument("--stdout", action="store_true", help="Print to stdout only")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be fetched")
    args = parser.parse_args()

    targets = {args.council: COUNCILS[args.council]} if args.council else COUNCILS

    if args.dry_run:
        for cid, info in targets.items():
            print(f"Would fetch housing data for {info['name']} ({info['ons']})")
            for topic, ds in CENSUS_DATASETS.items():
                print(f"  - {topic}: dataset {ds['id']}")
            policy = POLICY_DATA.get(cid, {})
            a4 = policy.get("article_4", {})
            sl = policy.get("selective_licensing", {})
            print(f"  - Article 4: {'Yes' if a4.get('active') else 'No'}")
            print(f"  - Selective Licensing: {'Yes' if sl.get('active') else 'No'}")
        return

    for council_id, council_info in targets.items():
        housing = build_housing_data(council_id, council_info)

        output = json.dumps(housing, indent=2, ensure_ascii=False)

        if args.stdout:
            print(output)
        else:
            out_path = DATA_DIR / council_id / "housing.json"
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(output, encoding="utf-8")
            print(f"  Written: {out_path}", file=sys.stderr)

    print("\nDone.", file=sys.stderr)


if __name__ == "__main__":
    main()
