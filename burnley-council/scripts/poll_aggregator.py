#!/usr/bin/env python3
"""
poll_aggregator.py — Automated polling aggregator for AI DOGE Lancashire

Scrapes polling data from Electoral Calculus (primary) and computes a
weighted average using academic methodology. Outputs polling.json for
the election prediction engine.

Methodology inspired by:
  - Nate Silver / FiveThirtyEight (recency weighting, pollster ratings)
  - Electoral Calculus (house effect correction)
  - Curtice / NatCen (BPC membership quality premium)

Data sources:
  PRIMARY: Electoral Calculus (electoralcalculus.co.uk/polls)
  SECONDARY: Wikipedia UK polling page (manual/future — blocked by 403)

Weighting: weight = recency * sample_size * pollster_quality * methodology
  - Recency: 14-day half-life (polls lose relevance fast)
  - Sample size: sqrt(N / 1000) with diminishing returns
  - Pollster quality: BPC members 1.0, others 0.7-0.85
  - Methodology: phone/online panel 1.0, opt-in online 0.8

Usage:
    python3 poll_aggregator.py                  # Update polling.json
    python3 poll_aggregator.py --dry-run        # Preview without saving
    python3 poll_aggregator.py --standalone     # Output standalone JSON
    python3 poll_aggregator.py --days 30        # Only use polls from last 30 days

Output: burnley-council/data/shared/polling.json
"""

import argparse
import json
import math
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent / 'data'
SHARED_DIR = DATA_DIR / 'shared'

# ---------------------------------------------------------------------------
# Pollster quality ratings
# BPC (British Polling Council) members get premium weighting
# Based on 2024 GE accuracy and methodology transparency
# ---------------------------------------------------------------------------

POLLSTER_RATINGS = {
    # BPC members — gold standard
    'YouGov': 1.0,
    'Ipsos': 1.0,
    'Survation': 0.95,
    'Savanta': 0.95,
    'JL Partners': 0.90,
    'Deltapoll': 0.90,
    'Opinium': 0.90,
    'Redfield & Wilton': 0.85,
    'Redfield': 0.85,  # Short name variant
    'TechneUK': 0.85,
    'Techne UK': 0.85,
    'More in Common': 0.90,
    'Focaldata': 0.90,
    'BMG Research': 0.85,
    'BMG': 0.85,
    'Whitestone Insight': 0.80,
    'Verian': 0.85,
    'Find Out Now': 0.80,
    # Non-BPC / newer pollsters
    'WeThink': 0.80,
    'We Think': 0.80,
    'Freshwater Strategy': 0.80,
    'Freshwater': 0.80,
    'PeoplePolling': 0.80,
    'People Polling': 0.80,
    'Omnisis': 0.75,
    'Electoral Calculus': 0.85,
    # Catch-all for unknown pollsters
    '_default': 0.70,
}

# Methodology multipliers
METHODOLOGY_RATINGS = {
    'phone': 1.0,
    'online_panel': 1.0,
    'online_opt_in': 0.80,
    'mixed': 0.90,
    'unknown': 0.85,
}

# Party name normalisation
PARTY_ALIASES = {
    'con': 'Conservative',
    'lab': 'Labour',
    'lib': 'Liberal Democrats',
    'ld': 'Liberal Democrats',
    'lib dem': 'Liberal Democrats',
    'reform': 'Reform UK',
    'ref': 'Reform UK',
    'green': 'Green Party',
    'grn': 'Green Party',
    'snp': 'SNP',
    'plaid': 'Plaid Cymru',
    'other': 'Other',
    'oth': 'Other',
    'conservative': 'Conservative',
    'labour': 'Labour',
    'liberal democrats': 'Liberal Democrats',
    'reform uk': 'Reform UK',
    'green party': 'Green Party',
}

# GE2024 actual result (baseline for swing calculations)
GE2024_RESULT = {
    'Labour': 0.337,
    'Conservative': 0.237,
    'Reform UK': 0.143,
    'Liberal Democrats': 0.122,
    'Green Party': 0.069,
    'Other': 0.092,
}

