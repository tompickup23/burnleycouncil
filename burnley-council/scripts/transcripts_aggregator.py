#!/usr/bin/env python3
"""
transcripts_aggregator.py — Aggregate meeting transcripts for AI DOGE frontend.

Reads tier2 analysis output from vps-main /opt/transcripts/ and produces
a single transcripts.json per council for the frontend.

Usage:
    # Aggregate from VPS (downloads via SSH)
    python3 transcripts_aggregator.py --council lancashire_cc

    # Aggregate from local directory
    python3 transcripts_aggregator.py --council lancashire_cc --source /opt/transcripts

    # List available meetings on VPS
    python3 transcripts_aggregator.py --list
"""

import json
import os
import sys
import subprocess
import argparse
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"
VPS_HOST = "vps-main"
VPS_TRANSCRIPTS = "/opt/transcripts"

# Known meeting metadata (expand as meetings are transcribed)
MEETING_METADATA = {
    "lcc-full-council-2025-07-17": {
        "date": "2025-07-17",
        "committee": "Full Council",
        "council_id": "lancashire_cc",
        "duration_seconds": 14400,
        "webcast_url": "https://auditelsystems.mediasite.com/Mediasite/Play/7b2a963a016945b29ef6a6c63be50fd51d",
    },
}


def list_meetings_vps():
    """List available transcribed meetings on VPS."""
    result = subprocess.run(
        ["ssh", VPS_HOST, f"ls -d {VPS_TRANSCRIPTS}/*/tier2_v2.json 2>/dev/null"],
        capture_output=True, text=True, timeout=15
    )
    meetings = []
    for line in result.stdout.strip().split("\n"):
        if line:
            meeting_id = line.split("/")[-2]
            meetings.append(meeting_id)
    return meetings


