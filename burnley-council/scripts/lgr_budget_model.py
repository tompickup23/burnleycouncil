#!/usr/bin/env python3
"""
LGR Budget Model — Per-service savings, CT harmonisation, authority composition.

Reads all 15 councils' budgets_govuk.json + lgr_tracker.json proposal groupings.
Outputs: burnley-council/data/shared/lgr_budget_model.json

Replaces flat-percentage savings model with real sub-service data from GOV.UK
Revenue Outturn RO4/RO5/RO6 returns.
"""

import json
import os
import sys
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, '..', 'data')
SHARED_DIR = os.path.join(DATA_DIR, 'shared')

# All 15 Lancashire councils with tiers
COUNCILS = {
    'burnley': 'district', 'hyndburn': 'district', 'pendle': 'district',
    'rossendale': 'district', 'lancaster': 'district', 'ribble_valley': 'district',
    'chorley': 'district', 'south_ribble': 'district', 'preston': 'district',
    'west_lancashire': 'district', 'wyre': 'district', 'fylde': 'district',
    'lancashire_cc': 'county', 'blackpool': 'unitary', 'blackburn': 'unitary',
}

# Council display names
COUNCIL_NAMES = {
    'burnley': 'Burnley', 'hyndburn': 'Hyndburn', 'pendle': 'Pendle',
    'rossendale': 'Rossendale', 'lancaster': 'Lancaster', 'ribble_valley': 'Ribble Valley',
    'chorley': 'Chorley', 'south_ribble': 'South Ribble', 'preston': 'Preston',
    'west_lancashire': 'West Lancashire', 'wyre': 'Wyre', 'fylde': 'Fylde',
    'lancashire_cc': 'Lancashire CC', 'blackpool': 'Blackpool', 'blackburn': 'Blackburn',
}

# Sub-service lines to extract from RO forms, with savings methodology
# Format: { parent_service: { form: str, lines: { line_name: { short: str, savings_pct: float, savings_method: str } } } }
CENTRAL_SAVINGS_LINES = {
    'Corporate and Democratic Core': {
        'savings_pct': 0.30,
        'method': '30% governance overhead reduction (academic benchmark)',
    },
    'Council tax collection': {
        'savings_formula': 'consolidation',  # (N-1)/N
        'method': '1 billing authority replaces N district collectors',
    },
    'Council tax support - administration': {
        'savings_formula': 'consolidation',
        'method': 'Combined with CT collection',
    },
    'Non-domestic rates collection': {
        'savings_formula': 'consolidation',
        'method': '1 billing authority replaces N rate collectors',
    },
    'Registration of electors': {
        'savings_formula': 'consolidation',
        'method': 'Single electoral register per authority',
    },
    'Conducting elections': {
        'savings_pct': 0.10,
        'method': 'Minor admin consolidation (elections still needed)',
    },
    'Local land charges': {
        'savings_formula': 'consolidation',
        'method': 'Single land charges register',
    },
    'MANAGEMENT AND SUPPORT SERVICES': {
        'savings_pct': 0.15,
        'method': 'Shared services economies of scale',
    },
    'Costs of unused shares of IT facilities and other assets': {
        'savings_pct': 0.50,
        'method': 'IT consolidation reduces unused capacity',
    },
    'Revenue expenditure on surplus assets': {
        'savings_pct': 0.30,
        'method': 'Property rationalisation reduces surplus portfolio',
    },
}

ENVIRONMENTAL_SAVINGS_LINES = {
    'Waste collection': {
        'savings_pct': 0.05,
        'method': 'Combined contract negotiation (5% benchmark)',
    },
    'Waste disposal': {
        'savings_pct': 0.03,
        'method': 'Contract renegotiation at scale',
    },
    'Recycling': {
        'savings_pct': 0.05,
        'method': 'Combined recycling contracts',
    },
    'Street cleansing (not chargeable to highways)': {
        'savings_pct': 0.03,
        'method': 'Route optimisation across merged areas',
    },
    'CCTV': {
        'savings_pct': 0.15,
        'method': 'Shared monitoring centre',
    },
}

PLANNING_SAVINGS_LINES = {
    'Building control': {
        'savings_pct': 0.10,
        'method': 'Larger shared teams reduce overhead',
    },
    'Development control': {
        'savings_pct': 0.05,
        'method': 'Combined planning teams',
    },
}

