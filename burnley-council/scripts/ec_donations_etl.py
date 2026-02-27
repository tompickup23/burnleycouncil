#!/usr/bin/env python3
"""
Electoral Commission Donations ETL v1 — Bulk Lancashire Political Donations

Downloads ALL EC donation data relevant to Lancashire's political ecosystem
and outputs structured JSON for cross-referencing with council suppliers,
councillor companies, and MP interests.

Data source: EC CSV API (free, no auth)
  https://search.electoralcommission.org.uk/api/csv/Donations

Detection capabilities:
  - Supplier-to-party donation pipelines
  - Donation threshold manipulation (just below £11,180/£2,230/£500)
  - Temporal donation clustering (coordinated donations within 30 days)
  - Unincorporated association opacity (potential foreign money conduit)
  - Councillor company donations (declared vs undeclared)
  - MP regulated donee records

PPERA thresholds (from Jan 2024):
  - £11,180: Central party reporting threshold
  - £2,230: Regulated donee threshold (councillors/MPs)
  - £500: Permissibility floor

Usage:
    python3 ec_donations_etl.py
    python3 ec_donations_etl.py --since 2019-01-01
    python3 ec_donations_etl.py --areas burnley,hyndburn
"""

import argparse
import csv
import io
import json
import os
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

# Global socket timeout to prevent hangs
socket.setdefaulttimeout(30)

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"

EC_CSV_BASE = "https://search.electoralcommission.org.uk/api/csv/Donations"
EC_DELAY = 1.0  # Rate limit delay

# All Lancashire areas for AccountingUnitName matching
LANCASHIRE_AREAS = [
    "Burnley", "Hyndburn", "Pendle", "Rossendale",
    "Lancaster", "Ribble Valley", "Chorley", "South Ribble",
    "Lancashire", "Blackpool", "Blackburn", "West Lancashire",
    "Wyre", "Preston", "Fylde", "Morecambe", "Fleetwood",
    "Darwen", "Clitheroe", "Southport",
]

# PPERA thresholds (from Jan 2024)
THRESHOLD_CENTRAL = 11180
THRESHOLD_DONEE = 2230
THRESHOLD_PERMISSIBILITY = 500
THRESHOLD_PROXIMITY_PCT = 0.05  # 5% below threshold = suspicious

# All 16 Lancashire MPs (2024 Parliament)
LANCASHIRE_MPS = {
    "Oliver Ryan": {"constituency": "Burnley", "party": "Labour"},
    "Sarah Smith": {"constituency": "Hyndburn", "party": "Labour"},
    "Jonathan Hinder": {"constituency": "Pendle and Clitheroe", "party": "Labour"},
    "Andy MacNae": {"constituency": "Rossendale and Darwen", "party": "Labour"},
    "Cat Smith": {"constituency": "Lancaster and Wyre", "party": "Labour"},
    "Lizzi Collinge": {"constituency": "Morecambe and Lunesdale", "party": "Labour"},
    "Maya Ellis": {"constituency": "Ribble Valley", "party": "Labour"},
    "Lindsay Hoyle": {"constituency": "Chorley", "party": "Labour"},
    "Paul Foster": {"constituency": "South Ribble", "party": "Labour"},
    "Mark Hendrick": {"constituency": "Preston", "party": "Labour"},
    "Ashley Dalton": {"constituency": "West Lancashire", "party": "Labour"},
    "Andrew Snowden": {"constituency": "Fylde", "party": "Conservative"},
    "Lorraine Beavers": {"constituency": "Blackpool North and Fleetwood", "party": "Labour"},
    "Chris Webb": {"constituency": "Blackpool South", "party": "Labour"},
    "Adnan Hussain": {"constituency": "Blackburn", "party": "Independent"},
    "Patrick Hurley": {"constituency": "Southport", "party": "Liberal Democrats"},
}

stats = {"requests": 0, "donations_fetched": 0, "errors": 0}


class _Timeout(Exception):
    pass

def _alarm_handler(signum, frame):
    raise _Timeout("Request timed out (alarm)")

