#!/usr/bin/env python3
"""
Process Burnley Borough Council spending CSV files into optimized JSON for the React app.
Handles three data types: Spend, Contracts, and Purchase Cards.
"""

import pandas as pd
import json
import os
from pathlib import Path
from datetime import datetime
import re

# Paths
BBC_DATA_PATH = Path("/Users/tompickup/Documents/BBC")
OUTPUT_PATH = Path("/Users/tompickup/clawd/burnley-council/public/data")

def parse_date(date_str, format_hint=None):
    """Parse various date formats used in BBC data."""
    if pd.isna(date_str):
        return None

    date_str = str(date_str).strip()

    # Try different formats
    formats = [
        "%d-%b-%y",      # 10-May-23
        "%d/%m/%y",      # 02/04/25
        "%d/%m/%Y",      # 02/04/2025
        "%d %b %Y",      # 06 Apr 2023
        "%Y-%m-%d",      # 2023-04-06
    ]

    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue

    return None

def parse_amount(amount_str):
    """Parse amount strings, removing commas and handling various formats."""
    if pd.isna(amount_str):
        return 0.0

    amount_str = str(amount_str).strip()
    # Remove currency symbols, commas, quotes
    amount_str = re.sub(r'[£$,"\']', '', amount_str)

    try:
        return float(amount_str)
    except ValueError:
        return 0.0

def extract_fy_quarter(filename):
    """Extract financial year and quarter from filename like Q1.23.24.Spend.csv"""
    match = re.search(r'Q(\d)\.(\d{2})\.(\d{2})', filename)
    if match:
        quarter = int(match.group(1))
        year_start = int(match.group(2))
        year_end = int(match.group(3))
        fy = f"20{year_start}/{year_end}"
        return fy, quarter
    return None, None

def normalize_supplier(name):
    """Normalize supplier names for consistency."""
    if pd.isna(name):
        return "Unknown"

    name = str(name).strip().upper()
    # Remove NET/GROSS indicators
    name = re.sub(r'\s*-\s*(NET|GROSS)\s*$', '', name, flags=re.IGNORECASE)
    # Standardize LTD variations
    name = re.sub(r'\s+LTD\.?$', ' LTD', name)
    name = re.sub(r'\s+LIMITED$', ' LTD', name)

    return name.strip()

def read_csv_safe(filepath, skiprows=0):
    """Read CSV with fallback encodings."""
    encodings = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
    for enc in encodings:
        try:
            return pd.read_csv(filepath, skiprows=skiprows, encoding=enc, on_bad_lines='skip')
        except UnicodeDecodeError:
            continue
    # Last resort: ignore errors
    return pd.read_csv(filepath, skiprows=skiprows, encoding='utf-8', errors='ignore', on_bad_lines='skip')

def process_spend_files():
    """Process all Spend CSV files."""
    spend_path = BBC_DATA_PATH / "Spend"
    all_records = []

    for csv_file in spend_path.glob("*.csv"):
        print(f"Processing Spend: {csv_file.name}")
        fy, quarter = extract_fy_quarter(csv_file.name)

        # Read CSV, skip header rows
        df = read_csv_safe(csv_file, skiprows=2)

        # Standardize column names
        df.columns = df.columns.str.strip()

        for _, row in df.iterrows():
            # Skip empty rows
            if pd.isna(row.get('Supplier Name')) and pd.isna(row.get('Net Amount')):
                continue

            record = {
                "type": "spend",
                "financial_year": fy,
                "quarter": quarter,
                "date": parse_date(row.get('Date')),
                "supplier": normalize_supplier(row.get('Supplier Name')),
                "amount": parse_amount(row.get('Net Amount')),
                "service_division": str(row.get('Service Division Label', '')).strip(),
                "organisational_unit": str(row.get('Organisational Unit', '')).strip(),
                "capital_revenue": str(row.get('Capital and Revenue', '')).strip(),
                "expenditure_category": str(row.get('Expenditure Category', '')).strip(),
                "cipfa_type": str(row.get('CIPFA detailed expediture type', row.get('CIPFA detailed expenditure type', ''))).strip(),
                "creditor_type": str(row.get('Type of Creditor', '')).strip(),
                "transaction_number": str(row.get('Transaction number', '')).strip()
            }
            all_records.append(record)

    return all_records