CULTURAL_SAVINGS_LINES = {
    'Library service - Library service': {
        'savings_pct': 0.05,
        'method': 'Service rationalisation where coverage overlaps',
    },
    'Open spaces - Parks and open spaces': {
        'savings_pct': 0.02,
        'method': 'Shared grounds maintenance contracts',
    },
}

# Short names for cleaner output (reuse from generate_budgets_from_govuk.py)
SHORT_NAMES = {
    'Corporate and Democratic Core': 'Corporate & Democratic Core',
    'Council tax collection': 'Council tax collection',
    'Council tax support - administration': 'CT support admin',
    'Non-domestic rates collection': 'Business rates collection',
    'Registration of electors': 'Electoral registration',
    'Conducting elections': 'Conducting elections',
    'Local land charges': 'Local land charges',
    'MANAGEMENT AND SUPPORT SERVICES': 'Support services',
    'Costs of unused shares of IT facilities and other assets': 'Unused IT & assets',
    'Revenue expenditure on surplus assets': 'Surplus asset costs',
    'Waste collection': 'Waste collection',
    'Waste disposal': 'Waste disposal',
    'Recycling': 'Recycling',
    'Street cleansing (not chargeable to highways)': 'Street cleansing',
    'CCTV': 'CCTV',
    'Building control': 'Building control',
    'Development control': 'Development control',
    'Library service - Library service': 'Libraries',
    'Open spaces - Parks and open spaces': 'Parks & open spaces',
}

# SeRCOP top-level service categories for budget composition
SERVICE_CATEGORIES = [
    'Education services', 'Childrens Social Care', 'Adult Social Care',
    'Public Health', 'Highways and transport services',
    'Housing services (GFRA only)', 'Cultural and related services',
    'Environmental and regulatory services', 'Planning and development services',
    'Central services', 'Other services',
]


def load_json(path):
    if not os.path.exists(path):
        return None
    with open(path, 'r') as f:
        return json.load(f)


def get_latest_year(govuk_data):
    """Get the latest year key from budgets_govuk.json by_year dict."""
    by_year = govuk_data.get('by_year', {})
    if not by_year:
        return None
    years = sorted(by_year.keys())
    return years[-1] if years else None


def extract_sub_service_net(services_dict, line_name):
    """Extract net_current_expenditure value_pounds from a service line."""
    svc = services_dict.get(line_name, {})
    if not svc:
        return None
    net = svc.get('net_current_expenditure', {})
    if isinstance(net, dict):
        val = net.get('value_pounds')
        return val if val is not None else None
    return None


def extract_service_total_net(revenue_summary, service_name):
    """Extract top-level service net expenditure from revenue_summary."""
    svc = revenue_summary.get('service_expenditure', {}).get(service_name, {})
    if isinstance(svc, dict):
        return svc.get('value_pounds')
    return None


