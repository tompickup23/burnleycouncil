#!/usr/bin/env python3
"""
data_monitor.py — Council Transparency Data Monitor for AI DOGE
Checks 15 Lancashire council transparency pages for new spending data.
Detects changes via HTTP HEAD headers and page content hashing.
Identifies stale data and historical data gaps.

Usage:
    python3 data_monitor.py --check-all               # Check all councils
    python3 data_monitor.py --council burnley           # Check single council
    python3 data_monitor.py --dry-run                   # Check without updating state
    python3 data_monitor.py --fill-gaps                 # Detect historical gaps
    python3 data_monitor.py --health-report             # Full health report

Cron: 0 6 * * * /usr/bin/python3 /root/aidoge/burnley-council/scripts/data_monitor.py --check-all >> /var/log/aidoge/monitor.log 2>&1
"""

import argparse
import fcntl
import hashlib
import json
import logging
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# Optional imports — fail gracefully if not installed
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# ─── Logging ──────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler()],
)
log = logging.getLogger('DataMonitor')

# Log to file if running on server
LOG_FILE = Path('/var/log/aidoge/monitor.log')
if LOG_FILE.parent.exists():
    fh = logging.FileHandler(LOG_FILE)
    fh.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
    log.addHandler(fh)

# ─── Paths ────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent  # burnley-council/
DATA_DIR = BASE_DIR / 'data'

# VPS fallback (clawd-worker on vps-main)
if not DATA_DIR.exists():
    VPS_DATA = Path('/root/aidoge/burnley-council/data')
    if VPS_DATA.exists():
        DATA_DIR = VPS_DATA
        log.info(f'Using VPS data dir: {DATA_DIR}')

SHARED_DIR = DATA_DIR / 'shared'
STATE_FILE = SHARED_DIR / 'pipeline_state.json'

# ─── Lockfile ─────────────────────────────────────────────────────────
LOCK_FILE = Path('/tmp/aidoge-data-monitor.lock')

COUNCILS = [
    'burnley', 'hyndburn', 'pendle', 'rossendale', 'lancaster',
    'ribble_valley', 'chorley', 'south_ribble', 'preston',
    'west_lancashire', 'wyre', 'fylde', 'lancashire_cc',
    'blackpool', 'blackburn',
]

# ─── Council Source Registry ──────────────────────────────────────────
COUNCIL_SOURCES = {
    'hyndburn': {
        'name': 'Hyndburn',
        'url': 'https://www.hyndburnbc.gov.uk/download/expenditure-over-250-2/',
        'check_method': 'page_hash',
        'spending_threshold': 250,
        'data_start_fy': '2016/17',
    },
    'burnley': {
        'name': 'Burnley',
        'url': None,  # Manual CSVs, no URL
        'check_method': 'skip',
        'spending_threshold': 500,
        'data_start_fy': '2021/22',
    },
    'pendle': {
        'name': 'Pendle',
        'url': 'https://www.pendle.gov.uk/downloads/download/2353/council_spending_over_500',
        'check_method': 'page_hash',
        'spending_threshold': 500,
        'data_start_fy': '2021/22',
    },
    'rossendale': {
        'name': 'Rossendale',
        'url': None,  # Custom sources
        'check_method': 'skip',
        'spending_threshold': 500,
        'data_start_fy': '2021/22',
    },
    'lancaster': {
        'name': 'Lancaster',
        'url': 'https://www.lancaster.gov.uk/the-council-and-democracy/budgets-and-spending/expenditure-over-500',
        'check_method': 'page_hash',
        'spending_threshold': 500,
        'data_start_fy': '2021/22',
    },
    'ribble_valley': {
        'name': 'Ribble Valley',
        'url': 'https://www.ribblevalley.gov.uk/downloads/download/107/over-250-spend-data',
        'check_method': 'page_hash',
        'spending_threshold': 250,
        'data_start_fy': '2021/22',
    },
    'chorley': {
        'name': 'Chorley',
        'url': 'https://chorley.gov.uk/transparency/spending-over-500',
        'check_method': 'page_hash',
        'spending_threshold': 500,
        'data_start_fy': '2021/22',
    },
    'south_ribble': {
        'name': 'South Ribble',
        'url': 'https://southribble.gov.uk/transparency/spending-over-500',
        'check_method': 'page_hash',
        'spending_threshold': 250,
        'data_start_fy': '2021/22',
    },
    'lancashire_cc': {
        'name': 'Lancashire CC',
        'url': 'https://transparency.lancashire.gov.uk/',
        'check_method': 'page_hash',
        'spending_threshold': 250,
        'data_start_fy': '2024/25',
    },
    'blackpool': {
        'name': 'Blackpool',
        'url': 'https://www.blackpool.gov.uk/Your-Council/Transparency-and-open-data/Budget,-spending-and-procurement/Payments-over-250.aspx',
        'check_method': 'page_hash',
        'spending_threshold': 250,
        'data_start_fy': '2019/20',
    },
    'west_lancashire': {
        'name': 'West Lancashire',
        'url': 'https://www.westlancs.gov.uk/about-the-council/spending-strategies-performance/council-budget/spending-over-500.aspx',
        'check_method': 'page_hash',
        'spending_threshold': 500,
        'data_start_fy': '2016/17',
    },
    'blackburn': {
        'name': 'Blackburn w/ Darwen',
        'url': 'http://datashare.blackburn.gov.uk/node/2',
        'check_method': 'page_hash',
        'spending_threshold': 0,
        'data_start_fy': '2019/20',
    },
    'wyre': {
        'name': 'Wyre',
        'url': 'https://www.wyre.gov.uk/open-data',
        'check_method': 'page_hash',
        'spending_threshold': 500,
        'data_start_fy': '2017/18',
    },
    'preston': {
        'name': 'Preston',
        'url': 'https://www.preston.gov.uk/article/1498/Spending-over-500',
        'check_method': 'page_hash',
        'spending_threshold': 500,
        'data_start_fy': '2019/20',
    },
    'fylde': {
        'name': 'Fylde',
        'url': 'https://new.fylde.gov.uk/council/transparency/spending/',
        'check_method': 'page_hash',
        'spending_threshold': 500,
        'data_start_fy': '2015/16',
    },
}