def fetch_ec_csv(params, label="EC"):
    """Fetch donations from EC CSV API with pagination support."""
    url = EC_CSV_BASE + "?" + urllib.parse.urlencode(params)
    old_handler = signal.signal(signal.SIGALRM, _alarm_handler)
    signal.alarm(45)  # hard 45-second cutoff
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "AIDOGE-IntegrityETL/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            # EC CSV has BOM
            text = raw.decode("utf-8-sig")
            stats["requests"] += 1
            time.sleep(EC_DELAY)
            return text
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, socket.timeout, OSError, _Timeout) as e:
        print(f"  [WARN] EC CSV fetch failed ({label}): {e}", file=sys.stderr)
        stats["errors"] += 1
        time.sleep(EC_DELAY * 2)
        return None
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)


def parse_ec_csv(csv_text):
    """Parse EC CSV response into list of dicts."""
    if not csv_text:
        return []
    reader = csv.DictReader(io.StringIO(csv_text))
    rows = []
    for row in reader:
        # Parse value (format: "£5,000.00")
        value_str = row.get("Value", "0")
        try:
            value = float(re.sub(r'[£,]', '', value_str))
        except ValueError:
            value = 0
        # Parse date (format: DD/MM/YYYY)
        accepted = row.get("AcceptedDate", "")
        try:
            parsed_date = datetime.strptime(accepted, "%d/%m/%Y").strftime("%Y-%m-%d")
        except ValueError:
            parsed_date = accepted
        received = row.get("ReceivedDate", "")
        try:
            received_parsed = datetime.strptime(received, "%d/%m/%Y").strftime("%Y-%m-%d")
        except ValueError:
            received_parsed = received

        rows.append({
            "ec_ref": row.get("ECRef", ""),
            "regulated_entity": row.get("RegulatedEntityName", ""),
            "regulated_entity_type": row.get("RegulatedEntityType", ""),
            "value": value,
            "accepted_date": parsed_date,
            "received_date": received_parsed,
            "accounting_unit": row.get("AccountingUnitName", ""),
            "donor_name": row.get("DonorName", "").strip(),
            "donor_status": row.get("DonorStatus", ""),
            "company_number": (row.get("CompanyRegistrationNumber") or "").strip().rstrip(" ?"),
            "postcode": row.get("Postcode", ""),
            "donation_type": row.get("DonationType", ""),
            "nature": row.get("NatureOfDonation", ""),
            "is_sponsorship": row.get("IsSponsorship", "False") == "True",
            "is_pre_poll": row.get("IsReportedPrePoll", "False") == "True",
            "is_aggregation": row.get("IsAggregation", "False") == "True",
            "is_bequest": row.get("IsBequest", "False") == "True",
            "reporting_period": row.get("ReportingPeriodName", ""),
            "register_name": row.get("RegisterName", ""),
            "donor_id": row.get("DonorId", ""),
            "is_irish_source": row.get("IsIrishSource", "False") == "True",
        })
    return rows


def fetch_area_donations(area, since="2010-01-01"):
    """Fetch all donations for a Lancashire area/AccountingUnit."""
    all_rows = []
    start = 0
    page_size = 500
    while True:
        params = {
            "query": area,
            "start": start,
            "rows": page_size,
            "sort": "AcceptedDate",
            "order": "desc",
        }
        if since:
            params["from"] = since
        csv_text = fetch_ec_csv(params, label=f"area:{area}")
        if not csv_text:
            break
        rows = parse_ec_csv(csv_text)
        if not rows:
            break
        # Filter to relevant accounting units (EC search is full-text, returns false positives)
        area_lower = area.lower()
        filtered = []
        for row in rows:
            au = (row["accounting_unit"] or "").lower()
            dn = (row["donor_name"] or "").lower()
            re_name = (row["regulated_entity"] or "").lower()
            # Accept if area appears in accounting unit, donor name, or entity name
            if area_lower in au or area_lower in dn or area_lower in re_name:
                filtered.append(row)
        all_rows.extend(filtered)
        if len(rows) < page_size:
            break
        start += page_size
    return all_rows


