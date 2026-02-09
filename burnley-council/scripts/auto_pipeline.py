#!/usr/bin/env python3
"""
Autonomous Data Pipeline — AI DOGE
Bridges data_monitor.py detection with the full processing chain.

Flow:
  1. Check if councils have new spending data (via data_monitor state)
  2. SSH to vps-news → run council_etl.py for changed councils
  3. Pull updated spending.json back to vps-main
  4. Run doge_analysis.py locally
  5. Trigger article writer for new findings
  6. (Optional) Push to git and deploy

Designed to run on vps-main after data_monitor.py.
Cron: 0 8 * * * (8am daily, 1 hour after data_monitor)

Requires: SSH access to vps-news (configured in ~/.ssh/config)
"""
import json
import os
import sys
import logging
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler('/root/clawd-worker/logs/auto_pipeline.log'),
        logging.StreamHandler()
    ]
)
log = logging.getLogger('AutoPipeline')

# Paths
MONITOR_STATE = Path('/root/clawd-worker/aidoge/data/monitor_state.json')
PIPELINE_STATE = Path('/root/clawd-worker/aidoge/data/pipeline_state.json')
AIDOGE_DATA = Path('/root/aidoge/burnley-council/data')
CLAWD_WORKER_DATA = Path('/root/clawd-worker/aidoge/data')

# Council configs — which councils can be auto-processed
COUNCILS = {
    'burnley': {
        'etl_args': '--council burnley',
        'monitor_key': 'https://www.burnley.gov.uk/council/about-council/spending-over-500',
    },
    'hyndburn': {
        'etl_args': '--council hyndburn',
        'monitor_key': 'https://www.hyndburnbc.gov.uk/open-data/',
    },
    'pendle': {
        'etl_args': '--council pendle',
        'monitor_key': 'https://www.pendle.gov.uk/info/20072/council_budgets_and_spending/374/spending_over_500',
    },
}

try:
    import requests
except ImportError:
    os.system('pip3 install requests 2>/dev/null')
    import requests


def load_json(path):
    if path.exists():
        return json.loads(path.read_text())
    return {}

def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))

def send_alert(message):
    """Send WhatsApp alert via Clawdbot gateway."""
    try:
        resp = requests.post(
            'http://127.0.0.1:18789/api/send',
            headers={
                'Authorization': f'Bearer {os.environ.get("OPENCLAW_TOKEN", "7fa99c995e62569c0dab81de19b94b998918e33086540b15")}',
                'Content-Type': 'application/json'
            },
            json={'to': '+447308907628', 'body': message},
            timeout=10
        )
        log.info(f'Alert sent: {resp.status_code}')
    except Exception as e:
        log.warning(f'Alert failed: {e}')

def ssh_command(host, cmd, timeout=600):
    """Run command on remote host via SSH."""
    log.info(f'SSH {host}: {cmd[:100]}...')
    try:
        result = subprocess.run(
            ['ssh', '-o', 'ConnectTimeout=15', host, cmd],
            capture_output=True, text=True, timeout=timeout
        )
        if result.returncode != 0:
            log.error(f'SSH command failed (exit {result.returncode}): {result.stderr[:500]}')
            return None
        return result.stdout
    except subprocess.TimeoutExpired:
        log.error(f'SSH command timed out after {timeout}s')
        return None
    except Exception as e:
        log.error(f'SSH error: {e}')
        return None

def scp_from_remote(host, remote_path, local_path):
    """Copy file from remote host."""
    log.info(f'SCP {host}:{remote_path} → {local_path}')
    try:
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        result = subprocess.run(
            ['scp', f'{host}:{remote_path}', local_path],
            capture_output=True, text=True, timeout=120
        )
        return result.returncode == 0
    except Exception as e:
        log.error(f'SCP error: {e}')
        return False

def check_for_changes():
    """Check data_monitor state for councils with new data."""
    monitor_state = load_json(MONITOR_STATE)
    pipeline_state = load_json(PIPELINE_STATE)
    changed = []

    for council_id, config in COUNCILS.items():
        url = config['monitor_key']
        monitor_entry = monitor_state.get(url, {})

        if not monitor_entry.get('changed'):
            continue

        # Check if we already processed this change
        last_processed = pipeline_state.get(council_id, {}).get('last_hash')
        current_hash = monitor_entry.get('hash')

        if current_hash and current_hash != last_processed:
            changed.append(council_id)
            log.info(f'New data detected for {council_id}')

    return changed

