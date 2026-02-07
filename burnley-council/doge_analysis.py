#!/usr/bin/env python3
"""
DOGE-STYLE ANALYSIS OF BURNLEY BOROUGH COUNCIL SPENDING DATA
Comprehensive waste, fraud, and anomaly detection
"""

import pandas as pd
import numpy as np
import os
import glob
import json
from datetime import datetime, timedelta
from collections import defaultdict
import warnings
warnings.filterwarnings('ignore')

OUTPUT_FILE = '/Users/tompickup/clawd/burnley-council/doge_analysis_results.txt'
results = []

def log(msg):
    results.append(msg)
    print(msg)

def section(title):
    border = "=" * 80
    log(f"\n{border}")
    log(f"  {title}")
    log(f"{border}\n")

# ============================================================
# LOAD ALL DATA
# ============================================================
section("DATA LOADING")

# --- SPENDING DATA ---
spend_dir = '/Users/tompickup/Documents/BBC/Spend/'
spend_files = sorted(glob.glob(os.path.join(spend_dir, '*.csv')))
log(f"Found {len(spend_files)} spending files")

all_spend = []
for f in spend_files:
    try:
        df = pd.read_csv(f, skiprows=2, encoding='latin-1')
        # Clean up column names
        df.columns = [c.strip() for c in df.columns]
        # Extract quarter info from filename
        basename = os.path.basename(f)
        df['source_file'] = basename
        all_spend.append(df)
        log(f"  Loaded {basename}: {len(df)} rows")
    except Exception as e:
        log(f"  ERROR loading {os.path.basename(f)}: {e}")

spend_df = pd.concat(all_spend, ignore_index=True)
# Drop completely empty rows
spend_df = spend_df.dropna(how='all')
# Drop rows where Supplier Name is NaN
spend_df = spend_df.dropna(subset=['Supplier Name'])
log(f"\nTotal spending records (after cleanup): {len(spend_df)}")

# Parse amounts - remove commas and convert
def parse_amount(val):
    if pd.isna(val):
        return np.nan
    s = str(val).replace(',', '').replace('£', '').replace(' ', '').strip()
    try:
        return float(s)
    except:
        return np.nan

spend_df['Amount'] = spend_df['Net Amount'].apply(parse_amount)
spend_df = spend_df.dropna(subset=['Amount'])

# Parse dates
def parse_date(val):
    if pd.isna(val):
        return pd.NaT
    s = str(val).strip()
    for fmt in ['%d-%b-%y', '%d-%b-%Y', '%d/%m/%Y', '%d/%m/%y', '%Y-%m-%d']:
        try:
            return pd.to_datetime(s, format=fmt)
        except:
            continue
    try:
        return pd.to_datetime(s, dayfirst=True)
    except:
        return pd.NaT

spend_df['ParsedDate'] = spend_df['Date'].apply(parse_date)
spend_df['Supplier_Clean'] = spend_df['Supplier Name'].str.upper().str.strip()

total_spend = spend_df['Amount'].sum()
log(f"Total spending amount: £{total_spend:,.2f}")
log(f"Date range: {spend_df['ParsedDate'].min()} to {spend_df['ParsedDate'].max()}")
log(f"Unique suppliers: {spend_df['Supplier_Clean'].nunique()}")

# --- CONTRACTS DATA ---
contracts_dir = '/Users/tompickup/Documents/BBC/Contracts/'
contracts_files = sorted(glob.glob(os.path.join(contracts_dir, '*.csv')))
log(f"\nFound {len(contracts_files)} contract files")

all_contracts = []
for f in contracts_files:
    try:
        df = pd.read_csv(f, encoding='latin-1')
        df.columns = [c.strip() for c in df.columns]
        df['source_file'] = os.path.basename(f)
        all_contracts.append(df)
    except Exception as e:
        log(f"  ERROR loading {os.path.basename(f)}: {e}")

contracts_df = pd.concat(all_contracts, ignore_index=True)
contracts_df = contracts_df.dropna(how='all')
# Try to find supplier column
supplier_cols = [c for c in contracts_df.columns if 'supplier' in c.lower() or 'name' in c.lower()]
log(f"Contract columns: {list(contracts_df.columns)}")
log(f"Total contract records (raw): {len(contracts_df)}")

if 'Supplier Name' in contracts_df.columns:
    contracts_df['Supplier_Clean'] = contracts_df['Supplier Name'].str.upper().str.strip()
    contracts_df = contracts_df.dropna(subset=['Supplier Name'])
    log(f"Total contract records (cleaned): {len(contracts_df)}")
    log(f"Unique contracted suppliers: {contracts_df['Supplier_Clean'].nunique()}")

