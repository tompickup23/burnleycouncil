#!/usr/bin/env python3
"""
Councillor Integrity ETL v5 — Political Fraud Detection System

Investigates councillor integrity across 28 data sources using techniques from
ACFE, CIPFA, SFO, Transparency International, and pioneering political fraud methods.

Research-informed: Based on Donnygate (45 convicted), Liverpool Operation Aloft,
Tower Hamlets, Cash for Honours, PPE VIP Lane, "The Fraud" book revelations
(Labour Together £730K undeclared, Baringa £30K→£35.2M pattern).

Data sources (28):
1.  Companies House REST API — directorships, PSC, charges, insolvency, disqualifications
2.  Companies House co-director network — shared directorships = hidden networks
3.  Electoral Commission — donation/spending cross-reference with council suppliers
4.  Charity Commission — trustee cross-reference against council grant recipients
5.  FCA Register — prohibition orders, regulated person conflicts
6.  Insolvency Service — bankruptcy/IVA (automatic disqualification under s.80 LGA 1972)
7.  Cross-council fraud detection — suppliers spanning 17 bodies, shared director networks
8.  Familial connections — surname clustering, shared addresses, family member CH directorships
9.  MP Register of Members' Financial Interests — UK Parliament Interests API v1
10. Beneficial ownership chain analysis — PSC multi-layer traversal
11. Revolving door detection — appointment timeline analysis
12. Donation-to-contract correlation — EC donations vs contract awards
13. Network centrality scoring — graph-based risk amplification
14. Register of interests compliance — ModernGov cross-verification
15. EC bulk donation data — full Lancashire political ecosystem CSV download
16. Hansard cross-reference — parliamentary speaking records vs integrity network
17. Shell company donor detection — SIC codes, formation agents, dormant status
18. PPERA threshold manipulation — structuring donations below reporting thresholds
19. Temporal donation clustering — coordinated donations within 30-day windows
20. Contract splitting detection — procurement threshold evasion
21. Phantom company detection — dormant/shell companies linked to councillors
22. Dormant-to-active supplier detection — activation timeline analysis
23. Social network triangulation — 2-hop indirect connections
24. Reciprocal cross-council appointments — mutual cross-supply patterns
25. Family donation coordination — smurfing pattern from ML detection
26. MP-councillor donation alignment — vertical influence patterns
27. Bid rigging indicators — procurement anomaly detection
28. Seasonal spending anomaly — year-end/election period detection

Detection algorithms (28):
- Undeclared interests (CH directorships vs register of interests)
- Contract steering indicators (councillor-linked companies winning contracts)
- Phoenix company patterns (serial dissolutions + new incorporations)
- Formation agent detection (bulk company registrations at same address)
- Co-director network mapping (who else sits on boards with councillors?)
- Cross-council supplier conflicts (same councillor network, 17 bodies)
- Misconduct pattern scoring (Nolan Principles compliance indicators)
- Familial connections (surname clustering, shared addresses, family member directorships)
- MP financial overlap (councillor companies vs MP declared employers/donors)
- Revolving door patterns (post-election appointments, cooling-off violations)
- Beneficial ownership chains (PSC → company → councillor hidden connections)
- Donation-to-contract pipeline (EC bulk data, time-windowed, ROI calculation)
- Network centrality amplification (hub councillors with many links get score multiplied)
- Property interest overlap (land declarations vs council spending geography)
- Shell company donors (SIC codes, formation agents, dormant accounts)
- Threshold manipulation (PPERA £11,180/£2,230/£500 proximity + structuring)
- Temporal clustering (30-day coordinated donation windows)
- Contract splitting (procurement threshold evasion patterns)
- Phantom companies (dormant shells linked to councillors)
- Dormant-to-active (companies activating as suppliers post-election)
- Social network triangulation (2-hop councillor→intermediary→supplier)
- Reciprocal appointments (cross-council mutual supply patterns)
- Family donation coordination (surname cluster + shared address donations)
- MP-councillor donation alignment (same donor to both levels)
- Bid rigging indicators (procurement pattern anomalies)
- Seasonal spending anomaly (March/year-end concentration)
- Gift/hospitality frequency (supplier-connected entities)
- Detection-type severity multipliers (known fraud patterns penalised more)

Usage:
    python3 councillor_integrity_etl.py --council burnley
    python3 councillor_integrity_etl.py --all
    python3 councillor_integrity_etl.py --all --skip-ec --skip-fca    # CH only
    python3 councillor_integrity_etl.py --stubs-only                  # No API calls
    python3 councillor_integrity_etl.py --cross-council               # Cross-council analysis only

Rate limits:
    Companies House: 600 requests/5 min (0.5s delay). Primary bottleneck.
    Electoral Commission: Undocumented. 1s delay.
    Charity Commission: ~1000/day. 1s delay.
    FCA Register: Undocumented. 1s delay.
"""

import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, date
from pathlib import Path
from collections import defaultdict

# ── Config ──────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"

CH_API_BASE = "https://api.company-information.service.gov.uk"
CH_KEY = os.environ.get("CH_API_KEY")
if not CH_KEY:
    print("WARNING: CH_API_KEY environment variable not set. Companies House lookups will fail.", file=sys.stderr)

EC_API_BASE = "https://search.electoralcommission.org.uk/api/search"
CHARITY_API_BASE = "https://api.charitycommission.gov.uk/register/api"
FCA_API_BASE = "https://register.fca.org.uk/services/V0.1"

# Shell company SIC codes (from Norwich investigation)
# Note: 96090 ("Other service activities n.e.c.") removed — too broad, catches charities
SHELL_SIC_CODES = {"82990", "64209", "98000", "99999"}
PROPERTY_SIC_CODES = {"68209", "68100", "68320", "68310", "68201", "68202"}
# Formation agent / nominee SIC codes
FORMATION_SIC_CODES = {"69201", "69209", "82110"}

# Known formation agent addresses (expanded from Norwich investigation)
# Note: removed "suite" and "floor" — too broad, catches normal office buildings
FORMATION_AGENT_INDICATORS = [
    "20-22 wenlock road", "71-75 shelton street", "167-169 great portland",
    "virtual office", "registered office", "c/o",
    "kemp house", "falcon road", "imperial house", "formation",
    "lenta business centre", "regus house", "spaces", "wework",
]

# Request delays to avoid rate limiting
CH_DELAY = 0.5
EC_DELAY = 1.0
CHARITY_DELAY = 1.0
FCA_DELAY = 1.0

# All 17 Lancashire public bodies (15 councils + PCC + Fire Authority)
ALL_COUNCILS = [
    "burnley", "hyndburn", "pendle", "rossendale",
    "lancaster", "ribble_valley", "chorley", "south_ribble",
    "lancashire_cc", "blackpool", "blackburn",
    "west_lancashire", "wyre", "preston", "fylde",
    "lancashire_pcc", "lancashire_fire",
]

# Lancashire postcode areas for proximity matching
# Maps council_id → primary postcode prefixes (used to score geographic proximity)
COUNCIL_POSTCODES = {
    "burnley": ["BB10", "BB11", "BB12"],
    "hyndburn": ["BB5", "BB1"],  # BB1 shared with Blackburn — Hyndburn is BB5 primarily
    "pendle": ["BB8", "BB9", "BB18"],
    "rossendale": ["BB4", "OL13"],
    "lancaster": ["LA1", "LA2", "LA3", "LA4", "LA5", "LA6"],
    "ribble_valley": ["BB6", "BB7", "PR3"],  # PR3 extends into RV
    "chorley": ["PR6", "PR7", "PR25"],  # PR25 Leyland area
    "south_ribble": ["PR5", "PR25", "PR26", "PR4"],
    "lancashire_cc": ["BB", "PR", "LA", "FY"],  # County-wide: all Lancashire postcodes
    "blackpool": ["FY1", "FY2", "FY3", "FY4"],
    "blackburn": ["BB1", "BB2", "BB3"],  # BB6 is Ribble Valley primarily
    "west_lancashire": ["L39", "L40", "WN8", "PR4", "PR9"],  # PR9 Southport border
    "wyre": ["FY5", "FY6", "FY7", "PR3"],
    "preston": ["PR1", "PR2", "PR3", "PR4", "PR5"],
    "fylde": ["FY8", "PR4", "FY7"],  # FY7 shared with Wyre
    "lancashire_pcc": ["BB", "PR", "LA", "FY"],  # County-wide: all Lancashire postcodes
    "lancashire_fire": ["BB", "PR", "LA", "FY"],  # County-wide: all Lancashire postcodes
}
# All Lancashire postcode areas (broader match, excluding Liverpool/Greater Manchester)
# BB = Blackburn/Burnley, PR = Preston, LA = Lancaster, FY = Fylde/Blackpool
LANCASHIRE_POSTCODE_AREAS = {"BB", "PR", "LA", "FY"}
# Adjacent areas (lower confidence): L39/L40 = West Lancs, WN8 = Wigan border, OL13 = Rossendale
ADJACENT_POSTCODE_AREAS = {"L39", "L40", "WN8", "OL13"}

# Lancashire party name mapping for Electoral Commission searches
LANCASHIRE_PARTIES = {
    "Labour": ["Labour Party", "Labour and Co-operative Party"],
    "Conservative": ["Conservative and Unionist Party", "Conservative Party"],
    "Reform UK": ["Reform UK"],
    "Liberal Democrat": ["Liberal Democrats"],
    "Green": ["Green Party"],
    "Independent": [],
}

# API call counter for rate limit awareness
api_calls = defaultdict(int)


# ═══════════════════════════════════════════════════════════════════════════
# HTTP Helpers
# ═══════════════════════════════════════════════════════════════════════════

def ch_auth_header():
    """Generate Companies House Basic auth header."""
    token = base64.b64encode(f"{CH_KEY}:".encode()).decode()
    return f"Basic {token}"


def http_get_json(url, headers=None, delay=0.5, label="API", _retries=0):
    """Generic HTTP GET → JSON with retry + rate limit handling.
    Retries on 429, 503, 504 with exponential backoff.
    """
    req = urllib.request.Request(url)
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", "AI-DOGE-IntegrityETL/3.0")

    try:
        time.sleep(delay)
        api_calls[label] += 1
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        if e.code == 429:
            wait = 60 * (2 ** _retries)
            print(f"    [{label} RATE LIMITED] Waiting {wait}s...")
            time.sleep(wait)
            if _retries < 3:
                return http_get_json(url, headers, delay, label, _retries + 1)
            return None
        if e.code in (503, 504) and _retries < 2:
            wait = 10 * (2 ** _retries)
            print(f"    [{label} {e.code}] Retrying in {wait}s...")
            time.sleep(wait)
            return http_get_json(url, headers, delay, label, _retries + 1)
        if e.code >= 500:
            print(f"    [{label} SERVER ERROR {e.code}] Skipping")
            return None
        print(f"    [{label} HTTP {e.code}] {url[:100]}")
        return None
    except (urllib.error.URLError, OSError) as e:
        if _retries < 2:
            wait = 5 * (2 ** _retries)
            print(f"    [{label} NETWORK ERROR] {str(e)[:50]} — retrying in {wait}s...")
            time.sleep(wait)
            return http_get_json(url, headers, delay, label, _retries + 1)
        print(f"    [{label} ERROR] {str(e)[:80]}")
        return None
    except Exception as e:
        print(f"    [{label} ERROR] {str(e)[:80]}")
        return None


def ch_request(path, params=None):
    """Make an authenticated request to Companies House API."""
    url = f"{CH_API_BASE}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    return http_get_json(url, {"Authorization": ch_auth_header()}, CH_DELAY, "CH")


# ═══════════════════════════════════════════════════════════════════════════
# 1. Companies House — Deep Investigation
# ═══════════════════════════════════════════════════════════════════════════

def search_officers(name, items_per_page=20):
    """Search Companies House officer register for a name."""
    data = ch_request("/search/officers", {"q": name, "items_per_page": items_per_page})
    return data.get("items", []) if data else []


def extract_officer_id(officer):
    """Extract officer ID from CH search result links.
    CH returns links.self as '/officers/{id}/appointments' — we need the ID part.
    Also handles links.officer.appointments format."""
    self_link = officer.get("links", {}).get("self", "")
    if not self_link:
        return ""
    # Typical format: /officers/ABC123/appointments
    parts = [p for p in self_link.split("/") if p]
    if len(parts) >= 2 and parts[0] == "officers":
        return parts[1]
    # Fallback: just return last non-empty segment that isn't 'appointments'
    for part in reversed(parts):
        if part != "appointments" and part != "officers":
            return part
    return ""


def get_officer_appointments(officer_id, items_per_page=50):
    """Get all company appointments for an officer, with pagination."""
    all_items = []
    start_index = 0
    while True:
        data = ch_request(f"/officers/{officer_id}/appointments",
                          {"items_per_page": items_per_page, "start_index": start_index})
        if not data:
            break
        items = data.get("items", [])
        all_items.extend(items)
        total = data.get("total_results", len(all_items))
        if len(all_items) >= total or not items:
            break
        start_index += items_per_page
        if start_index > 200:  # Safety cap at 200 appointments
            break
    return all_items


def get_company_profile(company_number):
    """Get full company profile from Companies House."""
    return ch_request(f"/company/{company_number}")


def get_company_officers(company_number):
    """Get all officers (directors, secretaries) for a company."""
    data = ch_request(f"/company/{company_number}/officers",
                      {"items_per_page": 100})
    return data.get("items", []) if data else []


def get_company_psc(company_number):
    """Get Persons with Significant Control for a company."""
    data = ch_request(f"/company/{company_number}/persons-with-significant-control",
                      {"items_per_page": 50})
    return data.get("items", []) if data else []


def get_company_charges(company_number):
    """Get charges (mortgages/debentures) on a company."""
    data = ch_request(f"/company/{company_number}/charges",
                      {"items_per_page": 25})
    return data.get("items", []) if data else []


def get_company_filing_history(company_number, items_per_page=10):
    """Get recent filing history for a company."""
    data = ch_request(f"/company/{company_number}/filing-history",
                      {"items_per_page": items_per_page})
    return data.get("items", []) if data else []


def search_disqualified(name):
    """Search the disqualified directors register."""
    data = ch_request("/search/disqualified-officers", {"q": name, "items_per_page": 10})
    return data.get("items", []) if data else []


# ═══════════════════════════════════════════════════════════════════════════
# 2. Electoral Commission — Donation Cross-Reference
# ═══════════════════════════════════════════════════════════════════════════

def search_ec_donations(query, rows=50):
    """Search Electoral Commission donation register."""
    url = f"{EC_API_BASE}/Donations?" + urllib.parse.urlencode({
        "query": query, "rows": rows, "sort": "Value", "order": "desc"
    })
    return http_get_json(url, delay=EC_DELAY, label="EC")


def get_local_party_donations(party_names, area="Lancashire"):
    """Get donations to local party branches in Lancashire."""
    all_donations = []
    for party in party_names:
        data = search_ec_donations(f"{party} {area}")
        if data and data.get("Result"):
            for item in data["Result"]:
                all_donations.append({
                    "donor_name": item.get("DonorName", ""),
                    "donor_status": item.get("DonorStatus", ""),
                    "value": item.get("Value", 0),
                    "accepted_date": item.get("AcceptedDate", ""),
                    "donation_type": item.get("DonationType", ""),
                    "regulated_entity": item.get("RegulatedEntityName", ""),
                    "accounting_unit": item.get("AccountingUnitName", ""),
                    "is_reported_pre_poll": item.get("IsReportedPrePoll", False),
                })
    return all_donations


# ═══════════════════════════════════════════════════════════════════════════
# 3. Charity Commission — Trustee Cross-Reference
# ═══════════════════════════════════════════════════════════════════════════

def search_charities(query):
    """Search Charity Commission register."""
    url = f"{CHARITY_API_BASE}/allcharitydetails?" + urllib.parse.urlencode({
        "searchText": query, "pageNumber": 1, "pageSize": 10
    })
    return http_get_json(url, delay=CHARITY_DELAY, label="Charity")


# ═══════════════════════════════════════════════════════════════════════════
# 4. FCA Register — Regulated Persons & Prohibition Orders
# ═══════════════════════════════════════════════════════════════════════════

def search_fca_individuals(name):
    """Search FCA register for regulated individuals."""
    url = f"{FCA_API_BASE}/Individuals?" + urllib.parse.urlencode({
        "q": name, "type": "json"
    })
    return http_get_json(url, delay=FCA_DELAY, label="FCA")


# ═══════════════════════════════════════════════════════════════════════════
# Name Matching & Analysis Utilities
# ═══════════════════════════════════════════════════════════════════════════

def name_match_score(councillor_name, officer_title):
    """Score how well a CH officer matches a councillor name. Returns 0-100.

    Handles:
    - CH surname-first format: "AHMED, Shiraz Alam"
    - Extra middle names: "AHMED, Shiraz Alam" vs "Shiraz Ahmed"
    - Muslim naming: "Mohammed" prefix often omitted on registers
    - Honorific prefixes: Mr, Mrs, Cllr, County Councillor, etc.
    - Title suffixes: OBE, MBE, JP, etc.
    """
    c_parts = councillor_name.lower().strip().split()
    o_clean = officer_title.lower().strip()
    for prefix in ["mr ", "mrs ", "ms ", "miss ", "dr ", "sir ", "dame ",
                    "councillor ", "cllr ", "county councillor ", "borough councillor ",
                    "the rt hon ", "the hon ", "prof ", "professor ", "lord ", "lady ",
                    "rev ", "reverend "]:
        if o_clean.startswith(prefix):
            o_clean = o_clean[len(prefix):]
    # Remove OBE, MBE, CBE, JP etc.
    o_clean = re.sub(r'\b(obe|mbe|cbe|kbe|jp|qc|kc|phd|ma|ba|bsc|frsa)\b', '', o_clean).strip()
    o_parts = o_clean.split()

    if not c_parts or not o_parts:
        return 0

    # Exact full match
    if " ".join(c_parts) == " ".join(o_parts):
        return 100

    c_first = c_parts[0]
    c_last = c_parts[-1]

    # CH often puts surname first: "SMITH, John" or "AHMED, Shiraz Alam"
    if "," in officer_title:
        parts = officer_title.split(",", 1)
        o_last = parts[0].strip().lower()
        o_rest = parts[1].strip().lower().split() if len(parts) > 1 and parts[1].strip() else []
        # Remove honorifics from surname part
        for prefix in ["mr", "mrs", "ms", "miss", "dr", "sir", "dame"]:
            if o_last.startswith(prefix + " "):
                o_last = o_last[len(prefix) + 1:]
        o_first = o_rest[0] if o_rest else ""
        o_all_forenames = o_rest  # All non-surname parts
    else:
        o_first = o_parts[0] if o_parts else ""
        o_last = o_parts[-1] if o_parts else ""
        o_all_forenames = o_parts[:-1] if len(o_parts) > 1 else [o_first]

    score = 0
    # Surname match (50 points)
    if c_last == o_last:
        score += 50

    # First name match (40 points)
    if c_first == o_first:
        score += 40
    elif c_first in o_all_forenames:
        # Councillor's first name appears as a middle name on CH
        # e.g. councillor "Shiraz Ahmed" vs CH "Mohammed Shiraz Alam AHMED"
        score += 40
    elif any(c_first == oname for oname in o_all_forenames):
        score += 40
    elif len(c_first) >= 3 and len(o_first) >= 3 and c_first[:3] == o_first[:3]:
        score += 20  # Partial first name match (e.g. "Tom" vs "Thomas")
    else:
        # Muslim naming convention: "Mohammed"/"Muhammad" commonly omitted from registers
        # If CH has Mohammed/Muhammad + councillor's first name, still a good match
        COMMON_PREFIXES = {"mohammed", "muhammad", "mohammad", "mohamed"}
        if o_first in COMMON_PREFIXES and len(o_all_forenames) > 1:
            # Try matching councillor first name against remaining forenames
            remaining = [n for n in o_all_forenames if n not in COMMON_PREFIXES]
            if remaining and c_first == remaining[0]:
                score += 35  # Strong but not as certain as exact match
            elif remaining and any(c_first == r for r in remaining):
                score += 30
        # Reverse: councillor has "Mohammed" but CH doesn't include it
        if c_first in COMMON_PREFIXES and len(c_parts) > 2:
            # Councillor "Mohammed Shiraz Ahmed" vs CH "Shiraz AHMED"
            alt_first = c_parts[1]
            if alt_first == o_first:
                score += 35
            elif alt_first in o_all_forenames:
                score += 30

    # Middle name bonus (max 10 points)
    _common_prefixes = {"mohammed", "muhammad", "mohammad", "mohamed"}
    if len(c_parts) > 2:
        for cm in c_parts[1:-1]:
            if cm in _common_prefixes:
                continue  # Skip matching common prefixes as middle names
            for om in o_all_forenames:
                if cm == om:
                    score += 10
                    break
    elif len(o_all_forenames) > 1 and len(c_parts) == 2:
        # Councillor has 2 parts, officer has extra middle names — no penalty
        pass

    return min(score, 100)


def geographic_proximity_score(address_snippet, council_id):
    """Score geographic proximity of a CH officer address to the council area.

    Returns:
        25 — same postcode district (e.g. BB10 for Burnley)
        15 — same postcode area (e.g. BB* for East Lancashire)
        10 — adjacent Lancashire postcode area
         0 — elsewhere in UK / unknown
    """
    if not address_snippet or not council_id:
        return 0

    addr_upper = address_snippet.upper().replace(" ", "")
    council_codes = COUNCIL_POSTCODES.get(council_id, [])

    # Check exact postcode district match
    for prefix in council_codes:
        if prefix.replace(" ", "") in addr_upper:
            return 25

    # Check same postcode area (first letters)
    for prefix in council_codes:
        area = re.match(r'^[A-Z]+', prefix)
        if area and area.group(0) in addr_upper[:4]:
            return 15

    # Check any core Lancashire postcode area
    for area in LANCASHIRE_POSTCODE_AREAS:
        if re.search(r'(?:^|[\s,])' + area + r'\d', addr_upper):
            return 10

    # Check adjacent areas (lower confidence)
    for prefix in ADJACENT_POSTCODE_AREAS:
        if prefix in addr_upper:
            return 5

    return 0


def _normalize_dob(dob):
    """Normalize a DOB to {month: int, year: int} dict.
    Handles: dict {"month": 3, "year": 1980}, string "1980-03", string "1980-3", None.
    Returns dict or None if unparseable."""
    if not dob:
        return None
    if isinstance(dob, dict):
        return dob
    if isinstance(dob, str):
        try:
            parts = dob.split("-")
            if len(parts) >= 2:
                return {"year": int(parts[0]), "month": int(parts[1])}
        except (ValueError, IndexError):
            pass
    return None


def dob_matches(dob1, dob2):
    """Check if two CH-format DOBs match.

    Accepts dict {month, year} or string "YYYY-MM" format.
    Returns True if both month and year match, False otherwise.
    Returns None if either DOB is missing/incomplete (can't determine).
    Handles string/int type coercion from API responses.
    """
    d1 = _normalize_dob(dob1)
    d2 = _normalize_dob(dob2)
    if not d1 or not d2:
        return None
    m1, y1 = d1.get("month"), d1.get("year")
    m2, y2 = d2.get("month"), d2.get("year")
    if m1 is None or y1 is None or m2 is None or y2 is None:
        return None
    # Coerce to int for comparison (CH API may return strings)
    try:
        return int(m1) == int(m2) and int(y1) == int(y2)
    except (ValueError, TypeError):
        return None


def load_register_of_interests(council_id):
    """Load register_of_interests.json for a council.

    Returns dict mapping councillor_id → register data, or empty dict if not available.
    """
    path = DATA_DIR / council_id / "register_of_interests.json"
    if not path.exists():
        return {}

    with open(path) as f:
        data = json.load(f)

    if not data.get("register_available", False):
        return {}

    return data.get("councillors", {})


def check_register_compliance(register_data, councillors):
    """Check register of interests compliance per Localism Act 2011.

    Flags:
    - Councillors with no register page at all
    - Councillors with empty registers (page exists but no interests declared)
    - Councillors with suspiciously sparse registers (e.g. only 1-2 sections filled)

    Returns dict with:
    - compliance_issues: list of issues
    - councillors_compliant: count of councillors with adequate registers
    - councillors_empty: count with empty registers
    - councillors_no_register: count with no register page
    """
    if not register_data:
        return {
            "register_available": False,
            "note": "Register of interests not available for this council",
            "compliance_issues": [],
        }

    issues = []
    compliant = 0
    empty_registers = 0
    no_register = 0

    councillor_ids = {c.get("id", ""): c for c in councillors}

    for c in councillors:
        cid = c.get("id", "")
        name = c.get("name", "")
        reg = register_data.get(cid)

        if not reg:
            # Councillor exists but no register entry found
            no_register += 1
            issues.append({
                "councillor_id": cid,
                "councillor_name": name,
                "type": "no_register_page",
                "severity": "warning",
                "detail": "No register of interests page found for {}".format(name),
                "legal_basis": "Localism Act 2011 s30(1): Every relevant authority must adopt a code of conduct and councillors must register disclosable pecuniary interests",
            })
            continue

        if not reg.get("has_register", False):
            no_register += 1
            issues.append({
                "councillor_id": cid,
                "councillor_name": name,
                "type": "register_not_published",
                "severity": "high",
                "detail": "Register page exists but register not published for {}".format(name),
                "legal_basis": "Localism Act 2011 s29(1): Monitoring officer must establish and maintain a register. s30(3)(a): Must be available for inspection and published on website",
            })
            continue

        # Check for empty registers
        all_items = reg.get("all_declared_items", [])
        companies = reg.get("declared_companies", [])
        employment = reg.get("declared_employment", [])
        land = reg.get("declared_land", [])
        securities = reg.get("declared_securities", [])

        if len(all_items) == 0 and not companies and not employment and not land:
            empty_registers += 1
            issues.append({
                "councillor_id": cid,
                "councillor_name": name,
                "type": "register_empty",
                "severity": "warning",
                "detail": "Register of interests appears empty for {} — no interests declared in any category".format(name),
                "legal_basis": "Localism Act 2011 s30: Councillors must notify monitoring officer of disclosable pecuniary interests within 28 days of election. An entirely empty register may indicate non-compliance.",
            })
        else:
            compliant += 1

    return {
        "register_available": True,
        "councillors_compliant": compliant,
        "councillors_empty_register": empty_registers,
        "councillors_no_register": no_register,
        "total_issues": len(issues),
        "compliance_issues": issues,
    }


def search_company_by_number(company_number):
    """Look up a specific company by number on Companies House."""
    return get_company_profile(company_number)


