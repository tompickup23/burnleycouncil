#!/usr/bin/python3
"""
Budget Variance Analysis — AI DOGE
Compares AI DOGE tracked spending (via budget_mapping.json) against
GOV.UK MHCLG Revenue Outturn data (budgets_govuk.json) per SeRCOP category.

Generates budget_variance.json per council.

Usage:
    /usr/bin/python3 budget_variance.py --council burnley
    /usr/bin/python3 budget_variance.py --all
"""

import argparse
import json
import os
import sys
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')

ALL_COUNCILS = [
    'burnley', 'hyndburn', 'pendle', 'rossendale',
    'lancaster', 'ribble_valley', 'chorley', 'south_ribble',
    'lancashire_cc', 'blackpool', 'blackburn',
    'preston', 'west_lancashire', 'wyre', 'fylde'
]

# Categories to skip in variance analysis (not real service spend)
SKIP_CATEGORIES = {
    'TOTAL SERVICE EXPENDITURE',
    'Capital',
    'Unmapped',
}

# Tier-relevant categories — districts don't have education/social care etc.
DISTRICT_RELEVANT = {
    'Highways and transport services',
    'Housing services (GFRA only)',
    'Cultural and related services',
    'Environmental and regulatory services',
    'Planning and development services',
    'Central services',
    'Other services',
}


def load_json(path):
    """Load a JSON file, return None if missing."""
    if not os.path.exists(path):
        return None
    with open(path, 'r') as f:
        return json.load(f)


def get_council_tier(budget_mapping):
    """Get council tier from budget_mapping.json."""
    return budget_mapping.get('council_tier', 'district')


def compute_govuk_annual_averages(budgets_govuk):
    """
    Compute annual average spend per SeRCOP category from GOV.UK outturn data.
    Uses all available years, returns dict of category -> annual avg (in pounds).
    Also returns the number of years and the list of years used.
    """
    years = budgets_govuk.get('years', [])
    by_year = budgets_govuk.get('by_year', {})

    if not years or not by_year:
        return {}, 0, []

    # Accumulate totals per category across years
    category_totals = {}
    category_year_counts = {}

    for year in years:
        year_data = by_year.get(year, {})
        rev_summary = year_data.get('revenue_summary', {})
        service_exp = rev_summary.get('service_expenditure', {})

        for cat_name, cat_data in service_exp.items():
            if cat_name in SKIP_CATEGORIES:
                continue
            value = cat_data.get('value_pounds', 0)
            if value is None:
                value = 0
            # Only count years where the value is non-zero for averaging
            # (some categories legitimately report 0 for districts — e.g. education)
            if cat_name not in category_totals:
                category_totals[cat_name] = 0
                category_year_counts[cat_name] = 0
            category_totals[cat_name] += value
            category_year_counts[cat_name] += 1

    # Compute averages
    averages = {}
    for cat, total in category_totals.items():
        count = category_year_counts[cat]
        if count > 0:
            averages[cat] = total / count
        else:
            averages[cat] = 0

    return averages, len(years), years


def compute_aidoge_annual_averages(budget_mapping, metadata):
    """
    Compute annual average AI DOGE spend per SeRCOP category.
    Uses category_summary from budget_mapping.json (total spend across all years)
    divided by number of financial years from metadata.json.
    """
    category_summary = budget_mapping.get('category_summary', {})
    financial_years = metadata.get('financial_years', [])
    num_years = len(financial_years)

    if num_years == 0:
        return {}, 0

    averages = {}
    for cat, total in category_summary.items():
        if cat in SKIP_CATEGORIES:
            continue
        averages[cat] = total / num_years

    return averages, num_years


def classify_variance(variance_pct):
    """
    Classify variance into a rating.
    variance_pct = (aidoge - govuk) / govuk * 100
    Positive = overspend (AI DOGE tracking more than GOV.UK reported)
    Negative = underspend (AI DOGE tracking less — likely unmapped spend)
    """
    abs_var = abs(variance_pct)
    if abs_var <= 10:
        return 'on_track'
    elif abs_var <= 25:
        if variance_pct > 0:
            return 'minor_overspend'
        else:
            return 'minor_underspend'
    else:
        if variance_pct > 0:
            return 'significant_overspend'
        else:
            return 'significant_underspend'


def get_mapped_departments(budget_mapping, category):
    """Get list of AI DOGE departments mapped to a given GOV.UK category."""
    mappings = budget_mapping.get('mappings', {})
    depts = []
    for dept_name, dept_data in mappings.items():
        if dept_data.get('budget_category') == category:
            depts.append(dept_name)
    return sorted(depts)


