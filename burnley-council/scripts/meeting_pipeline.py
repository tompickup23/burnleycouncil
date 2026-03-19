#!/usr/bin/env python3
"""
meeting_pipeline.py — Automated council meeting transcription pipeline.

Discovers meetings from ModernGov, downloads webcasts, transcribes,
analyses, pre-clips, aggregates, and optionally pushes to git.

Designed to run on vps-main as a cron job or manual batch processor.

Usage:
    # Process all unprocessed Full Council meetings since May 2025
    python3 meeting_pipeline.py --batch

    # Process a specific meeting by ModernGov MId
    python3 meeting_pipeline.py --mid 15435

    # Discover meetings and show what needs processing
    python3 meeting_pipeline.py --discover

    # Process and auto-push transcripts.json to git
    python3 meeting_pipeline.py --batch --push

    # Cron mode: discover + process + aggregate + push (silent unless errors)
    python3 meeting_pipeline.py --cron
"""

import json
import os
import sys
import re
import subprocess
import time
import argparse
import fcntl
from pathlib import Path
from datetime import datetime

# Directories
TRANSCRIPTS_DIR = Path("/opt/transcripts")
LOCKFILE = TRANSCRIPTS_DIR / ".pipeline.lock"
CLIPS_DIR = Path("/opt/clips")
PIPELINE_STATE = TRANSCRIPTS_DIR / "pipeline_state.json"

# ModernGov
MODERNGOV_BASE = "https://council.lancashire.gov.uk"
FULL_COUNCIL_CID = "138"
MEDIASITE_BASE = "https://auditelsystems.mediasite.com/Mediasite/Play"

# Reform took control 1 May 2025
CUTOFF_DATE = "2025-05-01"

# Scripts
SCRIPT_DIR = Path(__file__).parent if '__file__' in dir() else Path("/opt/transcripts")
TRANSCRIBER = TRANSCRIPTS_DIR / "meeting_transcriber.py"
CLIP_SERVER = TRANSCRIPTS_DIR / "clip_server.py"
AGGREGATOR = SCRIPT_DIR / "transcripts_aggregator.py"


def load_state():
    """Load pipeline state — tracks which meetings have been processed."""
    if PIPELINE_STATE.exists():
        with open(PIPELINE_STATE) as f:
            state = json.load(f)
    else:
        state = {"processed": {}, "last_discovery": None}

    # Seed with already-processed meetings
    if "lcc-full-council-2025-07-17" not in state.get("processed", {}):
        state.setdefault("processed", {})["lcc-full-council-2025-07-17"] = {
            "date": "2025-07-17",
            "processed_at": "2026-03-18T18:00:00",
            "mid": "15359",
            "pres_id": "7b2a963a016945b29ef6a6c63be50fd51d",
            "note": "First meeting processed — Full Council 17 July 2025",
        }
        save_state(state)

    # Build presID lookup from processed meetings (runtime only, not persisted)
    processed_pres_ids = set()
    for m in state.get("processed", {}).values():
        if isinstance(m, dict) and m.get("pres_id"):
            processed_pres_ids.add(m["pres_id"])
    state["_processed_pres_ids"] = processed_pres_ids  # Runtime set, not saved

    return state


def save_state(state):
    """Save pipeline state (strips runtime-only fields)."""
    saveable = {k: v for k, v in state.items() if not k.startswith("_")}
    with open(PIPELINE_STATE, "w") as f:
        json.dump(saveable, f, indent=2)


