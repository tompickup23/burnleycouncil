#!/usr/bin/env python3
"""
Hansard Parliamentary Cross-Reference ETL v2

Cross-references parliamentary speaking records against companies, donors,
and suppliers in the Lancashire integrity network.

Detects when MPs mention companies/organisations that are:
  - Their declared financial interests
  - Donors to their party or directly to them
  - Council suppliers with councillor connections
  - Companies in the integrity network

Data sources (ALL free, no API keys required):
  1. Parliament Hansard API  — hansard-api.parliament.uk    (spoken debates, JSON)
  2. Written Questions API   — questions-statements-api.parliament.uk (PQs, JSON)
  3. Parliament Members API  — members-api.parliament.uk    (MP lookup, JSON)

These are the OFFICIAL Parliament APIs, completely free and open under the
Open Parliament Licence. They use the same underlying data that paid services
like TheyWorkForYou charge for — we go direct to the source.

Usage:
    python3 hansard_etl.py
    python3 hansard_etl.py --mp "Mark Hendrick"
    python3 hansard_etl.py --search "D-International"
    python3 hansard_etl.py --since 2020-01-01
"""

import argparse
import json
import re
import signal
import socket
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict

socket.setdefaulttimeout(30)

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"

# ── Official Parliament APIs (free, no auth) ──
HANSARD_API = "https://hansard-api.parliament.uk"
MEMBERS_API = "https://members-api.parliament.uk/api"
QUESTIONS_API = "https://questions-statements-api.parliament.uk/api"

RATE_DELAY = 0.8      # Polite delay between requests
RETRY_DELAY = 3.0     # Delay after errors
MAX_PER_PAGE = 20     # Hansard API max per page
MAX_RETRIES = 2       # Retry failed requests

stats = {"requests": 0, "mentions_found": 0, "errors": 0,
         "written_questions_found": 0, "interest_declared_questions": 0}


class _Timeout(Exception):
    pass


def _alarm_handler(signum, frame):
    raise _Timeout("Request timed out (alarm)")


# ═══════════════════════════════════════════════════════════════
#  HTTP / API Layer
# ═══════════════════════════════════════════════════════════════

def api_get_json(url, label="API"):
    """GET JSON from Parliament API with retries and timeout protection."""
    for attempt in range(MAX_RETRIES + 1):
        old_handler = signal.signal(signal.SIGALRM, _alarm_handler)
        signal.alarm(45)
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "AIDOGE-IntegrityETL/2.0 (parliamentary integrity research)",
                "Accept": "application/json",
            })
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                stats["requests"] += 1
                time.sleep(RATE_DELAY)
                return json.loads(raw)
        except (json.JSONDecodeError,) as e:
            print(f"    [WARN] {label}: invalid JSON: {e}", file=sys.stderr)
            stats["errors"] += 1
            return None
        except (urllib.error.HTTPError,) as e:
            code = getattr(e, "code", 0)
            if code == 429:
                # Rate limited — back off
                wait = min(30, RETRY_DELAY * (attempt + 2))
                print(f"    [WARN] {label}: rate limited, waiting {wait}s...",
                      file=sys.stderr, flush=True)
                time.sleep(wait)
                continue
            elif code == 404:
                # Not found is expected for some searches
                stats["requests"] += 1
                time.sleep(RATE_DELAY)
                return None
            else:
                print(f"    [WARN] {label}: HTTP {code}: {e}", file=sys.stderr)
                stats["errors"] += 1
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_DELAY)
                    continue
                return None
        except (urllib.error.URLError, TimeoutError, socket.timeout,
                OSError, _Timeout) as e:
            print(f"    [WARN] {label}: {e}", file=sys.stderr)
            stats["errors"] += 1
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY)
                continue
            return None
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)
    return None


# ═══════════════════════════════════════════════════════════════
#  Members API — Resolve MP names to Hansard member IDs
# ═══════════════════════════════════════════════════════════════

