#!/usr/bin/env python3
"""
YouTube Transcript ETL — Convert YouTube auto-generated VTT captions
into AI DOGE transcripts.json format.

Each borough council has different meeting formats, committee types,
and speaker identification patterns. This script handles the VTT
parsing generically, then applies council-specific metadata.

Phase 1 Speaker Identification:
- Fuzzy surname matching against councillors.json
- Chair-call detection ("Councillor X" -> next >> is that person)
- "Thank you, Mr Mayor/Chair" response attribution
- ModernGov attendance scraping for ground truth
- Officer role detection (Chief Executive, Monitoring Officer, etc.)

Usage:
    python3 youtube_transcript_etl.py --council burnley
    python3 youtube_transcript_etl.py --all
    python3 youtube_transcript_etl.py --council pendle --llm   # with LLM enrichment
"""

import argparse
import difflib
import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

try:
    import requests
    from bs4 import BeautifulSoup
    HAS_SCRAPING = True
except ImportError:
    HAS_SCRAPING = False

# ── Paths ──────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
YT_DIR = SCRIPT_DIR / "yt-transcripts"
DATA_DIR = SCRIPT_DIR.parent / "data"

# ── ModernGov base URLs ───────────────────────────────────────────────
MODERNGOV_URLS = {
    "burnley": "https://burnley.moderngov.co.uk",
    "chorley": "https://chorley.moderngov.co.uk",
    "hyndburn": "https://hyndburn.moderngov.co.uk",
    "pendle": "https://pendle.moderngov.co.uk",
    "rossendale": "https://rossendale.moderngov.co.uk",
    "south_ribble": "https://southribble.moderngov.co.uk",
    "blackburn": "https://blackburn.moderngov.co.uk",
}

# ── Officer role patterns (for speaker labelling) ────────────────────
OFFICER_PATTERNS = [
    (r"\b(?:the\s+)?chief\s+exec(?:utive)?\b", "Chief Executive"),
    (r"\b(?:the\s+)?monitoring\s+officer\b", "Monitoring Officer"),
    (r"\b(?:the\s+)?finance\s+director\b", "Finance Director"),
    (r"\b(?:the\s+)?s(?:ection)?\s*151\s+officer\b", "Section 151 Officer"),
    (r"\b(?:the\s+)?head\s+of\s+legal\b", "Head of Legal"),
    (r"\b(?:the\s+)?planning\s+officer\b", "Planning Officer"),
    (r"\b(?:the\s+)?director\s+of\b", "Director"),
    (r"\b(?:the\s+)?borough\s+solicitor\b", "Borough Solicitor"),
]
COMPILED_OFFICER_PATTERNS = [(re.compile(p, re.IGNORECASE), label) for p, label in OFFICER_PATTERNS]