def process_contracts_files():
    """Process all Contracts CSV files."""
    contracts_path = BBC_DATA_PATH / "Contracts"
    all_records = []

    for csv_file in contracts_path.glob("*.csv"):
        print(f"Processing Contracts: {csv_file.name}")
        fy, quarter = extract_fy_quarter(csv_file.name)

        df = read_csv_safe(csv_file, skiprows=0)
        df.columns = df.columns.str.strip()

        for _, row in df.iterrows():
            if pd.isna(row.get('Supplier Name')) and pd.isna(row.get('Value', row.get('Original Value'))):
                continue

            # Handle different column names across files
            value = row.get('Value', row.get('Original Value', 0))
            gl_code = row.get('Gl Code', row.get('GL Code', ''))

            record = {
                "type": "contracts",
                "financial_year": fy,
                "quarter": quarter,
                "date": parse_date(row.get('Order Date')),
                "supplier": normalize_supplier(row.get('Supplier Name')),
                "amount": parse_amount(value),
                "order_number": str(row.get('Order No', '')).strip(),
                "supplier_type": str(row.get('Type', '')).strip(),
                "title": str(row.get('Title', '')).strip(),
                "description": str(row.get('Product Description', '')).strip(),
                "department": str(row.get('Department', '')).strip(),
                "section": str(row.get('Section', '')).strip(),
                "gl_code": str(gl_code).strip() if not pd.isna(gl_code) else ''
            }
            all_records.append(record)

    return all_records

def process_purchase_cards_files():
    """Process all Purchase Cards CSV files."""
    pcards_path = BBC_DATA_PATH / "Purchase Cards"
    all_records = []

    for csv_file in pcards_path.glob("*.csv"):
        print(f"Processing Purchase Cards: {csv_file.name}")
        fy, quarter = extract_fy_quarter(csv_file.name)

        # Skip first 2 header rows
        df = read_csv_safe(csv_file, skiprows=2)
        df.columns = df.columns.str.strip()

        for _, row in df.iterrows():
            if pd.isna(row.get('Payee Name')) and pd.isna(row.get('Net Amount')):
                continue

            record = {
                "type": "purchase_cards",
                "financial_year": fy,
                "quarter": quarter,
                "date": parse_date(row.get('Date')),
                "supplier": normalize_supplier(row.get('Payee Name')),
                "amount": parse_amount(row.get('Net Amount')),
                "service_division": str(row.get('Service Division Label', '')).strip(),
                "organisational_unit": str(row.get('Organisational Unit', '')).strip(),
                "capital_revenue": str(row.get('Capital and Revenue', '')).strip(),
                "expenditure_category": str(row.get('Expenditure Category', '')).strip(),
                "cipfa_type": str(row.get('CIPFA detailed expediture type', row.get('CIPFA detailed expenditure type', ''))).strip(),
                "creditor_type": str(row.get('Type of Creditor', '')).strip(),
                "merchant_category": str(row.get('Merchant Category', '')).strip(),
                "mcc": str(row.get('MCC', '')).strip()
            }
            all_records.append(record)

    return all_records

def generate_metadata(all_data):
    """Generate metadata for filters and summary stats."""
    df = pd.DataFrame(all_data)

    # Filter out records with no amount
    df = df[df['amount'] > 0]

    metadata = {
        "total_records": len(df),
        "total_amount": float(df['amount'].sum()),
        "date_range": {
            "min": df['date'].dropna().min() if not df['date'].dropna().empty else None,
            "max": df['date'].dropna().max() if not df['date'].dropna().empty else None
        },
        "financial_years": sorted(df['financial_year'].dropna().unique().tolist()),
        "quarters": sorted(df['quarter'].dropna().unique().tolist()),
        "data_types": df['type'].unique().tolist(),
        "suppliers": {
            "count": df['supplier'].nunique(),
            "top_10": df.groupby('supplier')['amount'].sum().nlargest(10).to_dict()
        },
        "by_type": {}
    }

    # Stats by data type
    for dtype in df['type'].unique():
        type_df = df[df['type'] == dtype]
        metadata["by_type"][dtype] = {
            "count": len(type_df),
            "total": float(type_df['amount'].sum()),
            "avg": float(type_df['amount'].mean()),
            "max": float(type_df['amount'].max())
        }

    # Unique values for filters
    metadata["filters"] = {
        "service_divisions": sorted([x for x in df['service_division'].dropna().unique() if x and x != 'nan']),
        "organisational_units": sorted([x for x in df['organisational_unit'].dropna().unique() if x and x != 'nan']),
        "expenditure_categories": sorted([x for x in df['expenditure_category'].dropna().unique() if x and x != 'nan']),
        "departments": sorted([x for x in df.get('department', pd.Series()).dropna().unique() if x and x != 'nan']),
        "sections": sorted([x for x in df.get('section', pd.Series()).dropna().unique() if x and x != 'nan'])
    }

    return metadata

