#!/usr/bin/env python3
"""
facility_enrichment_etl.py — Scrape LCC library/facility data and match to property assets.

Builds a service intelligence layer by scraping the LCC website for library
information, then matching scraped facilities to property_assets.json records.
This adds useful context like service status, operator, services provided,
and community management status.

Usage:
    python3 facility_enrichment_etl.py --council lancashire_cc
    python3 facility_enrichment_etl.py --council lancashire_cc --dry-run

Output:
    burnley-council/data/lancashire_cc/facility_enrichment.json

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
log = logging.getLogger('FacilityEnrichment')

# ── Paths ────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / 'data'

# ── LCC Website ──────────────────────────────────────────────────────
LCC_BASE = 'https://www.lancashire.gov.uk'
LIBRARY_INDEX = f'{LCC_BASE}/libraries-and-archives/libraries/find-a-library/'

# Rate limit
REQUEST_DELAY = 1.0  # seconds between requests

# User-Agent (polite scraping)
HEADERS = {
    'User-Agent': 'AI-DOGE-FacilityEnrichment/1.0 (Lancashire public data research)',
}

# ── Community management detection keywords ──────────────────────────
COMMUNITY_KEYWORDS = [
    'community library',
    'managed by the local community',
    'independent of lancashire county council',
    'community association',
    'community group',
    'volunteer',
    'town council',
    'parish council',
    'community centre',
    'trustees',
]

# ── Manual match overrides ───────────────────────────────────────────
# Map LCC website library slug → property_assets.json asset ID
# for known mismatches where automated matching fails
MANUAL_OVERRIDES = {
    # Add known mismatches here as: 'lcc-slug': 'asset_id'
}


def fetch_page(url):
    """Fetch a page with rate limiting and error handling."""
    time.sleep(REQUEST_DELAY)
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        return BeautifulSoup(resp.text, 'html.parser')
    except Exception as e:
        log.warning(f"Failed to fetch {url}: {e}")
        return None


def scrape_library_index():
    """Scrape the LCC library finder index page to get all library URLs."""
    log.info(f"Fetching library index: {LIBRARY_INDEX}")
    soup = fetch_page(LIBRARY_INDEX)
    if not soup:
        log.error("Could not fetch library index page")
        return []

    libraries = []
    # Libraries are listed as linked headings (h2 > a) or list items with links
    # Find all links within the main content that point to find-a-library sub-pages
    for link in soup.find_all('a', href=True):
        href = link['href']
        # Match library sub-pages
        if '/find-a-library/' in href and href.rstrip('/') != LIBRARY_INDEX.rstrip('/'):
            slug = href.rstrip('/').split('/')[-1]
            if slug and slug != 'find-a-library':
                full_url = f"{LCC_BASE}{href}" if href.startswith('/') else href
                name = link.get_text(strip=True)
                libraries.append({
                    'slug': slug,
                    'name': name,
                    'url': full_url,
                })

    # Deduplicate by slug
    seen = set()
    unique = []
    for lib in libraries:
        if lib['slug'] not in seen:
            seen.add(lib['slug'])
            unique.append(lib)

    log.info(f"Found {len(unique)} libraries on index page")
    return unique


def scrape_library_detail(lib_info):
    """Scrape a single library detail page for service information."""
    url = lib_info['url']
    log.info(f"  Scraping: {lib_info['name']} ({lib_info['slug']})")

    soup = fetch_page(url)
    if not soup:
        return None

    page_text = soup.get_text(' ', strip=True).lower()

    # --- Determine if community managed ---
    is_community = any(kw in page_text for kw in COMMUNITY_KEYWORDS)

    # --- Extract operator name ---
    operator = None
    operator_type = None
    if is_community:
        # Look for specific patterns
        text = soup.get_text(' ', strip=True)

        # "managed by [X]" or "run by [X]"
        for pattern in [
            r'managed by (?:the )?(.+?)(?:\.|,|\n|$)',
            r'run by (?:the )?(.+?)(?:\.|,|\n|$)',
            r'operated by (?:the )?(.+?)(?:\.|,|\n|$)',
        ]:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                op = m.group(1).strip()
                # Clean up — remove trailing "It is" etc
                op = re.sub(r'\s+It\s+is.*$', '', op).strip()
                if len(op) < 100 and len(op) > 3:
                    operator = op
                    break

        # Determine operator type
        if operator:
            op_lower = operator.lower()
            if 'town council' in op_lower or 'parish council' in op_lower:
                operator_type = 'town_council'
            elif 'association' in op_lower or 'community' in op_lower:
                operator_type = 'community_association'
            elif 'trust' in op_lower or 'trustee' in op_lower:
                operator_type = 'trust'
            else:
                operator_type = 'community_group'

        if not operator:
            operator_type = 'community_group'
    else:
        operator = 'Lancashire County Council'
        operator_type = 'local_authority'

    # --- Extract address and postcode ---
    address = None
    postcode = None

    # Look for postcode pattern in page text
    text = soup.get_text(' ', strip=True)
    pc_match = re.search(r'([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})', text)
    if pc_match:
        postcode = pc_match.group(1).strip().upper()
        # Normalise spacing
        postcode = re.sub(r'\s+', ' ', postcode)
        if ' ' not in postcode and len(postcode) > 4:
            postcode = postcode[:-3] + ' ' + postcode[-3:]

    # Try to extract address — usually near the top, before opening hours
    # Look for text between the h1 and either "Opening" or "Phone"
    main_content = soup.find('main') or soup.find('article') or soup
    paragraphs = main_content.find_all(['p', 'div'])
    for p in paragraphs[:10]:
        p_text = p.get_text(strip=True)
        if postcode and postcode in p_text.upper():
            address = p_text
            break
        # Address-like: contains comma-separated parts with a postcode pattern
        if re.search(r'[A-Z]{1,2}\d', p_text) and ',' in p_text and len(p_text) < 200:
            address = p_text
            break

    # --- Extract phone number ---
    phone = None
    phone_match = re.search(r'(\d{4,5}\s?\d{5,7})', text)
    if not phone_match:
        phone_match = re.search(r'(0\d{2,4}\s?\d{3}\s?\d{3,4})', text)
    if phone_match:
        phone = phone_match.group(1).strip()

    # --- Extract email ---
    email = None
    email_match = re.search(r'([\w.+-]+@[\w-]+\.[\w.]+)', text)
    if email_match:
        email = email_match.group(1)

    # --- Extract services ---
    services = []
    service_keywords = {
        'computer': 'computers',
        'wi-fi': 'wifi',
        'wifi': 'wifi',
        'printing': 'printing',
        'photocopying': 'photocopying',
        'scanner': 'scanning',
        'children': 'children_lending',
        'adult': 'adult_lending',
        'book lending': 'book_lending',
        'book exchange': 'book_exchange',
        'meeting': 'meeting_space',
        'cafe': 'cafe',
        'refreshment': 'refreshments',
        'newspaper': 'newspapers',
        'local studies': 'local_studies',
        'cooperative shop': 'cooperative_shop',
        'warm space': 'warm_space',
        'community space': 'community_space',
    }
    for keyword, service_id in service_keywords.items():
        if keyword in page_text and service_id not in services:
            services.append(service_id)

    # --- Determine service status ---
    if 'permanently closed' in page_text or 'no longer available' in page_text:
        service_status = 'closed'
    elif is_community:
        service_status = 'community_managed'
    else:
        service_status = 'active'

    # --- Service type ---
    if is_community:
        service_type = 'community_library'
    elif 'campus' in lib_info['slug']:
        service_type = 'campus_library'
    elif 'central' in lib_info['slug'] or 'harris' in lib_info['slug']:
        service_type = 'central_library'
    else:
        service_type = 'branch_library'

    return {
        'name': lib_info['name'],
        'slug': lib_info['slug'],
        'web_url': lib_info['url'],
        'service_status': service_status,
        'service_type': service_type,
        'operator': operator,
        'operator_type': operator_type,
        'community_managed': is_community,
        'address': address,
        'postcode': postcode,
        'phone': phone,
        'email': email,
        'services_provided': sorted(services),
        'scraped_at': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
    }


def load_property_assets(council_dir):
    """Load property_assets.json for matching."""
    assets_path = Path(council_dir) / 'property_assets.json'
    if not assets_path.exists():
        log.error(f"property_assets.json not found at {assets_path}")
        return []
    with open(assets_path) as f:
        data = json.load(f)
    assets = data.get('assets', [])
    log.info(f"Loaded {len(assets)} property assets")
    return assets


def tokenize(text):
    """Tokenize a name for Jaccard similarity."""
    if not text:
        return set()
    # Remove common words and punctuation, lowercase, split
    text = re.sub(r'[^\w\s]', '', text.lower())
    stop_words = {'the', 'a', 'an', 'of', 'and', 'at', 'in', 'on', 'for',
                  'former', 'old', 'new', 'branch', 'cat', 'community'}
    tokens = set(text.split()) - stop_words
    return tokens


def jaccard_similarity(set_a, set_b):
    """Compute Jaccard similarity between two token sets."""
    if not set_a or not set_b:
        return 0.0
    intersection = set_a & set_b
    union = set_a | set_b
    return len(intersection) / len(union) if union else 0.0


def match_facilities_to_assets(facilities, assets):
    """Match scraped library facilities to property_assets records."""
    # Filter to library-category assets
    library_assets = [a for a in assets if (a.get('category') or '').lower() == 'library']
    log.info(f"Matching {len(facilities)} scraped libraries to {len(library_assets)} library assets")

    matches = {}
    unmatched_facilities = []
    matched_asset_ids = set()

    for facility in facilities:
        fac_pc = (facility.get('postcode') or '').upper().replace(' ', '')
        fac_name = facility.get('name', '')
        fac_tokens = tokenize(fac_name)
        slug = facility.get('slug', '')

        best_match = None
        best_score = 0
        best_method = ''

        # Check manual overrides first
        if slug in MANUAL_OVERRIDES:
            override_id = MANUAL_OVERRIDES[slug]
            for asset in library_assets:
                if asset.get('id') == override_id:
                    best_match = asset
                    best_score = 1.0
                    best_method = 'manual_override'
                    break

        if not best_match:
            for asset in library_assets:
                if asset['id'] in matched_asset_ids:
                    continue  # Already matched

                asset_pc = (asset.get('postcode') or '').upper().replace(' ', '')
                asset_name = asset.get('name', '')
                asset_tokens = tokenize(asset_name)

                score = 0
                method_parts = []

                # Method 1: Exact postcode match
                if fac_pc and asset_pc and fac_pc == asset_pc:
                    score += 0.5
                    method_parts.append('postcode')

                # Method 2: Name token similarity
                name_sim = jaccard_similarity(fac_tokens, asset_tokens)
                if name_sim >= 0.3:
                    score += name_sim * 0.5
                    method_parts.append(f'name_token({name_sim:.2f})')

                # Method 3: Slug in asset name
                slug_clean = slug.replace('-', ' ')
                if slug_clean in asset_name.lower():
                    score += 0.3
                    method_parts.append('slug_in_name')

                if score > best_score:
                    best_score = score
                    best_match = asset
                    best_method = '+'.join(method_parts)

        # Accept match if score above threshold
        if best_match and best_score >= 0.3:
            asset_id = best_match['id']
            matched_asset_ids.add(asset_id)
            matches[asset_id] = {
                **{k: v for k, v in facility.items() if k != 'slug'},
                'match_method': best_method,
                'match_confidence': round(best_score, 2),
                'matched_asset_name': best_match.get('name', ''),
            }
            log.info(f"    ✓ {facility['name']} → {best_match.get('name')} "
                     f"(score={best_score:.2f}, method={best_method})")
        else:
            unmatched_facilities.append(facility)
            log.warning(f"    ✗ {facility['name']} — no match found "
                        f"(best_score={best_score:.2f})")

    log.info(f"\nMatching results: {len(matches)} matched, {len(unmatched_facilities)} unmatched")
    return matches, unmatched_facilities


def main():
    parser = argparse.ArgumentParser(description='Facility Enrichment ETL for AI DOGE')
    parser.add_argument('--council', default='lancashire_cc', help='Council ID')
    parser.add_argument('--dry-run', action='store_true',
                        help='Print what would be generated without writing')
    args = parser.parse_args()

    if not HAS_DEPS:
        print("ERROR: requests and beautifulsoup4 required")
        print("  pip install requests beautifulsoup4")
        sys.exit(1)

    council_dir = DATA_DIR / args.council

    print(f"\n=== Facility Enrichment ETL ===")
    print(f"Council: {args.council}")
    print(f"Output: {council_dir / 'facility_enrichment.json'}")

    # --- 1. Scrape library index ---
    print(f"\n--- Step 1: Scraping LCC library index ---")
    library_list = scrape_library_index()
    if not library_list:
        print("ERROR: No libraries found on index page")
        sys.exit(1)

    # --- 2. Scrape each library detail page ---
    print(f"\n--- Step 2: Scraping {len(library_list)} library detail pages ---")
    facilities = []
    for lib in library_list:
        detail = scrape_library_detail(lib)
        if detail:
            facilities.append(detail)
        else:
            log.warning(f"  Skipped {lib['name']} — could not scrape detail page")

    print(f"\nScraped {len(facilities)} library detail pages")

    # Count by status
    status_counts = {}
    for f in facilities:
        s = f.get('service_status', 'unknown')
        status_counts[s] = status_counts.get(s, 0) + 1
    print(f"  Service status breakdown: {status_counts}")

    community_count = sum(1 for f in facilities if f.get('community_managed'))
    print(f"  Community-managed: {community_count}")

    # --- 3. Match to property assets ---
    print(f"\n--- Step 3: Matching to property_assets.json ---")
    assets = load_property_assets(council_dir)
    if not assets:
        print("WARNING: No property assets found — outputting unmatched facilities only")
        matches = {}
        unmatched = facilities
    else:
        matches, unmatched = match_facilities_to_assets(facilities, assets)

    # --- 4. Build output ---
    print(f"\n--- Step 4: Building output ---")

    output = {
        'meta': {
            'generated': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
            'council': args.council,
            'sources': [{
                'type': 'library',
                'source': 'lancashire.gov.uk',
                'index_url': LIBRARY_INDEX,
                'scraped_count': len(facilities),
                'scraped_at': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
            }],
            'matched': len(matches),
            'unmatched': len(unmatched),
            'status_breakdown': status_counts,
            'community_managed_count': community_count,
        },
        'facilities': matches,
        'unmatched_facilities': [
            {k: v for k, v in f.items() if k != 'slug'}
            for f in unmatched
        ],
    }

    if args.dry_run:
        print(f"\n--- DRY RUN — would write {len(matches)} matched facilities ---")
        print(json.dumps(output['meta'], indent=2))
        for aid, fac in list(matches.items())[:5]:
            print(f"\n  {aid}: {fac.get('name')} → {fac.get('service_status')}")
            print(f"    operator: {fac.get('operator')}")
            print(f"    services: {fac.get('services_provided')}")
        return

    # Write output
    out_path = council_dir / 'facility_enrichment.json'
    with open(out_path, 'w') as f:
        json.dump(output, f, separators=(',', ':'))

    print(f"\n✓ Written {out_path}")
    print(f"  {len(matches)} matched facilities")
    print(f"  {len(unmatched)} unmatched (saved for manual review)")

    # Quick summary of community-managed matches
    cm_matches = {k: v for k, v in matches.items() if v.get('community_managed')}
    if cm_matches:
        print(f"\n  Community-managed libraries matched:")
        for aid, fac in cm_matches.items():
            print(f"    {fac.get('name')} → {fac.get('operator')} (asset: {fac.get('matched_asset_name')})")


if __name__ == '__main__':
    main()
