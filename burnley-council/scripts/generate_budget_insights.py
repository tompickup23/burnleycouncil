#!/usr/bin/env python3
"""
Generate budget_insights.json for councils from their budgets_summary.json data.

Reads multi-year MHCLG Revenue Outturn data and produces:
- yoy_changes: year-over-year budget changes
- budget_trends: time series of budgets and council tax
- efficiency_metrics: growth rates and coverage
- political_highlights: data-driven insights about reserves, services, CT dependency

Usage:
    /usr/bin/python3 burnley-council/scripts/generate_budget_insights.py
    /usr/bin/python3 burnley-council/scripts/generate_budget_insights.py --council pendle
"""

import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")

# Councils that need budget_insights.json generated
TARGET_COUNCILS = [
    "pendle", "rossendale", "lancaster", "ribble_valley",
    "chorley", "south_ribble", "lancashire_cc", "blackpool",
    "west_lancashire", "blackburn", "wyre", "preston", "fylde"
]


def convert_year_format(year_str):
    """Convert '2021-22' to '2021/22' format used in budget_insights."""
    if "-" in year_str:
        parts = year_str.split("-")
        return parts[0] + "/" + parts[1]
    return year_str


def load_budgets_summary(council_id):
    """Load budgets_summary.json for a council."""
    path = os.path.join(DATA_DIR, council_id, "budgets_summary.json")
    if not os.path.exists(path):
        print("  WARNING: No budgets_summary.json found for %s" % council_id)
        return None
    with open(path, "r") as f:
        return json.load(f)


def get_budget_series(summary):
    """Extract budget time series from year_summaries or headline_trends."""
    budgets = {}

    # Try year_summaries first (most reliable)
    if "year_summaries" in summary:
        for year, data in summary["year_summaries"].items():
            val = data.get("total_service_expenditure")
            if val is not None and val != 0:
                budgets[year] = val

    # Fallback: headline_trends
    if not budgets and "trends" in summary and "headline_trends" in summary["trends"]:
        tse = summary["trends"]["headline_trends"].get("TOTAL SERVICE EXPENDITURE", [])
        for entry in tse:
            if entry.get("value") is not None and entry["value"] != 0:
                budgets[entry["year"]] = entry["value"]

    return budgets


def get_ct_requirement_series(summary):
    """Extract council tax requirement time series."""
    ct_req = {}
    if "year_summaries" in summary:
        for year, data in summary["year_summaries"].items():
            val = data.get("council_tax_requirement")
            if val is not None:
                ct_req[year] = val
    return ct_req


def get_reserves_series(summary):
    """Extract reserves time series from trends."""
    reserves = {}
    if "trends" in summary and "reserves_trends" in summary["trends"]:
        for year, data in summary["trends"]["reserves_trends"].items():
            if data.get("total") is not None:
                reserves[year] = data
    return reserves


def get_service_trends(summary):
    """Extract service-level trend data."""
    if "trends" in summary and "service_trends" in summary["trends"]:
        return summary["trends"]["service_trends"]
    return {}


def build_yoy_changes(budget_series):
    """Build year-over-year change entries."""
    sorted_years = sorted(budget_series.keys())
    changes = []
    for i in range(1, len(sorted_years)):
        prev_year = sorted_years[i - 1]
        curr_year = sorted_years[i]
        prev_val = budget_series[prev_year]
        curr_val = budget_series[curr_year]
        change_amt = curr_val - prev_val
        change_pct = round((change_amt / prev_val) * 100, 2) if prev_val != 0 else 0.0
        changes.append({
            "from_year": convert_year_format(prev_year),
            "to_year": convert_year_format(curr_year),
            "previous_budget": prev_val,
            "current_budget": curr_val,
            "change_amount": change_amt,
            "change_percent": change_pct
        })
    return changes


def build_budget_trends(budget_series, ct_band_d):
    """Build budget_trends with years, budgets, and council_tax_elements."""
    sorted_years = sorted(budget_series.keys())
    years_display = [convert_year_format(y) for y in sorted_years]
    budgets = [budget_series[y] for y in sorted_years]

    # Match council tax Band D values to budget years
    ct_elements = []
    for y in sorted_years:
        display_year = convert_year_format(y)
        ct_val = ct_band_d.get(display_year)
        ct_elements.append(ct_val)

    return {
        "years": years_display,
        "budgets": budgets,
        "council_tax_elements": ct_elements
    }


