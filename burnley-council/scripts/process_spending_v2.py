#!/usr/bin/env python3
"""
Process Burnley Borough Council spending CSV files into optimized JSON.
V2: Proper distinction between transactions and contracts, realistic analysis.

Key insight: Contracts are COMMITMENTS (total value), Spend/P-Cards are TRANSACTIONS (actual payments).
"""

import pandas as pd
import json
import os
from pathlib import Path
from datetime import datetime
from collections import defaultdict
import re

BBC_DATA_PATH = Path("/Users/tompickup/Documents/BBC")
OUTPUT_PATH = Path("/Users/tompickup/clawd/burnley-council/public/data")

def parse_date(date_str, format_hint=None):
    """Parse various date formats used in BBC data."""
    if pd.isna(date_str):
        return None
    date_str = str(date_str).strip()
    formats = ["%d-%b-%y", "%d/%m/%y", "%d/%m/%Y", "%d %b %Y", "%Y-%m-%d"]
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None

def parse_amount(amount_str):
    """Parse amount strings."""
    if pd.isna(amount_str):
        return 0.0
    amount_str = str(amount_str).strip()
    amount_str = re.sub(r'[£$,"\']', '', amount_str)
    try:
        return float(amount_str)
    except ValueError:
        return 0.0

def extract_fy_quarter(filename):
    """Extract financial year and quarter from filename."""
    match = re.search(r'Q(\d)\.(\d{2})\.(\d{2})', filename)
    if match:
        quarter = int(match.group(1))
        year_start = int(match.group(2))
        year_end = int(match.group(3))
        fy = f"20{year_start}/{year_end}"
        return fy, quarter
    return None, None

def normalize_supplier(name):
    """Normalize supplier names."""
    if pd.isna(name):
        return "Unknown"
    name = str(name).strip().upper()
    name = re.sub(r'\s*-\s*(NET|GROSS)\s*$', '', name, flags=re.IGNORECASE)
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
    return pd.read_csv(filepath, skiprows=skiprows, encoding='utf-8', errors='ignore', on_bad_lines='skip')

def process_spend_files():
    """Process Spend CSV files (actual transactions £500+)."""
    spend_path = BBC_DATA_PATH / "Spend"
    all_records = []

    for csv_file in spend_path.glob("*.csv"):
        print(f"Processing Spend: {csv_file.name}")
        fy, quarter = extract_fy_quarter(csv_file.name)
        df = read_csv_safe(csv_file, skiprows=2)
        df.columns = df.columns.str.strip()

        for _, row in df.iterrows():
            if pd.isna(row.get('Supplier Name')) and pd.isna(row.get('Net Amount')):
                continue

            # Check for COVID-19 related spending
            org_unit = str(row.get('Organisational Unit', '')).strip()
            cipfa = str(row.get('CIPFA detailed expediture type', '')).strip()
            is_covid = 'COVID' in org_unit.upper() or 'COVID' in cipfa.upper()

            record = {
                "type": "spend",
                "financial_year": fy,
                "quarter": quarter,
                "date": parse_date(row.get('Date')),
                "supplier": normalize_supplier(row.get('Supplier Name')),
                "amount": parse_amount(row.get('Net Amount')),
                "service_division": str(row.get('Service Division Label', '')).strip(),
                "organisational_unit": org_unit,
                "capital_revenue": str(row.get('Capital and Revenue', '')).strip(),
                "expenditure_category": str(row.get('Expenditure Category', '')).strip(),
                "cipfa_type": cipfa,
                "transaction_number": str(row.get('Transaction number', '')).strip(),
                "is_covid_related": is_covid
            }
            all_records.append(record)
    return all_records

