#!/usr/bin/env python3
"""
govuk_trends.py — Parse MHCLG Revenue & Capital Outturn time series CSVs
for AI DOGE councils (Burnley, Hyndburn, Pendle).

Extracts 8 years of standardised spending data from the GOV.UK published
Revenue Outturn time series CSV and 7 years from the Capital Outturn time
series CSV, then outputs:

  data/{council}/revenue_trends.json   — per-council 8-year revenue trends
  data/{council}/capital_trends.json   — per-council 7-year capital trends
  data/reference/cross_council_comparison.json — side-by-side comparison

The time series CSVs are ~20MB each but contain ALL English councils.
This script extracts only our councils and the columns relevant to
Shire District services (RO4 Housing, RO5 Cultural/Env/Planning, RO6 Central).

Usage:
    python3 govuk_trends.py --data-dir ../data
    python3 govuk_trends.py --data-dir ../data --verbose
"""

import csv
import json
import sys
import argparse
from pathlib import Path
from collections import defaultdict

# ─── Our councils ──────────────────────────────────────────────────
COUNCILS = {
    "E07000117": {"key": "burnley",  "name": "Burnley"},
    "E07000120": {"key": "hyndburn", "name": "Hyndburn"},
    "E07000122": {"key": "pendle",   "name": "Pendle"},
}

# ─── Revenue Outturn columns we care about ─────────────────────────
# Column name in CSV → (human label, category)
# Districts submit: RO4 (Housing), RO5 (Cultural/Env/Planning), RO6 (Central/Other)
# RS = Revenue Summary (all councils)
# Values in the CSV are £ thousands

REVENUE_COLS = {
    # ── RS: Revenue Summary (headline totals) ──
    "RS_hous_net_exp":              ("Housing (GF & HRA)", "summary"),
    "RS_cul_net_exp":               ("Cultural Services", "summary"),
    "RS_env_net_exp":               ("Environmental Services", "summary"),
    "RS_plan_net_exp":              ("Planning & Development", "summary"),
    "RS_cen_net_exp":               ("Central Services", "summary"),
    "RS_oth_net_exp":               ("Other Services", "summary"),
    "RS_netcurrtot_net_exp":        ("Total Net Current Expenditure", "summary"),
    "RS_hbrent_net_exp":            ("HB: Rent Allowances", "summary"),
    "RS_parishaggprecept_net_exp":  ("Parish Precepts", "summary"),
    "RS_levywaste_net_exp":         ("Levy: Waste Disposal", "summary"),
    "RS_levyflood_net_exp":         ("Levy: Flood Defence", "summary"),

    # ── RO4: Housing detail ──
    "RO4_housgfcftot_net_cur_exp":  ("Housing Total (GF+CF)", "housing"),
    "RO4_housgfcfhml_hml_tot_net_cur_exp": ("Homelessness Total", "housing"),
    "RO4_housgfcfstr_hous_str_adv_enb_net_cur_exp": ("Housing Strategy & Advice", "housing"),
    "RO4_housprvsecrnw_adm_rpr_imp_net_cur_exp": ("Private Sector Renewal", "housing"),
    "RO4_housgfcfbnf_rnt_all_dsp_net_cur_exp": ("HB: Rent Allowances Spend", "housing"),
    "RO4_housgfcfwlfspp_net_cur_exp": ("Welfare Services", "housing"),
    "RO4_housgfcfcnc_net_cur_exp":  ("Housing Concierge", "housing"),

    # ── RO5: Cultural services detail ──
    "RO5_cultot_net_cur_exp":       ("Cultural Total", "cultural"),
    "RO5_culspr_frs_net_cur_exp":   ("Sports Facilities", "cultural"),
    "RO5_cultrs_net_cur_exp":       ("Tourism", "cultural"),

    # ── RO5: Environmental services detail ──
    "RO5_envtot_net_cur_exp":       ("Environmental Total", "environmental"),

    # ── RO5: Planning detail ──
    "RO5_plantot_net_cur_exp":      ("Planning Total", "planning"),
    "RO5_culenvplantot_net_cur_exp": ("Cultural+Env+Planning Grand Total", "planning"),

    # ── RO6: Central & Other ──
    "RO6_centot_net_cur_exp":       ("Central Services Total", "central"),
    "RO6_cenothtot_net_cur_exp":    ("Other Services Total", "central"),
    "RO6_poltot_net_cur_exp":       ("Police (levy)", "central"),
    "RO6_frstot_net_cur_exp":       ("Fire & Rescue (levy)", "central"),

    # ── RG: Grants ──
    "RG_granttot_tot_grant":        ("Total Grants (Net)", "grants"),
    "RG_grantintot_tot_grant":      ("Total Grants Received", "grants"),
    "RG_grantouttot_tot_grant":     ("Total Grants Paid Out", "grants"),
}