# Recency half-life in days
RECENCY_HALF_LIFE = 14

# Maximum age of polls to include (days)
DEFAULT_MAX_AGE_DAYS = 90


def log(msg):
    print(f'[{datetime.now().strftime("%H:%M:%S")}] {msg}', file=sys.stderr)


def normalise_party(name):
    """Normalise party name to canonical form."""
    if not name:
        return None
    key = name.strip().lower()
    return PARTY_ALIASES.get(key, name.strip())


def parse_date_range(text):
    """Parse Electoral Calculus date range like '09 Jan 2026 - 11 Jan 2026'.

    Returns (start_date, end_date) as datetime objects.
    Also handles single dates like '04 Jul 2024'.
    """
    text = text.strip()

    # Date range: "DD Mon YYYY - DD Mon YYYY"
    range_match = re.match(
        r'(\d{1,2}\s+\w+\s+\d{4})\s*[-–]\s*(\d{1,2}\s+\w+\s+\d{4})', text
    )
    if range_match:
        try:
            start = datetime.strptime(range_match.group(1).strip(), '%d %b %Y')
            end = datetime.strptime(range_match.group(2).strip(), '%d %b %Y')
            return start, end
        except ValueError:
            pass

    # Single date: "DD Mon YYYY"
    single_match = re.match(r'(\d{1,2}\s+\w+\s+\d{4})', text)
    if single_match:
        try:
            d = datetime.strptime(single_match.group(1).strip(), '%d %b %Y')
            return d, d
        except ValueError:
            pass

    # ISO date: YYYY-MM-DD
    iso_match = re.match(r'(\d{4}-\d{2}-\d{2})', text)
    if iso_match:
        try:
            d = datetime.strptime(iso_match.group(1), '%Y-%m-%d')
            return d, d
        except ValueError:
            pass

    return None, None


def parse_sample_size(text):
    """Parse sample size like '1,250' or '2036' to int."""
    if not text:
        return None
    text = text.strip().replace(',', '').replace(' ', '')
    # Remove any non-numeric characters
    text = re.sub(r'[^\d]', '', text)
    try:
        return int(text) if text else None
    except ValueError:
        return None


def parse_percentage(text):
    """Parse percentage like '29' or '29.1' to float (0.29)."""
    if not text:
        return None
    text = text.strip().replace('%', '')
    try:
        val = float(text)
        # If value > 1, assume it's a percentage (not decimal)
        if val > 1:
            return val / 100
        return val
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Electoral Calculus scraper
# ---------------------------------------------------------------------------

def scrape_electoral_calculus():
    """Scrape polling data from Electoral Calculus.

    Returns list of poll dicts with standardised format.
    """
    url = 'https://www.electoralcalculus.co.uk/polls'
    log(f'Scraping Electoral Calculus: {url}')

    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'AI-DOGE-Lancashire/1.0 (transparency platform)',
            'Accept': 'text/html,application/xhtml+xml',
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            html = resp.read().decode('utf-8', errors='replace')
    except Exception as e:
        log(f'  ERROR: Failed to fetch Electoral Calculus: {e}')
        return []

    return parse_electoral_calculus_html(html)