def fetch_mp_donations(mp_name, since="2019-01-01"):
    """Fetch donations where MP appears as regulated donee."""
    # Search for MP as regulated entity (they receive donations directly)
    params = {
        "query": mp_name,
        "start": 0,
        "rows": 200,
        "sort": "AcceptedDate",
        "order": "desc",
    }
    if since:
        params["from"] = since
    csv_text = fetch_ec_csv(params, label=f"mp:{mp_name}")
    if not csv_text:
        return []
    rows = parse_ec_csv(csv_text)
    # Filter for actual MP matches (not false positives)
    parts = mp_name.lower().split()
    filtered = []
    for row in rows:
        re_name = (row["regulated_entity"] or "").lower()
        dn = (row["donor_name"] or "").lower()
        au = (row["accounting_unit"] or "").lower()
        # MP should appear as regulated entity or in accounting unit
        name_matches = all(p in re_name or p in au for p in parts if len(p) > 2)
        if name_matches:
            filtered.append(row)
    return filtered


def fetch_supplier_donations(suppliers, since="2015-01-01"):
    """Cross-match council suppliers against EC donation records."""
    findings = []
    seen_refs = set()
    for supplier_entry in suppliers:
        supplier_name = supplier_entry["name"] if isinstance(supplier_entry, dict) else str(supplier_entry)
        if not supplier_name or len(supplier_name) < 4:
            continue
        # Skip common terms that return too many false positives
        skip_terms = ["council", "ltd", "limited", "the", "services", "group"]
        if supplier_name.lower().strip() in skip_terms:
            continue
        params = {
            "query": supplier_name,
            "start": 0,
            "rows": 50,
            "sort": "Value",
            "order": "desc",
        }
        if since:
            params["from"] = since
        csv_text = fetch_ec_csv(params, label=f"supplier:{supplier_name[:30]}")
        if not csv_text:
            continue
        rows = parse_ec_csv(csv_text)
        for row in rows:
            if row["ec_ref"] in seen_refs:
                continue
            # Verify name match (EC search is full-text)
            dn = (row["donor_name"] or "").upper().strip()
            sn = supplier_name.upper().strip()
            # Word overlap check
            stop_words = {"LTD", "LIMITED", "PLC", "LLP", "THE", "AND", "&", "OF", "UK", "GROUP"}
            s_words = set(sn.split()) - stop_words
            d_words = set(dn.split()) - stop_words
            if s_words and d_words:
                overlap = len(s_words & d_words) / max(len(s_words), len(d_words))
            else:
                overlap = 0
            if sn in dn or dn in sn or overlap >= 0.6:
                row["matched_supplier"] = supplier_name
                row["council_spend"] = supplier_entry.get("total_spend", 0) if isinstance(supplier_entry, dict) else 0
                row["councils"] = supplier_entry.get("councils", []) if isinstance(supplier_entry, dict) else []
                findings.append(row)
                seen_refs.add(row["ec_ref"])
    return findings


def detect_threshold_proximity(donations):
    """Find donations suspiciously close to PPERA thresholds."""
    findings = []
    thresholds = [
        (THRESHOLD_CENTRAL, "central_party", THRESHOLD_PROXIMITY_PCT),
        (THRESHOLD_DONEE, "regulated_donee", THRESHOLD_PROXIMITY_PCT),
        (THRESHOLD_PERMISSIBILITY, "permissibility_floor", THRESHOLD_PROXIMITY_PCT),
    ]
    for don in donations:
        val = don.get("value", 0)
        if val <= 0:
            continue
        for threshold, name, pct in thresholds:
            lower = threshold * (1 - pct)
            if lower <= val < threshold:
                findings.append({
                    **don,
                    "threshold_type": name,
                    "threshold_value": threshold,
                    "below_by": threshold - val,
                    "below_pct": round((threshold - val) / threshold * 100, 2),
                })
    return findings


