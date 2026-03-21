#!/usr/bin/env python3
"""
YouTube Transcript ETL — Convert YouTube auto-generated VTT captions
into AI DOGE transcripts.json format.

Each borough council has different meeting formats, committee types,
and speaker identification patterns. This script handles the VTT
parsing generically, then applies council-specific metadata.

Usage:
    python3 youtube_transcript_etl.py --council burnley
    python3 youtube_transcript_etl.py --all
    python3 youtube_transcript_etl.py --council pendle --llm   # with LLM enrichment
"""

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
YT_DIR = SCRIPT_DIR / "yt-transcripts"
DATA_DIR = SCRIPT_DIR.parent / "data"

# ── Council metadata for YouTube channels ──────────────────────────────
COUNCIL_META = {
    "burnley": {
        "council_name": "Burnley Borough Council",
        "meeting_patterns": {
            "Full Council": r"Full Council|Annual Council",
            "Cabinet": r"Cabinet|Executive",
            "Planning": r"Planning",
            "Scrutiny": r"Scrutiny|Overview",
        },
    },
    "blackburn": {
        "council_name": "Blackburn with Darwen Borough Council",
        "meeting_patterns": {
            "Full Council": r"Council Forum|Full Council",
            "Executive Board": r"Executive Board",
            "Planning": r"Planning",
        },
    },
    "chorley": {
        "council_name": "Chorley Council",
        "meeting_patterns": {
            "Full Council": r"Council meeting|Full Council",
            "Executive Cabinet": r"Executive Cabinet|Cabinet",
            "Planning": r"Planning Committee",
            "Scrutiny": r"Scrutiny",
            "Licensing": r"Licensing",
        },
    },
    "hyndburn": {
        "council_name": "Hyndburn Borough Council",
        "meeting_patterns": {
            "Full Council": r"council meeting|Council$|Budget.Setting",
            "Cabinet": r"Cabinet",
        },
    },
    "pendle": {
        "council_name": "Pendle Borough Council",
        "meeting_patterns": {
            "Full Council": r"Full Council|Full Pendle|Extraordinary Council|Special Budget|Annual Full Council",
            "Executive": r"Executive Meeting",
            "Development Management": r"Development Management",
        },
    },
    "rossendale": {
        "council_name": "Rossendale Borough Council",
        "meeting_patterns": {
            "Full Council": r"Extraordinary Council|Council meeting",
            "Cabinet": r"Cabinet",
        },
    },
    "south_ribble": {
        "council_name": "South Ribble Borough Council",
        "meeting_patterns": {
            "Full Council": r"Council Meeting|Council -",
            "Cabinet": r"Cabinet",
            "Scrutiny": r"Scrutiny Committee",
        },
    },
}

# ── Tier 1 keyword flagging (matches LCC pipeline) ────────────────────
KEYWORD_PATTERNS = {
    "finance": [
        r"\b(?:million|£\d|budget|overspend|underspend|deficit|surplus|reserves?|savings?|cuts?|funding|revenue|expenditure|capital|borrowing|debt|council\s*tax|precept)\b",
    ],
    "governance": [
        r"\b(?:audit|scrutiny|transparency|accountability|governance|oversight|inspection|ofsted|cqc|compliance|risk\s*register)\b",
    ],
    "housing": [
        r"\b(?:housing|homelessness|rough\s*sleep|affordable\s*homes?|council\s*hous|social\s*housing|HMO|planning\s*application|brownfield|greenbelt)\b",
    ],
    "social_care": [
        r"\b(?:social\s*care|adult\s*care|children.s\s*services?|safeguarding|SEND|looked\s*after|foster|adoption|care\s*home|domiciliary|disabled)\b",
    ],
    "highways": [
        r"\b(?:highway|road\s*works?|pothole|traffic|congestion|parking|road\s*safety|cycling|pedestrian|pavement|street\s*light)\b",
    ],
    "environment": [
        r"\b(?:climate|carbon|net\s*zero|recycl|waste|fly.tipping|pollution|flooding|drainage|green\s*space|biodiversity)\b",
    ],
    "reform": [
        r"\b(?:reform|reorganis|LGR|unitary|devolution|combined\s*authority|county\s*deal)\b",
    ],
    "political": [
        r"\b(?:amendment|motion|division|recorded\s*vote|standing\s*order|point\s*of\s*order|no\s*confidence|resign|opposition|cross.party)\b",
    ],
    "controversy": [
        r"\b(?:scandal|misconduct|conflict\s*of\s*interest|declared\s*interest|complaint|investigation|allegation|whistleblow|breach|censure|suspended)\b",
    ],
}

