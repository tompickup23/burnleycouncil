#!/usr/bin/env python3
"""
auto_etl.py — Automated ETL Orchestrator for AI DOGE
Downloads new council spending CSVs, runs the full ETL chain,
validates data quality, compresses chunks, commits, and deploys.

Pipeline steps:
  1. Load pipeline_state.json → identify councils with new/changed data
  2. Git pull --ff-only (ensure clean state)
  3. For each changed council:
     a. Download new CSV from transparency URL (if available)
     b. Run council_etl.py --council {id}
     c. Run data_quality.py --council {id} → get QC score
  4. Run doge_analysis.py (all councils)
  5. Run generate_cross_council.py (all councils)
  6. Compress chunk files (gzip + brotli)
  7. Git add + commit + push → triggers GH Actions auto-deploy
  8. Send notification via data_notifier.py
  9. Update pipeline_state.json

Safety:
  - fcntl lockfile prevents concurrent runs
  - Git --ff-only prevents merge conflicts
  - Rollback on failure: git checkout -- data/
  - 30-minute maximum runtime guard
  - Dry-run mode for testing

Usage:
    python3 auto_etl.py --process-new              # Process all councils with new data
    python3 auto_etl.py --council burnley           # Process single council
    python3 auto_etl.py --dry-run                   # Show what would happen
    python3 auto_etl.py --force                     # Force re-process even if no changes
    python3 auto_etl.py --skip-deploy               # Process but don't git push
    python3 auto_etl.py --council burnley --skip-analysis  # ETL only, skip DOGE analysis

Cron: 0 2 * * 0 /usr/bin/python3 /root/aidoge/burnley-council/scripts/auto_etl.py --process-new >> /var/log/aidoge/etl.log 2>&1
"""

import argparse
import fcntl
import gzip
import json
import logging
import os
import shutil
import signal
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# Optional: brotli compression
try:
    import brotli
    HAS_BROTLI = True
except ImportError:
    HAS_BROTLI = False

# Optional: notifications
sys.path.insert(0, os.path.dirname(__file__))
try:
    from data_notifier import notify, notify_success, notify_failure
    HAS_NOTIFIER = True
except ImportError:
    HAS_NOTIFIER = False

# ── Logging ──────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler()],
)
log = logging.getLogger('AutoETL')

LOG_DIR = Path('/var/log/aidoge')
if LOG_DIR.exists():
    logging.getLogger().addHandler(logging.FileHandler(LOG_DIR / 'etl.log'))

# ── Paths ────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent             # burnley-council/scripts/
BASE_DIR = SCRIPT_DIR.parent                             # burnley-council/
REPO_ROOT = BASE_DIR.parent                              # repo root
DATA_DIR = BASE_DIR / 'data'

# VPS fallback: on vps-main the repo lives at /root/aidoge/
for alt_root in [Path('/root/aidoge')]:
    alt_data = alt_root / 'burnley-council' / 'data'
    if alt_data.exists():
        REPO_ROOT = alt_root
        BASE_DIR = alt_root / 'burnley-council'
        SCRIPT_DIR = BASE_DIR / 'scripts'
        DATA_DIR = alt_data
        break

LOCK_FILE = Path('/tmp/aidoge-auto-etl.lock')
MAX_RUNTIME_SECONDS = 1800  # 30 minutes

COUNCILS = [
    # East Lancashire
    'burnley', 'hyndburn', 'pendle', 'rossendale',
    # Central & South Lancashire
    'lancaster', 'ribble_valley', 'chorley', 'south_ribble',
    # Fylde Coast & West
    'preston', 'west_lancashire', 'wyre', 'fylde',
    # County
    'lancashire_cc',
    # Unitary
    'blackpool', 'blackburn',
]

MONTHLY_CHUNK_COUNCILS = {'lancashire_cc', 'blackpool', 'blackburn'}

