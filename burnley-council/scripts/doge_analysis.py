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
COUNCILS = ["burnley", "hyndburn", "pendle"]


def load_spending(council_id):
    """Load spending.json for a council."""
    path = DATA_DIR / council_id / "spending.json"
    if not path.exists():
        print(f"  WARNING: No spending data for {council_id}")
        return []
    with open(path) as f:
        return json.load(f)


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
    """Find true duplicate payments — same supplier, amount, date, reference."""
    results = {}

    for council_id, records in all_spending.items():
        tx = [r for r in records if r.get("amount", 0) > 0]

        # Group by supplier + amount + date
        groups = defaultdict(list)
        for r in tx:
            key = (
                r.get("supplier_canonical", r.get("supplier", "")),
                r.get("amount", 0),
                r.get("date", ""),
            )
            groups[key].append(r)

        # Find duplicates (2+ payments with same key)
        dup_groups = []
        for (supplier, amount, date), recs in groups.items():
            if len(recs) < 2:
                continue

            # Sub-group by reference to separate true dupes from batch payments
            refs = defaultdict(list)
            for r in recs:
                ref = r.get("reference", "") or "no_ref"
                refs[ref].append(r)

            # Same reference = very likely true duplicate
            true_dupes = {ref: rs for ref, rs in refs.items() if len(rs) > 1}
            # Different references = possible batch payment (lower confidence)
            diff_refs = len(refs) > 1

            confidence = "high" if true_dupes else ("medium" if not diff_refs else "low")
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
                "references": list(set(r.get("reference", "") for r in recs if r.get("reference"))),
            })

        dup_groups.sort(key=lambda x: -x["potential_overpayment"])

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
            "top_20": dup_groups[:20],
        }

        print(f"\n  {council_id.upper()}:")
        print(f"    Duplicate groups: {len(dup_groups)}")
        print(f"    High confidence: {len(high_conf)} worth {fmt_gbp(sum(d['potential_overpayment'] for d in high_conf))}")
        print(f"    Medium confidence: {len(med_conf)} worth {fmt_gbp(sum(d['potential_overpayment'] for d in med_conf))}")
        if dup_groups:
            print(f"    Top duplicate: {dup_groups[0]['supplier']} — {fmt_gbp(dup_groups[0]['potential_overpayment'])} ({dup_groups[0]['occurrences']}x {fmt_gbp(dup_groups[0]['amount'])} on {dup_groups[0]['date']})")

    return results


# ═══════════════════════════════════════════════════════════════════════
# ANALYSIS 2: Cross-Council Supplier Price Comparison
# ═══════════════════════════════════════════════════════════════════════

