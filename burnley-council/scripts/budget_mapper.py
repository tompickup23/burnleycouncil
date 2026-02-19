#!/usr/bin/env python3
"""
Budget Mapper — maps spending data departments to GOV.UK SeRCOP budget categories.

Maps the raw department_raw / service_area labels in spending.json to the
standardised GOV.UK MHCLG service expenditure categories used in
budgets_govuk.json (Revenue Outturn forms RO2, RO4, RO5, RO6).

This enables:
1. Comparing AI DOGE spending data against GOV.UK outturn per budget category
2. Contextualising every DOGE finding against its relevant budget line
3. Computing spending coverage ratios

Approach: Pattern-based regex + per-council manual overrides.
District councils have ~25-30 departments (clean mapping).
LCC has 2,200+ cost centres (prefix-based pattern matching).
Unitaries have ~25 directorates (mix of county + district services).

Usage:
    python3 budget_mapper.py --council burnley [--verify]
    python3 budget_mapper.py --all [--verify]
"""

import json
import re
import os
import sys
from pathlib import Path
from collections import defaultdict

DATA_DIR = Path(__file__).parent.parent / "data"

# === GOV.UK SeRCOP BUDGET CATEGORIES ===
# These are the standardised service expenditure categories from MHCLG
# Revenue Outturn forms. Each has a tier relevance.

BUDGET_CATEGORIES = {
    "Education services": {
        "form": "RSX",
        "tier": ["county", "unitary"],
        "description": "Schools, early years, SEND, adult education, youth justice"
    },
    "Highways and transport services": {
        "form": "RO2",
        "tier": ["county", "unitary", "district"],
        "description": "Road maintenance, street lighting, parking, transport planning"
    },
    "Housing services (GFRA only)": {
        "form": "RO4",
        "tier": ["district", "unitary"],
        "description": "Housing strategy, homelessness, housing benefits admin"
    },
    "Adult Social Care": {
        "form": "RSX",
        "tier": ["county", "unitary"],
        "description": "Residential/nursing care, home care, learning disability, mental health"
    },
    "Children Social Care": {
        "form": "RSX",
        "tier": ["county", "unitary"],
        "description": "Looked after children, child protection, fostering, adoption"
    },
    "Public Health": {
        "form": "RSX",
        "tier": ["county", "unitary"],
        "description": "Public health grant funded services"
    },
    "Cultural and related services": {
        "form": "RO5",
        "tier": ["county", "unitary", "district"],
        "description": "Libraries, museums, leisure, parks, open spaces, tourism"
    },
    "Environmental and regulatory services": {
        "form": "RO5",
        "tier": ["county", "unitary", "district"],
        "description": "Waste collection/disposal, environmental health, trading standards"
    },
    "Planning and development services": {
        "form": "RO5",
        "tier": ["county", "unitary", "district"],
        "description": "Planning control, building control, economic development"
    },
    "Central services": {
        "form": "RO6",
        "tier": ["county", "unitary", "district"],
        "description": "Corporate, democratic, finance, HR, IT, legal, elections"
    },
    "Other services": {
        "form": "RO6",
        "tier": ["county", "unitary", "district"],
        "description": "Fire, police precepts, other non-categorised"
    },
    "Capital": {
        "form": "N/A",
        "tier": ["county", "unitary", "district"],
        "description": "Capital programme expenditure (not in revenue outturn)"
    }
}

# === DISTRICT COUNCIL DEPARTMENT MAPPINGS ===
# Pattern-based mappings from department_raw to budget category.
# Each council has its own naming conventions.

