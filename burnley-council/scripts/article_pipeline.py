#!/usr/bin/env python3
"""
article_pipeline.py — Fully Automated Article Generator for AI DOGE

Analyses spending data to discover article topics, generates fact-checked articles
using the LLM router, and deploys them to council data directories.

Safety features:
  - File-based lockfile prevents concurrent runs (with auto_pipeline, Clawdbot, etc.)
  - Daily token budget tracking (respects Mistral free tier: ~1B tokens/month)
  - Rate limiting between LLM calls (10s gap)
  - Pre-computed spending stats (avoids loading 40MB+ spending.json when stats file exists)
  - Numerical fact verification (checks £ figures in output match source data)
  - Auto-tagging based on article content
  - 25+ topic templates with quarterly keys (prevents exhaustion)

Workflow:
  1. Acquire lockfile (or exit if another pipeline is running)
  2. Check daily token budget (or exit if budget exhausted)
  3. Load spending stats + DOGE findings for each council
  4. Discover new article topics from data patterns (25+ templates, quarterly)
  5. Skip topics that already have published articles
  6. Generate articles via LLM with strict fact-grounding
  7. Verify cited numbers against actual data
  8. Auto-tag articles
  9. Write article JSON + update articles-index.json
  10. (Optional) Commit and push via git
  11. Release lockfile

Usage:
    python3 article_pipeline.py                     # Generate for all councils
    python3 article_pipeline.py --council burnley    # Single council
    python3 article_pipeline.py --dry-run            # Show topics without generating
    python3 article_pipeline.py --max-articles 2     # Limit per run
    python3 article_pipeline.py --budget 50000       # Override daily token budget

Cron (vps-main): 0 9 * * * cd /root/clawd-worker/aidoge/scripts && python3 article_pipeline.py --max-articles 3
"""

import argparse
import fcntl
import json
import logging
import math
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# LLM Router — try import from same directory, then from clawd-worker path
sys.path.insert(0, os.path.dirname(__file__))
try:
    from llm_router import generate
    HAS_LLM = True
except ImportError:
    HAS_LLM = False

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler()],
)
log = logging.getLogger('ArticlePipeline')

# Log to file if running on server
LOG_FILE = Path('/root/clawd-worker/logs/article_pipeline.log')
if LOG_FILE.parent.exists():
    logging.getLogger().addHandler(logging.FileHandler(LOG_FILE))

# ── Paths ────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent  # burnley-council/
DATA_DIR = BASE_DIR / 'data'

# On vps-main, data may be at /root/aidoge/burnley-council/data or /root/clawd-worker/aidoge/data
for alt in [
    Path('/root/aidoge/burnley-council/data'),
    Path('/root/clawd-worker/aidoge/data'),
]:
    if alt.exists():
        DATA_DIR = alt
        break

COUNCILS = [
    # East Lancashire
    'burnley', 'hyndburn', 'pendle', 'rossendale',
    # Central & South Lancashire
    'lancaster', 'ribble_valley', 'chorley', 'south_ribble',
    # Fylde Coast & West
    'preston', 'west_lancashire', 'wyre', 'fylde',
    # County
    'lancashire_cc',
    # Unitary
    'blackpool', 'blackburn',
]

ARTICLE_IMAGES = {
    'spending': '/images/articles/finance.jpg',
    'investigation': '/images/articles/documents.jpg',
    'supplier': '/images/articles/outsourcing.jpg',
    'governance': '/images/articles/government.jpg',
    'budget': '/images/articles/finance.jpg',
    'services': '/images/articles/council-meeting.jpg',
    'procurement': '/images/articles/legal.jpg',
    'comparison': '/images/articles/magnifying-glass.jpg',
    'default': '/images/articles/documents.jpg',
}

# ── Lockfile (prevents concurrent runs) ──────────────────────────────
LOCK_FILE = Path('/tmp/aidoge-article-pipeline.lock')


class PipelineLock:
    """File-based lock to prevent concurrent pipeline runs.
    Prevents conflicts with auto_pipeline.py, Clawdbot, and other processes on vps-main."""

    def __init__(self):
        self._fd = None

    def acquire(self):
        """Try to acquire exclusive lock. Returns True if acquired, False if another process holds it."""
        try:
            self._fd = open(LOCK_FILE, 'w')
            fcntl.flock(self._fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self._fd.write(f'{os.getpid()} {datetime.now().isoformat()}\n')
            self._fd.flush()
            log.info('Lockfile acquired')
            return True
        except (IOError, OSError):
            log.warning('Another pipeline process is running — exiting to avoid conflicts')
            if self._fd:
                self._fd.close()
                self._fd = None
            return False

    def release(self):
        """Release the lock."""
        if self._fd:
            try:
                fcntl.flock(self._fd, fcntl.LOCK_UN)
                self._fd.close()
            except (IOError, OSError):
                pass
            self._fd = None
            try:
                LOCK_FILE.unlink(missing_ok=True)
            except (IOError, OSError):
                pass
            log.info('Lockfile released')


# ── Token Budget (respects free tier limits) ─────────────────────────
BUDGET_FILE = Path('/tmp/aidoge-article-budget.json')

# Mistral free tier: ~1B tokens/month ≈ ~33M tokens/day
# We budget conservatively: 50K tokens/day for articles (~12 articles)
# Each article uses ~4K tokens (prompt ~1.5K + response ~2.5K)
DEFAULT_DAILY_BUDGET = 50_000  # tokens
ESTIMATED_TOKENS_PER_ARTICLE = 4_500  # conservative estimate


def load_budget():
    """Load today's token usage from budget file."""
    today = datetime.now().strftime('%Y-%m-%d')
    if BUDGET_FILE.exists():
        try:
            data = json.loads(BUDGET_FILE.read_text())
            if data.get('date') == today:
                return data
        except (json.JSONDecodeError, IOError):
            pass
    # New day or corrupt file — reset
    return {'date': today, 'tokens_used': 0, 'articles_generated': 0, 'calls': 0}


def save_budget(budget):
    """Save token usage to budget file."""
    try:
        BUDGET_FILE.write_text(json.dumps(budget, indent=2))
    except IOError as e:
        log.warning(f'Could not save budget file: {e}')


def check_budget(daily_limit):
    """Check if we have budget remaining. Returns (ok, budget_dict)."""
    budget = load_budget()
    remaining = daily_limit - budget['tokens_used']
    if remaining < ESTIMATED_TOKENS_PER_ARTICLE:
        log.info(f'Daily budget exhausted: {budget["tokens_used"]:,} / {daily_limit:,} tokens used '
                 f'({budget["articles_generated"]} articles, {budget["calls"]} API calls today)')
        return False, budget
    log.info(f'Token budget: {budget["tokens_used"]:,} / {daily_limit:,} used, '
             f'~{remaining // ESTIMATED_TOKENS_PER_ARTICLE} articles remaining')
    return True, budget


def record_usage(budget, estimated_tokens):
    """Record token usage after an API call."""
    budget['tokens_used'] += estimated_tokens
    budget['articles_generated'] += 1
    budget['calls'] += 1
    save_budget(budget)


# ── System Prompt for Article Generation ─────────────────────────────
SYSTEM_PROMPT = """You are a data journalist writing for AI DOGE (aidoge.co.uk), a public spending transparency platform covering 15 Lancashire councils.

YOUR TASK: Write ONE article in HTML format. Follow these rules EXACTLY.

FORMAT RULES:
1. Write 800-1200 words total
2. Output ONLY HTML — no markdown, no plain text
3. Allowed HTML tags: <h2> <h3> <p> <ul> <li> <strong> <em> <table> <thead> <tbody> <tr> <th> <td>
4. FORBIDDEN tags: <h1> <div> <span> <style> <script> — do NOT use these
5. Do NOT add class attributes to any tag
6. UK English spelling (organisation, analyse, colour, programme, defence)

ARTICLE STRUCTURE (follow this order exactly):

SECTION 1 — Key Findings
<h3>Key Findings</h3>
<ul> with 3-5 <li> bullets. Each bullet states ONE fact with a £ figure or percentage from the data.

SECTION 2 — Main Body
2-4 sections, each with an <h2> heading and 2-3 <p> paragraphs.
Every paragraph must reference at least one specific number from the data brief.
Use <strong> to highlight key £ figures and supplier names.
Use <table> for any comparison of 3+ items (e.g. top suppliers, department spend).

SECTION 3 — What You Can Do
<h2>What You Can Do</h2>
<ul> with 3-5 specific citizen actions:
- Submit FOI request to the council about [specific topic]
- Attend council committee meetings (usually public)
- Check the council's published contracts register
- Write to your local councillor about [specific concern]
- Visit aidoge.co.uk to explore the full spending data yourself

SECTION 4 — Methodology Note
<em>This article is based on [council name]'s published spending data covering [date range]. All figures are drawn directly from transactions published under the Local Government Transparency Code. Analysis by AI DOGE.</em>

DATA RULES (CRITICAL):
- Every £ figure MUST come from the DATA BRIEF section of the prompt
- Every percentage MUST come from the PRE-CALCULATED ANALYSIS section
- Supplier names must be copied EXACTLY (case-sensitive) from the data
- Do NOT invent, estimate, or round any numbers
- Do NOT claim trends unless the data shows year-over-year figures
- If you are unsure about a number, omit it rather than guessing"""


# ── Data Loading ─────────────────────────────────────────────────────

def load_spending_stats(council_id):
    """Load pre-computed spending stats if available, otherwise compute from spending.json.
    Pre-computed stats file is ~10KB vs 15-40MB for full spending.json."""
    # Try pre-computed stats first (generated by council_etl.py or this script)
    stats_path = DATA_DIR / council_id / 'spending-stats.json'
    if stats_path.exists():
        try:
            stats = json.loads(stats_path.read_text())
            log.info(f'Loaded pre-computed stats for {council_id} ({stats_path.stat().st_size // 1024}KB)')
            return stats
        except (json.JSONDecodeError, IOError):
            log.warning(f'Corrupt stats file for {council_id} — falling back to spending.json')

    # Fall back to computing from spending.json (expensive)
    return _compute_stats_from_spending(council_id)


def _compute_stats_from_spending(council_id):
    """Compute stats from full spending.json — only used when pre-computed stats unavailable."""
    path = DATA_DIR / council_id / 'spending.json'
    if not path.exists():
        return None

    file_size = path.stat().st_size
    if file_size > 50_000_000:  # >50MB — skip to avoid OOM on 1GB RAM servers
        log.warning(f'spending.json for {council_id} is {file_size // 1_000_000}MB — too large, skipping. '
                    f'Run council_etl.py to generate spending-stats.json')
        return None

    log.info(f'Computing stats from spending.json for {council_id} ({file_size // 1_000_000}MB)...')
    data = json.loads(path.read_text())
    records = data.get('records', []) if isinstance(data, dict) else data

    stats = compute_spending_stats(records)

    # Cache for next time
    if stats:
        try:
            stats_path = DATA_DIR / council_id / 'spending-stats.json'
            stats_path.write_text(json.dumps(stats, indent=2, default=str))
            log.info(f'Cached stats to {stats_path}')
        except IOError:
            pass

    return stats


def load_doge_findings(council_id):
    """Load DOGE analysis findings."""
    path = DATA_DIR / council_id / 'doge_findings.json'
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    # Handle nested format: {findings: [...], key_findings: [...], ...}
    if isinstance(data, dict) and 'findings' in data:
        return data['findings']
    return data


def load_doge_raw(council_id):
    """Load raw DOGE findings dict (for advanced topic templates)."""
    path = DATA_DIR / council_id / 'doge_findings.json'
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, IOError):
        return {}


