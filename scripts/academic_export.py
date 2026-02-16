#!/usr/bin/env python3
"""
Academic Export — structured datasets for LGR financial modelling research.

Exports three CSV datasets suitable for Stata/R panel analysis:

1. Panel dataset: 15 councils × 4 years × 13 service categories
   - Revenue outturn from GOV.UK MHCLG (RS/RSX/RO2/RO4/RO5/RO6)
   - Spending data summary from AI DOGE
   - Procurement efficiency metrics
   - Demographics and deprivation

2. LGR model inputs: Per-proposed-authority aggregated budgets
   - Constituent council finances summed per proposal
   - Back-office / democratic / social care costs
   - Population, demographics, deprivation per proposed authority

3. Cross-council efficiency: Per-capita standardised spending
   - Tier-adjusted per-capita spend by service
   - Efficiency metrics (HHI, fraud triangle scores)
   - DOGE coverage ratios

Usage:
    python3 scripts/academic_export.py [--output-dir DIR]

Output:
    DIR/panel_dataset.csv
    DIR/lgr_model_inputs.csv
    DIR/cross_council_efficiency.csv
    DIR/codebook.txt
"""

import argparse
import csv
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Project paths
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_ROOT = PROJECT_ROOT / "burnley-council" / "data"

# All 15 Lancashire councils
COUNCILS = [
    "burnley", "hyndburn", "pendle", "rossendale",
    "lancaster", "ribble_valley", "chorley", "south_ribble",
    "lancashire_cc", "blackpool", "blackburn",
    "west_lancashire", "wyre", "preston", "fylde",
]

# Council metadata (names, ONS codes, tiers, populations from Census 2021)
COUNCIL_META = {
    "burnley": {"name": "Burnley", "ons": "E07000117", "tier": "district"},
    "hyndburn": {"name": "Hyndburn", "ons": "E07000120", "tier": "district"},
    "pendle": {"name": "Pendle", "ons": "E07000122", "tier": "district"},
    "rossendale": {"name": "Rossendale", "ons": "E07000125", "tier": "district"},
    "lancaster": {"name": "Lancaster", "ons": "E07000121", "tier": "district"},
    "ribble_valley": {"name": "Ribble Valley", "ons": "E07000124", "tier": "district"},
    "chorley": {"name": "Chorley", "ons": "E07000118", "tier": "district"},
    "south_ribble": {"name": "South Ribble", "ons": "E07000126", "tier": "district"},
    "lancashire_cc": {"name": "Lancashire CC", "ons": "E10000017", "tier": "county"},
    "blackpool": {"name": "Blackpool", "ons": "E06000009", "tier": "unitary"},
    "blackburn": {"name": "Blackburn with Darwen", "ons": "E06000008", "tier": "unitary"},
    "west_lancashire": {"name": "West Lancashire", "ons": "E07000127", "tier": "district"},
    "wyre": {"name": "Wyre", "ons": "E07000128", "tier": "district"},
    "preston": {"name": "Preston", "ons": "E07000123", "tier": "district"},
    "fylde": {"name": "Fylde", "ons": "E07000119", "tier": "district"},
}

# GOV.UK SeRCOP service expenditure categories
SERVICE_CATEGORIES = [
    "Education services",
    "Highways and transport services",
    "Children Social Care",
    "Adult Social Care",
    "Public Health",
    "Housing services (GFRA only)",
    "Cultural and related services",
    "Environmental and regulatory services",
    "Planning and development services",
    "Police services",
    "Fire and rescue services",
    "Central services",
    "Other services",
]

FINANCIAL_YEARS = ["2021-22", "2022-23", "2023-24", "2024-25"]


def load_json(path):
    """Load JSON file, return None if missing."""
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def get_population(council_id):
    """Get Census 2021 population from demographics.json."""
    demo = load_json(DATA_ROOT / council_id / "demographics.json")
    if demo and "summary" in demo:
        return demo["summary"].get("population", 0)
    return 0


def get_demographics(council_id):
    """Get key demographic indicators from demographics.json."""
    demo = load_json(DATA_ROOT / council_id / "demographics.json")
    result = {
        "population": 0,
        "female_pct": 0,
        "born_uk_pct": 0,
        "born_outside_uk_pct": 0,
        "employment_rate_pct": 0,
        "unemployment_rate_pct": 0,
        "white_pct": 0,
        "asian_pct": 0,
        "over_65_pct": 0,
        "economically_active_pct": 0,
    }
    if not demo or "summary" not in demo:
        return result
    s = demo["summary"]
    result["population"] = s.get("population", 0)
    result["female_pct"] = s.get("female_pct", 0)
    result["born_uk_pct"] = s.get("born_uk_pct", 0)
    result["born_outside_uk_pct"] = s.get("born_outside_uk_pct", 0)
    result["employment_rate_pct"] = s.get("employment_rate_pct", 0)
    result["unemployment_rate_pct"] = s.get("unemployment_rate_pct", 0)
    # Ethnicity breakdown — keys can be "White" (summary) or long-form
    eth = s.get("ethnicity", {})
    if isinstance(eth, dict):
        white_val = eth.get("White", eth.get("White: English, Welsh, Scottish, Northern Irish or British", 0))
        asian_val = eth.get("Asian", eth.get("Asian, Asian British or Asian Welsh", 0))
        result["white_pct"] = white_val.get("pct", 0) if isinstance(white_val, dict) else (white_val or 0)
        result["asian_pct"] = asian_val.get("pct", 0) if isinstance(asian_val, dict) else (asian_val or 0)
    # Age breakdown — estimate over 65
    if "council_totals" in demo and "age" in demo["council_totals"]:
        age_data = demo["council_totals"]["age"]
        total_pop = result["population"]
        if total_pop > 0 and isinstance(age_data, dict):
            over_65 = sum(v for k, v in age_data.items()
                         if k.startswith("Aged ") and _age_over_65(k))
            result["over_65_pct"] = round(over_65 / total_pop * 100, 1)
    # Economically active
    ea = s.get("economically_active", 0)
    ei = s.get("economically_inactive", 0)
    if ea + ei > 0:
        result["economically_active_pct"] = round(ea / (ea + ei) * 100, 1)
    return result


