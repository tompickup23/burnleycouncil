#!/usr/bin/env python3
"""
Generate compact chat briefings per council for Ask Lancashire.

Produces two files per council:
  - chat_briefing_core.json  (~1.5K tokens) — always loaded
  - chat_briefing_detail.json (~2-3K tokens per topic) — loaded by topic

Run after any data ETL to keep briefings fresh.

Usage:
    python3 scripts/generate_chat_briefings.py
"""

import json
import os
import re
import sys
from pathlib import Path
from collections import defaultdict

DATA_ROOT = Path(__file__).parent.parent / "burnley-council" / "data"

COUNCILS = [
    "burnley", "hyndburn", "pendle", "rossendale", "lancaster", "ribble_valley",
    "chorley", "south_ribble", "lancashire_cc", "blackpool", "west_lancashire",
    "blackburn", "wyre", "preston", "fylde"
]


def load(council, filename):
    path = DATA_ROOT / council / filename
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def fmt_money(v):
    if not isinstance(v, (int, float)):
        return str(v)
    if abs(v) >= 1_000_000:
        return f"£{v/1_000_000:.1f}M"
    if abs(v) >= 1_000:
        return f"£{v/1_000:.0f}K"
    return f"£{v:.0f}"


def build_core(council):
    """Build compact always-loaded briefing (~1.5K tokens)."""
    lines = []

    # Config
    config = load(council, "config.json") or {}
    name = config.get("council_name", council.replace("_", " ").title())
    tier = config.get("council_type", "district")
    lines.append(f"COUNCIL: {name}")
    lines.append(f"Type: {tier}")
    if config.get("population"):
        lines.append(f"Population: {config['population']:,}" if isinstance(config['population'], int) else f"Population: {config['population']}")

    # Budget headline
    bs = load(council, "budgets_summary.json") or {}
    headline = bs.get("headline", {})
    if headline.get("total_service_expenditure"):
        lines.append(f"Total service expenditure: {fmt_money(headline['total_service_expenditure'])}")
    if headline.get("net_revenue_expenditure"):
        lines.append(f"Net revenue: {fmt_money(headline['net_revenue_expenditure'])}")
    ct = bs.get("council_tax", {})
    if isinstance(ct, dict):
        if ct.get("band_d"):
            lines.append(f"Band D council tax (council share): £{ct['band_d']}")
        elif ct.get("band_d_by_year"):
            years = ct["band_d_by_year"]
            latest = max(years.keys()) if years else None
            if latest:
                lines.append(f"Band D council tax (council share, {latest}): £{years[latest]}")
        if ct.get("band_d_total_by_year"):
            years = ct["band_d_total_by_year"]
            latest = max(years.keys()) if years else None
            if latest:
                lines.append(f"Band D total (all preceptors, {latest}): £{years[latest]}")
    elif isinstance(ct, (int, float)):
        lines.append(f"Band D council tax: £{ct:.2f}")
    fy = bs.get("financial_year", "")
    if fy:
        lines.append(f"Financial year: {fy}")

    # Spending categories (top 5)
    bm = load(council, "budget_mapping.json") or {}
    cats = bm.get("category_summary", {})
    if isinstance(cats, dict) and cats:
        sorted_cats = sorted(cats.items(), key=lambda x: -(x[1] if isinstance(x[1], (int, float)) else 0))
        lines.append("Top spending categories:")
        for cat, total in sorted_cats[:7]:
            if isinstance(total, (int, float)):
                lines.append(f"  {cat}: {fmt_money(total)}")

    # Spending stats
    ss = load(council, "spending-stats.json") or {}
    txn_count = ss.get("total_transactions") or ss.get("transaction_count")
    total_spend = ss.get("total_amount") or ss.get("total_spend")
    if txn_count:
        lines.append(f"Total transactions: {txn_count:,}" if isinstance(txn_count, int) else f"Total transactions: {txn_count}")
    if total_spend:
        lines.append(f"Total spend tracked: {fmt_money(total_spend)}")
    top_suppliers = ss.get("top_suppliers", [])
    if top_suppliers:
        lines.append("Top 5 suppliers:")
        for s in top_suppliers[:5]:
            if isinstance(s, dict):
                name = s.get("name", s.get("supplier", "?"))
                total = s.get("total", s.get("amount", s.get("total_spend", 0)))
                count = s.get("count", s.get("transactions", s.get("transaction_count", 0)))
                lines.append(f"  {name}: {fmt_money(total)} ({count} txns)")
            elif isinstance(s, (list, tuple)) and len(s) >= 2:
                lines.append(f"  {s[0]}: {fmt_money(s[1])}")

    # Political control
    pol = load(council, "politics_summary.json") or {}
    seats = pol.get("seats", pol.get("party_seats", {}))
    if isinstance(seats, dict) and seats:
        sorted_seats = sorted(seats.items(), key=lambda x: -(x[1] if isinstance(x[1], int) else 0))
        lines.append("Political seats: " + ", ".join(f"{p} {n}" for p, n in sorted_seats))
        total = sum(v for v in seats.values() if isinstance(v, int))
        if total:
            lines.append(f"Total seats: {total}")
    control = pol.get("control", pol.get("administration", ""))
    if control:
        lines.append(f"Control: {control}")

    # Councillor count
    cr = load(council, "councillors.json")
    if cr:
        councillors = cr if isinstance(cr, list) else cr.get("councillors", [])
        lines.append(f"Councillors: {len(councillors)}")

    # Integrity summary
    integrity = load(council, "integrity.json")
    if integrity:
        clist = integrity if isinstance(integrity, list) else integrity.get("councillors", integrity.get("results", []))
        if isinstance(clist, list):
            flagged = sum(1 for c in clist if c.get("score", 0) > 0 or c.get("flags"))
            lines.append(f"Integrity flags: {flagged} councillors flagged")

    # Demographics headline
    demo = load(council, "demographics.json")
    if demo and isinstance(demo, dict):
        summary = demo.get("summary", demo.get("meta", {}))
        if isinstance(summary, dict):
            if summary.get("total_population"):
                lines.append(f"Census 2021 population: {summary['total_population']:,}" if isinstance(summary['total_population'], int) else "")
            if summary.get("median_age"):
                lines.append(f"Median age: {summary['median_age']}")

    # Roadworks (LCC only or if available)
    ra = load(council, "roadworks_analytics.json")
    if not ra and council != "lancashire_cc":
        ra = load("lancashire_cc", "roadworks_analytics.json")
    if ra:
        meta = ra.get("meta", {})
        lines.append(f"Active roadworks: {meta.get('live_works', '?')}")
        dur = ra.get("duration_analysis", {})
        if dur.get("overdue_count"):
            lines.append(f"Overdue roadworks: {dur['overdue_count']}")

    return "\n".join(l for l in lines if l)


