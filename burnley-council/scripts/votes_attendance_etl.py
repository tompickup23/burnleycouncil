#!/usr/bin/env python3
"""
votes_attendance_etl.py — Scrape recorded votes, attendance, and councillor details from ModernGov.

Generates:
  - voting.json          — Recorded votes + attendance data per council
  - Updates councillors.json with email, phone, roles, group info
  - Updates politics_summary.json with opposition groups + council leader

Data sources:
  - ModernGov: mgListRecordedVotes.aspx (recorded divisions)
  - ModernGov: mgUserAttendanceSummary.aspx (attendance per councillor)
  - ModernGov: mgUserInfo.aspx (councillor email, phone, committees)

Usage:
    python3 votes_attendance_etl.py --council lancashire_cc
    python3 votes_attendance_etl.py --council lancashire_cc --votes-only
    python3 votes_attendance_etl.py --council lancashire_cc --attendance-only
    python3 votes_attendance_etl.py --council lancashire_cc --enrich-details
    python3 votes_attendance_etl.py --dry-run

Requirements:
    pip install requests beautifulsoup4
"""

import argparse
import json
import logging
import re
import sys
import time
from collections import Counter, OrderedDict
from datetime import datetime
from pathlib import Path

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
log = logging.getLogger('VotesAttendanceETL')

# ── Paths ────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent  # burnley-council/
DATA_DIR = BASE_DIR / 'data'

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (AI DOGE Transparency Project; +https://aidoge.co.uk) Python/3',
}
RATE_LIMIT = 0.5  # seconds between requests

# ── Council Registry ─────────────────────────────────────────────────
COUNCILS = {
    'lancashire_cc': {
        'name': 'Lancashire County Council',
        'moderngov_url': 'https://council.lancashire.gov.uk',
    },
    'blackpool': {
        'name': 'Blackpool Council',
        'moderngov_url': 'https://democracy.blackpool.gov.uk',
    },
    'blackburn': {
        'name': 'Blackburn with Darwen Borough Council',
        'moderngov_url': 'https://democracy.blackburn.gov.uk',
    },
    'burnley': {
        'name': 'Burnley Borough Council',
        'moderngov_url': 'https://burnley.moderngov.co.uk',
    },
    'hyndburn': {
        'name': 'Hyndburn Borough Council',
        'moderngov_url': 'https://hyndburn.moderngov.co.uk',
    },
    'preston': {
        'name': 'Preston City Council',
        'moderngov_url': 'https://preston.moderngov.co.uk',
    },
    'west_lancashire': {
        'name': 'West Lancashire Borough Council',
        'moderngov_url': 'https://democracy.westlancs.gov.uk',
    },
    'wyre': {
        'name': 'Wyre Borough Council',
        'moderngov_url': 'https://wyre.moderngov.co.uk',
    },
    'lancaster': {
        'name': 'Lancaster City Council',
        'moderngov_url': 'https://committeeadmin.lancaster.gov.uk',
    },
    'chorley': {
        'name': 'Chorley Council',
        'moderngov_url': 'https://democracy.chorley.gov.uk',
    },
    'south_ribble': {
        'name': 'South Ribble Borough Council',
        'moderngov_url': 'https://southribble.moderngov.co.uk',
    },
}

