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
    "pendle": {
        "name": "Pendle Borough Council",
        "short_name": "Pendle",
        "type": "district",
        "ons_code": "E07000122",
        "spending_url": "https://www.pendle.gov.uk/downloads/download/2353/council_spending_over_500",
        "spending_threshold": 500,
        "data_start_fy": "2021/22",
        "publishes_purchase_cards": True,
        "publishes_contracts": False,
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
            # Validate year is within plausible range for council spending data.
            # Rejects mis-parsed 2-digit years (e.g. '24' → 1924) and future dates.
            if dt.year < 2000 or dt.year > 2030:
                continue  # Try next format
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


# ─── Pendle Adapter ──────────────────────────────────────────────────

def parse_pendle(csv_files, data_start_fy="2021/22"):
    """Parse Pendle Borough Council monthly CSVs.

    Pendle publishes monthly CSVs with 14 columns:
      Organisation Name, Department, Service Cat Label, Purpose of Spend,
      Expenditure CIPFA Sub Group, Supplier, Supplier Reference, Pay Date,
      Transaction Number, Net Amount, Grant to VCSE?, Charity Number,
      Card Transaction, Irrecoverable VAT

    Date format: DD/MM/YYYY
    Amount: Net Amount (decimal, no currency symbol)
    """
    all_records = []
    start_year = fy_to_start_year(data_start_fy)

    for csv_path in csv_files:
        rows = read_csv_safe(str(csv_path))
        if not rows:
            continue

        records = []
        for row in rows:
            # Strip column suffixes like "(A)", "(B)", "(C )", "(N/A)" etc.
            cleaned = {}
            for k, v in row.items():
                if k:
                    clean_key = re.sub(r'\s*\([A-Za-z/ ]*\)\s*$', '', k).strip()
                    cleaned[clean_key] = v

            supplier = cleaned.get('Supplier', '')
            if not supplier or str(supplier).strip() in ('', 'nan', 'None'):
                continue

            date_str = cleaned.get('Pay Date', '')
            parsed_date = parse_date(str(date_str).strip())

            amount_str = cleaned.get('Net Amount', '')
            amount = parse_amount(amount_str)
            if amount == 0:
                continue

            fy = financial_year_from_date(parsed_date)

            # Pendle has rich metadata — CIPFA codes, VCSE flags, card flags
            is_card = str(cleaned.get('Card Transaction', 'N')).strip().upper() == 'Y'
            is_vcse = str(cleaned.get('Grant to VCSE?', 'N')).strip().upper() == 'Y'
            charity_no = str(cleaned.get('Charity Number', '')).strip()
            cipfa_code = str(cleaned.get('Expenditure CIPFA Sub Group', '')).strip()

            record = {
                "date": parsed_date,
                "financial_year": fy,
                "quarter": quarter_from_date(parsed_date),
                "month": int(parsed_date[5:7]) if parsed_date else None,
                "supplier": normalize_supplier(supplier),
                "supplier_canonical": None,
                "amount": amount,
                "department_raw": str(cleaned.get('Department', '')).strip(),
                "department": None,
                "service_area_raw": str(cleaned.get('Service Cat Label', '')).strip(),
                "service_area": str(cleaned.get('Service Cat Label', '')).strip(),
                "description": str(cleaned.get('Purpose of Spend', '')).strip(),
                "reference": str(cleaned.get('Transaction Number', '')).strip(),
                "type": "purchase_card" if is_card else "spend",
                "capital_revenue": None,
                "council": "pendle",
                "supplier_company_number": None,
                "supplier_company_url": None,
                # Pendle-specific enrichments
                "supplier_ref": str(cleaned.get('Supplier Reference', '')).strip(),
                "cipfa_code": cipfa_code,
                "is_vcse_grant": is_vcse,
                "charity_number": charity_no if charity_no and charity_no != 'nan' else None,
                "irrecoverable_vat": str(cleaned.get('Irrecoverable VAT', 'N')).strip().upper() == 'Y',
                "_source_file": csv_path.name,
            }
            records.append(record)

        # Filter by start financial year
        for r in records:
            fy = r.get("financial_year")
            if fy and fy_to_start_year(fy) >= start_year:
                all_records.append(r)

        if records:
            print(f"  {csv_path.name}: {len(records)} records")

    print(f"  Total Pendle records (from {data_start_fy}): {len(all_records)}")
    return all_records


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

    # Build pre-computed filter options (saves client scanning 50k records)
    filter_sets = {
        'financial_years': set(),
        'types': set(),
        'service_divisions': set(),
        'expenditure_categories': set(),
        'capital_revenue': set(),
        'suppliers': set(),
    }
    for r in clean_records:
        if r.get('financial_year'): filter_sets['financial_years'].add(r['financial_year'])
        if r.get('type'): filter_sets['types'].add(r['type'])
        if r.get('service_division'): filter_sets['service_divisions'].add(r['service_division'])
        if r.get('expenditure_category'): filter_sets['expenditure_categories'].add(r['expenditure_category'])
        if r.get('capital_revenue'): filter_sets['capital_revenue'].add(r['capital_revenue'])
        if r.get('supplier'): filter_sets['suppliers'].add(r['supplier'])

    spending_output = {
        "meta": {
            "version": 2,
            "council_id": council_id,
            "record_count": len(clean_records),
        },
        "filterOptions": {
            k: sorted(v) for k, v in filter_sets.items()
        },
        "records": clean_records,
    }

    with open(output_dir / "spending.json", 'w') as f:
        json.dump(spending_output, f)
    print(f"  spending.json (v2): {len(clean_records)} records, {sum(len(v) for v in filter_sets.values())} filter values → {output_dir / 'spending.json'}")

    # ── Year-chunked files for mobile (v3 progressive loading) ──
    by_year = {}
    for r in clean_records:
        fy = r.get('financial_year', 'unknown')
        by_year.setdefault(fy, []).append(r)

    years_manifest = {}
    sorted_years = sorted(by_year.keys())
    for fy in sorted_years:
        year_records = by_year[fy]
        fy_slug = fy.replace('/', '-')  # "2024/25" → "2024-25"
        filename = f"spending-{fy_slug}.json"
        total_spend = sum(abs(float(r.get('amount', 0))) for r in year_records)
        years_manifest[fy] = {
            "file": filename,
            "record_count": len(year_records),
            "total_spend": round(total_spend, 2),
        }
        with open(output_dir / filename, 'w') as f:
            json.dump(year_records, f)

    latest_year = sorted_years[-1] if sorted_years else None

    spending_index = {
        "meta": {
            "version": 3,
            "council_id": council_id,
            "record_count": len(clean_records),
            "chunked": True,
        },
        "filterOptions": {
            k: sorted(v) for k, v in filter_sets.items()
        },
        "years": years_manifest,
        "latest_year": latest_year,
    }

    with open(output_dir / "spending-index.json", 'w') as f:
        json.dump(spending_index, f)
    print(f"  spending-index.json (v3): {len(years_manifest)} year chunks, latest={latest_year}")
    for fy, info in sorted(years_manifest.items()):
        print(f"    {info['file']}: {info['record_count']} records, £{info['total_spend']:,.0f}")

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


# ─── Companies House Matching ─────────────────────────────────────────

CH_API_BASE = "https://api.company-information.service.gov.uk"
CH_PUBLIC_URL = "https://find-and-update.company-information.service.gov.uk/company"

# Government/public bodies that won't be on Companies House
KNOWN_NON_COMPANIES = {
    "COUNCIL", "BOROUGH COUNCIL", "COUNTY COUNCIL", "CITY COUNCIL",
    "PARISH COUNCIL", "TOWN COUNCIL", "DISTRICT COUNCIL",
    "NHS", "NHS TRUST", "NHS FOUNDATION TRUST",
    "HMRC", "HM REVENUE", "HM CUSTOMS",
    "DWP", "DEPARTMENT FOR",
    "POLICE", "FIRE", "FIRE AND RESCUE",
    "GOVERNMENT", "HM TREASURY", "CABINET OFFICE",
    "ENVIRONMENT AGENCY", "NATURAL ENGLAND",
    "OFSTED", "OFCOM", "OFGEM", "OFWAT",
    "INFORMATION COMMISSIONER",
    "ELECTORAL COMMISSION",
    "CHARITY COMMISSION",
}


def _normalise_for_ch(name):
    """Normalise supplier name for Companies House matching.
    Converts to uppercase, standardises suffixes, strips noise."""
    if not name:
        return ""
    n = str(name).strip().upper()
    # Standardise company suffixes
    n = re.sub(r'\bLIMITED\b', 'LTD', n)
    n = re.sub(r'\bLTD\.', 'LTD', n)
    n = re.sub(r'\bPLC\.', 'PLC', n)
    n = re.sub(r'\bC\.I\.C\.?\b', 'CIC', n)
    n = re.sub(r'\bL\.L\.P\.?\b', 'LLP', n)
    # Remove "THE " prefix
    n = re.sub(r'^THE\s+', '', n)
    # Remove trading-as variants
    n = re.sub(r'\s*\(T/A.*?\)', '', n)
    n = re.sub(r'\s*T/A\s+.*$', '', n)
    # Remove brackets with content
    n = re.sub(r'\s*\(.*?\)', '', n)
    # Collapse whitespace
    n = re.sub(r'\s+', ' ', n).strip()
    return n


def _is_likely_company(name):
    """Check if a name is likely a registered company (not individual/govt)."""
    upper = name.upper()
    # Definite company indicators
    if any(suffix in upper for suffix in [' LTD', ' LIMITED', ' PLC', ' LLP', ' CIC', ' INC']):
        return True
    return False


def _is_known_non_company(name):
    """Check if name is a government/public body (not on Companies House)."""
    upper = name.upper()
    for pattern in KNOWN_NON_COMPANIES:
        if pattern in upper:
            return True
    return False


def _ch_search(name, api_key, session=None):
    """Search Companies House for a company name. Returns list of results."""
    if session is None:
        session = requests.Session()
    url = f"{CH_API_BASE}/search/companies"
    params = {"q": name, "items_per_page": 5}
    try:
        resp = session.get(url, params=params, auth=(api_key, ""), timeout=15)
        if resp.status_code == 429:
            # Rate limited — wait and retry
            import time
            time.sleep(60)
            resp = session.get(url, params=params, auth=(api_key, ""), timeout=15)
        resp.raise_for_status()
        data = resp.json()
        return data.get("items", [])
    except Exception as e:
        print(f"    CH API error for '{name}': {e}")
        return []


def _match_company(supplier_name, ch_results):
    """Apply 100% confidence matching rules. Returns match dict or None.

    Rules (ALL must pass):
    1. Exact name match after normalisation
    2. Company is active
    3. Registered in England/Wales or UK-wide
    4. Single unambiguous result
    """
    normalised = _normalise_for_ch(supplier_name)
    if not normalised:
        return None

    # Filter to active companies only
    active = [r for r in ch_results if r.get("company_status") == "active"]
    if not active:
        return None

    # Filter to UK jurisdictions (allow missing country — CH only lists UK companies)
    uk_countries = {"united kingdom", "england", "wales", "scotland", "northern ireland", "gb"}
    uk_active = [r for r in active
                 if r.get("address", {}).get("country", "").lower() in uk_countries
                 or not r.get("address", {}).get("country")]

    # Find exact name matches (from UK-filtered results)
    exact_matches = []
    for r in uk_active:
        ch_name = _normalise_for_ch(r.get("title", ""))
        if ch_name == normalised:
            exact_matches.append(r)

    # Must be exactly one unambiguous match
    if len(exact_matches) != 1:
        return None

    match = exact_matches[0]
    company_number = match.get("company_number", "")
    sic_codes = match.get("sic_codes", [])

    return {
        "company_number": company_number,
        "company_name": match.get("title", ""),
        "status": match.get("company_status", ""),
        "sic_codes": sic_codes,
        "url": f"{CH_PUBLIC_URL}/{company_number}",
        "match_confidence": 1.0,
    }


def companies_house_lookup(taxonomy=None, councils=None, api_key=None, batch_size=100, dry_run=False):
    """Match all unique suppliers to Companies House records.

    Args:
        taxonomy: Loaded taxonomy dict (will be loaded if None)
        councils: List of council IDs to scan for suppliers (default: all)
        api_key: Companies House API key (reads COMPANIES_HOUSE_API_KEY env var if None)
        batch_size: Number of suppliers to process per run (for rate limiting)
        dry_run: If True, just report what would be done without API calls

    Returns:
        Updated taxonomy dict with matches added to suppliers section
    """
    if not HAS_REQUESTS and not dry_run:
        print("ERROR: requests library required. Install with: pip install requests")
        sys.exit(1)

    if api_key is None:
        api_key = os.environ.get("COMPANIES_HOUSE_API_KEY", "")
    if not api_key and not dry_run:
        print("ERROR: No Companies House API key found.")
        print("  Set COMPANIES_HOUSE_API_KEY environment variable, or pass --ch-api-key")
        print("  Register at: https://developer.company-information.service.gov.uk/")
        sys.exit(1)

    if taxonomy is None:
        taxonomy = load_taxonomy()

    # Collect all unique suppliers from spending data
    all_suppliers = set()
    council_list = councils or list(COUNCIL_REGISTRY.keys())

    for council_id in council_list:
        spending_path = DATA_DIR / council_id / "spending.json"
        if not spending_path.exists():
            continue
        with open(spending_path) as f:
            records = json.load(f)
        for r in records:
            supplier = r.get("supplier_canonical") or r.get("supplier")
            if supplier and supplier != "UNKNOWN":
                all_suppliers.add(supplier)

    print(f"\n  Total unique suppliers across {len(council_list)} council(s): {len(all_suppliers)}")

    # Determine which suppliers already have Companies House data in taxonomy
    existing_suppliers = taxonomy.get("suppliers", {})
    already_checked = set()
    for canonical_name, data in existing_suppliers.items():
        if "companies_house" in data:  # Even if null — means we've already checked
            already_checked.add(canonical_name.upper())
            for alias in data.get("aliases", []):
                already_checked.add(alias.upper())

    # Filter to those needing lookup
    needs_lookup = []
    skipped_non_company = 0
    skipped_already = 0

    for supplier in sorted(all_suppliers):
        normalised = supplier.upper().strip()
        if normalised in already_checked:
            skipped_already += 1
            continue
        if _is_known_non_company(normalised):
            skipped_non_company += 1
            # Add to taxonomy as non-company
            if normalised not in {k.upper() for k in existing_suppliers}:
                taxonomy.setdefault("suppliers", {})[supplier] = {
                    "aliases": [normalised],
                    "companies_house": None,
                    "note": "Government/public body — not on Companies House",
                }
            continue
        if _is_likely_company(normalised):
            needs_lookup.append(supplier)

    print(f"  Already checked: {skipped_already}")
    print(f"  Known non-companies (govt/public): {skipped_non_company}")
    print(f"  Likely companies needing lookup: {len(needs_lookup)}")

    if dry_run:
        print(f"\n  DRY RUN — would query Companies House for {min(batch_size, len(needs_lookup))} suppliers")
        print(f"  Sample queries:")
        for s in needs_lookup[:20]:
            print(f"    - {s}")
        return taxonomy

    # Process in batches (respecting rate limit: 600/5min = 120/min)
    import time
    session = requests.Session()
    to_process = needs_lookup[:batch_size]
    matched = 0
    unmatched = 0
    errors = 0

    print(f"\n  Processing {len(to_process)} suppliers against Companies House API...")
    print(f"  Rate limit: 600 requests per 5 minutes (120/min)")

    for i, supplier in enumerate(to_process):
        if i > 0 and i % 100 == 0:
            print(f"  ... {i}/{len(to_process)} done ({matched} matched, {unmatched} unmatched)")
            # Brief pause every 100 to stay well within rate limits
            time.sleep(2)

        if i > 0 and i % 50 == 0:
            # Save progress periodically
            save_taxonomy(taxonomy)

        normalised = _normalise_for_ch(supplier)
        results = _ch_search(normalised, api_key, session)

        match = _match_company(supplier, results)
        if match:
            # Store in taxonomy
            taxonomy.setdefault("suppliers", {})[supplier] = {
                "aliases": [supplier.upper(), normalised],
                "companies_house": match,
            }
            matched += 1
        else:
            # Mark as checked but unmatched
            taxonomy.setdefault("suppliers", {})[supplier] = {
                "aliases": [supplier.upper()],
                "companies_house": None,
                "note": "No confident Companies House match found",
            }
            unmatched += 1

        # Small delay to stay within rate limits (600/5min = ~0.5s per request)
        time.sleep(0.5)

    # Final save
    save_taxonomy(taxonomy)

    # Summary
    print(f"\n  Companies House Matching Complete:")
    print(f"    Processed: {len(to_process)}")
    print(f"    Matched (100% confidence): {matched}")
    print(f"    Unmatched: {unmatched}")
    print(f"    Remaining to check: {max(0, len(needs_lookup) - batch_size)}")

    return taxonomy


# ─── Companies House Deep Enrichment & Compliance Checking ────────────

def _ch_get(endpoint, api_key, session=None):
    """GET request to Companies House API with rate limiting."""
    if session is None:
        session = requests.Session()
    url = f"{CH_API_BASE}{endpoint}"
    try:
        resp = session.get(url, auth=(api_key, ""), timeout=15)
        if resp.status_code == 429:
            import time
            time.sleep(60)
            resp = session.get(url, auth=(api_key, ""), timeout=15)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"    CH API error for {endpoint}: {e}")
        return None


