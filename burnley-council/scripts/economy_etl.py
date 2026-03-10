#!/usr/bin/env python3
"""
economy_etl.py — Economy & Work data ETL for AI DOGE.

Fetches economic data from multiple Nomis sources:
  1. Claimant Count (NM_162_1) — ward-level monthly unemployment proxy
  2. ASHE Earnings (NM_30_1) — LA-level median weekly/annual pay
  3. GDHI (NM_185_1) — LA-level gross disposable household income
  4. Census 2021 TS060 Industry (NM_2077_1) — ward-level SIC sections
  5. Census 2021 TS063 Occupation (NM_2080_1) — ward-level SOC groups
  6. Census 2021 TS059 Hours Worked (NM_2076_1) — ward-level hours bands

Output: burnley-council/data/{council_id}/economy.json

Usage:
    python3 burnley-council/scripts/economy_etl.py                    # All councils
    python3 burnley-council/scripts/economy_etl.py --council burnley   # Single council
    python3 burnley-council/scripts/economy_etl.py --stdout            # Print to stdout
    python3 burnley-council/scripts/economy_etl.py --dry-run           # Show what would be fetched
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
        "district_codes": [
            "E07000117", "E07000118", "E07000119", "E07000120",
            "E07000121", "E07000122", "E07000123", "E07000124",
            "E07000125", "E07000126", "E07000127", "E07000128",
        ],
    },
}

ENGLAND_CODE = "E92000001"

# Census 2021 economy-related datasets on Nomis
# Column names discovered by probing API:
#   Industry: C2021_IND_88_NAME (88 sub-categories, aggregated to SIC sections in code)
#   Occupation: C2021_OCC_10_NAME (0=Total, 1-9 major groups)
#   Hours: C2021_HOURS_5_NAME (0=Total, 1=PT 15h-, 2=PT 16-30h, 3=FT 31-48h, 4=FT 49h+, 1001=PT, 1002=FT)
CENSUS_DATASETS = {
    "industry": {
        "id": "NM_2077_1",
        "cat_col": "C2021_IND_88_NAME",
        "values": None,  # Fetch all, aggregate in code
    },
    "occupation": {
        "id": "NM_2080_1",
        "cat_col": "C2021_OCC_10_NAME",
        "values": "1,2,3,4,5,6,7,8,9",  # Exclude 0 (Total)
    },
    "hours_worked": {
        "id": "NM_2076_1",
        "cat_col": "C2021_HOURS_5_NAME",
        "values": "1001,1002",  # Part-time aggregate + Full-time aggregate
    },
}

# SIC 2007 division-to-section mapping (88 divisions → 21 sections)
SIC_SECTION_MAP = {
    "01": "A", "02": "A", "03": "A",
    "05": "B", "06": "B", "07": "B", "08": "B", "09": "B",
    "10": "C", "11": "C", "12": "C", "13": "C", "14": "C", "15": "C",
    "16": "C", "17": "C", "18": "C", "19": "C", "20": "C", "21": "C",
    "22": "C", "23": "C", "24": "C", "25": "C", "26": "C", "27": "C",
    "28": "C", "29": "C", "30": "C", "31": "C", "32": "C", "33": "C",
    "35": "D",
    "36": "E", "37": "E", "38": "E", "39": "E",
    "41": "F", "42": "F", "43": "F",
    "45": "G", "46": "G", "47": "G",
    "49": "H", "50": "H", "51": "H", "52": "H", "53": "H",
    "55": "I", "56": "I",
    "58": "J", "59": "J", "60": "J", "61": "J", "62": "J", "63": "J",
    "64": "K", "65": "K", "66": "K",
    "68": "L",
    "69": "M", "70": "M", "71": "M", "72": "M", "73": "M", "74": "M", "75": "M",
    "77": "N", "78": "N", "79": "N", "80": "N", "81": "N", "82": "N",
    "84": "O",
    "85": "P",
    "86": "Q", "87": "Q", "88": "Q",
    "90": "R", "91": "R", "92": "R", "93": "R",
    "94": "S", "95": "S", "96": "S",
    "97": "T", "98": "T",
}

SIC_SECTION_NAMES = {
    "A": "Agriculture, forestry & fishing",
    "B": "Mining & quarrying",
    "C": "Manufacturing",
    "D": "Electricity & gas supply",
    "E": "Water supply & waste",
    "F": "Construction",
    "G": "Wholesale & retail trade",
    "H": "Transport & storage",
    "I": "Accommodation & food",
    "J": "Information & communication",
    "K": "Financial & insurance",
    "L": "Real estate",
    "M": "Professional & scientific",
    "N": "Administrative & support",
    "O": "Public administration & defence",
    "P": "Education",
    "Q": "Health & social work",
    "R": "Arts, entertainment & recreation",
    "S": "Other services",
    "T": "Household activities",
}


def api_fetch(url, desc="data", as_json=False):
    """Fetch from API with retry."""
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "AI-DOGE-Economy-ETL/1.0",
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


def nomis_fetch_csv(url, desc="data"):
    """Fetch CSV from Nomis API with retry. Returns list of dicts."""
    text = api_fetch(url, desc)
    reader = csv.DictReader(io.StringIO(text))
    return list(reader)


def _float(v):
    """Safe float conversion."""
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _int(v):
    """Safe int conversion."""
    if v is None or v == "":
        return None
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return None


def fetch_claimant_count(ons_code, is_county=False, district_codes=None):
    """Fetch claimant count from NM_162_1.

    Two separate fetches:
    1. LA-level (borough) history — 12 months, count + rate (always available)
    2. Ward-level latest month — breakdown by ward (only latest has data)

    Returns latest month + 12-month history + ward breakdown.
    """
    from datetime import datetime as dt
    from datetime import timedelta

    print("  Fetching claimant count...", file=sys.stderr)

    # Build explicit time range (last 12 months as YYYY-MM)
    now = dt.now()
    time_values = [(now - timedelta(days=30 * i)).strftime("%Y-%m") for i in range(12)]
    time_str = ",".join(time_values)

    # --- Part 1: LA-level history (borough aggregate, 12 months) ---
    la_geo = ons_code
    if is_county and district_codes:
        la_geo = ",".join(district_codes)

    la_url = (
        f"{NOMIS_BASE}/dataset/NM_162_1.data.csv"
        f"?geography={la_geo}"
        f"&gender=0&age=0&measure=1,2&measures=20100"
        f"&time={time_str}"
    )

    history = []
    latest_date = None
    latest_count = 0
    latest_rate = None

    try:
        la_rows = nomis_fetch_csv(la_url, "claimant count LA")
        by_date = {}
        for row in la_rows:
            date_code = row.get("DATE_CODE", "")
            date_name = row.get("DATE_NAME", "")
            measure = row.get("MEASURE", "")
            val = _float(row.get("OBS_VALUE"))
            if val is None or not date_code:
                continue
            if date_code not in by_date:
                by_date[date_code] = {"date": date_code, "month": date_name, "count": 0, "rate_pct": None}
            if measure == "1":
                by_date[date_code]["count"] += int(val)
            elif measure == "2":
                # For county, average rates across districts
                if by_date[date_code]["rate_pct"] is None:
                    by_date[date_code]["rate_pct"] = round(val, 1)
                elif not is_county:
                    by_date[date_code]["rate_pct"] = round(val, 1)

        history = sorted(by_date.values(), key=lambda x: x["date"])
        if history:
            latest_date = history[-1]["date"]
            latest_count = history[-1]["count"]
            latest_rate = history[-1].get("rate_pct")
    except Exception as e:
        print(f"  x Claimant count LA history failed: {e}", file=sys.stderr)

    # --- Part 2: Ward-level latest month only ---
    time.sleep(0.3)
    if is_county and district_codes:
        ward_geo = ",".join(f"{dc}TYPE182" for dc in district_codes)
    else:
        ward_geo = f"{ons_code}TYPE182"

    # Only fetch latest month for wards (older months return empty values)
    ward_time = time_values[0]  # Latest month only

    ward_url = (
        f"{NOMIS_BASE}/dataset/NM_162_1.data.csv"
        f"?geography={ward_geo}"
        f"&gender=0&age=0&measure=1,2&measures=20100"
        f"&time={ward_time}"
    )

    wards = {}
    try:
        ward_rows = nomis_fetch_csv(ward_url, "claimant count wards")
        ward_data = {}
        for row in ward_rows:
            geo_code = row.get("GEOGRAPHY_CODE", "")
            geo_name = row.get("GEOGRAPHY_NAME", "")
            measure = row.get("MEASURE", "")
            val = _float(row.get("OBS_VALUE"))
            if val is None or not geo_code:
                continue
            if geo_code not in ward_data:
                ward_data[geo_code] = {"name": geo_name}
            if measure == "1":
                ward_data[geo_code]["count"] = int(val)
            elif measure == "2":
                ward_data[geo_code]["rate_pct"] = round(val, 1)

        for geo_code, winfo in ward_data.items():
            if winfo.get("count") is not None:
                wards[geo_code] = winfo
    except Exception as e:
        print(f"  x Claimant count ward breakdown failed: {e}", file=sys.stderr)

    if not history and not wards:
        return None

    print(f"  + Claimant count: {len(history)} months, {len(wards)} wards", file=sys.stderr)

    return {
        "latest": {
            "date": latest_date or ward_time,
            "month": history[-1].get("month", "") if history else "",
            "count": latest_count,
            "rate_pct": latest_rate,
        },
        "history": history,
        "wards": wards,
    }


def fetch_ashe_earnings(ons_code):
    """Fetch ASHE median earnings from NM_30_1 (LA level).

    Returns median weekly + annual pay with England comparison.
    """
    print("  Fetching ASHE earnings...", file=sys.stderr)

    # ASHE pay codes (confirmed by probing):
    #   pay=1 → "Weekly pay - gross"
    #   pay=7 → "Annual pay - gross"
    # item=2 (median), sex=8 (total)
    url_weekly = (
        f"{NOMIS_BASE}/dataset/NM_30_1.data.csv"
        f"?geography={ons_code}"
        f"&pay=1&item=2&sex=8"
        f"&measures=20100"
        f"&time=latest"
    )
    url_annual = (
        f"{NOMIS_BASE}/dataset/NM_30_1.data.csv"
        f"?geography={ons_code}"
        f"&pay=7&item=2&sex=8"
        f"&measures=20100"
        f"&time=latest"
    )
    url_eng_weekly = (
        f"{NOMIS_BASE}/dataset/NM_30_1.data.csv"
        f"?geography={ENGLAND_CODE}"
        f"&pay=1&item=2&sex=8"
        f"&measures=20100"
        f"&time=latest"
    )

    result = {}
    try:
        rows = nomis_fetch_csv(url_weekly, "ASHE weekly pay")
        if rows:
            val = _float(rows[0].get("OBS_VALUE"))
            if val:
                result["median_weekly_pay"] = round(val, 1)
                result["year"] = rows[0].get("DATE_NAME", "")
        time.sleep(0.3)

        rows = nomis_fetch_csv(url_annual, "ASHE annual pay")
        if rows:
            val = _float(rows[0].get("OBS_VALUE"))
            if val:
                result["median_annual_pay"] = round(val, 0)
        time.sleep(0.3)

        rows = nomis_fetch_csv(url_eng_weekly, "ASHE England weekly")
        if rows:
            val = _float(rows[0].get("OBS_VALUE"))
            if val:
                result["england_median_weekly"] = round(val, 1)

        if result.get("median_weekly_pay"):
            print(f"  + ASHE: £{result['median_weekly_pay']}/week ({result.get('year', '')})", file=sys.stderr)
        else:
            print("  - ASHE: no data returned", file=sys.stderr)
    except Exception as e:
        print(f"  x ASHE failed: {e}", file=sys.stderr)

    return result if result.get("median_weekly_pay") else None


def fetch_gdhi(ons_code):
    """Fetch Gross Disposable Household Income from NM_185_1 (LA level)."""
    print("  Fetching GDHI...", file=sys.stderr)

    url = (
        f"{NOMIS_BASE}/dataset/NM_185_1.data.csv"
        f"?geography={ons_code}"
        f"&item=3"  # Per head
        f"&measures=20100"
        f"&time=latest"
    )
    url_eng = (
        f"{NOMIS_BASE}/dataset/NM_185_1.data.csv"
        f"?geography={ENGLAND_CODE}"
        f"&item=3"
        f"&measures=20100"
        f"&time=latest"
    )

    result = {}
    try:
        rows = nomis_fetch_csv(url, "GDHI")
        if rows:
            val = _float(rows[0].get("OBS_VALUE"))
            if val:
                result["per_head"] = round(val, 0)
                result["year"] = rows[0].get("DATE_NAME", "")
        time.sleep(0.3)

        rows = nomis_fetch_csv(url_eng, "GDHI England")
        if rows:
            val = _float(rows[0].get("OBS_VALUE"))
            if val:
                result["england_per_head"] = round(val, 0)
                if result.get("per_head"):
                    result["index"] = round(result["per_head"] / val * 100, 1)

        if result.get("per_head"):
            print(f"  + GDHI: £{result['per_head']:,.0f}/head ({result.get('year', '')})", file=sys.stderr)
        else:
            print("  - GDHI: no data returned", file=sys.stderr)
    except Exception as e:
        print(f"  x GDHI failed: {e}", file=sys.stderr)

    return result if result.get("per_head") else None


def fetch_census_topic(dataset_id, geography, cat_col, values=None):
    """Fetch Census data as CSV. Returns parsed rows."""
    params = {"geography": geography, "measures": "20100"}
    if values:
        dim = cat_col.rsplit("_NAME", 1)[0].lower()
        params[dim] = values
    url = f"{NOMIS_BASE}/dataset/{dataset_id}.data.csv?{urllib.parse.urlencode(params)}"
    return nomis_fetch_csv(url, f"{dataset_id} for {geography}")


def parse_census_rows(rows, cat_col, aggregate_industry=False):
    """Parse Nomis CSV rows into ward-level dict of category counts.

    If aggregate_industry=True, maps 88 SIC division categories to 21 SIC section names.
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

        if aggregate_industry and cat_col == "C2021_IND_88_NAME":
            # Extract SIC division code (first 2 digits) from category name
            div_code = category[:2].strip()
            section = SIC_SECTION_MAP.get(div_code)
            if not section:
                continue  # Skip "Total" and unmapped categories
            category = SIC_SECTION_NAMES.get(section, f"Section {section}")

        if geo_code not in result:
            result[geo_code] = {"name": geo_name, "categories": {}}
        # Aggregate (for industry, multiple divisions map to same section)
        result[geo_code]["categories"][category] = (
            result[geo_code]["categories"].get(category, 0) + value
        )
    return result