# ── LCC-Specific Curated Data ────────────────────────────────────────
# This data cannot be scraped from ModernGov — maintained manually.
LCC_CURATED = {
    'council_leader': 'Stephen Atkinson',
    'council_leader_party': 'Reform UK',
    'opposition_groups': [
        {
            'name': 'Progressive Lancashire',
            'formal_opposition': True,
            'seats': 11,
            'composition': [
                {'party': 'Independent', 'count': 7},
                {'party': 'Green Party', 'count': 4},
            ],
            'leader': 'Azhar Ali OBE',
            'leader_ward': 'Nelson East',
            'deputy_leader': 'Gina Dowding',
            'deputy_leader_ward': 'Lancaster Central',
            'color': '#6AB023',
        },
        {
            'name': 'Conservative',
            'formal_opposition': False,
            'seats': 8,
            'composition': [{'party': 'Conservative', 'count': 8}],
            'leader': 'Aidy Riggott',
            'leader_ward': 'Euxton, Buckshaw & Astley',
            'deputy_leader': 'Peter Buckley',
            'deputy_leader_ward': 'St Annes North',
            'color': '#0087DC',
        },
        {
            'name': 'Liberal Democrats',
            'formal_opposition': False,
            'seats': 5,
            'composition': [{'party': 'Liberal Democrats', 'count': 5}],
            'leader': 'John Potter',
            'leader_ward': 'Preston West',
            'deputy_leader': None,
            'deputy_leader_ward': None,
            'color': '#FAA61A',
        },
        {
            'name': 'Labour',
            'formal_opposition': False,
            'seats': 5,
            'composition': [
                {'party': 'Labour', 'count': 3},
                {'party': 'Labour & Co-operative', 'count': 2},
            ],
            'leader': 'Mark Clifford',
            'leader_ward': 'Clayton with Whittle',
            'deputy_leader': None,
            'deputy_leader_ward': None,
            'color': '#DC241F',
        },
        {
            'name': 'Our West Lancashire',
            'formal_opposition': False,
            'seats': 2,
            'composition': [{'party': 'Our West Lancashire', 'count': 2}],
            'leader': 'Gordon Johnson',
            'leader_ward': 'Ormskirk',
            'deputy_leader': None,
            'deputy_leader_ward': None,
            'color': '#7B2D8E',
        },
    ],
    # Dual-hatted councillors: LCC councillor name → list of other council_ids
    'dual_hatted': {
        'Mark Clifford': ['chorley'],
        'Kim Snape': ['chorley'],
        'Noordad Aziz': ['hyndburn'],
        'Aidy Riggott': ['chorley'],
        'John Potter': ['preston'],
        'David Whipp': ['pendle'],
        'Gina Dowding': ['lancaster'],
        'Gordon Johnson': ['west_lancashire'],
        'Adrian Owens': ['west_lancashire'],
    },
    # Group leaders keyed by surname (for fuzzy matching against councillor names)
    'group_leaders': {
        'Atkinson': {'group': 'Reform UK', 'role': 'leader'},
        'Azhar Ali': {'group': 'Progressive Lancashire', 'role': 'leader'},
        'Gina Dowding': {'group': 'Progressive Lancashire', 'role': 'deputy_leader'},
        'Riggott': {'group': 'Conservative', 'role': 'leader'},
        'Peter Buckley': {'group': 'Conservative', 'role': 'deputy_leader'},
        'John Potter': {'group': 'Liberal Democrats', 'role': 'leader'},
        'Mark Clifford': {'group': 'Labour', 'role': 'leader'},
        'Gordon Johnson': {'group': 'Our West Lancashire', 'role': 'leader'},
    },
    # Notable facts for specific councillors
    'notable': {
        'Azhar Ali': ['Former Labour opposition leader (2017-2024)', 'Suspended from Labour Feb 2024, re-elected as Independent 2025', 'Leader of Progressive Lancashire coalition'],
        'Gina Dowding': ['Fourth-term county councillor (since 2013)', 'Former MEP for the North West', 'Deputy leader of Progressive Lancashire'],
        'Kim Snape': ['On LCC since 2013 (4 terms)', 'Raised care homes conflict of interest against Reform cabinet member', 'Subject of legal threats from cabinet member Graham Dalton'],
        'Aidy Riggott': ['Elected Conservative group leader May 2025', 'Also Chorley Borough councillor', 'Wrote ConservativeHome critique of Reform administration'],
        'David Whipp': ['Long-standing Pendle Borough councillor', 'Chair of Barnoldswick Town Council', 'Former LCC Lib Dem group leader (2017-2021)'],
        'Michael Lavalette': ['Academic, former Respect/Socialist Alliance councillor', 'Joined Your Party Aug 2025', 'Questioned by police over social media post Jul 2025'],
        'Usman Arif': ['Quit Labour Nov 2023 over Gaza stance'],
        'Mohammed Iqbal': ['Suspended from Labour Jun 2022'],
        'Yousuf Motala': ['Quit Labour Nov 2023 over Gaza stance', 'Nearly 15 years on LCC', 'Joined Your Party Aug 2025'],
        'Stephen Atkinson': ['Former Conservative leader of Ribble Valley BC', 'Defected to Reform UK Mar 2025', 'First Reform UK council leader in England'],
    },
}

BUDGET_KEYWORDS = re.compile(
    r'budget|revenue|precept|council\s*tax|financial\s*plan|capital\s*programme|medium\s*term',
    re.IGNORECASE,
)


def fetch_page(url, timeout=60):
    """Fetch a page with rate limiting and error handling."""
    time.sleep(RATE_LIMIT)
    try:
        resp = requests.get(url, headers=HEADERS, timeout=timeout)
        resp.raise_for_status()
        return BeautifulSoup(resp.text, 'html.parser')
    except Exception as e:
        log.warning(f"Failed to fetch {url}: {e}")
        return None


# ── Recorded Votes Scraping ──────────────────────────────────────────

