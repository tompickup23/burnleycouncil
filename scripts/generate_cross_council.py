#!/usr/bin/env python3
"""
generate_cross_council.py — Generate cross_council.json from per-council data files.
Zero dependencies (stdlib only).

This replaces manually maintaining 5 copies of cross_council.json.
Single source of truth: reads metadata.json, budgets_summary.json, pay_comparison.json,
config.json, and revenue_trends.json per council, then writes one canonical copy
and syncs it to all council data directories.

Usage:
    python3 scripts/generate_cross_council.py          # Generate and sync
    python3 scripts/generate_cross_council.py --dry-run # Show output without writing
    python3 scripts/generate_cross_council.py --stdout  # Print to stdout only

Output: burnley-council/data/{council}/cross_council.json (×4) + public/data/cross_council.json
"""

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "burnley-council" / "data"
PUBLIC_DATA = ROOT / "public" / "data"

COUNCILS = ["burnley", "hyndburn", "pendle", "rossendale", "lancaster", "ribble_valley", "chorley", "south_ribble", "lancashire_cc", "blackpool", "west_lancashire", "blackburn", "wyre", "preston", "fylde"]

# Population figures (2021 Census) — updated manually when new census data available
POPULATIONS = {
    "burnley": 88600,
    "hyndburn": 81000,
    "pendle": 92000,
    "rossendale": 73045,
    "lancaster": 144246,
    "ribble_valley": 61561,
    "chorley": 118300,
    "south_ribble": 111600,
    "lancashire_cc": 1235356,
    "blackpool": 141100,
    "west_lancashire": 117935,
    "blackburn": 149696,
    "wyre": 113900,
    "preston": 143135,
    "fylde": 81550,
}


def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _parse_money_value(s):
    """Parse formatted money strings like '£1.2M', '£44.0K', '£2,500' to numeric."""
    if not s or not isinstance(s, str):
        return 0
    s = s.replace("£", "").replace(",", "").strip()
    multiplier = 1
    if s.upper().endswith("M"):
        multiplier = 1_000_000
        s = s[:-1]
    elif s.upper().endswith("K"):
        multiplier = 1_000
        s = s[:-1]
    elif s.upper().endswith("B"):
        multiplier = 1_000_000_000
        s = s[:-1]
    try:
        return round(float(s) * multiplier)
    except ValueError:
        return 0