def extract_council_data(council_id, tier):
    """Extract all budget data for a single council."""
    govuk_path = os.path.join(DATA_DIR, council_id, 'budgets_govuk.json')
    summary_path = os.path.join(DATA_DIR, council_id, 'budgets_summary.json')

    govuk = load_json(govuk_path)
    summary = load_json(summary_path)

    if not govuk:
        print(f"  WARNING: No budgets_govuk.json for {council_id}")
        return None

    latest_year = get_latest_year(govuk)
    if not latest_year:
        print(f"  WARNING: No year data for {council_id}")
        return None

    year_data = govuk['by_year'][latest_year]
    detailed = year_data.get('detailed_services', {})
    rev_summary = year_data.get('revenue_summary', {})

    # CT data from budgets_summary.json
    ct_data = {}
    if summary:
        ct = summary.get('council_tax', {})
        # Get latest Band D values
        band_d_by_year = ct.get('band_d_by_year', {})
        band_d_total_by_year = ct.get('band_d_total_by_year', {})
        # Find latest
        if band_d_by_year:
            latest_ct_year = sorted(band_d_by_year.keys())[-1]
            ct_data['ct_band_d_element'] = band_d_by_year[latest_ct_year]
            ct_data['ct_band_d_year'] = latest_ct_year
        if band_d_total_by_year:
            latest_total_year = sorted(band_d_total_by_year.keys())[-1]
            ct_data['ct_band_d_total'] = band_d_total_by_year[latest_total_year]

        # CT requirement from headline
        headline = summary.get('headline', {})
        ct_data['ct_requirement'] = headline.get('council_tax_requirement', 0)
    else:
        # Fallback: use revenue_summary key_financials
        key_fin = rev_summary.get('key_financials', {})
        ct_req = key_fin.get('COUNCIL TAX REQUIREMENT', {})
        ct_data['ct_requirement'] = ct_req.get('value_pounds', 0) if isinstance(ct_req, dict) else 0

    # Derive tax base
    band_d_el = ct_data.get('ct_band_d_element', 0)
    ct_req = ct_data.get('ct_requirement', 0)
    ct_data['tax_base_derived'] = round(ct_req / band_d_el) if band_d_el and band_d_el > 0 else 0

    # Top-level service expenditure
    services = {}
    for svc_name in SERVICE_CATEGORIES:
        val = extract_service_total_net(rev_summary, svc_name)
        if val is not None and val != 0:
            services[svc_name] = val

    # Total service expenditure
    total_svc = rev_summary.get('service_expenditure', {})
    total_val = None
    # Try to sum top-level services or use TOTAL
    for key in ['TOTAL', 'Total service expenditure']:
        t = total_svc.get(key, {})
        if isinstance(t, dict) and t.get('value_pounds'):
            total_val = t['value_pounds']
            break
    if total_val is None:
        total_val = sum(v for v in services.values() if v)

    # Sub-service extraction from detailed RO forms
    sub_services = {}

    # Central services (RO6)
    ro6 = detailed.get('RO6', {}).get('services', {})
    central_subs = {}
    for line_name in CENTRAL_SAVINGS_LINES:
        net = extract_sub_service_net(ro6, line_name)
        if net is not None and net != 0:
            central_subs[line_name] = net
    if central_subs:
        sub_services['Central services'] = central_subs

    # Environmental (RO5)
    ro5 = detailed.get('RO5', {}).get('services', {})
    env_subs = {}
    for line_name in ENVIRONMENTAL_SAVINGS_LINES:
        net = extract_sub_service_net(ro5, line_name)
        if net is not None and net != 0:
            env_subs[line_name] = net
    if env_subs:
        sub_services['Environmental and regulatory services'] = env_subs

    # Planning (RO5)
    planning_subs = {}
    for line_name in PLANNING_SAVINGS_LINES:
        net = extract_sub_service_net(ro5, line_name)
        if net is not None and net != 0:
            planning_subs[line_name] = net
    if planning_subs:
        sub_services['Planning and development services'] = planning_subs

    # Cultural (RO5)
    cultural_subs = {}
    for line_name in CULTURAL_SAVINGS_LINES:
        net = extract_sub_service_net(ro5, line_name)
        if net is not None and net != 0:
            cultural_subs[line_name] = net
    if cultural_subs:
        sub_services['Cultural and related services'] = cultural_subs

    # Key financials
    key_fin = rev_summary.get('key_financials', {})
    net_rev = key_fin.get('NET REVENUE EXPENDITURE', {})
    net_rev_val = net_rev.get('value_pounds') if isinstance(net_rev, dict) else None

    return {
        'council_id': council_id,
        'name': COUNCIL_NAMES.get(council_id, council_id),
        'tier': tier,
        'data_year': latest_year.replace('-', '/'),
        'ct_band_d_element': ct_data.get('ct_band_d_element', 0),
        'ct_band_d_total': ct_data.get('ct_band_d_total', 0),
        'ct_requirement': ct_data.get('ct_requirement', 0),
        'tax_base_derived': ct_data.get('tax_base_derived', 0),
        'total_service_expenditure': total_val,
        'net_revenue_expenditure': net_rev_val,
        'services': services,
        'sub_services': sub_services,
    }


def compute_consolidation_savings(total_spend, num_current, num_new):
    """Consolidation savings: (N_current - N_new) / N_current × total."""
    if num_current <= 0 or num_new <= 0:
        return 0
    ratio = (num_current - num_new) / num_current
    return round(total_spend * ratio)


