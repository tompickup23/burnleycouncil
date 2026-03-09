#!/usr/bin/env python3
"""
data_quality.py — Data Quality Validation for AI DOGE
Validates completeness, accuracy, and consistency of council spending data.
Produces a QC score (0-100) per council with detailed issue reports.

Usage:
    python3 data_quality.py --all                    # Validate all 15 councils
    python3 data_quality.py --council burnley         # Single council
    python3 data_quality.py --all --verbose           # Detailed output
    python3 data_quality.py --all --threshold 80      # Fail if any council below 80
    python3 data_quality.py --all --json              # Output as JSON

Cron: 0 3 * * 3 /usr/bin/python3 /root/aidoge/burnley-council/scripts/data_quality.py --all >> /var/log/aidoge/qc.log 2>&1
"""

import argparse
import json
import logging
import math
import sys
from collections import Counter, defaultdict
from datetime import datetime, date
from pathlib import Path

# ─── Paths ───────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"

# Fallback for VPS deployment
if not DATA_DIR.exists():
    DATA_DIR = Path("/root/aidoge/burnley-council/data")

# ─── Logging ─────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
log = logging.getLogger(__name__)

log_dir = Path("/var/log/aidoge")
if log_dir.exists():
    fh = logging.FileHandler(log_dir / "data_quality.log")
    fh.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
    log.addHandler(fh)

# ─── Constants ───────────────────────────────────────────────────────
AIDOGE_COUNCILS = [
    "burnley", "hyndburn", "pendle", "rossendale",
    "lancaster", "ribble_valley", "chorley", "south_ribble",
    "preston", "west_lancashire", "wyre", "fylde",
    "lancashire_cc", "blackpool", "blackburn",
]

COUNCIL_REGISTRY = {
    "hyndburn": {
        "name": "Hyndburn Borough Council", "short_name": "Hyndburn",
        "type": "district", "ons_code": "E07000120",
        "spending_threshold": 250, "data_start_fy": "2016/17",
    },
    "burnley": {
        "name": "Burnley Borough Council", "short_name": "Burnley",
        "type": "district", "ons_code": "E07000117",
        "spending_threshold": 500, "data_start_fy": "2021/22",
    },
    "pendle": {
        "name": "Pendle Borough Council", "short_name": "Pendle",
        "type": "district", "ons_code": "E07000122",
        "spending_threshold": 500, "data_start_fy": "2021/22",
    },
    "rossendale": {
        "name": "Rossendale Borough Council", "short_name": "Rossendale",
        "type": "district", "ons_code": "E07000125",
        "spending_threshold": 500, "data_start_fy": "2021/22",
    },
    "lancaster": {
        "name": "Lancaster City Council", "short_name": "Lancaster",
        "type": "city", "ons_code": "E07000121",
        "spending_threshold": 500, "data_start_fy": "2021/22",
    },
    "ribble_valley": {
        "name": "Ribble Valley Borough Council", "short_name": "Ribble Valley",
        "type": "district", "ons_code": "E07000124",
        "spending_threshold": 250, "data_start_fy": "2021/22",
    },
    "chorley": {
        "name": "Chorley Borough Council", "short_name": "Chorley",
        "type": "district", "ons_code": "E07000118",
        "spending_threshold": 500, "data_start_fy": "2021/22",
    },
    "south_ribble": {
        "name": "South Ribble Borough Council", "short_name": "South Ribble",
        "type": "district", "ons_code": "E07000126",
        "spending_threshold": 250, "data_start_fy": "2021/22",
    },
    "lancashire_cc": {
        "name": "Lancashire County Council", "short_name": "Lancashire CC",
        "type": "county", "ons_code": "E10000017",
        "spending_threshold": 250, "data_start_fy": "2024/25",
    },
    "blackpool": {
        "name": "Blackpool Council", "short_name": "Blackpool",
        "type": "unitary", "ons_code": "E06000009",
        "spending_threshold": 250, "data_start_fy": "2019/20",
    },
    "west_lancashire": {
        "name": "West Lancashire Borough Council", "short_name": "West Lancashire",
        "type": "district", "ons_code": "E07000127",
        "spending_threshold": 500, "data_start_fy": "2016/17",
    },
    "blackburn": {
        "name": "Blackburn with Darwen Borough Council", "short_name": "Blackburn with Darwen",
        "type": "unitary", "ons_code": "E06000008",
        "spending_threshold": 0, "data_start_fy": "2019/20",
    },
    "wyre": {
        "name": "Wyre Council", "short_name": "Wyre",
        "type": "district", "ons_code": "E07000128",
        "spending_threshold": 500, "data_start_fy": "2017/18",
    },
    "preston": {
        "name": "Preston City Council", "short_name": "Preston",
        "type": "district", "ons_code": "E07000123",
        "spending_threshold": 500, "data_start_fy": "2019/20",
    },
    "fylde": {
        "name": "Fylde Borough Council", "short_name": "Fylde",
        "type": "district", "ons_code": "E07000119",
        "spending_threshold": 500, "data_start_fy": "2015/16",
    },
    "lancashire_pcc": {
        "name": "Office of the Police and Crime Commissioner for Lancashire",
        "short_name": "Lancashire PCC", "type": "pcc",
        "ons_code": "E23000007", "spending_threshold": 500, "data_start_fy": "2018/19",
    },
    "lancashire_fire": {
        "name": "Lancashire Combined Fire Authority",
        "short_name": "Lancashire Fire", "type": "fire",
        "ons_code": "E31000019", "spending_threshold": 500, "data_start_fy": "2022/23",
    },
}

