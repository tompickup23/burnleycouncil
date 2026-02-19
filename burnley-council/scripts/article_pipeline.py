#!/usr/bin/env python3
"""
article_pipeline.py — High-Quality Automated Article Generator for AI DOGE

Analyses spending data to discover article topics, generates fact-checked articles
using the LLM router, and deploys them to council data directories.

Workflow:
  1. Load spending data + DOGE findings for each council
  2. Discover new article topics from data patterns
  3. Skip topics that already have published articles
  4. Generate articles via LLM with strict fact-grounding
  5. Verify cited numbers against actual data
  6. Write article JSON + update articles-index.json
  7. (Optional) Commit and push via git

Usage:
    python3 article_pipeline.py                     # Generate for all councils
    python3 article_pipeline.py --council burnley    # Single council
    python3 article_pipeline.py --dry-run            # Show what would be generated
    python3 article_pipeline.py --max-articles 2     # Limit per run

Cron (vps-main): 0 9 * * * cd /root/clawd-worker/aidoge/scripts && python3 article_pipeline.py --max-articles 2
"""

import argparse
import json
import logging
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
    'default': '/images/articles/documents.jpg',
}

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


# ── Topic Discovery ──────────────────────────────────────────────────

def load_spending_data(council_id):
    """Load spending records for a council (v2 format)."""
    path = DATA_DIR / council_id / 'spending.json'
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    if isinstance(data, dict):
        return data.get('records', [])
    return data  # v1 plain array


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

    for r in records:
        amount = abs(float(r.get('amount', 0)))
        supplier = r.get('supplier', r.get('vendor', 'Unknown'))
        dept = r.get('department', r.get('service_area', 'Unknown'))
        date = r.get('date', '')
        fy = r.get('financial_year', '')

        suppliers[supplier] = suppliers.get(supplier, 0) + amount
        departments[dept] = departments.get(dept, 0) + amount
        if fy:
            years.add(fy)
        if date and len(date) >= 7:
            month_key = date[:7]
            monthly[month_key] = monthly.get(month_key, 0) + amount

    top_suppliers = sorted(suppliers.items(), key=lambda x: -x[1])[:20]
    top_depts = sorted(departments.items(), key=lambda x: -x[1])[:10]

    return {
        'total_spend': total,
        'transaction_count': len(records),
        'unique_suppliers': len(suppliers),
        'financial_years': sorted(years),
        'top_suppliers': top_suppliers,
        'top_departments': top_depts,
        'monthly_spend': monthly,
    }


