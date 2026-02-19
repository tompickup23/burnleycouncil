#!/usr/bin/env python3
"""
collection_rates_etl.py — Council Tax Collection Rate Parser

Downloads and parses QRC4 Table 6 ODS files from GOV.UK containing per-authority
council tax collection rates. Table 6 covers 2 years per release (current + previous),
so multiple releases are downloaded to build a 5-year time series.

Only billing authorities collect council tax:
  - 12 Lancashire districts (SD class)
  - 2 unitaries: Blackpool, Blackburn with Darwen (UA class)
  - Lancashire CC is NOT a billing authority (excluded)

Usage:
    python collection_rates_etl.py
    python collection_rates_etl.py --download
    python collection_rates_etl.py --council burnley
    python collection_rates_etl.py --all
"""

import argparse
import json
import os
import sys
from pathlib import Path

try:
    import pandas as pd
    HAS_PANDAS = True
    # Monkey-patch pandas ODF reader to handle "error" cell types
    try:
        from pandas.io.excel._odfreader import ODFReader
        _orig_get_cell_value = ODFReader._get_cell_value
        def _patched_get_cell_value(self, cell):
            from odf.namespaces import OFFICENS
            cell_type = cell.attributes.get((OFFICENS, "value-type"))
            if cell_type == "error":
                return float("nan")
            return _orig_get_cell_value(self, cell)
        ODFReader._get_cell_value = _patched_get_cell_value
    except Exception:
        pass
except ImportError:
    HAS_PANDAS = False

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# ─── Paths ───────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
CACHE_DIR = DATA_DIR / "govuk_collection_rates"

# ─── Constants ───────────────────────────────────────────────────────

# ONS codes for Lancashire billing authorities (no county council)
LANCASHIRE_BILLING = {
    "burnley":          {"ons": "E07000117", "name": "Burnley", "type": "district"},
    "hyndburn":         {"ons": "E07000120", "name": "Hyndburn", "type": "district"},
    "pendle":           {"ons": "E07000122", "name": "Pendle", "type": "district"},
    "rossendale":       {"ons": "E07000125", "name": "Rossendale", "type": "district"},
    "ribble_valley":    {"ons": "E07000124", "name": "Ribble Valley", "type": "district"},
    "south_ribble":     {"ons": "E07000126", "name": "South Ribble", "type": "district"},
    "chorley":          {"ons": "E07000118", "name": "Chorley", "type": "district"},
    "west_lancashire":  {"ons": "E07000127", "name": "West Lancashire", "type": "district"},
    "fylde":            {"ons": "E07000119", "name": "Fylde", "type": "district"},
    "wyre":             {"ons": "E07000128", "name": "Wyre", "type": "district"},
    "lancaster":        {"ons": "E07000121", "name": "Lancaster", "type": "district"},
    "preston":          {"ons": "E07000123", "name": "Preston", "type": "district"},
    "blackburn":        {"ons": "E06000008", "name": "Blackburn with Darwen", "type": "unitary"},
    "blackpool":        {"ons": "E06000009", "name": "Blackpool", "type": "unitary"},
}

# Build reverse lookups
ONS_TO_COUNCIL = {v["ons"]: k for k, v in LANCASHIRE_BILLING.items()}

# E-codes (MHCLG/DLUHC identifiers) for Lancashire billing authorities
# Used in older XLSX files that don't have ONS codes
ECODE_TO_COUNCIL = {
    "E2333": "burnley",
    "E2336": "hyndburn",
    "E2338": "pendle",
    "E2341": "rossendale",
    "E2340": "ribble_valley",
    "E2342": "south_ribble",
    "E2334": "chorley",
    "E2343": "west_lancashire",
    "E2335": "fylde",
    "E2344": "wyre",
    "E2337": "lancaster",
    "E2339": "preston",
    "E2301": "blackburn",
    "E2302": "blackpool",
}
# Authority name → council ID (for matching when no code column)
NAME_TO_COUNCIL = {v["name"]: k for k, v in LANCASHIRE_BILLING.items()}

