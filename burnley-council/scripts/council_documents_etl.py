#!/usr/bin/env python3
"""
council_documents_etl.py — Council Documents Intelligence Pipeline

Downloads council meeting documents (PDFs) from ModernGov, extracts text,
analyses minutes with LLM to extract decisions, motions, and voting records,
and exports enriched JSON for the AI DOGE frontend.

Data flow:
  meetings.json (document URLs) → SQLite (persistent) → LLM analysis → council_documents.json

Usage:
    python3 council_documents_etl.py                          # All councils
    python3 council_documents_etl.py --council lancashire_cc   # Single council
    python3 council_documents_etl.py --council burnley --download-only  # Just fetch PDFs
    python3 council_documents_etl.py --council burnley --analyse-only   # Re-run LLM on cached PDFs
    python3 council_documents_etl.py --dry-run                 # Show what would be processed

Requirements:
    pip install requests beautifulsoup4 PyPDF2
"""

import argparse
import hashlib
import json
import logging
import os
import re
import sqlite3
import sys
import time
from datetime import datetime
from io import BytesIO
from pathlib import Path

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
)
log = logging.getLogger('CouncilDocumentsETL')

# ── Paths ────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent  # burnley-council/
DATA_DIR = BASE_DIR / 'data'
SCRIPTS_DIR = Path(__file__).parent

# ── Import LLM router ───────────────────────────────────────────────
sys.path.insert(0, str(SCRIPTS_DIR))
try:
    from llm_router import generate
    HAS_LLM = True
except ImportError:
    HAS_LLM = False
    log.warning("llm_router.py not available — LLM analysis disabled")

# ── Councils with ModernGov ──────────────────────────────────────────
COUNCILS = [
    'burnley', 'hyndburn', 'lancashire_cc', 'blackpool', 'blackburn',
    'preston', 'west_lancashire', 'wyre', 'lancaster', 'chorley', 'south_ribble',
]

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (AI DOGE Documents Pipeline; +https://aidoge.co.uk) Python/3',
}

# ── SQLite Schema ────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    doc_id TEXT PRIMARY KEY,
    council_id TEXT NOT NULL,
    meeting_id TEXT,
    committee TEXT,
    committee_type TEXT,
    meeting_date DATE,
    title TEXT NOT NULL,
    doc_type TEXT,
    url TEXT UNIQUE,
    pdf_text TEXT,
    page_count INTEGER,
    file_size INTEGER,
    downloaded_at TIMESTAMP,
    analysed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS decisions (
    decision_id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL,
    council_id TEXT,
    meeting_date DATE,
    committee TEXT,
    item_number INTEGER,
    title TEXT,
    political_summary TEXT,
    department TEXT,
    budget_category TEXT,
    financial_value REAL,
    financial_context TEXT,
    recommendation TEXT,
    outcome TEXT,
    vote_for INTEGER,
    vote_against INTEGER,
    vote_abstain INTEGER,
    is_recorded_vote BOOLEAN DEFAULT 0,
    policy_areas TEXT,
    key_data_points TEXT,
    FOREIGN KEY (doc_id) REFERENCES documents(doc_id)
);

CREATE TABLE IF NOT EXISTS motions (
    motion_id TEXT PRIMARY KEY,
    decision_id TEXT,
    meeting_date DATE,
    council_id TEXT,
    proposer TEXT,
    seconder TEXT,
    full_text TEXT,
    motion_type TEXT,
    parent_motion_id TEXT,
    outcome TEXT,
    vote_for INTEGER,
    vote_against INTEGER,
    FOREIGN KEY (decision_id) REFERENCES decisions(decision_id)
);

