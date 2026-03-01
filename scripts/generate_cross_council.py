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
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "burnley-council" / "data"
PUBLIC_DATA = ROOT / "public" / "data"

# ONS CPI-H annual averages (base 2015 = 100) for inflation adjustment
CPI_H_INDEX = {
    "2015/16": 100.6, "2016/17": 102.3, "2017/18": 105.1, "2018/19": 107.4,
    "2019/20": 109.3, "2020/21": 110.3, "2021/22": 114.1, "2022/23": 124.7,
    "2023/24": 131.5, "2024/25": 136.0, "2025/26": 138.7,
}

COUNCILS = ["burnley", "hyndburn", "pendle", "rossendale", "lancaster", "ribble_valley", "chorley", "south_ribble", "lancashire_cc", "blackpool", "west_lancashire", "blackburn", "wyre", "preston", "fylde", "lancashire_pcc", "lancashire_fire"]

# Population figures (2021 Census) — updated manually when new census data available
# PCC and Fire serve all of Lancashire (~1.5M) but not comparable per-capita to councils
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
    "lancashire_pcc": 1500000,
    "lancashire_fire": 1500000,
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
    collection = load_json(DATA_DIR / council_id / "collection_rates.json") or {}
    politics = load_json(DATA_DIR / council_id / "politics_summary.json") or {}

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
            "education": 0,
            "children_social_care": 0,
            "adult_social_care": 0,
            "public_health": 0,
            "highways": 0,
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
            if "education" in key_lower:
                svc["education"] += val_k
            elif "children" in key_lower and "social" in key_lower:
                svc["children_social_care"] += val_k
            elif "adult" in key_lower and "social" in key_lower:
                svc["adult_social_care"] += val_k
            elif "public health" in key_lower:
                svc["public_health"] += val_k
            elif "highway" in key_lower:
                svc["highways"] += val_k
            elif "housing" in key_lower:
                svc["housing"] += val_k
            elif "cultural" in key_lower:
                svc["cultural"] += val_k
            elif "environmental" in key_lower:
                svc["environmental"] += val_k
            elif "planning" in key_lower:
                svc["planning"] += val_k
            elif "central" in key_lower:
                svc["central"] += val_k
            else:
                svc["other"] += val_k
        # Convert total to thousands too
        if svc["total"]:
            svc["total"] = round(svc["total"] / 1000)

    # Budget summary: council tax band D + reserves + LGR-critical fields
    ct = budgets.get("council_tax", {})
    band_d_years = ct.get("band_d_by_year", {})
    latest_band_d = 0
    if band_d_years:
        latest_year = max(band_d_years.keys())
        latest_band_d = band_d_years[latest_year]

    # Band D total (including police/fire precepts) for full CT picture
    band_d_total_years = ct.get("band_d_total_by_year", {})
    latest_band_d_total = 0
    if band_d_total_years:
        latest_total_year = max(band_d_total_years.keys())
        latest_band_d_total = band_d_total_years[latest_total_year]

    # Reserves from enriched budgets_summary.json (new format with separate reserves dict)
    reserves = budgets.get("reserves", {})
    reserves_earmarked_opening = reserves.get("earmarked_opening", 0) or 0
    reserves_earmarked_closing = reserves.get("earmarked_closing", 0) or 0
    reserves_unallocated_opening = reserves.get("unallocated_opening", 0) or 0
    reserves_unallocated_closing = reserves.get("unallocated_closing", 0) or 0
    reserves_total_opening = reserves.get("total_opening", 0) or 0
    reserves_total_closing = reserves.get("total_closing", 0) or 0
    reserves_change = reserves.get("change", 0) or 0

    # LGR-critical headline financials
    total_service_expenditure = headline.get("total_service_expenditure", 0) or 0
    net_revenue_expenditure = headline.get("net_revenue_expenditure", 0) or 0
    council_tax_requirement = headline.get("council_tax_requirement", 0) or 0
    council_tax_support = budgets.get("council_tax_support") or 0

    budget_summary = {
        "financial_year": budgets.get("financial_year", ""),
        "council_tax_band_d": latest_band_d,
        "council_tax_band_d_total": latest_band_d_total,
        "total_service_expenditure": total_service_expenditure,
        "net_revenue_expenditure": net_revenue_expenditure,
        "council_tax_requirement": council_tax_requirement,
        "council_tax_support": council_tax_support,
        "reserves_earmarked_opening": reserves_earmarked_opening,
        "reserves_earmarked_closing": reserves_earmarked_closing,
        "reserves_unallocated_opening": reserves_unallocated_opening,
        "reserves_unallocated_closing": reserves_unallocated_closing,
        "reserves_total": reserves_total_closing,
        "reserves_change": reserves_change,
    }

    # Annualized metrics for fair cross-council comparison
    num_years = len(financial_years) if financial_years else 1
    annual_spend = round(total_spend / num_years, 2) if num_years > 0 else total_spend
    annual_records = round(total_records / num_years) if num_years > 0 else total_records

    council_tier = config.get("council_tier", "district")

    # ── Per-capita and reserves adequacy ──
    per_capita_spend = round(annual_spend / population, 2) if population > 0 and annual_spend > 0 else 0

    # Reserves adequacy (CIPFA guidance: months of expenditure cover)
    reserves_months = 0
    reserves_adequacy = "Unknown"
    if reserves_total_closing > 0 and net_revenue_expenditure > 0:
        reserves_months = round((reserves_total_closing / net_revenue_expenditure) * 12, 1)
    elif reserves_total_closing > 0 and total_service_expenditure > 0:
        reserves_months = round((reserves_total_closing / total_service_expenditure) * 12, 1)

    if reserves_months > 0:
        if reserves_months < 3:
            reserves_adequacy = "Critical"
        elif reserves_months < 6:
            reserves_adequacy = "Low"
        elif reserves_months < 12:
            reserves_adequacy = "Adequate"
        else:
            reserves_adequacy = "Strong"

    # ── Demographics: dependency ratio from Census 2021 ──
    demographics = load_json(DATA_DIR / council_id / "demographics.json") or {}
    age_data = demographics.get("council_totals", {}).get("age", {})
    total_pop = age_data.get("Total: All usual residents", 0) or 0

    under_16 = (
        (age_data.get("Aged 4 years and under", 0) or 0)
        + (age_data.get("Aged 5 to 9 years", 0) or 0)
        + (age_data.get("Aged 10 to 15 years", 0) or 0)
    )
    aged_16_64 = (
        (age_data.get("Aged 16 to 19 years", 0) or 0)
        + (age_data.get("Aged 20 to 24 years", 0) or 0)
        + (age_data.get("Aged 25 to 34 years", 0) or 0)
        + (age_data.get("Aged 35 to 49 years", 0) or 0)
        + (age_data.get("Aged 50 to 64 years", 0) or 0)
    )
    over_65 = (
        (age_data.get("Aged 65 to 74 years", 0) or 0)
        + (age_data.get("Aged 75 to 84 years", 0) or 0)
        + (age_data.get("Aged 85 years and over", 0) or 0)
    )

    dependency_ratio = round(((under_16 + over_65) / aged_16_64) * 100, 1) if aged_16_64 > 0 else 0
    youth_ratio = round((under_16 / total_pop) * 100, 1) if total_pop > 0 else 0
    elderly_ratio = round((over_65 / total_pop) * 100, 1) if total_pop > 0 else 0
    working_age_pct = round((aged_16_64 / total_pop) * 100, 1) if total_pop > 0 else 0

    # ── Reserves trajectory (multi-year from budgets_summary.json) ──
    reserves_trends = budgets.get("trends", {}).get("reserves_trends", {})
    budget_years = budgets.get("years", [])
    reserves_trajectory = []
    for yr in sorted(budget_years):
        rt = reserves_trends.get(yr, {})
        if rt:
            reserves_trajectory.append({
                "year": yr,
                "earmarked": rt.get("earmarked", 0) or 0,
                "unallocated": rt.get("unallocated", 0) or 0,
                "total": rt.get("total", 0) or 0,
            })

    # 2-year linear projection of reserves
    reserves_projected = []
    if len(reserves_trajectory) >= 2:
        # Linear regression on total reserves
        totals = [r["total"] for r in reserves_trajectory]
        n = len(totals)
        # Simple linear fit: y = a + b*x where x = 0,1,2,...
        x_mean = (n - 1) / 2
        y_mean = sum(totals) / n
        numerator = sum((i - x_mean) * (totals[i] - y_mean) for i in range(n))
        denominator = sum((i - x_mean) ** 2 for i in range(n))
        slope = numerator / denominator if denominator != 0 else 0
        intercept = y_mean - slope * x_mean

        # Project 1 and 2 years ahead
        for offset in (1, 2):
            projected_total = round(intercept + slope * (n - 1 + offset))
            # Don't project negative reserves
            if projected_total < 0:
                projected_total = 0
            last_yr = reserves_trajectory[-1]["year"]
            # Parse year and add offset: "2024-25" → "2025-26", "2026-27"
            try:
                start = int(last_yr.split("-")[0]) + offset
                proj_year = f"{start}-{str(start + 1)[-2:]}"
            except (ValueError, IndexError):
                proj_year = f"+{offset}yr"
            reserves_projected.append({
                "year": proj_year,
                "total": projected_total,
                "projected": True,
            })

    reserves_direction = "stable"
    if len(reserves_trajectory) >= 2:
        latest_total = reserves_trajectory[-1]["total"]
        prev_total = reserves_trajectory[-2]["total"]
        if prev_total > 0:
            pct_change = ((latest_total - prev_total) / prev_total) * 100
            if pct_change > 5:
                reserves_direction = "improving"
            elif pct_change < -5:
                reserves_direction = "declining"

    # ── Per-service HHI from budget_efficiency.json ──
    budget_eff = load_json(DATA_DIR / council_id / "budget_efficiency.json") or {}
    service_hhi = {}
    overall_hhi = None
    if isinstance(budget_eff, dict) and budget_eff.get("categories"):
        for cat_name, cat_data in budget_eff["categories"].items():
            if isinstance(cat_data, dict) and cat_data.get("hhi") is not None:
                service_hhi[cat_name] = {
                    "hhi": cat_data["hhi"],
                    "category": cat_data.get("hhi_category", "unknown"),
                    "transactions": cat_data.get("transactions", 0),
                    "total_spend": round(cat_data.get("total_spend", 0)),
                }
    # Overall HHI from doge_findings supplier_concentration
    sc = doge.get("supplier_concentration", {})
    if isinstance(sc, dict):
        overall_hhi = sc.get("hhi")

    # ── Planning data from planning.json ──
    planning_data = load_json(DATA_DIR / council_id / "planning.json") or {}
    planning_summary = {}
    if planning_data:
        p_summary = planning_data.get("summary", {})
        p_efficiency = planning_data.get("efficiency", {})
        p_meta = planning_data.get("meta", {})
        planning_summary = {
            "total_applications": p_summary.get("total", 0),
            "by_year": p_summary.get("by_year", {}),
            "by_type": p_summary.get("by_type", {}),
            "by_decision": p_summary.get("by_decision", {}),
            "by_size": p_summary.get("by_size", {}),
            "approval_rate": p_summary.get("approval_rate", 0),
            "avg_decision_days": p_summary.get("avg_decision_days", 0),
            "median_decision_days": p_summary.get("median_decision_days", 0),
            "decided_count": p_summary.get("decided_count", 0),
            "apps_per_year": p_efficiency.get("apps_per_year", 0),
            "development_control_spend": p_efficiency.get("development_control_spend", 0),
            "cost_per_application": p_efficiency.get("cost_per_application", 0),
            "total_planning_spend": p_efficiency.get("total_planning_spend", 0),
            "total_cost_per_app": p_efficiency.get("total_cost_per_app", 0),
            "budget_year": p_efficiency.get("budget_year", ""),
            "years_back": p_meta.get("years_back", 0),
            "fetched": p_meta.get("fetched", ""),
        }

    # ── Political data from politics_summary.json ──
    party_seats = {}
    total_councillors = politics.get("total_councillors", politics.get("total_seats", 0))
    majority_threshold = politics.get("majority_threshold", 0)
    # Handle two formats: by_party [{party, count}] (most) or parties [{name, seats}] (Rossendale)
    by_party = politics.get("by_party", [])
    if by_party:
        for p in by_party:
            party_seats[p.get("party", "Unknown")] = p.get("count", 0)
    else:
        for p in politics.get("parties", []):
            party_seats[p.get("name", "Unknown")] = p.get("seats", 0)
    ruling_party = ""
    if politics.get("coalition", {}).get("parties"):
        ruling_party = politics["coalition"]["parties"][0]
    elif politics.get("control", ""):
        ctrl = politics["control"]
        ruling_party = ctrl.split(" majority")[0].split(" minority")[0].strip() if " " in ctrl else ctrl
    elif party_seats:
        ruling_party = max(party_seats, key=party_seats.get)

    # ── Council tax collection rates ──
    collection_rate = collection.get("latest_rate")
    collection_rate_trend = collection.get("trend")
    collection_rate_5yr_avg = collection.get("five_year_avg")
    collection_performance = collection.get("performance")
    # Latest year uncollected amount (£ thousands → £)
    latest_yr = collection.get("latest_year")
    latest_yr_data = collection.get("years", {}).get(latest_yr, {}) if latest_yr else {}
    uncollected_gbp = latest_yr_data.get("uncollected_gbp", 0)

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
        "per_capita_spend": per_capita_spend,
        "avg_transaction": avg_transaction,
        "top10_supplier_pct": top10_pct,
        "transparency": transparency,
        "duplicate_count": duplicate_count,
        "duplicate_value": duplicate_value,
        "pay": pay_entry,
        "service_expenditure": svc,
        "budget_summary": budget_summary,
        "reserves_months": reserves_months,
        "reserves_adequacy": reserves_adequacy,
        "collection_rate": collection_rate,
        "collection_rate_trend": collection_rate_trend,
        "collection_rate_5yr_avg": collection_rate_5yr_avg,
        "collection_performance": collection_performance,
        "uncollected_ct_gbp": uncollected_gbp,
        "dependency_ratio": dependency_ratio,
        "youth_ratio": youth_ratio,
        "elderly_ratio": elderly_ratio,
        "working_age_pct": working_age_pct,
        "reserves_trajectory": reserves_trajectory,
        "reserves_projected": reserves_projected,
        "reserves_direction": reserves_direction,
        "overall_hhi": overall_hhi,
        "service_hhi": service_hhi,
        "party_seats": party_seats,
        "total_councillors": total_councillors,
        "majority_threshold": majority_threshold,
        "ruling_party": ruling_party,
        "planning": planning_summary,
    }