def compute_summary(census_totals, claimant, earnings, gdhi):
    """Compute high-level summary stats."""
    summary = {}

    # Claimant count
    if claimant and claimant.get("latest"):
        summary["claimant_count"] = claimant["latest"].get("count", 0)
        rate = claimant["latest"].get("rate_pct")
        if rate is not None:
            summary["claimant_rate_pct"] = rate
        # Compute trend
        hist = claimant.get("history", [])
        if len(hist) >= 2:
            latest_count = hist[-1].get("count", 0)
            prev_count = hist[-2].get("count", 0)
            if prev_count > 0:
                change = (latest_count - prev_count) / prev_count * 100
                if change > 2:
                    summary["claimant_trend"] = "rising"
                elif change < -2:
                    summary["claimant_trend"] = "falling"
                else:
                    summary["claimant_trend"] = "stable"

    # Earnings
    if earnings:
        if earnings.get("median_weekly_pay"):
            summary["median_weekly_pay"] = earnings["median_weekly_pay"]
        if earnings.get("median_annual_pay"):
            summary["median_annual_pay"] = earnings["median_annual_pay"]

    # GDHI
    if gdhi:
        if gdhi.get("per_head"):
            summary["gdhi_per_head"] = gdhi["per_head"]
        if gdhi.get("index"):
            summary["gdhi_index"] = gdhi["index"]

    # Census: top industry
    ind = census_totals.get("industry", {})
    if ind:
        total = sum(v for v in ind.values() if isinstance(v, int))
        if total:
            top = max((v, k) for k, v in ind.items() if isinstance(v, int))
            summary["top_industry"] = top[1]
            summary["top_industry_pct"] = round(top[0] / total * 100, 1)

    # Census: occupation — professional %
    occ = census_totals.get("occupation", {})
    if occ:
        total = sum(v for v in occ.values() if isinstance(v, int))
        if total:
            prof = 0
            for k, v in occ.items():
                if not isinstance(v, int):
                    continue
                kl = k.lower()
                if "professional" in kl or "manager" in kl:
                    prof += v
            summary["professional_pct"] = round(prof / total * 100, 1)

    # Census: hours — part-time %
    hrs = census_totals.get("hours_worked", {})
    if hrs:
        total = sum(v for v in hrs.values() if isinstance(v, int))
        if total:
            pt = 0
            for k, v in hrs.items():
                if not isinstance(v, int):
                    continue
                kl = k.lower()
                if "part" in kl or "15" in kl or "30" in kl:
                    pt += v
            summary["part_time_pct"] = round(pt / total * 100, 1)

    return summary