def build_efficiency_metrics(budget_series):
    """Compute efficiency/growth metrics."""
    sorted_years = sorted(budget_series.keys())
    if len(sorted_years) < 2:
        earliest = sorted_years[0] if sorted_years else None
        latest = sorted_years[-1] if sorted_years else None
        val = budget_series.get(earliest, 0) if earliest else 0
        return {
            "total_budget_growth_pct": 0.0,
            "years_covered": len(sorted_years),
            "avg_annual_growth_pct": 0.0,
            "latest_budget": val,
            "earliest_budget": val,
            "earliest_year": convert_year_format(earliest) if earliest else "",
            "latest_year": convert_year_format(latest) if latest else ""
        }

    earliest_year = sorted_years[0]
    latest_year = sorted_years[-1]
    earliest_val = budget_series[earliest_year]
    latest_val = budget_series[latest_year]
    n_years = len(sorted_years)

    if earliest_val != 0:
        total_growth = round(((latest_val - earliest_val) / earliest_val) * 100, 1)
        avg_annual = round(total_growth / max(n_years - 1, 1), 1)
    else:
        total_growth = 0.0
        avg_annual = 0.0

    return {
        "total_budget_growth_pct": total_growth,
        "years_covered": n_years,
        "avg_annual_growth_pct": avg_annual,
        "latest_budget": latest_val,
        "earliest_budget": earliest_val,
        "earliest_year": convert_year_format(earliest_year),
        "latest_year": convert_year_format(latest_year)
    }


def format_amount(amount):
    """Format amount for human-readable display in highlights."""
    abs_amount = abs(amount)
    if abs_amount >= 1000000000:
        return "%.1fB" % (amount / 1000000000)
    elif abs_amount >= 1000000:
        return "%.1fM" % (amount / 1000000)
    elif abs_amount >= 1000:
        return "%.0fK" % (amount / 1000)
    else:
        return str(amount)