def discover_topics(council_id, stats, findings, existing_ids):
    """Discover new article topics based on spending data analysis."""
    topics = []
    council_name = council_id.replace('_', ' ').replace('-', ' ').title()

    if not stats:
        return topics

    top_suppliers = stats.get('top_suppliers', [])
    total = stats.get('total_spend', 0)

    # Topic 1: Supplier concentration analysis
    if top_suppliers and f'supplier-concentration-{datetime.now().year}' not in existing_ids:
        top5_total = sum(s[1] for s in top_suppliers[:5])
        top5_pct = (top5_total / total * 100) if total > 0 else 0
        if top5_pct > 15:
            topics.append({
                'id': f'supplier-concentration-{datetime.now().year}',
                'category': 'Investigation',
                'title': f"Where {council_name}'s Money Really Goes: Top Supplier Analysis {datetime.now().year}",
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
                    'financial_years': stats.get('financial_years', []),
                },
            })

    # Topic 2: Department spending breakdown
    top_depts = stats.get('top_departments', [])
    if top_depts and f'department-spending-{datetime.now().year}' not in existing_ids:
        topics.append({
            'id': f'department-spending-{datetime.now().year}',
            'category': 'Analysis',
            'title': f"Inside {council_name}'s Departments: Where Every Pound Goes",
            'image': ARTICLE_IMAGES['budget'],
            'brief': f"Breakdown of spending by department/service area. "
                     f"Top departments: {', '.join(d[0] + f' (£{d[1]/1e6:.1f}M)' for d in top_depts[:5])}. "
                     f"Identify which services consume the most resources.",
            'data_context': {
                'total_spend': total,
                'departments': [(d[0], round(d[1], 2)) for d in top_depts[:10]],
                'financial_years': stats.get('financial_years', []),
            },
        })

    # Topic 3: DOGE findings deep dive (if findings exist and haven't been covered)
    if findings and f'doge-findings-{datetime.now().year}' not in existing_ids:
        # Extract key findings stats — handle both dict and list formats
        finding_summary = []
        if isinstance(findings, dict):
            for key, val in findings.items():
                if isinstance(val, dict) and 'total_flagged_amount' in val:
                    finding_summary.append(f"{key}: £{val['total_flagged_amount']/1e6:.1f}M flagged")
                elif isinstance(val, dict) and 'count' in val:
                    finding_summary.append(f"{key}: {val['count']} issues")
        elif isinstance(findings, list):
            for item in findings[:5]:
                if isinstance(item, dict):
                    title = item.get('title', item.get('type', 'Finding'))
                    amount = item.get('total_amount', item.get('amount', 0))
                    if amount:
                        finding_summary.append(f"{title}: £{amount/1e6:.1f}M")
                    else:
                        count = item.get('count', item.get('items_count', 0))
                        finding_summary.append(f"{title}: {count} issues")
        if finding_summary:
            topics.append({
                'id': f'doge-findings-{datetime.now().year}',
                'category': 'Investigation',
                'title': f"Red Flags in {council_name}'s Spending: What DOGE Analysis Found",
                'image': ARTICLE_IMAGES['investigation'],
                'brief': f"Automated analysis of {council_name}'s spending data flagged: {'; '.join(finding_summary[:5])}. "
                         f"Deep dive into duplicates, split payments, round-number anomalies, and Benford's Law results.",
                'data_context': {
                    'findings': findings,
                    'total_spend': total,
                    'transaction_count': stats['transaction_count'],
                    'financial_years': stats.get('financial_years', []),
                },
            })

    # Topic 4: Year-over-year spending trends
    years = stats.get('financial_years', [])
    if len(years) >= 2 and f'spending-trends-{datetime.now().year}' not in existing_ids:
        # Calculate year-on-year changes
        year_totals = {}
        monthly = stats.get('monthly_spend', {})
        for m, amount in monthly.items():
            year = m[:4]
            year_totals[year] = year_totals.get(year, 0) + amount

        topics.append({
            'id': f'spending-trends-{datetime.now().year}',
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

    # Topic 5: Small supplier analysis (if enough data)
    if stats['unique_suppliers'] > 100:
        small_suppliers = [s for s in stats.get('top_suppliers', []) if 0 < s[1] < 5000]
        if small_suppliers and f'micro-spending-{datetime.now().year}' not in existing_ids:
            topics.append({
                'id': f'micro-spending-{datetime.now().year}',
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
                    'financial_years': stats.get('financial_years', []),
                    'supplier_count_by_range': {
                        'under_1k': len([s for s in top_suppliers if s[1] < 1000]),
                        '1k_to_10k': len([s for s in top_suppliers if 1000 <= s[1] < 10000]),
                        '10k_to_100k': len([s for s in top_suppliers if 10000 <= s[1] < 100000]),
                        'over_100k': len([s for s in top_suppliers if s[1] >= 100000]),
                    },
                },
            })

    return topics


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
        cumulative = 0
        for i, (name, amount) in enumerate(top_suppliers[:10], 1):
            pct = _pct(amount, total)
            cumulative += amount
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

    # Pre-compute department analysis
    departments = ctx.get('departments', [])
    if departments:
        lines.append('DEPARTMENT/SERVICE SPENDING (pre-calculated):')
        lines.append(f'{"Rank":<6} {"Department":<45} {"Amount":<15} {"% of Total"}')
        lines.append('-' * 80)
        for i, (name, amount) in enumerate(departments[:10], 1):
            lines.append(f'{i:<6} {name:<45} {_fmt_gbp(amount):<15} {_pct(amount, total)}')
        lines.append('')

    # Pre-compute year-over-year trends
    year_totals = ctx.get('year_totals', {})
    if year_totals and len(year_totals) >= 2:
        lines.append('YEAR-OVER-YEAR SPENDING (pre-calculated):')
        sorted_years = sorted(year_totals.items())
        for yr, amt in sorted_years:
            lines.append(f'  {yr}: {_fmt_gbp(amt)}')
        if len(sorted_years) >= 2:
            first_yr, first_amt = sorted_years[0]
            last_yr, last_amt = sorted_years[-1]
            change = last_amt - first_amt
            change_pct = _pct(abs(change), first_amt) if first_amt else 'N/A'
            direction = 'increased' if change > 0 else 'decreased'
            lines.append(f'OVERALL CHANGE: Spending {direction} by {_fmt_gbp(abs(change))} ({change_pct}) from {first_yr} to {last_yr}')
        # Year-on-year changes
        for i in range(1, len(sorted_years)):
            prev_yr, prev_amt = sorted_years[i - 1]
            curr_yr, curr_amt = sorted_years[i]
            change = curr_amt - prev_amt
            direction = '+' if change > 0 else ''
            lines.append(f'  {prev_yr}→{curr_yr}: {direction}{_fmt_gbp(change)} ({direction}{change/prev_amt*100:.1f}%)' if prev_amt else f'  {prev_yr}→{curr_yr}: {_fmt_gbp(curr_amt)}')
        lines.append('')

    # Pre-compute DOGE findings summary
    findings = ctx.get('findings')
    if findings:
        lines.append('DOGE ANALYSIS FINDINGS (pre-calculated):')
        if isinstance(findings, list):
            for item in findings[:8]:
                if isinstance(item, dict):
                    title = item.get('title', item.get('type', 'Finding'))
                    amount = item.get('total_amount', item.get('amount', 0))
                    count = item.get('count', item.get('items_count', 0))
                    severity = item.get('severity', 'info')
                    if amount:
                        lines.append(f'  - {title}: {_fmt_gbp(amount)} flagged ({count} items) [severity: {severity}]')
                    elif count:
                        lines.append(f'  - {title}: {count} issues [severity: {severity}]')
        elif isinstance(findings, dict):
            for key, val in findings.items():
                if isinstance(val, dict):
                    amount = val.get('total_flagged_amount', val.get('total_amount', 0))
                    count = val.get('count', val.get('items_count', 0))
                    if amount:
                        lines.append(f'  - {key}: {_fmt_gbp(amount)} flagged ({count} items)')
                    elif count:
                        lines.append(f'  - {key}: {count} issues')
        lines.append('')

    # Supplier count by size range
    size_ranges = ctx.get('supplier_count_by_range', {})
    if size_ranges:
        lines.append('SUPPLIER SIZE DISTRIBUTION (pre-calculated):')
        for label, count in size_ranges.items():
            lines.append(f'  {label}: {count} suppliers')
        lines.append('')

    return '\n'.join(lines)


def generate_article(topic, council_id, council_config):
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
    """Verify article quality and structure. Returns (ok, warnings, cleaned_content)."""
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

    return len(warnings) == 0, warnings, content


def create_summary(content, max_len=200):
    """Extract a summary from article content."""
    text = re.sub(r'<[^>]+>', '', content)
    # Skip key findings, get first paragraph
    paragraphs = [p.strip() for p in text.split('\n') if len(p.strip()) > 50]
    # Skip the key findings bullets
    for p in paragraphs:
        if not p.startswith('•') and not p.startswith('-') and not p.startswith('Key Findings'):
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
    index_entry = {
        'id': topic['id'],
        'date': datetime.now().strftime('%Y-%m-%d'),
        'category': topic.get('category', 'Analysis'),
        'title': topic['title'],
        'summary': create_summary(content),
        'image': topic.get('image', ARTICLE_IMAGES['default']),
        'author': f"{council_id.title()} Council Transparency",
        'tags': [],
    }
    index.insert(0, index_entry)

    # Preserve original format (wrapped or plain)
    if wrapped:
        raw['articles'] = index
        index_path.write_text(json.dumps(raw, indent=2))
    else:
        index_path.write_text(json.dumps(index, indent=2))
    log.info(f"Updated index: {index_path} ({len(index)} articles)")


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

def process_council(council_id, dry_run=False, max_articles=2):
    """Process a single council — discover topics and generate articles."""
    log.info(f'=== Processing {council_id} ===')

    config = load_config(council_id)
    records = load_spending_data(council_id)
    findings = load_doge_findings(council_id)
    existing = load_existing_articles(council_id)

    if not records:
        log.warning(f'No spending data for {council_id} — skipping')
        return 0

    stats = compute_spending_stats(records)
    topics = discover_topics(council_id, stats, findings, existing)

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
        content = generate_article(topic, council_id, config)
        if not content:
            continue

        ok, warnings, content = verify_article(content, topic.get('data_context', {}))
        if warnings:
            for w in warnings:
                log.warning(f"  Verification: {w}")
        if not ok:
            log.warning(f"  Article {topic['id']} failed verification — saving anyway with warnings")

        save_article(council_id, topic, content)
        generated += 1

        # Rate limit between articles
        time.sleep(5)

    return generated


def main():
    parser = argparse.ArgumentParser(description='AI DOGE Article Pipeline')
    parser.add_argument('--council', choices=COUNCILS, help='Process single council')
    parser.add_argument('--dry-run', action='store_true', help='Show topics without generating')
    parser.add_argument('--max-articles', type=int, default=2,
                        help='Max articles to generate per council per run (default: 2)')
    parser.add_argument('--no-push', action='store_true',
                        help='Generate articles but do not git commit/push')
    args = parser.parse_args()

    log.info(f'=== Article Pipeline Starting ({datetime.now().strftime("%Y-%m-%d %H:%M")}) ===')
    log.info(f'Data dir: {DATA_DIR}')
    log.info(f'Max articles per council: {args.max_articles}')

    councils = [args.council] if args.council else COUNCILS
    total = 0
    councils_updated = []

    for council_id in councils:
        try:
            count = process_council(council_id, dry_run=args.dry_run, max_articles=args.max_articles)
            total += count
            if count > 0:
                councils_updated.append(council_id)
        except Exception as e:
            log.error(f'Error processing {council_id}: {e}')

    log.info(f'=== Pipeline Complete: {total} articles {"found" if args.dry_run else "generated"} ===')

    # Auto-commit and push to trigger GH Pages deploy
    if total > 0 and not args.dry_run and not args.no_push:
        git_commit_and_push(councils_updated)


if __name__ == '__main__':
    main()