def parse_electoral_calculus_html(html):
    """Parse the Electoral Calculus polling table from HTML.

    Table structure (as of Feb 2026):
    Columns: Pollster | Sample dates | Sample size | CON% | LAB% | LIB% | Reform% | Green%

    IMPORTANT: Electoral Calculus uses OLD-STYLE HTML with UNCLOSED tags:
      <TR><TH class="theme">Pollster<TH class="theme">Sample dates<TH>CON%<TH>LAB%...
      <TR><TD>YouGov/The Times<TD>18 Jan 2026 - 19 Jan 2026<TD>2,335<TD>18<TD>19...
    Tags are NOT closed — we must split on <TH> and <TD> boundaries instead.
    """
    polls = []
    ec_average = None

    # Find the polling table — has class "llcccccccc"
    table_match = re.search(
        r'<TABLE[^>]*>.*?</TABLE>',
        html, re.DOTALL | re.IGNORECASE
    )
    if not table_match:
        log('  WARNING: Could not find polling table in Electoral Calculus HTML')
        return parse_ec_fallback(html)

    table_html = table_match.group(0)

    # Extract rows: split on <TR> tags
    row_chunks = re.split(r'<TR[^>]*>', table_html, flags=re.IGNORECASE)

    # Fixed column order for EC (they don't change often):
    # 0: Pollster, 1: Sample dates, 2: Sample size, 3: CON%, 4: LAB%, 5: LIB%, 6: Reform%, 7: Green%
    col_order = {
        'pollster': 0, 'dates': 1, 'sample_size': 2,
        'con': 3, 'lab': 4, 'lib': 5, 'reform': 6, 'green': 7,
    }

    for chunk in row_chunks:
        if not chunk.strip():
            continue

        # Split cells on <TH> or <TD> boundaries (unclosed tags)
        # Each cell starts with <TH...> or <TD...>
        cell_parts = re.split(r'<T[HD][^>]*>', chunk, flags=re.IGNORECASE)
        # First part is before any <TH>/<TD>, skip it
        cells = []
        for part in cell_parts[1:]:
            # Clean: remove </TR>, </TABLE>, other tags, decode entities
            clean = re.sub(r'</T[HDR]>', '', part, flags=re.IGNORECASE)
            clean = re.sub(r'</TABLE>', '', clean, flags=re.IGNORECASE)
            clean = re.sub(r'<[^>]+>', ' ', clean)  # Replace tags with space (for <BR>)
            clean = clean.replace('&nbsp;', '').strip()
            cells.append(clean)

        if len(cells) < 5:
            continue

        # Detect header row (contains "Pollster")
        if any('pollster' in c.lower() for c in cells):
            # Verify/update column order from actual headers
            col_order = identify_columns(cells)
            continue

        pollster_text = cells[col_order.get('pollster', 0)]

        # Skip special rows
        if not pollster_text:
            continue
        upper = pollster_text.upper().strip()
        if upper in ('ELECTION 2024', 'ELECTION', 'POLL BIAS CORRECTION'):
            continue
        if upper == 'AVERAGE':
            # Store EC's own average for comparison
            ec_average = extract_poll_from_row(cells, col_order, 'Electoral Calculus Average')
            continue

        poll = extract_poll_from_row(cells, col_order, pollster_text)
        if poll:
            polls.append(poll)

    log(f'  Parsed {len(polls)} polls from Electoral Calculus')
    if ec_average:
        log(f'  EC average: Lab {ec_average["parties"].get("Labour", 0)*100:.1f}%, '
            f'Con {ec_average["parties"].get("Conservative", 0)*100:.1f}%, '
            f'Ref {ec_average["parties"].get("Reform UK", 0)*100:.1f}%')
    return polls


def identify_columns(headers):
    """Map header names to column indices."""
    col_map = {}
    for i, h in enumerate(headers):
        hl = h.lower().strip()
        if 'pollster' in hl:
            col_map['pollster'] = i
        elif 'date' in hl:
            col_map['dates'] = i
        elif 'sample' in hl and 'size' in hl:
            col_map['sample_size'] = i
        elif 'size' in hl:
            col_map['sample_size'] = i
        elif hl in ('con', 'con%', 'conservative'):
            col_map['con'] = i
        elif hl in ('lab', 'lab%', 'labour'):
            col_map['lab'] = i
        elif hl in ('lib', 'lib%', 'ld', 'ld%', 'liberal democrat', 'liberal democrats'):
            col_map['lib'] = i
        elif hl in ('reform', 'reform%', 'reform uk'):
            col_map['reform'] = i
        elif hl in ('green', 'green%', 'green party'):
            col_map['green'] = i
        elif hl in ('other', 'oth', 'other%'):
            col_map['other'] = i
    return col_map


