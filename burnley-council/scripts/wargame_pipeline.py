#!/usr/bin/env python3
"""
wargame_pipeline.py — Auto-generate war-game briefings for upcoming council meetings

Scrapes ModernGov agenda PDFs, extracts motion/question text via LLM, generates
tactical war-game briefings with speaker predictions, amendment analysis, and
standing orders time management. Output: meeting_briefings.json per council.

Briefings remain available until end of meeting day, then auto-archived.

Workflow:
  1. Acquire lockfile (prevent concurrent runs)
  2. Scan meetings.json for meetings within --days-ahead window
  3. For each upcoming meeting:
     a. Scrape ModernGov page for PDF document links
     b. Download and extract text from agenda report PDFs
     c. Call Gemini 2.5 Flash to analyse extracted text:
        - Extract full motion text + proposed amendments
        - Identify policy areas + opposition angles
        - Predict speaker strategies
     d. Build war-game briefing with tactical scenarios
     e. Apply standing orders time limits + procedural rules
  4. Write meeting_briefings.json
  5. Commit and push (triggers CI/CD deploy)
  6. Release lockfile

Usage:
    python3 wargame_pipeline.py                          # All councils, next 7 days
    python3 wargame_pipeline.py --council lancashire_cc   # Single council
    python3 wargame_pipeline.py --days-ahead 14           # Next 2 weeks
    python3 wargame_pipeline.py --dry-run                 # Preview without writing
    python3 wargame_pipeline.py --no-pdf                  # Skip PDF download (use cached agenda_items)
    python3 wargame_pipeline.py --no-git                  # Skip git commit/push

Cron (vps-main):
  # Generate briefings every morning at 7am — covers meetings within 7 days
  0 7 * * * cd /root/aidoge && /usr/bin/python3 burnley-council/scripts/wargame_pipeline.py >> /var/log/aidoge/wargame.log 2>&1
"""

import argparse
import fcntl
import json
import logging
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urljoin

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# LLM Router
sys.path.insert(0, os.path.dirname(__file__))
try:
    from llm_router import generate
    HAS_LLM = True
except ImportError:
    HAS_LLM = False

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler()],
)
log = logging.getLogger('WargamePipeline')

LOG_FILE = Path('/var/log/aidoge/wargame.log')
if LOG_FILE.parent.exists():
    logging.getLogger().addHandler(logging.FileHandler(LOG_FILE))

# ── Paths ────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent  # burnley-council/
DATA_DIR = BASE_DIR / 'data'

for alt in [
    Path('/root/aidoge/burnley-council/data'),
    Path('/root/clawd-worker/aidoge/data'),
]:
    if alt.exists():
        DATA_DIR = alt
        break

GIT_REPO = DATA_DIR.parent.parent  # repo root

SHARED_DIR = DATA_DIR / 'shared'

# Councils with full_council meetings worth war-gaming
WARGAME_COUNCILS = [
    'lancashire_cc', 'blackpool', 'blackburn',
    'burnley', 'hyndburn', 'pendle', 'rossendale',
    'lancaster', 'ribble_valley', 'chorley', 'south_ribble',
    'preston', 'west_lancashire', 'wyre', 'fylde',
]

LOCK_FILE = Path('/tmp/aidoge-wargame-pipeline.lock')

# Token budget (shared with article pipeline to respect Gemini free tier)
BUDGET_FILE = Path('/tmp/aidoge-wargame-budget.json')
DEFAULT_DAILY_BUDGET = 100_000  # tokens/day (Gemini free tier is 1M/day)
ESTIMATED_TOKENS_PER_BRIEFING = 15_000  # larger than articles

# Meeting types worth war-gaming (prioritised)
WARGAME_MEETING_TYPES = ['full_council', 'cabinet', 'scrutiny', 'planning']

# ── Policy area mapping (matches intelligenceEngine.js) ──────────────
POLICY_AREA_KEYWORDS = {
    'budget_finance': ['budget', 'finance', 'tax', 'council tax', 'revenue', 'capital', 'reserves', 'allowance', 'pay policy', 'remuneration'],
    'transport_highways': ['highway', 'pothole', 'road', 'transport', 'traffic', 'cycling', 'bus', 'tour de france'],
    'social_care': ['care home', 'social care', 'adult care', 'children', 'safeguarding', 'parenting', 'day centre'],
    'housing_planning': ['housing', 'planning', 'development', 'hmo', 'building'],
    'education': ['school', 'education', 'send', 'academy', 'youth'],
    'environment': ['waste', 'recycling', 'climate', 'environment', 'clean water', 'green', 'drug'],
    'health': ['health', 'wellbeing', 'nhs', 'hospital', 'mental health', 'disability'],
    'governance': ['governance', 'standing order', 'constitution', 'committee', 'appointment', 'conduct', 'election', 'integrity', 'democratic', 'voting'],
    'public_safety': ['police', 'fire', 'crime', 'safety', 'community safety'],
    'economy': ['economic', 'business', 'employment', 'regeneration', 'procurement'],
}