def _age_over_65(age_label):
    """Check if Census age band is 65+."""
    # Census bands: "Aged 65 to 69 years", "Aged 70 to 74 years", etc.
    import re
    m = re.search(r"Aged (\d+)", age_label)
    if m:
        return int(m.group(1)) >= 65
    return False


def get_deprivation(council_id):
    """Get IMD 2019 deprivation summary."""
    dep = load_json(DATA_ROOT / council_id / "deprivation.json")
    if dep and "summary" in dep:
        return {
            "avg_imd_score": dep["summary"].get("avg_imd_score", 0),
            "most_deprived_score": dep["summary"].get("most_deprived_score", 0),
            "least_deprived_score": dep["summary"].get("least_deprived_score", 0),
        }
    return {"avg_imd_score": 0, "most_deprived_score": 0, "least_deprived_score": 0}


def get_spending_summary(council_id):
    """Get AI DOGE spending summary from metadata.json."""
    meta = load_json(DATA_ROOT / council_id / "metadata.json")
    if not meta:
        return {"total_records": 0, "total_spend": 0, "unique_suppliers": 0,
                "num_years": 0, "spending_threshold": 500}
    return {
        "total_records": meta.get("total_records", 0),
        "total_spend": meta.get("total_spend", 0),
        "unique_suppliers": meta.get("unique_suppliers", 0),
        "num_years": len(meta.get("financial_years", [])),
        "spending_threshold": meta.get("spending_threshold", 500),
    }


def get_fraud_triangle(council_id):
    """Get fraud triangle score from doge_findings.json."""
    findings = load_json(DATA_ROOT / council_id / "doge_findings.json")
    if findings and "fraud_triangle" in findings:
        ft = findings["fraud_triangle"]
        return {
            "fraud_score": ft.get("overall_score", 0),
            "fraud_risk": ft.get("risk_level", "unknown"),
            "fraud_signals": ft.get("total_signals", 0),
            "pressure_score": ft.get("dimensions", {}).get("pressure", {}).get("score", 0),
            "opportunity_score": ft.get("dimensions", {}).get("opportunity", {}).get("score", 0),
            "rationalization_score": ft.get("dimensions", {}).get("rationalization", {}).get("score", 0),
        }
    return {"fraud_score": 0, "fraud_risk": "unknown", "fraud_signals": 0,
            "pressure_score": 0, "opportunity_score": 0, "rationalization_score": 0}


def get_efficiency_metrics(council_id):
    """Get supplier concentration from doge_findings.json."""
    findings = load_json(DATA_ROOT / council_id / "doge_findings.json")
    if findings and "supplier_concentration" in findings:
        sc = findings["supplier_concentration"]
        return {
            "hhi": sc.get("hhi", 0),
            "concentration_level": sc.get("concentration_level", "unknown"),
            "top5_pct": sc.get("top5_pct", 0),
            "top10_pct": sc.get("top10_pct", 0),
        }
    return {"hhi": 0, "concentration_level": "unknown", "top5_pct": 0, "top10_pct": 0}


def get_budget_variance(council_id):
    """Get budget variance data from doge_findings.json."""
    findings = load_json(DATA_ROOT / council_id / "doge_findings.json")
    if findings and "budget_variance" in findings:
        bv = findings["budget_variance"]
        return {
            "overall_coverage_pct": bv.get("overall_coverage_pct", 0),
            "total_outturn_pounds": bv.get("total_outturn_pounds", 0),
            "ct_dependency_pct": bv.get("ct_dependency_pct", 0),
        }
    return {"overall_coverage_pct": 0, "total_outturn_pounds": 0, "ct_dependency_pct": 0}


def get_reserves(council_id):
    """Get reserves data from budgets_summary.json."""
    bs = load_json(DATA_ROOT / council_id / "budgets_summary.json")
    if bs and "reserves" in bs:
        r = bs["reserves"]
        return {
            "earmarked_opening": r.get("earmarked_opening", 0),
            "earmarked_closing": r.get("earmarked_closing", 0),
            "unallocated_opening": r.get("unallocated_opening", 0),
            "unallocated_closing": r.get("unallocated_closing", 0),
            "total_reserves_opening": r.get("total_opening", 0),
            "total_reserves_closing": r.get("total_closing", 0),
            "reserves_change": r.get("change", 0),
        }
    return {k: 0 for k in ["earmarked_opening", "earmarked_closing",
                            "unallocated_opening", "unallocated_closing",
                            "total_reserves_opening", "total_reserves_closing",
                            "reserves_change"]}