DISTRICT_MAPPINGS = {
    "burnley": {
        "G - Green Spaces and Amenities": "Cultural and related services",
        "GRE - Green Spaces": "Cultural and related services",
        "F - Sport n Culture Leisure Client": "Cultural and related services",
        "L - Street Scene": "Environmental and regulatory services",
        "STR - Streetscene": "Environmental and regulatory services",
        "HOU - Housing": "Housing services (GFRA only)",
        "Q - Hsg and Developmnt Control": "Planning and development services",
        "REG - Regeneration Planning Policy": "Planning and development services",
        "R - Economy and Growth": "Planning and development services",
        "W - Legal and Democratic Services": "Central services",
        "GOV - Governance Law Prop Regn": "Central services",
        "U - Finance": "Central services",
        "U - Finance and Property": "Central services",
        "FIN - Finance": "Central services",
        "V - Revenues & Benefits Client": "Central services",
        "T - Treasury": "Central services",
        "T1 - Treasury": "Central services",
        "Z - Corporate Income Expenditure": "Central services",
        "A - Chief Executive": "Central services",
        "A - Management Team": "Central services",
        "C - Chief Operating Officer": "Central services",
        "T - Policy and Engagement": "Central services",
        "X - People and Development": "Central services",
        "Y - Property": "Central services",
        "OTH - Other": "Other services",
        "SP - Strategic Partnership": "Other services",
        "PP - Parish Precepts": "Other services",
        "CP - Capital Programme": "Capital",
    },
    "hyndburn": {
        "ENVS - Environmental Services": "Environmental and regulatory services",
        "ENVH - Environmental Health": "Environmental and regulatory services",
        "ENVH- Environmental Health": "Environmental and regulatory services",
        "LEGL - Legal & Democratic": "Central services",
        "PLAN - Planning & Transportation": "Planning and development services",
        "REGN - Regeneration & Housing": "Housing services (GFRA only)",
        "RESO - Resources": "Central services",
    },
    "pendle": {
        "Environmental Health Services": "Environmental and regulatory services",
        "Housing & Environmental Health": "Environmental and regulatory services",
        "I.T Services": "Central services",
        "Information Services": "Central services",
        "Revenues Services": "Central services",
        "Accountancy Control": "Central services",
        "Directorate": "Central services",
    },
    "rossendale": {
        "Environmental Health": "Environmental and regulatory services",
        "Waste Services": "Environmental and regulatory services",
    },
    "lancaster": {
        "Environmental Services": "Environmental and regulatory services",
        "Housing Services": "Housing services (GFRA only)",
    },
    "chorley": {
        "Environmental Health": "Environmental and regulatory services",
        "Streetscene": "Environmental and regulatory services",
    },
    "south_ribble": {
        "Environmental Health": "Environmental and regulatory services",
        "Neighbourhoods": "Environmental and regulatory services",
    },
    "fylde": {
        "Environmental Health & Housing": "Environmental and regulatory services",
    },
    "wyre": {
        "Environmental Health & Community Safety": "Environmental and regulatory services",
    },
}

# === PATTERN-BASED RULES ===
# Regex patterns that apply across multiple councils.
# Ordered by specificity — first match wins.

UNIVERSAL_PATTERNS = [
    # Education (county/unitary only)
    (r"(?i)^(education|schools?|SEND|early years|youth justice|adult ed)", "Education services"),
    (r"(?i)schools block", "Education services"),
    (r"(?i)DSG|dedicated schools", "Education services"),

    # Adult Social Care
    (r"(?i)^(ACS|adult social|adult operations|OP-|LD-)", "Adult Social Care"),
    (r"(?i)(older people|learning disab|mental health|supported living|home care|residential.*care)", "Adult Social Care"),
    (r"(?i)^adult", "Adult Social Care"),

    # Children's Social Care
    (r"(?i)^(CYP|children|child protect|looked after|fostering|adoption)", "Children Social Care"),
    (r"(?i)(safeguard|LAC|UASC|edge of care)", "Children Social Care"),

    # Public Health
    (r"(?i)^public health", "Public Health"),
    (r"(?i)(sexual health|substance misuse|health visiting|school nursing)", "Public Health"),

    # Highways and Transport
    (r"(?i)(highway|roads?|bridges?|street light|winter|gritting|parking|transport)", "Highways and transport services"),
    (r"(?i)^(D\)|.*maintenance.*road|traffic)", "Highways and transport services"),

    # Housing
    (r"(?i)(housing|homeless|HRA|DFG|disabled facilit|sheltered|tenant)", "Housing services (GFRA only)"),
    (r"(?i)(housing benefit|HB admin)", "Housing services (GFRA only)"),

    # Cultural and related services
    (r"(?i)(leisure|library|libraries|museum|gallery|sport|recreation|parks?|open space|tourism|arts?|theatre|swimming)", "Cultural and related services"),
    (r"(?i)(community cent|play area|allotment|cemetery|cremati|mortuary)", "Cultural and related services"),

    # Environmental and regulatory
    (r"(?i)(waste|recycl|refuse|bin|landfill|street cleans|environ|pest control|food safety)", "Environmental and regulatory services"),
    (r"(?i)(trading standard|licens|CCTV|noise|pollution|animal|public health inspec)", "Environmental and regulatory services"),
    (r"(?i)(regulatory|community safety|crime)", "Environmental and regulatory services"),

    # Planning and development
    (r"(?i)(planning|development control|building control|local plan|regenerat|economic dev)", "Planning and development services"),
    (r"(?i)(conservation|heritage|land charge)", "Planning and development services"),

    # Central services
    (r"(?i)(finance|treasury|corporate|democratic|legal|HR|human resource|IT |ICT|digital)", "Central services"),
    (r"(?i)(election|electoral|revenue.*benefit|council tax|NDR|NNDR|audit|procure)", "Central services"),
    (r"(?i)(chief exec|management|admin|governance|communi|engagement|media|property)", "Central services"),
    (r"(?i)(pension|retirement|insurance|payroll)", "Central services"),

    # Capital
    (r"(?i)(capital|DFG capital|Section 106|CIL|developer)", "Capital"),

    # Fire/Police (county)
    (r"(?i)(fire|rescue|police)", "Other services"),
]

