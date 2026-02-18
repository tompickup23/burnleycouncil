#!/usr/bin/env python3
"""
meetings_etl.py — Scrape upcoming meetings from ModernGov and generate meetings.json.

Scrapes the ModernGov calendar and committee meeting pages to produce a meetings.json
file for each council. Fetches agenda items from individual meeting document pages.

Data sources:
  - ModernGov: mgCalendarMonthView.aspx (calendar), ieListMeetings.aspx (per committee),
    ieListDocuments.aspx (meeting detail/agenda items)

Usage:
    python3 meetings_etl.py                         # All councils with ModernGov URLs
    python3 meetings_etl.py --council burnley        # Single council
    python3 meetings_etl.py --council lancashire_cc  # County council
    python3 meetings_etl.py --months 3               # Look ahead 3 months (default: 2)
    python3 meetings_etl.py --dry-run                # Show what would be generated

Requirements:
    pip install requests beautifulsoup4
"""

import argparse
import json
import logging
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urljoin, parse_qs, urlparse

try:
    import requests
    from bs4 import BeautifulSoup
    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
)
log = logging.getLogger('MeetingsETL')

# ── Paths ────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent  # burnley-council/
DATA_DIR = BASE_DIR / 'data'

# ── Council Registry ─────────────────────────────────────────────────
# Same registry as councillors_etl.py — only councils with moderngov_url
COUNCILS = {
    'burnley': {
        'name': 'Burnley Borough Council',
        'moderngov_url': 'https://burnley.moderngov.co.uk',
        'venue_default': 'Burnley Town Hall',
    },
    'hyndburn': {
        'name': 'Hyndburn Borough Council',
        'moderngov_url': 'https://hyndburn.moderngov.co.uk',
        'venue_default': 'Scaitcliffe House, Accrington',
    },
    'lancashire_cc': {
        'name': 'Lancashire County Council',
        'moderngov_url': 'https://council.lancashire.gov.uk',
        'venue_default': 'County Hall, Preston',
    },
    'blackpool': {
        'name': 'Blackpool Council',
        'moderngov_url': 'https://democracy.blackpool.gov.uk',
        'venue_default': 'Blackpool Town Hall',
    },
    'blackburn': {
        'name': 'Blackburn with Darwen Borough Council',
        'moderngov_url': 'https://democracy.blackburn.gov.uk',
        'venue_default': 'Blackburn Town Hall',
    },
    'preston': {
        'name': 'Preston City Council',
        'moderngov_url': 'https://preston.moderngov.co.uk',
        'venue_default': 'Preston Town Hall',
    },
    'west_lancashire': {
        'name': 'West Lancashire Borough Council',
        'moderngov_url': 'https://democracy.westlancs.gov.uk',
        'venue_default': '52 Derby Street, Ormskirk',
    },
    'wyre': {
        'name': 'Wyre Borough Council',
        'moderngov_url': 'https://wyre.moderngov.co.uk',
        'venue_default': 'Civic Centre, Poulton-le-Fylde',
    },
    'lancaster': {
        'name': 'Lancaster City Council',
        'moderngov_url': 'https://committeeadmin.lancaster.gov.uk',
        'venue_default': 'Lancaster Town Hall',
    },
    'chorley': {
        'name': 'Chorley Council',
        'moderngov_url': 'https://democracy.chorley.gov.uk',
        'venue_default': 'Chorley Town Hall',
    },
    'south_ribble': {
        'name': 'South Ribble Borough Council',
        'moderngov_url': 'https://southribble.moderngov.co.uk',
        'venue_default': 'Civic Centre, Leyland',
    },
}

