#!/usr/bin/env python3
"""
Extract budget data from Burnley Borough Council Budget Book PDFs.
Creates structured JSON for DOGE-style analysis.
"""

import pdfplumber
import json
import re
from pathlib import Path
from collections import defaultdict

BBC_BUDGETS_PATH = Path("/Users/tompickup/Documents/BBC/Budgets")
OUTPUT_PATH = Path("/Users/tompickup/clawd/burnley-council/public/data")

def extract_year_from_filename(filename):
    """Extract financial year from filename like Budget-Book-2025-26.pdf"""
    match = re.search(r'(\d{4})-(\d{2})\.pdf', filename)
    if match:
        return f"{match.group(1)}/{match.group(2)}"
    return None

def clean_amount(text):
    """Convert amount text to float."""
    if not text or text.strip() in ['', '-', '—', '–']:
        return 0.0
    # Remove parentheses (negative), commas, £ sign
    text = text.strip()
    is_negative = '(' in text or text.startswith('-')
    text = re.sub(r'[£,()（）\s]', '', text)
    text = text.replace('−', '-').replace('–', '-')
    try:
        value = float(text.lstrip('-'))
        return -value if is_negative else value
    except ValueError:
        return 0.0

def extract_budget_tables(pdf_path):
    """Extract budget tables from PDF."""
    year = extract_year_from_filename(pdf_path.name)
    print(f"Processing: {pdf_path.name} ({year})")

    budget_data = {
        "financial_year": year,
        "filename": pdf_path.name,
        "departments": [],
        "summary": {},
        "revenue_budget": {},
        "capital_programme": {}
    }

    department_budgets = []
    current_department = None

    with pdfplumber.open(pdf_path) as pdf:
        full_text = ""
        for page in pdf.pages:
            text = page.extract_text() or ""
            full_text += text + "\n"

            # Try to extract tables
            tables = page.extract_tables()
            for table in tables:
                if not table:
                    continue

                # Look for department budget tables
                for row in table:
                    if not row:
                        continue
                    row_text = ' '.join([str(c) for c in row if c]).lower()

                    # Detect department headers
                    departments = [
                        'management team', 'policy & engagement', 'people & development',
                        'green spaces', 'legal & democratic', 'finance & property',
                        'revenues & benefits', 'leisure trust', 'streetscene',
                        'housing & development', 'economy & growth', 'strategic partnership',
                        'corporate budgets', 'housing', 'regeneration'
                    ]

                    for dept in departments:
                        if dept in row_text and len(row_text) < 100:
                            current_department = dept.title()
                            break

        # Extract key figures using regex patterns on full text
        # Look for Revenue Budget Summary table
        revenue_patterns = [
            (r'Net Budget Requirement[:\s]*([\d,]+)', 'net_budget_requirement'),
            (r'Council Tax[:\s]*([\d,]+)', 'council_tax_income'),
            (r'Business Rates[:\s]*([\d,]+)', 'business_rates'),
            (r'Revenue Support Grant[:\s]*([\d,]+)', 'revenue_support_grant'),
            (r'Total Funding[:\s]*([\d,]+)', 'total_funding'),
        ]

        for pattern, key in revenue_patterns:
            match = re.search(pattern, full_text, re.IGNORECASE)
            if match:
                budget_data['revenue_budget'][key] = clean_amount(match.group(1))

        # Extract total figures
        total_patterns = [
            (r'Total Net (Expenditure|Budget)[:\s]*([\d,]+)', 'total_net_expenditure'),
            (r'Employee Costs?[:\s]*([\d,]+)', 'employee_costs'),
            (r'Premises[:\s]*([\d,]+)', 'premises_costs'),
            (r'Supplies & Services[:\s]*([\d,]+)', 'supplies_services'),
        ]

        for pattern, key in total_patterns:
            matches = re.findall(pattern, full_text, re.IGNORECASE)
            if matches:
                # Take the largest value found (likely the total)
                if isinstance(matches[0], tuple):
                    values = [clean_amount(m[-1]) for m in matches]
                else:
                    values = [clean_amount(m) for m in matches]
                if values:
                    budget_data['summary'][key] = max(values)

    return budget_data

