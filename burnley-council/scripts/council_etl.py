#!/usr/bin/env python3
"""
council_etl.py — Universal Council Spending ETL Pipeline
Ingests spending CSVs from any council, normalises to universal schema,
applies taxonomy mappings, computes insights. Grows smarter with each council.

Usage:
    python council_etl.py --council hyndburn --download
    python council_etl.py --council burnley --retrofit
    python council_etl.py --council hyndburn --insights-only
"""

import argparse
import csv
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

# Optional imports — fail gracefully if not installed
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

try:
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False

# ─── Paths ───────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
TAXONOMY_PATH = DATA_DIR / "taxonomy.json"
SPA_DATA_DIR = BASE_DIR / "burnley-app" / "public" / "data"

# ─── Council Registry ────────────────────────────────────────────────
COUNCIL_REGISTRY = {
    "hyndburn": {
        "name": "Hyndburn Borough Council",
        "short_name": "Hyndburn",
        "type": "district",
        "ons_code": "E07000120",
        "spending_url": "https://www.hyndburnbc.gov.uk/download/expenditure-over-250-2/",
        "spending_threshold": 250,
        "data_start_fy": "2016/17",
        "publishes_purchase_cards": False,
        "publishes_contracts": False,
    },
    "burnley": {
        "name": "Burnley Borough Council",
        "short_name": "Burnley",
        "type": "district",
        "ons_code": "E07000117",
        "spending_threshold": 500,
        "data_start_fy": "2021/22",
        "publishes_purchase_cards": True,
        "publishes_contracts": True,
    },
}

# ─── Utility Functions ───────────────────────────────────────────────

def parse_date(date_str):
    """Parse various date formats used across councils."""
    if not date_str or str(date_str).strip() in ('', 'nan', 'None', 'NaT'):
        return None
    date_str = str(date_str).strip()
    formats = [
        "%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%d-%m-%y",
        "%d-%b-%y", "%d-%b-%Y", "%d %b %Y", "%d %B %Y",
        "%Y-%m-%d", "%m/%d/%Y",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str, fmt)
            # Fix 2-digit year ambiguity: 26 → 2026, not 1926
            if dt.year < 100:
                dt = dt.replace(year=dt.year + 2000)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def parse_amount(amount_str):
    """Parse amount strings, handling commas, quotes, currency symbols."""
    if not amount_str or str(amount_str).strip() in ('', 'nan', 'None'):
        return 0.0
    s = str(amount_str).strip()
    s = re.sub(r'[£$€,"\']', '', s)
    s = s.strip()
    try:
        return round(float(s), 2)
    except ValueError:
        return 0.0


def normalize_supplier(name):
    """Normalize supplier names for consistency."""
    if not name or str(name).strip() in ('', 'nan', 'None'):
        return "UNKNOWN"
    name = str(name).strip().upper()
    # Remove trailing suffixes
    name = re.sub(r'\s*-\s*(NET|GROSS)\s*$', '', name, flags=re.IGNORECASE)
    # Standardize company suffixes
    name = re.sub(r'\s+LIMITED$', ' LTD', name)
    name = re.sub(r'\s+LTD\.?$', ' LTD', name)
    name = re.sub(r'\s+PLC\.?$', ' PLC', name)
    # Remove excessive whitespace
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def financial_year_from_date(date_str):
    """Derive financial year from a date string (YYYY-MM-DD)."""
    if not date_str:
        return None
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        if dt.month >= 4:
            return f"{dt.year}/{str(dt.year + 1)[2:]}"
        else:
            return f"{dt.year - 1}/{str(dt.year)[2:]}"
    except ValueError:
        return None


def quarter_from_date(date_str):
    """Derive financial quarter (1-4) from date. Q1 = Apr-Jun."""
    if not date_str:
        return None
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        month = dt.month
        if month in (4, 5, 6): return 1
        if month in (7, 8, 9): return 2
        if month in (10, 11, 12): return 3
        return 4  # Jan, Feb, Mar
    except ValueError:
        return None