# Parse contract values
if 'Value' in contracts_df.columns:
    contracts_df['ContractValue'] = contracts_df['Value'].apply(parse_amount)

# --- PURCHASE CARDS DATA ---
pcard_dir = '/Users/tompickup/Documents/BBC/Purchase Cards/'
pcard_files = sorted(glob.glob(os.path.join(pcard_dir, '*.csv')))
log(f"\nFound {len(pcard_files)} purchase card files")

all_pcards = []
for f in pcard_files:
    try:
        df = pd.read_csv(f, skiprows=2, encoding='latin-1')
        df.columns = [c.strip() for c in df.columns]
        df['source_file'] = os.path.basename(f)
        all_pcards.append(df)
    except Exception as e:
        log(f"  ERROR loading {os.path.basename(f)}: {e}")

pcard_df = pd.concat(all_pcards, ignore_index=True)
pcard_df = pcard_df.dropna(how='all')
if 'Payee Name' in pcard_df.columns:
    pcard_df = pcard_df.dropna(subset=['Payee Name'])
pcard_df['Amount'] = pcard_df['Net Amount'].apply(parse_amount)
pcard_df['ParsedDate'] = pcard_df['Date'].apply(parse_date)
pcard_df['Supplier_Clean'] = pcard_df['Payee Name'].str.upper().str.strip() if 'Payee Name' in pcard_df.columns else ''
log(f"Total purchase card records: {len(pcard_df)}")
log(f"Total purchase card spending: £{pcard_df['Amount'].sum():,.2f}")


# ============================================================
# ANALYSIS 1: DUPLICATE PAYMENTS
# ============================================================
section("ANALYSIS 1: DUPLICATE PAYMENTS")

# Exact duplicates (same supplier, amount, date)
log("--- EXACT DUPLICATES (same supplier, same amount, same date) ---")
dup_cols = ['Supplier_Clean', 'Amount', 'ParsedDate']
exact_dups = spend_df[spend_df.duplicated(subset=dup_cols, keep=False)].sort_values(dup_cols)
n_exact_groups = exact_dups.groupby(dup_cols).ngroups
log(f"Found {len(exact_dups)} rows in {n_exact_groups} exact duplicate groups")
log(f"Potential overpayment from exact duplicates: £{exact_dups.groupby(dup_cols)['Amount'].first().sum() - exact_dups.groupby(dup_cols)['Amount'].count().sum() * 0:,.2f}")

# Show the top exact duplicate groups by amount
if len(exact_dups) > 0:
    dup_summary = exact_dups.groupby(['Supplier_Clean', 'Amount']).agg(
        count=('ParsedDate', 'count'),
        dates=('ParsedDate', lambda x: ', '.join(str(d.date()) if pd.notna(d) else 'NaT' for d in sorted(x))),
        total=('Amount', 'sum')
    ).reset_index()
    dup_summary = dup_summary.sort_values('total', ascending=False)

    log(f"\nTop 30 exact duplicate groups by total value:")
    for _, row in dup_summary.head(30).iterrows():
        log(f"  {row['Supplier_Clean'][:50]:50s} | £{row['Amount']:>12,.2f} x {row['count']} = £{row['total']:>12,.2f} | Dates: {row['dates'][:80]}")

    total_dup_value = dup_summary['total'].sum() - dup_summary['Amount'].sum()
    log(f"\n  TOTAL VALUE OF POTENTIAL DUPLICATE OVERPAYMENTS: £{total_dup_value:,.2f}")

# Near-duplicates (same supplier, same amount, within 7 days)
log("\n--- NEAR-DUPLICATES (same supplier, same amount, within 7 days on different dates) ---")
near_dups = []
for (supplier, amount), group in spend_df.groupby(['Supplier_Clean', 'Amount']):
    if len(group) < 2:
        continue
    dates = group['ParsedDate'].dropna().sort_values()
    if len(dates) < 2:
        continue
    for i in range(len(dates)):
        for j in range(i+1, len(dates)):
            diff = abs((dates.iloc[j] - dates.iloc[i]).days)
            if 0 < diff <= 7:
                near_dups.append({
                    'Supplier': supplier,
                    'Amount': amount,
                    'Date1': dates.iloc[i],
                    'Date2': dates.iloc[j],
                    'DaysBetween': diff
                })