CREATE INDEX IF NOT EXISTS idx_documents_council ON documents(council_id);
CREATE INDEX IF NOT EXISTS idx_documents_date ON documents(meeting_date);
CREATE INDEX IF NOT EXISTS idx_decisions_council ON decisions(council_id);
CREATE INDEX IF NOT EXISTS idx_decisions_date ON decisions(meeting_date);
"""


def get_db(council_id):
    """Get or create SQLite database for a council."""
    db_dir = DATA_DIR / council_id
    db_dir.mkdir(parents=True, exist_ok=True)
    db_path = db_dir / 'council_documents.db'
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def make_doc_id(council_id, url):
    """Generate a stable document ID from council + URL."""
    return hashlib.md5(f"{council_id}:{url}".encode()).hexdigest()[:16]


def make_decision_id(council_id, meeting_date, committee, item_num):
    """Generate a stable decision ID."""
    slug = re.sub(r'[^a-z0-9]+', '-', committee.lower().strip())[:30]
    return f"{council_id}-{meeting_date}-{slug}-{item_num}"


# ── PDF Download + Text Extraction ───────────────────────────────────

def download_and_extract_pdf(url, timeout=60):
    """Download PDF and extract text. Returns (text, page_count, file_size) or (None, 0, 0)."""
    if not HAS_REQUESTS:
        return None, 0, 0

    try:
        resp = requests.get(url, timeout=timeout, headers=HEADERS)
        resp.raise_for_status()
        content_type = resp.headers.get('content-type', '')
        if 'pdf' not in content_type.lower() and not url.lower().endswith('.pdf'):
            # Could be HTML (some ModernGov URLs redirect to HTML viewers)
            if 'html' in content_type.lower():
                return None, 0, 0
    except Exception as e:
        log.debug(f"    Download failed: {e}")
        return None, 0, 0

    pdf_bytes = resp.content
    file_size = len(pdf_bytes)
    if file_size < 100:
        return None, 0, file_size

    # Try PyPDF2
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(BytesIO(pdf_bytes))
        page_count = len(reader.pages)
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text.strip())
        if pages:
            return '\n\n'.join(pages), page_count, file_size
    except ImportError:
        pass
    except Exception as e:
        log.debug(f"    PyPDF2 failed: {e}")

    # Try pdfplumber
    try:
        import pdfplumber
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            page_count = len(pdf.pages)
            pages = []
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    pages.append(text.strip())
            if pages:
                return '\n\n'.join(pages), page_count, file_size
    except ImportError:
        pass
    except Exception as e:
        log.debug(f"    pdfplumber failed: {e}")

    return None, 0, file_size


# ── Phase 1: Load meetings.json + download documents ─────────────────

def load_meetings(council_id):
    """Load meetings.json for a council."""
    path = DATA_DIR / council_id / 'meetings.json'
    if not path.exists():
        return []
    with open(path) as f:
        data = json.load(f)
    return data.get('meetings', [])


def ingest_documents(council_id, conn, download=True):
    """Load document URLs from meetings.json and download PDFs into SQLite."""
    meetings = load_meetings(council_id)
    if not meetings:
        log.warning(f"  {council_id}: No meetings.json or no meetings")
        return 0

    cursor = conn.cursor()
    new_docs = 0
    downloaded = 0

    for meeting in meetings:
        docs = meeting.get('documents', [])
        for doc in docs:
            # Handle both old format (string) and new format (dict)
            if isinstance(doc, str):
                continue  # Skip old-format string-only documents
            if not isinstance(doc, dict) or not doc.get('url'):
                continue

            url = doc['url']
            doc_id = make_doc_id(council_id, url)

            # Check if already in DB
            existing = cursor.execute(
                "SELECT doc_id, pdf_text FROM documents WHERE doc_id = ?", (doc_id,)
            ).fetchone()

            if existing and existing['pdf_text']:
                continue  # Already downloaded + extracted

            title = doc.get('title', '')
            doc_type = doc.get('type', 'other')

            if not existing:
                # Insert new document record
                cursor.execute("""
                    INSERT OR IGNORE INTO documents
                    (doc_id, council_id, meeting_id, committee, committee_type,
                     meeting_date, title, doc_type, url)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    doc_id, council_id,
                    meeting.get('id'), meeting.get('committee'),
                    meeting.get('type'), meeting.get('date'),
                    title, doc_type, url,
                ))
                new_docs += 1

            # Download PDF if requested
            if download and doc_type in ('minutes', 'officer_report', 'motion_text', 'agenda'):
                log.debug(f"    Downloading [{doc_type}]: {title[:60]}...")
                text, page_count, file_size = download_and_extract_pdf(url)
                if text:
                    cursor.execute("""
                        UPDATE documents SET pdf_text = ?, page_count = ?,
                        file_size = ?, downloaded_at = ? WHERE doc_id = ?
                    """, (text, page_count, file_size,
                          datetime.utcnow().isoformat(), doc_id))
                    downloaded += 1
                elif file_size > 0:
                    cursor.execute("""
                        UPDATE documents SET file_size = ?, downloaded_at = ?
                        WHERE doc_id = ?
                    """, (file_size, datetime.utcnow().isoformat(), doc_id))
                time.sleep(0.3)  # Rate limit

    conn.commit()
    log.info(f"  {council_id}: {new_docs} new documents, {downloaded} PDFs downloaded")
    return downloaded