# === LCC-SPECIFIC PREFIX PATTERNS ===
# LCC has 2,200+ cost centres. These prefix patterns cover ~85% by spend.

LCC_PATTERNS = [
    # Adult Social Care - largest spend area
    (r"(?i)^OP-", "Adult Social Care"),  # Older People operations
    (r"(?i)^LD-", "Adult Social Care"),  # Learning Disability
    (r"(?i)^MH-", "Adult Social Care"),  # Mental Health
    (r"(?i)^PD-", "Adult Social Care"),  # Physical Disability
    (r"(?i)^ACS", "Adult Social Care"),
    (r"(?i)^Adult", "Adult Social Care"),
    (r"(?i)^Reablement", "Adult Social Care"),
    (r"(?i)^Supported Living", "Adult Social Care"),
    (r"(?i)^Home Care", "Adult Social Care"),
    (r"(?i)^Residential", "Adult Social Care"),
    (r"(?i)^Nursing", "Adult Social Care"),

    # Children's Social Care
    (r"(?i)^CYP", "Children Social Care"),
    (r"(?i)^Childr", "Children Social Care"),
    (r"(?i)^LAC", "Children Social Care"),
    (r"(?i)^Foster", "Children Social Care"),
    (r"(?i)^Adoption", "Children Social Care"),
    (r"(?i)^Safeguard", "Children Social Care"),
    (r"(?i)^\(IRO\)", "Children Social Care"),
    (r"(?i)^Youth Offend", "Children Social Care"),
    (r"(?i)^Edge of Care", "Children Social Care"),

    # Education
    (r"(?i)^Schools Block", "Education services"),
    (r"(?i)^High Needs", "Education services"),
    (r"(?i)^Early Years Block", "Education services"),
    (r"(?i)^Central Schools", "Education services"),
    (r"(?i)^SEND", "Education services"),
    (r"(?i)^Education", "Education services"),
    (r"(?i)^School Improv", "Education services"),
    (r"(?i)^DSG", "Education services"),
    (r"(?i)^Pupil", "Education services"),
    (r"(?i)^SEN ", "Education services"),

    # Highways
    (r"(?i)^\d{2}/\d{2}.*(?:Road|Bridge|Highway|Maintenance)", "Highways and transport services"),
    (r"(?i)^(D\) |Highways?)", "Highways and transport services"),
    (r"(?i)^Street Light", "Highways and transport services"),
    (r"(?i)^Winter ", "Highways and transport services"),
    (r"(?i)^Traffic", "Highways and transport services"),
    (r"(?i)^Transport ", "Highways and transport services"),
    (r"(?i)^Bus ", "Highways and transport services"),
    (r"(?i)^Flood", "Highways and transport services"),
    (r"(?i)TIIF|DfT|Pothole", "Highways and transport services"),

    # Environment
    (r"(?i)^Waste", "Environmental and regulatory services"),
    (r"(?i)^Landfill", "Environmental and regulatory services"),
    (r"(?i)^Trading Stand", "Environmental and regulatory services"),
    (r"(?i)^Countryside", "Environmental and regulatory services"),
    (r"(?i)^Registrars?", "Environmental and regulatory services"),

    # Cultural
    (r"(?i)^Librar", "Cultural and related services"),
    (r"(?i)^Museum", "Cultural and related services"),
    (r"(?i)^Archive", "Cultural and related services"),

    # Public Health
    (r"(?i)^Public Health", "Public Health"),
    (r"(?i)^PH ", "Public Health"),

    # Corporate/Central
    (r"(?i)^(Oracle|ICT|Digital|Finance|Legal|HR|Audit|Procurement)", "Central services"),
    (r"(?i)^Democratic", "Central services"),
    (r"(?i)^Property", "Central services"),
    (r"(?i)^Corporate", "Central services"),
    (r"(?i)^Capital Financ", "Central services"),
    (r"(?i)^Pension", "Central services"),
    (r"(?i)^Fire", "Other services"),
]