def discover_meetings():
    """Discover Full Council meetings from ModernGov with webcast URLs."""
    try:
        import requests
    except ImportError:
        os.system("pip3 install requests 2>/dev/null")
        import requests

    print("Discovering Full Council meetings from ModernGov...")

    # Get meeting listing page
    url = f"{MODERNGOV_BASE}/ieListMeetings.aspx?CId={FULL_COUNCIL_CID}&Year=0"
    resp = requests.get(url, timeout=30)

    # Extract meeting IDs
    mids = list(dict.fromkeys(
        re.findall(r'ieListDocuments\.aspx\?CId=138&amp;MId=(\d+)', resp.text)
    ))
    print(f"  Found {len(mids)} meeting IDs")

    meetings = []
    for mid in mids:
        meeting_url = f"{MODERNGOV_BASE}/ieListDocuments.aspx?CId={FULL_COUNCIL_CID}&MId={mid}"
        try:
            r = requests.get(meeting_url, timeout=15)

            # Extract date
            date_match = re.search(
                r'(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})',
                r.text
            )
            if date_match:
                day = int(date_match.group(1))
                month_name = date_match.group(2)
                year = int(date_match.group(3))
                months = {
                    'January': 1, 'February': 2, 'March': 3, 'April': 4,
                    'May': 5, 'June': 6, 'July': 7, 'August': 8,
                    'September': 9, 'October': 10, 'November': 11, 'December': 12
                }
                date_str = f"{year}-{months[month_name]:02d}-{day:02d}"
            else:
                date_str = None

            # Skip meetings before cutoff
            if date_str and date_str < CUTOFF_DATE:
                continue

            # Extract webcast URL (look for presID in Mediasite/Auditel links)
            pres_match = re.search(r'presID=([a-f0-9]+)', r.text, re.IGNORECASE)
            webcast_url = f"{MEDIASITE_BASE}/{pres_match.group(1)}" if pres_match else None

            # Extract minutes URL
            minutes_match = re.search(
                r'href="([^"]*)"[^>]*>\s*(?:Printed\s+)?[Mm]inutes',
                r.text
            )
            minutes_url = None
            if minutes_match:
                minutes_url = minutes_match.group(1)
                if minutes_url.startswith('/'):
                    minutes_url = MODERNGOV_BASE + minutes_url

            # Extract agenda URL
            agenda_match = re.search(
                r'href="([^"]*)"[^>]*>\s*[Aa]genda',
                r.text
            )
            agenda_url = None
            if agenda_match:
                agenda_url = agenda_match.group(1)
                if agenda_url.startswith('/'):
                    agenda_url = MODERNGOV_BASE + agenda_url

            meeting_id = f"lcc-full-council-{date_str}" if date_str else f"lcc-full-council-mid{mid}"

            meeting = {
                "mid": mid,
                "meeting_id": meeting_id,
                "date": date_str,
                "committee": "Full Council",
                "council_id": "lancashire_cc",
                "webcast_url": webcast_url,
                "moderngov_url": meeting_url,
                "minutes_url": minutes_url,
                "agenda_url": agenda_url,
            }
            meetings.append(meeting)
            status = "WEBCAST" if webcast_url else "NO WEBCAST"
            print(f"  {date_str or '?':12s} | MId={mid} | {status}")

            time.sleep(0.3)
        except Exception as e:
            print(f"  MId={mid} ERROR: {e}")

    # Deduplicate by presID — same webcast = same meeting regardless of MId
    seen_pres = {}
    deduped = []
    for m in meetings:
        url = m.get("webcast_url", "")
        pres_id = url.split("/")[-1] if url else None
        if pres_id:
            if pres_id in seen_pres:
                print(f"  Dedup: MId={m['mid']} same webcast as MId={seen_pres[pres_id]['mid']}, skipping")
                continue
            seen_pres[pres_id] = m
        deduped.append(m)

    # Sort by date ascending (process oldest first)
    deduped.sort(key=lambda m: m.get("date") or "", reverse=True)
    return deduped