def fy_to_start_year(fy_str):
    """Convert '2016/17' to 2016."""
    if not fy_str:
        return 0
    try:
        return int(fy_str.split('/')[0])
    except (ValueError, IndexError):
        return 0


def read_csv_safe(filepath):
    """Read CSV with fallback encodings, return list of dicts."""
    encodings = ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252', 'iso-8859-1']
    for enc in encodings:
        try:
            with open(filepath, 'r', encoding=enc) as f:
                # Skip any BOM and detect if header is present
                content = f.read()
                # Some CSVs have empty first lines
                lines = content.strip().split('\n')
                if not lines:
                    return []
                reader = csv.DictReader(lines)
                return list(reader)
        except (UnicodeDecodeError, csv.Error):
            continue
    print(f"  WARNING: Could not read {filepath} with any encoding")
    return []


# ─── Taxonomy ────────────────────────────────────────────────────────

def load_taxonomy():
    """Load taxonomy.json or create empty one."""
    if TAXONOMY_PATH.exists():
        with open(TAXONOMY_PATH) as f:
            return json.load(f)
    return {
        "version": "1.0",
        "last_updated": datetime.now().strftime("%Y-%m-%d"),
        "council_metadata": {},
        "departments": {},
        "suppliers": {},
        "unmapped": {"departments": {}, "suppliers": []}
    }


def save_taxonomy(taxonomy):
    """Save taxonomy.json."""
    taxonomy["last_updated"] = datetime.now().strftime("%Y-%m-%d")
    TAXONOMY_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(TAXONOMY_PATH, 'w') as f:
        json.dump(taxonomy, f, indent=2)
    print(f"  Taxonomy saved to {TAXONOMY_PATH}")


def apply_taxonomy(record, taxonomy, council_id):
    """Apply taxonomy mappings to a record. Returns modified record."""
    # Department mapping — exact alias match first
    dept_raw = record.get("department_raw", "")
    record["department"] = dept_raw  # default: keep raw
    matched = False
    for canonical, info in taxonomy.get("departments", {}).items():
        aliases = info.get("aliases", {}).get(council_id, [])
        if dept_raw in aliases:
            record["department"] = canonical
            matched = True
            break

    # Keyword-based mapping for old-format Hyndburn (Service Cost Centre)
    # Also used as fallback when department_raw is empty but service_area_raw exists
    if not matched and council_id == "hyndburn":
        search_fields = [dept_raw]
        if not dept_raw and record.get("service_area_raw"):
            search_fields = [record["service_area_raw"]]
        for field_val in search_fields:
            if not field_val:
                continue
            field_upper = field_val.upper()
            keywords_map = taxonomy.get("hyndburn_cost_centre_keywords", {})
            for canonical, keywords in keywords_map.items():
                for kw in keywords:
                    if kw.upper() in field_upper:
                        record["department"] = canonical
                        matched = True
                        break
                if matched:
                    break
            if matched:
                break
        if not matched and (dept_raw or record.get("service_area_raw")):
            record["department"] = "Other"

    # Supplier canonical mapping
    supplier = record.get("supplier", "")
    record["supplier_canonical"] = supplier  # default: same as raw
    record["supplier_company_number"] = None
    record["supplier_company_url"] = None

    for canonical, info in taxonomy.get("suppliers", {}).items():
        if supplier in info.get("aliases", []):
            record["supplier_canonical"] = canonical
            # Companies House data
            ch = info.get("companies_house")
            if ch and isinstance(ch, dict):
                record["supplier_company_number"] = ch.get("company_number")
                record["supplier_company_url"] = ch.get("url")
            break

    return record


# ─── Hyndburn Adapter ────────────────────────────────────────────────