def compute_per_service_savings(all_councils, proposals, lgr_data):
    """Compute per-service savings for each LGR model."""
    # Aggregate sub-service totals across all 15 councils
    # Districts: 12, County: 1 (LCC), Unitaries: 2 (Blackpool, Blackburn)
    # For central services: only districts have separate billing (CT/NNDR collection etc.)
    # County and unitaries already have their own central services

    districts = [c for c in all_councils.values() if c and c['tier'] == 'district']
    num_districts = len(districts)

    # Total central services sub-lines across ALL councils
    all_central = {}
    district_central = {}
    for council in all_councils.values():
        if not council:
            continue
        central = council.get('sub_services', {}).get('Central services', {})
        for line, net in central.items():
            all_central[line] = all_central.get(line, 0) + net
            if council['tier'] == 'district':
                district_central[line] = district_central.get(line, 0) + net

    # Total environmental sub-lines across districts
    all_env = {}
    for council in all_councils.values():
        if not council:
            continue
        env = council.get('sub_services', {}).get('Environmental and regulatory services', {})
        for line, net in env.items():
            all_env[line] = all_env.get(line, 0) + net

    # Total planning sub-lines across districts
    all_planning = {}
    for council in all_councils.values():
        if not council:
            continue
        planning = council.get('sub_services', {}).get('Planning and development services', {})
        for line, net in planning.items():
            all_planning[line] = all_planning.get(line, 0) + net

    # Total cultural sub-lines
    all_cultural = {}
    for council in all_councils.values():
        if not council:
            continue
        cultural = council.get('sub_services', {}).get('Cultural and related services', {})
        for line, net in cultural.items():
            all_cultural[line] = all_cultural.get(line, 0) + net

    # Total adult + children social care (for integration savings)
    total_social_care = 0
    for council in all_councils.values():
        if not council:
            continue
        svcs = council.get('services', {})
        total_social_care += svcs.get('Adult Social Care', 0)
        total_social_care += svcs.get('Childrens Social Care', 0)

    # Total goods/services procurement (for procurement savings)
    total_procurement = 0
    for council in all_councils.values():
        if not council:
            continue
        total_procurement += council.get('total_service_expenditure', 0) or 0

    # Democratic costs (from lgr_tracker.json)
    methodology = lgr_data.get('independent_model', {}).get('methodology', {}).get('assumptions', {})
    cost_per_councillor = methodology.get('democratic_cost_per_councillor_with_support', 16800)
    current_councillors = lgr_data.get('meta', {}).get('total_population', 0)
    # Count actual councillors from proposals
    current_councillors = 626  # from lgr_tracker.json existing data
    target_councillors = 200

    results = {}
    for proposal in proposals:
        model_id = proposal['id']
        num_new = proposal['num_authorities']

        # Number of entities being merged:
        # All models merge 12 districts + LCC + 2 unitaries = 15 councils → N new
        num_merging = 15

        savings_lines = []

        # --- Central services savings ---
        for line_name, config in CENTRAL_SAVINGS_LINES.items():
            total = all_central.get(line_name, 0)
            if total <= 0:
                continue

            if 'savings_formula' in config and config['savings_formula'] == 'consolidation':
                # For CT/NNDR collection: primarily district function
                # Districts go from 12 separate → num_new authorities
                district_total = district_central.get(line_name, 0)
                if district_total > 0:
                    saving = compute_consolidation_savings(district_total, num_districts, num_new)
                else:
                    saving = compute_consolidation_savings(total, num_merging, num_new)
            else:
                pct = config.get('savings_pct', 0)
                saving = round(total * pct)

            if saving > 0:
                short = SHORT_NAMES.get(line_name, line_name)
                savings_lines.append({
                    'category': 'Central services',
                    'line': short,
                    'current_total': total,
                    'saving': saving,
                    'method': config['method'],
                })

        # --- Environmental savings ---
        for line_name, config in ENVIRONMENTAL_SAVINGS_LINES.items():
            total = all_env.get(line_name, 0)
            if total <= 0:
                continue
            pct = config.get('savings_pct', 0)
            saving = round(total * pct)
            if saving > 0:
                short = SHORT_NAMES.get(line_name, line_name)
                savings_lines.append({
                    'category': 'Environmental services',
                    'line': short,
                    'current_total': total,
                    'saving': saving,
                    'method': config['method'],
                })

        # --- Planning savings ---
        for line_name, config in PLANNING_SAVINGS_LINES.items():
            total = all_planning.get(line_name, 0)
            if total <= 0:
                continue
            pct = config.get('savings_pct', 0)
            saving = round(total * pct)
            if saving > 0:
                short = SHORT_NAMES.get(line_name, line_name)
                savings_lines.append({
                    'category': 'Planning services',
                    'line': short,
                    'current_total': total,
                    'saving': saving,
                    'method': config['method'],
                })

        # --- Cultural savings ---
        for line_name, config in CULTURAL_SAVINGS_LINES.items():
            total = all_cultural.get(line_name, 0)
            if total <= 0:
                continue
            pct = config.get('savings_pct', 0)
            saving = round(total * pct)
            if saving > 0:
                short = SHORT_NAMES.get(line_name, line_name)
                savings_lines.append({
                    'category': 'Cultural services',
                    'line': short,
                    'current_total': total,
                    'saving': saving,
                    'method': config['method'],
                })

        # --- Democratic representation ---
        democratic_saving = (current_councillors - target_councillors) * cost_per_councillor
        savings_lines.append({
            'category': 'Democratic representation',
            'line': 'Councillor reduction',
            'current_total': current_councillors * cost_per_councillor,
            'saving': democratic_saving,
            'method': f'{current_councillors - target_councillors} fewer councillors ({current_councillors} to {target_councillors}) at {cost_per_councillor:,}/yr',
        })

        # --- Procurement savings (3% × consolidation ratio) ---
        procurement_pct = methodology.get('procurement_saving_pct', 0.03)
        consolidation_ratio = (num_merging - num_new) / num_merging
        procurement_saving = round(total_procurement * procurement_pct * consolidation_ratio)
        savings_lines.append({
            'category': 'Procurement',
            'line': 'Combined procurement',
            'current_total': total_procurement,
            'saving': procurement_saving,
            'method': f'{procurement_pct*100:.0f}% of £{total_procurement/1e6:.0f}M total expenditure × {consolidation_ratio*100:.0f}% consolidation',
        })

        # --- Social care integration (1% — only for unitary models, not county) ---
        if model_id != 'county_unitary':
            sc_pct = 0.01
            sc_saving = round(total_social_care * sc_pct)
            if sc_saving > 0:
                savings_lines.append({
                    'category': 'Social care integration',
                    'line': 'Adult + children\'s social care',
                    'current_total': total_social_care,
                    'saving': sc_saving,
                    'method': f'1% efficiency from eliminating county/district coordination',
                })

        # Aggregate by category
        total_saving = sum(l['saving'] for l in savings_lines)
        by_category = {}
        for line in savings_lines:
            cat = line['category']
            if cat not in by_category:
                by_category[cat] = {'total': 0, 'lines': []}
            by_category[cat]['total'] += line['saving']
            by_category[cat]['lines'].append({
                'name': line['line'],
                'current_total': line['current_total'],
                'saving': line['saving'],
                'method': line['method'],
            })

        results[model_id] = {
            'total_annual_savings': total_saving,
            'by_category': by_category,
            'savings_lines': savings_lines,
        }

    return results


