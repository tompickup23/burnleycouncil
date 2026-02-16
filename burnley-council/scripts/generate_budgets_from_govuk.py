#!/usr/bin/env python3
"""
Generate budgets.json from GOV.UK outturn data for councils without budget book PDFs.

This synthesises a budgets.json that powers the full 4-tab budget experience using
official GOV.UK MHCLG revenue outturn and budgets_summary.json data. Not as detailed
as hand-curated budget book data (no capital programme detail, no treasury commentary),
but enables Revenue Budget, Departmental Breakdown, and partial Capital/Treasury tabs.

Usage:
    python3 generate_budgets_from_govuk.py --council pendle
    python3 generate_budgets_from_govuk.py --all
    python3 generate_budgets_from_govuk.py --all --dry-run
"""

import argparse
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, '..', 'data')

# Councils that already have hand-curated budgets.json — skip these
SKIP_COUNCILS = {'burnley', 'hyndburn'}

# All 15 council IDs
ALL_COUNCILS = [
    'burnley', 'hyndburn', 'pendle', 'rossendale',
    'lancaster', 'ribble_valley', 'chorley', 'south_ribble',
    'lancashire_cc', 'blackpool', 'blackburn',
    'west_lancashire', 'wyre', 'preston', 'fylde'
]

# Tier config for service filtering
DISTRICT_SERVICES = [
    'Housing services (GFRA only)',
    'Cultural and related services',
    'Environmental and regulatory services',
    'Planning and development services',
    'Central services',
    'Highways and transport services',
    'Other services',
]

COUNTY_SERVICES = [
    'Education services',
    'Adult Social Care',
    'Children Social Care',
    'Public Health',
    'Highways and transport services',
    'Cultural and related services',
    'Environmental and regulatory services',
    'Central services',
    'Other services',
]

UNITARY_SERVICES = DISTRICT_SERVICES + [
    'Education services',
    'Adult Social Care',
    'Children Social Care',
    'Public Health',
]


def load_json(path):
    """Load a JSON file, return None if not found."""
    if not os.path.exists(path):
        return None
    with open(path, 'r') as f:
        return json.load(f)


def get_relevant_services(tier):
    """Get list of service categories relevant to this council tier."""
    if tier == 'county':
        return COUNTY_SERVICES
    elif tier == 'unitary':
        return list(set(UNITARY_SERVICES))
    else:
        return DISTRICT_SERVICES


def format_year(year_str):
    """Convert '2021-22' to '2021/22'."""
    return year_str.replace('-', '/')