def extract_detailed_budgets(pdf_path):
    """More detailed extraction focusing on department breakdowns."""
    year = extract_year_from_filename(pdf_path.name)

    departments = {}

    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            tables = page.extract_tables()

            # Known department names to look for
            dept_names = [
                "Management Team", "Policy & Engagement", "Policy and Engagement",
                "People & Development", "People and Development",
                "Green Spaces & Amenities", "Green Spaces and Amenities",
                "Legal & Democratic Services", "Legal and Democratic Services",
                "Finance & Property", "Finance and Property",
                "Revenues & Benefits", "Revenues and Benefits",
                "Leisure Trust Client", "Leisure Trust",
                "Streetscene", "Street Scene",
                "Housing & Development Control", "Housing and Development Control",
                "Economy & Growth", "Economy and Growth",
                "Strategic Partnership", "Corporate Budgets"
            ]

            for dept in dept_names:
                if dept.lower() in text.lower():
                    # Found a department page
                    dept_key = dept.replace(" & ", " and ").replace("  ", " ")

                    if dept_key not in departments:
                        departments[dept_key] = {
                            "name": dept_key,
                            "controllable": 0,
                            "non_controllable": 0,
                            "total": 0,
                            "found_on_page": page_num + 1
                        }

                    # Try to extract amounts from tables
                    for table in tables:
                        if not table:
                            continue
                        for row in table:
                            if not row or len(row) < 2:
                                continue
                            row_str = str(row[0]).lower() if row[0] else ""

                            if 'controllable' in row_str and 'non' not in row_str:
                                # Find numeric value in row
                                for cell in row[1:]:
                                    val = clean_amount(str(cell))
                                    if val != 0:
                                        departments[dept_key]["controllable"] = val
                                        break
                            elif 'non-controllable' in row_str or 'non controllable' in row_str:
                                for cell in row[1:]:
                                    val = clean_amount(str(cell))
                                    if val != 0:
                                        departments[dept_key]["non_controllable"] = val
                                        break
                            elif 'total' in row_str and 'budget' in row_str:
                                for cell in row[1:]:
                                    val = clean_amount(str(cell))
                                    if val != 0:
                                        departments[dept_key]["total"] = val
                                        break

    return {
        "financial_year": year,
        "departments": list(departments.values())
    }

def main():
    print("=" * 60)
    print("Extracting Budget Data from PDFs")
    print("=" * 60)

    OUTPUT_PATH.mkdir(parents=True, exist_ok=True)

    all_budgets = []

    for pdf_file in sorted(BBC_BUDGETS_PATH.glob("*.pdf")):
        try:
            budget_data = extract_budget_tables(pdf_file)
            detailed = extract_detailed_budgets(pdf_file)

            # Merge detailed departments
            budget_data['departments'] = detailed['departments']

            all_budgets.append(budget_data)

            print(f"  Found {len(budget_data['departments'])} departments")
            print(f"  Summary keys: {list(budget_data['summary'].keys())}")

        except Exception as e:
            print(f"  Error processing {pdf_file.name}: {e}")

    # Sort by year
    all_budgets.sort(key=lambda x: x['financial_year'] or '')

    # Calculate YoY changes
    for i in range(1, len(all_budgets)):
        prev = all_budgets[i-1]
        curr = all_budgets[i]

        if prev.get('summary', {}).get('total_net_expenditure') and curr.get('summary', {}).get('total_net_expenditure'):
            prev_total = prev['summary']['total_net_expenditure']
            curr_total = curr['summary']['total_net_expenditure']
            if prev_total > 0:
                curr['summary']['yoy_change'] = curr_total - prev_total
                curr['summary']['yoy_change_pct'] = ((curr_total - prev_total) / prev_total) * 100

    # Save
    with open(OUTPUT_PATH / "budgets.json", 'w') as f:
        json.dump(all_budgets, f, indent=2)

    print(f"\nSaved {len(all_budgets)} budget years to budgets.json")

    # Create a summary for quick display
    summary = {
        "years": [b['financial_year'] for b in all_budgets],
        "latest_year": all_budgets[-1]['financial_year'] if all_budgets else None,
        "totals_by_year": {
            b['financial_year']: b['summary'].get('total_net_expenditure', 0)
            for b in all_budgets
        },
        "department_count": len(all_budgets[-1]['departments']) if all_budgets else 0
    }

    with open(OUTPUT_PATH / "budgets_summary.json", 'w') as f:
        json.dump(summary, f, indent=2)

    print("Done!")

if __name__ == "__main__":
    main()