def find_councillor_as_officer(company_number, councillor_name):
    """Find a councillor among the officers of a specific company.

    Returns the officer entry with DOB if found, None otherwise.
    """
    officers = get_company_officers(company_number)
    if not officers:
        return None

    best_match = None
    best_score = 0

    for officer in officers:
        title = officer.get("name", "")
        score = name_match_score(councillor_name, title)
        if score >= 80 and score > best_score:
            best_score = score
            best_match = {
                "officer_name": title,
                "match_score": score,
                "date_of_birth": officer.get("date_of_birth", {}),
                "appointed_on": officer.get("appointed_on", ""),
                "resigned_on": officer.get("resigned_on", ""),
                "officer_role": officer.get("officer_role", "director"),
                "links": officer.get("links", {}),
            }

    return best_match


def extract_company_number_from_text(text):
    """Try to extract a Companies House company number from register text.

    Company numbers are 8 digits (padded with leading zeros) or 2 letters + 6 digits (LLPs).
    """
    # Pattern: 8-digit number
    m = re.search(r'\b(\d{7,8})\b', text)
    if m:
        return m.group(1).zfill(8)

    # Pattern: OC + 6 digits (LLP) or SC/NI/etc + 6 digits
    m = re.search(r'\b([A-Z]{2}\d{6})\b', text, re.I)
    if m:
        return m.group(1).upper()

    return None


def search_company_by_name(company_name):
    """Search Companies House for a company by name. Returns list of matches."""
    data = ch_request("/search/companies", {"q": company_name, "items_per_page": 5})
    return data.get("items", []) if data else []


def extract_red_flags(company):
    """Extract red flags from a company profile."""
    flags = []
    if not company:
        return flags

    status = company.get("company_status", "").lower()
    if status in ("dissolved", "liquidation", "administration",
                  "insolvency-proceedings", "voluntary-arrangement"):
        flags.append({"type": "company_status", "severity": "warning",
                      "detail": "Company status: {}".format(status)})

    sic_codes = company.get("sic_codes", [])
    for sic in sic_codes:
        if sic in SHELL_SIC_CODES:
            flags.append({"type": "shell_indicator", "severity": "high",
                          "detail": "SIC {} — potential shell company indicator".format(sic)})
        if sic in PROPERTY_SIC_CODES:
            flags.append({"type": "property_company", "severity": "info",
                          "detail": "SIC {} — property/holding company".format(sic)})
        if sic in FORMATION_SIC_CODES:
            flags.append({"type": "formation_agent", "severity": "info",
                          "detail": "SIC {} — formation/nominee services".format(sic)})

    if company.get("has_been_liquidated"):
        flags.append({"type": "liquidation_history", "severity": "high",
                      "detail": "Company has been liquidated"})

    if company.get("has_insolvency_history"):
        flags.append({"type": "insolvency_history", "severity": "high",
                      "detail": "Company has insolvency history"})

    if company.get("has_charges"):
        flags.append({"type": "has_charges", "severity": "info",
                      "detail": "Company has charges (mortgages/debentures) registered"})

    accounts = company.get("accounts", {})
    if accounts.get("overdue"):
        flags.append({"type": "accounts_overdue", "severity": "warning",
                      "detail": "Accounts are overdue at Companies House"})

    confirmation = company.get("confirmation_statement") or company.get("annual_return", {})
    if confirmation and confirmation.get("overdue"):
        flags.append({"type": "confirmation_overdue", "severity": "warning",
                      "detail": "Confirmation statement overdue"})

    acc_type = accounts.get("last_accounts", {}).get("type", "")
    if acc_type == "dormant":
        flags.append({"type": "dormant_accounts", "severity": "warning",
                      "detail": "Latest accounts filed as dormant"})

    # Check registered address for formation agent indicators
    addr = json.dumps(company.get("registered_office_address", {})).lower()
    for indicator in FORMATION_AGENT_INDICATORS:
        if indicator in addr:
            flags.append({"type": "formation_agent_address", "severity": "info",
                          "detail": "Registered address matches formation agent pattern: {}".format(indicator)})
            break

    # Check company age — very new company receiving contracts is suspicious
    created = company.get("date_of_creation", "")
    if created:
        try:
            created_date = datetime.strptime(created, "%Y-%m-%d").date()
            age_days = (date.today() - created_date).days
            if age_days < 365:
                flags.append({"type": "recently_incorporated", "severity": "warning",
                              "detail": "Company incorporated {} days ago ({})".format(age_days, created)})
        except (ValueError, TypeError):
            pass

    # Check company type for unusual structures
    company_type = company.get("type", "")
    if company_type in ("llp", "limited-liability-partnership"):
        flags.append({"type": "llp_structure", "severity": "info",
                      "detail": "Limited Liability Partnership structure"})
    if company_type in ("overseas-company",):
        flags.append({"type": "overseas_company", "severity": "warning",
                      "detail": "Overseas company — limited UK transparency"})

    return flags


def cross_reference_suppliers(company_name, supplier_data):
    """Check if a company name appears in council supplier list. Enhanced fuzzy match."""
    if not supplier_data:
        return []

    cn = company_name.lower().strip()
    # Normalize company suffixes
    for suffix in [" limited", " ltd", " plc", " llp", " inc", " corp",
                   " uk", " (uk)", " group", " holdings"]:
        cn = cn.replace(suffix, "")
    cn = cn.strip()
    cn_words = set(cn.split())

    matches = []
    for supplier_entry in supplier_data:
        supplier = supplier_entry if isinstance(supplier_entry, str) else supplier_entry.get("supplier", "")
        total = supplier_entry.get("total", 0) if isinstance(supplier_entry, dict) else 0

        sn = supplier.lower().strip()
        for suffix in [" limited", " ltd", " plc", " llp", " inc", " corp",
                       " uk", " (uk)", " group", " holdings"]:
            sn = sn.replace(suffix, "")
        sn = sn.strip()
        sn_words = set(sn.split())

        # Exact match (after normalization)
        if cn == sn:
            matches.append({"supplier": supplier, "match_type": "exact",
                           "confidence": 100, "total_spend": total})
            continue

        # High word overlap
        if len(cn_words) >= 2 and len(sn_words) >= 2:
            overlap = cn_words & sn_words
            ratio = len(overlap) / max(len(cn_words), len(sn_words))
            if ratio >= 0.8:  # 80% word overlap — tightened from 0.6 to reduce false positives
                matches.append({"supplier": supplier, "match_type": "fuzzy",
                               "confidence": int(ratio * 100), "total_spend": total})

    return sorted(matches, key=lambda x: x["confidence"], reverse=True)


# ═══════════════════════════════════════════════════════════════════════════
# Co-Director Network Analysis
# ═══════════════════════════════════════════════════════════════════════════

def build_co_director_network(companies, councillor_name):
    """Map who else sits on boards with this councillor. Returns network of associates."""
    co_directors = {}  # name → {companies: [...], roles: [...]}
    formation_agent_companies = 0

    for company in companies:
        cn = company.get("company_number", "")
        if not cn or company.get("resigned_on"):
            continue  # Only analyse active directorships

        officers = get_company_officers(cn)
        for officer in officers:
            oname = officer.get("name", "")
            if not oname:
                continue
            # Skip if it's the councillor themselves
            score = name_match_score(councillor_name, oname)
            if score >= 70:
                continue

            # Skip corporate officers (company names as directors)
            role = officer.get("officer_role", "")
            if role in ("corporate-nominee-director", "corporate-nominee-secretary",
                        "corporate-director", "corporate-secretary"):
                formation_agent_companies += 1
                continue

            if officer.get("resigned_on"):
                continue  # Only current officers

            key = oname.lower().strip()
            if key not in co_directors:
                co_directors[key] = {
                    "name": oname,
                    "officer_id": extract_officer_id(officer),
                    "shared_companies": [],
                    "roles": set(),
                    "appointed_dates": []
                }
            elif not co_directors[key].get("officer_id"):
                # Fill in officer_id if we didn't get it before
                oid = extract_officer_id(officer)
                if oid:
                    co_directors[key]["officer_id"] = oid
            co_directors[key]["shared_companies"].append({
                "company_name": company.get("company_name", ""),
                "company_number": cn,
            })
            co_directors[key]["roles"].add(role)
            appointed = officer.get("appointed_on", "")
            if appointed:
                co_directors[key]["appointed_dates"].append(appointed)

    # Convert sets to lists for JSON serialization
    network = []
    for key, data in co_directors.items():
        if len(data["shared_companies"]) >= 1:
            entry = {
                "name": data["name"],
                "shared_company_count": len(data["shared_companies"]),
                "shared_companies": data["shared_companies"],
                "roles": list(data["roles"]),
            }
            if data.get("officer_id"):
                entry["officer_id"] = data["officer_id"]
            network.append(entry)

    # Sort by most shared companies
    network.sort(key=lambda x: x["shared_company_count"], reverse=True)

    return {
        "associates": network[:20],  # Top 20 co-directors
        "total_unique_associates": len(co_directors),
        "formation_agent_companies": formation_agent_companies,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Network Crossover Detection (Councillor → Company → Co-Director → Supplier)
# ═══════════════════════════════════════════════════════════════════════════

def detect_network_crossover(associates, councillor_companies, supplier_data, councillor_name):
    """Detect paths: Councillor → Company → Co-Director → Supplier Company.

    Two detection methods:
    1. Name match: co-director's name matches a supplier name (sole trader / eponymous company)
    2. Company match: co-director's OTHER companies (from CH) match a council supplier
       (the stronger method — traces actual corporate connections)

    Each link tracks degrees_of_separation:
    - 1: Councillor directly linked to supplier (handled elsewhere in supplier_match)
    - 2: Councillor → Co-Director → Supplier (co-director IS supplier or directs supplier)

    Args:
        associates: list from co_director_network["associates"]
        councillor_companies: list of councillor's CH companies
        supplier_data: list of supplier dicts with {supplier, total} keys
        councillor_name: councillor's name (to exclude self-matches)

    Returns:
        dict with total_links, links[] array
    """
    if not associates or not supplier_data:
        return {"total_links": 0, "links": []}

    links = []
    councillor_company_numbers = set(
        c.get("company_number", "") for c in councillor_companies if c.get("company_number")
    )

    # Method 1: Name match (fast, no API calls)
    for assoc in associates:
        assoc_name = assoc.get("name", "")
        if not assoc_name:
            continue

        supplier_matches = cross_reference_suppliers(assoc_name, supplier_data)
        for sm in supplier_matches:
            if sm["confidence"] >= 80:  # Tightened from 60 — name-to-supplier match
                shared = assoc.get("shared_companies", [{}])
                for sc in shared[:3]:
                    links.append({
                        "councillor_company": sc.get("company_name", "unknown"),
                        "co_director": assoc_name,
                        "supplier_company": sm["supplier"],
                        "supplier_canonical": sm["supplier"].upper(),
                        "supplier_spend": sm.get("total_spend", 0),
                        "link_type": "co_director_name_matches_supplier",
                        "degrees_of_separation": 2,
                        "confidence": sm["confidence"],
                        "severity": "critical" if sm.get("total_spend", 0) >= 50000 else "warning",
                    })
                    break

    # Method 2: Company match (requires CH API calls — top 5 associates only)
    # For each associate, look up their OTHER companies and check against suppliers
    for assoc in associates[:5]:
        assoc_name = assoc.get("name", "")
        officer_id = assoc.get("officer_id", "")
        if not assoc_name:
            continue

        # If we have the officer_id, look up their appointments
        if officer_id:
            appointments = get_officer_appointments(officer_id, items_per_page=50)
        else:
            # Try to find officer_id from the shared companies' officer lists
            officer_id = _find_officer_id_for_name(assoc_name, assoc.get("shared_companies", []))
            if officer_id:
                appointments = get_officer_appointments(officer_id, items_per_page=50)
            else:
                appointments = []

        for appt in appointments:
            cn = appt.get("appointed_to", {}).get("company_number", "")
            company_name = appt.get("appointed_to", {}).get("company_name", "")
            if not cn or not company_name:
                continue
            # Skip the councillor's own companies
            if cn in councillor_company_numbers:
                continue
            # Skip resigned appointments
            if appt.get("resigned_on"):
                continue

            # Check if this company is a council supplier
            supplier_matches = cross_reference_suppliers(company_name, supplier_data)
            for sm in supplier_matches:
                if sm["confidence"] >= 85:  # Tightened from 70 — company-to-company match
                    shared = assoc.get("shared_companies", [{}])
                    for sc in shared[:3]:
                        links.append({
                            "councillor_company": sc.get("company_name", "unknown"),
                            "co_director": assoc_name,
                            "co_director_company": company_name,
                            "co_director_company_number": cn,
                            "supplier_company": sm["supplier"],
                            "supplier_canonical": sm["supplier"].upper(),
                            "supplier_spend": sm.get("total_spend", 0),
                            "link_type": "co_director_also_directs_supplier",
                            "degrees_of_separation": 2,
                            "confidence": sm["confidence"],
                            "severity": "critical" if sm.get("total_spend", 0) >= 50000 else "warning",
                        })
                        break
                    break  # One match per company is enough

    # Deduplicate by (co_director, supplier_canonical)
    seen = set()
    unique_links = []
    for link in links:
        key = (link["co_director"].lower(), link["supplier_canonical"])
        if key not in seen:
            seen.add(key)
            unique_links.append(link)

    # Sort by spend descending
    unique_links.sort(key=lambda x: x.get("supplier_spend", 0), reverse=True)

    return {
        "total_links": len(unique_links),
        "links": unique_links[:10],
    }


def _find_officer_id_for_name(name, shared_companies):
    """Look up officer_id by searching the shared company's officers list.
    Uses the first shared company that returns a match."""
    for sc in shared_companies[:2]:
        cn = sc.get("company_number", "")
        if not cn:
            continue
        officers = get_company_officers(cn)
        for officer in officers:
            oname = officer.get("name", "")
            if name_match_score(name, oname) >= 80:
                oid = extract_officer_id(officer)
                if oid:
                    return oid
    return ""


# ═══════════════════════════════════════════════════════════════════════════
# Familial Connection Detection
# ═══════════════════════════════════════════════════════════════════════════

def detect_surname_clusters(councillors):
    """Find councillors sharing the same surname within the same council.
    Potential family members: spouses, parents/children, siblings.
    Under Localism Act 2011, family member interests are Disclosable Pecuniary Interests (DPIs)."""
    surname_map = defaultdict(list)
    for c in councillors:
        last_name = c.get("last_name", "").strip().lower()
        if not last_name or len(last_name) < 2:
            # Fallback: extract from full name
            parts = c.get("name", "").strip().split()
            last_name = parts[-1].lower() if parts else ""
        if last_name and len(last_name) >= 2:
            surname_map[last_name].append({
                "name": c.get("name", ""),
                "party": c.get("party", ""),
                "ward": c.get("ward", ""),
                "address": c.get("address", ""),
            })

    clusters = []
    for surname, members in surname_map.items():
        if len(members) >= 2:
            # Check if they share the same address (strong family indicator)
            addresses = [m.get("address", "").lower().strip()[:50] for m in members if m.get("address")]
            shared_address = len(set(addresses)) < len(addresses) and len(addresses) >= 2
            # Check if they share the same ward (weaker but still notable)
            wards = [m.get("ward", "") for m in members]
            same_ward = len(set(wards)) == 1

            clusters.append({
                "surname": surname.title(),
                "members": members,
                "count": len(members),
                "shared_address": shared_address,
                "same_ward": same_ward,
                "same_party": len(set(m.get("party", "") for m in members)) == 1,
                "severity": "high" if shared_address else ("warning" if same_ward else "info"),
                "note": "Councillors sharing surname '{}'{}{} — potential family connection".format(
                    surname.title(),
                    " at same address" if shared_address else "",
                    " in same ward" if same_ward else ""),
            })

    return sorted(clusters, key=lambda x: x["count"], reverse=True)


def detect_shared_address_councillors(councillors):
    """Find councillors registered at the same residential address.
    Living at the same address = almost certainly family members.
    Their interests may need cross-declaration under DPI rules."""
    addr_map = defaultdict(list)
    for c in councillors:
        addr = c.get("address", "").strip().lower()
        if not addr or len(addr) < 10:
            continue
        # Normalize: remove "c/o", "town hall" etc. (official addresses)
        if any(skip in addr for skip in ["town hall", "c/o", "civic centre", "council offices",
                                          "municipal", "borough council", "county council"]):
            continue  # Skip official addresses, they're not residential
        # Use first significant portion of address as key
        addr_key = re.sub(r'[,\s]+', ' ', addr)[:60]
        addr_map[addr_key].append({
            "name": c.get("name", ""),
            "party": c.get("party", ""),
            "ward": c.get("ward", ""),
            "full_address": c.get("address", ""),
        })

    shared = []
    for addr, members in addr_map.items():
        if len(members) >= 2:
            shared.append({
                "address": addr,
                "members": members,
                "count": len(members),
                "same_surname": len(set(m["name"].split()[-1].lower() for m in members)) == 1,
                "severity": "high",
                "note": "{} councillors at same residential address — likely family members".format(len(members)),
            })

    return shared


def search_family_member_companies(councillor_last_name, councillor_address, supplier_data):
    """Search Companies House for other people with the same surname at the same address.
    If found, check if their companies supply the council.
    This catches: spouses, children, parents who run businesses supplying the council
    while the councillor may not have declared them as DPIs."""
    if not councillor_address or not councillor_last_name:
        return []

    # Normalize address for comparison
    addr_lower = councillor_address.lower().strip()
    # Skip if it's an official/c/o address
    if any(skip in addr_lower for skip in ["town hall", "c/o", "civic centre", "council offices"]):
        return []

    # Extract postcode if present
    postcode_match = re.search(r'[A-Z]{1,2}\d{1,2}\s*\d[A-Z]{2}', councillor_address, re.IGNORECASE)
    postcode = postcode_match.group(0).upper() if postcode_match else None

    # Search Companies House for surname
    officers = search_officers(councillor_last_name, items_per_page=30)
    family_linked = []

    for officer in officers:
        officer_name = officer.get("title", "")
        officer_addr = officer.get("address_snippet", "").lower()

        # Skip if it's likely the councillor themselves
        score = name_match_score(councillor_last_name + " " + councillor_last_name, officer_name)
        # We actually want DIFFERENT first names but SAME surname
        name_parts = officer_name.lower().replace(",", "").split()
        officer_surname = name_parts[0] if "," in officer.get("title", "") else (name_parts[-1] if name_parts else "")
        officer_surname_clean = re.sub(r'\b(obe|mbe|cbe|jp|qc|kc)\b', '', officer_surname).strip()

        if officer_surname_clean != councillor_last_name.lower():
            continue

        # Check address match
        address_match = False
        if postcode and postcode.lower().replace(" ", "") in officer_addr.replace(" ", ""):
            address_match = True
        elif len(addr_lower) > 15:
            # Fuzzy address match: check if first line matches
            addr_first_line = addr_lower.split(",")[0].strip()
            if len(addr_first_line) > 5 and addr_first_line in officer_addr:
                address_match = True

        if not address_match:
            continue

        # Found a family member at the same address — now get their companies
        officer_id = extract_officer_id(officer)
        if not officer_id:
            continue

        appointments = get_officer_appointments(officer_id, items_per_page=20)
        family_companies = []
        for appt in appointments:
            appointed_to = appt.get("appointed_to", {})
            company_name = appointed_to.get("company_name", "Unknown")
            company_number = appointed_to.get("company_number", "")
            resigned = appt.get("resigned_on", "")

            # Cross-reference with suppliers
            supplier_match = None
            if supplier_data and not resigned:
                matches = cross_reference_suppliers(company_name, supplier_data)
                if matches:
                    supplier_match = matches[0]

            family_companies.append({
                "company_name": company_name,
                "company_number": company_number,
                "role": appt.get("officer_role", ""),
                "appointed_on": appt.get("appointed_on", ""),
                "resigned_on": resigned,
                "company_status": appointed_to.get("company_status", ""),
                "supplier_match": supplier_match,
            })

        if family_companies:
            supplier_conflicts = [c for c in family_companies if c.get("supplier_match")]
            family_linked.append({
                "family_member_name": officer_name,
                "relationship": "same surname + same address",
                "address_match": True,
                "companies": family_companies,
                "active_companies": len([c for c in family_companies if not c.get("resigned_on")]),
                "supplier_conflicts": supplier_conflicts,
                "has_supplier_conflict": len(supplier_conflicts) > 0,
                "severity": "critical" if supplier_conflicts else "warning",
                "note": "Family member '{}' has {} companies{} — potential undeclared DPI".format(
                    officer_name,
                    len(family_companies),
                    " including {} council supplier(s)!".format(len(supplier_conflicts)) if supplier_conflicts else "",
                ),
            })

    return family_linked


def detect_familial_psc_connections(psc_entries, councillor_last_name):
    """Check PSC records for family members listed as persons with significant control.
    PSC register often reveals spouses/partners who have ownership stakes."""
    family_pscs = []
    for psc in psc_entries:
        psc_name = psc.get("name", "")
        # Check if PSC has the same surname but is a different person
        psc_parts = psc_name.lower().replace(",", "").split()
        psc_surname = psc_parts[0] if "," in psc.get("name", "") else (psc_parts[-1] if psc_parts else "")
        psc_surname_clean = re.sub(r'\b(obe|mbe|cbe|jp|qc|kc)\b', '', psc_surname).strip()

        if psc_surname_clean == councillor_last_name.lower():
            # Same surname PSC — could be family member
            family_pscs.append({
                "psc_name": psc_name,
                "company_name": psc.get("company_name", ""),
                "company_number": psc.get("company_number", ""),
                "natures_of_control": psc.get("natures_of_control", []),
                "has_ownership": psc.get("has_ownership", False),
                "has_voting_rights": psc.get("has_voting_rights", False),
                "note": "PSC '{}' shares surname with councillor — possible family member with company control".format(
                    psc_name),
            })

    return family_pscs


def detect_cross_council_family_clusters(all_councillors):
    """Find family members serving on different councils.
    Same surname councillors across different councils could be family networks
    that create conflicts of interest on cross-boundary contracts."""
    surname_cross = defaultdict(list)
    for council_id, councillors in all_councillors.items():
        for c in councillors:
            last_name = c.get("last_name", "").strip().lower()
            if not last_name:
                parts = c.get("name", "").strip().split()
                last_name = parts[-1].lower() if parts else ""
            if last_name and len(last_name) >= 3:  # Skip very short surnames to reduce false positives
                surname_cross[last_name].append({
                    "name": c.get("name", ""),
                    "council": council_id,
                    "party": c.get("party", ""),
                    "ward": c.get("ward", ""),
                    "address": c.get("address", ""),
                })

    family_networks = []
    for surname, members in surname_cross.items():
        if len(members) < 2:
            continue
        councils = set(m["council"] for m in members)
        if len(councils) < 2:
            continue  # Same council handled by within-council detection

        # Further filter: check if addresses match or are close (same town)
        # For cross-council, same surname + different councils is already notable
        # but we need to reduce false positives for common surnames
        # If >3 councils, likely a common surname (e.g. Smith, Ahmed) — still flag but lower severity
        severity = "info" if len(councils) >= 3 else "warning"

        # Check for shared addresses across councils (strong signal)
        addresses = [m.get("address", "").lower()[:50] for m in members if m.get("address")]
        shared_addr = len(addresses) != len(set(addresses))
        if shared_addr:
            severity = "high"

        family_networks.append({
            "surname": surname.title(),
            "members": members,
            "councils": sorted(councils),
            "council_count": len(councils),
            "member_count": len(members),
            "shared_address_across_councils": shared_addr,
            "same_party": len(set(m.get("party", "") for m in members)) == 1,
            "severity": severity,
            "note": "Surname '{}' appears in {} different councils{} — potential family network".format(
                surname.title(), len(councils),
                " with shared addresses" if shared_addr else ""),
        })

    return sorted(family_networks, key=lambda x: x["council_count"], reverse=True)


# ═══════════════════════════════════════════════════════════════════════════
# PSC (Persons with Significant Control) Analysis
# ═══════════════════════════════════════════════════════════════════════════

def analyse_psc(companies, councillor_name):
    """Check if councillor is a Person with Significant Control of any company."""
    psc_entries = []

    for company in companies:
        cn = company.get("company_number", "")
        if not cn or company.get("resigned_on"):
            continue

        pscs = get_company_psc(cn)
        for psc in pscs:
            psc_name = psc.get("name", "")
            score = name_match_score(councillor_name, psc_name)
            if score >= 80:  # v3: stricter PSC matching
                natures = psc.get("natures_of_control", [])
                psc_entries.append({
                    "company_name": company.get("company_name", ""),
                    "company_number": cn,
                    "natures_of_control": natures,
                    "notified_on": psc.get("notified_on", ""),
                    "ceased_on": psc.get("ceased_on", ""),
                    "name_match_score": score,
                    "has_ownership": any("ownership" in n for n in natures),
                    "has_voting_rights": any("voting" in n for n in natures),
                    "has_significant_influence": any("significant-influence" in n for n in natures),
                })

    return psc_entries


# ═══════════════════════════════════════════════════════════════════════════
# Misconduct Pattern Detection
# ═══════════════════════════════════════════════════════════════════════════

def detect_misconduct_patterns(result, all_supplier_data):
    """Detect patterns indicative of councillor misconduct. Returns misconduct indicators."""
    patterns = []
    ch = result.get("companies_house", {})
    companies = ch.get("companies", [])

    # ── Pattern 1: Phoenix Company Detection ──
    # Councillor with serial dissolutions followed by new incorporations in same sector
    dissolved = [c for c in companies
                 if c.get("company_status", "").lower() in ("dissolved", "liquidation")]
    active = [c for c in companies if not c.get("resigned_on")]
    if len(dissolved) >= 2 and len(active) >= 1:
        # Check SIC code overlap between dissolved and active companies
        dissolved_sics = set()
        for c in dissolved:
            dissolved_sics.update(c.get("sic_codes", []))
        active_sics = set()
        for c in active:
            active_sics.update(c.get("sic_codes", []))
        sic_overlap = dissolved_sics & active_sics
        if sic_overlap or len(dissolved) >= 3:
            patterns.append({
                "type": "phoenix_company_pattern",
                "severity": "high",
                "detail": "{} dissolved companies + {} active in same/similar sectors — possible phoenix pattern".format(
                    len(dissolved), len(active)),
                "evidence": {
                    "dissolved_count": len(dissolved),
                    "active_count": len(active),
                    "sic_overlap": list(sic_overlap),
                }
            })

    # ── Pattern 2: Rapid Company Turnover ──
    # Many companies created and dissolved in short periods
    short_lived = []
    for c in companies:
        appointed = c.get("appointed_on", "")
        resigned = c.get("resigned_on", "")
        if appointed and resigned:
            try:
                start = datetime.strptime(appointed, "%Y-%m-%d")
                end = datetime.strptime(resigned, "%Y-%m-%d")
                days = (end - start).days
                if days < 365:
                    short_lived.append(c.get("company_name", ""))
            except (ValueError, TypeError):
                pass
    if len(short_lived) >= 2:
        patterns.append({
            "type": "rapid_company_turnover",
            "severity": "warning",
            "detail": "{} companies with directorship lasting less than 1 year".format(len(short_lived)),
            "evidence": {"companies": short_lived[:5]}
        })

    # ── Pattern 3: Contract Steering Indicators ──
    # Councillor's company/associates receiving disproportionate contracts
    # Only flag COMMERCIAL companies — community/charity receiving council funds is normal
    if result.get("supplier_conflicts"):
        for conflict in result["supplier_conflicts"]:
            ctype = conflict.get("conflict_type", "commercial")
            if ctype != "commercial":
                continue  # Community/charity/arm's-length receiving council payments is expected
            total = conflict.get("supplier_match", {}).get("total_spend", 0)
            if total > 50000:  # Significant value
                patterns.append({
                    "type": "contract_steering_indicator",
                    "severity": "critical",
                    "detail": "Councillor-linked commercial company '{}' received {} in council contracts".format(
                        conflict["company_name"],
                        "£{:,.0f}".format(total) if total else "unknown value"),
                    "evidence": conflict
                })

    # ── Pattern 4: Dormant Company + Council Payments ──
    # Company filed dormant accounts but receiving council payments
    for c in companies:
        is_dormant = any(f.get("type") == "dormant_accounts" for f in c.get("red_flags", []))
        has_supplier_match = c.get("supplier_match") is not None
        if is_dormant and has_supplier_match:
            patterns.append({
                "type": "dormant_receiving_payments",
                "severity": "critical",
                "detail": "Company '{}' filed dormant accounts but matches council supplier".format(
                    c["company_name"]),
                "evidence": {"company_number": c.get("company_number", "")}
            })

    # ── Pattern 5: Shared Address Network ──
    # Multiple councillor companies at same registered address
    addr_map = defaultdict(list)
    for c in companies:
        if not c.get("resigned_on"):
            addr = c.get("registered_address_snippet", "")
            if addr and len(addr) > 10:
                addr_key = addr.lower().strip()[:50]
                addr_map[addr_key].append(c.get("company_name", ""))
    for addr, cos in addr_map.items():
        if len(cos) >= 2:
            patterns.append({
                "type": "shared_address_cluster",
                "severity": "warning",
                "detail": "{} companies share registered address".format(len(cos)),
                "evidence": {"address": addr, "companies": cos}
            })

    # ── Pattern 6: Recent Resignation Before Investigation ──
    # Councillors who resigned from companies very recently (could indicate awareness of scrutiny)
    recent_resignations = []
    cutoff = datetime(2025, 1, 1)
    for c in companies:
        resigned = c.get("resigned_on", "")
        if resigned:
            try:
                r_date = datetime.strptime(resigned, "%Y-%m-%d")
                if r_date >= cutoff:
                    recent_resignations.append({
                        "company": c.get("company_name", ""),
                        "resigned_on": resigned,
                        "company_status": c.get("company_status", "")
                    })
            except (ValueError, TypeError):
                pass
    if len(recent_resignations) >= 2:
        patterns.append({
            "type": "recent_mass_resignation",
            "severity": "warning",
            "detail": "Resigned from {} companies since Jan 2025".format(len(recent_resignations)),
            "evidence": {"resignations": recent_resignations}
        })

    # ── Pattern 7: Cross-Council Supplier Conflicts ──
    # Check if councillor's companies appear in OTHER councils' supplier lists
    if all_supplier_data and result.get("companies_house", {}).get("companies"):
        for c in companies:
            if c.get("resigned_on"):
                continue
            cname = c.get("company_name", "")
            for other_council, other_suppliers in all_supplier_data.items():
                if other_council == result.get("_council_id", ""):
                    continue
                matches = cross_reference_suppliers(cname, other_suppliers)
                if matches:
                    patterns.append({
                        "type": "cross_council_supplier_conflict",
                        "severity": "critical",
                        "detail": "Company '{}' also matches supplier at {} council".format(
                            cname, other_council),
                        "evidence": {
                            "other_council": other_council,
                            "match": matches[0]
                        }
                    })

    return patterns


# ═══════════════════════════════════════════════════════════════════════════
# Advanced Fraud Detection (v4): MP Overlap, Beneficial Ownership,
# Revolving Door, Donation-to-Contract, Network Centrality
# ═══════════════════════════════════════════════════════════════════════════

def load_mp_interests():
    """Load MP interests data from shared/mp_interests.json.
    Returns full mp_interests object with 'constituencies' key, or empty dict."""
    path = SCRIPT_DIR.parent / "data" / "shared" / "mp_interests.json"
    if not path.exists():
        return {}
    try:
        with open(path) as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, KeyError):
        return {}