def load_budgets_govuk(council_id):
    """Load GOV.UK budget data for budget-related topics."""
    path = DATA_DIR / council_id / 'budgets_govuk.json'
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, IOError):
        return None


def load_config(council_id):
    """Load council config."""
    path = DATA_DIR / council_id / 'config.json'
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def load_existing_articles(council_id):
    """Load existing article IDs to avoid duplicates."""
    index_path = DATA_DIR / council_id / 'articles-index.json'
    if not index_path.exists():
        return set()
    data = json.loads(index_path.read_text())
    # Handle both formats: plain list or {articles: [...]}
    if isinstance(data, dict):
        articles = data.get('articles', [])
    else:
        articles = data
    return {a['id'] for a in articles if isinstance(a, dict) and 'id' in a}


def compute_spending_stats(records):
    """Compute summary statistics from spending records."""
    if not records:
        return {}

    total = sum(abs(float(r.get('amount', 0))) for r in records)
    suppliers = {}
    departments = {}
    monthly = {}
    years = set()
    payment_types = {}

    for r in records:
        amount = abs(float(r.get('amount', 0)))
        supplier = r.get('supplier', r.get('vendor', 'Unknown'))
        dept = r.get('department', r.get('service_area', 'Unknown'))
        date = r.get('date', '')
        fy = r.get('financial_year', '')
        ptype = r.get('expense_type', r.get('payment_type', 'Unknown'))

        suppliers[supplier] = suppliers.get(supplier, 0) + amount
        departments[dept] = departments.get(dept, 0) + amount
        if ptype:
            payment_types[ptype] = payment_types.get(ptype, 0) + amount
        if fy:
            years.add(fy)
        if date and len(date) >= 7:
            month_key = date[:7]
            monthly[month_key] = monthly.get(month_key, 0) + amount

    top_suppliers = sorted(suppliers.items(), key=lambda x: -x[1])[:20]
    top_depts = sorted(departments.items(), key=lambda x: -x[1])[:10]
    top_types = sorted(payment_types.items(), key=lambda x: -x[1])[:10]

    # Year totals for trend analysis
    year_totals = {}
    for m, amount in monthly.items():
        year = m[:4]
        year_totals[year] = year_totals.get(year, 0) + amount

    # Supplier size distribution
    all_supplier_vals = list(suppliers.values())
    size_dist = {
        'under_1k': len([v for v in all_supplier_vals if v < 1000]),
        '1k_to_10k': len([v for v in all_supplier_vals if 1000 <= v < 10000]),
        '10k_to_100k': len([v for v in all_supplier_vals if 10000 <= v < 100000]),
        '100k_to_1m': len([v for v in all_supplier_vals if 100000 <= v < 1000000]),
        'over_1m': len([v for v in all_supplier_vals if v >= 1000000]),
    }

    return {
        'total_spend': total,
        'transaction_count': len(records),
        'unique_suppliers': len(suppliers),
        'financial_years': sorted(years),
        'top_suppliers': top_suppliers,
        'top_departments': top_depts,
        'top_payment_types': top_types,
        'monthly_spend': monthly,
        'year_totals': year_totals,
        'supplier_size_distribution': size_dist,
    }


# ── Topic Discovery (25+ templates, quarterly keys) ─────────────────

def _quarter_key():
    """Return current quarter key like '2026-Q1'."""
    m = datetime.now().month
    q = (m - 1) // 3 + 1
    return f'{datetime.now().year}-Q{q}'


def _half_key():
    """Return current half-year key like '2026-H1'."""
    h = 1 if datetime.now().month <= 6 else 2
    return f'{datetime.now().year}-H{h}'


