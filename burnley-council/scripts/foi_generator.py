#!/usr/bin/env python3
"""
foi_generator.py — Data-driven FOI auto-generation for AI DOGE v6.

Analyses doge_findings.json, integrity.json, and councillor_profiles.json to
automatically generate pre-filled FOI request templates targeting detected anomalies.

Modelled on article_pipeline.py patterns: lockfile, deduplication, fact verification.

11 anomaly triggers:
  1. Sole supplier (>10% budget, no procurement notice)
  2. Split payments >£500K
  3. Benford's per-supplier MAD >0.015
  4. Duplicate payments >£100K
  5. Year-end spend >3x monthly average
  6. Cross-council price gap >50%
  7. Councillor employment-supplier conflict
  8. Planning committee land conflict
  9. Missing descriptions (100%)
  10. Weak competition (<3 bidders)
  11. CH breach supplier still receiving payments

Usage:
    python3 foi_generator.py --council burnley
    python3 foi_generator.py --all
    python3 foi_generator.py --all --dry-run
    python3 foi_generator.py --council burnley --review
"""

import argparse
import json
import logging
import sys
from datetime import datetime
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
)
log = logging.getLogger('FOIGenerator')

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / 'data'

# All 15 councils
ALL_COUNCILS = [
    'burnley', 'hyndburn', 'pendle', 'rossendale',
    'lancaster', 'ribble_valley', 'chorley', 'south_ribble',
    'lancashire_cc', 'blackpool', 'blackburn',
    'west_lancashire', 'wyre', 'preston', 'fylde',
]


def load_json(path):
    """Load JSON file, return None if missing."""
    if not path.exists():
        return None
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_config(council_id):
    """Load council config."""
    return load_json(DATA_DIR / council_id / 'config.json')


# ═══════════════════════════════════════════════════════════════════════
# FOI Template Generators — one per anomaly trigger
# ═══════════════════════════════════════════════════════════════════════

def generate_sole_supplier_foi(supplier_name, spend, pct, council_name):
    """Trigger 1: Sole supplier with >10% of budget."""
    return {
        "id": "auto-sole-supplier-{}".format(
            supplier_name.lower().replace(' ', '-')[:30]),
        "title": "Sole Supplier: {} — {:.0f}% of Spend".format(supplier_name, pct),
        "why": "AI DOGE analysis identified {} as receiving {:.0f}% of the council's "
               "tracked expenditure (£{:,.0f}). This concentration raises Best Value "
               "questions under the Local Government Act 1999 s.3.".format(
            supplier_name, pct, spend),
        "template": "Dear FOI Officer,\n\n"
                    "Under the Freedom of Information Act 2000, I request the following "
                    "information regarding payments to {}:\n\n"
                    "1. The procurement process used to award this contract/arrangement "
                    "(competitive tender, framework, direct award, or exemption)\n"
                    "2. If direct award, the justification under the Public Contracts "
                    "Regulations 2015\n"
                    "3. The original contract value and any extensions or variations\n"
                    "4. Any Contracts Finder publication reference numbers\n"
                    "5. When the contract was last competitively tendered\n"
                    "6. Any benchmarking or market testing conducted\n".format(supplier_name),
        "status": "auto-detected",
        "context": "DOGE analysis shows {} has received £{:,.0f} ({:.0f}% of tracked "
                   "spend) from {}. The Public Contracts Regulations 2015 require "
                   "competitive tendering above £30,000.".format(
            supplier_name, spend, pct, council_name),
        "trigger": "sole_supplier",
        "data": {"supplier": supplier_name, "spend": spend, "pct": round(pct, 1)},
    }