# ── Committee Name → Meeting Type Mapping ─────────────────────────────
# Maps committee name keywords to meeting type constants
TYPE_KEYWORDS = [
    # Order matters — first match wins
    (r'full\s+council', 'full_council'),
    (r'council\s+meeting', 'full_council'),
    (r'annual\s+meeting', 'full_council'),
    (r'cabinet', 'executive'),
    (r'executive', 'executive'),
    (r'individual.*decision', 'executive'),
    (r'key\s+decision', 'notice'),
    (r'forward\s+plan', 'notice'),
    (r'notice\s+of', 'notice'),
    (r'scrutiny', 'scrutiny'),
    (r'overview', 'scrutiny'),
    (r'performance', 'scrutiny'),
    (r'development\s+control', 'planning'),
    (r'planning', 'planning'),
    (r'development\s+management', 'planning'),
    (r'licensing', 'licensing'),
    (r'taxi', 'licensing'),
    (r'audit', 'audit'),
    (r'standards', 'audit'),
    (r'governance', 'audit'),
    (r'accounts', 'audit'),
    (r'town\s+board', 'partnership'),
    (r'parish', 'partnership'),
    (r'partnership', 'partnership'),
    (r'joint', 'partnership'),
    (r'health.*wellbeing', 'partnership'),
]

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (AI DOGE Transparency Project; +https://aidoge.co.uk) Python/3',
}

RATE_LIMIT = 0.5  # seconds between requests


def classify_meeting_type(committee_name):
    """Classify a committee name into a meeting type constant."""
    lower = committee_name.lower()
    # Strip CANCELLED/PROVISIONAL prefixes for classification
    lower = re.sub(r'^(cancelled\s*-?\s*|provisional\s*-?\s*)', '', lower).strip()
    for pattern, mtype in TYPE_KEYWORDS:
        if re.search(pattern, lower):
            return mtype
    return 'other'


def slugify(text):
    """Convert text to URL-safe slug."""
    text = text.lower().strip()
    # Remove CANCELLED/PROVISIONAL prefixes
    text = re.sub(r'^(cancelled\s*-?\s*|provisional\s*-?\s*)', '', text).strip()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    text = text.strip('-')
    return text


def make_meeting_id(committee_name, date_str, mid=None):
    """Generate a unique meeting ID."""
    slug = slugify(committee_name)
    base_id = f"{slug}-{date_str}"
    if mid:
        return f"{base_id}-{mid}"
    return base_id


def parse_time(time_str):
    """Parse ModernGov time formats to 24h HH:MM."""
    if not time_str:
        return None
    time_str = time_str.strip().lower()
    # "6.30 pm" → "18:30"
    m = re.match(r'(\d{1,2})\.(\d{2})\s*(am|pm)', time_str)
    if m:
        h, mins, period = int(m.group(1)), m.group(2), m.group(3)
        if period == 'pm' and h != 12:
            h += 12
        if period == 'am' and h == 12:
            h = 0
        return f"{h:02d}:{mins}"
    # "18:30" already in 24h
    m = re.match(r'(\d{1,2}):(\d{2})', time_str)
    if m:
        return f"{int(m.group(1)):02d}:{m.group(2)}"
    # "6:30pm"
    m = re.match(r'(\d{1,2}):(\d{2})\s*(am|pm)', time_str)
    if m:
        h, mins, period = int(m.group(1)), m.group(2), m.group(3)
        if period == 'pm' and h != 12:
            h += 12
        if period == 'am' and h == 12:
            h = 0
        return f"{h:02d}:{mins}"
    return None


def parse_date_from_text(text):
    """Parse date from ModernGov text like 'Wednesday, 4th February, 2026 6.30 pm'."""
    # Remove ordinal suffixes
    cleaned = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', text)
    # Try various date patterns
    for fmt in [
        '%A, %d %B, %Y',      # Wednesday, 4 February, 2026
        '%A %d %B %Y',         # Wednesday 4 February 2026
        '%d %B %Y',            # 4 February 2026
        '%d %b %Y',            # 4 Feb 2026
        '%A, %d %B %Y',        # Wednesday, 4 February 2026 (no trailing comma)
    ]:
        try:
            # Split off time portion
            date_part = re.split(r'\d{1,2}[\.:]\d{2}', cleaned)[0].strip().rstrip(',').strip()
            dt = datetime.strptime(date_part, fmt)
            return dt.strftime('%Y-%m-%d')
        except (ValueError, IndexError):
            continue
    return None