# ---------------------------------------------------------------------------
# Dataset 1: Panel Dataset
# ---------------------------------------------------------------------------

def export_panel_dataset(output_path):
    """
    Export 15 councils × 4 years × 13 service categories panel dataset.

    Each row = one council × year × service category observation.
    Variables include: outturn spend, tier relevance, DOGE coverage,
    per-capita figures, demographics, deprivation, fraud risk.
    """
    fieldnames = [
        # Identifiers
        "council_id", "council_name", "ons_code", "council_tier",
        "financial_year", "service_category",
        # Budget data (GOV.UK outturn)
        "outturn_thousands", "outturn_pounds",
        "relevant_to_districts", "relevant_to_county", "relevant_to_unitary",
        # Per-capita
        "population_census_2021", "outturn_per_capita",
        # AI DOGE spending (council-level, not category-level — repeated per category)
        "doge_total_records", "doge_total_spend", "doge_unique_suppliers",
        "doge_num_years", "doge_spending_threshold",
        # DOGE budget coverage (council-level)
        "doge_overall_coverage_pct", "total_outturn_all_services",
        # Fraud triangle (council-level)
        "fraud_score", "fraud_risk", "fraud_signals",
        "pressure_score", "opportunity_score", "rationalization_score",
        # Supplier concentration (council-level)
        "hhi", "concentration_level", "top5_supplier_pct", "top10_supplier_pct",
        # Demographics (council-level)
        "female_pct", "white_pct", "asian_pct", "over_65_pct",
        "economically_active_pct", "employment_rate_pct", "unemployment_rate_pct",
        "born_uk_pct",
        # Deprivation (council-level)
        "avg_imd_score", "most_deprived_imd", "least_deprived_imd",
        # Reserves (council-level, latest year only)
        "earmarked_reserves_opening", "earmarked_reserves_closing",
        "unallocated_reserves_opening", "unallocated_reserves_closing",
        "total_reserves_opening", "total_reserves_closing", "reserves_change",
    ]

    rows = []
    for council_id in COUNCILS:
        meta = COUNCIL_META[council_id]
        budgets = load_json(DATA_ROOT / council_id / "budgets_govuk.json")
        if not budgets:
            print(f"  WARN: No budgets_govuk.json for {council_id}, skipping")
            continue

        # Council-level data (same for all category rows within this council)
        pop = get_population(council_id)
        demo = get_demographics(council_id)
        dep = get_deprivation(council_id)
        spending = get_spending_summary(council_id)
        fraud = get_fraud_triangle(council_id)
        efficiency = get_efficiency_metrics(council_id)
        variance = get_budget_variance(council_id)
        reserves = get_reserves(council_id)

        available_years = budgets.get("years", [])

        for year in FINANCIAL_YEARS:
            year_data = budgets.get("by_year", {}).get(year)
            if not year_data:
                continue

            se = year_data.get("revenue_summary", {}).get("service_expenditure", {})

            for category in SERVICE_CATEGORIES:
                cat_data = se.get(category, {})
                outturn_thousands = cat_data.get("value_thousands", 0) or 0
                outturn_pounds = cat_data.get("value_pounds", outturn_thousands * 1000) or 0

                per_capita = round(outturn_pounds / pop, 2) if pop > 0 else 0

                rows.append({
                    "council_id": council_id,
                    "council_name": meta["name"],
                    "ons_code": meta["ons"],
                    "council_tier": meta["tier"],
                    "financial_year": year,
                    "service_category": category,
                    "outturn_thousands": outturn_thousands,
                    "outturn_pounds": outturn_pounds,
                    "relevant_to_districts": 1 if cat_data.get("relevant_to_districts") else 0,
                    "relevant_to_county": 1 if cat_data.get("relevant_to_county") else 0,
                    "relevant_to_unitary": 1 if cat_data.get("relevant_to_unitary") else 0,
                    "population_census_2021": pop,
                    "outturn_per_capita": per_capita,
                    "doge_total_records": spending["total_records"],
                    "doge_total_spend": spending["total_spend"],
                    "doge_unique_suppliers": spending["unique_suppliers"],
                    "doge_num_years": spending["num_years"],
                    "doge_spending_threshold": spending["spending_threshold"],
                    "doge_overall_coverage_pct": variance["overall_coverage_pct"],
                    "total_outturn_all_services": variance["total_outturn_pounds"],
                    "fraud_score": fraud["fraud_score"],
                    "fraud_risk": fraud["fraud_risk"],
                    "fraud_signals": fraud["fraud_signals"],
                    "pressure_score": fraud["pressure_score"],
                    "opportunity_score": fraud["opportunity_score"],
                    "rationalization_score": fraud["rationalization_score"],
                    "hhi": efficiency["hhi"],
                    "concentration_level": efficiency["concentration_level"],
                    "top5_supplier_pct": efficiency["top5_pct"],
                    "top10_supplier_pct": efficiency["top10_pct"],
                    "female_pct": demo["female_pct"],
                    "white_pct": demo["white_pct"],
                    "asian_pct": demo["asian_pct"],
                    "over_65_pct": demo["over_65_pct"],
                    "economically_active_pct": demo["economically_active_pct"],
                    "employment_rate_pct": demo["employment_rate_pct"],
                    "unemployment_rate_pct": demo["unemployment_rate_pct"],
                    "born_uk_pct": demo["born_uk_pct"],
                    "avg_imd_score": dep["avg_imd_score"],
                    "most_deprived_imd": dep["most_deprived_score"],
                    "least_deprived_imd": dep["least_deprived_score"],
                    "earmarked_reserves_opening": reserves["earmarked_opening"],
                    "earmarked_reserves_closing": reserves["earmarked_closing"],
                    "unallocated_reserves_opening": reserves["unallocated_opening"],
                    "unallocated_reserves_closing": reserves["unallocated_closing"],
                    "total_reserves_opening": reserves["total_reserves_opening"],
                    "total_reserves_closing": reserves["total_reserves_closing"],
                    "reserves_change": reserves["reserves_change"],
                })

    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"  Panel dataset: {len(rows)} rows → {output_path}")
    return len(rows)