# === UNITARY MAPPINGS ===

UNITARY_MAPPINGS = {
    "blackpool": {
        # Full department names
        "Adult & Families": "Adult Social Care",
        "Children's Services": "Children Social Care",
        "Community & Env Services": "Environmental and regulatory services",
        "Chief Executive": "Central services",
        "Governance & Partnerships": "Central services",
        "Place Directorate": "Planning and development services",
        "Public Health": "Public Health",
        "Resources": "Central services",
        "Capital Adult Social Care": "Adult Social Care",
        "Capital Childrens": "Children Social Care",
        "Capital Comm & Environ": "Environmental and regulatory services",
        "Capital Commnctn & Regen": "Planning and development services",
        "Capital Chief Executive": "Central services",
        "Capital Governance & Partner": "Central services",
        "Capital Resources": "Central services",
        "Internal Insurance": "Central services",
        "Bcf General And Control": "Adult Social Care",
        "Net Cost Of Services": "Central services",
        "Total Reconciliations": "Central services",
        "Budgets Outside Cash Limits": "Central services",
        "Blackpool Services": "Central services",
        "Better Start Projects": "Children Social Care",
        "Cafs": "Children Social Care",
        # Abbreviated department codes (Blackpool financial system codes)
        "BUDOCL": "Central services",        # Budgets Outside Cash Limits
        "ZBUDOCL": "Central services",       # Capital BUDOCL
        "CHISER": "Children Social Care",    # Children's Services
        "BPLSER": "Central services",        # Blackpool Services (corporate/council-wide)
        "ZTRSTOT": "Central services",       # Capital treasury/reconciliations
        "AMCPI": "Central services",         # Corporate/council-wide allocations
        "ZAMCPI": "Capital",                 # Capital AMCPI
        "BCFGEN": "Adult Social Care",       # Better Care Fund General
        "BSTPRJ": "Children Social Care",    # Better Start Projects
        "CEXTOT": "Central services",        # Chief Executive total
        "CONRES": "Central services",        # Contributions to reserves
        "CONTIN": "Central services",        # Contingencies
        "CREUNI": "Central services",        # Creative/universal services
        "Cont To/From Reserves": "Central services",
        "Contingencies": "Central services",
        "DEMTOT": "Central services",        # Democratic total
        "Energy Rebate Discretionary": "Other services",
        "FLOOD": "Environmental and regulatory services",  # Flood defence
        "Lrsg - Topup": "Other services",   # COVID grant
        "NA": "Central services",            # Not allocated
        "Non Domestic Rates": "Central services",
        "PUBHEL": "Public Health",           # Public Health
        "RNONGF": "Central services",        # Revenue non-GF
        "Resources Directorate": "Central services",
        "Stat Grants - Lockdown 5 Nov": "Other services",
        "TRSTOT": "Central services",        # Treasury total/reconciliations
        "Tic Maternity Pathway": "Public Health",
        "Tier 3 Closed": "Other services",   # COVID tier
        "Tier 4 - Closed": "Other services", # COVID tier
        "YCOLLC": "Central services",        # Council tax collection
        "YCOLLN": "Central services",        # NNDR collection
        "ZADULTS": "Adult Social Care",      # Capital adults
        "ZCORP": "Capital",                  # Capital corporate
        "ZCHISER": "Capital",                # Capital children's services
        "ZCONBS": "Capital",                 # Capital contributions/balance sheet
        "ZBPLSER": "Capital",                # Capital Blackpool services
    },
    "blackburn": {
        "Resources": "Central services",
        "Growth and Development": "Planning and development services",
        "Social Care": "Adult Social Care",
        "Financial Support Service": "Central services",
        "Neighbourhoods and Prevention": "Environmental and regulatory services",
        "Adults and Prevention": "Adult Social Care",
        "Digital and Customer Services": "Central services",
        "Environment and Operations": "Environmental and regulatory services",
        "Children's Services": "Children Social Care",
        "Childrens Services": "Children Social Care",
    }
}