# ── Phase 2: LLM Analysis of Minutes ────────────────────────────────

MINUTES_ANALYSIS_PROMPT_TEMPLATE = (
    "You are extracting decisions from council meeting minutes for a public transparency tool.\n\n"
    "Given these meeting minutes, extract ALL decisions made. For each decision return a JSON object with:\n\n"
    '- "title": concise description of what was decided (max 80 chars)\n'
    '- "political_summary": 1-2 sentences a voter would understand. Include specific amounts, vote counts\n'
    '- "department": which council service area (e.g. "Highways", "Social Care", "Housing", "Finance")\n'
    '- "financial_value": amount if applicable (number only, no £ sign), null if not financial\n'
    '- "financial_context": brief context for the figure\n'
    '- "outcome": "approved" | "rejected" | "deferred" | "noted" | "referred"\n'
    '- "vote_for": number who voted for (null if not recorded)\n'
    '- "vote_against": number who voted against (null if not recorded)\n'
    '- "vote_abstain": number who abstained (null if not recorded)\n'
    '- "is_recorded_vote": true if individual councillor votes were recorded\n'
    '- "policy_areas": array of 1-3 tags from: budget_finance, transport_highways, social_care, '
    'education_send, housing, planning, environment_waste, health, economic_development, '
    'devolution_lgr, democratic_governance, public_safety\n'
    '- "key_data_points": array of 2-4 headline facts/numbers\n'
    '- "motions": array of motions/amendments, each with: proposer, seconder, text (first 200 chars), '
    'type (substantive/amendment/procedural), outcome (carried/defeated/withdrawn)\n\n'
    "Return ONLY a JSON array of decision objects. No markdown, no explanation.\n"
    "If no clear decisions were made, return an empty array [].\n\n"
)


def analyse_minutes(council_id, conn, council_name=''):
    """Run LLM analysis on downloaded minutes to extract decisions."""
    if not HAS_LLM:
        log.warning("  LLM router not available, skipping analysis")
        return 0

    cursor = conn.cursor()
    # Get minutes documents that have text but haven't been analysed
    rows = cursor.execute("""
        SELECT doc_id, council_id, meeting_date, committee, committee_type,
               title, pdf_text, url
        FROM documents
        WHERE council_id = ? AND doc_type = 'minutes'
          AND pdf_text IS NOT NULL AND length(pdf_text) > 200
          AND analysed_at IS NULL
        ORDER BY meeting_date DESC
        LIMIT 30
    """, (council_id,)).fetchall()

    if not rows:
        log.info(f"  {council_id}: No unanalysed minutes to process")
        return 0

    log.info(f"  {council_id}: Analysing {len(rows)} minutes documents...")
    total_decisions = 0

    for row in rows:
        doc_id = row['doc_id']
        text = row['pdf_text']
        # Truncate to ~8K chars for LLM context
        max_chars = 8000
        truncated = text[:max_chars] if len(text) > max_chars else text

        committee = row['committee'] or 'Unknown'
        date = row['meeting_date'] or 'Unknown'
        prompt = (
            MINUTES_ANALYSIS_PROMPT_TEMPLATE
            + "---\n"
            + f"Committee: {committee}\n"
            + f"Date: {date}\n"
            + f"Council: {council_name}\n"
            + f"Document length: {len(truncated)} chars\n\n"
            + "MINUTES TEXT:\n"
            + truncated
        )

        try:
            response, provider = generate(prompt, max_tokens=3000, timeout=120)
            # Parse JSON from response — handle markdown code blocks
            json_text = response.strip()
            if json_text.startswith('```'):
                json_text = re.sub(r'^```\w*\n?', '', json_text)
                json_text = re.sub(r'\n?```$', '', json_text)
            decisions = json.loads(json_text)
            if not isinstance(decisions, list):
                decisions = [decisions] if isinstance(decisions, dict) else []
        except (json.JSONDecodeError, Exception) as e:
            log.warning(f"    Failed to parse LLM response for {doc_id}: {e}")
            # Mark as analysed to avoid re-processing
            cursor.execute(
                "UPDATE documents SET analysed_at = ? WHERE doc_id = ?",
                (datetime.utcnow().isoformat(), doc_id)
            )
            conn.commit()
            continue

        # Store decisions
        for i, dec in enumerate(decisions):
            decision_id = make_decision_id(
                council_id, row['meeting_date'] or 'unknown',
                row['committee'] or 'unknown', i + 1
            )
            cursor.execute("""
                INSERT OR REPLACE INTO decisions
                (decision_id, doc_id, council_id, meeting_date, committee,
                 item_number, title, political_summary, department,
                 budget_category, financial_value, financial_context,
                 recommendation, outcome, vote_for, vote_against, vote_abstain,
                 is_recorded_vote, policy_areas, key_data_points)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                decision_id, doc_id, council_id,
                row['meeting_date'], row['committee'],
                i + 1,
                dec.get('title', '')[:200],
                dec.get('political_summary', ''),
                dec.get('department'),
                dec.get('budget_category'),
                dec.get('financial_value'),
                dec.get('financial_context'),
                dec.get('recommendation'),
                dec.get('outcome'),
                dec.get('vote_for'),
                dec.get('vote_against'),
                dec.get('vote_abstain'),
                1 if dec.get('is_recorded_vote') else 0,
                json.dumps(dec.get('policy_areas', [])),
                json.dumps(dec.get('key_data_points', [])),
            ))

            # Store motions
            for j, motion in enumerate(dec.get('motions', [])):
                motion_id = f"{decision_id}-m{j+1}"
                cursor.execute("""
                    INSERT OR REPLACE INTO motions
                    (motion_id, decision_id, meeting_date, council_id,
                     proposer, seconder, full_text, motion_type,
                     outcome, vote_for, vote_against)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    motion_id, decision_id, row['meeting_date'], council_id,
                    motion.get('proposer'),
                    motion.get('seconder'),
                    motion.get('text', '')[:500],
                    motion.get('type', 'substantive'),
                    motion.get('outcome'),
                    motion.get('vote_for'),
                    motion.get('vote_against'),
                ))

            total_decisions += 1

        # Mark document as analysed
        cursor.execute(
            "UPDATE documents SET analysed_at = ? WHERE doc_id = ?",
            (datetime.utcnow().isoformat(), doc_id)
        )
        conn.commit()
        log.info(f"    [{provider}] {row['committee']} {row['meeting_date']}: "
                 f"{len(decisions)} decisions extracted")
        time.sleep(1)  # Rate limit between LLM calls

    log.info(f"  {council_id}: {total_decisions} total decisions extracted")
    return total_decisions