def download_hyndburn_csvs(output_dir):
    """Scrape Hyndburn's expenditure page and download all CSV links."""
    if not HAS_REQUESTS or not HAS_BS4:
        print("ERROR: Install requests and beautifulsoup4: pip install requests beautifulsoup4")
        sys.exit(1)

    url = COUNCIL_REGISTRY["hyndburn"]["spending_url"]
    print(f"  Fetching download page: {url}")
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, 'html.parser')

    csv_links = []
    for link in soup.find_all('a', href=True):
        href = link['href']
        if href.lower().endswith('.csv'):
            full_url = urljoin(url, href)
            csv_links.append(full_url)

    print(f"  Found {len(csv_links)} CSV links")
    output_dir.mkdir(parents=True, exist_ok=True)

    downloaded = 0
    for csv_url in csv_links:
        filename = csv_url.split('/')[-1]
        filepath = output_dir / filename
        if filepath.exists():
            downloaded += 1
            continue
        try:
            r = requests.get(csv_url, timeout=30)
            r.raise_for_status()
            filepath.write_bytes(r.content)
            downloaded += 1
            if downloaded % 20 == 0:
                print(f"  Downloaded {downloaded}/{len(csv_links)}...")
        except Exception as e:
            print(f"  WARNING: Failed to download {filename}: {e}")

    print(f"  Downloaded {downloaded} CSVs to {output_dir}")
    return sorted(output_dir.glob("*.csv"))


def detect_hyndburn_schema(rows):
    """Detect old vs new Hyndburn CSV format based on column names."""
    if not rows:
        return "unknown"
    keys = list(rows[0].keys())
    key_str = '|'.join(k.strip().lower() for k in keys if k)

    if 'service cost centre' in key_str or 'account detail' in key_str:
        return "old"  # Pre-2018: 7 columns
    if 'department area' in key_str:
        return "new"  # 2018+: 8-9 columns
    return "unknown"


def parse_hyndburn_old(rows, filename):
    """Parse old-format Hyndburn CSV (pre-2018, 7 columns).
    Columns: Service Cost Centre, Account Detail, Description, HBC ref no, Name, Payment date, Net Amount(£)
    """
    records = []
    for row in rows:
        # Clean up keys (strip whitespace)
        cleaned = {k.strip(): v for k, v in row.items() if k}

        name = cleaned.get('Name', cleaned.get('Name:', ''))
        date = cleaned.get('Payment date', cleaned.get('Payment Date', ''))
        amount_str = cleaned.get('Net Amount(£)', cleaned.get('Net Amount (£)', ''))
        # Fallback: try last column
        if not amount_str:
            for k, v in cleaned.items():
                if 'amount' in k.lower() or 'net' in k.lower():
                    amount_str = v
                    break

        if not name or str(name).strip() in ('', 'nan'):
            continue

        parsed_date = parse_date(str(date).strip())
        amount = parse_amount(amount_str)
        if amount == 0:
            continue

        fy = financial_year_from_date(parsed_date)
        record = {
            "date": parsed_date,
            "financial_year": fy,
            "quarter": quarter_from_date(parsed_date),
            "month": int(parsed_date[5:7]) if parsed_date else None,
            "supplier": normalize_supplier(name),
            "supplier_canonical": None,  # filled by taxonomy
            "amount": amount,
            "department_raw": str(cleaned.get('Service Cost Centre', '')).strip(),
            "department": None,  # filled by taxonomy
            "service_area_raw": str(cleaned.get('Account Detail', '')).strip(),
            "service_area": str(cleaned.get('Account Detail', '')).strip(),
            "description": str(cleaned.get('Description', '')).strip(),
            "reference": str(cleaned.get('HBC ref no', cleaned.get('HBC Ref No.', ''))).strip(),
            "type": "spend",
            "capital_revenue": None,
            "council": "hyndburn",
            "supplier_company_number": None,
            "supplier_company_url": None,
            "_source_file": filename,
        }
        records.append(record)
    return records