def build_cross_council_suppliers(council_entries):
    """Build cross-council supplier index from insights.json top-20 lists.

    Identifies suppliers operating across multiple councils — critical for
    LGR modelling (contract consolidation, procurement savings, service continuity).

    Returns:
        dict with 'shared_suppliers' (appear in 2+ councils) and 'service_mapping'
        (budget category → suppliers across councils).
    """
    # Collect top suppliers from each council's insights.json
    supplier_councils = defaultdict(list)  # canonical_name → [{council, spend, txns}]
    council_budget_suppliers = defaultdict(lambda: defaultdict(list))  # category → council → [suppliers]

    for entry in council_entries:
        cid = entry["council_id"]
        insights = load_json(DATA_DIR / cid / "insights.json") or {}
        budget_eff = load_json(DATA_DIR / cid / "budget_efficiency.json") or {}
        budget_map = load_json(DATA_DIR / cid / "budget_mapping.json") or {}

        # Top suppliers from insights
        sa = insights.get("supplier_analysis", {}) if isinstance(insights, dict) else {}
        for s in sa.get("top_20_suppliers", []):
            name = (s.get("supplier") or "").strip().upper()
            if not name or name in ("NAME WITHHELD", "REDACTED", "VARIOUS"):
                continue
            supplier_councils[name].append({
                "council_id": cid,
                "council_name": entry["council_name"],
                "spend": round(s.get("total", 0), 2),
                "transactions": s.get("transactions", 0),
            })

        # Budget efficiency: top suppliers per category
        if isinstance(budget_eff, dict):
            for category, cat_data in budget_eff.get("categories", {}).items():
                for s in cat_data.get("top_suppliers", []):
                    sname = (s.get("supplier") or "").strip().upper()
                    if sname and sname not in ("NAME WITHHELD", "REDACTED"):
                        council_budget_suppliers[category][cid].append({
                            "supplier": sname,
                            "spend": round(s.get("spend", 0), 2),
                        })

    # Filter to suppliers appearing in 2+ councils
    shared = []
    for name, councils in supplier_councils.items():
        if len(councils) < 2:
            continue
        total = sum(c["spend"] for c in councils)
        shared.append({
            "supplier": name,
            "councils_count": len(councils),
            "total_spend": round(total, 2),
            "councils": sorted(councils, key=lambda x: -x["spend"]),
        })

    shared.sort(key=lambda x: -x["total_spend"])

    # Build service mapping: which councils have which suppliers per budget category
    svc_map = {}
    for category, council_data in council_budget_suppliers.items():
        # Find suppliers shared across councils within this category
        all_sups = defaultdict(list)
        for cid, suppliers in council_data.items():
            for s in suppliers:
                all_sups[s["supplier"]].append({"council_id": cid, "spend": s["spend"]})
        # Only include if supplier appears in 2+ councils for same service
        shared_in_cat = []
        for sname, appearances in all_sups.items():
            if len(appearances) >= 2:
                shared_in_cat.append({
                    "supplier": sname,
                    "councils_count": len(appearances),
                    "total_spend": round(sum(a["spend"] for a in appearances), 2),
                    "appearances": sorted(appearances, key=lambda x: -x["spend"]),
                })
        if shared_in_cat:
            shared_in_cat.sort(key=lambda x: -x["total_spend"])
            svc_map[category] = {
                "shared_suppliers": shared_in_cat[:10],
                "councils_reporting": len(council_data),
            }

    return {
        "shared_suppliers": shared[:50],  # Top 50 cross-council suppliers
        "service_supplier_mapping": svc_map,
        "total_shared_suppliers": len(shared),
        "total_shared_spend": round(sum(s["total_spend"] for s in shared), 2),
    }


