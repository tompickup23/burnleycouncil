#!/usr/bin/env python3
"""
Enhanced budget extraction from Burnley Borough Council Budget Book PDFs.
V2: Understanding council budget context properly.

COUNCIL BUDGET CONTEXT:
- Revenue Budget = Day-to-day running costs (staff, services, utilities)
- Capital Programme = Investment in assets (buildings, infrastructure)
- Net Budget Requirement = What the council needs to fund from council tax + grants
- Controllable vs Non-Controllable expenditure (recharges, capital charges)

For DOGE-style analysis:
- Look for YoY changes in department budgets
- Identify largest cost centres
- Flag significant changes (good for political scrutiny)
- Compare budget vs actual spend (if available)
"""

import pdfplumber
import json
import re
from pathlib import Path
from collections import defaultdict

BBC_BUDGETS_PATH = Path("/Users/tompickup/Documents/BBC/Budgets")
OUTPUT_PATH = Path("/Users/tompickup/clawd/burnley-council/public/data")

# Known figures extracted manually from PDF introductions
# These are the headline figures from each Budget Book introduction
HEADLINE_FIGURES = {
    "2021/22": {
        "net_revenue_budget": 14_697_000,  # Approximate from budget book
        "council_tax_band_d": None,
        "burnley_element": None,
    },
    "2022/23": {
        "net_revenue_budget": 16_267_000,
        "council_tax_band_d": 2239.79,
        "burnley_element": 322.06,
        "burnley_increase_pct": 1.99,
    },
    "2023/24": {
        "net_revenue_budget": 17_588_000,
        "council_tax_band_d": 2339.40,
        "burnley_element": 331.63,
        "burnley_increase_pct": 2.97,
    },
    "2024/25": {
        "net_revenue_budget": 18_987_000,
        "council_tax_band_d": 2347.50,  # Approximate
        "burnley_element": 337.82,
        "burnley_increase_pct": 1.87,
    },
    "2025/26": {
        "net_revenue_budget": 18_721_000,
        "council_tax_band_d": 2447.50,
        "burnley_element": 344.58,
        "burnley_increase_pct": 2.0,
        "budget_savings_identified": 328_000,
        "council_tax_share_pct": 44,
    },
}

# Department structure (from Budget Book contents)
DEPARTMENTS = [
    "Management Team",
    "Policy & Engagement",
    "People & Development",
    "Green Spaces & Amenities",
    "Governance Law and Regulation",  # Was "Legal & Democratic Services"
    "Finance",
    "Property Services",
    "Revenues & Benefits",
    "Leisure Trust Client",
    "Streetscene",
    "Housing & Development Control",
    "Economy & Growth",
    "Strategic Partnership",
    "Corporate Budgets",
]

def clean_amount(text):
    """Convert amount text to float (in thousands usually)."""
    if not text or text.strip() in ['', '-', '—', '–', 'nan']:
        return 0.0
    text = str(text).strip()
    is_negative = '(' in text or text.startswith('-')
    text = re.sub(r'[£,()（）\s]', '', text)
    text = text.replace('−', '-').replace('–', '-').lstrip('-')
    try:
        value = float(text)
        return -value if is_negative else value
    except ValueError:
        return 0.0

def extract_year_from_filename(filename):
    """Extract financial year from filename."""
    match = re.search(r'(\d{4})-(\d{2})\.pdf', filename)
    if match:
        return f"{match.group(1)}/{match.group(2)}"
    return None

def extract_budget_data(pdf_path):
    """Extract budget data from a single PDF."""
    year = extract_year_from_filename(pdf_path.name)
    print(f"Processing: {pdf_path.name} ({year})")

    budget = {
        "financial_year": year,
        "filename": pdf_path.name,
        "headline": HEADLINE_FIGURES.get(year, {}),
        "departments": {},
        "funding_sources": {},
        "key_services": [],
        "raw_text_samples": []
    }

    with pdfplumber.open(pdf_path) as pdf:
        all_text = ""
        for page in pdf.pages:
            text = page.extract_text() or ""
            all_text += text + "\n"

        # Store sample text for debugging
        budget["raw_text_samples"].append(all_text[:2000])

        # Try to extract department totals from text
        # Pattern: Department name followed by numbers
        for dept in DEPARTMENTS:
            dept_lower = dept.lower().replace('&', 'and')

            # Look for department sections in the text
            pattern = rf'{re.escape(dept)}.*?(\d+,?\d*)\s*(\d+,?\d*)'
            matches = re.findall(pattern, all_text, re.IGNORECASE | re.DOTALL)

            if matches:
                # Take first match that looks like budget figures
                for match in matches[:3]:
                    try:
                        val1 = clean_amount(match[0])
                        val2 = clean_amount(match[1]) if len(match) > 1 else 0
                        if val1 > 100:  # Likely a budget figure (in £000s)
                            budget["departments"][dept] = {
                                "controllable": val1,
                                "total": val2 if val2 > 0 else val1
                            }
                            break
                    except:
                        continue

        # Extract funding sources
        funding_patterns = [
            (r'Council Tax.*?([\d,]+)', 'council_tax'),
            (r'Business Rates.*?([\d,]+)', 'business_rates'),
            (r'Revenue Support Grant.*?([\d,]+)', 'revenue_support_grant'),
            (r'New Homes Bonus.*?([\d,]+)', 'new_homes_bonus'),
            (r'Services Grant.*?([\d,]+)', 'services_grant'),
        ]

        for pattern, key in funding_patterns:
            match = re.search(pattern, all_text, re.IGNORECASE)
            if match:
                budget["funding_sources"][key] = clean_amount(match.group(1))

    return budget


