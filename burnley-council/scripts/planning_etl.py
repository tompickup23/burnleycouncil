#!/usr/bin/env python3
"""
planning_etl.py — Planning application data from PlanIt API for all Lancashire councils.

Pulls planning data via planit.org.uk (free), computes:
- Application volumes by year, type, decision
- Approval rates, decision speed
- Cost per application (from GOV.UK RO5 budget data)
- Cross-references with property assets, councillors, suppliers

Usage:
  python3 planning_etl.py --council burnley
  python3 planning_etl.py --all
  python3 planning_etl.py --all --cross-ref
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timedelta
from collections import defaultdict
import math

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, '..', 'data')

# ---------------------------------------------------------------------------
# Council bounding boxes (SW_lng, SW_lat, NE_lng, NE_lat)
# Deliberately generous to capture edge cases
# ---------------------------------------------------------------------------
COUNCIL_BBOX = {
    'burnley':        (-2.35, 53.72, -2.12, 53.82),
    'hyndburn':       (-2.45, 53.72, -2.28, 53.82),
    'pendle':         (-2.30, 53.82, -2.00, 53.92),
    'rossendale':     (-2.38, 53.62, -2.10, 53.76),
    'lancaster':      (-2.92, 53.95, -2.45, 54.22),
    'ribble_valley':  (-2.70, 53.78, -2.20, 53.98),
    'chorley':        (-2.72, 53.58, -2.48, 53.70),
    'south_ribble':   (-2.82, 53.68, -2.58, 53.78),
    'preston':        (-2.78, 53.72, -2.60, 53.80),
    'west_lancashire': (-2.98, 53.50, -2.68, 53.68),
    'wyre':           (-3.08, 53.82, -2.72, 53.98),
    'fylde':          (-3.08, 53.72, -2.88, 53.82),
    'lancashire_cc':  (-3.10, 53.50, -2.00, 54.25),  # whole county
    'blackpool':      (-3.08, 53.78, -3.00, 53.86),
    'blackburn':      (-2.55, 53.70, -2.38, 53.78),
}

# PlanIt area_name → our council_id mapping
AREA_NAME_MAP = {
    'Burnley': 'burnley',
    'Hyndburn': 'hyndburn',
    'Pendle': 'pendle',
    'Rossendale': 'rossendale',
    'Lancaster': 'lancaster',
    'Ribble Valley': 'ribble_valley',
    'Chorley': 'chorley',
    'South Ribble': 'south_ribble',
    'Preston': 'preston',
    'West Lancashire': 'west_lancashire',
    'Wyre': 'wyre',
    'Fylde': 'fylde',
    'Lancashire': 'lancashire_cc',
    'Blackpool': 'blackpool',
    'Blackburn with Darwen': 'blackburn',
}

# Reverse: our council_id → expected PlanIt area_name
COUNCIL_AREA_NAME = {v: k for k, v in AREA_NAME_MAP.items()}

# Planning budget SeRCOP categories in GOV.UK RO5 data
PLANNING_BUDGET_CATEGORIES = [
    'Development control',
    'Building control',
    'Conservation and listed buildings',
    'Other planning policy and specialist advice',
    'TOTAL PLANNING AND DEVELOPMENT SERVICES',
]


def safe_str(v):
    if v is None:
        return ''
    return str(v).strip()


def fetch_json(url, max_retries=5, timeout=60):
    """Fetch JSON from URL with retries and exponential backoff."""
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'application/json',
            })
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < max_retries - 1:
                # Exponential backoff: 30, 60, 120, 240s
                wait = 30 * (2 ** attempt)
                print(f"  ⚠ Rate limited (429). Backing off {wait}s... (attempt {attempt+1}/{max_retries})")
                time.sleep(wait)
            elif attempt < max_retries - 1:
                wait = 15 * (attempt + 1)
                print(f"  ⚠ Attempt {attempt+1} failed: {e}. Retrying in {wait}s...")
                time.sleep(wait)
            else:
                print(f"  ✗ Failed after {max_retries} attempts: {e}")
                return None
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < max_retries - 1:
                wait = 15 * (attempt + 1)
                print(f"  ⚠ Attempt {attempt+1} failed: {e}. Retrying in {wait}s...")
                time.sleep(wait)
            else:
                print(f"  ✗ Failed after {max_retries} attempts: {e}")
                return None
    return None


def fetch_planning_applications(council_id, years_back=5):
    """Fetch planning applications from PlanIt API for a council."""
    bbox = COUNCIL_BBOX.get(council_id)
    if not bbox:
        print(f"  ✗ No bounding box for {council_id}")
        return []

    expected_area = COUNCIL_AREA_NAME.get(council_id)
    all_apps = []
    page_size = 100

    # Fetch in yearly chunks to avoid timeouts
    now = datetime.now()
    for year_offset in range(years_back):
        end_date = now - timedelta(days=365 * year_offset)
        start_date = now - timedelta(days=365 * (year_offset + 1))
        start_str = start_date.strftime('%Y-%m-%d')
        end_str = end_date.strftime('%Y-%m-%d')

        period_label = f"{start_date.strftime('%b %Y')} – {end_date.strftime('%b %Y')}"
        offset = 0
        period_count = 0

        while True:
            params = {
                'bbox': f'{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}',
                'start_date': start_str,
                'end_date': end_str,
                'pg_sz': str(page_size),
                'from': str(offset),
            }
            url = f"https://www.planit.org.uk/api/applics/json?{urllib.parse.urlencode(params)}"

            data = fetch_json(url, timeout=60)
            if not data or 'records' not in data:
                break

            records = data['records']
            if not records:
                break

            # Filter to only this council's area (bbox may overlap neighbours)
            if expected_area and council_id != 'lancashire_cc':
                records = [r for r in records if r.get('area_name') == expected_area]

            # For LCC, only keep county-level apps (minerals/waste)
            if council_id == 'lancashire_cc':
                records = [r for r in records if r.get('area_name') == 'Lancashire']

            all_apps.extend(records)
            period_count += len(records)
            offset += page_size

            # PlanIt returns fewer than page_size when no more pages
            if len(data['records']) < page_size:
                break

            # Rate limit: PlanIt is aggressive with 429s
            time.sleep(5.0)

        if period_count > 0:
            print(f"    {period_label}: {period_count} applications")

        # Wait between year chunks to avoid rate-limiting
        time.sleep(10.0)

    return all_apps


def extract_planning_budget(council_id):
    """Extract planning department costs from GOV.UK budget data."""
    budget_path = os.path.join(DATA_DIR, council_id, 'budgets_govuk.json')
    if not os.path.exists(budget_path):
        return None

    with open(budget_path) as f:
        budget = json.load(f)

    by_year = budget.get('by_year', {})
    planning_costs = {}

    for year_key in sorted(by_year.keys(), reverse=True):
        yd = by_year[year_key]
        ds = yd.get('detailed_services', {})

        year_costs = {
            'development_control': None,
            'building_control': None,
            'conservation': None,
            'other_planning': None,
            'total_planning': None,
            'economic_development': None,
        }

        for form_key, form_data in ds.items():
            services = form_data.get('services', {})
            for svc_name, svc_data in services.items():
                nce = svc_data.get('net_current_expenditure', {}).get('value_thousands')
                emp = svc_data.get('employees', {}).get('value_thousands')
                if nce is None:
                    continue

                nce_pounds = int(nce * 1000)
                emp_pounds = int(emp * 1000) if emp else 0

                if svc_name == 'Development control':
                    year_costs['development_control'] = nce_pounds
                elif svc_name == 'Building control':
                    year_costs['building_control'] = nce_pounds
                elif svc_name == 'Conservation and listed buildings':
                    year_costs['conservation'] = nce_pounds
                elif svc_name == 'Other planning policy and specialist advice':
                    year_costs['other_planning'] = nce_pounds
                elif svc_name == 'TOTAL PLANNING AND DEVELOPMENT SERVICES':
                    year_costs['total_planning'] = nce_pounds
                elif svc_name == 'Economic development':
                    year_costs['economic_development'] = nce_pounds

        if any(v is not None for v in year_costs.values()):
            planning_costs[year_key] = year_costs

    return planning_costs if planning_costs else None


def analyse_applications(apps, council_id):
    """Compute summary statistics from planning applications."""
    if not apps:
        return {
            'total': 0, 'by_year': {}, 'by_type': {}, 'by_decision': {},
            'by_size': {}, 'by_ward': {}, 'approval_rate': None,
            'avg_decision_days': None, 'monthly_trend': {},
        }

    by_year = defaultdict(int)
    by_type = defaultdict(int)
    by_decision = defaultdict(int)
    by_size = defaultdict(int)
    by_ward = defaultdict(int)
    monthly = defaultdict(int)
    decision_days = []
    decided_count = 0
    approved_count = 0

    for app in apps:
        # Year
        start = app.get('start_date', '')
        if start and len(start) >= 4:
            by_year[start[:4]] += 1
            if len(start) >= 7:
                monthly[start[:7]] += 1

        # Type
        app_type = app.get('app_type', 'Unknown')
        by_type[app_type] += 1

        # Size
        app_size = app.get('app_size', 'Unknown')
        by_size[app_size] += 1

        # Decision / state
        app_state = app.get('app_state', 'Unknown')
        by_decision[app_state] += 1

        if app_state in ('Approved', 'Permitted', 'Granted'):
            approved_count += 1
            decided_count += 1
        elif app_state in ('Refused', 'Rejected'):
            decided_count += 1

        # Decision speed
        decided_date = app.get('decided_date')
        if decided_date and start:
            try:
                d1 = datetime.strptime(start[:10], '%Y-%m-%d')
                d2 = datetime.strptime(decided_date[:10], '%Y-%m-%d')
                days = (d2 - d1).days
                if 0 < days < 1000:
                    decision_days.append(days)
            except (ValueError, TypeError):
                pass

        # Ward
        ward = app.get('other_fields', {}).get('ward_name', '')
        if ward:
            by_ward[ward] += 1

    approval_rate = round(approved_count / decided_count, 3) if decided_count > 0 else None
    avg_days = round(sum(decision_days) / len(decision_days)) if decision_days else None
    median_days = sorted(decision_days)[len(decision_days) // 2] if decision_days else None

    return {
        'total': len(apps),
        'by_year': dict(sorted(by_year.items())),
        'by_type': dict(sorted(by_type.items(), key=lambda x: -x[1])),
        'by_decision': dict(sorted(by_decision.items(), key=lambda x: -x[1])),
        'by_size': dict(sorted(by_size.items(), key=lambda x: -x[1])),
        'by_ward': dict(sorted(by_ward.items(), key=lambda x: -x[1])),
        'approval_rate': approval_rate,
        'avg_decision_days': avg_days,
        'median_decision_days': median_days,
        'decided_count': decided_count,
        'monthly_trend': dict(sorted(monthly.items())),
    }


def compute_efficiency(summary, planning_budget):
    """Compute planning department efficiency metrics."""
    if not summary or not planning_budget or summary['total'] == 0:
        return None

    efficiency = {}
    total_apps = summary['total']
    years = len(summary.get('by_year', {})) or 1
    apps_per_year = total_apps / years

    # Find latest year with budget data
    for year_key in sorted(planning_budget.keys(), reverse=True):
        yc = planning_budget[year_key]
        dev_control = yc.get('development_control')
        building_control = yc.get('building_control')
        total_planning = yc.get('total_planning')

        if dev_control is not None:
            cost_per_app = round(dev_control / apps_per_year) if apps_per_year > 0 else None
            efficiency['development_control_spend'] = dev_control
            efficiency['cost_per_application'] = cost_per_app
            efficiency['budget_year'] = year_key

        if building_control is not None:
            efficiency['building_control_spend'] = building_control

        if total_planning is not None:
            efficiency['total_planning_spend'] = total_planning
            efficiency['total_cost_per_app'] = round(total_planning / apps_per_year) if apps_per_year > 0 else None

        efficiency['apps_per_year'] = round(apps_per_year)
        break

    return efficiency if efficiency else None


def cross_reference_properties(apps, council_id):
    """Cross-reference planning apps with property assets (spatial match)."""
    property_path = os.path.join(DATA_DIR, council_id, 'property_assets.json')
    if not os.path.exists(property_path):
        return None

    with open(property_path) as f:
        assets = json.load(f)
    if isinstance(assets, dict):
        assets = assets.get('assets', assets.get('data', []))
    if not assets:
        return None

    matches = []
    for app in apps:
        app_lat = app.get('location_y')
        app_lng = app.get('location_x')
        if not app_lat or not app_lng:
            continue

        for asset in assets:
            a_lat = asset.get('lat')
            a_lng = asset.get('lng')
            if not a_lat or not a_lng:
                continue

            # Haversine-lite: ~111m per 0.001 degree at this latitude
            dlat = abs(app_lat - a_lat)
            dlng = abs(app_lng - a_lng) * 0.6  # cos(54°) ≈ 0.6
            dist_approx = math.sqrt(dlat**2 + dlng**2) * 111000  # metres

            if dist_approx < 100:  # Within 100m
                matches.append({
                    'application': {
                        'uid': app.get('uid'),
                        'address': app.get('address'),
                        'description': app.get('description', '')[:200],
                        'app_type': app.get('app_type'),
                        'app_state': app.get('app_state'),
                        'start_date': app.get('start_date'),
                        'decided_date': app.get('decided_date'),
                        'applicant': app.get('other_fields', {}).get('applicant_name', ''),
                        'agent': app.get('other_fields', {}).get('agent_name', ''),
                        'agent_company': app.get('other_fields', {}).get('agent_company', ''),
                    },
                    'asset': {
                        'id': asset.get('id'),
                        'name': asset.get('name'),
                        'category': asset.get('category'),
                        'tier': asset.get('tier'),
                        'owner_entity': asset.get('owner_entity'),
                        'disposal_pathway': asset.get('disposal_pathway'),
                    },
                    'distance_m': round(dist_approx),
                })
                break  # One match per app is enough

    return matches if matches else None


def cross_reference_councillors(apps, council_id):
    """Cross-reference planning applicants with councillor names."""
    cllr_path = os.path.join(DATA_DIR, council_id, 'councillors.json')
    if not os.path.exists(cllr_path):
        return None

    with open(cllr_path) as f:
        cllrs_raw = json.load(f)
    cllrs = cllrs_raw if isinstance(cllrs_raw, list) else cllrs_raw.get('councillors', [])
    if not cllrs:
        return None

    # Build surname set
    cllr_names = {}
    for c in cllrs:
        name = c.get('name', '')
        if name:
            parts = name.split()
            if len(parts) >= 2:
                surname = parts[-1].lower()
                cllr_names[surname] = name

    matches = []
    for app in apps:
        applicant = safe_str(app.get('other_fields', {}).get('applicant_name', ''))
        agent = safe_str(app.get('other_fields', {}).get('agent_name', ''))
        agent_co = safe_str(app.get('other_fields', {}).get('agent_company', ''))

        for surname, full_name in cllr_names.items():
            if surname in applicant.lower() or surname in agent.lower():
                matches.append({
                    'councillor': full_name,
                    'match_type': 'applicant' if surname in applicant.lower() else 'agent',
                    'matched_text': applicant if surname in applicant.lower() else agent,
                    'application': {
                        'uid': app.get('uid'),
                        'address': app.get('address', '')[:100],
                        'app_type': app.get('app_type'),
                        'start_date': app.get('start_date'),
                        'ward': app.get('other_fields', {}).get('ward_name', ''),
                    },
                })

    # Deduplicate by councillor+uid
    seen = set()
    unique = []
    for m in matches:
        key = f"{m['councillor']}|{m['application']['uid']}"
        if key not in seen:
            seen.add(key)
            unique.append(m)

    return unique if unique else None


def process_council(council_id, cross_ref=False, years_back=5):
    """Process a single council: fetch, analyse, write."""
    council_dir = os.path.join(DATA_DIR, council_id)
    if not os.path.exists(council_dir):
        print(f"  ✗ No data directory for {council_id}")
        return False

    print(f"\n{'='*60}")
    print(f"  Processing: {council_id}")
    print(f"{'='*60}")

    # 1. Fetch applications
    print(f"  Fetching planning applications ({years_back} years)...")
    apps = fetch_planning_applications(council_id, years_back=years_back)
    print(f"  ✓ {len(apps)} applications fetched")

    if not apps:
        print(f"  ⚠ No applications found, skipping")
        return False

    # 2. Analyse
    summary = analyse_applications(apps, council_id)

    # 3. Budget data
    planning_budget = extract_planning_budget(council_id)
    efficiency = compute_efficiency(summary, planning_budget)

    # 4. Cross-references (optional, slow)
    xref = {}
    if cross_ref:
        print(f"  Cross-referencing with property assets...")
        prop_matches = cross_reference_properties(apps, council_id)
        if prop_matches:
            xref['property_matches'] = prop_matches
            print(f"    ✓ {len(prop_matches)} planning apps near council assets")

        print(f"  Cross-referencing with councillors...")
        cllr_matches = cross_reference_councillors(apps, council_id)
        if cllr_matches:
            xref['councillor_matches'] = cllr_matches
            print(f"    ✓ {len(cllr_matches)} potential councillor name matches")

    # 5. Build output
    # Only keep last 500 applications in detail (recent ones most useful)
    recent_apps = sorted(apps, key=lambda a: a.get('start_date', ''), reverse=True)[:500]
    slim_apps = []
    for app in recent_apps:
        of = app.get('other_fields', {})
        slim_apps.append({
            'uid': app.get('uid'),
            'address': app.get('address', ''),
            'postcode': app.get('postcode', ''),
            'lat': app.get('location_y'),
            'lng': app.get('location_x'),
            'description': (app.get('description') or '')[:200],
            'type': app.get('app_type', ''),
            'size': app.get('app_size', ''),
            'state': app.get('app_state', ''),
            'start_date': app.get('start_date', ''),
            'decided_date': app.get('decided_date'),
            'ward': of.get('ward_name', ''),
            'applicant': of.get('applicant_name', ''),
            'agent_company': of.get('agent_company', ''),
            'case_officer': of.get('case_officer', ''),
            'url': app.get('url', ''),
        })

    output = {
        'meta': {
            'council_id': council_id,
            'source': 'planit.org.uk',
            'fetched': datetime.now().strftime('%Y-%m-%d'),
            'years_back': years_back,
            'total_applications': len(apps),
            'recent_applications_stored': len(slim_apps),
        },
        'summary': summary,
        'efficiency': efficiency,
        'budget': planning_budget,
        'cross_references': xref if xref else None,
        'applications': slim_apps,
    }

    # 6. Write
    out_path = os.path.join(council_dir, 'planning.json')
    with open(out_path, 'w') as f:
        json.dump(output, f, separators=(',', ':'))

    size_kb = os.path.getsize(out_path) // 1024
    print(f"  ✓ Written {out_path} ({size_kb}KB)")
    print(f"    Total: {len(apps)} apps | Approval: {summary.get('approval_rate', 'N/A')}")
    if efficiency:
        cpa = efficiency.get('cost_per_application')
        if cpa:
            print(f"    Cost per app: £{cpa:,} ({efficiency.get('budget_year', '?')})")

    return True


def main():
    parser = argparse.ArgumentParser(description='Planning ETL — PlanIt API')
    parser.add_argument('--council', default=None, help='Single council ID')
    parser.add_argument('--all', action='store_true', help='Process all 15 councils')
    parser.add_argument('--cross-ref', action='store_true', help='Enable cross-referencing')
    parser.add_argument('--years', type=int, default=5, help='Years of history (default: 5)')
    args = parser.parse_args()

    councils = []
    if args.all:
        councils = list(COUNCIL_BBOX.keys())
    elif args.council:
        councils = [args.council]
    else:
        parser.print_help()
        sys.exit(1)

    print(f"Planning ETL — {len(councils)} council(s), {args.years} years history")
    print(f"Source: planit.org.uk (free API)")

    success = 0
    for i, cid in enumerate(councils):
        try:
            if process_council(cid, cross_ref=args.cross_ref, years_back=args.years):
                success += 1
        except Exception as e:
            print(f"  ✗ Error processing {cid}: {e}")
        # Wait 60s between councils to avoid PlanIt rate limits
        if i < len(councils) - 1:
            print(f"  ⏳ Waiting 60s before next council (rate limit protection)...")
            time.sleep(60)

    print(f"\n{'='*60}")
    print(f"  Done: {success}/{len(councils)} councils processed")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