# ── Lockfile ─────────────────────────────────────────────────────────

class PipelineLock:
    def __init__(self):
        self._fd = None

    def acquire(self):
        try:
            self._fd = open(LOCK_FILE, 'w')
            fcntl.flock(self._fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self._fd.write(f'{os.getpid()} {datetime.now().isoformat()}\n')
            self._fd.flush()
            log.info('Lockfile acquired')
            return True
        except (IOError, OSError):
            log.warning('Another pipeline process is running')
            if self._fd:
                self._fd.close()
                self._fd = None
            return False

    def release(self):
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


# ── Token Budget ─────────────────────────────────────────────────────

def load_budget():
    today = datetime.now().strftime('%Y-%m-%d')
    if BUDGET_FILE.exists():
        try:
            data = json.loads(BUDGET_FILE.read_text())
            if data.get('date') == today:
                return data
        except (json.JSONDecodeError, IOError):
            pass
    return {'date': today, 'tokens_used': 0, 'briefings_generated': 0, 'calls': 0}


def save_budget(budget):
    try:
        BUDGET_FILE.write_text(json.dumps(budget, indent=2))
    except IOError as e:
        log.warning(f'Could not save budget: {e}')


def check_budget(daily_limit):
    budget = load_budget()
    remaining = daily_limit - budget['tokens_used']
    if remaining < ESTIMATED_TOKENS_PER_BRIEFING:
        log.info(f'Daily budget exhausted: {budget["tokens_used"]:,} / {daily_limit:,} tokens')
        return False, budget
    return True, budget


def record_usage(budget, estimated_tokens):
    budget['tokens_used'] += estimated_tokens
    budget['briefings_generated'] += 1
    budget['calls'] += 1
    save_budget(budget)


# ── Data Loading ─────────────────────────────────────────────────────

def load_json(path):
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, IOError):
        return None


def load_meetings(council_id):
    return load_json(DATA_DIR / council_id / 'meetings.json')


def load_councillors(council_id):
    data = load_json(DATA_DIR / council_id / 'councillors.json')
    if not data:
        return []
    return data if isinstance(data, list) else data.get('councillors', [])


def load_politics(council_id):
    return load_json(DATA_DIR / council_id / 'politics_summary.json') or {}


def load_integrity(council_id):
    return load_json(DATA_DIR / council_id / 'integrity.json')


def load_standing_orders(council_id):
    return load_json(DATA_DIR / council_id / 'standing_orders.json')


def load_existing_briefings(council_id):
    return load_json(DATA_DIR / council_id / 'meeting_briefings.json')


# ── Meeting Detection ────────────────────────────────────────────────

def get_upcoming_meetings(council_id, days_ahead=7):
    """Find meetings within the next N days that are worth war-gaming."""
    data = load_meetings(council_id)
    if not data:
        return []

    meetings = data.get('meetings', [])
    today = datetime.now().strftime('%Y-%m-%d')
    end_date = (datetime.now() + timedelta(days=days_ahead)).strftime('%Y-%m-%d')

    upcoming = []
    for m in meetings:
        if m.get('cancelled', False):
            continue
        date = m.get('date', '')
        if not date or date < today or date > end_date:
            continue
        mtype = m.get('type', 'other')
        if mtype in WARGAME_MEETING_TYPES:
            upcoming.append(m)

    return sorted(upcoming, key=lambda m: m['date'])


def is_meeting_still_active(meeting_date_str):
    """Check if meeting is today or in the future (briefing should remain active)."""
    try:
        meeting_date = datetime.strptime(meeting_date_str, '%Y-%m-%d').date()
        return meeting_date >= datetime.now().date()
    except (ValueError, TypeError):
        return False


# ── ModernGov PDF Scraping ───────────────────────────────────────────