# Table 6 ODS download URLs by financial year
# Each release covers 2 years: current + previous
# URLs are opaque (not predictable) — hardcoded from GOV.UK
TABLE_6_URLS = {
    "2024-25": "https://assets.publishing.service.gov.uk/media/688a0be6a11f859994409237/Table_6_Council_Tax_and_non-domestic_rates_-_collection_amounts_and_rates__2023-24_and_2024-25.ods",
    "2022-23": "https://assets.publishing.service.gov.uk/media/66ea9df39975b7a980b304ab/Table_6_Council_Tax_and_non-domestic_rates_-_collection_amounts_and_rates__2021-22_and_2022-23.ods",
    "2021-22": "https://assets.publishing.service.gov.uk/media/633ae710e90e071e53e98d81/Table_6_-_Council_Tax_and_non-domestic_rates_-_collection_amounts_and_rates__2020-21_and_2021-22.xlsx",
    "2020-21": "https://assets.publishing.service.gov.uk/media/616014a2d3bf7f56077ce603/Table_6_2020-21_-_revised.xlsx",
}

# Table 9 (QRC4 raw data) — more detail per year
TABLE_9_URLS = {
    "2024-25": "https://assets.publishing.service.gov.uk/media/688a0c16e1a850d72c40920a/Table_9_Quarterly_return_of_Council_Tax_and_non-domestic_rates_QRC4__2024_to_2025.ods",
}


def safe_float(val):
    """Safely convert a value to float, returning None on failure."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    try:
        return round(float(val), 2)
    except (ValueError, TypeError):
        return None


def download_file(url, dest_path):
    """Download a file from URL to local path."""
    if not HAS_REQUESTS:
        print("ERROR: requests library not installed. Run: pip install requests")
        sys.exit(1)

    print(f"  Downloading {dest_path.name}...")
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    dest_path.write_bytes(resp.content)
    print(f"  → {len(resp.content):,} bytes saved")


def download_all(force=False):
    """Download all Table 6 files (ODS or XLSX)."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    for year, url in sorted(TABLE_6_URLS.items()):
        ext = "xlsx" if url.endswith(".xlsx") else "ods"
        dest = CACHE_DIR / f"table_6_{year}.{ext}"
        if dest.exists() and not force:
            print(f"  {dest.name} already cached")
            continue
        download_file(url, dest)

    # Also download Table 9 for the latest year (more detail)
    for year, url in sorted(TABLE_9_URLS.items()):
        ext = "xlsx" if url.endswith(".xlsx") else "ods"
        dest = CACHE_DIR / f"table_9_{year}.{ext}"
        if dest.exists() and not force:
            print(f"  {dest.name} already cached")
            continue
        download_file(url, dest)


def _identify_council(row, df_cols):
    """
    Identify a Lancashire council from a data row.
    Returns (council_id, ons_code, authority_name) or (None, None, None).
    Handles both ODS format (ONS codes like E07000117) and XLSX format (E-codes like E2333).
    """
    # Try ONS code first (ODS format: 9-char codes)
    for col in range(min(5, df_cols)):
        val = str(row.iloc[col]).strip()
        if val.startswith("E0") and len(val) == 9 and val in ONS_TO_COUNCIL:
            cid = ONS_TO_COUNCIL[val]
            name = str(row.iloc[0]).strip() if pd.notna(row.iloc[0]) else ""
            return cid, val, name

    # Try E-code (XLSX format: short codes like E2333)
    for col in range(min(5, df_cols)):
        val = str(row.iloc[col]).strip()
        if val.startswith("E") and 4 <= len(val) <= 5 and val in ECODE_TO_COUNCIL:
            cid = ECODE_TO_COUNCIL[val]
            ons = LANCASHIRE_BILLING[cid]["ons"]
            # Name is usually in col 1 for XLSX "Data" sheet
            name = str(row.iloc[1]).strip() if df_cols > 1 and pd.notna(row.iloc[1]) else ""
            return cid, ons, name

    # Try name match as last resort
    for col in range(min(3, df_cols)):
        val = str(row.iloc[col]).strip()
        if val in NAME_TO_COUNCIL:
            cid = NAME_TO_COUNCIL[val]
            ons = LANCASHIRE_BILLING[cid]["ons"]
            return cid, ons, val

    return None, None, None