def fetch_page(url):
    """Fetch and parse a page with rate limiting."""
    time.sleep(RATE_LIMIT)
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        return BeautifulSoup(resp.text, 'html.parser')
    except requests.RequestException as e:
        log.warning(f"  Failed to fetch {url}: {e}")
        return None


def scrape_committees(base_url):
    """Scrape list of committees and their CId values."""
    url = f"{base_url}/mgListCommittees.aspx?bcr=1"
    log.info(f"  Fetching committees: {url}")
    soup = fetch_page(url)
    if not soup:
        return []

    committees = []
    for link in soup.find_all('a', href=True):
        href = link['href']
        # Match mgCommitteeDetails.aspx?ID=xxx
        if 'mgCommitteeDetails.aspx' in href:
            m = re.search(r'ID=(\d+)', href)
            if m:
                cid = m.group(1)
                name = link.get_text(strip=True)
                if name:
                    committees.append({
                        'cid': cid,
                        'name': name,
                        'type': classify_meeting_type(name),
                    })
    log.info(f"  Found {len(committees)} committees")
    return committees


def scrape_committee_meetings(base_url, cid, committee_name, year=None):
    """Scrape meetings for a specific committee in a given year."""
    if year is None:
        year = datetime.now().year
    url = f"{base_url}/ieListMeetings.aspx?CId={cid}&Year={year}"
    soup = fetch_page(url)
    if not soup:
        return []

    meetings = []
    # Look for links to ieListDocuments.aspx
    for link in soup.find_all('a', href=True):
        href = link['href']
        if 'ieListDocuments.aspx' not in href:
            continue
        m = re.search(r'MId=(\d+)', href)
        if not m:
            continue
        mid = m.group(1)
        text = link.get_text(strip=True)
        if not text:
            continue

        # Parse date from link text: "15 Apr 2026 6.30 pm"
        date_str = None
        time_str = None

        # Extract time first
        time_match = re.search(r'(\d{1,2}[\.:]\d{2}\s*(?:am|pm))', text, re.I)
        if time_match:
            time_str = parse_time(time_match.group(1))

        # Extract date
        date_match = re.search(r'(\d{1,2}\s+\w+\s+\d{4})', text)
        if date_match:
            try:
                # Handle ordinal suffixes
                date_text = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', date_match.group(1))
                for fmt in ['%d %B %Y', '%d %b %Y']:
                    try:
                        dt = datetime.strptime(date_text, fmt)
                        date_str = dt.strftime('%Y-%m-%d')
                        break
                    except ValueError:
                        continue
            except Exception:
                pass

        if not date_str:
            # Try full text date parse
            date_str = parse_date_from_text(text)

        if not date_str:
            continue

        # Check if cancelled
        cancelled = 'cancelled' in text.lower() or 'cancelled' in committee_name.lower()

        # Check if agenda info mentioned in text
        has_agenda = any(kw in text.lower() for kw in ['agenda', 'minutes', 'draft minutes'])

        full_link = urljoin(base_url + '/', href)

        meetings.append({
            'mid': mid,
            'cid': cid,
            'date': date_str,
            'time': time_str,
            'committee': committee_name,
            'cancelled': cancelled,
            'has_agenda': has_agenda,
            'link': full_link,
        })

    return meetings


def clean_pdf_suffix(text):
    """Remove trailing 'PDF xxx KB/MB' from document/agenda text."""
    return re.sub(r'\s*PDF\s+[\d.,]+\s*[KMG]B\s*$', '', text, flags=re.I).strip()