def process_contracts_files():
    """Process Contracts CSV files (purchase orders/commitments £5000+)."""
    contracts_path = BBC_DATA_PATH / "Contracts"
    all_records = []

    for csv_file in contracts_path.glob("*.csv"):
        print(f"Processing Contracts: {csv_file.name}")
        fy, quarter = extract_fy_quarter(csv_file.name)
        df = read_csv_safe(csv_file, skiprows=0)
        df.columns = df.columns.str.strip()

        for _, row in df.iterrows():
            if pd.isna(row.get('Supplier Name')):
                continue
            value = row.get('Value', row.get('Original Value', 0))
            # Handle column name variations between years
            supplier_type = row.get('Type', row.get('Supplier Type', ''))
            record = {
                "type": "contracts",
                "financial_year": fy,
                "quarter": quarter,
                "date": parse_date(row.get('Order Date')),
                "supplier": normalize_supplier(row.get('Supplier Name')),
                "amount": parse_amount(value),  # This is CONTRACT VALUE, not transaction
                "order_number": str(row.get('Order No', '')).strip(),
                "supplier_type": str(supplier_type).strip() if not pd.isna(supplier_type) else '',
                "title": str(row.get('Title', '')).strip(),
                "description": str(row.get('Product Description', '')).strip(),
                "department": str(row.get('Department', '')).strip(),
                "section": str(row.get('Section', '')).strip(),
            }
            all_records.append(record)
    return all_records

def process_purchase_cards_files():
    """Process Purchase Cards CSV files (all P-card transactions)."""
    pcards_path = BBC_DATA_PATH / "Purchase Cards"
    all_records = []

    for csv_file in pcards_path.glob("*.csv"):
        print(f"Processing Purchase Cards: {csv_file.name}")
        fy, quarter = extract_fy_quarter(csv_file.name)
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
                "expenditure_category": str(row.get('Expenditure Category', '')).strip(),
                "merchant_category": str(row.get('Merchant Category', '')).strip(),
            }
            all_records.append(record)
    return all_records