def scrape_moderngov_documents(meeting_link):
    """Scrape ModernGov meeting page for PDF document links."""
    if not meeting_link or not HAS_REQUESTS:
        return []

    try:
        resp = requests.get(meeting_link, timeout=30, headers={
            'User-Agent': 'Mozilla/5.0 (AI DOGE War-Game Pipeline)',
        })
        resp.raise_for_status()
    except Exception as e:
        log.warning(f'  Failed to fetch meeting page: {e}')
        return []

    documents = []
    # Find PDF links in the page
    # ModernGov pattern: /documents/sNNNNN/Report.pdf or /mgConvert2PDF.aspx?ID=NNNNN
    pdf_patterns = [
        r'href="([^"]*?/documents/[^"]*?\.pdf)"',
        r'href="([^"]*?mgConvert2PDF[^"]*?)"',
        r'href="([^"]*?\.pdf)"',
    ]

    for pattern in pdf_patterns:
        for match in re.finditer(pattern, resp.text, re.IGNORECASE):
            url = match.group(1)
            if not url.startswith('http'):
                url = urljoin(meeting_link, url)
            # Extract title from surrounding context
            # Look backwards for link text
            start = max(0, match.start() - 200)
            context = resp.text[start:match.end() + 100]
            title_match = re.search(r'>([^<]{5,80})</a>', context)
            title = title_match.group(1).strip() if title_match else Path(url).stem
            documents.append({'title': title, 'url': url})

    # Deduplicate by URL
    seen = set()
    unique = []
    for doc in documents:
        if doc['url'] not in seen:
            seen.add(doc['url'])
            unique.append(doc)

    log.info(f'  Found {len(unique)} PDF documents')
    return unique


def download_and_extract_pdf(url):
    """Download PDF and extract text. Returns text string or None."""
    if not HAS_REQUESTS:
        return None

    try:
        resp = requests.get(url, timeout=60, headers={
            'User-Agent': 'Mozilla/5.0 (AI DOGE War-Game Pipeline)',
        })
        resp.raise_for_status()
        content_type = resp.headers.get('content-type', '')
        if 'pdf' not in content_type.lower() and not url.lower().endswith('.pdf'):
            log.warning(f'    Not a PDF: {content_type}')
            return None
    except Exception as e:
        log.warning(f'    Download failed: {e}')
        return None

    pdf_bytes = resp.content
    if len(pdf_bytes) < 100:
        return None

    # Try PyPDF2 (most common on servers)
    try:
        from PyPDF2 import PdfReader
        from io import BytesIO
        reader = PdfReader(BytesIO(pdf_bytes))
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text.strip())
        if pages:
            return '\n\n'.join(pages)
    except ImportError:
        pass
    except Exception as e:
        log.warning(f'    PyPDF2 extraction failed: {e}')

    # Try pdfplumber
    try:
        import pdfplumber
        from io import BytesIO
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            pages = []
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    pages.append(text.strip())
            if pages:
                return '\n\n'.join(pages)
    except ImportError:
        pass
    except Exception as e:
        log.warning(f'    pdfplumber extraction failed: {e}')

    # Try pdftotext CLI
    try:
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
            f.write(pdf_bytes)
            tmp_path = f.name
        result = subprocess.run(
            ['pdftotext', tmp_path, '-'],
            capture_output=True, timeout=30,
        )
        os.unlink(tmp_path)
        if result.returncode == 0 and result.stdout:
            return result.stdout.decode('utf-8', errors='replace').strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    log.warning('    No PDF extraction library available')
    return None


# ── Policy Area Classification ───────────────────────────────────────

def classify_policy_areas(text):
    """Map text to policy areas using keyword matching."""
    text_lower = text.lower()
    areas = []
    for area, keywords in POLICY_AREA_KEYWORDS.items():
        if any(kw in text_lower for kw in keywords):
            areas.append(area)
    return areas or ['governance']


# ── LLM Analysis ────────────────────────────────────────────────────