def _looks_like_report_title(text):
    """Check if text looks like a report/agenda title rather than a venue name.

    Venue names are short place names like 'Burnley Town Hall' or 'County Hall, Preston'.
    Report titles contain words like 'Report', 'Budget', 'Monitoring', 'Review', years, etc.
    """
    # Common report/agenda keywords that would never appear in a venue name
    report_keywords = [
        r'\breport\b', r'\bbudget\b', r'\bmonitoring\b', r'\breview\b',
        r'\bminutes\b', r'\bagenda\b', r'\bstrategy\b', r'\bpolicy\b',
        r'\banalysis\b', r'\bperformance\b', r'\bquart(?:er|erly)\b',
        r'\bupdate\b', r'\bannual\b', r'\bfinancial\b', r'\bstatement\b',
        r'\bresolution\b', r'\bdecision\b', r'\bscrutiny\b', r'\bamendment\b',
        r'\bQ[1-4]\b', r'\b20\d{2}[/-]', r'\bpressures?\b', r'\bmarket\b',
        r'\bsupport\b', r'\bavailable\b', r'\bproposal\b', r'\bconsultation\b',
    ]
    lower = text.lower()
    for pattern in report_keywords:
        if re.search(pattern, lower):
            return True
    # If it contains a year reference like "2025/26" or "2025-26"
    if re.search(r'20\d{2}[/-]\d{2,4}', text):
        return True
    return False


def scrape_meeting_detail(url):
    """Scrape a meeting detail page for venue and agenda items."""
    soup = fetch_page(url)
    if not soup:
        return {'venue': None, 'agenda_items': [], 'documents': []}

    # Extract venue — look for "Venue:" in the page header area only.
    # ModernGov puts venue as plain text near the top of the meeting detail page,
    # NOT inside agenda items or minutes content. We restrict our search to avoid
    # matching "Venue" text that appears inside minutes/report body text.
    venue = None

    # Strategy 1: Look for mgVenue class (some ModernGov instances)
    venue_el = soup.find(class_=re.compile(r'mgVenue', re.I))
    if venue_el:
        v = venue_el.get_text(strip=True)
        v = re.sub(r'^Venue:?\s*', '', v, flags=re.I).strip().rstrip(',').strip(':').strip()
        if v and len(v) > 2 and len(v) < 80:
            venue = v

    # Strategy 2: Search only in the top header section (before agenda items).
    # The agenda items live inside elements with class mgAiTitle* or mgSubTbl.
    # We find the first agenda element and only search text BEFORE it.
    if not venue:
        # Find the first agenda-related element to set a boundary
        agenda_boundary = soup.find(class_=re.compile(r'mgAi|mgSubTbl'))
        # Build a list of text nodes to search — only those BEFORE the agenda
        header_elements = []
        for el in soup.find_all(['span', 'div', 'p', 'td', 'dt', 'dd']):
            # Stop if we've hit the agenda section
            if agenda_boundary and el.find_parent(class_=re.compile(r'mgAi|mgSubTbl')):
                continue
            if agenda_boundary and agenda_boundary in el.parents:
                continue
            # Check if this element comes before the agenda boundary in document order
            if agenda_boundary:
                try:
                    # Compare source positions — element must come before agenda
                    if el.sourceline and agenda_boundary.sourceline:
                        if el.sourceline > agenda_boundary.sourceline:
                            continue
                except AttributeError:
                    pass
            header_elements.append(el)

        for el in header_elements:
            text = el.get_text(strip=True)
            m = re.match(r'Venue:?\s+(.+)', text, re.I)
            if m:
                v = m.group(1).strip().rstrip(',').strip(':').strip()
                # Validate: real venues are short place names, not report titles
                if v and 3 < len(v) < 80 and not _looks_like_report_title(v):
                    venue = v
                    break

    # Extract agenda items using ModernGov CSS classes
    # Agenda items use class="mgAiTitleTxt" — each item appears twice
    # (once as number, once as title). We want the title ones.
    agenda_items = []
    seen_items = set()

    # Primary method: mgAiTitleTxt elements (most reliable)
    for el in soup.find_all(class_='mgAiTitleTxt'):
        text = el.get_text(strip=True)
        if not text or len(text) < 3:
            continue
        # Skip bare numbers like "79." or "83a"
        if re.match(r'^\d+[a-z]?\.?$', text):
            continue
        text = clean_pdf_suffix(text)
        if text and text not in seen_items and len(text) > 3:
            agenda_items.append(text)
            seen_items.add(text)

    # Fallback: mgAiTitleLnk links
    if not agenda_items:
        for el in soup.find_all(class_='mgAiTitleLnk'):
            text = clean_pdf_suffix(el.get_text(strip=True))
            if text and text not in seen_items and len(text) > 3:
                agenda_items.append(text)
                seen_items.add(text)

    # Extract documents — links with PDF/document hrefs
    documents = []
    seen_docs = set()
    for link in soup.find_all('a', href=True):
        href = link['href']
        text = link.get_text(strip=True)
        if not text or len(text) < 4:
            continue
        if any(kw in href.lower() for kw in ['.pdf', '/documents/', 'mgdocument', 'mgconvert']):
            doc_text = clean_pdf_suffix(text)
            # Skip bare labels like "PDF 403 KB" or "Open Document"
            if doc_text and doc_text not in seen_docs and len(doc_text) > 5:
                if not re.match(r'^(PDF|DOC|XLS|Open)\s', doc_text):
                    documents.append(doc_text)
                    seen_docs.add(doc_text)

    return {
        'venue': venue,
        'agenda_items': agenda_items,
        'documents': documents,
    }