# ─── Capital Outturn columns ──────────────────────────────────────
# EandR1_*_exptotfa = Total Fixed Asset expenditure by service
CAPITAL_COLS = {
    "EandR1_houstot_exptotfa":    ("Housing Total", "capital"),
    "EandR1_houshratot_exptotfa": ("Housing HRA", "capital"),
    "EandR1_housgfcftot_exptotfa": ("Housing GF+CF", "capital"),
    "EandR1_cultot_exptotfa":     ("Cultural Services", "capital"),
    "EandR1_envtot_exptotfa":     ("Environmental Services", "capital"),
    "EandR1_plantot_exptotfa":    ("Planning & Development", "capital"),
    "EandR1_centot_exptotfa":     ("Central Services", "capital"),
    "EandR1_digtot_exptotfa":     ("Digital Infrastructure", "capital"),
    "EandR1_tradtot_exptotfa":    ("Trading Services", "capital"),
    "EandR1_alltot_exptotfa":     ("Total Capital Expenditure", "capital"),
}


def year_code_to_label(code: str) -> str:
    """Convert '201803' or '2018-03' to '2017-18'."""
    code = code.strip().replace("-", "")
    if len(code) == 6:
        y = int(code[:4])
        return f"{y - 1}-{str(y)[2:]}"
    return code  # fallback


def parse_value(val):
    """Parse a numeric value. Returns None for missing/empty/error."""
    if val is None:
        return None
    val = str(val).strip().strip('"')
    if val in ("", "..", "x", "X", "-", "c", "~", "*"):
        return None
    try:
        return round(float(val.replace(",", "")), 1)
    except (ValueError, TypeError):
        return None


def parse_revenue_csv(csv_path: str, verbose: bool = False) -> dict:
    """
    Parse Revenue Outturn time series CSV.
    Returns: {council_key: {year: {category: {label: value}}, ...}, ...}
    """
    results = defaultdict(dict)
    row_count = 0

    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames

        # Clean header names (strip quotes)
        clean_headers = [h.strip().strip('"') for h in headers]

        for row in reader:
            # Get ONS code — try both quoted and unquoted
            ons = (row.get("ONS_code") or row.get('"ONS_code"') or "").strip().strip('"')
            if ons not in COUNCILS:
                continue

            row_count += 1
            council = COUNCILS[ons]
            year_code = (row.get("year_ending") or row.get('"year_ending"') or "").strip().strip('"')
            year_label = year_code_to_label(year_code)
            status = (row.get("status") or row.get('"status"') or "").strip().strip('"')

            year_data = {"status": status, "services": {}}

            for csv_col, (label, category) in REVENUE_COLS.items():
                # Try with and without quotes
                raw = row.get(csv_col) or row.get(f'"{csv_col}"')
                val = parse_value(raw)
                if val is not None:
                    if category not in year_data["services"]:
                        year_data["services"][category] = {}
                    year_data["services"][category][label] = val

            results[council["key"]][year_label] = year_data

    if verbose:
        print(f"  Revenue: {row_count} council-year rows extracted")

    return dict(results)


def parse_capital_csv(csv_path: str, verbose: bool = False) -> dict:
    """
    Parse Capital Outturn time series CSV.
    Returns: {council_key: {year: {label: value}, ...}, ...}
    """
    results = defaultdict(dict)
    row_count = 0

    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)

        for row in reader:
            ons = (row.get("ONS_Code") or row.get("ONS_code") or
                   row.get('"ONS_Code"') or row.get('"ONS_code"') or "").strip().strip('"')
            if ons not in COUNCILS:
                continue

            row_count += 1
            council = COUNCILS[ons]
            period = (row.get("PeriodCode") or row.get("year_ending") or
                      row.get('"PeriodCode"') or "").strip().strip('"')
            year_label = year_code_to_label(period)

            year_data = {}
            for csv_col, (label, _category) in CAPITAL_COLS.items():
                raw = row.get(csv_col) or row.get(f'"{csv_col}"')
                val = parse_value(raw)
                if val is not None:
                    year_data[label] = val

            if year_data:
                results[council["key"]][year_label] = year_data

    if verbose:
        print(f"  Capital: {row_count} council-year rows extracted")

    return dict(results)


