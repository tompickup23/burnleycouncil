#!/usr/bin/env python3
"""
register_of_interests_etl.py — Scrape councillor register of interests from ModernGov.

Scrapes mgRofI.aspx?UID={uid} for each councillor and extracts declared interests
across standard categories (employment, securities, sponsorship, contracts, land).

The declared companies/securities are used as anchors for the integrity checker:
if a councillor declares Company X, we can look up Company X on Companies House
and confirm the councillor's DOB, which then becomes a discriminator for all
other CH officer matches.

Output: register_of_interests.json per council in burnley-council/data/{council_id}/

Usage:
    python3 register_of_interests_etl.py --council burnley
    python3 register_of_interests_etl.py --all
    python3 register_of_interests_etl.py --all --dry-run

Requirements:
    pip install requests beautifulsoup4
"""

import argparse
import json
import logging
import os
import re
import sys
import time
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
log = logging.getLogger('RegisterETL')

BASE_DIR = Path(__file__).parent.parent  # burnley-council/
DATA_DIR = BASE_DIR / 'data'

# ModernGov URLs for councils that have it
MODERNGOV_URLS = {
    'burnley': 'https://burnley.moderngov.co.uk',
    'hyndburn': 'https://hyndburn.moderngov.co.uk',
    'lancashire_cc': 'https://council.lancashire.gov.uk',
    'blackpool': 'https://democracy.blackpool.gov.uk',
    'blackburn': 'https://democracy.blackburn.gov.uk',
    'preston': 'https://preston.moderngov.co.uk',
    'west_lancashire': 'https://democracy.westlancs.gov.uk',
    'wyre': 'https://wyre.moderngov.co.uk',
    'lancaster': 'https://committeeadmin.lancaster.gov.uk',
    'chorley': 'https://democracy.chorley.gov.uk',
    'south_ribble': 'https://southribble.moderngov.co.uk',
    # No ModernGov:
    # pendle, rossendale, ribble_valley, fylde
}

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (AI DOGE Transparency Project; +https://aidoge.co.uk) Python/3',
}

# Standard ModernGov register of interests sections
# These are the HTML section headers we look for
INTEREST_SECTIONS = [
    'employment',
    'sponsorship',
    'contracts',
    'land',
    'licences',
    'corporate tenancies',
    'securities',
    'memberships',
    'gifts and hospitality',
]