def compute_ct_harmonisation(all_councils, proposals):
    """Compute council tax harmonisation for each model.

    Key logic: LCC levies a county precept on the SAME tax base as districts.
    A new unitary replaces both district + county elements with a single rate.

    For each successor authority:
    - CT requirement = sum of ALL constituent councils' CT requirements
    - Tax base = sum of ONLY district/unitary tax bases (NOT LCC, which shares
      the same properties as the 12 districts)
    - LCC's CT requirement is apportioned to each authority pro-rata by tax base
    - New harmonised Band D = total_CT_requirement / tax_base
    - Compare against current district+LCC combined element (or unitary element)

    Police and fire precepts are unchanged (not modelled here).
    """
    results = {}

    lcc = all_councils.get('lancashire_cc')
    lcc_band_d = lcc['ct_band_d_element'] if lcc else 0
    lcc_ct_requirement = lcc['ct_requirement'] if lcc else 0
    # LCC's tax base = total across all 12 districts (same properties)
    lcc_tax_base = lcc['tax_base_derived'] if lcc else 0

    for proposal in proposals:
        model_id = proposal['id']
        authority_results = []

        for authority in proposal.get('authorities', []):
            auth_name = authority['name']
            council_ids = authority.get('councils', [])

            # Separate into districts, unitaries, and LCC
            # Key: districts only levy their own element. LCC levies a separate
            # county precept on the same tax base. Unitaries levy a single combined rate.
            # The new unitary replaces BOTH district+LCC elements for districts,
            # or the unitary element for existing unitaries.
            district_ct_req = 0
            district_tax_base = 0
            unitary_ct_req = 0
            unitary_tax_base = 0
            has_districts = False
            council_details = []

            for cid in council_ids:
                c = all_councils.get(cid)
                if not c:
                    continue

                ct_req = c.get('ct_requirement', 0)
                tax_base = c.get('tax_base_derived', 0)
                band_d_el = c.get('ct_band_d_element', 0)
                band_d_total = c.get('ct_band_d_total', 0)
                tier = c.get('tier', 'district')

                if tier == 'district':
                    district_ct_req += ct_req
                    district_tax_base += tax_base
                    has_districts = True
                elif tier == 'unitary':
                    # Unitaries already fund county-equivalent services
                    unitary_ct_req += ct_req
                    unitary_tax_base += tax_base
                # county (LCC) — handled below via apportionment

                if tier != 'county':
                    council_details.append({
                        'council_id': cid,
                        'name': c['name'],
                        'tier': tier,
                        'band_d_element': round(band_d_el, 2),
                        'band_d_total': round(band_d_total, 2),
                        'ct_requirement': ct_req,
                        'tax_base': tax_base,
                    })

            # LCC county precept apportioned to districts in this authority
            # Unitaries DON'T get an LCC share (they already fund those services)
            lcc_share = 0
            if has_districts and lcc_tax_base > 0:
                lcc_share = round(lcc_ct_requirement * (district_tax_base / lcc_tax_base))

            # Total for the new authority:
            # = district CT reqs + LCC share (for county services) + unitary CT reqs
            total_ct_requirement = district_ct_req + lcc_share + unitary_ct_req
            total_tax_base = district_tax_base + unitary_tax_base

            # New harmonised Band D
            harmonised_band_d = round(total_ct_requirement / total_tax_base, 2) if total_tax_base > 0 else 0

            # Calculate deltas per council
            for detail in council_details:
                tier = detail['tier']
                if tier == 'district':
                    # Current: district element + LCC element (police/fire stay same)
                    current_combined = detail['band_d_element'] + lcc_band_d
                elif tier == 'county':
                    # LCC element is absorbed — show LCC's own element for reference
                    current_combined = detail['band_d_element']
                else:
                    # Unitary: already pays a combined rate
                    current_combined = detail['band_d_element']

                delta = round(harmonised_band_d - current_combined, 2)
                detail['current_combined_element'] = round(current_combined, 2)
                detail['harmonised_band_d'] = harmonised_band_d
                detail['delta'] = delta
                detail['winner'] = delta < 0

            # Remove LCC from council list for display (it's implicit)
            display_councils = [c for c in council_details if c['tier'] != 'county']
            # Sort: biggest losers first
            display_councils.sort(key=lambda x: x['delta'], reverse=True)

            authority_results.append({
                'name': auth_name,
                'harmonised_band_d': harmonised_band_d,
                'total_ct_requirement': total_ct_requirement,
                'lcc_ct_share': lcc_share,
                'total_tax_base': total_tax_base,
                'council_count': len(display_councils),
                'councils': display_councils,
                'band_d_range': {
                    'min': min(d['current_combined_element'] for d in display_councils) if display_councils else 0,
                    'max': max(d['current_combined_element'] for d in display_councils) if display_councils else 0,
                },
            })

        results[model_id] = {
            'authorities': authority_results,
            'note': 'Band D harmonisation to new unitary rate. Police and fire precepts unchanged. '
                    'Each new authority inherits a pro-rata share of LCC\'s £{:.0f}M CT requirement. '
                    'Current combined element = district + LCC county precept (£{:.2f}).'.format(
                        lcc_ct_requirement / 1e6, lcc_band_d),
            'lcc_band_d_element': round(lcc_band_d, 2),
            'lcc_ct_requirement': lcc_ct_requirement,
        }

    return results


