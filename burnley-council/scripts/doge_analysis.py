#!/usr/bin/env python3
"""
doge_analysis.py — Cross-Council DOGE Investigation Engine
Analyses spending data across all councils to find waste, fraud, and mismanagement.

Usage:
    python scripts/doge_analysis.py                    # Run all analyses
    python scripts/doge_analysis.py --analysis duplicates  # Run specific analysis
    python scripts/doge_analysis.py --council burnley  # Analyse single council
"""

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "data"
COUNCILS = ["burnley", "hyndburn", "pendle", "rossendale", "lancaster", "ribble_valley", "chorley", "south_ribble"]


def load_spending(council_id):
    """Load spending.json for a council."""
    path = DATA_DIR / council_id / "spending.json"
    if not path.exists():
        print(f"  WARNING: No spending data for {council_id}")
        return []
    with open(path) as f:
        data = json.load(f)
    # Handle both v1 (plain array) and v2 (dict with records key) formats
    records = data if isinstance(data, list) else data.get('records', [])
    # Ensure supplier_canonical is never None (fall back to supplier)
    for r in records:
        if not r.get("supplier_canonical"):
            r["supplier_canonical"] = r.get("supplier", "UNKNOWN")
    return records


def load_taxonomy():
    """Load shared taxonomy."""
    path = DATA_DIR / "taxonomy.json"
    if not path.exists():
        return {}
    with open(path) as f:
        return json.load(f)


def load_config(council_id):
    """Load config.json for a council."""
    path = DATA_DIR / council_id / "config.json"
    if not path.exists():
        return {}
    with open(path) as f:
        return json.load(f)


def fmt_gbp(amount):
    """Format amount as £X.XM or £X.XK."""
    if abs(amount) >= 1_000_000:
        return f"£{amount/1_000_000:.1f}M"
    elif abs(amount) >= 1_000:
        return f"£{amount/1_000:.1f}K"
    else:
        return f"£{amount:,.0f}"


# ═══════════════════════════════════════════════════════════════════════
# ANALYSIS 1: Duplicate Payment Deep Dive
# ═══════════════════════════════════════════════════════════════════════

def analyse_duplicates(all_spending):
    """Find true duplicate payments with improved false-positive filtering.

    Key improvements over v1:
    - Filters out likely batch/grant payments (many identical amounts on same date)
    - Requires same reference to be "high confidence" (different refs = batch payment)
    - Excludes common bulk payment amounts (£8K, £10K, £25K COVID grants)
    - Excludes redacted/withheld supplier names from duplicate analysis
    - Applies ETL dedup awareness (same source file = likely CSV overlap)
    """
    results = {}

    # Common batch payment amounts (exact round numbers often used for grants)
    BATCH_AMOUNT_THRESHOLD = 10  # If 10+ identical payments, likely a batch/grant
    # Suppliers to exclude from duplicate analysis
    EXCLUDED_SUPPLIERS = {"UNKNOWN", "NAME WITHHELD", "REDACTED", "VARIOUS", "SUNDRY"}

    for council_id, records in all_spending.items():
        tx = [r for r in records if r.get("amount", 0) > 0]

        # Group by supplier + amount + date
        groups = defaultdict(list)
        for r in tx:
            supplier = r.get("supplier_canonical", r.get("supplier", "")) or ""
            # Skip excluded suppliers
            if supplier.upper() in EXCLUDED_SUPPLIERS:
                continue
            key = (supplier, r.get("amount", 0), r.get("date", ""))
            groups[key].append(r)

        # Find duplicates (2+ payments with same key)
        dup_groups = []
        filtered_batch = 0
        filtered_csv_overlap = 0

        for (supplier, amount, date), recs in groups.items():
            if len(recs) < 2:
                continue

            # FILTER 1: Batch payment detection
            # If there are many identical payments (10+), this is almost certainly
            # a grant programme or batch distribution, not a duplicate payment error
            if len(recs) >= BATCH_AMOUNT_THRESHOLD:
                filtered_batch += 1
                continue

            # Sub-group by reference to separate true dupes from batch payments
            refs = defaultdict(list)
            for r in recs:
                ref = r.get("reference", "") or "no_ref"
                refs[ref].append(r)

            # FILTER 2: CSV overlap detection
            # If all records have the same reference but come from different source files,
            # this is likely a CSV publishing overlap (quarterly files overlap)
            # Check: if all references are unique and non-empty, these are separate transactions
            non_empty_refs = {ref for ref in refs.keys() if ref != "no_ref"}

            # High confidence: SAME reference appears multiple times
            # (meaning the exact same transaction line appears twice)
            true_dupes_raw = {ref: rs for ref, rs in refs.items() if len(rs) > 1 and ref != "no_ref"}

            # FILTER 2b: CSV republication detection
            # If same ref appears exactly 2x with identical departments, this is
            # almost certainly a quarterly CSV overlap (same transaction published
            # in two overlapping files). Only flag as duplicate if 3+ copies or
            # if records have different source files (when available).
            true_dupes = {}
            csv_republication = 0
            for ref, rs in true_dupes_raw.items():
                depts = set(r.get("department", "") for r in rs)
                source_files = set(r.get("_source_file", "") for r in rs if r.get("_source_file"))
                # If exactly 2 copies with same dept: likely CSV republication
                if len(rs) == 2 and len(depts) <= 1:
                    # If we have source file info and they differ: definitely CSV overlap
                    if len(source_files) > 1:
                        csv_republication += 1
                        continue
                    # No source file info: still flag as CSV republication if depts match
                    # This is the common case for Burnley/Rossendale
                    csv_republication += 1
                    continue
                true_dupes[ref] = rs
            filtered_csv_overlap += csv_republication

            # FILTER 3: If all references are DIFFERENT, this is a batch payment
            # (different reference numbers = deliberately separate transactions)
            all_different = len(non_empty_refs) == len(recs) and len(non_empty_refs) > 1
            if all_different:
                filtered_csv_overlap += 1
                continue

            # Determine confidence
            if true_dupes:
                confidence = "high"
                # Overpayment is only the true duplicates (excess copies)
                overpayment = sum(
                    amount * (len(rs) - 1)
                    for ref, rs in true_dupes.items()
                )
            elif len(refs) == 1:
                # All records have the same (or no) reference
                # Could be real duplicate or batch with no refs
                confidence = "medium"
                overpayment = amount * (len(recs) - 1)
            else:
                # Mix of references — low confidence
                confidence = "low"
                overpayment = amount * (len(recs) - 1)

            dup_groups.append({
                "supplier": supplier,
                "amount": amount,
                "date": date,
                "occurrences": len(recs),
                "unique_references": len(refs),
                "true_duplicate_refs": len(true_dupes),
                "confidence": confidence,
                "potential_overpayment": round(overpayment, 2),
                "departments": list(set(r.get("department", "") for r in recs)),
                "references": list(set(r.get("reference", "") for r in recs if r.get("reference")))[:10],
            })

        dup_groups.sort(key=lambda x: (
            -{"high": 3, "medium": 2, "low": 1}.get(x["confidence"], 0),
            -x["potential_overpayment"]
        ))

        # Summary stats
        high_conf = [d for d in dup_groups if d["confidence"] == "high"]
        med_conf = [d for d in dup_groups if d["confidence"] == "medium"]

        results[council_id] = {
            "total_duplicate_groups": len(dup_groups),
            "high_confidence": len(high_conf),
            "high_confidence_value": round(sum(d["potential_overpayment"] for d in high_conf), 2),
            "medium_confidence": len(med_conf),
            "medium_confidence_value": round(sum(d["potential_overpayment"] for d in med_conf), 2),
            "total_potential_overpayment": round(sum(d["potential_overpayment"] for d in dup_groups), 2),
            "filtered_batch_payments": filtered_batch,
            "filtered_csv_overlaps": filtered_csv_overlap,
            "top_20": dup_groups[:20],
        }

        print(f"\n  {council_id.upper()}:")
        print(f"    Duplicate groups: {len(dup_groups)} (filtered: {filtered_batch} batch, {filtered_csv_overlap} CSV overlap)")
        print(f"    High confidence: {len(high_conf)} worth {fmt_gbp(sum(d['potential_overpayment'] for d in high_conf))}")
        print(f"    Medium confidence: {len(med_conf)} worth {fmt_gbp(sum(d['potential_overpayment'] for d in med_conf))}")
        if dup_groups:
            print(f"    Top duplicate: {dup_groups[0]['supplier']} — {fmt_gbp(dup_groups[0]['potential_overpayment'])} ({dup_groups[0]['occurrences']}x {fmt_gbp(dup_groups[0]['amount'])} on {dup_groups[0]['date']})")

    return results


# ═══════════════════════════════════════════════════════════════════════
# ANALYSIS 2: Cross-Council Supplier Price Comparison
# ═══════════════════════════════════════════════════════════════════════