# ── Council metadata for YouTube channels ──────────────────────────────
COUNCIL_META = {
    "burnley": {
        "council_name": "Burnley Borough Council",
        "moderngov_url": "https://burnley.moderngov.co.uk",
        "chair_titles": ["Mr Mayor", "Mr. Mayor", "Madam Mayor", "Chair", "Mr Chairman"],
        "committee_ids": {},
        "meeting_patterns": {
            "Full Council": r"Full Council|Annual Council",
            "Cabinet": r"Cabinet|Executive",
            "Planning": r"Planning",
            "Scrutiny": r"Scrutiny|Overview",
        },
    },
    "blackburn": {
        "council_name": "Blackburn with Darwen Borough Council",
        "moderngov_url": "https://blackburn.moderngov.co.uk",
        "chair_titles": ["Mr Mayor", "Mr. Mayor", "Madam Mayor", "Chair", "Madam Chair"],
        "committee_ids": {},
        "meeting_patterns": {
            "Full Council": r"Council Forum|Full Council",
            "Executive Board": r"Executive Board",
            "Planning": r"Planning",
        },
    },
    "chorley": {
        "council_name": "Chorley Council",
        "moderngov_url": "https://chorley.moderngov.co.uk",
        "chair_titles": ["Mr Mayor", "Mr. Mayor", "Madam Mayor", "Chair", "Mr Chairman"],
        "committee_ids": {},
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
        "moderngov_url": "https://hyndburn.moderngov.co.uk",
        "chair_titles": ["Mr Mayor", "Mr. Mayor", "Madam Mayor", "Chair"],
        "committee_ids": {},
        "meeting_patterns": {
            "Full Council": r"council meeting|Council$|Budget.Setting",
            "Cabinet": r"Cabinet",
        },
    },
    "pendle": {
        "council_name": "Pendle Borough Council",
        "moderngov_url": "https://pendle.moderngov.co.uk",
        "chair_titles": ["Mr Chairman", "Madam Chairman", "Chair", "Madam Chair"],
        "committee_ids": {},
        "meeting_patterns": {
            "Full Council": r"Full Council|Full Pendle|Extraordinary Council|Special Budget|Annual Full Council",
            "Executive": r"Executive Meeting",
            "Development Management": r"Development Management",
        },
    },
    "rossendale": {
        "council_name": "Rossendale Borough Council",
        "moderngov_url": "https://rossendale.moderngov.co.uk",
        "chair_titles": ["Mr Mayor", "Mr. Mayor", "Madam Mayor", "Chair"],
        "committee_ids": {},
        "meeting_patterns": {
            "Full Council": r"Extraordinary Council|Council meeting",
            "Cabinet": r"Cabinet",
        },
    },
    "south_ribble": {
        "council_name": "South Ribble Borough Council",
        "moderngov_url": "https://southribble.moderngov.co.uk",
        "chair_titles": ["Mr Mayor", "Mr. Mayor", "Madam Mayor", "Chair", "Mr Chairman"],
        "committee_ids": {},
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


# ── Speaker Identification ─────────────────────────────────────────────

# Pattern to match chair calling on a councillor. Auto-captions render
# "Councillor" as "council", "councelor", "Cllr", etc.
CHAIR_CALL_RE = re.compile(
    r"(?:councillor|councelor|council|cllr)\.?\s+"
    r"(?:(?:Margaret|Gordon|John|Paul|Mark|Mike|Alan|Alex|Howard|Jack|"
    r"Lee|Neil|Don|Jeff|Bill|Charlie|Martyn|Ivor|Jamie|Andrew|David|"
    r"Peter|Robert|Stephen|Michael|James|Richard|Thomas|William|"
    r"Christopher|Daniel|Matthew|Brian|Keith|Trevor|Derek|Colin|"
    r"Anne|Ann|Barbara|Christine|Gail|Gemma|Helen|Joanne|Lubna|"
    r"Nussrat|Ashley|Beki|Jacqueline|Maria|Mary|Julie|Sarah|Jane|"
    r"Sue|Susan|Karen|Diane|Wendy|Linda|Sandra|Janet|Carol|"
    r"Afrasiab|Aurangzeb|Mohammed|Musharaf|Saeed)\s+)?"
    r"(\w+)",
    re.IGNORECASE,
)

# Pattern to detect "Thank you, Mr Mayor" / "Thank you, Chair" responses
THANK_YOU_RE = re.compile(
    r"(?:thank\s+you|thanks),?\s*(?:Mr\.?\s*Mayor|Madam\s*Mayor|Chair|"
    r"Madam\s*Chair|Mr\.?\s*Chairman|Madam\s*Chairman|your\s+worship)",
    re.IGNORECASE,
)

# Voting/procedural patterns that indicate chair is speaking
CHAIR_PROCEDURAL_RE = re.compile(
    r"(?:all\s+those\s+in\s+favour|all\s+those\s+against|"
    r"any\s+abstentions|(?:the\s+)?motion\s+(?:is\s+)?(?:carried|lost|defeated)|"
    r"I\s+declare\s+the\s+meeting|we\s+now\s+move\s+to|"
    r"item\s+\d+\s+on\s+the\s+agenda|agenda\s+item\s+\d+|"
    r"we'll\s+take\s+a\s+(?:short\s+)?(?:break|recess|adjournment)|"
    r"the\s+meeting\s+is\s+adjourned)",
    re.IGNORECASE,
)


def build_surname_lookup(council_id):
    """
    Build a surname -> full name lookup from councillors.json.
    Includes common auto-caption misspellings via fuzzy matching.

    Returns:
        surname_to_full: dict mapping lowercase surname to full name
        all_surnames: list of all known surnames (for fuzzy matching)
    """
    surname_to_full = {}
    all_surnames = []

    # Load councillors.json
    councillors_path = DATA_DIR / council_id / "councillors.json"
    if councillors_path.exists():
        try:
            with open(councillors_path) as f:
                data = json.load(f)
            # Normalize format (could be list or {councillors: [...]})
            councillors = data if isinstance(data, list) else data.get("councillors", [])
            for c in councillors:
                name = c.get("name", "")
                parts = name.split()
                if len(parts) >= 2:
                    surname = parts[-1]
                    surname_to_full[surname.lower()] = name
                    all_surnames.append(surname)
                    # Also index by first name + surname for "Council Margaret Lisman"
                    if len(parts) >= 2:
                        first = parts[0]
                        surname_to_full[f"{first.lower()} {surname.lower()}"] = name
        except (json.JSONDecodeError, KeyError) as e:
            print(f"    WARNING: Failed to load councillors.json: {e}")

    # Load elections.json for historical councillors
    elections_path = DATA_DIR / council_id / "elections.json"
    if elections_path.exists():
        try:
            with open(elections_path) as f:
                elections = json.load(f)
            # elections.json is keyed by ward name
            if isinstance(elections, dict):
                for ward_name, ward_data in elections.items():
                    if isinstance(ward_data, dict):
                        for election in ward_data.get("history", []):
                            for candidate in election.get("candidates", []):
                                cname = candidate.get("name", "")
                                parts = cname.split()
                                if len(parts) >= 2:
                                    surname = parts[-1]
                                    if surname.lower() not in surname_to_full:
                                        surname_to_full[surname.lower()] = cname
                                        all_surnames.append(surname)
        except (json.JSONDecodeError, KeyError):
            pass  # Elections data is optional

    return surname_to_full, all_surnames


def fuzzy_match_surname(candidate, all_surnames, threshold=0.75):
    """
    Fuzzy match a candidate surname from auto-captions against known surnames.
    Returns the best match if score >= threshold, else None.

    Handles common auto-caption errors:
    - McGawan -> McGowan
    - Lisman -> Lishman
    - Mogishman -> Lishman (Margaret Lishman)
    - Anwell -> Anwar
    """
    if not candidate or len(candidate) < 2:
        return None

    candidate_lower = candidate.lower()

    # Exact match first
    for surname in all_surnames:
        if surname.lower() == candidate_lower:
            return surname

    # Fuzzy match
    best_match = None
    best_ratio = 0.0
    for surname in all_surnames:
        ratio = difflib.SequenceMatcher(None, candidate_lower, surname.lower()).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = surname

    if best_ratio >= threshold:
        return best_match

    return None


def scrape_moderngov_attendance(council_id, meeting_date, committee_type):
    """
    Scrape ModernGov to get attendance list for a specific meeting.
    Returns dict of {lowercase_surname: full_name} for present councillors + officers.

    Falls back gracefully: returns empty dict on any error.
    Uses file-based cache to avoid re-scraping.
    """
    if not HAS_SCRAPING:
        return {}

    base_url = MODERNGOV_URLS.get(council_id)
    if not base_url:
        return {}

    # Check cache first
    cache_path = YT_DIR / f"{council_id}_attendance_cache.json"
    cache = {}
    if cache_path.exists():
        try:
            with open(cache_path) as f:
                cache = json.load(f)
        except (json.JSONDecodeError, IOError):
            cache = {}

    cache_key = f"{meeting_date}_{committee_type}"
    if cache_key in cache:
        return cache[cache_key]

    attendees = {}

    try:
        # Parse meeting date
        if not meeting_date or meeting_date == "unknown":
            return {}
        try:
            dt = datetime.strptime(meeting_date, "%Y-%m-%d")
        except ValueError:
            return {}

        # Approach: search the calendar month view for matching meetings
        cal_url = f"{base_url}/mgCalendarMonthView.aspx?M={dt.month}&Y={dt.year}"
        headers = {"User-Agent": "AI DOGE ETL/1.0 (council transparency tool)"}

        resp = requests.get(cal_url, headers=headers, timeout=15)
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")

        # Find all meeting links for this date
        # ModernGov calendar shows meetings with links to ieListDocuments.aspx?MId=XXX
        meeting_ids = []
        day_str = str(dt.day)

        for link in soup.find_all("a", href=True):
            href = link.get("href", "")
            text = link.get_text(strip=True)

            # Match meeting links containing MId= parameter
            mid_match = re.search(r"MId=(\d+)", href, re.IGNORECASE)
            if not mid_match:
                continue

            # Check if this is on the right day and matches committee type
            # Calendar entries typically show the date and meeting name
            parent_text = ""
            parent = link.find_parent("td") or link.find_parent("div")
            if parent:
                parent_text = parent.get_text(strip=True)

            # Check if the day number appears near this link
            day_cell = link.find_parent("td")
            if day_cell:
                day_header = day_cell.find_previous_sibling("td")
                cell_text = day_cell.get_text(strip=True)
                if day_str in cell_text or str(dt.day).zfill(2) in cell_text:
                    meeting_ids.append(mid_match.group(1))
                    continue

            # Also try matching by committee name in the link text
            if committee_type and re.search(re.escape(committee_type), text, re.IGNORECASE):
                meeting_ids.append(mid_match.group(1))

        # If calendar didn't work, try a broader search
        if not meeting_ids:
            # Try the committee listing approach
            search_url = f"{base_url}/mgListCommittees.aspx"
            try:
                resp2 = requests.get(search_url, headers=headers, timeout=15)
                resp2.raise_for_status()
                soup2 = BeautifulSoup(resp2.text, "html.parser")

                # Find committee IDs
                for link in soup2.find_all("a", href=True):
                    href = link.get("href", "")
                    cid_match = re.search(r"CId=(\d+)", href, re.IGNORECASE)
                    if cid_match and committee_type:
                        link_text = link.get_text(strip=True)
                        if re.search(re.escape(committee_type), link_text, re.IGNORECASE):
                            # Found the committee, now find meetings for that year
                            cid = cid_match.group(1)
                            list_url = f"{base_url}/ieListMeetings.aspx?CId={cid}&Year={dt.year}"
                            try:
                                resp3 = requests.get(list_url, headers=headers, timeout=15)
                                resp3.raise_for_status()
                                soup3 = BeautifulSoup(resp3.text, "html.parser")

                                # Find meeting on the right date
                                date_str_uk = dt.strftime("%-d %B %Y")  # "3 March 2026"
                                date_str_uk2 = dt.strftime("%d/%m/%Y")  # "03/03/2026"
                                for mlink in soup3.find_all("a", href=True):
                                    mhref = mlink.get("href", "")
                                    mid_match2 = re.search(r"MId=(\d+)", mhref, re.IGNORECASE)
                                    if mid_match2:
                                        row_text = ""
                                        row = mlink.find_parent("tr")
                                        if row:
                                            row_text = row.get_text(strip=True)
                                        if date_str_uk in row_text or date_str_uk2 in row_text:
                                            meeting_ids.append(mid_match2.group(1))
                            except (requests.RequestException, Exception):
                                pass
            except (requests.RequestException, Exception):
                pass

        # Now scrape attendance for each matching meeting
        for mid in meeting_ids[:3]:  # Limit to 3 to avoid over-scraping
            att_url = f"{base_url}/mgMeetingAttendance.aspx?ID={mid}"
            try:
                time.sleep(0.5)  # Rate limit
                resp4 = requests.get(att_url, headers=headers, timeout=15)
                resp4.raise_for_status()
                soup4 = BeautifulSoup(resp4.text, "html.parser")

                # Parse attendance table
                # ModernGov tables have columns: Name, Status (Present/Absent/Apologies)
                tables = soup4.find_all("table")
                for table in tables:
                    rows = table.find_all("tr")
                    for row in rows:
                        cells = row.find_all("td")
                        if len(cells) >= 2:
                            name_text = cells[0].get_text(strip=True)
                            status_text = cells[1].get_text(strip=True)

                            # Only include Present members
                            if "present" in status_text.lower():
                                # Clean the name: remove "Councillor " prefix
                                clean_name = re.sub(
                                    r"^(?:Councillor|Cllr|Deputy\s+Mayor|Mayor)\s+",
                                    "", name_text, flags=re.IGNORECASE
                                ).strip()
                                if clean_name:
                                    parts = clean_name.split()
                                    if parts:
                                        surname = parts[-1].lower()
                                        attendees[surname] = clean_name

                # Also check for the simpler list format some councils use
                if not attendees:
                    mgContent = soup4.find("div", {"class": "mgContent"})
                    if mgContent:
                        for item in mgContent.find_all("li"):
                            text = item.get_text(strip=True)
                            if text:
                                clean = re.sub(
                                    r"^(?:Councillor|Cllr)\s+", "", text,
                                    flags=re.IGNORECASE
                                ).strip()
                                # Remove status suffix
                                clean = re.sub(r"\s*\(.*?\)\s*$", "", clean).strip()
                                parts = clean.split()
                                if parts:
                                    surname = parts[-1].lower()
                                    attendees[surname] = clean

                if attendees:
                    break  # Found attendance data, stop looking

            except (requests.RequestException, Exception) as e:
                print(f"    WARNING: Failed to scrape attendance for MId={mid}: {e}")
                continue

    except (requests.RequestException, Exception) as e:
        print(f"    WARNING: ModernGov scrape failed for {council_id}: {e}")

    # Cache the result (even if empty, to avoid re-scraping)
    cache[cache_key] = attendees
    try:
        with open(cache_path, "w") as f:
            json.dump(cache, f, indent=2)
    except IOError:
        pass

    return attendees


def detect_speakers(segments, attendees=None, surname_lookup=None, all_surnames=None, chair_titles=None):
    """
    Detect speakers using multiple signals:
    1. Chair calls: "Councillor [Surname]" -> next >> block is that person
    2. Thank you responses: "Thank you Mr Mayor/Chair" marks new speaker start
    3. >> markers: speaker change boundaries
    4. Surname matching against attendee list
    5. Officer role detection
    6. Voting/procedural patterns -> chair speaking

    Args:
        segments: list of {start, end, text} segments
        attendees: dict of {lowercase_surname: full_name} from ModernGov
        surname_lookup: dict of {lowercase_surname: full_name} from councillors.json
        all_surnames: list of all known surnames for fuzzy matching
        chair_titles: list of chair address forms for this council

    Returns:
        (segments_with_speakers, speaker_map, speaker_stats)
    """
    if surname_lookup is None:
        surname_lookup = {}
    if all_surnames is None:
        all_surnames = []
    if attendees is None:
        attendees = {}
    if chair_titles is None:
        chair_titles = ["Mr Mayor", "Chair"]

    # Merge attendees into surname_lookup (attendees take priority as ground truth)
    merged_lookup = dict(surname_lookup)
    for surname_lower, full_name in attendees.items():
        merged_lookup[surname_lower] = full_name

    # All known surnames for fuzzy matching (attendees + councillors.json)
    all_known = list(set(all_surnames + [s.title() for s in attendees.keys()]))

    # ── Pass 1: Scan all segments for chair calls and build timeline ──
    # A "chair call" is when the chair says "Councillor X" to call on someone.
    # The NEXT >> marker after a chair call is that councillor starting to speak.

    chair_calls = []  # list of (segment_index, timestamp, matched_full_name)
    speaker_changes = []  # list of (segment_index, timestamp) for >> markers

    for i, seg in enumerate(segments):
        text = seg["text"]

        # Track >> speaker change positions
        if ">>" in text:
            speaker_changes.append((i, seg["start"]))

        # Find chair calls: "Councillor [FirstName] Surname" or "Council Surname"
        for match in CHAIR_CALL_RE.finditer(text):
            # The captured group is the last word (surname candidate)
            surname_candidate = match.group(1)
            if not surname_candidate:
                continue

            # Filter out common false positives
            false_positives = {
                "tax", "meeting", "chamber", "house", "hall", "office",
                "offices", "committee", "are", "has", "had", "was", "is",
                "the", "and", "for", "that", "this", "will", "can", "may",
                "should", "would", "could", "been", "being", "not", "but",
                "its", "it", "our", "their", "them", "they", "you", "your",
                "we", "she", "her", "his", "him", "who", "which", "what",
                "tag", "resolution", "services", "report",
            }
            if surname_candidate.lower() in false_positives:
                continue

            # Check the full match for "first_name surname" pattern
            full_match_text = match.group(0)
            # Extract potential first name + surname from the match
            words_after_title = re.sub(
                r"^(?:councillor|councelor|council|cllr)\.?\s+",
                "", full_match_text, flags=re.IGNORECASE
            ).strip().split()

            identified_name = None

            if len(words_after_title) >= 2:
                # "Margaret Lisman" pattern — try first+last together
                first_last_key = f"{words_after_title[0].lower()} {words_after_title[-1].lower()}"
                if first_last_key in merged_lookup:
                    identified_name = merged_lookup[first_last_key]
                else:
                    # Try fuzzy on surname only
                    fuzzy = fuzzy_match_surname(words_after_title[-1], all_known)
                    if fuzzy:
                        identified_name = merged_lookup.get(fuzzy.lower(), fuzzy)

            if not identified_name:
                # Single surname: try exact then fuzzy
                if surname_candidate.lower() in merged_lookup:
                    identified_name = merged_lookup[surname_candidate.lower()]
                else:
                    fuzzy = fuzzy_match_surname(surname_candidate, all_known)
                    if fuzzy:
                        identified_name = merged_lookup.get(fuzzy.lower(), fuzzy)

            if identified_name:
                chair_calls.append((i, seg["start"], identified_name))

    # ── Pass 2: Assign speakers to segments ──
    current_speaker = "Chair"
    speaker_map = {}
    pending_speaker = None  # Set when chair calls someone; applied at next >>
    speaker_counts = {}  # {name: segment_count}
    last_chair_call_idx = -1

    for i, seg in enumerate(segments):
        text = seg["text"]
        has_change = ">>" in text

        # Clean >> from text
        if has_change:
            text = re.sub(r">>+\s*", "", text).strip()
            seg["text"] = text

        # Check if there's a pending speaker from a chair call
        if has_change and pending_speaker:
            current_speaker = pending_speaker
            pending_speaker = None
        elif has_change:
            # Speaker changed but we don't know who yet.
            # Check if this segment starts with "Thank you, Mr Mayor/Chair"
            if THANK_YOU_RE.search(text):
                # Look backward for the most recent chair call
                # The chair just called on someone, and they responded
                recent_calls = [
                    (idx, ts, name) for idx, ts, name in chair_calls
                    if idx <= i and seg["start"] - ts < 60  # within 60 seconds
                ]
                if recent_calls:
                    _, _, called_name = recent_calls[-1]
                    current_speaker = called_name
                else:
                    # Generic new speaker — we know someone new is talking
                    current_speaker = "Unknown Councillor"
            else:
                # No "thank you" — check if we can identify from context
                # Check for officer patterns
                officer_found = False
                for pattern, label in COMPILED_OFFICER_PATTERNS:
                    if pattern.search(text):
                        current_speaker = label
                        officer_found = True
                        break

                if not officer_found:
                    # Check for self-introduction: "Councillor X here" or "I'm Councillor X"
                    intro_match = re.search(
                        r"(?:my name is|I'm|I am)\s+(?:Councillor|Cllr|councelor)\s+(\w+(?:\s+\w+)?)",
                        text, re.IGNORECASE,
                    )
                    if intro_match:
                        intro_name = intro_match.group(1).strip()
                        intro_false = {
                            "happy", "going", "sure", "sorry", "not", "just",
                            "very", "afraid", "pleased", "hoping", "glad",
                            "really", "still", "particularly", "confident",
                        }
                        if intro_name and intro_name.lower().split()[0] not in intro_false:
                            fuzzy = fuzzy_match_surname(intro_name.split()[-1], all_known)
                            if fuzzy:
                                current_speaker = merged_lookup.get(fuzzy.lower(), intro_name)
                            else:
                                current_speaker = intro_name
                    else:
                        # Check if chair is doing procedural stuff
                        if CHAIR_PROCEDURAL_RE.search(text):
                            current_speaker = "Chair"
                        else:
                            # Unknown speaker change
                            current_speaker = "Unknown Speaker"

        # Check if this segment IS a chair call (sets up pending_speaker for next >>)
        for idx, ts, name in chair_calls:
            if idx == i:
                # This segment contains a chair call — chair is currently speaking
                current_speaker = "Chair"
                pending_speaker = name
                last_chair_call_idx = i
                break

        # Check for officer role mentions even without >> (mid-segment)
        if current_speaker in ("Unknown Speaker", "Chair"):
            for pattern, label in COMPILED_OFFICER_PATTERNS:
                # Only if the text seems to be addressed to or by the officer
                if pattern.search(text) and re.search(r"\b(?:I|we|my|our)\b", text, re.IGNORECASE):
                    current_speaker = label
                    break

        seg["speaker"] = current_speaker

        # Track counts
        speaker_counts[current_speaker] = speaker_counts.get(current_speaker, 0) + 1

        # Build speaker map (for backward compat)
        if current_speaker not in ("Chair", "Unknown Speaker", "Unknown Councillor"):
            # Map any Speaker_X labels to real names
            speaker_map[current_speaker] = current_speaker

    # ── Pass 3: Resolve remaining "Unknown Speaker" segments ──
    # If an Unknown Speaker is between two segments of the same known speaker,
    # and the gap is small, assign to that speaker (continuation)
    for i, seg in enumerate(segments):
        if seg["speaker"] == "Unknown Speaker":
            prev_speaker = segments[i - 1]["speaker"] if i > 0 else None
            next_speaker = segments[i + 1]["speaker"] if i + 1 < len(segments) else None

            # Same speaker before and after, short gap -> continuation
            if prev_speaker and prev_speaker == next_speaker and prev_speaker not in ("Unknown Speaker", "Unknown Councillor"):
                seg["speaker"] = prev_speaker
            # Previous known speaker, gap < 5 seconds -> likely same speaker
            elif prev_speaker and prev_speaker not in ("Unknown Speaker", "Unknown Councillor", "Chair"):
                if i > 0 and seg["start"] - segments[i - 1]["end"] < 5.0:
                    seg["speaker"] = prev_speaker

    # Build speaker stats
    speaker_stats = {
        "total_speakers": len(set(s["speaker"] for s in segments) - {"Unknown Speaker", "Unknown Councillor"}),
        "identified_speakers": len(speaker_map),
        "chair_calls_detected": len(chair_calls),
        "speaker_changes": len(speaker_changes),
        "speaker_counts": {k: v for k, v in sorted(speaker_counts.items(), key=lambda x: -x[1]) if k not in ("Unknown Speaker",)},
    }

    return segments, speaker_map, speaker_stats


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


def process_vtt_file(vtt_path, council_id, surname_lookup=None, all_surnames=None, attendees_cache=None):
    """
    Process a single VTT file into meeting metadata + flagged moments.

    Args:
        vtt_path: Path to the VTT file
        council_id: Council identifier
        surname_lookup: Pre-built {surname: full_name} dict from councillors.json
        all_surnames: List of all known surnames for fuzzy matching
        attendees_cache: Dict to accumulate attendance data across meetings
    """
    if surname_lookup is None:
        surname_lookup = {}
    if all_surnames is None:
        all_surnames = []
    if attendees_cache is None:
        attendees_cache = {}

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

    # Try to get attendance from ModernGov (cached)
    attendees = {}
    meta = COUNCIL_META.get(council_id, {})
    if meta.get("moderngov_url") and date != "unknown":
        attendees = scrape_moderngov_attendance(council_id, date, committee)
        if attendees:
            print(f"    Attendance: {len(attendees)} present (ModernGov)")

    # Get chair titles for this council
    chair_titles = meta.get("chair_titles", ["Mr Mayor", "Chair"])

    # Detect speakers with full context
    merged, speaker_map, speaker_stats = detect_speakers(
        merged,
        attendees=attendees,
        surname_lookup=surname_lookup,
        all_surnames=all_surnames,
        chair_titles=chair_titles,
    )

    duration = max(s["end"] for s in merged) if merged else 0

    print(f"    Segments: {len(raw_segments)} raw → {len(merged)} merged, Duration: {duration:.0f}s")
    if speaker_stats.get("identified_speakers", 0) > 0:
        print(f"    Speakers: {speaker_stats['identified_speakers']} identified, "
              f"{speaker_stats['chair_calls_detected']} chair calls, "
              f"{speaker_stats['speaker_changes']} changes")
        # Show top speakers
        top = list(speaker_stats.get("speaker_counts", {}).items())[:5]
        if top:
            top_str = ", ".join(f"{name}({count})" for name, count in top)
            print(f"    Top speakers: {top_str}")
    elif speaker_map:
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
        "speaker_stats": speaker_stats,
        "attendees": list(attendees.values()) if attendees else [],
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

    # Build surname lookup from councillors.json + elections.json
    surname_lookup, all_surnames = build_surname_lookup(council_id)
    if surname_lookup:
        print(f"  Loaded {len(all_surnames)} councillor surnames for speaker matching")

    all_meetings = []
    all_moments = []
    attendees_cache = {}

    for vtt_file in vtt_files:
        meeting, moments = process_vtt_file(
            vtt_file, council_id,
            surname_lookup=surname_lookup,
            all_surnames=all_surnames,
            attendees_cache=attendees_cache,
        )
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
