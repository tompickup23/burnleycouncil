#!/usr/bin/env python3
"""
Council meeting transcriber — download and transcribe LCC webcasts.

Downloads meeting recordings from Mediasite via yt-dlp, transcribes with
faster-whisper, outputs timestamped JSON + plain text + clip-ready segments.

Pipeline:
    ModernGov meeting URL → find Mediasite webcast link → yt-dlp download
    → faster-whisper transcribe → timestamped JSON → keyword flagging
    → ffmpeg clip extraction

Usage:
    # Transcribe from Mediasite URL
    python3 meeting_transcriber.py --url "https://auditelsystems.mediasite.com/Mediasite/Play/PRESENTATION_ID"

    # Transcribe from ModernGov meeting page (auto-finds webcast link)
    python3 meeting_transcriber.py --meeting "https://council.lancashire.gov.uk/ieListDocuments.aspx?CId=138&MId=15359"

    # Transcribe a local video file
    python3 meeting_transcriber.py --file ~/Downloads/meeting.mp4

    # Transcribe and auto-clip politically relevant moments
    python3 meeting_transcriber.py --url "..." --clip

    # Denoise audio first (isolate vocals from background noise/music)
    python3 meeting_transcriber.py --file noisy_speech.mp4 --denoise

    # Use a specific model size (tiny/base/small/medium/large-v3)
    python3 meeting_transcriber.py --url "..." --model medium

Designed for vps-main (8 vCPU, 32GB RAM, no GPU — uses CPU inference).
"""

import os
import sys
import json
import re
import subprocess
import argparse
import tempfile
import shutil
from pathlib import Path
from datetime import datetime

# Output directory
OUTPUT_DIR = Path("/opt/transcripts")
FFMPEG = "ffmpeg"
FFPROBE = "ffprobe"

# ============================================================
# TIER 1: Keyword detection (instant, free, regex)
# ============================================================
POLITICAL_KEYWORDS = {
    # Finance & budget — always high value
    "finance": [
        r"\bcouncil tax\b", r"\bband d\b", r"\bprecept\b", r"\bbudget\b",
        r"\bsavings?\b", r"\boverspend\b", r"\bunderspend\b", r"\breserves?\b",
        r"\bmillion pounds?\b", r"\bbillion\b", r"\bbalanced budget\b",
        r"\brevenue budget\b", r"\bcapital programme\b", r"\bMTFS\b",
        r"\bmedium.term financial\b", r"\boutturn\b", r"\bvariance\b",
        r"\btransformation\b",
        r"\bborrowing\b", r"\bdebt\b", r"\btreasury\b",
        r"\baudit(?:or)?\b", r"\bsection 114\b", r"\bsection 151\b",
        r"\bVeLTIP\b", r"\bbond(?:s)?\b", r"\binvestment loss",
    ],
    # Services — public interest
    "services": [
        r"\bSEND\b", r"\bEHCP\b", r"\bsocial care\b", r"\badult care\b",
        r"\bchildren.?s services?\b", r"\bsafeguarding\b",
        r"\bhighways?\b", r"\bpotholes?\b",
        r"\bcare homes?\b", r"\bresidential care\b", r"\bdomiciliary\b",
        r"\bwaste\b", r"\brecycling\b",
        r"\bhousing\b", r"\bhomelessness\b",
        r"\bpublic health\b", r"\bmental health\b",
        r"\beducation\b", r"\bOFSTED\b",
        r"\btransport\b", r"\bschool transport\b",
        r"\bspecial school\b", r"\btribunal\b",
        r"\bfire service\b", r"\bpolice\b", r"\blibraries?\b",
    ],
    # Political — party dynamics, votes, power
    "political": [
        r"\breform\s*(uk)?\b", r"\bconservative\b", r"\blabour\b", r"\bliberal democrat\b",
        r"\bgreen\s*party\b",
        r"\bnotice of motion\b",
        r"\brecorded vote\b", r"\bnamed vote\b",
        r"\bgroup leader\b", r"\bopposition\b",
        r"\bno confidence\b",
        r"\bpoint of order\b",
        r"\bscrutiny\b",
        r"\bmandate\b", r"\belected\b", r"\bdemocratic\b",
    ],
    # People & governance — only flag SUBSTANTIVE mentions
    "governance": [
        r"\bdeputy leader\b", r"\bchief executive\b",
        r"\bportfolio holder\b",
        r"\bmonitoring officer\b",
    ],
    # LGR & devolution
    "lgr": [
        r"\blocal government reorganis", r"\bunitary\b",
        r"\bdevolution\b", r"\bcombined authority\b", r"\bcounty deal\b",
        r"\btwo.?unitary\b", r"\bsingle.?unitary\b",
        r"\bvesting day\b", r"\bshadow (council|authority|election)\b",
    ],
    # Hot topics — high public/media interest
    "hot_topics": [
        r"\barmed forces\b", r"\bcovenant\b", r"\bveteran\b",
        r"\basylum\b", r"\bmigrant\b", r"\bdispersal\b",
        r"\bdeprivation\b", r"\bpoverty\b", r"\bfood ?bank\b",
        r"\bcrime\b", r"\banti.?social\b", r"\bdisorder\b",
        r"\bclimate\b", r"\bnet.?zero\b", r"\bflood\b",
        r"\bcost.?of.?living\b", r"\bfuel poverty\b",
        r"\btransparency\b", r"\bfreedom of information\b", r"\bFOI\b",
        r"\ballowances?\b", r"\bremuneration\b",
        r"\basylum seeker\b", r"\brefugee\b",
        r"\bwaiting list\b", r"\bbacklog\b",
    ],
    # Commitments & promises — trackable
    "commitments": [
        r"I (promise|commit|pledge|guarantee|assure)\b",
        r"we will (deliver|ensure|provide|invest|protect|stop|end|fix)\b",
        r"we have (delivered|saved|identified|achieved|protected|stopped)\b",
        r"we are committed to\b",
        r"this (administration|government|council) (will|has)\b",
        r"\btarget of\b", r"\bon track\b", r"\bmilestone\b",
        r"\bnever (again|allow)\b",
    ],
    # Conflict & drama — clip-worthy
    "conflict": [
        r"\bdisgrace\b", r"\bshame\b", r"\bresign\b", r"\bapolog",
        r"\bmislead\b", r"\binaccurate\b", r"\bincorrect\b",
        r"\bunacceptable\b", r"\boutrageous\b", r"\bscandalous\b",
        r"\bwithdraw\b", r"\bretract\b",
        r"\bconflict of interest\b", r"\bdeclare an interest\b",
        r"\bcensure\b",
        r"\border\s*!\s*order\b", r"\bsit down\b",
        r"\bfundamentally disagree\b", r"\bsimply not true\b",
        r"\bthat is (not|a) (true|lie|false)\b",
        r"\bhow dare\b", r"\babsolutely (not|wrong|false)\b",
        r"\byou (should be|are) (ashamed|embarrassed)\b",
        r"\bhypocrisy\b", r"\bhypocrit",
    ],
}

# ============================================================
# SPECIFIC FIGURE DETECTION — financial amounts boost relevance
# ============================================================
# Segments mentioning specific £ amounts are more newsworthy than generic
# budget references. Detected separately and added as a score multiplier.
# Whisper outputs numbers in varying formats:
# "£100 million", "100 million", "a hundred million", "one hundred million"
# "three point eight percent", "3.8%", "£10 billion"
FIGURE_PATTERN = re.compile(
    r'£[\d,.]+\s*(?:million|billion|m\b|bn\b|k\b|thousand)?'
    r'|[\d,.]+\s*(?:million|billion|thousand)\s*(?:pounds?)?'
    r'|(?:a |one |two |three |four |five |six |seven |eight |nine |ten |twenty |thirty |forty |fifty |sixty |seventy |eighty |ninety )?hundred\s*(?:million|billion|thousand)?\s*(?:pounds?)?'
    r'|[\d.]+\s*(?:percent|per\s*cent|%)'
    r'|(?:one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:percent|per\s*cent)'
    r'|\bpoint\s+\w+\s+(?:percent|per\s*cent)\b',
    re.IGNORECASE
)

# ============================================================
# PROCEDURAL FILTERS — suppress noise from routine items
# ============================================================
# These patterns indicate procedural/routine context where keywords
# should be DEMOTED (score halved) rather than flagged at full weight.
PROCEDURAL_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in [
        r"^councillor \w+\s*$",                         # Just a name (roll call)
        r"to move the report",                           # Routine report moving
        r"would you like to (say|see) a few words",      # Chairman intro
        r"declarations? of interest",                     # Standard agenda item
        r"minutes of the (previous|last) meeting",        # Approving minutes
        r"those in favour.*those against",                # Vote counting
        r"^(for|against|abstain)\s*$",                    # Roll call responses
        r"apologies? for absence",                        # Standard agenda item
        r"I declare the meeting (closed|open)",           # Meeting admin
        r"housekeeping",                                  # Admin
        r"fire alarm",                                    # Safety briefing
        r"assembly point",                                # Safety briefing
        r"comfort break",                                 # Adjournment
        r"we will adjourn",                               # Adjournment
        r"^thank you,?\s*(councillor|chair|mr)",          # Simple thanks
    ]
]

# Compile all patterns
KEYWORD_PATTERNS = {}
for category, patterns in POLITICAL_KEYWORDS.items():
    KEYWORD_PATTERNS[category] = [re.compile(p, re.IGNORECASE) for p in patterns]