def _parse_llm_json(text):
    """Robustly parse JSON from LLM output with aggressive repair."""
    if not text:
        return None

    # Strip markdown code fences
    text = re.sub(r'```json\s*', '', text)
    text = re.sub(r'```\s*$', '', text)

    # Find outermost JSON object
    start = text.find('{')
    if start < 0:
        log.warning('  No JSON object found in LLM response')
        return None

    # Track brace depth to find matching close
    depth = 0
    in_string = False
    escape = False
    end = start
    for i in range(start, len(text)):
        ch = text[i]
        if escape:
            escape = False
            continue
        if ch == '\\':
            escape = True
            continue
        if ch == '"' and not escape:
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    raw = text[start:end]

    # Clean common LLM JSON errors
    cleaned = raw
    cleaned = re.sub(r',(\s*[}\]])', r'\1', cleaned)  # trailing commas
    cleaned = re.sub(r'\n\s*//[^\n]*', '', cleaned)  # JS comments
    # Fix unescaped newlines inside strings
    cleaned = re.sub(r'(?<=": ")((?:[^"\\]|\\.)*?)(?=")', lambda m: m.group(0).replace('\n', '\\n'), cleaned)
    # Remove em dashes and en dashes (AI telltale signs)
    cleaned = cleaned.replace('\u2014', ' - ')  # em dash
    cleaned = cleaned.replace('\u2013', '-')  # en dash
    cleaned = cleaned.replace('\u2018', "'")  # left single quote
    cleaned = cleaned.replace('\u2019', "'")  # right single quote
    cleaned = cleaned.replace('\u201c', '"')  # left double quote (handled carefully)
    cleaned = cleaned.replace('\u201d', '"')  # right double quote

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        log.warning(f'  JSON parse failed: {e}')
        # If depth never reached 0, try closing the JSON
        if depth > 0:
            # Close open arrays and objects
            suffix = ']' * cleaned.count('[') + '}' * depth
            try:
                # Remove partial last entry (likely truncated)
                last_comma = cleaned.rfind(',')
                if last_comma > 0:
                    truncated = cleaned[:last_comma] + suffix
                    return json.loads(truncated)
            except json.JSONDecodeError:
                pass
        # Save raw output for debugging
        debug_path = Path('/tmp/wargame-debug-llm.json')
        debug_path.write_text(raw)
        log.error(f'  JSON parse failed. Raw saved to {debug_path}')
        return None


WARGAME_SYSTEM_PROMPT = """You are a senior political strategist analysing a UK council meeting for the ruling group.

Your task: Analyse the meeting agenda and extracted documents to produce a tactical war-game briefing.

CRITICAL RULES:
- Base analysis ONLY on the provided text. Do NOT invent information
- If motion text is available, quote it accurately
- Identify who is likely to speak, what they will argue, and how to counter
- Apply standing orders procedurally (time limits, amendment rules, recorded votes)
- UK English spelling throughout
- Be direct and actionable. No waffle
- NEVER use em dashes, en dashes, or semicolons. Use commas, hyphens, or full stops
- NEVER use smart quotes. Use straight quotes only

Return ONLY valid JSON."""

WARGAME_USER_PROMPT_TEMPLATE = """COUNCIL: {council_name}
MEETING: {committee} on {date} at {time}
VENUE: {venue}

POLITICAL MAKEUP:
{politics_text}

AGENDA ITEMS:
{agenda_text}

{standing_orders_text}

EXTRACTED DOCUMENT TEXT (from agenda PDFs):
{documents_text}

COUNCILLOR DATA:
{councillor_text}

Produce a war-game briefing as JSON with this structure:
{{
  "motions": [
    {{
      "order": 1,
      "title": "Short title",
      "proposer": "Name (Party)",
      "full_text": "Full motion text if found in documents, otherwise summarise from agenda",
      "policy_areas": ["budget_finance"],
      "risk_level": "high/medium/low",
      "opposition_strategy": "What opposition will likely argue",
      "ruling_group_response": "Recommended counter-arguments",
      "amendment_predictions": [
        {{
          "likely_proposer": "Name (Party)",
          "amendment_angle": "What they will try to change",
          "counter": "How to defeat or absorb (friendly amendment?)"
        }}
      ],
      "key_data_points": ["£650M backlog", "27% unclassified roads"],
      "time_estimate_minutes": 25
    }}
  ],
  "questions": [
    {{
      "type": "public/member",
      "questioner": "Name",
      "topic": "Brief topic",
      "question_text": "Full text if available",
      "recommended_answer_points": ["Point 1", "Point 2"],
      "trap_risk": "high/medium/low",
      "trap_explanation": "Why this could be a trap question"
    }}
  ],
  "tactical_scenarios": [
    {{
      "scenario": "Description of what could happen",
      "likelihood": "high/medium/low",
      "counter": "What the ruling group should do",
      "standing_order": "SO reference if applicable",
      "time_impact_minutes": 10
    }}
  ],
  "time_management": {{
    "public_questions_estimate": 25,
    "member_questions_estimate": 40,
    "motions_total_estimate": 100,
    "risk_of_overrun": true,
    "recommended_time_saving": "Use friendly amendments on motions 1 and 3"
  }},
  "speaker_allocation": [
    {{
      "agenda_item": "Budget",
      "speakers": [
        {{
          "name": "Name",
          "party": "Party",
          "role": "Proposer/Opposition/Seconder",
          "allocated_minutes": 5,
          "key_points": ["Point to make"]
        }}
      ]
    }}
  ],
  "risk_assessment": {{
    "overall_risk": "high/medium/low",
    "battleground_items": 3,
    "predicted_opposition_speakers": 5,
    "recorded_vote_risk": true,
    "media_risk_items": ["Potholes motion could generate press coverage"]
  }}
}}"""