def generate_budgets(council_id, dry_run=False):
    """Generate budgets.json for a single council from GOV.UK data."""
    council_dir = os.path.join(DATA_DIR, council_id)
    config_path = os.path.join(council_dir, 'config.json')
    govuk_path = os.path.join(council_dir, 'budgets_govuk.json')
    summary_path = os.path.join(council_dir, 'budgets_summary.json')
    output_path = os.path.join(council_dir, 'budgets.json')

    config = load_json(config_path)
    govuk = load_json(govuk_path)
    summary = load_json(summary_path)

    if not config:
        print(f'  SKIP {council_id}: no config.json')
        return False
    if not govuk:
        print(f'  SKIP {council_id}: no budgets_govuk.json')
        return False

    council_name = config.get('council_name', council_id)
    council_full = config.get('council_full_name', council_name)
    tier = config.get('council_tier', 'district')
    relevant_services = get_relevant_services(tier)

    years = govuk.get('years', [])
    by_year = govuk.get('by_year', {})

    if not years or not by_year:
        print(f'  SKIP {council_id}: no year data in budgets_govuk.json')
        return False

    # Build revenue_budgets array (one entry per year)
    revenue_budgets = []
    for year in sorted(years):
        year_data = by_year.get(year, {})
        revenue = year_data.get('revenue_summary', {})
        services = revenue.get('service_expenditure', {})
        key_financials = revenue.get('key_financials', {})
        financing = revenue.get('financing', {})

        # Net revenue budget: prefer net revenue expenditure, fall back to total service expenditure
        net_rev_data = key_financials.get('NET REVENUE EXPENDITURE', {})
        net_rev = net_rev_data.get('value_pounds') if isinstance(net_rev_data, dict) else None
        total_svc_data = services.get('TOTAL SERVICE EXPENDITURE', {})
        total_svc = total_svc_data.get('value_pounds', 0) if isinstance(total_svc_data, dict) else 0
        net_revenue_budget = net_rev if net_rev is not None else total_svc

        # Build departments from service expenditure categories
        departments = {}
        for svc_name in relevant_services:
            svc_data = services.get(svc_name, {})
            val = svc_data.get('value_pounds', 0)
            if val != 0:
                departments[svc_name] = val

        # Funding sources from financing data
        funding_sources = {}
        if financing:
            for key, data in financing.items():
                val = data.get('value_pounds', 0) if isinstance(data, dict) else data
                if val != 0:
                    # Normalise key names
                    clean_key = key.lower().replace(' ', '_').replace("'", '').replace('(', '').replace(')', '')
                    funding_sources[clean_key] = val

        # Council tax Band D from summary data
        council_tax = {}
        if summary and summary.get('council_tax', {}).get('band_d_by_year'):
            band_d = summary['council_tax']['band_d_by_year']
            formatted_year = format_year(year)
            # Try both formats
            bd_val = band_d.get(formatted_year) or band_d.get(year)
            if bd_val:
                council_tax[f'{council_id}_element'] = bd_val

        entry = {
            'financial_year': format_year(year),
            'source': f'GOV.UK MHCLG Revenue Outturn ({format_year(year)})',
            'net_revenue_budget': net_revenue_budget,
            'departments': departments,
        }
        if funding_sources:
            entry['funding_sources'] = funding_sources
        if council_tax:
            entry['council_tax'] = council_tax

        revenue_budgets.append(entry)

    if not revenue_budgets:
        print(f'  SKIP {council_id}: no revenue budget data generated')
        return False

    # Build insights
    earliest = revenue_budgets[0]
    latest = revenue_budgets[-1]
    earliest_budget = earliest['net_revenue_budget'] or 0
    latest_budget = latest['net_revenue_budget'] or 0
    growth_pct = ((latest_budget - earliest_budget) / abs(earliest_budget) * 100) if earliest_budget else 0

    # Departmental growth
    dept_growth = {}
    if len(revenue_budgets) >= 2:
        first_depts = earliest['departments']
        last_depts = latest['departments']
        for dept in last_depts:
            first_val = first_depts.get(dept, 0)
            last_val = last_depts.get(dept, 0)
            if first_val > 0 and last_val > 0:
                g = (last_val - first_val) / abs(first_val) * 100
                if abs(g) > 5:  # only include meaningful changes
                    dept_growth[dept] = {
                        'from': first_val,
                        'to': last_val,
                        'growth_pct': round(g, 1)
                    }
    # Sort by growth_pct descending, take top 8
    dept_growth = dict(sorted(dept_growth.items(), key=lambda x: x[1]['growth_pct'], reverse=True)[:8])

    # Key trends
    key_trends = []
    if growth_pct:
        key_trends.append(
            f"Service expenditure {'grew' if growth_pct > 0 else 'fell'} "
            f"{abs(growth_pct):.1f}% from {format_currency(earliest_budget)} "
            f"({earliest['financial_year']}) to {format_currency(latest_budget)} "
            f"({latest['financial_year']})"
        )

    # Largest department
    if latest['departments']:
        sorted_depts = sorted(latest['departments'].items(), key=lambda x: x[1], reverse=True)
        if sorted_depts:
            largest = sorted_depts[0]
            pct = largest[1] / latest_budget * 100 if latest_budget else 0
            key_trends.append(
                f"{largest[0]} is the largest service at {format_currency(largest[1])} "
                f"({pct:.0f}% of total expenditure)"
            )

    # Fastest growing department
    if dept_growth:
        fastest = list(dept_growth.items())[0]
        key_trends.append(
            f"{fastest[0]} grew fastest: {fastest[1]['growth_pct']:.0f}% "
            f"({format_currency(fastest[1]['from'])} → {format_currency(fastest[1]['to'])})"
        )

    # Reserve trajectory from summary
    if summary and summary.get('reserves'):
        reserves = summary['reserves']
        change = reserves.get('change', 0)
        if change < 0:
            key_trends.append(
                f"Total reserves fell by {format_currency(abs(change))} in {summary.get('financial_year', 'latest year')}"
            )
        elif change > 0:
            key_trends.append(
                f"Total reserves grew by {format_currency(change)} in {summary.get('financial_year', 'latest year')}"
            )

    # Funding dependency
    funding_dep = {}
    if latest.get('funding_sources'):
        fs = latest['funding_sources']
        total_funding = sum(abs(v) for v in fs.values())
        if total_funding > 0:
            ct_val = sum(abs(v) for k, v in fs.items() if 'council_tax' in k)
            br_val = sum(abs(v) for k, v in fs.items() if 'business_rate' in k)
            grant_val = total_funding - ct_val - br_val
            funding_dep = {
                'council_tax_pct': round(ct_val / total_funding * 100),
                'business_rates_pct': round(br_val / total_funding * 100),
                'government_grants_pct': round(grant_val / total_funding * 100),
            }

    budgets_json = {
        'revenue_budgets': revenue_budgets,
        'capital_programmes': [],  # No capital data from GOV.UK outturn
        'treasury_and_investment': {
            'overview': f'Treasury data for {council_full} is sourced from GOV.UK statutory returns. '
                        f'For detailed borrowing, investment, and MRP information, refer to the council\'s '
                        f'annual Statement of Accounts and Treasury Management Strategy.',
            'key_context': {},
            'notable_investments': [],
        },
        'insights': {
            'revenue_vs_capital': {
                'explanation': 'Revenue budget covers day-to-day running costs funded by council tax and grants. '
                               'Capital budget covers long-term investment funded by borrowing and grants.',
                'current_revenue': latest_budget,
                'current_capital_5yr': None,
            },
            'key_trends': key_trends,
            'departmental_growth': dept_growth,
            'funding_dependency': funding_dep,
        },
        '_generated': {
            'source': 'Auto-generated from GOV.UK MHCLG Revenue Outturn data',
            'note': 'For richer budget analysis, contact AI DOGE with the council budget book PDF',
        },
    }

    if dry_run:
        print(f'  DRY RUN {council_id}: would write {len(revenue_budgets)} years, '
              f'{len(latest["departments"])} service categories')
        return True

    with open(output_path, 'w') as f:
        json.dump(budgets_json, f, indent=2)

    size_kb = os.path.getsize(output_path) / 1024
    print(f'  OK {council_id}: {len(revenue_budgets)} years, '
          f'{len(latest["departments"])} services, {size_kb:.1f}KB')
    return True


