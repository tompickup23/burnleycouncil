#!/usr/bin/env python3
"""
councillor_research_etl.py — Pre-ETL councillor profiling for AI DOGE v6.

Builds councillor_profiles.json per council by merging identity anchors from
multiple sources: ModernGov biographies, register of interests (structured),
elections.json, meetings.json (committees), and Companies House officer search.

This runs BEFORE councillor_integrity_etl.py to provide enriched profiles.

Data sources:
  - councillors.json (name, ward, party, moderngov_uid)
  - ModernGov biography page (DOB, occupation, bio text, photo)
  - register_of_interests.json (structured employment/land/securities)
  - elections.json (margin, tenure, swing, uncontested)
  - meetings.json (committee memberships from upgraded ETL)

Output: councillor_profiles.json per council

Usage:
    python3 councillor_research_etl.py --council burnley
    python3 councillor_research_etl.py --all
    python3 councillor_research_etl.py --all --skip-moderngov
    python3 councillor_research_etl.py --council burnley --dry-run
"""

import argparse
import json
import logging
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

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
log = logging.getLogger('CouncillorResearch')

# ── Paths ────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent  # burnley-council/
DATA_DIR = BASE_DIR / 'data'

# ── ModernGov-enabled councils ───────────────────────────────────────
MODERNGOV_COUNCILS = {
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
}

# All 15 councils (including non-ModernGov)
ALL_COUNCILS = list(MODERNGOV_COUNCILS.keys()) + [
    'pendle', 'rossendale', 'ribble_valley', 'fylde',
]

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (AI DOGE Transparency Project; +https://aidoge.co.uk) Python/3',
}
RATE_LIMIT = 0.5  # seconds between requests


def load_json(path):
    """Load a JSON file, returning None if missing."""
    if not path.exists():
        return None
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


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


# ── ModernGov Biography Scraping ─────────────────────────────────────

def scrape_moderngov_biography(base_url, uid):
    """Scrape a councillor's ModernGov biography page for DOB, occupation, bio, photo.

    Page: mgUserInfo.aspx?UID={uid}
    """
    url = f"{base_url}/mgUserInfo.aspx?UID={uid}"
    soup = fetch_page(url)
    if not soup:
        return {}

    result = {
        'dob': None,
        'occupation': None,
        'biography': None,
        'photo_url': None,
    }

    # Photo — look for profile image
    for img in soup.find_all('img'):
        src = img.get('src', '')
        alt = img.get('alt', '').lower()
        # ModernGov profile images typically have 'photo' or councillor name in path
        if any(kw in src.lower() for kw in ['photo', 'mguser', 'councillor', 'member']):
            result['photo_url'] = urljoin(base_url + '/', src)
            break
        if 'photo' in alt or 'councillor' in alt:
            result['photo_url'] = urljoin(base_url + '/', src)
            break

    # Full page text for biography extraction
    page_text = soup.get_text(' ', strip=True)

    # DOB extraction — look for "Date of Birth:" or "Born:" patterns
    dob_patterns = [
        r'(?:Date\s+of\s+Birth|Born|DOB)\s*:?\s*(\d{1,2}\s+\w+\s+\d{4})',
        r'(?:Date\s+of\s+Birth|Born|DOB)\s*:?\s*(\d{1,2}/\d{1,2}/\d{4})',
        r'(?:Date\s+of\s+Birth|Born|DOB)\s*:?\s*(\d{4}-\d{2}-\d{2})',
    ]
    for pattern in dob_patterns:
        m = re.search(pattern, page_text, re.I)
        if m:
            dob_text = m.group(1)
            # Normalize to YYYY-MM format (month precision for privacy)
            result['dob'] = _parse_dob(dob_text)
            break

    # Occupation — look for labels like "Occupation:", "Job:", "Employment:"
    occ_patterns = [
        r'(?:Occupation|Job|Employment|Profession)\s*:?\s*([^\n]{5,100})',
    ]
    for pattern in occ_patterns:
        m = re.search(pattern, page_text, re.I)
        if m:
            occ = m.group(1).strip().rstrip('.')
            # Don't capture labels that look like section headers
            if len(occ) < 100 and not occ.lower().startswith('register'):
                result['occupation'] = occ
                break

    # Biography — look for biography/about section
    bio_section = None
    for heading in soup.find_all(['h2', 'h3', 'h4', 'strong', 'b']):
        heading_text = heading.get_text(strip=True).lower()
        if any(kw in heading_text for kw in ['biography', 'about', 'background', 'profile']):
            # Get the next sibling or parent content
            next_el = heading.find_next(['p', 'div', 'td'])
            if next_el:
                bio_text = next_el.get_text(' ', strip=True)
                if len(bio_text) > 20:
                    bio_section = bio_text[:500]  # Cap at 500 chars
                    break

    if bio_section:
        result['biography'] = bio_section

    return result


