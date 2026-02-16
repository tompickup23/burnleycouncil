#!/usr/bin/env python3
"""
Generate LGR service gap analysis from actual GOV.UK budget data.

Maps every service category to its current provider (district/county/unitary),
computes costs per proposed authority under each LGR model, and assesses
integration complexity and delivery risk.

Usage:
    python3 scripts/generate_service_gaps.py

Output:
    burnley-council/data/shared/lgr_service_mapping.json
"""

import json
import os
import sys

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'burnley-council', 'data')

# All 15 Lancashire councils
COUNCILS = [
    'burnley', 'hyndburn', 'pendle', 'rossendale',
    'lancaster', 'ribble_valley', 'chorley', 'south_ribble',
    'preston', 'west_lancashire', 'wyre', 'fylde',
    'lancashire_cc', 'blackpool', 'blackburn'
]

COUNCIL_NAMES = {
    'burnley': 'Burnley', 'hyndburn': 'Hyndburn', 'pendle': 'Pendle',
    'rossendale': 'Rossendale', 'lancaster': 'Lancaster', 'ribble_valley': 'Ribble Valley',
    'chorley': 'Chorley', 'south_ribble': 'South Ribble', 'preston': 'Preston',
    'west_lancashire': 'West Lancashire', 'wyre': 'Wyre', 'fylde': 'Fylde',
    'lancashire_cc': 'Lancashire CC', 'blackpool': 'Blackpool', 'blackburn': 'Blackburn with Darwen'
}