def scrape_recorded_votes(base_url, start_date='01/01/2015', end_date=None):
    """Scrape all recorded votes from ModernGov mgListRecordedVotes.aspx.

    LCC page structure (and similar ModernGov sites):
      <h2> meeting title + date (e.g. "Full Council, Thursday, 14th March, 2024 1.00 pm")
      <h3> agenda item
      <h4> specific vote/amendment title (e.g. "Budget 2024/25 - Labour Amendment:")
      <p/span> status text (e.g. "Amendment status:Rejected")
      <table> councillor vote table (2 cols: Councillor, Vote)

    Returns list of vote dicts with per-councillor breakdown.
    """
    if end_date is None:
        end_date = datetime.now().strftime('%d/%m/%Y')

    dr = f"{start_date}-{end_date}"
    url = f"{base_url}/mgListRecordedVotes.aspx?UID=0&DR={dr}"
    log.info(f"Fetching recorded votes: {url}")

    soup = fetch_page(url)
    if not soup:
        return []

    votes = []

    # Strategy: iterate through h4 headings — each h4 = one recorded vote
    # The h2 above gives the meeting title + date
    h4s = soup.find_all('h4')
    tables = soup.find_all('table')
    table_idx = 0  # Tables appear in same order as h4s

    for h4 in h4s:
        title = h4.get_text(strip=True).rstrip(':')

        # Find parent h2 for meeting title + date
        h2 = h4.find_previous('h2')
        meeting = h2.get_text(strip=True) if h2 else ''

        # Extract date from meeting heading: "Full Council, Thursday, 14th March, 2024 1.00 pm"
        meeting_date = ''
        date_match = re.search(
            r'(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s*,?\s*(\d{4})',
            meeting, re.I,
        )
        if date_match:
            day, month_name, year = date_match.groups()
            try:
                dt = datetime.strptime(f"{day} {month_name} {year}", "%d %B %Y")
                meeting_date = dt.strftime('%Y-%m-%d')
            except ValueError:
                pass

        # Find status text: next sibling(s) after h4 until the table
        outcome = 'carried'
        sib = h4.find_next_sibling()
        for _ in range(5):
            if sib is None or sib.name == 'table' or sib.name in ['h2', 'h3', 'h4']:
                break
            sib_text = sib.get_text(strip=True)
            if re.search(r'(Rejected|Lost|Not Carried)', sib_text, re.I):
                outcome = 'rejected'
                break
            elif re.search(r'Carried', sib_text, re.I):
                outcome = 'carried'
                break
            sib = sib.find_next_sibling()

        # Get the vote table (next table after this h4)
        votes_by_councillor = []
        if table_idx < len(tables):
            votes_by_councillor = parse_vote_table(tables[table_idx])
            table_idx += 1

        # Count votes from individual records
        for_count = sum(1 for v in votes_by_councillor if v['vote'] == 'for')
        against_count = sum(1 for v in votes_by_councillor if v['vote'] == 'against')
        abstain_count = sum(1 for v in votes_by_councillor if v['vote'] == 'abstain')
        absent_count = sum(1 for v in votes_by_councillor if v['vote'] == 'absent')

        # Classify vote type
        full_text = f"{title} {meeting}".lower()
        is_budget = bool(BUDGET_KEYWORDS.search(full_text))
        is_amendment = 'amendment' in full_text

        vote_type = 'budget' if is_budget else 'motion'

        # Determine amendment_by from title (e.g. "Budget 2024/25 - Labour Amendment")
        amendment_by = None
        if is_amendment:
            for party in ['Labour', 'Conservative', 'Liberal Democrat', 'Green', 'Reform']:
                if party.lower() in full_text:
                    amendment_by = party
                    break

        # Generate stable ID
        vote_id = re.sub(r'[^a-z0-9]+', '-', title.lower().strip())[:60].strip('-')
        if meeting_date:
            vote_id = f"{meeting_date}-{vote_id}"

        votes.append({
            'id': vote_id,
            'meeting': meeting,
            'meeting_date': meeting_date,
            'title': title,
            'type': vote_type,
            'is_amendment': is_amendment,
            'amendment_by': amendment_by,
            'outcome': outcome,
            'for_count': for_count,
            'against_count': against_count,
            'abstain_count': abstain_count,
            'absent_count': absent_count,
            'votes_by_councillor': votes_by_councillor,
            'votes_by_party': {},  # Computed after merging with councillor data
        })

        log.info(f"  Vote: {title[:60]} ({meeting_date}) — {outcome} ({for_count}F/{against_count}A/{abstain_count}Ab)")

    log.info(f"Found {len(votes)} recorded votes")
    return votes