def build_detail(council):
    """Build topic-specific detail blocks (~500-800 tokens each)."""
    details = {}

    # COUNCILLORS detail
    cr = load(council, "councillors.json")
    if cr:
        councillors = cr if isinstance(cr, list) else cr.get("councillors", [])
        lines = [f"ALL COUNCILLORS ({len(councillors)}):"]
        for c in councillors:
            name = c.get("name", "?")
            clean = re.sub(r"^(County |Borough )?Councillor\s+", "", name)
            party = c.get("party", "?")
            ward = c.get("ward", c.get("division", "?"))
            lines.append(f"  {clean} | {party} | {ward}")
        details["councillors"] = "\n".join(lines)

    # INTEGRITY detail
    integrity = load(council, "integrity.json")
    if integrity:
        clist = integrity if isinstance(integrity, list) else integrity.get("councillors", integrity.get("results", []))
        if isinstance(clist, list):
            flagged = [c for c in clist if c.get("score", 0) > 0 or c.get("flags")]
            flagged.sort(key=lambda x: -(x.get("score", 0) or 0))
            lines = [f"INTEGRITY FLAGS ({len(flagged)} councillors):"]
            for c in flagged[:20]:
                name = c.get("name", "?")
                score = c.get("score", 0)
                flags = c.get("flag_count", len(c.get("flags", [])))
                top_flag = ""
                if c.get("flags") and isinstance(c["flags"], list) and c["flags"]:
                    top_flag = c["flags"][0].get("type", "") if isinstance(c["flags"][0], dict) else str(c["flags"][0])
                lines.append(f"  {name}: score {score}, {flags} flags{' — ' + top_flag if top_flag else ''}")
            details["integrity"] = "\n".join(lines)

    # BUDGET detail
    bs = load(council, "budgets_summary.json") or {}
    svc = bs.get("service_breakdown", {})
    if svc:
        lines = ["SERVICE BREAKDOWN:"]
        for k, v in sorted(svc.items(), key=lambda x: -(x[1] if isinstance(x[1], (int, float)) else 0)):
            if isinstance(v, (int, float)):
                lines.append(f"  {k}: {fmt_money(v)}")
        reserves = bs.get("reserves", {})
        if isinstance(reserves, dict):
            for k, v in reserves.items():
                if isinstance(v, (int, float)):
                    lines.append(f"  Reserves — {k}: {fmt_money(v)}")
        details["budgets"] = "\n".join(lines)

    # ELECTIONS detail
    elections = load(council, "elections.json")
    if elections and isinstance(elections, dict):
        lines = ["ELECTION RESULTS:"]
        count = 0
        for ward, info in elections.items():
            if count >= 30:
                break
            if isinstance(info, dict):
                holder = info.get("holder", info.get("current", {}))
                if isinstance(holder, dict):
                    lines.append(f"  {ward}: {holder.get('name', '?')} ({holder.get('party', '?')})" +
                                 (f" maj {holder.get('majority', '')}" if holder.get('majority') else ""))
                elif isinstance(holder, str):
                    lines.append(f"  {ward}: {holder}")
                count += 1
        details["elections"] = "\n".join(lines)

    # ROADWORKS detail
    ra = load(council, "roadworks_analytics.json")
    if not ra and council != "lancashire_cc":
        ra = load("lancashire_cc", "roadworks_analytics.json")
    if ra:
        lines = ["ROADWORKS INTELLIGENCE:"]
        meta = ra.get("meta", {})
        lines.append(f"Active: {meta.get('live_works', '?')}, Archived: {meta.get('archived_works', '?')}")
        league = ra.get("operator_league", [])
        if league:
            lines.append("Operator league (top 10):")
            for op in league[:10]:
                lines.append(f"  {op['operator']}: {op['total_works']} works, avg {op.get('avg_duration_days', '?')}d, overrun {op.get('overrun_pct', '?')}%")
        dur = ra.get("duration_analysis", {})
        if dur.get("overdue_works"):
            lines.append(f"Overdue works ({dur.get('overdue_count', 0)}):")
            for w in dur["overdue_works"][:10]:
                lines.append(f"  {w['road']} ({w['district']}): {w['days_overdue']}d overdue, {w['operator']}")
        if dur.get("longest_running"):
            lines.append("Longest running:")
            for w in dur["longest_running"][:5]:
                lines.append(f"  {w['road']} ({w['district']}): {w['days']}d, {w['operator']}")
        sev = ra.get("severity_trends", {}).get("current", {})
        if sev:
            lines.append(f"Severity: high {sev.get('high',0)}, medium {sev.get('medium',0)}, low {sev.get('low',0)}")
        details["roads"] = "\n".join(lines)

    # HEALTH detail
    health = load(council, "health.json")
    if health and isinstance(health, dict):
        summary = health.get("summary", health.get("meta", {}))
        if summary:
            lines = ["HEALTH DATA:"]
            for k, v in list(summary.items())[:15]:
                lines.append(f"  {k}: {v}")
            details["health"] = "\n".join(lines)

    # ECONOMY detail
    economy = load(council, "economy.json")
    if economy and isinstance(economy, dict):
        summary = economy.get("summary", economy.get("meta", {}))
        if summary:
            lines = ["ECONOMY DATA:"]
            for k, v in list(summary.items())[:15]:
                lines.append(f"  {k}: {v}")
            details["economy"] = "\n".join(lines)

    # HOUSING detail
    housing = load(council, "housing.json")
    if housing and isinstance(housing, dict):
        summary = housing.get("summary", housing.get("meta", {}))
        if summary:
            lines = ["HOUSING DATA:"]
            for k, v in list(summary.items())[:15]:
                lines.append(f"  {k}: {v}")
            details["housing"] = "\n".join(lines)

    # MEETINGS / COUNCIL DOCUMENTS
    docs = load(council, "council_documents.json")
    if docs:
        items = docs if isinstance(docs, list) else docs.get("documents", docs.get("decisions", []))
        lines = [f"COUNCIL DECISIONS ({len(items)}):"]
        for d in items[:15]:
            if isinstance(d, dict):
                lines.append(f"  {d.get('title', d.get('subject', '?'))[:80]} ({d.get('date', '?')})")
        details["meetings"] = "\n".join(lines)

    # DEMOGRAPHICS
    demo = load(council, "demographics.json")
    if demo and isinstance(demo, dict):
        summary = demo.get("summary", demo.get("meta", {}))
        if summary:
            lines = ["DEMOGRAPHICS:"]
            for k, v in list(summary.items())[:20]:
                lines.append(f"  {k}: {v}")
            details["demographics"] = "\n".join(lines)

    # DEPRIVATION
    dep = load(council, "deprivation.json")
    if dep and isinstance(dep, dict):
        summary = dep.get("summary", dep.get("meta", {}))
        if summary:
            lines = ["DEPRIVATION (IMD 2019):"]
            for k, v in list(summary.items())[:10]:
                lines.append(f"  {k}: {v}")
            details["health"] = details.get("health", "") + "\n" + "\n".join(lines)

    return details


def main():
    total_core = 0
    total_detail = 0

    for council in COUNCILS:
        council_dir = DATA_ROOT / council
        if not council_dir.exists():
            print(f"  SKIP {council} — no data directory")
            continue

        # Core briefing
        core = build_core(council)
        core_path = council_dir / "chat_briefing_core.json"
        with open(core_path, "w") as f:
            json.dump({"council": council, "briefing": core}, f)
        core_tokens = len(core) // 4  # rough estimate

        # Detail briefing
        detail = build_detail(council)
        detail_path = council_dir / "chat_briefing_detail.json"
        with open(detail_path, "w") as f:
            json.dump({"council": council, "topics": detail}, f)
        detail_tokens = sum(len(v) for v in detail.values()) // 4

        total_core += core_tokens
        total_detail += detail_tokens
        print(f"  {council}: core ~{core_tokens} tokens, detail ~{detail_tokens} tokens ({len(detail)} topics)")

    print(f"\nTotal: core ~{total_core} tokens, detail ~{total_detail} tokens across {len(COUNCILS)} councils")


if __name__ == "__main__":
    print("Generating chat briefings...")
    main()
    print("Done!")
