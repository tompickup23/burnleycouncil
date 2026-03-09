#!/usr/bin/env python3
"""
health_etl.py — Health & Wellbeing data ETL for AI DOGE.

Fetches health indicators from two sources:
  1. Fingertips API (PHE) — LA-level public health indicators (life expectancy,
     smoking, obesity, mortality rates, etc.)
  2. Census 2021 via Nomis — Ward-level general health, disability, unpaid care

Output: burnley-council/data/{council_id}/health.json

Usage:
    python3 burnley-council/scripts/health_etl.py                    # All councils
    python3 burnley-council/scripts/health_etl.py --council burnley   # Single council
    python3 burnley-council/scripts/health_etl.py --stdout            # Print to stdout
    python3 burnley-council/scripts/health_etl.py --dry-run           # Show what would be fetched
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
FINGERTIPS_BASE = "https://fingertips.phe.org.uk/api"

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
        "district_codes": [
            "E07000117", "E07000118", "E07000119", "E07000120",
            "E07000121", "E07000122", "E07000123", "E07000124",
            "E07000125", "E07000126", "E07000127", "E07000128",
        ],
    },
}

# Lancashire area codes for filtering Fingertips NW-wide results
LANCASHIRE_CODES = {v["ons"] for v in COUNCILS.values() if v.get("type") != "county"}
ENGLAND_CODE = "E92000001"
NW_CODE = "E12000002"

# Fingertips indicators to fetch (LA level)
# Format: key -> (indicator_id, sex_id, age_id, unit, friendly_name)
# SexId: 1=Male, 2=Female, 4=Persons
FINGERTIPS_INDICATORS = {
    "life_expectancy_male": (90366, 1, None, "years", "Life expectancy at birth (male)"),
    "life_expectancy_female": (90366, 2, None, "years", "Life expectancy at birth (female)"),
    "healthy_life_expectancy_male": (90362, 1, None, "years", "Healthy life expectancy (male)"),
    "healthy_life_expectancy_female": (90362, 2, None, "years", "Healthy life expectancy (female)"),
    "smoking_prevalence": (92443, 4, 168, "pct", "Smoking prevalence (18+)"),
    "obesity_prevalence": (93088, 4, 168, "pct", "Overweight/obese adults"),
    "drug_misuse_deaths": (92432, 4, 1, "per 100,000", "Deaths from drug misuse"),
    "infant_mortality": (92196, 4, 1, "per 1,000", "Infant mortality rate"),
    "cvd_mortality_u75": (40401, 4, 163, "per 100,000", "Under 75 CVD mortality"),
    "cancer_mortality_u75": (40501, 4, 163, "per 100,000", "Under 75 cancer mortality"),
    "respiratory_mortality_u75": (40701, 4, 163, "per 100,000", "Under 75 respiratory mortality"),
    "suicide_rate": (41001, 4, 285, "per 100,000", "Suicide rate"),
    "alcohol_mortality": (93763, 4, 1, "per 100,000", "Alcohol-related mortality"),
    "self_harm_admissions": (21001, 4, 1, "per 100,000", "Self-harm hospital admissions"),
}

# Census 2021 health-related datasets on Nomis
CENSUS_DATASETS = {
    "general_health": {
        "id": "NM_2055_1",
        "cat_col": "C2021_HEALTH_6_NAME",
        "values": "1,2,3,4,5",  # Exclude "Total"
    },
    "disability": {
        "id": "NM_2056_1",
        "cat_col": "C2021_DISABILITY_5_NAME",
        "values": "1,2,3,4",  # Day-to-day limited a lot, a little, condition not limited, no conditions
    },
    "unpaid_care": {
        "id": "NM_2057_1",
        "cat_col": "C2021_CARER_7_NAME",
        "values": "1,2,3,4,5,6",  # No care, 9hrs or less, 10-19, 20-34, 35-49, 50+
    },
}


def api_fetch(url, desc="data", as_json=False):
    """Fetch from API with retry."""
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "AI-DOGE-Health-ETL/1.0",
            })
            with urllib.request.urlopen(req, timeout=60) as resp:
                text = resp.read().decode("utf-8")
                if as_json:
                    return json.loads(text)
                return text
        except Exception as e:
            if attempt < 2:
                print(f"  Retry {attempt+1} for {desc}: {e}", file=sys.stderr)
                time.sleep(2)
            else:
                raise


def fetch_fingertips_csv(indicator_ids):
    """Fetch indicator data from Fingertips CSV endpoint for all NW districts."""
    ids_str = ",".join(str(i) for i in indicator_ids)
    url = (
        f"{FINGERTIPS_BASE}/all_data/csv/by_indicator_id"
        f"?indicator_ids={ids_str}"
        f"&child_area_type_id=501"
        f"&parent_area_code={NW_CODE}"
    )
    text = api_fetch(url, f"Fingertips indicators {ids_str}")
    reader = csv.DictReader(io.StringIO(text))
    return list(reader)


def parse_fingertips(rows, council_ons):
    """Parse Fingertips CSV rows into indicator dict for one council.

    Returns dict keyed by our indicator key with value, CI, year, comparisons.
    """
    # Group rows by indicator ID, then filter to latest for this council
    by_indicator = {}
    england_vals = {}
    nw_vals = {}

    for row in rows:
        area = row.get("Area Code", "")
        ind_id = row.get("Indicator ID", "")
        sex = row.get("Sex", "")
        age = row.get("Age", "")
        try:
            val = float(row["Value"]) if row.get("Value") else None
        except (ValueError, TypeError):
            val = None

        key = (ind_id, sex, age)

        if area == council_ons and val is not None:
            existing = by_indicator.get(key)
            row_sort = row.get("Time period Sortable", "")
            if not existing or row_sort > existing.get("_sort", ""):
                by_indicator[key] = {
                    "value": val,
                    "ci_lower": _float(row.get("Lower CI 95.0 limit")),
                    "ci_upper": _float(row.get("Upper CI 95.0 limit")),
                    "count": _float(row.get("Count")),
                    "denominator": _float(row.get("Denominator")),
                    "period": row.get("Time period", ""),
                    "trend": row.get("Recent Trend", ""),
                    "compared_to_england": row.get("Compared to England value or percentiles", ""),
                    "_sort": row_sort,
                }

        # Capture England and NW values for comparison
        if area == ENGLAND_CODE and val is not None:
            existing = england_vals.get(key)
            row_sort = row.get("Time period Sortable", "")
            if not existing or row_sort > existing[1]:
                england_vals[key] = (val, row_sort)

        if area == NW_CODE and val is not None:
            existing = nw_vals.get(key)
            row_sort = row.get("Time period Sortable", "")
            if not existing or row_sort > existing[1]:
                nw_vals[key] = (val, row_sort)

    # Map to our indicator keys
    result = {}
    for ind_key, (ind_id, sex_id, age_id, unit, label) in FINGERTIPS_INDICATORS.items():
        # Find matching row — match on indicator ID and sex
        sex_name = {1: "Male", 2: "Female", 4: "Persons"}.get(sex_id, "Persons")
        matched = None
        matched_lookup = None
        for (rid, rsex, rage), data in by_indicator.items():
            if str(rid) == str(ind_id) and rsex == sex_name:
                if matched is None or data.get("_sort", "") > matched.get("_sort", ""):
                    matched = data
                    matched_lookup = (rid, rsex, rage)

        if matched:
            entry = {
                "value": round(matched["value"], 1),
                "unit": unit,
                "period": matched["period"],
                "label": label,
            }
            if matched["ci_lower"] is not None:
                entry["ci_lower"] = round(matched["ci_lower"], 1)
            if matched["ci_upper"] is not None:
                entry["ci_upper"] = round(matched["ci_upper"], 1)
            if matched["count"] is not None:
                entry["count"] = int(matched["count"])
            if matched["trend"]:
                entry["trend"] = matched["trend"]
            if matched["compared_to_england"]:
                entry["compared_to_england"] = matched["compared_to_england"]

            # Add England/NW comparators
            if matched_lookup and matched_lookup in england_vals:
                entry["england_value"] = round(england_vals[matched_lookup][0], 1)
            if matched_lookup and matched_lookup in nw_vals:
                entry["nw_value"] = round(nw_vals[matched_lookup][0], 1)

            result[ind_key] = entry

    return result


def _float(v):
    """Safe float conversion."""
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def nomis_fetch_csv(url, desc="data"):
    """Fetch CSV from Nomis API with retry. Returns list of dicts."""
    text = api_fetch(url, desc)
    reader = csv.DictReader(io.StringIO(text))
    return list(reader)


def fetch_census_topic(dataset_id, geography, cat_col, values=None):
    """Fetch Census data as CSV. Returns parsed rows."""
    params = {"geography": geography, "measures": "20100"}
    if values:
        # Extract dimension name from cat_col (e.g., C2021_HEALTH_6_NAME -> c2021_health_6)
        dim = cat_col.rsplit("_NAME", 1)[0].lower()
        params[dim] = values
    url = f"{NOMIS_BASE}/dataset/{dataset_id}.data.csv?{urllib.parse.urlencode(params)}"
    return nomis_fetch_csv(url, f"{dataset_id} for {geography}")


def parse_census_rows(rows, cat_col):
    """Parse Nomis CSV rows into ward-level dict of category counts."""
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


def compute_summary(census_totals, indicators):
    """Compute high-level summary stats."""
    summary = {}

    # From Fingertips indicators
    for key in ["life_expectancy_male", "life_expectancy_female",
                "healthy_life_expectancy_male", "healthy_life_expectancy_female",
                "smoking_prevalence", "obesity_prevalence", "suicide_rate",
                "drug_misuse_deaths"]:
        ind = indicators.get(key, {})
        if ind.get("value") is not None:
            summary[key] = ind["value"]

    # Census: general health
    gh = census_totals.get("general_health", {})
    gh_total = sum(v for v in gh.values() if isinstance(v, int))
    good = 0
    bad = 0
    for k, v in gh.items():
        if not isinstance(v, int):
            continue
        kl = k.lower()
        if "very good" in kl or "good" in kl:
            good += v
        elif "bad" in kl or "very bad" in kl:
            bad += v
    if gh_total:
        summary["good_health_pct"] = round(good / gh_total * 100, 1)
        summary["bad_health_pct"] = round(bad / gh_total * 100, 1)

    # Census: disability
    dis = census_totals.get("disability", {})
    dis_total = sum(v for v in dis.values() if isinstance(v, int))
    disabled = 0
    for k, v in dis.items():
        if not isinstance(v, int):
            continue
        kl = k.lower()
        if "limited a lot" in kl or "limited a little" in kl:
            disabled += v
    if dis_total:
        summary["disability_pct"] = round(disabled / dis_total * 100, 1)

    # Census: unpaid care
    uc = census_totals.get("unpaid_care", {})
    uc_total = sum(v for v in uc.values() if isinstance(v, int))
    carers = 0
    for k, v in uc.items():
        if not isinstance(v, int):
            continue
        kl = k.lower()
        if "no unpaid care" not in kl and "provides no" not in kl:
            carers += v
    if uc_total:
        summary["unpaid_carers_pct"] = round(carers / uc_total * 100, 1)

    return summary


def build_health_data(council_id, council_info, fingertips_data):
    """Build full health JSON for one council."""
    ons = council_info["ons"]
    name = council_info["name"]
    print(f"\nProcessing {name} ({ons})...", file=sys.stderr)

    health = {
        "meta": {
            "source": "Fingertips API (OHID) + Census 2021 via Nomis",
            "council_id": council_id,
            "council_name": name,
            "ons_code": ons,
            "census_date": "2021-03-21",
            "generated": time.strftime("%Y-%m-%dT%H:%M:%S"),
        },
        "indicators": {},
        "census": {
            "council_totals": {},
            "wards": {},
        },
        "summary": {},
    }

    # 1. Parse Fingertips indicators for this council
    is_county = council_info.get("type") == "county"
    if not is_county:
        health["indicators"] = parse_fingertips(fingertips_data, ons)
        print(f"  + {len(health['indicators'])} Fingertips indicators", file=sys.stderr)
    else:
        # County council: aggregate district indicators or skip
        print("  - Fingertips: skipped (county council)", file=sys.stderr)

    # 2. Fetch Census ward-level data
    district_codes = council_info.get("district_codes", [])

    for topic, ds in CENSUS_DATASETS.items():
        print(f"  Fetching Census {topic}...", file=sys.stderr)
        time.sleep(0.5)

        try:
            if is_county and district_codes:
                ward_parsed = {}
                for dc in district_codes:
                    time.sleep(0.3)
                    rows = fetch_census_topic(ds["id"], f"{dc}TYPE153", ds["cat_col"], ds.get("values"))
                    parsed = parse_census_rows(rows, ds["cat_col"])
                    ward_parsed.update(parsed)
            else:
                ward_rows = fetch_census_topic(ds["id"], f"{ons}TYPE153", ds["cat_col"], ds.get("values"))
                ward_parsed = parse_census_rows(ward_rows, ds["cat_col"])

            for ward_code, ward_info in ward_parsed.items():
                if ward_code not in health["census"]["wards"]:
                    health["census"]["wards"][ward_code] = {"name": ward_info["name"]}
                health["census"]["wards"][ward_code][topic] = ward_info["categories"]

            # LA-level totals
            la_rows = fetch_census_topic(ds["id"], ons, ds["cat_col"], ds.get("values"))
            la_parsed = parse_census_rows(la_rows, ds["cat_col"])
            if la_parsed:
                la_entry = next(iter(la_parsed.values()), {})
                health["census"]["council_totals"][topic] = la_entry.get("categories", {})

            print(f"  + {topic}: {len(ward_parsed)} wards", file=sys.stderr)

        except Exception as e:
            print(f"  x {topic} failed: {e}", file=sys.stderr)
            health["census"]["council_totals"][topic] = {"error": str(e)}

    # 3. Compute summary
    health["summary"] = compute_summary(health["census"]["council_totals"], health["indicators"])

    return health


def main():
    import argparse
    parser = argparse.ArgumentParser(
        description="Fetch health data from Fingertips API and Census 2021"
    )
    parser.add_argument("--council", help="Single council ID (default: all)")
    parser.add_argument("--stdout", action="store_true", help="Print to stdout only")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be fetched")
    args = parser.parse_args()

    targets = {args.council: COUNCILS[args.council]} if args.council else COUNCILS

    if args.dry_run:
        for cid, info in targets.items():
            print(f"Would fetch health data for {info['name']} ({info['ons']})")
            print(f"  - Fingertips: {len(FINGERTIPS_INDICATORS)} indicators")
            for topic, ds in CENSUS_DATASETS.items():
                print(f"  - Census {topic}: dataset {ds['id']}")
        return

    # Fetch Fingertips data once (covers all NW districts)
    print("Fetching Fingertips indicators (all NW districts)...", file=sys.stderr)
    indicator_ids = list(set(v[0] for v in FINGERTIPS_INDICATORS.values()))
    try:
        fingertips_data = fetch_fingertips_csv(indicator_ids)
        print(f"  + {len(fingertips_data)} Fingertips rows fetched", file=sys.stderr)
    except Exception as e:
        print(f"  x Fingertips fetch failed: {e}", file=sys.stderr)
        fingertips_data = []

    for council_id, council_info in targets.items():
        health = build_health_data(council_id, council_info, fingertips_data)

        output = json.dumps(health, indent=2, ensure_ascii=False)

        if args.stdout:
            print(output)
        else:
            out_path = DATA_DIR / council_id / "health.json"
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(output, encoding="utf-8")
            print(f"  Written: {out_path}", file=sys.stderr)

    print("\nDone.", file=sys.stderr)


if __name__ == "__main__":
    main()