POPULATIONS = {
    'burnley': 88600, 'hyndburn': 81000, 'pendle': 91800, 'rossendale': 71500,
    'lancaster': 146000, 'ribble_valley': 61400, 'chorley': 118200, 'south_ribble': 111100,
    'preston': 143000, 'west_lancashire': 114300, 'wyre': 112100, 'fylde': 81400,
    'lancashire_cc': 1228100, 'blackpool': 141100, 'blackburn': 149800,
}

# Councils that use v4 monthly chunks (no spending.json committed)
MONTHLY_CHUNK_COUNCILS = {'lancashire_cc', 'blackpool', 'blackburn'}

# Benford's Law expected first-digit distribution
BENFORD_EXPECTED = {
    1: 0.301, 2: 0.176, 3: 0.125, 4: 0.097, 5: 0.079,
    6: 0.067, 7: 0.058, 8: 0.051, 9: 0.046,
}

# ─── Utility Functions ───────────────────────────────────────────────

def load_json(path):
    """Load JSON file with error handling."""
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        log.debug(f"Could not load {path}: {e}")
        return None


def current_fy():
    """Return current financial year string, e.g. '2025/26'."""
    today = date.today()
    if today.month >= 4:
        return f"{today.year}/{str(today.year + 1)[2:]}"
    return f"{today.year - 1}/{str(today.year)[2:]}"


def fy_to_start_year(fy_str):
    """Convert '2021/22' to 2021."""
    try:
        return int(fy_str.split('/')[0])
    except (ValueError, IndexError):
        return None


def expected_fys(council_id):
    """Return list of expected financial years from data_start_fy to current."""
    reg = COUNCIL_REGISTRY.get(council_id, {})
    start_fy = reg.get('data_start_fy', '2021/22')
    start_year = fy_to_start_year(start_fy)
    if start_year is None:
        return []
    cur_year = fy_to_start_year(current_fy())
    if cur_year is None:
        return []
    fys = []
    for y in range(start_year, cur_year + 1):
        fys.append(f"{y}/{str(y + 1)[2:]}")
    return fys


def parse_date_safe(date_str):
    """Parse date string to date object, return None on failure."""
    if not date_str or str(date_str).strip() in ('', 'nan', 'None', 'NaT'):
        return None
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y-%m-%dT%H:%M:%S'):
        try:
            return datetime.strptime(str(date_str).strip()[:19], fmt).date()
        except ValueError:
            continue
    return None


def load_spending_records(council_id, sample_limit=1000):
    """Load spending records (v2 spending.json), return list of dicts.
    For large councils, only return first sample_limit records.
    Returns (records, total_count) tuple.
    """
    path = DATA_DIR / council_id / "spending.json"
    if not path.exists():
        return [], 0
    try:
        with open(path) as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return [], 0

    if isinstance(data, list):
        # v1 format
        total = len(data)
        return data[:sample_limit], total
    elif isinstance(data, dict):
        # v2 format
        records = data.get('records', [])
        total = len(records)
        return records[:sample_limit], total
    return [], 0


def chi_square_benford(digit_counts, total):
    """Chi-square test for Benford's Law first-digit distribution.
    Returns (chi2, p_approximate).
    """
    if total == 0:
        return 0.0, 1.0
    chi2 = 0.0
    for digit in range(1, 10):
        observed = digit_counts.get(digit, 0)
        expected = BENFORD_EXPECTED[digit] * total
        if expected > 0:
            chi2 += (observed - expected) ** 2 / expected
    # 8 degrees of freedom; approximate p-value using chi-square survival
    # Using Wilson-Hilferty approximation for chi-square CDF
    k = 8
    if chi2 <= 0:
        return 0.0, 1.0
    z = ((chi2 / k) ** (1.0 / 3.0) - (1 - 2.0 / (9 * k))) / math.sqrt(2.0 / (9 * k))
    # Approximate p-value from z-score using logistic approximation
    p = 1.0 / (1.0 + math.exp(1.7 * z))
    return chi2, p


