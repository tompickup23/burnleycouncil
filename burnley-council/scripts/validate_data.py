#!/usr/bin/env python3
"""
validate_data.py — Data Quality Validation for AI DOGE
Validates spending.json, metadata.json, config.json, insights.json
against governance rules. Outputs data_quality_report.json per council.

Usage:
    python validate_data.py --council burnley
    python validate_data.py --all
    python validate_data.py --council hyndburn --fix
"""

import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"

# ─── Council Registry (mirrors council_etl.py) ──────────────────────
COUNCILS = {
    "burnley": {"ons_code": "E07000117", "threshold": 500},
    "hyndburn": {"ons_code": "E07000120", "threshold": 250},
    "pendle": {"ons_code": "E07000122", "threshold": 500},
}

# ─── Validation Rules ───────────────────────────────────────────────

def validate_spending_record(record, idx):
    """Validate a single spending record. Returns list of issues."""
    issues = []

    # ERROR: supplier must be present and non-empty
    supplier = record.get("supplier", "")
    if not supplier or len(str(supplier).strip()) < 2:
        issues.append({"level": "error", "field": "supplier", "record": idx,
                        "msg": f"Missing or too short supplier: '{supplier}'"})

    # ERROR: amount must be non-zero
    amount = record.get("amount", 0)
    if amount == 0:
        issues.append({"level": "error", "field": "amount", "record": idx,
                        "msg": "Zero amount"})

    # WARNING: amount seems unreasonably large
    if abs(amount) > 50_000_000:
        issues.append({"level": "warning", "field": "amount", "record": idx,
                        "msg": f"Unusually large amount: £{amount:,.2f}"})

    # WARNING/INFO: date checks
    date = record.get("date")
    fy = record.get("financial_year", "")
    if not date and not fy:
        issues.append({"level": "warning", "field": "date", "record": idx,
                        "msg": "No date and no financial_year"})
    elif date:
        # Check date format
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(date)):
            issues.append({"level": "warning", "field": "date", "record": idx,
                            "msg": f"Invalid date format: '{date}'"})
        else:
            try:
                dt = datetime.strptime(date, "%Y-%m-%d")
                # Future date check (allow 90 days grace)
                if dt > datetime.now() + timedelta(days=90):
                    issues.append({"level": "warning", "field": "date", "record": idx,
                                    "msg": f"Future date: {date}"})
                # Very old date check
                if dt < datetime(2010, 1, 1):
                    issues.append({"level": "warning", "field": "date", "record": idx,
                                    "msg": f"Very old date: {date}"})
            except ValueError:
                issues.append({"level": "warning", "field": "date", "record": idx,
                                "msg": f"Unparseable date: {date}"})

    # INFO: optional field checks
    if not record.get("department") and not record.get("department_raw"):
        issues.append({"level": "info", "field": "department", "record": idx,
                        "msg": "No department"})
    if not record.get("description"):
        issues.append({"level": "info", "field": "description", "record": idx,
                        "msg": "No description"})

    # WARNING: financial_year format
    if fy and not re.match(r"^\d{4}/\d{2}$", str(fy)):
        issues.append({"level": "warning", "field": "financial_year", "record": idx,
                        "msg": f"Invalid FY format: '{fy}'"})

    return issues