# Category weights for scoring
CATEGORY_WEIGHTS = {
    "finance": 3,
    "services": 2,
    "political": 3,
    "governance": 1,
    "lgr": 4,
    "hot_topics": 3,
    "commitments": 5,  # Trackable promises are gold
    "conflict": 5,     # Drama = clips
}


# ============================================================
# TIER 2: LLM contextual analysis (free tier, batch)
# ============================================================

TIER2_SYSTEM_PROMPT = """You are a political intelligence analyst for a UK council transparency platform.

You analyse transcript segments from council meetings and score their political relevance.

Context: {council_context}

For each segment, return a JSON object with:
- "relevance": 1-10 (10 = extremely politically significant)
- "quotability": 1-10 (10 = perfect soundbite, clean and punchy)
- "news_value": 1-10 (10 = front page local news)
- "electoral_value": 1-10 (10 = directly usable in election campaign material)
- "category": one of "promise", "attack", "defence", "revelation", "conflict", "policy", "speech", "procedural", "routine"
- "summary": one sentence describing why this matters (max 20 words)
- "clip_type": one of "soundbite" (15-30s punchy quote), "full_speech" (multi-minute speech worth preserving whole), "archive" (searchable but not standalone clip), "none"
- "topics": array of topic tags for searchability, e.g. ["bonds", "treasury", "conservative_legacy"]
- "speaker": councillor surname if identifiable from context (look at who was invited to speak in preceding text), null otherwise

Clip type guidance:
- "soundbite": A clean, quotable statement from an identified speaker. Does NOT need to be dramatic — any clear statement of policy, commitment, criticism, or fact from a named speaker is a soundbite. These are auto-extracted for the clip library.
- "full_speech": A sustained speech (cabinet member presenting, leader responding, opposition making a case). The whole speech has value as a single unit. These are indexed but only extracted on request.
- "archive": Not clip-worthy on its own, but valuable when cross-referenced later. Someone mentions bonds in passing — not a clip now, but when bonds come up again you can search and find every mention.
- "none": Purely procedural, no future reference value.

Topic tags are critical — they link this moment to every other mention of the same topic across all meetings. Tag generously: if bonds are mentioned, tag "bonds". If SEND is mentioned, tag "send". If a specific councillor is being discussed, tag their surname.

Score high when:
- A named speaker makes a clear, quotable statement (even if calm and factual)
- Someone reveals specific data (spending figures, service outcomes, statistics)
- A heated exchange or political conflict with clear sides
- An opposition attack that needs rebuttal preparation
- A cabinet member or administration councillor making a compelling case
- Something the public would genuinely care about (services, money, safety)
- A question that puts someone on the spot (good or bad answer)

Score low when:
- Procedural (approving minutes, declarations of interest, roll call)
- Vague statements with no specific content
- General pleasantries, thanks, or congratulations
- Reading out motion text verbatim (the text is already in the minutes)"""

TIER2_USER_PROMPT = """Analyse these transcript segments from a council meeting. Each segment includes surrounding context in [CONTEXT] to help identify the speaker and topic.

Return ONLY a valid JSON array with one object per segment. No markdown code fences, no explanation, no commentary — just the raw JSON array starting with [ and ending with ].

Segments:
{segments_text}"""


# Council political context for LLM scoring
COUNCIL_CONTEXTS = {
    "lancashire_cc": (
        "Lancashire County Council is controlled by Reform UK (53 of 84 seats, outright majority). "
        "Leader: Cllr Stephen Atkinson. The user is a Reform councillor in the administration. "
        "Opposition groups: Progressive Lancashire (11 seats, leader Azhar Ali), "
        "Conservative (8, leader Aidy Riggott), Liberal Democrats (5, John Potter), "
        "Labour (5, Mark Clifford), OWL (2). "
        "\n\nKey administration achievements to recognise: "
        "5 care homes saved from closure, £28M inherited overspend eliminated, "
        "council tax 3.80% (lowest in 12 years, was 4.99% under Conservatives), "
        "savings delivery 48%→100%, £417M bond losses exposed, pension director salaries stopped. "
        "\n\nKey service pressures: SEND (backlog, tribunal costs, transport), "
        "adult social care (demographic demand), highways (£650M backlog). "
        "\n\nScore HIGH when: "
        "- Reform councillor makes a quotable statement (content for articles/social media) "
        "- Someone cites specific financial figures (£amounts, percentages) "
        "- Opposition attacks Reform (rebuttal preparation needed) "
        "- Opposition admits failure or contradicts their own record "
        "- Cabinet member defends policy with evidence "
        "- Public would care: care homes, potholes, SEND, council tax, safety "
        "- A commitment or promise is made (trackable) "
        "- Heated exchange with clear sides "
        "\n\nScore LOW when: "
        "- Procedural (minutes, declarations, roll call, report moving) "
        "- Vague statements without specific content "
        "- General thanks or congratulations "
        "- Reading out motion text verbatim"
    ),
    "default_opposition": (
        "The user is monitoring this council from outside the administration. "
        "Score high: broken promises, poor performance admissions, spending revelations, "
        "conflicts of interest, accountability gaps, FOI-worthy moments, "
        "anything that reveals mismanagement or poor governance. "
        "Score low: routine procedural items."
    ),
}


def extract_json_from_response(response):
    """Robustly extract JSON array from LLM response.

    Handles: raw JSON, ```json fences, ```fences, leading commentary,
    trailing commentary, mixed markdown. Returns parsed list or None.
    """
    response = response.strip()

    # Try 1: Direct parse (Mistral often returns clean JSON)
    try:
        result = json.loads(response)
        if isinstance(result, list):
            return result
    except json.JSONDecodeError:
        pass

    # Try 2: Extract from markdown code fences
    fence_patterns = [
        r'```json\s*\n(.*?)\n\s*```',   # ```json ... ```
        r'```\s*\n(.*?)\n\s*```',         # ``` ... ```
        r'```json\s*(.*?)\s*```',          # ```json...``` (no newlines)
        r'```\s*(.*?)\s*```',              # ```...```
    ]
    for pattern in fence_patterns:
        match = re.search(pattern, response, re.DOTALL)
        if match:
            try:
                result = json.loads(match.group(1).strip())
                if isinstance(result, list):
                    return result
            except json.JSONDecodeError:
                continue

    # Try 3: Find the first [ and last ] — extract the array
    first_bracket = response.find('[')
    last_bracket = response.rfind(']')
    if first_bracket != -1 and last_bracket > first_bracket:
        try:
            result = json.loads(response[first_bracket:last_bracket + 1])
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass

    return None


def build_segment_context(moment, all_segments, context_lines=2):
    """Build segment text with surrounding context for speaker identification.

    Includes 2 segments before the flagged moment so the LLM can see
    the chairman's introduction (e.g. "Councillor Salter, please respond").
    """
    ts = format_timestamp(moment["start"])
    # Find surrounding segments by timestamp
    context_before = []
    for seg in all_segments:
        if seg["end"] <= moment["start"] and seg["end"] >= moment["start"] - 30:
            context_before.append(seg)
    context_before = context_before[-context_lines:]  # Last N before

    parts = []
    if context_before:
        ctx_text = " ".join(s["text"] for s in context_before)
        parts.append(f"  [CONTEXT] {ctx_text}")
    parts.append(f"  [{ts}] {moment['text']}")

    return "\n".join(parts)