near_dup_df = pd.DataFrame(near_dups)
if len(near_dup_df) > 0:
    near_dup_df = near_dup_df.drop_duplicates()
    near_dup_df = near_dup_df.sort_values('Amount', ascending=False)
    log(f"Found {len(near_dup_df)} near-duplicate pairs")
    log(f"\nTop 30 near-duplicate pairs by amount:")
    for _, row in near_dup_df.head(30).iterrows():
        log(f"  {row['Supplier'][:45]:45s} | £{row['Amount']:>12,.2f} | {str(row['Date1'].date()):10s} -> {str(row['Date2'].date()):10s} ({row['DaysBetween']}d apart)")
    total_near_dup = near_dup_df['Amount'].sum()
    log(f"\n  TOTAL VALUE OF NEAR-DUPLICATE PAYMENTS: £{total_near_dup:,.2f}")
else:
    log("No near-duplicates found")


# ============================================================
# ANALYSIS 2: ROUND NUMBER PAYMENTS
# ============================================================
section("ANALYSIS 2: ROUND NUMBER PAYMENTS (Potential Estimates)")

round_thresholds = [100000, 75000, 50000, 25000, 20000, 15000, 10000, 5000]
log("Payments that are suspiciously round (exact thousands, £5k+):")

round_payments = spend_df[
    (spend_df['Amount'] >= 5000) &
    (spend_df['Amount'] % 1000 == 0)
].sort_values('Amount', ascending=False)

log(f"Found {len(round_payments)} round-number payments >= £5,000")
log(f"Total value of round payments: £{round_payments['Amount'].sum():,.2f}")
log(f"\nBreakdown by amount:")
for threshold in round_thresholds:
    count = len(round_payments[round_payments['Amount'] == threshold])
    if count > 0:
        log(f"  Exactly £{threshold:>8,}: {count:>4} payments")

log(f"\nAll round payments >= £50,000:")
big_round = round_payments[round_payments['Amount'] >= 50000]
for _, row in big_round.iterrows():
    date_str = str(row['ParsedDate'].date()) if pd.notna(row['ParsedDate']) else 'N/A'
    log(f"  £{row['Amount']:>12,.2f} | {row['Supplier_Clean'][:50]:50s} | {date_str} | {str(row.get('Expenditure Category', 'N/A'))[:30]}")

log(f"\nAll round payments £10,000 - £49,999:")
mid_round = round_payments[(round_payments['Amount'] >= 10000) & (round_payments['Amount'] < 50000)]
for _, row in mid_round.head(50).iterrows():
    date_str = str(row['ParsedDate'].date()) if pd.notna(row['ParsedDate']) else 'N/A'
    log(f"  £{row['Amount']:>12,.2f} | {row['Supplier_Clean'][:50]:50s} | {date_str}")


# ============================================================
# ANALYSIS 3: TOP SUPPLIERS
# ============================================================
section("ANALYSIS 3: TOP 20 SUPPLIERS BY TOTAL SPEND")

supplier_totals = spend_df.groupby('Supplier_Clean').agg(
    total_amount=('Amount', 'sum'),
    num_payments=('Amount', 'count'),
    avg_payment=('Amount', 'mean'),
    max_payment=('Amount', 'max'),
    min_payment=('Amount', 'min'),
    first_date=('ParsedDate', 'min'),
    last_date=('ParsedDate', 'max')
).reset_index().sort_values('total_amount', ascending=False)

log(f"{'Rank':>4} | {'Supplier':50s} | {'Total':>14s} | {'#Pays':>6s} | {'Avg':>12s} | {'Max':>12s}")
log("-" * 120)
for i, (_, row) in enumerate(supplier_totals.head(20).iterrows(), 1):
    log(f"{i:4d} | {row['Supplier_Clean'][:50]:50s} | £{row['total_amount']:>12,.2f} | {row['num_payments']:>5.0f} | £{row['avg_payment']:>10,.2f} | £{row['max_payment']:>10,.2f}")

# Flag suppliers with many small payments (potential splitting)
log(f"\n--- SUPPLIERS WITH UNUSUALLY HIGH NUMBER OF PAYMENTS ---")
log(f"(More than 20 payments and average < £5,000 - potential payment splitting)")
many_small = supplier_totals[(supplier_totals['num_payments'] > 20) & (supplier_totals['avg_payment'] < 5000)]
many_small = many_small.sort_values('num_payments', ascending=False)
for _, row in many_small.head(20).iterrows():
    log(f"  {row['Supplier_Clean'][:50]:50s} | {row['num_payments']:>4.0f} payments | avg £{row['avg_payment']:>8,.2f} | total £{row['total_amount']:>12,.2f}")


# ============================================================
# ANALYSIS 4: SPLIT PAYMENTS
# ============================================================
section("ANALYSIS 4: SPLIT PAYMENTS (Same supplier, same day, multiple payments)")