def parse_hyndburn_new(rows, filename):
    """Parse new-format Hyndburn CSV (2018+, 8-9 columns).
    Columns: Department Area, Service Area, Description, Line, HBC Ref No., Name:, [empty], Payment Date, Amount Paid
    """
    records = []
    for row in rows:
        cleaned = {k.strip().rstrip(':'): v for k, v in row.items() if k and k.strip()}

        # Find the name/supplier field (may be 'Name' or 'Name:' or similar)
        name = None
        for k in ['Name', 'Name:', 'Name:  ']:
            name = cleaned.get(k.strip().rstrip(':'))
            if name and str(name).strip() not in ('', 'nan'):
                break
        if not name:
            # Try by position — name is typically the 6th column
            vals = list(row.values())
            if len(vals) >= 6:
                name = vals[5]

        if not name or str(name).strip() in ('', 'nan'):
            continue

        # Find date and amount
        date_str = cleaned.get('Payment Date', '')
        amount_str = cleaned.get('Amount Paid', '')
        if not amount_str:
            # Try last non-empty column
            vals = [v for v in row.values() if v and str(v).strip()]
            if vals:
                amount_str = vals[-1]

        parsed_date = parse_date(str(date_str).strip())
        amount = parse_amount(amount_str)
        if amount == 0:
            continue

        fy = financial_year_from_date(parsed_date)
        dept_raw = str(cleaned.get('Department Area', '')).strip()
        service_raw = str(cleaned.get('Service Area', '')).strip()

        record = {
            "date": parsed_date,
            "financial_year": fy,
            "quarter": quarter_from_date(parsed_date),
            "month": int(parsed_date[5:7]) if parsed_date else None,
            "supplier": normalize_supplier(name),
            "supplier_canonical": None,
            "amount": amount,
            "department_raw": dept_raw,
            "department": None,
            "service_area_raw": service_raw,
            "service_area": service_raw,
            "description": str(cleaned.get('Description', '')).strip(),
            "reference": str(cleaned.get('HBC Ref No.', cleaned.get('HBC Ref No', ''))).strip(),
            "type": "spend",
            "capital_revenue": None,
            "council": "hyndburn",
            "supplier_company_number": None,
            "supplier_company_url": None,
            "_source_file": filename,
        }
        records.append(record)
    return records


def parse_hyndburn(csv_files, data_start_fy="2016/17"):
    """Parse all Hyndburn CSVs, handling both old and new schemas."""
    all_records = []
    start_year = fy_to_start_year(data_start_fy)

    for csv_path in csv_files:
        rows = read_csv_safe(str(csv_path))
        if not rows:
            continue

        schema = detect_hyndburn_schema(rows)
        if schema == "old":
            records = parse_hyndburn_old(rows, csv_path.name)
        elif schema == "new":
            records = parse_hyndburn_new(rows, csv_path.name)
        else:
            # Try new first, fall back to old
            records = parse_hyndburn_new(rows, csv_path.name)
            if not records:
                records = parse_hyndburn_old(rows, csv_path.name)

        # Filter by start financial year
        for r in records:
            fy = r.get("financial_year")
            if fy and fy_to_start_year(fy) >= start_year:
                all_records.append(r)

        if records:
            print(f"  {csv_path.name}: {len(records)} records ({schema} format)")

    print(f"  Total Hyndburn records (from {data_start_fy}): {len(all_records)}")
    return all_records


# ─── Burnley Retrofit Adapter ────────────────────────────────────────

def retrofit_burnley(existing_json_path):
    """Convert existing Burnley spending.json to universal schema."""
    print(f"  Reading existing Burnley data: {existing_json_path}")
    with open(existing_json_path) as f:
        existing = json.load(f)

    records = []
    for r in existing:
        date = r.get("date")
        record = {
            "date": date,
            "financial_year": r.get("financial_year"),
            "quarter": r.get("quarter"),
            "month": int(date[5:7]) if date and len(date) >= 7 else None,
            "supplier": r.get("supplier", "UNKNOWN"),
            "supplier_canonical": None,  # filled by taxonomy
            "amount": r.get("amount", 0),
            "department_raw": r.get("service_division", ""),
            "department": None,  # filled by taxonomy
            "service_area_raw": r.get("organisational_unit", ""),
            "service_area": r.get("organisational_unit", ""),
            "description": "",
            "reference": r.get("transaction_number", r.get("order_number", "")),
            "type": r.get("type", "spend"),
            "capital_revenue": r.get("capital_revenue", None),
            "council": "burnley",
            "supplier_company_number": None,
            "supplier_company_url": None,
            # Burnley-specific fields preserved
            "expenditure_category": r.get("expenditure_category", ""),
            "cipfa_type": r.get("cipfa_type", ""),
            "is_covid_related": r.get("is_covid_related", False),
        }
        records.append(record)

    print(f"  Burnley retrofit: {len(records)} records")
    return records