def tier2_llm_analysis(flagged_moments, all_segments=None, batch_size=6,
                        council_id=None, max_retries=2, retry_delay=5):
    """Run LLM contextual analysis on Tier 1 flagged moments.

    Improvements over v1:
    - Smaller batch size (6) for better per-segment accuracy
    - Surrounding context passed for speaker identification
    - Robust JSON extraction (handles fences, commentary, partial)
    - Retry with backoff on rate limits
    - Three-tier clip classification (soundbite/full_speech/archive)
    - Topic tagging for cross-meeting searchability
    - Tier 1-only scores capped at 6 so LLM-analysed moments rank higher
    """
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        sys.path.insert(0, script_dir)
        from llm_router import generate
    except ImportError:
        print("  Warning: llm_router.py not found, skipping Tier 2 analysis")
        return flagged_moments

    enhanced = []
    total = len(flagged_moments)
    print(f"  Running Tier 2 LLM analysis on {total} flagged moments (batch size {batch_size})...")

    context = COUNCIL_CONTEXTS.get(council_id, COUNCIL_CONTEXTS["default_opposition"])
    system_prompt = TIER2_SYSTEM_PROMPT.format(council_context=context)

    success_count = 0
    fail_count = 0

    for batch_start in range(0, total, batch_size):
        batch = flagged_moments[batch_start:batch_start + batch_size]
        batch_num = batch_start // batch_size + 1
        total_batches = (total + batch_size - 1) // batch_size

        # Build segment text with surrounding context
        segments_text = ""
        for i, moment in enumerate(batch):
            if all_segments:
                seg_text = build_segment_context(moment, all_segments)
            else:
                ts = format_timestamp(moment["start"])
                seg_text = f"  [{ts}] {moment['text']}"
            segments_text += f"\n[{i+1}]\n{seg_text}\n"

        prompt = TIER2_USER_PROMPT.format(segments_text=segments_text)

        # Retry loop with backoff
        analyses = None
        for attempt in range(max_retries + 1):
            try:
                response, provider = generate(
                    prompt,
                    system_prompt=system_prompt,
                )

                analyses = extract_json_from_response(response)
                if analyses:
                    print(f"    Batch {batch_num}/{total_batches} OK via {provider} ({len(analyses)} results)")
                    success_count += 1
                    break
                else:
                    print(f"    Batch {batch_num}/{total_batches} via {provider}: could not parse JSON (attempt {attempt+1})")
                    if attempt < max_retries:
                        import time
                        time.sleep(retry_delay * (attempt + 1))

            except Exception as e:
                error_str = str(e)
                if "429" in error_str and attempt < max_retries:
                    wait = retry_delay * (attempt + 1) * 2
                    print(f"    Batch {batch_num}: Rate limited, waiting {wait}s...")
                    import time
                    time.sleep(wait)
                elif attempt < max_retries:
                    print(f"    Batch {batch_num} attempt {attempt+1} error: {error_str[:100]}")
                    import time
                    time.sleep(retry_delay)
                else:
                    print(f"    Batch {batch_num} failed after {max_retries+1} attempts: {error_str[:100]}")

        # Apply results or fallback
        for i, moment in enumerate(batch):
            if analyses and i < len(analyses):
                analysis = analyses[i]
                clip_type = analysis.get("clip_type", "none")
                # Map old clip_worthy to new clip_type for backward compat
                if clip_type == "none" and analysis.get("clip_worthy"):
                    clip_type = "soundbite"

                moment["llm"] = {
                    "relevance": analysis.get("relevance", 5),
                    "quotability": analysis.get("quotability", 5),
                    "news_value": analysis.get("news_value", 3),
                    "electoral_value": analysis.get("electoral_value", 3),
                    "category": analysis.get("category", "unknown"),
                    "summary": analysis.get("summary", ""),
                    "clip_type": clip_type,
                    "topics": analysis.get("topics", []),
                    "speaker": analysis.get("speaker"),
                }
                llm = moment["llm"]
                base_score = (
                    llm["relevance"] * 0.3 +
                    llm["quotability"] * 0.25 +
                    llm["news_value"] * 0.2 +
                    llm["electoral_value"] * 0.25
                )
                # Speaker boost: identified speakers make moments more usable
                # OCR-verified = +1.0, chairman/OCR = +0.7, any speaker = +0.5
                speaker = moment.get("speaker") or llm.get("speaker")
                speaker_conf = moment.get("speaker_confidence", "")
                if speaker:
                    if speaker_conf == "ocr_verified":
                        base_score += 1.0
                    elif speaker_conf in ("ocr_fuzzy", "chairman"):
                        base_score += 0.7
                    else:
                        base_score += 0.5
                    # Use OCR speaker if LLM didn't identify one
                    if not llm.get("speaker") and speaker:
                        llm["speaker"] = speaker

                moment["composite_score"] = round(min(base_score, 10), 1)
            else:
                # Tier 1 only — cap at 6 so LLM-analysed moments rank higher
                moment["llm"] = None
                moment["composite_score"] = min(moment.get("tier1_score", 3), 6)
                fail_count += 1

            enhanced.append(moment)

    # Sort by composite score descending
    enhanced.sort(key=lambda x: x.get("composite_score", 0), reverse=True)

    # Stats
    soundbites = sum(1 for m in enhanced if (m.get("llm") or {}).get("clip_type") == "soundbite")
    full_speeches = sum(1 for m in enhanced if (m.get("llm") or {}).get("clip_type") == "full_speech")
    archive = sum(1 for m in enhanced if (m.get("llm") or {}).get("clip_type") == "archive")
    high_value = sum(1 for m in enhanced if (m.get("composite_score") or 0) >= 7)

    # Build topic index
    topic_index = {}
    for m in enhanced:
        for topic in (m.get("llm") or {}).get("topics", []):
            topic = topic.lower().strip()
            if topic not in topic_index:
                topic_index[topic] = []
            topic_index[topic].append({
                "timestamp": format_timestamp(m["start"]),
                "score": m.get("composite_score", 0),
                "clip_type": (m.get("llm") or {}).get("clip_type", "none"),
                "speaker": (m.get("llm") or {}).get("speaker"),
            })

    print(f"\n  Tier 2 complete:")
    print(f"    Batches: {success_count} succeeded, {total_batches - success_count} fell back to Tier 1")
    print(f"    High value (7+): {high_value}")
    print(f"    Soundbites: {soundbites} | Full speeches: {full_speeches} | Archive: {archive}")
    print(f"    Topics indexed: {len(topic_index)}")
    top_topics = sorted(topic_index.items(), key=lambda x: len(x[1]), reverse=True)[:10]
    for topic, mentions in top_topics:
        print(f"      {topic}: {len(mentions)} mentions")

    # Return as a wrapper with topic index
    class EnhancedResults(list):
        """List subclass that carries topic_index metadata."""
        pass

    result = EnhancedResults(enhanced)
    result._topic_index = topic_index
    return result


def find_mediasite_url(moderngov_url):
    """Extract Mediasite webcast URL from a ModernGov meeting page."""
    try:
        import requests
        resp = requests.get(moderngov_url, timeout=30)
        resp.raise_for_status()
        # Look for Mediasite player URLs
        patterns = [
            r'(https?://[^"\']*mediasite[^"\']*Play[^"\']*)',
            r'(https?://[^"\']*mediasite[^"\']*Player[^"\']*)',
            r'(https?://[^"\']*auditel[^"\']*Player[^"\']*)',
        ]
        for pattern in patterns:
            match = re.search(pattern, resp.text, re.IGNORECASE)
            if match:
                url = match.group(1)
                # Extract presentation ID and build direct Play URL
                pres_match = re.search(r'presID=([a-f0-9-]+)', url)
                if pres_match:
                    pres_id = pres_match.group(1)
                    # Try to find the Mediasite server from the URL
                    server_match = re.search(r'(https?://[^/]+)', url)
                    if server_match:
                        return f"https://auditelsystems.mediasite.com/Mediasite/Play/{pres_id}"
                return url
        print(f"  No webcast URL found on page")
        return None
    except Exception as e:
        print(f"  Error fetching ModernGov page: {e}")
        return None