COUNCIL_NAMES = {
    'burnley': 'Burnley', 'hyndburn': 'Hyndburn', 'pendle': 'Pendle',
    'rossendale': 'Rossendale', 'lancaster': 'Lancaster',
    'ribble_valley': 'Ribble Valley', 'chorley': 'Chorley',
    'south_ribble': 'South Ribble', 'preston': 'Preston',
    'west_lancashire': 'West Lancashire', 'wyre': 'Wyre', 'fylde': 'Fylde',
    'lancashire_cc': 'Lancashire CC', 'blackpool': 'Blackpool',
    'blackburn': 'Blackburn w/ Darwen',
}

# ── Timeout handler ──────────────────────────────────────────────────

class PipelineTimeout(Exception):
    """Raised when pipeline exceeds maximum runtime."""


def _timeout_handler(signum, frame):
    raise PipelineTimeout(f'Pipeline exceeded {MAX_RUNTIME_SECONDS}s maximum runtime')


# ── Lockfile ─────────────────────────────────────────────────────────

class PipelineLock:
    """File-based lock to prevent concurrent pipeline runs."""

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
            log.warning('Another pipeline process is running — exiting')
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


# ── Helpers ──────────────────────────────────────────────────────────

def load_json(path):
    """Load JSON file, returning empty dict if missing or corrupt."""
    if path.exists():
        try:
            return json.loads(path.read_text())
        except (json.JSONDecodeError, IOError):
            pass
    return {}