def validate_spending_dataset(records, council_id):
    """Validate the entire spending dataset. Returns summary + issues."""
    total = len(records)
    if total == 0:
        return {"total_records": 0, "score": 0, "issues": [{"level": "error",
                "msg": "No records found"}]}

    # Aggregate checks
    issues = []
    date_count = 0
    supplier_count = 0
    dept_count = 0
    desc_count = 0
    ref_count = 0
    negative_count = 0
    error_count = 0
    warning_count = 0

    # Sample validation (check every record for errors, but only log first 50)
    for i, record in enumerate(records):
        rec_issues = validate_spending_record(record, i)
        for issue in rec_issues:
            if issue["level"] == "error":
                error_count += 1
            elif issue["level"] == "warning":
                warning_count += 1
        if i < 50:
            issues.extend(rec_issues)

        # Count completeness
        if record.get("date"):
            date_count += 1
        if record.get("supplier") and len(str(record["supplier"]).strip()) >= 2:
            supplier_count += 1
        if record.get("department") or record.get("department_raw"):
            dept_count += 1
        if record.get("description") and str(record["description"]).strip():
            desc_count += 1
        if record.get("reference") and str(record["reference"]).strip():
            ref_count += 1
        if record.get("amount", 0) < 0:
            negative_count += 1

    # Compute completeness percentages
    date_pct = (date_count / total) * 100
    supplier_pct = (supplier_count / total) * 100
    dept_pct = (dept_count / total) * 100
    desc_pct = (desc_count / total) * 100
    ref_pct = (ref_count / total) * 100

    # Duplicate detection (same date + supplier + amount)
    dupe_key = Counter()
    for r in records:
        key = (r.get("date"), r.get("supplier_canonical") or r.get("supplier"), r.get("amount"))
        dupe_key[key] += 1
    dupes = {k: v for k, v in dupe_key.items() if v > 1}
    dupe_records = sum(v - 1 for v in dupes.values())
    dupe_pct = (dupe_records / total) * 100

    # Supplier concentration
    supplier_totals = defaultdict(float)
    for r in records:
        s = r.get("supplier_canonical") or r.get("supplier", "UNKNOWN")
        supplier_totals[s] += abs(r.get("amount", 0))
    total_spend = sum(supplier_totals.values())
    top10 = sorted(supplier_totals.values(), reverse=True)[:10]
    top10_pct = (sum(top10) / total_spend * 100) if total_spend > 0 else 0

    # CH match rate
    ch_matched = sum(1 for r in records if r.get("supplier_company_number"))
    ch_suppliers = len(set(r.get("supplier_canonical") or r.get("supplier") for r in records
                          if r.get("supplier_company_number")))
    unique_suppliers = len(supplier_totals)
    ch_match_pct = (ch_suppliers / unique_suppliers * 100) if unique_suppliers > 0 else 0

    # Dataset-level warnings
    if date_pct < 95:
        issues.append({"level": "warning", "field": "dataset",
                        "msg": f"Date completeness below 95%: {date_pct:.1f}%"})
    if dupe_pct > 5:
        issues.append({"level": "warning", "field": "dataset",
                        "msg": f"High duplicate rate: {dupe_pct:.1f}% ({dupe_records} records)"})
    if top10_pct > 70:
        issues.append({"level": "info", "field": "dataset",
                        "msg": f"High supplier concentration: top 10 = {top10_pct:.1f}%"})

    # Compute Data Quality Score (0-100)
    consistency_score = 100  # will be adjusted by cross-file checks
    dqs = (
        min(date_pct, 100) * 0.25 +
        min(supplier_pct, 100) * 0.25 +
        min(dept_pct, 100) * 0.15 +
        min(desc_pct, 100) * 0.10 +
        min(ref_pct, 100) * 0.10 +
        min(ch_match_pct, 100) * 0.10 +
        consistency_score * 0.05
    )

    # Rating
    if dqs >= 90:
        rating = "excellent"
    elif dqs >= 75:
        rating = "good"
    elif dqs >= 60:
        rating = "adequate"
    elif dqs >= 40:
        rating = "poor"
    else:
        rating = "critical"

    return {
        "council": council_id,
        "validated_at": datetime.now().isoformat(),
        "total_records": total,
        "data_quality_score": round(dqs, 1),
        "rating": rating,
        "completeness": {
            "dates": round(date_pct, 1),
            "suppliers": round(supplier_pct, 1),
            "departments": round(dept_pct, 1),
            "descriptions": round(desc_pct, 1),
            "references": round(ref_pct, 1),
            "ch_match_rate": round(ch_match_pct, 1),
        },
        "statistics": {
            "total_spend": round(total_spend, 2),
            "unique_suppliers": unique_suppliers,
            "negative_transactions": negative_count,
            "negative_pct": round(negative_count / total * 100, 2),
            "duplicate_records": dupe_records,
            "duplicate_pct": round(dupe_pct, 1),
            "top10_concentration": round(top10_pct, 1),
        },
        "error_count": error_count,
        "warning_count": warning_count,
        "sample_issues": issues[:100],  # First 100 issues
    }