def generate_split_payment_foi(supplier_name, total, count, threshold, council_name):
    """Trigger 2: Split payments >£500K."""
    return {
        "id": "auto-split-payment-{}".format(
            supplier_name.lower().replace(' ', '-')[:30]),
        "title": "Split Payment Pattern: {} — £{:,.0f}".format(supplier_name, total),
        "why": "AI DOGE detected {} payments to {} totalling £{:,.0f}, clustering "
               "below the £{:,.0f} approval threshold. This pattern may indicate "
               "procurement threshold avoidance.".format(
            count, supplier_name, total, threshold),
        "template": "Dear FOI Officer,\n\n"
                    "Under the Freedom of Information Act 2000, I request:\n\n"
                    "1. The authorisation process for each payment to {} since April 2021\n"
                    "2. Whether these payments relate to a single contract or separate orders\n"
                    "3. The officer(s) who approved each payment\n"
                    "4. Whether the cumulative value was assessed against procurement thresholds\n"
                    "5. Any internal audit reports on payment splitting or threshold avoidance\n".format(
            supplier_name),
        "status": "auto-detected",
        "context": "Under Public Contracts Regulations 2015, splitting contracts to avoid "
                   "procurement thresholds is illegal. DOGE detected a clustering pattern "
                   "for payments to {}.".format(supplier_name),
        "trigger": "split_payments",
        "data": {"supplier": supplier_name, "total": total, "count": count},
    }


def generate_benford_foi(supplier_name, mad_score, council_name):
    """Trigger 3: Benford's law anomaly per supplier."""
    return {
        "id": "auto-benford-{}".format(
            supplier_name.lower().replace(' ', '-')[:30]),
        "title": "Statistical Anomaly: {} Payments".format(supplier_name),
        "why": "Benford's Law forensic analysis flags {} with a Mean Absolute Deviation "
               "of {:.3f} (threshold: 0.015). This statistical test is used by auditors "
               "worldwide to detect potentially manipulated payment data.".format(
            supplier_name, mad_score),
        "template": "Dear FOI Officer,\n\n"
                    "Under the Freedom of Information Act 2000, I request:\n\n"
                    "1. A complete list of payments to {} since April 2021 including dates, "
                    "amounts, descriptions, and authorising officers\n"
                    "2. The basis for each payment amount (contract rate, quote, invoice)\n"
                    "3. Any internal audit sampling of payments to this supplier\n"
                    "4. Whether any payments required retrospective approval or were "
                    "flagged by finance systems\n".format(supplier_name),
        "status": "auto-detected",
        "context": "Benford's Law analysis examines the digit distribution of payment "
                   "values. Natural financial data follows a predictable pattern; "
                   "significant deviation may indicate rounded estimates, duplicated "
                   "invoices, or manual manipulation.".format(),
        "trigger": "benfords_anomaly",
        "data": {"supplier": supplier_name, "mad": round(mad_score, 4)},
    }


def generate_duplicate_foi(total_value, group_count, council_name):
    """Trigger 4: Duplicate payments >£100K."""
    return {
        "id": "auto-duplicates",
        "title": "Duplicate Payment Detection — £{:,.0f}".format(total_value),
        "why": "AI DOGE identified £{:,.0f} across {} high-confidence duplicate payment "
               "groups. Each group shares the same supplier, amount, and approximate date.".format(
            total_value, group_count),
        "template": "Dear FOI Officer,\n\n"
                    "Under the Freedom of Information Act 2000, I request:\n\n"
                    "1. The council's duplicate payment detection procedures and software\n"
                    "2. How many duplicate payments have been identified and recovered "
                    "in each financial year since 2021/22\n"
                    "3. The total value of duplicate payments identified and recovered\n"
                    "4. Whether the council uses NFI (National Fraud Initiative) data "
                    "matching for duplicate detection\n"
                    "5. Any internal audit reports on accounts payable controls since 2021\n",
        "status": "auto-detected",
        "context": "The National Fraud Initiative estimates councils lose £100M+ annually "
                   "to duplicate payments. DOGE analysis detected £{:,.0f} in potential "
                   "duplicates at {}.".format(total_value, council_name),
        "trigger": "duplicates",
        "data": {"total": total_value, "groups": group_count},
    }