def parse_table_6(file_path, year_label):
    """
    Parse Table 6 (Council Tax collection rates) from an ODS or XLSX file.
    Returns dict: {ons_code: {"name": str, "years": {year: {rate, collectable, collected}}}}

    Two formats exist:
      ODS (2022-23+): Sheet "Table_6a", cols 0-4 = authority info, 5-7 = prev year, 8-10 = curr year
      XLSX (pre-2022): Sheet "Data", cols 0-3 = authority info, 4-6 = prev year CT, 8-10 = curr year CT
    """
    if not HAS_PANDAS:
        print("ERROR: pandas + odfpy required. Run: pip install pandas odfpy")
        sys.exit(1)

    print(f"  Parsing {file_path.name}...")

    engine = "openpyxl" if file_path.suffix == ".xlsx" else "odf"
    is_xlsx = file_path.suffix == ".xlsx"

    # Try different sheet names
    sheet_names_to_try = ["Table_6a", "Table 6a", "Data", "Table_6", "Table 6"]
    df = None
    used_sheet = None
    for sheet in sheet_names_to_try:
        try:
            df = pd.read_excel(file_path, engine=engine, sheet_name=sheet, header=None)
            used_sheet = sheet
            break
        except (ValueError, KeyError):
            continue

    if df is None:
        try:
            xls = pd.ExcelFile(file_path, engine=engine)
            print(f"  WARNING: Could not find council tax sheet. Available: {xls.sheet_names}")
        except Exception as e:
            print(f"  WARNING: Could not open {file_path.name}: {e}")
        return {}

    results = {}

    # Determine year labels
    parts = year_label.split("-")
    curr_start = int(parts[0])
    curr_end = int(parts[1])
    prev_start = curr_start - 1
    prev_end = curr_end - 1
    current_year = f"{curr_start}-{curr_end:02d}"
    previous_year = f"{prev_start}-{prev_end:02d}"

    # Find first data row containing a recognizable authority code
    # ODS: ONS codes (E07xxxxxx) start at ~row 10, XLSX: E-codes (E2333) start at ~row 12
    # Scan all rows since Lancashire councils are mid-alphabetical
    data_start = None
    for i in range(len(df)):
        row = df.iloc[i]
        for col in range(min(5, df.shape[1])):
            val = str(row.iloc[col]).strip()
            # ODS format: ONS code (9 chars starting with E0)
            if val.startswith("E0") and len(val) == 9:
                data_start = i
                break
            # XLSX format: E-code (4-5 chars starting with E, all digits after)
            if val.startswith("E") and 4 <= len(val) <= 5 and val[1:].isdigit():
                data_start = i
                break
        if data_start is not None:
            break

    if data_start is None:
        print(f"  WARNING: Could not find data start in {file_path.name} (sheet: {used_sheet})")
        return {}

    # Detect column layout from the first data row
    # ODS Table_6a: authority(0), e-code(1), ons(2), class(3), region(4), prev_coll(5), prev_col(6), prev_rate(7), curr_coll(8), curr_col(9), curr_rate(10)
    # XLSX Data: index(0), name(1), e-code(2), class(3), prev_coll(4), prev_col(5), prev_rate(6), [gap](7), curr_coll(8), curr_col(9), curr_rate(10)
    if is_xlsx and used_sheet == "Data":
        # XLSX "Data" sheet: CT data in cols 4-6 (prev) and 8-10 (curr)
        prev_cols = (4, 5, 6)
        curr_cols = (8, 9, 10)
    else:
        # ODS Table_6a: CT data in cols 5-7 (prev) and 8-10 (curr)
        prev_cols = (5, 6, 7)
        curr_cols = (8, 9, 10)

    print(f"  → Sheet: {used_sheet}, format: {'XLSX' if is_xlsx else 'ODS'}")
    print(f"  → Years: {previous_year} (cols {prev_cols}), {current_year} (cols {curr_cols})")

    # Parse data rows
    for i in range(data_start, len(df)):
        row = df.iloc[i]
        cid, ons_code, authority_name = _identify_council(row, df.shape[1])
        if cid is None:
            continue

        # Extract previous year data
        prev_collectable = safe_float(row.iloc[prev_cols[0]]) if df.shape[1] > prev_cols[0] else None
        prev_collected = safe_float(row.iloc[prev_cols[1]]) if df.shape[1] > prev_cols[1] else None
        prev_rate = safe_float(row.iloc[prev_cols[2]]) if df.shape[1] > prev_cols[2] else None

        # Extract current year data
        curr_collectable = safe_float(row.iloc[curr_cols[0]]) if df.shape[1] > curr_cols[0] else None
        curr_collected = safe_float(row.iloc[curr_cols[1]]) if df.shape[1] > curr_cols[1] else None
        curr_rate = safe_float(row.iloc[curr_cols[2]]) if df.shape[1] > curr_cols[2] else None

        if ons_code not in results:
            results[ons_code] = {"name": authority_name, "years": {}}

        if prev_rate is not None:
            results[ons_code]["years"][previous_year] = {
                "collection_rate_pct": prev_rate,
                "net_collectable_thousands": prev_collectable,
                "collected_thousands": prev_collected,
            }

        if curr_rate is not None:
            results[ons_code]["years"][current_year] = {
                "collection_rate_pct": curr_rate,
                "net_collectable_thousands": curr_collectable,
                "collected_thousands": curr_collected,
            }

    print(f"  → Found {len(results)} Lancashire authorities")
    return results