def parse_vote_table(table):
    """Parse a councillor vote table. Returns list of {name, uid, vote}.

    LCC tables have malformed HTML: the <td> for the name contains a nested <td> for the vote.
    BeautifulSoup sees: <td>Name<td>Vote</td></td><td>Vote</td>
    So we use the raw HTML structure: find_all('td', recursive=False) on each row,
    and use the LAST cell (the proper sibling) as the vote value.
    """
    councillors = []
    rows = table.find_all('tr')
    for row in rows[1:]:  # Skip header
        # Get ALL td cells (including nested ones from malformed HTML)
        all_cells = row.find_all('td')
        if len(all_cells) < 2:
            continue

        # The LAST td is always the correct vote cell (the properly-closed sibling)
        vote_text = all_cells[-1].get_text(strip=True).lower()

        # The councillor name: use the first td but strip the vote text that leaks in
        first_cell = all_cells[0]

        # Get name from link if present
        link = first_cell.find('a', href=True)
        uid = ''
        if link:
            uid_match = re.search(r'UID=(\d+)', link['href'])
            if uid_match:
                uid = uid_match.group(1)
            name = link.get_text(strip=True)
        else:
            # Extract only the direct text of the first td, not nested td content
            # Use .contents to get direct children and filter NavigableString
            name_parts = []
            for child in first_cell.children:
                if isinstance(child, str):
                    text = child.strip()
                    if text:
                        name_parts.append(text)
                elif child.name != 'td':
                    # Include text from non-td child elements (spans, etc.)
                    text = child.get_text(strip=True)
                    if text:
                        name_parts.append(text)
            name = ' '.join(name_parts).strip()

        if not name:
            # Fallback: get full text and strip known vote words from the end
            name = first_cell.get_text(strip=True)
            name = re.sub(r'(For|Against|Abstain|Absent|Did not vote)$', '', name, flags=re.I).strip()

        # Classify vote
        vote = 'absent'
        if vote_text in ['for', 'aye', 'yes']:
            vote = 'for'
        elif vote_text in ['against', 'no', 'noe']:
            vote = 'against'
        elif vote_text in ['abstain', 'abstention']:
            vote = 'abstain'
        elif vote_text in ['did not vote', 'absent', 'apologies']:
            vote = 'absent'

        if name and name.lower() not in ['councillor', 'name', 'member', '']:
            councillors.append({
                'name': name,
                'uid': uid,
                'vote': vote,
            })

    return councillors


# ── Attendance Scraping ──────────────────────────────────────────────

def scrape_attendance(base_url, start_date='01/05/2024', end_date=None):
    """Scrape attendance summary from ModernGov mgUserAttendanceSummary.aspx.

    Returns list of attendance records per councillor.
    Date range defaults to current term (May 2024 onwards for LCC).
    """
    if end_date is None:
        end_date = datetime.now().strftime('%d/%m/%Y')

    dr = f"{start_date}-{end_date}"
    url = f"{base_url}/mgUserAttendanceSummary.aspx?DR={dr}"
    log.info(f"Fetching attendance summary: {url}")

    soup = fetch_page(url)
    if not soup:
        return []

    records = []

    # Find the main attendance table
    table = soup.find('table')
    if not table:
        log.warning("No attendance table found")
        return []

    # Parse header row to understand columns
    header_row = table.find('tr')
    if not header_row:
        return []

    headers = [th.get_text(strip=True).lower() for th in header_row.find_all(['th', 'td'])]
    log.info(f"Attendance table headers: {headers}")

    rows = table.find_all('tr')[1:]  # Skip header
    for row in rows:
        cells = row.find_all(['td', 'th'])
        if len(cells) < 3:
            continue

        # First cell: councillor name with link
        name_cell = cells[0]
        name = name_cell.get_text(strip=True)
        uid = ''
        link = name_cell.find('a', href=True)
        if link:
            uid_match = re.search(r'UID=(\d+)', link['href'])
            if uid_match:
                uid = uid_match.group(1)

        if not name or name.lower() in ['councillor', 'name', 'member', 'total', '']:
            continue

        # Parse numeric columns
        values = []
        for cell in cells[1:]:
            text = cell.get_text(strip=True)
            try:
                values.append(int(text))
            except ValueError:
                values.append(0)

        # Map values to columns (ModernGov standard columns):
        # Expected, Present, Present virtual, Present as substitute virtual,
        # In attendance, In attendance virtual
        expected = values[0] if len(values) > 0 else 0
        present = values[1] if len(values) > 1 else 0
        present_virtual = values[2] if len(values) > 2 else 0
        substitute_virtual = values[3] if len(values) > 3 else 0
        in_attendance = values[4] if len(values) > 4 else 0
        in_attendance_virtual = values[5] if len(values) > 5 else 0

        total_present = present + present_virtual
        attendance_rate = round(total_present / expected, 3) if expected > 0 else 0.0

        records.append({
            'uid': uid,
            'name': name,
            'expected': expected,
            'present': present,
            'present_virtual': present_virtual,
            'substitute_virtual': substitute_virtual,
            'in_attendance': in_attendance,
            'in_attendance_virtual': in_attendance_virtual,
            'total_present': total_present,
            'attendance_rate': attendance_rate,
        })

    log.info(f"Found attendance records for {len(records)} councillors")
    return records