def build_wargame_via_llm(meeting, council_id, pdf_texts, budget):
    """Generate war-game briefing using LLM analysis of meeting data."""
    if not HAS_LLM:
        log.warning('LLM router not available')
        return None

    council_name = council_id.replace('_', ' ').title()
    if council_id == 'lancashire_cc':
        council_name = 'Lancashire County Council'

    # Build agenda text
    agenda_items = meeting.get('agenda_items', [])
    agenda_text = '\n'.join(f'{i+1}. {item}' for i, item in enumerate(agenda_items))
    if not agenda_text:
        agenda_text = '(No agenda items available)'

    # Build documents text from extracted PDFs
    doc_parts = []
    for title, text in pdf_texts.items():
        # Truncate each doc to ~5000 chars to fit context
        truncated = text[:5000] + ('...' if len(text) > 5000 else '')
        doc_parts.append(f"--- {title} ---\n{truncated}")
    documents_text = '\n\n'.join(doc_parts) if doc_parts else '(No documents extracted)'

    # Load council data
    politics = load_politics(council_id)
    councillors = load_councillors(council_id)
    standing_orders = load_standing_orders(council_id)

    # Politics text
    politics_text = ''
    if politics:
        seats = politics.get('seats', politics.get('parties', []))
        if isinstance(seats, list):
            politics_text = '\n'.join(f"  {s.get('party', s.get('name', '?'))}: {s.get('seats', s.get('count', '?'))} seats" for s in seats)
        elif isinstance(seats, dict):
            politics_text = '\n'.join(f"  {k}: {v} seats" for k, v in seats.items())
        majority = politics.get('majority_threshold', '')
        if majority:
            politics_text += f"\nMajority threshold: {majority}"
        ruling = politics.get('ruling_group', politics.get('administration', ''))
        if ruling:
            politics_text += f"\nRuling group: {ruling}"

    # Standing orders text
    so_text = ''
    if standing_orders:
        so_text = 'STANDING ORDERS (key rules):\n'
        tl = standing_orders.get('time_limits', {})
        if tl.get('motion_debate'):
            md = tl['motion_debate']
            so_text += f"  - Motion debate: {md.get('per_motion_minutes', '?')} min per motion, {md.get('total_all_motions_minutes', '?')} min total\n"
            so_text += f"  - Mover: {md.get('mover_speech_minutes', '?')} min, Others: {md.get('other_speech_minutes', '?')} min\n"
        if tl.get('public_question_time'):
            pq = tl['public_question_time']
            so_text += f"  - Public questions: {pq.get('total_minutes', '?')} min total\n"
        motions = standing_orders.get('motions', {})
        if motions.get('submission'):
            sub = motions['submission']
            so_text += f"  - Max motions: {sub.get('max_per_meeting', '?')}, {sub.get('max_words', '?')} words each\n"
        if motions.get('motions_that_fall'):
            so_text += f"  - CRITICAL: {motions['motions_that_fall'].get('rule', '')}\n"
        amend = standing_orders.get('amendments', {})
        if amend.get('friendly'):
            so_text += f"  - Friendly amendments: {amend['friendly'].get('rule', '')}\n"

    # Councillor summary (opposition members only, to save tokens)
    councillor_text = ''
    if councillors:
        ruling_party = politics.get('ruling_group', politics.get('administration', ''))
        opposition = [c for c in councillors if c.get('party', '') != ruling_party][:20]
        if opposition:
            councillor_text = 'KEY OPPOSITION MEMBERS:\n'
            for c in opposition:
                name = c.get('name', '?')
                party = c.get('party', '?')
                ward = c.get('ward', c.get('division', ''))
                role = c.get('role', '')
                councillor_text += f"  - {name} ({party}, {ward})"
                if role:
                    councillor_text += f" [{role}]"
                councillor_text += '\n'

    # Build prompt
    user_prompt = WARGAME_USER_PROMPT_TEMPLATE.format(
        council_name=council_name,
        committee=meeting.get('committee', 'Unknown'),
        date=meeting.get('date', ''),
        time=meeting.get('time', ''),
        venue=meeting.get('venue', ''),
        politics_text=politics_text or '(No political data available)',
        agenda_text=agenda_text,
        standing_orders_text=so_text or '(No standing orders data)',
        documents_text=documents_text,
        councillor_text=councillor_text or '(No councillor data)',
    )

    # Estimate token count
    estimated_input = len(user_prompt) // 4 + len(WARGAME_SYSTEM_PROMPT) // 4
    estimated_output = 5000  # ~5K tokens output
    estimated_total = estimated_input + estimated_output

    log.info(f'  LLM call: ~{estimated_input:,} input tokens, ~{estimated_output:,} output')

    # Retry up to 2 times if response is too short or JSON fails
    for attempt in range(2):
        try:
            result, provider = generate(user_prompt, system_prompt=WARGAME_SYSTEM_PROMPT, max_tokens=8000)
            log.info(f'  Generated via {provider} ({len(result):,} chars, attempt {attempt + 1})')

            # Record token usage
            record_usage(budget, estimated_total)

            # Save raw for debugging
            Path('/tmp/wargame-raw-llm.txt').write_text(result)

            if len(result) < 500:
                log.warning(f'  Response too short ({len(result)} chars), retrying...')
                time.sleep(3)
                continue

            # Parse JSON from response — with aggressive repair
            parsed = _parse_llm_json(result)
            if parsed:
                return parsed
            log.warning(f'  JSON parse failed on attempt {attempt + 1}, retrying...')
            time.sleep(3)

        except Exception as e:
            log.error(f'  LLM call failed: {e}')
            if attempt == 0:
                time.sleep(5)
                continue
            return None

    return None