def build_economy_data(council_id, council_info):
    """Build full economy JSON for one council."""
    ons = council_info["ons"]
    name = council_info["name"]
    is_county = council_info.get("type") == "county"
    district_codes = council_info.get("district_codes", [])
    print(f"\nProcessing {name} ({ons})...", file=sys.stderr)

    economy = {
        "meta": {
            "source": "Nomis (Claimant Count + ASHE + GDHI + Census 2021)",
            "council_id": council_id,
            "council_name": name,
            "ons_code": ons,
            "census_date": "2021-03-21",
            "generated": time.strftime("%Y-%m-%dT%H:%M:%S"),
        },
        "claimant_count": None,
        "earnings": None,
        "gdhi": None,
        "census": {
            "council_totals": {},
            "wards": {},
        },
        "summary": {},
    }

    # 1. Claimant count (ward level)
    time.sleep(0.5)
    economy["claimant_count"] = fetch_claimant_count(ons, is_county, district_codes)

    # 2. ASHE earnings (LA level)
    time.sleep(0.5)
    economy["earnings"] = fetch_ashe_earnings(ons)

    # 3. GDHI (LA level) — Nomis NM_185_1 doesn't support district-level queries
    # GDHI data not available via Nomis for individual districts; skip for now
    # economy["gdhi"] = fetch_gdhi(ons)

    # 4. Census topics (ward level)
    for topic, ds in CENSUS_DATASETS.items():
        print(f"  Fetching Census {topic}...", file=sys.stderr)
        time.sleep(0.5)

        agg = topic == "industry"  # Aggregate 88 SIC divisions to 21 sections
        try:
            if is_county and district_codes:
                ward_parsed = {}
                for dc in district_codes:
                    time.sleep(0.3)
                    rows = fetch_census_topic(ds["id"], f"{dc}TYPE153", ds["cat_col"], ds.get("values"))
                    parsed = parse_census_rows(rows, ds["cat_col"], aggregate_industry=agg)
                    # Merge ward_parsed (aggregation needs careful merge)
                    for wc, wi in parsed.items():
                        if wc not in ward_parsed:
                            ward_parsed[wc] = wi
                        else:
                            for cat, val in wi["categories"].items():
                                ward_parsed[wc]["categories"][cat] = ward_parsed[wc]["categories"].get(cat, 0) + val
            else:
                ward_rows = fetch_census_topic(ds["id"], f"{ons}TYPE153", ds["cat_col"], ds.get("values"))
                ward_parsed = parse_census_rows(ward_rows, ds["cat_col"], aggregate_industry=agg)

            for ward_code, ward_info in ward_parsed.items():
                if ward_code not in economy["census"]["wards"]:
                    economy["census"]["wards"][ward_code] = {"name": ward_info["name"]}
                economy["census"]["wards"][ward_code][topic] = ward_info["categories"]

            # LA-level totals
            la_rows = fetch_census_topic(ds["id"], ons, ds["cat_col"], ds.get("values"))
            la_parsed = parse_census_rows(la_rows, ds["cat_col"], aggregate_industry=agg)
            if la_parsed:
                la_entry = next(iter(la_parsed.values()), {})
                economy["census"]["council_totals"][topic] = la_entry.get("categories", {})

            print(f"  + {topic}: {len(ward_parsed)} wards", file=sys.stderr)

        except Exception as e:
            print(f"  x {topic} failed: {e}", file=sys.stderr)
            economy["census"]["council_totals"][topic] = {"error": str(e)}

    # 5. Compute summary
    economy["summary"] = compute_summary(
        economy["census"]["council_totals"],
        economy["claimant_count"],
        economy["earnings"],
        economy["gdhi"],
    )

    return economy