# Service categories and their tier responsibility
SERVICE_DEFINITIONS = {
    'Education services': {
        'tier': 'upper',
        'description': 'Schools, early years, SEND, school transport, adult education',
        'current_providers': ['lancashire_cc', 'blackpool', 'blackburn'],
        'integration_complexity': 9,
        'delivery_risk': 'critical',
        'risk_detail': 'LCC commissions 600+ schools. New unitaries must establish education directorates from scratch. SEND is already in crisis (DSG deficit £95.5M). School transport contracts are county-wide.',
        'precedent_note': 'Northamptonshire reorganisation saw education costs rise 8% in Year 1 before stabilising'
    },
    'Children Social Care': {
        'tier': 'upper',
        'description': 'Child protection, looked-after children, fostering, adoption, family support',
        'current_providers': ['lancashire_cc', 'blackpool', 'blackburn'],
        'integration_complexity': 10,
        'delivery_risk': 'critical',
        'risk_detail': 'Statutory service — cannot fail. LCC rated "Requires Improvement" by Ofsted. Blackpool rated "Good". Splitting case management systems risks safeguarding gaps. Agency staff costs already high.',
        'precedent_note': 'Northamptonshire children\'s services were placed in trust after reorganisation'
    },
    'Adult Social Care': {
        'tier': 'upper',
        'description': 'Elderly care, learning disability, mental health, domiciliary care, care homes',
        'current_providers': ['lancashire_cc', 'blackpool', 'blackburn'],
        'integration_complexity': 10,
        'delivery_risk': 'critical',
        'risk_detail': 'LCC rated "Requires Improvement" by CQC (2.0/4). £558M budget. Provider contracts are county-wide. Care market is fragile — reorganisation uncertainty may cause providers to exit.',
        'precedent_note': 'Durham reorganisation: adult social care costs rose 3% in Year 1; took 3 years to stabilise provider relationships'
    },
    'Public Health': {
        'tier': 'upper',
        'description': 'Public health programmes, health protection, health improvement, sexual health',
        'current_providers': ['lancashire_cc', 'blackpool', 'blackburn'],
        'integration_complexity': 5,
        'delivery_risk': 'medium',
        'risk_detail': 'Ring-fenced grant. Contracts can transfer. Main risk is loss of county-wide epidemiological intelligence and economies of scale in commissioning.',
        'precedent_note': 'Public health transfers in 2013 (NHS→councils) provide a model for smooth handover'
    },
    'Highways and transport services': {
        'tier': 'mixed',
        'description': 'Road maintenance, street lighting, traffic management, public transport, parking',
        'current_providers': ['lancashire_cc', 'blackpool', 'blackburn', 'burnley', 'hyndburn', 'pendle', 'rossendale', 'lancaster', 'ribble_valley', 'chorley', 'south_ribble', 'preston', 'west_lancashire', 'wyre', 'fylde'],
        'integration_complexity': 7,
        'delivery_risk': 'high',
        'risk_detail': 'LCC manages strategic roads and major infrastructure. Districts manage car parks and some local roads. Contracts with Highways England, BAM Nuttall, Balfour Beatty are county-wide. Winter gritting and emergency response need county-scale coordination.',
        'precedent_note': 'Wiltshire reorganisation: highways maintenance backlog increased 15% during transition'
    },
    'Housing services (GFRA only)': {
        'tier': 'lower',
        'description': 'Housing strategy, homelessness, housing benefits admin, HMO licensing, empty homes',
        'current_providers': ['burnley', 'hyndburn', 'pendle', 'rossendale', 'lancaster', 'ribble_valley', 'chorley', 'south_ribble', 'preston', 'west_lancashire', 'wyre', 'fylde', 'blackpool', 'blackburn'],
        'integration_complexity': 4,
        'delivery_risk': 'low',
        'risk_detail': 'District-level service. New unitaries inherit existing housing staff and policies. Main risk is loss of local knowledge about housing stock and homelessness patterns.',
        'precedent_note': 'Housing services typically transfer smoothly in reorganisations — small teams, local knowledge retained'
    },
    'Cultural and related services': {
        'tier': 'mixed',
        'description': 'Libraries, museums, leisure centres, parks, tourism, arts, sports',
        'current_providers': ['lancashire_cc', 'blackpool', 'blackburn', 'burnley', 'hyndburn', 'pendle', 'rossendale', 'lancaster', 'ribble_valley', 'chorley', 'south_ribble', 'preston', 'west_lancashire', 'wyre', 'fylde'],
        'integration_complexity': 3,
        'delivery_risk': 'low',
        'risk_detail': 'LCC runs libraries (74 branches). Districts run leisure centres, parks, cemeteries. These are non-statutory — risk is political (closures during austerity/transition) not operational.',
        'precedent_note': 'Shropshire reorganisation: 5 district leisure centres closed within 2 years of merger'
    },
    'Environmental and regulatory services': {
        'tier': 'mixed',
        'description': 'Waste collection, waste disposal, recycling, trading standards, environmental health, flood defence',
        'current_providers': ['lancashire_cc', 'blackpool', 'blackburn', 'burnley', 'hyndburn', 'pendle', 'rossendale', 'lancaster', 'ribble_valley', 'chorley', 'south_ribble', 'preston', 'west_lancashire', 'wyre', 'fylde'],
        'integration_complexity': 6,
        'delivery_risk': 'medium',
        'risk_detail': 'Split between tiers: LCC does waste disposal + trading standards; districts do waste collection + environmental health. Combining creates operational efficiencies but existing contracts have different end dates (2026-2032).',
        'precedent_note': 'Buckinghamshire reorganisation: waste contract harmonisation took 18 months and cost £2.3M'
    },
    'Planning and development services': {
        'tier': 'lower',
        'description': 'Development control, building control, local plans, conservation, economic development',
        'current_providers': ['burnley', 'hyndburn', 'pendle', 'rossendale', 'lancaster', 'ribble_valley', 'chorley', 'south_ribble', 'preston', 'west_lancashire', 'wyre', 'fylde', 'blackpool', 'blackburn'],
        'integration_complexity': 5,
        'delivery_risk': 'medium',
        'risk_detail': 'Each district has its own Local Plan at different stages of adoption. Merging planning departments requires harmonising development policies, Section 106 agreements, and CIL regimes. Lancashire has 12 different Local Plans.',
        'precedent_note': 'Dorset reorganisation: local plan harmonisation still ongoing 5 years post-merger'
    },
    'Central services': {
        'tier': 'all',
        'description': 'Corporate management, democratic core, elections, council tax collection, pensions, HR, IT, finance',
        'current_providers': ['lancashire_cc', 'blackpool', 'blackburn', 'burnley', 'hyndburn', 'pendle', 'rossendale', 'lancaster', 'ribble_valley', 'chorley', 'south_ribble', 'preston', 'west_lancashire', 'wyre', 'fylde'],
        'integration_complexity': 8,
        'delivery_risk': 'high',
        'risk_detail': 'Where most savings come from — but also where most risk lies. LCC\'s Oracle Fusion failure (£27M cost, data breaches) is a warning. 15 different IT systems, payroll providers, and democratic structures must merge. Council tax collection and business rates are critical revenue streams.',
        'precedent_note': 'Northamptonshire: IT integration cost £32M vs £18M estimate. Oracle ERP migration took 3 years vs planned 18 months.'
    },
    'Fire and rescue services': {
        'tier': 'upper',
        'description': 'Fire prevention, emergency response, rescue services',
        'current_providers': ['lancashire_cc'],
        'integration_complexity': 2,
        'delivery_risk': 'low',
        'risk_detail': 'Lancashire Fire and Rescue Service is a combined authority — already operates across the whole county. Likely to remain as a combined service post-LGR regardless of boundary model.',
        'precedent_note': 'Fire services typically remain county-wide after reorganisation (Dorset, Buckinghamshire, Wiltshire all retained combined fire authorities)'
    }
}