def _parse_dob(text):
    """Parse DOB text to YYYY-MM format (month precision for privacy)."""
    text = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', text)
    for fmt in ['%d %B %Y', '%d %b %Y', '%d/%m/%Y', '%Y-%m-%d']:
        try:
            dt = datetime.strptime(text.strip(), fmt)
            return dt.strftime('%Y-%m')
        except ValueError:
            continue
    return None


# ── Register of Interests Deep Extraction ────────────────────────────

def extract_employment_structured(register_entry):
    """Extract structured employment data from register of interests.

    Parses entries like:
      "Community Team Leader , Lancashire County Council, Education Improvement"
      "Self-employed, Taxi Driver"
      "Director, ABC Ltd"

    Returns list of dicts: [{role, employer, raw}, ...]
    """
    raw_entries = register_entry.get('declared_employment', [])
    structured = []

    for raw in raw_entries:
        if not raw or len(raw.strip()) < 3:
            continue
        entry = {'raw': raw, 'role': None, 'employer': None}

        # Try comma-separated "Role, Employer" pattern
        parts = [p.strip() for p in raw.split(',') if p.strip()]
        if len(parts) >= 2:
            # First part is often the role, second the employer
            entry['role'] = parts[0]
            entry['employer'] = ', '.join(parts[1:])
        else:
            entry['employer'] = raw.strip()

        structured.append(entry)

    return structured


def extract_land_structured(register_entry):
    """Extract structured land interest data with postcode extraction.

    Returns list of dicts: [{address, postcode, raw}, ...]
    """
    raw_entries = register_entry.get('declared_land', [])
    structured = []
    seen = set()

    for raw in raw_entries:
        if not raw or len(raw.strip()) < 3:
            continue
        # Deduplicate (registers often have duplicates)
        normalised = raw.strip().lower()
        if normalised in seen:
            continue
        seen.add(normalised)

        entry = {'raw': raw.strip(), 'address': raw.strip(), 'postcode': None}

        # Extract postcode
        pc_match = re.search(
            r'([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})',
            raw, re.I
        )
        if pc_match:
            entry['postcode'] = pc_match.group(1).upper().strip()

        structured.append(entry)

    return structured


def extract_securities_structured(register_entry):
    """Extract structured securities/shares data.

    Returns list of dicts: [{company, raw}, ...]
    """
    raw_entries = register_entry.get('declared_securities', [])
    structured = []

    for raw in raw_entries:
        if not raw or len(raw.strip()) < 3:
            continue
        structured.append({
            'raw': raw.strip(),
            'company': raw.strip(),
        })

    return structured


# ── Electoral History Merge ──────────────────────────────────────────