def build_political_highlights(summary, budget_series, ct_req_series, reserves_series, service_trends):
    """Generate data-driven political highlights."""
    highlights = []
    sorted_years = sorted(budget_series.keys())
    latest_year = sorted_years[-1] if sorted_years else None
    latest_year_display = convert_year_format(latest_year) if latest_year else ""

    # --- RESERVES ANALYSIS ---
    if reserves_series:
        sorted_res_years = sorted(reserves_series.keys())
        if len(sorted_res_years) >= 2:
            first_res = reserves_series[sorted_res_years[0]]
            last_res = reserves_series[sorted_res_years[-1]]
            first_total = first_res.get("total", 0) or 0
            last_total = last_res.get("total", 0) or 0

            if first_total > 0:
                res_change_pct = round(((last_total - first_total) / first_total) * 100, 1)

                if last_total < 100000 and first_total > 500000:
                    # Near exhaustion
                    highlights.append({
                        "type": "reserves_exhaustion",
                        "year": latest_year_display,
                        "description": "Reserves dropped from %s to %s (%s%% decline) -- the council is running dangerously low on reserves" % (
                            format_amount(first_total),
                            format_amount(last_total),
                            abs(res_change_pct)
                        )
                    })
                elif res_change_pct < -20:
                    highlights.append({
                        "type": "reserves_declining",
                        "year": latest_year_display,
                        "description": "Reserves fell from %s to %s (%s%% decline over %d years)" % (
                            format_amount(first_total),
                            format_amount(last_total),
                            abs(res_change_pct),
                            len(sorted_res_years)
                        )
                    })
                elif res_change_pct > 20:
                    highlights.append({
                        "type": "reserves_growing",
                        "year": latest_year_display,
                        "description": "Reserves grew from %s to %s (+%s%% over %d years)" % (
                            format_amount(first_total),
                            format_amount(last_total),
                            res_change_pct,
                            len(sorted_res_years)
                        )
                    })

        # Check unallocated reserves specifically
        if latest_year and latest_year in reserves_series:
            latest_res = reserves_series[latest_year]
            unalloc = latest_res.get("unallocated", 0) or 0
            latest_budget = budget_series.get(latest_year, 0)
            if latest_budget > 0 and unalloc > 0:
                unalloc_pct = round((unalloc / latest_budget) * 100, 1)
                if unalloc_pct < 3:
                    highlights.append({
                        "type": "low_unallocated_reserves",
                        "year": latest_year_display,
                        "description": "Unallocated reserves at just %s (%s%% of budget) -- below recommended 5%% minimum" % (
                            format_amount(unalloc),
                            unalloc_pct
                        )
                    })

    # --- COUNCIL TAX DEPENDENCY ---
    if ct_req_series and latest_year and latest_year in ct_req_series:
        latest_budget = budget_series.get(latest_year, 0)
        latest_ct = ct_req_series.get(latest_year, 0)
        if latest_budget > 0 and latest_ct > 0:
            ct_pct = round((latest_ct / latest_budget) * 100, 0)

            # Also check CT growth over time
            sorted_ct_years = sorted(ct_req_series.keys())
            if len(sorted_ct_years) >= 2:
                first_ct = ct_req_series[sorted_ct_years[0]]
                last_ct = ct_req_series[sorted_ct_years[-1]]
                if first_ct > 0:
                    ct_growth = round(((last_ct - first_ct) / first_ct) * 100, 1)
                    n_ct_years = len(sorted_ct_years)
                    highlights.append({
                        "type": "council_tax_dependency",
                        "year": latest_year_display,
                        "value": int(ct_pct),
                        "description": "%d%% of budget funded by Council Tax -- CT income grew %s%% over %d years" % (
                            int(ct_pct), ct_growth, n_ct_years
                        )
                    })

    # --- CENTRAL SERVICES AS % OF TOTAL ---
    if latest_year:
        latest_budget = budget_series.get(latest_year, 0)
        service_breakdown = {}
        if "year_summaries" in summary and latest_year in summary["year_summaries"]:
            service_breakdown = summary["year_summaries"][latest_year].get("service_breakdown", {})
        elif "service_breakdown" in summary:
            service_breakdown = summary["service_breakdown"]

        if service_breakdown and latest_budget > 0:
            central = service_breakdown.get("Central services", 0)
            if central and central > 0:
                central_pct = round((central / latest_budget) * 100, 1)
                if central_pct > 25:
                    highlights.append({
                        "type": "high_central_services",
                        "year": latest_year_display,
                        "description": "Central services account for %s%% of total budget (%s) -- above typical 15-20%% range" % (
                            central_pct,
                            format_amount(central)
                        )
                    })

    # --- LARGEST SERVICE ---
    if latest_year:
        service_breakdown = {}
        if "year_summaries" in summary and latest_year in summary["year_summaries"]:
            service_breakdown = summary["year_summaries"][latest_year].get("service_breakdown", {})
        elif "service_breakdown" in summary:
            service_breakdown = summary["service_breakdown"]

        if service_breakdown:
            # Find largest service (excluding those with value <= 0)
            positive_services = {k: v for k, v in service_breakdown.items() if v and v > 0}
            if positive_services:
                largest_service = max(positive_services, key=positive_services.get)
                largest_val = positive_services[largest_service]
                latest_budget = budget_series.get(latest_year, 0)
                if latest_budget > 0:
                    service_pct = round((largest_val / latest_budget) * 100, 1)
                    highlights.append({
                        "type": "largest_service",
                        "year": latest_year_display,
                        "description": "%s is the largest spending area at %s (%s%% of total budget)" % (
                            largest_service,
                            format_amount(largest_val),
                            service_pct
                        )
                    })

    # --- FASTEST GROWING SERVICE ---
    if service_trends:
        growth_rates = {}
        for key, val in service_trends.items():
            if key.endswith("_change_pct") and val is not None:
                service_name = key.replace("_change_pct", "")
                # Skip "Other services" and services with zero/negligible values
                if service_name in ("Other services", "Fire and rescue services", "Police services"):
                    continue
                # Only include if the service has meaningful values
                trend_data = service_trends.get(service_name, [])
                if isinstance(trend_data, list):
                    non_null_vals = [e.get("value", 0) for e in trend_data if e.get("value") is not None and e.get("value") != 0]
                    if len(non_null_vals) >= 2:
                        growth_rates[service_name] = val

        if growth_rates:
            fastest = max(growth_rates, key=growth_rates.get)
            fastest_pct = growth_rates[fastest]
            if fastest_pct > 15:
                highlights.append({
                    "type": "fastest_growing_service",
                    "year": latest_year_display,
                    "description": "%s grew %s%% over the period -- the fastest growing service area" % (
                        fastest,
                        fastest_pct
                    )
                })

            # Also flag fastest declining if significant
            slowest = min(growth_rates, key=growth_rates.get)
            slowest_pct = growth_rates[slowest]
            if slowest_pct < -20:
                highlights.append({
                    "type": "service_declining",
                    "year": latest_year_display,
                    "description": "%s declined %s%% over the period -- the largest service area reduction" % (
                        slowest,
                        abs(slowest_pct)
                    )
                })

    # --- BUDGET GROWTH RATE ---
    if len(sorted_years) >= 2:
        earliest_val = budget_series[sorted_years[0]]
        latest_val = budget_series[sorted_years[-1]]
        if earliest_val > 0:
            total_growth = round(((latest_val - earliest_val) / earliest_val) * 100, 1)
            n = len(sorted_years)
            if total_growth > 20:
                highlights.append({
                    "type": "rapid_budget_growth",
                    "year": latest_year_display,
                    "description": "Total budget grew %s%% over %d years (from %s to %s)" % (
                        total_growth,
                        n,
                        format_amount(earliest_val),
                        format_amount(latest_val)
                    )
                })
            elif total_growth < -10:
                highlights.append({
                    "type": "budget_declining",
                    "year": latest_year_display,
                    "description": "Total budget fell %s%% over %d years (from %s to %s)" % (
                        abs(total_growth),
                        n,
                        format_amount(earliest_val),
                        format_amount(latest_val)
                    )
                })

    # --- DEBT ANALYSIS ---
    if "debt_trends" in summary:
        for year, debt_data in summary["debt_trends"].items():
            interest = debt_data.get("General fund: Interest costs", 0) or 0
            finance = debt_data.get("General fund: Finance cost of credit arrangements", 0) or 0
            repayment = debt_data.get("General fund: Revenue cost of the repayment of the principal of debt", 0) or 0
            total_debt_cost = interest + finance + repayment
            if total_debt_cost > 0:
                latest_budget_val = budget_series.get(latest_year, 0)
                if latest_budget_val > 0:
                    debt_pct = round((total_debt_cost / latest_budget_val) * 100, 1)
                    if debt_pct > 5:
                        highlights.append({
                            "type": "debt_servicing",
                            "year": convert_year_format(year),
                            "description": "Debt servicing costs of %s represent %s%% of the total budget" % (
                                format_amount(total_debt_cost),
                                debt_pct
                            )
                        })

    return highlights