def scrape_council_meetings(council_id, config, months_ahead=2, fetch_detail=True):
    """Scrape all upcoming meetings for a council."""
    base_url = config['moderngov_url']
    if not base_url:
        log.warning(f"  {council_id}: No ModernGov URL, skipping")
        return []

    log.info(f"  Scraping committees for {council_id}...")
    committees = scrape_committees(base_url)
    if not committees:
        log.warning(f"  {council_id}: No committees found")
        return []

    # Determine which years to scrape
    now = datetime.now()
    end_date = now + timedelta(days=months_ahead * 31)
    years = set()
    years.add(now.year)
    if end_date.year != now.year:
        years.add(end_date.year)

    # Scrape meetings for each committee
    all_meetings = []
    for committee in committees:
        for year in sorted(years):
            meetings = scrape_committee_meetings(
                base_url, committee['cid'], committee['name'], year
            )
            for meeting in meetings:
                meeting['type'] = committee['type']
            all_meetings.extend(meetings)

    # Deduplicate by MId
    seen_mids = {}
    unique_meetings = []
    for m in all_meetings:
        if m['mid'] not in seen_mids:
            seen_mids[m['mid']] = m
            unique_meetings.append(m)

    # Filter to date range: from 30 days ago to months_ahead in the future
    start_date = (now - timedelta(days=30)).strftime('%Y-%m-%d')
    end_date_str = end_date.strftime('%Y-%m-%d')
    filtered = [
        m for m in unique_meetings
        if start_date <= m['date'] <= end_date_str
    ]

    log.info(f"  {council_id}: {len(filtered)} meetings in date range "
             f"({len(unique_meetings)} total, {len(committees)} committees)")

    # Fetch detail pages for agenda items (optionally)
    if fetch_detail:
        log.info(f"  Fetching agenda details for {len(filtered)} meetings...")
        for i, meeting in enumerate(filtered):
            detail = scrape_meeting_detail(meeting['link'])
            meeting['venue'] = detail['venue'] or config.get('venue_default')
            meeting['agenda_items'] = detail['agenda_items']
            meeting['documents'] = detail['documents']
            if (i + 1) % 10 == 0:
                log.info(f"    {i + 1}/{len(filtered)} detail pages fetched")
    else:
        for meeting in filtered:
            meeting['venue'] = config.get('venue_default')
            meeting['agenda_items'] = []
            meeting['documents'] = []

    # Sort by date, then time
    filtered.sort(key=lambda m: (m['date'], m.get('time') or ''))

    return filtered