def discover_topics(council_id, stats, findings, doge_raw, budgets_govuk, existing_ids):
    """Discover new article topics based on spending data analysis.
    25+ topic templates with quarterly/half-yearly keys to prevent exhaustion."""
    topics = []
    council_name = council_id.replace('_', ' ').replace('-', ' ').title()

    if not stats:
        return topics

    top_suppliers = stats.get('top_suppliers', [])
    top_depts = stats.get('top_departments', [])
    total = stats.get('total_spend', 0)
    years = stats.get('financial_years', [])
    year_totals = stats.get('year_totals', {})
    qk = _quarter_key()
    hk = _half_key()
    yr = datetime.now().year

    # ── ANNUAL topics (1 per year per council) ──

    # 1. Supplier concentration (annual)
    if top_suppliers and f'supplier-concentration-{yr}' not in existing_ids:
        top5_total = sum(s[1] for s in top_suppliers[:5])
        top5_pct = (top5_total / total * 100) if total > 0 else 0
        if top5_pct > 15:
            topics.append({
                'id': f'supplier-concentration-{yr}',
                'category': 'Investigation',
                'title': f"Where {council_name}'s Money Really Goes: Top Supplier Analysis {yr}",
                'image': ARTICLE_IMAGES['supplier'],
                'brief': f"The top 5 suppliers account for {top5_pct:.0f}% (£{top5_total/1e6:.1f}M) of {council_name}'s total spend. "
                         f"Analyse concentration risk, contract dependency, and whether competitive markets exist. "
                         f"Top suppliers: {', '.join(s[0] for s in top_suppliers[:5])}. "
                         f"Total spend: £{total/1e6:.1f}M across {stats['transaction_count']:,} transactions.",
                'data_context': {
                    'total_spend': total,
                    'transaction_count': stats['transaction_count'],
                    'top_suppliers': [(s[0], round(s[1], 2)) for s in top_suppliers[:10]],
                    'unique_suppliers': stats['unique_suppliers'],
                    'financial_years': years,
                },
            })

    # 2. Department spending (annual)
    if top_depts and f'department-spending-{yr}' not in existing_ids:
        topics.append({
            'id': f'department-spending-{yr}',
            'category': 'Analysis',
            'title': f"Inside {council_name}'s Departments: Where Every Pound Goes",
            'image': ARTICLE_IMAGES['budget'],
            'brief': f"Breakdown of spending by department/service area. "
                     f"Top departments: {', '.join(d[0] + f' (£{d[1]/1e6:.1f}M)' for d in top_depts[:5])}. "
                     f"Identify which services consume the most resources.",
            'data_context': {
                'total_spend': total,
                'departments': [(d[0], round(d[1], 2)) for d in top_depts[:10]],
                'financial_years': years,
            },
        })

    # 3. DOGE findings deep dive (annual)
    if findings and f'doge-findings-{yr}' not in existing_ids:
        finding_summary = _summarise_findings(findings)
        if finding_summary:
            topics.append({
                'id': f'doge-findings-{yr}',
                'category': 'Investigation',
                'title': f"Red Flags in {council_name}'s Spending: What DOGE Analysis Found",
                'image': ARTICLE_IMAGES['investigation'],
                'brief': f"Automated analysis of {council_name}'s spending data flagged: {'; '.join(finding_summary[:5])}. "
                         f"Deep dive into duplicates, split payments, round-number anomalies, and Benford's Law results.",
                'data_context': {
                    'findings': findings,
                    'total_spend': total,
                    'transaction_count': stats['transaction_count'],
                    'financial_years': years,
                },
            })

    # 4. Spending trends (annual — needs 2+ years)
    if len(years) >= 2 and f'spending-trends-{yr}' not in existing_ids:
        topics.append({
            'id': f'spending-trends-{yr}',
            'category': 'Analysis',
            'title': f"{council_name} Spending: Year-by-Year Trends and What They Reveal",
            'image': ARTICLE_IMAGES['spending'],
            'brief': f"Spending data covers {years[0]} to {years[-1]}. "
                     f"Track how spending has changed, which departments grew or shrank, "
                     f"and what the trend line says about the council's financial trajectory.",
            'data_context': {
                'financial_years': years,
                'year_totals': year_totals,
                'total_spend': total,
                'transaction_count': stats['transaction_count'],
            },
        })

    # 5. Micro-spending / long tail (annual)
    if stats['unique_suppliers'] > 100 and f'micro-spending-{yr}' not in existing_ids:
        size_dist = stats.get('supplier_size_distribution', {})
        topics.append({
            'id': f'micro-spending-{yr}',
            'category': 'Analysis',
            'title': f"The Long Tail: {council_name}'s Hundreds of Small Suppliers",
            'image': ARTICLE_IMAGES['services'],
            'brief': f"{council_name} pays {stats['unique_suppliers']:,} different suppliers. "
                     f"Many receive only small amounts. Analyse the procurement overhead, "
                     f"whether consolidation would save money, and contract fragmentation.",
            'data_context': {
                'unique_suppliers': stats['unique_suppliers'],
                'total_spend': total,
                'transaction_count': stats['transaction_count'],
                'financial_years': years,
                'supplier_count_by_range': size_dist,
            },
        })

    # ── QUARTERLY topics (4 per year per council) ──

    # 6. Top single supplier deep dive (quarterly, rotates supplier)
    if top_suppliers:
        # Pick supplier based on quarter (Q1=0, Q2=1, Q3=2, Q4=3)
        q_idx = (datetime.now().month - 1) // 3
        if q_idx < len(top_suppliers):
            s_name, s_amount = top_suppliers[q_idx]
            topic_id = f'supplier-profile-{qk}'
            if topic_id not in existing_ids and s_amount > 50000:
                topics.append({
                    'id': topic_id,
                    'category': 'Investigation',
                    'title': f"Supplier Spotlight: {s_name} and {council_name} Council",
                    'image': ARTICLE_IMAGES['supplier'],
                    'brief': f"{s_name} received £{s_amount/1e6:.1f}M from {council_name}. "
                             f"Examine the relationship, payment patterns, and value for money.",
                    'data_context': {
                        'focus_supplier': s_name,
                        'focus_amount': s_amount,
                        'focus_pct': (s_amount / total * 100) if total > 0 else 0,
                        'total_spend': total,
                        'transaction_count': stats['transaction_count'],
                        'top_suppliers': [(s[0], round(s[1], 2)) for s in top_suppliers[:10]],
                        'financial_years': years,
                    },
                })

    # 7. Department deep dive (quarterly, rotates department)
    if top_depts:
        q_idx = (datetime.now().month - 1) // 3
        # Skip empty/blank department names
        named_depts = [(n, a) for n, a in top_depts if n and n.strip()]
        if q_idx < len(named_depts):
            d_name, d_amount = named_depts[q_idx]
            topic_id = f'department-profile-{qk}'
            if topic_id not in existing_ids and d_amount > 100000:
                topics.append({
                    'id': topic_id,
                    'category': 'Analysis',
                    'title': f"Department Focus: {d_name} at {council_name}",
                    'image': ARTICLE_IMAGES['governance'],
                    'brief': f"The {d_name} department spent £{d_amount/1e6:.1f}M. "
                             f"Who are its main suppliers? How does spending break down?",
                    'data_context': {
                        'focus_department': d_name,
                        'focus_amount': d_amount,
                        'focus_pct': (d_amount / total * 100) if total > 0 else 0,
                        'total_spend': total,
                        'departments': [(d[0], round(d[1], 2)) for d in top_depts[:10]],
                        'financial_years': years,
                    },
                })

    # 8. Payment types analysis (quarterly)
    top_types = stats.get('top_payment_types', [])
    if top_types and f'payment-types-{qk}' not in existing_ids:
        topics.append({
            'id': f'payment-types-{qk}',
            'category': 'Analysis',
            'title': f"How {council_name} Pays: Payment Types and Methods",
            'image': ARTICLE_IMAGES['spending'],
            'brief': f"Analysis of {council_name}'s payment methods. "
                     f"Types: {', '.join(t[0] + f' (£{t[1]/1e6:.1f}M)' for t in top_types[:5])}.",
            'data_context': {
                'total_spend': total,
                'payment_types': [(t[0], round(t[1], 2)) for t in top_types[:10]],
                'transaction_count': stats['transaction_count'],
                'financial_years': years,
            },
        })

    # 9. Round numbers / split payments (quarterly — from DOGE findings)
    if isinstance(doge_raw, dict):
        splits = doge_raw.get('split_payments', {})
        if splits and f'split-payments-{qk}' not in existing_ids:
            count = splits.get('count', splits.get('items_count', 0))
            amount = splits.get('total_flagged_amount', splits.get('total_amount', 0))
            if count > 0:
                topics.append({
                    'id': f'split-payments-{qk}',
                    'category': 'Investigation',
                    'title': f"Split Payment Detection: Potential Threshold Evasion at {council_name}",
                    'image': ARTICLE_IMAGES['investigation'],
                    'brief': f"DOGE analysis detected {count} potential split payment patterns "
                             f"totalling £{amount/1e6:.1f}M. Are suppliers splitting invoices to stay below approval thresholds?",
                    'data_context': {
                        'split_count': count,
                        'split_amount': amount,
                        'total_spend': total,
                        'transaction_count': stats['transaction_count'],
                        'financial_years': years,
                    },
                })

    # 10. Duplicate payments (quarterly — from DOGE findings)
    if isinstance(doge_raw, dict):
        dupes = doge_raw.get('duplicates', {})
        if dupes and f'duplicate-payments-{qk}' not in existing_ids:
            count = dupes.get('count', dupes.get('items_count', 0))
            amount = dupes.get('total_flagged_amount', dupes.get('total_amount', 0))
            if count > 0:
                topics.append({
                    'id': f'duplicate-payments-{qk}',
                    'category': 'Investigation',
                    'title': f"Duplicate Payment Alert: {count} Potential Double-Pays at {council_name}",
                    'image': ARTICLE_IMAGES['investigation'],
                    'brief': f"{count} potential duplicate payments detected totalling £{amount/1e6:.1f}M. "
                             f"These are transactions with matching supplier, amount, and date patterns.",
                    'data_context': {
                        'duplicate_count': count,
                        'duplicate_amount': amount,
                        'total_spend': total,
                        'transaction_count': stats['transaction_count'],
                        'financial_years': years,
                    },
                })

    # 11. Benford's Law analysis (quarterly)
    if isinstance(doge_raw, dict):
        benfords = doge_raw.get('benfords_advanced', doge_raw.get('benfords', {}))
        if benfords and f'benfords-law-{qk}' not in existing_ids:
            mad = benfords.get('mad_statistic', benfords.get('mad', 0))
            if mad:
                conformity = 'close conformity' if mad < 0.006 else 'acceptable' if mad < 0.012 else 'marginal' if mad < 0.015 else 'non-conforming'
                topics.append({
                    'id': f'benfords-law-{qk}',
                    'category': 'Investigation',
                    'title': f"Forensic Screening: Benford's Law Applied to {council_name}'s Payments",
                    'image': ARTICLE_IMAGES['investigation'],
                    'brief': f"Benford's Law analysis of {council_name}'s spending shows MAD of {mad:.4f} ({conformity}). "
                             f"This forensic technique flags statistically unusual digit distributions.",
                    'data_context': {
                        'benfords_mad': mad,
                        'benfords_conformity': conformity,
                        'total_spend': total,
                        'transaction_count': stats['transaction_count'],
                        'financial_years': years,
                    },
                })

    # 12. Supplier risk intelligence (quarterly)
    if isinstance(doge_raw, dict):
        risk = doge_raw.get('supplier_risk', {})
        top_risk = risk.get('top_20_risk', [])
        if top_risk and f'supplier-risk-{qk}' not in existing_ids:
            topics.append({
                'id': f'supplier-risk-{qk}',
                'category': 'Investigation',
                'title': f"Supplier Risk Scores: Who Poses the Highest Risk at {council_name}?",
                'image': ARTICLE_IMAGES['supplier'],
                'brief': f"Composite risk scoring across {council_name}'s suppliers. "
                         f"Top risk: {top_risk[0].get('supplier', 'Unknown')} (score: {top_risk[0].get('composite_score', 0):.0f}).",
                'data_context': {
                    'top_risk_suppliers': [(r.get('supplier', ''), r.get('composite_score', 0), r.get('total_spend', 0)) for r in top_risk[:10]],
                    'total_spend': total,
                    'unique_suppliers': stats['unique_suppliers'],
                    'financial_years': years,
                },
            })

    # ── HALF-YEARLY topics (2 per year per council) ──

    # 13. Transparency scorecard (half-yearly)
    if f'transparency-scorecard-{hk}' not in existing_ids:
        topics.append({
            'id': f'transparency-scorecard-{hk}',
            'category': 'Governance',
            'title': f"{council_name} Transparency Scorecard: How Open Is Your Council?",
            'image': ARTICLE_IMAGES['governance'],
            'brief': f"{council_name} publishes {stats['transaction_count']:,} transactions across {len(years)} financial years. "
                     f"How does this compare to transparency obligations? Are gaps being filled?",
            'data_context': {
                'total_spend': total,
                'transaction_count': stats['transaction_count'],
                'unique_suppliers': stats['unique_suppliers'],
                'financial_years': years,
                'year_totals': year_totals,
            },
        })

    # 14. Value for money (half-yearly)
    if top_suppliers and f'value-for-money-{hk}' not in existing_ids:
        top5_total = sum(s[1] for s in top_suppliers[:5])
        topics.append({
            'id': f'value-for-money-{hk}',
            'category': 'Analysis',
            'title': f"Value for Money: Are {council_name}'s Biggest Contracts Delivering?",
            'image': ARTICLE_IMAGES['procurement'],
            'brief': f"The top 5 suppliers consume £{top5_total/1e6:.1f}M. "
                     f"Analyse whether high-value contracts represent good value for taxpayers.",
            'data_context': {
                'total_spend': total,
                'top_suppliers': [(s[0], round(s[1], 2)) for s in top_suppliers[:10]],
                'unique_suppliers': stats['unique_suppliers'],
                'financial_years': years,
            },
        })

    # 15. New vs returning suppliers (half-yearly)
    if f'supplier-churn-{hk}' not in existing_ids and len(year_totals) >= 2:
        topics.append({
            'id': f'supplier-churn-{hk}',
            'category': 'Analysis',
            'title': f"New Blood or Old Guard? Supplier Churn at {council_name}",
            'image': ARTICLE_IMAGES['supplier'],
            'brief': f"With {stats['unique_suppliers']:,} suppliers over {len(years)} years, "
                     f"how many are long-term partners vs one-time vendors? Analyse retention patterns.",
            'data_context': {
                'unique_suppliers': stats['unique_suppliers'],
                'total_spend': total,
                'transaction_count': stats['transaction_count'],
                'financial_years': years,
                'year_totals': year_totals,
            },
        })

    # 16. Budget vs actual (half-yearly — needs budgets_govuk)
    if budgets_govuk and f'budget-vs-actual-{hk}' not in existing_ids:
        topics.append({
            'id': f'budget-vs-actual-{hk}',
            'category': 'Analysis',
            'title': f"Budget vs Reality: Where {council_name} Over- and Under-Spends",
            'image': ARTICLE_IMAGES['budget'],
            'brief': f"Compare {council_name}'s GOV.UK published budget data against actual spending patterns. "
                     f"Total spending analysed: £{total/1e6:.1f}M.",
            'data_context': {
                'total_spend': total,
                'departments': [(d[0], round(d[1], 2)) for d in top_depts[:10]],
                'financial_years': years,
            },
        })

    # 17. Procurement intelligence (half-yearly — from DOGE)
    if isinstance(doge_raw, dict):
        proc = doge_raw.get('procurement_intelligence', {})
        if proc and f'procurement-intel-{hk}' not in existing_ids:
            topics.append({
                'id': f'procurement-intel-{hk}',
                'category': 'Investigation',
                'title': f"Procurement Intelligence: Contract Patterns at {council_name}",
                'image': ARTICLE_IMAGES['procurement'],
                'brief': f"Analysis of procurement patterns including price escalation, "
                         f"cross-department splitting, and contract concentration.",
                'data_context': {
                    'procurement_data': {k: v for k, v in proc.items() if k in ('price_escalation', 'cross_dept_splitting', 'maverick_spend')},
                    'total_spend': total,
                    'transaction_count': stats['transaction_count'],
                    'financial_years': years,
                },
            })

    # 18. Temporal patterns (half-yearly — from DOGE)
    if isinstance(doge_raw, dict):
        temporal = doge_raw.get('temporal_intelligence', {})
        if temporal and f'temporal-patterns-{hk}' not in existing_ids:
            topics.append({
                'id': f'temporal-patterns-{hk}',
                'category': 'Analysis',
                'title': f"When Does {council_name} Spend? Timing Patterns Revealed",
                'image': ARTICLE_IMAGES['spending'],
                'brief': f"Analysis of spending timing patterns — year-end spikes, "
                         f"day-of-week distributions, and seasonal variations.",
                'data_context': {
                    'temporal_data': {k: v for k, v in temporal.items() if k in ('year_end_acceleration', 'change_points', 'spc_charts')},
                    'total_spend': total,
                    'transaction_count': stats['transaction_count'],
                    'financial_years': years,
                },
            })

    # 19. Million-pound club (half-yearly — suppliers over £1M)
    big_suppliers = [(s[0], s[1]) for s in top_suppliers if s[1] >= 1_000_000]
    if big_suppliers and f'million-pound-club-{hk}' not in existing_ids:
        topics.append({
            'id': f'million-pound-club-{hk}',
            'category': 'Investigation',
            'title': f"The Million-Pound Club: {council_name}'s Biggest Payees",
            'image': ARTICLE_IMAGES['supplier'],
            'brief': f"{len(big_suppliers)} suppliers received over £1M each from {council_name}. "
                     f"Combined: £{sum(s[1] for s in big_suppliers)/1e6:.1f}M. Who are they and what do they provide?",
            'data_context': {
                'million_suppliers': [(s[0], round(s[1], 2)) for s in big_suppliers],
                'million_count': len(big_suppliers),
                'million_total': sum(s[1] for s in big_suppliers),
                'total_spend': total,
                'unique_suppliers': stats['unique_suppliers'],
                'financial_years': years,
            },
        })

    # 20. Citizen guide / how to read spending data (annual — evergreen)
    if f'citizen-guide-{yr}' not in existing_ids:
        topics.append({
            'id': f'citizen-guide-{yr}',
            'category': 'Guide',
            'title': f"Your Money, Your Right: How to Read {council_name}'s Spending Data",
            'image': ARTICLE_IMAGES['governance'],
            'brief': f"{council_name} publishes {stats['transaction_count']:,} transactions totalling £{total/1e6:.1f}M. "
                     f"This guide explains how to interpret the data, spot issues, and hold the council accountable.",
            'data_context': {
                'total_spend': total,
                'transaction_count': stats['transaction_count'],
                'unique_suppliers': stats['unique_suppliers'],
                'financial_years': years,
            },
        })

    return topics