def format_currency(val):
    """Format a value as £XM or £XK."""
    if val is None:
        return '?'
    abs_val = abs(val)
    if abs_val >= 1_000_000:
        return f'£{val/1_000_000:.1f}M'
    elif abs_val >= 1000:
        return f'£{val/1000:.0f}K'
    else:
        return f'£{val:.0f}'


def main():
    parser = argparse.ArgumentParser(
        description='Generate budgets.json from GOV.UK data'
    )
    parser.add_argument('--council', type=str,
                        help='Council ID to process')
    parser.add_argument('--all', action='store_true',
                        help='Process all councils (skips those with hand-curated data)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show what would be generated without writing files')
    parser.add_argument('--force', action='store_true',
                        help='Overwrite existing budgets.json even for hand-curated councils')
    args = parser.parse_args()

    if not args.council and not args.all:
        parser.error('Specify --council ID or --all')

    councils = ALL_COUNCILS if args.all else [args.council]
    success = 0
    skipped = 0

    for council_id in councils:
        if council_id in SKIP_COUNCILS and not args.force:
            print(f'  SKIP {council_id}: has hand-curated budgets.json (use --force to overwrite)')
            skipped += 1
            continue

        if generate_budgets(council_id, dry_run=args.dry_run):
            success += 1
        else:
            skipped += 1

    print(f'\nDone: {success} generated, {skipped} skipped')


if __name__ == '__main__':
    main()
