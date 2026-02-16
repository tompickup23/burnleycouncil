#!/usr/bin/env python3
"""
Councillor Integrity ETL v2 — Multi-Source Forensic Investigation

Investigates councillor integrity across 8+ public data sources:
1. Companies House REST API — directorships, PSC, charges, insolvency, disqualifications
2. Companies House co-director network — shared directorships = hidden networks
3. Electoral Commission — donation/spending cross-reference with council suppliers
4. Charity Commission — trustee cross-reference against council grant recipients
5. FCA Register — prohibition orders, regulated person conflicts
6. Insolvency Service — bankruptcy/IVA (automatic disqualification under s.80 LGA 1972)
7. Cross-council fraud detection — suppliers spanning councils, shared director networks
8. Familial connections — surname clustering, shared addresses, family member CH directorships

Detection algorithms:
- Undeclared interests (CH directorships vs register of interests)
- Contract steering indicators (councillor-linked companies winning contracts)
- Phoenix company patterns (serial dissolutions + new incorporations)
- Formation agent detection (bulk company registrations at same address)
- Co-director network mapping (who else sits on boards with councillors?)
- Cross-council supplier conflicts (same councillor network, different councils)
- Misconduct pattern scoring (Nolan Principles compliance indicators)
- Familial connections (surname clustering, shared addresses, family member directorships)

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
SHELL_SIC_CODES = {"82990", "64209", "98000", "99999", "96090"}
PROPERTY_SIC_CODES = {"68209", "68100", "68320", "68310", "68201", "68202"}
# Formation agent / nominee SIC codes
FORMATION_SIC_CODES = {"69201", "69209", "82110"}

# Known formation agent addresses (expanded from Norwich investigation)
FORMATION_AGENT_INDICATORS = [
    "20-22 wenlock road", "71-75 shelton street", "167-169 great portland",
    "suite", "floor", "virtual office", "registered office", "c/o",
    "kemp house", "falcon road", "imperial house", "formation"
]

# Request delays to avoid rate limiting
CH_DELAY = 0.5
EC_DELAY = 1.0
CHARITY_DELAY = 1.0
FCA_DELAY = 1.0

# All 15 Lancashire councils
ALL_COUNCILS = [
    "burnley", "hyndburn", "pendle", "rossendale",
    "lancaster", "ribble_valley", "chorley", "south_ribble",
    "lancashire_cc", "blackpool", "blackburn",
    "west_lancashire", "wyre", "preston", "fylde"
]

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


def http_get_json(url, headers=None, delay=0.5, label="API"):
    """Generic HTTP GET → JSON with retry + rate limit handling."""
    req = urllib.request.Request(url)
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", "AI-DOGE-IntegrityETL/2.0")

    try:
        time.sleep(delay)
        api_calls[label] += 1
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        if e.code == 429:
            print(f"    [{label} RATE LIMITED] Waiting 60s...")
            time.sleep(60)
            return http_get_json(url, headers, delay, label)
        if e.code >= 500:
            print(f"    [{label} SERVER ERROR {e.code}] Skipping")
            return None
        print(f"    [{label} HTTP {e.code}] {url[:100]}")
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


def get_officer_appointments(officer_id, items_per_page=50):
    """Get all company appointments for an officer."""
    data = ch_request(f"/officers/{officer_id}/appointments",
                      {"items_per_page": items_per_page})
    return data.get("items", []) if data else []


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
    """Score how well a CH officer matches a councillor name. Returns 0-100."""
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

    # CH often puts surname first: "SMITH, John"
    if "," in officer_title:
        parts = officer_title.split(",", 1)
        o_last = parts[0].strip().lower()
        o_rest = parts[1].strip().lower().split() if len(parts) > 1 and parts[1].strip() else []
        o_first = o_rest[0] if o_rest else ""
        # Remove honorifics from o_last too
        for prefix in ["mr", "mrs", "ms", "miss", "dr", "sir", "dame"]:
            o_last = o_last.replace(prefix + " ", "")
    else:
        o_first = o_parts[0] if o_parts else ""
        o_last = o_parts[-1] if o_parts else ""

    score = 0
    if c_last == o_last:
        score += 50
    if c_first == o_first:
        score += 40
    elif len(c_first) >= 3 and len(o_first) >= 3 and c_first[:3] == o_first[:3]:
        score += 20  # Partial first name match (e.g. "Tom" vs "Thomas")

    # Middle name bonus
    if len(c_parts) > 2 and len(o_parts) > 2:
        for cm in c_parts[1:-1]:
            for om in o_parts[1:-1]:
                if cm == om:
                    score += 10
                    break

    return score


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
            if ratio >= 0.6:
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
                    "shared_companies": [],
                    "roles": set(),
                    "appointed_dates": []
                }
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
            network.append({
                "name": data["name"],
                "shared_company_count": len(data["shared_companies"]),
                "shared_companies": data["shared_companies"],
                "roles": list(data["roles"]),
            })

    # Sort by most shared companies
    network.sort(key=lambda x: x["shared_company_count"], reverse=True)

    return {
        "associates": network[:20],  # Top 20 co-directors
        "total_unique_associates": len(co_directors),
        "formation_agent_companies": formation_agent_companies,
    }


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
        officer_id = officer.get("links", {}).get("self", "").split("/")[-1]
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
            if score >= 60:
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
    if result.get("supplier_conflicts"):
        for conflict in result["supplier_conflicts"]:
            total = conflict.get("supplier_match", {}).get("total_spend", 0)
            if total > 50000:  # Significant value
                patterns.append({
                    "type": "contract_steering_indicator",
                    "severity": "critical",
                    "detail": "Councillor-linked company '{}' received {} in council contracts".format(
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
# Electoral Commission Cross-Reference
# ═══════════════════════════════════════════════════════════════════════════

def check_electoral_commission(councillor_name, party, supplier_data, skip=False):
    """Cross-reference Electoral Commission donations with council suppliers."""
    if skip:
        return {"searched": False, "findings": []}

    findings = []

    # 1. Check if the councillor themselves appears as a donor
    data = search_ec_donations(councillor_name)
    if data and data.get("Result"):
        for item in data["Result"]:
            donor = item.get("DonorName", "")
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

    # 2. Check if any council supplier appears as a donor to local parties
    if supplier_data:
        for supplier_entry in supplier_data[:20]:  # Top 20 suppliers only
            supplier = supplier_entry if isinstance(supplier_entry, str) else supplier_entry.get("supplier", "")
            if not supplier or len(supplier) < 4:
                continue
            data = search_ec_donations(supplier)
            if data and data.get("Result"):
                for item in data["Result"]:
                    # Check if donation is to a local branch
                    accounting_unit = item.get("AccountingUnitName", "").lower()
                    if any(area in accounting_unit for area in
                           ["burnley", "hyndburn", "pendle", "rossendale", "lancaster",
                            "ribble valley", "chorley", "south ribble", "lancashire",
                            "blackpool", "blackburn", "west lanc", "wyre", "preston", "fylde"]):
                        findings.append({
                            "type": "supplier_is_local_donor",
                            "detail": "Council supplier '{}' donated {} to {}".format(
                                supplier,
                                "£{:,.0f}".format(item.get("Value", 0)),
                                item.get("AccountingUnitName", "")),
                            "supplier": supplier,
                            "value": item.get("Value", 0),
                            "date": item.get("AcceptedDate", ""),
                            "party": item.get("RegulatedEntityName", ""),
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
            ind_name = item.get("Individual_Name", "")
            score = name_match_score(councillor_name, ind_name)
            if score >= 70:
                status = item.get("Status", "")
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

def load_supplier_data(council_id):
    """Load supplier data from insights.json — returns list of {supplier, total} dicts."""
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


def load_all_supplier_data():
    """Load supplier data from ALL 15 councils for cross-council analysis."""
    all_data = {}
    for council_id in ALL_COUNCILS:
        data = load_supplier_data(council_id)
        if data:
            all_data[council_id] = data
    return all_data


# ═══════════════════════════════════════════════════════════════════════════
# Main Councillor Processing
# ═══════════════════════════════════════════════════════════════════════════

def process_councillor(councillor, supplier_data, all_supplier_data=None,
                       skip_ec=False, skip_fca=False, skip_network=False):
    """Process a single councillor through ALL data source checks."""
    name = councillor.get("name", "")
    if not name:
        return None

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
        "misconduct_patterns": [],
        "red_flags": [],
        "integrity_score": None,
        "risk_level": "not_checked"
    }

    print("  Checking: {} ({})".format(name, councillor.get("party", "")))

    # ── 1. Companies House Officer Search ──
    result["data_sources_checked"].append("companies_house")
    officers = search_officers(name)

    best_matches = []
    for officer in officers:
        title = officer.get("title", "")
        score = name_match_score(name, title)
        if score >= 60:
            officer_id = officer.get("links", {}).get("self", "").split("/")[-1]
            best_matches.append({
                "officer_id": officer_id,
                "title": title,
                "match_score": score,
                "date_of_birth": officer.get("date_of_birth", {}),
                "address_snippet": officer.get("address_snippet", ""),
            })

    best_matches.sort(key=lambda x: x["match_score"], reverse=True)
    result["companies_house"]["officer_matches"] = best_matches[:3]

    # ── 2. Get Appointments + Company Profiles ──
    if best_matches:
        best = best_matches[0]
        officer_id = best.get("officer_id", "")
        if officer_id:
            appointments = get_officer_appointments(officer_id)

            companies = []
            for appt in appointments:
                appointed_to = appt.get("appointed_to", {})
                company_name = appointed_to.get("company_name", "Unknown")
                company_number = appointed_to.get("company_number", "")
                role = appt.get("officer_role", "director")
                appointed = appt.get("appointed_on", "")
                resigned = appt.get("resigned_on", "")
                status = appointed_to.get("company_status", "")

                company_entry = {
                    "company_name": company_name,
                    "company_number": company_number,
                    "role": role,
                    "appointed_on": appointed,
                    "resigned_on": resigned,
                    "company_status": status,
                    "companies_house_url": "https://find-and-update.company-information.service.gov.uk/company/{}".format(company_number) if company_number else None,
                    "sic_codes": [],
                    "registered_address_snippet": "",
                    "red_flags": [],
                    "supplier_match": None,
                }

                # Get company profile for active directorships
                if not resigned and company_number:
                    profile = get_company_profile(company_number)
                    if profile:
                        company_entry["sic_codes"] = profile.get("sic_codes", [])
                        company_entry["registered_address_snippet"] = profile.get(
                            "registered_office_address", {}).get("address_line_1", "")
                        company_entry["red_flags"] = extract_red_flags(profile)
                        company_entry["date_of_creation"] = profile.get("date_of_creation", "")
                        company_entry["company_type"] = profile.get("type", "")

                # Cross-reference with THIS council's suppliers
                if supplier_data:
                    matches = cross_reference_suppliers(company_name, supplier_data)
                    if matches:
                        company_entry["supplier_match"] = matches[0]
                        result["supplier_conflicts"].append({
                            "company_name": company_name,
                            "company_number": company_number,
                            "supplier_match": matches[0],
                            "severity": "critical" if not resigned else "info",
                            "council_id": councillor.get("_council_id", ""),
                        })

                # Cross-reference with OTHER councils' suppliers
                if all_supplier_data:
                    council_id = councillor.get("_council_id", "")
                    for other_id, other_suppliers in all_supplier_data.items():
                        if other_id == council_id:
                            continue
                        matches = cross_reference_suppliers(company_name, other_suppliers)
                        if matches:
                            result["cross_council_conflicts"].append({
                                "company_name": company_name,
                                "company_number": company_number,
                                "other_council": other_id,
                                "supplier_match": matches[0],
                                "severity": "high" if not resigned else "info",
                            })

                companies.append(company_entry)

            active = [c for c in companies if not c.get("resigned_on")]
            resigned_cos = [c for c in companies if c.get("resigned_on")]

            result["companies_house"]["companies"] = companies
            result["companies_house"]["total_directorships"] = len(companies)
            result["companies_house"]["active_directorships"] = len(active)
            result["companies_house"]["resigned_directorships"] = len(resigned_cos)

            # ── 3. PSC Analysis (for active companies only) ──
            if active:
                psc_entries = analyse_psc(active[:5], name)  # Top 5 to limit API calls
                result["companies_house"]["psc_entries"] = psc_entries

            # ── 4. Co-Director Network (expensive — optional) ──
            if not skip_network and active:
                network = build_co_director_network(active[:3], name)  # Top 3 companies
                result["co_director_network"] = network

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
        if score >= 60:
            result["disqualification_check"]["matches"].append({
                "name": dq_name,
                "match_score": score,
                "snippet": dq.get("snippet", ""),
                "address": dq.get("address_snippet", ""),
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

    # ── 10. Aggregate ALL Red Flags ──
    all_flags = []

    # From company profiles
    for company in result["companies_house"]["companies"]:
        for flag in company.get("red_flags", []):
            flag["company"] = company["company_name"]
            all_flags.append(flag)

    # Disqualification matches
    if result["disqualification_check"]["matches"]:
        all_flags.append({
            "type": "disqualification_match", "severity": "critical",
            "detail": "Potential match on disqualified directors register ({} match(es))".format(
                len(result["disqualification_check"]["matches"]))
        })

    # Supplier conflicts (own council)
    for conflict in result["supplier_conflicts"]:
        all_flags.append({
            "type": "supplier_conflict", "severity": conflict["severity"],
            "detail": "Company '{}' matches council supplier '{}'".format(
                conflict["company_name"], conflict["supplier_match"]["supplier"])
        })

    # Cross-council supplier conflicts
    for conflict in result["cross_council_conflicts"]:
        all_flags.append({
            "type": "cross_council_conflict", "severity": conflict["severity"],
            "detail": "Company '{}' matches supplier at {} council".format(
                conflict["company_name"], conflict["other_council"])
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

    result["red_flags"] = all_flags

    # ── 11. Calculate Integrity Score ──
    score = 100
    for flag in all_flags:
        sev = flag.get("severity", "")
        if sev == "critical":
            score -= 25
        elif sev == "high":
            score -= 15
        elif sev == "warning":
            score -= 5
        # info doesn't affect score
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
                    skip_ec=False, skip_fca=False, skip_network=False):
    """Process all councillors for a given council."""
    councillors_path = DATA_DIR / council_id / "councillors.json"
    if not councillors_path.exists():
        print("[SKIP] No councillors.json for {}".format(council_id))
        return None

    print("\n" + "=" * 70)
    print("INTEGRITY SCAN: {} (v2 — Multi-Source Forensic)".format(council_id.upper()))
    print("=" * 70)

    with open(councillors_path) as f:
        councillors = json.load(f)
    if isinstance(councillors, dict):
        councillors = councillors.get("councillors", [])

    print("  {} councillors to investigate".format(len(councillors)))

    # Load supplier data
    supplier_data = load_supplier_data(council_id)
    print("  {} suppliers loaded for cross-reference".format(len(supplier_data)))

    if not all_supplier_data:
        all_supplier_data = load_all_supplier_data()
    print("  {} councils loaded for cross-council analysis".format(len(all_supplier_data)))

    sources = ["Companies House (officers, PSC, charges, disqualifications)"]
    if not skip_ec:
        sources.append("Electoral Commission (donations)")
    if not skip_fca:
        sources.append("FCA Register (regulated persons)")
    if not skip_network:
        sources.append("Co-director network analysis")
    sources.append("Cross-council supplier matching ({} councils)".format(len(all_supplier_data)))
    sources.append("Familial connection detection (surname clusters, shared addresses, family CH)")
    sources.append("Misconduct pattern detection (7 algorithms)")
    print("  Data sources: {}".format(", ".join(sources)))

    results = {
        "council_id": council_id,
        "version": "2.0",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "data_sources": sources,
        "total_councillors": len(councillors),
        "councillors_checked": 0,
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
        },
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
                results["summary"]["active_directorships"] += ch["active_directorships"]
                results["summary"]["disqualification_matches"] += len(
                    result["disqualification_check"]["matches"])
                results["summary"]["supplier_conflicts"] += len(result["supplier_conflicts"])
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
                print("    [{}/{}] ✓ {} — {} active, {} resigned{}{}".format(
                    i + 1, len(councillors), result["name"],
                    ch["active_directorships"], ch["resigned_directorships"],
                    flags_str, misconduct_str))

        except Exception as e:
            print("    [{}/{}] ✗ Error: {} — {}".format(
                i + 1, len(councillors), councillor.get("name", "?"), e))

    # Cross-council summary
    results["cross_council_summary"]["councillor_companies_in_other_councils"] = \
        results["summary"]["cross_council_conflicts"]
    results["cross_council_summary"]["affected_councils"] = sorted(affected_councils)

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
    print("  Surname clusters: {} | Shared addresses: {}".format(
        len(results.get("surname_clusters", [])),
        len(results.get("shared_address_councillors", []))))
    print("  Network investigations advisable: {} ({} high priority)".format(
        s["network_investigations_advisable"], s["network_investigation_high_priority"]))
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
    print("CROSS-COUNCIL FRAUD ANALYSIS — ALL 15 LANCASHIRE COUNCILS")
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
        "councillors_spanning_councils": [],
        "shared_company_networks": [],
        "family_networks_across_councils": [],
        "supplier_councillor_overlaps": [],
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

    # 4. Summarise risk levels across all councils
    for council_id, integrity in all_integrity.items():
        summary = integrity.get("summary", {})
        findings["cross_council_risk_summary"][council_id] = {
            "councillors_checked": integrity.get("councillors_checked", 0),
            "risk_distribution": summary.get("risk_distribution", {}),
            "red_flags_total": summary.get("red_flags_total", 0),
            "supplier_conflicts": summary.get("supplier_conflicts", 0),
            "cross_council_conflicts": summary.get("cross_council_conflicts", 0),
            "misconduct_patterns": summary.get("misconduct_patterns", 0),
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
        description="Councillor Integrity ETL v2 — Multi-Source Forensic Investigation",
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
    parser.add_argument("--all", action="store_true", help="Process all 15 councils")
    parser.add_argument("--stubs-only", action="store_true", help="Generate stub files only")
    parser.add_argument("--cross-council", action="store_true", help="Run cross-council analysis")
    parser.add_argument("--ch-key", help="Companies House API key (overrides env var)")
    parser.add_argument("--skip-ec", action="store_true", help="Skip Electoral Commission")
    parser.add_argument("--skip-fca", action="store_true", help="Skip FCA Register")
    parser.add_argument("--skip-network", action="store_true", help="Skip co-director network")
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

    # Pre-load all supplier data for cross-council analysis
    all_supplier_data = load_all_supplier_data()
    print("Loaded supplier data for {} councils".format(len(all_supplier_data)))

    if args.all:
        for council_id in ALL_COUNCILS:
            process_council(council_id, all_supplier_data,
                          skip_ec=args.skip_ec, skip_fca=args.skip_fca,
                          skip_network=args.skip_network)
        # Run cross-council analysis after all councils processed
        run_cross_council_analysis()
    elif args.council:
        if args.council not in ALL_COUNCILS:
            print("Unknown council: {}".format(args.council))
            print("Available: {}".format(", ".join(ALL_COUNCILS)))
            sys.exit(1)
        process_council(args.council, all_supplier_data,
                       skip_ec=args.skip_ec, skip_fca=args.skip_fca,
                       skip_network=args.skip_network)
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