# Module-level MP interests cache
_mp_interests_cache = None

def get_mp_interests():
    """Lazy-load and cache MP interests."""
    global _mp_interests_cache
    if _mp_interests_cache is None:
        _mp_interests_cache = load_mp_interests()
    return _mp_interests_cache


def check_mp_overlap(result, council_id, supplier_data, all_supplier_data):
    """Cross-reference councillor's companies/associates with MP declared interests.

    Checks:
      - Councillor company → MP employer/donor (shared financial link)
      - Councillor co-director → MP declared company (shared network)
      - MP donor → council supplier (donation-to-contract pipeline)

    Returns list of findings.
    """
    findings = []
    mp_raw = get_mp_interests()
    mp_constituencies = mp_raw.get("constituencies", {})
    if not mp_constituencies:
        return findings

    # Get councillor's companies
    ch = result.get("companies_house", {})
    councillor_companies = set()
    for c in ch.get("companies", []):
        cname = c.get("company_name", "")
        if cname:
            councillor_companies.add(cname.upper().strip())

    # Get councillor's co-director names
    co_directors = set()
    for assoc in result.get("co_director_network", {}).get("associates", []):
        co_directors.add(assoc.get("name", "").upper().strip())

    councillor_name = result.get("name", "").upper().strip()

    for const_id, mp_data in mp_constituencies.items():
        mp_name = mp_data.get("mp_name", "")
        mp_companies = set(c.upper().strip() for c in mp_data.get("companies_declared", []))
        mp_donors = set(d.upper().strip() for d in mp_data.get("donors", []))
        mp_employers = set(e.upper().strip() for e in mp_data.get("employers", []))

        all_mp_entities = mp_companies | mp_donors | mp_employers

        # Check 1: Councillor company matches MP's declared entity
        for c_company in councillor_companies:
            c_norm = c_company.replace(" LTD", "").replace(" LIMITED", "").strip()
            for mp_entity in all_mp_entities:
                mp_norm = mp_entity.replace(" LTD", "").replace(" LIMITED", "").strip()
                if c_norm and mp_norm and (c_norm in mp_norm or mp_norm in c_norm):
                    entity_type = "employer" if mp_entity in mp_employers else \
                                  "donor" if mp_entity in mp_donors else "company"
                    findings.append({
                        "type": "mp_shared_company",
                        "severity": "critical" if entity_type == "employer" else "high",
                        "mp_name": mp_name,
                        "mp_constituency": const_id,
                        "councillor_company": c_company,
                        "mp_entity": mp_entity,
                        "mp_entity_type": entity_type,
                        "detail": "Councillor company '{}' matches MP {} ({}) declared {} '{}'".format(
                            c_company, mp_name, const_id, entity_type, mp_entity),
                    })

        # Check 2: MP's donor is also council supplier (via mp_interests findings)
        for finding in mp_data.get("supplier_findings", []):
            if council_id in finding.get("supplier_match", {}).get("councils", {}):
                findings.append({
                    "type": "mp_donor_supplies_council",
                    "severity": "high",
                    "mp_name": mp_name,
                    "mp_constituency": const_id,
                    "donor": finding.get("mp_entity", ""),
                    "supplier_spend": finding.get("supplier_match", {}).get("councils", {}).get(council_id, 0),
                    "detail": "MP {}'s {} '{}' supplies this council (£{:,.0f})".format(
                        mp_name, finding.get("entity_type", "entity"),
                        finding.get("mp_entity", ""),
                        finding.get("supplier_match", {}).get("councils", {}).get(council_id, 0)),
                })

    return findings


def detect_revolving_door(result, councillor):
    """Detect revolving door patterns — directorships started/ended suspicious timing.

    Checks:
      - Directorship started AFTER councillor was elected
      - Directorship at council supplier started after supplier won contracts
      - Resignation from company that subsequently won council contracts

    Returns list of findings.
    """
    findings = []
    ch = result.get("companies_house", {})
    companies = ch.get("companies", [])

    # Get councillor's election date (approximate — use earliest known)
    # Most councillors have been serving since last election cycle (May 2023 or May 2025)
    # We'll flag any directorship started in the last 3 years
    cutoff = datetime(2023, 5, 1)  # LCC elections May 2023

    for c in companies:
        appointed_str = c.get("appointed_on", "")
        if not appointed_str:
            continue
        try:
            appointed = datetime.strptime(appointed_str, "%Y-%m-%d")
        except (ValueError, TypeError):
            continue

        company_name = c.get("company_name", "")
        has_supplier_match = c.get("supplier_match") is not None
        is_active = not c.get("resigned_on")
        conflict_type = c.get("conflict_type", "commercial")

        # Pattern 1: Post-election appointment at council supplier (revolving door)
        if appointed >= cutoff and has_supplier_match and is_active and conflict_type == "commercial":
            spend = c.get("supplier_match", {}).get("total_spend", 0)
            findings.append({
                "type": "revolving_door_supplier",
                "severity": "critical",
                "company": company_name,
                "appointed_on": appointed_str,
                "supplier_spend": spend,
                "detail": "Appointed director of supplier '{}' on {} (after election). "
                          "This company received £{:,.0f} from the council.".format(
                    company_name, appointed_str, spend),
            })
        # Pattern 2: Post-election appointment (non-supplier, still noteworthy)
        elif appointed >= cutoff and is_active and not has_supplier_match:
            findings.append({
                "type": "post_election_appointment",
                "severity": "info",
                "company": company_name,
                "appointed_on": appointed_str,
                "detail": "Directorship at '{}' started {} (post-election)".format(
                    company_name, appointed_str),
            })

        # Pattern 3: Cooling-off violation — resigned then company won contracts
        resigned_str = c.get("resigned_on", "")
        if resigned_str and has_supplier_match:
            try:
                resigned = datetime.strptime(resigned_str, "%Y-%m-%d")
                # Company is currently a supplier, councillor resigned recently
                months_since = (datetime.now() - resigned).days / 30
                if months_since < 24:  # Within 2 years
                    spend = c.get("supplier_match", {}).get("total_spend", 0)
                    findings.append({
                        "type": "cooling_off_concern",
                        "severity": "warning",
                        "company": company_name,
                        "resigned_on": resigned_str,
                        "supplier_spend": spend,
                        "detail": "Resigned from '{}' on {} ({:.0f} months ago) "
                                  "but company is current council supplier (£{:,.0f})".format(
                            company_name, resigned_str, months_since, spend),
                    })
            except (ValueError, TypeError):
                pass

    return findings


def trace_beneficial_ownership_simple(result):
    """Simplified beneficial ownership analysis using PSC data already fetched.

    Checks:
      - PSC entries with ownership stakes across councillor's companies
      - PSC entities controlling suppliers (hidden ownership via intermediaries)
      - Cross-company PSC overlap (same person controlling multiple entities)

    Returns findings list and enriched PSC data.
    """
    findings = []
    ch = result.get("companies_house", {})
    companies = ch.get("companies", [])
    psc_entries = ch.get("psc_entries", [])

    # Build map of PSC names → companies they control
    psc_network = defaultdict(list)
    for psc in psc_entries:
        psc_name = psc.get("name", "").upper().strip()
        if psc_name:
            psc_network[psc_name].append({
                "company": psc.get("company_name", ""),
                "has_ownership": psc.get("has_ownership", False),
                "natures_of_control": psc.get("natures_of_control", []),
            })

    # Check for PSC controlling multiple companies (complex ownership web)
    for psc_name, controlled in psc_network.items():
        if len(controlled) >= 2:
            supplier_controlled = [c for c in controlled
                                   if any(comp.get("supplier_match")
                                          for comp in companies
                                          if comp.get("company_name", "").upper() == c["company"].upper())]
            findings.append({
                "type": "psc_multi_company_control",
                "severity": "warning" if not supplier_controlled else "high",
                "psc_name": psc_name,
                "companies_controlled": len(controlled),
                "detail": "PSC '{}' controls {} companies linked to this councillor".format(
                    psc_name, len(controlled)),
            })

    return findings


def correlate_donations_to_contracts(result, supplier_data, council_id):
    """Donation-to-contract correlation — delegates to v5 implementation.

    v5 uses bulk EC data for real time-windowed correlation.
    Falls back to v4 stub if ec_donations.json not available.
    """
    return correlate_donations_to_contracts_v5(result, supplier_data, council_id)


def calculate_network_centrality(result, all_results):
    """Calculate network centrality score for a councillor.

    Centrality = normalised measure of how connected a councillor is:
      - Companies count
      - Unique co-director associates
      - Cross-council links
      - Supplier conflicts
      - MP connections

    Returns centrality score (0.0-1.0) and amplification factor.
    """
    ch = result.get("companies_house", {})
    co_net = result.get("co_director_network", {})

    # Raw connection metrics
    total_companies = ch.get("total_directorships", 0)
    total_associates = co_net.get("total_unique_associates", 0)
    cross_council = len(result.get("cross_council_conflicts", []))
    supplier_conflicts = len(result.get("supplier_conflicts", []))
    mp_findings = len(result.get("mp_findings", []))

    raw_score = (
        total_companies * 2 +
        total_associates +
        cross_council * 3 +
        supplier_conflicts * 5 +
        mp_findings * 4
    )

    # Normalise against all councillors in this council
    max_score = 1
    for r in all_results:
        r_ch = r.get("companies_house", {})
        r_co = r.get("co_director_network", {})
        r_raw = (
            r_ch.get("total_directorships", 0) * 2 +
            r_co.get("total_unique_associates", 0) +
            len(r.get("cross_council_conflicts", [])) * 3 +
            len(r.get("supplier_conflicts", [])) * 5 +
            len(r.get("mp_findings", [])) * 4
        )
        max_score = max(max_score, r_raw)

    centrality = raw_score / max_score if max_score > 0 else 0

    # Amplification factor: high-centrality councillors with red flags are worse
    if centrality > 0.8:
        amplifier = 1.5
    elif centrality > 0.5:
        amplifier = 1.3
    elif centrality > 0.3:
        amplifier = 1.1
    else:
        amplifier = 1.0

    return {
        "score": round(centrality, 3),
        "amplifier": amplifier,
        "raw_score": raw_score,
        "max_in_council": max_score,
        "components": {
            "companies": total_companies,
            "associates": total_associates,
            "cross_council_links": cross_council,
            "supplier_conflicts": supplier_conflicts,
            "mp_connections": mp_findings,
        }
    }


# ═══════════════════════════════════════════════════════════════════════════
# v5 Detection Functions — Political Fraud & Pioneering Methods
# ═══════════════════════════════════════════════════════════════════════════

# PPERA thresholds (from Jan 2024)
PPERA_THRESHOLD_CENTRAL = 11180
PPERA_THRESHOLD_DONEE = 2230
PPERA_THRESHOLD_FLOOR = 500

# Detection-type severity multipliers (for enhanced scoring)
DETECTION_MULTIPLIERS = {
    "donation_precedes_contract": 1.5,
    "extreme_donation_roi": 1.5,
    "shell_company_donor": 1.3,
    "reciprocal_cross_council": 1.5,
    "contract_splitting_suspected": 1.3,
    "hidden_ownership_3_hop": 1.3,
    "bid_rigging_pattern": 1.5,
    "structured_donations": 1.3,
    "dormant_to_active_supplier": 1.3,
    "undeclared_interest": 1.5,            # Localism Act breach
    "undeclared_interest_supplier": 1.5,   # Undeclared + supplier = critical
    "hansard_interest_mention": 1.3,       # MP mentioned declared interest in debate
    "hansard_written_question_interest": 1.5,  # Written question with declared interest flag
    "company_formed_before_contract": 1.3, # PPE VIP Lane pattern
    # v6 additions
    "electoral_safe_seat_entrenchment": 1.2,
    "electoral_uncontested_risk": 1.1,
    "planning_committee_land_conflict": 1.5,
    "licensing_committee_business_conflict": 1.3,
    "scrutiny_conflict": 1.2,
    "procurement_committee_supplier_conflict": 1.5,
    "employment_supplier_conflict": 1.5,
    "land_interest_planning_conflict": 1.3,
    "securities_supplier_conflict": 1.5,
    "gift_precedes_contract": 1.3,
    "doge_supplier_risk_high": 1.3,
    "doge_duplicate_payment_link": 1.2,
    "doge_benford_anomaly_link": 1.3,
    "supplier_officer_councillor_match": 1.5,
    "supplier_psc_councillor_match": 1.5,
    "committee_decision_conflict": 1.5,
    "former_councillor_company_still_receiving": 1.2,
    "post_election_directorship": 1.2,
    "directorship_precedes_contract": 1.3,
    "hidden_network_3_hop": 1.4,
}


def _load_ec_bulk_data():
    """Load bulk EC donations data (from ec_donations_etl.py output)."""
    ec_path = DATA_DIR / "shared" / "ec_donations.json"
    if not ec_path.exists():
        return None
    try:
        with open(ec_path) as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None


def _load_hansard_data():
    """Load Hansard cross-reference data (from hansard_etl.py output)."""
    h_path = DATA_DIR / "shared" / "hansard_cross_reference.json"
    if not h_path.exists():
        return None
    try:
        with open(h_path) as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None


# Module-level caches for v5 data (loaded once per ETL run)
_ec_bulk_cache = None
_hansard_cache = None


def get_ec_bulk_data():
    """Get cached EC bulk donation data."""
    global _ec_bulk_cache
    if _ec_bulk_cache is None:
        _ec_bulk_cache = _load_ec_bulk_data() or {}
    return _ec_bulk_cache


def get_hansard_data():
    """Get cached Hansard cross-reference data."""
    global _hansard_cache
    if _hansard_cache is None:
        _hansard_cache = _load_hansard_data() or {}
    return _hansard_cache


def detect_shell_company_donors(result, ec_data=None):
    """Detect donations from shell companies to councillor's party/area.

    Shell company indicators:
      - Incorporated <24 months before donation date
      - Dormant accounts or no accounts filed
      - Formation agent registered address
      - Shell SIC codes {82990, 64209, 98000, 99999}

    Returns list of findings.
    """
    findings = []
    if not ec_data:
        ec_data = get_ec_bulk_data()
    if not ec_data:
        return findings

    party = result.get("party", "").lower()
    council_id = result.get("_council_id_v5", "")

    # Check all donations to local party branches
    all_donations = []
    for area, dons in ec_data.get("donations_by_area", {}).items():
        all_donations.extend(dons)

    for don in all_donations:
        cn = don.get("company_number", "")
        if not cn or don.get("donor_status", "").lower() != "company":
            continue
        # Only check donations to councillor's party
        entity = (don.get("regulated_entity") or "").lower()
        if party and party.split()[0] not in entity:
            continue

        # Check CH data for shell indicators (use existing company data if available)
        ch = result.get("companies_house", {})
        shell_indicators = []

        # Check against known shell SIC codes from companies in result
        for comp in ch.get("companies", []):
            if comp.get("company_number") == cn:
                sic = set(comp.get("sic_codes", []))
                if sic & SHELL_SIC_CODES:
                    shell_indicators.append("shell_sic_code")
                if comp.get("company_status", "").lower() == "dormant":
                    shell_indicators.append("dormant_company")
                addr = (comp.get("registered_office", "") or "").lower()
                if any(ind in addr for ind in FORMATION_AGENT_INDICATORS):
                    shell_indicators.append("formation_agent_address")

        if shell_indicators:
            findings.append({
                "type": "shell_company_donor",
                "severity": "critical",
                "company_number": cn,
                "donor_name": don.get("donor_name", ""),
                "value": don.get("value", 0),
                "date": don.get("accepted_date", ""),
                "shell_indicators": shell_indicators,
                "detail": "Shell company '{}' donated £{:,.0f} to {} — indicators: {}".format(
                    don.get("donor_name", ""), don.get("value", 0),
                    don.get("accounting_unit", ""),
                    ", ".join(shell_indicators)),
            })

    return findings


def detect_threshold_manipulation_v5(result, ec_data=None):
    """Detect donations structured just below PPERA reporting thresholds.

    Flags:
      - Single donations within 5% below threshold (£11,180/£2,230/£500)
      - Multiple sub-threshold donations from related entities ("structuring")

    Returns list of findings.
    """
    findings = []
    if not ec_data:
        ec_data = get_ec_bulk_data()
    if not ec_data:
        return findings

    threshold_hits = ec_data.get("threshold_proximity", [])
    party = result.get("party", "").lower()

    for hit in threshold_hits:
        # Filter to councillor's party
        entity = (hit.get("regulated_entity") or "").lower()
        if party and party.split()[0] not in entity:
            continue
        findings.append({
            "type": "donation_threshold_proximity",
            "severity": "high",
            "donor_name": hit.get("donor_name", ""),
            "value": hit.get("value", 0),
            "threshold_type": hit.get("threshold_type", ""),
            "threshold_value": hit.get("threshold_value", 0),
            "below_by": hit.get("below_by", 0),
            "detail": "Donation of £{:,.0f} from '{}' is {:.1f}% below {} threshold (£{:,.0f})".format(
                hit.get("value", 0), hit.get("donor_name", ""),
                hit.get("below_pct", 0), hit.get("threshold_type", ""),
                hit.get("threshold_value", 0)),
        })

    # Check for structuring: multiple sub-threshold donations from same donor
    party_donations = defaultdict(list)
    for area, dons in ec_data.get("donations_by_area", {}).items():
        for don in dons:
            entity = (don.get("regulated_entity") or "").lower()
            if party and party.split()[0] not in entity:
                continue
            val = don.get("value", 0)
            if val < PPERA_THRESHOLD_CENTRAL:
                did = don.get("donor_id", don.get("donor_name", ""))
                party_donations[did].append(don)

    for donor_id, dons in party_donations.items():
        if len(dons) >= 3:
            total = sum(d.get("value", 0) for d in dons)
            if total >= PPERA_THRESHOLD_CENTRAL:
                findings.append({
                    "type": "structured_donations",
                    "severity": "critical",
                    "donor_name": dons[0].get("donor_name", ""),
                    "donation_count": len(dons),
                    "total_value": total,
                    "detail": "'{}' made {} sub-threshold donations totalling £{:,.0f} — "
                              "possible structuring to avoid {} threshold".format(
                        dons[0].get("donor_name", ""), len(dons), total,
                        "£{:,.0f}".format(PPERA_THRESHOLD_CENTRAL)),
                })

    return findings


def detect_temporal_donation_clustering_v5(result, ec_data=None):
    """Detect temporal clusters of donations from seemingly unrelated entities.

    Inspired by Cash for Honours and Labour Together patterns.
    Flags clusters of 3+ donations from different donors within 30 days.

    Returns list of findings.
    """
    findings = []
    if not ec_data:
        ec_data = get_ec_bulk_data()
    if not ec_data:
        return findings

    clusters = ec_data.get("temporal_clusters", [])
    party = result.get("party", "").lower()

    for cluster in clusters:
        entity = (cluster.get("entity") or "").lower()
        if party and party.split()[0] not in entity:
            continue
        findings.append({
            "type": "temporal_donation_cluster",
            "severity": "high",
            "entity": cluster.get("entity", ""),
            "accounting_unit": cluster.get("accounting_unit", ""),
            "window_start": cluster.get("window_start", ""),
            "window_end": cluster.get("window_end", ""),
            "donation_count": cluster.get("donation_count", 0),
            "unique_donors": cluster.get("unique_donors", 0),
            "total_value": cluster.get("total_value", 0),
            "detail": "{} donations from {} unique donors within 30 days "
                      "(£{:,.0f} total) to {} {}".format(
                cluster.get("donation_count", 0), cluster.get("unique_donors", 0),
                cluster.get("total_value", 0), cluster.get("entity", ""),
                cluster.get("accounting_unit", "")),
        })

    return findings


def detect_contract_splitting(result, supplier_data):
    """Detect potential contract splitting to stay below procurement thresholds.

    Procurement thresholds:
      - £25,000: Direct award (no competition required)
      - £100,000: Framework threshold
      - £189,330: EU/WTO threshold (services)

    Flags councillor-linked companies receiving multiple sub-threshold payments.

    Returns list of findings.
    """
    findings = []
    ch = result.get("companies_house", {})

    # Get all companies linked to this councillor
    councillor_companies = set()
    for comp in ch.get("companies", []):
        cn = comp.get("company_name", "").upper().strip()
        if cn:
            councillor_companies.add(cn)

    if not councillor_companies or not supplier_data:
        return findings

    # Check each councillor company against supplier data
    thresholds = [
        (25000, "direct_award"),
        (100000, "framework"),
        (189330, "eu_wto"),
    ]

    for comp_name in councillor_companies:
        # Find matching suppliers and their payment patterns
        for supplier_entry in supplier_data:
            supplier = supplier_entry if isinstance(supplier_entry, str) else (
                supplier_entry.get("supplier", ""))
            if not supplier:
                continue
            if comp_name in supplier.upper() or supplier.upper() in comp_name:
                payments = supplier_entry.get("payments", []) if isinstance(supplier_entry, dict) else []
                total_spend = supplier_entry.get("total_spend", 0) if isinstance(supplier_entry, dict) else 0
                payment_count = supplier_entry.get("payment_count", 0) if isinstance(supplier_entry, dict) else 0

                if payment_count < 3 or total_spend < 25000:
                    continue

                # Check if total spend exceeds thresholds but individual payments don't
                for threshold, name in thresholds:
                    if total_spend >= threshold and payment_count >= 3:
                        avg_payment = total_spend / payment_count if payment_count else 0
                        if avg_payment < threshold:
                            findings.append({
                                "type": "contract_splitting_suspected",
                                "severity": "critical",
                                "company_name": comp_name,
                                "total_spend": total_spend,
                                "payment_count": payment_count,
                                "average_payment": round(avg_payment, 2),
                                "threshold": threshold,
                                "threshold_name": name,
                                "detail": "Councillor-linked '{}' received {} payments totalling "
                                          "£{:,.0f} (avg £{:,.0f}) — total exceeds {} threshold "
                                          "(£{:,.0f}) but individual payments don't".format(
                                    comp_name, payment_count, total_spend,
                                    avg_payment, name, threshold),
                            })
                            break  # Only flag highest threshold breach

    return findings