def scrape_register_page(base_url, uid):
    """Scrape a single councillor's register of interests page.

    Returns dict with extracted interests, or None if page not available.
    """
    url = f"{base_url}/mgRofI.aspx?UID={uid}"

    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
    except requests.RequestException as e:
        log.debug(f"  Failed to fetch register for UID {uid}: {e}")
        return None

    soup = BeautifulSoup(resp.text, 'html.parser')

    # Check if page has actual register content
    # Some councils return the page but with "No register" message
    page_text = soup.get_text()
    if 'no registered interests' in page_text.lower() or 'no interests registered' in page_text.lower():
        return {
            'has_register': True,
            'empty': True,
            'sections': {},
            'declared_companies': [],
            'declared_employment': [],
            'declared_land': [],
            'declared_sponsorship': [],
            'declared_contracts': [],
            'declared_securities': [],
            'declared_memberships': [],
            'all_declared_items': [],
        }

    result = {
        'has_register': True,
        'empty': False,
        'sections': {},
        'declared_companies': [],
        'declared_employment': [],
        'declared_land': [],
        'declared_sponsorship': [],
        'declared_contracts': [],
        'declared_securities': [],
        'declared_memberships': [],
        'all_declared_items': [],
    }

    # ModernGov register pages use various structures:
    # Strategy 1 (primary): mgInterestsTable with <caption> — Burnley, Chorley, South Ribble, LCC, Preston etc.
    # Strategy 2: <h3> section headers + <table> or <div> content
    # Strategy 3: <div class="mgRofISection"> blocks
    # Strategy 4: Single big table with section headers in first column

    # Strategy 1: mgInterestsTable with <caption> elements (most common across Lancashire)
    interest_tables = soup.find_all('table', class_='mgInterestsTable')
    if not interest_tables:
        # Also try tables inside mgDeclarations form
        decl_form = soup.find('div', class_='mgDeclarations')
        if decl_form:
            interest_tables = decl_form.find_all('table')

    for table in interest_tables:
        caption = table.find('caption')
        if not caption:
            continue
        caption_text = caption.get_text(strip=True).lower()

        # Map caption text to our standard sections
        matched_section = None
        # Order matters — more specific matches first to avoid false positives
        caption_mappings = [
            ('corporate tenancies', ['corporate tenancies', 'corporate/business tenanc', 'corporate tenanc']),
            ('licences', ['licen']),
            ('gifts and hospitality', ['gift', 'hospitality']),
            ('securities', ['securities', 'shares', 'share capital', 'beneficial interest in securities']),
            ('sponsorship', ['sponsorship', 'financial benefit', 'election expenses']),
            ('contracts', ['contract']),
            ('land', ['beneficial interest in land', 'land which is within']),
            ('employment', ['employment', 'directorship', 'profession', 'vocation']),
            ('memberships', ['membership', 'other interest']),
        ]
        for section, keywords in caption_mappings:
            for kw in keywords:
                if kw in caption_text:
                    matched_section = section
                    break
            if matched_section:
                break

        if not matched_section:
            continue

        # Extract data rows (skip header row with <th>)
        items = []
        rows = table.find_all('tr')
        for row in rows:
            cells = row.find_all('td')
            if not cells:
                continue
            for cell in cells:
                text = cell.get_text(strip=True)
                if text and text.lower() not in ['none', 'nil', 'n/a', '', 'none declared',
                                                  'nil return', '-']:
                    items.append(text)

        items = [item for item in items
                 if item.lower().strip() not in ['none', 'nil', 'n/a', 'none declared',
                                                  'nil return', '-', '']]

        if items:
            if matched_section not in result['sections']:
                result['sections'][matched_section] = []
            result['sections'][matched_section].extend(items)

    # Strategy 2: Find all heading-like elements that match interest categories
    if not result['sections']:
        all_headings = soup.find_all(['h2', 'h3', 'h4'])

        for heading in all_headings:
            heading_text = heading.get_text(strip=True).lower()

            # Match to known sections
            matched_section = None
            for section in INTEREST_SECTIONS:
                if section in heading_text:
                    matched_section = section
                    break

            if not matched_section:
                continue

            # Extract content after this heading until the next heading
            items = []
            sibling = heading.find_next_sibling()
            while sibling and sibling.name not in ['h2', 'h3', 'h4']:
                # Extract text from tables
                if sibling.name == 'table':
                    for row in sibling.find_all('tr'):
                        cells = row.find_all(['td', 'th'])
                        row_text = ' | '.join(cell.get_text(strip=True) for cell in cells if cell.get_text(strip=True))
                        if row_text and row_text.lower() not in ['none', 'nil', 'n/a', '']:
                            items.append(row_text)
                # Extract text from lists
                elif sibling.name in ['ul', 'ol']:
                    for li in sibling.find_all('li'):
                        li_text = li.get_text(strip=True)
                        if li_text and li_text.lower() not in ['none', 'nil', 'n/a']:
                            items.append(li_text)
                # Extract text from divs/paragraphs
                elif sibling.name in ['div', 'p']:
                    text = sibling.get_text(strip=True)
                    if text and text.lower() not in ['none', 'nil', 'n/a', '']:
                        items.append(text)

                sibling = sibling.find_next_sibling()

            # Filter out "None" / "Nil" items
            items = [item for item in items if item.lower().strip() not in ['none', 'nil', 'n/a', 'none declared', 'nil return']]

            if items:
                result['sections'][matched_section] = items

    # Strategy 3: If no headings found, try mgRofI-specific divs
    if not result['sections']:
        rofi_sections = soup.find_all('div', class_=re.compile(r'mgRofI', re.I))
        for section_div in rofi_sections:
            header = section_div.find(['h3', 'h4', 'strong', 'b'])
            if not header:
                continue
            header_text = header.get_text(strip=True).lower()
            matched_section = None
            for section in INTEREST_SECTIONS:
                if section in header_text:
                    matched_section = section
                    break
            if not matched_section:
                continue

            items = []
            for elem in section_div.find_all(['td', 'li', 'p']):
                text = elem.get_text(strip=True)
                if text and text != header.get_text(strip=True) and text.lower() not in ['none', 'nil', 'n/a']:
                    items.append(text)

            if items:
                result['sections'][matched_section] = items

    # Strategy 3: Try table-based format (some councils use a single big table)
    if not result['sections']:
        tables = soup.find_all('table')
        for table in tables:
            rows = table.find_all('tr')
            current_section_name = None
            for row in rows:
                cells = row.find_all(['td', 'th'])
                if len(cells) >= 1:
                    first_cell = cells[0].get_text(strip=True).lower()
                    # Check if first cell is a section header
                    for section in INTEREST_SECTIONS:
                        if section in first_cell:
                            current_section_name = section
                            break

                    if current_section_name and len(cells) >= 2:
                        value = cells[-1].get_text(strip=True)
                        if value and value.lower() not in ['none', 'nil', 'n/a', '']:
                            if current_section_name not in result['sections']:
                                result['sections'][current_section_name] = []
                            result['sections'][current_section_name].append(value)

    # Categorise extracted items
    for section, items in result['sections'].items():
        if section == 'employment':
            result['declared_employment'].extend(items)
        elif section == 'securities':
            result['declared_securities'].extend(items)
            # Securities often contain company names — extract them
            for item in items:
                result['declared_companies'].append(item)
        elif section == 'sponsorship':
            result['declared_sponsorship'].extend(items)
        elif section == 'contracts':
            result['declared_contracts'].extend(items)
        elif section == 'land':
            result['declared_land'].extend(items)
        elif section == 'memberships':
            result['declared_memberships'].extend(items)

        # Add all items to the flat list
        for item in items:
            result['all_declared_items'].append({
                'section': section,
                'text': item,
            })

    # Also check employment for company-like names (Ltd, Limited, PLC, LLP)
    company_patterns = re.compile(r'\b(ltd|limited|plc|llp|inc|corp|group|holdings)\b', re.I)
    for item in result['declared_employment']:
        if company_patterns.search(item):
            if item not in result['declared_companies']:
                result['declared_companies'].append(item)

    # Also check contracts for company names
    for item in result.get('declared_contracts', []):
        if company_patterns.search(item):
            if item not in result['declared_companies']:
                result['declared_companies'].append(item)

    return result