def detect_temporal_clusters(donations, window_days=30, min_cluster=3):
    """Find temporal clusters of donations to same entity from different donors."""
    # Group by regulated entity + accounting unit
    entity_groups = defaultdict(list)
    for don in donations:
        key = (don.get("regulated_entity", ""), don.get("accounting_unit", ""))
        entity_groups[key].append(don)

    clusters = []
    for (entity, unit), dons in entity_groups.items():
        if len(dons) < min_cluster:
            continue
        # Sort by date
        dated = []
        for d in dons:
            try:
                dt = datetime.strptime(d["accepted_date"], "%Y-%m-%d")
                dated.append((dt, d))
            except (ValueError, KeyError):
                continue
        dated.sort(key=lambda x: x[0])

        # Sliding window
        for i in range(len(dated)):
            window = [dated[i]]
            for j in range(i + 1, len(dated)):
                if (dated[j][0] - dated[i][0]).days <= window_days:
                    window.append(dated[j])
                else:
                    break
            if len(window) >= min_cluster:
                # Check if donors are different (coordinated from multiple sources)
                unique_donors = set(w[1].get("donor_name", "") for w in window)
                if len(unique_donors) >= min_cluster:
                    total_value = sum(w[1].get("value", 0) for w in window)
                    clusters.append({
                        "entity": entity,
                        "accounting_unit": unit,
                        "window_start": window[0][0].strftime("%Y-%m-%d"),
                        "window_end": window[-1][0].strftime("%Y-%m-%d"),
                        "donation_count": len(window),
                        "unique_donors": len(unique_donors),
                        "total_value": total_value,
                        "donors": list(unique_donors),
                        "donations": [w[1] for w in window],
                    })
    # Deduplicate overlapping clusters
    seen = set()
    unique_clusters = []
    for c in clusters:
        key = (c["entity"], c["window_start"])
        if key not in seen:
            seen.add(key)
            unique_clusters.append(c)
    return unique_clusters


def detect_unincorporated_associations(donations):
    """Flag donations from unincorporated associations (opacity loophole)."""
    ua_donations = []
    for don in donations:
        if don.get("donor_status", "").lower() == "unincorporated association":
            ua_donations.append({
                **don,
                "risk_note": "Unincorporated Associations can accept foreign donations "
                             "and pass them to UK parties — major transparency loophole under PPERA",
            })
    return ua_donations


def load_supplier_data():
    """Load top suppliers from all council spending data for cross-referencing."""
    suppliers = {}
    council_dirs = [d for d in DATA_DIR.iterdir() if d.is_dir() and d.name != "shared"]
    for council_dir in council_dirs:
        council_id = council_dir.name
        spending_file = council_dir / "spending.json"
        if not spending_file.exists():
            continue
        try:
            with open(spending_file) as f:
                data = json.load(f)
            records = data.get("records", data) if isinstance(data, dict) else data
            if not isinstance(records, list):
                continue
            # Aggregate supplier totals
            for rec in records:
                supplier = rec.get("supplier", rec.get("supplier_canonical", ""))
                if not supplier:
                    continue
                supplier_upper = supplier.upper().strip()
                if supplier_upper not in suppliers:
                    suppliers[supplier_upper] = {"name": supplier, "total_spend": 0, "councils": []}
                amount = rec.get("amount", 0)
                if isinstance(amount, (int, float)):
                    suppliers[supplier_upper]["total_spend"] += amount
                if council_id not in suppliers[supplier_upper]["councils"]:
                    suppliers[supplier_upper]["councils"].append(council_id)
        except (json.JSONDecodeError, IOError):
            continue
    # Return top 100 suppliers by spend
    sorted_suppliers = sorted(suppliers.values(), key=lambda x: x["total_spend"], reverse=True)
    return sorted_suppliers[:100]


def load_councillor_companies():
    """Load company numbers linked to councillors from integrity data."""
    companies = {}
    council_dirs = [d for d in DATA_DIR.iterdir() if d.is_dir() and d.name != "shared"]
    for council_dir in council_dirs:
        integrity_file = council_dir / "integrity.json"
        if not integrity_file.exists():
            continue
        try:
            with open(integrity_file) as f:
                data = json.load(f)
            for councillor in data.get("councillors", []):
                ch = councillor.get("companies_house", {})
                for company in ch.get("companies", []):
                    cn = company.get("company_number", "")
                    if cn and cn not in companies:
                        companies[cn] = {
                            "company_number": cn,
                            "company_name": company.get("company_name", ""),
                            "councillor": councillor.get("name", ""),
                            "council": council_dir.name,
                        }
        except (json.JSONDecodeError, IOError):
            continue
    return list(companies.values())