def _summarise_findings(findings):
    """Extract key findings summary for article briefs."""
    summary = []
    if isinstance(findings, dict):
        for key, val in findings.items():
            if isinstance(val, dict) and 'total_flagged_amount' in val:
                summary.append(f"{key}: £{val['total_flagged_amount']/1e6:.1f}M flagged")
            elif isinstance(val, dict) and 'count' in val:
                summary.append(f"{key}: {val['count']} issues")
    elif isinstance(findings, list):
        for item in findings[:5]:
            if isinstance(item, dict):
                title = item.get('title', item.get('type', 'Finding'))
                amount = item.get('total_amount', item.get('amount', 0))
                if amount:
                    summary.append(f"{title}: £{amount/1e6:.1f}M")
                else:
                    count = item.get('count', item.get('items_count', 0))
                    summary.append(f"{title}: {count} issues")
    return summary


# ── Article Generation ───────────────────────────────────────────────

def _fmt_gbp(amount):
    """Format pounds: £1,234 or £1.2M or £456K."""
    if amount >= 1_000_000:
        return f'£{amount/1e6:.1f}M'
    if amount >= 10_000:
        return f'£{amount/1e3:.0f}K'
    return f'£{amount:,.0f}'


def _pct(part, whole):
    """Calculate percentage, return formatted string."""
    if not whole:
        return '0.0%'
    return f'{part / whole * 100:.1f}%'


