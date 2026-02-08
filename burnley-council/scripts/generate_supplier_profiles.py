#!/usr/bin/env python3
"""
generate_supplier_profiles.py — Build supplier_profiles.json for Supplier Deep Dive pages
Aggregates spending data from ALL councils, enriches with Companies House data from taxonomy.

Usage:
    python generate_supplier_profiles.py                    # all councils
    python generate_supplier_profiles.py --council burnley  # one council
    python generate_supplier_profiles.py --top 100          # top 100 by spend
    python generate_supplier_profiles.py --min-spend 10000  # suppliers with £10k+ total
"""

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
TAXONOMY_PATH = DATA_DIR / "taxonomy.json"


def slugify(name):
    """Convert supplier name to URL-safe slug."""
    s = name.lower().strip()
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    s = re.sub(r'[\s_]+', '-', s)
    s = re.sub(r'-+', '-', s)
    return s.strip('-')[:80]


def load_spending(council_id):
    """Load spending.json for a council."""
    path = DATA_DIR / council_id / "spending.json"
    if not path.exists():
        print(f"  WARNING: {path} not found, skipping")
        return []
    with open(path) as f:
        return json.load(f)


def load_taxonomy():
    """Load taxonomy.json for Companies House data."""
    if not TAXONOMY_PATH.exists():
        print(f"  WARNING: taxonomy.json not found at {TAXONOMY_PATH}")
        return {}
    with open(TAXONOMY_PATH) as f:
        return json.load(f)


def determine_risk_level(ch_data):
    """Compute risk level from Companies House violation data."""
    if not ch_data:
        return None

    violations = ch_data.get("violations", [])
    current_violations = [v for v in violations if v.get("current", False)]

    if not current_violations:
        return "clean"

    max_severity = ch_data.get("max_severity_label", "low")
    severity_map = {"critical": "critical", "high": "high", "medium": "medium", "low": "low"}
    return severity_map.get(max_severity, "low")


def build_profiles(councils, taxonomy, top_n=None, min_spend=0):
    """Build supplier profiles from spending data across all councils."""
    print(f"\n  Building supplier profiles across {len(councils)} councils...")

    # Step 1: Aggregate all spending by supplier canonical name
    supplier_data = defaultdict(lambda: {
        "records": [],
        "councils": set(),
        "total": 0,
        "count": 0,
    })

    total_records = 0
    for council_id in councils:
        records = load_spending(council_id)
        total_records += len(records)
        print(f"  {council_id}: {len(records)} records loaded")

        for r in records:
            key = r.get("supplier_canonical") or r.get("supplier", "UNKNOWN")
            if key == "UNKNOWN" or len(key.strip()) < 2:
                continue

            supplier_data[key]["records"].append(r)
            supplier_data[key]["councils"].add(council_id)
            supplier_data[key]["total"] += abs(r.get("amount", 0))
            supplier_data[key]["count"] += 1

    print(f"  Total records processed: {total_records}")
    print(f"  Unique suppliers: {len(supplier_data)}")

    # Step 2: Filter and sort
    suppliers_sorted = sorted(supplier_data.items(), key=lambda x: x[1]["total"], reverse=True)

    if min_spend > 0:
        suppliers_sorted = [(k, v) for k, v in suppliers_sorted if v["total"] >= min_spend]
        print(f"  After min_spend filter (£{min_spend:,.0f}): {len(suppliers_sorted)}")

    if top_n:
        suppliers_sorted = suppliers_sorted[:top_n]
        print(f"  Taking top {top_n} suppliers")

    # Step 3: Build profiles
    taxonomy_suppliers = taxonomy.get("suppliers", {})
    profiles = []

    for canonical_name, data in suppliers_sorted:
        records = data["records"]
        total_spend = data["total"]

        # Get taxonomy entry
        tax_entry = taxonomy_suppliers.get(canonical_name, {})
        ch_data = tax_entry.get("companies_house")
        aliases = tax_entry.get("aliases", [canonical_name])

        # Display name (best version)
        display_name = canonical_name
        if ch_data and ch_data.get("company_name"):
            display_name = ch_data["company_name"]
        elif aliases:
            # Pick the version with mixed case if available
            for a in aliases:
                if a != a.upper() and a != a.lower():
                    display_name = a
                    break

        # Spending breakdown by council
        by_council = defaultdict(lambda: {"total": 0, "count": 0, "years": set()})
        by_year = defaultdict(float)
        by_quarter = defaultdict(float)
        by_department = defaultdict(lambda: {"total": 0, "count": 0})
        amounts = []

        first_date = None
        last_date = None

        for r in records:
            council = r.get("council", "unknown")
            fy = r.get("financial_year", "")
            q = r.get("quarter", "")
            dept = r.get("department") or r.get("department_raw") or "Unclassified"
            amt = abs(r.get("amount", 0))
            date = r.get("date")

            by_council[council]["total"] += amt
            by_council[council]["count"] += 1
            if fy:
                by_council[council]["years"].add(fy)
                by_year[fy] += amt
            if q:
                by_quarter[q] += amt
            by_department[dept]["total"] += amt
            by_department[dept]["count"] += 1
            amounts.append(r.get("amount", 0))

            if date:
                if first_date is None or date < first_date:
                    first_date = date
                if last_date is None or date > last_date:
                    last_date = date

        # Build profile
        profile = {
            "id": slugify(canonical_name),
            "name": display_name,
            "canonical": canonical_name,
            "aliases": list(set(aliases)),
            "spending": {
                "total_all_councils": round(total_spend, 2),
                "transaction_count": data["count"],
                "avg_payment": round(total_spend / data["count"], 2) if data["count"] > 0 else 0,
                "max_payment": round(max(abs(a) for a in amounts), 2) if amounts else 0,
                "min_payment": round(min(abs(a) for a in amounts if a != 0), 2) if amounts else 0,
                "first_payment_date": first_date,
                "last_payment_date": last_date,
                "councils_count": len(data["councils"]),
                "by_council": [
                    {
                        "council": c,
                        "total": round(v["total"], 2),
                        "count": v["count"],
                        "years": sorted(v["years"]),
                    }
                    for c, v in sorted(by_council.items(), key=lambda x: x[1]["total"], reverse=True)
                ],
                "by_year": {k: round(v, 2) for k, v in sorted(by_year.items())},
                "by_quarter": {k: round(v, 2) for k, v in sorted(by_quarter.items())},
                "by_department": [
                    {"department": d, "total": round(v["total"], 2), "count": v["count"]}
                    for d, v in sorted(by_department.items(), key=lambda x: x[1]["total"], reverse=True)[:10]
                ],
            },
        }

        # Companies House data
        if ch_data:
            profile["companies_house"] = {
                "company_number": ch_data.get("company_number"),
                "legal_name": ch_data.get("company_name"),
                "status": ch_data.get("status"),
                "company_type": ch_data.get("company_type"),
                "sic_codes": ch_data.get("sic_codes", []),
                "incorporated": ch_data.get("date_of_creation"),
                "address": ch_data.get("registered_address"),
                "url": ch_data.get("url"),
            }

            # Compliance
            violations = ch_data.get("violations", [])
            current_violations = [v for v in violations if v.get("current", False)]
            profile["compliance"] = {
                "risk_level": determine_risk_level(ch_data),
                "violation_count": len(current_violations),
                "violations": current_violations[:5],  # Top 5
                "filing_status": {
                    "accounts_overdue": ch_data.get("accounts_overdue", False),
                    "confirmation_overdue": ch_data.get("confirmation_statement_overdue", False),
                },
                "insolvency_history": ch_data.get("has_insolvency_history", False),
                "address_flags": {
                    "undeliverable": ch_data.get("undeliverable_address", False),
                    "in_dispute": ch_data.get("address_in_dispute", False),
                },
            }

            # Governance
            directors = ch_data.get("directors", [])
            pscs = ch_data.get("pscs", [])
            if directors or pscs:
                profile["governance"] = {
                    "active_directors": ch_data.get("active_directors", 0),
                    "directors": directors[:10],
                    "pscs": pscs[:5],
                }
        else:
            profile["companies_house"] = None
            profile["compliance"] = None
            profile["governance"] = None

        # Metadata
        profile["metadata"] = {
            "profile_created": datetime.now().strftime("%Y-%m-%d"),
            "data_quality": 1.0 if ch_data else 0.5,
        }

        profiles.append(profile)

    return profiles