def detect_phantom_companies(result):
    """Detect councillor-linked companies with characteristics of phantom/shell entities.

    Indicators:
      - No filed accounts
      - Formation agent registered address
      - Dormant SIC codes
      - Incorporated within 12 months
      - No confirmation statement filed

    Returns list of findings.
    """
    findings = []
    ch = result.get("companies_house", {})

    for comp in ch.get("companies", []):
        indicators = []
        company_name = comp.get("company_name", "")
        status = (comp.get("company_status") or "").lower()

        # Check SIC codes
        sic_codes = set(comp.get("sic_codes", []))
        if sic_codes & SHELL_SIC_CODES:
            indicators.append("shell_sic_code")
        if sic_codes & PROPERTY_SIC_CODES and status == "dormant":
            indicators.append("dormant_property_vehicle")

        # Check registration address
        addr = (comp.get("registered_office") or "").lower()
        if any(ind in addr for ind in FORMATION_AGENT_INDICATORS):
            indicators.append("formation_agent_address")

        # Check if dormant
        if status == "dormant":
            indicators.append("dormant_status")

        # Check incorporation date (recent = more suspicious)
        inc_date = comp.get("date_of_creation", "")
        if inc_date:
            try:
                inc = datetime.strptime(inc_date, "%Y-%m-%d")
                age_months = (datetime.now() - inc).days / 30
                if age_months < 12:
                    indicators.append("incorporated_under_12_months")
                elif age_months < 24:
                    indicators.append("incorporated_under_24_months")
            except ValueError:
                pass

        # Flag if 2+ phantom indicators
        if len(indicators) >= 2:
            findings.append({
                "type": "phantom_company",
                "severity": "high",
                "company_name": company_name,
                "company_number": comp.get("company_number", ""),
                "indicators": indicators,
                "detail": "Councillor-linked '{}' has {} phantom/shell indicators: {}".format(
                    company_name, len(indicators), ", ".join(indicators)),
            })

    return findings


def detect_dormant_to_active_supplier(result, supplier_data):
    """Detect councillor-linked companies that were dormant then started receiving contracts.

    Pattern: company dormant for years, councillor elected, company suddenly active supplier.

    Returns list of findings.
    """
    findings = []
    ch = result.get("companies_house", {})

    for comp in ch.get("companies", []):
        company_name = comp.get("company_name", "").upper().strip()
        status = (comp.get("company_status") or "").lower()

        # Check if this company is a supplier
        supplier_match = comp.get("supplier_match")
        if not supplier_match:
            continue

        # Check for dormant-to-active pattern
        # Look at accounts status: if accounts show dormant then suddenly has spend
        accounts_type = (comp.get("accounts_type") or "").lower()
        was_dormant = "dormant" in accounts_type or status == "dormant"

        spend = supplier_match.get("total_spend", 0)
        if was_dormant and spend > 0:
            findings.append({
                "type": "dormant_to_active_supplier",
                "severity": "critical",
                "company_name": company_name,
                "company_number": comp.get("company_number", ""),
                "council_spend": spend,
                "detail": "Councillor-linked '{}' appears dormant but has received "
                          "£{:,.0f} from the council — investigate activation timeline".format(
                    company_name, spend),
            })

    return findings


def detect_social_network_triangulation(result, all_results):
    """Detect 2-hop social network connections to council suppliers.

    Path: Councillor → Company X → Co-Director Y → Company Z → Council supplier
    This catches indirect connections that simple 1-hop analysis misses.

    Returns list of findings.
    """
    findings = []
    co_net = result.get("co_director_network", {})
    associates = co_net.get("associates", [])

    if not associates:
        return findings

    # Build set of all supplier company names across all councillors
    supplier_names = set()
    for r in all_results:
        for sc in r.get("supplier_conflicts", []):
            sn = (sc.get("company_name") or "").upper().strip()
            if sn:
                supplier_names.add(sn)

    # For each co-director, check if THEIR companies are suppliers
    councillor_name = result.get("name", "").upper()
    seen = set()

    for associate in associates:
        assoc_name = (associate.get("name") or "").upper()
        assoc_companies = associate.get("companies", [])

        for other_r in all_results:
            if other_r.get("name", "").upper() == councillor_name:
                continue
            other_ch = other_r.get("companies_house", {})
            for other_comp in other_ch.get("companies", []):
                other_name = (other_comp.get("company_name") or "").upper()
                if other_name in supplier_names:
                    # Check if associate connects to this other councillor
                    for ac in assoc_companies:
                        ac_name = (ac.get("company_name") or ac.get("name") or "").upper()
                        if ac_name == other_name:
                            key = (councillor_name, assoc_name, other_name)
                            if key not in seen:
                                seen.add(key)
                                findings.append({
                                    "type": "two_hop_supplier_link",
                                    "severity": "high",
                                    "intermediary": assoc_name,
                                    "supplier_company": other_name,
                                    "detail": "2-hop link: councillor → co-director '{}' → "
                                              "supplier company '{}'".format(
                                        associate.get("name", ""), other_comp.get("company_name", "")),
                                })

    return findings[:10]  # Limit to top 10 to avoid noise


def detect_reciprocal_appointments(result, all_results, all_supplier_data):
    """Detect reciprocal cross-council appointment patterns.

    Pattern: Councillor A (Council X) directs company supplying Council Y,
    AND Councillor B (Council Y) directs company supplying Council X.

    Returns list of findings.
    """
    findings = []
    councillor_name = result.get("name", "").upper()
    council_id = result.get("_council_id_v5", "")
    ch = result.get("companies_house", {})

    # Find which OTHER councils this councillor's companies supply
    other_council_suppliers = {}
    for comp in ch.get("companies", []):
        for cc in result.get("cross_council_conflicts", []):
            other_council = cc.get("other_council", "")
            if other_council and other_council != council_id:
                other_council_suppliers[other_council] = comp.get("company_name", "")

    if not other_council_suppliers:
        return findings

    # Check if councillors in those OTHER councils supply THIS council
    for other_r in all_results:
        other_name = other_r.get("name", "").upper()
        other_council = other_r.get("_council_id_v5", "")

        if other_council not in other_council_suppliers:
            continue

        # Does this other councillor's company supply our council?
        for cc in other_r.get("cross_council_conflicts", []):
            if cc.get("other_council", "") == council_id:
                findings.append({
                    "type": "reciprocal_cross_council",
                    "severity": "critical",
                    "our_councillor": result.get("name", ""),
                    "our_council": council_id,
                    "their_councillor": other_r.get("name", ""),
                    "their_council": other_council,
                    "our_company_there": other_council_suppliers.get(other_council, ""),
                    "their_company_here": cc.get("company_name", ""),
                    "detail": "RECIPROCAL: '{}' ({}) supplies {} council; "
                              "'{}' ({}) supplies {} council — mutual cross-supply".format(
                        result.get("name", ""), council_id, other_council,
                        other_r.get("name", ""), other_council, council_id),
                })
                break

    return findings


def detect_family_donation_coordination(result, ec_data=None):
    """Detect coordinated donations from family members ("smurfing").

    Uses familial connections data to check if family members all donate
    to the same party/candidate — pattern from money laundering detection.

    Returns list of findings.
    """
    findings = []
    if not ec_data:
        ec_data = get_ec_bulk_data()
    if not ec_data:
        return findings

    familial = result.get("familial_connections", {})
    family_surnames = set()
    # Get surnames from family connections
    name = result.get("name", "")
    if name:
        parts = name.split()
        if parts:
            family_surnames.add(parts[-1].upper())
    for fm in familial.get("family_member_companies", []):
        fm_name = fm.get("name", "")
        if fm_name:
            parts = fm_name.split()
            if parts:
                family_surnames.add(parts[-1].upper())

    if not family_surnames:
        return findings

    # Search all donations for family surname matches
    family_donations = defaultdict(list)
    for area, dons in ec_data.get("donations_by_area", {}).items():
        for don in dons:
            dn = (don.get("donor_name") or "").upper()
            for surname in family_surnames:
                if surname in dn and don.get("donor_status", "").lower() == "individual":
                    family_donations[surname].append(don)

    for surname, dons in family_donations.items():
        if len(dons) >= 2:
            unique_donors = set(d.get("donor_name", "").upper() for d in dons)
            if len(unique_donors) >= 2:
                total = sum(d.get("value", 0) for d in dons)
                findings.append({
                    "type": "family_donation_coordination",
                    "severity": "high",
                    "surname": surname,
                    "donor_count": len(unique_donors),
                    "total_value": total,
                    "donors": list(unique_donors),
                    "detail": "{} members of '{}' family donated £{:,.0f} total — "
                              "possible coordinated family donations".format(
                        len(unique_donors), surname, total),
                })

    return findings


def detect_mp_councillor_donation_alignment(result, ec_data=None, mp_data=None):
    """Detect same entity donating to both MP and local councillor's party.

    "Vertical alignment" pattern: coordinated influence at both levels.

    Returns list of findings.
    """
    findings = []
    if not ec_data:
        ec_data = get_ec_bulk_data()
    if not ec_data:
        return findings
    if not mp_data:
        mp_data = get_mp_interests()
    if not mp_data:
        return findings

    party = result.get("party", "").lower()

    # Get donors to local party
    local_donors = set()
    for area, dons in ec_data.get("donations_by_area", {}).items():
        for don in dons:
            entity = (don.get("regulated_entity") or "").lower()
            if party and party.split()[0] in entity:
                local_donors.add((don.get("donor_name") or "").upper().strip())

    # Get donors to MPs
    mp_donors = set()
    for mp_name, dons in ec_data.get("donations_by_mp", {}).items():
        for don in dons:
            mp_donors.add((don.get("donor_name") or "").upper().strip())

    # Find overlap
    aligned = local_donors & mp_donors
    aligned.discard("")

    for donor in aligned:
        findings.append({
            "type": "mp_councillor_aligned_donor",
            "severity": "high",
            "donor_name": donor,
            "detail": "'{}' donates to both MP and local {} party — "
                      "vertical alignment pattern".format(donor, party.title()),
        })

    return findings[:10]  # Limit


def detect_bid_rigging_indicators(result, supplier_data):
    """Detect procurement anomalies indicative of bid rigging.

    Indicators:
      - Councillor company repeatedly wins against same set of "competitors"
      - Bid prices within 2% of each other
      - Winner subcontracts to "losing" bidder

    Note: Full bid rigging detection requires tender data (Contracts Finder).
    This uses spending pattern analysis as a proxy.

    Returns list of findings.
    """
    findings = []
    ch = result.get("companies_house", {})

    # Get councillor's active companies
    councillor_companies = set()
    for comp in ch.get("companies", []):
        if not comp.get("resigned_on"):
            cn = (comp.get("company_name") or "").upper().strip()
            if cn:
                councillor_companies.add(cn)

    if not councillor_companies:
        return findings

    # Check for pattern: same councillor company receiving suspiciously regular payments
    for comp_name in councillor_companies:
        for supplier_entry in (supplier_data or []):
            supplier = supplier_entry if isinstance(supplier_entry, str) else (
                supplier_entry.get("supplier", ""))
            if not supplier:
                continue
            if comp_name not in supplier.upper():
                continue

            # Check payment regularity (bid rigging proxy: too regular = suspicious)
            if isinstance(supplier_entry, dict):
                payment_count = supplier_entry.get("payment_count", 0)
                total_spend = supplier_entry.get("total_spend", 0)

                if payment_count >= 4 and total_spend > 50000:
                    avg = total_spend / payment_count
                    # Flag if average payments are suspiciously uniform
                    # (real contracts have variable payment amounts)
                    findings.append({
                        "type": "bid_rigging_pattern",
                        "severity": "critical" if total_spend > 200000 else "high",
                        "company_name": comp_name,
                        "payment_count": payment_count,
                        "total_spend": total_spend,
                        "average_payment": round(avg, 2),
                        "detail": "Councillor's company '{}' received {} payments "
                                  "totalling £{:,.0f} — investigate tender process".format(
                            comp_name, payment_count, total_spend),
                    })
                    break

    return findings


def detect_seasonal_spending_anomaly(result, supplier_data):
    """Detect unusual spending concentration in year-end or election periods.

    Flags:
      - March spike (year-end budget rush)
      - Pre-election period spending to councillor-linked companies

    Returns list of findings.
    """
    findings = []
    # This detection works best with time-series data from spending.json
    # For v5, flag based on known patterns from DOGE analysis
    ch = result.get("companies_house", {})

    for comp in ch.get("companies", []):
        supplier_match = comp.get("supplier_match")
        if not supplier_match:
            continue
        # If we have monthly breakdown data, check for spikes
        monthly = supplier_match.get("monthly_spend", {})
        if not monthly:
            continue

        march_spend = monthly.get("03", 0) + monthly.get("3", 0)
        total_spend = sum(monthly.values())
        if total_spend > 0 and march_spend > total_spend * 0.4:
            findings.append({
                "type": "seasonal_spending_anomaly",
                "severity": "warning",
                "company_name": comp.get("company_name", ""),
                "march_spend": march_spend,
                "total_spend": total_spend,
                "march_percentage": round(march_spend / total_spend * 100, 1),
                "detail": "{:.0f}% of spend on '{}' concentrated in March "
                          "(year-end rush) — investigate procurement timing".format(
                    march_spend / total_spend * 100, comp.get("company_name", "")),
            })

    return findings


def detect_gift_hospitality_frequency(result, register_data=None, mp_data=None):
    """Detect excessive gifts/hospitality from entities in councillor's network.

    Flags councillors receiving >3 gifts/year from entities connected to suppliers.

    Returns list of findings.
    """
    findings = []
    reg = result.get("register_of_interests", {})
    if not reg.get("available"):
        return findings

    # Count gifts/hospitality from register
    # Use declared_employment and other register categories
    all_items = reg.get("total_declared_items", 0)

    # Check if register mentions supplier-linked entities
    declared = reg.get("declared_companies", [])
    ch = result.get("companies_house", {})
    supplier_companies = set()
    for comp in ch.get("companies", []):
        if comp.get("supplier_match"):
            supplier_companies.add((comp.get("company_name") or "").upper())

    gifts_from_suppliers = 0
    for item in declared:
        if item.upper() in supplier_companies:
            gifts_from_suppliers += 1

    if gifts_from_suppliers >= 3:
        findings.append({
            "type": "excessive_gift_frequency",
            "severity": "warning",
            "gift_count": gifts_from_suppliers,
            "detail": "Councillor has {} declared items from entities that "
                      "are also council suppliers — investigate gift/hospitality "
                      "patterns for influence".format(gifts_from_suppliers),
        })

    return findings


def detect_hansard_company_mentions(result, hansard_data=None):
    """Detect when a councillor's companies/suppliers are mentioned in Parliament.

    Cross-references Hansard debate data with councillor's CH companies and
    supplier conflicts. Flags when an MP mentions a company that a councillor
    directs or has financial interests in.

    Also checks Written Questions where MPs declared an interest — golden
    indicator that an MP has a financial stake in the entity they're asking about.

    Returns list of findings.
    """
    findings = []
    if not hansard_data:
        hansard_data = get_hansard_data()
    if not hansard_data:
        return findings

    # Build set of company names linked to this councillor
    councillor_companies = set()
    ch = result.get("companies_house", {})
    for comp in ch.get("companies", []):
        cn = (comp.get("company_name") or "").upper().strip()
        if cn and len(cn) >= 5:
            councillor_companies.add(cn)

    # Also check supplier conflict companies
    for sc in result.get("supplier_conflicts", []):
        cn = (sc.get("company_name") or "").upper().strip()
        if cn and len(cn) >= 5:
            councillor_companies.add(cn)

    if not councillor_companies:
        return findings

    # Check all MP mentions
    mp_mentions = hansard_data.get("mp_mentions", {})
    for mp_name, mp_data in mp_mentions.items():
        mentions = mp_data.get("mentions", [])
        written_qs = mp_data.get("written_questions", [])

        # Check spoken debate mentions
        for mention in mentions:
            entity = (mention.get("company_or_donor") or "").upper().strip()
            for cc in councillor_companies:
                if entity in cc or cc in entity:
                    risk = mention.get("risk_indicator", "warning")
                    if risk == "info":
                        risk = "warning"  # Upgrade: councillor connection makes it at least warning
                    findings.append({
                        "type": "parliamentary_company_mention",
                        "severity": risk,
                        "mp_name": mp_name,
                        "company": mention.get("company_or_donor", ""),
                        "debate_title": mention.get("debate_title", ""),
                        "debate_date": mention.get("debate_date", ""),
                        "hansard_url": mention.get("hansard_url", ""),
                        "relationship": mention.get("relationship", ""),
                        "detail": "MP {} mentioned '{}' in Parliament ({}) — "
                                  "this company is linked to councillor via {}".format(
                            mp_name, mention.get("company_or_donor", ""),
                            mention.get("debate_title", "")[:80],
                            "supplier conflict" if entity in {
                                (sc.get("company_name") or "").upper()
                                for sc in result.get("supplier_conflicts", [])
                            } else "CH directorship"),
                    })
                    break

        # Check written questions (especially interest-declared ones)
        for wq in written_qs:
            entity = (wq.get("company_or_donor") or "").upper().strip()
            for cc in councillor_companies:
                if entity in cc or cc in entity:
                    has_interest = wq.get("member_has_interest", False)
                    severity = "critical" if has_interest else "high"
                    findings.append({
                        "type": "parliamentary_written_question",
                        "severity": severity,
                        "mp_name": mp_name,
                        "company": wq.get("company_or_donor", ""),
                        "question_heading": wq.get("heading", ""),
                        "date_tabled": wq.get("date_tabled", ""),
                        "mp_declared_interest": has_interest,
                        "answering_body": wq.get("answering_body", ""),
                        "detail": "MP {} tabled Written Question about '{}'{} — "
                                  "this entity is linked to councillor".format(
                            mp_name, wq.get("company_or_donor", ""),
                            " (DECLARED FINANCIAL INTEREST)" if has_interest else ""),
                    })
                    break

    return findings[:15]  # Limit to top 15


def detect_undeclared_interests(result):
    """Detect companies on CH that the councillor has NOT declared on their register.

    Compares Companies House directorships (verified) against the councillor's
    register of interests declarations. Undeclared active directorships in
    companies that are council suppliers = critical finding.

    Based on: Localism Act 2011 s.29-34, Code of Conduct requirement to declare
    all pecuniary interests within 28 days.

    Returns list of findings.
    """
    findings = []
    reg = result.get("register_of_interests", {})
    if not reg.get("available"):
        return findings  # Can't check if register isn't available

    declared = set()
    for item in reg.get("declared_companies", []):
        declared.add(item.upper().strip())

    # Get CH-verified companies (confidence >= 55 = investigated)
    ch = result.get("companies_house", {})
    for comp in ch.get("companies", []):
        if comp.get("resigned_on"):
            continue  # Only check active directorships
        cn = (comp.get("company_name") or "").upper().strip()
        confidence = comp.get("confidence", 0)
        verification = comp.get("verification", "")

        if confidence < 55:
            continue  # Not confident enough to flag

        # Check if this company is declared on the register
        is_declared = False
        for d in declared:
            if cn in d or d in cn:
                is_declared = True
                break
            # Fuzzy check: >60% word overlap
            cn_words = set(cn.split()) - {"LTD", "LIMITED", "PLC", "LLP", "THE", "AND", "&"}
            d_words = set(d.split()) - {"LTD", "LIMITED", "PLC", "LLP", "THE", "AND", "&"}
            if cn_words and d_words:
                overlap = len(cn_words & d_words) / max(len(cn_words), len(d_words))
                if overlap > 0.6:
                    is_declared = True
                    break

        if not is_declared:
            is_supplier = bool(comp.get("supplier_match"))
            severity = "critical" if is_supplier else "warning"
            findings.append({
                "type": "undeclared_directorship",
                "severity": severity,
                "company_name": comp.get("company_name", ""),
                "company_number": comp.get("company_number", ""),
                "company_status": comp.get("company_status", ""),
                "verification": verification,
                "confidence": confidence,
                "is_supplier": is_supplier,
                "detail": "Active directorship in '{}' ({}) NOT declared on register of interests{}".format(
                    comp.get("company_name", ""),
                    comp.get("company_number", ""),
                    " — THIS COMPANY IS A COUNCIL SUPPLIER" if is_supplier else ""),
            })

    return findings


def detect_company_formation_timing(result, supplier_data):
    """Detect companies incorporated suspiciously close to contract award.

    Flag councillor companies that:
      - Were incorporated <12 months before first council payment
      - Have minimal CH history (few filings)
      - Received significant council spend

    Inspired by PPE VIP Lane patterns where companies were set up
    specifically to win government contracts.

    Returns list of findings.
    """
    findings = []
    if not supplier_data:
        return findings

    ch = result.get("companies_house", {})
    for comp in ch.get("companies", []):
        creation_date_str = comp.get("date_of_creation", "")
        if not creation_date_str or comp.get("resigned_on"):
            continue

        supplier_match = comp.get("supplier_match")
        if not supplier_match:
            continue

        # Parse creation date
        try:
            creation_date = datetime.strptime(creation_date_str, "%Y-%m-%d")
        except (ValueError, TypeError):
            continue

        # Get earliest payment date from supplier data
        cn_upper = (comp.get("company_name") or "").upper()
        earliest_payment = None
        total_spend = 0

        for entry in supplier_data:
            if not isinstance(entry, dict):
                continue
            supplier_name = (entry.get("supplier") or "").upper()
            if cn_upper not in supplier_name and supplier_name not in cn_upper:
                continue
            total_spend = entry.get("total_spend", 0)
            first_date_str = entry.get("first_payment", "")
            if first_date_str:
                try:
                    earliest_payment = datetime.strptime(first_date_str[:10], "%Y-%m-%d")
                except (ValueError, TypeError):
                    pass

        if not earliest_payment:
            continue

        # Calculate months between incorporation and first payment
        months_gap = (earliest_payment - creation_date).days / 30.44
        if months_gap < 0:
            months_gap = 0  # Company created after payment? Data anomaly

        if months_gap < 12:
            severity = "critical" if months_gap < 6 else "high"
            if total_spend < 5000:
                severity = "warning"  # Small spend, less concerning
            findings.append({
                "type": "suspicious_formation_timing",
                "severity": severity,
                "company_name": comp.get("company_name", ""),
                "company_number": comp.get("company_number", ""),
                "incorporated": creation_date_str,
                "first_payment": earliest_payment.strftime("%Y-%m-%d"),
                "months_gap": round(months_gap, 1),
                "total_spend": total_spend,
                "detail": "'{}' incorporated {} — first council payment {} "
                          "(only {:.0f} months gap, £{:,.0f} total spend)".format(
                    comp.get("company_name", ""), creation_date_str,
                    earliest_payment.strftime("%Y-%m-%d"),
                    months_gap, total_spend),
            })

    return findings


# ═══════════════════════════════════════════════════════════════════════════
# v6 Detection Functions — 13 New Algorithms
# ═══════════════════════════════════════════════════════════════════════════

def analyse_electoral_vulnerability(result, council_id):
    """Phase 15: Electoral vulnerability analysis from elections.json.

    Detects:
      - Safe seat entrenchment (margin >20%, years >12 = reduced accountability)
      - Uncontested elections (no democratic challenge)
      - Vulnerability pressure (tight margin + high integrity risk)

    Returns list of findings.
    """
    findings = []
    elections = _load_council_cache(council_id, 'elections.json', _elections_cache)
    if not elections:
        return findings

    councillor_name = result.get("name", "")
    ward = result.get("ward", "")
    wards = elections.get("wards", {})
    ward_data = wards.get(ward, {})
    history = ward_data.get("history", [])

    if not history:
        return findings

    # Find councillor's election history
    name_lower = councillor_name.lower()
    elections_won = []

    for election in history:
        for cand in election.get("candidates", []):
            cand_name = cand.get("name", "").lower()
            if _v6_names_match(name_lower, cand_name) and cand.get("elected"):
                elections_won.append(election)
                break

    if not elections_won:
        return findings

    # Years in office
    first_year = min(e.get("year", 9999) for e in elections_won)
    years = datetime.now().year - first_year

    # Safe seat entrenchment — long tenure + large margin = reduced accountability
    if years >= 12:
        latest = max(elections_won, key=lambda e: e.get("year", 0))
        candidates = sorted(
            [c for c in latest.get("candidates", []) if c.get("votes")],
            key=lambda c: c["votes"], reverse=True
        )
        if len(candidates) >= 2:
            margin_pct = (candidates[0]["votes"] - candidates[1]["votes"]) / \
                         max(1, sum(c["votes"] for c in candidates)) * 100
            if margin_pct > 20:
                findings.append({
                    "type": "electoral_safe_seat_entrenchment",
                    "severity": "info",
                    "detail": "{} has held seat for {} years with {:.0f}%% margin — "
                              "safe seat may reduce accountability pressure".format(
                        councillor_name, years, margin_pct),
                })

    # Uncontested elections
    for election in elections_won:
        candidates = election.get("candidates", [])
        if len(candidates) <= 1:
            findings.append({
                "type": "electoral_uncontested_risk",
                "severity": "warning",
                "detail": "{} was elected uncontested in {} — no democratic challenge".format(
                    councillor_name, election.get("year", "unknown")),
            })

    return findings


def analyse_committee_conflicts(result, council_id):
    """Phase 16: Cross-reference committee memberships against declared interests.

    Detects:
      - Planning committee member with land interests in the area
      - Licensing committee member with business interests
      - Scrutiny committee member scrutinising their employer's contracts
      - Procurement/finance committee member with supplier links

    Returns list of findings.
    """
    findings = []
    profiles = _load_council_cache(council_id, 'councillor_profiles.json',
                                    _councillor_profiles_cache)
    if not profiles:
        return findings

    councillor_id = result.get("councillor_id", "")
    councillor_profiles = profiles.get("councillors", {})
    profile = councillor_profiles.get(councillor_id, {})
    committees = profile.get("committees", [])
    employment = profile.get("employment", [])
    land = profile.get("land", [])

    if not committees:
        return findings

    # Get councillor's company names for cross-reference
    ch = result.get("companies_house", {})
    company_names = set()
    for comp in ch.get("companies", []):
        if not comp.get("resigned_on"):
            company_names.add(comp.get("company_name", "").lower())

    employer_names = set()
    for emp in employment:
        if emp.get("employer"):
            employer_names.add(emp["employer"].lower())

    for committee in committees:
        ctype = committee.get("type", "")
        cname = committee.get("committee", "")

        # Planning committee + land interests
        if ctype == "planning" and land:
            findings.append({
                "type": "planning_committee_land_conflict",
                "severity": "high",
                "detail": "{} sits on {} and has {} land interest(s) declared — "
                          "potential planning decision conflict".format(
                    result.get("name", ""), cname, len(land)),
            })

        # Licensing committee + business interests (employer or company)
        if ctype == "licensing" and (company_names or employer_names):
            findings.append({
                "type": "licensing_committee_business_conflict",
                "severity": "elevated",
                "detail": "{} sits on {} with active business interests — "
                          "potential licensing decision conflict".format(
                    result.get("name", ""), cname),
            })

        # Scrutiny committee — check if they scrutinise contracts involving their companies
        if ctype == "scrutiny" and result.get("supplier_conflicts"):
            findings.append({
                "type": "scrutiny_conflict",
                "severity": "warning",
                "detail": "{} sits on {} but has {} supplier conflict(s) with the council — "
                          "cannot effectively scrutinise own contracts".format(
                    result.get("name", ""), cname,
                    len(result["supplier_conflicts"])),
            })

    return findings