def build_enriched_data_brief(topic, council_id, council_config):
    """
    Build a fully pre-computed data brief for the LLM.
    Every number, percentage, and ranking is calculated here so the LLM
    only needs to write prose around the facts — no maths required.
    """
    council_name = council_config.get('council_name', council_id.title())
    council_full = council_config.get('council_full_name', f'{council_name} Borough Council')
    tier = council_config.get('council_tier', 'district')
    ctx = topic.get('data_context', {})
    total = ctx.get('total_spend', 0)
    txn_count = ctx.get('transaction_count', 0)
    years = ctx.get('financial_years', [])

    lines = []
    lines.append(f'COUNCIL: {council_full}')
    lines.append(f'TYPE: {tier.title()} council in Lancashire, England')
    lines.append(f'DATA SOURCE: Published spending records (Local Government Transparency Code)')
    if years:
        lines.append(f'DATA COVERAGE: {years[0]} to {years[-1]} ({len(years)} financial years)')
    lines.append(f'TOTAL SPEND ANALYSED: {_fmt_gbp(total)} across {txn_count:,} transactions')
    unique_sup = ctx.get('unique_suppliers')
    lines.append(f'UNIQUE SUPPLIERS: {unique_sup:,}' if isinstance(unique_sup, (int, float)) else f'UNIQUE SUPPLIERS: N/A')
    lines.append('')

    # Pre-compute supplier analysis
    top_suppliers = ctx.get('top_suppliers', [])
    if top_suppliers:
        lines.append('TOP SUPPLIERS (pre-calculated):')
        lines.append(f'{"Rank":<6} {"Supplier":<45} {"Amount":<15} {"% of Total"}')
        lines.append('-' * 80)
        for i, (name, amount) in enumerate(top_suppliers[:10], 1):
            pct = _pct(amount, total)
            lines.append(f'{i:<6} {name:<45} {_fmt_gbp(amount):<15} {pct}')
        if top_suppliers:
            top5_total = sum(s[1] for s in top_suppliers[:5])
            top10_total = sum(s[1] for s in top_suppliers[:10])
            lines.append('')
            lines.append(f'TOP 5 SUPPLIERS COMBINED: {_fmt_gbp(top5_total)} = {_pct(top5_total, total)} of total spend')
            lines.append(f'TOP 10 SUPPLIERS COMBINED: {_fmt_gbp(top10_total)} = {_pct(top10_total, total)} of total spend')
            remaining = (ctx.get('unique_suppliers') or 0) - 10
            lines.append(f'REMAINING {remaining:,} SUPPLIERS: {_fmt_gbp(total - top10_total)} = {_pct(total - top10_total, total)}')
        lines.append('')

    # Focus supplier (for supplier profile articles)
    focus_supplier = ctx.get('focus_supplier')
    if focus_supplier:
        lines.append(f'FOCUS SUPPLIER: {focus_supplier}')
        lines.append(f'FOCUS SUPPLIER SPEND: {_fmt_gbp(ctx.get("focus_amount", 0))}')
        lines.append(f'FOCUS SUPPLIER % OF TOTAL: {ctx.get("focus_pct", 0):.1f}%')
        lines.append('')

    # Focus department
    focus_dept = ctx.get('focus_department')
    if focus_dept:
        lines.append(f'FOCUS DEPARTMENT: {focus_dept}')
        lines.append(f'FOCUS DEPARTMENT SPEND: {_fmt_gbp(ctx.get("focus_amount", 0))}')
        lines.append(f'FOCUS DEPARTMENT % OF TOTAL: {ctx.get("focus_pct", 0):.1f}%')
        lines.append('')

    # Pre-compute department analysis
    departments = ctx.get('departments', [])
    if departments:
        lines.append('DEPARTMENT/SERVICE SPENDING (pre-calculated):')
        lines.append(f'{"Rank":<6} {"Department":<45} {"Amount":<15} {"% of Total"}')
        lines.append('-' * 80)
        for i, (name, amount) in enumerate(departments[:10], 1):
            lines.append(f'{i:<6} {name:<45} {_fmt_gbp(amount):<15} {_pct(amount, total)}')
        lines.append('')

    # Payment types
    payment_types = ctx.get('payment_types', [])
    if payment_types:
        lines.append('PAYMENT TYPES (pre-calculated):')
        for name, amount in payment_types[:10]:
            lines.append(f'  {name}: {_fmt_gbp(amount)} ({_pct(amount, total)})')
        lines.append('')

    # Pre-compute year-over-year trends
    year_totals = ctx.get('year_totals', {})
    if year_totals and len(year_totals) >= 2:
        lines.append('YEAR-OVER-YEAR SPENDING (pre-calculated):')
        sorted_years = sorted(year_totals.items())
        for yr_val, amt in sorted_years:
            lines.append(f'  {yr_val}: {_fmt_gbp(amt)}')
        if len(sorted_years) >= 2:
            first_yr, first_amt = sorted_years[0]
            last_yr, last_amt = sorted_years[-1]
            change = last_amt - first_amt
            change_pct = _pct(abs(change), first_amt) if first_amt else 'N/A'
            direction = 'increased' if change > 0 else 'decreased'
            lines.append(f'OVERALL CHANGE: Spending {direction} by {_fmt_gbp(abs(change))} ({change_pct}) from {first_yr} to {last_yr}')
        for i in range(1, len(sorted_years)):
            prev_yr, prev_amt = sorted_years[i - 1]
            curr_yr, curr_amt = sorted_years[i]
            change = curr_amt - prev_amt
            direction = '+' if change > 0 else ''
            if prev_amt:
                lines.append(f'  {prev_yr} to {curr_yr}: {direction}{_fmt_gbp(change)} ({direction}{change/prev_amt*100:.1f}%)')
            else:
                lines.append(f'  {prev_yr} to {curr_yr}: {_fmt_gbp(curr_amt)}')
        lines.append('')

    # DOGE findings summary
    findings_data = ctx.get('findings')
    if findings_data:
        lines.append('DOGE ANALYSIS FINDINGS (pre-calculated):')
        if isinstance(findings_data, list):
            for item in findings_data[:8]:
                if isinstance(item, dict):
                    title = item.get('title', item.get('type', 'Finding'))
                    amount = item.get('total_amount', item.get('amount', 0))
                    count = item.get('count', item.get('items_count', 0))
                    severity = item.get('severity', 'info')
                    if amount:
                        lines.append(f'  - {title}: {_fmt_gbp(amount)} flagged ({count} items) [severity: {severity}]')
                    elif count:
                        lines.append(f'  - {title}: {count} issues [severity: {severity}]')
        elif isinstance(findings_data, dict):
            for key, val in findings_data.items():
                if isinstance(val, dict):
                    amount = val.get('total_flagged_amount', val.get('total_amount', 0))
                    count = val.get('count', val.get('items_count', 0))
                    if amount:
                        lines.append(f'  - {key}: {_fmt_gbp(amount)} flagged ({count} items)')
                    elif count:
                        lines.append(f'  - {key}: {count} issues')
        lines.append('')

    # Supplier size distribution
    size_ranges = ctx.get('supplier_count_by_range', {})
    if size_ranges:
        lines.append('SUPPLIER SIZE DISTRIBUTION (pre-calculated):')
        for label, count in size_ranges.items():
            lines.append(f'  {label}: {count} suppliers')
        lines.append('')

    # Million-pound club
    million_suppliers = ctx.get('million_suppliers', [])
    if million_suppliers:
        lines.append(f'MILLION-POUND SUPPLIERS ({len(million_suppliers)} total):')
        for name, amount in million_suppliers:
            lines.append(f'  {name}: {_fmt_gbp(amount)}')
        lines.append(f'  COMBINED: {_fmt_gbp(ctx.get("million_total", 0))}')
        lines.append('')

    # Risk data
    risk_suppliers = ctx.get('top_risk_suppliers', [])
    if risk_suppliers:
        lines.append('TOP RISK SUPPLIERS (pre-calculated):')
        for name, score, spend in risk_suppliers[:10]:
            lines.append(f'  {name}: Risk {score:.0f}, Spend {_fmt_gbp(spend)}')
        lines.append('')

    # Benford's data
    if ctx.get('benfords_mad'):
        lines.append(f"BENFORD'S LAW: MAD = {ctx['benfords_mad']:.4f} ({ctx.get('benfords_conformity', 'unknown')})")
        lines.append('')

    # Split / duplicate payment data
    if ctx.get('split_count'):
        lines.append(f'SPLIT PAYMENTS: {ctx["split_count"]} detected, {_fmt_gbp(ctx.get("split_amount", 0))} total')
        lines.append('')
    if ctx.get('duplicate_count'):
        lines.append(f'DUPLICATE PAYMENTS: {ctx["duplicate_count"]} detected, {_fmt_gbp(ctx.get("duplicate_amount", 0))} total')
        lines.append('')

    return '\n'.join(lines)