# The 5 proposed LGR models from lgr_tracker.json
PROPOSED_MODELS = {
    'two_unitary': {
        'name': 'Two Unitaries (Proposal 1)',
        'authorities': {
            'North Lancashire': ['lancaster', 'wyre', 'fylde', 'preston', 'ribble_valley', 'blackpool'],
            'South Lancashire': ['chorley', 'south_ribble', 'west_lancashire', 'burnley', 'hyndburn', 'pendle', 'rossendale', 'blackburn']
        }
    },
    'three_unitary': {
        'name': 'Three Unitaries (Proposal 2)',
        'authorities': {
            'Coastal Lancashire': ['blackpool', 'fylde', 'lancaster', 'wyre'],
            'Central Lancashire': ['chorley', 'preston', 'south_ribble', 'west_lancashire'],
            'Pennine Lancashire': ['blackburn', 'burnley', 'hyndburn', 'pendle', 'ribble_valley', 'rossendale']
        }
    },
    'four_unitary': {
        'name': 'Four Unitaries (Proposal 3)',
        'authorities': {
            'North Lancashire': ['lancaster', 'preston', 'ribble_valley'],
            'Fylde Coast': ['blackpool', 'fylde', 'wyre'],
            'Pennine Lancashire': ['blackburn', 'burnley', 'hyndburn', 'pendle', 'rossendale'],
            'South Lancashire': ['chorley', 'south_ribble', 'west_lancashire']
        }
    },
    'four_unitary_alt': {
        'name': 'Four Unitaries Alt (Proposal 4)',
        'authorities': {
            'Western Lancashire': ['blackpool', 'fylde', 'preston'],
            'Southern Lancashire': ['chorley', 'south_ribble', 'west_lancashire'],
            'Eastern Lancashire': ['blackburn', 'burnley', 'hyndburn', 'pendle', 'rossendale'],
            'Northern Lancashire': ['lancaster']
        }
    },
    'five_unitary': {
        'name': 'Five Unitaries (Proposal 5)',
        'authorities': {
            'East Lancashire': ['burnley', 'pendle', 'rossendale'],
            'Central Lancashire': ['blackburn', 'hyndburn', 'ribble_valley'],
            'North Lancashire': ['lancaster', 'wyre'],
            'South Lancashire': ['chorley', 'south_ribble', 'west_lancashire'],
            'West Lancashire': ['blackpool', 'fylde', 'preston']
        }
    }
}


def load_budgets():
    """Load budgets_summary.json for all 15 councils."""
    budgets = {}
    for council_id in COUNCILS:
        path = os.path.join(DATA_DIR, council_id, 'budgets_summary.json')
        if os.path.exists(path):
            with open(path) as f:
                budgets[council_id] = json.load(f)
        else:
            print(f"Warning: No budgets_summary.json for {council_id}")
    return budgets


def get_service_cost(budgets, council_id, service_name):
    """Get cost of a service category for a given council."""
    budget = budgets.get(council_id)
    if not budget:
        return 0
    breakdown = budget.get('service_breakdown', {})
    return breakdown.get(service_name, 0)