# Polling freshness config
POLLING_JSON = DATA_DIR / 'shared' / 'polling.json'
POLLING_MAX_AGE_DAYS = 3  # Refresh polls every 3 days

HTTP_HEADERS = {
    'User-Agent': 'AI-DOGE-Monitor/1.0 (aidoge.co.uk)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

# Staleness thresholds (days)
FRESH_THRESHOLD = 90
AGING_THRESHOLD = 180


# ─── Lockfile Class ───────────────────────────────────────────────────

class PipelineLock:
    """File-based lock to prevent concurrent runs."""

    def __init__(self):
        self._fd = None

    def acquire(self):
        """Try to acquire exclusive lock. Returns True if acquired."""
        try:
            self._fd = open(LOCK_FILE, 'w')
            fcntl.flock(self._fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self._fd.write(f'{os.getpid()} {datetime.now().isoformat()}\n')
            self._fd.flush()
            log.info('Lockfile acquired')
            return True
        except (IOError, OSError):
            log.warning('Another monitor/ETL process is running — exiting')
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


# ─── JSON Helpers ─────────────────────────────────────────────────────

def load_json(path):
    """Load JSON file, return empty dict on failure."""
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError) as e:
        log.debug(f'Could not load {path}: {e}')
        return {}


def save_json(path, data):
    """Save JSON file with directory creation."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)
    log.info(f'Saved {path}')


# ─── Financial Year Utilities ─────────────────────────────────────────

def get_current_fy():
    """Return current financial year string (e.g., '2025/26'). FY starts April."""
    now = datetime.now()
    if now.month >= 4:
        return f'{now.year}/{str(now.year + 1)[2:]}'
    else:
        return f'{now.year - 1}/{str(now.year)[2:]}'


def parse_fy_start_year(fy_str):
    """Extract start year from FY string like '2021/22' -> 2021."""
    try:
        return int(fy_str.split('/')[0])
    except (ValueError, IndexError):
        return None


def get_expected_years(start_fy):
    """Return list of all FYs from start_fy to current FY (inclusive)."""
    start_year = parse_fy_start_year(start_fy)
    current_fy = get_current_fy()
    end_year = parse_fy_start_year(current_fy)
    if start_year is None or end_year is None:
        return []
    years = []
    for y in range(start_year, end_year + 1):
        years.append(f'{y}/{str(y + 1)[2:]}')
    return years


# ─── HTTP Checking ────────────────────────────────────────────────────

def check_http_headers(url):
    """HEAD request to check Last-Modified, ETag, Content-Length.
    Returns dict with header values. Timeout 15s, graceful failure."""
    if not HAS_REQUESTS:
        log.warning('requests not installed — skipping HTTP HEAD check')
        return {'status_code': None, 'error': 'requests not installed'}
    try:
        resp = requests.head(url, headers=HTTP_HEADERS, timeout=15, allow_redirects=True)
        return {
            'status_code': resp.status_code,
            'last_modified': resp.headers.get('Last-Modified'),
            'etag': resp.headers.get('ETag'),
            'content_length': resp.headers.get('Content-Length'),
        }
    except requests.RequestException as e:
        log.warning(f'HTTP HEAD failed for {url}: {e}')
        return {'status_code': None, 'error': str(e)}


def strip_dynamic_content(html):
    """Remove dynamic elements that change between requests to reduce hash false positives.
    Strips: HTML comments, <script> tags, nonces, CSRF tokens, timestamps, session IDs."""
    # Remove HTML comments
    html = re.sub(r'<!--.*?-->', '', html, flags=re.DOTALL)
    # Remove <script> tags and content
    html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
    # Remove nonce attributes
    html = re.sub(r'\s+nonce="[^"]*"', '', html)
    html = re.sub(r"\s+nonce='[^']*'", '', html)
    # Remove CSRF tokens (common patterns)
    html = re.sub(r'name="csrf[^"]*"\s+value="[^"]*"', '', html, flags=re.IGNORECASE)
    html = re.sub(r'name="__RequestVerificationToken"\s+value="[^"]*"', '', html, flags=re.IGNORECASE)
    # Remove ASP.NET __VIEWSTATE and similar
    html = re.sub(r'name="__VIEWSTATE[^"]*"\s+value="[^"]*"', '', html, flags=re.IGNORECASE)
    html = re.sub(r'name="__EVENTVALIDATION"\s+value="[^"]*"', '', html, flags=re.IGNORECASE)
    # Remove session IDs in URLs (common patterns)
    html = re.sub(r'[?&](session_?id|sid|PHPSESSID|JSESSIONID)=[a-zA-Z0-9]+', '', html, flags=re.IGNORECASE)
    # Collapse whitespace for consistent hashing
    html = re.sub(r'\s+', ' ', html)
    return html.strip()


def check_page_hash(url):
    """GET page HTML, strip dynamic elements, return sha256 hash.
    Timeout 30s, returns None on failure."""
    if not HAS_REQUESTS:
        log.warning('requests not installed — skipping page hash check')
        return None
    try:
        resp = requests.get(url, headers=HTTP_HEADERS, timeout=30, allow_redirects=True)
        resp.raise_for_status()
        clean_html = strip_dynamic_content(resp.text)
        return hashlib.sha256(clean_html.encode('utf-8')).hexdigest()
    except requests.RequestException as e:
        log.warning(f'Page hash failed for {url}: {e}')
        return None


# ─── Pipeline State ───────────────────────────────────────────────────

def load_pipeline_state():
    """Load pipeline state from shared data dir."""
    state = load_json(STATE_FILE)
    if not state:
        state = {
            'last_global_run': None,
            'councils': {},
            'total_runs': 0,
            'total_records_processed': 0,
            'failures': [],
        }
    if 'councils' not in state:
        state['councils'] = {}
    return state


def save_pipeline_state(state):
    """Save pipeline state to shared data dir."""
    save_json(STATE_FILE, state)


def _empty_council_state():
    """Return empty state entry for a council."""
    return {
        'last_checked': None,
        'last_new_data': None,
        'last_etl_run': None,
        'page_hash': None,
        'http_headers': {},
        'record_count': 0,
        'date_range': {'min': None, 'max': None},
        'qc_score': None,
        'status': 'unknown',
        'staleness_days': None,
        'gaps': [],
        'spending_version': None,
    }


# ─── Metadata Reading ─────────────────────────────────────────────────

def load_council_metadata(council_id):
    """Load metadata.json for a council. Returns dict or empty dict."""
    meta_path = DATA_DIR / council_id / 'metadata.json'
    return load_json(meta_path)


def detect_spending_version(council_id):
    """Detect spending data version from spending-index.json."""
    index_path = DATA_DIR / council_id / 'spending-index.json'
    index_data = load_json(index_path)
    if not index_data:
        # Check for monolithic spending.json
        spending_path = DATA_DIR / council_id / 'spending.json'
        if spending_path.exists():
            return 'v2'
        return None
    meta = index_data.get('meta', {})
    version = meta.get('version', 3)
    return f'v{version}'


def compute_staleness_days(metadata):
    """Compute days since most recent data point from metadata date_range."""
    date_range = metadata.get('date_range', {})
    max_date_str = date_range.get('max')
    if not max_date_str:
        return None
    try:
        max_date = datetime.strptime(max_date_str, '%Y-%m-%d')
        delta = datetime.now() - max_date
        return delta.days
    except (ValueError, TypeError):
        return None


# ─── Core Checking Functions ──────────────────────────────────────────

def check_council(council_id, state):
    """Check a single council for new data.

    Returns dict: {changed, new_hash, staleness_days, status, record_count, gaps, error}
    """
    source = COUNCIL_SOURCES.get(council_id)
    if not source:
        log.warning(f'Unknown council: {council_id}')
        return {'changed': False, 'status': 'error', 'error': f'Unknown council: {council_id}'}

    council_state = state.get('councils', {}).get(council_id, _empty_council_state())
    metadata = load_council_metadata(council_id)
    result = {
        'changed': False,
        'new_hash': None,
        'staleness_days': compute_staleness_days(metadata),
        'status': 'unknown',
        'record_count': metadata.get('total_records', 0),
        'spending_version': detect_spending_version(council_id),
        'gaps': [],
        'error': None,
    }

    check_method = source.get('check_method', 'skip')
    url = source.get('url')

    # Determine staleness status from metadata
    if result['staleness_days'] is not None:
        if result['staleness_days'] <= FRESH_THRESHOLD:
            result['status'] = 'fresh'
        elif result['staleness_days'] <= AGING_THRESHOLD:
            result['status'] = 'aging'
        else:
            result['status'] = 'stale'
    else:
        result['status'] = 'no_data'

    if check_method == 'skip' or url is None:
        log.info(f'{council_id}: skipped (manual source, no URL)')
        return result

    now_iso = datetime.now(timezone.utc).isoformat()

    if check_method == 'page_hash':
        new_hash = check_page_hash(url)
        if new_hash is None:
            result['error'] = 'page_hash_failed'
            log.warning(f'{council_id}: page hash check failed')
            return result
        result['new_hash'] = new_hash
        old_hash = council_state.get('page_hash')
        if old_hash and new_hash != old_hash:
            result['changed'] = True
            log.info(f'{council_id}: PAGE CHANGED — new data likely available')
        elif old_hash:
            log.info(f'{council_id}: no change (hash matches)')
        else:
            log.info(f'{council_id}: first check (hash stored)')

    elif check_method == 'http_head':
        headers = check_http_headers(url)
        if headers.get('status_code') is None:
            result['error'] = 'http_head_failed'
            log.warning(f'{council_id}: HTTP HEAD check failed')
            return result
        old_headers = council_state.get('http_headers', {})
        # Compare Last-Modified, ETag, Content-Length for changes
        changed = False
        for key in ('last_modified', 'etag', 'content_length'):
            old_val = old_headers.get(key)
            new_val = headers.get(key)
            if old_val and new_val and old_val != new_val:
                changed = True
                break
        result['changed'] = changed
        result['http_headers'] = headers
        if changed:
            log.info(f'{council_id}: HEADERS CHANGED — new data likely')
        else:
            log.info(f'{council_id}: no change (headers match)')

    return result


def detect_gaps(council_id):
    """Compare financial years in metadata vs expected years.
    Returns list of missing FY strings."""
    source = COUNCIL_SOURCES.get(council_id)
    if not source:
        return []
    start_fy = source.get('data_start_fy')
    if not start_fy:
        return []
    expected = get_expected_years(start_fy)
    metadata = load_council_metadata(council_id)
    actual = metadata.get('financial_years', [])
    # Normalise: some metadata uses "2021-22" vs "2021/22"
    actual_normalised = set()
    for fy in actual:
        actual_normalised.add(fy.replace('-', '/'))
    missing = [fy for fy in expected if fy not in actual_normalised]
    return missing


# ─── Health Report ────────────────────────────────────────────────────

def health_report(results, state):
    """Print formatted health report to stdout."""
    now_str = datetime.now().strftime('%d %b %Y')
    print(f'\nAI DOGE Data Health Report -- {now_str}')
    print('=' * 60)
    print(f'{"Council":<20} {"Status":<10} {"Staleness":<12} {"Records":>10}  {"Gaps":>4}')
    print('-' * 60)

    status_icons = {
        'fresh': 'FRESH',
        'aging': 'AGING',
        'stale': 'STALE',
        'no_data': 'NO DATA',
        'unknown': '?????',
        'error': 'ERROR',
    }

    counts = {'fresh': 0, 'aging': 0, 'stale': 0, 'no_data': 0, 'error': 0, 'unknown': 0}
    total_records = 0
    total_changed = 0

    for council_id in COUNCILS:
        source = COUNCIL_SOURCES.get(council_id, {})
        name = source.get('name', council_id)
        r = results.get(council_id, {})
        status = r.get('status', 'unknown')
        staleness = r.get('staleness_days')
        records = r.get('record_count', 0)
        gaps = r.get('gaps', [])
        changed = r.get('changed', False)

        status_label = status_icons.get(status, '?????')
        staleness_str = f'{staleness}d' if staleness is not None else '--'
        changed_flag = ' *NEW*' if changed else ''

        print(f'{name:<20} {status_label:<10} {staleness_str:<12} {records:>10,}  {len(gaps):>4}{changed_flag}')

        counts[status] = counts.get(status, 0) + 1
        total_records += records
        if changed:
            total_changed += 1

    print('-' * 60)
    parts = []
    for s in ('fresh', 'aging', 'stale'):
        if counts[s]:
            parts.append(f'{counts[s]} {s}')
    summary = ', '.join(parts) if parts else 'no data'
    print(f'Total: {summary} | {total_records:,} records')
    if total_changed:
        print(f'Changes detected: {total_changed} council(s) have new data available')

    # Show gaps if any
    any_gaps = False
    for council_id in COUNCILS:
        r = results.get(council_id, {})
        gaps = r.get('gaps', [])
        if gaps:
            if not any_gaps:
                print(f'\nData Gaps Detected:')
                any_gaps = True
            name = COUNCIL_SOURCES.get(council_id, {}).get('name', council_id)
            print(f'  {name}: missing {", ".join(gaps)}')

    if not any_gaps:
        print('\nNo data gaps detected.')

    # Show polling status
    polling_stale = state.get('polling_stale')
    polling_age = state.get('polling_age_days')
    if polling_stale is not None:
        if polling_stale:
            print(f'\nPolling Data: STALE ({polling_age} days old, max {POLLING_MAX_AGE_DAYS})')
        else:
            print(f'\nPolling Data: FRESH ({polling_age} days old)')
    else:
        print(f'\nPolling Data: unknown')

    # Show failures
    failures = state.get('failures', [])
    if failures:
        print(f'\nRecent Failures ({len(failures)}):')
        for f in failures[-5:]:
            print(f'  {f.get("council", "?")} @ {f.get("timestamp", "?")}: {f.get("error", "?")}')

    print()


# ─── Main ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='AI DOGE Data Monitor — council transparency URL checking and gap detection'
    )
    parser.add_argument('--check-all', action='store_true',
                        help='Check all 15 councils')
    parser.add_argument('--council', type=str,
                        help='Check a single council by ID')
    parser.add_argument('--dry-run', action='store_true',
                        help='Check without updating pipeline state')
    parser.add_argument('--fill-gaps', action='store_true',
                        help='Detect historical data gaps for all councils')
    parser.add_argument('--health-report', action='store_true',
                        help='Print full health report')
    parser.add_argument('--no-lock', action='store_true',
                        help='Skip lockfile acquisition')
    args = parser.parse_args()

    # Require at least one mode
    if not (args.check_all or args.council or args.fill_gaps or args.health_report):
        parser.print_help()
        sys.exit(1)

    log.info('AI DOGE Data Monitor starting')
    log.info(f'Data dir: {DATA_DIR}')

    # Acquire lock
    lock = PipelineLock()
    if not args.no_lock and not args.dry_run:
        if not lock.acquire():
            log.info('Exiting — another process holds the lock')
            sys.exit(0)

    try:
        state = load_pipeline_state()

        # Determine which councils to check
        if args.council:
            if args.council not in COUNCIL_SOURCES:
                log.error(f'Unknown council: {args.council}. Valid: {", ".join(COUNCILS)}')
                sys.exit(1)
            councils_to_check = [args.council]
        elif args.check_all or args.health_report or args.fill_gaps:
            councils_to_check = COUNCILS
        else:
            councils_to_check = []

        results = {}
        changed_councils = []

        for council_id in councils_to_check:
            log.info(f'--- Checking {council_id} ---')

            # Run URL/hash check (skip if only doing --fill-gaps)
            if args.check_all or args.council or args.health_report:
                result = check_council(council_id, state)
            else:
                # fill-gaps only: just load metadata-based info
                metadata = load_council_metadata(council_id)
                result = {
                    'changed': False,
                    'new_hash': None,
                    'staleness_days': compute_staleness_days(metadata),
                    'status': 'unknown',
                    'record_count': metadata.get('total_records', 0),
                    'spending_version': detect_spending_version(council_id),
                    'gaps': [],
                    'error': None,
                }

            # Detect gaps
            if args.fill_gaps or args.health_report or args.check_all:
                gaps = detect_gaps(council_id)
                result['gaps'] = gaps
                if gaps:
                    log.info(f'{council_id}: {len(gaps)} data gap(s): {", ".join(gaps)}')

            results[council_id] = result

            if result.get('changed'):
                changed_councils.append(council_id)

            # Update state (unless dry-run)
            if not args.dry_run:
                if council_id not in state['councils']:
                    state['councils'][council_id] = _empty_council_state()

                cs = state['councils'][council_id]
                cs['last_checked'] = datetime.now(timezone.utc).isoformat()
                cs['staleness_days'] = result.get('staleness_days')
                cs['record_count'] = result.get('record_count', 0)
                cs['status'] = result.get('status', 'unknown')
                cs['spending_version'] = result.get('spending_version')
                cs['gaps'] = result.get('gaps', [])

                if result.get('new_hash'):
                    if result.get('changed'):
                        cs['last_new_data'] = datetime.now(timezone.utc).isoformat()
                    cs['page_hash'] = result['new_hash']

                if result.get('http_headers'):
                    cs['http_headers'] = result['http_headers']

                # Load date_range from metadata
                metadata = load_council_metadata(council_id)
                if metadata.get('date_range'):
                    cs['date_range'] = metadata['date_range']

                # Record failures
                if result.get('error'):
                    state['failures'].append({
                        'council': council_id,
                        'timestamp': datetime.now(timezone.utc).isoformat(),
                        'error': result['error'],
                    })
                    # Keep only last 50 failures
                    state['failures'] = state['failures'][-50:]

        # Check polling freshness
        polling_stale = False
        if POLLING_JSON.exists():
            polling_meta = load_json(POLLING_JSON).get('meta', {})
            gen_date = polling_meta.get('generated')
            if gen_date:
                try:
                    from datetime import datetime
                    gen_dt = datetime.strptime(gen_date[:10], '%Y-%m-%d')
                    polling_age = (datetime.utcnow() - gen_dt).days
                    if polling_age > POLLING_MAX_AGE_DAYS:
                        log.info(f'Polling data is {polling_age} days old (max {POLLING_MAX_AGE_DAYS})')
                        polling_stale = True
                        state['polling_stale'] = True
                        state['polling_age_days'] = polling_age
                    else:
                        log.info(f'Polling data is {polling_age} days old — fresh')
                        state['polling_stale'] = False
                        state['polling_age_days'] = polling_age
                except Exception as e:
                    log.warning(f'Could not parse polling date: {e}')
        else:
            log.warning('polling.json not found')
            polling_stale = True
            state['polling_stale'] = True

        # Update global state
        if not args.dry_run:
            state['last_global_run'] = datetime.now(timezone.utc).isoformat()
            state['total_runs'] = state.get('total_runs', 0) + 1
            state['total_records_processed'] = sum(
                cs.get('record_count', 0) for cs in state['councils'].values()
            )
            save_pipeline_state(state)

        # Print health report
        if args.health_report or args.check_all:
            health_report(results, state)

        # Log changed councils
        if changed_councils:
            log.info(f'CHANGED councils: {", ".join(changed_councils)}')
            log.info('Run council_etl.py --download for these councils to ingest new data')

        # Notify stale councils (>90 days)
        stale_councils = [
            (cid, r.get('staleness_days', 0))
            for cid, r in results.items()
            if r.get('status') == 'stale'
        ]
        if stale_councils:
            try:
                from data_notifier import notify_stale
                for council_id, days in stale_councils:
                    notify_stale(council_id, days)
                    log.info(f'Stale notification sent for {council_id} ({days} days)')
            except ImportError:
                log.debug('data_notifier not available — skipping stale notifications')
            except Exception as e:
                log.warning(f'Stale notification failed: {e}')

        # Summary
        log.info(f'Monitor complete: {len(councils_to_check)} councils checked, '
                 f'{len(changed_councils)} changed, '
                 f'{len(stale_councils)} stale')

    finally:
        if not args.no_lock and not args.dry_run:
            lock.release()


if __name__ == '__main__':
    main()