def run_etl(council_id):
    """Run council_etl.py on vps-news for a specific council."""
    config = COUNCILS[council_id]
    cmd = f'cd ~/aidoge && python3 scripts/council_etl.py {config["etl_args"]}'
    output = ssh_command('vps-news', cmd, timeout=1800)  # 30 min timeout for ETL
    if output is None:
        log.error(f'ETL failed for {council_id}')
        return False
    log.info(f'ETL completed for {council_id}: {len(output)} chars output')
    return True

def pull_data(council_id):
    """Pull updated spending.json from vps-news."""
    remote_base = f'~/aidoge/data/{council_id}'
    local_base = str(AIDOGE_DATA / council_id)

    files_to_pull = ['spending.json', 'taxonomy.json', 'insights.json', 'metadata.json']
    success = True
    for f in files_to_pull:
        if not scp_from_remote('vps-news', f'{remote_base}/{f}', f'{local_base}/{f}'):
            log.warning(f'Failed to pull {f} for {council_id}')
            success = False

    return success

def run_doge_analysis():
    """Run DOGE analysis locally on vps-main."""
    log.info('Running DOGE analysis...')
    try:
        # Use the local copy of doge_analysis.py
        result = subprocess.run(
            ['python3', '/root/clawd-worker/aidoge/scripts/doge_analysis.py'],
            capture_output=True, text=True, timeout=600,
            cwd='/root/aidoge/burnley-council'
        )
        if result.returncode != 0:
            log.error(f'DOGE analysis failed: {result.stderr[:500]}')
            return False
        log.info('DOGE analysis completed')
        return True
    except Exception as e:
        log.error(f'DOGE analysis error: {e}')
        return False

def queue_articles(council_id):
    """Queue article generation for a council with new findings."""
    task = {
        'type': 'article_generation',
        'council': council_id,
        'triggered_by': 'auto_pipeline',
        'queued_at': datetime.utcnow().isoformat() + 'Z'
    }
    task_file = Path(f'/root/clawd-worker/tasks/{council_id}_articles_{datetime.utcnow().strftime("%Y%m%d")}.json')
    save_json(task_file, task)
    log.info(f'Queued article generation for {council_id}')

def main():
    log.info('=== Auto Pipeline Starting ===')

    # Step 1: Check for changes
    changed_councils = check_for_changes()
    if not changed_councils:
        log.info('No new data detected. Pipeline idle.')
        return

    log.info(f'Processing {len(changed_councils)} councils: {changed_councils}')
    send_alert(f'🔄 AIDOGE Pipeline: Processing new data for {", ".join(changed_councils)}')

    pipeline_state = load_json(PIPELINE_STATE)
    monitor_state = load_json(MONITOR_STATE)
    results = []

    # Step 2-3: ETL + Pull for each changed council
    for council_id in changed_councils:
        log.info(f'--- Processing {council_id} ---')

        # Run ETL on vps-news
        if not run_etl(council_id):
            results.append(f'❌ {council_id}: ETL failed')
            continue

        # Pull data back
        if not pull_data(council_id):
            results.append(f'⚠️ {council_id}: ETL OK but data pull failed')
            continue

        # Update pipeline state
        url = COUNCILS[council_id]['monitor_key']
        pipeline_state[council_id] = {
            'last_hash': monitor_state.get(url, {}).get('hash'),
            'last_processed': datetime.utcnow().isoformat() + 'Z',
            'status': 'etl_complete'
        }
        results.append(f'✅ {council_id}: ETL + pull complete')

    # Step 4: Run DOGE analysis (cross-council, runs once)
    if any('✅' in r for r in results):
        if run_doge_analysis():
            results.append('✅ DOGE analysis: complete')
        else:
            results.append('⚠️ DOGE analysis: failed (non-fatal)')

    # Step 5: Queue article generation
    for council_id in changed_councils:
        if pipeline_state.get(council_id, {}).get('status') == 'etl_complete':
            queue_articles(council_id)
            pipeline_state[council_id]['status'] = 'articles_queued'

    # Save state
    save_json(PIPELINE_STATE, pipeline_state)

    # Report
    summary = '\n'.join(results)
    log.info(f'Pipeline complete:\n{summary}')
    send_alert(f'📊 AIDOGE Pipeline Complete\n\n{summary}')

    log.info('=== Auto Pipeline Finished ===')

if __name__ == '__main__':
    main()