def build_revenue_trends(council_key: str, council_name: str,
                         ons_code: str, revenue_data: dict) -> dict:
    """Build revenue trends JSON for one council."""
    data = revenue_data.get(council_key, {})
    years = sorted(data.keys())

    output = {
        "council": council_name,
        "council_key": council_key,
        "ons_code": ons_code,
        "type": "Shire District",
        "data_source": "MHCLG Revenue Outturn Time Series (GOV.UK)",
        "licence": "Open Government Licence v3.0",
        "units": "£ thousands",
        "years": years,
        "year_count": len(years),
    }

    # Build per-year data
    by_year = {}
    for year in years:
        yd = data[year]
        by_year[year] = {
            "status": yd.get("status", "unknown"),
            **yd.get("services", {}),
        }
    output["by_year"] = by_year

    # Build trends per service line (for charting)
    # {service_label: [{year, value}, ...]}
    trends = defaultdict(list)
    for year in years:
        services = data[year].get("services", {})
        for category, items in services.items():
            for label, val in items.items():
                trends[label].append({"year": year, "value": val})

    output["trends"] = dict(trends)

    # Summary table (key metrics by year)
    summary_labels = [
        "Total Net Current Expenditure",
        "Housing (GF & HRA)",
        "Cultural Services",
        "Environmental Services",
        "Planning & Development",
        "Central Services",
        "Total Grants Received",
    ]
    summary = {}
    for year in years:
        services = data[year].get("services", {})
        year_summary = {}
        for lbl in summary_labels:
            for cat, items in services.items():
                if lbl in items:
                    year_summary[lbl] = items[lbl]
                    break
        summary[year] = year_summary
    output["summary"] = summary

    return output


def build_comparison(revenue_data: dict) -> dict:
    """Build cross-council comparison file."""
    comparison = {
        "title": "Lancashire District Council Revenue Comparison",
        "data_source": "MHCLG Revenue Outturn Time Series (GOV.UK)",
        "units": "£ thousands",
        "licence": "Open Government Licence v3.0",
        "councils": {},
        "year_table": [],
    }

    # Collect all years
    all_years = set()
    for ck, data in revenue_data.items():
        all_years.update(data.keys())
    all_years = sorted(all_years)

    # Per-council trend data
    key_services = [
        "Total Net Current Expenditure",
        "Housing (GF & HRA)",
        "Environmental Services",
        "Cultural Services",
        "Planning & Development",
        "Central Services",
    ]

    for ons, ci in COUNCILS.items():
        ck = ci["key"]
        data = revenue_data.get(ck, {})
        council_trends = {}
        for svc in key_services:
            trend = []
            for year in all_years:
                services = data.get(year, {}).get("services", {})
                val = None
                for cat, items in services.items():
                    if svc in items:
                        val = items[svc]
                        break
                trend.append({"year": year, "value": val})
            council_trends[svc] = trend
        comparison["councils"][ck] = {
            "name": ci["name"],
            "ons_code": ons,
            "trends": council_trends,
        }

    # Year comparison table
    for year in all_years:
        row = {"year": year}
        for ons, ci in COUNCILS.items():
            ck = ci["key"]
            services = revenue_data.get(ck, {}).get(year, {}).get("services", {})
            total = None
            for cat, items in services.items():
                if "Total Net Current Expenditure" in items:
                    total = items["Total Net Current Expenditure"]
                    break
            row[ck] = total
        comparison["year_table"].append(row)

    # Calculate year-on-year % change
    changes = {}
    for ons, ci in COUNCILS.items():
        ck = ci["key"]
        data = revenue_data.get(ck, {})
        council_changes = []
        prev_total = None
        for year in all_years:
            services = data.get(year, {}).get("services", {})
            total = None
            for cat, items in services.items():
                if "Total Net Current Expenditure" in items:
                    total = items["Total Net Current Expenditure"]
                    break
            change_pct = None
            if total is not None and prev_total is not None and prev_total != 0:
                change_pct = round((total - prev_total) / abs(prev_total) * 100, 1)
            council_changes.append({
                "year": year,
                "total": total,
                "change_pct": change_pct,
            })
            if total is not None:
                prev_total = total
        changes[ck] = council_changes
    comparison["year_on_year_change"] = changes

    return comparison