def merge_electoral_history(councillor_name, ward_name, elections_data):
    """Merge electoral history for a councillor from elections.json.

    Returns dict: {first_elected, years_in_office, margin, margin_pct,
                   safe_seat, uncontested, elections_won, elections_fought,
                   swing_trend}
    """
    result = {
        'first_elected': None,
        'years_in_office': 0,
        'margin': None,
        'margin_pct': None,
        'safe_seat': False,
        'uncontested': False,
        'elections_won': 0,
        'elections_fought': 0,
        'swing_trend': None,
    }

    if not elections_data:
        return result

    wards = elections_data.get('wards', {})
    ward_data = wards.get(ward_name, {})
    history = ward_data.get('history', [])

    if not history:
        return result

    # Find elections where this councillor was a candidate
    name_lower = councillor_name.lower().strip()
    elections_won = []
    elections_fought = []

    for election in history:
        candidates = election.get('candidates', [])
        for candidate in candidates:
            cand_name = candidate.get('name', '').lower().strip()
            # Fuzzy name match — surname match + first name initial
            if _names_match(name_lower, cand_name):
                elections_fought.append(election)
                if candidate.get('elected'):
                    elections_won.append({
                        'year': election.get('year'),
                        'votes': candidate.get('votes'),
                        'pct': candidate.get('pct'),
                        'election': election,
                    })
                break

    result['elections_fought'] = len(elections_fought)
    result['elections_won'] = len(elections_won)

    if elections_won:
        # Sort by year
        elections_won.sort(key=lambda e: e.get('year', 0))
        result['first_elected'] = elections_won[0]['year']
        current_year = datetime.now().year
        result['years_in_office'] = current_year - result['first_elected']

        # Most recent win — calculate margin
        latest = elections_won[-1]
        latest_election = latest['election']
        candidates = latest_election.get('candidates', [])
        if len(candidates) >= 2:
            # Sort by votes descending
            sorted_cands = sorted(
                [c for c in candidates if c.get('votes')],
                key=lambda c: c['votes'], reverse=True
            )
            if len(sorted_cands) >= 2:
                winner_votes = sorted_cands[0]['votes']
                runner_up_votes = sorted_cands[1]['votes']
                result['margin'] = winner_votes - runner_up_votes
                total_votes = sum(c.get('votes', 0) for c in sorted_cands)
                if total_votes > 0:
                    result['margin_pct'] = round(result['margin'] / total_votes * 100, 1)
                    result['safe_seat'] = result['margin_pct'] > 20

        # Check for uncontested
        if len(candidates) <= 1:
            result['uncontested'] = True

    return result


def _names_match(name1, name2):
    """Simple name matching — surname must match, first name initial."""
    parts1 = name1.split()
    parts2 = name2.split()
    if not parts1 or not parts2:
        return False
    # Surname match (last word)
    if parts1[-1] != parts2[-1]:
        return False
    # First name initial match
    if parts1[0][0] == parts2[0][0]:
        return True
    return False


# ── Committee Membership Extraction ──────────────────────────────────

def extract_committee_memberships(councillor_name, councillor_uid, meetings_data):
    """Extract committee memberships from meetings.json committees section.

    Returns list of dicts: [{committee, type, role}, ...]
    """
    memberships = []
    if not meetings_data:
        return memberships

    committees = meetings_data.get('committees', [])
    uid_str = str(councillor_uid) if councillor_uid else None

    for committee in committees:
        members = committee.get('members', [])
        for member in members:
            # Match by UID (most reliable) or by name
            matched = False
            if uid_str and str(member.get('uid', '')) == uid_str:
                matched = True
            elif _names_match(councillor_name.lower(), member.get('name', '').lower()):
                matched = True

            if matched:
                memberships.append({
                    'committee': committee['name'],
                    'type': committee.get('type', 'other'),
                    'role': member.get('role', 'Member'),
                })
                break

    return memberships


# ── Confidence Scoring ───────────────────────────────────────────────

def calculate_data_completeness(profile):
    """Calculate data completeness percentage for a councillor profile."""
    fields = [
        ('dob', 15),           # DOB available
        ('occupation', 10),    # Occupation known
        ('biography', 5),      # Biography text
        ('photo_url', 5),      # Photo available
        ('employment', 15),    # Employment declarations
        ('land', 10),          # Land interests
        ('securities', 5),     # Securities
        ('electoral', 15),     # Electoral history merged
        ('committees', 10),    # Committee memberships
        ('moderngov_uid', 10), # ModernGov identity anchor
    ]

    total_weight = sum(w for _, w in fields)
    score = 0

    if profile.get('dob'):
        score += 15
    if profile.get('occupation'):
        score += 10
    if profile.get('biography'):
        score += 5
    if profile.get('photo_url'):
        score += 5
    if profile.get('employment') and len(profile['employment']) > 0:
        score += 15
    if profile.get('land') and len(profile['land']) > 0:
        score += 10
    if profile.get('securities') and len(profile['securities']) > 0:
        score += 5
    if profile.get('electoral', {}).get('first_elected'):
        score += 15
    if profile.get('committees') and len(profile['committees']) > 0:
        score += 10
    if profile.get('moderngov_uid'):
        score += 10

    return round(score / total_weight * 100)