def calculate_realistic_insights(spend_data, contracts_data, pcards_data):
    """
    Calculate REALISTIC insights useful for politicians and finance officers.
    Based on Tussell, OpenSpending, and DOGE best practices.
    """

    # Only use actual transactions (spend + pcards) for duplicate/anomaly detection
    # Contracts are commitments, not payments
    transactions = [r for r in spend_data + pcards_data if r['amount'] > 0]
    contracts = [r for r in contracts_data if r['amount'] > 0]

    tx_df = pd.DataFrame(transactions)
    contract_df = pd.DataFrame(contracts)

    insights = {
        "summary": {},
        "supplier_analysis": {},
        "efficiency_flags": [],
        "political_angles": [],
        "contract_intelligence": {},
        "transparency_metrics": {},
        "yoy_analysis": {}
    }

    # ===== SUMMARY STATISTICS =====
    total_transactions = tx_df['amount'].sum()
    total_contracts = contract_df['amount'].sum()

    insights["summary"] = {
        "total_transaction_spend": float(total_transactions),
        "total_contract_commitments": float(total_contracts),
        "transaction_count": len(tx_df),
        "contract_count": len(contract_df),
        "unique_suppliers": tx_df['supplier'].nunique(),
        "avg_transaction_value": float(tx_df['amount'].mean()),
        "median_transaction_value": float(tx_df['amount'].median()),
        "date_range": {
            "min": tx_df['date'].dropna().min() if not tx_df['date'].dropna().empty else None,
            "max": tx_df['date'].dropna().max() if not tx_df['date'].dropna().empty else None
        }
    }

    # ===== SUPPLIER CONCENTRATION (Political angle: who benefits?) =====
    supplier_totals = tx_df.groupby('supplier')['amount'].agg(['sum', 'count']).reset_index()
    supplier_totals.columns = ['supplier', 'total', 'count']
    supplier_totals = supplier_totals.sort_values('total', ascending=False)

    top_20_spend = supplier_totals.head(20)['total'].sum()
    concentration_ratio = top_20_spend / total_transactions if total_transactions > 0 else 0

    insights["supplier_analysis"] = {
        "top_20_suppliers": [
            {"supplier": row['supplier'], "total": float(row['total']), "transactions": int(row['count'])}
            for _, row in supplier_totals.head(20).iterrows()
        ],
        "concentration_ratio": float(concentration_ratio),  # % of spend going to top 20
        "total_unique_suppliers": len(supplier_totals),
        "single_transaction_suppliers": len(supplier_totals[supplier_totals['count'] == 1]),
        "sme_ratio": len(contract_df[contract_df['supplier_type'] == 'SME']) / len(contract_df) if len(contract_df) > 0 else 0
    }

    # ===== REALISTIC EFFICIENCY FLAGS =====
    # 1. Same-day same-supplier same-amount (genuinely suspicious, not staged payments)
    tx_df['date_supplier_amount'] = tx_df['date'].astype(str) + '|' + tx_df['supplier'] + '|' + tx_df['amount'].astype(str)
    same_day_duplicates = tx_df[tx_df.duplicated(subset=['date_supplier_amount'], keep=False)]

    if len(same_day_duplicates) > 0:
        dup_groups = same_day_duplicates.groupby('date_supplier_amount').agg({
            'amount': ['first', 'count'],
            'supplier': 'first',
            'date': 'first'
        }).reset_index()
        dup_groups.columns = ['key', 'amount', 'count', 'supplier', 'date']
        dup_groups = dup_groups[dup_groups['count'] > 1]

        genuine_duplicates = []
        for _, row in dup_groups.iterrows():
            genuine_duplicates.append({
                "supplier": row['supplier'],
                "amount": float(row['amount']),
                "date": row['date'],
                "occurrences": int(row['count']),
                "potential_overpayment": float(row['amount'] * (row['count'] - 1))
            })

        insights["efficiency_flags"].append({
            "type": "same_day_duplicates",
            "severity": "high",
            "description": "Identical payments to same supplier on same day - review for accidental duplicates",
            "count": len(genuine_duplicates),
            "potential_value": sum(d['potential_overpayment'] for d in genuine_duplicates),
            "items": genuine_duplicates[:20]  # Top 20
        })

    # 2. Round number payments (often estimates, not actuals)
    round_numbers = tx_df[tx_df['amount'].apply(lambda x: x > 1000 and x % 1000 == 0)]
    if len(round_numbers) > 0:
        insights["efficiency_flags"].append({
            "type": "round_number_payments",
            "severity": "low",
            "description": "Large round-number payments may indicate estimates rather than actuals",
            "count": len(round_numbers),
            "total_value": float(round_numbers['amount'].sum()),
            "examples": round_numbers.nlargest(10, 'amount')[['supplier', 'amount', 'date']].to_dict('records')
        })

    # 3. High-frequency small transactions (processing inefficiency)
    supplier_small_tx = tx_df[tx_df['amount'] < 500].groupby('supplier').size()
    frequent_small = supplier_small_tx[supplier_small_tx >= 10]
    if len(frequent_small) > 0:
        insights["efficiency_flags"].append({
            "type": "frequent_small_transactions",
            "severity": "medium",
            "description": "Suppliers with 10+ transactions under £500 - consider consolidating",
            "count": len(frequent_small),
            "suppliers": frequent_small.nlargest(10).to_dict(),
            "estimated_processing_overhead": len(frequent_small) * 10 * 15  # £15 per transaction
        })

    # 4. Category fragmentation (too many suppliers in one category)
    category_suppliers = tx_df.groupby('expenditure_category')['supplier'].nunique()
    category_spend = tx_df.groupby('expenditure_category')['amount'].sum()
    fragmented = category_suppliers[category_suppliers >= 20]

    fragmentation_issues = []
    for cat in fragmented.index:
        if cat and cat != 'nan':
            fragmentation_issues.append({
                "category": cat,
                "supplier_count": int(category_suppliers[cat]),
                "total_spend": float(category_spend.get(cat, 0)),
                "avg_per_supplier": float(category_spend.get(cat, 0) / category_suppliers[cat])
            })

    if fragmentation_issues:
        insights["efficiency_flags"].append({
            "type": "supplier_fragmentation",
            "severity": "medium",
            "description": "Categories with 20+ suppliers - potential for framework consolidation",
            "categories": sorted(fragmentation_issues, key=lambda x: -x['total_spend'])[:10]
        })

    # ===== POLITICAL ANGLES =====

    # 1. Largest single contracts (scrutiny targets)
    large_contracts = contract_df.nlargest(20, 'amount')[['supplier', 'amount', 'description', 'department', 'date']]
    insights["political_angles"].append({
        "type": "largest_contracts",
        "description": "Top 20 largest contract awards - natural scrutiny targets",
        "items": large_contracts.to_dict('records')
    })

    # 2. Non-SME spend (local economy angle)
    non_sme_contracts = contract_df[contract_df['supplier_type'].isin(['Large Enterprise', 'Local authority'])]
    if len(non_sme_contracts) > 0:
        insights["political_angles"].append({
            "type": "large_enterprise_spend",
            "description": "Spending with large enterprises vs SMEs - local economy impact",
            "non_sme_value": float(non_sme_contracts['amount'].sum()),
            "non_sme_count": len(non_sme_contracts),
            "sme_value": float(contract_df[contract_df['supplier_type'] == 'SME']['amount'].sum()),
            "top_large_suppliers": non_sme_contracts.groupby('supplier')['amount'].sum().nlargest(10).to_dict()
        })

    # 3. Grants to external bodies (accountability)
    grants = tx_df[tx_df['expenditure_category'].str.contains('Grant', case=False, na=False)]
    if len(grants) > 0:
        grant_recipients = grants.groupby('supplier')['amount'].sum().nlargest(15)
        insights["political_angles"].append({
            "type": "grant_recipients",
            "description": "External grant funding - requires outcome accountability",
            "total_grants": float(grants['amount'].sum()),
            "recipient_count": grants['supplier'].nunique(),
            "top_recipients": grant_recipients.to_dict()
        })

    # 4. Consultancy and professional services
    consultancy_keywords = ['CONSULT', 'ADVISOR', 'PROFESSIONAL', 'LEGAL', 'COUNSEL']
    consultancy_mask = tx_df['supplier'].str.upper().str.contains('|'.join(consultancy_keywords), na=False)
    consultancy = tx_df[consultancy_mask]
    if len(consultancy) > 0:
        insights["political_angles"].append({
            "type": "consultancy_spend",
            "description": "Professional/consultancy services - value for money scrutiny",
            "total_value": float(consultancy['amount'].sum()),
            "transaction_count": len(consultancy),
            "top_consultants": consultancy.groupby('supplier')['amount'].sum().nlargest(10).to_dict()
        })

    # ===== CONTRACT INTELLIGENCE =====

    # Contracts by department
    dept_contracts = contract_df.groupby('department').agg({
        'amount': 'sum',
        'order_number': 'count'
    }).reset_index()
    dept_contracts.columns = ['department', 'total_value', 'contract_count']
    dept_contracts = dept_contracts.sort_values('total_value', ascending=False)

    insights["contract_intelligence"] = {
        "by_department": dept_contracts.to_dict('records'),
        "by_supplier_type": contract_df.groupby('supplier_type')['amount'].sum().to_dict(),
        "avg_contract_value": float(contract_df['amount'].mean()),
        "median_contract_value": float(contract_df['amount'].median()),
    }

    # ===== YEAR-ON-YEAR ANALYSIS =====
    fy_spend = tx_df.groupby('financial_year')['amount'].sum().to_dict()
    fy_count = tx_df.groupby('financial_year')['amount'].count().to_dict()

    # COVID-19 analysis (if column exists)
    covid_analysis = {}
    if 'is_covid_related' in tx_df.columns:
        covid_df = tx_df[tx_df['is_covid_related'] == True]
        non_covid_df = tx_df[tx_df['is_covid_related'] == False]

        covid_by_year = covid_df.groupby('financial_year')['amount'].sum().to_dict()
        non_covid_by_year = non_covid_df.groupby('financial_year')['amount'].sum().to_dict()

        covid_analysis = {
            "covid_spend_by_year": {k: float(v) for k, v in covid_by_year.items()},
            "non_covid_spend_by_year": {k: float(v) for k, v in non_covid_by_year.items()},
            "total_covid_spend": float(covid_df['amount'].sum()),
            "covid_transaction_count": len(covid_df)
        }
    else:
        non_covid_by_year = fy_spend

    insights["yoy_analysis"] = {
        "spend_by_year": {k: float(v) for k, v in fy_spend.items()},
        "transactions_by_year": {k: int(v) for k, v in fy_count.items()},
        "covid_analysis": covid_analysis
    }

    # Calculate YoY changes (using non-COVID for fairer comparison where available)
    years = sorted(fy_spend.keys())
    if len(years) >= 2:
        changes = []
        for i in range(1, len(years)):
            prev_year = years[i-1]
            curr_year = years[i]

            # Use total spend
            prev_total = fy_spend.get(prev_year, 0)
            curr_total = fy_spend.get(curr_year, 0)

            # Also calculate excluding COVID
            prev_non_covid = non_covid_by_year.get(prev_year, prev_total)
            curr_non_covid = non_covid_by_year.get(curr_year, curr_total)

            if prev_total > 0:
                change_pct = ((curr_total - prev_total) / prev_total) * 100
                change_pct_ex_covid = ((curr_non_covid - prev_non_covid) / prev_non_covid) * 100 if prev_non_covid > 0 else 0

                changes.append({
                    "from_year": prev_year,
                    "to_year": curr_year,
                    "change_amount": float(curr_total - prev_total),
                    "change_percent": float(change_pct),
                    "change_percent_ex_covid": float(change_pct_ex_covid),
                    "note": "COVID grants included in earlier years" if prev_year in ['2021/22', '2022/23'] else None
                })
        insights["yoy_analysis"]["changes"] = changes

    # ===== TRANSPARENCY SCORE =====
    # Based on data completeness and quality
    completeness_scores = {
        "has_dates": tx_df['date'].notna().mean(),
        "has_suppliers": (tx_df['supplier'] != 'Unknown').mean(),
        "has_categories": (tx_df['expenditure_category'] != '').mean(),
        "has_departments": (contract_df['department'] != '').mean() if len(contract_df) > 0 else 0,
    }

    insights["transparency_metrics"] = {
        "data_completeness": completeness_scores,
        "overall_score": sum(completeness_scores.values()) / len(completeness_scores) * 100,
        "total_records": len(tx_df) + len(contract_df),
        "data_types_published": 3,  # Spend, Contracts, P-Cards
    }

    return insights