def build_council_entry(council_id):
    """Build a cross_council entry for one council from its data files."""
    meta = load_json(DATA_DIR / council_id / "metadata.json") or {}
    config = load_json(DATA_DIR / council_id / "config.json") or {}
    budgets = load_json(DATA_DIR / council_id / "budgets_summary.json") or {}
    pay = load_json(DATA_DIR / council_id / "pay_comparison.json") or {}
    trends = load_json(DATA_DIR / council_id / "revenue_trends.json") or {}
    doge = load_json(DATA_DIR / council_id / "doge_findings.json") or {}
    insights = load_json(DATA_DIR / council_id / "insights.json") or {}

    council_name = config.get("council_name", council_id.title())
    total_records = meta.get("total_records", meta.get("record_count", 0))
    total_spend = meta.get("total_spend", 0)
    # unique_suppliers: try metadata keys, then insights, then supplier list length
    unique_suppliers = (
        meta.get("unique_suppliers")
        or meta.get("supplier_count")
        or (insights.get("supplier_analysis", {}).get("total_unique_suppliers"))
        or len(meta.get("suppliers", []))
        or 0
    )
    date_range = meta.get("date_range", {})
    financial_years = meta.get("financial_years", [])
    population = POPULATIONS.get(council_id, 0)

    # Derived: avg_transaction
    avg_transaction = round(total_spend / total_records, 2) if total_records > 0 else 0

    # Supplier concentration from insights.json (top-20 concentration ratio)
    sa = insights.get("supplier_analysis", {}) if isinstance(insights, dict) else {}
    top10_pct = sa.get("concentration_ratio", 0)
    if not top10_pct:
        # Fallback: calculate from top_20_suppliers list
        top_suppliers = sa.get("top_20_suppliers", [])
        if top_suppliers and total_spend > 0:
            top10_spend = sum(s.get("total", 0) for s in top_suppliers[:10])
            top10_pct = round(top10_spend / total_spend, 4)

    # Transparency scores from data_quality_report or metadata
    dqr = load_json(DATA_DIR / council_id / "data_quality_report.json") or {}
    completeness = dqr.get("completeness", {})
    transparency = {
        "has_dates": completeness.get("date", completeness.get("has_dates", 0)),
        "has_suppliers": completeness.get("supplier", completeness.get("has_suppliers", 0)),
        "has_departments": completeness.get("department", completeness.get("has_departments", 0)),
    }
    # Fallback: if no DQR, check metadata (handle both filter formats)
    dept_filters = meta.get("filters", {}).get("departments", [])
    has_departments = bool(dept_filters) or bool(meta.get("departments", []))
    if all(v == 0 for v in transparency.values()):
        transparency = {
            "has_dates": 100.0 if date_range.get("min") else 0,
            "has_suppliers": 100.0 if unique_suppliers > 0 else 0,
            "has_departments": 100.0 if has_departments else 0,
        }

    # Duplicate info from DOGE findings — parse from findings[] display cards
    # Sum both "Likely" (high-confidence) and "Possible" (medium-confidence) duplicates
    duplicate_count = 0
    duplicate_value = 0
    if isinstance(doge, dict):
        for finding in doge.get("findings", []):
            label = finding.get("label", "")
            if "Duplicate" in label:
                # Value is formatted like "£1.2M"
                duplicate_value += _parse_money_value(finding.get("value", ""))
                # Count is in detail text like "298 high-confidence duplicate groups"
                detail = finding.get("detail", "")
                count_match = re.search(r"(\d[\d,]*)\s+(?:high|medium)-confidence", detail)
                if count_match:
                    duplicate_count += int(count_match.group(1).replace(",", ""))

    # Pay comparison — handle varying key names across councils
    ceo = pay.get("chief_executive", {})
    pay_history = pay.get("pay_history", [])

    # Salary band: try current_salary_band first, then salary_range description
    salary_band = ceo.get("current_salary_band", "")
    if not salary_band and ceo.get("salary_type") in ("spot", "spot_salary") and ceo.get("salary"):
        salary_band = f"£{ceo['salary']:,} (spot salary)"

    # CEO midpoint: try current_midpoint, then salary, then latest pay_history
    ceo_midpoint = ceo.get("current_midpoint") or ceo.get("salary") or 0
    if not ceo_midpoint and pay_history:
        for entry in reversed(pay_history):
            if entry.get("ceo_salary"):
                ceo_midpoint = entry["ceo_salary"]
                break

    # CEO-to-median ratio and median salary from latest pay_history entry
    ceo_to_median = 0
    median_salary = 0
    for entry in reversed(pay_history):
        if entry.get("ceo_to_median_ratio"):
            ceo_to_median = entry["ceo_to_median_ratio"]
            break
    for entry in reversed(pay_history):
        if entry.get("median_employee_salary"):
            median_salary = entry["median_employee_salary"]
            break

    pay_entry = {
        "ceo_salary_band": salary_band,
        "ceo_midpoint": ceo_midpoint,
        "ceo_to_median_ratio": ceo_to_median,
        "median_employee_salary": median_salary,
    }

    # Service expenditure from budgets_summary
    svc = {}
    headline = budgets.get("headline", {})
    svc_breakdown = budgets.get("service_breakdown", {})
    if svc_breakdown:
        svc = {
            "year": budgets.get("financial_year", ""),
            "housing": 0,
            "cultural": 0,
            "environmental": 0,
            "planning": 0,
            "central": 0,
            "other": 0,
            "total": headline.get("total_service_expenditure", 0),
        }
        for key, val in svc_breakdown.items():
            val_k = round(val / 1000) if val else 0
            key_lower = key.lower()
            if "housing" in key_lower:
                svc["housing"] += val_k
            elif "cultural" in key_lower:
                svc["cultural"] += val_k
            elif "environmental" in key_lower:
                svc["environmental"] += val_k
            elif "planning" in key_lower:
                svc["planning"] += val_k
            elif "central" in key_lower:
                svc["central"] += val_k
            elif "highway" in key_lower:
                pass  # Highways often negative for districts, exclude
            else:
                svc["other"] += val_k
        # Convert total to thousands too
        if svc["total"]:
            svc["total"] = round(svc["total"] / 1000)

    # Budget summary: council tax band D + reserves
    ct = budgets.get("council_tax", {})
    band_d_years = ct.get("band_d_by_year", {})
    latest_band_d = 0
    if band_d_years:
        latest_year = max(band_d_years.keys())
        latest_band_d = band_d_years[latest_year]

    reserves_earmarked = headline.get("reserves_earmarked", 0) or 0
    reserves_unallocated = headline.get("reserves_unallocated", 0) or 0
    reserves_total = reserves_earmarked + reserves_unallocated

    budget_summary = {
        "council_tax_band_d": latest_band_d,
        "reserves_total": reserves_total,
    }

    # Annualized metrics for fair cross-council comparison
    num_years = len(financial_years) if financial_years else 1
    annual_spend = round(total_spend / num_years, 2) if num_years > 0 else total_spend
    annual_records = round(total_records / num_years) if num_years > 0 else total_records

    council_tier = config.get("council_tier", "district")

    return {
        "council_id": council_id,
        "council_name": council_name,
        "council_tier": council_tier,
        "total_records": total_records,
        "total_spend": total_spend,
        "unique_suppliers": unique_suppliers,
        "date_range": date_range,
        "financial_years": financial_years,
        "num_years": num_years,
        "annual_spend": annual_spend,
        "annual_records": annual_records,
        "population": population,
        "avg_transaction": avg_transaction,
        "top10_supplier_pct": top10_pct,
        "transparency": transparency,
        "duplicate_count": duplicate_count,
        "duplicate_value": duplicate_value,
        "pay": pay_entry,
        "service_expenditure": svc,
        "budget_summary": budget_summary,
    }


