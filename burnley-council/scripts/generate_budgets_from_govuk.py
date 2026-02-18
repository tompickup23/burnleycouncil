#!/usr/bin/env python3
"""
Generate budgets.json from GOV.UK outturn data for councils without budget book PDFs.

V2: Now includes 60+ sub-service line items from RO4/RO5/RO6 detailed returns,
expenditure breakdown (employees, running expenses, income), reserves trajectory,
council tax history, and key financials. This enables departmental drill-down
showing exactly what each council spends on waste collection, libraries, CCTV, etc.

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

# ONS CPI-H annual averages (base 2015 = 100) for inflation adjustment
CPI_H_INDEX = {
    '2015/16': 100.6, '2016/17': 102.3, '2017/18': 105.1, '2018/19': 107.4,
    '2019/20': 109.3, '2020/21': 110.3, '2021/22': 114.1, '2022/23': 124.7,
    '2023/24': 131.5, '2024/25': 136.0, '2025/26': 138.7,
}

# Councils that already have hand-curated budgets.json — skip these
SKIP_COUNCILS = {'burnley', 'hyndburn'}

# All 15 council IDs
ALL_COUNCILS = [
    'burnley', 'hyndburn', 'pendle', 'rossendale',
    'lancaster', 'ribble_valley', 'chorley', 'south_ribble',
    'lancashire_cc', 'blackpool', 'blackburn',
    'west_lancashire', 'wyre', 'preston', 'fylde'
]

# Tier config for top-level service filtering
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

# Map top-level RSX service names to their detailed RO forms
# Each top-level service maps to the RO form and the specific sub-service names within it
SERVICE_TO_RO_FORM = {
    'Housing services (GFRA only)': 'RO4',
    'Cultural and related services': 'RO5',
    'Environmental and regulatory services': 'RO5',
    'Planning and development services': 'RO5',
    'Central services': 'RO6',
    'Other services': 'RO6',
    'Highways and transport services': 'RO2',
    'Education services': None,  # No sub-service detail in these files
    'Adult Social Care': None,
    'Children Social Care': None,
    'Public Health': None,
}

# Sub-service names grouped by parent service (for matching RO form entries)
# These are the line items we want to extract from RO4/RO5/RO6
SUB_SERVICES = {
    'Housing services (GFRA only)': {
        'form': 'RO4',
        'lines': [
            'Housing strategy and advice',
            'Housing advances',
            'Administration of financial support for repairs and improvements',
            'Other private sector renewal',
            'Nightly paid accommodation (self-contained)',
            'Private sector leased',
            'Hostels (not nightly paid, not registered care homes)',
            'Bed and breakfast hotels',
            'LA stock and housing association stock',
            'Other temporary accommodation',
            'Homelessness administration - Temporary accommodation',
            'Homelessness administration - Homelessness Reduction Act',
            'Homelessness - Non-HRA housing admin',
            'TOTAL HOMELESSNESS SERVICES',
            'Rent allowances - discretionary payments',
            'Non-HRA rent rebates - discretionary payments',
            'Housing Benefits Administration',
            'Other council property (Non-HRA)',
            'Supporting People',
            'Other welfare services',
        ],
        'total_line': 'TOTAL HOUSING SERVICES (GFRA only)',
    },
    'Cultural and related services': {
        'form': 'RO5',
        'lines': [
            'Culture and heritage - Archives',
            'Culture and heritage - Arts development and support',
            'Culture and heritage - Heritage',
            'Culture and heritage - Museums and galleries',
            'Culture and heritage - Theatres and public entertainment',
            'Recreation and sport - Community centres and public halls',
            'Recreation and sport - Foreshore',
            'Recreation and sport - Sports development and community recreation',
            'Recreation and sport - Sports and recreation facilities incl. golf',
            'Open spaces - Parks and open spaces',
            'Open spaces - Allotments',
            'Tourism',
            'Library service - Library service',
        ],
        'total_line': 'TOTAL CULTURAL AND RELATED SERVICES',
    },
    'Environmental and regulatory services': {
        'form': 'RO5',
        'lines': [
            'Cemetery, cremation and mortuary services',
            'Trading standards',
            'Water safety',
            'Food safety / hygiene',
            'Environmental protection / noise and nuisance',
            'Housing standards and HMO licensing',
            'Health and safety',
            'Port health',
            'Port health - levies',
            'Pest control',
            'Public conveniences',
            'Animal and public health',
            'Licensing',
            'Crime Reduction',
            'Safety Services',
            'CCTV',
            'Defences against flooding',
            'Land drainage',
            'Land drainage - levies',
            'Coast protection',
            'Agricultural and fisheries services',
            'Street cleansing (not chargeable to highways)',
            'Waste collection',
            'Waste disposal',
            'Trade waste',
            'Recycling',
            'Waste minimisation',
            'Climate change costs',
        ],
        'total_line': 'TOTAL ENVIRONMENTAL AND REGULATORY SERVICES',
    },
    'Planning and development services': {
        'form': 'RO5',
        'lines': [
            'Building control',
            'Development control',
            'Conservation and listed buildings',
            'Other planning policy and specialist advice',
            'Environmental initiatives',
            'Economic development',
            'Economic research and intelligence',
            'Business support and promotion',
            'Community development and safety',
        ],
        'total_line': 'TOTAL PLANNING AND DEVELOPMENT SERVICES',
    },
    'Central services': {
        'form': 'RO6',
        'lines': [
            'Corporate and Democratic Core',
            'Council tax collection',
            'Council tax discounts - prompt payment',
            'Council tax discounts - locally funded',
            'Council tax support - administration',
            'Non-domestic rates collection',
            'Business Improvement District ballots',
            'Registration of births, deaths and marriages',
            'Registration of electors',
            'Conducting elections',
            'Emergency planning',
            'Local land charges',
            'Local welfare assistance',
            'General grants, bequests and donations',
            'Coroners\' court services',
            'Other court services',
            'Retirement benefits',
            'Costs of unused shares of IT facilities and other assets',
            'Revenue expenditure on surplus assets',
            'MANAGEMENT AND SUPPORT SERVICES',
        ],
        'total_line': 'TOTAL CENTRAL SERVICES',
    },
}

# Friendly short names for sub-services (for cleaner UI display)
SUB_SERVICE_SHORT_NAMES = {
    'Culture and heritage - Archives': 'Archives',
    'Culture and heritage - Arts development and support': 'Arts development',
    'Culture and heritage - Heritage': 'Heritage',
    'Culture and heritage - Museums and galleries': 'Museums & galleries',
    'Culture and heritage - Theatres and public entertainment': 'Theatres & entertainment',
    'Recreation and sport - Community centres and public halls': 'Community centres',
    'Recreation and sport - Foreshore': 'Foreshore',
    'Recreation and sport - Sports development and community recreation': 'Sports & recreation',
    'Recreation and sport - Sports and recreation facilities incl. golf': 'Sports facilities',
    'Open spaces - Parks and open spaces': 'Parks & open spaces',
    'Open spaces - Allotments': 'Allotments',
    'Library service - Library service': 'Libraries',
    'Cemetery, cremation and mortuary services': 'Cemeteries & crematoria',
    'Environmental protection / noise and nuisance': 'Environmental protection',
    'Housing standards and HMO licensing': 'Housing standards',
    'Street cleansing (not chargeable to highways)': 'Street cleansing',
    'Administration of financial support for repairs and improvements': 'Housing repair grants',
    'Homelessness administration - Temporary accommodation': 'Homelessness (temp)',
    'Homelessness administration - Homelessness Reduction Act': 'Homelessness (HRA)',
    'Homelessness - Non-HRA housing admin': 'Homelessness admin',
    'TOTAL HOMELESSNESS SERVICES': 'Total homelessness',
    'Housing Benefits Administration': 'Housing benefits admin',
    'Other council property (Non-HRA)': 'Other council property',
    'Nightly paid accommodation (self-contained)': 'Nightly paid B&B (self-contained)',
    'LA stock and housing association stock': 'Council/HA stock',
    'Non-HRA rent rebates - discretionary payments': 'Non-HRA rent rebates',
    'Rent allowances - discretionary payments': 'Rent allowances',
    'Council tax discounts - prompt payment': 'CT prompt payment discounts',
    'Council tax discounts - locally funded': 'CT locally funded discounts',
    'Council tax support - administration': 'CT support admin',
    'Non-domestic rates collection': 'Business rates collection',
    'Coroners\' court services': 'Coroners courts',
    'Costs of unused shares of IT facilities and other assets': 'Unused IT & assets',
    'Registration of births, deaths and marriages': 'Births/deaths/marriages',
    'Fire/rescue service emergency planning and civil defence': 'Fire & rescue planning',
    'MANAGEMENT AND SUPPORT SERVICES': 'Support services',
    'Revenue expenditure on surplus assets': 'Surplus asset costs',
    'Agricultural and fisheries services': 'Agricultural services',
    'Business Improvement District ballots': 'BID ballots',
}


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


def format_currency(val):
    """Format a value as £XM or £XK."""
    if val is None:
        return '?'
    abs_val = abs(val)
    if abs_val >= 1_000_000:
        return '£{:.1f}M'.format(val / 1_000_000)
    elif abs_val >= 1000:
        return '£{:.0f}K'.format(val / 1000)
    else:
        return '£{:.0f}'.format(val)


def is_relevant_sub_service(service_data, tier):
    """Check if a sub-service line is relevant to this council tier."""
    if tier == 'district':
        return service_data.get('relevant_to_districts', True)
    elif tier == 'county':
        return service_data.get('relevant_to_county', True)
    elif tier == 'unitary':
        return service_data.get('relevant_to_unitary', True)
    return True


def extract_sub_services(detailed_services, parent_service, tier):
    """Extract sub-service line items from detailed_services for a parent service category.

    Returns dict of {short_name: {net: X, employees: Y, running_expenses: Z, income: W}}
    Only includes lines with non-null, non-zero net_current_expenditure.
    """
    config = SUB_SERVICES.get(parent_service)
    if not config:
        return {}

    form_name = config['form']
    form_data = detailed_services.get(form_name, {})
    services = form_data.get('services', {})

    result = {}
    for line_name in config['lines']:
        svc = services.get(line_name, {})
        if not svc:
            continue

        # Check tier relevance
        if not is_relevant_sub_service(svc, tier):
            continue

        # Get net current expenditure
        net = svc.get('net_current_expenditure', {})
        net_val = net.get('value_pounds') if isinstance(net, dict) else None
        if net_val is None or net_val == 0:
            continue

        # Get expenditure breakdown
        employees = svc.get('employees', {})
        emp_val = employees.get('value_pounds') if isinstance(employees, dict) else None

        running = svc.get('running_expenses', {})
        run_val = running.get('value_pounds') if isinstance(running, dict) else None

        total_exp = svc.get('total_expenditure', {})
        exp_val = total_exp.get('value_pounds') if isinstance(total_exp, dict) else None

        total_inc = svc.get('total_income', {})
        inc_val = total_inc.get('value_pounds') if isinstance(total_inc, dict) else None

        short_name = SUB_SERVICE_SHORT_NAMES.get(line_name, line_name)

        entry = {'net': net_val}
        if emp_val is not None and emp_val != 0:
            entry['employees'] = emp_val
        if run_val is not None and run_val != 0:
            entry['running_expenses'] = run_val
        if exp_val is not None and exp_val != 0:
            entry['total_expenditure'] = exp_val
        if inc_val is not None and inc_val != 0:
            entry['total_income'] = inc_val

        result[short_name] = entry

    return result


def extract_expenditure_breakdown(detailed_services, service_name):
    """Extract employees/running_expenses/income breakdown for a top-level service from RSX."""
    rsx = detailed_services.get('RSX', {})
    services = rsx.get('services', {})
    svc = services.get(service_name, {})
    if not svc:
        return {}

    result = {}
    for field in ['employees', 'running_expenses', 'total_expenditure', 'total_income']:
        data = svc.get(field, {})
        val = data.get('value_pounds') if isinstance(data, dict) else None
        if val is not None and val != 0:
            result[field] = val

    return result


def extract_reserves(revenue_summary):
    """Extract reserves data from revenue_summary."""
    reserves_raw = revenue_summary.get('reserves', {})
    if not reserves_raw:
        return None

    result = {}
    for key, data in reserves_raw.items():
        val = data.get('value_pounds') if isinstance(data, dict) else data
        if val is not None:
            clean_key = key.lower()
            if 'earmarked' in clean_key and '1 april' in clean_key:
                result['earmarked_opening'] = val
            elif 'earmarked' in clean_key and '31 march' in clean_key:
                result['earmarked_closing'] = val
            elif 'unallocated' in clean_key and '1 april' in clean_key:
                result['unallocated_opening'] = val
            elif 'unallocated' in clean_key and '31 march' in clean_key:
                result['unallocated_closing'] = val

    if result.get('earmarked_opening') is not None and result.get('earmarked_closing') is not None:
        result['total_opening'] = (result.get('earmarked_opening', 0) or 0) + (result.get('unallocated_opening', 0) or 0)
        result['total_closing'] = (result.get('earmarked_closing', 0) or 0) + (result.get('unallocated_closing', 0) or 0)
        result['change'] = result['total_closing'] - result['total_opening']

    return result if result else None


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
        print('  SKIP {}: no config.json'.format(council_id))
        return False
    if not govuk:
        print('  SKIP {}: no budgets_govuk.json'.format(council_id))
        return False

    council_name = config.get('council_name', council_id)
    council_full = config.get('council_full_name', council_name)
    tier = config.get('council_tier', 'district')
    relevant_services = get_relevant_services(tier)

    years = govuk.get('years', [])
    by_year = govuk.get('by_year', {})

    if not years or not by_year:
        print('  SKIP {}: no year data in budgets_govuk.json'.format(council_id))
        return False

    # Build revenue_budgets array (one entry per year)
    revenue_budgets = []
    total_sub_services = 0

    for year in sorted(years):
        year_data = by_year.get(year, {})
        revenue = year_data.get('revenue_summary', {})
        services = revenue.get('service_expenditure', {})
        key_financials = revenue.get('key_financials', {})
        financing = revenue.get('financing', {})
        detailed = year_data.get('detailed_services', {})

        # Net revenue budget: prefer net revenue expenditure, fall back to total service expenditure
        net_rev_data = key_financials.get('NET REVENUE EXPENDITURE', {})
        net_rev = net_rev_data.get('value_pounds') if isinstance(net_rev_data, dict) else None
        total_svc_data = services.get('TOTAL SERVICE EXPENDITURE', {})
        total_svc = total_svc_data.get('value_pounds', 0) if isinstance(total_svc_data, dict) else 0
        net_revenue_budget = net_rev if net_rev is not None else total_svc

        # Key financials
        ct_req_data = key_financials.get('COUNCIL TAX REQUIREMENT', {})
        ct_requirement = ct_req_data.get('value_pounds') if isinstance(ct_req_data, dict) else None
        rev_exp_data = key_financials.get('REVENUE EXPENDITURE', {})
        revenue_expenditure = rev_exp_data.get('value_pounds') if isinstance(rev_exp_data, dict) else None

        # Build departments from service expenditure categories
        departments = {}
        for svc_name in relevant_services:
            svc_data = services.get(svc_name, {})
            val = svc_data.get('value_pounds', 0)
            if val != 0:
                departments[svc_name] = val

        # Extract sub-service detail per department
        sub_services = {}
        for svc_name in relevant_services:
            if svc_name in SUB_SERVICES:
                subs = extract_sub_services(detailed, svc_name, tier)
                if subs:
                    sub_services[svc_name] = subs
                    total_sub_services += len(subs)

        # Extract expenditure breakdown per department (employees, running expenses, income)
        expenditure_breakdown = {}
        for svc_name in relevant_services:
            breakdown = extract_expenditure_breakdown(detailed, svc_name)
            if breakdown:
                expenditure_breakdown[svc_name] = breakdown

        # Reserves
        reserves = extract_reserves(revenue)

        # Funding sources from financing data
        funding_sources = {}
        if financing:
            for key, data in financing.items():
                val = data.get('value_pounds', 0) if isinstance(data, dict) else data
                if val != 0:
                    clean_key = key.lower().replace(' ', '_').replace("'", '').replace('(', '').replace(')', '')
                    funding_sources[clean_key] = val

        # Council tax Band D from summary data
        council_tax = {}
        if summary and summary.get('council_tax', {}).get('band_d_by_year'):
            band_d = summary['council_tax']['band_d_by_year']
            formatted_year = format_year(year)
            bd_val = band_d.get(formatted_year) or band_d.get(year)
            if bd_val:
                council_tax['{}_element'.format(council_id)] = bd_val

        entry = {
            'financial_year': format_year(year),
            'source': 'GOV.UK MHCLG Revenue Outturn ({})'.format(format_year(year)),
            'net_revenue_budget': net_revenue_budget,
            'departments': departments,
        }

        # Add sub-service detail if available
        if sub_services:
            entry['sub_services'] = sub_services

        # Add expenditure breakdown if available
        if expenditure_breakdown:
            entry['expenditure_breakdown'] = expenditure_breakdown

        # Add key financials
        if ct_requirement:
            entry['council_tax_requirement'] = ct_requirement
        if revenue_expenditure:
            entry['revenue_expenditure'] = revenue_expenditure

        # Add reserves
        if reserves:
            entry['reserves'] = reserves

        if funding_sources:
            entry['funding_sources'] = funding_sources
        if council_tax:
            entry['council_tax'] = council_tax

        # Real growth rate (CPI-H inflation-adjusted)
        fy = format_year(year)
        if len(revenue_budgets) > 0 and net_revenue_budget and revenue_budgets[-1].get('net_revenue_budget'):
            prev = revenue_budgets[-1]
            prev_fy = prev['financial_year']
            prev_budget = prev['net_revenue_budget']
            nominal_growth = ((net_revenue_budget - prev_budget) / abs(prev_budget)) * 100 if prev_budget else 0
            # Deflate both to latest year
            cpi_from = CPI_H_INDEX.get(prev_fy)
            cpi_to = CPI_H_INDEX.get(fy)
            if cpi_from and cpi_to and cpi_from > 0:
                real_prev = prev_budget * (cpi_to / cpi_from)
                real_growth = ((net_revenue_budget - real_prev) / abs(real_prev)) * 100 if real_prev else 0
                entry['real_growth_rate_pct'] = round(real_growth, 1)
            entry['nominal_growth_rate_pct'] = round(nominal_growth, 1)

        revenue_budgets.append(entry)

    if not revenue_budgets:
        print('  SKIP {}: no revenue budget data generated'.format(council_id))
        return False

    # Build council tax history from summary (30+ years of data)
    council_tax_history = {}
    if summary and summary.get('council_tax'):
        ct_data = summary['council_tax']
        if ct_data.get('band_d_by_year'):
            council_tax_history['band_d_element'] = ct_data['band_d_by_year']
        if ct_data.get('band_d_total_by_year'):
            council_tax_history['band_d_total'] = ct_data['band_d_total_by_year']
        if ct_data.get('band_d_inc_pp_by_year'):
            council_tax_history['band_d_inc_precepts'] = ct_data['band_d_inc_pp_by_year']

    # Build reserves trajectory (all years) with CIPFA adequacy rating
    reserves_trajectory = []
    for rb in revenue_budgets:
        if rb.get('reserves'):
            total_closing = rb['reserves'].get('total_closing', 0) or 0
            net_budget = rb.get('net_revenue_budget', 0) or 0
            months_cover = round((total_closing / net_budget) * 12, 1) if net_budget > 0 and total_closing > 0 else 0

            adequacy_rating = 'Unknown'
            if months_cover > 0:
                if months_cover < 3:
                    adequacy_rating = 'Critical'
                elif months_cover < 6:
                    adequacy_rating = 'Low'
                elif months_cover < 12:
                    adequacy_rating = 'Adequate'
                else:
                    adequacy_rating = 'Strong'

            reserves_trajectory.append({
                'year': rb['financial_year'],
                'earmarked': rb['reserves'].get('earmarked_closing'),
                'unallocated': rb['reserves'].get('unallocated_closing'),
                'total': total_closing,
                'months_cover': months_cover,
                'adequacy_rating': adequacy_rating,
            })

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
    dept_growth = dict(sorted(dept_growth.items(), key=lambda x: x[1]['growth_pct'], reverse=True)[:8])

    # Sub-service growth (the new drill-down level)
    sub_service_growth = {}
    if len(revenue_budgets) >= 2:
        first_subs = earliest.get('sub_services', {})
        last_subs = latest.get('sub_services', {})
        for parent in last_subs:
            for sub_name, sub_data in last_subs[parent].items():
                last_val = sub_data.get('net', 0)
                first_parent = first_subs.get(parent, {})
                first_sub = first_parent.get(sub_name, {})
                first_val = first_sub.get('net', 0) if isinstance(first_sub, dict) else 0
                if first_val > 0 and last_val > 0 and abs(last_val) > 50000:  # minimum £50K
                    g = (last_val - first_val) / abs(first_val) * 100
                    if abs(g) > 10:  # only include significant changes
                        sub_service_growth[sub_name] = {
                            'parent': parent,
                            'from': first_val,
                            'to': last_val,
                            'growth_pct': round(g, 1)
                        }
    sub_service_growth = dict(sorted(
        sub_service_growth.items(),
        key=lambda x: abs(x[1]['growth_pct']),
        reverse=True
    )[:12])

    # Key trends
    key_trends = []
    if growth_pct:
        key_trends.append(
            "Service expenditure {} {:.1f}% from {} ({}) to {} ({})".format(
                'grew' if growth_pct > 0 else 'fell',
                abs(growth_pct),
                format_currency(earliest_budget),
                earliest['financial_year'],
                format_currency(latest_budget),
                latest['financial_year']
            )
        )

    # Largest department
    if latest['departments']:
        sorted_depts = sorted(latest['departments'].items(), key=lambda x: x[1], reverse=True)
        if sorted_depts:
            largest = sorted_depts[0]
            pct = largest[1] / latest_budget * 100 if latest_budget else 0
            key_trends.append(
                "{} is the largest service at {} ({:.0f}% of total expenditure)".format(
                    largest[0], format_currency(largest[1]), pct
                )
            )

    # Fastest growing department
    if dept_growth:
        fastest = list(dept_growth.items())[0]
        key_trends.append(
            "{} grew fastest: {:.0f}% ({} \u2192 {})".format(
                fastest[0], fastest[1]['growth_pct'],
                format_currency(fastest[1]['from']),
                format_currency(fastest[1]['to'])
            )
        )

    # Reserve trajectory
    if reserves_trajectory:
        latest_res = reserves_trajectory[-1]
        earliest_res = reserves_trajectory[0]
        if latest_res.get('total') and earliest_res.get('total'):
            res_change = latest_res['total'] - earliest_res['total']
            if res_change < 0:
                key_trends.append(
                    "Total reserves fell by {} over the period".format(format_currency(abs(res_change)))
                )
            elif res_change > 0:
                key_trends.append(
                    "Total reserves grew by {} over the period".format(format_currency(res_change))
                )

    # Notable sub-service insights
    latest_subs = latest.get('sub_services', {})
    biggest_sub = None
    for parent, subs in latest_subs.items():
        for name, data in subs.items():
            val = data.get('net', 0)
            if val > 0 and (biggest_sub is None or val > biggest_sub[1]):
                biggest_sub = (name, val, parent)
    if biggest_sub:
        key_trends.append(
            "{} is the largest individual sub-service at {}".format(
                biggest_sub[0], format_currency(biggest_sub[1])
            )
        )

    # Funding dependency
    funding_dep = {}
    if latest.get('funding_sources'):
        fs = latest['funding_sources']
        total_funding = sum(abs(v) for v in fs.values())
        if total_funding > 0:
            ct_val = sum(abs(v) for k, v in fs.items() if 'council_tax' in k)
            br_val = sum(abs(v) for k, v in fs.items() if 'business_rate' in k or 'rate_retention' in k)
            grant_val = sum(abs(v) for k, v in fs.items()
                           if 'grant' in k or 'revenue_support' in k)
            other_val = total_funding - ct_val - br_val - grant_val
            funding_dep = {
                'council_tax_pct': round(ct_val / total_funding * 100),
                'business_rates_pct': round(br_val / total_funding * 100),
                'government_grants_pct': round(grant_val / total_funding * 100),
            }
            if other_val > total_funding * 0.01:
                funding_dep['other_pct'] = round(other_val / total_funding * 100)

    budgets_json = {
        'revenue_budgets': revenue_budgets,
        'capital_programmes': [],  # No capital data from GOV.UK outturn
        'treasury_and_investment': {
            'overview': (
                'Treasury data for {} is sourced from GOV.UK statutory returns. '
                'For detailed borrowing, investment, and MRP information, refer to the council\'s '
                'annual Statement of Accounts and Treasury Management Strategy.'
            ).format(council_full),
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
            'sub_service_growth': sub_service_growth,
            'funding_dependency': funding_dep,
        },
        '_generated': {
            'source': 'Auto-generated from GOV.UK MHCLG Revenue Outturn data (V2 with sub-service detail)',
            'note': 'Sub-service data from RO4/RO5/RO6 statutory returns. Null sub-lines where MHCLG data is sparse.',
            'version': 2,
        },
    }

    # Add council tax history if available
    if council_tax_history:
        budgets_json['council_tax_history'] = council_tax_history

    # Add reserves trajectory
    if reserves_trajectory:
        budgets_json['reserves_trajectory'] = reserves_trajectory

    if dry_run:
        latest_subs_count = sum(len(v) for v in latest.get('sub_services', {}).values())
        print('  DRY RUN {}: would write {} years, {} services, {} sub-services'.format(
            council_id, len(revenue_budgets), len(latest['departments']), latest_subs_count
        ))
        return True

    with open(output_path, 'w') as f:
        json.dump(budgets_json, f, indent=2)

    size_kb = os.path.getsize(output_path) / 1024
    latest_subs_count = sum(len(v) for v in latest.get('sub_services', {}).values())
    print('  OK {}: {} years, {} services, {} sub-services, {:.1f}KB'.format(
        council_id, len(revenue_budgets), len(latest['departments']),
        latest_subs_count, size_kb
    ))
    return True


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
            print('  SKIP {}: has hand-curated budgets.json (use --force to overwrite)'.format(council_id))
            skipped += 1
            continue

        if generate_budgets(council_id, dry_run=args.dry_run):
            success += 1
        else:
            skipped += 1

    print('\nDone: {} generated, {} skipped'.format(success, skipped))


if __name__ == '__main__':
    main()