def extract_company_names(text):
    """Extract likely company names from register text.

    Handles formats like:
    - "Director of ABC Ltd"
    - "ABC Limited - 50 shares"
    - "Shares in XYZ PLC"
    """
    companies = []

    # Pattern: "Director/Owner/Partner of COMPANY"
    m = re.search(r'(?:director|owner|partner|shareholder|member)\s+(?:of|at|in)\s+(.+?)(?:\s*[-–—]\s*|\s*\(|\s*$)', text, re.I)
    if m:
        companies.append(m.group(1).strip())

    # Pattern: "Shares in COMPANY"
    m = re.search(r'shares?\s+in\s+(.+?)(?:\s*[-–—]\s*|\s*\(|\s*$)', text, re.I)
    if m:
        companies.append(m.group(1).strip())

    # If text itself looks like a company name (has Ltd/Limited/etc)
    if re.search(r'\b(ltd|limited|plc|llp)\b', text, re.I):
        # Extract the company name part
        # Remove common prefixes
        cleaned = re.sub(r'^(?:director|owner|partner|shareholder|member|shares?)\s+(?:of|at|in)\s+', '', text, flags=re.I)
        cleaned = re.sub(r'\s*[-–—]\s+.*$', '', cleaned)  # Remove trailing descriptions
        cleaned = re.sub(r'\s*\(.*?\)\s*$', '', cleaned)   # Remove parenthetical
        cleaned = cleaned.strip()
        if cleaned and cleaned not in companies:
            companies.append(cleaned)

    return companies


