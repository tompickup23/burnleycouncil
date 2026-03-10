#!/usr/bin/env python3
"""
data_refresh.py — Monthly Data Refresh for AI DOGE
Runs periodic ETLs for non-spending data sources. Each ETL has a refresh
cadence based on when the upstream source actually updates.

Data source frequencies:
  - Census 2021 (Nomis):       Static until 2031. Run once, skip thereafter.
  - Claimant Count (Nomis):    Monthly DWP release (~3rd Tuesday each month)
  - ASHE Earnings (Nomis):     Annual (October release)
  - Police Crime (data.police): Monthly (~4-6 week lag)
  - Fingertips Health:         Annual (Q1 each year)
  - Polling (aggregator):      Checked daily by auto_pipeline (not here)

Cron schedule (vps-main):
  0 4 1 * * /usr/bin/python3 /root/aidoge/burnley-council/scripts/data_refresh.py --monthly >> /var/log/aidoge/refresh.log 2>&1
  0 5 1 1 * /usr/bin/python3 /root/aidoge/burnley-council/scripts/data_refresh.py --annual >> /var/log/aidoge/refresh.log 2>&1

Fits around existing crons:
  02:00 Sun — auto_etl.py (spending)
  03:00 Wed — data_quality.py
  04:00 1st — THIS SCRIPT (monthly refresh)
  05:00 1st Jan — THIS SCRIPT (annual refresh)
  06:00 daily — data_monitor.py (spending CSV checks)
  08:00 daily — auto_pipeline.py

Assign: Telegram clawdbot receives completion notification.

Usage:
    python3 data_refresh.py --monthly              # Monthly ETLs (claimant, crime)
    python3 data_refresh.py --annual               # Annual ETLs (health, ASHE, census)
    python3 data_refresh.py --census-only           # One-time Census 2021 re-run
    python3 data_refresh.py --dry-run               # Show what would run
    python3 data_refresh.py --council burnley       # Single council only
"""

import argparse
import fcntl
import json
import logging
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler()],
)
log = logging.getLogger('DataRefresh')

# Log to file on server
LOG_FILE = Path('/var/log/aidoge/refresh.log')
if LOG_FILE.parent.exists():
    fh = logging.FileHandler(LOG_FILE)
    fh.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))
    log.addHandler(fh)

BASE_DIR = Path(__file__).parent.parent  # burnley-council/
SCRIPTS_DIR = BASE_DIR / 'scripts'
DATA_DIR = BASE_DIR / 'data'
LOCK_FILE = Path('/tmp/aidoge_refresh.lock')
PYTHON = '/usr/bin/python3'

# State file tracks when each ETL was last run
STATE_FILE = DATA_DIR / 'shared' / 'refresh_state.json'


def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding='utf-8'))
    return {}


def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding='utf-8')


def run_etl(script, args=None, desc="ETL"):
    """Run a Python ETL script with optional args. Returns (success, duration)."""
    cmd = [PYTHON, str(SCRIPTS_DIR / script)]
    if args:
        cmd.extend(args)
    log.info(f"Running: {desc} — {' '.join(cmd)}")
    start = time.time()
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
        duration = round(time.time() - start, 1)
        if result.returncode == 0:
            log.info(f"  OK: {desc} completed in {duration}s")
            return True, duration
        else:
            log.error(f"  FAIL: {desc} returned {result.returncode}")
            if result.stderr:
                log.error(f"  stderr: {result.stderr[:500]}")
            return False, duration
    except subprocess.TimeoutExpired:
        log.error(f"  TIMEOUT: {desc} exceeded 30 minutes")
        return False, 1800
    except Exception as e:
        log.error(f"  ERROR: {desc}: {e}")
        return False, 0


def notify_telegram(message):
    """Send completion notification to Telegram clawdbot."""
    try:
        import urllib.request
        url = 'http://localhost:18790/api/send'
        data = json.dumps({'message': message}).encode()
        req = urllib.request.Request(url, data=data, headers={
            'Content-Type': 'application/json',
            'Authorization': 'Bearer clawdbot-tg',
        })
        urllib.request.urlopen(req, timeout=10)
        log.info("Telegram notification sent")
    except Exception as e:
        log.warning(f"Telegram notification failed: {e}")