def main():
    parser = argparse.ArgumentParser(description="Generate cross_council.json from per-council data")
    parser.add_argument("--dry-run", action="store_true", help="Print output without writing files")
    parser.add_argument("--stdout", action="store_true", help="Print to stdout only")
    args = parser.parse_args()

    print("Generating cross_council.json...", file=sys.stderr)

    councils = []
    for council_id in COUNCILS:
        print(f"  Processing {council_id}...", file=sys.stderr)
        entry = build_council_entry(council_id)
        councils.append(entry)

    result = {
        "generated": datetime.now().isoformat(timespec="seconds"),
        "councils": councils,
    }

    output = json.dumps(result, indent=2, ensure_ascii=False)

    if args.stdout or args.dry_run:
        print(output)
        if args.dry_run:
            print(f"\n--- DRY RUN: Would write to {len(COUNCILS) + 1} locations ---", file=sys.stderr)
        return

    # Write to all council data directories + public/data/
    destinations = [DATA_DIR / c / "cross_council.json" for c in COUNCILS]
    if PUBLIC_DATA.is_dir():
        destinations.append(PUBLIC_DATA / "cross_council.json")

    for dest in destinations:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(output, encoding="utf-8")
        print(f"  Written: {dest.relative_to(ROOT)}", file=sys.stderr)

    print(f"\nDone: {len(destinations)} copies synced.", file=sys.stderr)


if __name__ == "__main__":
    main()