def parse_table_9(file_path):
    """
    Parse Table 9a (QRC4 raw data) for additional detail on the latest year.
    Returns dict: {ons_code: {arrears, write_offs, quarterly_breakdown, ...}}
    """
    if not HAS_PANDAS:
        return {}

    print(f"  Parsing {file_path.name} (detailed QRC4)...")

    engine = "openpyxl" if file_path.suffix == ".xlsx" else "odf"
    sheet_names_to_try = ["Table_9a", "Table 9a", "Table_9", "Table 9"]
    df = None
    for sheet in sheet_names_to_try:
        try:
            df = pd.read_excel(file_path, engine=engine, sheet_name=sheet, header=None)
            break
        except (ValueError, KeyError):
            continue

    if df is None:
        print(f"  WARNING: Could not find Table 9a sheet")
        return {}

    results = {}

    # Find header row
    header_row = None
    for i in range(min(10, len(df))):
        row_vals = [str(v).strip().lower() for v in df.iloc[i] if pd.notna(v)]
        if any("ons" in v for v in row_vals):
            header_row = i
            break

    if header_row is None:
        return {}

    # Find first data row with ONS code
    data_start = None
    for i in range(header_row + 1, min(header_row + 15, len(df))):
        for col in range(min(5, df.shape[1])):
            val = str(df.iloc[i, col]).strip()
            if val.startswith("E0") and len(val) == 9:
                data_start = i
                break
        if data_start is not None:
            break

    if data_start is None:
        return {}

    for i in range(data_start, len(df)):
        row = df.iloc[i]

        ons_code = None
        for col in range(min(5, df.shape[1])):
            val = str(row.iloc[col]).strip()
            if val.startswith("E0") and len(val) == 9:
                ons_code = val
                break

        if ons_code is None or ons_code not in ONS_TO_COUNCIL:
            continue

        # Table 9a columns (0-indexed from research):
        # 5: Line 1 - Net collectable debit
        # 9: Line 5 - In-year collection rate
        # 13-16: Lines 9-12 - Quarterly receipts (Q1-Q4)
        # 17: Line 13 - Arrears brought forward
        # 24: Line 20 - Total arrears at year-end
        # 28: Line 22 - In-year write-offs
        # 31: Line 25 - Court/admin costs
        detail = {}
        if df.shape[1] > 17:
            detail["arrears_brought_forward_thousands"] = safe_float(row.iloc[17])
        if df.shape[1] > 24:
            detail["total_arrears_thousands"] = safe_float(row.iloc[24])
        if df.shape[1] > 28:
            detail["in_year_write_offs_thousands"] = safe_float(row.iloc[28])
        if df.shape[1] > 31:
            detail["court_costs_thousands"] = safe_float(row.iloc[31])

        # Quarterly breakdown
        quarterly = {}
        if df.shape[1] > 13:
            quarterly["q1_apr_jun"] = safe_float(row.iloc[13])
        if df.shape[1] > 14:
            quarterly["q2_jul_sep"] = safe_float(row.iloc[14])
        if df.shape[1] > 15:
            quarterly["q3_oct_dec"] = safe_float(row.iloc[15])
        if df.shape[1] > 16:
            quarterly["q4_jan_mar"] = safe_float(row.iloc[16])
        if any(v is not None for v in quarterly.values()):
            detail["quarterly_receipts_thousands"] = quarterly

        if detail:
            results[ons_code] = detail

    print(f"  → Found detailed data for {len(results)} Lancashire authorities")
    return results