# ── Councillor Detail Enrichment ─────────────────────────────────────

def scrape_councillor_details(base_url, uid):
    """Scrape individual councillor page for email, phone, roles."""
    url = f"{base_url}/mgUserInfo.aspx?UID={uid}"
    soup = fetch_page(url, timeout=15)
    if not soup:
        return {'email': '', 'phone': '', 'roles': []}

    details = {'email': '', 'phone': '', 'roles': []}

    # Email
    email_link = soup.find('a', href=lambda h: h and 'mailto:' in str(h))
    if email_link:
        details['email'] = email_link.get_text(strip=True)

    # Phone
    tel_link = soup.find('a', href=lambda h: h and 'tel:' in str(h))
    if tel_link:
        details['phone'] = tel_link.get_text(strip=True)

    # Roles/committee memberships
    roles = []
    roles_section = soup.find(string=re.compile(r'Roles|Appointments|Committee', re.I))
    if roles_section:
        parent = roles_section.find_parent(['div', 'section', 'table', 'ul'])
        if parent:
            items = parent.find_all('li')
            if items:
                roles = [li.get_text(strip=True) for li in items if li.get_text(strip=True)]
            else:
                # Try table rows
                trs = parent.find_all('tr')
                for tr in trs:
                    text = tr.get_text(strip=True)
                    if text and len(text) > 3:
                        roles.append(text)

    # Also check for a committee membership list
    if not roles:
        committee_links = soup.find_all('a', href=re.compile(r'mgCommitteeDetails'))
        for link in committee_links:
            role_text = link.get_text(strip=True)
            if role_text and role_text not in roles:
                roles.append(role_text)

    details['roles'] = roles[:20]  # Cap at 20 roles
    return details


# ── Data Enrichment ──────────────────────────────────────────────────

def enrich_councillors(councillors, attendance_records, council_id):
    """Enrich councillors.json with attendance, group roles, dual-hatted info, notable facts."""
    curated = LCC_CURATED if council_id == 'lancashire_cc' else {}

    # Build attendance lookup by UID
    attendance_by_uid = {r['uid']: r for r in attendance_records}

    # Build group leaders lookup
    group_leaders = curated.get('group_leaders', {})
    dual_hatted = curated.get('dual_hatted', {})
    notable = curated.get('notable', {})

    for c in councillors:
        uid = c.get('moderngov_uid', '')
        name = c.get('name', '')

        # Strip title prefix for matching: "County Councillor Mr Joel Michael Tetlow" → "Joel Michael Tetlow"
        clean_name = re.sub(r'^(County\s+)?Councillor\s+(Mr|Mrs|Ms|Miss|Dr|Prof|Cllr|Sir|Dame|Lord|Lady|Reverend|Rev)?\s*', '', name, flags=re.I).strip()

        # Match group role
        c['group_role'] = None
        c['group_name'] = None
        for key, info in group_leaders.items():
            if key.lower() in clean_name.lower() or key.lower() in name.lower():
                c['group_role'] = info['role']
                c['group_name'] = info['group']
                break

        # Match dual-hatted
        c['dual_hatted'] = []
        for dh_name, councils in dual_hatted.items():
            if dh_name.lower() in clean_name.lower() or dh_name.lower() in name.lower():
                c['dual_hatted'] = councils
                break

        # Match notable facts
        c['notable'] = []
        for n_name, facts in notable.items():
            if n_name.lower() in clean_name.lower() or n_name.lower() in name.lower():
                c['notable'] = facts
                break

    return councillors


def compute_votes_by_party(votes, councillors):
    """Add votes_by_party breakdown to each vote using councillor party data."""
    # Build UID → party lookup
    uid_to_party = {}
    name_to_party = {}
    for c in councillors:
        uid = c.get('moderngov_uid', '')
        party = c.get('party', 'Unknown')
        if uid:
            uid_to_party[uid] = party
        name = c.get('name', '')
        clean = re.sub(r'^(County\s+)?Councillor\s+(Mr|Mrs|Ms|Miss|Dr|Prof|Cllr|Sir|Dame|Lord|Lady|Reverend|Rev)?\s*', '', name, flags=re.I).strip()
        if clean:
            name_to_party[clean.lower()] = party

    for vote in votes:
        by_party = {}
        for cv in vote.get('votes_by_councillor', []):
            # Try UID lookup first, then name
            party = uid_to_party.get(cv.get('uid', ''), '')
            if not party:
                cv_name = cv.get('name', '')
                clean_cv = re.sub(r'^(County\s+)?Councillor\s+(Mr|Mrs|Ms|Miss|Dr|Prof|Cllr|Sir|Dame|Lord|Lady|Reverend|Rev)?\s*', '', cv_name, flags=re.I).strip()
                party = name_to_party.get(clean_cv.lower(), 'Unknown')

            if party not in by_party:
                by_party[party] = {'for': 0, 'against': 0, 'abstain': 0, 'absent': 0}

            v = cv.get('vote', 'absent')
            if v in by_party[party]:
                by_party[party][v] += 1

        vote['votes_by_party'] = by_party

    return votes