def main():
    parser = argparse.ArgumentParser(description="Electoral Commission Donations ETL for Lancashire")
    parser.add_argument("--since", default="2015-01-01", help="Fetch donations from this date (YYYY-MM-DD)")
    parser.add_argument("--areas", help="Comma-separated areas (default: all Lancashire)")
    parser.add_argument("--skip-suppliers", action="store_true", help="Skip supplier cross-matching")
    parser.add_argument("--skip-mps", action="store_true", help="Skip MP donation search")
    args = parser.parse_args()

    areas = args.areas.split(",") if args.areas else LANCASHIRE_AREAS
    since = args.since

    print(f"═══ EC Donations ETL — Lancashire Political Ecosystem ═══")
    print(f"  Areas: {len(areas)} | Since: {since}")
    print(f"  Source: {EC_CSV_BASE}")
    print()

    # ── 1. Fetch area-level donations ──
    print("── Phase 1: Fetching area-level donations ──")
    all_donations = []
    donations_by_area = defaultdict(list)
    seen_refs = set()

    for area in areas:
        print(f"  Fetching: {area}...", end=" ", flush=True)
        rows = fetch_area_donations(area, since=since)
        new_count = 0
        for row in rows:
            if row["ec_ref"] not in seen_refs:
                seen_refs.add(row["ec_ref"])
                all_donations.append(row)
                donations_by_area[area.lower()].append(row)
                new_count += 1
        print(f"{new_count} donations")

    print(f"  Total unique donations: {len(all_donations)}")
    stats["donations_fetched"] = len(all_donations)

    # ── 2. Fetch MP-specific donations ──
    donations_by_mp = {}
    if not args.skip_mps:
        print("\n── Phase 2: Fetching MP-specific donations ──")
        for mp_name, info in LANCASHIRE_MPS.items():
            print(f"  Fetching: {mp_name} ({info['constituency']})...", end=" ", flush=True)
            rows = fetch_mp_donations(mp_name, since="2019-01-01")
            # Add any new donations to master list
            new_rows = []
            for row in rows:
                if row["ec_ref"] not in seen_refs:
                    seen_refs.add(row["ec_ref"])
                    all_donations.append(row)
                new_rows.append(row)
            donations_by_mp[mp_name] = new_rows
            print(f"{len(new_rows)} donations")

    # ── 3. Cross-match council suppliers ──
    supplier_donations = []
    if not args.skip_suppliers:
        print("\n── Phase 3: Cross-matching council suppliers ──")
        suppliers = load_supplier_data()
        print(f"  Loaded {len(suppliers)} top suppliers across all councils")
        # Only search suppliers with significant spend (>£50K)
        significant = [s for s in suppliers if s["total_spend"] > 50000]
        print(f"  Searching {len(significant)} suppliers (>£50K spend)...")
        supplier_donations = fetch_supplier_donations(significant, since=since)
        print(f"  Found {len(supplier_donations)} supplier-donor matches")
        # Add new donations to master list
        for row in supplier_donations:
            if row["ec_ref"] not in seen_refs:
                seen_refs.add(row["ec_ref"])
                all_donations.append(row)

    # ── 4. Check councillor-linked company donations ──
    print("\n── Phase 4: Checking councillor company donations ──")
    councillor_companies = load_councillor_companies()
    # Limit to first 200 companies to avoid excessive API calls
    max_company_checks = 200
    checked = councillor_companies[:max_company_checks]
    print(f"  Loaded {len(councillor_companies)} councillor-linked companies (checking {len(checked)})")
    councillor_company_donations = []
    for idx, cc in enumerate(checked):
        cn = cc["company_number"]
        # Search by company number if available
        if cn:
            if idx % 50 == 0 and idx > 0:
                print(f"    [{idx}/{len(checked)}] checked, {len(councillor_company_donations)} matches so far", flush=True)
            params = {"query": cn, "start": 0, "rows": 50, "sort": "Value", "order": "desc"}
            if since:
                params["from"] = since
            csv_text = fetch_ec_csv(params, label=f"co:{cn}")
            if csv_text:
                rows = parse_ec_csv(csv_text)
                for row in rows:
                    # Verify company number match
                    row_cn = (row.get("company_number") or "").strip()
                    if row_cn == cn:
                        row["linked_councillor"] = cc["councillor"]
                        row["linked_council"] = cc["council"]
                        row["linked_company_name"] = cc["company_name"]
                        councillor_company_donations.append(row)
                        if row["ec_ref"] not in seen_refs:
                            seen_refs.add(row["ec_ref"])
                            all_donations.append(row)
    print(f"  Found {len(councillor_company_donations)} councillor-company donations")

    # ── 5. Detection algorithms ──
    print("\n── Phase 5: Running detection algorithms ──")

    # 5a: Threshold manipulation
    threshold_findings = detect_threshold_proximity(all_donations)
    print(f"  Threshold proximity: {len(threshold_findings)} suspicious donations")

    # 5b: Temporal clustering
    temporal_clusters = detect_temporal_clusters(all_donations)
    print(f"  Temporal clusters: {len(temporal_clusters)} clusters detected")

    # 5c: Unincorporated associations
    ua_donations = detect_unincorporated_associations(all_donations)
    print(f"  Unincorporated associations: {len(ua_donations)} donations")

    # ── 6. Build cross-reference summary ──
    total_value = sum(d.get("value", 0) for d in all_donations)
    party_totals = defaultdict(float)
    for d in all_donations:
        party_totals[d.get("regulated_entity", "Unknown")] += d.get("value", 0)

    # Donors who are both council suppliers and political donors
    supplier_donor_names = set()
    for sd in supplier_donations:
        supplier_donor_names.add(sd.get("donor_name", "").upper())

    summary = {
        "total_donations": len(all_donations),
        "total_value": round(total_value, 2),
        "unique_donors": len(set(d.get("donor_name", "") for d in all_donations)),
        "suppliers_who_donate": len(supplier_donor_names),
        "councillor_companies_who_donate": len(councillor_company_donations),
        "threshold_proximity_count": len(threshold_findings),
        "temporal_cluster_count": len(temporal_clusters),
        "unincorporated_association_count": len(ua_donations),
        "party_totals": {k: round(v, 2) for k, v in sorted(party_totals.items(), key=lambda x: -x[1])},
    }

    # ── 7. Output ──
    output = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "version": "1.0",
        "data_source": "Electoral Commission CSV API",
        "api_url": EC_CSV_BASE,
        "date_range": {"from": since, "to": datetime.utcnow().strftime("%Y-%m-%d")},
        "summary": summary,
        "donations_by_area": {k: v for k, v in donations_by_area.items()},
        "donations_by_mp": donations_by_mp,
        "supplier_donations": supplier_donations,
        "councillor_company_donations": councillor_company_donations,
        "threshold_proximity": threshold_findings,
        "temporal_clusters": temporal_clusters,
        "unincorporated_associations": ua_donations,
        "stats": stats,
    }

    output_path = DATA_DIR / "shared" / "ec_donations.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2, default=str)

    print(f"\n═══ EC Donations ETL Complete ═══")
    print(f"  Output: {output_path}")
    print(f"  Total donations: {len(all_donations)}")
    print(f"  Total value: £{total_value:,.2f}")
    print(f"  Supplier-donor matches: {len(supplier_donations)}")
    print(f"  Councillor company donations: {len(councillor_company_donations)}")
    print(f"  Threshold proximity alerts: {len(threshold_findings)}")
    print(f"  Temporal clusters: {len(temporal_clusters)}")
    print(f"  UA donations: {len(ua_donations)}")
    print(f"  API requests: {stats['requests']} | Errors: {stats['errors']}")


if __name__ == "__main__":
    main()