def build_budget_spending_reconciliation(council_entries):
    """Compare DOGE tracked spending against GOV.UK outturn per budget category.

    Enables: budget vs actual analysis, coverage assessment, LGR financial modelling.

    Returns:
        dict with per-council reconciliation by budget category.
    """
    reconciliation = {}

    for entry in council_entries:
        cid = entry["council_id"]
        budgets_summary = load_json(DATA_DIR / cid / "budgets_summary.json") or {}
        budget_map = load_json(DATA_DIR / cid / "budget_mapping.json") or {}

        if not budget_map or not budgets_summary:
            continue

        svc_breakdown = budgets_summary.get("service_breakdown", {})
        cat_summary = budget_map.get("category_summary", {})
        coverage = budget_map.get("coverage", {})
        num_years = entry.get("num_years", 1) or 1

        if not svc_breakdown or not cat_summary:
            continue

        categories = {}
        for govuk_cat, govuk_value in svc_breakdown.items():
            if not isinstance(govuk_value, (int, float)):
                continue
            doge_total = cat_summary.get(govuk_cat, 0)
            # Annualise DOGE spend for fair comparison (GOV.UK is single year)
            doge_annual = round(doge_total / num_years) if num_years > 1 else round(doge_total)

            ratio = round(doge_annual / govuk_value, 3) if govuk_value and govuk_value != 0 else None
            categories[govuk_cat] = {
                "govuk_outturn": govuk_value,
                "doge_annual_spend": doge_annual,
                "coverage_ratio": ratio,
            }

        if categories:
            reconciliation[cid] = {
                "council_name": entry["council_name"],
                "council_tier": entry["council_tier"],
                "govuk_year": budgets_summary.get("financial_year", ""),
                "doge_years": entry.get("num_years", 1),
                "mapping_coverage_pct": coverage.get("mapped_spend_pct", 0),
                "categories": categories,
            }

    return reconciliation