# ═══════════════════════════════════════════════════════════════════════
# CHECK 1: Completeness (10 points)
# ═══════════════════════════════════════════════════════════════════════

def completeness_check(council_id):
    """Check existence of required files and expected financial years."""
    score = 10
    issues = []
    council_dir = DATA_DIR / council_id

    # Required files
    required_files = {
        'metadata.json': 2,
        'config.json': 2,
        'doge_findings.json': 2,
    }
    # spending.json OR spending-index.json must exist
    has_spending = (council_dir / 'spending.json').exists()
    has_index = (council_dir / 'spending-index.json').exists()
    if not has_spending and not has_index:
        score -= 2
        issues.append({
            'severity': 'error',
            'message': f"No spending data file (spending.json or spending-index.json)"
        })

    for filename, penalty in required_files.items():
        if not (council_dir / filename).exists():
            score -= penalty
            issues.append({
                'severity': 'error',
                'message': f"Missing required file: {filename}"
            })

    # Check metadata required fields
    meta = load_json(council_dir / 'metadata.json')
    if meta:
        for field in ('council', 'total_records', 'date_range', 'total_spend'):
            if field not in meta:
                score -= 1
                issues.append({
                    'severity': 'warning',
                    'message': f"metadata.json missing field: {field}"
                })

    # Check financial year coverage
    if meta and 'financial_years' in meta:
        expected = expected_fys(council_id)
        actual = set(meta.get('financial_years', []))
        missing_fys = [fy for fy in expected if fy not in actual]
        if missing_fys:
            penalty = min(len(missing_fys), 2)  # Cap at 2 points
            score -= penalty
            issues.append({
                'severity': 'warning',
                'message': f"Missing {len(missing_fys)} financial year(s): {', '.join(missing_fys[:3])}"
                           + (f" +{len(missing_fys) - 3} more" if len(missing_fys) > 3 else "")
            })

    return {'score': max(score, 0), 'max': 10, 'issues': issues}


# ═══════════════════════════════════════════════════════════════════════
# CHECK 2: Freshness (10 points)
# ═══════════════════════════════════════════════════════════════════════

def freshness_check(council_id):
    """Check how recent the spending data is."""
    score = 10
    issues = []
    meta = load_json(DATA_DIR / council_id / 'metadata.json')
    staleness_days = None

    if not meta or 'date_range' not in meta:
        return {'score': 0, 'max': 10, 'issues': [
            {'severity': 'error', 'message': 'Cannot assess freshness: no metadata date_range'}
        ], 'staleness_days': None}

    max_date_str = meta['date_range'].get('max')
    max_date = parse_date_safe(max_date_str)

    if not max_date:
        return {'score': 0, 'max': 10, 'issues': [
            {'severity': 'error', 'message': f"Cannot parse date_range.max: {max_date_str}"}
        ], 'staleness_days': None}

    staleness_days = (date.today() - max_date).days

    if staleness_days > 365:
        score -= 10
        issues.append({
            'severity': 'error',
            'message': f"Data is {staleness_days} days stale (>12 months). Last record: {max_date_str}"
        })
    elif staleness_days > 180:
        score -= 6
        issues.append({
            'severity': 'error',
            'message': f"Data is {staleness_days} days stale (>6 months). Last record: {max_date_str}"
        })
    elif staleness_days > 90:
        score -= 3
        issues.append({
            'severity': 'warning',
            'message': f"Data is {staleness_days} days stale (>3 months). Last record: {max_date_str}"
        })

    result = {'score': max(score, 0), 'max': 10, 'issues': issues}
    result['staleness_days'] = staleness_days
    return result


# ═══════════════════════════════════════════════════════════════════════
# CHECK 3: Record Integrity (20 points)
# ═══════════════════════════════════════════════════════════════════════