def resolve_member_id(mp_name):
    """Look up Hansard member ID from Parliament Members API.

    Returns (member_id, display_name, constituency) or (None, None, None).
    """
    # Clean the name for search
    clean = re.sub(r'^(Mr|Mrs|Ms|Sir|Dame|Dr|Rt Hon)\s+', '', mp_name).strip()
    params = urllib.parse.urlencode({
        "Name": clean,
        "House": "1",  # Commons
        "IsCurrentMember": "true",
        "skip": "0",
        "take": "5",
    })
    url = f"{MEMBERS_API}/Members/Search?{params}"
    data = api_get_json(url, label=f"Members:{clean}")
    if not data:
        return None, None, None

    items = data.get("items", [])
    if not items:
        # Try surname only
        parts = clean.split()
        if len(parts) > 1:
            surname = parts[-1]
            params2 = urllib.parse.urlencode({
                "Name": surname,
                "House": "1",
                "IsCurrentMember": "true",
                "skip": "0",
                "take": "10",
            })
            url2 = f"{MEMBERS_API}/Members/Search?{params2}"
            data2 = api_get_json(url2, label=f"Members:{surname}")
            if data2:
                items = data2.get("items", [])

    # Find best match
    for item in items:
        val = item.get("value", {})
        display = val.get("nameDisplayAs", "")
        member_id = val.get("id")
        constituency = ""
        hm = item.get("latestHouseMembership") or {}
        if hm:
            constituency = hm.get("membershipFrom", "")

        # Match: either full name contains our search or vice versa
        if not display or not member_id:
            continue
        display_lower = display.lower()
        clean_lower = clean.lower()
        # Check overlap
        if (clean_lower in display_lower or display_lower in clean_lower or
                all(p in display_lower for p in clean_lower.split() if len(p) > 2)):
            return member_id, display, constituency

    return None, None, None


# ═══════════════════════════════════════════════════════════════
#  Hansard API — Search spoken debate contributions
# ═══════════════════════════════════════════════════════════════

def search_hansard_contributions(search_term, member_id=None,
                                  start_date=None, end_date=None,
                                  max_results=60):
    """Search Hansard spoken contributions via the official API.

    Returns list of contribution dicts with full text.
    Paginates automatically up to max_results.
    """
    results = []
    skip = 0

    while skip < max_results:
        take = min(MAX_PER_PAGE, max_results - skip)
        params = {
            "queryParameters.searchTerm": search_term,
            "queryParameters.take": str(take),
            "queryParameters.skip": str(skip),
            "queryParameters.orderBy": "Relevance",
            "queryParameters.house": "Commons",
        }
        if member_id:
            params["queryParameters.memberId"] = str(member_id)
        if start_date:
            params["queryParameters.startDate"] = start_date
        if end_date:
            params["queryParameters.endDate"] = end_date

        url = f"{HANSARD_API}/search/contributions/Spoken.json?{urllib.parse.urlencode(params)}"
        data = api_get_json(url, label=f"Hansard:{search_term[:25]}")

        if not data:
            break

        page_results = data.get("Results", [])
        total = data.get("TotalResultCount", 0)

        for item in page_results:
            # Extract full text and clean HTML
            full_text = item.get("ContributionTextFull", "") or item.get("ContributionText", "")
            full_text = strip_html(full_text)

            # Verify the search term actually appears in text
            if search_term.lower() not in full_text.lower():
                # Check debate section name too
                debate = item.get("DebateSection", "")
                if search_term.lower() not in debate.lower():
                    continue

            sitting = item.get("SittingDate", "")
            if sitting and "T" in sitting:
                sitting = sitting.split("T")[0]

            debate_ext_id = item.get("DebateSectionExtId", "")
            hansard_url = ""
            if debate_ext_id:
                hansard_url = f"https://hansard.parliament.uk/commons/{sitting}/debates/{debate_ext_id}"

            results.append({
                "member_name": item.get("MemberName", ""),
                "member_id": item.get("MemberId"),
                "attributed_to": item.get("AttributedTo", ""),
                "full_text": full_text,
                "debate_title": item.get("DebateSection", ""),
                "debate_date": sitting,
                "section": item.get("Section", ""),
                "house": item.get("House", "Commons"),
                "hansard_url": hansard_url,
                "timecode": item.get("Timecode", ""),
            })

        if len(page_results) < take or skip + take >= total:
            break
        skip += take

    return results