def compute_attendance_by_party(attendance_records, councillors):
    """Compute average attendance rate by party."""
    uid_to_party = {}
    for c in councillors:
        uid = c.get('moderngov_uid', '')
        party = c.get('party', 'Unknown')
        if uid:
            uid_to_party[uid] = party

    party_rates = {}
    for rec in attendance_records:
        party = uid_to_party.get(rec.get('uid', ''), 'Unknown')
        if party not in party_rates:
            party_rates[party] = {'total_rate': 0, 'count': 0}
        party_rates[party]['total_rate'] += rec.get('attendance_rate', 0)
        party_rates[party]['count'] += 1

    result = {}
    for party, data in party_rates.items():
        result[party] = {
            'avg_attendance_rate': round(data['total_rate'] / data['count'], 3) if data['count'] > 0 else 0,
            'count': data['count'],
        }

    return result


# ── Committee Membership Scraping ────────────────────────────────────

COMMITTEE_TYPE_MAP = {
    'cabinet': 'executive',
    'executive': 'executive',
    'scrutiny': 'scrutiny',
    'audit': 'audit',
    'planning': 'planning',
    'pension': 'pension',
    'standards': 'standards',
    'health': 'scrutiny',
    'education': 'scrutiny',
    'budget': 'scrutiny',
    'finance': 'scrutiny',
    'children': 'scrutiny',
    'environment': 'scrutiny',
    'highways': 'scrutiny',
    'corporate': 'scrutiny',
    'overview': 'scrutiny',
    'regulatory': 'regulatory',
    'licensing': 'regulatory',
    'development': 'planning',
    'governance': 'governance',
    'combined': 'partnership',
    'joint': 'partnership',
    'partnership': 'partnership',
    'board': 'partnership',
}


def classify_committee_type(name):
    """Classify committee type from its name."""
    lower = name.lower()
    for keyword, ctype in COMMITTEE_TYPE_MAP.items():
        if keyword in lower:
            return ctype
    return 'other'