def generate_insights(council_id):
    """Generate budget_insights.json for a single council."""
    print("Processing %s..." % council_id)

    summary = load_budgets_summary(council_id)
    if summary is None:
        return False

    # Extract data series
    budget_series = get_budget_series(summary)
    if not budget_series:
        print("  WARNING: No budget data found for %s" % council_id)
        return False

    ct_req_series = get_ct_requirement_series(summary)
    reserves_series = get_reserves_series(summary)
    service_trends = get_service_trends(summary)

    # Get council tax Band D values
    ct_band_d = {}
    if "council_tax" in summary and "band_d_by_year" in summary["council_tax"]:
        ct_band_d = summary["council_tax"]["band_d_by_year"]

    # Build output
    yoy_changes = build_yoy_changes(budget_series)
    budget_trends = build_budget_trends(budget_series, ct_band_d)
    efficiency_metrics = build_efficiency_metrics(budget_series)
    political_highlights = build_political_highlights(
        summary, budget_series, ct_req_series, reserves_series, service_trends
    )

    insights = {
        "yoy_changes": yoy_changes,
        "budget_trends": budget_trends,
        "efficiency_metrics": efficiency_metrics,
        "political_highlights": political_highlights
    }

    # Write output
    output_path = os.path.join(DATA_DIR, council_id, "budget_insights.json")
    with open(output_path, "w") as f:
        json.dump(insights, f, indent=2)

    print("  Wrote %s (%d YoY changes, %d highlights)" % (
        output_path, len(yoy_changes), len(political_highlights)
    ))
    return True


def main():
    # Parse optional --council argument
    councils = TARGET_COUNCILS
    if len(sys.argv) > 1:
        if sys.argv[1] == "--council" and len(sys.argv) > 2:
            councils = [sys.argv[2]]
        elif sys.argv[1] == "--all":
            # Include burnley and hyndburn too (overwrite)
            councils = TARGET_COUNCILS + ["burnley", "hyndburn"]
        else:
            print("Usage: %s [--council <id>] [--all]" % sys.argv[0])
            sys.exit(1)

    success = 0
    failed = 0
    for council_id in councils:
        if generate_insights(council_id):
            success += 1
        else:
            failed += 1

    print("\nDone: %d succeeded, %d failed" % (success, failed))


if __name__ == "__main__":
    main()