# ── Phase 3: JSON Export ─────────────────────────────────────────────

def export_json(council_id, conn):
    """Export SQLite data to council_documents.json for frontend."""
    cursor = conn.cursor()

    # Get document stats
    doc_count = cursor.execute(
        "SELECT COUNT(*) FROM documents WHERE council_id = ?", (council_id,)
    ).fetchone()[0]
    decision_count = cursor.execute(
        "SELECT COUNT(*) FROM decisions WHERE council_id = ?", (council_id,)
    ).fetchone()[0]

    if decision_count == 0:
        log.info(f"  {council_id}: No decisions to export")
        return None

    # Date range
    dates = cursor.execute("""
        SELECT MIN(meeting_date), MAX(meeting_date)
        FROM decisions WHERE council_id = ?
    """, (council_id,)).fetchone()

    # Recent decisions (latest 50)
    rows = cursor.execute("""
        SELECT d.decision_id, d.meeting_date, d.committee, d.title,
               d.political_summary, d.department, d.financial_value,
               d.financial_context, d.outcome, d.vote_for, d.vote_against,
               d.vote_abstain, d.is_recorded_vote, d.policy_areas,
               d.key_data_points
        FROM decisions d
        WHERE d.council_id = ?
        ORDER BY d.meeting_date DESC, d.item_number
        LIMIT 50
    """, (council_id,)).fetchall()

    recent_decisions = []
    for row in rows:
        dec = {
            'decision_id': row['decision_id'],
            'date': row['meeting_date'],
            'committee': row['committee'],
            'title': row['title'],
            'political_summary': row['political_summary'],
            'department': row['department'],
            'financial_value': row['financial_value'],
            'financial_context': row['financial_context'],
            'outcome': row['outcome'],
            'vote_for': row['vote_for'],
            'vote_against': row['vote_against'],
            'vote_abstain': row['vote_abstain'],
            'is_recorded_vote': bool(row['is_recorded_vote']),
            'policy_areas': json.loads(row['policy_areas'] or '[]'),
            'key_data_points': json.loads(row['key_data_points'] or '[]'),
        }

        # Get motions for this decision
        motions = cursor.execute("""
            SELECT proposer, seconder, full_text, motion_type, outcome,
                   vote_for, vote_against
            FROM motions WHERE decision_id = ?
        """, (row['decision_id'],)).fetchall()
        if motions:
            dec['motions'] = [{
                'proposer': m['proposer'],
                'seconder': m['seconder'],
                'text': m['full_text'],
                'type': m['motion_type'],
                'outcome': m['outcome'],
                'vote_for': m['vote_for'],
                'vote_against': m['vote_against'],
            } for m in motions]

        recent_decisions.append(dec)

    # By committee
    by_committee = {}
    for row in cursor.execute("""
        SELECT committee, COUNT(*) as cnt FROM decisions
        WHERE council_id = ? GROUP BY committee ORDER BY cnt DESC
    """, (council_id,)):
        by_committee[row['committee']] = row['cnt']

    # By department
    by_department = {}
    for row in cursor.execute("""
        SELECT department, COUNT(*) as cnt, SUM(COALESCE(financial_value, 0)) as total_value
        FROM decisions WHERE council_id = ? AND department IS NOT NULL
        GROUP BY department ORDER BY cnt DESC
    """, (council_id,)):
        by_department[row['department']] = {
            'count': row['cnt'],
            'total_value': row['total_value'],
        }

    result = {
        'council_id': council_id,
        'last_updated': datetime.utcnow().isoformat(),
        'documents_count': doc_count,
        'decisions_count': decision_count,
        'date_range': f"{dates[0]} to {dates[1]}" if dates[0] else None,
        'recent_decisions': recent_decisions,
        'by_committee': by_committee,
        'by_department': by_department,
    }

    # Write JSON
    out_path = DATA_DIR / council_id / 'council_documents.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    log.info(f"  {council_id}: Exported {decision_count} decisions to {out_path}")

    return result