def calculate_budget_insights(all_budgets):
    """Calculate DOGE-style budget insights."""
    insights = {
        "yoy_changes": [],
        "largest_departments": [],
        "budget_trends": {},
        "efficiency_metrics": {},
        "political_highlights": []
    }

    # Sort by year
    sorted_budgets = sorted(all_budgets, key=lambda x: x['financial_year'] or '')

    # YoY changes in headline figures
    for i in range(1, len(sorted_budgets)):
        prev = sorted_budgets[i-1]
        curr = sorted_budgets[i]

        prev_budget = prev['headline'].get('net_revenue_budget', 0)
        curr_budget = curr['headline'].get('net_revenue_budget', 0)

        if prev_budget > 0 and curr_budget > 0:
            change = curr_budget - prev_budget
            change_pct = (change / prev_budget) * 100

            insights["yoy_changes"].append({
                "from_year": prev['financial_year'],
                "to_year": curr['financial_year'],
                "previous_budget": prev_budget,
                "current_budget": curr_budget,
                "change_amount": change,
                "change_percent": round(change_pct, 2)
            })

    # Latest year analysis
    if sorted_budgets:
        latest = sorted_budgets[-1]

        # Budget trends
        insights["budget_trends"] = {
            "years": [b['financial_year'] for b in sorted_budgets],
            "budgets": [b['headline'].get('net_revenue_budget', 0) for b in sorted_budgets],
            "council_tax_elements": [b['headline'].get('burnley_element', 0) for b in sorted_budgets],
        }

        # Political highlights
        if latest['headline'].get('budget_savings_identified'):
            insights["political_highlights"].append({
                "type": "savings_target",
                "year": latest['financial_year'],
                "amount": latest['headline']['budget_savings_identified'],
                "description": f"Council identified £{latest['headline']['budget_savings_identified']/1000:.0f}k in ongoing revenue budget savings"
            })

        if latest['headline'].get('council_tax_share_pct'):
            insights["political_highlights"].append({
                "type": "council_tax_dependency",
                "year": latest['financial_year'],
                "value": latest['headline']['council_tax_share_pct'],
                "description": f"Approximately {latest['headline']['council_tax_share_pct']}% of net budget funded by Council Tax"
            })

        # Calculate 5-year budget growth
        if len(sorted_budgets) >= 2:
            first_budget = sorted_budgets[0]['headline'].get('net_revenue_budget', 0)
            last_budget = sorted_budgets[-1]['headline'].get('net_revenue_budget', 0)
            if first_budget > 0:
                total_growth = ((last_budget - first_budget) / first_budget) * 100
                years_span = len(sorted_budgets) - 1
                avg_annual = total_growth / years_span if years_span > 0 else 0

                insights["efficiency_metrics"] = {
                    "total_budget_growth_pct": round(total_growth, 1),
                    "years_covered": years_span + 1,
                    "avg_annual_growth_pct": round(avg_annual, 1),
                    "latest_budget": last_budget,
                    "earliest_budget": first_budget,
                }

    return insights


def main():
    print("=" * 60)
    print("Enhanced Budget Data Extraction (V2)")
    print("=" * 60)

    OUTPUT_PATH.mkdir(parents=True, exist_ok=True)

    all_budgets = []

    for pdf_file in sorted(BBC_BUDGETS_PATH.glob("*.pdf")):
        try:
            budget_data = extract_budget_data(pdf_file)
            all_budgets.append(budget_data)
            print(f"  Headline: £{budget_data['headline'].get('net_revenue_budget', 0)/1_000_000:.3f}M")
        except Exception as e:
            print(f"  Error: {e}")

    # Calculate insights
    insights = calculate_budget_insights(all_budgets)

    # Remove raw text samples before saving (too large)
    for b in all_budgets:
        b.pop('raw_text_samples', None)

    # Save files
    with open(OUTPUT_PATH / "budgets.json", 'w') as f:
        json.dump(all_budgets, f, indent=2)

    with open(OUTPUT_PATH / "budget_insights.json", 'w') as f:
        json.dump(insights, f, indent=2)

    # Summary
    print("\n" + "=" * 60)
    print("BUDGET SUMMARY")
    print("=" * 60)

    if insights.get('efficiency_metrics'):
        em = insights['efficiency_metrics']
        print(f"Budget Growth ({em['years_covered']} years): {em['total_budget_growth_pct']}%")
        print(f"Average Annual Growth: {em['avg_annual_growth_pct']}%")
        print(f"Latest Budget: £{em['latest_budget']/1_000_000:.3f}M")

    print("\nYoY Changes:")
    for change in insights.get('yoy_changes', []):
        direction = "↑" if change['change_amount'] > 0 else "↓"
        print(f"  {change['from_year']} → {change['to_year']}: {direction} £{abs(change['change_amount'])/1000:.0f}k ({change['change_percent']:+.1f}%)")

    print("\nDone!")


if __name__ == "__main__":
    main()