log("Looking for same supplier getting multiple payments on the same day...")
log("(Potential avoidance of £500 transparency threshold)\n")

same_day = spend_df.groupby(['Supplier_Clean', 'ParsedDate']).agg(
    count=('Amount', 'count'),
    total=('Amount', 'sum'),
    amounts=('Amount', lambda x: list(x)),
    min_amt=('Amount', 'min'),
    max_amt=('Amount', 'max')
).reset_index()

# Multiple payments same day
multi_same_day = same_day[same_day['count'] >= 2].sort_values('total', ascending=False)
log(f"Found {len(multi_same_day)} instances of same supplier + same day + multiple payments")

# Specifically flag where individual amounts are below threshold but combined exceed it
threshold_splits = same_day[
    (same_day['count'] >= 2) &
    (same_day['max_amt'] < 500) &
    (same_day['total'] >= 500)
]
log(f"Found {len(threshold_splits)} cases where individual payments < £500 but combined >= £500 (SUSPICIOUS)")
if len(threshold_splits) > 0:
    for _, row in threshold_splits.sort_values('total', ascending=False).head(20).iterrows():
        date_str = str(row['ParsedDate'].date()) if pd.notna(row['ParsedDate']) else 'N/A'
        log(f"  {row['Supplier_Clean'][:45]:45s} | {date_str} | {row['count']} payments | amounts: {row['amounts']} | combined: £{row['total']:,.2f}")

log(f"\nTop 30 same-day multi-payment instances by total value:")
for _, row in multi_same_day.head(30).iterrows():
    date_str = str(row['ParsedDate'].date()) if pd.notna(row['ParsedDate']) else 'N/A'
    amounts_str = ', '.join(f'£{a:,.2f}' for a in sorted(row['amounts'], reverse=True)[:5])
    if len(row['amounts']) > 5:
        amounts_str += f'... +{len(row["amounts"])-5} more'
    log(f"  {row['Supplier_Clean'][:40]:40s} | {date_str} | {row['count']:>2} pays | Total: £{row['total']:>12,.2f} | {amounts_str}")


# ============================================================
# ANALYSIS 5: WEEKEND / BANK HOLIDAY PAYMENTS
# ============================================================
section("ANALYSIS 5: WEEKEND & BANK HOLIDAY PAYMENTS")

# UK bank holidays (approximate - major ones)
bank_holidays = pd.to_datetime([
    # 2021
    '2021-04-02', '2021-04-05', '2021-05-03', '2021-05-31', '2021-08-30', '2021-12-27', '2021-12-28',
    # 2022
    '2022-01-03', '2022-04-15', '2022-04-18', '2022-05-02', '2022-06-02', '2022-06-03', '2022-08-29',
    '2022-09-19', '2022-12-26', '2022-12-27',
    # 2023
    '2023-01-02', '2023-04-07', '2023-04-10', '2023-05-01', '2023-05-08', '2023-05-29', '2023-08-28',
    '2023-12-25', '2023-12-26',
    # 2024
    '2024-01-01', '2024-03-29', '2024-04-01', '2024-05-06', '2024-05-27', '2024-08-26', '2024-12-25', '2024-12-26',
    # 2025
    '2025-01-01', '2025-04-18', '2025-04-21', '2025-05-05', '2025-05-26', '2025-08-25', '2025-12-25', '2025-12-26',
])

spend_with_dates = spend_df.dropna(subset=['ParsedDate']).copy()
spend_with_dates['DayOfWeek'] = spend_with_dates['ParsedDate'].dt.dayofweek  # 0=Mon, 6=Sun
spend_with_dates['DayName'] = spend_with_dates['ParsedDate'].dt.day_name()

# Weekend payments
weekend = spend_with_dates[spend_with_dates['DayOfWeek'] >= 5]
log(f"WEEKEND PAYMENTS: {len(weekend)} payments totalling £{weekend['Amount'].sum():,.2f}")
if len(weekend) > 0:
    log(f"\nWeekend payments by day:")
    for day in ['Saturday', 'Sunday']:
        day_df = weekend[weekend['DayName'] == day]
        log(f"  {day}: {len(day_df)} payments, £{day_df['Amount'].sum():,.2f}")

    log(f"\nTop 20 weekend payments:")
    for _, row in weekend.sort_values('Amount', ascending=False).head(20).iterrows():
        log(f"  {row['DayName']:9s} {str(row['ParsedDate'].date()):10s} | £{row['Amount']:>12,.2f} | {row['Supplier_Clean'][:45]}")