def build_collection_rates(council_id=None):
    """
    Build collection rates JSON for one or all Lancashire billing councils.
    """
    # Merge data from all Table 6 files
    all_data = {}

    for year_label, url in sorted(TABLE_6_URLS.items()):
        ext = "xlsx" if url.endswith(".xlsx") else "ods"
        file_path = CACHE_DIR / f"table_6_{year_label}.{ext}"
        if not file_path.exists():
            print(f"  WARNING: {file_path.name} not found — run with --download first")
            continue
        year_data = parse_table_6(file_path, year_label)
        for ons_code, info in year_data.items():
            if ons_code not in all_data:
                all_data[ons_code] = {"name": info["name"], "years": {}}
            # Merge years (later files overwrite earlier for same year — fresher data)
            all_data[ons_code]["years"].update(info["years"])

    # Parse Table 9 for latest year detail
    detail_data = {}
    for year_label, url in sorted(TABLE_9_URLS.items()):
        ext = "xlsx" if url.endswith(".xlsx") else "ods"
        file_path = CACHE_DIR / f"table_9_{year_label}.{ext}"
        if file_path.exists():
            detail_data = parse_table_9(file_path)

    # Build per-council output
    councils_to_process = [council_id] if council_id else list(LANCASHIRE_BILLING.keys())

    for cid in councils_to_process:
        if cid not in LANCASHIRE_BILLING:
            print(f"  Skipping {cid} — not a billing authority")
            continue

        ons_code = LANCASHIRE_BILLING[cid]["ons"]
        council_name = LANCASHIRE_BILLING[cid]["name"]
        council_type = LANCASHIRE_BILLING[cid]["type"]

        if ons_code not in all_data:
            print(f"  WARNING: No collection rate data found for {council_name} ({ons_code})")
            continue

        authority = all_data[ons_code]
        years = authority["years"]

        # Sort years chronologically
        sorted_years = sorted(years.keys())

        # Calculate trend and averages
        rates = [years[y]["collection_rate_pct"] for y in sorted_years if years[y].get("collection_rate_pct") is not None]

        avg_rate = round(sum(rates) / len(rates), 2) if rates else None
        latest_rate = rates[-1] if rates else None
        trend = None
        if len(rates) >= 2:
            trend = round(rates[-1] - rates[0], 2)

        # Compute England averages for context (from aggregate rows)
        # These would need to be parsed from Table 6 aggregate rows — for now, use known values
        # 2024-25 England average: 96.0% (shire districts), 94.6% (unitaries), 95.2% (all)

        # Build output
        output = {
            "council_id": cid,
            "council_name": council_name,
            "council_type": council_type,
            "ons_code": ons_code,
            "latest_year": sorted_years[-1] if sorted_years else None,
            "latest_rate": latest_rate,
            "five_year_avg": avg_rate,
            "trend": trend,
            "trend_direction": ("improving" if trend and trend > 0 else "declining" if trend and trend < 0 else "stable"),
            "years": {},
        }

        for year in sorted_years:
            yr = years[year]
            entry = {
                "collection_rate_pct": yr.get("collection_rate_pct"),
                "net_collectable_thousands": yr.get("net_collectable_thousands"),
                "collected_thousands": yr.get("collected_thousands"),
            }
            # Calculate uncollected amount
            if entry["net_collectable_thousands"] and entry["collected_thousands"]:
                entry["uncollected_thousands"] = round(
                    entry["net_collectable_thousands"] - entry["collected_thousands"], 2
                )
                entry["uncollected_gbp"] = round(entry["uncollected_thousands"] * 1000, 0)
            output["years"][year] = entry

        # Add Table 9 detail for latest year
        if ons_code in detail_data:
            output["latest_year_detail"] = detail_data[ons_code]

        # Assess performance
        if latest_rate is not None:
            if latest_rate >= 97:
                output["performance"] = "excellent"
            elif latest_rate >= 95:
                output["performance"] = "good"
            elif latest_rate >= 93:
                output["performance"] = "below_average"
            else:
                output["performance"] = "poor"

        # Write output
        output_dir = DATA_DIR / cid
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / "collection_rates.json"
        with open(output_path, "w") as f:
            json.dump(output, f, indent=2)
        print(f"  ✓ {council_name}: {latest_rate}% ({output.get('performance', '?')}) → {output_path.name}")