def compute_authority_composition(all_councils, proposals):
    """Compute per-authority budget composition by service category."""
    results = {}

    for proposal in proposals:
        model_id = proposal['id']
        authority_results = []

        for authority in proposal.get('authorities', []):
            auth_name = authority['name']
            council_ids = authority.get('councils', [])
            population = authority.get('population', 0)

            # Aggregate services
            service_totals = {}
            total_expenditure = 0

            for cid in council_ids:
                c = all_councils.get(cid)
                if not c:
                    continue
                for svc_name, val in c.get('services', {}).items():
                    if val:
                        service_totals[svc_name] = service_totals.get(svc_name, 0) + val
                        total_expenditure += val

            # Calculate proportions
            services_with_pct = {}
            for svc_name in SERVICE_CATEGORIES:
                val = service_totals.get(svc_name, 0)
                if val != 0:
                    pct = round(val / total_expenditure * 100, 1) if total_expenditure else 0
                    services_with_pct[svc_name] = {
                        'net': val,
                        'pct': pct,
                        'per_head': round(val / population) if population > 0 else 0,
                    }

            authority_results.append({
                'name': auth_name,
                'population': population,
                'total_service_expenditure': total_expenditure,
                'spend_per_head': round(total_expenditure / population) if population > 0 else 0,
                'services': services_with_pct,
            })

        results[model_id] = authority_results

    return results