def format_meetings_json(council_id, config, meetings):
    """Format scraped meetings into the meetings.json structure."""
    now = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z')
    next_week = (datetime.utcnow() + timedelta(days=7)).strftime('%Y-%m-%dT%H:%M:%S.000Z')

    formatted_meetings = []
    for m in meetings:
        committee = m['committee']
        # Clean CANCELLED prefix for type classification but keep for display
        is_cancelled = m.get('cancelled', False)
        if is_cancelled and not committee.upper().startswith('CANCELLED'):
            committee = f"CANCELLED - {committee}"

        meeting_id = make_meeting_id(committee, m['date'], m.get('mid'))

        formatted_meetings.append({
            'id': meeting_id,
            'date': m['date'],
            'time': m.get('time'),
            'committee': committee,
            'type': m.get('type', 'other'),
            'venue': m.get('venue') if not is_cancelled else None,
            'status': 'cancelled' if is_cancelled else (
                'agenda_published' if m.get('agenda_items') else 'agenda_published'
            ),
            'cancelled': is_cancelled,
            'link': m['link'],
            'agenda_items': m.get('agenda_items', []),
            'summary': None,
            'public_relevance': None,
            'doge_relevance': None,
            'speak_deadline': None,
            'documents': m.get('documents', []),
        })

    return {
        'last_updated': now,
        'next_update': next_week,
        'source': config['moderngov_url'],
        'how_to_attend': {},
        'meetings': formatted_meetings,
    }


def process_council(council_id, config, months_ahead=2, dry_run=False, fetch_detail=True):
    """Process a single council."""
    log.info(f"Processing {council_id} ({config['name']})...")

    meetings = scrape_council_meetings(council_id, config, months_ahead, fetch_detail)

    if not meetings:
        log.warning(f"  {council_id}: No meetings found")
        # Still write empty meetings.json
        result = format_meetings_json(council_id, config, [])
    else:
        result = format_meetings_json(council_id, config, meetings)

    meeting_count = len(result['meetings'])
    log.info(f"  {council_id}: {meeting_count} meetings formatted")

    if dry_run:
        log.info(f"  DRY RUN: Would write {meeting_count} meetings to "
                 f"{DATA_DIR / council_id / 'meetings.json'}")
        return result

    # Write output
    out_dir = DATA_DIR / council_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / 'meetings.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    log.info(f"  Written: {out_path} ({meeting_count} meetings)")

    return result


def main():
    parser = argparse.ArgumentParser(
        description='Scrape ModernGov meetings for Lancashire councils'
    )
    parser.add_argument('--council', type=str, help='Single council ID to process')
    parser.add_argument('--months', type=int, default=2,
                        help='Months ahead to scrape (default: 2)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show what would be generated without writing files')
    parser.add_argument('--no-detail', action='store_true',
                        help='Skip fetching individual meeting detail pages (faster)')
    args = parser.parse_args()

    if not HAS_DEPS:
        print("ERROR: Install dependencies: pip install requests beautifulsoup4",
              file=sys.stderr)
        sys.exit(1)

    if args.council:
        if args.council not in COUNCILS:
            print(f"ERROR: Unknown council '{args.council}'. "
                  f"Available: {', '.join(sorted(COUNCILS.keys()))}",
                  file=sys.stderr)
            sys.exit(1)
        councils_to_process = {args.council: COUNCILS[args.council]}
    else:
        councils_to_process = COUNCILS

    total_meetings = 0
    results = {}

    for council_id, config in councils_to_process.items():
        try:
            result = process_council(
                council_id, config,
                months_ahead=args.months,
                dry_run=args.dry_run,
                fetch_detail=not args.no_detail,
            )
            meeting_count = len(result['meetings'])
            total_meetings += meeting_count
            results[council_id] = meeting_count
        except Exception as e:
            log.error(f"  {council_id}: FAILED — {e}")
            results[council_id] = -1

    # Summary
    print("\n" + "=" * 60)
    print("MEETINGS ETL COMPLETE")
    print("=" * 60)
    for council_id, count in results.items():
        status = f"{count} meetings" if count >= 0 else "FAILED"
        print(f"  {council_id}: {status}")
    print(f"\nTotal: {total_meetings} meetings across {len(results)} councils")
    if args.dry_run:
        print("(DRY RUN — no files written)")


if __name__ == '__main__':
    main()