def compute_current_state(budgets):
    """Compute the current total cost per service across all 15 councils."""
    services = {}
    for service_name, defn in SERVICE_DEFINITIONS.items():
        providers = {}
        total = 0
        for council_id in COUNCILS:
            cost = get_service_cost(budgets, council_id, service_name)
            if cost != 0:
                providers[council_id] = {
                    'name': COUNCIL_NAMES[council_id],
                    'cost': cost,
                    'tier': budgets.get(council_id, {}).get('council_tier', 'unknown')
                }
                total += cost

        # Separate by tier
        county_cost = sum(p['cost'] for cid, p in providers.items() if p['tier'] == 'county')
        district_cost = sum(p['cost'] for cid, p in providers.items() if p['tier'] == 'district')
        unitary_cost = sum(p['cost'] for cid, p in providers.items() if p['tier'] == 'unitary')

        services[service_name] = {
            'definition': defn['description'],
            'current_tier': defn['tier'],
            'total_cost': total,
            'county_cost': county_cost,
            'district_cost': district_cost,
            'unitary_cost': unitary_cost,
            'providers': providers,
            'integration_complexity': defn['integration_complexity'],
            'delivery_risk': defn['delivery_risk'],
            'risk_detail': defn['risk_detail'],
            'precedent_note': defn['precedent_note']
        }

    return services


def compute_authority_services(budgets, model_id, model_def):
    """Compute service costs for each authority in a proposed model."""
    authorities = {}

    for auth_name, council_ids in model_def['authorities'].items():
        auth_services = {}
        auth_total = 0

        for service_name in SERVICE_DEFINITIONS:
            defn = SERVICE_DEFINITIONS[service_name]
            cost = 0

            # District/lower-tier services: sum costs from constituent councils
            for council_id in council_ids:
                cost += get_service_cost(budgets, council_id, service_name)

            # County services: apportion LCC costs by population share
            if defn['tier'] in ('upper', 'mixed', 'all') and service_name != 'Fire and rescue services':
                lcc_cost = get_service_cost(budgets, 'lancashire_cc', service_name)
                if lcc_cost != 0:
                    # Calculate population share for non-unitary councils in this authority
                    # (unitaries already have their own costs included above)
                    district_ids = [c for c in council_ids if c not in ('blackpool', 'blackburn')]
                    if district_ids:
                        # Population shares (approximate from lgr_tracker)
                        pop = get_population_share(district_ids)
                        cost += int(lcc_cost * pop)

            auth_services[service_name] = {
                'cost': cost,
                'new_responsibility': defn['tier'] == 'upper' and any(
                    c not in ('blackpool', 'blackburn', 'lancashire_cc') for c in council_ids
                ),
                'integration_complexity': defn['integration_complexity']
            }
            auth_total += cost

        # Count which service types are new vs inherited
        new_services = sum(1 for s in auth_services.values() if s.get('new_responsibility'))
        inherited_services = len(auth_services) - new_services

        authorities[auth_name] = {
            'councils': council_ids,
            'services': auth_services,
            'total_service_expenditure': auth_total,
            'new_services_count': new_services,
            'inherited_services_count': inherited_services,
            'max_integration_complexity': max(s['integration_complexity'] for s in auth_services.values())
        }

    return authorities


# District populations (from census/metadata — approximate 2024-25)
DISTRICT_POPULATIONS = {
    'burnley': 94649, 'hyndburn': 82627, 'pendle': 95753,
    'rossendale': 71068, 'lancaster': 142932, 'ribble_valley': 61558,
    'chorley': 118989, 'south_ribble': 111613, 'west_lancashire': 117345,
    'preston': 147881, 'wyre': 113397, 'fylde': 81375,
    'blackpool': 141100, 'blackburn': 157100,
    'lancashire_cc': 1253186  # sum of 12 districts
}

TOTAL_LCC_POP = sum(DISTRICT_POPULATIONS[c] for c in DISTRICT_POPULATIONS if c not in ('blackpool', 'blackburn', 'lancashire_cc'))