def validate_config(config, council_id):
    """Validate config.json structure."""
    issues = []
    required = ["council_id", "council_name", "council_full_name", "council_type",
                 "ons_code", "official_website", "spending_threshold"]

    for field in required:
        if field not in config:
            issues.append({"level": "error", "field": field,
                            "msg": f"Missing required field: {field}"})

    # Validate ONS code format
    ons = config.get("ons_code", "")
    if ons and not re.match(r"^E\d{8}$", ons):
        issues.append({"level": "warning", "field": "ons_code",
                        "msg": f"Invalid ONS code format: '{ons}'"})

    # Validate council_id matches directory
    if config.get("council_id") != council_id:
        issues.append({"level": "warning", "field": "council_id",
                        "msg": f"council_id '{config.get('council_id')}' != directory '{council_id}'"})

    # Validate threshold is positive integer
    threshold = config.get("spending_threshold")
    if threshold and (not isinstance(threshold, int) or threshold < 1):
        issues.append({"level": "warning", "field": "spending_threshold",
                        "msg": f"Invalid threshold: {threshold}"})

    return issues


def validate_cross_files(config, metadata, insights, spending_count, council_id):
    """Cross-validate data consistency between files."""
    issues = []

    # Config vs metadata record count
    meta_records = metadata.get("total_records", 0)
    if abs(meta_records - spending_count) > max(10, spending_count * 0.02):
        issues.append({"level": "warning", "field": "cross_file",
                        "msg": f"Record count mismatch: spending.json has {spending_count}, "
                               f"metadata.json says {meta_records}"})

    # Config doge_context vs metadata
    doge = config.get("doge_context", {})
    if doge:
        doge_txns = doge.get("transactions", 0)
        if doge_txns and abs(doge_txns - spending_count) > max(10, spending_count * 0.02):
            issues.append({"level": "warning", "field": "cross_file",
                            "msg": f"config.doge_context.transactions ({doge_txns}) != "
                                   f"spending.json count ({spending_count})"})

    # Insights vs spending supplier count
    if insights:
        insight_summary = insights.get("summary", {})
        insight_suppliers = insight_summary.get("unique_suppliers", 0)
        meta_suppliers = metadata.get("unique_suppliers", 0)
        if insight_suppliers and meta_suppliers:
            if abs(insight_suppliers - meta_suppliers) > max(5, meta_suppliers * 0.05):
                issues.append({"level": "warning", "field": "cross_file",
                                "msg": f"Supplier count: insights ({insight_suppliers}) vs "
                                       f"metadata ({meta_suppliers})"})

    return issues