def search_hansard_main(search_term, member_id=None, start_date=None):
    """Search main Hansard endpoint (returns mixed types including debates)."""
    params = {
        "queryParameters.searchTerm": search_term,
        "queryParameters.take": "10",
        "queryParameters.skip": "0",
        "queryParameters.house": "Commons",
    }
    if member_id:
        params["queryParameters.memberId"] = str(member_id)
    if start_date:
        params["queryParameters.startDate"] = start_date

    url = f"{HANSARD_API}/search.json?{urllib.parse.urlencode(params)}"
    data = api_get_json(url, label=f"HansardMain:{search_term[:25]}")
    if not data:
        return {"contributions": 0, "written_statements": 0,
                "debates": 0, "total": 0}

    return {
        "contributions": data.get("TotalContributions", 0),
        "written_statements": data.get("TotalWrittenStatements", 0),
        "debates": data.get("TotalDebates", 0),
        "total": (data.get("TotalContributions", 0) +
                  data.get("TotalWrittenStatements", 0)),
    }


# ═══════════════════════════════════════════════════════════════
#  Written Questions API — PQs where MP mentions entities
# ═══════════════════════════════════════════════════════════════

def search_written_questions(search_term, member_id=None, max_results=40):
    """Search Written Questions via the Parliament Questions API.

    Returns list of question dicts. The `memberHasInterest` flag is golden
    for integrity detection — it means the MP formally declared a financial
    interest when tabling the question.
    """
    results = []
    skip = 0

    while skip < max_results:
        take = min(20, max_results - skip)
        params = {
            "SearchTerm": search_term,
            "House": "Commons",
            "skip": str(skip),
            "take": str(take),
        }
        if member_id:
            params["AskingMemberId"] = str(member_id)

        url = f"{QUESTIONS_API}/writtenquestions/questions?{urllib.parse.urlencode(params)}"
        data = api_get_json(url, label=f"WrittenQ:{search_term[:25]}")
        if not data:
            break

        page_results = data.get("results", [])
        total = data.get("totalResults", 0)

        for item in page_results:
            val = item.get("value", {})
            question_text = strip_html(val.get("questionText") or "")
            answer_text = strip_html(val.get("answerText") or "")
            has_interest = val.get("memberHasInterest", False)

            # Track interest declarations
            if has_interest:
                stats["interest_declared_questions"] += 1

            asking_raw = val.get("askingMember")
            asking = asking_raw if isinstance(asking_raw, dict) else {}
            results.append({
                "question_id": val.get("id"),
                "uin": val.get("uin", ""),
                "member_name": asking.get("name", ""),
                "member_id": asking.get("id"),
                "constituency": asking.get("memberFrom", ""),
                "party": asking.get("party", ""),
                "question_text": question_text,
                "answer_text": answer_text[:500],
                "answering_body": val.get("answeringBodyName", ""),
                "date_tabled": val.get("dateTabled", ""),
                "date_answered": val.get("dateAnswered", ""),
                "heading": val.get("heading", ""),
                "member_has_interest": has_interest,
                "parliament_url": f"https://questions-statements.parliament.uk/written-questions/detail/{val.get('uin', '')}",
            })

        stats["written_questions_found"] += len(page_results)
        if len(page_results) < take or skip + take >= total:
            break
        skip += take

    return results


# ═══════════════════════════════════════════════════════════════
#  Written Statements — Government statements mentioning entities
# ═══════════════════════════════════════════════════════════════

def search_written_statements(search_term, max_results=20):
    """Search Written Statements for entity mentions."""
    params = {
        "SearchTerm": search_term,
        "House": "Commons",
        "skip": "0",
        "take": str(min(20, max_results)),
    }
    url = f"{QUESTIONS_API}/writtenstatements/statements?{urllib.parse.urlencode(params)}"
    data = api_get_json(url, label=f"WrittenStmt:{search_term[:25]}")
    if not data:
        return []

    results = []
    for item in data.get("results", []):
        val = item.get("value", {})
        results.append({
            "title": val.get("title", ""),
            "text": strip_html(val.get("text", ""))[:500],
            "member_name": val.get("memberName", ""),
            "member_role": val.get("memberRole", ""),
            "date_made": val.get("dateMade", ""),
            "answering_body": val.get("answeringBodyName", ""),
            "parliament_url": f"https://questions-statements.parliament.uk/written-statements/detail/{val.get('dateMade', '')[:10]}/{val.get('uin', '')}",
        })
    return results