def analyse_cross_council_pricing(all_spending, taxonomy):
    """Compare prices when the same supplier serves multiple councils."""
    # Build per-council supplier profiles
    council_suppliers = {}
    for council_id, records in all_spending.items():
        tx = [r for r in records if r.get("amount", 0) > 0]
        suppliers = defaultdict(lambda: {"total": 0, "count": 0, "amounts": [], "years": set()})
        for r in tx:
            s = r.get("supplier_canonical", r.get("supplier", ""))
            suppliers[s]["total"] += r["amount"]
            suppliers[s]["count"] += 1
            suppliers[s]["amounts"].append(r["amount"])
            if r.get("financial_year"):
                suppliers[s]["years"].add(r["financial_year"])
        council_suppliers[council_id] = suppliers

    # Find suppliers appearing in 2+ councils
    all_supplier_names = set()
    for suppliers in council_suppliers.values():
        all_supplier_names.update(suppliers.keys())

    shared_suppliers = []
    for name in sorted(all_supplier_names):
        councils_with = {}
        for council_id, suppliers in council_suppliers.items():
            if name in suppliers:
                s = suppliers[name]
                councils_with[council_id] = {
                    "total": round(s["total"], 2),
                    "count": s["count"],
                    "avg_transaction": round(s["total"] / s["count"], 2) if s["count"] > 0 else 0,
                    "median_transaction": round(sorted(s["amounts"])[len(s["amounts"]) // 2], 2) if s["amounts"] else 0,
                    "years_active": len(s["years"]),
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
    high_disparity = sorted(
        [s for s in shared_suppliers if s["total_combined"] > 10000],
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

    # Common UK council approval thresholds
    THRESHOLDS = [500, 1000, 5000, 10000, 25000, 50000, 100000]

    for council_id, records in all_spending.items():
        tx = [r for r in records if r.get("amount", 0) > 0]

        # ── Split Payments ──
        # Same supplier, multiple payments in same week, all just below a threshold
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
            if len(recs) < 3:  # Need 3+ to be suspicious
                continue
            amounts = [r["amount"] for r in recs]
            total = sum(amounts)
            max_amt = max(amounts)

            # Check if all payments are just below a threshold
            for threshold in THRESHOLDS:
                below = [a for a in amounts if a < threshold and a > threshold * 0.5]
                if len(below) >= 3 and total > threshold:
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
        }

        print(f"\n  {council_id.upper()}:")
        print(f"    Split payment suspects: {len(split_payment_suspects)} worth {fmt_gbp(sum(s['total'] for s in split_payment_suspects))}")
        print(f"    Year-end spike departments: {len(year_end_spikes)}")
        print(f"    Round number payments (>5K): {len(round_payments)} worth {fmt_gbp(sum(r['amount'] for r in round_payments))}")
        print(f"    High-frequency suppliers (50+ txns): {len(high_freq)}")

    return results


# ═══════════════════════════════════════════════════════════════════════
# ANALYSIS 4: Companies House Red Flags
# ═══════════════════════════════════════════════════════════════════════

def _payment_overlaps_violation(payment_date, violation):
    """Check if a payment date falls within a violation's active period.

    Returns:
        "during"  — payment was made while breach was active
        "before"  — payment was made before breach started (no issue)
        "after"   — payment was made after breach was resolved (no issue)
        "unknown" — can't determine (no dates available)
    """
    if not payment_date:
        return "unknown"

    active_from = violation.get("active_from")
    active_to = violation.get("active_to")

    if not active_from:
        # If we don't know when the violation started, we can only flag
        # if it's currently active (conservative approach)
        if violation.get("current", False):
            return "during"  # Conservative: assume current violations affect recent payments
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
    violation_map = {}
    for canonical, data in suppliers.items():
        ch = data.get("companies_house")
        if not ch or not isinstance(ch, dict) or not ch.get("enriched"):
            continue
        violations = ch.get("violations", [])
        if violations:
            violation_map[canonical.upper()] = {
                "company_name": canonical,
                "company_number": ch.get("company_number", ""),
                "status": ch.get("status", ""),
                "violations": violations,
                "max_severity": ch.get("max_severity_label", ""),
                "active_directors": ch.get("active_directors"),
                "accounts_overdue": ch.get("accounts_overdue", False),
            }

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
# OUTPUT: Generate Enhanced DOGE Findings JSON
# ═══════════════════════════════════════════════════════════════════════

def generate_doge_findings(council_id, duplicates, cross_council, patterns, compliance):
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
                    })
        elif comp["total_flagged_suppliers"] > 0:
            findings.append({
                "value": fmt_gbp(comp["total_flagged_spend"]),
                "label": "Suppliers with Current Red Flags",
                "detail": f"{comp['total_flagged_suppliers']} current suppliers have Companies House compliance issues (historical payments were made before breaches started)",
                "severity": "info",
                "link": "/spending",
            })

    # ── Duplicate findings ──
    if council_id in duplicates:
        dup = duplicates[council_id]
        if dup["high_confidence"] > 0:
            findings.append({
                "value": fmt_gbp(dup["high_confidence_value"]),
                "label": "Likely Duplicate Payments",
                "detail": f"{dup['high_confidence']} high-confidence duplicate groups with same supplier, amount, date and reference number",
                "severity": "critical",
                "link": "/spending",
            })
        if dup["medium_confidence"] > 0:
            findings.append({
                "value": fmt_gbp(dup["medium_confidence_value"]),
                "label": "Possible Duplicate Payments",
                "detail": f"{dup['medium_confidence']} medium-confidence groups (same supplier/amount/date, different references)",
                "severity": "warning",
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
                "link": "/spending",
            })

        if pat["round_numbers"]["count"] > 0:
            findings.append({
                "value": fmt_gbp(pat["round_numbers"]["total_value"]),
                "label": "Round-Number Payments (>£5K)",
                "detail": f"{pat['round_numbers']['count']} exact round-number payments over £5,000 — may indicate estimates rather than invoiced amounts",
                "severity": "info",
                "link": "/spending",
            })

        if pat["year_end_spikes"]["departments"]:
            top_spike = pat["year_end_spikes"]["departments"][0]
            dept_name = top_spike['department'] or "Multiple departments"
            findings.append({
                "value": f"{top_spike['spike_ratio']:.1f}x",
                "label": "Year-End Spending Spike",
                "detail": f"{dept_name} spent {top_spike['spike_ratio']:.1f}x their monthly average in March — potential year-end budget rush worth {fmt_gbp(top_spike['excess'])} above normal",
                "severity": "warning",
                "link": "/spending",
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
            })

        # High disparity finding
        high_disp = [
            s for s in cross_council.get("high_disparity", [])
            if council_id in s.get("councils", {})
            and s["avg_disparity_pct"] > 100
        ]
        if high_disp:
            worst = high_disp[0]
            h_council, h_data = worst["highest_avg"]
            l_council, l_data = worst["lowest_avg"]
            key_findings.append({
                "icon": "trending-up",
                "badge": "Price Gap",
                "title": f"{worst['supplier']}: {worst['avg_disparity_pct']:.0f}% price gap between councils",
                "description": f"{h_council.title()} pays {fmt_gbp(h_data['avg_transaction'])} avg vs {l_council.title()} {fmt_gbp(l_data['avg_transaction'])}",
                "link": f"/spending?supplier={worst['supplier']}",
                "link_text": "Investigate →",
                "severity": "warning",
            })

    return {
        "findings": findings[:8],  # Cap at 8
        "key_findings": key_findings[:6],  # Cap at 6
        "cta_link": "/spending",
        "cta_text": "Explore all spending data",
        "generated": str(datetime.now().isoformat()),
        "analyses_run": ["duplicates", "cross_council_pricing", "payment_patterns", "ch_compliance"],
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
    analyses = args.analysis.split(",") if args.analysis else ["duplicates", "pricing", "patterns", "compliance"]

    duplicates = {}
    cross_council = {}
    patterns = {}
    compliance = {}

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

    # Generate output files
    if args.output or True:  # Always output for now
        print("\n" + "=" * 60)
        print("Generating DOGE Findings")
        print("=" * 60)

        for c in councils:
            findings = generate_doge_findings(c, duplicates, cross_council, patterns, compliance)
            output_path = DATA_DIR / c / "doge_findings.json"
            with open(output_path, "w") as f:
                json.dump(findings, f, indent=2)
            print(f"  {c}: {len(findings['findings'])} findings, {len(findings['key_findings'])} key findings → {output_path}")

        # Also save full analysis results
        full_results = {
            "duplicates": duplicates,
            "cross_council_pricing": cross_council,
            "payment_patterns": patterns,
            "compliance": compliance,
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