def process_meeting(meeting, state, min_score=7):
    """Process a single meeting: download → transcribe → analyse → pre-clip."""
    meeting_id = meeting["meeting_id"]
    webcast_url = meeting.get("webcast_url")

    if not webcast_url:
        print(f"  Skipping {meeting_id}: no webcast URL")
        return False

    # Check if already processed (by meeting_id or presID)
    if meeting_id in state.get("processed", {}):
        print(f"  Skipping {meeting_id}: already processed")
        return False

    pres_id = webcast_url.split("/")[-1] if webcast_url else None
    if pres_id and pres_id in state.get("_processed_pres_ids", set()):
        print(f"  Skipping {meeting_id}: webcast already processed (presID {pres_id[:12]}...)")
        return False

    output_dir = TRANSCRIPTS_DIR / meeting_id
    output_dir.mkdir(parents=True, exist_ok=True)

    # Save meeting metadata
    meta_path = output_dir / "meeting_meta.json"
    with open(meta_path, "w") as f:
        json.dump(meeting, f, indent=2)

    print(f"\n{'='*60}")
    print(f"Processing: {meeting_id}")
    print(f"  Date: {meeting.get('date')}")
    print(f"  Webcast: {webcast_url}")
    print(f"{'='*60}")

    # Step 1: Transcribe (includes OCR speaker detection, vocab hints)
    # Full pipeline: download → transcribe → OCR → post-process → Tier 1 + Tier 2
    print(f"\n  Step 1: Full transcription pipeline...")
    cmd = [
        sys.executable, str(TRANSCRIBER),
        "--url", webcast_url,
        "--council", "lancashire_cc",
        "--model", "medium",
        # No --no-llm: run Tier 2 as part of the pipeline
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=10800)  # 3hr max
    if result.returncode != 0:
        print(f"  Transcription FAILED:")
        print(f"  stdout: {result.stdout[-500:]}")
        print(f"  stderr: {result.stderr[-500:]}")
        return False
    print(f"  Pipeline complete")
    # Show key stats from output
    for line in result.stdout.split('\n'):
        if any(k in line for k in ['Tier ', 'OCR ', 'QC ', 'segments', 'moments', 'topics']):
            print(f"    {line.strip()}")

    # Step 2: Pre-clip high-value moments
    print(f"\n  Step 2: Pre-clip score {min_score}+ moments...")
    cmd = [
        sys.executable, str(CLIP_SERVER),
        "--preclip", meeting_id,
        "--min-score", str(min_score),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
    if result.returncode != 0:
        print(f"  Pre-clip FAILED: {result.stderr[-300:]}")
    else:
        print(f"  {result.stdout.strip()}")

    # Step 3: Cleanup temp video files
    print(f"\n  Step 3: Cleanup...")
    import glob
    for tmp in glob.glob("/tmp/meeting_*.mkv*") + glob.glob("/tmp/meeting_*.mp4*"):
        try:
            os.unlink(tmp)
            print(f"    Deleted: {tmp}")
        except Exception:
            pass

    # Mark as processed (with presID for dedup)
    state.setdefault("processed", {})[meeting_id] = {
        "date": meeting.get("date"),
        "processed_at": datetime.now().isoformat(),
        "mid": meeting["mid"],
        "pres_id": pres_id,
    }
    state.setdefault("_processed_pres_ids", set()).add(pres_id)
    save_state(state)

    print(f"\n  ✓ {meeting_id} complete")
    return True


def aggregate_and_push(push=False):
    """Aggregate all transcripts and optionally push to git."""
    print(f"\nAggregating transcripts...")

    # Use the aggregator script
    cmd = [
        sys.executable, str(AGGREGATOR),
        "--council", "lancashire_cc",
        "--source", str(TRANSCRIPTS_DIR),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    print(result.stdout)

    if push:
        print(f"\nPushing to git...")
        repo_dir = Path("/opt/transcripts/_repo")
        # Clone/pull the repo
        if not repo_dir.exists():
            subprocess.run([
                "git", "clone", "--depth=1",
                "https://github.com/tompickup23/burnleycouncil.git",
                str(repo_dir)
            ], timeout=120)
        else:
            subprocess.run(["git", "-C", str(repo_dir), "pull"], timeout=60)

        # Copy transcripts.json
        src = Path(f"/opt/transcripts/../burnley-council/data/lancashire_cc/transcripts.json")
        # Actually the aggregator writes to the script's data dir, which may not be on VPS
        # For VPS, we need to generate locally and push
        print("  NOTE: Auto-push not yet configured. Run aggregator locally and commit.")


def main():
    parser = argparse.ArgumentParser(description="Automated meeting transcription pipeline")
    parser.add_argument("--discover", action="store_true", help="Discover meetings and show status")
    parser.add_argument("--batch", action="store_true", help="Process all unprocessed meetings")
    parser.add_argument("--mid", help="Process a specific ModernGov meeting ID")
    parser.add_argument("--cron", action="store_true", help="Cron mode: discover + process latest + aggregate")
    parser.add_argument("--push", action="store_true", help="Push transcripts.json to git after processing")
    parser.add_argument("--min-score", type=float, default=7, help="Min score for pre-clipping")
    parser.add_argument("--reprocess", action="store_true", help="Reprocess already-processed meetings")
    args = parser.parse_args()

    # Prevent duplicate instances
    if args.batch or args.cron or args.mid:
        lock_fd = open(LOCKFILE, 'w')
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            lock_fd.write(str(os.getpid()))
            lock_fd.flush()
        except IOError:
            print("Another pipeline instance is already running. Exiting.")
            sys.exit(0)

    state = load_state()
    meetings = discover_meetings()

    if args.discover:
        print(f"\n{'='*60}")
        print(f"Full Council meetings since {CUTOFF_DATE}:")
        print(f"{'='*60}")
        for m in meetings:
            processed = m["meeting_id"] in state.get("processed", {})
            status = "✓ DONE" if processed else ("⏳ READY" if m.get("webcast_url") else "✗ NO WEBCAST")
            print(f"  {(m.get('date') or '?'):12s} | {status} | {m['meeting_id']}")
        return

    # Filter to unprocessed meetings with webcasts
    if args.reprocess:
        to_process = [m for m in meetings if m.get("webcast_url")]
    else:
        to_process = [m for m in meetings
                     if m.get("webcast_url") and m["meeting_id"] not in state.get("processed", {})]

    if args.mid:
        to_process = [m for m in meetings if m["mid"] == args.mid]
        if not to_process:
            print(f"Meeting MId={args.mid} not found")
            return

    if args.batch or args.cron:
        if not to_process:
            print("No meetings to process")
        else:
            print(f"\nProcessing {len(to_process)} meetings...")
            # Process oldest first
            to_process.sort(key=lambda m: m.get("date") or "")
            for m in to_process:
                try:
                    process_meeting(m, state, min_score=args.min_score)
                except Exception as e:
                    print(f"  ERROR processing {m['meeting_id']}: {e}")
                    continue

        # Aggregate
        aggregate_and_push(push=args.push)

    elif args.mid:
        for m in to_process:
            process_meeting(m, state, min_score=args.min_score)
        aggregate_and_push(push=args.push)


if __name__ == "__main__":
    main()