def main():
    parser = argparse.ArgumentParser(
        description="Parse MHCLG Revenue & Capital Outturn time series for AI DOGE"
    )
    parser.add_argument("--data-dir", required=True, help="Path to data/ directory")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    ref_dir = data_dir / "reference"

    revenue_csv = ref_dir / "revenue_outturn_time_series.csv"
    capital_csv = ref_dir / "capital_outturn_time_series.csv"

    # ── Parse Revenue Outturn ──
    if not revenue_csv.exists():
        print(f"ERROR: Revenue CSV not found: {revenue_csv}")
        print("Download from: https://assets.publishing.service.gov.uk/media/6937fe05e447374889cd8f4b/Revenue_Outturn_time_series_data_v3.1.csv")
        sys.exit(1)

    print(f"Parsing revenue outturn time series: {revenue_csv.name}")
    revenue_data = parse_revenue_csv(str(revenue_csv), args.verbose)

    for ons, ci in COUNCILS.items():
        ck = ci["key"]
        years = sorted(revenue_data.get(ck, {}).keys())
        if years:
            print(f"  {ci['name']}: {len(years)} years ({years[0]} → {years[-1]})")
        else:
            print(f"  {ci['name']}: NO DATA FOUND")

    # ── Parse Capital Outturn ──
    capital_data = {}
    if capital_csv.exists():
        print(f"\nParsing capital outturn time series: {capital_csv.name}")
        capital_data = parse_capital_csv(str(capital_csv), args.verbose)
        for ons, ci in COUNCILS.items():
            ck = ci["key"]
            years = sorted(capital_data.get(ck, {}).keys())
            if years:
                print(f"  {ci['name']}: {len(years)} years ({years[0]} → {years[-1]})")
            else:
                print(f"  {ci['name']}: NO DATA FOUND")
    else:
        print(f"\nCapital CSV not found, skipping: {capital_csv}")

    # ── Build per-council revenue trends ──
    print("\n─── Building revenue trend files ───")
    for ons, ci in COUNCILS.items():
        trends = build_revenue_trends(ci["key"], ci["name"], ons, revenue_data)

        # Add capital data if available
        cap = capital_data.get(ci["key"], {})
        if cap:
            trends["capital_years"] = sorted(cap.keys())
            trends["capital_by_year"] = cap

        output_dir = data_dir / ci["key"]
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / "revenue_trends.json"

        with open(output_path, "w") as f:
            json.dump(trends, f, indent=2)

        # Print summary
        summary = trends.get("summary", {})
        latest = sorted(summary.keys())[-1] if summary else None
        if latest:
            total = summary[latest].get("Total Net Current Expenditure")
            if total is not None:
                print(f"  {ci['name']} ({latest}): Total Net Current = £{total:,.0f}k")
            else:
                print(f"  {ci['name']} ({latest}): total not available")
        print(f"    → {output_path}")

    # ── Build cross-council comparison ──
    print("\n─── Building cross-council comparison ───")
    comparison = build_comparison(revenue_data)
    comp_path = ref_dir / "cross_council_comparison.json"
    with open(comp_path, "w") as f:
        json.dump(comparison, f, indent=2)
    print(f"  → {comp_path}")

    # ── Print trend table ──
    print("\n══════════════════════════════════════════════════════════════")
    print(" Total Net Current Expenditure (£ thousands)")
    print("══════════════════════════════════════════════════════════════")
    print(f"{'Year':<12}", end="")
    for ci in COUNCILS.values():
        print(f"{ci['name']:>14}", end="")
    print()
    print("─" * 54)

    all_years = sorted(set(
        y for ck in revenue_data for y in revenue_data[ck].keys()
    ))

    for year in all_years:
        print(f"{year:<12}", end="")
        for ons, ci in COUNCILS.items():
            ck = ci["key"]
            services = revenue_data.get(ck, {}).get(year, {}).get("services", {})
            total = None
            for cat, items in services.items():
                if "Total Net Current Expenditure" in items:
                    total = items["Total Net Current Expenditure"]
                    break
            if total is not None:
                print(f"{total:>14,.0f}", end="")
            else:
                print(f"{'—':>14}", end="")
        print()

    # ── Print service breakdown for latest year ──
    latest = all_years[-1] if all_years else None
    if latest:
        print(f"\n══════════════════════════════════════════════════════════════")
        print(f" Service Breakdown — {latest} (£ thousands)")
        print(f"══════════════════════════════════════════════════════════════")
        svc_labels = [
            "Housing (GF & HRA)", "Environmental Services", "Cultural Services",
            "Planning & Development", "Central Services", "Other Services",
        ]
        print(f"{'Service':<30}", end="")
        for ci in COUNCILS.values():
            print(f"{ci['name']:>14}", end="")
        print()
        print("─" * 72)

        for svc in svc_labels:
            print(f"{svc:<30}", end="")
            for ons, ci in COUNCILS.items():
                ck = ci["key"]
                services = revenue_data.get(ck, {}).get(latest, {}).get("services", {})
                val = None
                for cat, items in services.items():
                    if svc in items:
                        val = items[svc]
                        break
                if val is not None:
                    print(f"{val:>14,.0f}", end="")
                else:
                    print(f"{'—':>14}", end="")
            print()

    print(f"\nDone. {len(COUNCILS)} councils × {len(all_years)} years.")


if __name__ == "__main__":
    main()