# Bank holiday payments
bh_payments = spend_with_dates[spend_with_dates['ParsedDate'].dt.normalize().isin(bank_holidays)]
log(f"\nBANK HOLIDAY PAYMENTS: {len(bh_payments)} payments totalling £{bh_payments['Amount'].sum():,.2f}")
if len(bh_payments) > 0:
    log(f"\nTop 20 bank holiday payments:")
    for _, row in bh_payments.sort_values('Amount', ascending=False).head(20).iterrows():
        log(f"  {str(row['ParsedDate'].date()):10s} ({row['DayName']:9s}) | £{row['Amount']:>12,.2f} | {row['Supplier_Clean'][:45]}")


# ============================================================
# ANALYSIS 6: YEAR-OVER-YEAR SPENDING
# ============================================================
section("ANALYSIS 6: QUARTERLY & YEARLY SPENDING TRENDS")

spend_dated = spend_df.dropna(subset=['ParsedDate']).copy()
spend_dated['Year'] = spend_dated['ParsedDate'].dt.year
spend_dated['Quarter'] = spend_dated['ParsedDate'].dt.quarter
spend_dated['YQ'] = spend_dated['Year'].astype(str) + '-Q' + spend_dated['Quarter'].astype(str)

# Financial year quarters (UK: Apr-Mar)
def get_fy_quarter(dt):
    if pd.isna(dt):
        return None
    month = dt.month
    year = dt.year
    if month >= 4:
        fy = f"{year}/{year+1}"
        if month <= 6: q = 'Q1'
        elif month <= 9: q = 'Q2'
        elif month <= 12: q = 'Q3'
    else:
        fy = f"{year-1}/{year}"
        q = 'Q4'
    return f"{fy} {q}"

spend_dated['FY_Quarter'] = spend_dated['ParsedDate'].apply(get_fy_quarter)

quarterly = spend_dated.groupby('FY_Quarter').agg(
    total=('Amount', 'sum'),
    count=('Amount', 'count'),
    avg=('Amount', 'mean')
).reset_index().sort_values('FY_Quarter')

log(f"{'FY Quarter':20s} | {'Total Spend':>14s} | {'# Payments':>10s} | {'Avg Payment':>12s}")
log("-" * 70)
for _, row in quarterly.iterrows():
    log(f"{str(row['FY_Quarter']):20s} | £{row['total']:>12,.2f} | {row['count']:>10.0f} | £{row['avg']:>10,.2f}")

# Year-over-year
log(f"\n--- FINANCIAL YEAR TOTALS ---")
def get_fy(dt):
    if pd.isna(dt): return None
    if dt.month >= 4:
        return f"{dt.year}/{dt.year+1}"
    return f"{dt.year-1}/{dt.year}"

spend_dated['FY'] = spend_dated['ParsedDate'].apply(get_fy)
yearly = spend_dated.groupby('FY').agg(
    total=('Amount', 'sum'),
    count=('Amount', 'count')
).reset_index().sort_values('FY')

for _, row in yearly.iterrows():
    log(f"  {row['FY']:12s}: £{row['total']:>14,.2f} ({row['count']:.0f} payments)")

# Detect spikes
if len(quarterly) > 1:
    quarterly['total_num'] = quarterly['total']
    mean_q = quarterly['total_num'].mean()
    std_q = quarterly['total_num'].std()
    spikes = quarterly[quarterly['total_num'] > mean_q + 1.5 * std_q]
    if len(spikes) > 0:
        log(f"\n--- UNUSUAL SPENDING SPIKES (> 1.5 std above mean) ---")
        log(f"Mean quarterly spend: £{mean_q:,.2f}, Std: £{std_q:,.2f}")
        for _, row in spikes.iterrows():
            pct_above = ((row['total_num'] - mean_q) / mean_q) * 100
            log(f"  {row['FY_Quarter']:20s}: £{row['total_num']:>14,.2f} ({pct_above:+.1f}% above mean)")


# ============================================================
# ANALYSIS 7: CONTRACT vs SPENDING CROSS-CHECK
# ============================================================
section("ANALYSIS 7: CONTRACT vs SPENDING CROSS-CHECK")

log("Checking for suppliers receiving large payments but NOT in contracts register...\n")

# Get unique contracted suppliers
contracted_suppliers = set()
if 'Supplier_Clean' in contracts_df.columns:
    contracted_suppliers = set(contracts_df['Supplier_Clean'].dropna().unique())
    log(f"Unique suppliers in contracts register: {len(contracted_suppliers)}")

# Get top spending suppliers
top_spenders = supplier_totals.head(100)
log(f"Checking top 100 spending suppliers against contracts register...\n")