# ---------------------------------------------------------------------------
# Dataset 2: LGR Model Inputs
# ---------------------------------------------------------------------------

def export_lgr_model_inputs(output_path):
    """
    Export per-proposed-authority aggregated budget data.

    Each row = one proposed unitary authority from an LGR proposal.
    Aggregates constituent council budgets, demographics, deprivation.
    """
    lgr = load_json(DATA_ROOT / "shared" / "lgr_tracker.json")
    if not lgr:
        print("  WARN: No lgr_tracker.json, skipping LGR export")
        return 0

    fieldnames = [
        # Proposal identifiers
        "proposal_id", "proposal_name", "submitted_by",
        "num_unitaries",
        # Authority identifiers
        "authority_name", "constituent_councils",
        # Population
        "population",
        # Financial (latest year GOV.UK outturn sums)
        "total_service_expenditure", "education", "highways_transport",
        "children_social_care", "adult_social_care", "public_health",
        "housing", "cultural", "environmental", "planning",
        "central_services", "other_services",
        # Reserves
        "total_reserves_closing",
        # Efficiency
        "avg_fraud_score", "avg_hhi",
        # Demographics
        "avg_imd_score", "white_pct", "asian_pct", "over_65_pct",
        "economically_active_pct",
        # CCN estimates
        "ccn_annual_savings", "ccn_transition_cost",
        # AI DOGE estimates
        "doge_annual_savings", "doge_transition_cost", "doge_payback_years",
        # DOGE spending coverage
        "total_doge_records", "total_doge_spend",
        # Service expenditure per capita
        "total_service_expenditure_per_capita",
        "central_services_per_capita",
    ]

    # Pre-load all council data
    council_data = {}
    for cid in COUNCILS:
        budgets = load_json(DATA_ROOT / cid / "budgets_govuk.json")
        latest_year = None
        latest_se = {}
        if budgets:
            latest_year = budgets.get("latest_year", "2024-25")
            yr = budgets.get("by_year", {}).get(latest_year, {})
            latest_se = yr.get("revenue_summary", {}).get("service_expenditure", {})

        council_data[cid] = {
            "budgets_se": latest_se,
            "population": get_population(cid),
            "demographics": get_demographics(cid),
            "deprivation": get_deprivation(cid),
            "fraud": get_fraud_triangle(cid),
            "efficiency": get_efficiency_metrics(cid),
            "spending": get_spending_summary(cid),
            "reserves": get_reserves(cid),
        }

    rows = []
    for proposal in lgr.get("proposed_models", []):
        pid = proposal.get("id", "")
        pname = proposal.get("name", "")
        submitted_by = proposal.get("submitted_by", "")
        num_ua = proposal.get("num_authorities", 0)

        for authority in proposal.get("authorities", []):
            auth_name = authority.get("name", "")
            councils = authority.get("councils", [])
            auth_pop = authority.get("population", 0)

            # Aggregate financials from constituent councils
            agg_se = {}
            for cat in SERVICE_CATEGORIES:
                total = 0
                for cid in councils:
                    if cid in council_data:
                        cat_data = council_data[cid]["budgets_se"].get(cat, {})
                        total += (cat_data.get("value_pounds", 0) or 0)
                agg_se[cat] = total

            total_service_exp = sum(agg_se.values())

            # Aggregate reserves
            total_reserves = sum(
                council_data[cid]["reserves"]["total_reserves_closing"]
                for cid in councils if cid in council_data
            )

            # Average fraud scores
            fraud_scores = [council_data[cid]["fraud"]["fraud_score"]
                          for cid in councils if cid in council_data
                          and council_data[cid]["fraud"]["fraud_score"] > 0]
            avg_fraud = round(sum(fraud_scores) / len(fraud_scores), 1) if fraud_scores else 0

            # Average HHI
            hhis = [council_data[cid]["efficiency"]["hhi"]
                   for cid in councils if cid in council_data
                   and council_data[cid]["efficiency"]["hhi"] > 0]
            avg_hhi = round(sum(hhis) / len(hhis), 0) if hhis else 0

            # Weighted demographics (by population)
            total_pop_weighted = sum(council_data[cid]["demographics"]["population"]
                                    for cid in councils if cid in council_data)
            w_imd = 0
            w_white = 0
            w_asian = 0
            w_over65 = 0
            w_econ = 0
            for cid in councils:
                if cid not in council_data:
                    continue
                cd = council_data[cid]
                p = cd["demographics"]["population"]
                if total_pop_weighted > 0:
                    w = p / total_pop_weighted
                    w_imd += cd["deprivation"]["avg_imd_score"] * w
                    w_white += cd["demographics"]["white_pct"] * w
                    w_asian += cd["demographics"]["asian_pct"] * w
                    w_over65 += cd["demographics"]["over_65_pct"] * w
                    w_econ += cd["demographics"]["economically_active_pct"] * w

            # DOGE spending aggregates
            total_doge_records = sum(
                council_data[cid]["spending"]["total_records"]
                for cid in councils if cid in council_data
            )
            total_doge_spend = sum(
                council_data[cid]["spending"]["total_spend"]
                for cid in councils if cid in council_data
            )

            # Per-capita
            tse_pc = round(total_service_exp / auth_pop, 2) if auth_pop > 0 else 0
            central_pc = round(agg_se.get("Central services", 0) / auth_pop, 2) if auth_pop > 0 else 0

            rows.append({
                "proposal_id": pid,
                "proposal_name": pname,
                "submitted_by": submitted_by,
                "num_unitaries": num_ua,
                "authority_name": auth_name,
                "constituent_councils": "|".join(councils),
                "population": auth_pop,
                "total_service_expenditure": total_service_exp,
                "education": agg_se.get("Education services", 0),
                "highways_transport": agg_se.get("Highways and transport services", 0),
                "children_social_care": agg_se.get("Children Social Care", 0),
                "adult_social_care": agg_se.get("Adult Social Care", 0),
                "public_health": agg_se.get("Public Health", 0),
                "housing": agg_se.get("Housing services (GFRA only)", 0),
                "cultural": agg_se.get("Cultural and related services", 0),
                "environmental": agg_se.get("Environmental and regulatory services", 0),
                "planning": agg_se.get("Planning and development services", 0),
                "central_services": agg_se.get("Central services", 0),
                "other_services": agg_se.get("Other services", 0),
                "total_reserves_closing": total_reserves,
                "avg_fraud_score": avg_fraud,
                "avg_hhi": avg_hhi,
                "avg_imd_score": round(w_imd, 1),
                "white_pct": round(w_white, 1),
                "asian_pct": round(w_asian, 1),
                "over_65_pct": round(w_over65, 1),
                "economically_active_pct": round(w_econ, 1),
                "ccn_annual_savings": proposal.get("ccn_annual_savings", 0),
                "ccn_transition_cost": proposal.get("ccn_transition_cost", 0),
                "doge_annual_savings": proposal.get("doge_annual_savings", 0),
                "doge_transition_cost": proposal.get("doge_transition_cost", 0),
                "doge_payback_years": proposal.get("doge_payback_years", 0),
                "total_doge_records": total_doge_records,
                "total_doge_spend": total_doge_spend,
                "total_service_expenditure_per_capita": tse_pc,
                "central_services_per_capita": central_pc,
            })

    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"  LGR model inputs: {len(rows)} rows → {output_path}")
    return len(rows)