def extract_poll_from_row(cells, col_order, pollster_text):
    """Extract a poll dict from a table row."""
    try:
        # Dates
        dates_text = cells[col_order.get('dates', 1)] if 'dates' in col_order else ''
        start_date, end_date = parse_date_range(dates_text)
        if not end_date:
            return None

        # Sample size
        sample_text = cells[col_order.get('sample_size', 2)] if 'sample_size' in col_order else ''
        sample_size = parse_sample_size(sample_text)

        # Party percentages
        parties = {}
        for party_key, party_name in [
            ('con', 'Conservative'), ('lab', 'Labour'),
            ('lib', 'Liberal Democrats'), ('reform', 'Reform UK'),
            ('green', 'Green Party'),
        ]:
            if party_key in col_order:
                pct = parse_percentage(cells[col_order[party_key]])
                if pct is not None:
                    parties[party_name] = round(pct, 4)

        # Calculate 'Other' as remainder
        known_total = sum(parties.values())
        if known_total < 1.0:
            parties['Other'] = round(1.0 - known_total, 4)

        # Clean pollster name
        pollster = clean_pollster_name(pollster_text)

        return {
            'pollster': pollster,
            'start_date': start_date.strftime('%Y-%m-%d'),
            'end_date': end_date.strftime('%Y-%m-%d'),
            'sample_size': sample_size,
            'parties': parties,
            'source': 'Electoral Calculus',
            'methodology': guess_methodology(pollster),
        }
    except (IndexError, ValueError) as e:
        log(f'  WARNING: Failed to parse row: {e}')
        return None


def clean_pollster_name(raw):
    """Clean up pollster name from scraped text."""
    name = raw.strip()
    # Remove common suffixes like /CommissionerName
    name = re.sub(r'\s*/\s*(City\s*AM|Times|Sunday\s*Times|Telegraph|Mirror|Independent|Sky\s*News|'
                  r'Good\s*Morning\s*Britain|Express|Mail|Observer|Guardian|Standard|Sun|Star)',
                  '', name, flags=re.IGNORECASE)
    name = name.strip()
    return name


def guess_methodology(pollster):
    """Guess polling methodology from pollster name."""
    phone_pollsters = {'Ipsos', 'BMG Research', 'BMG'}
    online_panel = {'YouGov', 'Survation', 'Savanta', 'JL Partners', 'Deltapoll',
                    'Opinium', 'Redfield & Wilton', 'TechneUK', 'Techne UK',
                    'More in Common', 'Focaldata', 'Verian'}

    if pollster in phone_pollsters:
        return 'phone'
    elif pollster in online_panel:
        return 'online_panel'
    else:
        return 'unknown'


def parse_ec_fallback(html):
    """Fallback parser for Electoral Calculus if table structure changes.

    Tries to extract any recognisable polling data patterns from the HTML.
    """
    polls = []
    # Look for patterns like "YouGov ... 29 ... 24 ... 22"
    # This is a last-resort heuristic
    log('  Using fallback parser (table structure may have changed)')

    # Try to find embedded JSON or structured data
    json_match = re.search(r'var\s+pollData\s*=\s*(\[.*?\]);', html, re.DOTALL)
    if json_match:
        try:
            data = json.loads(json_match.group(1))
            for item in data:
                # Attempt to parse whatever structure we find
                poll = {
                    'pollster': item.get('pollster', 'Unknown'),
                    'start_date': item.get('start_date', item.get('date', '')),
                    'end_date': item.get('end_date', item.get('date', '')),
                    'sample_size': item.get('sample_size'),
                    'parties': {},
                    'source': 'Electoral Calculus (embedded JSON)',
                    'methodology': 'unknown',
                }
                for party in ['Conservative', 'Labour', 'Liberal Democrats', 'Reform UK', 'Green Party']:
                    key = party.lower().replace(' ', '_')
                    if key in item:
                        poll['parties'][party] = item[key] / 100 if item[key] > 1 else item[key]
                polls.append(poll)
        except (json.JSONDecodeError, KeyError):
            pass

    return polls


# ---------------------------------------------------------------------------
# Weighting engine
# ---------------------------------------------------------------------------