def generate_note(category, variance_pct, rating, aidoge_avg, govuk_avg, tier):
    """Generate a human-readable note for a category variance."""
    abs_var = abs(variance_pct)

    if rating == 'on_track':
        return 'AI DOGE spending aligns well with GOV.UK outturn data (within 10% variance)'

    direction = 'above' if variance_pct > 0 else 'below'

    if abs_var > 100 and variance_pct > 0:
        return ('AI DOGE tracks %.0f%% more than GOV.UK outturn — '
                'likely includes capital/grant pass-through or multi-year project spend '
                'not reflected in revenue outturn') % abs_var

    if abs_var > 100 and variance_pct < 0:
        return ('AI DOGE tracks only %.1f%% of GOV.UK outturn — '
                'significant unmapped expenditure or different reporting boundaries') % (
                    (aidoge_avg / govuk_avg * 100) if govuk_avg > 0 else 0)

    if variance_pct < 0:
        return ('Spending tracked is %.0f%% %s GOV.UK outturn — '
                'possible unmapped expenditure or different departmental boundaries') % (
                    abs_var, direction)
    else:
        return ('Spending tracked is %.0f%% %s GOV.UK outturn — '
                'may include grant pass-through, capital elements, or '
                'broader departmental scope in AI DOGE data') % (abs_var, direction)


def generate_insights(categories, summary, tier, council_id):
    """Generate insight strings based on variance patterns."""
    insights = []

    # Coverage insight
    coverage = summary.get('coverage_pct', 0)
    if coverage >= 90:
        insights.append(
            'AI DOGE data covers %.0f%% of GOV.UK reported expenditure — excellent coverage' % coverage
        )
    elif coverage >= 60:
        insights.append(
            'AI DOGE data covers %.0f%% of GOV.UK reported expenditure — good coverage with some gaps' % coverage
        )
    elif coverage >= 30:
        insights.append(
            'AI DOGE data covers %.0f%% of GOV.UK reported expenditure — '
            'significant unmapped spend (%.0f%% not categorised)' % (coverage, 100 - coverage)
        )
    else:
        insights.append(
            'AI DOGE data covers only %.0f%% of GOV.UK reported expenditure — '
            'most spending is in unmapped departments' % coverage
        )

    # Significant variances
    significant = [c for c in categories if 'significant' in c.get('variance_rating', '')]
    if significant:
        sig_names = [c['govuk_category'] for c in significant]
        if len(sig_names) <= 3:
            insights.append(
                '%d categor%s show%s significant variance (>25%%): %s' % (
                    len(sig_names),
                    'y' if len(sig_names) == 1 else 'ies',
                    's' if len(sig_names) == 1 else '',
                    ', '.join(sig_names)
                )
            )
        else:
            insights.append(
                '%d categories show significant variance (>25%%), including: %s' % (
                    len(sig_names), ', '.join(sig_names[:3])
                )
            )

    # On-track categories
    on_track = [c for c in categories if c.get('variance_rating') == 'on_track']
    if on_track:
        insights.append(
            '%d categor%s %s on track (within 10%% of GOV.UK outturn): %s' % (
                len(on_track),
                'y' if len(on_track) == 1 else 'ies',
                'is' if len(on_track) == 1 else 'are',
                ', '.join(c['govuk_category'] for c in on_track)
            )
        )

    # Underspend pattern (common — AI DOGE doesn't capture everything)
    underspend = [c for c in categories if c.get('variance_pct', 0) < -25]
    overspend = [c for c in categories if c.get('variance_pct', 0) > 25]

    if len(underspend) > len(overspend) and underspend:
        insights.append(
            'Dominant pattern is underspend (%d categories) — AI DOGE spending data '
            'captures a subset of total council expenditure reported to MHCLG' % len(underspend)
        )

    if overspend:
        for c in overspend:
            if c.get('variance_pct', 0) > 100:
                insights.append(
                    '"%s" shows %.0f%% overspend — AI DOGE department mappings '
                    'may be broader than the GOV.UK SeRCOP classification' % (
                        c['govuk_category'], c['variance_pct']
                    )
                )

    # Tier-specific insight
    if tier == 'county':
        insights.append(
            'As a county council, key service areas include education, '
            'social care, and highways — variances in these categories '
            'are most significant'
        )
    elif tier == 'unitary':
        insights.append(
            'As a unitary authority, this council covers all service areas — '
            'variance analysis spans the full SeRCOP spectrum'
        )

    return insights