# === ADDITIONAL COUNCIL-SPECIFIC MAPPINGS ===
# For councils with department names that don't match universal patterns

ADDITIONAL_MAPPINGS = {
    "lancaster": {
        "Resources": "Central services",
        "RESOURCES": "Central services",
        "PEOPLE AND POLICY": "Central services",
        "SUSTAINABLE GROWTH": "Planning and development services",
        "Information Services": "Central services",
        "People & Policy": "Central services",
        "Corporate Services": "Central services",
    },
    "pendle": {
        "Financial Services": "Central services",
        "Operational Services": "Environmental and regulatory services",
        "Engineering & Special Projects": "Highways and transport services",
        "Economic Growth": "Planning and development services",
        "Policy & Commissioning": "Central services",
    },
    "preston": {
        "CAP DEVELOPMENT": "Capital",
        "REV CUSTOMER SERVICES": "Central services",
        "CAP CUSTOMER SERVICES": "Capital",
        "REV DEVELOPMENT": "Planning and development services",
        "BALANCE SHEET": "Central services",
        "REV COMMUNITIES": "Environmental and regulatory services",
        "CAP COMMUNITIES": "Capital",
        "BALANCE SHEET ITEMS": "Central services",
    },
    "rossendale": {
        "Customer Services & E-Government": "Central services",
        "Operations": "Environmental and regulatory services",
        "Covid": "Other services",
        "Non-Distributed Costs": "Central services",
        "People & Policy": "Central services",
    },
    "south_ribble": {
        "Central Support Services": "Central services",
        "General Government Grants": "Central services",
        "Short Term Creditors": "Central services",
        "Payments of Precepts to Parish": "Other services",
        "Non Domestic Rates Redistribut": "Central services",
    },
    "west_lancashire": {
        "Coronavirus business grants": "Other services",
        "Other Service Items": "Other services",
        "Non Service Items": "Central services",
        "Growth and Development": "Planning and development services",
        "Street Scene": "Environmental and regulatory services",
    },
    "wyre": {
        "Resources": "Central services",
        "Transformation": "Central services",
    },
    "chorley": {
        "GROW - Commercial Services": "Planning and development services",
    },
    "fylde": {
        "STRATEGIC DEVELOPMENT": "Planning and development services",
        "OPERATIONAL SERVICES": "Environmental and regulatory services",
        "DMOCRTIC SVCS AND MEMBER SUPPT": "Central services",
        "STREETSCENE SERVICES": "Environmental and regulatory services",
    },
    "ribble_valley": {
        "Central Services to the Public": "Central services",
        "Cultural and Related Services": "Cultural and related services",
        "Other Operating Inc and Exp": "Central services",
        "Trading Operations": "Environmental and regulatory services",
    },
    "hyndburn": {
        "VEHICLE MAINT SUPERVISION": "Environmental and regulatory services",
        "PSDS HLC": "Housing services (GFRA only)",
        "COMPUTER SERVICES": "Central services",
        "BUSINESS SUPPORT GRANTS": "Planning and development services",
    },
}