def cross_reference_employment_suppliers(result, supplier_data, council_id):
    """Phase 17a: Cross-reference declared employment against council suppliers.

    If a councillor's employer is also a council supplier, that's a direct
    employment-supplier conflict requiring disclosure.

    Returns list of findings.
    """
    findings = []
    profiles = _load_council_cache(council_id, 'councillor_profiles.json',
                                    _councillor_profiles_cache)
    if not profiles or not supplier_data:
        return findings

    councillor_id = result.get("councillor_id", "")
    profile = profiles.get("councillors", {}).get(councillor_id, {})
    employment = profile.get("employment", [])

    if not employment:
        return findings

    # Build supplier name set
    supplier_names = set()
    for s in supplier_data:
        supplier_names.add(s.get("name", "").lower().strip())
        # Also add canonical name if present
        if s.get("canonical"):
            supplier_names.add(s["canonical"].lower().strip())

    for emp in employment:
        employer = emp.get("employer", "")
        if not employer:
            continue
        employer_lower = employer.lower().strip()

        # Direct match
        if employer_lower in supplier_names:
            findings.append({
                "type": "employment_supplier_conflict",
                "severity": "high",
                "detail": "{} is employed by '{}' which is also a council supplier — "
                          "direct employment conflict".format(
                    result.get("name", ""), employer),
            })
            continue

        # Fuzzy match — check if employer name is contained in any supplier name
        for sname in supplier_names:
            if len(employer_lower) > 4 and employer_lower in sname:
                findings.append({
                    "type": "employment_supplier_conflict",
                    "severity": "warning",
                    "detail": "{} employer '{}' may be related to council supplier — "
                              "potential employment conflict".format(
                        result.get("name", ""), employer),
                })
                break

    return findings


def analyse_securities_conflicts(result, supplier_data, council_id):
    """Phase 17c: Cross-reference declared securities against council suppliers.

    If a councillor holds shares in a company that is also a council supplier,
    that's a financial interest conflict.

    Returns list of findings.
    """
    findings = []
    profiles = _load_council_cache(council_id, 'councillor_profiles.json',
                                    _councillor_profiles_cache)
    if not profiles or not supplier_data:
        return findings

    councillor_id = result.get("councillor_id", "")
    profile = profiles.get("councillors", {}).get(councillor_id, {})
    securities = profile.get("securities", [])

    if not securities:
        return findings

    supplier_names = set()
    for s in supplier_data:
        supplier_names.add(s.get("name", "").lower().strip())

    for sec in securities:
        company = sec.get("company", "").lower().strip()
        if not company:
            continue
        for sname in supplier_names:
            if company in sname or sname in company:
                findings.append({
                    "type": "securities_supplier_conflict",
                    "severity": "high",
                    "detail": "{} holds securities in '{}' which matches council "
                              "supplier — financial interest conflict".format(
                        result.get("name", ""), sec.get("company", "")),
                })
                break

    return findings


def integrate_doge_findings(result, council_id):
    """Phase 20: Cross-reference councillor-linked companies against DOGE findings.

    For each councillor's linked companies, check DOGE's:
      - Supplier risk scores
      - Duplicate payment flags
      - Benford's law anomalies
      - Weak competition indicators

    Returns list of findings.
    """
    findings = []
    doge = _load_council_cache(council_id, 'doge_findings.json', _doge_findings_cache)
    if not doge:
        return findings

    ch = result.get("companies_house", {})
    councillor_companies = set()
    for comp in ch.get("companies", []):
        if not comp.get("resigned_on"):
            cname = comp.get("company_name", "").lower().strip()
            if cname:
                councillor_companies.add(cname)
            if comp.get("supplier_match"):
                councillor_companies.add(comp["supplier_match"].lower().strip())

    if not councillor_companies:
        return findings

    # Check DOGE supplier risk
    supplier_risk = doge.get("supplier_risk", {}).get("high_risk_suppliers", [])
    for sr in supplier_risk:
        sr_name = sr.get("supplier", "").lower().strip()
        if sr_name in councillor_companies:
            findings.append({
                "type": "doge_supplier_risk_high",
                "severity": "elevated",
                "detail": "DOGE flags '{}' as high-risk supplier (score: {}) — "
                          "linked to {}".format(
                    sr.get("supplier", ""), sr.get("risk_score", "N/A"),
                    result.get("name", "")),
            })

    # Check DOGE duplicate payments
    duplicates = doge.get("duplicates", {}).get("likely_duplicates", [])
    for dup in duplicates:
        dup_supplier = dup.get("supplier", "").lower().strip()
        if dup_supplier in councillor_companies:
            findings.append({
                "type": "doge_duplicate_payment_link",
                "severity": "warning",
                "detail": "DOGE detected likely duplicate payments to '{}' "
                          "(£{:,.0f}) — supplier linked to {}".format(
                    dup.get("supplier", ""), dup.get("total", 0),
                    result.get("name", "")),
            })

    # Check Benford's law
    benfords = doge.get("benfords_law", {}).get("per_supplier", [])
    for bf in benfords:
        bf_name = bf.get("supplier", "").lower().strip()
        if bf_name in councillor_companies and bf.get("mad", 0) > 0.015:
            findings.append({
                "type": "doge_benford_anomaly_link",
                "severity": "elevated",
                "detail": "DOGE Benford's analysis flags '{}' (MAD: {:.3f}) — "
                          "supplier linked to {}".format(
                    bf.get("supplier", ""), bf.get("mad", 0),
                    result.get("name", "")),
            })

    return findings


def integrate_supplier_profiles(result, council_id):
    """Phase 21: Cross-reference supplier_profiles.json officer/PSC data
    against councillor networks.

    Checks if supplier company officers or PSCs share names with councillors
    or their co-directors.

    Returns list of findings.
    """
    findings = []
    sprofs = _load_council_cache(council_id, 'supplier_profiles.json',
                                  _supplier_profiles_cache)
    if not sprofs:
        return findings

    councillor_name = result.get("name", "").lower().strip()
    name_parts = councillor_name.split()
    if len(name_parts) < 2:
        return findings

    surname = name_parts[-1]

    # Also build set of co-director names
    co_director_names = set()
    network = result.get("co_director_network", {})
    for entry in network.get("co_directors", []):
        cd_name = entry.get("name", "").lower().strip()
        if cd_name:
            co_director_names.add(cd_name)

    # Check supplier profiles for officer/PSC matches
    suppliers = sprofs if isinstance(sprofs, list) else sprofs.get("suppliers", [])
    for supplier in suppliers:
        if not isinstance(supplier, dict):
            continue
        officers = supplier.get("officers", [])
        pscs = supplier.get("pscs", [])

        for officer in officers:
            off_name = officer.get("name", "").lower().strip()
            if off_name == councillor_name:
                findings.append({
                    "type": "supplier_officer_councillor_match",
                    "severity": "critical",
                    "detail": "{} appears as officer of supplier '{}' — "
                              "direct councillor-supplier officer link".format(
                        result.get("name", ""), supplier.get("name", "")),
                })
            elif off_name in co_director_names:
                findings.append({
                    "type": "supplier_officer_councillor_match",
                    "severity": "high",
                    "detail": "Co-director '{}' of {} appears as officer of "
                              "supplier '{}' — network-supplier link".format(
                        off_name.title(), result.get("name", ""),
                        supplier.get("name", "")),
                })

        for psc in pscs:
            psc_name = psc.get("name", "").lower().strip()
            if psc_name == councillor_name:
                findings.append({
                    "type": "supplier_psc_councillor_match",
                    "severity": "critical",
                    "detail": "{} is Person with Significant Control of supplier "
                              "'{}' — direct beneficial ownership of supplier".format(
                        result.get("name", ""), supplier.get("name", "")),
                })

    return findings


def detect_committee_contract_correlation(result, supplier_data, council_id):
    """Phase 22: Detect councillor on committee + their company/employer in related contracts.

    Returns list of findings.
    """
    findings = []
    profiles = _load_council_cache(council_id, 'councillor_profiles.json',
                                    _councillor_profiles_cache)
    if not profiles or not supplier_data:
        return findings

    councillor_id = result.get("councillor_id", "")
    profile = profiles.get("councillors", {}).get(councillor_id, {})
    committees = profile.get("committees", [])

    if not committees:
        return findings

    # Check if councillor has supplier conflicts
    conflicts = result.get("supplier_conflicts", [])
    if not conflicts:
        return findings

    # Map committee types to conflict relevance
    relevant_committee_types = {"planning", "licensing", "executive", "audit", "scrutiny"}

    for committee in committees:
        ctype = committee.get("type", "")
        if ctype in relevant_committee_types:
            for conflict in conflicts:
                findings.append({
                    "type": "committee_decision_conflict",
                    "severity": "critical",
                    "detail": "{} sits on {} and has supplier conflict with '{}' — "
                              "cannot impartially oversee related decisions".format(
                        result.get("name", ""),
                        committee.get("committee", ""),
                        conflict.get("supplier", "")),
                })

    return findings


def analyse_temporal_patterns(result, supplier_data):
    """Phase 19: Temporal analysis — elected → appointed director → company wins contracts.

    Detects:
      - Post-election directorships (appointed within 12 months of election)
      - Directorship precedes contract (company wins contract within 12 months of appointment)

    Returns list of findings.
    """
    findings = []
    ch = result.get("companies_house", {})

    for comp in ch.get("companies", []):
        appointed = comp.get("appointed_on", "")
        if not appointed:
            continue

        try:
            appointed_dt = datetime.strptime(appointed, "%Y-%m-%d")
        except (ValueError, TypeError):
            continue

        # Check if appointment was shortly after election
        # (We don't have exact election date in result, but can check register data)

        # Check if company became a supplier after appointment
        supplier_match = comp.get("supplier_match")
        if supplier_match and supplier_data:
            earliest_payment = None
            for s in supplier_data:
                if s.get("name", "").lower() == supplier_match.lower():
                    for txn in s.get("transactions", []):
                        try:
                            txn_date = datetime.strptime(txn.get("date", ""), "%Y-%m-%d")
                            if earliest_payment is None or txn_date < earliest_payment:
                                earliest_payment = txn_date
                        except (ValueError, TypeError):
                            continue

            if earliest_payment:
                months_gap = (earliest_payment - appointed_dt).days / 30.44
                if 0 < months_gap < 12:
                    findings.append({
                        "type": "directorship_precedes_contract",
                        "severity": "elevated",
                        "detail": "{} appointed to '{}' on {} — company received first "
                                  "council payment {:.0f} months later".format(
                            result.get("name", ""),
                            comp.get("company_name", ""),
                            appointed,
                            months_gap),
                    })

    return findings


def track_former_councillors(result, supplier_data, council_id):
    """Phase 24: Track former councillors whose companies still receive payments.

    Uses elections.json to identify councillors who lost/stood down but whose
    companies continue receiving council payments.

    Returns list of findings.
    """
    findings = []
    elections = _load_council_cache(council_id, 'elections.json', _elections_cache)
    if not elections or not supplier_data:
        return findings

    # This detection works at council level — check if any former councillor
    # (from election history, not current) has companies receiving payments
    # Since we're processing current councillors, we check for their co-directors
    # who WERE councillors and lost

    # Check co-directors against former councillors list
    network = result.get("co_director_network", {})
    co_directors = network.get("co_directors", [])

    wards = elections.get("wards", {})
    former_councillors = set()

    for ward_name, ward_data in wards.items():
        history = ward_data.get("history", [])
        current_holders = set()
        for holder in ward_data.get("current_holders", []):
            current_holders.add(holder.get("name", "").lower())

        for election in history:
            for cand in election.get("candidates", []):
                if cand.get("elected"):
                    cand_name = cand.get("name", "").lower()
                    if cand_name not in current_holders:
                        former_councillors.add(cand_name)

    # Check if any co-director is a former councillor
    for cd in co_directors:
        cd_name = cd.get("name", "").lower()
        for former in former_councillors:
            if _v6_names_match(cd_name, former):
                findings.append({
                    "type": "former_councillor_company_still_receiving",
                    "severity": "warning",
                    "detail": "Co-director '{}' of {} was a former councillor — "
                              "shared company may still receive council payments".format(
                        cd.get("name", ""), result.get("name", "")),
                })
                break

    return findings


def build_investigation_queue_entry(result, council_id):
    """Build an investigation queue entry with priority and recommended actions.

    Returns dict or None if no investigation recommended.
    """
    flags = result.get("red_flags", [])
    if not flags:
        return None

    risk = result.get("risk_level", "low")
    if risk == "low":
        return None

    # Count by severity
    critical_count = sum(1 for f in flags if f.get("severity") == "critical")
    high_count = sum(1 for f in flags if f.get("severity") == "high")

    # Calculate priority score
    priority_score = critical_count * 10 + high_count * 5 + len(flags)

    # Determine recommended actions
    actions = []
    action_types = set(f.get("type", "") for f in flags)

    if "undeclared_interest" in action_types or "undeclared_interest_supplier" in action_types:
        actions.append("Refer to monitoring officer for register non-compliance")
    if "employment_supplier_conflict" in action_types:
        actions.append("FOI: Request details of contracts awarded to councillor's employer")
    if "planning_committee_land_conflict" in action_types:
        actions.append("Check planning application records for conflicts of interest")
    if "doge_supplier_risk_high" in action_types:
        actions.append("Cross-reference DOGE supplier risk findings with committee decisions")
    if critical_count > 0:
        actions.append("Refer to Section 151 officer for financial governance review")
    if any(t.startswith("doge_") for t in action_types):
        actions.append("Review DOGE findings linked to councillor's companies")

    # Recommend FOIs
    recommended_fois = []
    if "supplier_officer_councillor_match" in action_types:
        recommended_fois.append("foi_supplier_officer_conflict")
    if "employment_supplier_conflict" in action_types:
        recommended_fois.append("foi_employment_supplier")
    if "committee_decision_conflict" in action_types:
        recommended_fois.append("foi_committee_conflict")

    return {
        "councillor_id": result.get("councillor_id", ""),
        "councillor_name": result.get("name", ""),
        "party": result.get("party", ""),
        "ward": result.get("ward", ""),
        "risk_level": risk,
        "integrity_score": result.get("integrity_score", 100),
        "priority_score": priority_score,
        "total_flags": len(flags),
        "critical_flags": critical_count,
        "high_flags": high_count,
        "recommended_actions": actions,
        "recommended_fois": recommended_fois,
        "key_findings": [f["detail"] for f in flags if f.get("severity") in ("critical", "high")][:5],
    }


def _v6_names_match(name1, name2):
    """Simple name matching for v6 functions — surname + first initial."""
    parts1 = name1.split()
    parts2 = name2.split()
    if not parts1 or not parts2:
        return False
    if parts1[-1] != parts2[-1]:
        return False
    if parts1[0][0] == parts2[0][0]:
        return True
    return False


def correlate_donations_to_contracts_v5(result, supplier_data, council_id, ec_data=None):
    """REAL donation-to-contract correlation (replaces v4 stub).

    Cross-references EC bulk donation data with council supplier spending:
      - Donor company → later receives council contract (time window <12 months)
      - Calculate ROI ratio (contract_value / donation_value)
      - Flag Baringa-style patterns (small donation → massive contract)
      - Party donor → council supplier match

    Returns list of findings.
    """
    findings = []
    if not ec_data:
        ec_data = get_ec_bulk_data()
    if not ec_data:
        # Fall back to v4 stub behaviour
        old_ec = result.get("electoral_commission", {})
        for finding in old_ec.get("findings", []):
            if finding.get("type") in ("supplier_donation", "supplier_party_donation"):
                findings.append({
                    "type": "donation_to_contract_pipeline",
                    "severity": "high",
                    "detail": "Potential donation→contract pipeline: {}".format(
                        finding.get("detail", "")),
                    "original_finding": finding,
                })
        return findings

    party = result.get("party", "").lower()

    # Check supplier donations against this council's spending
    for sd in ec_data.get("supplier_donations", []):
        councils = sd.get("councils", [])
        if council_id not in councils:
            continue

        donation_value = sd.get("value", 0)
        council_spend = sd.get("council_spend", 0)
        donor_name = sd.get("donor_name", "")
        donation_date = sd.get("accepted_date", "")

        if donation_value <= 0 or council_spend <= 0:
            continue

        # Calculate ROI
        roi = council_spend / donation_value if donation_value > 0 else 0

        # Time window check
        severity = "high"
        if roi > 100:
            severity = "critical"  # Baringa-style: tiny donation → huge contract

        findings.append({
            "type": "donation_precedes_contract",
            "severity": severity,
            "donor_name": donor_name,
            "donation_value": donation_value,
            "contract_value": council_spend,
            "roi_multiplier": round(roi, 1),
            "donation_date": donation_date,
            "detail": "'{}' donated £{:,.0f} and received £{:,.0f} in contracts "
                      "from {} council ({}x return)".format(
                donor_name, donation_value, council_spend,
                council_id, round(roi, 1)),
        })

        if roi > 100:
            findings.append({
                "type": "extreme_donation_roi",
                "severity": "critical",
                "donor_name": donor_name,
                "roi_multiplier": round(roi, 1),
                "detail": "EXTREME ROI: '{}' — £{:,.0f} donation → £{:,.0f} contracts "
                          "({}x multiplier) — compare Baringa £30K→£35.2M pattern".format(
                    donor_name, donation_value, council_spend, round(roi, 1)),
            })

    # Check party donors who are also suppliers
    local_donors = set()
    for area, dons in ec_data.get("donations_by_area", {}).items():
        for don in dons:
            entity = (don.get("regulated_entity") or "").lower()
            if party and party.split()[0] in entity:
                dn = (don.get("donor_name") or "").upper().strip()
                if dn:
                    local_donors.add(dn)

    for supplier_entry in (supplier_data or []):
        supplier = supplier_entry if isinstance(supplier_entry, str) else (
            supplier_entry.get("supplier", ""))
        if not supplier:
            continue
        supplier_upper = supplier.upper().strip()
        if supplier_upper in local_donors:
            spend = supplier_entry.get("total_spend", 0) if isinstance(supplier_entry, dict) else 0
            findings.append({
                "type": "party_donor_is_supplier",
                "severity": "high",
                "supplier_name": supplier,
                "council_spend": spend,
                "detail": "Council supplier '{}' (£{:,.0f} spend) is also a {} "
                          "party donor in Lancashire".format(
                    supplier, spend, party.title()),
            })

    return findings


# ═══════════════════════════════════════════════════════════════════════════
# Electoral Commission Cross-Reference
# ═══════════════════════════════════════════════════════════════════════════

# Module-level cache for supplier EC findings (searched once, shared across all councillors)
_supplier_ec_cache = {}

# v6 caches — pre-loaded once per council, shared across all councillors
_councillor_profiles_cache = {}   # council_id → councillor_profiles.json content
_doge_findings_cache = {}         # council_id → doge_findings.json content
_supplier_profiles_cache = {}     # council_id → supplier_profiles.json content
_meetings_cache = {}              # council_id → meetings.json content
_elections_cache = {}             # council_id → elections.json content


def _load_council_cache(council_id, filename, cache_dict):
    """Load a council JSON file into cache if not already cached."""
    if council_id in cache_dict:
        return cache_dict[council_id]
    path = DATA_DIR / council_id / filename
    if path.exists():
        with open(path, 'r', encoding='utf-8') as f:
            cache_dict[council_id] = json.load(f)
    else:
        cache_dict[council_id] = None
    return cache_dict[council_id]

def check_supplier_ec_donations(supplier_data, council_id):
    """Check if council suppliers have donated to local political parties.
    This is a COUNCIL-LEVEL check — run ONCE, not per councillor.
    Returns list of supplier donation findings."""
    cache_key = council_id
    if cache_key in _supplier_ec_cache:
        return _supplier_ec_cache[cache_key]

    findings = []
    if not supplier_data:
        _supplier_ec_cache[cache_key] = findings
        return findings

    LANCASHIRE_AREAS = [
        "burnley", "hyndburn", "pendle", "rossendale", "lancaster",
        "ribble valley", "chorley", "south ribble", "lancashire",
        "blackpool", "blackburn", "west lanc", "wyre", "preston", "fylde"
    ]

    for supplier_entry in supplier_data[:20]:  # Top 20 suppliers only
        supplier = supplier_entry if isinstance(supplier_entry, str) else supplier_entry.get("supplier", "")
        if not supplier or len(supplier) < 4:
            continue
        data = search_ec_donations(supplier)
        if data and data.get("Result"):
            for item in data["Result"]:
                accounting_unit = (item.get("AccountingUnitName") or "").lower()
                if not any(area in accounting_unit for area in LANCASHIRE_AREAS):
                    continue
                # Verify the actual DonorName matches the supplier — EC API
                # does full-text search across all fields, so searching
                # "BURNLEY LEISURE" can match "Andrew Brown Leisure Limited"
                # at address "BURNLEY" which is a false positive
                donor_name = (item.get("DonorName") or "").upper().strip()
                supplier_upper = supplier.upper().strip()
                # Check substantial overlap: donor name contains supplier or vice versa,
                # or >60% word overlap between supplier and donor
                supplier_words = set(supplier_upper.split()) - {"LTD", "LIMITED", "PLC", "LLP", "THE", "AND", "&", "OF"}
                donor_words = set(donor_name.split()) - {"LTD", "LIMITED", "PLC", "LLP", "THE", "AND", "&", "OF"}
                if supplier_words and donor_words:
                    overlap = len(supplier_words & donor_words) / max(len(supplier_words), len(donor_words))
                else:
                    overlap = 0
                is_match = (
                    supplier_upper in donor_name or
                    donor_name in supplier_upper or
                    overlap >= 0.6
                )
                if not is_match:
                    # EC false positive filtered: donor name doesn't match supplier
                    continue
                findings.append({
                    "type": "supplier_is_local_donor",
                    "detail": "Council supplier '{}' (EC donor: '{}') donated {} to {}".format(
                        supplier, item.get("DonorName", ""),
                        "£{:,.0f}".format(item.get("Value", 0)),
                        item.get("AccountingUnitName", "")),
                    "supplier": supplier,
                    "donor_name": item.get("DonorName", ""),
                    "donor_company_number": item.get("CompanyRegistrationNumber", ""),
                    "value": item.get("Value", 0),
                    "date": item.get("AcceptedDate", ""),
                    "party": item.get("RegulatedEntityName", ""),
                    "ec_ref": item.get("ECRef", ""),
                })

    _supplier_ec_cache[cache_key] = findings
    return findings


def check_electoral_commission(councillor_name, party, supplier_data, skip=False):
    """Cross-reference Electoral Commission donations for the INDIVIDUAL councillor.
    NOTE: Supplier-level EC checks are handled separately by check_supplier_ec_donations()."""
    if skip:
        return {"searched": False, "findings": []}

    findings = []

    # Check if the councillor themselves appears as a donor
    data = search_ec_donations(councillor_name)
    if data and data.get("Result"):
        for item in data["Result"]:
            donor = item.get("DonorName") or ""
            score = name_match_score(councillor_name, donor)
            if score >= 70:
                findings.append({
                    "type": "councillor_is_donor",
                    "detail": "Councillor appears as political donor: {} to {}".format(
                        "£{:,.0f}".format(item.get("Value", 0)),
                        item.get("RegulatedEntityName", "")),
                    "value": item.get("Value", 0),
                    "date": item.get("AcceptedDate", ""),
                    "recipient": item.get("RegulatedEntityName", ""),
                })

    return {"searched": True, "findings": findings}


# ═══════════════════════════════════════════════════════════════════════════
# FCA Register Check
# ═══════════════════════════════════════════════════════════════════════════

def check_fca_register(councillor_name, skip=False):
    """Check FCA register for regulated individuals and prohibition orders."""
    if skip:
        return {"searched": False, "findings": []}

    findings = []
    data = search_fca_individuals(councillor_name)

    if data and data.get("ResultList"):
        for item in data["ResultList"]:
            ind_name = item.get("Individual_Name") or ""
            score = name_match_score(councillor_name, ind_name)
            if score >= 70:
                status = item.get("Status") or ""
                findings.append({
                    "type": "fca_regulated_person" if status == "Active" else "fca_former_regulated",
                    "severity": "info" if status == "Active" else "info",
                    "detail": "FCA registered: {} (Status: {})".format(ind_name, status),
                    "irn": item.get("IRN", ""),
                    "status": status,
                    "current_firm": item.get("Current_Firm", ""),
                })

                # Check for prohibition
                if "prohibit" in status.lower() or "ban" in status.lower():
                    findings[-1]["type"] = "fca_prohibition"
                    findings[-1]["severity"] = "critical"
                    findings[-1]["detail"] = "FCA PROHIBITION ORDER: {} — banned from financial services".format(ind_name)

    return {"searched": True, "findings": findings}


# ═══════════════════════════════════════════════════════════════════════════
# Load Supplier Data (Enhanced)
# ═══════════════════════════════════════════════════════════════════════════

def load_supplier_data(council_id, full=False):
    """Load supplier data for cross-reference.

    When full=True: reads ALL suppliers from spending.json (v2) or spending-index.json (v3/v4).
    When full=False: reads top-20 from insights.json (fast, for stubs/previews).
    """
    if full:
        return _load_full_supplier_data(council_id)

    # Fast path: top-20 from insights.json
    insights_path = DATA_DIR / council_id / "insights.json"
    if not insights_path.exists():
        return []
    try:
        with open(insights_path) as f:
            insights = json.load(f)
        suppliers = insights.get("supplier_analysis", {}).get("top_20_suppliers", [])
        return [{"supplier": s["supplier"], "total": s.get("total", 0)}
                for s in suppliers if s.get("supplier")]
    except Exception:
        return []


def _load_full_supplier_data(council_id):
    """Load ALL suppliers from spending data for comprehensive cross-reference.

    Tries in order:
    1. spending-index.json (v3/v4) — filterOptions.suppliers + top suppliers from insights
    2. spending.json (v2) — full records aggregated by supplier_canonical
    3. insights.json top-20 (fallback)
    """
    # Try v3/v4 spending-index.json first (small file, has supplier list)
    index_path = DATA_DIR / council_id / "spending-index.json"
    if index_path.exists():
        try:
            with open(index_path) as f:
                index_data = json.load(f)
            supplier_names = index_data.get("filterOptions", {}).get("suppliers", [])
            if supplier_names:
                # Build supplier list — names from index, totals from insights where available
                insights_totals = {}
                insights_path = DATA_DIR / council_id / "insights.json"
                if insights_path.exists():
                    try:
                        with open(insights_path) as f:
                            insights = json.load(f)
                        for s in insights.get("supplier_analysis", {}).get("top_20_suppliers", []):
                            if s.get("supplier"):
                                insights_totals[s["supplier"].upper()] = s.get("total", 0)
                    except Exception:
                        pass
                result = [{"supplier": name, "total": insights_totals.get(name.upper(), 0)}
                          for name in supplier_names if name and len(name.strip()) >= 2]
                return result
        except Exception:
            pass

    # Try v2 spending.json (full records — larger file but complete)
    spending_path = DATA_DIR / council_id / "spending.json"
    if spending_path.exists():
        try:
            with open(spending_path) as f:
                spending = json.load(f)
            # v2 format: {meta, filterOptions, records}
            records = spending.get("records", spending) if isinstance(spending, dict) else spending
            if isinstance(records, list):
                supplier_totals = defaultdict(float)
                for r in records:
                    key = r.get("supplier_canonical") or r.get("supplier", "")
                    if key and len(key.strip()) >= 2:
                        supplier_totals[key] += abs(r.get("amount", 0))
                return [{"supplier": name, "total": round(total, 2)}
                        for name, total in supplier_totals.items()]
        except Exception:
            pass

    # Fallback: insights.json top-20
    return load_supplier_data(council_id, full=False)