def record_integrity_check(council_id):
    """Validate record counts, totals, and field quality."""
    score = 20
    issues = []
    meta = load_json(DATA_DIR / council_id / 'metadata.json')

    # For v4 councils without spending.json, use spending-index.json
    index = load_json(DATA_DIR / council_id / 'spending-index.json')
    spending_path = DATA_DIR / council_id / 'spending.json'

    # Determine record count from best available source
    if spending_path.exists():
        records, actual_count = load_spending_records(council_id, sample_limit=2000)
    elif index and 'meta' in index:
        actual_count = index['meta'].get('record_count', 0)
        records = []  # No individual records to sample for v4
    else:
        return {'score': 0, 'max': 20, 'issues': [
            {'severity': 'error', 'message': 'No spending data available for integrity check'}
        ]}

    # Check 3a: Record count vs metadata (4 points)
    if meta and 'total_records' in meta:
        meta_count = meta['total_records']
        if meta_count > 0:
            diff_pct = abs(actual_count - meta_count) / meta_count * 100
            if diff_pct > 5:
                score -= 4
                issues.append({
                    'severity': 'error',
                    'message': f"Record count mismatch: metadata says {meta_count:,}, actual {actual_count:,} ({diff_pct:.1f}% off)"
                })
            elif diff_pct > 1:
                score -= 2
                issues.append({
                    'severity': 'warning',
                    'message': f"Record count slight mismatch: metadata {meta_count:,} vs actual {actual_count:,} ({diff_pct:.1f}%)"
                })

    # Check 3b: Total spend vs metadata (4 points)
    if meta and 'total_spend' in meta and spending_path.exists():
        try:
            with open(spending_path) as f:
                data = json.load(f)
            all_records = data if isinstance(data, list) else data.get('records', [])
            actual_spend = sum(r.get('amount', 0) for r in all_records if isinstance(r.get('amount'), (int, float)))
            meta_spend = meta['total_spend']
            if meta_spend > 0:
                spend_diff_pct = abs(actual_spend - meta_spend) / meta_spend * 100
                if spend_diff_pct > 1:
                    score -= 4
                    issues.append({
                        'severity': 'error',
                        'message': f"Total spend mismatch: metadata {meta_spend:,.0f} vs computed {actual_spend:,.0f} ({spend_diff_pct:.1f}%)"
                    })
        except (json.JSONDecodeError, OSError, TypeError):
            score -= 2
            issues.append({'severity': 'warning', 'message': 'Could not verify total spend'})

    # Remaining checks require sampled records
    if not records:
        return {'score': max(score, 0), 'max': 20, 'issues': issues}

    # Check 3c: Null/empty supplier_canonical (4 points)
    null_suppliers = sum(1 for r in records if not r.get('supplier_canonical'))
    null_pct = null_suppliers / len(records) * 100 if records else 0
    if null_pct > 5:
        score -= 4
        issues.append({
            'severity': 'error',
            'message': f"{null_pct:.1f}% of sampled records have null/empty supplier_canonical ({null_suppliers}/{len(records)})"
        })
    elif null_pct > 1:
        score -= 2
        issues.append({
            'severity': 'warning',
            'message': f"{null_pct:.1f}% of sampled records have null/empty supplier_canonical"
        })

    # Check 3d: Valid required fields (4 points)
    missing_fields = Counter()
    for r in records:
        if not r.get('date'):
            missing_fields['date'] += 1
        if r.get('amount') is None:
            missing_fields['amount'] += 1
        if not r.get('supplier') and not r.get('supplier_canonical'):
            missing_fields['supplier'] += 1

    for field, count in missing_fields.items():
        pct = count / len(records) * 100
        if pct > 2:
            score -= 2
            issues.append({
                'severity': 'warning',
                'message': f"{pct:.1f}% records missing '{field}' ({count}/{len(records)})"
            })

    # Check 3e: Negative amounts ratio (4 points)
    neg_count = sum(1 for r in records if isinstance(r.get('amount'), (int, float)) and r['amount'] < 0)
    neg_pct = neg_count / len(records) * 100 if records else 0
    if neg_pct > 5:
        score -= 4
        issues.append({
            'severity': 'warning',
            'message': f"{neg_pct:.1f}% of records have negative amounts ({neg_count}/{len(records)})"
        })
    elif neg_pct > 3:
        score -= 2
        issues.append({
            'severity': 'info',
            'message': f"{neg_pct:.1f}% of records have negative amounts (within tolerance)"
        })

    return {'score': max(score, 0), 'max': 20, 'issues': issues}


# ═══════════════════════════════════════════════════════════════════════
# CHECK 4: Statistical (20 points)
# ═══════════════════════════════════════════════════════════════════════