def main():
    import argparse
    parser = argparse.ArgumentParser(
        description="Fetch economy data from Nomis (Claimant Count + ASHE + GDHI + Census 2021)"
    )
    parser.add_argument("--council", help="Single council ID (default: all)")
    parser.add_argument("--stdout", action="store_true", help="Print to stdout only")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be fetched")
    args = parser.parse_args()

    targets = {args.council: COUNCILS[args.council]} if args.council else COUNCILS

    if args.dry_run:
        for cid, info in targets.items():
            print(f"Would fetch economy data for {info['name']} ({info['ons']})")
            print(f"  - Claimant Count: NM_162_1 (ward, latest 12 months)")
            print(f"  - ASHE Earnings: NM_30_1 (LA, latest)")
            print(f"  - GDHI: NM_185_1 (LA, latest)")
            for topic, ds in CENSUS_DATASETS.items():
                print(f"  - Census {topic}: dataset {ds['id']}")
        return

    for council_id, council_info in targets.items():
        economy = build_economy_data(council_id, council_info)

        output = json.dumps(economy, indent=2, ensure_ascii=False)

        if args.stdout:
            print(output)
        else:
            out_path = DATA_DIR / council_id / "economy.json"
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(output, encoding="utf-8")
            print(f"  Written: {out_path}", file=sys.stderr)

    print("\nDone.", file=sys.stderr)


if __name__ == "__main__":
    main()