# ── Briefing Assembly ────────────────────────────────────────────────

def build_briefing(meeting, council_id, llm_analysis, pdf_texts, pdf_docs):
    """Assemble final briefing combining LLM analysis with meeting metadata."""
    politics = load_politics(council_id)
    standing_orders = load_standing_orders(council_id)

    # Classify agenda items by policy area
    agenda_intel = []
    for item in meeting.get('agenda_items', []):
        areas = classify_policy_areas(item)
        agenda_intel.append({
            'text': item,
            'policy_areas': areas,
        })

    briefing = {
        'meeting_id': meeting.get('id', ''),
        'date': meeting.get('date', ''),
        'time': meeting.get('time', ''),
        'committee': meeting.get('committee', ''),
        'type': meeting.get('type', ''),
        'venue': meeting.get('venue', ''),
        'link': meeting.get('link', ''),
        'summary': meeting.get('summary', ''),
        'agenda_items': meeting.get('agenda_items', []),
        'agenda_intel': agenda_intel,
        'politics': {
            'ruling_group': politics.get('ruling_group', politics.get('administration', '')),
            'seats': politics.get('seats', politics.get('parties', [])),
            'majority_threshold': politics.get('majority_threshold', ''),
        },
        'documents_extracted': len(pdf_texts),
        'documents_available': len(pdf_docs),
        'extracted_documents': [
            {
                'title': doc.get('title', ''),
                'url': doc.get('url', ''),
                'extracted': doc.get('title', '') in pdf_texts,
                'chars': len(pdf_texts.get(doc.get('title', ''), '')),
            }
            for doc in pdf_docs
        ],
    }

    # Merge LLM analysis
    if llm_analysis:
        briefing['motions'] = llm_analysis.get('motions', [])
        briefing['questions'] = llm_analysis.get('questions', [])
        briefing['tactical_scenarios'] = llm_analysis.get('tactical_scenarios', [])
        briefing['time_management'] = llm_analysis.get('time_management', {})
        briefing['speaker_allocation'] = llm_analysis.get('speaker_allocation', [])
        briefing['risk_assessment'] = llm_analysis.get('risk_assessment', {})
    else:
        # Basic briefing without LLM (fallback)
        briefing['motions'] = []
        briefing['questions'] = []
        briefing['tactical_scenarios'] = []
        briefing['time_management'] = {}
        briefing['speaker_allocation'] = []
        briefing['risk_assessment'] = {'overall_risk': 'unknown', 'note': 'LLM analysis unavailable'}

    # Add standing orders reference
    if standing_orders:
        briefing['standing_orders_summary'] = {
            'motion_time_limit': standing_orders.get('time_limits', {}).get('motion_debate', {}).get('total_all_motions_minutes'),
            'per_motion_limit': standing_orders.get('time_limits', {}).get('motion_debate', {}).get('per_motion_minutes'),
            'max_motions': standing_orders.get('motions', {}).get('submission', {}).get('max_per_meeting'),
            'public_question_limit': standing_orders.get('time_limits', {}).get('public_question_time', {}).get('total_minutes'),
            'friendly_amendment_rule': standing_orders.get('amendments', {}).get('friendly', {}).get('rule', ''),
            'motions_that_fall_rule': standing_orders.get('motions', {}).get('motions_that_fall', {}).get('rule', ''),
        }

    return briefing


# ── Process Council ──────────────────────────────────────────────────