def process_council(council_id):
    """Process a single council and generate budget_variance.json."""
    council_dir = os.path.join(DATA_DIR, council_id)

    # Load required files
    budgets_govuk = load_json(os.path.join(council_dir, 'budgets_govuk.json'))
    budget_mapping = load_json(os.path.join(council_dir, 'budget_mapping.json'))
    metadata = load_json(os.path.join(council_dir, 'metadata.json'))

    if not budgets_govuk:
        print('  SKIP: No budgets_govuk.json')
        return False
    if not budget_mapping:
        print('  SKIP: No budget_mapping.json')
        return False
    if not metadata:
        print('  SKIP: No metadata.json')
        return False

    tier = get_council_tier(budget_mapping)

    # Compute annual averages from both sources
    govuk_avgs, govuk_years, govuk_year_list = compute_govuk_annual_averages(budgets_govuk)
    aidoge_avgs, aidoge_years = compute_aidoge_annual_averages(budget_mapping, metadata)

    # Get all categories present in either source
    all_categories = sorted(set(list(govuk_avgs.keys()) + list(aidoge_avgs.keys())))

    # Filter out categories not relevant to this tier
    # For districts, skip education, social care, etc. if GOV.UK reports 0
    categories_output = []
    total_govuk = 0
    total_aidoge = 0

    for cat in all_categories:
        if cat in SKIP_CATEGORIES:
            continue

        govuk_avg = govuk_avgs.get(cat, 0)
        aidoge_avg = aidoge_avgs.get(cat, 0)

        # Skip categories with zero in both sources
        if govuk_avg == 0 and aidoge_avg == 0:
            continue

        # Skip categories irrelevant to this tier (GOV.UK reports 0 and
        # AI DOGE has negligible spend)
        if tier == 'district' and cat not in DISTRICT_RELEVANT:
            if govuk_avg == 0 and aidoge_avg < 50000:
                continue

        # Compute variance
        if govuk_avg > 0:
            variance_pct = ((aidoge_avg - govuk_avg) / govuk_avg) * 100
        elif aidoge_avg > 0:
            variance_pct = 100.0  # AI DOGE has spend but GOV.UK doesn't
        else:
            variance_pct = 0.0

        rating = classify_variance(variance_pct)
        mapped_depts = get_mapped_departments(budget_mapping, cat)
        note = generate_note(cat, variance_pct, rating, aidoge_avg, govuk_avg, tier)

        cat_entry = {
            'govuk_category': cat,
            'govuk_annual_avg': round(govuk_avg, 2),
            'aidoge_annual_avg': round(aidoge_avg, 2),
            'variance_pct': round(variance_pct, 1),
            'variance_rating': rating,
            'mapped_departments': mapped_depts,
            'notes': note,
        }

        categories_output.append(cat_entry)
        total_govuk += govuk_avg
        total_aidoge += aidoge_avg

    # Sort by absolute variance descending (most interesting first)
    categories_output.sort(key=lambda c: abs(c.get('variance_pct', 0)), reverse=True)

    # Coverage: how much of GOV.UK total service expenditure does AI DOGE capture?
    if total_govuk > 0:
        coverage_pct = (total_aidoge / total_govuk) * 100
    else:
        coverage_pct = 0.0

    concerns = len([c for c in categories_output
                     if 'significant' in c.get('variance_rating', '')])

    summary = {
        'total_budget_govuk': round(total_govuk, 2),
        'total_tracked_aidoge': round(total_aidoge, 2),
        'coverage_pct': round(coverage_pct, 1),
        'categories_analysed': len(categories_output),
        'categories_with_concerns': concerns,
        'govuk_years_used': govuk_year_list,
        'aidoge_years_used': metadata.get('financial_years', []),
        'mapping_coverage_pct': budget_mapping.get('coverage', {}).get('mapped_spend_pct', 0),
    }

    insights = generate_insights(categories_output, summary, tier, council_id)

    output = {
        '_generated': True,
        '_generated_at': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        '_generator': 'budget_variance.py',
        '_note': 'Compares AI DOGE tracked spending vs GOV.UK MHCLG Revenue Outturn by SeRCOP category',
        'council_id': council_id,
        'council_tier': tier,
        'summary': summary,
        'categories': categories_output,
        'insights': insights,
    }

    # Write output
    out_path = os.path.join(council_dir, 'budget_variance.json')
    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2)
    print('  Wrote %s (%d categories, %.1f%% coverage, %d concerns)' % (
        out_path, len(categories_output), coverage_pct, concerns
    ))
    return True


def main():
    parser = argparse.ArgumentParser(
        description='Generate budget_variance.json comparing AI DOGE spending vs GOV.UK outturn'
    )
    parser.add_argument('--council', type=str, help='Council ID (e.g. burnley)')
    parser.add_argument('--all', action='store_true', help='Process all 15 councils')
    args = parser.parse_args()

    if not args.council and not args.all:
        parser.print_help()
        sys.exit(1)

    councils = ALL_COUNCILS if args.all else [args.council]

    success = 0
    failed = 0

    for council_id in councils:
        print('[%s]' % council_id)
        try:
            if process_council(council_id):
                success += 1
            else:
                failed += 1
        except Exception as e:
            print('  ERROR: %s' % str(e))
            failed += 1

    print('\nDone: %d succeeded, %d failed' % (success, failed))


if __name__ == '__main__':
    main()