def scrape_committees(base_url, councillors):
    """Scrape committee memberships from ModernGov mgListCommittees.aspx.

    For each committee, fetches mgCommitteeDetails.aspx?ID={cid} to get members.
    Cross-references with councillors.json for party data.
    """
    url = f"{base_url}/mgListCommittees.aspx"
    log.info(f"Fetching committee list: {url}")

    soup = fetch_page(url)
    if not soup:
        return []

    # Build councillor lookups — UID is primary key (committee pages use abbreviated names)
    uid_to_party = {}
    uid_to_name = {}
    name_to_party = {}
    for c in councillors:
        raw_name = c.get('name', '')
        clean = re.sub(
            r'^(County\s+)?Councillor\s+(Mr|Mrs|Ms|Miss|Dr|Prof|Cllr|Sir|Dame|Lord|Lady|Reverend|Rev)?\s*',
            '', raw_name, flags=re.I
        ).strip()
        party = c.get('party', 'Unknown')
        uid = c.get('moderngov_uid', '')
        if uid:
            uid_to_party[uid] = party
            uid_to_name[uid] = clean
        if clean:
            name_to_party[clean.lower()] = party
        if raw_name:
            name_to_party[raw_name.lower()] = party

    # Find all committee links — look for mgCommitteeDetails links
    committee_links = soup.find_all('a', href=re.compile(r'mgCommitteeDetails\.aspx\?ID=\d+'))
    seen_cids = set()
    committees = []

    for link in committee_links:
        cid_match = re.search(r'ID=(\d+)', link['href'])
        if not cid_match:
            continue
        cid = cid_match.group(1)
        if cid in seen_cids:
            continue
        seen_cids.add(cid)

        committee_name = link.get_text(strip=True)
        if not committee_name or len(committee_name) < 3:
            continue

        # Skip sub-committees and working groups to focus on main committees
        lower_name = committee_name.lower()
        if any(skip in lower_name for skip in ['working group', 'task group', 'panel']):
            continue

        log.info(f"  Fetching members for: {committee_name} (CId={cid})")

        # Fetch the committee detail page
        detail_url = f"{base_url}/mgCommitteeDetails.aspx?ID={cid}"
        detail_soup = fetch_page(detail_url)
        if not detail_soup:
            continue

        members = []
        # Look for member links on the committee page
        member_links = detail_soup.find_all('a', href=re.compile(r'mgUserInfo\.aspx\?UID=\d+'))
        seen_uids = set()
        for mlink in member_links:
            uid_match = re.search(r'UID=(\d+)', mlink['href'])
            if not uid_match:
                continue
            member_uid = uid_match.group(1)
            if member_uid in seen_uids:
                continue
            seen_uids.add(member_uid)

            member_name_raw = mlink.get_text(strip=True)
            if not member_name_raw or len(member_name_raw) < 3:
                continue

            # Use UID to get full name and party from councillors.json (committee pages use abbreviated names)
            clean_member = uid_to_name.get(member_uid, '')
            if not clean_member:
                # Fallback: strip councillor title from scraped name
                clean_member = re.sub(
                    r'^(County\s+)?Councillor\s+(CC\s+)?(Mr|Mrs|Ms|Miss|Dr|Prof|Cllr|Sir|Dame|Lord|Lady|Reverend|Rev)?\s*',
                    '', member_name_raw, flags=re.I
                ).strip()

            party = uid_to_party.get(member_uid, name_to_party.get(clean_member.lower(), 'Unknown'))

            # Determine role: check surrounding text for Chair/Deputy/etc.
            role = 'Member'
            parent = mlink.find_parent(['tr', 'li', 'p', 'div'])
            if parent:
                parent_text = parent.get_text(strip=True).lower()
                if 'chair' in parent_text and 'deputy' not in parent_text:
                    role = 'Chair'
                elif 'deputy chair' in parent_text or 'vice chair' in parent_text:
                    role = 'Deputy Chair'
                elif 'leader' in parent_text and 'deputy' not in parent_text:
                    role = 'Leader'
                elif 'deputy leader' in parent_text:
                    role = 'Deputy Leader'

            members.append({
                'name': clean_member,
                'uid': member_uid,
                'role': role,
                'party': party,
            })

        committee_id = re.sub(r'[^a-z0-9]+', '-', committee_name.lower().strip())[:60].strip('-')
        committees.append({
            'id': committee_id,
            'name': committee_name,
            'type': classify_committee_type(committee_name),
            'moderngov_cid': cid,
            'members': members,
        })

        log.info(f"    → {len(members)} members ({sum(1 for m in members if m['party'] == 'Reform UK')} Reform)")

    # Sort: executive first, then scrutiny, then others
    type_order = {'executive': 0, 'scrutiny': 1, 'audit': 2, 'planning': 3, 'regulatory': 4, 'pension': 5, 'governance': 6, 'partnership': 7, 'other': 9}
    committees.sort(key=lambda c: (type_order.get(c['type'], 8), c['name']))

    log.info(f"Scraped {len(committees)} committees with {sum(len(c['members']) for c in committees)} total member slots")
    return committees


# ── Main ─────────────────────────────────────────────────────────────