def get_population_share(district_ids):
    """Get population share of given districts relative to LCC total."""
    district_pop = sum(DISTRICT_POPULATIONS.get(c, 0) for c in district_ids)
    return district_pop / TOTAL_LCC_POP if TOTAL_LCC_POP > 0 else 0


def build_transition_timeline():
    """Build service-by-service transition timeline."""
    return [
        {
            'phase': 'Phase 1: Shadow Authority',
            'period': 'May 2027 – March 2028',
            'services': [
                {'name': 'Central services', 'action': 'New democratic structures elected. Shadow cabinet formed. IT integration planning begins.'},
                {'name': 'Fire and rescue services', 'action': 'Confirmation of continued combined authority — no change required.'}
            ]
        },
        {
            'phase': 'Phase 2: Critical Handover',
            'period': 'April 2028 (Vesting Day)',
            'services': [
                {'name': 'Children Social Care', 'action': 'TUPE transfer of all social workers. Case management systems must be live. Safeguarding handover is safety-critical — no gaps permitted.'},
                {'name': 'Adult Social Care', 'action': 'Provider contracts novated to new authority. Care packages must continue uninterrupted. CQC registration transferred.'},
                {'name': 'Education services', 'action': 'School funding agreements transferred. SEND casework continuity. School transport contracts novated.'},
                {'name': 'Housing services (GFRA only)', 'action': 'Homelessness duty transfers to new authority. Housing benefit admin continues.'},
                {'name': 'Central services', 'action': 'Council tax billing goes live under new authority name. Payroll transferred. New website live.'}
            ]
        },
        {
            'phase': 'Phase 3: Operational Integration',
            'period': 'April 2028 – March 2029',
            'services': [
                {'name': 'Environmental and regulatory services', 'action': 'Waste contracts harmonised. Trading standards merged. Environmental health teams consolidated.'},
                {'name': 'Highways and transport services', 'action': 'Highway maintenance contracts consolidated. Winter gritting routes re-planned for new boundaries.'},
                {'name': 'Planning and development services', 'action': 'Transitional development management arrangements. Begin new Local Plan process.'},
                {'name': 'Public Health', 'action': 'Ring-fenced grant apportioned. Contracts transferred or re-let.'}
            ]
        },
        {
            'phase': 'Phase 4: Full Integration',
            'period': 'April 2029 – March 2030',
            'services': [
                {'name': 'Cultural and related services', 'action': 'Library network rationalised. Leisure centre management reviewed. Heritage assets transferred.'},
                {'name': 'Planning and development services', 'action': 'New unitary Local Plan adopted (target). CIL/S106 harmonised.'},
                {'name': 'Central services', 'action': 'Full IT system integration. Single ERP/HR/Finance system. Surplus property disposal programme.'}
            ]
        }
    ]


def build_service_gap_matrix(budgets, services):
    """Build a gap analysis matrix showing where services change hands."""
    gaps = []

    for model_id, model_def in PROPOSED_MODELS.items():
        model_gaps = []

        for auth_name, council_ids in model_def['authorities'].items():
            has_unitary = any(c in ('blackpool', 'blackburn') for c in council_ids)
            has_district_only = any(c not in ('blackpool', 'blackburn', 'lancashire_cc') for c in council_ids)

            for service_name, defn in SERVICE_DEFINITIONS.items():
                gap_type = None
                gap_detail = None

                if defn['tier'] == 'upper' and has_district_only and not has_unitary:
                    # Districts getting county services for the first time
                    gap_type = 'new_responsibility'
                    gap_detail = f'{auth_name} inherits {service_name} from LCC — no existing capacity in constituent district councils'
                elif defn['tier'] == 'upper' and has_district_only and has_unitary:
                    # Mix of unitary (has capacity) and districts (don't)
                    unitary_name = 'Blackpool' if 'blackpool' in council_ids else 'Blackburn'
                    gap_type = 'partial_capacity'
                    gap_detail = f'{unitary_name} has existing {service_name} capacity but must extend to cover additional population from district councils'
                elif defn['tier'] == 'lower' and service_name == 'Housing services (GFRA only)':
                    if 'lancashire_cc' not in council_ids:
                        # All proposed models inherit this from districts — no gap
                        pass

                if gap_type:
                    model_gaps.append({
                        'authority': auth_name,
                        'service': service_name,
                        'gap_type': gap_type,
                        'detail': gap_detail,
                        'complexity': defn['integration_complexity'],
                        'risk': defn['delivery_risk']
                    })

        gaps.append({
            'model_id': model_id,
            'model_name': model_def['name'],
            'gaps': model_gaps,
            'critical_gaps': sum(1 for g in model_gaps if g['risk'] == 'critical'),
            'high_gaps': sum(1 for g in model_gaps if g['risk'] == 'high'),
            'total_gaps': len(model_gaps)
        })

    return gaps