def update_lgr_tracker_savings(lgr_data, per_service_savings):
    """Update lgr_tracker.json savings_breakdown with per-service figures.

    Replaces the 6 flat-% components with aggregated per-service totals,
    keeping the same structure for chart compatibility.
    """
    model_keys = {
        'two_unitary': 'two_ua',
        'three_unitary': 'three_ua',
        'four_unitary': 'four_ua',
        'four_unitary_alt': 'five_ua',  # Map alt to 5-UA slot
        'county_unitary': 'county',
    }

    # Build new components from per-service savings
    # Aggregate by top-level category to match existing chart format
    categories = ['Central services', 'Environmental services', 'Planning services',
                  'Cultural services', 'Democratic representation', 'Procurement',
                  'Social care integration']

    new_components = []
    for cat in categories:
        component = {'category': cat}
        has_any = False

        for model_id, model_key in model_keys.items():
            model_savings = per_service_savings.get(model_id, {})
            cat_data = model_savings.get('by_category', {}).get(cat, {})
            total = cat_data.get('total', 0)
            component[model_key] = total

            # Build methodology string from lines
            lines = cat_data.get('lines', [])
            if lines:
                has_any = True
                methods = []
                for l in lines:
                    methods.append(f"£{l['saving']/1e6:.2f}M from {l['name']}")
                component[f'{model_key}_methodology'] = '; '.join(methods)
            else:
                component[f'{model_key}_methodology'] = 'No applicable savings'

        if has_any:
            new_components.append(component)

    # Update net_annual totals
    new_net_annual = {}
    # Reuse existing ongoing costs from lgr_tracker
    existing_net = lgr_data.get('independent_model', {}).get('savings_breakdown', {}).get('net_annual', {})

    for model_id, model_key in model_keys.items():
        model_savings = per_service_savings.get(model_id, {})
        gross = model_savings.get('total_annual_savings', 0)
        # Keep existing ongoing costs
        existing = existing_net.get(model_key, {})
        costs = existing.get('costs', 0)
        new_net_annual[model_key] = {
            'gross': gross,
            'costs': costs,
            'net': gross + costs,  # costs are negative
        }

    return new_components, new_net_annual


