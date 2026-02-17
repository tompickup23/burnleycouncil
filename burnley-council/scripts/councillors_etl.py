#!/usr/bin/env python3
"""
councillors_etl.py — Scrape councillor data from ModernGov and generate politics JSON files.

Generates three files per council:
  - councillors.json     — Full councillor directory
  - politics_summary.json — Seat counts, coalition info, key figures
  - wards.json           — Ward-level councillor and party data

Data sources:
  - ModernGov: mgMemberIndex.aspx (most Lancashire councils)
  - Fylde CMIS: Handled via Open Council Data UK fallback
  - Ribble Valley: Council website councillor page

Usage:
    python3 councillors_etl.py                          # All councils with ModernGov URLs
    python3 councillors_etl.py --council preston         # Single council
    python3 councillors_etl.py --council lancashire_cc   # County council (84 members)
    python3 councillors_etl.py --dry-run                 # Show what would be generated

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
log = logging.getLogger('CouncillorsETL')

# ── Paths ────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent  # burnley-council/
DATA_DIR = BASE_DIR / 'data'

# ── Party Colors ─────────────────────────────────────────────────────
PARTY_COLORS = {
    'Conservative': '#0087DC',
    'Labour': '#DC241F',
    'Labour & Co-operative': '#DC241F',
    'Labour and Co-operative': '#DC241F',
    'Liberal Democrats': '#FAA61A',
    'Liberal Democrat': '#FAA61A',
    'Green Party': '#6AB023',
    'Green': '#6AB023',
    'Green Group': '#6AB023',
    'Reform UK': '#12B6CF',
    'Independent': '#808080',
    'Independent Group': '#808080',
    'Wyre Independent Group': '#808080',
    'Our West Lancashire': '#7B2D8E',
    '4 BwD': '#FF6600',
    'Ashton Independent': '#808080',
    'Morecambe Bay Independents': '#808080',
    'Progressive Liberal Group': '#FAA61A',
    'Non-Aligned Independent': '#808080',
    'Independent Socialist': '#DC241F',
    'Your Party': '#808080',
}

def get_party_color(party):
    """Get color for a party, with fuzzy matching."""
    if party in PARTY_COLORS:
        return PARTY_COLORS[party]
    # Try case-insensitive
    for k, v in PARTY_COLORS.items():
        if k.lower() == party.lower():
            return v
    # Try partial match
    lower = party.lower()
    if 'conservative' in lower or 'tory' in lower:
        return '#0087DC'
    if 'labour' in lower:
        return '#DC241F'
    if 'liberal' in lower or 'lib dem' in lower:
        return '#FAA61A'
    if 'green' in lower:
        return '#6AB023'
    if 'reform' in lower:
        return '#12B6CF'
    if 'independent' in lower:
        return '#808080'
    return '#808080'  # default grey


# ── Council Registry ─────────────────────────────────────────────────
# moderngov_url: base URL for ModernGov API
# member_index_url: full URL to councillor list page (overrides moderngov_url if set)
COUNCILS = {
    'lancashire_cc': {
        'name': 'Lancashire County Council',
        'moderngov_url': 'https://council.lancashire.gov.uk',
        'total_seats': 84,
        'tier': 'county',
    },
    'blackpool': {
        'name': 'Blackpool Council',
        'moderngov_url': 'https://democracy.blackpool.gov.uk',
        'total_seats': 42,
        'tier': 'unitary',
    },
    'blackburn': {
        'name': 'Blackburn with Darwen Borough Council',
        'moderngov_url': 'https://democracy.blackburn.gov.uk',
        'total_seats': 51,
        'tier': 'unitary',
    },
    'preston': {
        'name': 'Preston City Council',
        'moderngov_url': 'https://preston.moderngov.co.uk',
        'total_seats': 48,
        'tier': 'district',
    },
    'west_lancashire': {
        'name': 'West Lancashire Borough Council',
        'moderngov_url': 'https://democracy.westlancs.gov.uk',
        'total_seats': 45,
        'tier': 'district',
    },
    'wyre': {
        'name': 'Wyre Borough Council',
        'moderngov_url': 'https://wyre.moderngov.co.uk',
        'total_seats': 50,
        'tier': 'district',
    },
    'fylde': {
        'name': 'Fylde Borough Council',
        'moderngov_url': None,  # Uses CMIS, scraped via Open Council Data
        'total_seats': 37,
        'tier': 'district',
    },
    'lancaster': {
        'name': 'Lancaster City Council',
        'moderngov_url': 'https://committeeadmin.lancaster.gov.uk',
        'total_seats': 56,  # 26 wards
        'tier': 'district',
    },
    'chorley': {
        'name': 'Chorley Council',
        'moderngov_url': 'https://democracy.chorley.gov.uk',
        'total_seats': 45,
        'tier': 'district',
    },
    'south_ribble': {
        'name': 'South Ribble Borough Council',
        'moderngov_url': 'https://southribble.moderngov.co.uk',
        'total_seats': 50,
        'tier': 'district',
    },
    'ribble_valley': {
        'name': 'Ribble Valley Borough Council',
        'moderngov_url': None,  # No ModernGov — uses council website
        'member_index_url': 'https://www.ribblevalley.gov.uk/councillors',
        'total_seats': 40,
        'tier': 'district',
    },
    'burnley': {
        'name': 'Burnley Borough Council',
        'moderngov_url': 'https://burnley.moderngov.co.uk',
        'total_seats': 45,
        'tier': 'district',
    },
    'hyndburn': {
        'name': 'Hyndburn Borough Council',
        'moderngov_url': 'https://hyndburn.moderngov.co.uk',
        'total_seats': 35,
        'tier': 'district',
    },
    'pendle': {
        'name': 'Pendle Borough Council',
        'moderngov_url': None,  # No ModernGov
        'total_seats': 49,
        'tier': 'district',
    },
    'rossendale': {
        'name': 'Rossendale Borough Council',
        'moderngov_url': None,  # No ModernGov
        'total_seats': 36,
        'tier': 'district',
    },
}


PARTY_KEYWORDS = [
    'Labour', 'Conservative', 'Liberal', 'Reform', 'Green',
    'Independent', 'Our West', '4 BwD', 'Morecambe Bay',
    'Progressive', 'Your Party', 'Ashton Independent',
    'Wyre Independent', 'Socialist',
]

def _is_party_text(text):
    """Check if text looks like a political party name."""
    return any(kw in text for kw in PARTY_KEYWORDS)


def scrape_moderngov(base_url, council_id):
    """Scrape councillor data from ModernGov mgMemberIndex.aspx page.

    ModernGov HTML structure (observed across all Lancashire councils):
      <h2 class="mgSectionTitle">Ward Name</h2>
      <ul>
        <li>
          <a href="mgUserInfo.aspx?UID=123">Councillor Full Name</a>
          <p>Ward Name</p>       <!-- sometimes present -->
          <p>Party Name</p>
        </li>
        ...
      </ul>
    """
    url = f"{base_url}/mgMemberIndex.aspx?FN=WARD&VW=LIST&PIC=0"
    log.info(f"Fetching {url}")

    headers = {
        'User-Agent': 'Mozilla/5.0 (AI DOGE Transparency Project; +https://aidoge.co.uk) Python/3',
    }
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, 'html.parser')
    councillors = []

    # Primary approach: find ward section headers (h2.mgSectionTitle)
    # then iterate <li> items in the following <ul>
    ward_headers = soup.find_all('h2', class_='mgSectionTitle')

    if ward_headers:
        for header in ward_headers:
            ward_text = header.get_text(strip=True)
            if not ward_text:
                continue

            # Find all councillor <li> items between this header and the next h2.
            # Structure: h2 → div.mgThumbsList → ul → li (or h2 → ul → li)
            next_elem = header.find_next_sibling()
            while next_elem and next_elem.name != 'h2':
                # Find <li> items containing councillor links — may be nested in div>ul
                li_items = next_elem.find_all('li') if next_elem.name in ('ul', 'div', 'ol') else []

                for li in li_items:
                    link = li.find('a', href=lambda h: h and 'mgUserInfo' in str(h))
                    if not link:
                        continue

                    name = link.get_text(strip=True)
                    if not name:
                        continue

                    # Extract party from <p> tags inside the <li>
                    # Structure: <p>Ward</p> then <p>Party</p>
                    # Party is the <p> that matches a known party keyword
                    # but is NOT a role description (roles contain "Leader of", "Chair of", etc.)
                    party = ''
                    paragraphs = li.find_all('p')
                    for p in paragraphs:
                        p_text = p.get_text(strip=True)
                        if not p_text or p_text == ward_text:
                            continue
                        # Skip role descriptions that happen to contain party keywords
                        if any(role_word in p_text for role_word in [
                            'Leader of', 'Chair of', 'Deputy Leader of',
                            'Cabinet', 'Mayor', 'Champion', 'Member for',
                            'Portfolio', 'Opposition', 'Scrutiny',
                        ]):
                            continue
                        if _is_party_text(p_text):
                            party = p_text
                            break

                    # Also check <div> and <span> as fallback
                    if not party:
                        for tag in li.find_all(['div', 'span']):
                            t = tag.get_text(strip=True)
                            if not t or t == name or t == ward_text:
                                continue
                            if any(role_word in t for role_word in [
                                'Leader of', 'Chair of', 'Deputy Leader of',
                                'Cabinet', 'Mayor', 'Champion',
                            ]):
                                continue
                            if _is_party_text(t):
                                party = t
                                break

                    # Extract UID from link
                    href = link.get('href', '')
                    uid_match = re.search(r'UID=(\d+)', href)
                    uid = uid_match.group(1) if uid_match else None

                    councillors.append({
                        'name': name,
                        'ward': ward_text,
                        'party': party,
                        'uid': uid,
                    })

                next_elem = next_elem.find_next_sibling()

    # Fallback: find all councillor links and extract context from parent elements
    if not councillors:
        log.info("  Primary parse found nothing, trying fallback...")
        all_links = soup.find_all('a', href=lambda h: h and 'mgUserInfo' in str(h))
        for link in all_links:
            name = link.get_text(strip=True)
            if not name or len(name) < 3:
                continue

            parent_li = link.find_parent('li')
            ward = ''
            party = ''

            if parent_li:
                # Check <p> tags for party and ward
                for p in parent_li.find_all('p'):
                    p_text = p.get_text(strip=True)
                    if not p_text:
                        continue
                    if _is_party_text(p_text):
                        party = p_text
                    elif not ward and p_text != name:
                        ward = p_text

            # If no ward from <li>, check preceding h2
            if not ward:
                prev_h2 = link.find_previous('h2')
                if prev_h2:
                    ward = prev_h2.get_text(strip=True)

            href = link.get('href', '')
            uid_match = re.search(r'UID=(\d+)', href)
            uid = uid_match.group(1) if uid_match else None

            councillors.append({
                'name': name,
                'ward': ward,
                'party': party,
                'uid': uid,
            })

    log.info(f"  Parsed {len(councillors)} councillors from {base_url}")
    return councillors


def scrape_councillor_details(base_url, uid):
    """Scrape individual councillor page for email, phone, roles, address."""
    url = f"{base_url}/mgUserInfo.aspx?UID={uid}"
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (AI DOGE Transparency Project; +https://aidoge.co.uk) Python/3',
        }
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')

        details = {'email': '', 'phone': '', 'address': '', 'roles': []}

        # Email
        email_link = soup.find('a', href=lambda h: h and 'mailto:' in str(h))
        if email_link:
            details['email'] = email_link.get_text(strip=True)

        # Phone — look for tel: links or text near "Phone" / "Telephone"
        tel_link = soup.find('a', href=lambda h: h and 'tel:' in str(h))
        if tel_link:
            details['phone'] = tel_link.get_text(strip=True)

        # Roles — typically in a roles/positions section
        roles_section = soup.find(string=re.compile(r'Roles|Appointments|Committees', re.I))
        if roles_section:
            parent = roles_section.find_parent()
            if parent:
                role_links = parent.find_next('ul')
                if role_links:
                    for li in role_links.find_all('li'):
                        role_text = li.get_text(strip=True)
                        if role_text:
                            details['roles'].append(role_text)

        return details
    except Exception as e:
        log.debug(f"  Could not fetch details for UID {uid}: {e}")
        return {'email': '', 'phone': '', 'address': '', 'roles': []}


def generate_councillor_id(name, existing_ids):
    """Generate a unique ID from councillor name."""
    # Remove Cllr prefix and titles
    clean = re.sub(r'^(Cllr|Councillor)\s+', '', name, flags=re.I)
    clean = re.sub(r'\s+(MBE|OBE|CBE|JP|BEM|DL)\s*$', '', clean, flags=re.I)
    clean = clean.strip()

    parts = clean.split()
    if len(parts) >= 2:
        # Use first initial + last name
        base_id = (parts[0][0] + parts[-1]).lower()
        base_id = re.sub(r'[^a-z]', '', base_id)
    else:
        base_id = clean.lower().replace(' ', '')
        base_id = re.sub(r'[^a-z]', '', base_id)

    # Ensure unique
    final_id = base_id
    counter = 2
    while final_id in existing_ids:
        final_id = f"{base_id}{counter}"
        counter += 1

    existing_ids.add(final_id)
    return final_id


def clean_councillor_name(name):
    """Normalize councillor name — remove Cllr prefix but keep titles like MBE."""
    name = re.sub(r'^(Cllr|Councillor)\s+', '', name, flags=re.I).strip()
    return name


def normalize_party(party):
    """Normalize party name variations."""
    if not party:
        return 'Independent'
    party = party.strip()

    # Common normalizations
    mappings = {
        'Labour and Co-operative': 'Labour & Co-operative',
        'Labour And Co-operative': 'Labour & Co-operative',
        'Labour and Co-Operative': 'Labour & Co-operative',
        'Labour and Co-operative Party': 'Labour & Co-operative',
        'Labour Party': 'Labour',
        'Labour Group': 'Labour',
        'Conservative Party': 'Conservative',
        'The Conservative Party': 'Conservative',
        'Conservative Group': 'Conservative',
        'Liberal Democrat': 'Liberal Democrats',
        'Liberal Democrat Group': 'Liberal Democrats',
        'Green Group': 'Green Party',
        'Green': 'Green Party',
        'Independent Group': 'Independent',
        'Independent/Other': 'Independent',
        'Non-Aligned Independent': 'Independent',
        'Independent Socialist': 'Independent',
        'Reform': 'Reform UK',
    }
    if party in mappings:
        return mappings[party]

    return party


def build_councillors_json(raw_councillors, council_id, base_url=None, fetch_details=False):
    """Build the councillors.json array from raw scraped data."""
    existing_ids = set()
    councillors = []

    for raw in raw_councillors:
        name = clean_councillor_name(raw['name'])
        party = normalize_party(raw.get('party', ''))
        ward = raw.get('ward', '').strip()

        cid = generate_councillor_id(name, existing_ids)

        entry = {
            'id': cid,
            'name': name,
            'moderngov_uid': raw.get('uid', ''),
            'ward': ward,
            'party': party,
            'party_color': get_party_color(party),
            'email': '',
            'phone': '',
            'roles': [],
        }

        # Optionally fetch individual councillor details
        if fetch_details and base_url and raw.get('uid'):
            details = scrape_councillor_details(base_url, raw['uid'])
            entry['email'] = details.get('email', '')
            entry['phone'] = details.get('phone', '')
            entry['roles'] = details.get('roles', [])
            time.sleep(0.3)  # Be polite

        councillors.append(entry)

    # Sort by ward then name
    councillors.sort(key=lambda c: (c['ward'], c['name']))
    return councillors


def build_politics_summary(councillors, council_info, council_id, data_source_url=None):
    """Build politics_summary.json from councillor data."""
    total = len(councillors)
    wards = set(c['ward'] for c in councillors if c['ward'])

    # Count by party
    party_counts = Counter(c['party'] for c in councillors)
    by_party = []
    for party, count in party_counts.most_common():
        by_party.append({
            'party': party,
            'count': count,
            'color': get_party_color(party),
        })

    # Determine majority
    majority_threshold = (total // 2) + 1
    largest_party = by_party[0]['party'] if by_party else ''
    largest_count = by_party[0]['count'] if by_party else 0

    # Check if largest party + allied parties have majority
    # (Labour + Labour & Co-op are allied)
    allied_groups = {
        'Labour': ['Labour', 'Labour & Co-operative'],
        'Labour & Co-operative': ['Labour', 'Labour & Co-operative'],
        'Conservative': ['Conservative'],
        'Reform UK': ['Reform UK'],
        'Liberal Democrats': ['Liberal Democrats'],
        'Green Party': ['Green Party'],
    }

    allied = allied_groups.get(largest_party, [largest_party])
    allied_seats = sum(party_counts.get(p, 0) for p in allied)
    has_majority = allied_seats >= majority_threshold

    coalition = {
        'type': 'majority' if has_majority else 'minority/NOC',
        'parties': allied if has_majority else [largest_party],
        'total_seats': allied_seats if has_majority else largest_count,
        'majority': has_majority,
    }

    opposition_seats = total - coalition['total_seats']

    summary = {
        'total_councillors': total,
        'total_wards': len(wards),
        'majority_threshold': majority_threshold,
        'by_party': by_party,
        'coalition': coalition,
        'opposition_seats': opposition_seats,
        'council_leader': '',  # Would need to scrape from individual pages
        'mayor': '',
        'data_source': data_source_url or '',
        'scraped_date': datetime.now().strftime('%Y-%m-%d'),
    }

    return summary


def build_wards_json(councillors):
    """Build wards.json from councillor data."""
    wards = OrderedDict()

    for c in councillors:
        ward = c['ward']
        if not ward:
            continue

        if ward not in wards:
            wards[ward] = {
                'name': ward,
                'councillors': [],
                'councillor_ids': [],
                'parties': [],
                'primary_party': '',
                'color': '',
            }

        wards[ward]['councillors'].append(c['name'])
        wards[ward]['councillor_ids'].append(c['id'])
        if c['party'] not in wards[ward]['parties']:
            wards[ward]['parties'].append(c['party'])

    # Determine primary party for each ward (most common)
    for ward_name, ward_data in wards.items():
        party_counts = Counter()
        for c in councillors:
            if c['ward'] == ward_name:
                party_counts[c['party']] += 1
        if party_counts:
            primary = party_counts.most_common(1)[0][0]
            ward_data['primary_party'] = primary
            ward_data['color'] = get_party_color(primary)

    # Sort by ward name
    return OrderedDict(sorted(wards.items()))


def process_council(council_id, fetch_details=False, dry_run=False):
    """Process a single council: scrape, generate, write."""
    if council_id not in COUNCILS:
        log.warning(f"Unknown council: {council_id}")
        return False

    info = COUNCILS[council_id]
    log.info(f"\n{'='*60}")
    log.info(f"Processing: {info['name']} ({council_id})")
    log.info(f"{'='*60}")

    output_dir = DATA_DIR / council_id
    if not output_dir.exists():
        log.error(f"  Data directory not found: {output_dir}")
        return False

    # Scrape councillor data
    base_url = info.get('moderngov_url')
    if base_url:
        try:
            raw = scrape_moderngov(base_url, council_id)
        except Exception as e:
            log.error(f"  Scrape failed for {council_id}: {e}")
            return False
    else:
        log.warning(f"  No ModernGov URL for {council_id} — skipping (needs manual data or alternative source)")
        return False

    if not raw:
        log.error(f"  No councillors found for {council_id}")
        return False

    # Check for missing ward/party data
    missing_ward = sum(1 for r in raw if not r.get('ward'))
    missing_party = sum(1 for r in raw if not r.get('party'))
    if missing_ward > 0:
        log.warning(f"  {missing_ward}/{len(raw)} councillors missing ward data")
    if missing_party > 0:
        log.warning(f"  {missing_party}/{len(raw)} councillors missing party data")

    data_source_url = f"{base_url}/mgMemberIndex.aspx?FN=WARD&VW=LIST&PIC=0" if base_url else ''

    # Build JSON structures
    councillors = build_councillors_json(raw, council_id, base_url, fetch_details)
    summary = build_politics_summary(councillors, info, council_id, data_source_url)
    wards = build_wards_json(councillors)

    log.info(f"  Generated: {len(councillors)} councillors, {len(wards)} wards")
    party_str = ', '.join('{} ({})'.format(p['party'], p['count']) for p in summary['by_party'])
    log.info("  Parties: %s", party_str)

    if dry_run:
        log.info(f"  DRY RUN — would write to {output_dir}/")
        return True

    # Write files
    for filename, data in [
        ('councillors.json', councillors),
        ('politics_summary.json', summary),
        ('wards.json', wards),
    ]:
        filepath = output_dir / filename
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        log.info(f"  Wrote {filepath} ({os.path.getsize(filepath):,} bytes)")

    return True


def main():
    parser = argparse.ArgumentParser(description='Scrape councillor data from ModernGov')
    parser.add_argument('--council', type=str, help='Single council ID to process')
    parser.add_argument('--fetch-details', action='store_true',
                       help='Fetch individual councillor pages for email/phone/roles (slow)')
    parser.add_argument('--dry-run', action='store_true',
                       help='Parse and report but do not write files')
    parser.add_argument('--all', action='store_true',
                       help='Process all councils (default if no --council)')
    args = parser.parse_args()

    if not HAS_DEPS:
        log.error("Missing dependencies. Install with: pip install requests beautifulsoup4")
        sys.exit(1)

    if args.council:
        councils_to_process = [args.council]
    else:
        councils_to_process = list(COUNCILS.keys())

    success = 0
    failed = 0
    for council_id in councils_to_process:
        try:
            if process_council(council_id, args.fetch_details, args.dry_run):
                success += 1
            else:
                failed += 1
        except Exception as e:
            log.error(f"Error processing {council_id}: {e}")
            failed += 1

    log.info(f"\n{'='*60}")
    log.info(f"Complete: {success} success, {failed} failed")
    log.info(f"{'='*60}")


if __name__ == '__main__':
    main()