def statistical_check(council_id):
    """Benford's Law, round numbers, duplicates, outliers."""
    score = 20
    issues = []

    records, total_count = load_spending_records(council_id, sample_limit=5000)
    if not records:
        # For v4 councils, skip statistical checks gracefully
        if council_id in MONTHLY_CHUNK_COUNCILS:
            return {'score': 15, 'max': 20, 'issues': [
                {'severity': 'info', 'message': 'Limited statistical checks (v4 monthly chunks, no monolithic spending.json)'}
            ]}
        return {'score': 0, 'max': 20, 'issues': [
            {'severity': 'error', 'message': 'No spending records available for statistical analysis'}
        ]}

    amounts = [r['amount'] for r in records if isinstance(r.get('amount'), (int, float)) and r['amount'] > 0]
    if not amounts:
        return {'score': 0, 'max': 20, 'issues': [
            {'severity': 'error', 'message': 'No positive amounts found for statistical analysis'}
        ]}

    # Check 4a: Benford's Law first digit (5 points)
    digit_counts = Counter()
    for amt in amounts:
        first_digit = int(str(abs(amt)).lstrip('0').lstrip('.')[0]) if amt != 0 else 0
        if 1 <= first_digit <= 9:
            digit_counts[first_digit] += 1

    benford_total = sum(digit_counts.values())
    if benford_total >= 100:
        chi2, p_val = chi_square_benford(digit_counts, benford_total)
        if p_val < 0.01:
            score -= 5
            issues.append({
                'severity': 'warning',
                'message': f"Benford's Law deviation: chi2={chi2:.1f}, p={p_val:.4f} (flagged at p<0.01)"
            })

    # Check 4b: Round number ratio (5 points)
    round_count = sum(1 for a in amounts if a >= 1000 and a % 1000 == 0)
    round_pct = round_count / len(amounts) * 100 if amounts else 0
    if round_pct > 20:
        score -= 5
        issues.append({
            'severity': 'warning',
            'message': f"{round_pct:.1f}% of amounts are round thousands ({round_count}/{len(amounts)})"
        })
    elif round_pct > 15:
        score -= 2
        issues.append({
            'severity': 'info',
            'message': f"{round_pct:.1f}% round-thousand amounts (elevated but within tolerance)"
        })

    # Check 4c: Exact duplicates — same date + supplier + amount (5 points)
    dup_keys = Counter()
    for r in records:
        key = (r.get('date', ''), r.get('supplier_canonical', r.get('supplier', '')), r.get('amount', 0))
        dup_keys[key] += 1
    dup_count = sum(v - 1 for v in dup_keys.values() if v > 1)
    dup_pct = dup_count / len(records) * 100 if records else 0
    if dup_pct > 2:
        score -= 5
        issues.append({
            'severity': 'warning',
            'message': f"{dup_pct:.1f}% potential duplicate records ({dup_count} duplicates in sample)"
        })
    elif dup_pct > 1:
        score -= 2
        issues.append({
            'severity': 'info',
            'message': f"{dup_pct:.1f}% potential duplicates (borderline)"
        })

    # Check 4d: Outlier — any single transaction > 10% of total spend (5 points)
    total_spend = sum(amounts)
    if total_spend > 0:
        max_single = max(amounts)
        max_pct = max_single / total_spend * 100
        if max_pct > 10:
            score -= 5
            issues.append({
                'severity': 'warning',
                'message': f"Single transaction is {max_pct:.1f}% of total spend ({max_single:,.0f} of {total_spend:,.0f})"
            })

    return {'score': max(score, 0), 'max': 20, 'issues': issues}


# ═══════════════════════════════════════════════════════════════════════
# CHECK 5: Consistency (20 points)
# ═══════════════════════════════════════════════════════════════════════