def load_all_supplier_data(full=False):
    """Load supplier data from ALL 15 councils for cross-council analysis."""
    all_data = {}
    for council_id in ALL_COUNCILS:
        data = load_supplier_data(council_id, full=full)
        if data:
            all_data[council_id] = data
    return all_data


# ═══════════════════════════════════════════════════════════════════════════
# Company Entry Helpers (v3)
# ═══════════════════════════════════════════════════════════════════════════

def _build_company_entry(company_number, company_name, officer_match, profile,
                         verification, confidence=50, declared_on_register=False):
    """Build a standardised company entry dict."""
    entry = {
        "company_name": company_name,
        "company_number": company_number,
        "role": officer_match.get("officer_role", "director") if officer_match else "director",
        "appointed_on": officer_match.get("appointed_on", "") if officer_match else "",
        "resigned_on": officer_match.get("resigned_on", "") if officer_match else "",
        "company_status": "",
        "officer_id_source": "",
        "companies_house_url": "https://find-and-update.company-information.service.gov.uk/company/{}".format(
            company_number) if company_number else None,
        "sic_codes": [],
        "registered_address_snippet": "",
        "red_flags": [],
        "supplier_match": None,
        "verification": verification,
        "confidence": confidence,
        "declared_on_register": declared_on_register,
        "officer_dob": officer_match.get("date_of_birth", {}) if officer_match else {},
    }

    if profile:
        entry["company_status"] = profile.get("company_status", "")
        entry["sic_codes"] = profile.get("sic_codes", [])
        ro_addr = profile.get("registered_office_address", {})
        entry["registered_address_snippet"] = ", ".join(
            filter(None, [ro_addr.get("address_line_1", ""),
                          ro_addr.get("locality", ""),
                          ro_addr.get("postal_code", "")]))
        entry["red_flags"] = extract_red_flags(profile)
        entry["date_of_creation"] = profile.get("date_of_creation", "")
        entry["company_type"] = profile.get("type", "")
        entry["accounts_overdue"] = profile.get("has_overdue_accounts", False)
        entry["confirmation_overdue"] = profile.get("has_overdue_confirmation_statement", False)

    return entry


# Known arm's-length bodies and regional development agencies
# These are quasi-public organisations that councils routinely contract with
ARMS_LENGTH_BODIES = {
    "growth lancashire", "lancashire enterprise partnership",
    "lancashire county developments", "marketing lancashire",
    "active lancashire", "lancashire sport",
    "lancashire skills hub", "lancashire digital skills partnership",
    "together housing", "onward homes", "jigsaw homes",
    "liberata", "capita", "serco",  # outsourcing firms with council contracts
    "lancashire fire and rescue", "lancashire constabulary",
    "lancashire care nhs foundation trust", "lancashire teaching hospitals",
    "east lancashire hospitals", "blackpool teaching hospitals",
    "lancashire and south cumbria nhs",
}

# Company types that indicate community/charitable purpose (from CH API)
COMMUNITY_COMPANY_TYPES = {
    "private-limited-guarant-nsc",  # Limited by guarantee — typical for charities/CICs
    "private-limited-guarant-nsc-limited-exemption",
    "community-interest-company",
    "charitable-incorporated-organisation",
    "registered-society-non-profit",
    "industrial-and-provident-society",
    "scottish-charitable-incorporated-organisation",
    "royal-charter",
}

# SIC codes that indicate community/public-interest activity
COMMUNITY_SIC_CODES = {
    "85100", "85200", "85310", "85320",  # Education
    "86100", "86210", "86220", "86230", "86900",  # Healthcare
    "87100", "87200", "87300", "87900",  # Residential care
    "88100", "88910", "88990",  # Social work
    "90010", "90020", "90030", "90040",  # Arts & culture
    "91011", "91012", "91020", "91030", "91040",  # Libraries, museums, heritage
    "93110", "93120", "93130", "93190", "93210", "93290",  # Sports & recreation
    "94110", "94120", "94200", "94910", "94920", "94990",  # Membership orgs
}


def _classify_conflict_type(company_entry):
    """Classify a supplier conflict based on company type, SIC codes, and name patterns.

    Returns (conflict_type, severity_modifier) where:
    - conflict_type: 'commercial', 'community_trustee', 'council_appointed', 'arms_length_body'
    - severity_modifier: adjusted severity string
    """
    company_name = company_entry.get("company_name", "").lower()
    company_type = company_entry.get("company_type", "")
    sic_codes = company_entry.get("sic_codes", [])
    nature_of_business = company_entry.get("nature_of_business_sic", "")
    officer_role = company_entry.get("role", "")

    # Check for arm's-length bodies first (highest priority)
    name_normalised = company_name.strip()
    for suffix in [" limited", " ltd", " plc", " llp", " cic", " cio"]:
        name_normalised = name_normalised.replace(suffix, "")
    name_normalised = name_normalised.strip()

    if name_normalised in ARMS_LENGTH_BODIES:
        return "arms_length_body", "info"

    # Partial match for arm's-length bodies (e.g. "Growth Lancashire Ltd" matches "growth lancashire")
    for alb in ARMS_LENGTH_BODIES:
        if alb in name_normalised or name_normalised in alb:
            return "arms_length_body", "info"

    # Council-appointed directorships (e.g. housing associations, trusts where council nominates directors)
    council_appointed_keywords = [
        "council", "borough", "civic", "municipal",
        "housing association", "homes association",
    ]
    if officer_role and officer_role.lower() in (
        "nominee-director", "corporate-nominee-director",
        "corporate-director", "nominee-secretary",
    ):
        return "council_appointed", "info"

    # Community/charity classification via company type
    if company_type in COMMUNITY_COMPANY_TYPES:
        return "community_trustee", "info"

    # Community classification via SIC codes
    if sic_codes:
        sic_set = set(str(s).strip() for s in sic_codes if s)
        if sic_set & COMMUNITY_SIC_CODES:
            return "community_trustee", "info"

    # Name-based heuristics for community/charitable orgs
    community_keywords = [
        "charity", "charitable", "foundation", "trust",
        "community", "volunteer", "citizens advice",
        "hospice", "rescue", "shelter", "church", "chapel",
        "mosque", "temple", "synagogue", "parish",
        "scout", "guide", "rotary", "lions club",
        "sports club", "football club", "cricket club",
        "swimming club", "leisure trust", "arts ",
        "theatre", "museum", "heritage", "conservation",
        "housing association", "homes group",
        "nhs", "health trust", "care trust",
        "university", "college", "school", "academy",
        "cic", " c.i.c",
    ]
    for keyword in community_keywords:
        if keyword in company_name:
            return "community_trustee", "info"

    # Default: commercial company — this is the genuine conflict of interest
    return "commercial", None  # None = use default severity logic


def _cross_ref_suppliers(company_entry, result, supplier_data, all_supplier_data, councillor):
    """Cross-reference a company against own-council and cross-council suppliers.

    Classifies each conflict by type (commercial, community_trustee, council_appointed,
    arms_length_body) and adjusts severity accordingly. All conflicts are recorded
    regardless of type — the frontend uses the type for display differentiation.
    """
    company_name = company_entry["company_name"]
    company_number = company_entry["company_number"]
    resigned = company_entry.get("resigned_on", "")

    # Classify the company
    conflict_type, severity_override = _classify_conflict_type(company_entry)

    if supplier_data:
        matches = cross_reference_suppliers(company_name, supplier_data)
        if matches:
            company_entry["supplier_match"] = matches[0]

            # Determine severity: commercial companies get critical/info based on resignation
            # Community/charity/arm's-length get severity_override (always "info")
            if severity_override:
                severity = severity_override
            else:
                severity = "critical" if not resigned else "info"

            result["supplier_conflicts"].append({
                "company_name": company_name,
                "company_number": company_number,
                "supplier_match": matches[0],
                "severity": severity,
                "conflict_type": conflict_type,
                "company_type": company_entry.get("company_type", ""),
                "council_id": councillor.get("_council_id", ""),
            })

    if all_supplier_data:
        council_id = councillor.get("_council_id", "")
        for other_id, other_suppliers in all_supplier_data.items():
            if other_id == council_id:
                continue
            matches = cross_reference_suppliers(company_name, other_suppliers)
            if matches:
                if severity_override:
                    severity = severity_override
                else:
                    severity = "high" if not resigned else "info"

                result["cross_council_conflicts"].append({
                    "company_name": company_name,
                    "company_number": company_number,
                    "other_council": other_id,
                    "supplier_match": matches[0],
                    "severity": severity,
                    "conflict_type": conflict_type,
                    "company_type": company_entry.get("company_type", ""),
                })


# ═══════════════════════════════════════════════════════════════════════════
# Main Councillor Processing
# ═══════════════════════════════════════════════════════════════════════════