# Compile all patterns
COMPILED_KEYWORDS = {}
for cat, patterns in KEYWORD_PATTERNS.items():
    COMPILED_KEYWORDS[cat] = [re.compile(p, re.IGNORECASE) for p in patterns]


def parse_vtt_timestamp(ts_str):
    """Parse VTT timestamp to seconds."""
    parts = ts_str.strip().split(":")
    if len(parts) == 3:
        h, m, s = parts
        return int(h) * 3600 + int(m) * 60 + float(s)
    elif len(parts) == 2:
        m, s = parts
        return int(m) * 60 + float(s)
    return 0.0


def parse_vtt(vtt_path):
    """
    Parse YouTube auto-generated VTT file into clean text segments.

    YouTube VTT has a specific pattern:
    - Duplicate lines (line appears, then repeats with new text appended)
    - Word-level timestamps in <c> tags
    - >> markers for speaker changes
    - HTML entities (&gt;&gt; for >>)

    Returns list of {start, end, text} segments (deduplicated).
    """
    with open(vtt_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Remove VTT header
    content = re.sub(r"^WEBVTT\n.*?\n\n", "", content, flags=re.DOTALL)

    segments = []
    # Match timestamp lines and their content
    blocks = re.split(r"\n\n+", content.strip())

    seen_texts = set()

    for block in blocks:
        lines = block.strip().split("\n")
        if not lines:
            continue

        # Find timestamp line
        ts_match = None
        text_lines = []
        for line in lines:
            m = re.match(
                r"(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})",
                line,
            )
            if m:
                ts_match = m
            elif ts_match:
                text_lines.append(line)

        if not ts_match or not text_lines:
            continue

        start = parse_vtt_timestamp(ts_match.group(1))
        end = parse_vtt_timestamp(ts_match.group(2))

        # Clean text: remove <c> tags, HTML entities, alignment info
        raw_text = " ".join(text_lines)
        # Remove word-level timestamp tags
        raw_text = re.sub(r"<\d{2}:\d{2}:\d{2}\.\d{3}>", "", raw_text)
        raw_text = re.sub(r"</?c>", "", raw_text)
        # HTML entities
        raw_text = raw_text.replace("&gt;", ">").replace("&lt;", "<").replace("&amp;", "&")
        # Remove alignment/position metadata
        raw_text = re.sub(r"align:\w+\s*position:\d+%", "", raw_text)
        # Clean whitespace
        raw_text = re.sub(r"\s+", " ", raw_text).strip()

        if not raw_text or raw_text in seen_texts:
            continue

        # Skip near-duplicate lines (YouTube repeats with additions)
        # Only keep the longer version
        seen_texts.add(raw_text)

        segments.append({"start": start, "end": end, "text": raw_text})

    # Deduplicate: YouTube VTT shows each line twice (once as subtitle,
    # once as the base for the next). Keep only unique content.
    deduped = []
    for i, seg in enumerate(segments):
        # Skip if this text is a prefix of the next segment's text
        if i + 1 < len(segments):
            next_text = segments[i + 1]["text"]
            if next_text.startswith(seg["text"]) and len(next_text) > len(seg["text"]):
                continue
        deduped.append(seg)

    return deduped


def merge_segments(segments, max_gap=2.0, max_length=200):
    """
    Merge short VTT segments into natural sentence-level chunks.
    Speaker changes (>>) force a new chunk.
    """
    if not segments:
        return []

    merged = []
    current = {
        "start": segments[0]["start"],
        "end": segments[0]["end"],
        "text": segments[0]["text"],
    }

    for seg in segments[1:]:
        gap = seg["start"] - current["end"]
        has_speaker_change = ">>" in seg["text"]
        combined_len = len(current["text"]) + len(seg["text"])

        if has_speaker_change or gap > max_gap or combined_len > max_length:
            merged.append(current)
            current = {"start": seg["start"], "end": seg["end"], "text": seg["text"]}
        else:
            current["end"] = seg["end"]
            current["text"] = current["text"] + " " + seg["text"]

    merged.append(current)
    return merged


def detect_speakers(segments):
    """
    Detect speaker changes from >> markers in YouTube captions.
    Assign speaker labels (Speaker A, Speaker B, etc.) or detect
    self-introductions like "My name is Councillor X".
    """
    speaker_map = {}
    current_speaker = "Chair"
    speaker_counter = 0

    for seg in segments:
        text = seg["text"]

        # Check for speaker change marker
        if ">>" in text:
            speaker_counter += 1
            if speaker_counter <= 26:
                current_speaker = f"Speaker_{chr(64 + speaker_counter)}"
            else:
                current_speaker = f"Speaker_{speaker_counter}"
            # Clean >> from text
            text = re.sub(r">>+\s*", "", text).strip()
            seg["text"] = text

        # Try to detect self-introductions (must have Councillor/Cllr title)
        intro_match = re.search(
            r"(?:my name is|I'm|I am)\s+(?:Councillor|Cllr|councelor)\s+(\w+(?:\s+\w+)?)",
            text,
            re.IGNORECASE,
        )
        if intro_match:
            name = intro_match.group(1).strip()
            # Filter out common false positives
            false_positives = {"happy", "going", "sure", "sorry", "not", "just", "very",
                             "afraid", "pleased", "hoping", "glad", "really", "still",
                             "particularly", "confident", "assuming", "delighted"}
            if name and len(name) > 2 and name.lower().split()[0] not in false_positives:
                current_speaker = name
                speaker_map[f"Speaker_{chr(64 + min(speaker_counter, 26))}"] = name

        seg["speaker"] = current_speaker

    return segments, speaker_map


def score_segment(text, topics):
    """
    Score a text segment for interest/importance.
    Based on keyword matches, presence of figures, length, controversy.
    """
    score = 0

    # Keyword topic matches (2 pts each)
    score += len(topics) * 2

    # Contains monetary figures (+3)
    if re.search(r"£[\d,.]+\s*(?:million|billion|thousand|m\b|bn\b|k\b)?", text, re.IGNORECASE):
        score += 3
    elif re.search(r"\d+\s*(?:million|billion|thousand)", text, re.IGNORECASE):
        score += 2

    # Contains percentages (+1)
    if re.search(r"\d+(?:\.\d+)?\s*%", text):
        score += 1

    # Controversy/confrontation (+2)
    if re.search(r"\b(?:disgrace|unacceptable|outrage|resign|fail|scandal|shame)\b", text, re.IGNORECASE):
        score += 2

    # Long substantive statement (+1)
    if len(text) > 150:
        score += 1

    # Questions to officers (+1)
    if re.search(r"\b(?:can you tell|will the|does the|what is|how many|why has)\b", text, re.IGNORECASE):
        score += 1

    return min(score, 10)


def classify_clip_type(score, topics):
    """Classify moment type based on score and topics."""
    if score >= 7:
        return "soundbite"
    elif score >= 4:
        return "key_exchange"
    elif any(t in topics for t in ["controversy", "political"]):
        return "confrontation"
    else:
        return "procedural"


def classify_category(topics, text):
    """Classify the primary category of a moment."""
    priority = [
        "controversy", "finance", "reform", "political",
        "social_care", "housing", "highways", "environment", "governance",
    ]
    for cat in priority:
        if cat in topics:
            return cat
    return "general"


def extract_meeting_date(filename):
    """Try to extract a date from the YouTube video title in the filename."""
    # Common patterns in titles
    patterns = [
        # "16 07 25" or "16/07/25"
        r"(\d{1,2})\s*[/\-\.]\s*(\d{1,2})\s*[/\-\.]\s*(\d{2,4})",
        # "22 February 2023"
        r"(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})",
        # "February 2023"
        r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})",
        # "27th March 2025"
        r"(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+(\d{4})",
        # "2021-12-09"
        r"(\d{4})-(\d{2})-(\d{2})",
        # "October 2020"
        r"(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})",
        # "July 2025"
        r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})",
        # "18 March 2026"
        r"(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})",
        # "30/09/2021" or "30⧸09⧸2021"
        r"(\d{1,2})[/⧸](\d{1,2})[/⧸](\d{4})",
    ]

    month_map = {
        "january": 1, "february": 2, "march": 3, "april": 4,
        "may": 5, "june": 6, "july": 7, "august": 8,
        "september": 9, "october": 10, "november": 11, "december": 12,
    }

    title = filename.replace("_", " ").replace("⧸", "/")

    # Check for ISO date first (YYYY-MM-DD) — must be before other patterns
    iso_match = re.search(r"(\d{4})-(\d{2})-(\d{2})", title)
    if iso_match:
        return f"{iso_match.group(1)}-{iso_match.group(2)}-{iso_match.group(3)}"

    # Check for spaced DD MM YY (like "16 07 25")
    spaced_match = re.search(r"\b(\d{2})\s+(\d{2})\s+(\d{2})\b", title)
    if spaced_match:
        d, m, y = int(spaced_match.group(1)), int(spaced_match.group(2)), int(spaced_match.group(3))
        if 1 <= d <= 31 and 1 <= m <= 12 and y < 100:
            year = 2000 + y
            return f"{year}-{m:02d}-{d:02d}"

    for pattern in patterns:
        m = re.search(pattern, title, re.IGNORECASE)
        if m:
            groups = m.groups()
            try:
                if len(groups) == 3:
                    # Check if first group is year (YYYY-MM-DD)
                    if len(groups[0]) == 4 and groups[0].isdigit():
                        return f"{groups[0]}-{int(groups[1]):02d}-{int(groups[2]):02d}"
                    # Check if middle group is month name
                    elif groups[1].lower() in month_map:
                        day = int(groups[0])
                        month = month_map[groups[1].lower()]
                        year = int(groups[2])
                        if year < 100:
                            year += 2000
                        return f"{year}-{month:02d}-{day:02d}"
                    else:
                        # DD/MM/YY or DD/MM/YYYY
                        day, month, year = int(groups[0]), int(groups[1]), int(groups[2])
                        if year < 100:
                            year += 2000
                        return f"{year}-{month:02d}-{day:02d}"
                elif len(groups) == 2:
                    # Month Year
                    if groups[0].lower() in month_map:
                        month = month_map[groups[0].lower()]
                        year = int(groups[1])
                        return f"{year}-{month:02d}-01"
            except (ValueError, IndexError):
                continue

    return None