def main():
    parser = argparse.ArgumentParser(description="Generate supplier_profiles.json")
    parser.add_argument("--council", type=str, help="Generate for specific council only")
    parser.add_argument("--top", type=int, default=None, help="Top N suppliers by spend")
    parser.add_argument("--min-spend", type=float, default=0, help="Minimum total spend")
    parser.add_argument("--output", type=str, help="Output path (default: per-council data dir)")
    args = parser.parse_args()

    # Discover available councils
    available = [d.name for d in DATA_DIR.iterdir()
                 if d.is_dir() and (d / "spending.json").exists()]
    available.sort()

    if args.council:
        if args.council not in available:
            print(f"ERROR: Council '{args.council}' not found. Available: {available}")
            sys.exit(1)
        councils = [args.council]
    else:
        councils = available

    print(f"AI DOGE — Supplier Profile Generator")
    print(f"  Councils: {', '.join(councils)}")

    # Load taxonomy
    taxonomy = load_taxonomy()
    tax_count = len(taxonomy.get("suppliers", {}))
    print(f"  Taxonomy: {tax_count} suppliers")

    # Build profiles (always across all councils for cross-council visibility)
    profiles = build_profiles(available, taxonomy, top_n=args.top, min_spend=args.min_spend)

    output = {
        "generated": datetime.now().isoformat(),
        "generator": "generate_supplier_profiles.py",
        "councils_included": available,
        "total_suppliers": len(profiles),
        "profiles": profiles,
    }

    # Save — either to specific path or to each council's data directory
    if args.output:
        out_path = Path(args.output)
        with open(out_path, 'w') as f:
            json.dump(output, f, indent=2, default=str)
        print(f"\n  Saved: {out_path} ({len(profiles)} profiles)")
    else:
        # Save to each council directory (same data, gives every SPA the full picture)
        for council_id in councils:
            out_path = DATA_DIR / council_id / "supplier_profiles.json"
            with open(out_path, 'w') as f:
                json.dump(output, f, indent=2, default=str)
            print(f"  Saved: {out_path}")

    # Summary stats
    total_spend = sum(p["spending"]["total_all_councils"] for p in profiles)
    multi_council = sum(1 for p in profiles if p["spending"]["councils_count"] > 1)
    with_ch = sum(1 for p in profiles if p["companies_house"])
    with_violations = sum(1 for p in profiles if p.get("compliance") and
                          p["compliance"].get("violation_count", 0) > 0)

    print(f"\n  Summary:")
    print(f"    Total profiled suppliers: {len(profiles)}")
    print(f"    Total spend tracked: £{total_spend:,.2f}")
    print(f"    Multi-council suppliers: {multi_council}")
    print(f"    Companies House matched: {with_ch}")
    print(f"    With compliance violations: {with_violations}")


if __name__ == "__main__":
    main()