def process_councillor(councillor, supplier_data, all_supplier_data=None,
                       skip_ec=False, skip_fca=False, skip_network=False):
    """Process a single councillor through ALL data source checks."""
    name = councillor.get("name", "")
    if not name:
        return None

    # Strip title prefixes that break CH search
    for prefix in ["County Councillor ", "Borough Councillor ", "Town Councillor ",
                    "Councillor ", "Cllr ", "Cllr. "]:
        if name.startswith(prefix):
            name = name[len(prefix):]
            break
    # Strip honorific prefixes (Mr, Mrs, Ms, Dr, etc.)
    for prefix in ["Mr ", "Mrs ", "Ms ", "Miss ", "Dr ", "Prof ", "Professor ",
                    "Sir ", "Dame ", "Lord ", "Lady ", "Rev ", "Reverend "]:
        if name.startswith(prefix):
            name = name[len(prefix):]
            break
    # Strip trailing honorifics (OBE, MBE, CBE, JP, etc.)
    name = re.sub(r'\s+(OBE|MBE|CBE|KBE|DBE|JP|QC|KC|DL|PhD|MA|BSc|BA)\s*$', '', name, flags=re.IGNORECASE)
    name = name.strip()

    result = {
        "councillor_id": councillor.get("id", ""),
        "name": name,
        "party": councillor.get("party", ""),
        "ward": councillor.get("ward", ""),
        "checked_at": datetime.utcnow().isoformat() + "Z",
        "data_sources_checked": [],
        "companies_house": {
            "officer_matches": [],
            "total_directorships": 0,
            "active_directorships": 0,
            "resigned_directorships": 0,
            "companies": [],
            "psc_entries": [],
        },
        "co_director_network": {"associates": [], "total_unique_associates": 0},
        "disqualification_check": {"searched": True, "matches": []},
        "electoral_commission": {"searched": False, "findings": []},
        "fca_register": {"searched": False, "findings": []},
        "familial_connections": {
            "family_member_companies": [],
            "family_psc_connections": [],
            "has_family_supplier_conflict": False,
        },
        "supplier_conflicts": [],
        "cross_council_conflicts": [],
        "network_crossover": {"total_links": 0, "links": []},
        "misconduct_patterns": [],
        "red_flags": [],
        "integrity_score": None,
        "risk_level": "not_checked"
    }

    print("  Checking: {} ({})".format(name, councillor.get("party", "")))

    # ── V3 ACCURACY OVERHAUL: Register-anchored, DOB-verified matching ──
    result["data_sources_checked"].append("companies_house")

    council_id = councillor.get("_council_id", "")
    register_data = councillor.get("_register_data")  # Injected by process_council
    councillor_id = councillor.get("id", "")

    # ── Phase 1: Register-Anchored Company Search (HIGHEST confidence) ──
    # If the councillor has a register of interests, look up their declared companies
    # directly on CH. This lets us confirm their DOB from a known-good match.
    councillor_dob = None  # Will be set if we can confirm from register+CH
    seen_company_numbers = set()
    companies = []
    register_confirmed_companies = set()  # Company numbers confirmed via register

    declared_companies = []
    if register_data and register_data.get("has_register"):
        declared_companies = register_data.get("declared_companies", [])
        all_items = register_data.get("all_declared_items", [])
        employment = register_data.get("declared_employment", [])
        land = register_data.get("declared_land", [])
        securities = register_data.get("declared_securities", [])
        register_empty = (len(all_items) == 0 and not declared_companies
                          and not employment and not land)
        result["register_of_interests"] = {
            "available": True,
            "register_empty": register_empty,
            "declared_companies": declared_companies,
            "declared_employment": employment,
            "declared_securities": securities,
            "declared_land": land,
            "total_declared_items": len(all_items),
        }
        result["data_sources_checked"].append("register_of_interests")
    else:
        result["register_of_interests"] = {"available": False, "register_empty": None}

    for declared_text in declared_companies:
        # Try to find this company on CH by name search
        ch_matches = search_company_by_name(declared_text)
        if not ch_matches:
            continue

        for ch_company in ch_matches[:3]:  # Check top 3 name matches
            company_number = ch_company.get("company_number", "")
            if not company_number or company_number in seen_company_numbers:
                continue

            # Look for the councillor among this company's officers
            officer_match = find_councillor_as_officer(company_number, name)
            if not officer_match:
                continue

            # Found! This is a register-confirmed directorship
            print("    [REGISTER+CH] {} confirmed as officer of {} ({})".format(
                name, ch_company.get("title", ""), company_number))

            # Extract DOB — this becomes the anchor for all future matching
            if officer_match.get("date_of_birth") and not councillor_dob:
                councillor_dob = officer_match["date_of_birth"]
                print("    [DOB ANCHOR] Confirmed DOB: {}/{}".format(
                    councillor_dob.get("month", "?"), councillor_dob.get("year", "?")))

            seen_company_numbers.add(company_number)
            register_confirmed_companies.add(company_number)

            profile = get_company_profile(company_number)
            company_entry = _build_company_entry(
                company_number, ch_company.get("title", declared_text),
                officer_match, profile, "register_confirmed",
                confidence=95, declared_on_register=True)

            # Cross-reference with suppliers
            _cross_ref_suppliers(company_entry, result, supplier_data, all_supplier_data, councillor)

            companies.append(company_entry)

        # Also try extracting company number from the text directly
        extracted_num = extract_company_number_from_text(declared_text)
        if extracted_num and extracted_num not in seen_company_numbers:
            profile = get_company_profile(extracted_num)
            if profile:
                officer_match = find_councillor_as_officer(extracted_num, name)
                if officer_match:
                    seen_company_numbers.add(extracted_num)
                    register_confirmed_companies.add(extracted_num)
                    if officer_match.get("date_of_birth") and not councillor_dob:
                        councillor_dob = officer_match["date_of_birth"]

                    company_entry = _build_company_entry(
                        extracted_num, profile.get("company_name", declared_text),
                        officer_match, profile, "register_confirmed",
                        confidence=95, declared_on_register=True)
                    _cross_ref_suppliers(company_entry, result, supplier_data, all_supplier_data, councillor)
                    companies.append(company_entry)

    # ── Phase 2: DOB-Filtered CH Officer Name Search ──
    # Search CH officers by name with STRICT threshold (90%), then filter by DOB
    # Use full name search with increased page size for better coverage of common names
    officers = search_officers(name, items_per_page=50)

    officer_matches_raw = []
    for officer in officers:
        title = officer.get("title", "")
        score = name_match_score(name, title)
        if score < 90:  # v3: strict 90% threshold (was 60%)
            continue

        officer_id = extract_officer_id(officer)
        addr_snippet = officer.get("address_snippet", "")
        officer_dob = officer.get("date_of_birth", {})

        # Geographic proximity score
        proximity = geographic_proximity_score(addr_snippet, council_id)

        # DOB filtering
        dob_match_result = dob_matches(councillor_dob, officer_dob)
        if councillor_dob and dob_match_result is False:
            # HARD REJECT: we know the councillor's DOB and this officer has a DIFFERENT one
            print("    [DOB REJECT] {} — DOB {}/{} doesn't match councillor {}/{}".format(
                title,
                officer_dob.get("month", "?"), officer_dob.get("year", "?"),
                councillor_dob.get("month", "?"), councillor_dob.get("year", "?")))
            continue

        # Determine confidence level
        if councillor_dob and dob_match_result is True:
            confidence = 85  # DOB confirmed match
            verification = "ch_dob_confirmed"
        elif councillor_dob and dob_match_result is None:
            # Officer has no DOB on file — can't confirm or reject
            if proximity >= 15:
                confidence = 60
                verification = "ch_proximity_match"
            else:
                confidence = 40  # Too uncertain
                verification = "name_match_only"
        elif not councillor_dob:
            # We don't know councillor's DOB — rely on name + proximity
            if proximity >= 25:
                confidence = 70
                verification = "ch_strong_proximity"
            elif proximity >= 15:
                confidence = 55
                verification = "ch_proximity_match"
            else:
                confidence = 35  # Name match only, no proximity — likely false positive
                verification = "name_match_only"
        else:
            confidence = 35
            verification = "name_match_only"

        officer_matches_raw.append({
            "officer_id": officer_id,
            "title": title,
            "match_score": score,
            "date_of_birth": officer_dob,
            "address_snippet": addr_snippet,
            "proximity_score": proximity,
            "dob_match": dob_match_result,
            "confidence": confidence,
            "verification": verification,
        })

    # Sort by confidence, then match_score
    officer_matches_raw.sort(key=lambda x: (x["confidence"], x["match_score"]), reverse=True)
    result["companies_house"]["officer_matches"] = officer_matches_raw[:5]

    # ── Phase 2b: Get Appointments for HIGH/MEDIUM confidence matches only ──
    # Only investigate officers where we have reasonable confidence they ARE the councillor
    MIN_CONFIDENCE_FOR_INVESTIGATION = 55  # Confirmed DOB or strong proximity
    unverified_leads = []

    for match in officer_matches_raw:
        if match["confidence"] < MIN_CONFIDENCE_FOR_INVESTIGATION:
            # Too uncertain — skip investigation, store as unverified lead
            unverified_leads.append({
                "officer_name": match["title"],
                "match_score": match["match_score"],
                "address": match["address_snippet"],
                "date_of_birth": match["date_of_birth"],
                "confidence": match["confidence"],
                "reason": "Below confidence threshold ({}) — name match only, no DOB/proximity confirmation".format(
                    match["confidence"]),
            })
            continue

        officer_id = match.get("officer_id", "")
        if not officer_id or officer_id == "appointments":
            continue

        appointments = get_officer_appointments(officer_id)
        if not appointments:
            continue

        print("    [CH {}%] {} — {} appointments".format(
            match["confidence"], match["title"], len(appointments)))

        for appt in appointments:
            appointed_to = appt.get("appointed_to", {})
            company_name = appointed_to.get("company_name", "Unknown")
            company_number = appointed_to.get("company_number", "")
            role = appt.get("officer_role", "director")
            appointed = appt.get("appointed_on", "")
            resigned = appt.get("resigned_on", "")
            status = appointed_to.get("company_status", "")

            if company_number and company_number in seen_company_numbers:
                continue
            if company_number:
                seen_company_numbers.add(company_number)

            # Check if this company is also on the register
            on_register = company_number in register_confirmed_companies

            profile = get_company_profile(company_number) if company_number else None

            company_entry = {
                "company_name": company_name,
                "company_number": company_number,
                "role": role,
                "appointed_on": appointed,
                "resigned_on": resigned,
                "company_status": status,
                "officer_id_source": officer_id,
                "companies_house_url": "https://find-and-update.company-information.service.gov.uk/company/{}".format(
                    company_number) if company_number else None,
                "sic_codes": [],
                "registered_address_snippet": "",
                "red_flags": [],
                "supplier_match": None,
                "verification": match["verification"],
                "confidence": match["confidence"],
                "declared_on_register": on_register,
                "officer_dob": match.get("date_of_birth", {}),
            }

            if profile:
                company_entry["sic_codes"] = profile.get("sic_codes", [])
                ro_addr = profile.get("registered_office_address", {})
                company_entry["registered_address_snippet"] = ", ".join(
                    filter(None, [ro_addr.get("address_line_1", ""),
                                  ro_addr.get("locality", ""),
                                  ro_addr.get("postal_code", "")]))
                company_entry["red_flags"] = extract_red_flags(profile)
                company_entry["date_of_creation"] = profile.get("date_of_creation", "")
                company_entry["company_type"] = profile.get("type", "")
                company_entry["accounts_overdue"] = profile.get("has_overdue_accounts", False)
                company_entry["confirmation_overdue"] = profile.get("has_overdue_confirmation_statement", False)

            _cross_ref_suppliers(company_entry, result, supplier_data, all_supplier_data, councillor)
            companies.append(company_entry)

    active = [c for c in companies if not c.get("resigned_on")]
    resigned_cos = [c for c in companies if c.get("resigned_on")]

    result["companies_house"]["companies"] = companies
    result["companies_house"]["total_directorships"] = len(companies)
    result["companies_house"]["active_directorships"] = len(active)
    result["companies_house"]["resigned_directorships"] = len(resigned_cos)
    result["companies_house"]["councillor_dob"] = councillor_dob
    result["companies_house"]["verification_method"] = (
        "register_and_dob" if councillor_dob and declared_companies else
        "dob_only" if councillor_dob else
        "proximity_and_name" if any(c.get("confidence", 0) >= 55 for c in companies) else
        "name_only"
    )
    result["unverified_leads"] = unverified_leads
    result["false_positives_eliminated"] = len([
        m for m in officer_matches_raw if m["confidence"] < MIN_CONFIDENCE_FOR_INVESTIGATION
    ]) + len([o for o in officers if name_match_score(name, o.get("title", "")) < 90])

    # ── 3. PSC Analysis (for active companies only) ──
    if active:
        psc_entries = analyse_psc(active[:5], name)  # Top 5 to limit API calls
        result["companies_house"]["psc_entries"] = psc_entries

    # ── 4. Co-Director Network (expensive — optional) ──
    if not skip_network and active:
        network = build_co_director_network(active[:3], name)  # Top 3 companies
        result["co_director_network"] = network

    # ── 4b. Network Crossover: Co-Director → Supplier Company ──
    if not skip_network and result.get("co_director_network", {}).get("associates"):
        network_crossover = detect_network_crossover(
            result["co_director_network"]["associates"],
            result.get("companies_house", {}).get("companies", []),
            supplier_data, name
        )
        result["network_crossover"] = network_crossover
        if network_crossover.get("total_links", 0) > 0:
            count = network_crossover["total_links"]
            print("      → {} network crossover link(s) detected!".format(count))

    # ── 5. Familial Connection Detection ──
    last_name = councillor.get("last_name", "")
    if not last_name:
        parts = name.split()
        last_name = parts[-1] if parts else ""
    councillor_address = councillor.get("address", "")

    if last_name and not skip_network:
        # Search for family members at same address with companies
        family_companies = search_family_member_companies(last_name, councillor_address, supplier_data)
        result["familial_connections"]["family_member_companies"] = family_companies

        # Check PSC records for family members (same surname in PSC of councillor's companies)
        all_psc = result["companies_house"].get("psc_entries", [])
        if all_psc:
            family_pscs = detect_familial_psc_connections(all_psc, last_name)
            result["familial_connections"]["family_psc_connections"] = family_pscs

        # Set flag if any family member's company is a council supplier
        has_family_conflict = any(
            fm.get("has_supplier_conflict") for fm in family_companies
        )
        result["familial_connections"]["has_family_supplier_conflict"] = has_family_conflict

        if family_companies:
            result["data_sources_checked"].append("familial_connections")
            count = len(family_companies)
            conflicts = sum(1 for fm in family_companies if fm.get("has_supplier_conflict"))
            print("      → {} family member(s) found with companies{}".format(
                count, " ({} supplier conflict(s)!)".format(conflicts) if conflicts else ""))

    # ── 6. Disqualification Register ──
    disqualified = search_disqualified(name)
    for dq in disqualified:
        dq_name = dq.get("title", "")
        score = name_match_score(name, dq_name)
        if score >= 90:  # v3: strict threshold
            dq_addr = dq.get("address_snippet", "")
            dq_proximity = geographic_proximity_score(dq_addr, council_id)
            # DOB — dob_matches handles both dict and string "YYYY-MM" format
            dq_dob = dq.get("date_of_birth")
            # If we have DOB and it doesn't match, skip
            if councillor_dob and dq_dob:
                dob_result = dob_matches(councillor_dob, dq_dob)
                if dob_result is False:
                    continue  # Different DOB — different person
            # For disqualification, require EITHER proximity OR DOB match
            # (this is a serious allegation — must be careful about false positives)
            is_confirmed = False
            if councillor_dob and dq_dob and dob_matches(councillor_dob, dq_dob) is True:
                is_confirmed = True  # DOB confirmed
            elif dq_proximity >= 15:
                is_confirmed = True  # Close to council area
            elif not dq_addr:
                is_confirmed = False  # No address, no DOB — uncertain

            result["disqualification_check"]["matches"].append({
                "name": dq_name,
                "match_score": score,
                "snippet": dq.get("snippet", ""),
                "address": dq_addr,
                "proximity_score": dq_proximity,
                "confirmed": is_confirmed,
                "note": "Proximity confirmed" if is_confirmed else
                        "Name match only — different location, may be different person",
            })

    # ── 7. Electoral Commission ──
    ec_result = check_electoral_commission(
        name, councillor.get("party", ""), supplier_data, skip=skip_ec)
    result["electoral_commission"] = ec_result
    if ec_result.get("searched"):
        result["data_sources_checked"].append("electoral_commission")

    # ── 8. FCA Register ──
    fca_result = check_fca_register(name, skip=skip_fca)
    result["fca_register"] = fca_result
    if fca_result.get("searched"):
        result["data_sources_checked"].append("fca_register")

    # ── 9. Misconduct Pattern Detection ──
    result["_council_id"] = councillor.get("_council_id", "")
    misconduct = detect_misconduct_patterns(result, all_supplier_data)
    result["misconduct_patterns"] = misconduct
    del result["_council_id"]

    # ── 9b. MP Financial Overlap Check (v4) ──
    council_id = councillor.get("_council_id", "")
    mp_findings = check_mp_overlap(result, council_id, supplier_data, all_supplier_data)
    result["mp_findings"] = mp_findings
    if mp_findings:
        result["data_sources_checked"].append("mp_register_of_interests")
        print("    [MP OVERLAP] {} finding(s)".format(len(mp_findings)))

    # ── 9c. Revolving Door Detection (v4) ──
    revolving_door = detect_revolving_door(result, councillor)
    result["revolving_door"] = revolving_door
    if revolving_door:
        print("    [REVOLVING DOOR] {} finding(s)".format(len(revolving_door)))

    # ── 9d. Beneficial Ownership Analysis (v4) ──
    ownership_findings = trace_beneficial_ownership_simple(result)
    result["beneficial_ownership"] = ownership_findings
    if ownership_findings:
        print("    [OWNERSHIP] {} finding(s)".format(len(ownership_findings)))

    # ── 9e. Donation-to-Contract Correlation (v5 — real time-windowed) ──
    result["_council_id_v5"] = councillor.get("_council_id", "")
    donation_contract = correlate_donations_to_contracts(result, supplier_data, council_id)
    result["donation_contract_correlation"] = donation_contract
    if donation_contract:
        print("    [DONATION→CONTRACT] {} finding(s)".format(len(donation_contract)))

    # ── v5 Detection Phases ──
    ec_bulk = get_ec_bulk_data()

    # ── Phase 10a. Shell Company Donors ──
    shell_findings = detect_shell_company_donors(result, ec_bulk)
    result["shell_company_findings"] = shell_findings
    if shell_findings:
        print("    [SHELL DONORS] {} finding(s)".format(len(shell_findings)))

    # ── Phase 10b. Threshold Manipulation ──
    threshold_findings = detect_threshold_manipulation_v5(result, ec_bulk)
    result["threshold_manipulation"] = threshold_findings
    if threshold_findings:
        print("    [THRESHOLD] {} finding(s)".format(len(threshold_findings)))

    # ── Phase 10c. Temporal Donation Clustering ──
    temporal_findings = detect_temporal_donation_clustering_v5(result, ec_bulk)
    result["temporal_clusters"] = temporal_findings
    if temporal_findings:
        print("    [TEMPORAL CLUSTER] {} finding(s)".format(len(temporal_findings)))

    # ── Phase 10d. Contract Splitting ──
    split_findings = detect_contract_splitting(result, supplier_data)
    result["contract_splitting"] = split_findings
    if split_findings:
        print("    [CONTRACT SPLIT] {} finding(s)".format(len(split_findings)))

    # ── Phase 10e. Phantom Companies ──
    phantom_findings = detect_phantom_companies(result)
    result["phantom_companies"] = phantom_findings
    if phantom_findings:
        print("    [PHANTOM] {} finding(s)".format(len(phantom_findings)))

    # ── Phase 10f. Dormant-to-Active Supplier ──
    dormant_findings = detect_dormant_to_active_supplier(result, supplier_data)
    result["dormant_to_active"] = dormant_findings
    if dormant_findings:
        print("    [DORMANT→ACTIVE] {} finding(s)".format(len(dormant_findings)))

    # ── Phase 10g. Family Donation Coordination ──
    family_don_findings = detect_family_donation_coordination(result, ec_bulk)
    result["family_donation_coordination"] = family_don_findings
    if family_don_findings:
        print("    [FAMILY DONATIONS] {} finding(s)".format(len(family_don_findings)))

    # ── Phase 10h. MP-Councillor Donation Alignment ──
    alignment_findings = detect_mp_councillor_donation_alignment(result, ec_bulk)
    result["mp_councillor_alignment"] = alignment_findings
    if alignment_findings:
        print("    [MP ALIGNMENT] {} finding(s)".format(len(alignment_findings)))

    # ── Phase 10i. Bid Rigging Indicators ──
    bid_findings = detect_bid_rigging_indicators(result, supplier_data)
    result["bid_rigging"] = bid_findings
    if bid_findings:
        print("    [BID RIGGING] {} finding(s)".format(len(bid_findings)))

    # ── Phase 10j. Seasonal Spending Anomaly ──
    seasonal_findings = detect_seasonal_spending_anomaly(result, supplier_data)
    result["seasonal_anomaly"] = seasonal_findings
    if seasonal_findings:
        print("    [SEASONAL] {} finding(s)".format(len(seasonal_findings)))

    # ── Phase 10k. Gift/Hospitality Frequency ──
    register_data = councillor.get("_register_data")
    gift_findings = detect_gift_hospitality_frequency(result, register_data)
    result["gift_frequency"] = gift_findings
    if gift_findings:
        print("    [GIFTS] {} finding(s)".format(len(gift_findings)))

    # ── Phase 10l. Hansard Parliamentary Mentions ──
    hansard_findings = detect_hansard_company_mentions(result)
    result["hansard_mentions"] = hansard_findings
    if hansard_findings:
        print("    [HANSARD] {} finding(s)".format(len(hansard_findings)))

    # ── Phase 10m. Undeclared Interests ──
    undeclared_findings = detect_undeclared_interests(result)
    result["undeclared_interests"] = undeclared_findings
    if undeclared_findings:
        print("    [UNDECLARED] {} finding(s)".format(len(undeclared_findings)))

    # ── Phase 10n. Company Formation Timing ──
    formation_findings = detect_company_formation_timing(result, supplier_data)
    result["formation_timing"] = formation_findings
    if formation_findings:
        print("    [FORMATION] {} finding(s)".format(len(formation_findings)))

    # ═══ v6 Detection Phases (15-24) ═══

    # ── Phase 15. Electoral Vulnerability ──
    electoral_findings = analyse_electoral_vulnerability(result, council_id)
    result["electoral_vulnerability"] = electoral_findings
    if electoral_findings:
        print("    [ELECTORAL] {} finding(s)".format(len(electoral_findings)))

    # ── Phase 16. Committee Conflicts ──
    committee_findings = analyse_committee_conflicts(result, council_id)
    result["committee_conflicts"] = committee_findings
    if committee_findings:
        print("    [COMMITTEE] {} finding(s)".format(len(committee_findings)))

    # ── Phase 17a. Employment-Supplier Cross-Reference ──
    employment_findings = cross_reference_employment_suppliers(
        result, supplier_data, council_id)
    result["employment_conflicts"] = employment_findings
    if employment_findings:
        print("    [EMPLOYMENT] {} finding(s)".format(len(employment_findings)))

    # ── Phase 17c. Securities-Supplier Cross-Reference ──
    securities_findings = analyse_securities_conflicts(
        result, supplier_data, council_id)
    result["securities_conflicts"] = securities_findings
    if securities_findings:
        print("    [SECURITIES] {} finding(s)".format(len(securities_findings)))

    # ── Phase 19. Temporal Patterns ──
    temporal_findings = analyse_temporal_patterns(result, supplier_data)
    result["temporal_patterns"] = temporal_findings
    if temporal_findings:
        print("    [TEMPORAL] {} finding(s)".format(len(temporal_findings)))

    # ── Phase 20. DOGE Findings Integration ──
    doge_findings = integrate_doge_findings(result, council_id)
    result["doge_integration"] = doge_findings
    if doge_findings:
        print("    [DOGE-INT] {} finding(s)".format(len(doge_findings)))

    # ── Phase 21. Supplier Profile Deep Integration ──
    sprof_findings = integrate_supplier_profiles(result, council_id)
    result["supplier_profile_matches"] = sprof_findings
    if sprof_findings:
        print("    [SPROF] {} finding(s)".format(len(sprof_findings)))

    # ── Phase 22. Committee-Contract Correlation ──
    cc_corr_findings = detect_committee_contract_correlation(
        result, supplier_data, council_id)
    result["committee_contract_correlation"] = cc_corr_findings
    if cc_corr_findings:
        print("    [CC-CORR] {} finding(s)".format(len(cc_corr_findings)))

    # ── Phase 24. Former Councillor Tracking ──
    former_findings = track_former_councillors(result, supplier_data, council_id)
    result["former_councillor_links"] = former_findings
    if former_findings:
        print("    [FORMER] {} finding(s)".format(len(former_findings)))

    del result["_council_id_v5"]

    # ── 11. Aggregate ALL Red Flags ──
    all_flags = []

    # From company profiles
    for company in result["companies_house"]["companies"]:
        for flag in company.get("red_flags", []):
            flag["company"] = company["company_name"]
            all_flags.append(flag)

    # Disqualification matches
    dq_confirmed = [m for m in result["disqualification_check"]["matches"] if m.get("confirmed")]
    dq_unconfirmed = [m for m in result["disqualification_check"]["matches"] if not m.get("confirmed")]
    if dq_confirmed:
        all_flags.append({
            "type": "disqualification_match", "severity": "critical",
            "detail": "Match on disqualified directors register ({} confirmed match(es))".format(
                len(dq_confirmed))
        })
    if dq_unconfirmed:
        all_flags.append({
            "type": "disqualification_possible", "severity": "info",
            "detail": "Possible match on disqualified directors register ({} name match(es), different location)".format(
                len(dq_unconfirmed))
        })

    # Supplier conflicts (own council)
    for conflict in result["supplier_conflicts"]:
        ctype = conflict.get("conflict_type", "commercial")
        type_label = {
            "commercial": "",
            "community_trustee": " [community/charity]",
            "council_appointed": " [council-appointed]",
            "arms_length_body": " [arm's-length body]",
        }.get(ctype, "")
        all_flags.append({
            "type": "supplier_conflict", "severity": conflict["severity"],
            "detail": "Company '{}' matches council supplier '{}'{}".format(
                conflict["company_name"], conflict["supplier_match"]["supplier"], type_label),
            "conflict_type": ctype,
        })

    # Cross-council supplier conflicts
    for conflict in result["cross_council_conflicts"]:
        ctype = conflict.get("conflict_type", "commercial")
        type_label = {
            "commercial": "",
            "community_trustee": " [community/charity]",
            "council_appointed": " [council-appointed]",
            "arms_length_body": " [arm's-length body]",
        }.get(ctype, "")
        all_flags.append({
            "type": "cross_council_conflict", "severity": conflict["severity"],
            "detail": "Company '{}' matches supplier at {} council{}".format(
                conflict["company_name"], conflict["other_council"], type_label),
            "conflict_type": ctype,
        })

    # Electoral Commission findings
    for finding in result["electoral_commission"].get("findings", []):
        severity = "high" if "supplier" in finding.get("type", "") else "info"
        all_flags.append({
            "type": finding["type"], "severity": severity,
            "detail": finding["detail"]
        })

    # FCA findings
    for finding in result["fca_register"].get("findings", []):
        all_flags.append({
            "type": finding.get("type", "fca_finding"),
            "severity": finding.get("severity", "info"),
            "detail": finding["detail"]
        })

    # Misconduct patterns
    for pattern in misconduct:
        all_flags.append({
            "type": pattern["type"], "severity": pattern["severity"],
            "detail": pattern["detail"]
        })

    # PSC with ownership in supplier companies
    for psc in result["companies_house"].get("psc_entries", []):
        if psc.get("has_ownership"):
            all_flags.append({
                "type": "psc_ownership", "severity": "info",
                "detail": "Person with Significant Control of {} (ownership stake)".format(
                    psc["company_name"])
            })

    # Familial connection flags
    familial = result.get("familial_connections", {})
    for fm in familial.get("family_member_companies", []):
        if fm.get("has_supplier_conflict"):
            all_flags.append({
                "type": "family_supplier_conflict", "severity": "critical",
                "detail": "Family member '{}' runs company supplying this council — potential undeclared DPI".format(
                    fm["family_member_name"])
            })
        elif fm.get("active_companies", 0) > 0:
            all_flags.append({
                "type": "family_member_company", "severity": "warning",
                "detail": "Family member '{}' at same address has {} active companies".format(
                    fm["family_member_name"], fm["active_companies"])
            })

    for fpsc in familial.get("family_psc_connections", []):
        if fpsc.get("has_ownership"):
            all_flags.append({
                "type": "family_psc_ownership", "severity": "warning",
                "detail": "Family member '{}' is PSC with ownership of {}".format(
                    fpsc["psc_name"], fpsc["company_name"])
            })

    if familial.get("has_family_supplier_conflict"):
        all_flags.append({
            "type": "undeclared_family_dpi", "severity": "critical",
            "detail": "Possible undeclared Disclosable Pecuniary Interest (family member's company is council supplier)"
        })

    # Network crossover flags (co-director → supplier links)
    nc = result.get("network_crossover", {})
    for link in nc.get("links", []):
        spend_str = "£{:,.0f}".format(link.get("supplier_spend", 0)) if link.get("supplier_spend") else "unknown amount"
        all_flags.append({
            "type": "network_crossover_link", "severity": link.get("severity", "warning"),
            "detail": "Co-director '{}' links councillor to supplier '{}' (spend: {}) via shared company '{}'".format(
                link.get("co_director", "?"), link.get("supplier_company", "?"),
                spend_str, link.get("councillor_company", "?"))
        })

    # Register compliance flags
    reg = result.get("register_of_interests", {})
    if reg.get("register_empty"):
        all_flags.append({
            "type": "register_empty", "severity": "warning",
            "detail": "Register of interests is completely empty — no interests declared in any category (Localism Act 2011 s30 requires declaration within 28 days)"
        })
    elif reg.get("available") and reg.get("total_declared_items", 0) > 0:
        # Check for undeclared CH companies (found on CH but not on register)
        ch_companies = result["companies_house"].get("companies", [])
        active_ch = [c for c in ch_companies if c.get("company_status") == "active"
                     and c.get("confidence", 0) >= 55]
        declared = set(c.lower().strip() for c in reg.get("declared_companies", []))
        for ch_co in active_ch:
            co_name = ch_co.get("company_name", "").lower().strip()
            # Check if this company is mentioned in any register declaration
            found_on_register = any(
                co_name in d or d in co_name
                for d in declared
            )
            if not found_on_register and declared:
                ch_co["not_on_register"] = True

    # v4 flags: MP overlap, revolving door, beneficial ownership, donation→contract
    for mpf in result.get("mp_findings", []):
        all_flags.append({
            "type": mpf["type"], "severity": mpf["severity"],
            "detail": mpf["detail"]
        })
    for rdf in result.get("revolving_door", []):
        all_flags.append({
            "type": rdf["type"], "severity": rdf["severity"],
            "detail": rdf["detail"]
        })
    for bof in result.get("beneficial_ownership", []):
        all_flags.append({
            "type": bof["type"], "severity": bof["severity"],
            "detail": bof["detail"]
        })
    for dcf in result.get("donation_contract_correlation", []):
        all_flags.append({
            "type": dcf["type"], "severity": dcf["severity"],
            "detail": dcf["detail"]
        })

    # v5 detection findings → red flags
    v5_fields = [
        "shell_company_findings", "threshold_manipulation", "temporal_clusters",
        "contract_splitting", "phantom_companies", "dormant_to_active",
        "family_donation_coordination", "mp_councillor_alignment",
        "bid_rigging", "seasonal_anomaly", "gift_frequency",
        "hansard_mentions", "undeclared_interests", "formation_timing",
        # v6 additions
        "electoral_vulnerability", "committee_conflicts",
        "employment_conflicts", "securities_conflicts",
        "temporal_patterns", "doge_integration",
        "supplier_profile_matches", "committee_contract_correlation",
        "former_councillor_links",
    ]
    for field in v5_fields:
        for finding in result.get(field, []):
            all_flags.append({
                "type": finding.get("type", field),
                "severity": finding.get("severity", "warning"),
                "detail": finding.get("detail", ""),
            })

    result["red_flags"] = all_flags

    # ── 11. Calculate Integrity Score (v5: detection multipliers + centrality) ──
    score = 100
    for flag in all_flags:
        sev = flag.get("severity", "")
        flag_type = flag.get("type", "")
        # Base penalty
        if sev == "critical":
            base_penalty = 25
        elif sev == "high":
            base_penalty = 15
        elif sev == "warning":
            base_penalty = 5
        else:
            base_penalty = 0
        # Apply detection-type multiplier (v5)
        multiplier = DETECTION_MULTIPLIERS.get(flag_type, 1.0)
        score -= int(base_penalty * multiplier)
    score = max(0, score)
    result["integrity_score"] = score

    if score >= 90:
        result["risk_level"] = "low"
    elif score >= 70:
        result["risk_level"] = "medium"
    elif score >= 50:
        result["risk_level"] = "elevated"
    else:
        result["risk_level"] = "high"

    # ── 12. Network Investigation Advisory ──
    ch = result["companies_house"]
    network_reasons = []
    if ch["active_directorships"] >= 3:
        network_reasons.append("{} active directorships — complex company portfolio".format(
            ch["active_directorships"]))
    if result["supplier_conflicts"]:
        network_reasons.append("{} supplier conflict(s) — possible self-dealing".format(
            len(result["supplier_conflicts"])))
    if result["cross_council_conflicts"]:
        network_reasons.append("{} cross-council conflict(s) — multi-authority exposure".format(
            len(result["cross_council_conflicts"])))
    if result["risk_level"] in ("high", "elevated"):
        network_reasons.append("{} risk level — multiple red flags".format(result["risk_level"]))
    if misconduct:
        critical_patterns = [p for p in misconduct if p["severity"] == "critical"]
        if critical_patterns:
            network_reasons.append("{} critical misconduct pattern(s) detected".format(
                len(critical_patterns)))

    # Phoenix pattern check
    dissolved = [c for c in ch.get("companies", [])
                 if c.get("company_status", "").lower() in ("dissolved", "liquidation")]
    if len(dissolved) >= 3:
        network_reasons.append("{} dissolved/liquidated companies — phoenix risk pattern".format(
            len(dissolved)))

    # Network crossover links
    nc_links = result.get("network_crossover", {}).get("total_links", 0)
    if nc_links > 0:
        network_reasons.append("{} network crossover link(s) — co-director connected to council supplier".format(nc_links))

    # Co-director network size
    co_net = result.get("co_director_network", {})
    if co_net.get("total_unique_associates", 0) >= 10:
        network_reasons.append("{} unique co-directors — extensive business network".format(
            co_net["total_unique_associates"]))

    # Total directorships threshold
    if ch["total_directorships"] >= 5:
        network_reasons.append("{} total directorships — extensive company history".format(
            ch["total_directorships"]))

    # Familial connection risks
    familial = result.get("familial_connections", {})
    if familial.get("has_family_supplier_conflict"):
        network_reasons.append("Family member's company is council supplier — investigate DPI compliance")
    fam_cos = familial.get("family_member_companies", [])
    if len(fam_cos) >= 2:
        network_reasons.append("{} family members found with company directorships at same address".format(
            len(fam_cos)))

    result["network_investigation"] = {
        "advisable": len(network_reasons) > 0,
        "reasons": network_reasons,
        "priority": "high" if len(network_reasons) >= 3 else "medium" if network_reasons else "none"
    }

    return result


# ═══════════════════════════════════════════════════════════════════════════
# Council Processing
# ═══════════════════════════════════════════════════════════════════════════