# ---------------------------------------------------------------------------
# Dataset 3: Cross-Council Efficiency
# ---------------------------------------------------------------------------

def export_cross_council_efficiency(output_path):
    """
    Export per-capita standardised spending by service, tier-adjusted.

    Each row = one council with per-capita spend across all services,
    efficiency metrics, and tier-adjustment flags.
    """
    fieldnames = [
        # Identifiers
        "council_id", "council_name", "ons_code", "council_tier",
        "population_census_2021",
        # Latest year outturn
        "financial_year",
        "total_service_expenditure", "total_service_expenditure_per_capita",
        # Per-capita by service
        "education_per_capita",
        "highways_transport_per_capita",
        "children_social_care_per_capita",
        "adult_social_care_per_capita",
        "public_health_per_capita",
        "housing_per_capita",
        "cultural_per_capita",
        "environmental_per_capita",
        "planning_per_capita",
        "central_services_per_capita",
        "other_services_per_capita",
        # Efficiency metrics
        "hhi", "concentration_level",
        "top5_supplier_pct", "top10_supplier_pct",
        "fraud_score", "fraud_risk",
        "pressure_score", "opportunity_score", "rationalization_score",
        # DOGE coverage
        "doge_total_records", "doge_total_spend",
        "doge_coverage_pct",
        "doge_spending_threshold",
        # Budget efficiency ratings (from budget_efficiency.json)
        "red_categories", "amber_categories", "green_categories",
        # Reserves
        "total_reserves_closing", "reserves_per_capita",
        "reserves_change",
        # Demographics
        "avg_imd_score",
        "white_pct", "asian_pct", "over_65_pct",
        "economically_active_pct",
        # Political (from politics_summary.json)
        "ruling_party", "political_control",
    ]

    cat_to_field = {
        "Education services": "education_per_capita",
        "Highways and transport services": "highways_transport_per_capita",
        "Children Social Care": "children_social_care_per_capita",
        "Adult Social Care": "adult_social_care_per_capita",
        "Public Health": "public_health_per_capita",
        "Housing services (GFRA only)": "housing_per_capita",
        "Cultural and related services": "cultural_per_capita",
        "Environmental and regulatory services": "environmental_per_capita",
        "Planning and development services": "planning_per_capita",
        "Central services": "central_services_per_capita",
        "Other services": "other_services_per_capita",
    }

    rows = []
    for council_id in COUNCILS:
        meta = COUNCIL_META[council_id]
        pop = get_population(council_id)
        budgets = load_json(DATA_ROOT / council_id / "budgets_govuk.json")
        if not budgets:
            continue

        latest_year = budgets.get("latest_year", "2024-25")
        yr = budgets.get("by_year", {}).get(latest_year, {})
        se = yr.get("revenue_summary", {}).get("service_expenditure", {})

        # Per-capita by service
        per_capita = {}
        total_se = 0
        for cat, field in cat_to_field.items():
            val = se.get(cat, {}).get("value_pounds", 0) or 0
            total_se += val
            per_capita[field] = round(val / pop, 2) if pop > 0 else 0

        tse_pc = round(total_se / pop, 2) if pop > 0 else 0

        # Efficiency
        efficiency = get_efficiency_metrics(council_id)
        fraud = get_fraud_triangle(council_id)
        spending = get_spending_summary(council_id)
        variance = get_budget_variance(council_id)
        reserves = get_reserves(council_id)
        dep = get_deprivation(council_id)
        demo = get_demographics(council_id)

        # Budget efficiency ratings
        be = load_json(DATA_ROOT / council_id / "budget_efficiency.json")
        red = amber = green = 0
        if be and "categories" in be:
            for cat_info in be["categories"].values():
                rating = cat_info.get("rating", "")
                if rating == "red":
                    red += 1
                elif rating == "amber":
                    amber += 1
                elif rating == "green":
                    green += 1

        # Political control — derived from party seat counts
        # Two formats: by_party [{party, count}] or parties [{name, seats}]
        politics = load_json(DATA_ROOT / council_id / "politics_summary.json")
        ruling_party = ""
        political_control = ""
        if politics:
            # Try direct control field first (Rossendale format)
            if "control" in politics and politics["control"]:
                ctrl = politics["control"]
                # "Labour majority" → ruling_party="Labour", political_control="majority"
                parts = ctrl.rsplit(" ", 1)
                if len(parts) == 2 and parts[1].lower() in ("majority", "coalition", "noc"):
                    ruling_party = parts[0]
                    political_control = parts[1].lower()
                else:
                    political_control = ctrl.lower()
            # Try by_party format (most councils)
            parties_list = politics.get("by_party") or []
            if not parties_list:
                # Alternative format: parties [{name, seats}]
                alt = politics.get("parties") or []
                parties_list = [{"party": p.get("name", ""), "count": p.get("seats", 0)} for p in alt]
            if parties_list and not ruling_party:
                sorted_parties = sorted(parties_list, key=lambda x: x.get("count", 0), reverse=True)
                ruling_party = sorted_parties[0].get("party", "")
                top_seats = sorted_parties[0].get("count", 0)
                total = politics.get("total_councillors", politics.get("total_seats",
                        sum(p.get("count", 0) for p in parties_list)))
                majority = politics.get("majority_threshold", total // 2 + 1)
                if top_seats >= majority:
                    political_control = "majority"
                elif politics.get("coalition"):
                    political_control = "coalition"
                else:
                    political_control = "noc"

        reserves_pc = round(reserves["total_reserves_closing"] / pop, 2) if pop > 0 else 0

        row = {
            "council_id": council_id,
            "council_name": meta["name"],
            "ons_code": meta["ons"],
            "council_tier": meta["tier"],
            "population_census_2021": pop,
            "financial_year": latest_year,
            "total_service_expenditure": total_se,
            "total_service_expenditure_per_capita": tse_pc,
            **per_capita,
            "hhi": efficiency["hhi"],
            "concentration_level": efficiency["concentration_level"],
            "top5_supplier_pct": efficiency["top5_pct"],
            "top10_supplier_pct": efficiency["top10_pct"],
            "fraud_score": fraud["fraud_score"],
            "fraud_risk": fraud["fraud_risk"],
            "pressure_score": fraud["pressure_score"],
            "opportunity_score": fraud["opportunity_score"],
            "rationalization_score": fraud["rationalization_score"],
            "doge_total_records": spending["total_records"],
            "doge_total_spend": spending["total_spend"],
            "doge_coverage_pct": variance["overall_coverage_pct"],
            "doge_spending_threshold": spending["spending_threshold"],
            "red_categories": red,
            "amber_categories": amber,
            "green_categories": green,
            "total_reserves_closing": reserves["total_reserves_closing"],
            "reserves_per_capita": reserves_pc,
            "reserves_change": reserves["reserves_change"],
            "avg_imd_score": dep["avg_imd_score"],
            "white_pct": demo["white_pct"],
            "asian_pct": demo["asian_pct"],
            "over_65_pct": demo["over_65_pct"],
            "economically_active_pct": demo["economically_active_pct"],
            "ruling_party": ruling_party,
            "political_control": political_control,
        }
        rows.append(row)

    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"  Cross-council efficiency: {len(rows)} rows → {output_path}")
    return len(rows)