def generate_article(topic, council_id, council_config, budget):
    """Generate article using LLM with fact-grounding and enriched prompts."""
    if not HAS_LLM:
        log.error('LLM router not available — cannot generate articles')
        return None

    council_name = council_config.get('council_name', council_id.title())
    council_full = council_config.get('council_full_name', f'{council_name} Borough Council')
    years = topic.get('data_context', {}).get('financial_years', [])
    date_range = f'{years[0]} to {years[-1]}' if years else 'available period'

    # Build the enriched, pre-computed data brief
    data_brief = build_enriched_data_brief(topic, council_id, council_config)

    user_prompt = f"""Write an article with this exact title: "{topic['title']}"

=== DATA BRIEF (use ONLY these facts and figures) ===
{data_brief}
=== END DATA BRIEF ===

ARTICLE TOPIC SUMMARY:
{topic['brief']}

INSTRUCTIONS:
1. Write the article in HTML format (800-1200 words)
2. Follow this EXACT structure:

   a) Start with: <h3>Key Findings</h3> then <ul> with 3-5 <li> bullet points.
      Each bullet must cite a specific £ figure or percentage from the DATA BRIEF above.

   b) Write 2-4 body sections, each with an <h2> heading and 2-3 <p> paragraphs.
      Use <strong> tags around key £ figures and supplier names.
      If comparing 3+ items, use an HTML <table> with <thead> and <tbody>.

   c) Add: <h2>What You Can Do</h2> then <ul> with 3-5 citizen actions:
      - Submit a Freedom of Information request to {council_full} about [specific topic from the article]
      - Attend council committee meetings (they are open to the public)
      - Check the council's published contracts register
      - Write to your local councillor about [specific concern from the article]
      - Visit aidoge.co.uk to explore the full spending data

   d) End with: <em>This article is based on {council_full}'s published spending data covering {date_range}. All figures are drawn directly from transactions published under the Local Government Transparency Code. Analysis by AI DOGE.</em>

3. CRITICAL: Copy £ figures and percentages EXACTLY from the DATA BRIEF. Do not calculate, estimate or round.
4. CRITICAL: Copy supplier names EXACTLY as they appear in the DATA BRIEF (case-sensitive).
5. Use UK English spelling (organisation, analyse, programme, colour, defence).
6. Be factual and measured. Present context. Do not sensationalise.
7. Do NOT use <h1>, <div>, <span>, or class attributes.

Write the HTML article now:"""

    log.info(f'Generating article: {topic["id"]} for {council_id}')

    try:
        result = generate(user_prompt, system_prompt=SYSTEM_PROMPT, max_tokens=4000, timeout=180)
        if isinstance(result, tuple):
            text, provider = result
            log.info(f'Generated via {provider} ({len(text)} chars)')
        else:
            text = result
            log.info(f'Generated ({len(text)} chars)')

        # Estimate tokens used (prompt + response)
        prompt_tokens = len(user_prompt.split()) + len(SYSTEM_PROMPT.split())
        response_tokens = len(text.split()) if text else 0
        estimated_tokens = int((prompt_tokens + response_tokens) * 1.3)  # 1.3x for tokenisation overhead
        record_usage(budget, estimated_tokens)
        log.info(f'Estimated tokens: {estimated_tokens:,} (budget: {budget["tokens_used"]:,} used today)')

        return text
    except Exception as e:
        log.error(f'Generation failed: {e}')
        return None