def process_council(council_id, days_ahead=7, dry_run=False, skip_pdf=False, budget=None):
    """Process a single council: find meetings, extract PDFs, generate briefings."""
    log.info(f'=== {council_id.upper()} ===')

    meetings = get_upcoming_meetings(council_id, days_ahead)
    if not meetings:
        log.info(f'  No upcoming meetings in next {days_ahead} days')
        return [], False

    log.info(f'  {len(meetings)} upcoming meeting(s)')

    briefings = []
    for meeting in meetings:
        meeting_id = meeting.get('id', f"{meeting['committee']}-{meeting['date']}")
        log.info(f'  Meeting: {meeting["committee"]} on {meeting["date"]}')

        if dry_run:
            log.info(f'    DRY RUN: Would generate briefing for {meeting_id}')
            log.info(f'    Agenda items: {len(meeting.get("agenda_items", []))}')
            log.info(f'    Documents: {len(meeting.get("documents", []))}')
            briefings.append({'meeting_id': meeting_id, 'dry_run': True})
            continue

        # Check budget
        if budget:
            ok, budget = check_budget(DEFAULT_DAILY_BUDGET)
            if not ok:
                log.warning('  Token budget exhausted, stopping')
                break

        # Step 1: Scrape ModernGov for PDF links
        pdf_docs = []
        if not skip_pdf and meeting.get('link'):
            log.info(f'  Scraping ModernGov for documents...')
            pdf_docs = scrape_moderngov_documents(meeting['link'])
        elif meeting.get('documents'):
            pdf_docs = [d for d in meeting['documents'] if d.get('url')]

        # Step 2: Download and extract PDFs
        pdf_texts = {}
        if not skip_pdf:
            seen_urls = set()
            for doc in pdf_docs[:10]:  # Max 10 PDFs per meeting
                url = doc.get('url')
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)
                title = doc.get('title', 'Document')
                # Deduplicate titles by appending index
                if title in pdf_texts:
                    title = f'{title} ({len(pdf_texts) + 1})'
                log.info(f'    Extracting: {title}')
                text = download_and_extract_pdf(url)
                if text and len(text) > 50:
                    pdf_texts[title] = text
                    log.info(f'      OK: {len(text):,} chars')
                time.sleep(1)  # Rate limit

        log.info(f'  Extracted {len(pdf_texts)}/{len(pdf_docs)} documents')

        # Step 3: LLM analysis
        llm_analysis = None
        if HAS_LLM and (pdf_texts or meeting.get('agenda_items')):
            log.info(f'  Running LLM war-game analysis...')
            llm_analysis = build_wargame_via_llm(meeting, council_id, pdf_texts, budget)
            time.sleep(5)  # Rate limit between LLM calls

        # Step 4: Assemble briefing
        briefing = build_briefing(meeting, council_id, llm_analysis, pdf_texts, pdf_docs)
        briefings.append(briefing)
        log.info(f'  Briefing generated: {briefing.get("risk_assessment", {}).get("overall_risk", "?")} risk')

    return briefings, len(briefings) > 0


# ── Archive expired briefings ────────────────────────────────────────

def archive_expired(existing_data):
    """Move briefings for past meetings to archive section."""
    if not existing_data:
        return [], []

    active = []
    archived = existing_data.get('archived', [])

    for briefing in existing_data.get('meetings', []):
        if is_meeting_still_active(briefing.get('date', '')):
            active.append(briefing)
        else:
            # Archive with timestamp
            briefing['archived_at'] = datetime.now().isoformat()
            archived.append(briefing)

    # Keep only last 10 archived briefings
    archived = archived[-10:]
    return active, archived


# ── Git Commit ───────────────────────────────────────────────────────