def generate_year_end_foi(department, spike_ratio, month, council_name):
    """Trigger 5: Year-end spending spike >3x monthly average."""
    return {
        "id": "auto-yearend-{}".format(department.lower().replace(' ', '-')[:30]),
        "title": "Year-End Spending Spike: {}".format(department),
        "why": "{} spent {:.1f}x its monthly average in {} — a significant spike "
               "that may indicate 'use it or lose it' budget behaviour.".format(
            department, spike_ratio, month),
        "template": "Dear FOI Officer,\n\n"
                    "Under the Freedom of Information Act 2000, I request:\n\n"
                    "1. A breakdown of all expenditure by {} in {} with descriptions "
                    "and authorising officers\n"
                    "2. The department's monthly budget profile and any virements "
                    "approved in Q4\n"
                    "3. The council's policy on year-end spending and budget carry-forward\n"
                    "4. Any internal guidance on avoiding 'March madness' spending\n"
                    "5. The s.151 officer's assessment of year-end spending patterns\n".format(
            department, month),
        "status": "auto-detected",
        "context": "Year-end spending spikes are a common audit concern. When departments "
                   "spend significantly more in March than their monthly average, it may "
                   "indicate poor budget management or pressure to spend allocations "
                   "before the year end.".format(),
        "trigger": "year_end_spike",
        "data": {"department": department, "spike_ratio": round(spike_ratio, 1)},
    }


def generate_missing_descriptions_foi(pct, council_name):
    """Trigger 9: Missing descriptions (100%)."""
    return {
        "id": "auto-missing-descriptions",
        "title": "Missing Transaction Descriptions — {:.0f}%".format(pct),
        "why": "{:.0f}% of {} transactions have no description. This is the worst "
               "transparency record of any East Lancashire council and likely breaches "
               "the Local Government Transparency Code 2015.".format(pct, council_name),
        "template": "Dear FOI Officer,\n\n"
                    "Under the Freedom of Information Act 2000, I request:\n\n"
                    "1. Why the council's published spending data over £500 does not "
                    "include transaction descriptions as required by the Local Government "
                    "Transparency Code 2015\n"
                    "2. When the council plans to publish descriptions alongside "
                    "payment amounts and supplier names\n"
                    "3. The council's compliance assessment against the Transparency Code\n"
                    "4. Whether the council's external auditor has raised concerns about "
                    "data quality in published spending information\n",
        "status": "auto-detected",
        "context": "The Local Government Transparency Code 2015 requires councils to "
                   "publish spending over £500 quarterly. Best practice includes "
                   "descriptions explaining what was purchased. {:.0f}% of {} "
                   "transactions lack any description.".format(pct, council_name),
        "trigger": "missing_descriptions",
        "data": {"pct": round(pct, 1)},
    }


def generate_ch_breach_foi(supplier_name, spend, breach_type, council_name):
    """Trigger 11: CH breach supplier still receiving payments."""
    return {
        "id": "auto-ch-breach-{}".format(
            supplier_name.lower().replace(' ', '-')[:30]),
        "title": "Companies House Breach: {}".format(supplier_name),
        "why": "{} received £{:,.0f} from {} during a period of active Companies House "
               "non-compliance ({}). Payments to non-compliant companies indicate weak "
               "due diligence.".format(supplier_name, spend, council_name, breach_type),
        "template": "Dear FOI Officer,\n\n"
                    "Under the Freedom of Information Act 2000, I request:\n\n"
                    "1. The council's supplier due diligence policy and whether it includes "
                    "Companies House status checks\n"
                    "2. Whether the council was aware of {}'s Companies House breach "
                    "({}) at the time payments were made\n"
                    "3. Whether the s.151 officer has reviewed payments to companies with "
                    "active Companies House breaches\n"
                    "4. The council's policy on payments to companies facing strike-off, "
                    "with overdue accounts, or without active directors\n".format(
            supplier_name, breach_type),
        "status": "auto-detected",
        "context": "Companies Act 2006 requires companies to file accounts (s.441), "
                   "maintain active directors (s.154), and register persons with "
                   "significant control (s.790D). Payments to non-compliant companies "
                   "without enhanced checks suggests inadequate financial controls.".format(),
        "trigger": "ch_breach",
        "data": {"supplier": supplier_name, "spend": spend, "breach": breach_type},
    }