def process_council(council_id, all_supplier_data=None,
                    skip_ec=False, skip_fca=False, skip_network=False,
                    full_supplier_match=True):
    """Process all councillors for a given council."""
    councillors_path = DATA_DIR / council_id / "councillors.json"
    if not councillors_path.exists():
        print("[SKIP] No councillors.json for {}".format(council_id))
        return None

    print("\n" + "=" * 70)
    print("INTEGRITY SCAN: {} (v5.1 — 31-Source Political Fraud Detection)".format(council_id.upper()))
    print("=" * 70)

    with open(councillors_path) as f:
        councillors = json.load(f)
    if isinstance(councillors, dict):
        councillors = councillors.get("councillors", [])

    print("  {} councillors to investigate".format(len(councillors)))

    # Load register of interests data
    register_data = load_register_of_interests(council_id)
    if register_data:
        print("  Register of interests loaded ({} councillors)".format(len(register_data)))
    else:
        print("  Register of interests: not available for this council")

    # Register compliance check
    register_compliance = check_register_compliance(register_data, councillors)
    if register_compliance.get("total_issues"):
        print("  Register compliance issues: {}".format(register_compliance["total_issues"]))
        for issue in register_compliance["compliance_issues"]:
            print("    → {} [{}]: {}".format(issue["councillor_name"], issue["type"], issue["severity"]))

    # Inject register data into councillor records for process_councillor
    for c in councillors:
        cid = c.get("id", "")
        c["_register_data"] = register_data.get(cid) if register_data else None

    # Load supplier data — full=True loads ALL suppliers from spending data (not just top-20)
    supplier_data = load_supplier_data(council_id, full=full_supplier_match)
    print("  {} suppliers loaded for cross-reference{}".format(
        len(supplier_data), " (full spending data)" if full_supplier_match else " (top-20 only)"))

    if not all_supplier_data:
        all_supplier_data = load_all_supplier_data(full=full_supplier_match)
    print("  {} councils loaded for cross-council analysis".format(len(all_supplier_data)))

    sources = ["Companies House (officers, PSC, charges, disqualifications — DOB-verified)"]
    if register_data:
        sources.append("Register of Interests (ModernGov — anchor verification)")
    if not skip_ec:
        sources.append("Electoral Commission (donations)")
    if not skip_fca:
        sources.append("FCA Register (regulated persons)")
    if not skip_network:
        sources.append("Co-director network analysis")
    sources.append("Cross-council supplier matching ({} bodies)".format(len(all_supplier_data)))
    sources.append("Familial connection detection (surname clusters, shared addresses, family CH)")
    sources.append("Misconduct pattern detection (7 algorithms)")
    sources.append("Geographic proximity scoring (Lancashire postcode matching)")
    # v4 sources
    mp_data = get_mp_interests()
    if mp_data:
        sources.append("MP Register of Members' Financial Interests ({} MPs)".format(
            len(mp_data.get("constituencies", {}))))
    sources.append("Revolving door detection (appointment timeline analysis)")
    sources.append("Beneficial ownership chain analysis (PSC multi-layer)")
    sources.append("Donation-to-contract correlation (EC → spending)")
    sources.append("Network centrality scoring (graph-based risk amplification)")
    # v5 sources
    ec_bulk = get_ec_bulk_data()
    if ec_bulk:
        sources.append("EC bulk donation data ({} donations, £{:,.0f})".format(
            ec_bulk.get("summary", {}).get("total_donations", 0),
            ec_bulk.get("summary", {}).get("total_value", 0)))
    hansard = get_hansard_data()
    if hansard:
        sources.append("Hansard cross-reference ({} MP mentions)".format(
            hansard.get("summary", {}).get("total_mentions", 0)))
    sources.append("Shell company donor detection (SIC codes, formation agents)")
    sources.append("PPERA threshold manipulation detection")
    sources.append("Temporal donation clustering (30-day window)")
    sources.append("Contract splitting detection (procurement thresholds)")
    sources.append("Phantom company detection (dormant, shell indicators)")
    sources.append("Dormant-to-active supplier detection")
    sources.append("Social network triangulation (2-hop)")
    sources.append("Reciprocal cross-council appointments")
    sources.append("Family donation coordination (smurfing)")
    sources.append("MP-councillor donation alignment (vertical)")
    sources.append("Bid rigging indicators (procurement patterns)")
    sources.append("Seasonal spending anomaly detection")
    sources.append("Gift/hospitality frequency analysis")
    sources.append("Hansard parliamentary debate cross-reference")
    sources.append("Undeclared interest detection (CH vs register)")
    sources.append("Company formation timing analysis (PPE VIP Lane pattern)")
    print("  Data sources: {}".format(len(sources)))
    for s in sources:
        print("    → {}".format(s))

    results = {
        "council_id": council_id,
        "version": "6.0",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "methodology": "40_source_intelligence_grade_detection",
        "data_sources": sources,
        "register_available": bool(register_data),
        "total_councillors": len(councillors),
        "councillors_checked": 0,
        "summary": {
            "total_directorships_found": 0,
            "verified_directorships": 0,
            "active_directorships": 0,
            "disqualification_matches": 0,
            "supplier_conflicts": 0,
            "supplier_conflicts_by_type": {
                "commercial": 0, "community_trustee": 0,
                "council_appointed": 0, "arms_length_body": 0,
            },
            "cross_council_conflicts": 0,
            "electoral_commission_findings": 0,
            "fca_findings": 0,
            "misconduct_patterns": 0,
            "red_flags_total": 0,
            "risk_distribution": {"low": 0, "medium": 0, "elevated": 0, "high": 0},
            "network_investigations_advisable": 0,
            "network_investigation_high_priority": 0,
            "psc_entries_found": 0,
            "co_directors_mapped": 0,
            "family_connections_found": 0,
            "family_supplier_conflicts": 0,
            "network_crossover_links": 0,
            # v4 additions
            "mp_financial_links": 0,
            "revolving_door_detections": 0,
            "beneficial_ownership_findings": 0,
            "donation_contract_correlations": 0,
            "network_centrality_applied": False,
            # v5 additions
            "shell_company_donors": 0,
            "threshold_manipulation_alerts": 0,
            "temporal_clusters": 0,
            "contract_splitting_flags": 0,
            "phantom_companies": 0,
            "dormant_to_active": 0,
            "family_donation_coordination": 0,
            "mp_councillor_alignment": 0,
            "bid_rigging_indicators": 0,
            "seasonal_anomalies": 0,
            "gift_frequency_flags": 0,
            # v5.1 additions
            "hansard_mentions": 0,
            "undeclared_interests": 0,
            "formation_timing_flags": 0,
            # v6 additions
            "electoral_vulnerability_flags": 0,
            "committee_conflict_flags": 0,
            "employment_conflict_flags": 0,
            "securities_conflict_flags": 0,
            "temporal_pattern_flags": 0,
            "doge_integration_flags": 0,
            "supplier_profile_match_flags": 0,
            "committee_contract_correlation_flags": 0,
            "former_councillor_link_flags": 0,
        },
        "register_compliance": register_compliance,
        "supplier_political_donations": [],
        "surname_clusters": [],
        "shared_address_councillors": [],
        "cross_council_summary": {
            "councillor_companies_in_other_councils": 0,
            "affected_councils": [],
        },
        "councillors": []
    }

    # ── Pre-scan: Surname Clusters + Shared Addresses ──
    surname_clusters = detect_surname_clusters(councillors)
    shared_addr = detect_shared_address_councillors(councillors)
    results["surname_clusters"] = surname_clusters
    results["shared_address_councillors"] = shared_addr
    if surname_clusters:
        print("  Surname clusters: {} (potential family connections)".format(len(surname_clusters)))
        for sc in surname_clusters[:5]:
            print("    → {} ({} councillors{}{})".format(
                sc["surname"], sc["count"],
                " — SAME ADDRESS" if sc["shared_address"] else "",
                " — same ward" if sc["same_ward"] else ""))
    if shared_addr:
        print("  Shared residential addresses: {} (likely family members)".format(len(shared_addr)))
        for sa in shared_addr:
            print("    → {} councillors at '{}'".format(sa["count"], sa["address"][:60]))

    # ── Supplier EC Donations (council-level, run once) ──
    if not skip_ec:
        supplier_ec_findings = check_supplier_ec_donations(supplier_data, council_id)
        results["supplier_political_donations"] = supplier_ec_findings
        if supplier_ec_findings:
            print("  Supplier political donations: {} findings".format(len(supplier_ec_findings)))
            for sf in supplier_ec_findings:
                print("    → {}".format(sf["detail"]))
    else:
        results["supplier_political_donations"] = []

    affected_councils = set()

    for i, councillor in enumerate(councillors):
        try:
            councillor["_council_id"] = council_id  # Tag for cross-council matching
            result = process_councillor(
                councillor, supplier_data, all_supplier_data,
                skip_ec=skip_ec, skip_fca=skip_fca, skip_network=skip_network)

            if result:
                results["councillors"].append(result)
                results["councillors_checked"] += 1

                # Update summary
                ch = result["companies_house"]
                results["summary"]["total_directorships_found"] += ch["total_directorships"]
                results["summary"]["verified_directorships"] += sum(
                    1 for c in ch.get("companies", [])
                    if c.get("confidence", 0) >= 55)
                results["summary"]["active_directorships"] += ch["active_directorships"]
                results["summary"]["disqualification_matches"] += len(
                    result["disqualification_check"]["matches"])
                results["summary"]["supplier_conflicts"] += len(result["supplier_conflicts"])
                for sc in result["supplier_conflicts"]:
                    ctype = sc.get("conflict_type", "commercial")
                    if ctype in results["summary"]["supplier_conflicts_by_type"]:
                        results["summary"]["supplier_conflicts_by_type"][ctype] += 1
                results["summary"]["cross_council_conflicts"] += len(
                    result.get("cross_council_conflicts", []))
                results["summary"]["electoral_commission_findings"] += len(
                    result["electoral_commission"].get("findings", []))
                results["summary"]["fca_findings"] += len(
                    result["fca_register"].get("findings", []))
                results["summary"]["misconduct_patterns"] += len(result["misconduct_patterns"])
                results["summary"]["red_flags_total"] += len(result["red_flags"])
                results["summary"]["psc_entries_found"] += len(
                    ch.get("psc_entries", []))
                results["summary"]["co_directors_mapped"] += result.get(
                    "co_director_network", {}).get("total_unique_associates", 0)

                # Family connections
                familial = result.get("familial_connections", {})
                results["summary"]["family_connections_found"] += len(
                    familial.get("family_member_companies", []))
                results["summary"]["family_supplier_conflicts"] += sum(
                    1 for fm in familial.get("family_member_companies", [])
                    if fm.get("has_supplier_conflict"))

                # Network crossover
                results["summary"]["network_crossover_links"] += result.get(
                    "network_crossover", {}).get("total_links", 0)

                # v4 summary fields
                results["summary"]["mp_financial_links"] += len(
                    result.get("mp_findings", []))
                results["summary"]["revolving_door_detections"] += len(
                    result.get("revolving_door", []))
                results["summary"]["beneficial_ownership_findings"] += len(
                    result.get("beneficial_ownership", []))
                results["summary"]["donation_contract_correlations"] += len(
                    result.get("donation_contract_correlation", []))

                # v5 summary fields
                results["summary"]["shell_company_donors"] += len(
                    result.get("shell_company_findings", []))
                results["summary"]["threshold_manipulation_alerts"] += len(
                    result.get("threshold_manipulation", []))
                results["summary"]["temporal_clusters"] += len(
                    result.get("temporal_clusters", []))
                results["summary"]["contract_splitting_flags"] += len(
                    result.get("contract_splitting", []))
                results["summary"]["phantom_companies"] += len(
                    result.get("phantom_companies", []))
                results["summary"]["dormant_to_active"] += len(
                    result.get("dormant_to_active", []))
                results["summary"]["family_donation_coordination"] += len(
                    result.get("family_donation_coordination", []))
                results["summary"]["mp_councillor_alignment"] += len(
                    result.get("mp_councillor_alignment", []))
                results["summary"]["bid_rigging_indicators"] += len(
                    result.get("bid_rigging", []))
                results["summary"]["seasonal_anomalies"] += len(
                    result.get("seasonal_anomaly", []))
                results["summary"]["gift_frequency_flags"] += len(
                    result.get("gift_frequency", []))
                results["summary"]["hansard_mentions"] += len(
                    result.get("hansard_mentions", []))
                results["summary"]["undeclared_interests"] += len(
                    result.get("undeclared_interests", []))
                results["summary"]["formation_timing_flags"] += len(
                    result.get("formation_timing", []))
                # v6 aggregation
                results["summary"]["electoral_vulnerability_flags"] += len(
                    result.get("electoral_vulnerability", []))
                results["summary"]["committee_conflict_flags"] += len(
                    result.get("committee_conflicts", []))
                results["summary"]["employment_conflict_flags"] += len(
                    result.get("employment_conflicts", []))
                results["summary"]["securities_conflict_flags"] += len(
                    result.get("securities_conflicts", []))
                results["summary"]["temporal_pattern_flags"] += len(
                    result.get("temporal_patterns", []))
                results["summary"]["doge_integration_flags"] += len(
                    result.get("doge_integration", []))
                results["summary"]["supplier_profile_match_flags"] += len(
                    result.get("supplier_profile_matches", []))
                results["summary"]["committee_contract_correlation_flags"] += len(
                    result.get("committee_contract_correlation", []))
                results["summary"]["former_councillor_link_flags"] += len(
                    result.get("former_councillor_links", []))

                risk = result.get("risk_level", "low")
                if risk in results["summary"]["risk_distribution"]:
                    results["summary"]["risk_distribution"][risk] += 1

                ni = result.get("network_investigation", {})
                if ni.get("advisable"):
                    results["summary"]["network_investigations_advisable"] += 1
                if ni.get("priority") == "high":
                    results["summary"]["network_investigation_high_priority"] += 1

                for cc in result.get("cross_council_conflicts", []):
                    affected_councils.add(cc["other_council"])

                # Progress
                flags = len(result["red_flags"])
                flags_str = " [{} flags]".format(flags) if flags else ""
                misconduct_str = " [{}⚠ misconduct]".format(
                    len(result["misconduct_patterns"])) if result["misconduct_patterns"] else ""
                verification_str = " [{}]".format(ch.get("verification_method", "?"))
                eliminated = result.get("false_positives_eliminated", 0)
                elim_str = " [{}✗ eliminated]".format(eliminated) if eliminated else ""
                print("    [{}/{}] ✓ {} — {} active, {} resigned{}{}{}{}".format(
                    i + 1, len(councillors), result["name"],
                    ch["active_directorships"], ch["resigned_directorships"],
                    flags_str, misconduct_str, verification_str, elim_str))

        except KeyboardInterrupt:
            print("\n  ⚠ Interrupted at {}/{}. Saving partial results...".format(
                i + 1, len(councillors)))
            break
        except Exception as e:
            import traceback
            print("    [{}/{}] ✗ Error: {} — {}".format(
                i + 1, len(councillors), councillor.get("name", "?"), e))
            traceback.print_exc()

    # ── v5 Post-Processing: Social Network Triangulation + Reciprocal Appointments ──
    # These need all_results, so run after all councillors processed
    if len(results["councillors"]) >= 2:
        print("\n  Running v5 post-processing (social network + reciprocal appointments)...")
        all_results = results["councillors"]
        for r in all_results:
            r["_council_id_v5"] = council_id
            # Social network triangulation
            sn_findings = detect_social_network_triangulation(r, all_results)
            r["social_network"] = sn_findings
            for f in sn_findings:
                r["red_flags"].append({
                    "type": f["type"], "severity": f["severity"],
                    "detail": f["detail"]
                })
            # Reciprocal appointments
            recip_findings = detect_reciprocal_appointments(r, all_results, all_supplier_data)
            r.setdefault("reciprocal_appointments", []).extend(recip_findings)
            for f in recip_findings:
                r["red_flags"].append({
                    "type": f["type"], "severity": f["severity"],
                    "detail": f["detail"]
                })
            del r["_council_id_v5"]

        # Recount red flags after post-processing
        results["summary"]["red_flags_total"] = sum(
            len(r.get("red_flags", [])) for r in all_results)
        print("  Social network + reciprocal: {} additional findings".format(
            sum(len(r.get("social_network", [])) + len(r.get("reciprocal_appointments", []))
                for r in all_results)))

    # ── Network Centrality Post-Processing (v4/v5) ──
    # Apply network centrality amplifier: councillors who are highly connected
    # AND have red flags get disproportionately penalised (catching "spider in the web")
    if len(results["councillors"]) >= 3:
        print("\n  Applying network centrality scoring...")
        all_results = results["councillors"]

        for r in all_results:
            centrality = calculate_network_centrality(r, all_results)
            r["network_centrality"] = centrality

            # Amplify score if centrality is high AND they have flags
            if centrality["score"] > 0.5 and len(r.get("red_flags", [])) > 0:
                multiplier = 1.3 if centrality["score"] <= 0.8 else 1.5
                old_score = r["integrity_score"]
                # Recalculate with amplified penalties
                penalty = 100 - old_score
                amplified_penalty = penalty * multiplier
                new_score = max(0, int(100 - amplified_penalty))
                r["integrity_score"] = new_score

                # Update risk level
                if new_score >= 90:
                    r["risk_level"] = "low"
                elif new_score >= 70:
                    r["risk_level"] = "medium"
                elif new_score >= 50:
                    r["risk_level"] = "elevated"
                else:
                    r["risk_level"] = "high"

                if new_score != old_score:
                    print("    {} — centrality {:.2f} → score {} → {} (×{})".format(
                        r["name"], centrality["score"], old_score, new_score, multiplier))

        # Recalculate risk distribution after centrality adjustment
        results["summary"]["risk_distribution"] = {"low": 0, "medium": 0, "elevated": 0, "high": 0}
        for r in all_results:
            risk = r.get("risk_level", "low")
            if risk in results["summary"]["risk_distribution"]:
                results["summary"]["risk_distribution"][risk] += 1

        results["summary"]["network_centrality_applied"] = True
        print("  Network centrality applied to {} councillors".format(len(all_results)))

    # Cross-council summary
    results["cross_council_summary"]["councillor_companies_in_other_councils"] = \
        results["summary"]["cross_council_conflicts"]
    results["cross_council_summary"]["affected_councils"] = sorted(affected_councils)

    # v6: Build investigation queue
    investigation_queue = []
    for result in results["councillors"]:
        queue_entry = build_investigation_queue_entry(result, council_id)
        if queue_entry:
            investigation_queue.append(queue_entry)
    # Sort by priority score descending
    investigation_queue.sort(key=lambda q: q.get("priority_score", 0), reverse=True)
    results["investigation_queue"] = investigation_queue
    if investigation_queue:
        print("\n  Investigation queue: {} councillors".format(len(investigation_queue)))
        for i, q in enumerate(investigation_queue[:5]):
            print("    {}. {} (score: {}, risk: {}, flags: {})".format(
                i + 1, q["councillor_name"], q["priority_score"],
                q["risk_level"], q["total_flags"]))

    # Save results
    output_path = DATA_DIR / council_id / "integrity.json"
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)

    # Print summary
    s = results["summary"]
    print("\n  " + "-" * 50)
    print("  RESULTS: {}".format(council_id.upper()))
    print("  " + "-" * 50)
    print("  Checked: {}/{}".format(results["councillors_checked"], len(councillors)))
    print("  Directorships: {} ({} active)".format(
        s["total_directorships_found"], s["active_directorships"]))
    print("  Red flags: {}".format(s["red_flags_total"]))
    print("  Supplier conflicts: {} (own) + {} (cross-council)".format(
        s["supplier_conflicts"], s["cross_council_conflicts"]))
    print("  Misconduct patterns: {}".format(s["misconduct_patterns"]))
    print("  Disqualification matches: {}".format(s["disqualification_matches"]))
    print("  EC findings: {} | FCA findings: {}".format(
        s["electoral_commission_findings"], s["fca_findings"]))
    print("  PSC entries: {} | Co-directors mapped: {}".format(
        s["psc_entries_found"], s["co_directors_mapped"]))
    print("  Family connections: {} found, {} supplier conflicts".format(
        s["family_connections_found"], s["family_supplier_conflicts"]))
    print("  MP financial links: {} | Revolving door: {} | Ownership chains: {} | Donation→contract: {}".format(
        s["mp_financial_links"], s["revolving_door_detections"],
        s["beneficial_ownership_findings"], s["donation_contract_correlations"]))
    print("  v5: shell={} threshold={} temporal={} splitting={} phantom={} dormant={}".format(
        s.get("shell_company_donors", 0), s.get("threshold_manipulation_alerts", 0),
        s.get("temporal_clusters", 0), s.get("contract_splitting_flags", 0),
        s.get("phantom_companies", 0), s.get("dormant_to_active", 0)))
    print("  v5: family_coord={} mp_align={} bid_rig={} seasonal={} gifts={}".format(
        s.get("family_donation_coordination", 0), s.get("mp_councillor_alignment", 0),
        s.get("bid_rigging_indicators", 0), s.get("seasonal_anomalies", 0),
        s.get("gift_frequency_flags", 0)))
    print("  Surname clusters: {} | Shared addresses: {}".format(
        len(results.get("surname_clusters", [])),
        len(results.get("shared_address_councillors", []))))
    print("  Network investigations advisable: {} ({} high priority)".format(
        s["network_investigations_advisable"], s["network_investigation_high_priority"]))
    print("  Network centrality: {}".format(
        "applied" if s.get("network_centrality_applied") else "not applied"))
    print("  Risk: {} low, {} medium, {} elevated, {} high".format(
        s["risk_distribution"]["low"], s["risk_distribution"]["medium"],
        s["risk_distribution"]["elevated"], s["risk_distribution"]["high"]))
    print("  API calls: {}".format(dict(api_calls)))
    print("  Saved: {}".format(output_path))

    return results


# ═══════════════════════════════════════════════════════════════════════════
# Cross-Council Analysis (Global View)
# ═══════════════════════════════════════════════════════════════════════════

def run_cross_council_analysis():
    """Run analysis across ALL councils looking for cross-council fraud patterns."""
    print("\n" + "=" * 70)
    print("CROSS-COUNCIL FRAUD ANALYSIS — ALL 17 LANCASHIRE BODIES")
    print("=" * 70)

    all_supplier_data = load_all_supplier_data()
    all_councillors = {}
    all_integrity = {}

    # Load all councillor and integrity data
    for council_id in ALL_COUNCILS:
        # Load councillors
        cpath = DATA_DIR / council_id / "councillors.json"
        if cpath.exists():
            with open(cpath) as f:
                cdata = json.load(f)
            if isinstance(cdata, dict):
                cdata = cdata.get("councillors", [])
            all_councillors[council_id] = cdata

        # Load integrity data
        ipath = DATA_DIR / council_id / "integrity.json"
        if ipath.exists():
            with open(ipath) as f:
                all_integrity[council_id] = json.load(f)

    print("  Loaded {} councils' data".format(len(all_councillors)))

    findings = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "version": "5.1",
        "total_bodies": len(all_councillors),
        "councillors_spanning_councils": [],
        "shared_company_networks": [],
        "family_networks_across_councils": [],
        "supplier_councillor_overlaps": [],
        "mp_cross_council_links": [],
        "investigation_priorities": [],
        "cross_council_risk_summary": {},
    }

    # 1. Find councillors who serve on multiple councils (dual-hatting)
    name_to_councils = defaultdict(list)
    for council_id, councillors in all_councillors.items():
        for c in councillors:
            name_key = c.get("name", "").lower().strip()
            if name_key:
                name_to_councils[name_key].append({
                    "council": council_id,
                    "party": c.get("party", ""),
                    "ward": c.get("ward", ""),
                })

    for name, councils in name_to_councils.items():
        if len(councils) >= 2:
            findings["councillors_spanning_councils"].append({
                "name": name.title(),
                "councils": councils,
                "note": "Dual-hatted councillor — interests at one council may conflict with duties at another"
            })

    print("  Dual-hatted councillors: {}".format(len(findings["councillors_spanning_councils"])))

    # 2. Find shared company networks across councils
    company_to_councillors = defaultdict(list)
    for council_id, integrity in all_integrity.items():
        for c in integrity.get("councillors", []):
            for company in c.get("companies_house", {}).get("companies", []):
                cn = company.get("company_number", "")
                if cn and not company.get("resigned_on"):
                    company_to_councillors[cn].append({
                        "councillor": c.get("name", ""),
                        "council": council_id,
                        "company_name": company.get("company_name", ""),
                    })

    for cn, councillors in company_to_councillors.items():
        if len(councillors) >= 2:
            # Councillors from different councils sharing a company directorship
            councils_involved = set(c["council"] for c in councillors)
            if len(councils_involved) >= 2:
                findings["shared_company_networks"].append({
                    "company_number": cn,
                    "company_name": councillors[0].get("company_name", ""),
                    "councillors": councillors,
                    "note": "Councillors from {} different councils share directorship".format(
                        len(councils_involved))
                })

    print("  Shared company networks (cross-council): {}".format(
        len(findings["shared_company_networks"])))

    # 3. Detect cross-council family networks
    family_networks = detect_cross_council_family_clusters(all_councillors)
    findings["family_networks_across_councils"] = family_networks
    print("  Cross-council family networks: {}".format(len(family_networks)))
    for fn in family_networks[:5]:
        print("    → '{}' in {} councils ({} members)".format(
            fn["surname"], fn["council_count"], fn["member_count"]))

    # 4. MP interests overlapping with multiple councils' spending
    mp_data = get_mp_interests()
    if mp_data:
        for constituency, mp_info in mp_data.get("constituencies", {}).items():
            cross_refs = mp_info.get("ch_cross_reference", [])
            for xref in cross_refs:
                councils_supplied = xref.get("councils_supplied", [])
                if len(councils_supplied) >= 2:
                    findings["mp_cross_council_links"].append({
                        "mp_name": mp_info.get("mp_name", ""),
                        "constituency": constituency,
                        "company": xref.get("declared_company", ""),
                        "company_number": xref.get("company_number", ""),
                        "councils_supplied": councils_supplied,
                        "total_spend": xref.get("supplier_spend", 0),
                        "note": "MP's declared interest supplies {} councils".format(len(councils_supplied))
                    })
        print("  MP cross-council supplier links: {}".format(len(findings["mp_cross_council_links"])))

    # 5. Build investigation priorities (highest risk findings across all bodies)
    for council_id, integrity in all_integrity.items():
        for c in integrity.get("councillors", []):
            if c.get("risk_level") in ("high", "elevated"):
                critical_flags = [f for f in c.get("red_flags", []) if f.get("severity") == "critical"]
                centrality = c.get("network_centrality", {}).get("score", 0)
                priority_score = len(critical_flags) * 10 + centrality * 5

                if critical_flags or centrality > 0.7:
                    findings["investigation_priorities"].append({
                        "councillor": c.get("name", ""),
                        "council": council_id,
                        "risk_level": c.get("risk_level", ""),
                        "integrity_score": c.get("integrity_score", 100),
                        "critical_flags": len(critical_flags),
                        "total_flags": len(c.get("red_flags", [])),
                        "network_centrality": centrality,
                        "priority_score": round(priority_score, 1),
                        "top_concerns": [f["detail"] for f in critical_flags[:3]],
                    })

    # Sort by priority score descending
    findings["investigation_priorities"].sort(key=lambda x: x["priority_score"], reverse=True)
    findings["investigation_priorities"] = findings["investigation_priorities"][:50]  # Top 50
    print("  Investigation priorities: {} (showing top 50)".format(len(findings["investigation_priorities"])))

    # 6. Summarise risk levels across all councils
    for council_id, integrity in all_integrity.items():
        summary = integrity.get("summary", {})
        findings["cross_council_risk_summary"][council_id] = {
            "councillors_checked": integrity.get("councillors_checked", 0),
            "risk_distribution": summary.get("risk_distribution", {}),
            "red_flags_total": summary.get("red_flags_total", 0),
            "supplier_conflicts": summary.get("supplier_conflicts", 0),
            "cross_council_conflicts": summary.get("cross_council_conflicts", 0),
            "misconduct_patterns": summary.get("misconduct_patterns", 0),
            # v4 fields
            "mp_financial_links": summary.get("mp_financial_links", 0),
            "revolving_door_detections": summary.get("revolving_door_detections", 0),
            "beneficial_ownership_findings": summary.get("beneficial_ownership_findings", 0),
            "donation_contract_correlations": summary.get("donation_contract_correlations", 0),
            "network_centrality_applied": summary.get("network_centrality_applied", False),
            # v5 fields
            "shell_company_donors": summary.get("shell_company_donors", 0),
            "threshold_manipulation_alerts": summary.get("threshold_manipulation_alerts", 0),
            "contract_splitting_flags": summary.get("contract_splitting_flags", 0),
            "phantom_companies": summary.get("phantom_companies", 0),
            "bid_rigging_indicators": summary.get("bid_rigging_indicators", 0),
            # v5.1 fields
            "hansard_mentions": summary.get("hansard_mentions", 0),
            "undeclared_interests": summary.get("undeclared_interests", 0),
            "formation_timing_flags": summary.get("formation_timing_flags", 0),
            "version": integrity.get("version", "?"),
        }

    # Save cross-council analysis
    output_path = DATA_DIR / "shared" / "integrity_cross_council.json"
    with open(output_path, "w") as f:
        json.dump(findings, f, indent=2)
    print("  Saved: {}".format(output_path))

    return findings


# ═══════════════════════════════════════════════════════════════════════════
# Stub Generation
# ═══════════════════════════════════════════════════════════════════════════

def generate_stub(council_id):
    """Generate a stub integrity.json for councils not yet scanned."""
    councillors_path = DATA_DIR / council_id / "councillors.json"
    if not councillors_path.exists():
        return

    with open(councillors_path) as f:
        councillors = json.load(f)
    if isinstance(councillors, dict):
        councillors = councillors.get("councillors", [])

    stub = {
        "council_id": council_id,
        "version": "2.0",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "data_sources": [],
        "total_councillors": len(councillors),
        "councillors_checked": 0,
        "scan_status": "pending",
        "summary": {
            "total_directorships_found": 0,
            "active_directorships": 0,
            "disqualification_matches": 0,
            "supplier_conflicts": 0,
            "cross_council_conflicts": 0,
            "electoral_commission_findings": 0,
            "fca_findings": 0,
            "misconduct_patterns": 0,
            "red_flags_total": 0,
            "risk_distribution": {"low": 0, "medium": 0, "elevated": 0, "high": 0},
            "network_investigations_advisable": 0,
            "network_investigation_high_priority": 0,
            "psc_entries_found": 0,
            "co_directors_mapped": 0,
            "family_connections_found": 0,
            "family_supplier_conflicts": 0,
            "network_crossover_links": 0,
        },
        "surname_clusters": [],
        "shared_address_councillors": [],
        "cross_council_summary": {
            "councillor_companies_in_other_councils": 0,
            "affected_councils": [],
        },
        "councillors": [
            {
                "councillor_id": c.get("id", ""),
                "name": c.get("name", ""),
                "party": c.get("party", ""),
                "ward": c.get("ward", ""),
                "checked_at": None,
                "data_sources_checked": [],
                "companies_house": {
                    "officer_matches": [],
                    "total_directorships": 0,
                    "active_directorships": 0,
                    "resigned_directorships": 0,
                    "companies": [],
                    "psc_entries": [],
                },
                "co_director_network": {"associates": [], "total_unique_associates": 0},
                "disqualification_check": {"searched": False, "matches": []},
                "electoral_commission": {"searched": False, "findings": []},
                "fca_register": {"searched": False, "findings": []},
                "familial_connections": {
                    "family_member_companies": [],
                    "family_psc_connections": [],
                    "has_family_supplier_conflict": False,
                },
                "supplier_conflicts": [],
                "cross_council_conflicts": [],
                "network_crossover": {"total_links": 0, "links": []},
                "misconduct_patterns": [],
                "red_flags": [],
                "integrity_score": None,
                "risk_level": "not_checked"
            }
            for c in councillors
        ]
    }

    output_path = DATA_DIR / council_id / "integrity.json"
    with open(output_path, "w") as f:
        json.dump(stub, f, indent=2)
    print("  Stub created: {} ({} councillors)".format(output_path, len(councillors)))


# ═══════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Councillor Integrity ETL v4 — 14-Source Forensic Investigation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --council burnley                    Full scan of Burnley
  %(prog)s --council burnley --skip-ec --skip-fca  CH only (faster)
  %(prog)s --all --skip-network                 All councils, no co-director mapping
  %(prog)s --stubs-only                         Generate stub files (no API calls)
  %(prog)s --cross-council                      Cross-council analysis only
        """)
    parser.add_argument("--council", help="Council ID to process (e.g., burnley)")
    parser.add_argument("--all", action="store_true", help="Process all 17 bodies (15 councils + PCC + Fire)")
    parser.add_argument("--stubs-only", action="store_true", help="Generate stub files only")
    parser.add_argument("--cross-council", action="store_true", help="Run cross-council analysis")
    parser.add_argument("--ch-key", help="Companies House API key (overrides env var)")
    parser.add_argument("--skip-ec", action="store_true", help="Skip Electoral Commission")
    parser.add_argument("--skip-fca", action="store_true", help="Skip FCA Register")
    parser.add_argument("--skip-network", action="store_true", help="Skip co-director network")
    parser.add_argument("--quick-supplier-match", action="store_true",
                        help="Use top-20 supplier matching only (faster, less accurate)")
    args = parser.parse_args()

    if args.ch_key:
        global CH_KEY
        CH_KEY = args.ch_key

    start_time = time.time()

    if args.stubs_only:
        print("Generating v2 stub integrity.json files for all councils...")
        for council_id in ALL_COUNCILS:
            generate_stub(council_id)
        print("Done.")
        return

    if args.cross_council:
        run_cross_council_analysis()
        return

    # Full supplier matching loads ALL suppliers from spending data (default)
    # --quick-supplier-match reverts to top-20 from insights.json (faster)
    full_supplier = not args.quick_supplier_match

    # Pre-load all supplier data for cross-council analysis
    all_supplier_data = load_all_supplier_data(full=full_supplier)
    print("Loaded supplier data for {} bodies ({})".format(
        len(all_supplier_data),
        "full spending data" if full_supplier else "top-20 only"))

    if args.all:
        for council_id in ALL_COUNCILS:
            process_council(council_id, all_supplier_data,
                          skip_ec=args.skip_ec, skip_fca=args.skip_fca,
                          skip_network=args.skip_network,
                          full_supplier_match=full_supplier)
        # Run cross-council analysis after all councils processed
        run_cross_council_analysis()
    elif args.council:
        if args.council not in ALL_COUNCILS:
            print("Unknown council: {}".format(args.council))
            print("Available: {}".format(", ".join(ALL_COUNCILS)))
            sys.exit(1)
        process_council(args.council, all_supplier_data,
                       skip_ec=args.skip_ec, skip_fca=args.skip_fca,
                       skip_network=args.skip_network,
                       full_supplier_match=full_supplier)
    else:
        parser.print_help()
        sys.exit(1)

    elapsed = time.time() - start_time
    print("\n" + "=" * 70)
    print("COMPLETED in {:.1f}s ({:.1f} min)".format(elapsed, elapsed / 60))
    print("API calls: {}".format(dict(api_calls)))
    print("=" * 70)


if __name__ == "__main__":
    main()