def calculate_doge_insights(all_data):
    """Calculate DOGE-style efficiency insights."""
    df = pd.DataFrame(all_data)
    df = df[df['amount'] > 0]

    insights = {
        "potential_duplicates": [],
        "supplier_consolidation": [],
        "small_transactions": {},
        "spending_spikes": [],
        "top_anomalies": []
    }

    # Potential duplicates: same supplier, same amount within 7 days
    df_sorted = df.sort_values(['supplier', 'date', 'amount'])
    duplicates = []

    for supplier in df['supplier'].unique():
        supplier_df = df_sorted[df_sorted['supplier'] == supplier]
        if len(supplier_df) > 1:
            supplier_df = supplier_df.dropna(subset=['date'])
            if len(supplier_df) > 1:
                supplier_df['date_parsed'] = pd.to_datetime(supplier_df['date'])
                for i in range(1, len(supplier_df)):
                    curr = supplier_df.iloc[i]
                    prev = supplier_df.iloc[i-1]
                    if curr['amount'] == prev['amount']:
                        days_diff = abs((curr['date_parsed'] - prev['date_parsed']).days)
                        if days_diff <= 7 and days_diff > 0:
                            duplicates.append({
                                "supplier": supplier,
                                "amount": float(curr['amount']),
                                "dates": [prev['date'], curr['date']],
                                "days_apart": int(days_diff)
                            })

    insights["potential_duplicates"] = duplicates[:50]  # Top 50
    insights["duplicate_total"] = sum(d['amount'] for d in duplicates)

    # Small transaction overhead (under £100)
    small_txns = df[df['amount'] < 100]
    insights["small_transactions"] = {
        "count": len(small_txns),
        "total_value": float(small_txns['amount'].sum()),
        "estimated_processing_cost": len(small_txns) * 15,  # £15 per transaction
        "potential_savings": len(small_txns) * 15 * 0.7  # 70% could be consolidated
    }

    # Supplier consolidation opportunities
    category_suppliers = df.groupby('expenditure_category')['supplier'].nunique()
    fragmented = category_suppliers[category_suppliers >= 5]
    for cat, count in fragmented.items():
        if cat and cat != 'nan':
            cat_total = float(df[df['expenditure_category'] == cat]['amount'].sum())
            insights["supplier_consolidation"].append({
                "category": cat,
                "supplier_count": int(count),
                "total_spend": cat_total,
                "potential_savings": cat_total * 0.08  # 8% consolidation savings
            })

    insights["supplier_consolidation"] = sorted(
        insights["supplier_consolidation"],
        key=lambda x: x['potential_savings'],
        reverse=True
    )[:20]

    # Calculate total potential savings
    insights["total_potential_savings"] = (
        insights["duplicate_total"] +
        insights["small_transactions"]["potential_savings"] +
        sum(s["potential_savings"] for s in insights["supplier_consolidation"])
    )

    return insights

def main():
    print("=" * 60)
    print("Processing Burnley Borough Council Spending Data")
    print("=" * 60)

    # Ensure output directory exists
    OUTPUT_PATH.mkdir(parents=True, exist_ok=True)

    # Process all data types
    spend_data = process_spend_files()
    print(f"  Spend records: {len(spend_data)}")

    contracts_data = process_contracts_files()
    print(f"  Contracts records: {len(contracts_data)}")

    pcards_data = process_purchase_cards_files()
    print(f"  Purchase Cards records: {len(pcards_data)}")

    # Combine all data
    all_data = spend_data + contracts_data + pcards_data
    print(f"\nTotal records: {len(all_data)}")

    # Filter out zero/invalid amounts
    all_data = [r for r in all_data if r['amount'] > 0]
    print(f"Valid records (amount > 0): {len(all_data)}")

    # Generate metadata
    print("\nGenerating metadata...")
    metadata = generate_metadata(all_data)

    # Calculate DOGE insights
    print("Calculating DOGE efficiency insights...")
    doge_insights = calculate_doge_insights(all_data)

    # Save files
    print("\nSaving JSON files...")

    # Main spending data
    with open(OUTPUT_PATH / "spending.json", 'w') as f:
        json.dump(all_data, f)
    print(f"  spending.json: {len(all_data)} records")

    # Metadata
    with open(OUTPUT_PATH / "metadata.json", 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"  metadata.json: filter values and summary stats")

    # DOGE insights
    with open(OUTPUT_PATH / "doge_insights.json", 'w') as f:
        json.dump(doge_insights, f, indent=2)
    print(f"  doge_insights.json: efficiency analysis")

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total Spending: £{metadata['total_amount']:,.2f}")
    print(f"Records by Type:")
    for dtype, stats in metadata['by_type'].items():
        print(f"  {dtype}: {stats['count']} records, £{stats['total']:,.2f}")
    print(f"\nDOGE Potential Savings: £{doge_insights['total_potential_savings']:,.2f}")
    print(f"  - Duplicate payments to review: £{doge_insights['duplicate_total']:,.2f}")
    print(f"  - Small transaction overhead: £{doge_insights['small_transactions']['potential_savings']:,.2f}")
    print(f"  - Supplier consolidation: £{sum(s['potential_savings'] for s in doge_insights['supplier_consolidation']):,.2f}")

    print("\nDone!")

if __name__ == "__main__":
    main()