def download_video(url, output_path):
    """Download video from Mediasite using yt-dlp."""
    print(f"  Downloading from: {url}")
    cmd = [
        "yt-dlp",
        url,
        "-o", str(output_path),
        "--no-check-certificates",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
    if result.returncode != 0:
        print(f"  yt-dlp error: {result.stderr[-500:]}")
        return False
    return True


def denoise_audio(video_path, output_dir):
    """Isolate vocals from background noise using Demucs.

    Extracts audio, runs Demucs vocal separation, returns path to clean vocals.
    For noisy recordings: outdoor speeches, events with music, crowd noise.
    Council chamber audio is usually clean enough to skip this step.
    """
    print(f"  Extracting audio for denoising...")
    audio_tmp = os.path.join(output_dir, "audio_raw.wav")

    # Extract audio as WAV (Demucs needs WAV input)
    cmd = [FFMPEG, "-y", "-i", str(video_path),
           "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
           audio_tmp]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        print(f"  Audio extraction failed: {result.stderr[-200:]}")
        return None

    print(f"  Running Demucs vocal isolation (this may take a while)...")
    # Use htdemucs_ft for best quality, two-stems for speed (vocals vs other)
    cmd = [
        sys.executable, "-m", "demucs",
        "--two-stems=vocals",
        "-n", "htdemucs",
        "--out", output_dir,
        audio_tmp,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
    if result.returncode != 0:
        print(f"  Demucs failed: {result.stderr[-300:]}")
        # Try simpler model as fallback
        print(f"  Trying mdx_extra model...")
        cmd[cmd.index("htdemucs")] = "mdx_extra"
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        if result.returncode != 0:
            print(f"  Demucs fallback also failed: {result.stderr[-200:]}")
            return None

    # Find the vocals output
    # Demucs outputs to: output_dir/htdemucs/audio_raw/vocals.wav
    vocals_candidates = [
        os.path.join(output_dir, "htdemucs", "audio_raw", "vocals.wav"),
        os.path.join(output_dir, "mdx_extra", "audio_raw", "vocals.wav"),
    ]
    for vocals_path in vocals_candidates:
        if os.path.exists(vocals_path):
            size_mb = os.path.getsize(vocals_path) / (1024 * 1024)
            print(f"  Vocal isolation complete: {size_mb:.1f}MB")
            return vocals_path

    print(f"  Could not find Demucs vocal output")
    return None


def post_process_transcript(segments, batch_size=20):
    """Post-process transcript: add punctuation, capitalisation, proper nouns.

    Uses simple rule-based fixes for common patterns, then optionally
    LLM for harder cases. Runs after transcription, before flagging.
    """
    # Common council proper nouns that Whisper lowercases
    PROPER_NOUNS = {
        "lancashire": "Lancashire", "preston": "Preston", "burnley": "Burnley",
        "blackpool": "Blackpool", "blackburn": "Blackburn", "pendle": "Pendle",
        "hyndburn": "Hyndburn", "rossendale": "Rossendale", "lancaster": "Lancaster",
        "chorley": "Chorley", "wyre": "Wyre", "fylde": "Fylde",
        "ribble valley": "Ribble Valley", "south ribble": "South Ribble",
        "west lancashire": "West Lancashire",
        "reform": "Reform", "reform uk": "Reform UK",
        "conservative": "Conservative", "labour": "Labour",
        "liberal democrat": "Liberal Democrat", "green party": "Green Party",
        "county hall": "County Hall", "county council": "County Council",
        "full council": "Full Council", "cabinet": "Cabinet",
        "mr chairman": "Mr Chairman", "mr chair": "Mr Chair",
        "standing order": "Standing Order",
        "vawg": "VAWG", "vogue": "VAWG",  # Common Whisper mishearing
        "send": "SEND", "ehcp": "EHCP", "ofsted": "Ofsted",
        "nhs": "NHS", "pcc": "PCC", "foi": "FOI",
        "mtfs": "MTFS", "gdp": "GDP",
        "baroness casey": "Baroness Casey",
        "angela rayner": "Angela Rayner",
    }

    # Whisper councillor name misspellings → correct spelling
    # Built from LCC councillors.json cross-referenced with transcript output
    NAME_CORRECTIONS = {
        # Murphy variants
        "Murphyn": "Murphy", "Murphey": "Murphy", "Murfing": "Murphy",
        "Murphyn's": "Murphy's",
        # Riggott variants
        "Riggit": "Riggott", "Rigat": "Riggott", "Rigert": "Riggott",
        "Rigger": "Riggott",
        # Whalley variants
        "Wally": "Whalley", "Walley": "Whalley",
        # Whipp variants
        "Wiggins": "Whipp", "Wip": "Whipp", "Whip": "Whipp", "Witt": "Whipp",
        # Matchett variants
        "Matchup": "Matchett", "Machit": "Matchett",
        # Kutavicius variants
        "Catevesius": "Kutavicius",
        # Dowding variants
        "Dodin": "Dowding", "Doudin": "Dowding", "Dowden": "Dowding",
        # Lavalette variants
        "Lewik": "Lavalette", "Lavellert": "Lavalette",
        # Ali variants
        "Allian": "Ali", "Alley": "Ali",
        # Kniveton variants
        "Niverton": "Kniveton",
        # Ritson variants
        "Ritzen": "Ritson",
        # Razakazi variants
        "Razzicchazi": "Razakazi",
        # Joynes variants
        "Joins": "Joynes",
        # Barnes variants
        "Barns": "Barnes",
        # Topp variants
        "Top": "Topp",
        # Salter variants
        "Solter": "Salter", "Souter": "Salter",
        # Motala variants
        "Matala": "Motala",
        # de Freitas variants
        "DeFrates": "de Freitas", "De Frates": "de Freitas",
        # Mirfin variants
        "Murfin": "Mirfin",
        # Thomson variants
        "Thompson": "Thomson",
        # Howarth variants
        "Howard": "Howarth",
        # Additional Whisper misspellings found in v2 audit
        "Riggert": "Riggott", "Rigott": "Riggott", "Wrigat": "Riggott",
        "Riga": "Riggott",
        "Wipp": "Whipp",
        "Bolchin": "Balchin",
        "Cotton": "Cottam",
        "Artkinson": "Atkinson",
        "Goldworthy": "Goldsworthy",
        "Defrates": "de Freitas",
        "Cabalette": "Lavalette",
        "Asgar": "Asghar",
        "Arref": "Arif",
        "Jewel": "Jewell",
        "Bolton": "Poulton",
        "Whitton": "Whipp",  # Another Whipp variant
        "Dowling": "Dowding",
        "Snor": "Snow",  # Snow truncated
        "Brougham": "Brown",  # Likely Matthew Brown
        "Mccollum": "McCollum",
    }

    # Words that Whisper falsely matches after "Councillor" — not real names
    # Be conservative: only filter obvious non-name words.
    # First names (Maria, Lorenzo, Marion, Stephen, Alice, Samara) ARE valid —
    # chairman uses them to distinguish councillors with same surname
    # (Stephen Atkinson vs Marion Atkinson, Alice Jones vs Maria Jones)
    NOT_NAMES = {
        "and", "as", "believe", "from", "made", "thank", "um", "well",
        "yeah", "dual", "councillor", "scho",
    }

    # First names used by chairman to distinguish same-surname councillors
    # These are unrelated councillors who happen to share a surname.
    # Expand to full name for clarity in transcript.
    FIRST_NAME_MAP = {
        "Stephen": "Stephen Atkinson",   # vs Marion Atkinson
        "Marion": "Marion Atkinson",     # vs Stephen Atkinson
        "Alice": "Alice Jones",          # vs Maria Jones
        "Maria": "Maria Jones",          # vs Alice Jones
        "Lorenzo": "Lorenzo More",       # vs Brian Moore
        "Brian": "Brian Moore",          # vs Lorenzo More
        "Samara": "Samara Barnes",
        "Smara": "Samara Barnes",        # Whisper mishearing of Samara
    }

    # Councillor name fixes — surname capitalisation
    COUNCILLOR_PATTERN = re.compile(
        r'\b(councillor|cllr|county councillor)\s+([A-Za-z][a-z]+)', re.IGNORECASE
    )

    for seg in segments:
        text = seg["text"]

        # 1. Capitalise first letter of each segment
        if text and text[0].islower():
            text = text[0].upper() + text[1:]

        # 2. Fix proper nouns (case-insensitive replace, longest first)
        for lower, proper in sorted(PROPER_NOUNS.items(), key=lambda x: -len(x[0])):
            pattern = re.compile(re.escape(lower), re.IGNORECASE)
            text = pattern.sub(proper, text)

        # 3. Fix councillor name misspellings and capitalise
        def fix_councillor_name(m):
            title = m.group(1)
            name = m.group(2)
            # Filter out false matches (common words after "Councillor")
            if name.lower() in NOT_NAMES:
                return m.group(0)  # Return unchanged
            # Normalise title
            if title.lower() in ("cllr", "county councillor"):
                title = "Councillor"
            else:
                title = title.capitalize()
            name = name.capitalize()
            # Apply name corrections (misspellings)
            if name in NAME_CORRECTIONS:
                name = NAME_CORRECTIONS[name]
            # Expand first names to full names (for same-surname councillors)
            if name in FIRST_NAME_MAP:
                name = FIRST_NAME_MAP[name]
            return f"{title} {name}"
        text = COUNCILLOR_PATTERN.sub(fix_councillor_name, text)

        # 4. Basic sentence punctuation
        # Add period at end if missing
        if text and text[-1] not in '.!?':
            text = text + '.'

        # 5. Capitalise after sentence-ending punctuation
        text = re.sub(r'([.!?])\s+([a-z])', lambda m: m.group(1) + ' ' + m.group(2).upper(), text)

        # 6. Fix common Whisper artifacts
        text = re.sub(r'\bum\b', '', text)  # Remove filler "um"
        text = re.sub(r'\buh\b', '', text)  # Remove filler "uh"
        text = re.sub(r'\s{2,}', ' ', text)  # Collapse double spaces
        text = text.strip()

        seg["text"] = text

    return segments


def ocr_speaker_detection(video_path, interval=3, councillors_json=None):
    """Detect speaker names from on-screen overlay via OCR.

    Mediasite webcasts display "Cllr [Name]" on a white bar at the bottom
    of the video frame when a councillor's microphone is active.
    Video is 960x540, name bar at approximately y=310, height ~50px.

    Samples one frame every `interval` seconds, OCRs just the name strip,
    and returns a timeline of speaker changes.

    Args:
        video_path: Path to video file
        interval: Seconds between OCR samples (default 3)
        councillors_json: Optional path to councillors.json for name matching

    Returns:
        list of {timestamp: float, speaker: str, confidence: str}
    """
    import tempfile
    try:
        import pytesseract
    except ImportError:
        os.system("pip3 install pytesseract 2>/dev/null")
        import pytesseract
    from PIL import Image

    # Load councillor surnames for fuzzy matching
    known_surnames = set()
    if councillors_json and os.path.exists(councillors_json):
        with open(councillors_json) as f:
            data = json.load(f)
        clist = data if isinstance(data, list) else data.get('councillors', [])
        for c in clist:
            name = c.get('name', '')
            # Extract surname (last word, handling prefixes)
            name = re.sub(r'^(County Councillor|Councillor|Cllr|Prof\.|Dr |Mr |Mrs |Ms )', '', name).strip()
            name = name.replace(' OBE', '').replace(' MBE', '').replace(' JP', '')
            parts = name.split()
            if parts:
                known_surnames.add(parts[-1])

    # Get video duration
    result = subprocess.run(
        [FFPROBE, "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(video_path)],
        capture_output=True, text=True, timeout=10
    )
    duration = float(result.stdout.strip()) if result.stdout.strip() else 0
    if duration <= 0:
        print("  OCR: Could not determine video duration")
        return []

    print(f"  OCR speaker detection: {duration:.0f}s video, sampling every {interval}s...")

    # Extract frames of just the name bar region
    tmpdir = tempfile.mkdtemp(prefix="ocr_frames_")
    total_samples = int(duration / interval)

    # Extract name strip frames in batch (much faster than one-by-one)
    # Video is 960x540. The councillor name text sits at y≈335, height≈35
    # Crop wide (700px) to catch long names like "Cllr Stephen Atkinson"
    cmd = [
        FFMPEG, "-y",
        "-i", str(video_path),
        "-vf", f"fps=1/{interval},crop=700:40:0:330",
        "-q:v", "2",
        os.path.join(tmpdir, "name_%06d.jpg"),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        print(f"  OCR: Frame extraction failed: {result.stderr[-200:]}")
        import shutil
        shutil.rmtree(tmpdir, ignore_errors=True)
        return []

    # OCR each frame
    speaker_timeline = []
    current_speaker = None
    # "Cllr" with common OCR misreads: Clir, Cir, C1lr, SC|ir, |ir, etc.
    # Also match just capitalized names after any "lr/ir" prefix
    cllr_pattern = re.compile(
        r'(?:S?C?\s*[|lIi1]{1,3}r|C[li1I]{1,2}r)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z\'-]+)+)',
        re.IGNORECASE
    )

    frame_files = sorted(Path(tmpdir).glob("name_*.jpg"))
    ocr_hits = 0

    for i, frame_path in enumerate(frame_files):
        timestamp = i * interval

        try:
            img = Image.open(frame_path)
            # Preprocess: grayscale → threshold → clean black text on white
            gray = img.convert("L")
            bw = gray.point(lambda x: 255 if x > 140 else 0)
            # OCR with single line mode
            text = pytesseract.image_to_string(
                bw, config='--psm 7'
            ).strip()

            if not text or len(text) < 4:
                continue

            # Look for "Cllr [Name]" pattern
            match = cllr_pattern.search(text)
            if match:
                name = match.group(1).strip()
                # Clean up OCR artifacts
                name = re.sub(r'[^A-Za-z\s\'-]', '', name).strip()

                if not name or len(name) < 3:
                    continue

                # Strip honours suffixes
                name = re.sub(r'\s+(OBE|MBE|CBE|JP|DL)\b', '', name, flags=re.IGNORECASE).strip()

                # Extract surname (last word)
                parts = name.split()
                surname = parts[-1] if parts else name

                # Fuzzy match against known councillors
                confidence = "ocr"
                if known_surnames:
                    # Try exact match first
                    if surname in known_surnames:
                        confidence = "ocr_verified"
                    else:
                        # Try close matches (Levenshtein distance 1)
                        for known in known_surnames:
                            if len(known) > 3 and len(surname) > 3:
                                if known.lower()[:3] == surname.lower()[:3]:
                                    surname = known  # Use the known spelling
                                    confidence = "ocr_fuzzy"
                                    break

                if surname != current_speaker:
                    speaker_timeline.append({
                        "timestamp": timestamp,
                        "speaker": surname,
                        "full_name": name,
                        "confidence": confidence,
                        "source": "ocr",
                    })
                    current_speaker = surname
                    ocr_hits += 1

        except Exception:
            continue

    # Cleanup
    import shutil
    shutil.rmtree(tmpdir, ignore_errors=True)

    verified = sum(1 for s in speaker_timeline if s["confidence"] == "ocr_verified")
    print(f"  OCR complete: {ocr_hits} speaker changes detected "
          f"({verified} verified against councillors.json)")

    return speaker_timeline


def merge_speaker_sources(segments, ocr_timeline, qc_speakers):
    """Merge speaker attributions from multiple sources.

    Sources (in priority order):
    1. OCR overlay (ocr_verified > ocr_fuzzy > ocr)
    2. Chairman announcements (from QC pass)
    3. Whisper inference (lowest confidence)

    Each segment gets: speaker, speaker_confidence, speaker_source
    """
    if not ocr_timeline:
        return segments

    # Build OCR lookup: for each timestamp, who's speaking?
    # OCR timeline is sparse (every 3s) — fill gaps
    ocr_sorted = sorted(ocr_timeline, key=lambda x: x["timestamp"])

    for seg in segments:
        seg_time = seg["start"]

        # Find most recent OCR detection before this segment
        ocr_speaker = None
        ocr_confidence = None
        for ocr in reversed(ocr_sorted):
            if ocr["timestamp"] <= seg_time + 5:  # Allow 5s lag for camera
                ocr_speaker = ocr["speaker"]
                ocr_confidence = ocr["confidence"]
                break

        # Merge: OCR takes priority over existing speaker if higher confidence
        existing_speaker = seg.get("speaker")
        existing_source = seg.get("speaker_source", "whisper")

        if ocr_speaker:
            confidence_rank = {"ocr_verified": 3, "ocr_fuzzy": 2, "ocr": 1,
                             "chairman": 2, "whisper": 0}
            ocr_rank = confidence_rank.get(ocr_confidence, 1)
            existing_rank = confidence_rank.get(existing_source, 0)

            if ocr_rank >= existing_rank:
                seg["speaker"] = ocr_speaker
                seg["speaker_confidence"] = ocr_confidence
                seg["speaker_source"] = "ocr"
            elif existing_speaker:
                seg["speaker_confidence"] = existing_source
                seg["speaker_source"] = existing_source
        elif existing_speaker:
            seg["speaker_confidence"] = existing_source
            seg["speaker_source"] = existing_source

    attributed = sum(1 for s in segments if s.get("speaker"))
    total = len(segments)
    print(f"  Speaker attribution: {attributed}/{total} segments ({100*attributed/max(total,1):.0f}%)")

    return segments


def detect_adjournments(video_path, min_silence_secs=120, noise_threshold=-40):
    """Detect adjournment breaks in meeting recordings.

    Uses ffmpeg silencedetect to find periods of silence >2 minutes,
    which correspond to adjournment screens in council webcasts.
    Returns list of (start, end) tuples for the ACTIVE sections.
    """
    print(f"  Detecting adjournments (silence >{min_silence_secs}s, threshold {noise_threshold}dB)...")

    cmd = [
        FFMPEG, "-i", str(video_path),
        "-af", f"silencedetect=noise={noise_threshold}dB:d={min_silence_secs}",
        "-f", "null", "-"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

    # Parse silence periods from stderr
    silence_starts = []
    silence_ends = []
    for line in result.stderr.split("\n"):
        m = re.search(r"silence_start:\s*([\d.]+)", line)
        if m:
            silence_starts.append(float(m.group(1)))
        m = re.search(r"silence_end:\s*([\d.]+)", line)
        if m:
            silence_ends.append(float(m.group(1)))

    duration = get_video_duration(video_path)

    if not silence_starts:
        print(f"  No adjournments detected")
        return [(0, duration)], []

    # Build active sections (between silences)
    active_sections = []
    adjournments = []
    prev_end = 0

    for i, start in enumerate(silence_starts):
        if start > prev_end + 10:  # At least 10s of content
            active_sections.append((prev_end, start))
        end = silence_ends[i] if i < len(silence_ends) else duration
        adjournments.append((start, end))
        prev_end = end

    # Add final section after last adjournment
    if prev_end < duration - 10:
        active_sections.append((prev_end, duration))

    print(f"  Found {len(adjournments)} adjournment(s):")
    for i, (s, e) in enumerate(adjournments):
        print(f"    Break {i+1}: {format_timestamp(s)} - {format_timestamp(e)} ({(e-s)/60:.1f} min)")
    print(f"  Active sections: {len(active_sections)}")
    for i, (s, e) in enumerate(active_sections):
        print(f"    Section {i+1}: {format_timestamp(s)} - {format_timestamp(e)} ({(e-s)/60:.1f} min)")

    return active_sections, adjournments


def split_video_sections(video_path, sections, output_dir):
    """Split video into sections, skipping adjournments.

    Returns list of section file paths.
    """
    section_paths = []
    for i, (start, end) in enumerate(sections):
        section_path = os.path.join(output_dir, f"section_{i+1:02d}.mkv")
        duration = end - start

        cmd = [
            FFMPEG, "-y",
            "-ss", str(start),
            "-i", str(video_path),
            "-t", str(duration),
            "-c", "copy",  # No re-encoding, fast
            section_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode == 0:
            size_mb = os.path.getsize(section_path) / (1024 * 1024)
            print(f"    Section {i+1}: {format_timestamp(start)}-{format_timestamp(end)} ({size_mb:.0f}MB)")
            section_paths.append({
                "path": section_path,
                "start_offset": start,
                "end": end,
                "index": i + 1,
            })
        else:
            print(f"    Section {i+1} FAILED: {result.stderr[-200:]}")

    return section_paths


def get_video_duration(path):
    """Get video duration in seconds."""
    result = subprocess.run(
        [FFPROBE, "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True
    )
    return float(result.stdout.strip()) if result.stdout.strip() else 0



# Whisper initial_prompt — primes the model with vocabulary it will encounter.
# Dramatically improves proper noun accuracy for councillor names, places,
# political terms, and Lancashire-specific language.
WHISPER_VOCABULARY_PROMPT = (
    "Lancashire County Council Full Council meeting. "
    "Councillor Atkinson, Councillor Salter, Councillor Murphy, "
    "Councillor Riggott, Councillor Whipp, Councillor Whalley, "
    "Councillor Kniveton, Councillor Mirfin, Councillor Kutavicius, "
    "Councillor Dowding, Councillor Lavalette, Councillor Razakazi, "
    "Councillor Barnes, Councillor Buckley, Councillor Roberts, "
    "Councillor Evans, Councillor Potter, Councillor Ali, "
    "Councillor Brown, Councillor Clifford, Councillor de Freitas, "
    "Councillor Goldsworthy, Councillor Matchett, Councillor McCollum, "
    "Councillor Motala, Councillor Pickup, Councillor Ritson, "
    "Councillor Shaw, Councillor Thomson, Councillor Topp, "
    "Mr Chairman, County Hall, Preston, Lancashire, "
    "Reform UK, Conservative, Labour, Liberal Democrat, Green Party, "
    "Progressive Lancashire, Our West Lancashire, "
    "SEND, EHCP, Ofsted, MTFS, VeLTIP, UKMBA, "
    "council tax, Band D, precept, adult social care, "
    "standing order, notice of motion, recorded vote, division, "
    "scrutiny, cabinet, portfolio holder, chief executive, "
    "Burnley, Hyndburn, Pendle, Rossendale, Lancaster, "
    "Ribble Valley, Chorley, South Ribble, Fylde, Wyre, "
    "Blackpool, Blackburn with Darwen, West Lancashire."
)


def transcribe(video_path, model_size="small"):
    """Transcribe video using faster-whisper. Returns list of segments."""
    from faster_whisper import WhisperModel

    print(f"  Loading faster-whisper model '{model_size}' (CPU)...")
    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    duration = get_video_duration(video_path)
    print(f"  Video duration: {duration / 60:.1f} minutes")
    print(f"  Transcribing (with vocabulary hints)...")

    segments_raw, info = model.transcribe(
        str(video_path),
        language="en",
        beam_size=5,
        word_timestamps=True,
        initial_prompt=WHISPER_VOCABULARY_PROMPT,
        vad_filter=True,  # Skip silence
        vad_parameters=dict(
            min_silence_duration_ms=500,
            speech_pad_ms=200,
        ),
    )

    segments = []
    word_count = 0
    for seg in segments_raw:
        words = []
        if seg.words:
            for w in seg.words:
                words.append({
                    "word": w.word.strip(),
                    "start": round(w.start, 2),
                    "end": round(w.end, 2),
                    "probability": round(w.probability, 3),
                })
                word_count += 1

        segment = {
            "start": round(seg.start, 2),
            "end": round(seg.end, 2),
            "text": seg.text.strip(),
            "words": words,
        }
        segments.append(segment)

        # Progress update every 50 segments
        if len(segments) % 50 == 0:
            pct = seg.end / duration * 100 if duration > 0 else 0
            print(f"    {len(segments)} segments, {word_count} words ({pct:.0f}%)")

    print(f"  Done: {len(segments)} segments, {word_count} words")
    print(f"  Language: {info.language} (probability {info.language_probability:.2f})")

    return segments


# ============================================================
# QUALITY CONTROL
# ============================================================

def qc_transcript(segments):
    """Quality control pass on raw transcript segments.

    1. Confidence scoring — flag low-probability segments
    2. Duplicate/echo detection — mark repeated phrases
    3. Speaker detection — parse "Councillor X" announcements
    4. Segment statistics for quality assessment

    Returns (cleaned_segments, qc_report).
    """
    qc = {
        "total_segments": len(segments),
        "total_words": 0,
        "low_confidence_segments": 0,
        "low_confidence_threshold": 0.7,
        "duplicates_removed": 0,
        "speakers_detected": [],
        "avg_confidence": 0,
        "confidence_histogram": {
            "0.0-0.5": 0, "0.5-0.7": 0, "0.7-0.9": 0, "0.9-1.0": 0,
        },
    }

    # --- Pass 1: Confidence scoring ---
    all_probs = []
    for seg in segments:
        words = seg.get("words", [])
        if words:
            probs = [w.get("probability", 1.0) for w in words]
            avg_prob = sum(probs) / len(probs)
            seg["confidence"] = round(avg_prob, 3)
            all_probs.append(avg_prob)
            qc["total_words"] += len(words)

            if avg_prob < 0.5:
                qc["confidence_histogram"]["0.0-0.5"] += 1
            elif avg_prob < 0.7:
                qc["confidence_histogram"]["0.5-0.7"] += 1
            elif avg_prob < 0.9:
                qc["confidence_histogram"]["0.7-0.9"] += 1
            else:
                qc["confidence_histogram"]["0.9-1.0"] += 1

            if avg_prob < qc["low_confidence_threshold"]:
                seg["low_confidence"] = True
                qc["low_confidence_segments"] += 1
        else:
            seg["confidence"] = None

    if all_probs:
        qc["avg_confidence"] = round(sum(all_probs) / len(all_probs), 3)

    # --- Pass 2: Duplicate/echo detection ---
    # Council chamber audio can echo or someone might repeat themselves.
    # Flag segments with >80% word overlap within 30 seconds.
    seen_texts = []
    cleaned = []
    for seg in segments:
        text_lower = seg["text"].lower().strip()
        # Skip very short segments (< 3 words)
        if len(text_lower.split()) < 3:
            cleaned.append(seg)
            continue

        is_dup = False
        for prev_text, prev_time in seen_texts:
            if abs(seg["start"] - prev_time) > 30:
                continue
            # Simple overlap: check if >80% of words match
            words_a = set(text_lower.split())
            words_b = set(prev_text.split())
            if not words_a or not words_b:
                continue
            overlap = len(words_a & words_b) / max(len(words_a), len(words_b))
            if overlap > 0.8:
                is_dup = True
                seg["duplicate"] = True
                qc["duplicates_removed"] += 1
                break

        seen_texts.append((text_lower, seg["start"]))
        if not is_dup:
            cleaned.append(seg)

    # --- Pass 3: Speaker detection ---
    # Parse "Councillor X" / "Cllr X" announcements from chairman
    speaker_pattern = re.compile(
        r"(?:councillor|cllr|council)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
        re.IGNORECASE
    )
    current_speaker = None
    speakers_seen = set()

    for seg in cleaned:
        text = seg["text"]
        # Check for speaker announcement (usually short: "Councillor Pickup")
        match = speaker_pattern.search(text)
        if match:
            name = match.group(1).strip()
            # Short segments with just a name = chairman announcing speaker
            if len(text.split()) <= 6:
                current_speaker = name
                seg["speaker_announcement"] = True
            else:
                # Longer segment that mentions a councillor — they might be speaking
                # or referring to someone
                if current_speaker is None:
                    current_speaker = name
            speakers_seen.add(name)

        if current_speaker:
            seg["speaker"] = current_speaker

        # Reset speaker on long pauses (>10s gap between segments)
        idx = cleaned.index(seg)
        if idx > 0:
            gap = seg["start"] - cleaned[idx - 1]["end"]
            if gap > 10:
                current_speaker = None

    qc["speakers_detected"] = sorted(list(speakers_seen))
    qc["unique_speakers"] = len(speakers_seen)

    # --- Pass 4: Quality grade ---
    if qc["avg_confidence"] >= 0.9:
        qc["grade"] = "A"
        qc["grade_desc"] = "Excellent — high confidence throughout"
    elif qc["avg_confidence"] >= 0.8:
        qc["grade"] = "B"
        qc["grade_desc"] = "Good — mostly reliable, some uncertain passages"
    elif qc["avg_confidence"] >= 0.7:
        qc["grade"] = "C"
        qc["grade_desc"] = "Fair — review low-confidence segments before quoting"
    elif qc["avg_confidence"] >= 0.5:
        qc["grade"] = "D"
        qc["grade_desc"] = "Poor — noisy audio, many uncertain segments"
    else:
        qc["grade"] = "F"
        qc["grade_desc"] = "Unreliable — consider re-recording or denoising"

    pct_low = (qc["low_confidence_segments"] / max(len(segments), 1)) * 100
    print(f"  QC Results:")
    print(f"    Grade: {qc['grade']} ({qc['grade_desc']})")
    print(f"    Avg confidence: {qc['avg_confidence']:.1%}")
    print(f"    Low confidence: {qc['low_confidence_segments']} segments ({pct_low:.1f}%)")
    print(f"    Duplicates removed: {qc['duplicates_removed']}")
    print(f"    Speakers detected: {qc['unique_speakers']} ({', '.join(qc['speakers_detected'][:10])}{'...' if len(qc['speakers_detected']) > 10 else ''})")

    return cleaned, qc


def is_roll_call(text, recent_segments):
    """Detect if this segment is part of a roll call.

    Roll calls are lists of "Councillor X. For/Against/Abstain."
    They're only useful if a division was called (named vote).
    The minutes are the definitive source for votes — transcript audio
    is unreliable (people shout without mics).

    Returns True if this looks like a roll call segment.
    """
    # If it's just a councillor name + for/against, it's a roll call
    text_stripped = text.strip().rstrip('.')
    if re.match(r'^Councillor \w+\.?\s*(For|Against|Abstain)?\.?$', text_stripped, re.IGNORECASE):
        return True
    # Multiple councillor names in sequence = roll call
    name_count = len(re.findall(r'Councillor \w+', text, re.IGNORECASE))
    words = text.split()
    if name_count >= 3 and name_count >= len(words) / 4:
        return True
    return False


def is_procedural(text):
    """Check if text is procedural/routine (should be demoted or skipped)."""
    for pattern in PROCEDURAL_PATTERNS:
        if pattern.search(text):
            return True
    return False


def flag_keywords(segments):
    """Tier 1: Flag segments containing politically relevant keywords.

    Applies procedural filtering to suppress noise from routine items.
    Roll calls are demoted (minutes are the definitive vote source).
    Returns scored, categorised flagged moments. Merges adjacent flagged
    segments into continuous moments for better context.
    """
    flagged = []
    for i, seg in enumerate(segments):
        text = seg["text"]

        # Skip roll call segments entirely — minutes are the vote source
        recent = segments[max(0, i-5):i]
        if is_roll_call(text, recent):
            continue

        matches = {}
        tier1_score = 0

        for category, patterns in KEYWORD_PATTERNS.items():
            for pattern in patterns:
                if pattern.search(text):
                    if category not in matches:
                        matches[category] = []
                    matches[category].append(pattern.pattern)
                    tier1_score += CATEGORY_WEIGHTS.get(category, 1)

        if matches:
            # Demote procedural segments (halve score)
            if is_procedural(text):
                tier1_score = max(1, tier1_score // 2)

            # BOOST: Specific financial figures mentioned (more newsworthy)
            figures_found = FIGURE_PATTERN.findall(text)
            if figures_found:
                tier1_score += min(len(figures_found) * 2, 4)  # +2 per figure, max +4

            # BOOST: Longer substantive segments (speeches > fragments)
            word_count = len(text.split())
            if word_count >= 30:
                tier1_score += 2  # Sustained speech
            elif word_count >= 15:
                tier1_score += 1  # Medium segment

            # BOOST: Speaker identified (more usable as clip)
            if seg.get("speaker"):
                tier1_score += 1
                if seg.get("speaker_confidence") == "ocr_verified":
                    tier1_score += 1  # Extra for verified speakers

            # Only flag if score meets minimum threshold
            if tier1_score >= 2:
                flagged.append({
                    "start": seg["start"],
                    "end": seg["end"],
                    "text": seg["text"],
                    "categories": matches,
                    "tier1_score": min(tier1_score, 10),  # Cap at 10
                    "section": seg.get("section"),
                    "words": seg.get("words", []),
                    "speaker": seg.get("speaker"),
                    "speaker_confidence": seg.get("speaker_confidence"),
                    "speaker_source": seg.get("speaker_source"),
                    "has_figures": bool(figures_found),
                })

    # Merge adjacent flagged segments (within 5 seconds) for better context
    merged = []
    for moment in flagged:
        if merged and moment["start"] - merged[-1]["end"] < 5:
            # Merge into previous
            prev = merged[-1]
            prev["end"] = moment["end"]
            prev["text"] += " " + moment["text"]
            for cat, kws in moment["categories"].items():
                if cat not in prev["categories"]:
                    prev["categories"][cat] = []
                prev["categories"][cat].extend(kws)
            prev["tier1_score"] = min(prev["tier1_score"] + moment["tier1_score"], 10)
            prev["words"].extend(moment.get("words", []))
        else:
            merged.append(moment)

    return merged


def format_timestamp(seconds):
    """Format seconds as HH:MM:SS."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def extract_clip(video_path, start, end, output_path, padding=3):
    """Extract a video clip with padding."""
    clip_start = max(0, start - padding)
    clip_duration = (end - start) + (padding * 2)

    cmd = [
        FFMPEG, "-y",
        "-ss", str(clip_start),
        "-i", str(video_path),
        "-t", str(clip_duration),
        "-c:v", "libx264",
        "-c:a", "aac",
        "-preset", "fast",
        "-crf", "23",
        "-movflags", "+faststart",
        str(output_path)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    return result.returncode == 0


def _write_moment(f, moment):
    """Write a single flagged moment to the text output file."""
    ts = format_timestamp(moment["start"])
    score = moment.get("composite_score", moment.get("tier1_score", 0))
    cats = ", ".join(moment.get("categories", {}).keys())
    llm = moment.get("llm") or {}

    f.write(f"[{ts}] SCORE: {score}/10 [{cats}]\n")

    if llm:
        clip_type = llm.get("clip_type", "none")
        speaker = llm.get("speaker", "?")
        topics = ", ".join(llm.get("topics", []))

        f.write(f"  {llm.get('category', '?')} | "
                f"Quotability: {llm.get('quotability', '?')}/10 | "
                f"News: {llm.get('news_value', '?')}/10 | "
                f"Electoral: {llm.get('electoral_value', '?')}/10\n")
        if speaker and speaker != "?":
            f.write(f"  Speaker: {speaker}\n")
        if topics:
            f.write(f"  Topics: {topics}\n")
        if llm.get("summary"):
            f.write(f"  Summary: {llm['summary']}\n")

    f.write(f"  \"{moment['text'][:300]}\"\n\n")


def save_outputs(segments, flagged, output_dir, video_path=None, do_clip=False):
    """Save transcript outputs: JSON, plain text, flagged moments, clips."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # 1. Full timestamped JSON
    json_path = output_dir / "transcript.json"
    with open(json_path, "w") as f:
        json.dump({
            "created": datetime.now().isoformat(),
            "segments": segments,
            "total_segments": len(segments),
            "total_words": sum(len(s.get("words", [])) for s in segments),
            "duration_seconds": segments[-1]["end"] if segments else 0,
        }, f, indent=2)
    print(f"  Saved: {json_path}")

    # 2. Plain text transcript
    txt_path = output_dir / "transcript.txt"
    with open(txt_path, "w") as f:
        for seg in segments:
            ts = format_timestamp(seg["start"])
            f.write(f"[{ts}] {seg['text']}\n")
    print(f"  Saved: {txt_path}")

    # 3. Flagged moments
    if flagged:
        flagged_path = output_dir / "flagged_moments.json"
        # Clean flagged for JSON serialisation (remove word-level data to save space)
        flagged_clean = []
        for m in flagged:
            clean = {k: v for k, v in m.items() if k != "words"}
            flagged_clean.append(clean)
        with open(flagged_path, "w") as f:
            json.dump(flagged_clean, f, indent=2)
        print(f"  Saved: {flagged_path} ({len(flagged)} moments)")

        # Topic index
        topic_index = getattr(flagged, '_topic_index', None)
        if topic_index:
            topic_path = output_dir / "topic_index.json"
            with open(topic_path, "w") as f:
                json.dump(topic_index, f, indent=2)
            print(f"  Saved: {topic_path} ({len(topic_index)} topics)")

        # Human-readable flagged list — three sections
        flagged_txt = output_dir / "flagged_moments.txt"
        with open(flagged_txt, "w") as f:
            f.write("POLITICALLY RELEVANT MOMENTS\n")
            f.write("Sorted by composite score (highest first)\n")
            f.write("=" * 70 + "\n\n")

            # Section 1: Soundbites (auto-clip ready)
            soundbites = [m for m in flagged if (m.get("llm") or {}).get("clip_type") == "soundbite"]
            if soundbites:
                f.write(f"{'='*70}\n")
                f.write(f"SOUNDBITES — Auto-clip ready ({len(soundbites)})\n")
                f.write(f"{'='*70}\n\n")
                for moment in soundbites:
                    _write_moment(f, moment)

            # Section 2: Full speeches (index only, extract on request)
            speeches = [m for m in flagged if (m.get("llm") or {}).get("clip_type") == "full_speech"]
            if speeches:
                f.write(f"\n{'='*70}\n")
                f.write(f"FULL SPEECHES — Extract on request ({len(speeches)})\n")
                f.write(f"{'='*70}\n\n")
                for moment in speeches:
                    _write_moment(f, moment)

            # Section 3: Archive (searchable, not standalone clips)
            archive = [m for m in flagged if (m.get("llm") or {}).get("clip_type") == "archive"]
            if archive:
                f.write(f"\n{'='*70}\n")
                f.write(f"ARCHIVE — Searchable reference ({len(archive)})\n")
                f.write(f"{'='*70}\n\n")
                for moment in archive:
                    _write_moment(f, moment)

            # Section 4: Unanalysed (Tier 1 only — LLM failed)
            unanalysed = [m for m in flagged if not m.get("llm")]
            if unanalysed:
                f.write(f"\n{'='*70}\n")
                f.write(f"TIER 1 ONLY — LLM analysis failed ({len(unanalysed)})\n")
                f.write(f"{'='*70}\n\n")
                for moment in unanalysed:
                    _write_moment(f, moment)

            # Topic index summary
            if topic_index:
                f.write(f"\n{'='*70}\n")
                f.write(f"TOPIC INDEX\n")
                f.write(f"{'='*70}\n\n")
                for topic, mentions in sorted(topic_index.items(), key=lambda x: -len(x[1])):
                    timestamps = ", ".join(m["timestamp"] for m in mentions[:5])
                    extra = f" (+{len(mentions)-5} more)" if len(mentions) > 5 else ""
                    f.write(f"  {topic} ({len(mentions)}): {timestamps}{extra}\n")

        print(f"  Saved: {flagged_txt}")

    # 4. Auto-clip flagged moments
    if do_clip and video_path and flagged:
        clips_dir = output_dir / "clips"
        clips_dir.mkdir(exist_ok=True)
        print(f"\n  Extracting {len(flagged)} clips...")
        for i, moment in enumerate(flagged):
            clip_name = f"clip_{i:03d}_{format_timestamp(moment['start']).replace(':', '')}.mp4"
            clip_path = clips_dir / clip_name
            success = extract_clip(video_path, moment["start"], moment["end"], clip_path)
            if success:
                print(f"    {clip_name}: [{format_timestamp(moment['start'])}] {moment['keywords']}")
            else:
                print(f"    FAILED: {clip_name}")


def main():
    parser = argparse.ArgumentParser(
        description="Download and transcribe council meeting webcasts"
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--url", help="Mediasite Play URL")
    source.add_argument("--meeting", help="ModernGov meeting page URL")
    source.add_argument("--file", help="Local video file path")

    parser.add_argument("--model", default="medium",
                        choices=["tiny", "base", "small", "medium", "large-v3"],
                        help="Whisper model size (default: medium)")
    parser.add_argument("--clip", action="store_true",
                        help="Auto-extract clips of flagged moments")
    parser.add_argument("--denoise", action="store_true",
                        help="Isolate vocals from background noise before transcribing (Demucs)")
    parser.add_argument("--output", help="Output directory (default: /opt/transcripts/MEETING_ID)")
    parser.add_argument("--keep-video", action="store_true",
                        help="Keep downloaded video after transcription")
    parser.add_argument("--no-llm", action="store_true",
                        help="Skip Tier 2 LLM analysis (keyword flagging only)")
    parser.add_argument("--council", default="lancashire_cc",
                        help="Council ID for political context (default: lancashire_cc)")

    args = parser.parse_args()

    # Resolve video source
    video_path = None
    meeting_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    cleanup_video = False

    if args.file:
        video_path = Path(args.file)
        if not video_path.exists():
            print(f"File not found: {video_path}")
            sys.exit(1)
        meeting_id = video_path.stem
        print(f"\nTranscribing local file: {video_path}")

    else:
        # Get Mediasite URL
        mediasite_url = args.url
        if args.meeting:
            print(f"\nFinding webcast URL from ModernGov...")
            mediasite_url = find_mediasite_url(args.meeting)
            if not mediasite_url:
                print("Could not find webcast URL on the meeting page.")
                sys.exit(1)
            print(f"  Found: {mediasite_url}")

        # Extract meeting ID from URL
        pres_match = re.search(r'Play/([a-f0-9-]+)', mediasite_url)
        if pres_match:
            meeting_id = pres_match.group(1)[:12]

        # Download
        print(f"\nStep 1: Downloading meeting recording...")
        video_path = Path(tempfile.mktemp(suffix=".mkv", prefix="meeting_"))
        if not download_video(mediasite_url, video_path):
            print("Download failed!")
            sys.exit(1)
        cleanup_video = not args.keep_video

        size_mb = video_path.stat().st_size / (1024 * 1024)
        print(f"  Downloaded: {size_mb:.0f}MB")

    # Set output directory
    output_dir = Path(args.output) if args.output else OUTPUT_DIR / meeting_id

    # Detect adjournments and split into sections
    duration = get_video_duration(video_path)
    all_segments = []
    section_info = []

    if duration > 600:  # Only split videos longer than 10 minutes
        print(f"\nStep 1b: Detecting adjournments...")
        active_sections, adjournments = detect_adjournments(video_path)

        if len(active_sections) > 1:
            print(f"\nStep 1c: Splitting into {len(active_sections)} sections...")
            sections_dir = str(output_dir / "sections")
            os.makedirs(sections_dir, exist_ok=True)
            section_paths = split_video_sections(video_path, active_sections, sections_dir)

            # Transcribe each section
            for sec in section_paths:
                sec_input = sec["path"]

                # Denoise section if requested
                if args.denoise:
                    print(f"\n  Denoising section {sec['index']}...")
                    denoise_dir = str(output_dir / f"denoise_s{sec['index']:02d}")
                    os.makedirs(denoise_dir, exist_ok=True)
                    vocals = denoise_audio(sec_input, denoise_dir)
                    if vocals:
                        sec_input = vocals

                print(f"\nStep 2: Transcribing section {sec['index']} ({args.model})...")
                sec_segments = transcribe(sec_input, model_size=args.model)

                # Adjust timestamps to original video timeline
                offset = sec["start_offset"]
                for seg in sec_segments:
                    seg["start"] = round(seg["start"] + offset, 2)
                    seg["end"] = round(seg["end"] + offset, 2)
                    seg["section"] = sec["index"]
                    if seg.get("words"):
                        for w in seg["words"]:
                            w["start"] = round(w["start"] + offset, 2)
                            w["end"] = round(w["end"] + offset, 2)

                all_segments.extend(sec_segments)
                section_info.append({
                    "index": sec["index"],
                    "start": sec["start_offset"],
                    "end": sec["end"],
                    "segments": len(sec_segments),
                })

            # Clean up section video files (keep transcripts, delete videos)
            for sec in section_paths:
                if os.path.exists(sec["path"]):
                    os.unlink(sec["path"])
            # Clean up sections dir if empty
            try:
                os.rmdir(sections_dir)
            except OSError:
                pass

        else:
            # No adjournments or single section — transcribe whole thing
            transcribe_input = str(video_path)
            if args.denoise:
                print(f"\nStep 1b: Denoising audio...")
                denoise_dir = str(output_dir / "denoise")
                os.makedirs(denoise_dir, exist_ok=True)
                vocals = denoise_audio(video_path, denoise_dir)
                if vocals:
                    transcribe_input = vocals
            print(f"\nStep 2: Transcribing with faster-whisper ({args.model})...")
            all_segments = transcribe(transcribe_input, model_size=args.model)
    else:
        # Short video — transcribe directly
        transcribe_input = str(video_path)
        if args.denoise:
            print(f"\nStep 1b: Denoising audio...")
            denoise_dir = str(output_dir / "denoise")
            os.makedirs(denoise_dir, exist_ok=True)
            vocals = denoise_audio(video_path, denoise_dir)
            if vocals:
                transcribe_input = vocals
        print(f"\nStep 2: Transcribing with faster-whisper ({args.model})...")
        all_segments = transcribe(transcribe_input, model_size=args.model)

    # Post-process: punctuation, capitalisation, proper nouns
    print(f"\nStep 2b: Post-processing (grammar, proper nouns)...")
    all_segments = post_process_transcript(all_segments)

    # Quality control
    print(f"\nStep 2c: Quality control...")
    all_segments, qc_report = qc_transcript(all_segments)

    # OCR speaker detection from video name overlay
    if video_path and os.path.exists(video_path):
        print(f"\nStep 2d: OCR speaker detection...")
        councillors_path = None
        if args.council:
            # Try to find councillors.json for name verification
            for search_dir in [
                Path(__file__).parent.parent / "data" / args.council,
                Path("/root/aidoge/burnley-council/data") / args.council,
            ]:
                candidate = search_dir / "councillors.json"
                if candidate.exists():
                    councillors_path = str(candidate)
                    break
        ocr_timeline = ocr_speaker_detection(
            video_path, interval=3, councillors_json=councillors_path
        )
        all_segments = merge_speaker_sources(
            all_segments, ocr_timeline, qc_report.get("speakers_detected", [])
        )
    else:
        print(f"\n  Skipping OCR (no video file available)")

    # Flag keywords (Tier 1)
    print(f"\nStep 3a: Tier 1 keyword flagging...")
    flagged = flag_keywords(all_segments)
    print(f"  Found {len(flagged)} Tier 1 flagged moments")

    # LLM analysis (Tier 2) — only on Tier 1 hits to save tokens
    if flagged and not args.no_llm:
        print(f"\nStep 3b: Tier 2 LLM contextual analysis ({args.council})...")
        flagged = tier2_llm_analysis(flagged, all_segments=all_segments, council_id=args.council)
    elif args.no_llm:
        print(f"\n  Skipping Tier 2 (--no-llm)")

    # Save outputs
    print(f"\nStep 4: Saving outputs to {output_dir}")
    save_outputs(all_segments, flagged, output_dir, video_path, do_clip=args.clip)

    # Save QC report
    qc_path = output_dir / "qc_report.json"
    with open(qc_path, "w") as f:
        json.dump(qc_report, f, indent=2)
    print(f"  Saved: {qc_path}")

    # Save section info if we split
    if section_info:
        sec_path = output_dir / "sections.json"
        with open(sec_path, "w") as f:
            json.dump(section_info, f, indent=2)

    # Cleanup video files (keep only transcripts + clips)
    if cleanup_video and video_path and video_path.exists():
        video_path.unlink()
        print(f"\n  Cleaned up video file ({duration/60:.0f} min video deleted, transcripts kept)")

    # Clean up denoise intermediates
    for d in output_dir.glob("denoise*"):
        if d.is_dir():
            shutil.rmtree(d, ignore_errors=True)

    # Summary
    total_duration = all_segments[-1]["end"] if all_segments else 0
    print(f"\n{'=' * 60}")
    print(f"TRANSCRIPTION COMPLETE")
    print(f"{'=' * 60}")
    print(f"  Duration: {format_timestamp(total_duration)}")
    if section_info:
        print(f"  Sections: {len(section_info)} (adjournments removed)")
    print(f"  Segments: {len(all_segments)}")
    print(f"  Words: {sum(len(s.get('words', [])) for s in all_segments)}")
    print(f"  Flagged moments: {len(flagged)}")
    high_value = sum(1 for m in flagged if m.get("composite_score", m.get("tier1_score", 0)) >= 7)
    clip_worthy = sum(1 for m in flagged if m.get("llm", {}).get("clip_worthy", False))
    if high_value:
        print(f"  High-value (7+): {high_value}")
    if clip_worthy:
        print(f"  Clip-worthy: {clip_worthy}")
    print(f"  QC Grade: {qc_report.get('grade', '?')} (confidence {qc_report.get('avg_confidence', 0):.1%})")
    print(f"  Speakers: {qc_report.get('unique_speakers', 0)} detected")
    print(f"  Output: {output_dir}")
    print(f"  Video: DELETED (transcripts + clips retained)")


if __name__ == "__main__":
    main()
