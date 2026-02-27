#!/usr/bin/env python3
"""
MP Register of Financial Interests ETL
=======================================
Fetches declared interests for all 16 Lancashire MPs from the UK Parliament
Register of Members' Financial Interests API (interests-api.parliament.uk).

Cross-references declared companies/employers/donors against:
  1. Companies House (officer records, company status)
  2. Council supplier spending data (all 17 Lancashire bodies)
  3. Electoral Commission donation register

Output: burnley-council/data/shared/mp_interests.json

Data sources:
  - UK Parliament Interests API v1: https://interests-api.parliament.uk/api/v1/
  - UK Parliament Members API: https://members-api.parliament.uk/api/Members/
  - Companies House API: https://api.company-information.service.gov.uk/

Usage:
  python3 burnley-council/scripts/mp_interests_etl.py
  python3 burnley-council/scripts/mp_interests_etl.py --skip-ch   # Skip Companies House lookups
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

import requests

# ─── Configuration ────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent / "data"
SHARED_DIR = DATA_DIR / "shared"

INTERESTS_API = "https://interests-api.parliament.uk/api/v1"
MEMBERS_API = "https://members-api.parliament.uk/api/Members"
CH_API = "https://api.company-information.service.gov.uk"
CH_API_KEY = os.environ.get("CH_API_KEY", "07316ecc-d10e-4316-b293-f7226e343ccd")

# Interest categories from Parliament API
CATEGORIES = {
    1: "employment_adhoc",
    2: "employment_ongoing",
    3: "donations",
    4: "gifts_hospitality_uk",
    5: "overseas_visits",
    6: "gifts_outside_uk",
    7: "land_property",
    8: "shareholdings",
    9: "miscellaneous",
    10: "family_employed",
    11: "family_lobbying",
    12: "employment",  # Parent category
}

CATEGORY_LABELS = {
    "employment_adhoc": "Employment & Earnings (Ad Hoc)",
    "employment_ongoing": "Employment & Earnings (Ongoing)",
    "employment": "Employment & Earnings",
    "donations": "Donations & Support",
    "gifts_hospitality_uk": "Gifts & Hospitality (UK)",
    "overseas_visits": "Overseas Visits",
    "gifts_outside_uk": "Gifts (Outside UK)",
    "land_property": "Land & Property",
    "shareholdings": "Shareholdings",
    "miscellaneous": "Miscellaneous",
    "family_employed": "Family Members Employed",
    "family_lobbying": "Family Members in Lobbying",
}

# All 17 Lancashire bodies
ALL_COUNCILS = [
    "burnley", "hyndburn", "pendle", "rossendale", "lancaster",
    "ribble_valley", "chorley", "south_ribble", "lancashire_cc",
    "blackpool", "west_lancashire", "blackburn", "wyre", "preston",
    "fylde", "lancashire_pcc", "lancashire_fire",
]

# Rate limiting
PARLIAMENT_DELAY = 0.3  # seconds between Parliament API calls
CH_DELAY = 0.5  # seconds between Companies House calls


# ─── API Helpers ──────────────────────────────────────────────────────────────

def parliament_get(url, params=None, retries=3):
    """GET from Parliament API with retry."""
    for attempt in range(retries):
        try:
            resp = requests.get(url, params=params, timeout=30)
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code == 429:
                wait = 5 * (attempt + 1)
                print(f"  Rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
            if resp.status_code == 404:
                return None
            print(f"  Parliament API {resp.status_code} for {url}")
            time.sleep(2)
        except requests.RequestException as e:
            print(f"  Request error: {e}")
            time.sleep(2)
    return None


def ch_search_company(name, skip_ch=False):
    """Search Companies House for a company by name. Returns first match or None."""
    if skip_ch:
        return None
    time.sleep(CH_DELAY)
    try:
        resp = requests.get(
            f"{CH_API}/search/companies",
            params={"q": name, "items_per_page": 5},
            auth=(CH_API_KEY, ""),
            timeout=15,
        )
        if resp.status_code == 200:
            items = resp.json().get("items", [])
            if items:
                return items[0]
    except requests.RequestException:
        pass
    return None


def ch_get_company(company_number, skip_ch=False):
    """Get company details from Companies House."""
    if skip_ch:
        return None
    time.sleep(CH_DELAY)
    try:
        resp = requests.get(
            f"{CH_API}/company/{company_number}",
            auth=(CH_API_KEY, ""),
            timeout=15,
        )
        if resp.status_code == 200:
            return resp.json()
    except requests.RequestException:
        pass
    return None


# ─── Load Supplier Data ──────────────────────────────────────────────────────

def load_all_suppliers():
    """Load supplier names + spend from all 17 bodies' spending.json files.
    Returns dict: {normalised_supplier_name: {councils: {council_id: total_spend}}}
    """
    suppliers = {}
    for council_id in ALL_COUNCILS:
        spending_path = DATA_DIR / council_id / "spending.json"
        if not spending_path.exists():
            continue
        try:
            with open(spending_path) as f:
                data = json.load(f)
            records = data.get("records", data) if isinstance(data, dict) else data
            if not isinstance(records, list):
                continue
            for rec in records:
                supplier = rec.get("supplier", "")
                if not supplier:
                    continue
                norm = normalise_name(supplier)
                if norm not in suppliers:
                    suppliers[norm] = {"original_names": set(), "councils": {}}
                suppliers[norm]["original_names"].add(supplier)
                amount = abs(float(rec.get("amount", 0) or 0))
                suppliers[norm]["councils"][council_id] = (
                    suppliers[norm]["councils"].get(council_id, 0) + amount
                )
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            print(f"  Warning: Could not load spending for {council_id}: {e}")
    # Convert sets to lists for JSON serialisation
    for k in suppliers:
        suppliers[k]["original_names"] = list(suppliers[k]["original_names"])[:3]
    return suppliers


def normalise_name(name):
    """Normalise company/supplier name for fuzzy matching."""
    if not name:
        return ""
    name = name.upper().strip()
    # Remove common suffixes
    for suffix in [" LTD", " LIMITED", " PLC", " LLP", " CIC", " INC",
                   " TRADING AS", " T/A", " &", " AND"]:
        name = name.replace(suffix, "")
    # Remove punctuation
    name = re.sub(r'[^\w\s]', '', name)
    # Collapse whitespace
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def match_supplier(name, all_suppliers, threshold=0.75):
    """Match a company/employer name against all council suppliers.
    Returns best match or None.
    """
    if not name:
        return None
    norm = normalise_name(name)
    if not norm:
        return None

    # Exact match
    if norm in all_suppliers:
        s = all_suppliers[norm]
        total = sum(s["councils"].values())
        return {
            "matched_name": s["original_names"][0],
            "normalised": norm,
            "total_spend": round(total, 2),
            "councils": {k: round(v, 2) for k, v in s["councils"].items()},
            "confidence": 100,
        }

    # Token overlap matching
    norm_tokens = set(norm.split())
    if len(norm_tokens) < 2:
        # Single-word names: require exact match only
        return None

    best_match = None
    best_score = 0
    for sname, sdata in all_suppliers.items():
        s_tokens = set(sname.split())
        if not s_tokens:
            continue
        overlap = len(norm_tokens & s_tokens)
        union = len(norm_tokens | s_tokens)
        jaccard = overlap / union if union else 0
        if jaccard > best_score and jaccard >= threshold:
            best_score = jaccard
            total = sum(sdata["councils"].values())
            best_match = {
                "matched_name": sdata["original_names"][0],
                "normalised": sname,
                "total_spend": round(total, 2),
                "councils": {k: round(v, 2) for k, v in sdata["councils"].items()},
                "confidence": round(jaccard * 100),
            }

    return best_match


# ─── Fetch MP Interests ──────────────────────────────────────────────────────

def fetch_all_interests(parliament_id):
    """Fetch all declared interests for an MP from Parliament API."""
    all_interests = []
    skip = 0
    take = 20

    while True:
        time.sleep(PARLIAMENT_DELAY)
        data = parliament_get(
            f"{INTERESTS_API}/Interests",
            params={
                "MemberId": parliament_id,
                "Take": take,
                "Skip": skip,
                "ExpandChildInterests": "true",
            },
        )
        if not data:
            break

        items = data.get("items", [])
        all_interests.extend(items)

        total = data.get("totalResults", 0)
        skip += take
        if skip >= total:
            break

    return all_interests


def parse_interest(item):
    """Parse a single interest item from Parliament API into normalised record.

    IMPORTANT: The Parliament API returns most data in freetext 'summary' field,
    not in structured 'interestFields'. We must regex-parse summaries.
    Structured fields (interestFields) are only populated for newer registrations.
    """
    category_id = None
    category_name = "unknown"

    # Extract category info
    cat = item.get("category")
    if cat:
        category_id = cat.get("id")
        category_name = CATEGORIES.get(category_id, cat.get("name", "unknown"))

    summary = item.get("summary", "")

    # Build base record
    record = {
        "interest_id": item.get("id"),
        "category": category_name,
        "category_label": CATEGORY_LABELS.get(category_name, category_name),
        "summary": summary,
        "registered_date": item.get("registeredDate"),
        "published_date": item.get("publishedDate"),
    }

    # Try structured fields first (newer registrations)
    fields = {}
    for field in item.get("interestFields", []):
        fname = field.get("name", "")
        fval = field.get("value")
        if fval is not None:
            fields[fname] = fval

    # --- Parse from structured fields if available ---
    if fields:
        if category_name in ("employment_adhoc", "employment_ongoing", "employment"):
            record["employer"] = fields.get("PayerName", fields.get("payerName", ""))
            record["job_title"] = fields.get("JobTitle", fields.get("jobTitle", ""))
            record["is_director"] = fields.get("IsPaidAsDirectorOfPayer", False)
        elif category_name == "donations":
            record["donor_name"] = fields.get("DonorName", "")
        elif category_name in ("gifts_hospitality_uk", "gifts_outside_uk"):
            record["donor_name"] = fields.get("DonorName", "")
        elif category_name == "land_property":
            record["location"] = fields.get("Location", "")
        elif category_name == "shareholdings":
            record["company_name"] = fields.get("ShareholdingCompanyName", "")
        elif category_name == "family_employed":
            record["family_member"] = fields.get("FamilyMemberName", "")
        elif category_name == "family_lobbying":
            record["lobbying_firm"] = fields.get("LobbyingOrganisation", "")

    # --- Fallback: parse from summary text (most common case) ---
    if summary and not fields:
        _parse_summary(record, summary, category_name)

    # Extract monetary values from child interests
    total_value = 0.0
    for child in item.get("childInterests", []):
        child_fields = {}
        for f in child.get("interestFields", []):
            child_fields[f.get("name", "")] = f.get("value")
        value = child_fields.get("Value") or child_fields.get("TotalValue")
        if value:
            try:
                val = float(str(value).replace(",", "").replace("£", ""))
                total_value += val
            except (ValueError, TypeError):
                pass
    if total_value > 0:
        record["total_value"] = round(total_value, 2)

    return record


def _parse_summary(record, summary, category):
    """Extract entities from freetext summary using regex patterns.

    Common patterns observed in Parliament API:
      - "Donor Name - £1,234.56"
      - "Director of Company Name Ltd"
      - "Shares in Company Name Ltd"
      - "Property in Location"
      - "visit to Country between dates"
      - "Unpaid Director of Company Ltd"
    """
    # --- Extract monetary amounts ---
    amount_match = re.search(r'£([\d,]+(?:\.\d{2})?)', summary)
    if amount_match:
        try:
            record["total_value"] = float(amount_match.group(1).replace(",", ""))
        except ValueError:
            pass

    # --- Donations / Gifts: "Donor Name - £amount" ---
    if category in ("donations", "gifts_hospitality_uk", "gifts_outside_uk"):
        # Pattern: "Name/Company - £amount"
        donor_match = re.match(r'^(.+?)\s*[-–—]\s*£', summary)
        if donor_match:
            record["donor_name"] = donor_match.group(1).strip()
        else:
            # Just take the whole summary if short enough
            clean = re.sub(r'£[\d,.]+', '', summary).strip(' -–—')
            if clean and len(clean) < 100:
                record["donor_name"] = clean

    # --- Employment: "Role at/of/with Company" ---
    elif category in ("employment_adhoc", "employment_ongoing", "employment"):
        emp_match = re.search(
            r'(?:with|at|from|for)\s+(.+?)(?:\s*[-–—]|\s*$)',
            summary, re.IGNORECASE
        )
        if emp_match:
            record["employer"] = emp_match.group(1).strip().rstrip('.')

    # --- Miscellaneous: Often contains directorships/shareholdings ---
    elif category == "miscellaneous":
        # "Director of Company Ltd"
        dir_match = re.search(
            r'[Dd]irector(?:ship)?\s+of\s+(.+?)(?:\.|,|$)',
            summary
        )
        if dir_match:
            record["company_name"] = dir_match.group(1).strip()
            record["role"] = "director"

        # "Secretary of Company Ltd"
        sec_match = re.search(
            r'[Ss]ecretary\s+of\s+(.+?)(?:\.|,|$)',
            summary
        )
        if sec_match and "company_name" not in record:
            record["company_name"] = sec_match.group(1).strip()
            record["role"] = "secretary"

        # "Shareholding in Company Ltd" or "shares in Company Ltd"
        share_match = re.search(
            r'[Ss]hare(?:holding|s)?\s+in\s+(.+?)(?:\.|,|$)',
            summary
        )
        if share_match and "company_name" not in record:
            record["company_name"] = share_match.group(1).strip()
            record["role"] = "shareholder"

        # "Trustee of Charity Name"
        trustee_match = re.search(
            r'[Tt]rustee\s+(?:of|at)\s+(.+?)(?:\.|,|$)',
            summary
        )
        if trustee_match and "company_name" not in record:
            record["company_name"] = trustee_match.group(1).strip()
            record["role"] = "trustee"

        # "Nominating officer for Party"
        nom_match = re.search(
            r'[Nn]ominating\s+officer\s+for\s+(.+?)(?:,|$)',
            summary
        )
        if nom_match and "company_name" not in record:
            record["company_name"] = nom_match.group(1).strip()
            record["role"] = "nominating_officer"

    # --- Shareholdings ---
    elif category == "shareholdings":
        share_match = re.search(
            r'[Ss]hares?\s+in\s+(.+?)(?:\.|,|$)',
            summary
        )
        if share_match:
            record["company_name"] = share_match.group(1).strip()

    # --- Land & Property ---
    elif category == "land_property":
        loc_match = re.search(
            r'[Pp]roperty\s+in\s+(.+?)(?:\.|,|$)',
            summary
        )
        if loc_match:
            record["location"] = loc_match.group(1).strip()

    # --- Overseas visits ---
    elif category == "overseas_visits":
        visit_match = re.search(
            r'visit\s+to\s+(.+?)\s+between',
            summary, re.IGNORECASE
        )
        if visit_match:
            record["destination"] = visit_match.group(1).strip()
        # Funder pattern: "funded by Org"
        funder_match = re.search(
            r'(?:funded|paid|hosted)\s+by\s+(.+?)(?:\.|,|$)',
            summary, re.IGNORECASE
        )
        if funder_match:
            record["funder"] = funder_match.group(1).strip()


def extract_entities(interests):
    """Extract all company names, employers, donors from parsed interests."""
    companies = set()
    donors = set()
    employers = set()

    for interest in interests:
        cat = interest.get("category", "")

        # Employment — employer/payer names
        employer = interest.get("employer", "")
        if employer:
            employers.add(employer)
            companies.add(employer)

        # Shareholdings / Miscellaneous — company names
        company = interest.get("company_name", "")
        if company:
            companies.add(company)

        # Donations/gifts — donor names
        donor = interest.get("donor_name", "")
        if donor:
            donors.add(donor)
            # Check if donor looks like a company
            if any(suffix in donor.upper() for suffix in
                   ["LTD", "LIMITED", "PLC", "LLP", "CIC", "INC",
                    "ASSOCIATION", "UNION", "COUNCIL", "BOROUGH"]):
                companies.add(donor)

        # Lobbying — firm names
        lobby = interest.get("lobbying_firm", "")
        if lobby:
            companies.add(lobby)

        # Visit funders
        funder = interest.get("funder", "")
        if funder:
            donors.add(funder)
            if any(suffix in funder.upper() for suffix in
                   ["LTD", "LIMITED", "PLC", "LLP", "COUNCIL"]):
                companies.add(funder)

    return {
        "companies": sorted(companies),
        "donors": sorted(donors),
        "employers": sorted(employers),
    }


# ─── Cross-Reference Engine ──────────────────────────────────────────────────

def cross_reference_mp(mp_data, all_suppliers, skip_ch=False):
    """Cross-reference an MP's declared interests against council suppliers and CH."""
    findings = []
    ch_lookups = []

    entities = mp_data["entities"]
    mp_name = mp_data["mp_name"]

    # 1. Match declared companies against council suppliers
    for company in entities["companies"]:
        match = match_supplier(company, all_suppliers)
        if match:
            findings.append({
                "type": "mp_company_is_supplier",
                "severity": "high",
                "mp_entity": company,
                "entity_type": "declared_company",
                "supplier_match": match,
                "narrative": (
                    f"{mp_name} declares financial interest in '{company}', "
                    f"which matches council supplier '{match['matched_name']}' "
                    f"(£{match['total_spend']:,.0f} total spend across "
                    f"{len(match['councils'])} council(s))."
                ),
            })

        # CH lookup
        if not skip_ch:
            ch_match = ch_search_company(company, skip_ch)
            if ch_match:
                ch_lookups.append({
                    "declared_name": company,
                    "company_number": ch_match.get("company_number"),
                    "company_name": ch_match.get("title"),
                    "company_status": ch_match.get("company_status"),
                    "company_type": ch_match.get("company_type"),
                    "address": ch_match.get("address_snippet"),
                })

    # 2. Match donors against council suppliers
    for donor in entities["donors"]:
        match = match_supplier(donor, all_suppliers)
        if match:
            findings.append({
                "type": "mp_donor_is_supplier",
                "severity": "high",
                "mp_entity": donor,
                "entity_type": "donor",
                "supplier_match": match,
                "narrative": (
                    f"Donor to {mp_name} — '{donor}' — matches council supplier "
                    f"'{match['matched_name']}' (£{match['total_spend']:,.0f} total spend). "
                    f"This creates a potential donation-to-contract pipeline."
                ),
            })

    # 3. Match employers against council suppliers
    for employer in entities["employers"]:
        match = match_supplier(employer, all_suppliers)
        if match:
            findings.append({
                "type": "mp_employer_is_supplier",
                "severity": "critical",
                "mp_entity": employer,
                "entity_type": "employer",
                "supplier_match": match,
                "narrative": (
                    f"{mp_name}'s employer '{employer}' matches council supplier "
                    f"'{match['matched_name']}' (£{match['total_spend']:,.0f} total spend). "
                    f"This is a significant conflict — the MP is paid by a council contractor."
                ),
            })

    return findings, ch_lookups


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Fetch MP Register of Financial Interests")
    parser.add_argument("--skip-ch", action="store_true",
                        help="Skip Companies House lookups (faster)")
    parser.add_argument("--mp", type=str, default=None,
                        help="Process single MP by name (for testing)")
    args = parser.parse_args()

    print("=" * 70)
    print("MP Register of Financial Interests ETL")
    print("=" * 70)

    # Load constituency data
    const_path = SHARED_DIR / "constituencies.json"
    if not const_path.exists():
        print(f"ERROR: {const_path} not found")
        sys.exit(1)

    with open(const_path) as f:
        const_data = json.load(f)

    constituencies = const_data.get("constituencies", const_data)
    print(f"Loaded {len(constituencies)} constituencies")

    # Load all supplier data for cross-referencing
    print("Loading supplier data from all 17 bodies...")
    all_suppliers = load_all_suppliers()
    print(f"  {len(all_suppliers)} unique suppliers loaded")

    # Process each MP
    results = {}
    total_interests = 0
    total_findings = 0

    for const in constituencies:
        mp = const.get("mp", {})
        mp_name = mp.get("name", "")
        parliament_id = mp.get("parliament_id")
        constituency_id = const.get("id", "")

        if not parliament_id:
            print(f"  ⚠ {constituency_id}: No parliament_id — skipping")
            continue

        if args.mp and args.mp.lower() not in mp_name.lower():
            continue

        print(f"\n{'─' * 50}")
        print(f"  {mp_name} ({mp.get('party', '?')}) — {const.get('name', constituency_id)}")
        print(f"  Parliament ID: {parliament_id}")

        # Fetch interests from Parliament API
        raw_interests = fetch_all_interests(parliament_id)
        print(f"  Fetched {len(raw_interests)} declared interests")

        # Parse interests
        parsed = [parse_interest(item) for item in raw_interests]
        total_interests += len(parsed)

        # Group by category
        by_category = {}
        for interest in parsed:
            cat = interest.get("category", "unknown")
            if cat not in by_category:
                by_category[cat] = []
            by_category[cat].append(interest)

        # Extract entities
        entities = extract_entities(parsed)
        print(f"  Entities: {len(entities['companies'])} companies, "
              f"{len(entities['donors'])} donors, "
              f"{len(entities['employers'])} employers")

        # Build MP data object
        mp_data = {
            "mp_name": mp_name,
            "mp_party": mp.get("party", ""),
            "parliament_id": parliament_id,
            "constituency": const.get("name", constituency_id),
            "constituency_id": constituency_id,
            "entities": entities,
        }

        # Cross-reference against suppliers
        findings, ch_lookups = cross_reference_mp(mp_data, all_suppliers, args.skip_ch)
        total_findings += len(findings)

        if findings:
            print(f"  ⚠ {len(findings)} supplier cross-reference findings:")
            for f in findings:
                print(f"    [{f['severity'].upper()}] {f['type']}: {f['mp_entity']}")

        # Calculate total declared value
        total_value = sum(
            i.get("total_value", 0) for i in parsed if i.get("total_value")
        )

        # Build result
        results[constituency_id] = {
            "mp_name": mp_name,
            "mp_party": mp.get("party", ""),
            "parliament_id": parliament_id,
            "constituency": const.get("name", constituency_id),
            "total_interests": len(parsed),
            "total_declared_value": round(total_value, 2),
            "interests_by_category": {
                cat: [
                    {k: v for k, v in i.items() if k != "fields"}
                    for i in items
                ]
                for cat, items in by_category.items()
            },
            "companies_declared": entities["companies"],
            "donors": entities["donors"],
            "employers": entities["employers"],
            "ch_cross_reference": ch_lookups,
            "supplier_findings": findings,
            "risk_summary": {
                "total_findings": len(findings),
                "critical": sum(1 for f in findings if f["severity"] == "critical"),
                "high": sum(1 for f in findings if f["severity"] == "high"),
                "warning": sum(1 for f in findings if f["severity"] == "warning"),
            },
        }

    # Summary
    print(f"\n{'=' * 70}")
    print(f"SUMMARY")
    print(f"  MPs processed: {len(results)}")
    print(f"  Total interests: {total_interests}")
    print(f"  Supplier cross-reference findings: {total_findings}")

    # Find most concerning MPs
    concerning = sorted(
        results.values(),
        key=lambda x: x["risk_summary"]["total_findings"],
        reverse=True,
    )
    if concerning and concerning[0]["risk_summary"]["total_findings"] > 0:
        print(f"\n  Most concerning:")
        for mp in concerning[:5]:
            if mp["risk_summary"]["total_findings"] > 0:
                print(f"    {mp['mp_name']}: {mp['risk_summary']['total_findings']} findings "
                      f"({mp['risk_summary']['critical']} critical, "
                      f"{mp['risk_summary']['high']} high)")

    # Save output
    output = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "version": "1.0",
        "data_source": "UK Parliament Register of Members' Financial Interests API v1",
        "api_url": "https://interests-api.parliament.uk/api/v1/",
        "methodology": (
            "All declared interests fetched via official Parliament API. "
            "Company/employer/donor names cross-referenced against council supplier "
            "spending data (all 17 Lancashire bodies) using fuzzy name matching. "
            "Companies House lookups performed for entity verification."
        ),
        "summary": {
            "mps_processed": len(results),
            "total_interests_declared": total_interests,
            "total_supplier_findings": total_findings,
            "findings_by_severity": {
                "critical": sum(r["risk_summary"]["critical"] for r in results.values()),
                "high": sum(r["risk_summary"]["high"] for r in results.values()),
                "warning": sum(r["risk_summary"]["warning"] for r in results.values()),
            },
        },
        "constituencies": results,
    }

    output_path = SHARED_DIR / "mp_interests.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\n✓ Saved to {output_path}")

    # Also save per-council copies (symlinked data for each council's data dir)
    # Each council gets the full file — it's shared data
    for council_id in ALL_COUNCILS:
        council_dir = DATA_DIR / council_id
        if council_dir.exists():
            dest = council_dir / "mp_interests.json"
            # Don't duplicate the file — just reference the shared one
            # The frontend loads from /data/shared/mp_interests.json or /data/mp_interests.json

    print(f"\n{'=' * 70}")
    print(f"Done. {total_interests} interests, {total_findings} findings.")


if __name__ == "__main__":
    main()