def _check_compliance(profile, officers_data=None, psc_data=None, insolvency_data=None):
    """Run all compliance checks against a company. Returns list of violation dicts.

    Each violation: {
        "code": "DISSOLVED_COMPANY",
        "severity": "critical|high|medium|low",
        "law": "Companies Act 2006 s.1000",
        "title": "Payment to dissolved company",
        "detail": "Company dissolved on 2024-01-15...",
        "active_from": "2024-01-15",   # When breach started (for temporal matching)
        "active_to": null,             # null = still ongoing; date = resolved
        "current": true,               # Is the breach current right now?
    }

    TEMPORAL LOGIC: The CH API shows CURRENT company state. We record:
    - active_from: earliest date we can determine the violation started
    - active_to: null if still ongoing, date if resolved
    - current: whether the violation is active RIGHT NOW
    For checks where CH only shows current state (e.g. overdue accounts), we
    can only flag current violations. Historical breaches that were resolved
    are invisible to us via the API — this is a known limitation.
    """
    from datetime import date
    today = date.today()
    violations = []

    if not profile:
        return violations

    status = profile.get("company_status", "")
    status_detail = profile.get("company_status_detail", "")

    # ── VIOLATION 1: Dissolved company ──
    if status == "dissolved":
        cessation = profile.get("date_of_cessation", "unknown")
        violations.append({
            "code": "DISSOLVED_COMPANY",
            "severity": "critical",
            "law": "Companies Act 2006 ss.1000-1012",
            "title": "Payment to dissolved company",
            "detail": f"Company dissolved on {cessation}. A dissolved company ceases to exist as a legal entity. All property vests in the Crown as bona vacantia. Payments cannot be legally received.",
            "active_from": cessation if cessation != "unknown" else None,
            "active_to": None,  # Permanent unless restored
            "current": True,
        })

    if status_detail == "active-proposal-to-strike-off":
        violations.append({
            "code": "STRIKE_OFF_PROPOSED",
            "severity": "high",
            "law": "Companies Act 2006 s.1000",
            "title": "Company facing strike-off",
            "detail": "Active proposal to strike company off the register. Company may cease to exist imminently.",
            "active_from": str(today),  # We only know it's current now
            "active_to": None,
            "current": True,
        })

    # ── VIOLATION 2: Company in liquidation / insolvency ──
    if status == "liquidation":
        violations.append({
            "code": "IN_LIQUIDATION",
            "severity": "critical",
            "law": "Insolvency Act 1986 s.127",
            "title": "Payment to company in liquidation",
            "detail": "Company is in liquidation. Payments may be void under IA1986 s.127 and the liquidator can claw them back.",
            "active_from": str(today),  # Current status; we don't know exact start
            "active_to": None,
            "current": True,
        })
    elif status in ("receivership", "insolvency-proceedings"):
        violations.append({
            "code": "INSOLVENCY_PROCEEDINGS",
            "severity": "high",
            "law": "Insolvency Act 1986",
            "title": f"Company in {status.replace('-', ' ')}",
            "detail": f"Company status is '{status}'. Payments should be directed to the insolvency practitioner.",
            "active_from": str(today),
            "active_to": None,
            "current": True,
        })
    elif status in ("administration", "voluntary-arrangement"):
        violations.append({
            "code": "UNDER_INSOLVENCY_SUPERVISION",
            "severity": "medium",
            "law": "Insolvency Act 1986 / Procurement Act 2023 Sch.7",
            "title": f"Company under insolvency supervision ({status})",
            "detail": f"Company is in {status.replace('-', ' ')}. This is a discretionary exclusion ground under procurement regulations.",
            "active_from": str(today),
            "active_to": None,
            "current": True,
        })

    if profile.get("has_insolvency_history") and insolvency_data:
        for case in insolvency_data.get("cases", []):
            case_type = case.get("type", "unknown")
            # Insolvency cases may have dates
            case_dates = case.get("dates", [])
            case_start = None
            case_end = None
            for cd in case_dates:
                if cd.get("type") in ("wound-up-on", "petition-on", "instrumented-on"):
                    case_start = cd.get("date")
                elif cd.get("type") in ("due-to-be-dissolved-on", "dissolved-on", "concluded-on"):
                    case_end = cd.get("date")
            violations.append({
                "code": "INSOLVENCY_HISTORY",
                "severity": "medium",
                "law": "Insolvency Act 1986 / Procurement Act 2023 Sch.7",
                "title": f"Insolvency history: {case_type.replace('-', ' ')}",
                "detail": f"Company has insolvency case on record (type: {case_type}). Discretionary exclusion ground under procurement regulations.",
                "active_from": case_start,
                "active_to": case_end,
                "current": case_end is None,  # Ongoing if not concluded
            })

    # ── VIOLATION 3: Late filing of accounts ──
    # NOTE: CH API only shows CURRENT overdue status. If accounts were late but
    # have since been filed, this won't show. We can only flag CURRENT violations.
    accounts = profile.get("accounts", {})
    next_accounts = accounts.get("next_accounts", {})
    if next_accounts.get("overdue"):
        due_on = next_accounts.get("due_on", "")
        days_overdue = 0
        if due_on:
            try:
                due_date = datetime.strptime(due_on, "%Y-%m-%d").date()
                days_overdue = (today - due_date).days
            except ValueError:
                pass

        if days_overdue > 180:
            violations.append({
                "code": "ACCOUNTS_SEVERELY_OVERDUE",
                "severity": "high",
                "law": "Companies Act 2006 ss.441, 451, 453",
                "title": f"Accounts {days_overdue} days overdue",
                "detail": f"Accounts due {due_on}, now {days_overdue} days overdue. Directors are committing a criminal offence (s.451 — level 5 fine + daily default). Civil penalty doubles for consecutive years. Company at risk of strike-off.",
                "active_from": due_on,  # Overdue since the due date
                "active_to": None,      # Still overdue
                "current": True,
            })
        elif days_overdue > 0:
            violations.append({
                "code": "ACCOUNTS_OVERDUE",
                "severity": "medium",
                "law": "Companies Act 2006 ss.441, 451, 453",
                "title": f"Accounts {days_overdue} days overdue",
                "detail": f"Accounts due {due_on}. Late filing is a criminal offence for directors (s.451) and incurs automatic civil penalties (s.453): £150-£1,500 for private companies.",
                "active_from": due_on,
                "active_to": None,
                "current": True,
            })

    # ── VIOLATION 4: Late confirmation statement ──
    cs = profile.get("confirmation_statement", {})
    if cs.get("overdue"):
        cs_due = cs.get("next_due", "")
        violations.append({
            "code": "CONFIRMATION_STATEMENT_OVERDUE",
            "severity": "medium",
            "law": "Companies Act 2006 ss.853A, 853L",
            "title": "Confirmation statement overdue",
            "detail": f"Due {cs_due}. Unlike late accounts, this is a criminal offence from day one (s.853L). Company at risk of strike-off proceedings.",
            "active_from": cs_due,
            "active_to": None,
            "current": True,
        })

    # ── VIOLATION 5: No active directors / No designated members ──
    # NOTE: This reflects CURRENT officer state. Historical gaps are invisible.
    # LLPs have "designated members" and "members", NOT directors.
    # ss.154-156 only apply to limited companies, not LLPs.
    # LLPs are governed by Limited Liability Partnerships Act 2000 s.4(1).
    company_type = profile.get("company_type", "")
    is_llp = company_type == "llp" or "llp" in status_detail.lower()

    if officers_data:
        if is_llp:
            # LLP governance check: must have ≥2 designated members (LLPA 2000 s.4(1))
            # Check for both LLP-specific roles AND director roles (in case data was
            # stored before the LLP-aware enrichment was deployed)
            llp_roles = ("llp-member", "llp-designated-member", "member", "designated-member")
            active_members = [
                o for o in officers_data.get("items", [])
                if o.get("officer_role") in llp_roles
                and "resigned_on" not in o
            ]
            designated_members = [
                m for m in active_members
                if m.get("officer_role") in ("llp-designated-member", "designated-member")
            ]
            # Only flag if we actually have officer items but none match LLP roles.
            # If items is empty, we may simply not have fetched LLP member data yet.
            has_any_officers = len(officers_data.get("items", [])) > 0
            if has_any_officers and len(active_members) == 0:
                violations.append({
                    "code": "NO_ACTIVE_MEMBERS_LLP",
                    "severity": "high",
                    "law": "Limited Liability Partnerships Act 2000 s.4(1)",
                    "title": "No active members (LLP)",
                    "detail": "LLP has zero active members. Breach of LLPA 2000 s.4(1) — LLPs must have at least 2 members at all times.",
                    "active_from": str(today),
                    "active_to": None,
                    "current": True,
                })
        else:
            # Standard company director checks (CA 2006 ss.154-156)
            active_directors = [
                o for o in officers_data.get("items", [])
                if o.get("officer_role") in ("director", "corporate-director", "nominee-director")
                and "resigned_on" not in o
            ]
            natural_directors = [
                d for d in active_directors
                if d.get("officer_role") == "director"
            ]

            # Try to determine when the last director resigned (= when breach started)
            all_directors = [
                o for o in officers_data.get("items", [])
                if o.get("officer_role") in ("director", "corporate-director", "nominee-director")
            ]
            last_resignation = max(
                (o.get("resigned_on", "") for o in all_directors if o.get("resigned_on")),
                default=None
            )

            if len(active_directors) == 0:
                violations.append({
                    "code": "NO_ACTIVE_DIRECTORS",
                    "severity": "high",
                    "law": "Companies Act 2006 ss.154-156",
                    "title": "No active directors",
                    "detail": "Company has zero active directors. Breach of s.154 (minimum 1 for private, 2 for public). Company cannot legally make decisions or enter contracts.",
                    "active_from": last_resignation,  # Breach started when last director resigned
                    "active_to": None,
                    "current": True,
                })
            elif len(natural_directors) == 0 and active_directors:
                violations.append({
                    "code": "NO_NATURAL_PERSON_DIRECTOR",
                    "severity": "high",
                    "law": "Companies Act 2006 s.155",
                    "title": "No natural person director",
                    "detail": "All directors are corporate entities. Breach of s.155 — at least one director must be a natural person.",
                    "active_from": str(today),  # We only know current state
                    "active_to": None,
                    "current": True,
                })

    # ── VIOLATION 6: Very newly incorporated ──
    # This is a point-in-time check — only relevant for payments made near incorporation
    creation = profile.get("date_of_creation", "")
    if creation:
        try:
            inc_date = datetime.strptime(creation, "%Y-%m-%d").date()
            age_days = (today - inc_date).days
            if age_days < 90:
                violations.append({
                    "code": "VERY_NEWLY_INCORPORATED",
                    "severity": "medium",
                    "law": "Due diligence / AML risk",
                    "title": f"Company only {age_days} days old",
                    "detail": f"Incorporated {creation}. Very new companies receiving council payments warrant additional due diligence checks.",
                    "active_from": creation,
                    "active_to": str(inc_date + __import__('datetime').timedelta(days=90)),
                    "current": age_days < 90,
                })
        except ValueError:
            pass

    # ── VIOLATION 7: PSC violations ──
    if psc_data:
        active_pscs = [
            p for p in psc_data.get("items", [])
            if "ceased_on" not in p
        ]
        # Sanctioned PSC
        for p in active_pscs:
            if p.get("is_sanctioned"):
                violations.append({
                    "code": "SANCTIONED_PSC",
                    "severity": "critical",
                    "law": "Sanctions and Anti-Money Laundering Act 2018",
                    "title": f"Sanctioned person with significant control",
                    "detail": f"PSC '{p.get('name', 'Unknown')}' is flagged as sanctioned. Council must not make payments that benefit sanctioned individuals.",
                    "active_from": p.get("notified_on"),  # When PSC was registered
                    "active_to": None,
                    "current": True,
                })

        # LLPs are exempt from PSC register requirements (s.790E exemption)
        if psc_data.get("active_count", 0) == 0 and status == "active" and not is_llp:
            violations.append({
                "code": "NO_PSC_REGISTERED",
                "severity": "medium",
                "law": "Companies Act 2006 s.790D (Part 21A)",
                "title": "No person with significant control registered",
                "detail": "Active company with no registered PSC and no exemption statement. Potential breach of s.790D. Ownership structure is opaque.",
                "active_from": str(today),  # We only know current state
                "active_to": None,
                "current": True,
            })

    # ── VIOLATION 8: Dormant accounts but receiving payments ──
    # The last accounts period tells us WHEN dormant accounts were filed
    last_accounts = accounts.get("last_accounts", {})
    accounts_type = last_accounts.get("type", "")
    last_made_up = last_accounts.get("made_up_to", "")
    if accounts_type and "dormant" in accounts_type.lower():
        violations.append({
            "code": "DORMANT_BUT_RECEIVING_PAYMENTS",
            "severity": "high",
            "law": "Companies Act 2006 s.1169",
            "title": "Filed dormant accounts but receiving council payments",
            "detail": f"Company filed accounts as '{accounts_type}' (period up to {last_made_up or 'unknown'}, claiming no significant transactions) but is receiving payments from the council. This is either a false filing or failure to update status.",
            "active_from": last_made_up,  # Dormant claim covers this period onwards
            "active_to": None,  # Until they file non-dormant accounts
            "current": True,
        })

    # ── VIOLATION 9: Address red flags ──
    if profile.get("undeliverable_registered_office_address"):
        violations.append({
            "code": "UNDELIVERABLE_ADDRESS",
            "severity": "medium",
            "law": "Companies Act 2006 s.86 / AML due diligence",
            "title": "Registered office address undeliverable",
            "detail": "Royal Mail cannot deliver to the company's registered office. Red flag for shell company or abandoned entity.",
            "active_from": str(today),  # Current state only
            "active_to": None,
            "current": True,
        })
    if profile.get("registered_office_is_in_dispute"):
        violations.append({
            "code": "ADDRESS_IN_DISPUTE",
            "severity": "medium",
            "law": "Companies Act 2006 s.1097A",
            "title": "Registered office address in dispute",
            "detail": "The company's registered office address is disputed. May indicate the company no longer operates from this address.",
            "active_from": str(today),
            "active_to": None,
            "current": True,
        })

    return violations