def download_tier2(meeting_id, dest_dir):
    """Download tier2 analysis from VPS."""
    dest = dest_dir / f"{meeting_id}_tier2.json"
    src = f"{VPS_HOST}:{VPS_TRANSCRIPTS}/{meeting_id}/tier2_v2.json"
    result = subprocess.run(
        ["scp", src, str(dest)],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode == 0 and dest.exists():
        return dest
    return None


def aggregate(council_id, source_dir=None):
    """Aggregate all meeting transcripts for a council into transcripts.json."""
    output_path = DATA_DIR / council_id / "transcripts.json"

    # Find tier2 files
    if source_dir:
        source = Path(source_dir)
        tier2_files = sorted(source.glob("*/tier2_v2.json"))
    else:
        # Download from VPS
        import tempfile
        tmp = Path(tempfile.mkdtemp())
        meetings = list_meetings_vps()
        council_meetings = [m for m in meetings
                          if MEETING_METADATA.get(m, {}).get("council_id") == council_id]
        print(f"Found {len(council_meetings)} meetings for {council_id}")

        tier2_files = []
        for meeting_id in council_meetings:
            path = download_tier2(meeting_id, tmp)
            if path:
                tier2_files.append((meeting_id, path))
                print(f"  Downloaded: {meeting_id}")

    # Aggregate
    all_meetings = []
    all_moments = []
    all_topics = {}
    moment_idx = 0

    items = []
    if source_dir:
        for f in tier2_files:
            meeting_id = f.parent.name
            items.append((meeting_id, f))
    else:
        items = tier2_files  # Already (meeting_id, path) tuples

    for meeting_id, tier2_path in items:
        with open(tier2_path) as f:
            raw = json.load(f)

        moments = raw.get("moments", [])
        meta = MEETING_METADATA.get(meeting_id, {})

        # Meeting record
        meeting = {
            "id": meeting_id,
            "date": meta.get("date", ""),
            "committee": meta.get("committee", "Unknown"),
            "duration_seconds": meta.get("duration_seconds", 0),
            "webcast_url": meta.get("webcast_url", ""),
            "stats": {
                "total_moments": len(moments),
                "high_value": sum(1 for m in moments if m.get("composite_score", 0) >= 7),
                "soundbites": sum(1 for m in moments
                                if (m.get("llm") or {}).get("clip_type") == "soundbite"),
            }
        }
        all_meetings.append(meeting)

        # Process moments
        for m in moments:
            llm = m.get("llm") or {}
            moment = {
                "id": f"{meeting_id}-{moment_idx:03d}",
                "meeting_id": meeting_id,
                "start": m["start"],
                "end": m["end"],
                "text": m["text"],
                "composite_score": m.get("composite_score", 0),
                "category": llm.get("category", "routine"),
                "clip_type": llm.get("clip_type", "none"),
                "topics": llm.get("topics", []),
                "speaker": llm.get("speaker"),
                "summary": llm.get("summary", ""),
                "quotability": llm.get("quotability", 0),
                "news_value": llm.get("news_value", 0),
                "electoral_value": llm.get("electoral_value", 0),
            }
            all_moments.append(moment)
            moment_idx += 1

            # Build topic index
            for topic in moment["topics"]:
                topic_clean = topic.lower().strip().replace(" ", "_")
                if topic_clean not in all_topics:
                    all_topics[topic_clean] = []
                h = int(m["start"] // 3600)
                mn = int((m["start"] % 3600) // 60)
                s = int(m["start"] % 60)
                all_topics[topic_clean].append({
                    "timestamp": f"{h}:{mn:02d}:{s:02d}",
                    "score": m.get("composite_score", 0),
                    "clip_type": llm.get("clip_type", "none"),
                    "speaker": llm.get("speaker"),
                })

        print(f"  {meeting_id}: {len(moments)} moments")

    # Stats
    unique_speakers = set()
    for m in all_moments:
        if m.get("speaker"):
            unique_speakers.add(m["speaker"])

    total_duration = sum(mt.get("duration_seconds", 0) for mt in all_meetings)

    output = {
        "meetings": sorted(all_meetings, key=lambda x: x.get("date", ""), reverse=True),
        "moments": all_moments,
        "topic_index": all_topics,
        "stats": {
            "total_meetings": len(all_meetings),
            "total_moments": len(all_moments),
            "total_soundbites": sum(1 for m in all_moments if m["clip_type"] == "soundbite"),
            "total_full_speeches": sum(1 for m in all_moments if m["clip_type"] == "full_speech"),
            "total_archive": sum(1 for m in all_moments if m["clip_type"] == "archive"),
            "total_topics": len(all_topics),
            "total_high_value": sum(1 for m in all_moments if m["composite_score"] >= 7),
            "total_speakers": len(unique_speakers),
            "total_duration_hours": round(total_duration / 3600, 1),
        },
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    size_kb = os.path.getsize(output_path) / 1024
    print(f"\nWritten: {output_path}")
    print(f"Size: {size_kb:.0f}KB")
    print(f"Meetings: {len(all_meetings)}")
    print(f"Moments: {len(all_moments)}")
    print(f"Topics: {len(all_topics)}")
    print(f"Soundbites: {output['stats']['total_soundbites']}")
    print(f"High value: {output['stats']['total_high_value']}")


def main():
    parser = argparse.ArgumentParser(description="Aggregate meeting transcripts")
    parser.add_argument("--council", default="lancashire_cc", help="Council ID")
    parser.add_argument("--source", help="Local source directory (default: download from VPS)")
    parser.add_argument("--list", action="store_true", help="List available meetings on VPS")
    args = parser.parse_args()

    if args.list:
        meetings = list_meetings_vps()
        print(f"Available meetings on VPS:")
        for m in meetings:
            meta = MEETING_METADATA.get(m, {})
            print(f"  {m} — {meta.get('committee', '?')} {meta.get('date', '?')}")
        return

    aggregate(args.council, source_dir=args.source)


if __name__ == "__main__":
    main()