uncontracted = []
for _, row in top_spenders.iterrows():
    supplier = row['Supplier_Clean']
    # Check for fuzzy match (supplier name contained in any contract supplier)
    found = False
    for cs in contracted_suppliers:
        if pd.isna(cs):
            continue
        if supplier in cs or cs in supplier:
            found = True
            break
    if not found:
        uncontracted.append(row)

log(f"Found {len(uncontracted)} top-100 suppliers NOT in contracts register:")
log(f"\n{'Rank':>4} | {'Supplier':50s} | {'Total Spend':>14s} | {'# Payments':>6s}")
log("-" * 90)
for i, row in enumerate(uncontracted[:40], 1):
    log(f"{i:4d} | {row['Supplier_Clean'][:50]:50s} | £{row['total_amount']:>12,.2f} | {row['num_payments']:>5.0f}")

total_uncontracted = sum(r['total_amount'] for r in uncontracted)
log(f"\n  TOTAL SPEND WITH NO CONTRACT ON FILE: £{total_uncontracted:,.2f}")


# ============================================================
# ANALYSIS 8: PURCHASE CARD ANALYSIS
# ============================================================
section("ANALYSIS 8: PURCHASE CARD ANALYSIS")

log(f"Total purchase card transactions: {len(pcard_df)}")
log(f"Total purchase card spend: £{pcard_df['Amount'].sum():,.2f}")

# Unusual vendor categories
unusual_keywords = ['AMAZON', 'EBAY', 'HOTEL', 'RESTAURANT', 'CAFE', 'COFFEE', 'PUB', 'BAR',
                     'TAKEAWAY', 'PIZZA', 'UBER', 'JUST EAT', 'DELIVEROO', 'ARGOS', 'TESCO',
                     'CURRY', 'JOHN LEWIS', 'HALFORDS', 'B&Q', 'SCREWFIX', 'WICKES',
                     'NETFLIX', 'SPOTIFY', 'APPLE', 'GOOGLE', 'PAYPAL']

log(f"\n--- PURCHASE CARD TRANSACTIONS TO NOTABLE VENDORS ---")
for keyword in unusual_keywords:
    matches = pcard_df[pcard_df['Supplier_Clean'].str.contains(keyword, na=False)]
    if len(matches) > 0:
        log(f"\n  {keyword}: {len(matches)} transactions, £{matches['Amount'].sum():,.2f}")
        for _, row in matches.sort_values('Amount', ascending=False).head(5).iterrows():
            date_str = str(row['ParsedDate'].date()) if pd.notna(row['ParsedDate']) else 'N/A'
            log(f"    £{row['Amount']:>8,.2f} | {date_str} | {row['Supplier_Clean'][:40]}")

# Top purchase card transactions
log(f"\n--- TOP 30 HIGHEST INDIVIDUAL PURCHASE CARD TRANSACTIONS ---")
top_pcard = pcard_df.sort_values('Amount', ascending=False).head(30)
for _, row in top_pcard.iterrows():
    date_str = str(row['ParsedDate'].date()) if pd.notna(row['ParsedDate']) else 'N/A'
    cat = str(row.get('Merchant Category', 'N/A'))[:25] if pd.notna(row.get('Merchant Category')) else 'N/A'
    dept = str(row.get('Service Division Label', 'N/A'))[:30] if pd.notna(row.get('Service Division Label')) else 'N/A'
    log(f"  £{row['Amount']:>10,.2f} | {date_str} | {row['Supplier_Clean'][:35]:35s} | {cat:25s} | {dept}")

# Top purchase card suppliers
log(f"\n--- TOP 20 PURCHASE CARD SUPPLIERS BY TOTAL ---")
pcard_suppliers = pcard_df.groupby('Supplier_Clean').agg(
    total=('Amount', 'sum'),
    count=('Amount', 'count'),
    avg=('Amount', 'mean')
).reset_index().sort_values('total', ascending=False)
for _, row in pcard_suppliers.head(20).iterrows():
    log(f"  {row['Supplier_Clean'][:45]:45s} | £{row['total']:>10,.2f} | {row['count']:>4.0f} transactions")


# ============================================================
# ANALYSIS 9: JSON INTEGRITY CHECK
# ============================================================
section("ANALYSIS 9: JSON DATA INTEGRITY CHECK")

