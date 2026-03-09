#!/usr/bin/env python3
"""
data_notifier.py — Pipeline Notification System for AI DOGE
Sends alerts via WhatsApp and Telegram when data pipeline events occur.

Can be used standalone or imported by auto_etl.py and data_monitor.py.

Usage:
    python3 data_notifier.py --message "Test alert"           # Send test message
    python3 data_notifier.py --success burnley 847 94         # Success alert
    python3 data_notifier.py --stale hyndburn 96              # Stale data alert
    python3 data_notifier.py --failure pendle "CSV format changed"  # Failure alert
    python3 data_notifier.py --digest                         # Weekly digest
    python3 data_notifier.py --channel telegram --message "Test"  # Telegram only
    python3 data_notifier.py --gap-found lancaster 2022-23,2023-24  # Gap alert

Cron: Called by auto_etl.py and data_monitor.py, not directly scheduled.
"""

import argparse
import json
import logging
import os
from datetime import datetime

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler()],
)
log = logging.getLogger('DataNotifier')

# ── Config ───────────────────────────────────────────────────────────

OPENCLAW_TOKEN = os.environ.get(
    'OPENCLAW_TOKEN', '7fa99c995e62569c0dab81de19b94b998918e33086540b15'
)
WHATSAPP_URL = 'http://127.0.0.1:18789/api/send'
TELEGRAM_URL = 'http://127.0.0.1:18790/api/send'
RECIPIENT = '+447308907628'
TIMEOUT = 10

COUNCIL_NAMES = {
    'burnley': 'Burnley', 'hyndburn': 'Hyndburn', 'pendle': 'Pendle',
    'rossendale': 'Rossendale', 'lancaster': 'Lancaster', 'ribble_valley': 'Ribble Valley',
    'chorley': 'Chorley', 'south_ribble': 'South Ribble', 'preston': 'Preston',
    'west_lancashire': 'West Lancashire', 'wyre': 'Wyre', 'fylde': 'Fylde',
    'lancashire_cc': 'Lancashire CC', 'blackpool': 'Blackpool',
    'blackburn': 'Blackburn w/ Darwen',
}


def _council_name(council_id):
    """Return display name for a council ID."""
    return COUNCIL_NAMES.get(council_id, council_id.replace('_', ' ').title())


# ── Send Functions ───────────────────────────────────────────────────

def _send(url, message):
    """POST a message to an OpenClaw endpoint. Never raises."""
    if not HAS_REQUESTS:
        log.warning('requests not installed — notification skipped')
        return False
    try:
        resp = requests.post(
            url,
            headers={
                'Authorization': f'Bearer {OPENCLAW_TOKEN}',
                'Content-Type': 'application/json',
            },
            json={'to': RECIPIENT, 'body': message},
            timeout=TIMEOUT,
        )
        log.info(f'Notification sent to {url}: {resp.status_code}')
        return resp.status_code < 400
    except Exception as e:
        log.warning(f'Notification failed ({url}): {e}')
        return False


def send_whatsapp(message):
    """Send a message via WhatsApp (OpenClaw port 18789)."""
    return _send(WHATSAPP_URL, message)


def send_telegram(message):
    """Send a message via Telegram (OpenClaw port 18790)."""
    return _send(TELEGRAM_URL, message)


def notify(message, channel='both'):
    """Send to specified channel(s): 'whatsapp', 'telegram', or 'both'."""
    results = []
    if channel in ('whatsapp', 'both'):
        results.append(send_whatsapp(message))
    if channel in ('telegram', 'both'):
        results.append(send_telegram(message))
    return any(results)


# ── Alert Functions ──────────────────────────────────────────────────

def notify_success(council_id, new_records, qc_score, date_range=None, channel='both'):
    """Alert: successful pipeline run with new data."""
    name = _council_name(council_id)
    range_str = f' ({date_range})' if date_range else ''
    msg = (
        f"\U0001f7e2 {name}: +{new_records:,} records{range_str}. "
        f"QC: {qc_score}/100. Deploying."
    )
    return notify(msg, channel)


def notify_stale(council_id, staleness_days, channel='both'):
    """Alert: council data is stale."""
    name = _council_name(council_id)
    msg = (
        f"\U0001f7e1 {name}: No new data for {staleness_days} days. "
        f"Check transparency portal."
    )
    return notify(msg, channel)