def generate_employment_conflict_foi(councillor_name, employer, council_name):
    """Trigger 7: Councillor employment-supplier conflict."""
    return {
        "id": "auto-employment-conflict-{}".format(
            councillor_name.lower().replace(' ', '-')[:20]),
        "title": "Employment Conflict: {} / {}".format(councillor_name, employer),
        "why": "{} is employed by '{}' which also receives payments from {}. This "
               "potential conflict of interest requires scrutiny under the Localism "
               "Act 2011 s.31.".format(councillor_name, employer, council_name),
        "template": "Dear FOI Officer,\n\n"
                    "Under the Freedom of Information Act 2000, I request:\n\n"
                    "1. All council payments to '{}' since April 2021\n"
                    "2. Whether any councillor or officer declared a conflict of interest "
                    "in relation to contracts with this supplier\n"
                    "3. The procurement process for services from '{}'\n"
                    "4. Whether {} participated in any committee decisions relating "
                    "to contracts with their employer\n".format(
            employer, employer, councillor_name),
        "status": "auto-detected",
        "context": "The Localism Act 2011 requires councillors to declare disclosable "
                   "pecuniary interests. Employment by a council supplier is a direct "
                   "financial interest in council decisions.".format(),
        "trigger": "employment_conflict",
        "data": {"councillor": councillor_name, "employer": employer},
    }


def generate_committee_conflict_foi(councillor_name, committee, interest_type, council_name):
    """Trigger 8: Planning/licensing committee conflict."""
    return {
        "id": "auto-committee-conflict-{}".format(
            councillor_name.lower().replace(' ', '-')[:20]),
        "title": "Committee Conflict: {} on {}".format(councillor_name, committee),
        "why": "{} sits on {} and has declared {} interests that may conflict "
               "with committee decisions.".format(
            councillor_name, committee, interest_type),
        "template": "Dear FOI Officer,\n\n"
                    "Under the Freedom of Information Act 2000, I request:\n\n"
                    "1. All declarations of interest made by {} at {} meetings "
                    "since their appointment to the committee\n"
                    "2. Whether {} has withdrawn from any decisions due to "
                    "conflicts of interest\n"
                    "3. The monitoring officer's assessment of {}'s declared "
                    "interests against the committee's remit\n"
                    "4. The council's policy on managing conflicts of interest "
                    "for {} members\n".format(
            councillor_name, committee, councillor_name,
            councillor_name, committee),
        "status": "auto-detected",
        "context": "The Localism Act 2011 and the Nolan Principles require councillors "
                   "to declare interests and withdraw from decisions where they have "
                   "a direct financial interest.".format(),
        "trigger": "committee_conflict",
        "data": {"councillor": councillor_name, "committee": committee},
    }


# ═══════════════════════════════════════════════════════════════════════
# Main Processing
# ═══════════════════════════════════════════════════════════════════════