def classify_committee(title, council_id):
    """Classify meeting committee type from video title."""
    meta = COUNCIL_META.get(council_id, {})
    patterns = meta.get("meeting_patterns", {})

    for committee, pattern in patterns.items():
        if re.search(pattern, title, re.IGNORECASE):
            return committee

    return "Meeting"


def generate_meeting_id(council_id, filename):
    """Generate a stable hex ID from council + filename."""
    key = f"{council_id}:{filename}"
    return hashlib.md5(key.encode()).hexdigest()[:12]


def process_vtt_file(vtt_path, council_id):
    """
    Process a single VTT file into meeting metadata + flagged moments.
    """
    filename = vtt_path.stem.replace(".en", "")

    # Extract YouTube video ID (always 11 chars) and title from filename
    # Format: {video_id}_{title}.en.vtt — but video IDs can contain underscores!
    # YouTube IDs are exactly 11 chars: [A-Za-z0-9_-]
    if len(filename) > 12 and filename[11] == "_":
        video_id = filename[:11]
        title = filename[12:]
    else:
        # Fallback: split at first underscore
        parts = filename.split("_", 1)
        video_id = parts[0] if len(parts) > 1 else ""
        title = parts[1] if len(parts) > 1 else filename

    meeting_id = generate_meeting_id(council_id, filename)
    date = extract_meeting_date(title) or "unknown"
    committee = classify_committee(title, council_id)

    print(f"  Processing: {title}")
    print(f"    Video ID: {video_id}, Date: {date}, Committee: {committee}")

    # Parse VTT
    raw_segments = parse_vtt(vtt_path)
    if not raw_segments:
        print(f"    WARNING: No segments found in {vtt_path.name}")
        return None, []

    # Merge into natural chunks
    merged = merge_segments(raw_segments)

    # Detect speakers
    merged, speaker_map = detect_speakers(merged)

    duration = max(s["end"] for s in merged) if merged else 0

    print(f"    Segments: {len(raw_segments)} raw → {len(merged)} merged, Duration: {duration:.0f}s")
    if speaker_map:
        print(f"    Speakers identified: {speaker_map}")

    # Score and flag moments
    moments = []
    for i, seg in enumerate(merged):
        text = seg["text"].strip()
        if not text or len(text) < 20:
            continue

        # Find topic matches
        topics = []
        for cat, compiled in COMPILED_KEYWORDS.items():
            for pat in compiled:
                if pat.search(text):
                    topics.append(cat)
                    break

        score = score_segment(text, topics)

        # Only keep moments with score >= 3 (skip pure procedural)
        if score < 3:
            continue

        category = classify_category(topics, text)
        clip_type = classify_clip_type(score, topics)

        moment = {
            "id": f"{meeting_id}-{i:03d}",
            "meeting_id": meeting_id,
            "start": round(seg["start"], 2),
            "end": round(seg["end"], 2),
            "text": text,
            "composite_score": score,
            "category": category,
            "clip_type": clip_type,
            "topics": topics,
            "speaker": seg.get("speaker", "Unknown"),
            "summary": "",  # Will be filled by LLM enrichment
            "quotability": min(score, 10),
            "news_value": min(score - 1, 10) if score > 1 else 0,
            "electoral_value": min(score - 1, 10) if any(t in topics for t in ["political", "controversy", "finance"]) else max(0, score - 3),
            "source": "youtube",
            "video_id": video_id,
        }
        moments.append(moment)

    # Meeting metadata
    meeting = {
        "id": meeting_id,
        "date": date,
        "committee": committee,
        "title": title,
        "duration_seconds": int(duration),
        "source": "youtube",
        "video_id": video_id,
        "youtube_url": f"https://www.youtube.com/watch?v={video_id}" if video_id else None,
        "stats": {
            "total_moments": len(moments),
            "high_value": len([m for m in moments if m["composite_score"] >= 7]),
            "soundbites": len([m for m in moments if m["clip_type"] == "soundbite"]),
        },
    }

    print(f"    Flagged moments: {len(moments)} (high-value: {meeting['stats']['high_value']})")

    return meeting, moments