def save_json(path, data):
    """Write JSON file, creating parent dirs if needed."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, default=str))


def _council_name(council_id):
    """Return display name for a council ID."""
    return COUNCIL_NAMES.get(council_id, council_id.replace('_', ' ').title())


# ── Core Functions ───────────────────────────────────────────────────

def run_command(cmd, timeout=300, cwd=None):
    """Run a subprocess command with timeout, logging, and error capture.

    Args:
        cmd: Command as list of strings.
        timeout: Maximum seconds to wait.
        cwd: Working directory (defaults to REPO_ROOT).

    Returns:
        (success: bool, stdout: str, stderr: str)
    """
    if cwd is None:
        cwd = str(REPO_ROOT)
    cmd_str = ' '.join(str(c) for c in cmd)
    log.info(f'Running: {cmd_str[:120]}')
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True,
            timeout=timeout, cwd=cwd,
        )
        if result.returncode != 0:
            log.error(f'Command failed (exit {result.returncode}): {result.stderr[:500]}')
        else:
            log.debug(f'Command succeeded: {result.stdout[:200]}')
        return (result.returncode == 0, result.stdout, result.stderr)
    except subprocess.TimeoutExpired:
        log.error(f'Command timed out after {timeout}s: {cmd_str[:80]}')
        return (False, '', f'Timed out after {timeout}s')
    except Exception as e:
        log.error(f'Command error: {e}')
        return (False, '', str(e))


def git_pull():
    """Pull latest changes with fast-forward only.

    Returns:
        True if pull succeeded (or already up to date).
    """
    success, stdout, stderr = run_command(
        ['git', 'pull', '--ff-only', 'origin', 'main'],
        timeout=30, cwd=str(REPO_ROOT),
    )
    if not success:
        log.error(f'Git pull failed — manual intervention needed: {stderr[:300]}')
    return success


def git_commit_and_push(message, files=None):
    """Stage changes, commit with pipeline author, and push.

    Args:
        message: Commit message.
        files: List of specific file paths to stage. If None, stages
               all changes under burnley-council/data/.

    Returns:
        True if changes were committed and pushed.
    """
    cwd = str(REPO_ROOT)

    # Set git config for pipeline commits
    run_command(
        ['git', 'config', 'user.name', 'AI DOGE Pipeline'],
        cwd=cwd,
    )
    run_command(
        ['git', 'config', 'user.email', 'pipeline@aidoge.co.uk'],
        cwd=cwd,
    )

    # Stage files
    if files:
        for f in files:
            run_command(['git', 'add', str(f)], cwd=cwd)
    else:
        run_command(['git', 'add', 'burnley-council/data/'], cwd=cwd)

    # Check if there are staged changes
    success, _, _ = run_command(
        ['git', 'diff', '--cached', '--quiet'],
        cwd=cwd,
    )
    if success:
        # Exit code 0 means no diff — nothing to commit
        log.info('No changes to commit')
        return False

    # Commit
    success, stdout, stderr = run_command(
        [
            'git', 'commit', '-m', message,
            '--author=AI DOGE Pipeline <pipeline@aidoge.co.uk>',
        ],
        cwd=cwd,
    )
    if not success:
        log.error(f'Git commit failed: {stderr[:300]}')
        return False

    # Push
    success, stdout, stderr = run_command(
        ['git', 'push', 'origin', 'main'],
        timeout=120, cwd=cwd,
    )
    if not success:
        log.error(f'Git push failed: {stderr[:300]}')
        return False

    log.info(f'Committed and pushed: {message}')
    return True


def git_rollback():
    """Emergency rollback: discard all uncommitted data changes."""
    log.warning('Rolling back uncommitted data changes')
    run_command(
        ['git', 'checkout', '--', 'burnley-council/data/'],
        cwd=str(REPO_ROOT),
    )


def download_csv(council_id, url):
    """Download a CSV from a council transparency URL.

    Args:
        council_id: Council identifier.
        url: Direct URL to the CSV file.

    Returns:
        Path to downloaded file, or None on failure.
    """
    try:
        import requests
    except ImportError:
        log.error('requests module not installed — cannot download CSV')
        return None

    raw_dir = DATA_DIR / council_id / 'raw'
    raw_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    out_path = raw_dir / f'spending_{timestamp}.csv'

    log.info(f'Downloading CSV for {_council_name(council_id)}: {url[:80]}')
    try:
        resp = requests.get(url, timeout=60, stream=True)
        resp.raise_for_status()

        with open(out_path, 'wb') as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)

        size_kb = out_path.stat().st_size / 1024
        log.info(f'Downloaded {out_path.name} ({size_kb:.0f} KB)')
        return out_path

    except Exception as e:
        log.error(f'CSV download failed for {council_id}: {e}')
        if out_path.exists():
            out_path.unlink()
        return None


def run_etl(council_id):
    """Run council_etl.py for a single council.

    Args:
        council_id: Council identifier.

    Returns:
        True if ETL completed successfully.
    """
    etl_script = SCRIPT_DIR / 'council_etl.py'
    if not etl_script.exists():
        log.error(f'council_etl.py not found at {etl_script}')
        return False

    # Large councils (v4 monthly) need more time
    timeout = 900 if council_id in MONTHLY_CHUNK_COUNCILS else 600

    success, stdout, stderr = run_command(
        [sys.executable, str(etl_script), '--council', council_id],
        timeout=timeout, cwd=str(SCRIPT_DIR),
    )
    if success:
        log.info(f'ETL completed for {_council_name(council_id)}')
    else:
        log.error(f'ETL failed for {_council_name(council_id)}')
    return success


def run_analysis():
    """Run doge_analysis.py across all councils.

    Returns:
        True if analysis completed successfully.
    """
    analysis_script = SCRIPT_DIR / 'doge_analysis.py'
    if not analysis_script.exists():
        log.error(f'doge_analysis.py not found at {analysis_script}')
        return False

    success, stdout, stderr = run_command(
        [sys.executable, str(analysis_script)],
        timeout=600, cwd=str(SCRIPT_DIR),
    )
    if success:
        log.info('DOGE analysis completed')
    else:
        log.error('DOGE analysis failed')
    return success


def run_cross_council():
    """Run generate_cross_council.py from repo root/scripts/.

    NOTE: This script lives at {REPO_ROOT}/scripts/generate_cross_council.py,
    NOT in burnley-council/scripts/.

    Returns:
        True if generation completed successfully.
    """
    cross_script = REPO_ROOT / 'scripts' / 'generate_cross_council.py'
    if not cross_script.exists():
        log.error(f'generate_cross_council.py not found at {cross_script}')
        return False

    success, stdout, stderr = run_command(
        [sys.executable, str(cross_script)],
        timeout=120, cwd=str(REPO_ROOT),
    )
    if success:
        log.info('Cross-council generation completed')
    else:
        log.error('Cross-council generation failed')
    return success


def run_poll_aggregator():
    """Run poll_aggregator.py to refresh national polling data."""
    log.info('Refreshing national polling data...')
    script = SCRIPT_DIR / 'poll_aggregator.py'
    if not script.exists():
        log.warning(f'poll_aggregator.py not found at {script}')
        return False

    success, stdout, stderr = run_command(
        ['python3', str(script)],
        timeout=120,
        cwd=str(BASE_DIR)
    )
    if success:
        log.info('Poll aggregator completed successfully')
        # Verify output
        polling_file = DATA_DIR / 'shared' / 'polling.json'
        if polling_file.exists():
            try:
                data = json.loads(polling_file.read_text())
                polls = data.get('meta', {}).get('polls_aggregated', 0)
                log.info(f'Polling data: {polls} polls aggregated')
            except Exception:
                pass
    else:
        log.warning(f'Poll aggregator failed: {stderr[:200] if stderr else "unknown error"}')
    return success


def run_quality_check(council_id):
    """Run data_quality.py for a council and parse the QC score.

    Args:
        council_id: Council identifier.

    Returns:
        (score: int, issues: list[str]) — score 0-100, list of issue descriptions.
        Returns (0, ['data_quality.py not available']) if script missing.
    """
    qc_script = SCRIPT_DIR / 'data_quality.py'
    if not qc_script.exists():
        log.warning('data_quality.py not found — skipping quality check')
        return (0, ['data_quality.py not available'])

    success, stdout, stderr = run_command(
        [sys.executable, str(qc_script), '--council', council_id, '--json'],
        timeout=60, cwd=str(SCRIPT_DIR),
    )
    if not success:
        return (0, [f'QC check failed: {stderr[:200]}'])

    try:
        qc_data = json.loads(stdout)
        score = qc_data.get('score', 0)
        issues = qc_data.get('issues', [])
        return (score, issues)
    except (json.JSONDecodeError, KeyError):
        # Might not output JSON — treat as informational
        log.warning(f'Could not parse QC output for {council_id}')
        return (0, ['QC output not parseable'])


def compress_chunks(council_id):
    """Compress spending chunk files with gzip and brotli.

    Skips files that are already compressed and newer than the source JSON.
    Logs before/after sizes for each file.
    """
    data_dir = DATA_DIR / council_id
    if not data_dir.exists():
        return

    chunk_files = list(data_dir.glob('spending-*.json'))
    if not chunk_files:
        log.debug(f'No chunk files found for {council_id}')
        return

    compressed_count = 0
    for json_file in chunk_files:
        src_size = json_file.stat().st_size
        if src_size == 0:
            continue

        # Gzip
        gz_path = json_file.with_suffix('.json.gz')
        if not gz_path.exists() or gz_path.stat().st_mtime < json_file.stat().st_mtime:
            try:
                with open(json_file, 'rb') as f_in:
                    with gzip.open(gz_path, 'wb', compresslevel=6) as f_out:
                        shutil.copyfileobj(f_in, f_out)
                gz_size = gz_path.stat().st_size
                ratio = (1 - gz_size / src_size) * 100
                log.debug(f'  gzip {json_file.name}: {src_size:,} → {gz_size:,} ({ratio:.0f}% smaller)')
                compressed_count += 1
            except Exception as e:
                log.warning(f'  gzip failed for {json_file.name}: {e}')

        # Brotli
        if HAS_BROTLI:
            br_path = json_file.with_suffix('.json.br')
            if not br_path.exists() or br_path.stat().st_mtime < json_file.stat().st_mtime:
                try:
                    with open(json_file, 'rb') as f_in:
                        data = f_in.read()
                    with open(br_path, 'wb') as f_out:
                        f_out.write(brotli.compress(data, quality=6))
                    br_size = br_path.stat().st_size
                    ratio = (1 - br_size / src_size) * 100
                    log.debug(f'  brotli {json_file.name}: {src_size:,} → {br_size:,} ({ratio:.0f}% smaller)')
                    compressed_count += 1
                except Exception as e:
                    log.warning(f'  brotli failed for {json_file.name}: {e}')

    if compressed_count:
        log.info(f'Compressed {compressed_count} chunk files for {_council_name(council_id)}')


def _count_records(council_id):
    """Count records in spending.json for a council. Returns 0 on failure."""
    spending_path = DATA_DIR / council_id / 'spending.json'
    if not spending_path.exists():
        return 0
    try:
        data = json.loads(spending_path.read_text())
        if isinstance(data, dict):
            return len(data.get('records', []))
        if isinstance(data, list):
            return len(data)
    except (json.JSONDecodeError, IOError):
        pass
    return 0


# ── Council Processing ───────────────────────────────────────────────

def process_council(council_id, force=False, skip_analysis=False, dry_run=False):
    """Run the full ETL pipeline for a single council.

    Args:
        council_id: Council identifier.
        force: Process even if no changes detected.
        skip_analysis: Skip DOGE analysis (ETL + QC only).
        dry_run: Show what would happen without executing.

    Returns:
        dict with keys: council_id, success, qc_score, new_records, errors.
    """
    result = {
        'council_id': council_id,
        'success': False,
        'qc_score': 0,
        'new_records': 0,
        'errors': [],
    }
    name = _council_name(council_id)

    # Check pipeline state for changes
    state_path = DATA_DIR / 'shared' / 'pipeline_state.json'
    state = load_json(state_path)
    council_state = state.get(council_id, {})

    if not force and council_state.get('status') == 'fresh':
        last = council_state.get('last_processed', 'unknown')
        log.info(f'{name}: No changes detected (last processed: {last}). Use --force to override.')
        result['errors'].append('No changes detected')
        return result

    if dry_run:
        log.info(f'[DRY RUN] Would process {name}')
        result['success'] = True
        return result

    # Record count before ETL
    records_before = _count_records(council_id)

    # Step 1: Run ETL
    log.info(f'--- Processing {name} ---')
    if not run_etl(council_id):
        result['errors'].append('ETL failed')
        if HAS_NOTIFIER:
            notify_failure(council_id, 'ETL script failed')
        return result

    # Step 2: Quality check
    qc_score, qc_issues = run_quality_check(council_id)
    result['qc_score'] = qc_score
    if qc_score > 0 and qc_score < 50:
        log.warning(f'{name}: Low QC score {qc_score}/100 — continuing anyway')
        result['errors'].extend(qc_issues)

    # Step 3: Compress chunks
    compress_chunks(council_id)

    # Count new records
    records_after = _count_records(council_id)
    result['new_records'] = max(0, records_after - records_before)

    result['success'] = True
    log.info(
        f'{name}: ETL complete. '
        f'Records: {records_before:,} → {records_after:,} '
        f'(+{result["new_records"]:,}). QC: {qc_score}/100'
    )
    return result


# ── Main Orchestration ───────────────────────────────────────────────

def process_all(councils=None, dry_run=False, force=False,
                skip_deploy=False, skip_analysis=False):
    """Main orchestration: process councils, analyse, commit, deploy.

    Args:
        councils: List of council IDs to process. None = all with changes.
        dry_run: Show plan without executing.
        force: Force processing even without detected changes.
        skip_deploy: Process and commit but don't git push.
        skip_analysis: Skip DOGE + cross-council analysis.

    Returns:
        dict with overall results summary.
    """
    started = datetime.now()
    lock = PipelineLock()

    # Acquire lockfile
    if not lock.acquire():
        return {'success': False, 'error': 'Could not acquire lock'}

    # Set up maximum runtime alarm
    if hasattr(signal, 'SIGALRM'):
        signal.signal(signal.SIGALRM, _timeout_handler)
        signal.alarm(MAX_RUNTIME_SECONDS)

    summary = {
        'success': True,
        'started': started.isoformat(),
        'councils_processed': [],
        'councils_failed': [],
        'total_new_records': 0,
        'deployed': False,
        'errors': [],
    }

    try:
        # Step 1: Git pull
        if not dry_run:
            if not git_pull():
                summary['success'] = False
                summary['errors'].append('Git pull failed — resolve manually')
                lock.release()
                return summary

        # Step 2: Determine which councils to process
        if councils:
            target_councils = councils
        else:
            # Load pipeline state and find councils with changes
            state_path = DATA_DIR / 'shared' / 'pipeline_state.json'
            state = load_json(state_path)

            if force:
                target_councils = list(COUNCILS)
            else:
                target_councils = []
                for c in COUNCILS:
                    cs = state.get(c, {})
                    status = cs.get('status', 'unknown')
                    if status in ('changed', 'stale', 'error', 'unknown'):
                        target_councils.append(c)

                if not target_councils:
                    log.info('No councils need processing. Use --force to override.')
                    lock.release()
                    return summary

        log.info(f'Processing {len(target_councils)} council(s): {", ".join(target_councils)}')

        if dry_run:
            for c in target_councils:
                log.info(f'  [DRY RUN] Would process {_council_name(c)}')
            lock.release()
            return summary

        # Step 3: Process each council
        results = []
        for council_id in target_councils:
            try:
                r = process_council(
                    council_id, force=force,
                    skip_analysis=skip_analysis, dry_run=dry_run,
                )
                results.append(r)
                if r['success']:
                    summary['councils_processed'].append(council_id)
                    summary['total_new_records'] += r['new_records']
                else:
                    summary['councils_failed'].append(council_id)
            except PipelineTimeout:
                log.error('Pipeline timeout reached — stopping council processing')
                summary['errors'].append(f'Timeout after {_council_name(council_id)}')
                break
            except Exception as e:
                log.error(f'Unexpected error processing {council_id}: {e}')
                summary['councils_failed'].append(council_id)

        if not summary['councils_processed']:
            log.warning('No councils processed successfully')
            summary['success'] = False
            lock.release()
            return summary

        # Step 4: Run DOGE analysis (once, after all councils)
        if not skip_analysis:
            log.info('Running DOGE analysis across all councils...')
            if not run_analysis():
                summary['errors'].append('DOGE analysis failed (non-fatal)')
                log.warning('DOGE analysis failed — continuing anyway')

            # Step 5: Run cross-council generation
            log.info('Generating cross-council comparison data...')
            if not run_cross_council():
                summary['errors'].append('Cross-council generation failed (non-fatal)')
                log.warning('Cross-council generation failed — continuing anyway')

        # Step: Refresh national polling
        polling_state = load_json(DATA_DIR / 'shared' / 'pipeline_state.json')
        polling_stale = polling_state.get('polling_stale', True)
        polling_age = polling_state.get('polling_age_days', 999)
        if polling_stale or polling_age > 3 or force:
            if run_poll_aggregator():
                log.info('Polling: refreshed successfully')
            else:
                summary['errors'].append('Polling: refresh failed (non-fatal)')
        else:
            log.info(f'Polling data is {polling_age} days old — skipping refresh')

        # Step 6: Git commit + push
        if not skip_deploy:
            processed_names = ', '.join(
                _council_name(c) for c in summary['councils_processed']
            )
            commit_msg = (
                f'data: auto-ETL update for {processed_names}\n\n'
                f'Councils: {len(summary["councils_processed"])} processed, '
                f'{len(summary["councils_failed"])} failed\n'
                f'New records: {summary["total_new_records"]:,}\n'
                f'Generated by auto_etl.py at {started.strftime("%Y-%m-%d %H:%M")}'
            )
            if git_commit_and_push(commit_msg):
                summary['deployed'] = True
                log.info('Changes committed and pushed — deploy will trigger automatically')
            else:
                log.info('No data changes to commit')
        else:
            log.info('Skipping deploy (--skip-deploy)')

        # Step 7: Update pipeline state
        state_path = DATA_DIR / 'shared' / 'pipeline_state.json'
        state = load_json(state_path)
        now_iso = datetime.now().isoformat()

        for r in results:
            cid = r['council_id']
            if r['success']:
                state[cid] = {
                    'status': 'fresh',
                    'last_processed': now_iso,
                    'records': _count_records(cid),
                    'qc_score': r['qc_score'],
                    'new_records': r['new_records'],
                }
            else:
                state[cid] = {
                    'status': 'error',
                    'last_processed': now_iso,
                    'errors': r['errors'],
                }

        state['_last_run'] = now_iso
        state['_duration_s'] = int((datetime.now() - started).total_seconds())
        save_json(state_path, state)

        # Step 8: Send notifications
        if HAS_NOTIFIER:
            _send_notifications(summary, results)

    except PipelineTimeout:
        log.error('Pipeline exceeded maximum runtime — aborting')
        summary['success'] = False
        summary['errors'].append('Maximum runtime exceeded')
        git_rollback()

    except Exception as e:
        log.error(f'Pipeline failed with unexpected error: {e}')
        summary['success'] = False
        summary['errors'].append(str(e))
        git_rollback()

    finally:
        # Cancel alarm
        if hasattr(signal, 'SIGALRM'):
            signal.alarm(0)
        lock.release()

    elapsed = int((datetime.now() - started).total_seconds())
    summary['duration_s'] = elapsed
    log.info(
        f'Pipeline complete in {elapsed}s. '
        f'Processed: {len(summary["councils_processed"])}, '
        f'Failed: {len(summary["councils_failed"])}, '
        f'New records: {summary["total_new_records"]:,}, '
        f'Deployed: {summary["deployed"]}'
    )
    return summary


def _send_notifications(summary, results):
    """Send pipeline completion notifications via data_notifier."""
    if not HAS_NOTIFIER:
        return

    # Individual success notifications
    for r in results:
        if r['success'] and r['new_records'] > 0:
            notify_success(r['council_id'], r['new_records'], r['qc_score'])

    # Individual failure notifications
    for r in results:
        if not r['success']:
            error_msg = '; '.join(r['errors'][:3]) or 'Unknown error'
            notify_failure(r['council_id'], error_msg)

    # Overall summary
    lines = [
        f'AI DOGE Auto-ETL Complete — {datetime.now().strftime("%d %b %Y %H:%M")}',
        f'Processed: {len(summary["councils_processed"])}/15',
        f'Failed: {len(summary["councils_failed"])}',
        f'New records: {summary["total_new_records"]:,}',
        f'Deployed: {"Yes" if summary["deployed"] else "No"}',
    ]
    if summary['errors']:
        lines.append(f'Warnings: {len(summary["errors"])}')

    notify('\n'.join(lines))


# ── CLI ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='AI DOGE Automated ETL Orchestrator',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            'Examples:\n'
            '  python3 auto_etl.py --process-new\n'
            '  python3 auto_etl.py --council burnley\n'
            '  python3 auto_etl.py --force --skip-deploy\n'
            '  python3 auto_etl.py --dry-run\n'
        ),
    )
    parser.add_argument(
        '--process-new', action='store_true',
        help='Process all councils with new/changed data',
    )
    parser.add_argument(
        '--council', type=str, choices=COUNCILS,
        help='Process a single council',
    )
    parser.add_argument(
        '--dry-run', action='store_true',
        help='Show what would happen without executing',
    )
    parser.add_argument(
        '--force', action='store_true',
        help='Force re-process even if no changes detected',
    )
    parser.add_argument(
        '--skip-deploy', action='store_true',
        help='Process data but do not git push',
    )
    parser.add_argument(
        '--skip-analysis', action='store_true',
        help='Skip DOGE analysis and cross-council generation',
    )

    args = parser.parse_args()

    if not args.process_new and not args.council:
        parser.print_help()
        print('\nError: specify --process-new or --council <id>')
        sys.exit(1)

    log.info('=== AI DOGE Auto-ETL Starting ===')

    if args.council:
        # Single council mode
        councils = [args.council]
    else:
        councils = None  # process_all will determine from pipeline state

    result = process_all(
        councils=councils,
        dry_run=args.dry_run,
        force=args.force,
        skip_deploy=args.skip_deploy,
        skip_analysis=args.skip_analysis,
    )

    log.info('=== AI DOGE Auto-ETL Finished ===')

    if not result.get('success', False):
        sys.exit(1)


if __name__ == '__main__':
    main()