def companies_house_enrich(taxonomy=None, api_key=None, batch_size=200, force=False):
    """Deep-enrich all matched companies with full profile, officer, and PSC data.
    Runs compliance checks and stores violations.

    Args:
        taxonomy: Loaded taxonomy dict
        api_key: Companies House API key
        batch_size: Max companies to process per run
        force: Re-enrich even if already enriched
    """
    import time

    if not HAS_REQUESTS:
        print("ERROR: requests library required. Install with: pip install requests")
        sys.exit(1)

    if api_key is None:
        api_key = os.environ.get("COMPANIES_HOUSE_API_KEY", "")
    if not api_key:
        print("ERROR: No Companies House API key.")
        sys.exit(1)

    if taxonomy is None:
        taxonomy = load_taxonomy()

    session = requests.Session()
    suppliers = taxonomy.get("suppliers", {})

    # Find suppliers with CH match but no deep enrichment yet
    needs_enrichment = []
    for canonical, data in suppliers.items():
        ch = data.get("companies_house")
        if not ch or not ch.get("company_number"):
            continue
        if not force and ch.get("enriched"):
            continue
        needs_enrichment.append((canonical, ch["company_number"]))

    print(f"\n  Suppliers with CH match: {sum(1 for _,d in suppliers.items() if d.get('companies_house') and d['companies_house'].get('company_number'))}")
    print(f"  Already enriched: {sum(1 for _,d in suppliers.items() if d.get('companies_house') and d['companies_house'].get('enriched'))}")
    print(f"  Needing enrichment: {len(needs_enrichment)}")

    to_process = needs_enrichment[:batch_size]
    print(f"  Processing this run: {len(to_process)}")

    total_violations = 0
    critical_count = 0
    high_count = 0

    for i, (canonical, company_number) in enumerate(to_process):
        if (i + 1) % 20 == 0:
            print(f"    [{i+1}/{len(to_process)}] {canonical}")

        ch_data = suppliers[canonical]["companies_house"]

        # 1. Fetch full company profile
        profile = _ch_get(f"/company/{company_number}", api_key, session)
        if not profile:
            ch_data["enriched"] = True
            ch_data["enriched_date"] = str(datetime.now().date())
            ch_data["enrichment_error"] = "Profile not found"
            time.sleep(0.5)
            continue

        # 2. Fetch officers
        officers_data = _ch_get(f"/company/{company_number}/officers", api_key, session)

        # 3. Fetch PSCs
        psc_data = _ch_get(f"/company/{company_number}/persons-with-significant-control", api_key, session)

        # 4. Fetch insolvency if needed
        insolvency_data = None
        if profile.get("has_insolvency_history"):
            insolvency_data = _ch_get(f"/company/{company_number}/insolvency", api_key, session)

        # 5. Store enriched profile data
        ch_data["enriched"] = True
        ch_data["enriched_date"] = str(datetime.now().date())
        ch_data["status"] = profile.get("company_status", "")
        ch_data["status_detail"] = profile.get("company_status_detail", "")
        ch_data["date_of_creation"] = profile.get("date_of_creation", "")
        ch_data["date_of_cessation"] = profile.get("date_of_cessation")
        ch_data["company_type"] = profile.get("type", "")
        ch_data["sic_codes"] = profile.get("sic_codes", [])
        ch_data["has_insolvency_history"] = profile.get("has_insolvency_history", False)
        ch_data["has_been_liquidated"] = profile.get("has_been_liquidated", False)
        ch_data["accounts_overdue"] = profile.get("accounts", {}).get("next_accounts", {}).get("overdue", False)
        ch_data["accounts_due_on"] = profile.get("accounts", {}).get("next_accounts", {}).get("due_on")
        ch_data["accounts_type"] = profile.get("accounts", {}).get("last_accounts", {}).get("type", "")
        ch_data["confirmation_statement_overdue"] = profile.get("confirmation_statement", {}).get("overdue", False)
        ch_data["confirmation_statement_next_due"] = profile.get("confirmation_statement", {}).get("next_due")
        ch_data["undeliverable_address"] = profile.get("undeliverable_registered_office_address", False)
        ch_data["address_in_dispute"] = profile.get("registered_office_is_in_dispute", False)
        ch_data["registered_address"] = profile.get("registered_office_address", {})

        # Officer summary — capture directors AND LLP members
        is_llp = ch_data.get("company_type", "") == "llp"
        director_roles = ("director", "corporate-director", "nominee-director")
        llp_member_roles = ("llp-member", "llp-designated-member", "member", "designated-member")
        relevant_roles = llp_member_roles if is_llp else director_roles

        if officers_data:
            ch_data["active_directors"] = sum(
                1 for o in officers_data.get("items", [])
                if o.get("officer_role") in relevant_roles
                and "resigned_on" not in o
            )
            ch_data["directors"] = [
                {"name": o.get("name", ""), "role": o.get("officer_role", ""), "appointed": o.get("appointed_on", "")}
                for o in officers_data.get("items", [])
                if o.get("officer_role") in relevant_roles
                and "resigned_on" not in o
            ]
        else:
            ch_data["active_directors"] = None
            ch_data["directors"] = []

        # PSC summary
        if psc_data:
            ch_data["active_pscs"] = psc_data.get("active_count", 0)
            ch_data["has_sanctioned_psc"] = any(
                p.get("is_sanctioned") for p in psc_data.get("items", [])
                if "ceased_on" not in p
            )
            ch_data["pscs"] = [
                {"name": p.get("name", ""), "kind": p.get("kind", ""), "sanctioned": p.get("is_sanctioned", False)}
                for p in psc_data.get("items", [])
                if "ceased_on" not in p
            ]
        else:
            ch_data["active_pscs"] = None
            ch_data["pscs"] = []

        # 6. Run compliance checks
        violations = _check_compliance(profile, officers_data, psc_data, insolvency_data)
        ch_data["violations"] = violations
        ch_data["violation_count"] = len(violations)
        ch_data["max_severity"] = max(
            ({"critical": 4, "high": 3, "medium": 2, "low": 1}.get(v["severity"], 0) for v in violations),
            default=0
        )
        ch_data["max_severity_label"] = {4: "critical", 3: "high", 2: "medium", 1: "low", 0: "clean"}.get(
            ch_data["max_severity"], "clean"
        )

        total_violations += len(violations)
        critical_count += sum(1 for v in violations if v["severity"] == "critical")
        high_count += sum(1 for v in violations if v["severity"] == "high")

        # Rate limiting: ~3 calls per company = need ~1.5s between companies
        time.sleep(1.0)

        # Save every 50 companies
        if (i + 1) % 50 == 0:
            save_taxonomy(taxonomy)
            print(f"    Saved progress ({i+1}/{len(to_process)})")

    # Final save
    save_taxonomy(taxonomy)

    # Summary
    enriched_total = sum(1 for _, d in suppliers.items()
                         if d.get("companies_house") and d["companies_house"].get("enriched"))
    flagged = sum(1 for _, d in suppliers.items()
                  if d.get("companies_house") and d["companies_house"].get("violation_count", 0) > 0)

    print(f"\n  Deep Enrichment Complete:")
    print(f"    Processed this run: {len(to_process)}")
    print(f"    Total enriched: {enriched_total}")
    print(f"    Violations found this run: {total_violations}")
    print(f"      Critical: {critical_count}")
    print(f"      High: {high_count}")
    print(f"    Suppliers with flags: {flagged}")

    return taxonomy