# ═══════════════════════════════════════════════════════════════
#  Utility Functions
# ═══════════════════════════════════════════════════════════════

def strip_html(text):
    """Remove HTML tags from text."""
    if not text:
        return ""
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def extract_mention_context(text, term, context_chars=250):
    """Extract a context window around a mention of a term in text."""
    if not text or not term:
        return ""
    idx = text.lower().find(term.lower())
    if idx == -1:
        return text[:context_chars] + "..." if len(text) > context_chars else text
    start = max(0, idx - context_chars // 2)
    end = min(len(text), idx + len(term) + context_chars // 2)
    excerpt = text[start:end]
    if start > 0:
        excerpt = "..." + excerpt
    if end < len(text):
        excerpt = excerpt + "..."
    return excerpt


def classify_mention_risk(relationship_type, source_type="spoken"):
    """Classify the risk level of a parliamentary mention."""
    risk_map = {
        "declared_interest": "info",        # MP disclosed this — transparent
        "donor_to_mp": "high",              # MP mentioned their donor
        "donor_to_party": "warning",        # MP mentioned party donor
        "council_supplier": "warning",      # MP mentioned council supplier
        "councillor_company": "high",       # MP mentioned councillor's company
        "supplier_and_donor": "critical",   # Company both donates AND supplies
        "written_question_with_interest": "critical",  # MP declared interest when asking PQ
        "written_question": "warning",      # MP asked PQ about connected entity
    }
    risk = risk_map.get(relationship_type, "info")
    # Upgrade risk for written questions where interest is declared
    if source_type == "written_question_interest":
        risk = "critical"
    return risk


def determine_relationship(company_name, mp_name, mp_data, ec_data, integrity_data):
    """Determine the relationship between a company/entity and the integrity network."""
    relationships = []
    company_upper = company_name.upper().strip()
    # Skip very short terms that cause false positives
    if len(company_upper) < 4:
        return ["general"]

    # Check MP declared interests
    if mp_data:
        for const_key, const_data in mp_data.get("constituencies", {}).items():
            if const_data.get("mp_name", "") == mp_name:
                for comp in const_data.get("companies_declared", []):
                    if company_upper in comp.upper() or comp.upper() in company_upper:
                        relationships.append("declared_interest")
                for donor in const_data.get("donors", []):
                    if company_upper in donor.upper() or donor.upper() in company_upper:
                        relationships.append("donor_to_mp")
                break

    # Check EC donations
    if ec_data:
        for don in ec_data.get("supplier_donations", []):
            dn = (don.get("donor_name") or "").upper()
            if company_upper in dn or dn in company_upper:
                if "supplier_and_donor" not in relationships:
                    relationships.append("supplier_and_donor")
        for don_list in ec_data.get("donations_by_mp", {}).values():
            for don in don_list:
                dn = (don.get("donor_name") or "").upper()
                if company_upper in dn or dn in company_upper:
                    if "donor_to_mp" not in relationships:
                        relationships.append("donor_to_mp")
        for area_dons in ec_data.get("donations_by_area", {}).values():
            for don in area_dons:
                dn = (don.get("donor_name") or "").upper()
                if company_upper in dn or dn in company_upper:
                    if "donor_to_party" not in relationships:
                        relationships.append("donor_to_party")

    # Check integrity data (councillor companies that are suppliers)
    if integrity_data:
        for councillor in integrity_data:
            for sc in councillor.get("supplier_conflicts", []):
                sn = (sc.get("company_name") or "").upper()
                if company_upper in sn or sn in company_upper:
                    if "councillor_company" not in relationships:
                        relationships.append("councillor_company")

    return relationships if relationships else ["general"]


def load_search_terms(mp_data, ec_data, integrity_data_all):
    """Build the master list of search terms per MP.

    Terms come from:
      1. MP declared interests (company names)
      2. Donors to the MP (from mp_interests.json)
      3. EC donation donors linked to their area
      4. Supplier-donor crossover entities
    """
    search_terms = defaultdict(list)  # mp_name -> [(term, source_type)]
    seen_per_mp = defaultdict(set)    # Dedup

    if mp_data:
        for const_key, const_data in mp_data.get("constituencies", {}).items():
            mp_name = const_data.get("mp_name", "")
            if not mp_name:
                continue

            # Declared companies
            for comp in const_data.get("companies_declared", []):
                comp_clean = comp.strip()
                # Skip generic terms, very short names, and common suffixes
                if (len(comp_clean) < 5 or
                    comp_clean.lower() in ("ltd", "limited", "plc", "n/a", "none",
                                           "cash", "self", "the")):
                    continue
                key = comp_clean.upper()
                if key not in seen_per_mp[mp_name]:
                    search_terms[mp_name].append((comp_clean, "declared_interest"))
                    seen_per_mp[mp_name].add(key)

            # Declared donors
            for donor in const_data.get("donors", []):
                donor_clean = donor.strip()
                if (len(donor_clean) < 5 or
                    donor_clean.lower() in ("cash", "n/a", "none", "self")):
                    continue
                key = donor_clean.upper()
                if key not in seen_per_mp[mp_name]:
                    search_terms[mp_name].append((donor_clean, "donor_to_mp"))
                    seen_per_mp[mp_name].add(key)

    # EC donations — add area-specific donor names for MPs in those areas
    if ec_data and mp_data:
        for const_key, const_data in mp_data.get("constituencies", {}).items():
            mp_name = const_data.get("mp_name", "")
            if not mp_name:
                continue
            constituency = const_data.get("constituency", "")
            # Find top donors to this area
            for area_name, donations in ec_data.get("donations_by_area", {}).items():
                # Check if this area relates to the MP's constituency
                if not any(part.lower() in constituency.lower()
                           for part in area_name.lower().split()
                           if len(part) > 3):
                    continue
                # Get unique donors with significant amounts
                donor_values = defaultdict(float)
                for don in donations:
                    dn = don.get("donor_name", "").strip()
                    val = don.get("value", 0)
                    if isinstance(val, str):
                        val = float(val.replace(",", "").replace("£", "")) if val else 0
                    donor_values[dn] += val
                # Add top donors by value
                for dn, total_val in sorted(donor_values.items(),
                                            key=lambda x: x[1], reverse=True)[:10]:
                    if len(dn) >= 5:
                        key = dn.upper()
                        if key not in seen_per_mp[mp_name]:
                            search_terms[mp_name].append((dn, "donor_to_party"))
                            seen_per_mp[mp_name].add(key)

    # Supplier-donor crossover entities — high priority
    if ec_data:
        for sd in ec_data.get("supplier_donations", []):
            donor = (sd.get("donor_name") or "").strip()
            if len(donor) >= 5:
                for mp_name in search_terms.keys():
                    key = donor.upper()
                    if key not in seen_per_mp[mp_name]:
                        search_terms[mp_name].append((donor, "supplier_and_donor"))
                        seen_per_mp[mp_name].add(key)

    return dict(search_terms)


# ═══════════════════════════════════════════════════════════════
#  Main Pipeline
# ═══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Hansard Parliamentary Cross-Reference ETL v2")
    parser.add_argument("--mp", help="Search for specific MP only")
    parser.add_argument("--search", help="Search for specific term only")
    parser.add_argument("--since", default="2015-01-01",
                        help="Search from date (default: 2015-01-01)")
    parser.add_argument("--max-terms", type=int, default=25,
                        help="Max search terms per MP (default: 25)")
    parser.add_argument("--skip-wq", action="store_true",
                        help="Skip Written Questions search")
    args = parser.parse_args()

    print("═══ Hansard Cross-Reference ETL v2 ═══")
    print("  Data sources: Parliament Hansard API + Written Questions API")
    print("  Authentication: None required (Open Parliament Licence)")
    print(f"  Search window: {args.since} → present")
    print()

    # ── Load input data ──
    print("── Loading input data ──")

    mp_data = None
    mp_file = DATA_DIR / "shared" / "mp_interests.json"
    if mp_file.exists():
        with open(mp_file) as f:
            mp_data = json.load(f)
        n_const = len(mp_data.get("constituencies", {}))
        print(f"  MP interests: {n_const} constituencies")
    else:
        print("  [WARN] mp_interests.json not found — limited search terms")

    ec_data = None
    ec_file = DATA_DIR / "shared" / "ec_donations.json"
    if ec_file.exists():
        with open(ec_file) as f:
            ec_data = json.load(f)
        total_don = ec_data.get("summary", {}).get("total_donations", 0)
        print(f"  EC donations: {total_don} records")
    else:
        print("  [WARN] ec_donations.json not found — run ec_donations_etl.py first")

    integrity_data_all = []
    council_count = 0
    council_dirs = sorted([d for d in DATA_DIR.iterdir()
                           if d.is_dir() and d.name != "shared"])
    for cd in council_dirs:
        ifile = cd / "integrity.json"
        if ifile.exists():
            try:
                with open(ifile) as f:
                    idata = json.load(f)
                integrity_data_all.extend(idata.get("councillors", []))
                council_count += 1
            except (json.JSONDecodeError, IOError):
                pass
    print(f"  Integrity data: {len(integrity_data_all)} councillors "
          f"across {council_count} councils")

    # ── Single search mode ──
    if args.search:
        print(f"\n── Searching Hansard for: '{args.search}' ──")
        results = search_hansard_contributions(args.search, start_date=args.since)
        for r in results:
            date = r.get("debate_date", "")
            name = r.get("member_name", "")
            title = r.get("debate_title", "")
            excerpt = extract_mention_context(r.get("full_text", ""), args.search, 200)
            print(f"  [{date}] {name}: {title}")
            if excerpt:
                print(f"    {excerpt}")
        if not args.skip_wq:
            print(f"\n── Written Questions mentioning: '{args.search}' ──")
            wqs = search_written_questions(args.search)
            for q in wqs:
                interest = " [INTEREST DECLARED]" if q.get("member_has_interest") else ""
                print(f"  [{q.get('date_tabled','')}] {q.get('member_name','')}: "
                      f"{q.get('heading','')}{interest}")
                if q.get("question_text"):
                    print(f"    Q: {q['question_text'][:200]}")
        return

    # ── Build search terms ──
    search_term_map = load_search_terms(mp_data, ec_data, integrity_data_all)
    if not search_term_map:
        print("\n[ERROR] No search terms generated. Ensure mp_interests.json exists.")
        sys.exit(1)

    if args.mp:
        search_term_map = {k: v for k, v in search_term_map.items()
                           if args.mp.lower() in k.lower()}

    total_terms = sum(len(v) for v in search_term_map.values())
    print(f"\n  Search plan: {len(search_term_map)} MPs, "
          f"{total_terms} total search terms")

    # ── Phase 1: Resolve MP member IDs ──
    print("\n── Phase 1: Resolving MP Hansard member IDs ──")
    mp_member_ids = {}   # mp_name -> member_id
    mp_display_names = {}

    for mp_name in search_term_map.keys():
        mid, display, constituency = resolve_member_id(mp_name)
        if mid:
            mp_member_ids[mp_name] = mid
            mp_display_names[mp_name] = display or mp_name
            print(f"  {mp_name} → ID {mid} ({constituency})")
        else:
            print(f"  {mp_name} → [NOT FOUND]")

    found = len(mp_member_ids)
    total = len(search_term_map)
    print(f"  Resolved: {found}/{total} MPs")

    # ── Phase 2: Search Hansard spoken contributions ──
    print("\n── Phase 2: Searching Hansard spoken debates ──")

    all_mentions = {}
    company_mentions = defaultdict(lambda: {
        "mentioned_by": [], "relationships": [], "count": 0,
        "sources": [], "risk_levels": []
    })

    for mp_name, terms in search_term_map.items():
        member_id = mp_member_ids.get(mp_name)
        n_terms = min(len(terms), args.max_terms)
        print(f"\n  {mp_name} ({n_terms} terms, ID={member_id or 'N/A'}):")

        mp_mentions = []
        for term, source_type in terms[:args.max_terms]:
            print(f"    [{source_type}] '{term}'...", end=" ", flush=True)

            # Search Hansard
            results = search_hansard_contributions(
                term, member_id=member_id,
                start_date=args.since, max_results=40)

            mentions = []
            for r in results:
                # Verify the MP actually said this (not someone else)
                r_member = r.get("member_name", "")
                if member_id and r.get("member_id") != member_id:
                    continue

                full_text = r.get("full_text", "")
                excerpt = extract_mention_context(full_text, term, 300)

                relationships = determine_relationship(
                    term, mp_name, mp_data, ec_data, integrity_data_all)
                rel = source_type if source_type != "general" else (
                    relationships[0] if relationships else "general")
                risk = classify_mention_risk(rel)

                mentions.append({
                    "company_or_donor": term,
                    "relationship": rel,
                    "all_relationships": relationships,
                    "debate_title": r.get("debate_title", ""),
                    "debate_date": r.get("debate_date", ""),
                    "excerpt": excerpt[:400],
                    "hansard_url": r.get("hansard_url", ""),
                    "risk_indicator": risk,
                    "source": "hansard_api",
                    "section": r.get("section", ""),
                })

            print(f"{len(mentions)} mentions", flush=True)
            mp_mentions.extend(mentions)
            stats["mentions_found"] += len(mentions)

            # Track company-level mentions
            for m in mentions:
                key = term.upper()
                company_mentions[key]["count"] += 1
                if mp_name not in company_mentions[key]["mentioned_by"]:
                    company_mentions[key]["mentioned_by"].append(mp_name)
                if "hansard" not in company_mentions[key]["sources"]:
                    company_mentions[key]["sources"].append("hansard")
                for rel in m.get("all_relationships", []):
                    if rel not in company_mentions[key]["relationships"]:
                        company_mentions[key]["relationships"].append(rel)
                if m["risk_indicator"] not in company_mentions[key]["risk_levels"]:
                    company_mentions[key]["risk_levels"].append(m["risk_indicator"])

        # Deduplicate
        seen = set()
        unique = []
        for m in mp_mentions:
            key = (m["company_or_donor"], m.get("hansard_url", ""),
                   m.get("debate_date", ""))
            if key not in seen:
                seen.add(key)
                unique.append(m)

        if unique:
            all_mentions[mp_name] = {
                "member_id": mp_member_ids.get(mp_name),
                "display_name": mp_display_names.get(mp_name, mp_name),
                "total_mentions": len(unique),
                "hansard_mentions": len(unique),
                "written_question_mentions": 0,  # Filled in Phase 3
                "mentions": unique,
                "written_questions": [],          # Filled in Phase 3
            }

    print(f"\n  Hansard search complete: {stats['mentions_found']} spoken mentions "
          f"across {len(all_mentions)} MPs")

    # ── Phase 3: Written Questions search ──
    if not args.skip_wq:
        print("\n── Phase 3: Searching Written Questions ──")
        wq_total = 0

        for mp_name, terms in search_term_map.items():
            member_id = mp_member_ids.get(mp_name)
            if not member_id:
                continue

            n_terms = min(len(terms), args.max_terms)
            print(f"\n  {mp_name} ({n_terms} terms):")
            mp_wqs = []

            for term, source_type in terms[:args.max_terms]:
                print(f"    [{source_type}] '{term}'...", end=" ", flush=True)

                questions = search_written_questions(
                    term, member_id=member_id, max_results=20)

                valid = []
                for q in questions:
                    # Verify the question text actually mentions the term
                    q_text = (str(q.get("question_text") or "") + " " +
                              str(q.get("heading") or "")).lower()
                    if term.lower() not in q_text:
                        continue

                    has_interest = q.get("member_has_interest", False)
                    relationships = determine_relationship(
                        term, mp_name, mp_data, ec_data, integrity_data_all)
                    rel = source_type
                    if has_interest:
                        rel = "written_question_with_interest"
                    risk = classify_mention_risk(rel,
                        source_type="written_question_interest" if has_interest
                        else "written_question")

                    q["relationship"] = rel
                    q["all_relationships"] = relationships
                    q["risk_indicator"] = risk
                    q["company_or_donor"] = term
                    q["source"] = "written_questions_api"
                    valid.append(q)

                    # Track company mentions
                    key = term.upper()
                    company_mentions[key]["count"] += 1
                    if mp_name not in company_mentions[key]["mentioned_by"]:
                        company_mentions[key]["mentioned_by"].append(mp_name)
                    if "written_questions" not in company_mentions[key]["sources"]:
                        company_mentions[key]["sources"].append("written_questions")

                print(f"{len(valid)} questions"
                      f"{' (interest declared!)' if any(v.get('member_has_interest') for v in valid) else ''}",
                      flush=True)
                mp_wqs.extend(valid)
                wq_total += len(valid)

            if mp_wqs:
                if mp_name not in all_mentions:
                    all_mentions[mp_name] = {
                        "member_id": member_id,
                        "display_name": mp_display_names.get(mp_name, mp_name),
                        "total_mentions": 0,
                        "hansard_mentions": 0,
                        "written_question_mentions": 0,
                        "mentions": [],
                        "written_questions": [],
                    }
                all_mentions[mp_name]["written_questions"] = mp_wqs
                all_mentions[mp_name]["written_question_mentions"] = len(mp_wqs)
                all_mentions[mp_name]["total_mentions"] += len(mp_wqs)

        print(f"\n  Written Questions search complete: {wq_total} relevant questions")
        print(f"  Questions where MP declared interest: {stats['interest_declared_questions']}")

    # ── Phase 4: Written Statements search (top entities only) ──
    print("\n── Phase 4: Checking Written Statements (top entities) ──")
    written_statements = []

    # Get top-mentioned companies for statement search
    top_entities = sorted(company_mentions.items(),
                          key=lambda x: x[1]["count"], reverse=True)[:15]
    for entity_name, _ in top_entities:
        print(f"  Checking: '{entity_name}'...", end=" ", flush=True)
        stmts = search_written_statements(entity_name, max_results=10)
        if stmts:
            print(f"{len(stmts)} statements")
            for s in stmts:
                s["entity_searched"] = entity_name
            written_statements.extend(stmts)
        else:
            print("0 statements")

    # ── Build output ──
    high_risk = sum(
        1 for mp in all_mentions.values()
        for m in (mp.get("mentions", []) + mp.get("written_questions", []))
        if m.get("risk_indicator") in ("high", "critical")
    )
    interest_declared = sum(
        1 for mp in all_mentions.values()
        for q in mp.get("written_questions", [])
        if q.get("member_has_interest")
    )

    output = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "version": "2.0",
        "data_sources": [
            "Parliament Hansard API (hansard-api.parliament.uk)",
            "Written Questions API (questions-statements-api.parliament.uk)",
            "Parliament Members API (members-api.parliament.uk)",
        ],
        "methodology": (
            "Cross-reference Lancashire MP parliamentary speeches and Written "
            "Questions against declared interests, EC donations, and council "
            "supplier networks. Uses official Parliament APIs under the Open "
            "Parliament Licence — completely free, no API keys required."
        ),
        "search_window": {"from": args.since, "to": datetime.utcnow().strftime("%Y-%m-%d")},
        "mp_mentions": all_mentions,
        "written_statements": written_statements,
        "company_mentions_summary": {
            k: v for k, v in sorted(
                company_mentions.items(),
                key=lambda x: x[1]["count"],
                reverse=True
            )
        },
        "summary": {
            "mps_searched": len(search_term_map),
            "mps_resolved": len(mp_member_ids),
            "mps_with_mentions": len(all_mentions),
            "total_spoken_mentions": stats["mentions_found"],
            "total_written_questions": stats["written_questions_found"],
            "interest_declared_questions": stats["interest_declared_questions"],
            "written_statements_found": len(written_statements),
            "unique_entities_mentioned": len(company_mentions),
            "high_risk_mentions": high_risk,
            "interest_declared_in_questions": interest_declared,
        },
        "stats": stats,
    }

    output_path = DATA_DIR / "shared" / "hansard_cross_reference.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2, default=str)

    print(f"\n═══ Hansard Cross-Reference ETL v2 Complete ═══")
    print(f"  Output: {output_path}")
    print(f"  MPs searched: {len(search_term_map)}")
    print(f"  MPs resolved (Hansard IDs): {len(mp_member_ids)}")
    print(f"  MPs with mentions: {len(all_mentions)}")
    print(f"  Spoken debate mentions: {stats['mentions_found']}")
    print(f"  Written Questions found: {stats['written_questions_found']}")
    print(f"  Interest declared in PQs: {stats['interest_declared_questions']}")
    print(f"  Written Statements: {len(written_statements)}")
    print(f"  High-risk mentions: {high_risk}")
    print(f"  API requests: {stats['requests']} | Errors: {stats['errors']}")


if __name__ == "__main__":
    main()