json_path = '/Users/tompickup/clawd/burnley-council/burnley-app/public/data/spending.json'
try:
    with open(json_path, 'r') as f:
        json_data = json.load(f)

    if isinstance(json_data, list):
        json_records = json_data
    elif isinstance(json_data, dict):
        # Try common keys
        for key in ['data', 'records', 'spending', 'transactions', 'items']:
            if key in json_data:
                json_records = json_data[key]
                break
        else:
            json_records = json_data
            log(f"JSON is a dict with keys: {list(json_data.keys())[:10]}")

    log(f"JSON file loaded successfully")

    if isinstance(json_records, list):
        log(f"  JSON record count: {len(json_records)}")
        log(f"  CSV record count:  {len(spend_df)}")
        diff = len(json_records) - len(spend_df)
        log(f"  Difference: {diff:+d} records")

        if diff != 0:
            log(f"  *** WARNING: Record count mismatch! ***")
        else:
            log(f"  Record counts match.")

        # Try to sum amounts in JSON
        json_total = 0
        amount_key = None
        if len(json_records) > 0:
            sample = json_records[0]
            if isinstance(sample, dict):
                log(f"  JSON record keys: {list(sample.keys())[:15]}")
                for k in sample.keys():
                    if 'amount' in k.lower() or 'value' in k.lower() or 'net' in k.lower():
                        amount_key = k
                        break

                if amount_key:
                    for rec in json_records:
                        try:
                            val = rec.get(amount_key, 0)
                            if isinstance(val, str):
                                val = float(val.replace(',', '').replace('£', ''))
                            json_total += float(val) if val else 0
                        except:
                            pass

                    log(f"\n  JSON total amount ({amount_key}): £{json_total:,.2f}")
                    log(f"  CSV total amount: £{total_spend:,.2f}")
                    diff_pct = ((json_total - total_spend) / total_spend * 100) if total_spend > 0 else 0
                    log(f"  Difference: £{json_total - total_spend:+,.2f} ({diff_pct:+.2f}%)")

                    if abs(diff_pct) > 1:
                        log(f"  *** WARNING: Significant amount discrepancy! ***")
                    else:
                        log(f"  Amounts are within 1% - acceptable.")
    else:
        log(f"  JSON data type: {type(json_records)}")

except FileNotFoundError:
    log(f"  JSON file not found at {json_path}")
except json.JSONDecodeError as e:
    log(f"  JSON parse error: {e}")
except Exception as e:
    log(f"  Error analyzing JSON: {e}")


# ============================================================
# ANALYSIS 10: CONSULTANCY SPENDING
# ============================================================
section("ANALYSIS 10: CONSULTANCY SPENDING")

consult_keywords = ['CONSULT', 'ADVISORY', 'PROFESSIONAL SERVICES', 'ADVISOR', 'COUNSEL',
                     'STRATEGY', 'MANAGEMENT SERVICES', 'INTERIM']

# Search in supplier names
log("--- CONSULTANCY BY SUPPLIER NAME ---")
consult_mask = spend_df['Supplier_Clean'].str.contains('|'.join(consult_keywords), na=False, case=False)
consult_spend = spend_df[consult_mask]
log(f"Found {len(consult_spend)} payments to suppliers with consultancy-related names")
log(f"Total consultancy spend (by supplier name): £{consult_spend['Amount'].sum():,.2f}")

consult_by_supplier = consult_spend.groupby('Supplier_Clean').agg(
    total=('Amount', 'sum'),
    count=('Amount', 'count')
).reset_index().sort_values('total', ascending=False)

log(f"\nTop consultancy suppliers:")
for _, row in consult_by_supplier.head(30).iterrows():
    log(f"  {row['Supplier_Clean'][:55]:55s} | £{row['total']:>12,.2f} | {row['count']:>3.0f} payments")

# Search in expenditure categories
log(f"\n--- CONSULTANCY BY EXPENDITURE CATEGORY ---")
if 'CIPFA detailed expediture type' in spend_df.columns:
    cipfa_consult = spend_df[spend_df['CIPFA detailed expediture type'].str.contains('|'.join(consult_keywords), na=False, case=False)]
    log(f"Found {len(cipfa_consult)} payments categorized as consultancy")
    log(f"Total: £{cipfa_consult['Amount'].sum():,.2f}")

    # Break down by category
    cat_breakdown = cipfa_consult.groupby('CIPFA detailed expediture type')['Amount'].agg(['sum', 'count']).sort_values('sum', ascending=False)
    for cat, row in cat_breakdown.iterrows():
        log(f"  {str(cat)[:50]:50s} | £{row['sum']:>12,.2f} | {row['count']:>4.0f} payments")

if 'Expenditure Category' in spend_df.columns:
    exp_consult = spend_df[spend_df['Expenditure Category'].str.contains('|'.join(consult_keywords), na=False, case=False)]
    if len(exp_consult) > 0:
        log(f"\nBy Expenditure Category: {len(exp_consult)} payments, £{exp_consult['Amount'].sum():,.2f}")