def clean_llm_output(content):
    """Clean up common LLM output artefacts before verification."""
    if not content:
        return content
    text = content.strip()
    # Strip markdown code fences (```html ... ``` or ``` ... ```)
    text = re.sub(r'^```(?:html)?\s*\n?', '', text)
    text = re.sub(r'\n?```\s*$', '', text)
    # Strip any leading/trailing whitespace or newlines
    text = text.strip()
    # Remove any preamble before the first HTML tag (LLMs sometimes add "Here is the article:")
    first_tag = re.search(r'<(?:h[23]|p|ul)', text, re.IGNORECASE)
    if first_tag and first_tag.start() > 0:
        preamble = text[:first_tag.start()].strip()
        # Only strip if preamble is short and looks like intro text
        if len(preamble) < 200 and '<' not in preamble:
            text = text[first_tag.start():]
    return text


def verify_article(content, data_context):
    """Verify article quality, structure, AND numerical accuracy. Returns (ok, warnings, cleaned_content)."""
    if not content:
        return False, ['No content generated'], content

    # Clean LLM output artefacts first
    content = clean_llm_output(content)
    warnings = []

    # Check article length
    text_only = re.sub(r'<[^>]+>', '', content)
    word_count = len(text_only.split())
    if word_count < 400:
        warnings.append(f'Article too short: {word_count} words (minimum 400)')
    if word_count > 2000:
        warnings.append(f'Article too long: {word_count} words (maximum 2000)')

    # Check for required sections
    if 'Key Findings' not in content:
        warnings.append('Missing "Key Findings" section')
    if 'What You Can Do' not in content:
        warnings.append('Missing "What You Can Do" section')
    if 'Methodology' not in content.lower() and '<em>' not in content:
        warnings.append('Missing methodology note')

    # Check for <h1> tags (should not be present)
    if '<h1>' in content or '<h1 ' in content:
        warnings.append('Contains <h1> tags (not allowed)')

    # Check for forbidden tags
    for tag in ['<div', '<span', '<script', '<style']:
        if tag in content.lower():
            warnings.append(f'Contains forbidden {tag}> tag')

    # ── Numerical fact verification ──
    # Extract all £ figures from the article
    article_amounts = set()
    for match in re.finditer(r'£([\d,.]+)\s*(M|K|B)?', content):
        num_str = match.group(1).replace(',', '')
        try:
            amount = float(num_str)
            suffix = match.group(2)
            if suffix == 'M':
                amount *= 1_000_000
            elif suffix == 'K':
                amount *= 1_000
            elif suffix == 'B':
                amount *= 1_000_000_000
            article_amounts.add(amount)
        except ValueError:
            pass

    # Build set of valid amounts from data context
    valid_amounts = set()
    total = data_context.get('total_spend', 0)
    if total:
        valid_amounts.add(total)
        # Add common representations
        valid_amounts.add(round(total / 1e6, 1) * 1e6)  # £X.YM rounded
        valid_amounts.add(round(total / 1e3) * 1e3)  # £XYZK rounded

    for key in ('top_suppliers', 'departments', 'million_suppliers', 'payment_types'):
        for item in data_context.get(key, []):
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                amt = float(item[1])
                valid_amounts.add(amt)
                valid_amounts.add(round(amt / 1e6, 1) * 1e6)
                valid_amounts.add(round(amt / 1e3) * 1e3)

    for key in ('focus_amount', 'split_amount', 'duplicate_amount', 'million_total'):
        if data_context.get(key):
            amt = float(data_context[key])
            valid_amounts.add(amt)
            valid_amounts.add(round(amt / 1e6, 1) * 1e6)

    # Check each article amount against valid amounts (with 5% tolerance)
    hallucinated = 0
    for article_amt in article_amounts:
        if article_amt < 100:  # Skip small numbers (likely percentages or counts)
            continue
        found_match = False
        for valid_amt in valid_amounts:
            if valid_amt == 0:
                continue
            ratio = article_amt / valid_amt if valid_amt else 0
            if 0.95 <= ratio <= 1.05:  # 5% tolerance
                found_match = True
                break
        if not found_match:
            hallucinated += 1

    if hallucinated > 0:
        warnings.append(f'Possible hallucinated figures: {hallucinated} £ amounts not found in source data')

    return len(warnings) == 0, warnings, content


def auto_tag(content, topic):
    """Generate tags based on article content and topic metadata."""
    tags = set()
    text = re.sub(r'<[^>]+>', '', content).lower()

    # Category-based tags
    category = topic.get('category', '').lower()
    if category == 'investigation':
        tags.add('investigation')
    elif category == 'analysis':
        tags.add('analysis')
    elif category == 'governance':
        tags.add('governance')
    elif category == 'guide':
        tags.add('guide')

    # Content-based tags
    tag_keywords = {
        'supplier': ['supplier', 'contract', 'vendor', 'outsourc'],
        'spending': ['spend', 'payment', 'expenditure', 'transaction'],
        'transparency': ['transparency', 'foi', 'freedom of information', 'open data'],
        'value-for-money': ['value for money', 'efficiency', 'cost-effective'],
        'risk': ['risk', 'red flag', 'anomal', 'suspicious'],
        'benford': ["benford", 'forensic', 'statistical'],
        'duplicate': ['duplicate', 'double pay', 'double-pay'],
        'split-payment': ['split payment', 'threshold evasion', 'split invoice'],
        'procurement': ['procurement', 'tender', 'contract award'],
        'budget': ['budget', 'outturn', 'revenue', 'capital'],
    }
    for tag, keywords in tag_keywords.items():
        for kw in keywords:
            if kw in text:
                tags.add(tag)
                break

    return sorted(tags)[:5]  # Max 5 tags


def create_summary(content, max_len=200):
    """Extract a summary from article content."""
    text = re.sub(r'<[^>]+>', '', content)
    # Skip key findings, get first paragraph
    paragraphs = [p.strip() for p in text.split('\n') if len(p.strip()) > 50]
    # Skip the key findings bullets
    for p in paragraphs:
        if not p.startswith(('\u2022', '-', 'Key Findings')):
            if len(p) > max_len:
                return p[:max_len - 3] + '...'
            return p
    return text[:max_len]


# ── Output ───────────────────────────────────────────────────────────

def save_article(council_id, topic, content):
    """Save article JSON and update articles-index.json."""
    articles_dir = DATA_DIR / council_id / 'articles'
    articles_dir.mkdir(parents=True, exist_ok=True)

    # Save article file
    article_data = {
        'id': topic['id'],
        'content': content,
    }
    article_path = articles_dir / f"{topic['id']}.json"
    article_path.write_text(json.dumps(article_data, indent=2))
    log.info(f"Saved: {article_path}")

    # Update articles-index.json
    index_path = DATA_DIR / council_id / 'articles-index.json'
    wrapped = False
    if index_path.exists():
        raw = json.loads(index_path.read_text())
        if isinstance(raw, dict) and 'articles' in raw:
            index = raw['articles']
            wrapped = True
        else:
            index = raw if isinstance(raw, list) else []
    else:
        index = []

    # Remove existing entry with same ID (if re-generating)
    index = [a for a in index if isinstance(a, dict) and a.get('id') != topic['id']]

    # Add new entry at the top
    tags = auto_tag(content, topic)
    text_only = re.sub(r'<[^>]+>', '', content)
    word_count = len(text_only.split())

    index_entry = {
        'id': topic['id'],
        'date': datetime.now().strftime('%Y-%m-%d'),
        'category': topic.get('category', 'Analysis'),
        'title': topic['title'],
        'summary': create_summary(content),
        'image': topic.get('image', ARTICLE_IMAGES['default']),
        'author': f"{council_id.replace('_', ' ').title()} Council Transparency",
        'tags': tags,
        'wordCount': word_count,
        'readTime': max(1, round(word_count / 200)),
    }
    index.insert(0, index_entry)

    # Preserve original format (wrapped or plain)
    if wrapped:
        raw['articles'] = index
        index_path.write_text(json.dumps(raw, indent=2))
    else:
        index_path.write_text(json.dumps(index, indent=2))
    log.info(f"Updated index: {index_path} ({len(index)} articles, tags: {tags})")


# ── Git Commit & Push ────────────────────────────────────────────────

# Git repo on vps-main that maps to tompickup23/burnleycouncil
GIT_REPO = Path('/root/aidoge')