def git_commit_and_push(councils_updated):
    """Commit briefings and push to trigger deploy."""
    if not GIT_REPO.exists() or not (GIT_REPO / '.git').exists():
        log.warning(f'Git repo not found at {GIT_REPO}')
        return False

    try:
        subprocess.run(
            ['git', 'config', 'user.name', 'AI DOGE Pipeline'],
            cwd=GIT_REPO, capture_output=True, check=True,
        )
        subprocess.run(
            ['git', 'config', 'user.email', 'pipeline@aidoge.co.uk'],
            cwd=GIT_REPO, capture_output=True, check=True,
        )

        # Pull latest
        subprocess.run(
            ['git', 'pull', '--rebase', 'origin', 'main'],
            cwd=GIT_REPO, capture_output=True, timeout=60,
        )

        # Stage only meeting_briefings.json files
        files_to_add = []
        for council_id in councils_updated:
            briefing_file = GIT_REPO / 'burnley-council' / 'data' / council_id / 'meeting_briefings.json'
            if briefing_file.exists():
                files_to_add.append(str(briefing_file))

        if not files_to_add:
            return False

        subprocess.run(
            ['git', 'add'] + files_to_add,
            cwd=GIT_REPO, capture_output=True, check=True,
        )

        result = subprocess.run(
            ['git', 'diff', '--cached', '--quiet'],
            cwd=GIT_REPO, capture_output=True,
        )
        if result.returncode == 0:
            log.info('No briefing changes to commit')
            return False

        date_str = datetime.now().strftime('%Y-%m-%d')
        councils_str = ', '.join(sorted(councils_updated))
        commit_msg = f"wargame: briefings for {councils_str} ({date_str})"

        subprocess.run(
            ['git', 'commit', '-m', commit_msg],
            cwd=GIT_REPO, capture_output=True, check=True,
        )
        log.info(f'Committed: {commit_msg}')

        result = subprocess.run(
            ['git', 'push', 'origin', 'main'],
            cwd=GIT_REPO, capture_output=True, timeout=120,
        )
        if result.returncode == 0:
            log.info('Pushed — CI/CD will deploy')
            return True
        else:
            stderr = result.stderr.decode() if result.stderr else ''
            log.error(f'Push failed: {stderr}')
            return False

    except subprocess.TimeoutExpired:
        log.error('Git operation timed out')
        return False
    except Exception as e:
        log.error(f'Git error: {e}')
        return False


# ── Main ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='AI DOGE War-Game Briefing Generator'
    )
    parser.add_argument('--council', help='Single council ID')
    parser.add_argument('--days-ahead', type=int, default=7, help='Days ahead to scan (default: 7)')
    parser.add_argument('--dry-run', action='store_true', help='Preview without generating')
    parser.add_argument('--no-pdf', action='store_true', help='Skip PDF download/extraction')
    parser.add_argument('--no-git', action='store_true', help='Skip git commit/push')
    parser.add_argument('--budget', type=int, default=DEFAULT_DAILY_BUDGET, help='Daily token budget')
    args = parser.parse_args()

    log.info('=== AI DOGE War-Game Pipeline ===')
    log.info(f'Date: {datetime.now().strftime("%Y-%m-%d %H:%M")}')
    log.info(f'Window: next {args.days_ahead} days')

    # Lockfile
    lock = PipelineLock()
    if not lock.acquire():
        sys.exit(1)

    try:
        budget = load_budget()
        councils = [args.council] if args.council else WARGAME_COUNCILS
        councils_updated = []
        total_briefings = 0

        for council_id in councils:
            if council_id not in WARGAME_COUNCILS and not args.council:
                continue

            briefings, has_changes = process_council(
                council_id, args.days_ahead, args.dry_run, args.no_pdf, budget
            )

            if not briefings or args.dry_run:
                continue

            # Load existing, archive expired, merge new
            existing = load_existing_briefings(council_id)
            active_existing, archived = archive_expired(existing)

            # Replace briefings for same meeting_id, add new ones
            existing_ids = {b.get('meeting_id') for b in active_existing}
            merged = []
            for b in briefings:
                merged.append(b)  # New/updated always takes priority
            for b in active_existing:
                if b.get('meeting_id') not in {nb.get('meeting_id') for nb in briefings}:
                    merged.append(b)

            # Write output
            output = {
                'meta': {
                    'council': council_id,
                    'generated': datetime.now().isoformat(),
                    'pipeline_version': '1.0',
                    'meetings_count': len(merged),
                    'archived_count': len(archived),
                },
                'meetings': merged,
                'archived': archived,
            }

            out_path = DATA_DIR / council_id / 'meeting_briefings.json'
            output_text = json.dumps(output, indent=2, default=str, ensure_ascii=False)
            # Remove AI telltale characters
            output_text = output_text.replace('\u2014', ' - ')
            output_text = output_text.replace('\u2013', '-')
            output_text = output_text.replace('\u2018', "'")
            output_text = output_text.replace('\u2019', "'")
            out_path.write_text(output_text)
            log.info(f'Written: {out_path} ({len(merged)} active, {len(archived)} archived)')

            councils_updated.append(council_id)
            total_briefings += len(briefings)

        # Summary
        log.info(f'\n=== COMPLETE ===')
        log.info(f'Generated {total_briefings} briefing(s) for {len(councils_updated)} council(s)')
        log.info(f'Token usage: {budget.get("tokens_used", 0):,} / {args.budget:,}')

        # Git commit/push
        if councils_updated and not args.dry_run and not args.no_git:
            git_commit_and_push(councils_updated)

    finally:
        lock.release()


if __name__ == '__main__':
    main()