def run_council(council_id, args):
    """Run ETL for a single council."""
    council = COUNCILS.get(council_id)
    if not council:
        log.error(f"Unknown council: {council_id}")
        return

    base_url = council['moderngov_url']
    if not base_url:
        log.error(f"No ModernGov URL for {council_id}")
        return

    out_dir = DATA_DIR / council_id
    out_dir.mkdir(parents=True, exist_ok=True)

    # Load existing councillors
    councillors_path = out_dir / 'councillors.json'
    councillors = []
    if councillors_path.exists():
        with open(councillors_path) as f:
            councillors = json.load(f)
        log.info(f"Loaded {len(councillors)} councillors from {councillors_path}")
    else:
        log.warning(f"No councillors.json found at {councillors_path} — run councillors_etl.py first")

    # ── Scrape committees (standalone mode) ──
    if args.committees:
        committees = scrape_committees(base_url, councillors)
        if args.dry_run:
            log.info(f"[DRY RUN] Would write committees.json: {len(committees)} committees")
            return

        committees_data = {
            'last_updated': datetime.now().isoformat(),
            'source': base_url,
            'council_id': council_id,
            'total_committees': len(committees),
            'committees': committees,
        }
        committees_path = out_dir / 'committees.json'
        with open(committees_path, 'w') as f:
            json.dump(committees_data, f, indent=2, ensure_ascii=False)
        log.info(f"Wrote {committees_path} ({len(committees)} committees)")
        return

    # ── Scrape recorded votes ──
    votes = []
    if not args.attendance_only and not args.enrich_details:
        votes = scrape_recorded_votes(base_url)

    # ── Scrape attendance ──
    attendance_records = []
    if not args.votes_only and not args.enrich_details:
        # Use current term start for LCC (May 2025 elections)
        start = '01/05/2025' if council_id == 'lancashire_cc' else '01/01/2023'
        attendance_records = scrape_attendance(base_url, start_date=start)

    # ── Enrich councillor details (email, phone, roles) ──
    if args.enrich_details or (not args.votes_only and not args.attendance_only):
        if councillors and not args.votes_only and not args.attendance_only:
            log.info(f"Enriching {len(councillors)} councillor detail pages...")
            for i, c in enumerate(councillors):
                uid = c.get('moderngov_uid', '')
                if uid:
                    details = scrape_councillor_details(base_url, uid)
                    if details.get('email'):
                        c['email'] = details['email']
                    if details.get('phone'):
                        c['phone'] = details['phone']
                    if details.get('roles'):
                        c['roles'] = details['roles']
                    if (i + 1) % 10 == 0:
                        log.info(f"  Enriched {i + 1}/{len(councillors)} councillors")

    # ── Compute party breakdowns ──
    if votes and councillors:
        votes = compute_votes_by_party(votes, councillors)

    attendance_by_party = {}
    if attendance_records and councillors:
        attendance_by_party = compute_attendance_by_party(attendance_records, councillors)

    # ── Enrich councillors with curated data ──
    if councillors:
        councillors = enrich_councillors(councillors, attendance_records, council_id)

    # ── Sort votes by date descending, budget votes first ──
    votes.sort(key=lambda v: (
        0 if v.get('type') == 'budget' else 1,
        v.get('meeting_date', '') or '0000-00-00',
    ), reverse=True)

    # ── Build voting.json ──
    voting_data = {
        'last_updated': datetime.now().isoformat(),
        'source': base_url,
        'council_id': council_id,
        'total_recorded_votes': len(votes),
        'votes': votes,
        'attendance': {
            'date_range': f"{'01 May 2025' if council_id == 'lancashire_cc' else '01 Jan 2023'} to {datetime.now().strftime('%d %b %Y')}",
            'councillors': attendance_records,
            'by_party': attendance_by_party,
        },
    }

    if args.dry_run:
        log.info(f"[DRY RUN] Would write voting.json: {len(votes)} votes, {len(attendance_records)} attendance records")
        log.info(f"[DRY RUN] Would update councillors.json: {len(councillors)} councillors")
        return

    # ── Write voting.json ──
    voting_path = out_dir / 'voting.json'
    with open(voting_path, 'w') as f:
        json.dump(voting_data, f, indent=2, ensure_ascii=False)
    log.info(f"Wrote {voting_path} ({len(votes)} votes, {len(attendance_records)} attendance records)")

    # ── Write updated councillors.json ──
    if councillors:
        with open(councillors_path, 'w') as f:
            json.dump(councillors, f, indent=2, ensure_ascii=False)
        log.info(f"Updated {councillors_path} ({len(councillors)} councillors)")

    # ── Update politics_summary.json ──
    summary_path = out_dir / 'politics_summary.json'
    if summary_path.exists():
        with open(summary_path) as f:
            summary = json.load(f)

        curated = LCC_CURATED if council_id == 'lancashire_cc' else {}
        if curated.get('council_leader'):
            summary['council_leader'] = curated['council_leader']
        if curated.get('opposition_groups'):
            summary['opposition_groups'] = curated['opposition_groups']

        with open(summary_path, 'w') as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        log.info(f"Updated {summary_path}")

    log.info(f"Done: {council_id}")


def main():
    parser = argparse.ArgumentParser(
        description='Scrape recorded votes, attendance, and councillor details from ModernGov'
    )
    parser.add_argument('--council', type=str, help='Single council ID (e.g. lancashire_cc)')
    parser.add_argument('--votes-only', action='store_true', help='Only scrape recorded votes')
    parser.add_argument('--attendance-only', action='store_true', help='Only scrape attendance')
    parser.add_argument('--enrich-details', action='store_true', help='Only enrich councillor email/phone/roles')
    parser.add_argument('--committees', action='store_true', help='Scrape committee memberships only')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be generated')
    args = parser.parse_args()

    if not HAS_DEPS:
        log.error("Missing dependencies. Run: pip install requests beautifulsoup4")
        sys.exit(1)

    councils_to_run = [args.council] if args.council else list(COUNCILS.keys())
    for cid in councils_to_run:
        if cid not in COUNCILS:
            log.error(f"Unknown council: {cid}")
            continue
        run_council(cid, args)


if __name__ == '__main__':
    main()