def calculate_identity_confidence(profile):
    """Calculate identity confidence score (how sure we are of councillor identity).

    Used by integrity ETL for CH matching confidence.
    """
    score = 0

    # DOB is the strongest anchor
    if profile.get('dob'):
        score += 40

    # ModernGov UID confirms council identity
    if profile.get('moderngov_uid'):
        score += 25

    # Employment cross-referencing
    if profile.get('employment') and len(profile['employment']) > 0:
        score += 15

    # Electoral history confirms person has been a councillor
    if profile.get('electoral', {}).get('first_elected'):
        score += 10

    # Committee memberships confirm active council role
    if profile.get('committees') and len(profile['committees']) > 0:
        score += 10

    return min(score, 100)


# ── Main Processing ─────────────────────────────────────────────────

def process_council(council_id, skip_moderngov=False, dry_run=False):
    """Build councillor_profiles.json for a single council."""
    log.info(f"Processing {council_id}...")

    # Load source data
    council_dir = DATA_DIR / council_id
    councillors = load_json(council_dir / 'councillors.json')
    if not councillors:
        log.warning(f"  {council_id}: No councillors.json found, skipping")
        return None

    register = load_json(council_dir / 'register_of_interests.json')
    elections = load_json(council_dir / 'elections.json')
    meetings = load_json(council_dir / 'meetings.json')

    log.info(f"  Sources: councillors={len(councillors)}, "
             f"register={'yes' if register else 'no'}, "
             f"elections={'yes' if elections else 'no'}, "
             f"meetings={'yes' if meetings else 'no'}")

    has_moderngov = council_id in MODERNGOV_COUNCILS and not skip_moderngov
    base_url = MODERNGOV_COUNCILS.get(council_id)

    profiles = {}
    bio_scraped = 0

    for i, councillor in enumerate(councillors):
        cid = councillor.get('id') or councillor['name'].lower().replace(' ', '-').replace("'", '')
        name = councillor['name']
        uid = councillor.get('moderngov_uid')

        profile = {
            'councillor_id': cid,
            'name': name,
            'ward': councillor.get('ward'),
            'party': councillor.get('party'),
            'moderngov_uid': uid,
            'dob': None,
            'occupation': None,
            'biography': None,
            'photo_url': None,
            'employment': [],
            'land': [],
            'securities': [],
            'gifts_hospitality': [],
            'sponsorship': [],
            'committees': [],
            'electoral': {},
            'data_completeness_pct': 0,
            'identity_confidence': 0,
        }

        # 1. ModernGov biography (if available and not skipped)
        if has_moderngov and uid:
            bio = scrape_moderngov_biography(base_url, uid)
            if bio:
                profile['dob'] = bio.get('dob')
                profile['occupation'] = bio.get('occupation')
                profile['biography'] = bio.get('biography')
                profile['photo_url'] = bio.get('photo_url')
                bio_scraped += 1

            if (i + 1) % 10 == 0:
                log.info(f"    {i + 1}/{len(councillors)} biographies scraped")

        # 2. Register of interests (structured extraction)
        if register and register.get('councillors', {}).get(cid):
            reg_entry = register['councillors'][cid]
            profile['employment'] = extract_employment_structured(reg_entry)
            profile['land'] = extract_land_structured(reg_entry)
            profile['securities'] = extract_securities_structured(reg_entry)

            # Gifts/hospitality and sponsorship
            profile['gifts_hospitality'] = [
                {'raw': g} for g in reg_entry.get('declared_contracts', [])
                if g and len(g.strip()) > 2
            ]
            profile['sponsorship'] = [
                {'raw': s} for s in reg_entry.get('declared_sponsorship', [])
                if s and len(s.strip()) > 2
            ]

        # 3. Electoral history
        if elections:
            profile['electoral'] = merge_electoral_history(
                name, councillor.get('ward', ''), elections
            )

        # 4. Committee memberships
        if meetings:
            profile['committees'] = extract_committee_memberships(
                name, uid, meetings
            )

        # 5. Confidence scores
        profile['data_completeness_pct'] = calculate_data_completeness(profile)
        profile['identity_confidence'] = calculate_identity_confidence(profile)

        profiles[cid] = profile

    # Build output
    result = {
        'council_id': council_id,
        'generated_at': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.%fZ'),
        'version': '1.0',
        'total_councillors': len(profiles),
        'moderngov_scraped': bio_scraped,
        'sources': {
            'councillors': True,
            'register': register is not None,
            'elections': elections is not None,
            'meetings': meetings is not None,
            'moderngov_biography': has_moderngov,
        },
        'summary': {
            'with_dob': sum(1 for p in profiles.values() if p.get('dob')),
            'with_occupation': sum(1 for p in profiles.values() if p.get('occupation')),
            'with_employment': sum(1 for p in profiles.values() if p.get('employment')),
            'with_land': sum(1 for p in profiles.values() if p.get('land')),
            'with_committees': sum(1 for p in profiles.values() if p.get('committees')),
            'with_electoral': sum(1 for p in profiles.values()
                                  if p.get('electoral', {}).get('first_elected')),
            'avg_completeness': round(
                sum(p['data_completeness_pct'] for p in profiles.values()) / len(profiles)
            ) if profiles else 0,
            'avg_identity_confidence': round(
                sum(p['identity_confidence'] for p in profiles.values()) / len(profiles)
            ) if profiles else 0,
        },
        'councillors': profiles,
    }

    if dry_run:
        log.info(f"  DRY RUN: Would write {len(profiles)} profiles to "
                 f"{council_dir / 'councillor_profiles.json'}")
        _print_summary(council_id, result)
        return result

    # Write output
    out_path = council_dir / 'councillor_profiles.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    log.info(f"  Written: {out_path} ({len(profiles)} profiles)")

    _print_summary(council_id, result)
    return result