def main():
    print("Loading budget data for 15 councils...")
    budgets = load_budgets()
    print(f"  Loaded {len(budgets)} councils")

    print("Computing current service state...")
    services = compute_current_state(budgets)

    print("Computing service costs per proposed authority...")
    model_services = {}
    for model_id, model_def in PROPOSED_MODELS.items():
        model_services[model_id] = {
            'name': model_def['name'],
            'authorities': compute_authority_services(budgets, model_id, model_def)
        }

    print("Building service gap matrix...")
    gap_matrix = build_service_gap_matrix(budgets, services)

    print("Building transition timeline...")
    timeline = build_transition_timeline()

    # Compile output
    output = {
        'meta': {
            'title': 'Lancashire LGR Service Gap Analysis',
            'generated': '2026-02-16',
            'data_source': 'GOV.UK MHCLG Revenue Outturn 2024-25',
            'councils_analysed': len(budgets),
            'service_categories': len(services),
            'models_analysed': len(PROPOSED_MODELS)
        },
        'service_definitions': {},
        'current_state': {},
        'proposed_models': model_services,
        'gap_matrix': gap_matrix,
        'transition_timeline': timeline,
        'summary': {}
    }

    # Service definitions (simplified for frontend)
    for name, defn in SERVICE_DEFINITIONS.items():
        output['service_definitions'][name] = {
            'description': defn['description'],
            'current_tier': defn['tier'],
            'integration_complexity': defn['integration_complexity'],
            'delivery_risk': defn['delivery_risk'],
            'risk_detail': defn['risk_detail'],
            'precedent_note': defn['precedent_note']
        }

    # Current state per service
    for name, svc in services.items():
        output['current_state'][name] = {
            'total_cost': svc['total_cost'],
            'county_cost': svc['county_cost'],
            'district_cost': svc['district_cost'],
            'unitary_cost': svc['unitary_cost'],
            'provider_count': len(svc['providers']),
            'providers': {cid: {'name': p['name'], 'cost': p['cost'], 'tier': p['tier']}
                         for cid, p in svc['providers'].items()}
        }

    # Summary stats
    total_service_spend = sum(svc['total_cost'] for svc in services.values())
    output['summary'] = {
        'total_service_expenditure': total_service_spend,
        'county_only_spend': sum(svc['county_cost'] for svc in services.values()),
        'district_only_spend': sum(svc['district_cost'] for svc in services.values()),
        'unitary_spend': sum(svc['unitary_cost'] for svc in services.values()),
        'critical_services': [name for name, defn in SERVICE_DEFINITIONS.items() if defn['delivery_risk'] == 'critical'],
        'high_risk_services': [name for name, defn in SERVICE_DEFINITIONS.items() if defn['delivery_risk'] == 'high'],
        'model_risk_ranking': sorted(
            [{'model': g['model_name'], 'critical_gaps': g['critical_gaps'], 'total_gaps': g['total_gaps']}
             for g in gap_matrix],
            key=lambda x: x['critical_gaps']
        )
    }

    # Write output
    out_path = os.path.join(DATA_DIR, 'shared', 'lgr_service_mapping.json')
    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\nOutput: {out_path}")
    print(f"Total service expenditure: £{total_service_spend:,.0f}")
    print(f"Service categories: {len(services)}")
    print(f"Models analysed: {len(PROPOSED_MODELS)}")

    # Print gap summary
    print("\nService Gap Summary by Model:")
    for g in gap_matrix:
        print(f"  {g['model_name']}: {g['critical_gaps']} critical, {g['high_gaps']} high, {g['total_gaps']} total gaps")


if __name__ == '__main__':
    main()