def analyse_cross_council_pricing(all_spending, taxonomy):
    """Compare prices when the same supplier serves multiple councils.

    Uses common-year comparability: only compares transactions from financial
    years where BOTH councils have data for the supplier. This prevents unfair
    comparisons between e.g. 10-year and 5-year datasets.
    """
    # Build per-council, per-year supplier profiles
    council_suppliers = {}
    council_supplier_by_year = {}  # {council: {supplier: {year: [amounts]}}}
    for council_id, records in all_spending.items():
        tx = [r for r in records if r.get("amount", 0) > 0]
        suppliers = defaultdict(lambda: {"total": 0, "count": 0, "amounts": [], "years": set()})
        by_year = defaultdict(lambda: defaultdict(list))
        for r in tx:
            s = r.get("supplier_canonical", r.get("supplier", "")) or ""
            suppliers[s]["total"] += r["amount"]
            suppliers[s]["count"] += 1
            suppliers[s]["amounts"].append(r["amount"])
            fy = r.get("financial_year", "")
            if fy:
                suppliers[s]["years"].add(fy)
                by_year[s][fy].append(r["amount"])
        council_suppliers[council_id] = suppliers
        council_supplier_by_year[council_id] = by_year

    # Find suppliers appearing in 2+ councils
    all_supplier_names = set()
    for suppliers in council_suppliers.values():
        all_supplier_names.update(s for s in suppliers.keys() if s)

    shared_suppliers = []
    for name in sorted(all_supplier_names):
        councils_with = {}
        # Find common years across all councils that have this supplier
        all_years_per_council = []
        for council_id in council_supplier_by_year:
            if name in council_supplier_by_year[council_id]:
                all_years_per_council.append(set(council_supplier_by_year[council_id][name].keys()))

        # Common years = intersection of all councils' year sets for this supplier
        common_years = set.intersection(*all_years_per_council) if len(all_years_per_council) >= 2 else set()

        for council_id, suppliers in council_suppliers.items():
            if name in suppliers:
                s = suppliers[name]
                # If we have common years, compute stats from common years only
                if common_years and name in council_supplier_by_year[council_id]:
                    by_year = council_supplier_by_year[council_id][name]
                    common_amounts = []
                    for yr in common_years:
                        common_amounts.extend(by_year.get(yr, []))
                    if common_amounts:
                        total = sum(common_amounts)
                        count = len(common_amounts)
                        councils_with[council_id] = {
                            "total": round(total, 2),
                            "count": count,
                            "avg_transaction": round(total / count, 2),
                            "median_transaction": round(sorted(common_amounts)[len(common_amounts) // 2], 2),
                            "years_active": len(s["years"]),
                            "common_years": len(common_years),
                        }
                    else:
                        # Fallback: use all data
                        councils_with[council_id] = {
                            "total": round(s["total"], 2),
                            "count": s["count"],
                            "avg_transaction": round(s["total"] / s["count"], 2) if s["count"] > 0 else 0,
                            "median_transaction": round(sorted(s["amounts"])[len(s["amounts"]) // 2], 2) if s["amounts"] else 0,
                            "years_active": len(s["years"]),
                            "common_years": 0,
                        }
                else:
                    councils_with[council_id] = {
                        "total": round(s["total"], 2),
                        "count": s["count"],
                        "avg_transaction": round(s["total"] / s["count"], 2) if s["count"] > 0 else 0,
                        "median_transaction": round(sorted(s["amounts"])[len(s["amounts"]) // 2], 2) if s["amounts"] else 0,
                        "years_active": len(s["years"]),
                        "common_years": 0,
                    }
        if len(councils_with) >= 2:
            # Calculate price disparity
            avgs = [v["avg_transaction"] for v in councils_with.values()]
            max_avg = max(avgs)
            min_avg = min(avgs)
            disparity = round((max_avg - min_avg) / min_avg * 100, 1) if min_avg > 0 else 0

            shared_suppliers.append({
                "supplier": name,
                "councils": councils_with,
                "council_count": len(councils_with),
                "total_combined": round(sum(v["total"] for v in councils_with.values()), 2),
                "avg_disparity_pct": disparity,
                "highest_avg": max(councils_with.items(), key=lambda x: x[1]["avg_transaction"]),
                "lowest_avg": min(councils_with.items(), key=lambda x: x[1]["avg_transaction"]),
            })

    # Sort by combined spend
    shared_suppliers.sort(key=lambda x: -x["total_combined"])

    # Also sort by disparity for the "worst value" list
    # Filter: require meaningful comparison (both councils have 3+ transactions)
    # and ignore extreme disparities that are clearly different service scopes
    high_disparity = sorted(
        [s for s in shared_suppliers
         if s["total_combined"] > 10000
         and all(v["count"] >= 3 for v in s["councils"].values())  # Both sides need 3+ txns
         and s["avg_disparity_pct"] < 10000  # Cap at 10,000% — above this is different service
        ],
        key=lambda x: -x["avg_disparity_pct"]
    )

    print(f"\n  Shared suppliers across councils: {len(shared_suppliers)}")
    print(f"  Shared suppliers with >10K combined: {len([s for s in shared_suppliers if s['total_combined'] > 10000])}")

    print(f"\n  TOP 15 SHARED SUPPLIERS BY SPEND:")
    for s in shared_suppliers[:15]:
        councils_str = ", ".join(
            f"{c}: {fmt_gbp(v['total'])} (avg {fmt_gbp(v['avg_transaction'])})"
            for c, v in sorted(s["councils"].items())
        )
        print(f"    {s['supplier']}: {fmt_gbp(s['total_combined'])} — {councils_str}")
        if s["avg_disparity_pct"] > 50:
            print(f"      ⚠ PRICE GAP: {s['avg_disparity_pct']:.0f}% disparity in avg transaction size")

    print(f"\n  TOP 10 PRICE DISPARITIES (>10K combined):")
    for s in high_disparity[:10]:
        h_council, h_data = s["highest_avg"]
        l_council, l_data = s["lowest_avg"]
        print(f"    {s['supplier']}: {h_council} pays {fmt_gbp(h_data['avg_transaction'])} avg vs {l_council} {fmt_gbp(l_data['avg_transaction'])} ({s['avg_disparity_pct']:.0f}% gap)")

    return {
        "shared_suppliers": shared_suppliers[:50],
        "high_disparity": high_disparity[:20],
        "total_shared": len(shared_suppliers),
        "total_combined_spend": round(sum(s["total_combined"] for s in shared_suppliers), 2),
    }


# ═══════════════════════════════════════════════════════════════════════
# ANALYSIS 3: Payment Pattern Analysis
# ═══════════════════════════════════════════════════════════════════════

def analyse_payment_patterns(all_spending):
    """Detect suspicious payment patterns: split payments, year-end spikes, round numbers."""
    results = {}

    # UK council procurement thresholds (focus on the significant ones)
    # Below £5K generally doesn't require formal procurement
    # £30K+ requires competitive quotes, £138K+ requires full tender
    THRESHOLDS = [5000, 10000, 25000, 50000, 100000]

    for council_id, records in all_spending.items():
        tx = [r for r in records if r.get("amount", 0) > 0]

        # ── Split Payments ──
        # Same supplier, multiple payments in same week, all just below a threshold
        # Requires 5+ payments (not 3) to reduce over-sensitivity
        from collections import defaultdict
        weekly_groups = defaultdict(list)
        for r in tx:
            date = r.get("date", "")
            if not date or len(date) < 10:
                continue
            try:
                dt = datetime.strptime(date[:10], "%Y-%m-%d")
                week_key = f"{dt.year}-W{dt.isocalendar()[1]:02d}"
            except ValueError:
                continue
            supplier = r.get("supplier_canonical", r.get("supplier", ""))
            weekly_groups[(supplier, week_key)].append(r)

        split_payment_suspects = []
        for (supplier, week), recs in weekly_groups.items():
            if len(recs) < 5:  # Need 5+ to be genuinely suspicious
                continue
            amounts = [r["amount"] for r in recs]
            total = sum(amounts)
            max_amt = max(amounts)

            # Check if payments cluster just below a threshold (within 80% of threshold)
            for threshold in THRESHOLDS:
                below = [a for a in amounts if a < threshold and a > threshold * 0.8]
                if len(below) >= 5 and total > threshold * 1.5:
                    split_payment_suspects.append({
                        "supplier": supplier,
                        "week": week,
                        "payments": len(recs),
                        "amounts": sorted(amounts, reverse=True)[:10],
                        "total": round(total, 2),
                        "suspected_threshold": threshold,
                        "departments": list(set(r.get("department", "") for r in recs)),
                    })
                    break

        split_payment_suspects.sort(key=lambda x: -x["total"])

        # ── Year-End Spending Spikes ──
        monthly_dept_spend = defaultdict(lambda: defaultdict(float))
        for r in tx:
            date = r.get("date", "")
            if not date or len(date) < 7:
                continue
            month = date[:7]  # YYYY-MM
            dept = r.get("department", "Other")
            monthly_dept_spend[dept][month] += r["amount"]

        year_end_spikes = []
        for dept, months in monthly_dept_spend.items():
            if len(months) < 6:
                continue
            march_spend = sum(v for k, v in months.items() if k.endswith("-03"))
            other_months = [v for k, v in months.items() if not k.endswith("-03")]
            if not other_months:
                continue
            avg_other = sum(other_months) / len(other_months)
            if avg_other > 0 and march_spend > avg_other * 1.5:
                spike_ratio = round(march_spend / avg_other, 2)
                year_end_spikes.append({
                    "department": dept,
                    "march_total": round(march_spend, 2),
                    "avg_other_months": round(avg_other, 2),
                    "spike_ratio": spike_ratio,
                    "excess": round(march_spend - avg_other, 2),
                })

        year_end_spikes.sort(key=lambda x: -x["excess"])

        # ── Round Number Analysis ──
        round_payments = []
        for r in tx:
            amt = r["amount"]
            if amt >= 5000 and amt % 1000 == 0:
                round_payments.append({
                    "supplier": r.get("supplier_canonical", r.get("supplier", "")),
                    "amount": amt,
                    "date": r.get("date", ""),
                    "department": r.get("department", ""),
                })

        round_payments.sort(key=lambda x: -x["amount"])

        # ── High-Frequency Suppliers ──
        supplier_freq = defaultdict(lambda: {"count": 0, "total": 0})
        for r in tx:
            s = r.get("supplier_canonical", r.get("supplier", ""))
            supplier_freq[s]["count"] += 1
            supplier_freq[s]["total"] += r["amount"]

        high_freq = [
            {"supplier": s, "transactions": d["count"], "total": round(d["total"], 2),
             "avg": round(d["total"] / d["count"], 2)}
            for s, d in supplier_freq.items()
            if d["count"] >= 50
        ]
        high_freq.sort(key=lambda x: -x["transactions"])

        # ── Payment Cadence Analysis ──
        # For suppliers with 10+ payments, calculate average days between payments
        # and flag those with suspiciously rapid or clock-like regular cadence
        supplier_dates = defaultdict(list)
        for r in tx:
            date = r.get("date", "")
            if not date or len(date) < 10:
                continue
            try:
                dt = datetime.strptime(date[:10], "%Y-%m-%d")
            except ValueError:
                continue
            s = r.get("supplier_canonical", r.get("supplier", ""))
            supplier_dates[s].append((dt, r["amount"]))

        payment_cadence = []
        for supplier, date_amounts in supplier_dates.items():
            if len(date_amounts) < 10:
                continue
            dates = sorted([d for d, _ in date_amounts])
            intervals = [(dates[i+1] - dates[i]).days for i in range(len(dates) - 1)]
            intervals = [d for d in intervals if d > 0]  # Exclude same-day
            if not intervals:
                continue
            avg_interval = sum(intervals) / len(intervals)
            min_interval = min(intervals)
            max_interval = max(intervals)
            # Standard deviation of intervals — low = suspiciously regular
            mean = avg_interval
            variance = sum((x - mean) ** 2 for x in intervals) / len(intervals)
            std_dev = variance ** 0.5
            total_spend = sum(a for _, a in date_amounts)
            payment_cadence.append({
                "supplier": supplier,
                "payments": len(date_amounts),
                "avg_days_between": round(avg_interval, 1),
                "min_interval_days": min_interval,
                "max_interval_days": max_interval,
                "std_dev_days": round(std_dev, 1),
                "total_spend": round(total_spend, 2),
                "regularity": "high" if std_dev < 5 and len(date_amounts) >= 20 else
                              "medium" if std_dev < 15 else "normal",
            })

        # Sort by most frequent (lowest avg interval)
        payment_cadence.sort(key=lambda x: x["avg_days_between"])
        rapid_payers = [p for p in payment_cadence if p["avg_days_between"] < 14]
        regular_payers = [p for p in payment_cadence if p["regularity"] == "high"]

        # ── Day of Week Distribution ──
        day_counts = defaultdict(lambda: {"count": 0, "total": 0})
        for r in tx:
            date = r.get("date", "")
            if not date or len(date) < 10:
                continue
            try:
                dt = datetime.strptime(date[:10], "%Y-%m-%d")
                day_name = dt.strftime("%A")
                day_counts[day_name]["count"] += 1
                day_counts[day_name]["total"] += r["amount"]
            except ValueError:
                continue

        day_distribution = [
            {"day": day, "count": d["count"], "total": round(d["total"], 2)}
            for day, d in sorted(day_counts.items(),
                                 key=lambda x: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].index(x[0]) if x[0] in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] else 7)
        ]

        results[council_id] = {
            "split_payments": {
                "suspects": split_payment_suspects[:20],
                "total_suspects": len(split_payment_suspects),
                "total_value": round(sum(s["total"] for s in split_payment_suspects), 2),
            },
            "year_end_spikes": {
                "departments": year_end_spikes[:15],
                "total_excess": round(sum(s["excess"] for s in year_end_spikes), 2),
            },
            "round_numbers": {
                "count": len(round_payments),
                "total_value": round(sum(r["amount"] for r in round_payments), 2),
                "top_20": round_payments[:20],
            },
            "high_frequency": {
                "suppliers": high_freq[:20],
                "total_suppliers_50plus": len(high_freq),
            },
            "payment_cadence": {
                "rapid_payers": rapid_payers[:15],
                "regular_payers": regular_payers[:10],
                "all_cadence": payment_cadence[:30],
                "total_analysed": len(payment_cadence),
            },
            "day_of_week": day_distribution,
        }

        print(f"\n  {council_id.upper()}:")
        print(f"    Split payment suspects: {len(split_payment_suspects)} worth {fmt_gbp(sum(s['total'] for s in split_payment_suspects))}")
        print(f"    Year-end spike departments: {len(year_end_spikes)}")
        print(f"    Round number payments (>5K): {len(round_payments)} worth {fmt_gbp(sum(r['amount'] for r in round_payments))}")
        print(f"    High-frequency suppliers (50+ txns): {len(high_freq)}")
        print(f"    Rapid payers (<14 day avg): {len(rapid_payers)}")
        print(f"    Clock-like regular payers: {len(regular_payers)}")

    return results


# ═══════════════════════════════════════════════════════════════════════
# ANALYSIS 4: Companies House Red Flags
# ═══════════════════════════════════════════════════════════════════════

def _payment_overlaps_violation(payment_date, violation):
    """Check if a payment date falls within a violation's active period.

    Returns:
        "during"  — payment was made while breach was active (CONFIRMED with dates)
        "before"  — payment was made before breach started (no issue)
        "after"   — payment was made after breach was resolved (no issue)
        "unknown" — can't determine (no dates available)

    IMPORTANT: If active_from is null/None, we CANNOT confirm the payment occurred
    during the breach. We return "unknown" rather than assuming "during", because:
    - CH API may have failed to fetch the profile (enrichment_error)
    - The violation may be a current snapshot that doesn't tell us WHEN it started
    - Returning "during" for null dates would retroactively flag ALL historical
      payments, creating massive false positives (e.g. Molesworth Hotel)
    """
    if not payment_date:
        return "unknown"

    active_from = violation.get("active_from")
    active_to = violation.get("active_to")

    if not active_from:
        # We don't know when the violation started — CANNOT confirm overlap.
        # This is the conservative-correct approach: absence of evidence
        # is not evidence of absence, but nor is it evidence of guilt.
        return "unknown"

    try:
        pay_dt = datetime.strptime(payment_date[:10], "%Y-%m-%d").date()
        from_dt = datetime.strptime(active_from[:10], "%Y-%m-%d").date()

        if pay_dt < from_dt:
            return "before"

        if active_to:
            to_dt = datetime.strptime(active_to[:10], "%Y-%m-%d").date()
            if pay_dt > to_dt:
                return "after"

        return "during"
    except (ValueError, TypeError):
        return "unknown"


def analyse_ch_compliance(all_spending, taxonomy):
    """Summarise Companies House compliance findings per council.

    TEMPORAL LOGIC: Cross-references payment dates against violation active periods.
    Only flags payments that occurred DURING an active breach, not before it started.
    Distinguishes:
    - "confirmed": Payment date overlaps with known breach period
    - "current_only": Breach is current but we can't confirm it was active at payment time
    - "historical": Breach has been resolved; payments occurred during breach period
    """
    suppliers = taxonomy.get("suppliers", {})

    # Build supplier → violation map
    # CRITICAL: Skip suppliers with enrichment errors (API failures produce
    # violations with null dates, causing massive false positives)
    violation_map = {}
    skipped_errors = 0
    skipped_no_dates = 0
    for canonical, data in suppliers.items():
        ch = data.get("companies_house")
        if not ch or not isinstance(ch, dict) or not ch.get("enriched"):
            continue
        # Skip suppliers where the CH API failed to fetch the profile
        if ch.get("enrichment_error"):
            skipped_errors += 1
            continue
        violations = ch.get("violations", [])
        if not violations:
            continue
        # Only include violations that have a confirmed active_from date
        # Violations with null active_from cannot be temporally verified
        dated_violations = [v for v in violations if v.get("active_from")]
        undated_violations = [v for v in violations if not v.get("active_from")]
        if undated_violations:
            skipped_no_dates += len(undated_violations)
        if dated_violations:
            max_sev_num = max(
                {"critical": 4, "high": 3, "medium": 2, "low": 1}.get(v["severity"], 0)
                for v in dated_violations
            )
            max_sev_label = {4: "critical", 3: "high", 2: "medium", 1: "low"}.get(max_sev_num, "clean")
            violation_map[canonical.upper()] = {
                "company_name": canonical,
                "company_number": ch.get("company_number", ""),
                "status": ch.get("status", ""),
                "violations": dated_violations,
                "undated_violations": len(undated_violations),
                "max_severity": max_sev_label,
                "active_directors": ch.get("active_directors"),
                "accounts_overdue": ch.get("accounts_overdue", False),
            }
    if skipped_errors > 0:
        print(f"    Skipped {skipped_errors} suppliers with CH API enrichment errors")
    if skipped_no_dates > 0:
        print(f"    Skipped {skipped_no_dates} violations with no active_from date (unverifiable)")

    results = {}
    for council_id, records in all_spending.items():
        tx = [r for r in records if r.get("amount", 0) > 0]

        # Match spending to violations WITH temporal checking
        flagged_spend = defaultdict(lambda: {
            "total": 0, "count": 0, "violations": [],
            "spend_during_breach": 0, "count_during_breach": 0,
            "spend_before_breach": 0, "count_before_breach": 0,
        })

        for r in tx:
            supplier = r.get("supplier_canonical", r.get("supplier", "")).upper()
            if supplier not in violation_map:
                continue

            vm = violation_map[supplier]
            payment_date = r.get("date", "")
            amount = r["amount"]

            flagged_spend[supplier]["total"] += amount
            flagged_spend[supplier]["count"] += 1
            flagged_spend[supplier]["violations"] = vm["violations"]
            flagged_spend[supplier]["company_number"] = vm["company_number"]
            flagged_spend[supplier]["max_severity"] = vm["max_severity"]

            # Check each violation temporally
            any_during = False
            for v in vm["violations"]:
                overlap = _payment_overlaps_violation(payment_date, v)
                if overlap == "during":
                    any_during = True
                    break

            if any_during:
                flagged_spend[supplier]["spend_during_breach"] += amount
                flagged_spend[supplier]["count_during_breach"] += 1
            else:
                flagged_spend[supplier]["spend_before_breach"] += amount
                flagged_spend[supplier]["count_before_breach"] += 1

        # Classify each supplier
        for supplier, data in flagged_spend.items():
            data["temporal_status"] = "confirmed" if data["spend_during_breach"] > 0 else "pre-breach"
            # Check if violations are still current
            all_current = all(v.get("current", False) for v in data["violations"])
            any_current = any(v.get("current", False) for v in data["violations"])
            data["breach_current"] = any_current

        # Sort by: confirmed breaches first, then severity, then spend
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        flagged_list = sorted(
            [{"supplier": k, **v} for k, v in flagged_spend.items()],
            key=lambda x: (
                0 if x["temporal_status"] == "confirmed" else 1,
                severity_order.get(x["max_severity"], 9),
                -x["spend_during_breach"],
                -x["total"],
            )
        )

        confirmed = [f for f in flagged_list if f["temporal_status"] == "confirmed"]
        pre_breach = [f for f in flagged_list if f["temporal_status"] == "pre-breach"]
        critical = [f for f in confirmed if f["max_severity"] == "critical"]
        high = [f for f in confirmed if f["max_severity"] == "high"]
        medium = [f for f in confirmed if f["max_severity"] == "medium"]

        results[council_id] = {
            "total_flagged_suppliers": len(flagged_list),
            "total_flagged_spend": round(sum(f["total"] for f in flagged_list), 2),
            "confirmed_during_breach": {
                "suppliers": len(confirmed),
                "spend": round(sum(f["spend_during_breach"] for f in confirmed), 2),
            },
            "pre_breach_payments": {
                "suppliers": len(pre_breach),
                "spend": round(sum(f["total"] for f in pre_breach), 2),
                "note": "Payments made before the breach started — not violations at time of payment",
            },
            "critical": {"count": len(critical), "spend": round(sum(f["spend_during_breach"] for f in critical), 2)},
            "high": {"count": len(high), "spend": round(sum(f["spend_during_breach"] for f in high), 2)},
            "medium": {"count": len(medium), "spend": round(sum(f["spend_during_breach"] for f in medium), 2)},
            "flagged_suppliers": flagged_list[:30],
        }

        print(f"\n  {council_id.upper()}:")
        print(f"    Total flagged suppliers: {len(flagged_list)}")
        print(f"    Payments DURING active breach: {len(confirmed)} suppliers, {fmt_gbp(sum(f['spend_during_breach'] for f in confirmed))}")
        print(f"    Payments BEFORE breach started: {len(pre_breach)} suppliers, {fmt_gbp(sum(f['total'] for f in pre_breach))} (not violations)")
        print(f"    Confirmed critical: {len(critical)} ({fmt_gbp(sum(f['spend_during_breach'] for f in critical))})")
        print(f"    Confirmed high: {len(high)} ({fmt_gbp(sum(f['spend_during_breach'] for f in high))})")
        print(f"    Confirmed medium: {len(medium)} ({fmt_gbp(sum(f['spend_during_breach'] for f in medium))})")

        if confirmed:
            print(f"    CONFIRMED VIOLATIONS (payments during active breach):")
            for f in confirmed[:8]:
                viol_codes = ", ".join(v["code"] for v in f["violations"] if v.get("current", False))
                print(f"      {f['supplier']}: {fmt_gbp(f['spend_during_breach'])} during breach — {viol_codes}")

    return results


# ═══════════════════════════════════════════════════════════════════════
# ANALYSIS 7: Procurement Compliance
# ═══════════════════════════════════════════════════════════════════════

def analyse_procurement_compliance(councils):
    """Analyse procurement data for compliance red flags.

    Checks:
    - Threshold avoidance (contracts just below procurement thresholds)
    - Repeat winner concentration (same supplier winning many contracts)
    - Value transparency gap (contracts without awarded values)
    - Contract timing clusters (possible splitting)
    """
    # UK procurement thresholds (as of Procurement Act 2023)
    THRESHOLDS = [
        (30_000, "Low value (£30K)"),
        (138_760, "Goods/services (£138,760)"),
        (5_372_609, "Works (£5.37M)"),
    ]
    THRESHOLD_MARGIN = 0.15  # 15% below threshold = suspicious proximity

    results = {}

    for council_id in councils:
        proc_path = DATA_DIR / council_id / "procurement.json"
        if not proc_path.exists():
            continue
        with open(proc_path) as f:
            proc_data = json.load(f)

        contracts = proc_data.get("contracts", [])
        awarded = [c for c in contracts if c.get("status") == "awarded"]
        with_value = [c for c in awarded if c.get("awarded_value")]

        # ── Threshold avoidance ──
        threshold_suspects = []
        for c in with_value:
            val = c["awarded_value"]
            for limit, label in THRESHOLDS:
                lower = limit * (1 - THRESHOLD_MARGIN)
                if lower <= val < limit:
                    threshold_suspects.append({
                        "title": c["title"][:80],
                        "value": val,
                        "threshold": limit,
                        "threshold_label": label,
                        "supplier": c.get("awarded_supplier", "Unknown"),
                        "pct_of_threshold": round(val / limit * 100, 1),
                    })
                    break  # Only flag against closest threshold

        # ── Repeat winner analysis ──
        supplier_wins = defaultdict(list)
        for c in awarded:
            supplier = c.get("awarded_supplier", "Unknown")
            if supplier and supplier not in ("NOT AWARDED TO SUPPLIER", "Unknown"):
                supplier_wins[supplier].append({
                    "title": c["title"][:60],
                    "value": c.get("awarded_value", 0),
                    "date": c.get("awarded_date", c.get("published_date", "")),
                })

        repeat_winners = []
        for supplier, wins in sorted(supplier_wins.items(), key=lambda x: len(x[1]), reverse=True):
            if len(wins) >= 2:
                total_val = sum(w["value"] for w in wins)
                repeat_winners.append({
                    "supplier": supplier,
                    "contracts": len(wins),
                    "total_value": round(total_val, 2),
                    "avg_value": round(total_val / len(wins), 2) if wins else 0,
                })

        # ── Value transparency gap ──
        no_value = [c for c in awarded if not c.get("awarded_value")]
        transparency_gap_pct = round(len(no_value) / len(awarded) * 100, 1) if awarded else 0

        # ── Late publication detection ──
        # Contracts where the notice was published AFTER the award date
        # indicate retrospective compliance (contract awarded before
        # the public tendering requirement was fulfilled).
        late_publications = []
        for c in awarded:
            pub = c.get("published_date", "")
            award = c.get("awarded_date", "")
            if pub and award:
                try:
                    pub_date = datetime.strptime(pub[:10], "%Y-%m-%d")
                    award_date = datetime.strptime(award[:10], "%Y-%m-%d")
                    if pub_date > award_date:
                        gap = (pub_date - award_date).days
                        late_publications.append({
                            "title": c["title"][:80],
                            "supplier": c.get("awarded_supplier", "Unknown"),
                            "published_date": pub[:10],
                            "awarded_date": award[:10],
                            "days_late": gap,
                            "awarded_value": c.get("awarded_value", 0),
                        })
                except (ValueError, IndexError):
                    continue
        late_publications.sort(key=lambda x: x["days_late"], reverse=True)

        # ── Award-to-publication time analysis ──
        # Measures how long councils take to publish award notices.
        # Even contracts published "on time" (before award) can show
        # systematic delays in transparency if published long after deadline.
        pub_delays = []
        for c in awarded:
            pub = c.get("published_date", "")
            award = c.get("awarded_date", "")
            if pub and award:
                try:
                    pub_date = datetime.strptime(pub[:10], "%Y-%m-%d")
                    award_date = datetime.strptime(award[:10], "%Y-%m-%d")
                    delay = (pub_date - award_date).days
                    pub_delays.append(delay)
                except (ValueError, IndexError):
                    continue
        avg_pub_delay = round(sum(pub_delays) / len(pub_delays), 1) if pub_delays else 0
        median_pub_delay = sorted(pub_delays)[len(pub_delays) // 2] if pub_delays else 0

        # ── Weak competition indicators (Phase 8.2) ──
        # Since Contracts Finder doesn't publish bid counts, we use proxy signals:
        # 1. Short tender period (published → deadline < 14 days)
        # 2. Rapid award (deadline → awarded < 7 days = few bids to evaluate)
        # 3. Category monopoly (only 1 supplier winning in a CPV category)
        weak_competition = []

        # Short tender periods + rapid awards
        for c in awarded:
            pub = c.get("published_date", "")
            deadline = c.get("deadline_date", "")
            award_d = c.get("awarded_date", "")
            flags = []

            tender_days = None
            if pub and deadline:
                try:
                    p = datetime.strptime(pub[:10], "%Y-%m-%d")
                    dl = datetime.strptime(deadline[:10], "%Y-%m-%d")
                    tender_days = (dl - p).days
                    if 0 < tender_days < 14:
                        flags.append(f"Only {tender_days} days to bid")
                except (ValueError, IndexError):
                    pass

            eval_days = None
            if deadline and award_d:
                try:
                    dl = datetime.strptime(deadline[:10], "%Y-%m-%d")
                    aw = datetime.strptime(award_d[:10], "%Y-%m-%d")
                    eval_days = (aw - dl).days
                    if 0 <= eval_days <= 7:
                        flags.append(f"Awarded {eval_days} days after deadline")
                except (ValueError, IndexError):
                    pass

            if flags:
                weak_competition.append({
                    "title": c["title"][:80],
                    "supplier": c.get("awarded_supplier", "Unknown"),
                    "awarded_value": c.get("awarded_value", 0),
                    "tender_days": tender_days,
                    "eval_days": eval_days,
                    "flags": flags,
                    "cpv": c.get("cpv_description", "")[:50],
                })

        # Category monopoly — CPV categories where only 1 supplier has ever won
        cpv_winners = defaultdict(set)
        for c in awarded:
            cpv = c.get("cpv_description", "").strip()
            supplier = c.get("awarded_supplier", "")
            if cpv and supplier and supplier not in ("NOT AWARDED TO SUPPLIER", "Unknown"):
                cpv_winners[cpv].add(supplier)

        monopoly_categories = []
        for cpv, suppliers in cpv_winners.items():
            if len(suppliers) == 1:
                sole_supplier = list(suppliers)[0]
                cpv_contracts = [c for c in awarded
                                 if c.get("cpv_description", "").strip() == cpv
                                 and c.get("awarded_supplier") == sole_supplier]
                if len(cpv_contracts) >= 2:  # Only flag if 2+ contracts in same category
                    total_val = sum(c.get("awarded_value", 0) for c in cpv_contracts)
                    monopoly_categories.append({
                        "cpv": cpv[:60],
                        "supplier": sole_supplier,
                        "contracts": len(cpv_contracts),
                        "total_value": round(total_val, 2),
                    })
        monopoly_categories.sort(key=lambda x: x["total_value"], reverse=True)

        # Sort weak competition by value descending
        weak_competition.sort(key=lambda x: x.get("awarded_value") or 0, reverse=True)

        # ── Contract timing clusters (possible splitting) ──
        timing_clusters = []
        for supplier, wins in supplier_wins.items():
            if len(wins) < 2:
                continue
            dates = sorted(w["date"] for w in wins if w["date"])
            for i in range(len(dates) - 1):
                try:
                    d1 = datetime.strptime(dates[i][:10], "%Y-%m-%d")
                    d2 = datetime.strptime(dates[i+1][:10], "%Y-%m-%d")
                    gap = (d2 - d1).days
                    if gap <= 30:  # Two contracts within 30 days
                        timing_clusters.append({
                            "supplier": supplier,
                            "gap_days": gap,
                            "date1": dates[i][:10],
                            "date2": dates[i+1][:10],
                        })
                except (ValueError, IndexError):
                    continue

        results[council_id] = {
            "total_contracts": len(contracts),
            "awarded_contracts": len(awarded),
            "threshold_suspects": threshold_suspects[:10],
            "threshold_suspect_count": len(threshold_suspects),
            "repeat_winners": repeat_winners[:10],
            "repeat_winner_count": len(repeat_winners),
            "transparency_gap": {
                "no_value_count": len(no_value),
                "total_awarded": len(awarded),
                "pct": transparency_gap_pct,
            },
            "timing_clusters": timing_clusters[:10],
            "timing_cluster_count": len(timing_clusters),
            "late_publications": late_publications[:10],
            "late_publication_count": len(late_publications),
            "publication_timing": {
                "avg_delay_days": avg_pub_delay,
                "median_delay_days": median_pub_delay,
                "total_measured": len(pub_delays),
            },
            "weak_competition": weak_competition[:15],
            "weak_competition_count": len(weak_competition),
            "monopoly_categories": monopoly_categories[:10],
            "monopoly_category_count": len(monopoly_categories),
        }

        print(f"  {council_id.upper()}: {len(threshold_suspects)} threshold suspects, "
              f"{len(repeat_winners)} repeat winners, "
              f"{transparency_gap_pct}% value gap, "
              f"{len(timing_clusters)} timing clusters, "
              f"{len(late_publications)} late publications, "
              f"{len(weak_competition)} weak competition, "
              f"{len(monopoly_categories)} monopoly categories")

    return results


# ═══════════════════════════════════════════════════════════════════════
# ANALYSIS 6b: Supplier Contract Concentration
# ═══════════════════════════════════════════════════════════════════════

def analyse_supplier_concentration(all_spending):
    """Analyse how concentrated spending is among top suppliers.

    Calculates Herfindahl-Hirschman Index (HHI) and top-N concentration
    metrics to identify whether spend is dominated by a few suppliers.
    """
    results = {}

    for council_id, records in all_spending.items():
        tx = [r for r in records if r.get("amount", 0) > 0]
        if not tx:
            continue

        # Aggregate spend by supplier
        supplier_spend = defaultdict(lambda: {"total": 0, "count": 0})
        total_spend = 0
        for r in tx:
            supplier = r.get("supplier_canonical", r.get("supplier", "")) or "UNKNOWN"
            amt = r["amount"]
            supplier_spend[supplier]["total"] += amt
            supplier_spend[supplier]["count"] += 1
            total_spend += amt

        if total_spend == 0:
            continue

        # Sort by total spend descending
        ranked = sorted(
            [{"supplier": s, "total": d["total"], "count": d["count"]} for s, d in supplier_spend.items()],
            key=lambda x: x["total"],
            reverse=True,
        )

        # Calculate concentration metrics
        unique_suppliers = len(ranked)
        top5_spend = sum(s["total"] for s in ranked[:5])
        top10_spend = sum(s["total"] for s in ranked[:10])
        top20_spend = sum(s["total"] for s in ranked[:20])

        # HHI: sum of squared market shares (0-10000 scale)
        # <1500 = unconcentrated, 1500-2500 = moderate, >2500 = highly concentrated
        hhi = sum((s["total"] / total_spend * 100) ** 2 for s in ranked)

        results[council_id] = {
            "total_spend": round(total_spend, 2),
            "unique_suppliers": unique_suppliers,
            "top5": {
                "suppliers": [
                    {"supplier": s["supplier"], "total": round(s["total"], 2), "count": s["count"],
                     "pct": round(s["total"] / total_spend * 100, 1)}
                    for s in ranked[:5]
                ],
                "total": round(top5_spend, 2),
                "pct": round(top5_spend / total_spend * 100, 1),
            },
            "top10_pct": round(top10_spend / total_spend * 100, 1),
            "top20_pct": round(top20_spend / total_spend * 100, 1),
            "hhi": round(hhi, 1),
            "concentration_level": (
                "high" if hhi > 2500 else
                "moderate" if hhi > 1500 else
                "low"
            ),
        }

        print(f"  {council_id.upper()}: HHI={hhi:.0f} ({results[council_id]['concentration_level']}), "
              f"top5={top5_spend/total_spend*100:.1f}%, top10={top10_spend/total_spend*100:.1f}%")

    return results


# ═══════════════════════════════════════════════════════════════════════
# ANALYSIS 8: Fraud Triangle Risk Scoring
# ═══════════════════════════════════════════════════════════════════════

def analyse_fraud_triangle(council_id, all_spending, duplicates, cross_council, patterns, compliance, benfords, concentration, procurement_compliance):
    """Synthesise existing analysis signals into a fraud triangle risk model.

    The fraud triangle (Cressey 1953) identifies three conditions for fraud:
      - Opportunity: weak controls, procurement gaps, split payments
      - Pressure: year-end spikes, budget stress, rapid payment patterns
      - Rationalization: CH compliance gaps, data quality issues, late publications

    Each dimension scored 0-100. Overall risk = geometric mean of three dimensions.
    This is a SCREENING tool — high scores warrant investigation, not accusation.
    """
    signals = {"opportunity": [], "pressure": [], "rationalization": []}
    scores = {"opportunity": 0, "pressure": 0, "rationalization": 0}

    records = all_spending.get(council_id, [])
    if not records:
        return None

    total_spend = sum(r.get("amount", 0) for r in records if r.get("amount", 0) > 0)
    tx_count = len(records)

    # ── OPPORTUNITY signals ──

    # Split payments: higher instances = higher opportunity score
    if council_id in patterns:
        splits = patterns[council_id].get("split_payments", {})
        split_count = splits.get("total_suspects", 0)
        split_value = splits.get("total_value", 0)
        if split_count > 0:
            # Score: 10 base + 5 per instance, capped at 40
            opp_split = min(40, 10 + split_count * 5)
            signals["opportunity"].append({
                "signal": f"{split_count} suspected split payment instances ({fmt_gbp(split_value)})",
                "score": opp_split,
                "source": "payment_patterns"
            })
            scores["opportunity"] += opp_split

    # Weak competition from procurement
    if council_id in procurement_compliance:
        proc = procurement_compliance[council_id]
        weak_count = proc.get("weak_competition_count", 0)
        if weak_count > 0:
            opp_weak = min(30, weak_count * 6)
            signals["opportunity"].append({
                "signal": f"{weak_count} contracts with weak competition indicators",
                "score": opp_weak,
                "source": "procurement_compliance"
            })
            scores["opportunity"] += opp_weak

        # Category monopolies
        mono_count = proc.get("monopoly_category_count", 0)
        if mono_count > 0:
            opp_mono = min(20, mono_count * 4)
            signals["opportunity"].append({
                "signal": f"{mono_count} service categories with a single supplier",
                "score": opp_mono,
                "source": "procurement_compliance"
            })
            scores["opportunity"] += opp_mono

    # High supplier concentration
    if council_id in concentration:
        conc = concentration[council_id]
        hhi = conc.get("hhi", 0)
        if hhi > 2500:
            signals["opportunity"].append({
                "signal": f"Highly concentrated supplier market (HHI: {hhi:.0f})",
                "score": 15,
                "source": "supplier_concentration"
            })
            scores["opportunity"] += 15
        elif hhi > 1500:
            signals["opportunity"].append({
                "signal": f"Moderately concentrated supplier market (HHI: {hhi:.0f})",
                "score": 8,
                "source": "supplier_concentration"
            })
            scores["opportunity"] += 8

    # ── PRESSURE signals ──

    # Year-end spending spikes
    if council_id in patterns:
        yearend_data = patterns[council_id].get("year_end_spikes", {})
        yearend_depts = yearend_data.get("departments", []) if isinstance(yearend_data, dict) else yearend_data
        if yearend_depts:
            max_spike = max(s.get("spike_ratio", 0) for s in yearend_depts) if yearend_depts else 0
            if max_spike > 3:
                pres_ye = min(35, int((max_spike - 1) * 8))
                signals["pressure"].append({
                    "signal": f"Year-end spike: {max_spike:.1f}x monthly average in March",
                    "score": pres_ye,
                    "source": "payment_patterns"
                })
                scores["pressure"] += pres_ye

    # Duplicate payments suggest control pressure
    if council_id in duplicates:
        dup = duplicates[council_id]
        high_conf = dup.get("high_confidence", 0)
        high_val = dup.get("high_confidence_value", 0)
        if high_conf > 0:
            pres_dup = min(30, 5 + int(high_val / 10000))
            signals["pressure"].append({
                "signal": f"{high_conf} likely duplicate payments ({fmt_gbp(high_val)})",
                "score": pres_dup,
                "source": "duplicates"
            })
            scores["pressure"] += pres_dup

    # Round-number payments suggest estimation pressure
    if council_id in patterns:
        rounds = patterns[council_id].get("round_numbers", {})
        round_count = rounds.get("count", 0)
        round_value = rounds.get("total_value", 0)
        if round_count > 50 and round_value > 100000:
            pres_round = min(20, int(round_count / 10))
            signals["pressure"].append({
                "signal": f"{round_count} round-number payments over £5K ({fmt_gbp(round_value)})",
                "score": pres_round,
                "source": "payment_patterns"
            })
            scores["pressure"] += pres_round

    # Benford's Law anomaly
    if council_id in benfords:
        ben = benfords[council_id]
        max_dev = ben.get("max_digit_deviation", 0)
        if max_dev > 5:
            pres_ben = min(25, int(max_dev * 2))
            signals["pressure"].append({
                "signal": f"Benford's Law deviation: {max_dev:.1f}% max digit deviation",
                "score": pres_ben,
                "source": "benfords_law"
            })
            scores["pressure"] += pres_ben

    # ── RATIONALIZATION signals ──

    # CH compliance issues: paying non-compliant companies normalizes poor governance
    if council_id in compliance:
        comp = compliance[council_id]
        confirmed = comp.get("confirmed_during_breach", {})
        if confirmed.get("suppliers", 0) > 0:
            rat_ch = min(35, 15 + confirmed["suppliers"] * 3)
            signals["rationalization"].append({
                "signal": f"{confirmed['suppliers']} suppliers paid during active CH breaches ({fmt_gbp(confirmed['spend'])})",
                "score": rat_ch,
                "source": "ch_compliance"
            })
            scores["rationalization"] += rat_ch
        elif comp.get("total_flagged_suppliers", 0) > 0:
            rat_ch = min(20, comp["total_flagged_suppliers"] * 2)
            signals["rationalization"].append({
                "signal": f"{comp['total_flagged_suppliers']} suppliers with current CH red flags",
                "score": rat_ch,
                "source": "ch_compliance"
            })
            scores["rationalization"] += rat_ch

    # Late publications: retrospective transparency suggests a culture of opacity
    if council_id in procurement_compliance:
        proc = procurement_compliance[council_id]
        late_count = proc.get("late_publication_count", 0)
        if late_count > 0:
            rat_late = min(25, late_count * 3)
            signals["rationalization"].append({
                "signal": f"{late_count} contracts published after award date",
                "score": rat_late,
                "source": "procurement_compliance"
            })
            scores["rationalization"] += rat_late

    # Data quality gaps: missing descriptions, departments etc.
    # Check from spending records directly
    missing_desc = sum(1 for r in records if not r.get("description"))
    desc_pct = (missing_desc / tx_count * 100) if tx_count > 0 else 0
    if desc_pct > 90:
        signals["rationalization"].append({
            "signal": f"{desc_pct:.0f}% of transactions have no description",
            "score": 15,
            "source": "data_quality"
        })
        scores["rationalization"] += 15
    elif desc_pct > 50:
        signals["rationalization"].append({
            "signal": f"{desc_pct:.0f}% of transactions have no description",
            "score": 8,
            "source": "data_quality"
        })
        scores["rationalization"] += 8

    # Cap each dimension at 100
    for dim in scores:
        scores[dim] = min(100, scores[dim])

    # Overall risk: geometric mean of three dimensions (0-100)
    import math
    dims = [scores["opportunity"], scores["pressure"], scores["rationalization"]]
    if all(d > 0 for d in dims):
        overall = round(math.pow(dims[0] * dims[1] * dims[2], 1/3), 1)
    else:
        overall = round(sum(dims) / 3, 1)

    # Risk level
    if overall >= 60:
        risk_level = "elevated"
    elif overall >= 35:
        risk_level = "moderate"
    elif overall >= 15:
        risk_level = "low"
    else:
        risk_level = "minimal"

    result = {
        "overall_score": overall,
        "risk_level": risk_level,
        "dimensions": {
            "opportunity": {"score": scores["opportunity"], "signals": signals["opportunity"]},
            "pressure": {"score": scores["pressure"], "signals": signals["pressure"]},
            "rationalization": {"score": scores["rationalization"], "signals": signals["rationalization"]},
        },
        "methodology": "Fraud triangle (Cressey 1953): screening tool synthesising existing DOGE analysis signals. Not an accusation of fraud.",
        "total_signals": sum(len(s) for s in signals.values()),
    }

    print(f"  {council_id.upper()}: overall={overall:.0f}/100 ({risk_level}) — "
          f"O={scores['opportunity']}, P={scores['pressure']}, R={scores['rationalization']} — "
          f"{result['total_signals']} signals")

    return result


# ═══════════════════════════════════════════════════════════════════════
# OUTPUT: Generate Enhanced DOGE Findings JSON
# ═══════════════════════════════════════════════════════════════════════

def generate_doge_findings(council_id, duplicates, cross_council, patterns, compliance, benfords=None, concentration=None, procurement=None, fraud_triangle=None):
    """Generate enhanced doge_findings.json for a council."""

    findings = []
    key_findings = []

    # ── Compliance findings (temporal-aware) ──
    if council_id in compliance:
        comp = compliance[council_id]
        confirmed = comp.get("confirmed_during_breach", {})
        if confirmed.get("suppliers", 0) > 0:
            findings.append({
                "value": fmt_gbp(confirmed["spend"]),
                "label": "Paid During Active Breaches",
                "detail": f"{confirmed['suppliers']} suppliers received payments while in breach of Companies Act — including {comp['critical']['count']} critical and {comp['high']['count']} high severity. Temporally verified against payment dates.",
                "severity": "critical" if comp["critical"]["count"] > 0 else "warning",
                "confidence": "high",
                "link": "/spending",
            })

            # Top confirmed-during-breach findings as key_findings
            for f in comp.get("flagged_suppliers", [])[:3]:
                if f.get("temporal_status") == "confirmed" and f["max_severity"] in ("critical", "high"):
                    current_violations = [v for v in f["violations"] if v.get("current", False)]
                    violation_names = [v["title"] for v in current_violations] if current_violations else [v["title"] for v in f["violations"]]
                    key_findings.append({
                        "icon": "alert-triangle",
                        "badge": f["max_severity"].title(),
                        "title": f"{f['supplier'].title()}: {fmt_gbp(f['spend_during_breach'])} paid during active breach",
                        "description": "; ".join(violation_names),
                        "link": f"/spending?supplier={f['supplier']}",
                        "link_text": "View payments →",
                        "severity": "alert" if f["max_severity"] == "critical" else "warning",
                        "confidence": "high",
                    })
        elif comp["total_flagged_suppliers"] > 0:
            findings.append({
                "value": fmt_gbp(comp["total_flagged_spend"]),
                "label": "Suppliers with Current Red Flags",
                "detail": f"{comp['total_flagged_suppliers']} current suppliers have Companies House compliance issues (historical payments were made before breaches started)",
                "severity": "info",
                "confidence": "medium",
                "link": "/spending",
            })

    # ── Duplicate findings ──
    if council_id in duplicates:
        dup = duplicates[council_id]
        if dup["high_confidence"] > 0:
            csv_note = f" (after filtering {dup['filtered_csv_overlaps']} CSV republication artifacts)" if dup.get("filtered_csv_overlaps", 0) > 0 else ""
            findings.append({
                "value": fmt_gbp(dup["high_confidence_value"]),
                "label": "Likely Duplicate Payments",
                "detail": f"{dup['high_confidence']} high-confidence duplicate groups with same supplier, amount, date and reference (3+ copies){csv_note}",
                "severity": "critical" if dup["high_confidence_value"] > 50000 else "warning",
                "confidence": "medium",
                "context_note": "Quarterly CSV overlaps (same transaction appearing in 2 files) have been filtered out. Remaining duplicates show 3+ identical copies, which are more likely genuine overpayments.",
                "link": "/spending",
            })
        if dup["medium_confidence"] > 0:
            findings.append({
                "value": fmt_gbp(dup["medium_confidence_value"]),
                "label": "Possible Duplicate Payments",
                "detail": f"{dup['medium_confidence']} medium-confidence groups (same supplier/amount/date, different references)",
                "severity": "warning",
                "confidence": "low",
                "link": "/spending",
            })

    # ── Pattern findings ──
    if council_id in patterns:
        pat = patterns[council_id]

        if pat["split_payments"]["total_suspects"] > 0:
            findings.append({
                "value": fmt_gbp(pat["split_payments"]["total_value"]),
                "label": "Suspected Split Payments",
                "detail": f"{pat['split_payments']['total_suspects']} instances of 3+ payments just below approval thresholds in the same week",
                "severity": "warning",
                "confidence": "low",
                "context_note": "Split payment detection has a high false-positive rate. Batch processing, staged invoices, and legitimate recurring payments can all trigger this pattern. FOI request for procurement approval chain recommended before drawing conclusions.",
                "link": "/spending",
            })

        if pat["round_numbers"]["count"] > 0:
            findings.append({
                "value": fmt_gbp(pat["round_numbers"]["total_value"]),
                "label": "Round-Number Payments (>£5K)",
                "detail": f"{pat['round_numbers']['count']} exact round-number payments over £5,000 — may indicate estimates rather than invoiced amounts",
                "severity": "info",
                "confidence": "low",
                "link": "/spending",
            })

        if pat["year_end_spikes"]["departments"]:
            top_spike = pat["year_end_spikes"]["departments"][0]
            dept_name = top_spike['department'] or "Multiple departments"
            spike_severity = "warning" if top_spike['spike_ratio'] >= 3.0 else "info"
            findings.append({
                "value": f"{top_spike['spike_ratio']:.1f}x",
                "label": "Year-End Spending Pattern",
                "detail": f"{dept_name} spent {top_spike['spike_ratio']:.1f}x their monthly average in March ({fmt_gbp(top_spike['excess'])} above normal). Note: UK councils operate on April–March fiscal years, so elevated March spending is common as departments finalise annual budgets. Spikes above 3x warrant further scrutiny.",
                "severity": spike_severity,
                "confidence": "medium",
                "context_note": "March spending above the monthly average is expected for UK councils on April–March fiscal years. Compare against prior years' March figures for meaningful analysis.",
                "link": "/spending",
            })

        # ── Payment velocity findings ──
        cadence = pat.get("payment_cadence", {})
        rapid = cadence.get("rapid_payers", [])
        regular = cadence.get("regular_payers", [])
        if rapid:
            top_rapid = rapid[0]
            findings.append({
                "value": str(len(rapid)),
                "label": "Rapid Payment Suppliers",
                "detail": (
                    f"{len(rapid)} suppliers receive payments every <14 days on average. "
                    f"Top: {top_rapid['supplier'].title()} ({top_rapid['avg_days_between']} day avg, "
                    f"{top_rapid['payments']} payments, {fmt_gbp(top_rapid['total_spend'])})"
                ),
                "severity": "info",
                "confidence": "high",
                "link": "/spending",
            })
        if regular:
            key_findings.append({
                "icon": "clock",
                "badge": "Payment Pattern",
                "title": f"{len(regular)} suppliers with clock-like payment regularity",
                "description": (
                    f"These suppliers receive payments at near-identical intervals (std dev <5 days). "
                    f"Top: {regular[0]['supplier'].title()} — every {regular[0]['avg_days_between']} days "
                    f"({regular[0]['payments']} payments, {fmt_gbp(regular[0]['total_spend'])})"
                ),
                "link": "/spending",
                "link_text": "View patterns →",
                "severity": "info",
                "confidence": "high",
            })

        # High frequency supplier key finding
        if pat["high_frequency"]["suppliers"]:
            top_freq = pat["high_frequency"]["suppliers"][0]
            key_findings.append({
                "icon": "repeat",
                "badge": "High Volume",
                "title": f"{top_freq['supplier']}: {top_freq['transactions']} transactions totalling {fmt_gbp(top_freq['total'])}",
                "description": f"Averaging {fmt_gbp(top_freq['avg'])} per transaction — the council's most frequent supplier",
                "link": f"/spending?supplier={top_freq['supplier']}",
                "link_text": "See all transactions →",
                "severity": "info",
                "confidence": "high",
            })

    # ── Cross-council findings ──
    if cross_council:
        # Find shared suppliers relevant to this council
        council_shared = [
            s for s in cross_council.get("shared_suppliers", [])
            if council_id in s.get("councils", {})
        ]
        if council_shared:
            total_shared_spend = sum(
                s["councils"][council_id]["total"]
                for s in council_shared
            )
            key_findings.append({
                "icon": "users",
                "badge": "Cross-Council",
                "title": f"{len(council_shared)} suppliers shared with neighbouring councils — {fmt_gbp(total_shared_spend)} total",
                "description": "Compare what each council pays the same suppliers for similar services",
                "link": "/spending",
                "link_text": "Compare prices →",
                "severity": "info",
                "confidence": "high",
            })

        # High disparity finding — only meaningful comparisons (3+ txns each side, <10,000%)
        high_disp = [
            s for s in cross_council.get("high_disparity", [])
            if council_id in s.get("councils", {})
            and s["avg_disparity_pct"] > 100
            and s["avg_disparity_pct"] < 10000  # Filter extreme outliers
        ]
        if high_disp:
            worst = high_disp[0]
            h_council, h_data = worst["highest_avg"]
            l_council, l_data = worst["lowest_avg"]
            common_yr_count = h_data.get("common_years", 0)
            year_note = f" Compared using {common_yr_count} common financial year{'s' if common_yr_count != 1 else ''}." if common_yr_count > 0 else ""
            key_findings.append({
                "icon": "trending-up",
                "badge": "Price Gap",
                "title": f"{worst['supplier']}: {worst['avg_disparity_pct']:.0f}% price gap between councils",
                "description": (
                    f"{h_council.title()} pays {fmt_gbp(h_data['avg_transaction'])} avg vs "
                    f"{l_council.title()} {fmt_gbp(l_data['avg_transaction'])} (both with 3+ transactions).{year_note} "
                    f"Price differences may reflect different service scope, contract terms, or volumes "
                    f"rather than overcharging — manual review recommended."
                ),
                "context_note": "Cross-council price comparisons use common financial years only (where both councils have data for the same supplier). This prevents unfair comparisons between councils with different data periods. Differences may still reflect different service levels or contract terms.",
                "link": f"/spending?supplier={worst['supplier']}",
                "link_text": "Investigate →",
                "severity": "info",
                "confidence": "low",
            })

    # ── Benford's Law finding ──
    if benfords and council_id in benfords:
        bf = benfords[council_id]
        max_dev = bf.get('max_deviation_pct', 0)
        sample_size = bf.get('total_amounts_tested', 0)
        # For large samples (>10K), chi-squared is naturally inflated — use max digit
        # deviation as the practical indicator instead
        practically_significant = max_dev > 5.0  # >5% deviation from expected is meaningful
        if bf.get("conformity") in ("non_conforming", "marginal"):
            if practically_significant:
                bf_severity = "warning" if bf["conformity"] == "non_conforming" else "info"
                bf_detail = (
                    f"{bf['conformity_label']}. Digit {bf['max_deviation_digit']} deviates "
                    f"{max_dev}% from expected distribution across {sample_size:,} transactions. "
                    f"Note: with {sample_size:,} transactions, chi-squared tests are highly sensitive "
                    f"— the {max_dev}% max digit deviation is the more practical measure of anomaly."
                )
            else:
                bf_severity = "info"
                bf_detail = (
                    f"Digit distribution across {sample_size:,} transactions shows χ²={bf['chi_squared']} "
                    f"(statistically significant due to large sample size), but max digit deviation is only "
                    f"{max_dev}% — within the normal range for UK council spending patterns. "
                    f"No practical evidence of fabricated invoices."
                )
            findings.append({
                "value": f"{max_dev}% dev" if not practically_significant else f"χ²={bf['chi_squared']}",
                "label": "Benford's Law Analysis" if not practically_significant else "Benford's Law Anomaly",
                "detail": bf_detail,
                "severity": bf_severity,
                "confidence": "medium" if practically_significant else "low",
                "context_note": f"Chi-squared values on samples of {sample_size:,}+ transactions are naturally inflated and will almost always show statistical significance. The max digit deviation ({max_dev}%) is a more meaningful indicator — deviations under 5% are typical for legitimate council spending.",
                "link": "/spending",
            })
        elif bf.get("conformity") in ("conforming", "acceptable"):
            key_findings.append({
                "icon": "check-circle",
                "badge": "Forensic",
                "title": f"Benford's Law: No anomaly detected ({max_dev}% max deviation)",
                "description": f"Payment amounts conform to expected first-digit distribution across {sample_size:,} transactions — no signs of fabricated invoices.",
                "link": "/spending",
                "link_text": "View analysis →",
                "severity": "info",
                "confidence": "high",
            })

    # ── Weak competition findings (Phase 8.2) ──
    if procurement and council_id in procurement:
        proc = procurement[council_id]
        wc_count = proc.get("weak_competition_count", 0)
        mono_count = proc.get("monopoly_category_count", 0)

        if wc_count > 0:
            wc_top = proc["weak_competition"][0]
            wc_total_value = sum(w.get("awarded_value", 0) for w in proc["weak_competition"])
            findings.append({
                "value": str(wc_count),
                "label": "Weak Competition Indicators",
                "detail": (
                    f"{wc_count} contracts show signs of limited competition (short tender periods "
                    f"or rapid award). Top: {wc_top['title'][:50]} ({fmt_gbp(wc_top.get('awarded_value', 0))})"
                ),
                "severity": "warning" if wc_count >= 5 else "info",
                "confidence": "low",
                "context_note": (
                    "Contracts Finder does not publish bid counts. These flags use proxy signals: "
                    "tender periods under 14 days and awards within 7 days of deadline. "
                    "Short timelines may have legitimate explanations (framework call-offs, urgency)."
                ),
                "link": "/procurement",
            })

        if mono_count > 0:
            mono_top = proc["monopoly_categories"][0]
            key_findings.append({
                "icon": "shield-alert",
                "badge": "Competition",
                "title": f"{mono_count} service categories with a single supplier",
                "description": (
                    f"Top: {mono_top['supplier'][:40]} — sole winner in '{mono_top['cpv'][:40]}' "
                    f"({mono_top['contracts']} contracts, {fmt_gbp(mono_top['total_value'])}). "
                    f"Category monopolies may indicate market failure or specification bias."
                ),
                "link": "/procurement",
                "link_text": "View procurement →",
                "severity": "info",
                "confidence": "medium",
            })

    # Build payment velocity data for frontend display
    payment_velocity = None
    if council_id in patterns:
        cadence = patterns[council_id].get("payment_cadence", {})
        rapid = cadence.get("rapid_payers", [])
        regular = cadence.get("regular_payers", [])
        day_of_week = patterns[council_id].get("day_of_week", [])
        if rapid or regular:
            payment_velocity = {
                "rapid_payers": [
                    {
                        "supplier": p["supplier"],
                        "payments": p["payments"],
                        "avg_days": p["avg_days_between"],
                        "total_spend": p["total_spend"],
                        "regularity": p["regularity"],
                    }
                    for p in rapid[:10]
                ],
                "regular_payers": [
                    {
                        "supplier": p["supplier"],
                        "payments": p["payments"],
                        "avg_days": p["avg_days_between"],
                        "std_dev": p["std_dev_days"],
                        "total_spend": p["total_spend"],
                    }
                    for p in regular[:10]
                ],
                "day_of_week": day_of_week,
                "total_analysed": cadence.get("total_analysed", 0),
            }

    result = {
        "findings": findings[:8],  # Cap at 8
        "key_findings": key_findings[:6],  # Cap at 6
        "cta_link": "/spending",
        "cta_text": "Explore all spending data",
        "generated": str(datetime.now().isoformat()),
        "analyses_run": ["duplicates", "cross_council_pricing", "payment_patterns", "ch_compliance", "benfords_law", "supplier_concentration"],
    }
    if payment_velocity:
        result["payment_velocity"] = payment_velocity
    if concentration and council_id in concentration:
        result["supplier_concentration"] = concentration[council_id]
    if procurement and council_id in procurement:
        result["procurement_compliance"] = procurement[council_id]
    if fraud_triangle:
        result["fraud_triangle"] = fraud_triangle
        result["analyses_run"].append("fraud_triangle")
    return result


# ═══════════════════════════════════════════════════════════════════════
# ANALYSIS 5: Benford's Law Forensic Analysis
# ═══════════════════════════════════════════════════════════════════════

def analyse_benfords_law(all_spending):
    """Apply Benford's Law to detect anomalous digit distributions.

    Benford's Law predicts the frequency of leading digits in naturally occurring
    datasets. Financial fraud, fabricated invoices, and manipulated figures tend
    to deviate significantly from the expected distribution.

    Expected first-digit frequencies:
    1: 30.1%, 2: 17.6%, 3: 12.5%, 4: 9.7%, 5: 7.9%,
    6: 6.7%, 7: 5.8%, 8: 5.1%, 9: 4.6%

    Uses chi-squared goodness-of-fit test. p < 0.05 = significant deviation.
    """
    import math

    BENFORD_EXPECTED = {
        1: 0.301, 2: 0.176, 3: 0.125, 4: 0.097, 5: 0.079,
        6: 0.067, 7: 0.058, 8: 0.051, 9: 0.046,
    }

    results = {}

    for council_id, records in all_spending.items():
        # Use amounts > £100 (Benford's law works best with multi-digit numbers)
        amounts = [r["amount"] for r in records if r.get("amount", 0) > 100]
        if len(amounts) < 100:
            results[council_id] = {"status": "insufficient_data", "count": len(amounts)}
            continue

        # Count first digits
        digit_counts = defaultdict(int)
        for amt in amounts:
            first_digit = int(str(abs(amt)).lstrip('0').lstrip('.')[0])
            if 1 <= first_digit <= 9:
                digit_counts[first_digit] += 1

        total = sum(digit_counts.values())
        if total == 0:
            continue

        # Calculate observed vs expected frequencies
        digit_analysis = []
        chi_squared = 0
        max_deviation = 0
        max_deviation_digit = 0

        for d in range(1, 10):
            observed = digit_counts[d] / total
            expected = BENFORD_EXPECTED[d]
            deviation = observed - expected
            deviation_pct = round((deviation / expected) * 100, 1) if expected > 0 else 0

            # Chi-squared component
            expected_count = expected * total
            chi_sq_component = ((digit_counts[d] - expected_count) ** 2) / expected_count
            chi_squared += chi_sq_component

            if abs(deviation) > max_deviation:
                max_deviation = abs(deviation)
                max_deviation_digit = d

            digit_analysis.append({
                "digit": d,
                "observed_count": digit_counts[d],
                "observed_pct": round(observed * 100, 1),
                "expected_pct": round(expected * 100, 1),
                "deviation_pct": deviation_pct,
            })

        # Chi-squared test with 8 degrees of freedom (9 digits - 1)
        # Critical values: 15.51 (p=0.05), 20.09 (p=0.01), 26.12 (p=0.001)
        chi_squared = round(chi_squared, 2)
        if chi_squared > 26.12:
            conformity = "non_conforming"
            conformity_label = "Significant deviation from Benford's Law (p < 0.001)"
        elif chi_squared > 20.09:
            conformity = "marginal"
            conformity_label = "Marginal deviation (p < 0.01)"
        elif chi_squared > 15.51:
            conformity = "acceptable"
            conformity_label = "Mild deviation (p < 0.05) — within normal range"
        else:
            conformity = "conforming"
            conformity_label = "Conforms to Benford's Law (p > 0.05) — no anomaly"

        results[council_id] = {
            "total_amounts_tested": total,
            "chi_squared": chi_squared,
            "conformity": conformity,
            "conformity_label": conformity_label,
            "max_deviation_digit": max_deviation_digit,
            "max_deviation_pct": round(max_deviation * 100, 1),
            "digit_analysis": digit_analysis,
        }

        emoji = "✓" if conformity in ("conforming", "acceptable") else "⚠" if conformity == "marginal" else "✗"
        print(f"\n  {council_id.upper()}: {emoji} χ²={chi_squared} — {conformity_label}")
        print(f"    Tested {total} amounts > £100")
        print(f"    Largest deviation: digit {max_deviation_digit} ({round(max_deviation*100,1)}% off expected)")

    return results


# ═══════════════════════════════════════════════════════════════════════
# ANALYSIS 6: Self-Verification Engine
# ═══════════════════════════════════════════════════════════════════════

def run_verification(council_id, records, duplicates, cross_council, patterns, compliance, benfords=None):
    """Run automated self-verification checks on all findings.

    This challenges every finding with counter-evidence and rates confidence.
    The goal is to present only findings that survive scrutiny.
    """
    checks = []
    warnings = []

    # ── Check 1: Data completeness baseline ──
    total = len(records)
    if total == 0:
        return {"checks": [{"label": "No data", "status": "fail", "detail": "No spending records loaded"}], "warnings": [], "score": 0}

    has_date = sum(1 for r in records if r.get("date"))
    has_supplier = sum(1 for r in records if r.get("supplier_canonical"))
    has_amount = sum(1 for r in records if r.get("amount") and r["amount"] > 0)
    has_dept = sum(1 for r in records if r.get("department"))
    has_desc = sum(1 for r in records if r.get("description"))

    date_pct = has_date / total * 100
    supplier_pct = has_supplier / total * 100
    amount_pct = has_amount / total * 100
    dept_pct = has_dept / total * 100
    desc_pct = has_desc / total * 100

    checks.append({
        "label": "Data completeness",
        "status": "pass" if date_pct > 95 and supplier_pct > 95 else "warning",
        "detail": f"Dates: {date_pct:.1f}%, Suppliers: {supplier_pct:.1f}%, Amounts: {amount_pct:.1f}%, Departments: {dept_pct:.1f}%, Descriptions: {desc_pct:.1f}%",
        "metrics": {
            "date_pct": round(date_pct, 1),
            "supplier_pct": round(supplier_pct, 1),
            "amount_pct": round(amount_pct, 1),
            "dept_pct": round(dept_pct, 1),
            "desc_pct": round(desc_pct, 1),
        }
    })

    if desc_pct < 5:
        warnings.append(f"CRITICAL: Only {desc_pct:.1f}% of transactions have descriptions. This severely limits analysis quality.")

    # ── Check 2: Duplicate finding verification ──
    if council_id in duplicates:
        dup = duplicates[council_id]
        high_conf = dup.get("high_confidence", 0)
        high_val = dup.get("high_confidence_value", 0)
        med_conf = dup.get("medium_confidence", 0)
        filtered_batch = dup.get("filtered_batch_payments", 0)
        filtered_csv = dup.get("filtered_csv_overlaps", 0)

        if high_conf > 0:
            dup_ratio = high_conf / total * 100
            checks.append({
                "label": "Duplicate payment verification",
                "status": "pass" if dup_ratio < 5 else "warning",
                "detail": f"{high_conf} high-confidence groups ({fmt_gbp(high_val)}). Duplicate ratio: {dup_ratio:.1f}%. Filtered out: {filtered_batch} batch payments, {filtered_csv} CSV overlaps.",
            })
        elif filtered_batch > 0 or filtered_csv > 0:
            checks.append({
                "label": "Duplicate payment verification",
                "status": "pass",
                "detail": f"No high-confidence duplicates after filtering {filtered_batch} batch payments and {filtered_csv} CSV overlaps. Previous false positives eliminated.",
            })

    # ── Check 3: Split payment challenge ──
    if council_id in patterns:
        pat = patterns[council_id]
        splits = pat.get("split_payments", {})
        if splits.get("total_suspects", 0) > 0:
            split_val = splits["total_value"]
            total_spend = sum(r.get("amount", 0) for r in records if r.get("amount", 0) > 0)
            split_pct = split_val / total_spend * 100 if total_spend > 0 else 0

            checks.append({
                "label": "Split payment analysis",
                "status": "pass" if split_pct < 15 else "warning",
                "detail": f"{splits['total_suspects']} suspect instances ({fmt_gbp(split_val)}, {split_pct:.1f}% of spend). Threshold: 5+ payments to same supplier in same week, 80%+ of approval limit.",
            })

            if split_pct > 25:
                warnings.append(f"Split payments represent {split_pct:.1f}% of total spend. This high percentage may indicate the detection is still over-sensitive for this council's payment patterns.")
        else:
            checks.append({
                "label": "Split payment analysis",
                "status": "pass",
                "detail": "No suspicious split payment patterns detected with tightened thresholds (5+ payments, 80%+ of limit).",
            })

        # Year-end challenge
        spikes = pat.get("year_end_spikes", {})
        if spikes.get("departments"):
            top = spikes["departments"][0]
            checks.append({
                "label": "Year-end spike verification",
                "status": "pass" if top["spike_ratio"] < 3 else "warning",
                "detail": f"Highest spike: {top['spike_ratio']:.1f}x in {top['department'] or 'unknown dept'}. Year-end spikes are common in public sector (capital programmes, grants). Only extreme spikes (>3x) warrant concern.",
            })

            if top["spike_ratio"] < 1.5:
                warnings.append("Year-end spike is mild (<1.5x). This is within normal variance and should not be presented as a significant finding.")

    # ── Check 4: Companies House compliance verification ──
    if council_id in compliance:
        comp = compliance[council_id]
        confirmed = comp.get("confirmed_during_breach", {})

        if confirmed.get("suppliers", 0) > 0:
            checks.append({
                "label": "CH breach temporal verification",
                "status": "pass",
                "detail": f"{confirmed['suppliers']} suppliers with {fmt_gbp(confirmed['spend'])} confirmed during active breach periods. Enrichment errors excluded. Only dated violations with confirmed overlap flagged.",
            })
        else:
            pre = comp.get("pre_breach_payments", {})
            if pre.get("suppliers", 0) > 0:
                checks.append({
                    "label": "CH compliance — pre-breach only",
                    "status": "info",
                    "detail": f"{pre['suppliers']} suppliers have current breaches, but all payments were made before breaches started. Not violations at time of payment.",
                })
            else:
                checks.append({
                    "label": "CH compliance verification",
                    "status": "pass",
                    "detail": "No confirmed payments during active breach periods after filtering enrichment errors and undated violations.",
                })

    # ── Check 5: Cross-council price comparison challenge ──
    if cross_council:
        shared = [s for s in cross_council.get("shared_suppliers", []) if council_id in s.get("councils", {})]
        if shared:
            high_disp = [s for s in cross_council.get("high_disparity", [])
                        if council_id in s.get("councils", {}) and s["avg_disparity_pct"] > 200]

            checks.append({
                "label": "Cross-council price comparison",
                "status": "pass" if len(high_disp) < 5 else "warning",
                "detail": f"{len(shared)} shared suppliers found. {len(high_disp)} with >200% price gap (requiring 3+ transactions each side). Extreme disparities (>10,000%) filtered as different service scopes.",
            })

            if high_disp:
                warnings.append(f"{len(high_disp)} suppliers show >200% price disparity after filtering. These are more likely genuine value concerns than extreme outliers.")

    # ── Check 6: Benford's Law forensic screening ──
    if benfords and council_id in benfords:
        bf = benfords[council_id]
        if bf.get("status") != "insufficient_data":
            conformity = bf.get("conformity", "unknown")
            chi_sq = bf.get("chi_squared", 0)

            if conformity in ("conforming", "acceptable"):
                status = "pass"
            elif conformity == "marginal":
                status = "warning"
            else:
                status = "warning"
                warnings.append(f"Benford's Law analysis shows significant deviation (χ²={chi_sq}). Digit {bf.get('max_deviation_digit', '?')} deviates {bf.get('max_deviation_pct', '?')}% from expected. This warrants investigation but can also occur with legitimate round-number grants or threshold-based payments.")

            checks.append({
                "label": "Benford's Law forensic screening",
                "status": status,
                "detail": f"{bf['conformity_label']}. χ²={chi_sq} on {bf.get('total_amounts_tested', 0)} amounts >£100. Largest deviation: digit {bf.get('max_deviation_digit', '?')} ({bf.get('max_deviation_pct', '?')}% off expected).",
            })

    # ── Calculate overall verification score ──
    pass_count = sum(1 for c in checks if c["status"] == "pass")
    total_checks = len(checks)
    score = round(pass_count / total_checks * 100) if total_checks > 0 else 0

    return {
        "checks": checks,
        "warnings": warnings,
        "score": score,
        "total_checks": total_checks,
        "passed": pass_count,
        "generated": str(datetime.now().isoformat()),
    }


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Cross-Council DOGE Analysis")
    parser.add_argument("--council", help="Analyse single council (default: all)")
    parser.add_argument("--analysis", help="Run specific analysis: duplicates, pricing, patterns, compliance")
    parser.add_argument("--output", action="store_true", help="Write doge_findings.json files")
    args = parser.parse_args()

    councils = [args.council] if args.council else COUNCILS

    print("=" * 60)
    print("AI DOGE — Cross-Council Investigation Engine")
    print("=" * 60)

    # Load all data
    print("\nLoading spending data...")
    all_spending = {}
    for c in councils:
        records = load_spending(c)
        all_spending[c] = records
        print(f"  {c}: {len(records)} records")

    taxonomy = load_taxonomy()
    print(f"  taxonomy: {len(taxonomy.get('suppliers', {}))} suppliers")

    # Run analyses
    analyses = args.analysis.split(",") if args.analysis else ["duplicates", "pricing", "patterns", "compliance", "benfords"]

    duplicates = {}
    cross_council = {}
    patterns = {}
    compliance = {}
    benfords = {}

    if "duplicates" in analyses:
        print("\n" + "=" * 60)
        print("ANALYSIS 1: Duplicate Payment Deep Dive")
        print("=" * 60)
        duplicates = analyse_duplicates(all_spending)

    if "pricing" in analyses:
        print("\n" + "=" * 60)
        print("ANALYSIS 2: Cross-Council Supplier Price Comparison")
        print("=" * 60)
        cross_council = analyse_cross_council_pricing(all_spending, taxonomy)

    if "patterns" in analyses:
        print("\n" + "=" * 60)
        print("ANALYSIS 3: Payment Pattern Analysis")
        print("=" * 60)
        patterns = analyse_payment_patterns(all_spending)

    if "compliance" in analyses:
        print("\n" + "=" * 60)
        print("ANALYSIS 4: Companies House Compliance")
        print("=" * 60)
        compliance = analyse_ch_compliance(all_spending, taxonomy)

    if "benfords" in analyses:
        print("\n" + "=" * 60)
        print("ANALYSIS 5: Benford's Law Forensic Screening")
        print("=" * 60)
        benfords = analyse_benfords_law(all_spending)

    # ── Supplier Concentration Analysis ──
    concentration = {}
    if True:  # Always run
        print("\n" + "=" * 60)
        print("ANALYSIS 6b: Supplier Contract Concentration")
        print("=" * 60)
        concentration = analyse_supplier_concentration(all_spending)

    # ── Procurement Compliance Analysis ──
    procurement_compliance = {}
    if True:  # Always run
        print("\n" + "=" * 60)
        print("ANALYSIS 7: Procurement Compliance")
        print("=" * 60)
        procurement_compliance = analyse_procurement_compliance(councils)

    # ── Fraud Triangle Risk Scoring ──
    fraud_triangles = {}
    if True:  # Always run
        print("\n" + "=" * 60)
        print("ANALYSIS 8: Fraud Triangle Risk Scoring")
        print("=" * 60)
        for c in councils:
            ft = analyse_fraud_triangle(c, all_spending, duplicates, cross_council, patterns, compliance, benfords, concentration, procurement_compliance)
            if ft:
                fraud_triangles[c] = ft

    # Generate output files
    if args.output or True:  # Always output for now
        print("\n" + "=" * 60)
        print("Generating DOGE Findings")
        print("=" * 60)

        for c in councils:
            findings = generate_doge_findings(c, duplicates, cross_council, patterns, compliance, benfords, concentration, procurement_compliance, fraud_triangles.get(c))
            output_path = DATA_DIR / c / "doge_findings.json"
            with open(output_path, "w") as f:
                json.dump(findings, f, indent=2)
            print(f"  {c}: {len(findings['findings'])} findings, {len(findings['key_findings'])} key findings → {output_path}")

        # Run self-verification on each council
        print("\n" + "=" * 60)
        print("ANALYSIS 6: Self-Verification Engine")
        print("=" * 60)
        for c in councils:
            verification = run_verification(c, all_spending[c], duplicates, cross_council, patterns, compliance, benfords)
            verify_path = DATA_DIR / c / "doge_verification.json"
            with open(verify_path, "w") as f:
                json.dump(verification, f, indent=2)
            score = verification["score"]
            passed = verification["passed"]
            total_checks = verification["total_checks"]
            warnings_count = len(verification["warnings"])
            emoji = "✓" if score >= 80 else "⚠" if score >= 60 else "✗"
            print(f"  {c}: {emoji} {passed}/{total_checks} checks passed (score: {score}/100), {warnings_count} warnings → {verify_path}")
            for w in verification["warnings"]:
                print(f"    ⚠ {w}")

        # Also save full analysis results
        full_results = {
            "duplicates": duplicates,
            "cross_council_pricing": cross_council,
            "payment_patterns": patterns,
            "compliance": compliance,
            "benfords_law": benfords,
            "supplier_concentration": concentration,
            "procurement_compliance": procurement_compliance,
            "fraud_triangles": fraud_triangles,
            "generated": str(datetime.now().isoformat()),
        }
        results_path = DATA_DIR / "doge_analysis_results.json"
        with open(results_path, "w") as f:
            json.dump(full_results, f, indent=2, default=str)
        print(f"\n  Full results → {results_path}")

    print("\n" + "=" * 60)
    print("DOGE Analysis Complete")
    print("=" * 60)


if __name__ == "__main__":
    main()