def _print_summary(council_id, result):
    """Print a summary of profile enrichment."""
    s = result['summary']
    log.info(f"  {council_id} SUMMARY:")
    log.info(f"    Councillors: {result['total_councillors']}")
    log.info(f"    With DOB: {s['with_dob']}")
    log.info(f"    With occupation: {s['with_occupation']}")
    log.info(f"    With employment: {s['with_employment']}")
    log.info(f"    With land interests: {s['with_land']}")
    log.info(f"    With committees: {s['with_committees']}")
    log.info(f"    With electoral history: {s['with_electoral']}")
    log.info(f"    Avg completeness: {s['avg_completeness']}%%")
    log.info(f"    Avg identity confidence: {s['avg_identity_confidence']}%%")


def main():
    parser = argparse.ArgumentParser(
        description='Build councillor profiles for AI DOGE v6'
    )
    parser.add_argument('--council', type=str,
                        help='Single council ID to process')
    parser.add_argument('--all', action='store_true',
                        help='Process all 15 councils')
    parser.add_argument('--skip-moderngov', action='store_true',
                        help='Skip ModernGov biography scraping (faster)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show what would be generated without writing files')
    args = parser.parse_args()

    if not HAS_DEPS:
        print("ERROR: Install dependencies: pip install requests beautifulsoup4",
              file=sys.stderr)
        sys.exit(1)

    if args.council:
        if args.council not in ALL_COUNCILS:
            print(f"ERROR: Unknown council '{args.council}'. "
                  f"Available: {', '.join(sorted(ALL_COUNCILS))}",
                  file=sys.stderr)
            sys.exit(1)
        councils = [args.council]
    elif args.all:
        councils = ALL_COUNCILS
    else:
        print("ERROR: Specify --council <id> or --all", file=sys.stderr)
        sys.exit(1)

    total_profiles = 0
    results = {}

    for council_id in councils:
        try:
            result = process_council(
                council_id,
                skip_moderngov=args.skip_moderngov,
                dry_run=args.dry_run,
            )
            if result:
                count = result['total_councillors']
                total_profiles += count
                results[council_id] = count
            else:
                results[council_id] = 0
        except Exception as e:
            log.error(f"  {council_id}: FAILED — {e}")
            import traceback
            traceback.print_exc()
            results[council_id] = -1

    # Summary
    print("\n" + "=" * 60)
    print("COUNCILLOR RESEARCH ETL COMPLETE")
    print("=" * 60)
    for council_id, count in results.items():
        status = f"{count} profiles" if count >= 0 else "FAILED"
        print(f"  {council_id}: {status}")
    print(f"\nTotal: {total_profiles} profiles across {len(results)} councils")
    if args.dry_run:
        print("(DRY RUN — no files written)")


if __name__ == '__main__':
    main()