def print_summary():
    """Print summary of all Lancashire collection rates."""
    print("\n╔═══════════════════════════════════════════════════════════════╗")
    print("║  Lancashire Council Tax Collection Rates                     ║")
    print("╠═══════════════════════════════════════════════════════════════╣")

    results = []
    for cid, info in sorted(LANCASHIRE_BILLING.items()):
        output_path = DATA_DIR / cid / "collection_rates.json"
        if output_path.exists():
            with open(output_path) as f:
                data = json.load(f)
            results.append((cid, data))

    if not results:
        print("║  No data found. Run with --download first.                  ║")
        print("╚═══════════════════════════════════════════════════════════════╝")
        return

    # Sort by latest rate descending
    results.sort(key=lambda x: x[1].get("latest_rate", 0) or 0, reverse=True)

    for cid, data in results:
        name = data["council_name"][:25].ljust(25)
        rate = f"{data.get('latest_rate', 0):.2f}%".rjust(7)
        trend = data.get("trend", 0) or 0
        trend_str = f"+{trend:.2f}pp" if trend >= 0 else f"{trend:.2f}pp"
        perf = data.get("performance", "?").ljust(12)
        print(f"║  {name} {rate}  {trend_str:>8}  {perf} ║")

    print("╚═══════════════════════════════════════════════════════════════╝")


def main():
    parser = argparse.ArgumentParser(
        description="Council Tax Collection Rate ETL"
    )
    parser.add_argument("--download", action="store_true", help="Download ODS files from GOV.UK")
    parser.add_argument("--force", action="store_true", help="Re-download even if cached")
    parser.add_argument("--council", type=str, help="Process single council (e.g. burnley)")
    parser.add_argument("--all", action="store_true", help="Process all 14 billing authorities")
    parser.add_argument("--summary", action="store_true", help="Print summary table")
    args = parser.parse_args()

    if args.download or args.force:
        print("\n📥 Downloading GOV.UK collection rate data...")
        download_all(force=args.force)

    if args.council or args.all:
        print("\n🔍 Building collection rates...")
        build_collection_rates(council_id=args.council if args.council else None)

    if args.summary:
        print_summary()

    # Default: download + process all + summary
    if not any([args.download, args.force, args.council, args.all, args.summary]):
        print("\n📥 Downloading GOV.UK collection rate data...")
        download_all()
        print("\n🔍 Building collection rates for all Lancashire billing authorities...")
        build_collection_rates()
        print_summary()


if __name__ == "__main__":
    main()