def _payment_overlaps_violation(payment_date, violation):
    """Check if a payment date falls during a violation's active period.
    Returns 'during', 'before', 'after', or 'unknown'.

    FIXED: Returns 'unknown' when active_from is null rather than assuming 'during'.
    Null dates from failed CH API calls caused massive false positives.
    """
    from datetime import date as date_type
    if not payment_date:
        return "unknown"

    active_from = violation.get("active_from")
    active_to = violation.get("active_to")

    if not active_from:
        # Cannot confirm overlap without a start date
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


def apply_ch_to_spending(council_id, taxonomy=None):
    """Apply Companies House data from taxonomy to spending records.
    Adds supplier_company_number, supplier_company_url, and temporal compliance flags.

    TEMPORAL LOGIC: Each payment is checked against violation active periods.
    A payment only gets flagged if it was made DURING an active breach, not before.
    """
    if taxonomy is None:
        taxonomy = load_taxonomy()

    spending_path = DATA_DIR / council_id / "spending.json"
    if not spending_path.exists():
        print(f"  No spending data for {council_id}")
        return

    with open(spending_path) as f:
        records = json.load(f)

    # Build lookup: normalised supplier name → CH data
    ch_lookup = {}
    for canonical, data in taxonomy.get("suppliers", {}).items():
        ch = data.get("companies_house")
        if ch and ch.get("company_number"):
            for alias in data.get("aliases", []):
                ch_lookup[alias.upper()] = ch
            ch_lookup[canonical.upper()] = ch

    updated = 0
    flagged = 0
    flagged_temporal = 0
    for r in records:
        supplier = (r.get("supplier_canonical") or r.get("supplier", "")).upper()
        ch = ch_lookup.get(supplier)
        if ch:
            r["supplier_company_number"] = ch["company_number"]
            r["supplier_company_url"] = ch["url"]

            # Temporal compliance check: was THIS payment during a breach?
            violations = ch.get("violations", [])
            if violations:
                payment_date = r.get("date", "")
                active_violations = []
                for v in violations:
                    overlap = _payment_overlaps_violation(payment_date, v)
                    if overlap == "during":
                        active_violations.append(v)

                if active_violations:
                    # Payment was made during active breach
                    max_sev = max(
                        {"critical": 4, "high": 3, "medium": 2, "low": 1}.get(v["severity"], 0)
                        for v in active_violations
                    )
                    r["supplier_compliance_flags"] = {4: "critical", 3: "high", 2: "medium", 1: "low"}.get(max_sev, "clean")
                    r["supplier_violation_count"] = len(active_violations)
                    flagged_temporal += 1
                else:
                    # Supplier has violations but payment was BEFORE they started
                    r["supplier_compliance_flags"] = "clean"
                    r["supplier_violation_count"] = 0
                flagged += 1
            else:
                r["supplier_compliance_flags"] = "clean"
                r["supplier_violation_count"] = 0
            updated += 1
        else:
            r["supplier_company_number"] = None
            r["supplier_company_url"] = None
            r["supplier_compliance_flags"] = None
            r["supplier_violation_count"] = 0

    with open(spending_path, 'w') as f:
        json.dump(records, f)

    print(f"  {council_id}: Updated {updated}/{len(records)} records with Companies House data")
    print(f"  {council_id}: {flagged} records to suppliers with violations")
    print(f"  {council_id}: {flagged_temporal} records flagged (payment made DURING active breach)")


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
    parser.add_argument("--companies-house", action="store_true",
                        help="Run Companies House supplier matching")
    parser.add_argument("--ch-api-key", type=str,
                        help="Companies House API key (or set COMPANIES_HOUSE_API_KEY env var)")
    parser.add_argument("--ch-batch-size", type=int, default=100,
                        help="Number of suppliers to match per run (default: 100)")
    parser.add_argument("--ch-dry-run", action="store_true",
                        help="Show what would be matched without calling API")
    parser.add_argument("--ch-apply", action="store_true",
                        help="Apply existing Companies House matches to spending records")
    parser.add_argument("--ch-enrich", action="store_true",
                        help="Deep-enrich matched companies: fetch profile/officers/PSCs, run compliance checks")
    parser.add_argument("--ch-enrich-force", action="store_true",
                        help="Force re-enrichment even if already done")
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

    # ── Companies House matching mode ──
    if args.companies_house or args.ch_dry_run:
        print("\n=== Companies House Supplier Matching ===")
        companies_house_lookup(
            taxonomy=taxonomy,
            councils=[council_id],
            api_key=args.ch_api_key,
            batch_size=args.ch_batch_size,
            dry_run=args.ch_dry_run,
        )
        return

    if args.ch_enrich:
        print("\n=== Companies House Deep Enrichment & Compliance Checking ===")
        companies_house_enrich(
            taxonomy=taxonomy,
            api_key=args.ch_api_key,
            batch_size=args.ch_batch_size,
            force=args.ch_enrich_force,
        )
        return

    if args.ch_apply:
        print("\n=== Applying Companies House Data to Spending Records ===")
        apply_ch_to_spending(council_id, taxonomy)
        return

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

    elif council_id == "pendle":
        csv_dir = Path(args.csv_dir) if args.csv_dir else DATA_DIR / "pendle_csvs"

        csv_files = sorted(csv_dir.glob("*.csv"))
        if not csv_files:
            print(f"  No CSVs found in {csv_dir}.")
            print(f"  Download Pendle CSVs from: {council_info['spending_url']}")
            sys.exit(1)

        print(f"\n  Parsing {len(csv_files)} CSV files...")
        data_start = council_info.get("data_start_fy", "2021/22")
        records = parse_pendle(csv_files, data_start)

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
