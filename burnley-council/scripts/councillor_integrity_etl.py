#!/usr/bin/env python3
"""
Councillor Integrity ETL — Companies House Cross-Reference

For each councillor in a council's councillors.json, this script:
1. Searches Companies House officer register for matching names
2. Retrieves company directorships (active and resigned)
3. Checks for disqualified directors
4. Cross-references directorships against council spending data
5. Flags potential conflicts of interest
6. Generates integrity.json per council

Uses the same forensic techniques as the Norwich investigation:
- Companies House REST API (officer search, company profile, disqualification register)
- Supplier name fuzzy matching against spending data
- Red flag detection (dormant companies, shell SIC codes, insolvency history)

Usage:
    python3 councillor_integrity_etl.py --council burnley
    python3 councillor_integrity_etl.py --all
    python3 councillor_integrity_etl.py --council lancashire_cc --ch-key YOUR_KEY

Rate limits: ~600 requests per 5 minutes (Companies House). Script adds 0.5s delay per request.
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, date
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"

CH_API_BASE = "https://api.company-information.service.gov.uk"
CH_KEY = os.environ.get("CH_API_KEY", "07316ecc-d10e-4316-b293-f7226e343ccd")

# Shell company SIC codes (from Norwich investigation)
SHELL_SIC_CODES = {"82990", "64209", "98000", "99999"}
PROPERTY_SIC_CODES = {"68209", "68100", "68320", "68310", "68201", "68202"}

# Request delay to avoid rate limiting
REQUEST_DELAY = 0.5

# All 15 Lancashire councils
ALL_COUNCILS = [
    "burnley", "hyndburn", "pendle", "rossendale",
    "lancaster", "ribble_valley", "chorley", "south_ribble",
    "lancashire_cc", "blackpool", "blackburn",
    "west_lancashire", "wyre", "preston", "fylde"
]


def ch_auth_header():
    """Generate Companies House Basic auth header."""
    token = base64.b64encode(f"{CH_KEY}:".encode()).decode()
    return f"Basic {token}"


def ch_request(path, params=None):
    """Make an authenticated request to Companies House API."""
    url = f"{CH_API_BASE}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)

    req = urllib.request.Request(url)
    req.add_header("Authorization", ch_auth_header())
    req.add_header("Accept", "application/json")

    try:
        time.sleep(REQUEST_DELAY)
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        if e.code == 429:
            print(f"  [RATE LIMITED] Waiting 30s...")
            time.sleep(30)
            return ch_request(path, params)  # Retry
        print(f"  [HTTP {e.code}] {url}")
        return None
    except Exception as e:
        print(f"  [ERROR] {url}: {e}")
        return None


def search_officers(name, items_per_page=20):
    """Search Companies House officer register for a name."""
    data = ch_request("/search/officers", {
        "q": name,
        "items_per_page": items_per_page
    })
    if not data:
        return []
    return data.get("items", [])


def get_officer_appointments(officer_id):
    """Get all company appointments for an officer."""
    data = ch_request(f"/officers/{officer_id}/appointments", {
        "items_per_page": 50
    })
    if not data:
        return []
    return data.get("items", [])


def get_company_profile(company_number):
    """Get full company profile from Companies House."""
    return ch_request(f"/company/{company_number}")


def search_disqualified(name):
    """Search the disqualified directors register."""
    data = ch_request("/search/disqualified-officers", {
        "q": name,
        "items_per_page": 10
    })
    if not data:
        return []
    return data.get("items", [])


def name_match_score(councillor_name, officer_title):
    """Score how well a CH officer matches a councillor name. Returns 0-100."""
    c_parts = councillor_name.lower().strip().split()
    # Remove common prefixes/suffixes from CH officer title
    o_clean = officer_title.lower().strip()
    for prefix in ["mr ", "mrs ", "ms ", "miss ", "dr ", "sir ", "councillor ", "cllr ",
                    "county councillor ", "borough councillor ", "the rt hon ", "the hon "]:
        if o_clean.startswith(prefix):
            o_clean = o_clean[len(prefix):]
    o_parts = o_clean.split()

    if not c_parts or not o_parts:
        return 0

    # Exact full match
    if " ".join(c_parts) == " ".join(o_parts):
        return 100

    # Check first name + last name match
    c_first = c_parts[0]
    c_last = c_parts[-1]

    # CH often puts surname first: "SMITH, John"
    if "," in officer_title:
        parts = officer_title.split(",", 1)
        o_last = parts[0].strip().lower()
        o_first = parts[1].strip().lower().split()[0] if len(parts) > 1 and parts[1].strip() else ""
    else:
        o_first = o_parts[0] if o_parts else ""
        o_last = o_parts[-1] if o_parts else ""

    score = 0
    if c_last == o_last:
        score += 50
    if c_first == o_first:
        score += 40
    # Partial first name match (e.g. "Tom" vs "Thomas")
    elif c_first[:3] == o_first[:3] and len(c_first) >= 3 and len(o_first) >= 3:
        score += 20

    # Middle name bonus if present
    if len(c_parts) > 2 and len(o_parts) > 2:
        c_middle = c_parts[1]
        for op in o_parts[1:-1]:
            if op == c_middle:
                score += 10
                break

    return score


def extract_red_flags(company):
    """Extract red flags from a company profile (Norwich investigation patterns)."""
    flags = []
    if not company:
        return flags

    status = company.get("company_status", "").lower()
    if status in ("dissolved", "liquidation", "administration", "insolvency-proceedings"):
        flags.append({"type": "company_status", "severity": "warning",
                      "detail": f"Company status: {status}"})

    sic_codes = company.get("sic_codes", [])
    for sic in sic_codes:
        if sic in SHELL_SIC_CODES:
            flags.append({"type": "shell_indicator", "severity": "high",
                          "detail": f"SIC {sic} — potential shell company indicator"})
        if sic in PROPERTY_SIC_CODES:
            flags.append({"type": "property_company", "severity": "info",
                          "detail": f"SIC {sic} — property/holding company"})

    if company.get("has_been_liquidated"):
        flags.append({"type": "liquidation_history", "severity": "high",
                      "detail": "Company has been liquidated"})

    if company.get("has_insolvency_history"):
        flags.append({"type": "insolvency_history", "severity": "high",
                      "detail": "Company has insolvency history"})

    accounts = company.get("accounts", {})
    if accounts.get("overdue"):
        flags.append({"type": "accounts_overdue", "severity": "warning",
                      "detail": "Accounts are overdue at Companies House"})

    annual_return = company.get("annual_return") or company.get("confirmation_statement", {})
    if annual_return.get("overdue"):
        flags.append({"type": "confirmation_overdue", "severity": "warning",
                      "detail": "Confirmation statement overdue"})

    acc_type = accounts.get("last_accounts", {}).get("type", "")
    if acc_type == "dormant":
        flags.append({"type": "dormant_accounts", "severity": "warning",
                      "detail": "Latest accounts filed as dormant"})

    return flags


def cross_reference_suppliers(company_name, supplier_names):
    """Check if a company name appears in council supplier list. Fuzzy match."""
    cn = company_name.lower().strip()
    cn_words = set(cn.replace(" ltd", "").replace(" limited", "").replace(" plc", "").split())

    matches = []
    for supplier in supplier_names:
        sn = supplier.lower().strip()
        sn_words = set(sn.replace(" ltd", "").replace(" limited", "").replace(" plc", "").split())

        # Exact match
        if cn == sn or cn.replace(" ltd", " limited") == sn or cn.replace(" limited", " ltd") == sn:
            matches.append({"supplier": supplier, "match_type": "exact", "confidence": 100})
            continue

        # High word overlap (e.g. "SMITH CONSTRUCTION LTD" vs "Smith Construction Limited")
        if len(cn_words) >= 2 and len(sn_words) >= 2:
            overlap = cn_words & sn_words
            ratio = len(overlap) / max(len(cn_words), len(sn_words))
            if ratio >= 0.7:
                matches.append({"supplier": supplier, "match_type": "fuzzy",
                               "confidence": int(ratio * 100)})

    return matches


def process_councillor(councillor, supplier_names):
    """Process a single councillor through Companies House checks."""
    name = councillor.get("name", "")
    if not name:
        return None

    result = {
        "councillor_id": councillor.get("id", ""),
        "name": name,
        "party": councillor.get("party", ""),
        "ward": councillor.get("ward", ""),
        "checked_at": datetime.utcnow().isoformat() + "Z",
        "companies_house": {
            "officer_matches": [],
            "total_directorships": 0,
            "active_directorships": 0,
            "resigned_directorships": 0,
            "companies": []
        },
        "disqualification_check": {
            "searched": True,
            "matches": []
        },
        "supplier_conflicts": [],
        "red_flags": [],
        "integrity_score": None,  # 0-100, higher = cleaner
        "risk_level": "not_checked"
    }

    print(f"  Checking: {name} ({councillor.get('party', '')})")

    # 1. Search officer register
    officers = search_officers(name)

    best_matches = []
    for officer in officers:
        title = officer.get("title", "")
        score = name_match_score(name, title)
        if score >= 60:  # Only consider strong matches
            best_matches.append({
                "officer_id": officer.get("links", {}).get("self", "").split("/")[-1],
                "title": title,
                "match_score": score,
                "date_of_birth": officer.get("date_of_birth", {}),
                "address_snippet": officer.get("address_snippet", "")
            })

    # Sort by match score, take top 3
    best_matches.sort(key=lambda x: x["match_score"], reverse=True)
    result["companies_house"]["officer_matches"] = best_matches[:3]

    # 2. Get appointments for best match
    if best_matches:
        best = best_matches[0]
        officer_id = best["officer_id"]
        if officer_id:
            appointments = get_officer_appointments(officer_id)

            companies = []
            for appt in appointments:
                company_name = appt.get("appointed_to", {}).get("company_name", "Unknown")
                company_number = appt.get("appointed_to", {}).get("company_number", "")
                role = appt.get("officer_role", "director")
                appointed = appt.get("appointed_on", "")
                resigned = appt.get("resigned_on", "")
                status = appt.get("appointed_to", {}).get("company_status", "")

                company_entry = {
                    "company_name": company_name,
                    "company_number": company_number,
                    "role": role,
                    "appointed_on": appointed,
                    "resigned_on": resigned,
                    "company_status": status,
                    "companies_house_url": f"https://find-and-update.company-information.service.gov.uk/company/{company_number}" if company_number else None,
                    "red_flags": [],
                    "supplier_match": None
                }

                # 3. Get company profile for red flag analysis (only for active directorships)
                if not resigned and company_number:
                    profile = get_company_profile(company_number)
                    if profile:
                        company_entry["sic_codes"] = profile.get("sic_codes", [])
                        company_entry["red_flags"] = extract_red_flags(profile)

                # 4. Cross-reference with suppliers
                if supplier_names:
                    supplier_matches = cross_reference_suppliers(company_name, supplier_names)
                    if supplier_matches:
                        company_entry["supplier_match"] = supplier_matches[0]
                        result["supplier_conflicts"].append({
                            "company_name": company_name,
                            "company_number": company_number,
                            "supplier_match": supplier_matches[0],
                            "severity": "critical" if not resigned else "info"
                        })

                companies.append(company_entry)

            active = [c for c in companies if not c.get("resigned_on")]
            resigned = [c for c in companies if c.get("resigned_on")]

            result["companies_house"]["companies"] = companies
            result["companies_house"]["total_directorships"] = len(companies)
            result["companies_house"]["active_directorships"] = len(active)
            result["companies_house"]["resigned_directorships"] = len(resigned)

    # 5. Check disqualification register
    disqualified = search_disqualified(name)
    for dq in disqualified:
        dq_name = dq.get("title", "")
        score = name_match_score(name, dq_name)
        if score >= 60:
            result["disqualification_check"]["matches"].append({
                "name": dq_name,
                "match_score": score,
                "snippet": dq.get("snippet", ""),
                "address": dq.get("address_snippet", "")
            })

    # 6. Aggregate red flags
    all_flags = []
    for company in result["companies_house"]["companies"]:
        for flag in company.get("red_flags", []):
            flag["company"] = company["company_name"]
            all_flags.append(flag)

    if result["disqualification_check"]["matches"]:
        all_flags.append({
            "type": "disqualification_match",
            "severity": "critical",
            "detail": f"Potential match on disqualified directors register ({len(result['disqualification_check']['matches'])} match(es))"
        })

    if result["supplier_conflicts"]:
        for conflict in result["supplier_conflicts"]:
            all_flags.append({
                "type": "supplier_conflict",
                "severity": conflict["severity"],
                "detail": f"Company '{conflict['company_name']}' matches council supplier '{conflict['supplier_match']['supplier']}'"
            })

    result["red_flags"] = all_flags

    # 7. Calculate integrity score (higher = cleaner)
    score = 100
    for flag in all_flags:
        if flag["severity"] == "critical":
            score -= 25
        elif flag["severity"] == "high":
            score -= 15
        elif flag["severity"] == "warning":
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

    # 8. Determine if network investigation is advisable
    ch = result["companies_house"]
    network_reasons = []
    if ch["active_directorships"] >= 3:
        network_reasons.append(f"{ch['active_directorships']} active directorships — complex company portfolio")
    if result["supplier_conflicts"]:
        network_reasons.append(f"{len(result['supplier_conflicts'])} supplier conflict(s) — possible self-dealing")
    if result["risk_level"] in ("high", "elevated"):
        network_reasons.append(f"{result['risk_level']} risk level — multiple red flags")
    # Check for shared company addresses (pattern from Norwich investigation)
    addresses = set()
    for company in ch.get("companies", []):
        if not company.get("resigned_on"):
            addr = company.get("registered_office_address", "")
            if addr:
                addresses.add(addr.lower())
    if len(addresses) > 0 and len(ch.get("companies", [])) > len(addresses):
        network_reasons.append("Multiple companies sharing registered addresses")
    # Check for high dissolution count (phoenix risk pattern)
    dissolved = [c for c in ch.get("companies", []) if c.get("company_status", "").lower() in ("dissolved", "liquidation")]
    if len(dissolved) >= 3:
        network_reasons.append(f"{len(dissolved)} dissolved/liquidated companies — phoenix risk pattern")
    # Check for co-directorship overlap
    if ch["total_directorships"] >= 5:
        network_reasons.append(f"{ch['total_directorships']} total directorships — extensive company network")

    result["network_investigation"] = {
        "advisable": len(network_reasons) > 0,
        "reasons": network_reasons,
        "priority": "high" if len(network_reasons) >= 3 else "medium" if len(network_reasons) >= 1 else "none"
    }

    return result


def load_supplier_names(council_id):
    """Load supplier names from insights.json for cross-referencing."""
    insights_path = DATA_DIR / council_id / "insights.json"
    if not insights_path.exists():
        return []

    try:
        with open(insights_path) as f:
            insights = json.load(f)
        suppliers = insights.get("supplier_analysis", {}).get("top_20_suppliers", [])
        return [s["supplier"] for s in suppliers if s.get("supplier")]
    except Exception:
        return []


def process_council(council_id):
    """Process all councillors for a given council."""
    councillors_path = DATA_DIR / council_id / "councillors.json"
    if not councillors_path.exists():
        print(f"[SKIP] No councillors.json for {council_id}")
        return None

    print(f"\n{'='*60}")
    print(f"Processing: {council_id}")
    print(f"{'='*60}")

    with open(councillors_path) as f:
        councillors = json.load(f)

    # Handle both list and dict formats
    if isinstance(councillors, dict):
        councillors = councillors.get("councillors", [])

    print(f"  {len(councillors)} councillors to check")

    # Load supplier names for cross-referencing
    supplier_names = load_supplier_names(council_id)
    print(f"  {len(supplier_names)} suppliers loaded for cross-reference")

    results = {
        "council_id": council_id,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "total_councillors": len(councillors),
        "councillors_checked": 0,
        "summary": {
            "total_directorships_found": 0,
            "active_directorships": 0,
            "disqualification_matches": 0,
            "supplier_conflicts": 0,
            "red_flags_total": 0,
            "risk_distribution": {"low": 0, "medium": 0, "elevated": 0, "high": 0},
            "network_investigations_advisable": 0,
            "network_investigation_high_priority": 0
        },
        "councillors": []
    }

    for councillor in councillors:
        try:
            result = process_councillor(councillor, supplier_names)
            if result:
                results["councillors"].append(result)
                results["councillors_checked"] += 1

                # Update summary
                ch = result["companies_house"]
                results["summary"]["total_directorships_found"] += ch["total_directorships"]
                results["summary"]["active_directorships"] += ch["active_directorships"]
                results["summary"]["disqualification_matches"] += len(result["disqualification_check"]["matches"])
                results["summary"]["supplier_conflicts"] += len(result["supplier_conflicts"])
                results["summary"]["red_flags_total"] += len(result["red_flags"])

                risk = result.get("risk_level", "low")
                if risk in results["summary"]["risk_distribution"]:
                    results["summary"]["risk_distribution"][risk] += 1

                # Track network investigation flags
                ni = result.get("network_investigation", {})
                if ni.get("advisable"):
                    results["summary"]["network_investigations_advisable"] += 1
                if ni.get("priority") == "high":
                    results["summary"]["network_investigation_high_priority"] += 1

                # Progress
                flags_str = f" [{len(result['red_flags'])} flags]" if result['red_flags'] else ""
                print(f"    ✓ {result['name']} — {ch['active_directorships']} active, "
                      f"{ch['resigned_directorships']} resigned{flags_str}")
        except Exception as e:
            print(f"    ✗ Error processing {councillor.get('name', '?')}: {e}")

    # Save results
    output_path = DATA_DIR / council_id / "integrity.json"
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n  Saved: {output_path}")
    print(f"  Checked: {results['councillors_checked']}/{len(councillors)}")
    print(f"  Directorships: {results['summary']['total_directorships_found']} "
          f"({results['summary']['active_directorships']} active)")
    print(f"  Red flags: {results['summary']['red_flags_total']}")
    print(f"  Supplier conflicts: {results['summary']['supplier_conflicts']}")

    return results


def generate_stub(council_id):
    """Generate a stub integrity.json for councils that haven't been scanned yet."""
    councillors_path = DATA_DIR / council_id / "councillors.json"
    if not councillors_path.exists():
        return

    with open(councillors_path) as f:
        councillors = json.load(f)
    if isinstance(councillors, dict):
        councillors = councillors.get("councillors", [])

    stub = {
        "council_id": council_id,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "total_councillors": len(councillors),
        "councillors_checked": 0,
        "scan_status": "pending",
        "summary": {
            "total_directorships_found": 0,
            "active_directorships": 0,
            "disqualification_matches": 0,
            "supplier_conflicts": 0,
            "red_flags_total": 0,
            "risk_distribution": {"low": 0, "medium": 0, "elevated": 0, "high": 0}
        },
        "councillors": [
            {
                "councillor_id": c.get("id", ""),
                "name": c.get("name", ""),
                "party": c.get("party", ""),
                "ward": c.get("ward", ""),
                "checked_at": None,
                "companies_house": {
                    "officer_matches": [],
                    "total_directorships": 0,
                    "active_directorships": 0,
                    "resigned_directorships": 0,
                    "companies": []
                },
                "disqualification_check": {"searched": False, "matches": []},
                "supplier_conflicts": [],
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
    print(f"  Stub created: {output_path} ({len(councillors)} councillors)")


def main():
    parser = argparse.ArgumentParser(description="Councillor Integrity ETL — Companies House Cross-Reference")
    parser.add_argument("--council", help="Council ID to process (e.g., burnley)")
    parser.add_argument("--all", action="store_true", help="Process all 15 councils")
    parser.add_argument("--stubs-only", action="store_true", help="Generate stub files only (no API calls)")
    parser.add_argument("--ch-key", help="Companies House API key (overrides env var)")
    args = parser.parse_args()

    if args.ch_key:
        global CH_KEY
        CH_KEY = args.ch_key

    if args.stubs_only:
        print("Generating stub integrity.json files for all councils...")
        for council_id in ALL_COUNCILS:
            generate_stub(council_id)
        print("Done.")
        return

    if args.all:
        for council_id in ALL_COUNCILS:
            process_council(council_id)
    elif args.council:
        if args.council not in ALL_COUNCILS:
            print(f"Unknown council: {args.council}")
            print(f"Available: {', '.join(ALL_COUNCILS)}")
            sys.exit(1)
        process_council(args.council)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