# ---------------------------------------------------------------------------
# Codebook
# ---------------------------------------------------------------------------

def export_codebook(output_path):
    """Generate a plain-text codebook documenting all variables."""
    codebook = """ACADEMIC EXPORT CODEBOOK
========================
Generated: {date}
Project: AI DOGE Lancashire — Public Spending Transparency Platform
URL: https://aidoge.co.uk
Data coverage: 15 Lancashire councils, 2,286,000+ transactions, £12B+ tracked

================================================================================
DATASET 1: panel_dataset.csv
================================================================================
Unit of observation: council × financial_year × service_category
Dimensions: 15 councils × 4 years (2021-22 to 2024-25) × 13 service categories

IDENTIFIERS
  council_id              String. Internal identifier (e.g. "burnley", "lancashire_cc")
  council_name            String. Official name
  ons_code                String. ONS geography code (E07xxx=district, E10xxx=county, E06xxx=unitary)
  council_tier            String. "district", "county", or "unitary"
  financial_year          String. UK financial year "YYYY-YY" (April to March)
  service_category        String. GOV.UK SeRCOP service expenditure category (13 categories)

BUDGET DATA (GOV.UK MHCLG Revenue Outturn)
  outturn_thousands       Numeric. Service expenditure in £thousands (as published)
  outturn_pounds          Numeric. Service expenditure in £ (converted)
  relevant_to_districts   Binary. 1 if service is a district council responsibility
  relevant_to_county      Binary. 1 if service is a county council responsibility
  relevant_to_unitary     Binary. 1 if service is a unitary council responsibility

  NOTE: Districts provide housing, planning, environmental, cultural services.
        County provides education, social care, highways, fire. Unitaries provide all.
        Negative values indicate net income (e.g. HRA housing, grants exceeding cost).

PER-CAPITA
  population_census_2021  Numeric. Census 2021 usually resident population
  outturn_per_capita      Numeric. outturn_pounds / population. £ per head.

AI DOGE SPENDING DATA (council-level, repeated per category row)
  doge_total_records      Numeric. Total spending transactions in AI DOGE dataset
  doge_total_spend        Numeric. Total £ value of all transactions
  doge_unique_suppliers   Numeric. Distinct supplier count
  doge_num_years          Numeric. Number of financial years covered
  doge_spending_threshold Numeric. Minimum transaction value (£500 for most, £250 for LCC)
  doge_overall_coverage_pct Numeric. Annualised DOGE spend as %% of GOV.UK outturn

  CAVEAT: DOGE data has a £500+ threshold (£250 for LCC). Coverage >100%% can occur
  because DOGE captures multi-year data annualised against single-year outturn, and
  because large transactions are disproportionately represented.

FRAUD TRIANGLE (Cressey 1953, council-level)
  fraud_score             Numeric 0-100. Composite fraud risk score
  fraud_risk              String. "low", "medium", or "high"
  fraud_signals           Numeric. Count of active risk signals
  pressure_score          Numeric 0-100. Financial pressure dimension
  opportunity_score       Numeric 0-100. Control weakness dimension
  rationalization_score   Numeric 0-100. Institutional culture dimension

SUPPLIER CONCENTRATION (council-level)
  hhi                     Numeric 0-10000. Herfindahl-Hirschman Index
                          <1500=low, 1500-2500=moderate, >2500=high concentration
  concentration_level     String. "low", "moderate", or "high"
  top5_supplier_pct       Numeric. Top 5 suppliers' share of total spend (%%)
  top10_supplier_pct      Numeric. Top 10 suppliers' share of total spend (%%)

DEMOGRAPHICS (Census 2021, council-level)
  female_pct              Numeric. Female population %%
  white_pct               Numeric. White ethnic group %%
  asian_pct               Numeric. Asian ethnic group %%
  over_65_pct             Numeric. Population aged 65+ %%
  economically_active_pct Numeric. Economically active as %% of working-age population
  employment_rate_pct     Numeric. Employment rate %%
  unemployment_rate_pct   Numeric. Unemployment rate %%
  born_uk_pct             Numeric. Born in UK %%

DEPRIVATION (IMD 2019, council-level)
  avg_imd_score           Numeric. Average Index of Multiple Deprivation score (higher=more deprived)
  most_deprived_imd       Numeric. Highest ward IMD score
  least_deprived_imd      Numeric. Lowest ward IMD score

RESERVES (GOV.UK, latest year, council-level)
  earmarked_reserves_opening   Numeric £. Earmarked reserves at start of year
  earmarked_reserves_closing   Numeric £. Earmarked reserves at end of year
  unallocated_reserves_opening Numeric £. Unallocated reserves at start of year
  unallocated_reserves_closing Numeric £. Unallocated reserves at end of year
  total_reserves_opening       Numeric £. Total reserves at start of year
  total_reserves_closing       Numeric £. Total reserves at end of year
  reserves_change              Numeric £. Change in total reserves

================================================================================
DATASET 2: lgr_model_inputs.csv
================================================================================
Unit of observation: proposed_authority within an LGR proposal
Purpose: Financial modelling for Local Government Reorganisation

PROPOSAL IDENTIFIERS
  proposal_id             String. Internal ID (e.g. "two_unitary", "four_unitary_alt")
  proposal_name           String. Proposal name
  submitted_by            String. Organisation that submitted the proposal
  num_unitaries           Numeric. Number of proposed unitary authorities

AUTHORITY IDENTIFIERS
  authority_name          String. Proposed authority name (e.g. "North Lancashire")
  constituent_councils    String. Pipe-delimited council IDs (e.g. "burnley|pendle|rossendale")
  population              Numeric. Combined population of constituent councils

FINANCIAL (aggregated GOV.UK 2024-25 outturn across constituents)
  total_service_expenditure  Numeric £. Sum of all service expenditure
  education                  Numeric £. Education services
  highways_transport         Numeric £. Highways and transport
  children_social_care       Numeric £. Children's social care
  adult_social_care          Numeric £. Adult social care
  public_health              Numeric £. Public health
  housing                    Numeric £. Housing services
  cultural                   Numeric £. Cultural and related services
  environmental              Numeric £. Environmental and regulatory
  planning                   Numeric £. Planning and development
  central_services           Numeric £. Central services (key for back-office savings)
  other_services             Numeric £. Other services
  total_reserves_closing     Numeric £. Combined closing reserves

EFFICIENCY METRICS
  avg_fraud_score         Numeric. Mean fraud triangle score of constituent councils
  avg_hhi                 Numeric. Mean HHI of constituent councils

DEMOGRAPHICS (population-weighted averages)
  avg_imd_score           Numeric. Weighted average IMD score
  white_pct               Numeric. Weighted White ethnic group %%
  asian_pct               Numeric. Weighted Asian ethnic group %%
  over_65_pct             Numeric. Weighted 65+ population %%
  economically_active_pct Numeric. Weighted economic activity %%

SAVINGS ESTIMATES
  ccn_annual_savings      Numeric £. County Councils Network estimated annual savings
  ccn_transition_cost     Numeric £. CCN estimated transition cost
  doge_annual_savings     Numeric £. AI DOGE independent model annual savings
  doge_transition_cost    Numeric £. AI DOGE estimated transition cost
  doge_payback_years      Numeric. AI DOGE estimated payback period

DOGE COVERAGE
  total_doge_records      Numeric. Combined transaction count
  total_doge_spend        Numeric £. Combined spending value

PER-CAPITA
  total_service_expenditure_per_capita  Numeric £. Per head
  central_services_per_capita          Numeric £. Back-office per head

================================================================================
DATASET 3: cross_council_efficiency.csv
================================================================================
Unit of observation: council (latest financial year)
Purpose: Cross-council efficiency comparison with tier adjustment

  All per-capita variables: Numeric £. Latest year outturn divided by Census 2021 population
  red_categories          Numeric. Count of service categories rated "red" (3+ issues)
  amber_categories        Numeric. Count of service categories rated "amber" (1-2 issues)
  green_categories        Numeric. Count of service categories rated "green" (0 issues)
  reserves_per_capita     Numeric £. Closing reserves per head
  ruling_party            String. Ruling party name
  political_control       String. Control type (e.g. "majority", "coalition", "noc")

================================================================================
DATA SOURCES
================================================================================
1. GOV.UK MHCLG Revenue Outturn (RS, RSX, RO2, RO4, RO5, RO6 ODS files)
   https://www.gov.uk/government/collections/local-authority-revenue-expenditure-and-financing
   Licence: Open Government Licence v3.0

2. AI DOGE spending data — council transparency publications (>£500 threshold)
   Various council websites. All 15 Lancashire councils.

3. Census 2021 — ONS Nomis API (age, sex, ethnicity, religion, economic activity)
   https://www.nomisweb.co.uk/

4. Index of Multiple Deprivation 2019 — MHCLG + ONS ArcGIS
   https://www.gov.uk/government/statistics/english-indices-of-deprivation-2019

5. Contracts Finder — Crown Commercial Service
   https://www.contractsfinder.service.gov.uk/

6. Companies House API — company status, directors, filing compliance
   https://developer.company-information.service.gov.uk/

ACADEMIC REFERENCES
  Andrews, R. & Boyne, G. (2009). Size, structure and administrative overheads:
    An empirical analysis of English local authorities. Urban Studies, 46(4), 739-759.
  Cheshire, P. (2004). Resurgent cities, urban myths and policy hubris.
    Urban Studies, 43(8), 1231-1246.
  Dollery, B. & Fleming, E. (2006). A conceptual note on scale economies,
    size economies and scope economies in Australian local government.
    Urban Policy and Research, 24(2), 271-282.
  Slack, E. & Bird, R. (2012). Merging municipalities: Is bigger better?
    IMFG Papers on Municipal Finance and Governance, No. 14.

CITATION
  If using this data, please cite:
  AI DOGE Lancashire (2026). Public Spending Transparency Platform.
  Available at: https://aidoge.co.uk. Data exported {date}.
""".format(date=datetime.now().strftime("%Y-%m-%d %H:%M"))

    with open(output_path, "w") as f:
        f.write(codebook)

    print(f"  Codebook → {output_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Export academic datasets")
    parser.add_argument("--output-dir", default=str(PROJECT_ROOT / "academic_export"),
                       help="Output directory for CSV files")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Academic Export — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"Output directory: {output_dir}")
    print()

    # Dataset 1: Panel
    print("1. Panel dataset (15 councils × 4 years × 13 categories)...")
    n1 = export_panel_dataset(output_dir / "panel_dataset.csv")

    # Dataset 2: LGR
    print("2. LGR model inputs (per proposed authority)...")
    n2 = export_lgr_model_inputs(output_dir / "lgr_model_inputs.csv")

    # Dataset 3: Cross-council
    print("3. Cross-council efficiency comparison...")
    n3 = export_cross_council_efficiency(output_dir / "cross_council_efficiency.csv")

    # Codebook
    print("4. Codebook...")
    export_codebook(output_dir / "codebook.txt")

    print()
    print(f"Export complete: {n1 + n2 + n3} total rows across 3 datasets")
    print(f"Files: {output_dir}/")
    for f in sorted(output_dir.iterdir()):
        size = f.stat().st_size
        if size > 1024:
            print(f"  {f.name} ({size/1024:.1f} KB)")
        else:
            print(f"  {f.name} ({size} bytes)")


if __name__ == "__main__":
    main()
