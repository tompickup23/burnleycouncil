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
    # New datasets for election model (Phase A3)
    "qualifications": {
        "id": "NM_2084_1",
        "cat_col": "C2021_HIQUAL_8_NAME",
    },
    "tenure": {
        "id": "NM_2072_1",
        "cat_col": "C2021_TENURE_9_NAME",
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

    # Qualifications summary (NM_2070_1)
    # Key categories: "No qualifications", "Level 1", "Level 2", "Apprenticeship",
    # "Level 3", "Level 4 qualifications and above", "Other qualifications"
    quals = totals.get("qualifications", {})
    quals_total = 0
    no_quals = 0
    level4_plus = 0
    for k, v in quals.items():
        if not isinstance(v, int):
            continue
        kl = k.lower()
        if "total" in kl:
            quals_total = v
        elif "no qualifications" in kl:
            no_quals = v
        elif "level 4" in kl:
            level4_plus = v
    if quals_total:
        summary["no_qualifications"] = no_quals
        summary["no_qualifications_pct"] = round(no_quals / quals_total * 100, 1)
        summary["degree_or_above"] = level4_plus
        summary["degree_or_above_pct"] = round(level4_plus / quals_total * 100, 1)

    # Housing tenure summary (NM_2072_1)
    # Key categories: "Owned: Owns outright", "Owned: Owns with a mortgage...",
    # "Social rented", "Private rented", "Lives rent free"
    ten = totals.get("tenure", {})
    ten_total = 0
    owned = 0
    social_rent = 0
    private_rent = 0
    for k, v in ten.items():
        if not isinstance(v, int):
            continue
        kl = k.lower()
        if kl.startswith("total"):
            ten_total = v
        elif kl == "owned":
            # Parent category "Owned" = sum of outright + mortgage. Use this directly
            owned = v
        elif "social rented" in kl and ":" not in kl:
            # Parent "Social rented" not sub-categories
            social_rent = v
        elif "private rented" in kl and ":" not in kl:
            # Parent "Private rented" not sub-categories
            private_rent = v
    if ten_total:
        summary["owned"] = owned
        summary["owned_pct"] = round(owned / ten_total * 100, 1)
        summary["social_rented"] = social_rent
        summary["social_rented_pct"] = round(social_rent / ten_total * 100, 1)
        summary["private_rented"] = private_rent
        summary["private_rented_pct"] = round(private_rent / ten_total * 100, 1)

    return summary


# ---------------------------------------------------------------------------
# Claimant Count (NM_162_1) — real-time DWP data at constituency level
# ---------------------------------------------------------------------------

# Lancashire constituency Nomis internal codes for TYPE172 (2024 boundaries)
# ONS codes are E14001xxx, but Nomis needs the integer codes for API queries
LANCASHIRE_CONSTITUENCIES = {
    "burnley": {"nomis_id": "721420368", "ons": "E14001142", "name": "Burnley"},
    "hyndburn": {"nomis_id": "721420525", "ons": "E14001299", "name": "Hyndburn"},
    "pendle_and_clitheroe": {"nomis_id": "721420648", "ons": "E14001422", "name": "Pendle and Clitheroe"},
    "rossendale_and_darwen": {"nomis_id": "721420676", "ons": "E14001450", "name": "Rossendale and Darwen"},
    "lancaster_and_wyre": {"nomis_id": "721420544", "ons": "E14001318", "name": "Lancaster and Wyre"},
    "morecambe_and_lunesdale": {"nomis_id": "721420598", "ons": "E14001372", "name": "Morecambe and Lunesdale"},
    "ribble_valley": {"nomis_id": "721420669", "ons": "E14001443", "name": "Ribble Valley"},
    "chorley": {"nomis_id": "721420396", "ons": "E14001170", "name": "Chorley"},
    "south_ribble": {"nomis_id": "721420717", "ons": "E14001491", "name": "South Ribble"},
    "preston": {"nomis_id": "721420659", "ons": "E14001433", "name": "Preston"},
    "west_lancashire": {"nomis_id": "721420803", "ons": "E14001577", "name": "West Lancashire"},
    "fylde": {"nomis_id": "721420468", "ons": "E14001242", "name": "Fylde"},
    "blackpool_north_and_fleetwood": {"nomis_id": "721420330", "ons": "E14001104", "name": "Blackpool North and Fleetwood"},
    "blackpool_south": {"nomis_id": "721420331", "ons": "E14001105", "name": "Blackpool South"},
    "blackburn": {"nomis_id": "721420328", "ons": "E14001102", "name": "Blackburn"},
    "southport": {"nomis_id": "721420730", "ons": "E14001504", "name": "Southport"},
}


def fetch_claimant_count(nomis_id, constituency_name, months=12):
    """Fetch claimant count data for a constituency from Nomis NM_162_1.

    Uses TYPE172 (Westminster Parliamentary Constituencies July 2024).
    Nomis requires integer IDs and explicit YYYY-MM time values (not 'latestN').
    Returns list of {month, claimant_count, claimant_rate} dicts.
    """
    from datetime import datetime as dt
    from datetime import timedelta

    # Build time range: last N months as YYYY-MM format
    now = dt.now()
    time_values = []
    for i in range(months):
        d = now - timedelta(days=30 * i)
        time_values.append(d.strftime("%Y-%m"))
    time_str = ",".join(time_values)

    # Fetch count + rate (measure 1 = count, measure 2 = rate as % of 16-64)
    params = {
        "geography": nomis_id,
        "gender": "0",  # Total
        "age": "0",     # All ages (16+)
        "measure": "1,2",  # Count + rate
        "measures": "20100",
        "time": time_str,
    }
    url = f"{NOMIS_BASE}/dataset/NM_162_1.data.csv?{urllib.parse.urlencode(params)}"

    try:
        rows = nomis_fetch_csv(url, f"claimant count for {constituency_name}")
    except Exception as e:
        print(f"  x Claimant count failed for {constituency_name}: {e}", file=sys.stderr)
        return []

    # Group by month — measure 1 is count, measure 2 is rate
    month_data = {}
    for row in rows:
        month = row.get("DATE_NAME", "")
        date_code = row.get("DATE_CODE", row.get("DATE", ""))
        measure = row.get("MEASURE_NAME", "")
        value = row.get("OBS_VALUE", "0")

        if month not in month_data:
            month_data[month] = {"month": month, "date": date_code}

        try:
            val = float(value)
        except (ValueError, TypeError):
            val = 0

        if "count" in measure.lower():
            month_data[month]["claimant_count"] = int(val)
        elif "proportion" in measure.lower() or "rate" in measure.lower():
            month_data[month]["claimant_rate_pct"] = round(val, 1)

    # Sort by date descending (newest first)
    results = sorted(month_data.values(), key=lambda x: x.get("date", ""), reverse=True)
    return results


def build_constituency_demographics():
    """Build constituency-level demographics by aggregating ward data + claimant count.

    Uses ward-level Census data from existing council demographics.json files,
    plus constituency-level claimant count from NM_162_1 (TYPE460).

    Returns dict of {constituency_id: demographics_data}
    """
    shared_dir = DATA_DIR / "shared"
    const_path = shared_dir / "constituencies.json"

    if not const_path.exists():
        print("ERROR: constituencies.json not found — run constituency_etl.py first", file=sys.stderr)
        return {}

    const_data = json.loads(const_path.read_text(encoding="utf-8"))
    constituencies = {c["id"]: c for c in const_data.get("constituencies", [])}

    # Load all council demographics files for ward data
    council_demos = {}
    for cid in COUNCILS:
        demo_path = DATA_DIR / cid / "demographics.json"
        if demo_path.exists():
            council_demos[cid] = json.loads(demo_path.read_text(encoding="utf-8"))

    results = {}
    for const_id, const_info in LANCASHIRE_CONSTITUENCIES.items():
        print(f"\n  {const_info['name']}:", file=sys.stderr)

        demo_data = {
            "constituency_id": const_id,
            "constituency_name": const_info["name"],
            "ons_code": const_info["ons"],
        }

        # Fetch claimant count (constituency-level, real-time)
        print(f"    Fetching claimant count...", file=sys.stderr)
        time.sleep(0.5)
        claimant_data = fetch_claimant_count(
            const_info["nomis_id"], const_info["name"], months=12
        )
        if claimant_data:
            demo_data["claimant_count"] = claimant_data
            latest = claimant_data[0] if claimant_data else {}
            print(f"    Latest: {latest.get('claimant_count', '?')} claimants ({latest.get('month', '?')})",
                  file=sys.stderr)
        else:
            print(f"    No claimant data available", file=sys.stderr)

        results[const_id] = demo_data

    return results


def main():
    import argparse
    parser = argparse.ArgumentParser(
        description="Fetch Census 2021 ward-level demographics from Nomis"
    )
    parser.add_argument("--council", help="Single council ID (default: all)")
    parser.add_argument("--constituency", action="store_true",
                        help="Build constituency-level demographics (claimant count)")
    parser.add_argument("--stdout", action="store_true", help="Print to stdout only")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be fetched")
    args = parser.parse_args()

    if args.constituency:
        # Constituency mode: fetch claimant count data
        print("Fetching constituency-level demographics...", file=sys.stderr)
        results = build_constituency_demographics()

        output_data = {
            "meta": {
                "source": "DWP Claimant Count via Nomis API (NM_162_1)",
                "geography": "TYPE460 (2024 Westminster constituency boundaries)",
                "generated": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "constituencies_count": len(results),
            },
            "constituencies": results,
        }

        output = json.dumps(output_data, indent=2, ensure_ascii=False)

        if args.stdout or args.dry_run:
            print(output)
        else:
            # Merge claimant count into constituencies.json
            shared_dir = DATA_DIR / "shared"
            const_path = shared_dir / "constituencies.json"
            if const_path.exists():
                const_data = json.loads(const_path.read_text(encoding="utf-8"))
                merged = 0
                for const in const_data.get("constituencies", []):
                    cid = const.get("id")
                    if cid in results and results[cid].get("claimant_count"):
                        const["claimant_count"] = results[cid]["claimant_count"]
                        merged += 1
                const_data["meta"]["claimant_count_updated"] = time.strftime("%Y-%m-%dT%H:%M:%S")
                const_path.write_text(json.dumps(const_data, indent=2, ensure_ascii=False), encoding="utf-8")
                print(f"\nMerged claimant count for {merged} constituencies into {const_path}", file=sys.stderr)
            else:
                # Save standalone
                out_path = shared_dir / "constituency_demographics.json"
                out_path.write_text(output, encoding="utf-8")
                print(f"\nWritten: {out_path}", file=sys.stderr)
        return

    # Council mode (existing behaviour)
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