# ── Main Pipeline ────────────────────────────────────────────────────

def process_council(council_id, download=True, analyse=True, dry_run=False):
    """Full pipeline for a single council."""
    log.info(f"Processing {council_id}...")

    # Load council name from config
    config_path = DATA_DIR / council_id / 'config.json'
    council_name = council_id
    if config_path.exists():
        with open(config_path) as f:
            cfg = json.load(f)
        council_name = cfg.get('council_full_name', cfg.get('council_name', council_id))

    if dry_run:
        meetings = load_meetings(council_id)
        doc_count = sum(
            1 for m in meetings for d in m.get('documents', [])
            if isinstance(d, dict) and d.get('url')
        )
        minutes_count = sum(
            1 for m in meetings for d in m.get('documents', [])
            if isinstance(d, dict) and d.get('type') == 'minutes'
        )
        log.info(f"  DRY RUN: {len(meetings)} meetings, {doc_count} document URLs, "
                 f"{minutes_count} minutes to analyse")
        return

    conn = get_db(council_id)

    try:
        if download:
            ingest_documents(council_id, conn, download=True)

        if analyse:
            analyse_minutes(council_id, conn, council_name)

        export_json(council_id, conn)
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(
        description='Council Documents Intelligence Pipeline'
    )
    parser.add_argument('--council', type=str, help='Single council ID')
    parser.add_argument('--download-only', action='store_true',
                        help='Only download PDFs, skip LLM analysis')
    parser.add_argument('--analyse-only', action='store_true',
                        help='Only run LLM analysis on cached PDFs')
    parser.add_argument('--export-only', action='store_true',
                        help='Only export JSON from existing SQLite data')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show what would be processed')
    args = parser.parse_args()

    councils = [args.council] if args.council else COUNCILS

    for council_id in councils:
        if council_id not in COUNCILS and args.council:
            # Allow any council ID if explicitly specified
            pass
        elif council_id not in COUNCILS:
            continue

        if args.export_only:
            conn = get_db(council_id)
            try:
                export_json(council_id, conn)
            finally:
                conn.close()
        elif args.dry_run:
            process_council(council_id, dry_run=True)
        else:
            download = not args.analyse_only
            analyse = not args.download_only
            process_council(council_id, download=download, analyse=analyse)

    print("\n" + "=" * 60)
    print("COUNCIL DOCUMENTS ETL COMPLETE")
    print("=" * 60)


if __name__ == '__main__':
    main()