def main():
    print("=" * 60)
    print("Processing Burnley Borough Council Spending Data (V2)")
    print("=" * 60)

    OUTPUT_PATH.mkdir(parents=True, exist_ok=True)

    # Process data
    spend_data = process_spend_files()
    print(f"  Spend records: {len(spend_data)}")

    contracts_data = process_contracts_files()
    print(f"  Contracts records: {len(contracts_data)}")

    pcards_data = process_purchase_cards_files()
    print(f"  Purchase Cards records: {len(pcards_data)}")

    # Filter valid records
    spend_data = [r for r in spend_data if r['amount'] > 0]
    contracts_data = [r for r in contracts_data if r['amount'] > 0]
    pcards_data = [r for r in pcards_data if r['amount'] > 0]

    all_data = spend_data + contracts_data + pcards_data
    print(f"\nTotal valid records: {len(all_data)}")

    # Calculate insights
    print("\nCalculating realistic insights...")
    insights = calculate_realistic_insights(spend_data, contracts_data, pcards_data)

    # Generate metadata for filters
    df = pd.DataFrame(all_data)
    metadata = {
        "total_records": len(df),
        "financial_years": sorted(df['financial_year'].dropna().unique().tolist()),
        "data_types": df['type'].unique().tolist(),
        "filters": {
            "service_divisions": sorted([x for x in df.get('service_division', pd.Series()).dropna().unique() if x and x != 'nan']),
            "expenditure_categories": sorted([x for x in df.get('expenditure_category', pd.Series()).dropna().unique() if x and x != 'nan']),
            "departments": sorted([x for x in df.get('department', pd.Series()).dropna().unique() if x and x != 'nan']),
        }
    }

    # Save files
    print("\nSaving JSON files...")

    with open(OUTPUT_PATH / "spending.json", 'w') as f:
        json.dump(all_data, f)

    with open(OUTPUT_PATH / "metadata.json", 'w') as f:
        json.dump(metadata, f, indent=2)

    with open(OUTPUT_PATH / "insights.json", 'w') as f:
        json.dump(insights, f, indent=2)

    # Print summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Transaction Spend: £{insights['summary']['total_transaction_spend']:,.2f}")
    print(f"Contract Commitments: £{insights['summary']['total_contract_commitments']:,.2f}")
    print(f"Unique Suppliers: {insights['summary']['unique_suppliers']}")
    print(f"Top 20 Supplier Concentration: {insights['supplier_analysis']['concentration_ratio']*100:.1f}%")
    print(f"Transparency Score: {insights['transparency_metrics']['overall_score']:.1f}%")

    print(f"\nEfficiency Flags:")
    for flag in insights['efficiency_flags']:
        print(f"  - {flag['type']}: {flag.get('count', 'N/A')} items ({flag['severity']})")

    print("\nDone!")

if __name__ == "__main__":
    main()