def validate_council(council_id, fix=False):
    """Run full validation for a council. Returns report dict."""
    council_dir = DATA_DIR / council_id
    if not council_dir.exists():
        return {"council": council_id, "error": f"Directory not found: {council_dir}"}

    print(f"\n{'='*60}")
    print(f"  Validating: {council_id}")
    print(f"{'='*60}")

    report = {
        "council": council_id,
        "validated_at": datetime.now().isoformat(),
        "files": {},
    }

    # Load and validate config.json
    config_path = council_dir / "config.json"
    config = {}
    if config_path.exists():
        with open(config_path) as f:
            config = json.load(f)
        config_issues = validate_config(config, council_id)
        report["files"]["config"] = {
            "exists": True,
            "issues": config_issues,
            "valid": len([i for i in config_issues if i["level"] == "error"]) == 0,
        }
        print(f"  config.json: {len(config_issues)} issues")
    else:
        report["files"]["config"] = {"exists": False, "issues": [
            {"level": "error", "msg": "config.json not found"}]}

    # Load and validate spending.json
    spending_path = council_dir / "spending.json"
    records = []
    if spending_path.exists():
        print(f"  Loading spending.json...")
        with open(spending_path) as f:
            records = json.load(f)
        spending_report = validate_spending_dataset(records, council_id)
        report["spending"] = spending_report
        print(f"  spending.json: {spending_report['total_records']} records, "
              f"DQS={spending_report['data_quality_score']}/100 ({spending_report['rating']})")
        print(f"    Dates: {spending_report['completeness']['dates']}% | "
              f"Depts: {spending_report['completeness']['departments']}% | "
              f"Descs: {spending_report['completeness']['descriptions']}%")
        print(f"    Errors: {spending_report['error_count']} | "
              f"Warnings: {spending_report['warning_count']}")
    else:
        report["spending"] = {"error": "spending.json not found"}

    # Load metadata
    metadata_path = council_dir / "metadata.json"
    metadata = {}
    if metadata_path.exists():
        with open(metadata_path) as f:
            metadata = json.load(f)
        report["files"]["metadata"] = {"exists": True}
    else:
        report["files"]["metadata"] = {"exists": False}

    # Load insights
    insights_path = council_dir / "insights.json"
    insights = {}
    if insights_path.exists():
        with open(insights_path) as f:
            insights = json.load(f)
        report["files"]["insights"] = {"exists": True}
    else:
        report["files"]["insights"] = {"exists": False}

    # Check optional files
    optional_files = [
        "budgets_govuk.json", "budgets_summary.json", "revenue_trends.json",
        "crime_stats.json", "councillors.json", "wards.json", "politics_summary.json",
        "pay_comparison.json", "cross_council.json", "supplier_profiles.json",
        "doge_findings.json", "doge_knowledge.json", "foi_templates.json",
        "articles-index.json",
    ]
    present = []
    missing = []
    for f in optional_files:
        if (council_dir / f).exists():
            present.append(f)
        else:
            missing.append(f)
    report["files"]["optional_present"] = present
    report["files"]["optional_missing"] = missing
    print(f"  Optional files: {len(present)} present, {len(missing)} missing")

    # Cross-file validation
    cross_issues = validate_cross_files(config, metadata, insights, len(records), council_id)
    report["cross_file_issues"] = cross_issues
    if cross_issues:
        print(f"  Cross-file issues: {len(cross_issues)}")
        for ci in cross_issues:
            print(f"    [{ci['level']}] {ci['msg']}")

    # Compute overall score
    spending_dqs = report.get("spending", {}).get("data_quality_score", 0)
    config_valid = report.get("files", {}).get("config", {}).get("valid", False)
    file_coverage = len(present) / len(optional_files) * 100
    cross_penalty = len([i for i in cross_issues if i["level"] == "warning"]) * 5

    overall = spending_dqs * 0.7 + (100 if config_valid else 50) * 0.1 + file_coverage * 0.1 + max(0, 100 - cross_penalty) * 0.1
    report["overall_score"] = round(overall, 1)
    report["overall_rating"] = (
        "excellent" if overall >= 90 else
        "good" if overall >= 75 else
        "adequate" if overall >= 60 else
        "poor" if overall >= 40 else
        "critical"
    )

    print(f"\n  OVERALL: {report['overall_score']}/100 ({report['overall_rating']})")

    # Save report
    report_path = council_dir / "data_quality_report.json"
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2, default=str)
    print(f"  Report saved: {report_path}")

    return report


def main():
    parser = argparse.ArgumentParser(description="AI DOGE Data Quality Validator")
    parser.add_argument("--council", type=str, help="Council to validate")
    parser.add_argument("--all", action="store_true", help="Validate all councils")
    parser.add_argument("--fix", action="store_true", help="Auto-fix minor issues")
    parser.add_argument("--json", action="store_true", help="Output JSON to stdout")
    args = parser.parse_args()

    if not args.council and not args.all:
        parser.error("Specify --council <id> or --all")

    councils_to_validate = list(COUNCILS.keys()) if args.all else [args.council]
    reports = []

    for council_id in councils_to_validate:
        report = validate_council(council_id, fix=args.fix)
        reports.append(report)

    # Summary
    if len(reports) > 1:
        print(f"\n{'='*60}")
        print(f"  VALIDATION SUMMARY")
        print(f"{'='*60}")
        for r in reports:
            score = r.get("overall_score", "N/A")
            rating = r.get("overall_rating", "N/A")
            print(f"  {r['council']:15s}  {score}/100  ({rating})")

    if args.json:
        print(json.dumps(reports if len(reports) > 1 else reports[0], indent=2, default=str))


if __name__ == "__main__":
    main()