def load_spending_departments(council_id):
    """Load unique departments and service areas from spending data."""
    spending_path = DATA_DIR / council_id / "spending.json"
    index_path = DATA_DIR / council_id / "spending-index.json"

    departments = set()
    service_areas = set()
    dept_spend = defaultdict(float)

    # spending.json (v2) has full records with department_raw field + amounts
    if spending_path.exists():
        try:
            with open(spending_path) as f:
                data = json.load(f)

            # v2 format: {meta, filterOptions, records}
            fo = data.get("filterOptions", {})
            if fo:
                # filterOptions may have departments under various keys
                for key in ["departments", "service_divisions", "service_areas"]:
                    vals = fo.get(key, [])
                    if vals and key == "departments":
                        departments.update(vals)
                    elif vals:
                        service_areas.update(vals)

            records = data.get("records", data if isinstance(data, list) else [])
            for r in records:
                dept = r.get("department_raw", r.get("department", ""))
                if dept:
                    departments.add(dept)
                    amount = r.get("amount", 0) or 0
                    dept_spend[dept] += abs(amount)

                svc = r.get("service_area_raw", r.get("service_area", ""))
                if svc:
                    service_areas.add(svc)
        except (json.JSONDecodeError, MemoryError):
            pass  # File too large or corrupt

    # If no departments from spending.json, try index
    if not departments and index_path.exists():
        with open(index_path) as f:
            index = json.load(f)

        fo = index.get("filterOptions", {})
        # v3/v4 indexes use various field names
        for key in ["departments", "service_divisions", "service_areas"]:
            vals = fo.get(key, [])
            if vals:
                if not departments:
                    departments.update(vals)
                else:
                    service_areas.update(vals)

    return departments, service_areas, dict(dept_spend)


def map_department(dept_name, council_id, council_tier):
    """
    Map a department name to a GOV.UK budget category.

    Returns (category, confidence) tuple.
    Confidence: "high" (exact match), "medium" (pattern match), "low" (guess)
    """
    # 1. Check council-specific exact mappings
    council_map = DISTRICT_MAPPINGS.get(council_id, {})
    if dept_name in council_map:
        return council_map[dept_name], "high"

    # Check unitary mappings
    if council_id in UNITARY_MAPPINGS:
        uni_map = UNITARY_MAPPINGS[council_id]
        if dept_name in uni_map:
            return uni_map[dept_name], "high"

    # Check additional council-specific mappings
    if council_id in ADDITIONAL_MAPPINGS:
        add_map = ADDITIONAL_MAPPINGS[council_id]
        if dept_name in add_map:
            return add_map[dept_name], "high"

    # 2. Check LCC-specific patterns
    if council_id == "lancashire_cc":
        for pattern, category in LCC_PATTERNS:
            if re.search(pattern, dept_name):
                return category, "medium"

    # 3. Check universal patterns
    for pattern, category in UNIVERSAL_PATTERNS:
        if re.search(pattern, dept_name):
            # Check tier relevance
            cat_info = BUDGET_CATEGORIES.get(category, {})
            tiers = cat_info.get("tier", [])
            if council_tier in tiers or not tiers:
                return category, "medium"
            # If tier doesn't match, still return but with low confidence
            return category, "low"

    return "Unmapped", "none"


def build_council_mapping(council_id):
    """Build complete department-to-budget mapping for a council."""
    # Load config to get tier
    config_path = DATA_DIR / council_id / "config.json"
    tier = "district"
    if config_path.exists():
        with open(config_path) as f:
            config = json.load(f)
        tier = config.get("council_tier", "district")

    departments, service_areas, dept_spend = load_spending_departments(council_id)

    mappings = {}
    unmapped = []
    category_totals = defaultdict(float)
    total_mapped_spend = 0
    total_spend = sum(dept_spend.values()) if dept_spend else 0

    for dept in sorted(departments):
        category, confidence = map_department(dept, council_id, tier)
        mappings[dept] = {
            "budget_category": category,
            "confidence": confidence,
        }
        if dept_spend:
            spend = dept_spend.get(dept, 0)
            mappings[dept]["spend"] = spend
            if category != "Unmapped":
                category_totals[category] += spend
                total_mapped_spend += spend
            else:
                unmapped.append({"department": dept, "spend": spend})

    # Sort unmapped by spend (highest first)
    unmapped.sort(key=lambda x: x["spend"], reverse=True)

    coverage_pct = round(total_mapped_spend / total_spend * 100, 1) if total_spend else 0

    result = {
        "council_id": council_id,
        "council_tier": tier,
        "total_departments": len(departments),
        "mapped_departments": sum(1 for m in mappings.values() if m["budget_category"] != "Unmapped"),
        "unmapped_departments": sum(1 for m in mappings.values() if m["budget_category"] == "Unmapped"),
        "mappings": mappings,
        "category_summary": dict(category_totals),
        "coverage": {
            "mapped_spend": total_mapped_spend,
            "total_spend": total_spend,
            "mapped_spend_pct": coverage_pct
        },
        "unmapped_top": unmapped[:20],
    }

    return result