def calculate_poll_weight(poll, reference_date):
    """Calculate weight for a single poll.

    Weight = recency * sample_size_factor * pollster_quality * methodology

    Based on FiveThirtyEight / Electoral Calculus methodology.
    """
    # 1. Recency: exponential decay with 14-day half-life
    try:
        end_date = datetime.strptime(poll['end_date'], '%Y-%m-%d')
    except (ValueError, KeyError):
        return 0.0

    days_old = (reference_date - end_date).days
    if days_old < 0:
        days_old = 0  # Future-dated poll (use full weight)
    recency = 0.5 ** (days_old / RECENCY_HALF_LIFE)

    # 2. Sample size: sqrt(N / 1000) — diminishing returns above 1000
    sample = poll.get('sample_size') or 1000
    size_factor = math.sqrt(sample / 1000)
    # Cap at 2x (above 4000 respondents, very little extra info)
    size_factor = min(size_factor, 2.0)

    # 3. Pollster quality
    pollster = poll.get('pollster', '')
    quality = POLLSTER_RATINGS.get(pollster, POLLSTER_RATINGS['_default'])

    # 4. Methodology
    method = poll.get('methodology', 'unknown')
    method_factor = METHODOLOGY_RATINGS.get(method, METHODOLOGY_RATINGS['unknown'])

    return recency * size_factor * quality * method_factor


def calculate_house_effects(polls, reference_date, window_days=180):
    """Calculate systematic bias (house effect) per pollster.

    For each pollster, calculate how much they consistently deviate from
    the aggregate. This helps correct for known biases.

    Only uses polls within window_days of reference_date.
    """
    cutoff = reference_date - timedelta(days=window_days)

    # First pass: simple unweighted average across all polls in window
    party_totals = {}
    party_count = 0
    for poll in polls:
        try:
            end_date = datetime.strptime(poll['end_date'], '%Y-%m-%d')
        except (ValueError, KeyError):
            continue
        if end_date < cutoff:
            continue
        for party, pct in poll.get('parties', {}).items():
            if party == 'Other':
                continue
            party_totals[party] = party_totals.get(party, 0) + pct
        party_count += 1

    if party_count == 0:
        return {}

    simple_avg = {p: t / party_count for p, t in party_totals.items()}

    # Second pass: per-pollster deviation from average
    pollster_deviations = {}  # pollster -> {party -> [deviations]}
    for poll in polls:
        try:
            end_date = datetime.strptime(poll['end_date'], '%Y-%m-%d')
        except (ValueError, KeyError):
            continue
        if end_date < cutoff:
            continue

        pollster = poll.get('pollster', 'Unknown')
        if pollster not in pollster_deviations:
            pollster_deviations[pollster] = {}

        for party, pct in poll.get('parties', {}).items():
            if party == 'Other' or party not in simple_avg:
                continue
            dev = pct - simple_avg[party]
            if party not in pollster_deviations[pollster]:
                pollster_deviations[pollster][party] = []
            pollster_deviations[pollster][party].append(dev)

    # Average deviation per pollster per party = house effect
    house_effects = {}
    for pollster, party_devs in pollster_deviations.items():
        effects = {}
        for party, devs in party_devs.items():
            if len(devs) >= 2:  # Need at least 2 polls to estimate house effect
                avg_dev = sum(devs) / len(devs)
                effects[party] = round(avg_dev, 4)
        if effects:
            house_effects[pollster] = effects

    return house_effects