def main():
    print("LGR Budget Model — extracting per-service data from 15 councils...")

    # Load lgr_tracker.json for proposal groupings
    lgr_path = os.path.join(SHARED_DIR, 'lgr_tracker.json')
    lgr_data = load_json(lgr_path)
    if not lgr_data:
        print("ERROR: Could not load lgr_tracker.json")
        sys.exit(1)

    proposals = lgr_data.get('proposed_models', [])
    print(f"  Loaded {len(proposals)} LGR proposals")

    # Extract data for all 15 councils
    all_councils = {}
    for council_id, tier in COUNCILS.items():
        print(f"  Extracting {council_id} ({tier})...")
        data = extract_council_data(council_id, tier)
        all_councils[council_id] = data
        if data:
            central_lines = len(data.get('sub_services', {}).get('Central services', {}))
            env_lines = len(data.get('sub_services', {}).get('Environmental and regulatory services', {}))
            print(f"    -> {central_lines} central + {env_lines} environmental sub-lines, "
                  f"Band D £{data.get('ct_band_d_element', 0):.2f}, "
                  f"CT req £{data.get('ct_requirement', 0)/1e6:.1f}M")
        else:
            print(f"    -> NO DATA")

    # Compute per-service savings
    print("\n  Computing per-service savings...")
    per_service_savings = compute_per_service_savings(all_councils, proposals, lgr_data)
    for model_id, savings in per_service_savings.items():
        total = savings['total_annual_savings']
        lines = len(savings['savings_lines'])
        print(f"    {model_id}: £{total/1e6:.1f}M/year from {lines} service lines")

    # Compute CT harmonisation
    print("\n  Computing council tax harmonisation...")
    ct_harmonisation = compute_ct_harmonisation(all_councils, proposals)
    for model_id, ct in ct_harmonisation.items():
        for auth in ct['authorities']:
            band_d = auth['harmonised_band_d']
            rng = auth['band_d_range']
            winners = sum(1 for c in auth['councils'] if c.get('winner'))
            losers = len(auth['councils']) - winners
            print(f"    {model_id}/{auth['name']}: harmonised £{band_d:.2f} "
                  f"(range £{rng['min']:.2f}-£{rng['max']:.2f}), "
                  f"{winners} winners, {losers} losers")

    # Compute authority composition
    print("\n  Computing authority budget composition...")
    authority_composition = compute_authority_composition(all_councils, proposals)

    # Build output
    output = {
        'meta': {
            'generated': datetime.now().isoformat(timespec='seconds'),
            'data_year': '2024/25',
            'source': 'GOV.UK MHCLG Revenue Outturn 2024-25 (RS, RSX, RO2, RO4, RO5, RO6)',
            'councils_extracted': len([c for c in all_councils.values() if c]),
            'total_sub_service_lines': sum(
                sum(len(subs) for subs in c.get('sub_services', {}).values())
                for c in all_councils.values() if c
            ),
        },
        'council_budgets': {
            cid: {
                'name': c['name'],
                'tier': c['tier'],
                'ct_band_d_element': c.get('ct_band_d_element', 0),
                'ct_band_d_total': c.get('ct_band_d_total', 0),
                'ct_requirement': c.get('ct_requirement', 0),
                'tax_base_derived': c.get('tax_base_derived', 0),
                'total_service_expenditure': c.get('total_service_expenditure', 0),
                'services': c.get('services', {}),
            }
            for cid, c in all_councils.items() if c
        },
        'per_service_savings': per_service_savings,
        'council_tax_harmonisation': ct_harmonisation,
        'authority_composition': authority_composition,
    }

    # Write output
    output_path = os.path.join(SHARED_DIR, 'lgr_budget_model.json')
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)
    file_size = os.path.getsize(output_path)
    print(f"\n  Written {output_path} ({file_size/1024:.0f}KB)")

    # Update lgr_tracker.json savings model
    print("\n  Updating lgr_tracker.json savings model...")
    new_components, new_net_annual = update_lgr_tracker_savings(lgr_data, per_service_savings)

    lgr_data['independent_model']['savings_breakdown']['components'] = new_components
    lgr_data['independent_model']['savings_breakdown']['net_annual'] = new_net_annual
    lgr_data['independent_model']['computation_date'] = datetime.now().strftime('%Y-%m-%d')
    lgr_data['independent_model']['subtitle'] = (
        f"Built from £{sum(c.get('total_service_expenditure', 0) or 0 for c in all_councils.values() if c)/1e9:.1f}B+ "
        f"actual GOV.UK 2024-25 revenue outturn data across 15 Lancashire councils — "
        f"now with per-service savings from {output['meta']['total_sub_service_lines']} real budget lines"
    )

    # Update payback analysis to match new savings
    for pa in lgr_data['independent_model'].get('payback_analysis', []):
        model_id = pa['model']
        model_key_map = {
            'two_unitary': 'two_ua', 'three_unitary': 'three_ua',
            'four_unitary': 'four_ua', 'five_unitary': 'five_ua',
            'county_unitary': 'county',
        }
        model_key = model_key_map.get(model_id)
        if model_key and model_key in new_net_annual:
            gross = new_net_annual[model_key]['gross']
            pa['annual_saving'] = gross
            tc = pa.get('transition_cost', 0)
            pa['payback_years'] = round(tc / gross, 1) if gross > 0 else None
            pa['ten_year_net'] = gross * 10 - tc
            pa['realistic_ten_year_net'] = round(gross * 0.75 * 10 - tc * 1.25)

    # Update presentation comparison
    for model_id in ['two_unitary', 'three_unitary', 'four_unitary']:
        model_key_map = {'two_unitary': 'two_ua', 'three_unitary': 'three_ua', 'four_unitary': 'four_ua'}
        model_key = model_key_map.get(model_id)
        if model_key in new_net_annual:
            comp = lgr_data['independent_model'].get('presentation_comparison', {}).get(model_id)
            if comp:
                comp['doge_computed_savings'] = new_net_annual[model_key]['gross']

    # Update proposed model doge_annual_savings
    for proposal in lgr_data.get('proposed_models', []):
        model_id = proposal['id']
        if model_id in per_service_savings:
            proposal['doge_annual_savings'] = per_service_savings[model_id]['total_annual_savings']

    with open(lgr_path, 'w') as f:
        json.dump(lgr_data, f, indent=2)
    print(f"  Updated {lgr_path}")

    print(f"\nDone! {output['meta']['councils_extracted']} councils, "
          f"{output['meta']['total_sub_service_lines']} sub-service lines extracted.")


if __name__ == '__main__':
    main()