def consistency_check(council_id):
    """Department naming, supplier deduplication, date formats, FY boundaries."""
    score = 20
    issues = []

    records, _ = load_spending_records(council_id, sample_limit=3000)
    if not records:
        if council_id in MONTHLY_CHUNK_COUNCILS:
            return {'score': 15, 'max': 20, 'issues': [
                {'severity': 'info', 'message': 'Limited consistency checks (v4 monthly chunks)'}
            ]}
        return {'score': 0, 'max': 20, 'issues': [
            {'severity': 'error', 'message': 'No records for consistency check'}
        ]}

    # Check 5a: Department name consistency (5 points)
    depts = set()
    for r in records:
        d = r.get('department', '')
        if d and d not in ('', 'Other', 'Unknown'):
            depts.add(d)

    # Look for near-duplicate departments (edit distance heuristic)
    dept_list = sorted(depts)
    dept_dupes = []
    for i, d1 in enumerate(dept_list):
        for d2 in dept_list[i + 1:]:
            # Simple check: one is substring of the other, or differ by only common suffixes
            d1_norm = d1.lower().replace('&', 'and').replace('  ', ' ').strip()
            d2_norm = d2.lower().replace('&', 'and').replace('  ', ' ').strip()
            if d1_norm == d2_norm and d1 != d2:
                dept_dupes.append((d1, d2))
    if dept_dupes:
        score -= min(len(dept_dupes) * 2, 5)
        for d1, d2 in dept_dupes[:3]:
            issues.append({
                'severity': 'warning',
                'message': f"Possible department duplicate: '{d1}' vs '{d2}'"
            })

    # Check 5b: Supplier canonical consistency (5 points)
    suppliers = Counter()
    for r in records:
        s = r.get('supplier_canonical', '')
        if s:
            suppliers[s] += 1

    # Check for obvious supplier duplicates: "X LTD" vs "X LIMITED"
    supplier_list = sorted(suppliers.keys())
    supplier_dupes = []
    ltd_map = defaultdict(list)
    for s in supplier_list:
        norm = s.upper().replace(' LIMITED', ' LTD').replace(' PLC', '').replace(' LLP', '').strip()
        ltd_map[norm].append(s)
    for norm, variants in ltd_map.items():
        if len(variants) > 1:
            supplier_dupes.append(variants)

    if len(supplier_dupes) > 10:
        score -= 5
        issues.append({
            'severity': 'warning',
            'message': f"{len(supplier_dupes)} supplier name variants detected (e.g. '{supplier_dupes[0][0]}' vs '{supplier_dupes[0][1]}')"
        })
    elif supplier_dupes:
        score -= 2
        issues.append({
            'severity': 'info',
            'message': f"{len(supplier_dupes)} minor supplier name variant(s)"
        })

    # Check 5c: Date format consistency (5 points)
    unparseable = 0
    for r in records:
        d = r.get('date', '')
        if d and parse_date_safe(d) is None:
            unparseable += 1
    if unparseable > 0:
        pct = unparseable / len(records) * 100
        if pct > 1:
            score -= 5
            issues.append({
                'severity': 'error',
                'message': f"{unparseable} records ({pct:.1f}%) have unparseable dates"
            })
        else:
            score -= 1
            issues.append({
                'severity': 'info',
                'message': f"{unparseable} record(s) with unparseable dates ({pct:.2f}%)"
            })

    # Check 5d: Financial year boundaries (5 points)
    fy_mismatches = 0
    for r in records:
        d = parse_date_safe(r.get('date', ''))
        fy = r.get('financial_year', '')
        if d and fy:
            expected_fy_start = fy_to_start_year(fy)
            if expected_fy_start is not None:
                # FY runs Apr to Mar: date should be Apr {start} to Mar {start+1}
                if d.month >= 4:
                    actual_fy_start = d.year
                else:
                    actual_fy_start = d.year - 1
                if actual_fy_start != expected_fy_start:
                    fy_mismatches += 1

    if fy_mismatches > 0:
        pct = fy_mismatches / len(records) * 100
        if pct > 2:
            score -= 5
            issues.append({
                'severity': 'error',
                'message': f"{fy_mismatches} records ({pct:.1f}%) have date/financial_year mismatch"
            })
        elif pct > 0.5:
            score -= 2
            issues.append({
                'severity': 'warning',
                'message': f"{fy_mismatches} records ({pct:.1f}%) have date/FY boundary issues"
            })

    return {'score': max(score, 0), 'max': 20, 'issues': issues}


# ═══════════════════════════════════════════════════════════════════════
# CHECK 6: Cross-Council (20 points)
# ═══════════════════════════════════════════════════════════════════════