def compute_weighted_average(polls, reference_date, house_effects=None, max_age_days=90):
    """Compute weighted average of polls with house effect correction.

    Returns dict of party -> weighted average percentage.
    """
    cutoff = reference_date - timedelta(days=max_age_days)

    party_weighted_sum = {}
    total_weight = 0.0
    polls_used = 0

    for poll in polls:
        try:
            end_date = datetime.strptime(poll['end_date'], '%Y-%m-%d')
        except (ValueError, KeyError):
            continue
        if end_date < cutoff:
            continue

        weight = calculate_poll_weight(poll, reference_date)
        if weight <= 0:
            continue

        pollster = poll.get('pollster', '')
        effects = (house_effects or {}).get(pollster, {})

        for party, pct in poll.get('parties', {}).items():
            # Apply house effect correction
            corrected = pct - effects.get(party, 0)
            corrected = max(0, corrected)  # Can't go negative

            party_weighted_sum[party] = party_weighted_sum.get(party, 0) + corrected * weight

        total_weight += weight
        polls_used += 1

    if total_weight == 0:
        return {}, 0

    # Compute averages
    averages = {p: round(s / total_weight, 4) for p, s in party_weighted_sum.items()}

    # Normalise to sum to 1.0 (rounding errors + house corrections can drift)
    total = sum(averages.values())
    if total > 0:
        averages = {p: round(v / total, 4) for p, v in averages.items()}

    return averages, polls_used


def compute_trend(polls, reference_date, window_days=30, house_effects=None, max_age_days=90):
    """Compute trend by comparing current average to average from window_days ago."""
    current_avg, _ = compute_weighted_average(
        polls, reference_date, house_effects, max_age_days
    )

    past_date = reference_date - timedelta(days=window_days)
    past_avg, _ = compute_weighted_average(
        polls, past_date, house_effects, max_age_days
    )

    if not current_avg or not past_avg:
        return {}

    trend = {}
    for party in current_avg:
        if party in past_avg:
            change = current_avg[party] - past_avg[party]
            trend[party] = round(change, 4)

    return trend


# ---------------------------------------------------------------------------
# Output generation
# ---------------------------------------------------------------------------