def main():
    parser = argparse.ArgumentParser(description="Monthly Data Refresh for AI DOGE")
    parser.add_argument('--monthly', action='store_true', help='Run monthly ETLs (claimant count, crime)')
    parser.add_argument('--annual', action='store_true', help='Run annual ETLs (health, ASHE, full census)')
    parser.add_argument('--census-only', action='store_true', help='One-time Census 2021 full re-run')
    parser.add_argument('--council', help='Single council ID (default: all)')
    parser.add_argument('--dry-run', action='store_true', help='Show what would run')
    parser.add_argument('--skip-deploy', action='store_true', help='Do not git push after')
    args = parser.parse_args()

    if not (args.monthly or args.annual or args.census_only):
        parser.print_help()
        return

    # Lockfile
    if not args.dry_run:
        try:
            lock_fd = open(LOCK_FILE, 'w')
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (IOError, OSError):
            log.error("Another data_refresh instance is running. Aborting.")
            return

    state = load_state()
    results = []
    council_args = ['--council', args.council] if args.council else []

    # ─── MONTHLY: Claimant count, crime, economy claimant ───
    if args.monthly:
        log.info("=== MONTHLY DATA REFRESH ===")

        # 1. Economy ETL — claimant count is monthly (LA + ward)
        if args.dry_run:
            log.info("  [DRY RUN] Would run: economy_etl.py (claimant count refresh)")
        else:
            ok, dur = run_etl('economy_etl.py', council_args, 'Economy ETL (claimant count)')
            results.append(('economy', ok, dur))
            state['economy_last_run'] = datetime.now().isoformat()

        # 2. Census ETL --constituency — claimant count by constituency
        if args.dry_run:
            log.info("  [DRY RUN] Would run: census_etl.py --constituency")
        else:
            ok, dur = run_etl('census_etl.py', ['--constituency'], 'Constituency claimant count')
            results.append(('constituency_claimant', ok, dur))
            state['constituency_claimant_last_run'] = datetime.now().isoformat()

        # 3. Police crime stats — monthly release
        if args.dry_run:
            log.info("  [DRY RUN] Would run: police_etl.py (monthly crime data)")
        else:
            ok, dur = run_etl('police_etl.py', council_args, 'Police crime ETL')
            results.append(('crime', ok, dur))
            state['crime_last_run'] = datetime.now().isoformat()

    # ─── ANNUAL: Health, full census, ASHE via economy ───
    if args.annual:
        log.info("=== ANNUAL DATA REFRESH ===")

        # 1. Health ETL — Fingertips updates annually
        if args.dry_run:
            log.info("  [DRY RUN] Would run: health_etl.py (Fingertips annual)")
        else:
            ok, dur = run_etl('health_etl.py', council_args, 'Health ETL (Fingertips)')
            results.append(('health', ok, dur))
            state['health_last_run'] = datetime.now().isoformat()

        # 2. Full Census ETL — all 19 topics, all 15 councils (~8 min)
        # Census 2021 is static but annual re-run catches any Nomis corrections
        if args.dry_run:
            log.info("  [DRY RUN] Would run: census_etl.py (full 19-topic refresh)")
        else:
            ok, dur = run_etl('census_etl.py', council_args, 'Census ETL (19 topics)')
            results.append(('census', ok, dur))
            state['census_last_run'] = datetime.now().isoformat()

        # 3. Housing ETL — Census 2021 static, annual re-run for consistency
        if args.dry_run:
            log.info("  [DRY RUN] Would run: housing_etl.py (Census housing)")
        else:
            ok, dur = run_etl('housing_etl.py', council_args, 'Housing ETL')
            results.append(('housing', ok, dur))
            state['housing_last_run'] = datetime.now().isoformat()

    # ─── CENSUS ONLY: One-time or on-demand ───
    if args.census_only:
        log.info("=== CENSUS 2021 FULL RE-RUN ===")
        if args.dry_run:
            log.info("  [DRY RUN] Would run: census_etl.py (all 19 topics)")
        else:
            ok, dur = run_etl('census_etl.py', council_args, 'Census ETL (full)')
            results.append(('census', ok, dur))
            state['census_last_run'] = datetime.now().isoformat()

    # ─── Save state and report ───
    if not args.dry_run:
        save_state(state)

        total_ok = sum(1 for _, ok, _ in results if ok)
        total_fail = sum(1 for _, ok, _ in results if not ok)
        total_dur = sum(d for _, _, d in results)
        summary = f"Data Refresh: {total_ok} OK, {total_fail} failed, {total_dur:.0f}s total"
        log.info(summary)

        if results:
            detail = '\n'.join(f"  {'OK' if ok else 'FAIL'} {name} ({dur:.0f}s)" for name, ok, dur in results)
            notify_telegram(f"AI DOGE {summary}\n{detail}")

    log.info("Done.")


if __name__ == '__main__':
    main()