def process_council(council_id, dry_run=False):
    """Process register of interests for a single council."""
    base_url = MODERNGOV_URLS.get(council_id)

    if not base_url:
        log.info(f"  {council_id}: No ModernGov URL — register not available")
        output_dir = DATA_DIR / council_id
        if not dry_run and output_dir.exists():
            result = {
                'generated': datetime.now().strftime('%Y-%m-%d'),
                'council_id': council_id,
                'register_available': False,
                'source': 'N/A — council does not use ModernGov',
                'councillors': {},
            }
            filepath = output_dir / 'register_of_interests.json'
            with open(filepath, 'w') as f:
                json.dump(result, f, indent=2, ensure_ascii=False)
            log.info(f"  Wrote stub {filepath}")
        return True

    # Load councillors.json to get UIDs
    councillors_path = DATA_DIR / council_id / 'councillors.json'
    if not councillors_path.exists():
        log.error(f"  {council_id}: No councillors.json found at {councillors_path}")
        return False

    with open(councillors_path) as f:
        councillors = json.load(f)

    # Check for UIDs
    councillors_with_uid = [c for c in councillors if c.get('moderngov_uid')]
    if not councillors_with_uid:
        log.warning(f"  {council_id}: No councillors have moderngov_uid — run councillors_etl.py first")
        # Try to infer UIDs from the ModernGov member index
        log.info(f"  Attempting to scrape UIDs from {base_url}/mgMemberIndex.aspx...")
        try:
            # Quick scrape to get UIDs
            from councillors_etl import scrape_moderngov
            raw = scrape_moderngov(base_url, council_id)
            uid_map = {}
            for r in raw:
                if r.get('uid'):
                    # Match by name (normalised)
                    clean_name = re.sub(r'^(Cllr|Councillor)\s+', '', r['name'], flags=re.I).strip()
                    uid_map[clean_name.lower()] = r['uid']

            # Assign UIDs to councillors
            for c in councillors:
                name_lower = c['name'].lower()
                if name_lower in uid_map:
                    c['moderngov_uid'] = uid_map[name_lower]

            councillors_with_uid = [c for c in councillors if c.get('moderngov_uid')]
            log.info(f"  Resolved {len(councillors_with_uid)}/{len(councillors)} UIDs from ModernGov")
        except Exception as e:
            log.error(f"  Failed to resolve UIDs: {e}")
            return False

    log.info(f"  {council_id}: Processing {len(councillors_with_uid)}/{len(councillors)} councillors with UIDs")

    if dry_run:
        log.info(f"  DRY RUN — would scrape {len(councillors_with_uid)} register pages")
        return True

    result = {
        'generated': datetime.now().strftime('%Y-%m-%d'),
        'council_id': council_id,
        'register_available': True,
        'source': f'ModernGov Register of Interests ({base_url})',
        'total_councillors': len(councillors),
        'councillors_with_register': 0,
        'councillors_with_interests': 0,
        'total_declared_companies': 0,
        'councillors': {},
    }

    for i, c in enumerate(councillors_with_uid):
        uid = c['moderngov_uid']
        cid = c['id']
        name = c['name']

        log.info(f"  [{i+1}/{len(councillors_with_uid)}] {name} (UID {uid})...")

        register = scrape_register_page(base_url, uid)

        if register is None:
            log.debug(f"    No register page found")
            continue

        result['councillors_with_register'] += 1

        entry = {
            'name': name,
            'moderngov_uid': uid,
            'has_register': register['has_register'],
            'empty': register.get('empty', False),
            'declared_companies': register.get('declared_companies', []),
            'declared_employment': register.get('declared_employment', []),
            'declared_securities': register.get('declared_securities', []),
            'declared_land': register.get('declared_land', []),
            'declared_sponsorship': register.get('declared_sponsorship', []),
            'declared_contracts': register.get('declared_contracts', []),
            'declared_memberships': register.get('declared_memberships', []),
            'all_declared_items': register.get('all_declared_items', []),
            'sections': register.get('sections', {}),
        }

        if not register.get('empty', True):
            result['councillors_with_interests'] += 1

        if entry['declared_companies']:
            result['total_declared_companies'] += len(entry['declared_companies'])
            log.info(f"    Found {len(entry['declared_companies'])} declared companies: {entry['declared_companies'][:3]}")

        result['councillors'][cid] = entry

        time.sleep(0.5)  # Rate limit

    # Also add entries for councillors WITHOUT UIDs (mark as no register)
    for c in councillors:
        if c['id'] not in result['councillors'] and not c.get('moderngov_uid'):
            result['councillors'][c['id']] = {
                'name': c['name'],
                'moderngov_uid': '',
                'has_register': False,
                'empty': True,
                'declared_companies': [],
                'declared_employment': [],
                'declared_securities': [],
                'declared_land': [],
                'declared_sponsorship': [],
                'declared_contracts': [],
                'declared_memberships': [],
                'all_declared_items': [],
                'sections': {},
            }

    # Write output
    output_dir = DATA_DIR / council_id
    filepath = output_dir / 'register_of_interests.json'
    with open(filepath, 'w') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    log.info(f"  Wrote {filepath} ({os.path.getsize(filepath):,} bytes)")
    log.info(f"  Summary: {result['councillors_with_register']} registers found, "
             f"{result['councillors_with_interests']} with interests, "
             f"{result['total_declared_companies']} declared companies")

    return True


def main():
    parser = argparse.ArgumentParser(description='Scrape councillor register of interests from ModernGov')
    parser.add_argument('--council', type=str, help='Single council ID to process')
    parser.add_argument('--all', action='store_true', help='Process all councils')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be scraped without writing')
    args = parser.parse_args()

    if not HAS_DEPS:
        log.error("Missing dependencies. Install with: pip install requests beautifulsoup4")
        sys.exit(1)

    all_councils = [
        'burnley', 'hyndburn', 'pendle', 'rossendale',
        'lancaster', 'ribble_valley', 'chorley', 'south_ribble',
        'lancashire_cc', 'blackpool', 'blackburn',
        'west_lancashire', 'wyre', 'preston', 'fylde',
    ]

    if args.council:
        councils_to_process = [args.council]
    elif args.all:
        councils_to_process = all_councils
    else:
        councils_to_process = all_councils

    success = 0
    failed = 0
    for council_id in councils_to_process:
        log.info(f"\n{'='*60}")
        log.info(f"Processing: {council_id}")
        log.info(f"{'='*60}")
        try:
            if process_council(council_id, dry_run=args.dry_run):
                success += 1
            else:
                failed += 1
        except Exception as e:
            log.error(f"Error processing {council_id}: {e}")
            import traceback
            traceback.print_exc()
            failed += 1

    log.info(f"\n{'='*60}")
    log.info(f"Complete: {success} success, {failed} failed")
    log.info(f"{'='*60}")


if __name__ == '__main__':
    main()