def generate_polling_json(polls, reference_date, max_age_days=90):
    """Generate the full polling.json output."""
    # Calculate house effects from 6-month window
    house_effects = calculate_house_effects(polls, reference_date, window_days=180)

    # Compute weighted average
    aggregate, polls_used = compute_weighted_average(
        polls, reference_date, house_effects, max_age_days
    )

    # Compute 30-day trend
    trend_30d = compute_trend(polls, reference_date, window_days=30,
                              house_effects=house_effects, max_age_days=max_age_days)

    # Compute swing from GE2024
    swing_from_ge2024 = {}
    for party, current in aggregate.items():
        ge_pct = GE2024_RESULT.get(party, 0)
        swing_from_ge2024[party] = round(current - ge_pct, 4)

    # Filter polls for output (only those within max_age_days)
    cutoff = reference_date - timedelta(days=max_age_days)
    recent_polls = []
    for poll in polls:
        try:
            end_date = datetime.strptime(poll['end_date'], '%Y-%m-%d')
        except (ValueError, KeyError):
            continue
        if end_date < cutoff:
            continue
        # Add weight to each poll for transparency
        weight = calculate_poll_weight(poll, reference_date)
        poll_output = {
            'pollster': poll['pollster'],
            'start_date': poll['start_date'],
            'end_date': poll['end_date'],
            'sample_size': poll.get('sample_size'),
            'parties': poll.get('parties', {}),
            'weight': round(weight, 4),
            'source': poll.get('source', ''),
        }
        recent_polls.append(poll_output)

    # Sort by end_date descending (newest first)
    recent_polls.sort(key=lambda p: p['end_date'], reverse=True)

    # Format house effects for output (round values)
    formatted_house_effects = {}
    for pollster, effects in house_effects.items():
        formatted_house_effects[pollster] = {
            p: round(v, 4) for p, v in effects.items()
        }

    return {
        'meta': {
            'generated': reference_date.strftime('%Y-%m-%d'),
            'generated_at': datetime.now().isoformat(timespec='seconds'),
            'polls_aggregated': polls_used,
            'polls_available': len(recent_polls),
            'window_days': max_age_days,
            'methodology': {
                'weighting': 'recency (14d half-life) × √(sample/1000) × pollster_quality × methodology',
                'house_effects': '6-month rolling average deviation per pollster (≥2 polls required)',
                'sources': ['Electoral Calculus'],
                'academic_basis': [
                    'Nate Silver / FiveThirtyEight (recency weighting, pollster ratings)',
                    'Electoral Calculus (polling average methodology)',
                    'Curtice / NatCen (BPC membership quality premium)',
                ],
            },
        },
        'aggregate': aggregate,
        'ge2024_baseline': GE2024_RESULT,
        'swing_from_ge2024': swing_from_ge2024,
        'trend_30d': trend_30d,
        'individual_polls': recent_polls,
        'pollster_house_effects': formatted_house_effects,
        'constituency_mrp': {},  # Populated when YouGov/Survation publish MRP data
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description='Poll aggregator for AI DOGE Lancashire'
    )
    parser.add_argument('--dry-run', action='store_true',
                        help='Preview without saving')
    parser.add_argument('--standalone', action='store_true',
                        help='Output standalone JSON to stdout')
    parser.add_argument('--days', type=int, default=DEFAULT_MAX_AGE_DAYS,
                        help=f'Maximum age of polls in days (default: {DEFAULT_MAX_AGE_DAYS})')
    parser.add_argument('--from-file', type=str, default=None,
                        help='Load HTML from file instead of scraping (for testing)')
    args = parser.parse_args()

    reference_date = datetime.now()
    log(f'Poll Aggregator — {reference_date.strftime("%Y-%m-%d")}')
    log(f'Window: {args.days} days, recency half-life: {RECENCY_HALF_LIFE} days')

    # Scrape polls
    if args.from_file:
        log(f'Loading from file: {args.from_file}')
        html = Path(args.from_file).read_text(encoding='utf-8')
        polls = parse_electoral_calculus_html(html)
    else:
        polls = scrape_electoral_calculus()

    if not polls:
        log('ERROR: No polls found — check Electoral Calculus scraper')
        # Fall back to elections_reference.json if available
        ref_path = SHARED_DIR / 'elections_reference.json'
        if ref_path.exists():
            log(f'Falling back to {ref_path}')
            ref_data = json.loads(ref_path.read_text(encoding='utf-8'))
            polling = ref_data.get('national_polling', {}).get('parties', {})
            if polling:
                log(f'  Using cached polling from elections_reference.json: {polling}')
                # Create a synthetic "poll" from the cached data
                polls = [{
                    'pollster': 'Electoral Calculus (cached)',
                    'start_date': ref_data.get('national_polling', {}).get('latest_date', ''),
                    'end_date': ref_data.get('national_polling', {}).get('latest_date', ''),
                    'sample_size': None,
                    'parties': polling,
                    'source': 'elections_reference.json (fallback)',
                    'methodology': 'unknown',
                }]
        if not polls:
            sys.exit(1)

    log(f'\nAggregating {len(polls)} polls...')

    # Generate output
    output = generate_polling_json(polls, reference_date, max_age_days=args.days)

    # Log summary
    agg = output['aggregate']
    log(f'\n--- Weighted Average ---')
    for party in ['Labour', 'Conservative', 'Reform UK', 'Liberal Democrats', 'Green Party', 'Other']:
        pct = agg.get(party, 0)
        trend = output['trend_30d'].get(party, 0)
        swing = output['swing_from_ge2024'].get(party, 0)
        arrow = '↑' if trend > 0 else '↓' if trend < 0 else '→'
        log(f'  {party:20s}: {pct*100:5.1f}%  {arrow} {abs(trend)*100:+.1f}pp (30d)  '
            f'swing: {swing*100:+.1f}pp from GE2024')

    log(f'\n  Polls used: {output["meta"]["polls_aggregated"]}')
    if output['pollster_house_effects']:
        log(f'  House effects calculated for: {", ".join(output["pollster_house_effects"].keys())}')

    if args.standalone or args.dry_run:
        print(json.dumps(output, indent=2, ensure_ascii=False))
        if args.dry_run:
            log('\n--- DRY RUN complete ---')
        return

    # Save to polling.json
    SHARED_DIR.mkdir(parents=True, exist_ok=True)
    out_path = SHARED_DIR / 'polling.json'
    out_path.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding='utf-8')
    log(f'\nWritten: {out_path}')


if __name__ == '__main__':
    main()