# ─── Normalise & Insights ────────────────────────────────────────────

def normalise_records(records, taxonomy, council_id):
    """Apply taxonomy mappings to all records."""
    for r in records:
        apply_taxonomy(r, taxonomy, council_id)
    return records


def compute_metadata(records, council_info):
    """Generate metadata.json content for the SPA."""
    if not records:
        return {"total_records": 0}

    fys = sorted(set(r["financial_year"] for r in records if r.get("financial_year")))
    types = sorted(set(r["type"] for r in records if r.get("type")))
    depts = sorted(set(r["department"] for r in records if r.get("department") and r["department"] != "UNKNOWN"))
    dept_raws = sorted(set(r["department_raw"] for r in records if r.get("department_raw")))

    # Department stats
    dept_stats = defaultdict(lambda: {"spend": 0, "count": 0, "suppliers": set()})
    for r in records:
        d = r.get("department", "Other")
        dept_stats[d]["spend"] += r.get("amount", 0)
        dept_stats[d]["count"] += 1
        dept_stats[d]["suppliers"].add(r.get("supplier", ""))

    dept_options = []
    for d, stats in sorted(dept_stats.items(), key=lambda x: -x[1]["spend"]):
        dept_options.append({
            "name": d,
            "spend": round(stats["spend"], 2),
            "count": stats["count"],
            "suppliers": len(stats["suppliers"])
        })

    return {
        "council": council_info.get("short_name", "Unknown"),
        "council_id": council_info.get("ons_code", ""),
        "council_type": council_info.get("type", ""),
        "spending_threshold": council_info.get("spending_threshold", 500),
        "total_records": len(records),
        "financial_years": fys,
        "data_types": types,
        "filters": {
            "departments": dept_options,
            "department_raws": dept_raws,
        },
        "total_spend": round(sum(r.get("amount", 0) for r in records), 2),
        "unique_suppliers": len(set(r.get("supplier", "") for r in records)),
        "date_range": {
            "min": min((r["date"] for r in records if r.get("date")), default=None),
            "max": max((r["date"] for r in records if r.get("date")), default=None),
        }
    }