def cross_council_check(council_id):
    """Compare against Lancashire-wide averages for per-capita spend,
    supplier count, record density, and duplicate rate."""
    score = 20
    issues = []

    # Collect Lancashire-wide stats
    all_stats = {}
    for cid in AIDOGE_COUNCILS:
        meta = load_json(DATA_DIR / cid / 'metadata.json')
        if meta and cid in POPULATIONS:
            pop = POPULATIONS[cid]
            total_spend = meta.get('total_spend', 0)
            total_records = meta.get('total_records', 0)
            supplier_count = meta.get('supplier_count', meta.get('unique_suppliers', 0))
            all_stats[cid] = {
                'per_capita': total_spend / pop if pop > 0 else 0,
                'records_per_year': total_records / max(len(meta.get('financial_years', [1])), 1),
                'supplier_count': supplier_count,
            }

    if council_id not in all_stats or len(all_stats) < 3:
        return {'score': 15, 'max': 20, 'issues': [
            {'severity': 'info', 'message': 'Insufficient cross-council data for comparison'}
        ]}

    this = all_stats[council_id]
    council_type = COUNCIL_REGISTRY.get(council_id, {}).get('type', 'district')

    # Filter to same-tier councils for fair comparison
    peer_ids = [cid for cid, reg in COUNCIL_REGISTRY.items()
                if reg.get('type') == council_type and cid in all_stats and cid != council_id]
    if len(peer_ids) < 2:
        peer_ids = [cid for cid in all_stats if cid != council_id]

    peer_stats = {cid: all_stats[cid] for cid in peer_ids}
    if not peer_stats:
        return {'score': 15, 'max': 20, 'issues': [
            {'severity': 'info', 'message': 'No peer councils available for comparison'}
        ]}

    # Check 6a: Per-capita spend vs peers (5 points)
    per_capitas = [s['per_capita'] for s in peer_stats.values()]
    if per_capitas:
        mean_pc = sum(per_capitas) / len(per_capitas)
        if len(per_capitas) > 1:
            std_pc = (sum((x - mean_pc) ** 2 for x in per_capitas) / (len(per_capitas) - 1)) ** 0.5
        else:
            std_pc = mean_pc * 0.5  # Fallback
        if std_pc > 0 and abs(this['per_capita'] - mean_pc) > 3 * std_pc:
            score -= 5
            direction = "above" if this['per_capita'] > mean_pc else "below"
            issues.append({
                'severity': 'warning',
                'message': f"Per-capita spend {this['per_capita']:,.0f} is >3 std devs {direction} peer mean {mean_pc:,.0f}"
            })

    # Check 6b: Supplier count vs peers (5 points)
    supplier_counts = [s['supplier_count'] for s in peer_stats.values() if s['supplier_count'] > 0]
    if supplier_counts:
        mean_sc = sum(supplier_counts) / len(supplier_counts)
        if len(supplier_counts) > 1:
            std_sc = (sum((x - mean_sc) ** 2 for x in supplier_counts) / (len(supplier_counts) - 1)) ** 0.5
        else:
            std_sc = mean_sc * 0.5
        if std_sc > 0 and this['supplier_count'] > 0:
            z = abs(this['supplier_count'] - mean_sc) / std_sc
            if z > 3:
                score -= 5
                issues.append({
                    'severity': 'warning',
                    'message': f"Supplier count {this['supplier_count']:,} is >3 std devs from peer mean {mean_sc:,.0f}"
                })

    # Check 6c: Records per year vs peers (5 points)
    rpy_values = [s['records_per_year'] for s in peer_stats.values() if s['records_per_year'] > 0]
    if rpy_values:
        mean_rpy = sum(rpy_values) / len(rpy_values)
        if len(rpy_values) > 1:
            std_rpy = (sum((x - mean_rpy) ** 2 for x in rpy_values) / (len(rpy_values) - 1)) ** 0.5
        else:
            std_rpy = mean_rpy * 0.5
        if std_rpy > 0 and this['records_per_year'] > 0:
            z = abs(this['records_per_year'] - mean_rpy) / std_rpy
            if z > 3:
                score -= 5
                issues.append({
                    'severity': 'warning',
                    'message': f"Records/year {this['records_per_year']:,.0f} is >3 std devs from peer mean {mean_rpy:,.0f}"
                })

    # Check 6d: Duplicate rate comparison (5 points)
    # Only check if we can load records
    records, _ = load_spending_records(council_id, sample_limit=3000)
    if records:
        dup_keys = Counter()
        for r in records:
            key = (r.get('date', ''), r.get('supplier_canonical', ''), r.get('amount', 0))
            dup_keys[key] += 1
        dup_rate = sum(v - 1 for v in dup_keys.values() if v > 1) / len(records) * 100

        # Compute peer dup rates
        peer_dup_rates = []
        for pid in peer_ids[:5]:  # Limit to 5 peers for performance
            p_records, _ = load_spending_records(pid, sample_limit=1000)
            if p_records:
                p_keys = Counter()
                for r in p_records:
                    key = (r.get('date', ''), r.get('supplier_canonical', ''), r.get('amount', 0))
                    p_keys[key] += 1
                p_dup = sum(v - 1 for v in p_keys.values() if v > 1) / len(p_records) * 100
                peer_dup_rates.append(p_dup)

        if peer_dup_rates:
            mean_dup = sum(peer_dup_rates) / len(peer_dup_rates)
            if dup_rate > mean_dup * 3 and dup_rate > 2:
                score -= 5
                issues.append({
                    'severity': 'warning',
                    'message': f"Duplicate rate {dup_rate:.1f}% is 3x+ peer average {mean_dup:.1f}%"
                })

    return {'score': max(score, 0), 'max': 20, 'issues': issues}


# ═══════════════════════════════════════════════════════════════════════
# Main Validation
# ═══════════════════════════════════════════════════════════════════════

def validate_council(council_id):
    """Run all checks for a council. Returns (score, issues, results)."""
    log.info(f"Validating {council_id}...")
    results = {}

    results['completeness'] = completeness_check(council_id)
    results['freshness'] = freshness_check(council_id)
    results['record_integrity'] = record_integrity_check(council_id)
    results['statistical'] = statistical_check(council_id)
    results['consistency'] = consistency_check(council_id)
    results['cross_council'] = cross_council_check(council_id)

    total = sum(r['score'] for r in results.values())
    max_total = sum(r['max'] for r in results.values())
    score = round(total / max_total * 100) if max_total > 0 else 0

    issues = []
    for category, r in results.items():
        for issue in r.get('issues', []):
            issues.append({
                'category': category,
                'severity': issue.get('severity', 'warning'),
                'message': issue['message'],
            })

    return score, issues, results


def score_grade(score):
    """Return letter grade for QC score."""
    if score >= 90:
        return 'A'
    elif score >= 80:
        return 'B'
    elif score >= 70:
        return 'C'
    elif score >= 60:
        return 'D'
    return 'F'