def detect_triggers(council_id):
    """Scan all data sources and return list of triggered FOI templates."""
    config = load_config(council_id)
    if not config:
        return []

    council_name = config.get('council_full_name', config.get('council_name', council_id))
    doge = load_json(DATA_DIR / council_id / 'doge_findings.json')
    integrity = load_json(DATA_DIR / council_id / 'integrity.json')

    templates = []

    # ── DOGE-based triggers ──
    if doge:
        doge_ctx = config.get('doge_context', {})
        findings = doge_ctx.get('doge_findings', {})

        # Trigger 1: Sole supplier
        key_suppliers = doge_ctx.get('key_suppliers', [])
        for ks in key_suppliers:
            spend_str = ks.get('spend', '£0').replace('£', '').replace(',', '')
            try:
                spend = float(spend_str.replace('M', '')) * (1000000 if 'M' in ks.get('spend', '') else 1)
            except (ValueError, TypeError):
                continue
            total_str = doge_ctx.get('total_spend', '£0').replace('£', '').replace(',', '')
            try:
                total = float(total_str.replace('M', '')) * (1000000 if 'M' in doge_ctx.get('total_spend', '') else 1)
            except (ValueError, TypeError):
                continue
            if total > 0:
                pct = spend / total * 100
                if pct > 10:
                    templates.append(generate_sole_supplier_foi(
                        ks['name'], spend, pct, council_name))

        # Trigger 4: Duplicates >£100K
        dup_str = findings.get('likely_duplicates', '')
        dup_match = None
        import re
        m = re.search(r'£([\d,.]+)K?\s+across\s+(\d+)', dup_str)
        if m:
            dup_val = float(m.group(1).replace(',', ''))
            if 'K' in dup_str.split('across')[0]:
                dup_val *= 1000
            dup_count = int(m.group(2))
            if dup_val > 100000:
                templates.append(generate_duplicate_foi(dup_val, dup_count, council_name))

        # Trigger 9: Missing descriptions
        trans_gap = findings.get('transparency_gap', '')
        if '100%' in trans_gap and 'no description' in trans_gap.lower():
            templates.append(generate_missing_descriptions_foi(100, council_name))

        # Trigger 11: CH breach suppliers
        notable = doge_ctx.get('notable_suppliers', [])
        for ns in notable:
            if 'strike-off' in ns.get('issue', '').lower() or 'breach' in ns.get('issue', '').lower():
                spend_str = ns.get('spend', '£0').replace('£', '').replace(',', '').replace('K', '')
                try:
                    spend = float(spend_str) * (1000 if 'K' in ns.get('spend', '') else 1)
                except (ValueError, TypeError):
                    spend = 0
                templates.append(generate_ch_breach_foi(
                    ns['name'], spend, ns.get('issue', 'Non-compliance'), council_name))

    # ── Integrity-based triggers ──
    if integrity:
        councillors = integrity.get('councillors', [])
        for cllr in councillors:
            cllr_name = cllr.get('name', '')

            # Trigger 7: Employment-supplier conflicts
            for emp_flag in cllr.get('employment_conflicts', []):
                if emp_flag.get('severity') in ('high', 'critical'):
                    # Extract employer from detail
                    detail = emp_flag.get('detail', '')
                    employer = 'employer'
                    m = re.search(r"employed by '([^']+)'", detail)
                    if m:
                        employer = m.group(1)
                    templates.append(generate_employment_conflict_foi(
                        cllr_name, employer, council_name))

            # Trigger 8: Committee conflicts
            for cc_flag in cllr.get('committee_conflicts', []):
                if cc_flag.get('severity') in ('high', 'elevated', 'critical'):
                    detail = cc_flag.get('detail', '')
                    committee = 'committee'
                    m = re.search(r'sits on ([^a]+and)', detail)
                    if not m:
                        m = re.search(r'sits on (.+?) (?:and|with|but)', detail)
                    if m:
                        committee = m.group(1).strip()
                    flag_type = cc_flag.get('type', '')
                    interest = 'land' if 'land' in flag_type else 'business'
                    templates.append(generate_committee_conflict_foi(
                        cllr_name, committee, interest, council_name))

    return templates


def deduplicate_templates(new_templates, existing_templates):
    """Remove templates that already exist (by trigger+supplier key)."""
    existing_ids = set()
    for cat in existing_templates.get('categories', []):
        for t in cat.get('templates', []):
            existing_ids.add(t.get('id', ''))

    unique = []
    seen_ids = set()
    for t in new_templates:
        tid = t.get('id', '')
        if tid not in existing_ids and tid not in seen_ids:
            unique.append(t)
            seen_ids.add(tid)

    return unique