def notify_failure(council_id, error_msg, channel='both'):
    """Alert: pipeline failure requiring intervention."""
    name = _council_name(council_id)
    msg = (
        f"\U0001f534 {name}: Pipeline failed \u2014 {error_msg}. "
        f"Manual intervention needed."
    )
    return notify(msg, channel)


def notify_gap_found(council_id, missing_years, channel='both'):
    """Alert: missing financial years detected."""
    name = _council_name(council_id)
    if isinstance(missing_years, list):
        missing_years = ', '.join(str(y) for y in missing_years)
    msg = (
        f"\U0001f4ca {name}: Missing financial years: {missing_years}. "
        f"Run --fill-gaps to download."
    )
    return notify(msg, channel)


def notify_digest(council_states, channel='both'):
    """Weekly digest: summary of all council pipeline states.

    Args:
        council_states: dict of {council_id: {'status': 'fresh'|'stale'|'error',
                        'records': int, 'qc_score': int, 'staleness_days': int}}
    """
    fresh = [c for c, s in council_states.items() if s.get('status') == 'fresh']
    stale = [c for c, s in council_states.items() if s.get('status') == 'stale']
    errors = [c for c, s in council_states.items() if s.get('status') == 'error']
    total_records = sum(s.get('records', 0) for s in council_states.values())
    avg_qc = 0
    qc_vals = [s['qc_score'] for s in council_states.values() if s.get('qc_score')]
    if qc_vals:
        avg_qc = sum(qc_vals) // len(qc_vals)

    lines = [
        f"\U0001f4cb AI DOGE Weekly Digest \u2014 {datetime.now().strftime('%d %b %Y')}",
        f"\U0001f7e2 Fresh: {len(fresh)}/15  \U0001f7e1 Stale: {len(stale)}  \U0001f534 Error: {len(errors)}",
        f"Total records: {total_records:,}  |  Avg QC: {avg_qc}/100",
    ]
    if stale:
        stale_names = ', '.join(_council_name(c) for c in stale[:5])
        if len(stale) > 5:
            stale_names += f' +{len(stale) - 5} more'
        lines.append(f"Stale: {stale_names}")
    if errors:
        error_names = ', '.join(_council_name(c) for c in errors)
        lines.append(f"Errors: {error_names}")

    return notify('\n'.join(lines), channel)


# ── CLI ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='AI DOGE Pipeline Notification System'
    )
    parser.add_argument('--channel', choices=['whatsapp', 'telegram', 'both'],
                        default='both', help='Notification channel (default: both)')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--message', type=str, help='Send a custom message')
    group.add_argument('--success', nargs=3, metavar=('COUNCIL', 'RECORDS', 'QC'),
                       help='Success alert: council_id new_records qc_score')
    group.add_argument('--stale', nargs=2, metavar=('COUNCIL', 'DAYS'),
                       help='Stale data alert: council_id staleness_days')
    group.add_argument('--failure', nargs=2, metavar=('COUNCIL', 'ERROR'),
                       help='Failure alert: council_id error_message')
    group.add_argument('--gap-found', nargs=2, metavar=('COUNCIL', 'YEARS'),
                       help='Gap found alert: council_id missing_years (comma-separated)')
    group.add_argument('--digest', action='store_true',
                       help='Send weekly digest (reads pipeline state from stdin as JSON)')

    args = parser.parse_args()

    if args.message:
        notify(args.message, args.channel)
    elif args.success:
        council, records, qc = args.success
        notify_success(council, int(records), int(qc), channel=args.channel)
    elif args.stale:
        council, days = args.stale
        notify_stale(council, int(days), channel=args.channel)
    elif args.failure:
        council, error = args.failure
        notify_failure(council, error, channel=args.channel)
    elif args.gap_found:
        council, years = args.gap_found
        notify_gap_found(council, years.split(','), channel=args.channel)
    elif args.digest:
        import sys
        try:
            states = json.load(sys.stdin)
        except Exception:
            log.error('Digest requires JSON on stdin: {"burnley": {"status": "fresh", ...}}')
            sys.exit(1)
        notify_digest(states, args.channel)


if __name__ == '__main__':
    main()