def main():
    parser = argparse.ArgumentParser(
        description='AI DOGE Data Quality Validation',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Examples:\n"
               "  python3 data_quality.py --all\n"
               "  python3 data_quality.py --council burnley --verbose\n"
               "  python3 data_quality.py --all --threshold 80 --json\n"
    )
    parser.add_argument('--council', type=str, help='Validate a single council')
    parser.add_argument('--all', action='store_true', help='Validate all 15 councils')
    parser.add_argument('--verbose', action='store_true', help='Show detailed issue list')
    parser.add_argument('--threshold', type=int, default=0,
                        help='Minimum QC score; exit 1 if any council falls below')
    parser.add_argument('--json', action='store_true', help='Output results as JSON')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be checked without running')
    args = parser.parse_args()

    if not args.council and not args.all:
        parser.print_help()
        sys.exit(1)

    if args.council and args.council not in AIDOGE_COUNCILS:
        log.error(f"Unknown council: {args.council}. Valid: {', '.join(AIDOGE_COUNCILS)}")
        sys.exit(1)

    councils = AIDOGE_COUNCILS if args.all else [args.council]

    if args.dry_run:
        print(f"Would validate {len(councils)} council(s): {', '.join(councils)}")
        print(f"Data directory: {DATA_DIR}")
        print(f"Threshold: {args.threshold or 'none'}")
        sys.exit(0)

    # Run validation
    all_results = {}
    for cid in councils:
        score, issues, details = validate_council(cid)
        staleness = details.get('freshness', {}).get('staleness_days')
        all_results[cid] = {
            'score': score,
            'grade': score_grade(score),
            'issues': issues,
            'details': details,
            'staleness_days': staleness,
        }

    # JSON output
    if args.json:
        output = {
            'generated': datetime.now().isoformat(),
            'threshold': args.threshold,
            'councils': {}
        }
        for cid, r in all_results.items():
            output['councils'][cid] = {
                'score': r['score'],
                'grade': r['grade'],
                'staleness_days': r['staleness_days'],
                'issue_count': len(r['issues']),
                'issues': r['issues'],
                'breakdown': {
                    cat: {'score': d['score'], 'max': d['max']}
                    for cat, d in r['details'].items()
                },
            }
        print(json.dumps(output, indent=2))
    else:
        # Summary table
        print()
        print("=" * 78)
        print(f"  AI DOGE Data Quality Report — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
        print("=" * 78)
        print()
        print(f"  {'Council':<22} {'Score':>5}  {'Grade':>5}  {'Issues':>6}  {'Staleness':>12}")
        print(f"  {'-' * 22} {'-' * 5}  {'-' * 5}  {'-' * 6}  {'-' * 12}")

        for cid in councils:
            r = all_results[cid]
            name = COUNCIL_REGISTRY.get(cid, {}).get('short_name', cid)
            staleness = r['staleness_days']
            stale_str = f"{staleness}d" if staleness is not None else "N/A"
            error_count = sum(1 for i in r['issues'] if i['severity'] == 'error')
            warn_count = sum(1 for i in r['issues'] if i['severity'] == 'warning')
            issue_str = f"{error_count}E {warn_count}W"
            print(f"  {name:<22} {r['score']:>5}  {r['grade']:>5}  {issue_str:>6}  {stale_str:>12}")

        # Averages
        scores = [all_results[c]['score'] for c in councils]
        avg = sum(scores) / len(scores) if scores else 0
        print(f"  {'-' * 22} {'-' * 5}  {'-' * 5}  {'-' * 6}  {'-' * 12}")
        print(f"  {'AVERAGE':<22} {avg:>5.0f}  {score_grade(round(avg)):>5}")
        print()

        # Verbose: issue details
        if args.verbose:
            for cid in councils:
                r = all_results[cid]
                if not r['issues']:
                    continue
                name = COUNCIL_REGISTRY.get(cid, {}).get('short_name', cid)
                print(f"  --- {name} (score: {r['score']}) ---")
                for issue in r['issues']:
                    sev = issue['severity'].upper()[:4]
                    print(f"    [{sev}] [{issue['category']}] {issue['message']}")
                print()

    # Threshold check
    if args.threshold > 0:
        failed = [cid for cid, r in all_results.items() if r['score'] < args.threshold]
        if failed:
            names = [COUNCIL_REGISTRY.get(c, {}).get('short_name', c) for c in failed]
            log.error(f"FAIL: {len(failed)} council(s) below threshold {args.threshold}: {', '.join(names)}")
            sys.exit(1)
        else:
            log.info(f"PASS: All {len(councils)} council(s) meet threshold {args.threshold}")

    sys.exit(0)


if __name__ == '__main__':
    main()