def verify_against_govuk(council_id, mapping_result):
    """
    Cross-validate mapped spending against GOV.UK outturn totals.

    Important caveat: AI DOGE spending data is >£500 threshold only,
    while GOV.UK outturn is ALL spend. So coverage will be partial.
    """
    summary_path = DATA_DIR / council_id / "budgets_summary.json"
    if not summary_path.exists():
        return None

    with open(summary_path) as f:
        summary = json.load(f)

    latest = summary.get("latest_year", "2024-25")
    yr_sum = summary.get("year_summaries", {}).get(latest, {})
    govuk_breakdown = yr_sum.get("service_breakdown", summary.get("service_breakdown", {}))

    comparison = {}
    for category, govuk_value in govuk_breakdown.items():
        if not isinstance(govuk_value, (int, float)):
            continue
        doge_value = mapping_result["category_summary"].get(category, 0)
        comparison[category] = {
            "govuk_outturn": govuk_value,
            "doge_mapped_spend": round(doge_value),
            "coverage_ratio": round(doge_value / govuk_value, 3) if govuk_value else None,
            "note": "AI DOGE captures >£500 payments only; outturn = all expenditure"
        }

    return comparison


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Map spending departments to budget categories")
    parser.add_argument("--council", type=str, help="Council ID")
    parser.add_argument("--all", action="store_true", help="Process all councils")
    parser.add_argument("--verify", action="store_true", help="Cross-validate against GOV.UK")
    parser.add_argument("--summary", action="store_true", help="Print summary only")
    args = parser.parse_args()

    councils = []
    if args.all:
        # All 15 councils
        for d in DATA_DIR.iterdir():
            if d.is_dir() and (d / "config.json").exists():
                if d.name != "shared":
                    councils.append(d.name)
    elif args.council:
        councils = [args.council]
    else:
        parser.error("Specify --council ID or --all")

    for council_id in sorted(councils):
        print(f"\n{'='*60}")
        print(f"  {council_id}")
        print(f"{'='*60}")

        result = build_council_mapping(council_id)

        if args.summary:
            print(f"  Departments: {result['total_departments']} total, "
                  f"{result['mapped_departments']} mapped, "
                  f"{result['unmapped_departments']} unmapped")
            if result['coverage']['total_spend']:
                print(f"  Spend coverage: {result['coverage']['mapped_spend_pct']}%")

            if result['category_summary']:
                print(f"\n  Category breakdown:")
                for cat, spend in sorted(result['category_summary'].items(),
                                          key=lambda x: -x[1]):
                    print(f"    {cat:45s}: £{spend:>15,.0f}")

            if result['unmapped_top']:
                print(f"\n  Top unmapped:")
                for u in result['unmapped_top'][:5]:
                    print(f"    {u['department']:45s}: £{u['spend']:>12,.0f}")
        else:
            # Print all mappings
            print(f"\n  Mapped to budget categories:")
            for dept, mapping in sorted(result['mappings'].items()):
                cat = mapping['budget_category']
                conf = mapping['confidence']
                spend = mapping.get('spend', '')
                spend_str = f"  £{spend:>12,.0f}" if spend else ""
                print(f"    {dept:50s} → {cat:40s} [{conf}]{spend_str}")

        if args.verify:
            comparison = verify_against_govuk(council_id, result)
            if comparison:
                print(f"\n  GOV.UK Cross-validation:")
                for cat, comp in sorted(comparison.items()):
                    govuk = comp['govuk_outturn']
                    doge = comp['doge_mapped_spend']
                    ratio = comp['coverage_ratio']
                    ratio_str = f"{ratio:.1%}" if ratio else "N/A"
                    print(f"    {cat:40s}: GOV.UK=£{govuk:>12,}  DOGE=£{doge:>12,}  ratio={ratio_str}")

        # Save mapping
        output_path = DATA_DIR / council_id / "budget_mapping.json"
        with open(output_path, "w") as f:
            json.dump(result, f, indent=2, default=str)
        print(f"\n  Saved: {output_path}")


if __name__ == "__main__":
    main()