def compute_insights(records, council_info):
    """Generate insights.json with DOGE-level scrutiny analysis."""
    if not records:
        return {}

    tx = [r for r in records if r.get("amount", 0) > 0]
    total_spend = sum(r["amount"] for r in tx)

    # ── Supplier Analysis ──
    supplier_totals = defaultdict(lambda: {"total": 0, "count": 0, "company_number": None, "company_url": None})
    for r in tx:
        s = r.get("supplier_canonical", r.get("supplier", "UNKNOWN"))
        supplier_totals[s]["total"] += r["amount"]
        supplier_totals[s]["count"] += 1
        if r.get("supplier_company_number"):
            supplier_totals[s]["company_number"] = r["supplier_company_number"]
            supplier_totals[s]["company_url"] = r["supplier_company_url"]

    sorted_suppliers = sorted(supplier_totals.items(), key=lambda x: -x[1]["total"])
    top_20 = sorted_suppliers[:20]
    top_20_spend = sum(s[1]["total"] for s in top_20)

    # ── Year-on-Year ──
    fy_spend = defaultdict(float)
    fy_count = defaultdict(int)
    for r in tx:
        fy = r.get("financial_year")
        if fy:
            fy_spend[fy] += r["amount"]
            fy_count[fy] += 1

    # ── Department Breakdown ──
    dept_spend = defaultdict(float)
    dept_count = defaultdict(int)
    for r in tx:
        d = r.get("department", "Other")
        dept_spend[d] += r["amount"]
        dept_count[d] += 1

    # ── Efficiency Flags ──
    flags = []

    # 1. Same-day duplicates
    tx_keys = defaultdict(list)
    for i, r in enumerate(tx):
        key = f"{r.get('date')}|{r.get('supplier')}|{r.get('amount')}"
        tx_keys[key].append(i)

    duplicates = []
    for key, indices in tx_keys.items():
        if len(indices) > 1:
            r = tx[indices[0]]
            duplicates.append({
                "supplier": r.get("supplier", ""),
                "amount": r["amount"],
                "date": r.get("date"),
                "occurrences": len(indices),
                "potential_overpayment": round(r["amount"] * (len(indices) - 1), 2)
            })

    if duplicates:
        duplicates.sort(key=lambda x: -x["potential_overpayment"])
        flags.append({
            "type": "same_day_duplicates",
            "severity": "high",
            "description": "Identical payments to same supplier on same day",
            "count": len(duplicates),
            "potential_value": round(sum(d["potential_overpayment"] for d in duplicates), 2),
            "items": duplicates[:20]
        })

    # 2. Round-number payments
    round_payments = [r for r in tx if r["amount"] > 1000 and r["amount"] % 1000 == 0]
    if round_payments:
        flags.append({
            "type": "round_number_payments",
            "severity": "low",
            "description": "Large round-number payments (may indicate estimates)",
            "count": len(round_payments),
            "total_value": round(sum(r["amount"] for r in round_payments), 2),
        })

    # 3. High-frequency small transactions
    supplier_small = defaultdict(int)
    for r in tx:
        if r["amount"] < 500:
            supplier_small[r.get("supplier", "")] += 1
    frequent_small = {k: v for k, v in supplier_small.items() if v >= 10}
    if frequent_small:
        flags.append({
            "type": "frequent_small_transactions",
            "severity": "medium",
            "description": "Suppliers with 10+ transactions under £500",
            "count": len(frequent_small),
        })

    insights = {
        "summary": {
            "total_spend": round(total_spend, 2),
            "transaction_count": len(tx),
            "unique_suppliers": len(supplier_totals),
            "avg_transaction": round(total_spend / len(tx), 2) if tx else 0,
            "median_transaction": round(sorted(r["amount"] for r in tx)[len(tx) // 2], 2) if tx else 0,
            "date_range": {
                "min": min((r["date"] for r in tx if r.get("date")), default=None),
                "max": max((r["date"] for r in tx if r.get("date")), default=None),
            }
        },
        "supplier_analysis": {
            "top_20_suppliers": [
                {
                    "supplier": s[0],
                    "total": round(s[1]["total"], 2),
                    "transactions": s[1]["count"],
                    "company_number": s[1]["company_number"],
                    "company_url": s[1]["company_url"],
                }
                for s in top_20
            ],
            "concentration_ratio": round(top_20_spend / total_spend, 4) if total_spend > 0 else 0,
            "total_unique_suppliers": len(supplier_totals),
            "single_transaction_suppliers": len([s for s in supplier_totals.values() if s["count"] == 1]),
        },
        "efficiency_flags": flags,
        "department_breakdown": [
            {"department": d, "spend": round(dept_spend[d], 2), "count": dept_count[d]}
            for d in sorted(dept_spend, key=lambda x: -dept_spend[x])
        ],
        "yoy_analysis": {
            "spend_by_year": {k: round(v, 2) for k, v in sorted(fy_spend.items())},
            "transactions_by_year": {k: v for k, v in sorted(fy_count.items())},
        },
        "transparency_metrics": {
            "has_dates": round(len([r for r in tx if r.get("date")]) / len(tx) * 100, 1) if tx else 0,
            "has_suppliers": round(len([r for r in tx if r.get("supplier") != "UNKNOWN"]) / len(tx) * 100, 1) if tx else 0,
            "has_departments": round(len([r for r in tx if r.get("department_raw")]) / len(tx) * 100, 1) if tx else 0,
            "total_records": len(tx),
        }
    }

    return insights


def validate_records(records, council_id, sample_size=10):
    """Spot-check data quality. Returns issues list."""
    issues = []
    if not records:
        issues.append("No records found")
        return issues

    # Check for missing dates
    no_date = len([r for r in records if not r.get("date")])
    if no_date > 0:
        pct = round(no_date / len(records) * 100, 1)
        issues.append(f"{no_date} records ({pct}%) missing dates")

    # Check for zero amounts
    zero_amount = len([r for r in records if r.get("amount", 0) == 0])
    if zero_amount > 0:
        issues.append(f"{zero_amount} records with zero amount (filtered out)")

    # Check for unknown suppliers
    unknown = len([r for r in records if r.get("supplier") == "UNKNOWN"])
    if unknown > 0:
        issues.append(f"{unknown} records with unknown supplier")

    # Sample check
    import random
    sample = random.sample(records, min(sample_size, len(records)))
    print(f"\n  === Validation Sample ({council_id}) ===")
    for r in sample[:5]:
        print(f"  {r.get('date', '?')} | {r.get('supplier', '?')[:30]:30s} | £{r.get('amount', 0):>10,.2f} | {r.get('department_raw', '?')}")

    if issues:
        print(f"\n  Issues found: {len(issues)}")
        for i in issues:
            print(f"    ⚠ {i}")
    else:
        print(f"\n  ✅ No issues found")

    return issues


def export_council(records, metadata, insights, council_id):
    """Write spending.json, metadata.json, insights.json for a council."""
    output_dir = DATA_DIR / council_id
    output_dir.mkdir(parents=True, exist_ok=True)

    # Remove internal fields and add SPA compatibility aliases
    clean_records = []
    for r in records:
        clean = {k: v for k, v in r.items() if not k.startswith('_')}
        # SPA compatibility: Spending.jsx expects service_division + expenditure_category
        if 'service_division' not in clean:
            clean['service_division'] = clean.get('department', '')
        if 'expenditure_category' not in clean:
            clean['expenditure_category'] = clean.get('service_area', '')
        clean_records.append(clean)

    with open(output_dir / "spending.json", 'w') as f:
        json.dump(clean_records, f)
    print(f"  spending.json: {len(clean_records)} records → {output_dir / 'spending.json'}")

    with open(output_dir / "metadata.json", 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"  metadata.json → {output_dir / 'metadata.json'}")

    with open(output_dir / "insights.json", 'w') as f:
        json.dump(insights, f, indent=2)
    print(f"  insights.json → {output_dir / 'insights.json'}")


# ─── Build Taxonomy from Data ────────────────────────────────────────

def extract_unique_values(records, council_id):
    """Extract unique departments and suppliers for taxonomy building."""
    depts = sorted(set(r.get("department_raw", "") for r in records if r.get("department_raw")))
    suppliers = sorted(set(r.get("supplier", "") for r in records if r.get("supplier") != "UNKNOWN"))

    print(f"\n  === Unique Values for {council_id} ===")
    print(f"  Departments ({len(depts)}):")
    for d in depts:
        print(f"    - {d}")
    print(f"\n  Unique suppliers: {len(suppliers)}")
    print(f"  Top suppliers by name:")
    for s in suppliers[:20]:
        print(f"    - {s}")

    return depts, suppliers


# ─── Main CLI ────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Universal Council Spending ETL")
    parser.add_argument("--council", required=True, choices=list(COUNCIL_REGISTRY.keys()),
                        help="Council to process")
    parser.add_argument("--download", action="store_true",
                        help="Download CSVs from council website")
    parser.add_argument("--retrofit", action="store_true",
                        help="Retrofit existing spending.json to universal schema (Burnley)")
    parser.add_argument("--extract-taxonomy", action="store_true",
                        help="Extract unique departments/suppliers for taxonomy building")
    parser.add_argument("--insights-only", action="store_true",
                        help="Recompute insights without re-parsing CSVs")
    parser.add_argument("--validate", action="store_true",
                        help="Run validation checks only")
    parser.add_argument("--csv-dir", type=str,
                        help="Override CSV directory path")
    parser.add_argument("--existing-json", type=str,
                        help="Path to existing spending.json for retrofit")
    args = parser.parse_args()

    council_id = args.council
    council_info = COUNCIL_REGISTRY[council_id]

    print("=" * 60)
    print(f"AI DOGE — Council ETL: {council_info['name']}")
    print("=" * 60)

    # Load taxonomy
    taxonomy = load_taxonomy()

    # Update council metadata in taxonomy
    if council_id not in taxonomy.get("council_metadata", {}):
        taxonomy.setdefault("council_metadata", {})[council_id] = {
            "type": council_info["type"],
            "ons_code": council_info["ons_code"],
            "spending_threshold": council_info["spending_threshold"],
            "publishes_purchase_cards": council_info.get("publishes_purchase_cards", False),
            "publishes_contracts": council_info.get("publishes_contracts", False),
            "data_start": council_info.get("data_start_fy", ""),
        }
        save_taxonomy(taxonomy)

    # ── Insights-only mode ──
    if args.insights_only:
        existing_path = DATA_DIR / council_id / "spending.json"
        if not existing_path.exists():
            print(f"ERROR: No existing data at {existing_path}")
            sys.exit(1)
        with open(existing_path) as f:
            records = json.load(f)
        print(f"  Loaded {len(records)} existing records")
        metadata = compute_metadata(records, council_info)
        insights = compute_insights(records, council_info)
        export_council(records, metadata, insights, council_id)
        return

    # ── Parse records ──
    records = []

    if council_id == "hyndburn":
        csv_dir = Path(args.csv_dir) if args.csv_dir else DATA_DIR / "hyndburn_csvs"

        if args.download:
            csv_files = download_hyndburn_csvs(csv_dir)
        else:
            csv_files = sorted(csv_dir.glob("*.csv"))
            if not csv_files:
                print(f"  No CSVs found in {csv_dir}. Use --download to fetch them.")
                sys.exit(1)

        print(f"\n  Parsing {len(csv_files)} CSV files...")
        data_start = council_info.get("data_start_fy", "2016/17")
        records = parse_hyndburn(csv_files, data_start)

    elif council_id == "burnley":
        if args.retrofit:
            existing = args.existing_json or str(SPA_DATA_DIR / "spending.json")
            if not Path(existing).exists():
                print(f"ERROR: No existing data at {existing}")
                sys.exit(1)
            records = retrofit_burnley(existing)
        else:
            print("  Burnley uses --retrofit to convert existing spending.json")
            print("  Usage: python council_etl.py --council burnley --retrofit")
            sys.exit(1)

    if not records:
        print("  No records parsed. Check your data source.")
        sys.exit(1)

    # ── Extract taxonomy values ──
    if args.extract_taxonomy:
        depts, suppliers = extract_unique_values(records, council_id)
        return

    # ── Apply taxonomy ──
    print(f"\n  Applying taxonomy mappings...")
    records = normalise_records(records, taxonomy, council_id)

    # ── Validate ──
    issues = validate_records(records, council_id)

    if args.validate:
        return

    # ── Compute outputs ──
    print(f"\n  Computing metadata and insights...")
    metadata = compute_metadata(records, council_info)
    insights = compute_insights(records, council_info)

    # ── Export ──
    print(f"\n  Exporting...")
    export_council(records, metadata, insights, council_id)

    # ── Summary ──
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Council: {council_info['name']}")
    print(f"  Records: {len(records):,}")
    print(f"  Total Spend: £{insights['summary']['total_spend']:,.2f}")
    print(f"  Unique Suppliers: {insights['summary']['unique_suppliers']:,}")
    print(f"  Financial Years: {', '.join(metadata.get('financial_years', []))}")
    print(f"  Top Supplier: {insights['supplier_analysis']['top_20_suppliers'][0]['supplier'] if insights['supplier_analysis']['top_20_suppliers'] else 'N/A'}")
    print(f"  Concentration (top 20): {insights['supplier_analysis']['concentration_ratio']*100:.1f}%")
    if insights.get("efficiency_flags"):
        print(f"  Efficiency Flags: {len(insights['efficiency_flags'])}")
        for flag in insights["efficiency_flags"]:
            print(f"    - {flag['type']}: {flag.get('count', 'N/A')} items ({flag['severity']})")
    print("\n  Done! ✅")


if __name__ == "__main__":
    main()