def git_commit_and_push(councils_updated):
    """Commit new articles and push to trigger GH Actions CI/CD deploy."""
    if not GIT_REPO.exists() or not (GIT_REPO / '.git').exists():
        log.warning(f'Git repo not found at {GIT_REPO} — skipping auto-commit')
        return False

    try:
        # Ensure git config is set (needed for automated commits)
        subprocess.run(
            ['git', 'config', 'user.name', 'AI DOGE Pipeline'],
            cwd=GIT_REPO, capture_output=True, check=True,
        )
        subprocess.run(
            ['git', 'config', 'user.email', 'pipeline@aidoge.co.uk'],
            cwd=GIT_REPO, capture_output=True, check=True,
        )

        # Pull latest to avoid push rejections (fast-forward only, safe)
        pull_result = subprocess.run(
            ['git', 'pull', '--ff-only', 'origin', 'main'],
            cwd=GIT_REPO, capture_output=True, timeout=60,
        )
        if pull_result.returncode != 0:
            log.warning('git pull --ff-only failed — will try push anyway')

        # Stage only article files and article indexes
        files_to_add = []
        for council_id in councils_updated:
            council_data = GIT_REPO / 'burnley-council' / 'data' / council_id
            articles_dir = council_data / 'articles'
            index_file = council_data / 'articles-index.json'

            if articles_dir.exists():
                files_to_add.append(str(articles_dir))
            if index_file.exists():
                files_to_add.append(str(index_file))

        if not files_to_add:
            log.info('No article files to commit')
            return False

        subprocess.run(
            ['git', 'add'] + files_to_add,
            cwd=GIT_REPO, capture_output=True, check=True,
        )

        # Check if there are actually staged changes
        result = subprocess.run(
            ['git', 'diff', '--cached', '--quiet'],
            cwd=GIT_REPO, capture_output=True,
        )
        if result.returncode == 0:
            log.info('No new article changes to commit')
            return False

        # Commit
        date_str = datetime.now().strftime('%Y-%m-%d')
        councils_str = ', '.join(sorted(councils_updated))
        commit_msg = f"Auto: Add articles for {councils_str} ({date_str})"

        subprocess.run(
            ['git', 'commit', '-m', commit_msg],
            cwd=GIT_REPO, capture_output=True, check=True,
        )
        log.info(f'Committed: {commit_msg}')

        # Push to trigger CI/CD deploy
        result = subprocess.run(
            ['git', 'push', 'origin', 'main'],
            cwd=GIT_REPO, capture_output=True, timeout=120,
        )
        if result.returncode == 0:
            log.info('Pushed to origin/main — CI/CD will deploy to GitHub Pages')
            return True
        else:
            stderr = result.stderr.decode() if result.stderr else ''
            log.error(f'Push failed: {stderr}')
            return False

    except subprocess.TimeoutExpired:
        log.error('Git push timed out after 120s')
        return False
    except subprocess.CalledProcessError as e:
        stderr = e.stderr.decode() if e.stderr else ''
        log.error(f'Git operation failed: {stderr}')
        return False
    except Exception as e:
        log.error(f'Git commit/push error: {e}')
        return False


# ── Main ─────────────────────────────────────────────────────────────

def process_council(council_id, dry_run=False, max_articles=2, budget=None, daily_limit=DEFAULT_DAILY_BUDGET):
    """Process a single council — discover topics and generate articles."""
    log.info(f'=== Processing {council_id} ===')

    config = load_config(council_id)
    stats = load_spending_stats(council_id)
    findings = load_doge_findings(council_id)
    doge_raw = load_doge_raw(council_id)
    budgets_govuk = load_budgets_govuk(council_id)
    existing = load_existing_articles(council_id)

    if not stats:
        log.warning(f'No spending data for {council_id} — skipping')
        return 0

    topics = discover_topics(council_id, stats, findings, doge_raw, budgets_govuk, existing)

    if not topics:
        log.info(f'No new topics for {council_id} (all discovered topics already published)')
        return 0

    log.info(f'Found {len(topics)} new topics for {council_id}:')
    for t in topics:
        log.info(f"  - {t['id']}: {t['title']}")

    if dry_run:
        return len(topics)

    generated = 0
    for topic in topics[:max_articles]:
        # Check budget before each article
        if budget is not None:
            remaining = daily_limit - budget['tokens_used']
            if remaining < ESTIMATED_TOKENS_PER_ARTICLE:
                log.info(f'Daily token budget exhausted — stopping ({budget["tokens_used"]:,} tokens used)')
                break

        content = generate_article(topic, council_id, config, budget)
        if not content:
            continue

        ok, warnings, content = verify_article(content, topic.get('data_context', {}))
        if warnings:
            for w in warnings:
                log.warning(f"  Verification: {w}")
        if not ok:
            # Check if it's a hard failure (too short, missing sections) vs soft (hallucination warning)
            hard_failures = [w for w in warnings if 'too short' in w or 'Missing' in w or 'forbidden' in w]
            if hard_failures:
                log.warning(f"  Article {topic['id']} REJECTED — hard verification failure: {hard_failures}")
                continue
            log.warning(f"  Article {topic['id']} passed with warnings — saving")

        save_article(council_id, topic, content)
        generated += 1

        # Rate limit between articles (10s to be safe with free tiers)
        log.info(f'Rate limiting: waiting 10s before next article...')
        time.sleep(10)

    return generated


def main():
    parser = argparse.ArgumentParser(description='AI DOGE Article Pipeline')
    parser.add_argument('--council', choices=COUNCILS, help='Process single council')
    parser.add_argument('--dry-run', action='store_true', help='Show topics without generating')
    parser.add_argument('--max-articles', type=int, default=3,
                        help='Max articles to generate per council per run (default: 3)')
    parser.add_argument('--no-push', action='store_true',
                        help='Generate articles but do not git commit/push')
    parser.add_argument('--budget', type=int, default=DEFAULT_DAILY_BUDGET,
                        help=f'Daily token budget (default: {DEFAULT_DAILY_BUDGET:,})')
    parser.add_argument('--no-lock', action='store_true',
                        help='Skip lockfile check (for local dev only)')
    args = parser.parse_args()

    log.info(f'=== Article Pipeline Starting ({datetime.now().strftime("%Y-%m-%d %H:%M")}) ===')
    log.info(f'Data dir: {DATA_DIR}')
    log.info(f'Max articles per council: {args.max_articles}')
    log.info(f'Daily token budget: {args.budget:,}')

    # Acquire lock (prevents concurrent runs with auto_pipeline, Clawdbot, etc.)
    lock = PipelineLock()
    if not args.no_lock and not args.dry_run:
        if not lock.acquire():
            log.info('Exiting — another pipeline is running')
            return
    else:
        log.info('Lock skipped (--no-lock or --dry-run)')

    try:
        # Check daily token budget
        budget_ok, budget = check_budget(args.budget)
        if not budget_ok and not args.dry_run:
            log.info('Daily token budget exhausted — exiting cleanly')
            return

        councils = [args.council] if args.council else COUNCILS
        total = 0
        councils_updated = []

        for council_id in councils:
            try:
                # Re-check budget before each council
                if not args.dry_run:
                    remaining = args.budget - budget['tokens_used']
                    if remaining < ESTIMATED_TOKENS_PER_ARTICLE:
                        log.info(f'Budget exhausted after {budget["articles_generated"]} articles — stopping')
                        break

                count = process_council(
                    council_id,
                    dry_run=args.dry_run,
                    max_articles=args.max_articles,
                    budget=budget,
                    daily_limit=args.budget,
                )
                total += count
                if count > 0:
                    councils_updated.append(council_id)
            except Exception as e:
                log.error(f'Error processing {council_id}: {e}')

        log.info(f'=== Pipeline Complete: {total} articles {"found" if args.dry_run else "generated"} ===')
        if not args.dry_run:
            log.info(f'Token usage today: {budget["tokens_used"]:,} / {args.budget:,} '
                     f'({budget["articles_generated"]} articles, {budget["calls"]} API calls)')

        # Auto-commit and push to trigger GH Pages deploy
        if total > 0 and not args.dry_run and not args.no_push:
            git_commit_and_push(councils_updated)

    finally:
        lock.release()


if __name__ == '__main__':
    main()