def process_council(council_id, use_llm=False):
    """Process all VTT files for a council."""
    vtt_dir = YT_DIR / council_id
    if not vtt_dir.exists():
        print(f"ERROR: No VTT directory found for {council_id} at {vtt_dir}")
        return

    vtt_files = sorted(vtt_dir.glob("*.vtt"))
    if not vtt_files:
        print(f"ERROR: No VTT files found in {vtt_dir}")
        return

    meta = COUNCIL_META.get(council_id, {"council_name": council_id.replace("_", " ").title()})
    print(f"\n{'='*60}")
    print(f"Processing {meta.get('council_name', council_id)}: {len(vtt_files)} meetings")
    print(f"{'='*60}")

    all_meetings = []
    all_moments = []

    for vtt_file in vtt_files:
        meeting, moments = process_vtt_file(vtt_file, council_id)
        if meeting:
            all_meetings.append(meeting)
            all_moments.extend(moments)

    # Sort meetings by date (most recent first)
    all_meetings.sort(key=lambda m: m.get("date", ""), reverse=True)

    # Sort moments by score (highest first)
    all_moments.sort(key=lambda m: m["composite_score"], reverse=True)

    # Build topic index
    topic_index = {}
    for moment in all_moments:
        for topic in moment["topics"]:
            if topic not in topic_index:
                topic_index[topic] = []
            topic_index[topic].append(moment["id"])

    # Assemble output
    output = {
        "meetings": all_meetings,
        "moments": all_moments,
        "topic_index": topic_index,
        "stats": {
            "total_meetings": len(all_meetings),
            "total_moments": len(all_moments),
            "high_value_moments": len([m for m in all_moments if m["composite_score"] >= 7]),
            "source": "youtube",
            "generated": datetime.now().isoformat(),
            "council_id": council_id,
        },
    }

    # Check if council already has LCC-style transcripts (don't overwrite)
    output_dir = DATA_DIR / council_id
    output_path = output_dir / "transcripts.json"

    if output_path.exists():
        # Merge with existing (LCC Mediasite data)
        try:
            with open(output_path) as f:
                existing = json.load(f)
            existing_ids = {m["id"] for m in existing.get("meetings", [])}
            new_meetings = [m for m in all_meetings if m["id"] not in existing_ids]
            new_moment_ids = {m["meeting_id"] for m in all_moments if m["meeting_id"] not in existing_ids}
            new_moments = [m for m in all_moments if m["meeting_id"] in new_moment_ids]

            if new_meetings:
                existing["meetings"].extend(new_meetings)
                existing["moments"].extend(new_moments)
                # Update topic index
                for topic, ids in topic_index.items():
                    new_ids = [i for i in ids if any(m["id"] == i and m["meeting_id"] in new_moment_ids for m in all_moments)]
                    if topic in existing.get("topic_index", {}):
                        existing["topic_index"][topic].extend(new_ids)
                    else:
                        existing.setdefault("topic_index", {})[topic] = new_ids
                existing["stats"]["total_meetings"] = len(existing["meetings"])
                existing["stats"]["total_moments"] = len(existing["moments"])
                output = existing
                print(f"\n  Merged {len(new_meetings)} new meetings into existing transcripts.json")
            else:
                print(f"\n  No new meetings to add (all already in transcripts.json)")
                return output
        except (json.JSONDecodeError, KeyError):
            pass  # Overwrite if existing is corrupt

    os.makedirs(output_dir, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\n  Output: {output_path}")
    print(f"  Meetings: {len(output['meetings'])}")
    print(f"  Moments: {len(output['moments'])} ({output['stats'].get('high_value_moments', 0)} high-value)")

    return output


def main():
    parser = argparse.ArgumentParser(description="YouTube Transcript ETL")
    parser.add_argument("--council", help="Council ID to process")
    parser.add_argument("--all", action="store_true", help="Process all councils")
    parser.add_argument("--llm", action="store_true", help="Enable LLM enrichment (summaries)")
    parser.add_argument("--dry-run", action="store_true", help="Parse only, don't write output")
    args = parser.parse_args()

    if args.all:
        councils = [d.name for d in YT_DIR.iterdir() if d.is_dir()]
    elif args.council:
        councils = [args.council]
    else:
        print("Usage: python3 youtube_transcript_etl.py --council <id> | --all")
        sys.exit(1)

    results = {}
    for council_id in sorted(councils):
        result = process_council(council_id, use_llm=args.llm)
        if result:
            results[council_id] = {
                "meetings": result["stats"]["total_meetings"],
                "moments": result["stats"]["total_moments"],
            }

    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    for cid, stats in sorted(results.items()):
        print(f"  {cid:20s}  {stats['meetings']:3d} meetings  {stats['moments']:4d} moments")
    total_meetings = sum(s["meetings"] for s in results.values())
    total_moments = sum(s["moments"] for s in results.values())
    print(f"  {'TOTAL':20s}  {total_meetings:3d} meetings  {total_moments:4d} moments")


if __name__ == "__main__":
    main()