# ============================================================
# BONUS: ADDITIONAL ANOMALIES
# ============================================================
section("BONUS ANALYSIS: ADDITIONAL RED FLAGS")

# Credit notes / negative amounts
log("--- CREDIT NOTES / NEGATIVE AMOUNTS ---")
credits = spend_df[spend_df['Amount'] < 0]
log(f"Found {len(credits)} credit notes/negative payments totalling £{credits['Amount'].sum():,.2f}")
if len(credits) > 0:
    log(f"\nTop 20 credit notes by absolute value:")
    for _, row in credits.sort_values('Amount').head(20).iterrows():
        date_str = str(row['ParsedDate'].date()) if pd.notna(row['ParsedDate']) else 'N/A'
        log(f"  £{row['Amount']:>12,.2f} | {row['Supplier_Clean'][:45]:45s} | {date_str}")

# Very large single payments
log(f"\n--- LARGEST INDIVIDUAL PAYMENTS (Top 30) ---")
for _, row in spend_df.sort_values('Amount', ascending=False).head(30).iterrows():
    date_str = str(row['ParsedDate'].date()) if pd.notna(row['ParsedDate']) else 'N/A'
    cat = str(row.get('Expenditure Category', 'N/A'))[:25]
    log(f"  £{row['Amount']:>14,.2f} | {row['Supplier_Clean'][:40]:40s} | {date_str} | {cat}")

# End-of-year spending spikes (March payments)
log(f"\n--- END-OF-FINANCIAL-YEAR SPENDING (March - potential year-end rush) ---")
march = spend_dated[spend_dated['ParsedDate'].dt.month == 3]
march_by_year = march.groupby('Year').agg(total=('Amount', 'sum'), count=('Amount', 'count')).reset_index()
for _, row in march_by_year.iterrows():
    log(f"  March {row['Year']:.0f}: £{row['total']:>14,.2f} ({row['count']:.0f} payments)")


# ============================================================
# SUMMARY
# ============================================================
section("EXECUTIVE SUMMARY")

log(f"BURNLEY BOROUGH COUNCIL - DOGE SPENDING ANALYSIS")
log(f"Analysis Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
log(f"Data Period: {spend_df['ParsedDate'].min().date()} to {spend_df['ParsedDate'].max().date()}")
log(f"")
log(f"TOTAL SPENDING ANALYSED: £{total_spend:,.2f}")
log(f"Total Payments: {len(spend_df):,}")
log(f"Unique Suppliers: {spend_df['Supplier_Clean'].nunique():,}")
log(f"")
log(f"KEY FINDINGS:")
log(f"  1. EXACT DUPLICATE PAYMENTS: {len(exact_dups)} records in {n_exact_groups} groups")
if len(exact_dups) > 0:
    log(f"     Potential overpayment: £{total_dup_value:,.2f}")
log(f"  2. NEAR-DUPLICATE PAYMENTS: {len(near_dup_df)} pairs within 7 days")
if len(near_dup_df) > 0:
    log(f"     Total value at risk: £{total_near_dup:,.2f}")
log(f"  3. ROUND NUMBER PAYMENTS (>=£5k): {len(round_payments)}, totalling £{round_payments['Amount'].sum():,.2f}")
log(f"  4. SAME-DAY MULTI-PAYMENTS: {len(multi_same_day)} instances")
if len(threshold_splits) > 0:
    log(f"     Potential threshold-splitting cases: {len(threshold_splits)}")
log(f"  5. WEEKEND PAYMENTS: {len(weekend)}, totalling £{weekend['Amount'].sum():,.2f}")
log(f"     Bank holiday payments: {len(bh_payments)}, totalling £{bh_payments['Amount'].sum():,.2f}")
log(f"  6. UNCONTRACTED TOP SUPPLIERS: {len(uncontracted)} of top 100")
log(f"     Value without contract: £{total_uncontracted:,.2f}")
log(f"  7. CONSULTANCY SPEND: £{consult_spend['Amount'].sum():,.2f} ({len(consult_spend)} payments)")
log(f"  8. PURCHASE CARD SPEND: £{pcard_df['Amount'].sum():,.2f} ({len(pcard_df)} transactions)")
log(f"  9. CREDIT NOTES: {len(credits)} totalling £{credits['Amount'].sum():,.2f}")


# Write to file
with open(OUTPUT_FILE, 'w') as f:
    f.write('\n'.join(results))

print(f"\n\n*** Results written to {OUTPUT_FILE} ***")
print(f"*** Total lines: {len(results)} ***")