def build_council_tax_comparison(council_entries):
    """Build comprehensive council tax comparison across all 15 councils.

    Uses lgr_budget_model.json (GOV.UK MHCLG data) as primary source for:
    - Band D element per council
    - Band D total (all precepting authorities)
    - Council tax requirement
    - Tax base (Band D equivalents)

    Plus budgets_summary.json for multi-year Band D history where available.

    Returns:
        dict with council tax data for all 15 councils and tier analysis.
    """
    lgr_model = load_json(DATA_DIR / "shared" / "lgr_budget_model.json") or {}
    council_budgets = lgr_model.get("council_budgets", {})

    ct_data = {}
    for entry in council_entries:
        cid = entry["council_id"]
        lgr = council_budgets.get(cid, {})
        budgets_summary = load_json(DATA_DIR / cid / "budgets_summary.json") or {}

        ct_history = {}
        ct = budgets_summary.get("council_tax", {})
        if ct:
            ct_history = ct.get("band_d_by_year", {})

        band_d_element = lgr.get("ct_band_d_element", 0)
        band_d_total = lgr.get("ct_band_d_total", 0)
        tax_base = lgr.get("tax_base_derived", 0)
        ct_requirement = lgr.get("ct_requirement", 0)
        population = POPULATIONS.get(cid, 0)

        # Per-capita council tax (how much CT revenue per resident)
        ct_per_capita = round(ct_requirement / population, 2) if population > 0 and ct_requirement > 0 else 0

        # CT as pct of total service expenditure
        total_svc_exp = lgr.get("total_service_expenditure", 0)
        ct_dependency = round(ct_requirement / total_svc_exp * 100, 1) if total_svc_exp > 0 and ct_requirement > 0 else 0

        ct_data[cid] = {
            "council_name": entry["council_name"],
            "council_tier": entry["council_tier"],
            "band_d_element": band_d_element,
            "band_d_total": band_d_total,
            "tax_base": tax_base,
            "ct_requirement": ct_requirement,
            "total_service_expenditure": total_svc_exp,
            "population": population,
            "ct_per_capita": ct_per_capita,
            "ct_dependency_pct": ct_dependency,
            "band_d_history": ct_history,
            "services": lgr.get("services", {}),
        }

    # Compute LGR harmonisation impact: if councils merge, what happens to Band D?
    # For each proposed LGR model, calculate the harmonised Band D
    lgr_tracker = load_json(DATA_DIR / "shared" / "lgr_tracker.json") or {}
    harmonisation = {}
    for model in lgr_tracker.get("proposed_models", []):
        model_name = model.get("name", "")
        for auth in model.get("authorities", []):
            auth_name = auth.get("name", "")
            # lgr_tracker.json uses "councils" key with council_id values
            member_ids = [c for c in auth.get("councils", []) if c in ct_data]

            if len(member_ids) < 2:
                continue

            # Harmonised Band D = total CT requirement / total tax base
            total_req = sum(ct_data[cid]["ct_requirement"] for cid in member_ids if cid in ct_data)
            total_base = sum(ct_data[cid]["tax_base"] for cid in member_ids if cid in ct_data)
            harmonised_band_d = round(total_req / total_base, 2) if total_base > 0 else 0

            # Who gains/loses?
            impacts = []
            for cid in member_ids:
                if cid not in ct_data:
                    continue
                current = ct_data[cid]["band_d_element"]
                diff = round(harmonised_band_d - current, 2)
                pct_change = round(diff / current * 100, 1) if current > 0 else 0
                impacts.append({
                    "council_id": cid,
                    "council_name": ct_data[cid]["council_name"],
                    "current_band_d": current,
                    "harmonised_band_d": harmonised_band_d,
                    "change": diff,
                    "change_pct": pct_change,
                })

            if auth_name not in harmonisation:
                harmonisation[auth_name] = {
                    "model": model_name,
                    "harmonised_band_d": harmonised_band_d,
                    "total_ct_requirement": total_req,
                    "total_tax_base": total_base,
                    "impacts": sorted(impacts, key=lambda x: x["change"]),
                }

    return {
        "councils": ct_data,
        "lgr_harmonisation": harmonisation,
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

    # ── Compute tier-specific benchmarks ──
    benchmarks = {}
    for tier in ("district", "county", "unitary"):
        tier_councils = [c for c in councils if c["council_tier"] == tier]
        if not tier_councils:
            continue

        per_capitas = [c["per_capita_spend"] for c in tier_councils if c["per_capita_spend"] > 0]
        annual_spends = [c["annual_spend"] for c in tier_councils if c["annual_spend"] > 0]
        reserves_m = [c["reserves_months"] for c in tier_councils if c["reserves_months"] > 0]

        def _median(vals):
            if not vals:
                return 0
            s = sorted(vals)
            mid = len(s) // 2
            return s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2

        collection_rates = [c["collection_rate"] for c in tier_councils if c.get("collection_rate")]
        dep_ratios = [c["dependency_ratio"] for c in tier_councils if c.get("dependency_ratio", 0) > 0]

        # Planning efficiency benchmarks
        cost_per_apps = [c["planning"]["cost_per_application"] for c in tier_councils
                         if c.get("planning", {}).get("cost_per_application", 0) > 0]
        apps_per_years = [c["planning"]["apps_per_year"] for c in tier_councils
                          if c.get("planning", {}).get("apps_per_year", 0) > 0]
        approval_rates = [c["planning"]["approval_rate"] for c in tier_councils
                          if c.get("planning", {}).get("approval_rate", 0) > 0]

        benchmarks[tier] = {
            "count": len(tier_councils),
            "median_per_capita_spend": round(_median(per_capitas), 2),
            "median_annual_spend": round(_median(annual_spends), 2),
            "median_reserves_months": round(_median(reserves_m), 1),
            "median_collection_rate": round(_median(collection_rates), 2) if collection_rates else None,
            "median_dependency_ratio": round(_median(dep_ratios), 1) if dep_ratios else None,
            "planning_councils_with_data": len(cost_per_apps),
            "median_cost_per_planning_app": round(_median(cost_per_apps)) if cost_per_apps else None,
            "median_apps_per_year": round(_median(apps_per_years)) if apps_per_years else None,
            "median_planning_approval_rate": round(_median(approval_rates), 3) if approval_rates else None,
        }

    # ── Add peer percentile ranks ──
    for tier in ("district", "county", "unitary"):
        tier_per_capitas = sorted(
            [c["per_capita_spend"] for c in councils if c["council_tier"] == tier and c["per_capita_spend"] > 0]
        )
        for c in councils:
            if c["council_tier"] != tier or c["per_capita_spend"] <= 0:
                c["per_capita_rank"] = 0
                c["per_capita_percentile"] = 0
                continue
            rank = sum(1 for v in tier_per_capitas if v <= c["per_capita_spend"])
            c["per_capita_rank"] = rank
            c["per_capita_percentile"] = round((rank / len(tier_per_capitas)) * 100, 1) if tier_per_capitas else 0

    # ── Cross-council supplier mapping ──
    print("  Building cross-council supplier index...", file=sys.stderr)
    supplier_index = build_cross_council_suppliers(councils)

    # ── Budget-spending reconciliation ──
    print("  Building budget-spending reconciliation...", file=sys.stderr)
    budget_reconciliation = build_budget_spending_reconciliation(councils)

    # ── Council tax comparison ──
    print("  Building council tax comparison...", file=sys.stderr)
    ct_comparison = build_council_tax_comparison(councils)

    result = {
        "generated": datetime.now().isoformat(timespec="seconds"),
        "benchmarks": benchmarks,
        "councils": councils,
        "supplier_index": supplier_index,
        "budget_reconciliation": budget_reconciliation,
        "council_tax": ct_comparison,
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

    print(f"\n  Cross-council suppliers: {supplier_index['total_shared_suppliers']} shared "
          f"(£{supplier_index['total_shared_spend']:,.0f})", file=sys.stderr)
    print(f"  Budget reconciliation: {len(budget_reconciliation)} councils", file=sys.stderr)
    print(f"  Council tax: {len(ct_comparison['councils'])} councils, "
          f"{len(ct_comparison['lgr_harmonisation'])} LGR authority projections", file=sys.stderr)
    print(f"\nDone: {len(destinations)} copies synced.", file=sys.stderr)


if __name__ == "__main__":
    main()