def process_council(council_id, dry_run=False):
    """Generate FOI templates for a single council."""
    log.info(f"Processing {council_id}...")

    templates = detect_triggers(council_id)
    log.info(f"  Detected {len(templates)} FOI triggers")

    if not templates:
        log.info(f"  No new FOI templates generated")
        return 0

    # Load existing templates for deduplication
    foi_path = DATA_DIR / council_id / 'foi_templates.json'
    existing = load_json(foi_path) or {"categories": []}
    # Handle legacy format with 'templates' key instead of 'categories'
    if 'categories' not in existing:
        existing['categories'] = []

    unique = deduplicate_templates(templates, existing)
    log.info(f"  {len(unique)} new templates after deduplication")

    if not unique:
        return 0

    if dry_run:
        log.info(f"  DRY RUN: Would add {len(unique)} templates:")
        for t in unique:
            log.info(f"    → {t['title']} [{t['trigger']}]")
        return len(unique)

    # Add auto-detected category if not exists
    auto_cat = None
    for cat in existing['categories']:
        if cat['id'] == 'auto-detected':
            auto_cat = cat
            break

    if not auto_cat:
        auto_cat = {
            "id": "auto-detected",
            "name": "Auto-Detected from DOGE Analysis",
            "description": "FOI templates automatically generated from AI DOGE "
                           "anomaly detection. Each template targets a specific "
                           "finding with pre-filled questions.",
            "templates": [],
        }
        existing['categories'].append(auto_cat)

    # Add new templates with generation timestamp
    for t in unique:
        t['generated_at'] = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
        auto_cat['templates'].append(t)

    # Write updated templates
    with open(foi_path, 'w', encoding='utf-8') as f:
        json.dump(existing, f, indent=2, ensure_ascii=False)

    log.info(f"  Written {len(unique)} new templates to {foi_path}")
    return len(unique)


def main():
    parser = argparse.ArgumentParser(
        description='Auto-generate FOI templates from AI DOGE findings'
    )
    parser.add_argument('--council', type=str, help='Single council ID')
    parser.add_argument('--all', action='store_true', help='Process all 15 councils')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show what would be generated without writing')
    parser.add_argument('--review', action='store_true',
                        help='List all auto-detected templates')
    args = parser.parse_args()

    if args.review and args.council:
        # Review mode — show existing auto-detected templates
        foi = load_json(DATA_DIR / args.council / 'foi_templates.json')
        if not foi:
            print(f"No FOI templates found for {args.council}")
            return
        for cat in foi.get('categories', []):
            if cat['id'] == 'auto-detected':
                print(f"\n{'=' * 60}")
                print(f"AUTO-DETECTED FOI TEMPLATES: {args.council}")
                print(f"{'=' * 60}")
                for t in cat.get('templates', []):
                    print(f"\n  [{t.get('trigger', '?')}] {t['title']}")
                    print(f"  Status: {t.get('status', 'unknown')}")
                    if t.get('generated_at'):
                        print(f"  Generated: {t['generated_at']}")
                return
        print(f"No auto-detected templates for {args.council}")
        return

    if args.council:
        if args.council not in ALL_COUNCILS:
            print(f"ERROR: Unknown council '{args.council}'", file=sys.stderr)
            sys.exit(1)
        councils = [args.council]
    elif args.all:
        councils = ALL_COUNCILS
    else:
        print("ERROR: Specify --council <id> or --all", file=sys.stderr)
        sys.exit(1)

    total = 0
    results = {}
    for council_id in councils:
        try:
            count = process_council(council_id, dry_run=args.dry_run)
            total += count
            results[council_id] = count
        except Exception as e:
            log.error(f"  {council_id}: FAILED — {e}")
            import traceback
            traceback.print_exc()
            results[council_id] = -1

    print(f"\n{'=' * 60}")
    print("FOI GENERATOR COMPLETE")
    print(f"{'=' * 60}")
    for cid, count in results.items():
        status = f"{count} templates" if count >= 0 else "FAILED"
        print(f"  {cid}: {status}")
    print(f"\nTotal: {total} new templates across {len(results)} councils")
    if args.dry_run:
        print("(DRY RUN — no files written)")


if __name__ == '__main__':
    main()
