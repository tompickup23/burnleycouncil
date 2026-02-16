#!/usr/bin/env python3
"""
govuk_budgets.py — GOV.UK MHCLG Revenue Outturn Parser

Downloads and parses ODS files from GOV.UK containing standardised CIPFA SeRCOP
budget/outturn data for all English local authorities. This data is inherently
comparable across councils — same definitions, same categories, same submission rules.

Layer 2 of the AI DOGE architecture:
  Layer 1 = council-published CSVs (spending.json) — good for supplier/payment drill-down
  Layer 2 = GOV.UK standardised data (budgets_govuk.json) — good for cross-council comparison

Usage:
    python govuk_budgets.py --councils burnley hyndburn
    python govuk_budgets.py --councils burnley hyndburn --download
    python govuk_budgets.py --councils burnley hyndburn --year 2023-24
    python govuk_budgets.py --all-districts --download
    python govuk_budgets.py --list-councils
"""

import argparse
import json
import os
import sys
from collections import OrderedDict
from pathlib import Path

try:
    import pandas as pd
    HAS_PANDAS = True
    # Monkey-patch pandas ODF reader to handle "error" cell types in ODS files
    # (e.g. #N/A, #REF! formula errors that GOV.UK spreadsheets sometimes contain)
    try:
        from pandas.io.excel._odfreader import ODFReader
        _orig_get_cell_value = ODFReader._get_cell_value
        def _patched_get_cell_value(self, cell):
            from odf.namespaces import OFFICENS
            cell_type = cell.attributes.get((OFFICENS, "value-type"))
            if cell_type == "error":
                return float("nan")
            return _orig_get_cell_value(self, cell)
        ODFReader._get_cell_value = _patched_get_cell_value
    except Exception:
        pass  # If patch fails, fall through to original behaviour

except ImportError:
    HAS_PANDAS = False

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# ─── Paths ───────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
GOVUK_DIR = DATA_DIR / "govuk_budgets"
TAXONOMY_PATH = DATA_DIR / "taxonomy.json"

# ─── Constants ───────────────────────────────────────────────────────

# Known ONS codes for Lancashire councils
LANCASHIRE_COUNCILS = {
    "burnley":    {"ons": "E07000117", "name": "Burnley", "type": "district"},
    "hyndburn":   {"ons": "E07000120", "name": "Hyndburn", "type": "district"},
    "pendle":     {"ons": "E07000122", "name": "Pendle", "type": "district"},
    "rossendale": {"ons": "E07000125", "name": "Rossendale", "type": "district"},
    "ribble_valley": {"ons": "E07000124", "name": "Ribble Valley", "type": "district"},
    "south_ribble":  {"ons": "E07000126", "name": "South Ribble", "type": "district"},
    "chorley":    {"ons": "E07000118", "name": "Chorley", "type": "district"},
    "west_lancashire": {"ons": "E07000127", "name": "West Lancashire", "type": "district"},
    "fylde":      {"ons": "E07000119", "name": "Fylde", "type": "district"},
    "wyre":       {"ons": "E07000128", "name": "Wyre", "type": "district"},
    "lancaster":  {"ons": "E07000121", "name": "Lancaster", "type": "district"},
    "preston":    {"ons": "E07000123", "name": "Preston", "type": "district"},
    "lancashire_cc": {"ons": "E10000017", "name": "Lancashire CC", "type": "county"},
    "blackburn":  {"ons": "E06000008", "name": "Blackburn with Darwen", "type": "unitary"},
    "blackpool":  {"ons": "E06000009", "name": "Blackpool", "type": "unitary"},
}

# ODS file download URLs for each year
# These hashes change when GOV.UK republishes, so we store known-good URLs
# All years use MHCLG Revenue Outturn data from:
# https://www.gov.uk/government/collections/local-authority-revenue-expenditure-and-financing
DOWNLOAD_URLS = {
    "2024-25": {
        "RS":  "https://assets.publishing.service.gov.uk/media/692ed8ac9c1eda2cdf03440b/RS_LA_Data_2024-25_data_by_LA.ods",
        "RSX": "https://assets.publishing.service.gov.uk/media/692ed8baa245b0985f0343e5/RSX_LA_Data_2024-25_data_by_LA.ods",
        "RO2": "https://assets.publishing.service.gov.uk/media/692ed8f69c1eda2cdf03440d/RO2_LA_Data_2024-25_data_by_LA.ods",
        "RO4": "https://assets.publishing.service.gov.uk/media/692ed911345e31ab14ecf8a3/RO4_LA_Data_2024-25_data_by_LA.ods",
        "RO5": "https://assets.publishing.service.gov.uk/media/692ed91eb3b9afff34e96381/RO5_LA_Data_2024-25_data_by_LA.ods",
        "RO6": "https://assets.publishing.service.gov.uk/media/692ed92b2a37784b16ecf860/RO6_LA_Data_2024-25_data_by_LA.ods",
    },
    "2023-24": {
        "RS":  "https://assets.publishing.service.gov.uk/media/6759b6e7ad4694c785b0edb1/RS_2023-24_data_by_LA.ods",
        "RSX": "https://assets.publishing.service.gov.uk/media/6759b6e89f669f2e28ce2b44/RSX_2023-24_data_by_LA.ods",
        "RO2": "https://assets.publishing.service.gov.uk/media/6759b6e94cbda57cacd346ff/RO2_2023-24_data_by_LA.ods",
        "RO4": "https://assets.publishing.service.gov.uk/media/6759b6e97e419d6e07ce2b46/RO4_2023-24_data_by_LA.ods",
        "RO5": "https://assets.publishing.service.gov.uk/media/6759b6e9ad4694c785b0edb2/RO5_2023-24_data_by_LA.ods",
        "RO6": "https://assets.publishing.service.gov.uk/media/6759b6e94cbda57cacd34701/RO6_2023-24_data_by_LA.ods",
    },
    "2022-23": {
        "RS":  "https://assets.publishing.service.gov.uk/media/686be4192cfe301b5fb67819/RS_2022-23_data_by_LA.ods",
        "RSX": "https://assets.publishing.service.gov.uk/media/686be42881dd8f70f5de3c18/RSX_2022-23_data_by_LA.ods",
        "RO2": "https://assets.publishing.service.gov.uk/media/686be44b2557debd867cbd91/RO2_2022-23_data_by_LA.ods",
        "RO4": "https://assets.publishing.service.gov.uk/media/686be46a81dd8f70f5de3c19/RO4_2022-23_data_by_LA.ods",
        "RO5": "https://assets.publishing.service.gov.uk/media/686be47781dd8f70f5de3c1a/RO5_2022-23_data_by_LA.ods",
        "RO6": "https://assets.publishing.service.gov.uk/media/686be484fe1a249e937cbda4/RO6_2022-23_data_by_LA.ods",
    },
    "2021-22": {
        "RS":  "https://assets.publishing.service.gov.uk/media/6880c142f47abf78ca1d3532/RS_2021-22_data_by_LA_July_2025.ods",
        "RSX": "https://assets.publishing.service.gov.uk/media/6825a5a1ab96d4ed0b262f78/RSX_2021-22_data_by_LA_Live.ods",
        "RO2": "https://assets.publishing.service.gov.uk/media/6825a5c8aa3556876875ec94/RO2_2021-22_data_by_LA_ive.ods",
        "RO4": "https://assets.publishing.service.gov.uk/media/6825a5e47293a87b6c75ec90/RO4_2021-22_data_by_LA_Live.ods",
        "RO5": "https://assets.publishing.service.gov.uk/media/6825a5f2ab96d4ed0b262f79/RO5_2021-22_data_by_LA_Live.ods",
        "RO6": "https://assets.publishing.service.gov.uk/media/6825a604ab96d4ed0b262f7a/RO6_2021-22_data_by_LA_Live.ods",
    },
    "council_tax": {
        "band_d": "https://assets.publishing.service.gov.uk/media/680a3ca79b25e1a97c9d8471/Band_D_2025-26.ods",
    },
}

# Years available for multi-year processing (chronological order)
AVAILABLE_YEARS = ["2021-22", "2022-23", "2023-24", "2024-25"]

# ─── RO File Schemas ─────────────────────────────────────────────────
# Maps each RO form to its service areas and which are relevant to districts
# Each service has 7 sub-columns: Employees, Running Expenses, Total Expenditure,
# Sales/Fees/Charges, Other Income, Total Income, Net Current Expenditure
# We only extract Net Current Expenditure (C7) for the output JSON

# These define which services to extract from each RO file.
# format: (form_name, category, service_label, tier_relevance_dict)
# tier_relevance: which council tiers this service is relevant to
# "district" = shire district, "county" = county council, "unitary" = unitary authority
def _tiers(*args):
    """Helper to build tier relevance dict. E.g. _tiers('district','unitary') → {district:True, county:False, unitary:True}"""
    return {"district": "district" in args, "county": "county" in args, "unitary": "unitary" in args}

ALL_TIERS = _tiers("district", "county", "unitary")
DISTRICT_ONLY = _tiers("district")
UPPER_TIER = _tiers("county", "unitary")         # education, social care, public health
DISTRICT_UNITARY = _tiers("district", "unitary")  # housing, most environmental
COUNTY_ONLY = _tiers("county")                    # police/fire levies, registration

RO_SERVICES = {
    "RSX": {
        "category": "Summary",
        "description": "Service expenditure summary (high-level totals)",
        "services": [
            ("Education services", UPPER_TIER),
            ("Highways and transport services", ALL_TIERS),
            ("Children Social Care", UPPER_TIER),
            ("Adult Social Care", UPPER_TIER),
            ("Public Health", UPPER_TIER),
            ("Housing services (GFRA only)", DISTRICT_UNITARY),
            ("Cultural and related services", ALL_TIERS),
            ("Environmental and regulatory services", ALL_TIERS),
            ("Planning and development services", ALL_TIERS),
            ("Police services", COUNTY_ONLY),
            ("Fire and rescue services", COUNTY_ONLY),
            ("Central services", ALL_TIERS),
            ("Other services", ALL_TIERS),
            ("Total Service Expenditure", ALL_TIERS),
        ],
    },
    "RO5": {
        "category": "Cultural, Environmental, Regulatory & Planning",
        "description": "Detailed breakdown of cultural, environmental, regulatory and planning services",
        "services": [
            # Cultural
            ("Culture and heritage - Archives", ALL_TIERS),
            ("Culture and heritage - Arts development and support", ALL_TIERS),
            ("Culture and heritage - Heritage", ALL_TIERS),
            ("Culture and heritage - Museums and galleries", ALL_TIERS),
            ("Culture and heritage - Theatres and public entertainment", ALL_TIERS),
            ("Recreation and sport - Community centres and public halls", ALL_TIERS),
            ("Recreation and sport - Foreshore", ALL_TIERS),
            ("Recreation and sport - Sports development and community recreation", ALL_TIERS),
            ("Recreation and sport - Sports and recreation facilities including golf courses", ALL_TIERS),
            ("Open spaces - Parks and open spaces", ALL_TIERS),
            ("Open spaces - Allotments", ALL_TIERS),
            ("Tourism", ALL_TIERS),
            ("Library service - Library service", UPPER_TIER),  # County/unitary function
            ("TOTAL CULTURAL AND RELATED SERVICES", ALL_TIERS),
            # Environmental
            ("Cemetery, cremation and mortuary services", DISTRICT_UNITARY),
            ("Trading standards", UPPER_TIER),  # County/unitary function
            ("Water safety", ALL_TIERS),
            ("Food safety / hygiene", DISTRICT_UNITARY),
            ("Environmental protection / noise and nuisance", DISTRICT_UNITARY),
            ("Housing standards and HMO licensing", DISTRICT_UNITARY),
            ("Health and safety", ALL_TIERS),
            ("Port health", DISTRICT_UNITARY),
            ("Port health - levies", DISTRICT_UNITARY),
            ("Pest control", DISTRICT_UNITARY),
            ("Public conveniences", DISTRICT_UNITARY),
            ("Animal and public health", ALL_TIERS),
            ("Licensing", DISTRICT_UNITARY),
            ("Crime Reduction", ALL_TIERS),
            ("Safety Services", ALL_TIERS),
            ("CCTV", ALL_TIERS),
            ("Defences against flooding", ALL_TIERS),
            ("Land drainage", ALL_TIERS),
            ("Land drainage - levies", ALL_TIERS),
            ("Coast protection", ALL_TIERS),
            ("Agricultural and fisheries services", ALL_TIERS),
            ("Street cleansing (not chargeable to highways)", DISTRICT_UNITARY),
            ("Waste collection", DISTRICT_UNITARY),
            ("Waste disposal", UPPER_TIER),  # County/unitary function
            ("Trade waste", DISTRICT_UNITARY),
            ("Recycling", ALL_TIERS),
            ("Waste minimisation", ALL_TIERS),
            ("Climate change costs", ALL_TIERS),
            ("TOTAL ENVIRONMENTAL AND REGULATORY SERVICES", ALL_TIERS),
            # Planning
            ("Building control", DISTRICT_UNITARY),
            ("Development control", ALL_TIERS),
            ("Conservation and listed buildings", ALL_TIERS),
            ("Other planning policy and specialist advice", ALL_TIERS),
            ("Environmental initiatives", ALL_TIERS),
            ("Economic development", ALL_TIERS),
            ("Economic research and intelligence", ALL_TIERS),
            ("Business support and promotion", ALL_TIERS),
            ("Community development and safety", ALL_TIERS),
            ("TOTAL PLANNING AND DEVELOPMENT SERVICES", ALL_TIERS),
            # Grand total
            ("TOTAL CULTURAL, ENVIRONMENTAL, REGULATORY AND PLANNING SERVICES", ALL_TIERS),
        ],
    },
    "RO4": {
        "category": "Housing",
        "description": "Housing services including homelessness and housing benefits",
        "services": [
            ("Housing strategy and advice", DISTRICT_UNITARY),
            ("Housing advances", DISTRICT_UNITARY),
            ("Administration of financial support for repairs and improvements", DISTRICT_UNITARY),
            ("Other private sector renewal", DISTRICT_UNITARY),
            ("Nightly paid accommodation (self-contained)", DISTRICT_UNITARY),
            ("Private sector leased", DISTRICT_UNITARY),
            ("Hostels (not nightly paid, not registered care homes)", DISTRICT_UNITARY),
            ("Bed and breakfast hotels", DISTRICT_UNITARY),
            ("LA stock and housing association stock", DISTRICT_UNITARY),
            ("Other temporary accommodation", DISTRICT_UNITARY),
            ("Homelessness administration - Temporary accommodation", DISTRICT_UNITARY),
            ("Homelessness administration - Homelessness Reduction Act", DISTRICT_UNITARY),
            ("Homelessness - Non-HRA housing admin", DISTRICT_UNITARY),
            ("TOTAL HOMELESSNESS SERVICES", DISTRICT_UNITARY),
            ("Rent allowances - discretionary payments", DISTRICT_UNITARY),
            ("Non-HRA rent rebates - discretionary payments", DISTRICT_UNITARY),
            ("Housing Benefits Administration", DISTRICT_UNITARY),
            ("Other council property (Non-HRA)", DISTRICT_UNITARY),
            ("Supporting People", UPPER_TIER),  # County/unitary function
            ("Other welfare services", ALL_TIERS),
            ("TOTAL HOUSING SERVICES (GFRA only)", ALL_TIERS),
        ],
    },
    "RO6": {
        "category": "Central & Other",
        "description": "Central services, protective services and other",
        "services": [
            ("TOTAL POLICE SERVICES", COUNTY_ONLY),
            ("Community fire safety", UPPER_TIER),
            ("Fire fighting and rescue operations", UPPER_TIER),
            ("Fire/rescue service emergency planning and civil defence", UPPER_TIER),
            ("TOTAL FIRE AND RESCUE SERVICES", UPPER_TIER),
            ("Corporate and Democratic Core", ALL_TIERS),
            ("Council tax collection", DISTRICT_UNITARY),
            ("Council tax discounts - prompt payment", DISTRICT_UNITARY),
            ("Council tax discounts - locally funded", DISTRICT_UNITARY),
            ("Council tax support - administration", DISTRICT_UNITARY),
            ("Non-domestic rates collection", DISTRICT_UNITARY),
            ("Business Improvement District ballots", DISTRICT_UNITARY),
            ("Registration of births, deaths and marriages", UPPER_TIER),  # County/unitary
            ("Registration of electors", DISTRICT_UNITARY),
            ("Conducting elections", ALL_TIERS),
            ("Emergency planning", ALL_TIERS),
            ("Local land charges", DISTRICT_UNITARY),
            ("Local welfare assistance", ALL_TIERS),
            ("General grants, bequests and donations", ALL_TIERS),
            ("Coroners' court services", UPPER_TIER),  # County/unitary
            ("Other court services", ALL_TIERS),
            ("Retirement benefits", ALL_TIERS),
            ("Costs of unused shares of IT facilities and other assets", ALL_TIERS),
            ("Revenue expenditure on surplus assets", ALL_TIERS),
            ("MANAGEMENT AND SUPPORT SERVICES", ALL_TIERS),
            ("TOTAL CENTRAL SERVICES", ALL_TIERS),
            ("TOTAL OTHER SERVICES", ALL_TIERS),
        ],
    },
    "RO2": {
        "category": "Highways & Transport",
        "description": "Highways and transport services",
        "services": [
            # District councils typically show zeros for most highway items
            # but may have some agency arrangements
            ("TOTAL HIGHWAYS AND TRANSPORT SERVICES", ALL_TIERS),
        ],
    },
}

# RS (Revenue Summary) special columns — these are single-value columns, not 7-sub-column services
RS_COLUMNS = {
    "service_expenditure": {
        "Education services": UPPER_TIER,
        "Highways and transport services": ALL_TIERS,
        "Children Social Care": UPPER_TIER,
        "Adult Social Care": UPPER_TIER,
        "Public Health": UPPER_TIER,
        "Housing services (GFRA only)": DISTRICT_UNITARY,
        "Cultural and related services": ALL_TIERS,
        "Environmental and regulatory services": ALL_TIERS,
        "Planning and development services": ALL_TIERS,
        "Police services": COUNTY_ONLY,
        "Fire and rescue services": UPPER_TIER,
        "Central services": ALL_TIERS,
        "Other services": ALL_TIERS,
        "TOTAL SERVICE EXPENDITURE": ALL_TIERS,
    },
    "key_financials": [
        "NET CURRENT EXPENDITURE",
        "REVENUE EXPENDITURE",
        "NET REVENUE EXPENDITURE",
        "COUNCIL TAX REQUIREMENT",
    ],
    "reserves": [
        # Actual RS headers have prefix like "Reserves at 1 April 2024 - Estimated other earmarked..."
        # and "Reserves (continued) - Estimated unallocated..."
        # We search for the distinctive part after the dash
        "Estimated other earmarked financial reserves level at 1 April",
        "Estimated other earmarked financial reserves level at 31 March",
        "Estimated unallocated financial reserves level at 1 April",
        "Estimated unallocated financial reserves level at 31 March",
    ],
    "council_tax_support": [
        # Actual header: "Local Council Tax Support (LCTS) - Total amount of council tax revenue foregone"
        "Total amount of council tax revenue foregone",
    ],
    "debt_costs": [
        # Memorandum section on debt costs (columns 156-161)
        "General fund: Interest costs",
        "General fund: Finance cost of credit arrangements",
        "General fund: Revenue cost of the repayment of the principal of debt",
    ],
    "financing": [
        # Revenue expenditure financing items useful for LGR
        "Revenue Support Grant",
        "Retained income from Rate Retention Scheme",
        "Collection fund surplus/deficits for council tax",
    ],
}


# ─── Helpers ─────────────────────────────────────────────────────────

def safe_float(val):
    """Convert ODS cell value to float, handling [x] suppressed values and NaN."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        if pd.isna(val):
            return None
        return float(val)
    s = str(val).strip()
    if s in ("[x]", "[c]", "", "-", ".."):
        return None
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def thousands_to_pounds(val):
    """Convert value from GBP thousands to GBP."""
    if val is None:
        return None
    return round(val * 1000)


def find_data_sheet(sheets_dict):
    """Find the data sheet in an ODS workbook (the one with _LA_Data_ in name)."""
    for name, df in sheets_dict.items():
        if "_LA_Data_" in name or "_data_by_LA" in name.replace(" ", "_"):
            return name, df
    # Fallback: last sheet is often the data
    names = list(sheets_dict.keys())
    return names[-1], sheets_dict[names[-1]]


def load_ods(filepath):
    """Load ODS file and return (headers_row, data_df).

    Auto-detects header row — GOV.UK ODS files vary:
      2024-25: headers at row 6 (0-indexed)
      2023-24 and earlier: headers at row 12 (after hidden reference rows 7-10)
    Header row is identified by containing 'E-code' or 'ONS Code' or 'Local authority'.
    """
    if not HAS_PANDAS:
        print("ERROR: pandas is required. Install with: pip install pandas odfpy")
        sys.exit(1)

    print(f"  Reading {filepath.name}...")
    sheets = pd.read_excel(filepath, engine="odf", sheet_name=None, header=None)
    sheet_name, df = find_data_sheet(sheets)

    # Auto-detect header row by scanning for known header labels
    header_row = 6  # Default fallback
    for r in range(min(20, df.shape[0])):
        row_vals = [str(v).lower().strip() for v in df.iloc[r] if pd.notna(v)]
        # Header row contains structural column names
        if any(label in row_vals for label in ["e-code", "ons code", "local authority"]):
            header_row = r
            break
        # Also match if row contains "Education services" (a data header)
        if any("education services" in v for v in row_vals):
            header_row = r
            break

    headers = [str(v) if pd.notna(v) else "" for v in df.iloc[header_row]]

    # Data starts at the row after headers
    data = df.iloc[header_row + 1:].reset_index(drop=True)
    data.columns = range(len(headers))

    return headers, data


def get_council_row(data, ons_code):
    """Find a council's row by ONS code (column 1)."""
    for idx, row in data.iterrows():
        if str(row[1]).strip() == ons_code:
            return row
    return None


# ─── Download ────────────────────────────────────────────────────────

def download_ods_files(year="2024-25"):
    """Download ODS files from GOV.UK for the specified year."""
    if not HAS_REQUESTS:
        print("ERROR: requests library required. Install with: pip install requests")
        sys.exit(1)

    GOVUK_DIR.mkdir(parents=True, exist_ok=True)

    urls = DOWNLOAD_URLS.get(year, {})
    if not urls:
        print(f"ERROR: No download URLs configured for year {year}")
        available = [y for y in DOWNLOAD_URLS.keys() if y != "council_tax"]
        print(f"Available years: {', '.join(available)}")
        sys.exit(1)

    for form_name, url in urls.items():
        filename = url.split("/")[-1]
        filepath = GOVUK_DIR / filename
        if filepath.exists():
            print(f"  {filename} already exists, skipping")
            continue

        print(f"  Downloading {filename}...")
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        filepath.write_bytes(resp.content)
        print(f"  Saved ({len(resp.content) // 1024}KB)")

    # Also download council tax data (shared across years)
    ct_urls = DOWNLOAD_URLS.get("council_tax", {})
    for name, url in ct_urls.items():
        filename = url.split("/")[-1]
        filepath = GOVUK_DIR / filename
        if filepath.exists():
            print(f"  {filename} already exists, skipping")
            continue
        print(f"  Downloading {filename}...")
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        filepath.write_bytes(resp.content)
        print(f"  Saved ({len(resp.content) // 1024}KB)")


def download_all_years():
    """Download ODS files for all configured years."""
    for year in AVAILABLE_YEARS:
        print(f"\n--- Downloading {year} ---")
        download_ods_files(year)


# ─── RS Parser ───────────────────────────────────────────────────────

def parse_rs(filepath, ons_code):
    """Parse Revenue Summary for a specific council.
    RS has single-value columns (not 7-sub-columns like RO files)."""
    headers, data = load_ods(filepath)
    row = get_council_row(data, ons_code)
    if row is None:
        print(f"  WARNING: Council {ons_code} not found in RS")
        return None

    council_name = str(row[2]).strip()
    council_class = str(row[4]).strip()
    certification = str(row[6]).strip() if pd.notna(row[6]) else ""

    result = {
        "council_name": council_name,
        "council_class": council_class,
        "certified": certification.upper() == "Y",
        "service_expenditure": {},
        "key_financials": {},
        "reserves": {},
        "council_tax_support": {},
        "debt_costs": {},
        "financing": {},
    }

    # Build header index for quick lookup
    header_idx = {}
    for i, h in enumerate(headers):
        if h:
            # Clean header - strip whitespace and normalise
            clean = h.strip()
            if clean:
                header_idx[clean] = i

    # Extract service expenditure line items
    for service, tier_relevance in RS_COLUMNS["service_expenditure"].items():
        # Find matching column - headers may have slightly different text
        col_idx = _find_column(headers, service)
        if col_idx is not None:
            val = safe_float(row[col_idx])
            entry = {
                "value_thousands": val,
                "value_pounds": thousands_to_pounds(val),
                # Backward-compatible boolean (True if relevant to districts)
                "relevant_to_districts": tier_relevance.get("district", False),
                # New tier-aware relevance flags
                "relevant_to_county": tier_relevance.get("county", False),
                "relevant_to_unitary": tier_relevance.get("unitary", False),
            }
            result["service_expenditure"][service] = entry

    # Extract key financial totals
    for item in RS_COLUMNS["key_financials"]:
        col_idx = _find_column(headers, item)
        if col_idx is not None:
            val = safe_float(row[col_idx])
            result["key_financials"][item] = {
                "value_thousands": val,
                "value_pounds": thousands_to_pounds(val),
            }

    # Extract reserves
    for item in RS_COLUMNS["reserves"]:
        col_idx = _find_column(headers, item)
        if col_idx is not None:
            val = safe_float(row[col_idx])
            result["reserves"][item] = {
                "value_thousands": val,
                "value_pounds": thousands_to_pounds(val),
            }

    # Council tax support
    for item in RS_COLUMNS["council_tax_support"]:
        col_idx = _find_column(headers, item)
        if col_idx is not None:
            val = safe_float(row[col_idx])
            result["council_tax_support"][item] = {
                "value_thousands": val,
                "value_pounds": thousands_to_pounds(val),
            }

    # Debt costs (memorandum section)
    for item in RS_COLUMNS.get("debt_costs", []):
        col_idx = _find_column(headers, item)
        if col_idx is not None:
            val = safe_float(row[col_idx])
            result["debt_costs"][item] = {
                "value_thousands": val,
                "value_pounds": thousands_to_pounds(val),
            }

    # Financing items (RSG, NNDR retention, CT surplus/deficit)
    for item in RS_COLUMNS.get("financing", []):
        col_idx = _find_column(headers, item)
        if col_idx is not None:
            val = safe_float(row[col_idx])
            result["financing"][item] = {
                "value_thousands": val,
                "value_pounds": thousands_to_pounds(val),
            }

    return result


def _find_column(headers, target):
    """Find column index by fuzzy-matching header text."""
    target_lower = target.lower().strip()

    # Exact match first
    for i, h in enumerate(headers):
        if h.strip().lower() == target_lower:
            return i

    # Contains match (for slightly different wording)
    for i, h in enumerate(headers):
        h_lower = h.strip().lower()
        # Match if target is contained in header or header starts with target
        if target_lower in h_lower or h_lower.startswith(target_lower):
            return i

    # Try matching without "services" suffix
    target_short = target_lower.replace(" services", "").replace("total ", "")
    for i, h in enumerate(headers):
        h_short = h.strip().lower().replace(" services", "").replace("total ", "")
        if target_short and h_short and target_short in h_short:
            return i

    return None


# ─── RO Parser (Generic) ────────────────────────────────────────────

def parse_ro(filepath, ons_code, form_name):
    """Parse an RO file for a specific council.
    RO files have 7 sub-columns per service (C1-C7):
      Employees, Running Expenses, Total Expenditure,
      Sales/Fees/Charges, Other Income, Total Income,
      Net Current Expenditure
    We extract all 7 for each service."""
    headers, data = load_ods(filepath)
    row = get_council_row(data, ons_code)
    if row is None:
        print(f"  WARNING: Council {ons_code} not found in {form_name}")
        return None

    schema = RO_SERVICES.get(form_name)
    if not schema:
        print(f"  WARNING: No schema defined for {form_name}")
        return None

    result = {
        "form": form_name,
        "category": schema["category"],
        "description": schema["description"],
        "services": {},
    }

    # Sub-column suffixes in order
    sub_cols = [
        ("employees", "Employees"),
        ("running_expenses", "Running Expenses"),
        ("total_expenditure", "Total Expenditure"),
        ("sales_fees_charges", "Sales, Fees and Charges"),
        ("other_income", "Other Income"),
        ("total_income", "Total Income"),
        ("net_current_expenditure", "Net Current Expenditure"),
    ]

    for service_name, tier_relevance in schema["services"]:
        service_data = {
            # Backward-compatible boolean
            "relevant_to_districts": tier_relevance.get("district", False),
            # New tier-aware relevance flags
            "relevant_to_county": tier_relevance.get("county", False),
            "relevant_to_unitary": tier_relevance.get("unitary", False),
        }

        # Find the block of 7 columns for this service
        # Headers look like: "Service Name - Employees (C1)" or just "Service Name - Employees"
        # The Net Current Expenditure column (C7) is what we need most
        for key, suffix in sub_cols:
            col_idx = _find_service_column(headers, service_name, suffix)
            if col_idx is not None:
                val = safe_float(row[col_idx])
                service_data[key] = {
                    "value_thousands": val,
                    "value_pounds": thousands_to_pounds(val),
                }
            else:
                service_data[key] = {"value_thousands": None, "value_pounds": None}

        result["services"][service_name] = service_data

    return result


def _find_service_column(headers, service_name, suffix):
    """Find column for a specific service + sub-column (e.g., 'Waste collection - Net Current Expenditure')."""
    service_lower = service_name.lower().strip()
    suffix_lower = suffix.lower().strip()

    # Try exact pattern: "Service Name - Suffix"
    for i, h in enumerate(headers):
        h_lower = h.strip().lower()
        # Check various separator patterns
        if " - " in h_lower:
            parts = h_lower.split(" - ", 1)
            h_service = parts[0].strip()
            h_suffix = parts[1].strip()

            # Strip (Cn) reference from suffix
            h_suffix_clean = h_suffix
            for tag in ["(c1)", "(c2)", "(c3)", "(c4)", "(c5)", "(c6)", "(c7)", "(c8)"]:
                h_suffix_clean = h_suffix_clean.replace(tag, "").strip()

            if h_service == service_lower and h_suffix_clean == suffix_lower:
                return i

    # Looser match: service name contains + suffix contains
    for i, h in enumerate(headers):
        h_lower = h.strip().lower()
        if " - " in h_lower:
            parts = h_lower.split(" - ", 1)
            h_service = parts[0].strip()
            h_suffix = parts[1].strip()

            # Clean suffix
            h_suffix_clean = h_suffix
            for tag in ["(c1)", "(c2)", "(c3)", "(c4)", "(c5)", "(c6)", "(c7)", "(c8)"]:
                h_suffix_clean = h_suffix_clean.replace(tag, "").strip()

            # Fuzzy: both service and suffix match approximately
            if (service_lower in h_service or h_service in service_lower) and \
               suffix_lower in h_suffix_clean:
                return i

    return None


# ─── Council Tax Parser ──────────────────────────────────────────────

def parse_council_tax(filepath, ons_code):
    """Parse Band D council tax data from the historical Band D ODS file.

    The Band D file has multiple sheets:
      - exc_PP: Band D excluding parish precepts (district element only)
      - inc_PP: Band D including parish precepts
      - Area_CT: Total area council tax (all precepts combined)

    Structure per sheet:
      - Row 2: headers (Code, ONS Code, Authority, Current, Class, then year columns)
      - Row 3+: data rows
      - ONS code in col 1
      - Year columns start at col 5 (exc_PP/inc_PP) or col 6 (Area_CT has Region col)
      - Years formatted as "1993/94", "2020/21" etc (slash, not dash)
    """
    print(f"  Reading {filepath.name} for council tax...")

    sheets = pd.read_excel(filepath, engine="odf", sheet_name=None, header=None)

    # We want exc_PP (district's own Band D, excluding parish precepts) as primary
    # and Area_CT (total Band D including all precepts) as secondary
    target_sheets = ["exc_PP", "inc_PP", "Area_CT"]

    result = {"band_d_by_year": {}, "band_d_total_by_year": {}}

    for sheet_name in target_sheets:
        if sheet_name not in sheets:
            continue

        df = sheets[sheet_name]

        # Headers at row 2 (0-indexed)
        header_row_idx = 2
        # Verify by scanning first few rows for "ONS" or "Code"
        for idx in range(min(10, df.shape[0])):
            row_vals = [str(v).lower() for v in df.iloc[idx] if pd.notna(v)]
            if any("ons" in v or "code" in v for v in row_vals):
                header_row_idx = idx
                break

        headers = [str(v) if pd.notna(v) else "" for v in df.iloc[header_row_idx]]
        data = df.iloc[header_row_idx + 1:].reset_index(drop=True)

        # ONS code is in col 1
        ons_col = 1

        # Find council row
        council_row = None
        for idx in range(data.shape[0]):
            val = str(data.iloc[idx][ons_col]).strip()
            if val == ons_code:
                council_row = data.iloc[idx]
                break

        if council_row is None:
            print(f"  WARNING: Council {ons_code} not found in sheet '{sheet_name}'")
            continue

        # Extract year columns
        # Years are formatted as "YYYY to YYYY" (e.g., "2025 to 2026")
        # We normalise to "YYYY/YY" format for consistency (e.g., "2025/26")
        year_data = {}
        for i, h in enumerate(headers):
            h_str = str(h).strip()
            # Match "YYYY to YYYY" pattern
            if " to " in h_str:
                parts = h_str.split(" to ")
                if len(parts) == 2 and parts[0].strip().isdigit() and parts[1].strip().isdigit():
                    start_year = parts[0].strip()
                    end_year = parts[1].strip()
                    # Normalise to "YYYY/YY"
                    year_key = f"{start_year}/{end_year[-2:]}"
                    val = safe_float(council_row.iloc[i])
                    if val is not None:
                        year_data[year_key] = round(val, 2)

        if sheet_name == "exc_PP":
            result["band_d_by_year"] = year_data
            print(f"    exc_PP: {len(year_data)} years of Band D data (excl. parish precepts)")
        elif sheet_name == "Area_CT":
            result["band_d_total_by_year"] = year_data
            print(f"    Area_CT: {len(year_data)} years of total area council tax")
        elif sheet_name == "inc_PP":
            result["band_d_inc_pp_by_year"] = year_data
            print(f"    inc_PP: {len(year_data)} years of Band D data (incl. parish precepts)")

    return result if result.get("band_d_by_year") else None


# ─── Main Output Builder ─────────────────────────────────────────────

def _find_ods_file(form_name, year):
    """Find ODS file for a given form and year, handling varied filename conventions.

    GOV.UK filenames vary across years:
      2024-25: RS_LA_Data_2024-25_data_by_LA.ods
      2023-24: RS_2023-24_data_by_LA.ods
      2021-22: RS_2021-22_data_by_LA_July_2025.ods / RS_2021-22_data_by_LA_Live.ods
    """
    # Try patterns in order of likelihood
    patterns = [
        f"{form_name}_LA_Data_{year}_data_by_LA.ods",   # 2024-25 format
        f"{form_name}_{year}_data_by_LA.ods",            # 2023-24 format
        f"{form_name}_{year}_data_by_LA_Live.ods",       # 2021-22 Live format
        f"{form_name}_{year}_data_by_LA_ive.ods",        # 2021-22 typo (RO2)
    ]

    for pattern in patterns:
        filepath = GOVUK_DIR / pattern
        if filepath.exists():
            return filepath

    # Glob fallback: any file matching form_name + year
    matches = list(GOVUK_DIR.glob(f"{form_name}*{year}*.ods"))
    if matches:
        return matches[0]

    return None


def build_council_budget(council_id, ons_code, year="2024-25"):
    """Build complete budget data for a council from all available ODS files."""
    print(f"\nProcessing {council_id} ({ons_code}) for {year}...")

    form_names = ["RS", "RSX", "RO2", "RO4", "RO5", "RO6"]

    result = {
        "council_id": council_id,
        "ons_code": ons_code,
        "financial_year": year,
        "data_source": "MHCLG Revenue Outturn (GOV.UK)",
        "data_licence": "Open Government Licence v3.0",
        "units": "GBP (converted from GBP thousands)",
        "notes": "Values are actual outturn spend, not budget estimates. Negative values indicate net income.",
    }

    # Parse RS (Revenue Summary)
    rs_path = _find_ods_file("RS", year)
    if rs_path:
        rs_data = parse_rs(rs_path, ons_code)
        if rs_data:
            result["council_name"] = rs_data["council_name"]
            result["council_class"] = rs_data["council_class"]
            result["certified"] = rs_data["certified"]
            result["revenue_summary"] = {
                "service_expenditure": rs_data["service_expenditure"],
                "key_financials": rs_data["key_financials"],
                "reserves": rs_data["reserves"],
                "council_tax_support": rs_data["council_tax_support"],
                "debt_costs": rs_data.get("debt_costs", {}),
                "financing": rs_data.get("financing", {}),
            }
    else:
        print(f"  RS file not found for {year}")

    # Parse each RO form
    result["detailed_services"] = {}
    for form_name in form_names:
        if form_name == "RS":
            continue  # Already parsed above
        filepath = _find_ods_file(form_name, year)
        if filepath:
            ro_data = parse_ro(filepath, ons_code, form_name)
            if ro_data:
                result["detailed_services"][form_name] = ro_data
        else:
            print(f"  {form_name} file not found for {year}")

    # Parse council tax (if available)
    ct_files = list(GOVUK_DIR.glob("Band_D_*.ods"))
    if ct_files:
        ct_data = parse_council_tax(ct_files[0], ons_code)
        if ct_data:
            result["council_tax"] = ct_data

    return result


def build_comparison_summary(councils_data):
    """Build a comparison-friendly summary across multiple councils.
    This is the key cross-council analysis output."""
    summary = {
        "generated": pd.Timestamp.now().isoformat() if HAS_PANDAS else "",
        "financial_year": councils_data[0]["financial_year"] if councils_data else "",
        "councils": [],
        "comparison": {},
    }

    for cd in councils_data:
        council_entry = {
            "council_id": cd["council_id"],
            "ons_code": cd["ons_code"],
            "council_name": cd.get("council_name", cd["council_id"]),
            "council_class": cd.get("council_class", ""),
        }

        # Extract key headline numbers
        rs = cd.get("revenue_summary", {})
        se = rs.get("service_expenditure", {})
        kf = rs.get("key_financials", {})
        reserves = rs.get("reserves", {})

        council_entry["total_service_expenditure"] = _extract_pounds(se, "TOTAL SERVICE EXPENDITURE")
        council_entry["net_current_expenditure"] = _extract_pounds(kf, "NET CURRENT EXPENDITURE")
        council_entry["net_revenue_expenditure"] = _extract_pounds(kf, "NET REVENUE EXPENDITURE")
        council_entry["council_tax_requirement"] = _extract_pounds(kf, "COUNCIL TAX REQUIREMENT")

        # Service breakdown — all services (let consumer filter by tier)
        council_entry["services"] = {}
        council_entry["services_all"] = {}
        for svc, data in se.items():
            val = data.get("value_pounds")
            council_entry["services_all"][svc] = val
            # Backward compat: district-relevant services
            if data.get("relevant_to_districts"):
                council_entry["services"][svc] = val

        # Reserves
        council_entry["reserves_earmarked_start"] = _extract_pounds(
            reserves, "Estimated other earmarked financial reserves level at 1 April")
        council_entry["reserves_earmarked_end"] = _extract_pounds(
            reserves, "Estimated other earmarked financial reserves level at 31 March")
        council_entry["reserves_unallocated_start"] = _extract_pounds(
            reserves, "Estimated unallocated financial reserves level at 1 April")
        council_entry["reserves_unallocated_end"] = _extract_pounds(
            reserves, "Estimated unallocated financial reserves level at 31 March")

        # Council tax
        ct = cd.get("council_tax", {})
        if ct:
            years = sorted(ct.get("band_d_by_year", {}).keys())
            if years:
                council_entry["band_d_latest"] = ct["band_d_by_year"][years[-1]]
                council_entry["band_d_year"] = years[-1]

        summary["councils"].append(council_entry)

    # Build comparison metrics
    if len(summary["councils"]) >= 2:
        c1, c2 = summary["councils"][0], summary["councils"][1]
        comparison = {}

        for svc in c1.get("services", {}):
            v1 = c1["services"].get(svc)
            v2 = c2["services"].get(svc) if c2.get("services") else None
            if v1 is not None and v2 is not None:
                comparison[svc] = {
                    c1["council_id"]: v1,
                    c2["council_id"]: v2,
                    "difference": v1 - v2,
                    "ratio": round(v1 / v2, 2) if v2 != 0 else None,
                }

        summary["comparison"] = comparison

    return summary


def _extract_pounds(data_dict, key):
    """Extract value_pounds from a nested dict."""
    entry = data_dict.get(key, {})
    if isinstance(entry, dict):
        return entry.get("value_pounds")
    return None


# ─── Multi-Year Assembly ─────────────────────────────────────────────

def build_multi_year_budget(council_id, ons_code, years=None):
    """Build multi-year budget data for a council across all available years.

    Returns a combined structure with per-year data and computed trends.
    """
    if years is None:
        years = AVAILABLE_YEARS

    multi = {
        "council_id": council_id,
        "ons_code": ons_code,
        "data_source": "MHCLG Revenue Outturn (GOV.UK)",
        "data_licence": "Open Government Licence v3.0",
        "units": "GBP (converted from GBP thousands)",
        "years": [],
        "latest_year": None,
        "by_year": {},
    }

    for year in years:
        # Check if ODS files exist for this year
        rs_path = _find_ods_file("RS", year)
        if not rs_path:
            print(f"  Skipping {year} — no ODS files found")
            continue

        budget = build_council_budget(council_id, ons_code, year)
        if budget and budget.get("revenue_summary"):
            multi["years"].append(year)
            multi["by_year"][year] = budget
            multi["latest_year"] = year

            # Carry forward council name/class from latest available year
            if budget.get("council_name"):
                multi["council_name"] = budget["council_name"]
            if budget.get("council_class"):
                multi["council_class"] = budget["council_class"]

    # Add council tax data (shared across years, from Band D file)
    ct_files = list(GOVUK_DIR.glob("Band_D_*.ods"))
    if ct_files and multi["years"]:
        ct_data = parse_council_tax(ct_files[0], ons_code)
        if ct_data:
            multi["council_tax"] = ct_data

    # Backward compat: mirror latest year's data at top level
    if multi["latest_year"] and multi["latest_year"] in multi["by_year"]:
        latest = multi["by_year"][multi["latest_year"]]
        multi["financial_year"] = multi["latest_year"]
        if "revenue_summary" in latest:
            multi["revenue_summary"] = latest["revenue_summary"]
        if "detailed_services" in latest:
            multi["detailed_services"] = latest["detailed_services"]
        multi["certified"] = latest.get("certified")

    return multi


def _compute_trends(multi_year_data):
    """Compute year-on-year trends from multi-year budget data.

    Returns trend data for services, reserves, and key financials.
    """
    years = multi_year_data.get("years", [])
    if len(years) < 2:
        return {}

    council_id = multi_year_data.get("council_id", "")
    council_info = LANCASHIRE_COUNCILS.get(council_id, {})
    council_tier = council_info.get("type", "district")
    tier_key = f"relevant_to_{council_tier}" if council_tier != "district" else "relevant_to_districts"

    trends = {
        "years": years,
        "service_trends": {},
        "headline_trends": {},
        "reserves_trends": {},
    }

    # Track service expenditure across years
    all_services = set()
    for year in years:
        budget = multi_year_data["by_year"].get(year, {})
        se = budget.get("revenue_summary", {}).get("service_expenditure", {})
        for svc, data in se.items():
            if data.get(tier_key, data.get("relevant_to_districts")) and svc != "TOTAL SERVICE EXPENDITURE":
                all_services.add(svc)

    for svc in sorted(all_services):
        values = []
        for year in years:
            budget = multi_year_data["by_year"].get(year, {})
            se = budget.get("revenue_summary", {}).get("service_expenditure", {})
            val = se.get(svc, {}).get("value_pounds")
            values.append({"year": year, "value": val})
        trends["service_trends"][svc] = values

        # Compute change between first and last available years
        first_val = next((v["value"] for v in values if v["value"] is not None), None)
        last_val = next((v["value"] for v in reversed(values) if v["value"] is not None), None)
        if first_val and last_val and first_val != 0:
            trends["service_trends"][svc + "_change_pct"] = round(
                (last_val - first_val) / abs(first_val) * 100, 1
            )

    # Headline financials across years
    for metric in ["TOTAL SERVICE EXPENDITURE", "NET REVENUE EXPENDITURE", "COUNCIL TAX REQUIREMENT"]:
        values = []
        for year in years:
            budget = multi_year_data["by_year"].get(year, {})
            kf = budget.get("revenue_summary", {}).get("key_financials", {})
            se = budget.get("revenue_summary", {}).get("service_expenditure", {})
            if metric == "TOTAL SERVICE EXPENDITURE":
                val = _extract_pounds(se, metric)
            else:
                val = _extract_pounds(kf, metric)
            values.append({"year": year, "value": val})
        trends["headline_trends"][metric] = values

    # Reserves trajectory
    for year in years:
        budget = multi_year_data["by_year"].get(year, {})
        reserves_raw = budget.get("revenue_summary", {}).get("reserves", {})
        earmarked = _extract_pounds(reserves_raw, "Estimated other earmarked financial reserves level at 31 March")
        unallocated = _extract_pounds(reserves_raw, "Estimated unallocated financial reserves level at 31 March")
        total = None
        if earmarked is not None or unallocated is not None:
            total = (earmarked or 0) + (unallocated or 0)
        trends["reserves_trends"][year] = {
            "earmarked": earmarked,
            "unallocated": unallocated,
            "total": total,
        }

    return trends


# ─── SPA Output ──────────────────────────────────────────────────────

def export_for_spa(council_id, budget_data, comparison=None):
    """Export budget data as JSON files for the React SPA.

    Handles both single-year and multi-year budget_data.
    Multi-year data has 'by_year' key; single-year does not.
    """
    council_dir = DATA_DIR / council_id
    council_dir.mkdir(parents=True, exist_ok=True)

    is_multi_year = "by_year" in budget_data

    # Full budget data
    output_path = council_dir / "budgets_govuk.json"
    with open(output_path, "w") as f:
        json.dump(budget_data, f, indent=2, default=str)
    print(f"  Written: {output_path} ({output_path.stat().st_size // 1024}KB)")

    # Simplified SPA-friendly version for quick loading
    if is_multi_year:
        spa_data = _build_spa_budget_multi_year(budget_data)
    else:
        spa_data = _build_spa_budget(budget_data)
    spa_path = council_dir / "budgets_summary.json"
    with open(spa_path, "w") as f:
        json.dump(spa_data, f, indent=2, default=str)
    print(f"  Written: {spa_path} ({spa_path.stat().st_size // 1024}KB)")

    return output_path


def _build_spa_budget(budget_data):
    """Build a lean JSON structure optimised for the SPA's budget view."""
    rs = budget_data.get("revenue_summary", {})
    se = rs.get("service_expenditure", {})
    kf = rs.get("key_financials", {})
    reserves_raw = rs.get("reserves", {})
    ct_support_raw = rs.get("council_tax_support", {})

    # Determine council tier for filtering
    council_id = budget_data.get("council_id", "")
    council_info = LANCASHIRE_COUNCILS.get(council_id, {})
    council_tier = council_info.get("type", "district")
    tier_key = f"relevant_to_{council_tier}" if council_tier != "district" else "relevant_to_districts"

    # Service breakdown for charts — filtered by council tier, in pounds
    services = {}
    for svc, data in se.items():
        if data.get(tier_key, data.get("relevant_to_districts")) and svc != "TOTAL SERVICE EXPENDITURE":
            val = data.get("value_pounds")
            if val is not None and val != 0:
                services[svc] = val

    # Detailed service breakdown from RO5 for drill-down
    ro5_detail = {}
    ro5 = budget_data.get("detailed_services", {}).get("RO5", {})
    for svc_name, svc_data in ro5.get("services", {}).items():
        if svc_data.get(tier_key, svc_data.get("relevant_to_districts")):
            nce = svc_data.get("net_current_expenditure", {})
            val = nce.get("value_pounds")
            if val is not None and val != 0 and "TOTAL" not in svc_name:
                # Clean service name — extract just the service part
                clean_name = svc_name
                for prefix in ["Culture and heritage - ", "Recreation and sport - ",
                               "Open spaces - ", "Library service - "]:
                    clean_name = clean_name.replace(prefix, "")
                ro5_detail[clean_name] = val

    # RO4 housing detail
    ro4_detail = {}
    ro4 = budget_data.get("detailed_services", {}).get("RO4", {})
    for svc_name, svc_data in ro4.get("services", {}).items():
        if svc_data.get(tier_key, svc_data.get("relevant_to_districts")):
            nce = svc_data.get("net_current_expenditure", {})
            val = nce.get("value_pounds")
            if val is not None and val != 0 and "TOTAL" not in svc_name:
                ro4_detail[svc_name] = val

    # RO6 central services detail
    ro6_detail = {}
    ro6 = budget_data.get("detailed_services", {}).get("RO6", {})
    for svc_name, svc_data in ro6.get("services", {}).items():
        if svc_data.get(tier_key, svc_data.get("relevant_to_districts")):
            nce = svc_data.get("net_current_expenditure", {})
            val = nce.get("value_pounds")
            if val is not None and val != 0 and "TOTAL" not in svc_name:
                ro6_detail[svc_name] = val

    # Build reserves summary
    reserves = {}
    earmarked_start = _extract_pounds(reserves_raw, "Estimated other earmarked financial reserves level at 1 April")
    earmarked_end = _extract_pounds(reserves_raw, "Estimated other earmarked financial reserves level at 31 March")
    unallocated_start = _extract_pounds(reserves_raw, "Estimated unallocated financial reserves level at 1 April")
    unallocated_end = _extract_pounds(reserves_raw, "Estimated unallocated financial reserves level at 31 March")
    if any(v is not None for v in [earmarked_start, earmarked_end, unallocated_start, unallocated_end]):
        reserves = {
            "earmarked_opening": earmarked_start,
            "earmarked_closing": earmarked_end,
            "unallocated_opening": unallocated_start,
            "unallocated_closing": unallocated_end,
            "total_opening": (earmarked_start or 0) + (unallocated_start or 0) if earmarked_start is not None or unallocated_start is not None else None,
            "total_closing": (earmarked_end or 0) + (unallocated_end or 0) if earmarked_end is not None or unallocated_end is not None else None,
        }
        if reserves.get("total_opening") is not None and reserves.get("total_closing") is not None:
            reserves["change"] = reserves["total_closing"] - reserves["total_opening"]

    # Council tax support
    ct_support = _extract_pounds(ct_support_raw, "Council tax support - foregone council tax")

    spa = {
        "council_id": budget_data["council_id"],
        "council_name": budget_data.get("council_name", ""),
        "council_tier": council_tier,
        "financial_year": budget_data["financial_year"],
        "data_source": "MHCLG Revenue Outturn",
        "headline": {
            "total_service_expenditure": _extract_pounds(se, "TOTAL SERVICE EXPENDITURE"),
            "net_current_expenditure": _extract_pounds(kf, "NET CURRENT EXPENDITURE"),
            "net_revenue_expenditure": _extract_pounds(kf, "NET REVENUE EXPENDITURE"),
            "council_tax_requirement": _extract_pounds(kf, "COUNCIL TAX REQUIREMENT"),
        },
        "service_breakdown": services,
        "detail": {
            "cultural_environmental_planning": ro5_detail,
            "housing": ro4_detail,
            "central_services": ro6_detail,
        },
        "reserves": reserves,
        "council_tax_support": ct_support,
        "council_tax": budget_data.get("council_tax", {}),
    }

    return spa


def _build_spa_budget_multi_year(multi_year_data):
    """Build a lean multi-year JSON structure for the SPA's budget view.

    Includes the latest year's full data plus trends across all years.
    """
    # Build the latest year's SPA data as the base
    latest_year = multi_year_data.get("latest_year")
    if not latest_year:
        return {"error": "No budget data available"}

    # Use the latest year's full budget for the base SPA output
    latest_budget = multi_year_data["by_year"].get(latest_year, {})
    # Ensure council_tax from multi-year data is available
    if "council_tax" in multi_year_data:
        latest_budget["council_tax"] = multi_year_data["council_tax"]

    spa = _build_spa_budget(latest_budget)

    # Enhance with multi-year data
    spa["multi_year"] = True
    spa["years"] = multi_year_data.get("years", [])
    spa["latest_year"] = latest_year

    # Add trends
    trends = _compute_trends(multi_year_data)
    spa["trends"] = trends

    # Per-year headline summaries for the year selector
    year_summaries = {}
    for year in multi_year_data.get("years", []):
        yr_budget = multi_year_data["by_year"].get(year, {})
        rs = yr_budget.get("revenue_summary", {})
        se = rs.get("service_expenditure", {})
        kf = rs.get("key_financials", {})
        reserves_raw = rs.get("reserves", {})

        # Determine council tier
        council_id = multi_year_data.get("council_id", "")
        council_info = LANCASHIRE_COUNCILS.get(council_id, {})
        council_tier = council_info.get("type", "district")
        tier_key = f"relevant_to_{council_tier}" if council_tier != "district" else "relevant_to_districts"

        # Service breakdown for this year
        services_yr = {}
        for svc, data in se.items():
            if data.get(tier_key, data.get("relevant_to_districts")) and svc != "TOTAL SERVICE EXPENDITURE":
                val = data.get("value_pounds")
                if val is not None and val != 0:
                    services_yr[svc] = val

        # Reserves for this year
        earmarked_end = _extract_pounds(reserves_raw, "Estimated other earmarked financial reserves level at 31 March")
        unallocated_end = _extract_pounds(reserves_raw, "Estimated unallocated financial reserves level at 31 March")
        total_reserves = None
        if earmarked_end is not None or unallocated_end is not None:
            total_reserves = (earmarked_end or 0) + (unallocated_end or 0)

        year_summaries[year] = {
            "total_service_expenditure": _extract_pounds(se, "TOTAL SERVICE EXPENDITURE"),
            "net_revenue_expenditure": _extract_pounds(kf, "NET REVENUE EXPENDITURE"),
            "council_tax_requirement": _extract_pounds(kf, "COUNCIL TAX REQUIREMENT"),
            "service_breakdown": services_yr,
            "reserves_total": total_reserves,
        }

    spa["year_summaries"] = year_summaries

    # Financing data across years (RSG, rates, CT — useful for LGR analysis)
    financing_trends = {}
    for year in multi_year_data.get("years", []):
        yr_budget = multi_year_data["by_year"].get(year, {})
        financing = yr_budget.get("revenue_summary", {}).get("financing", {})
        if financing:
            financing_trends[year] = {
                k: v.get("value_pounds") for k, v in financing.items()
            }
    if financing_trends:
        spa["financing_trends"] = financing_trends

    # Debt costs across years
    debt_trends = {}
    for year in multi_year_data.get("years", []):
        yr_budget = multi_year_data["by_year"].get(year, {})
        debt = yr_budget.get("revenue_summary", {}).get("debt_costs", {})
        if debt:
            debt_trends[year] = {
                k: v.get("value_pounds") for k, v in debt.items()
            }
    if debt_trends:
        spa["debt_trends"] = debt_trends

    return spa


# ─── CLI ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Parse GOV.UK MHCLG Revenue Outturn data for council budget analysis"
    )
    parser.add_argument(
        "--councils", nargs="+",
        help="Council IDs to process (e.g., burnley hyndburn)"
    )
    parser.add_argument(
        "--all-districts", action="store_true",
        help="Process all Lancashire district councils"
    )
    parser.add_argument(
        "--all", action="store_true",
        help="Process all 15 Lancashire councils (districts + county + unitaries)"
    )
    parser.add_argument(
        "--download", action="store_true",
        help="Download ODS files from GOV.UK before processing"
    )
    parser.add_argument(
        "--year", default="2024-25",
        help="Financial year to process (default: 2024-25). Ignored with --multi-year."
    )
    parser.add_argument(
        "--multi-year", action="store_true",
        help="Process all available years (2021-22 to 2024-25) and generate trend data"
    )
    parser.add_argument(
        "--list-councils", action="store_true",
        help="List all known Lancashire councils and their ONS codes"
    )
    parser.add_argument(
        "--comparison", action="store_true",
        help="Generate cross-council comparison summary"
    )
    parser.add_argument(
        "--output-dir",
        help="Override output directory"
    )

    args = parser.parse_args()

    if args.list_councils:
        print("\nKnown Lancashire Councils:")
        print(f"{'ID':<20} {'ONS Code':<12} {'Name':<30} {'Type':<10}")
        print("-" * 72)
        for cid, info in sorted(LANCASHIRE_COUNCILS.items()):
            print(f"{cid:<20} {info['ons']:<12} {info['name']:<30} {info['type']:<10}")
        print(f"\nAvailable years: {', '.join(AVAILABLE_YEARS)}")
        return

    # Determine which councils to process
    council_ids = []
    if args.all:
        council_ids = list(LANCASHIRE_COUNCILS.keys())
    elif args.all_districts:
        council_ids = [cid for cid, info in LANCASHIRE_COUNCILS.items()
                       if info["type"] == "district"]
    elif args.councils:
        council_ids = args.councils
    else:
        print("ERROR: Specify --councils, --all-districts, or --all")
        parser.print_help()
        sys.exit(1)

    # Validate council IDs
    for cid in council_ids:
        if cid not in LANCASHIRE_COUNCILS:
            print(f"ERROR: Unknown council '{cid}'. Use --list-councils to see options.")
            sys.exit(1)

    # Download if requested
    if args.download:
        if args.multi_year:
            print(f"\n=== Downloading ODS files for all years ===")
            download_all_years()
        else:
            print(f"\n=== Downloading ODS files for {args.year} ===")
            download_ods_files(args.year)

    # Check ODS files exist
    if not GOVUK_DIR.exists():
        print(f"ERROR: ODS directory not found: {GOVUK_DIR}")
        print("Run with --download to fetch files from GOV.UK")
        sys.exit(1)

    # Multi-year processing
    if args.multi_year:
        print(f"\n=== Multi-year processing: {len(council_ids)} council(s) × {len(AVAILABLE_YEARS)} years ===")
        all_budgets = []

        for council_id in council_ids:
            info = LANCASHIRE_COUNCILS[council_id]
            print(f"\n{'='*60}")
            print(f"  {info['name']} ({council_id}) — multi-year")
            print(f"{'='*60}")
            multi = build_multi_year_budget(council_id, info["ons"])
            all_budgets.append(multi)
            export_for_spa(council_id, multi)

        # Print multi-year summary
        print(f"\n=== Multi-Year Summary ===")
        for b in all_budgets:
            name = b.get("council_name", b["council_id"])
            years = b.get("years", [])
            print(f"\n  {name}: {len(years)} years ({', '.join(years)})")

            for year in years:
                yr = b["by_year"].get(year, {})
                rs = yr.get("revenue_summary", {})
                se = rs.get("service_expenditure", {})
                total = _extract_pounds(se, "TOTAL SERVICE EXPENDITURE")
                print(f"    {year}: £{total:,.0f}" if total else f"    {year}: N/A")

        # Generate comparison from latest year data
        if args.comparison and len(all_budgets) >= 2:
            latest_budgets = []
            for b in all_budgets:
                latest = b.get("latest_year")
                if latest and latest in b.get("by_year", {}):
                    latest_budgets.append(b["by_year"][latest])
            if len(latest_budgets) >= 2:
                print(f"\n=== Generating cross-council comparison (latest year) ===")
                comparison = build_comparison_summary(latest_budgets)
                comp_path = DATA_DIR / "govuk_comparison.json"
                with open(comp_path, "w") as f:
                    json.dump(comparison, f, indent=2, default=str)
                print(f"  Written: {comp_path}")

        return

    # Single-year processing (original behaviour)
    print(f"\n=== Processing {len(council_ids)} council(s) for {args.year} ===")
    all_budgets = []

    for council_id in council_ids:
        info = LANCASHIRE_COUNCILS[council_id]
        budget = build_council_budget(council_id, info["ons"], args.year)
        all_budgets.append(budget)
        export_for_spa(council_id, budget)

    # Generate comparison if requested and multiple councils
    if args.comparison and len(all_budgets) >= 2:
        print(f"\n=== Generating cross-council comparison ===")
        comparison = build_comparison_summary(all_budgets)
        comp_path = DATA_DIR / "govuk_comparison.json"
        with open(comp_path, "w") as f:
            json.dump(comparison, f, indent=2, default=str)
        print(f"  Written: {comp_path}")

    # Print summary
    print(f"\n=== Summary ===")
    for b in all_budgets:
        name = b.get("council_name", b["council_id"])
        rs = b.get("revenue_summary", {})
        se = rs.get("service_expenditure", {})
        total = _extract_pounds(se, "TOTAL SERVICE EXPENDITURE")
        ct_req = _extract_pounds(rs.get("key_financials", {}), "COUNCIL TAX REQUIREMENT")
        print(f"  {name}:")
        print(f"    Total Service Expenditure: £{total:,.0f}" if total else "    Total Service Expenditure: N/A")
        print(f"    Council Tax Requirement:   £{ct_req:,.0f}" if ct_req else "    Council Tax Requirement: N/A")

        # Service breakdown — show tier-relevant services
        council_info = LANCASHIRE_COUNCILS.get(b["council_id"], {})
        tier = council_info.get("type", "district")
        tier_key = f"relevant_to_{tier}" if tier != "district" else "relevant_to_districts"
        for svc, data in se.items():
            if data.get(tier_key, data.get("relevant_to_districts")) and svc != "TOTAL SERVICE EXPENDITURE":
                val = data.get("value_pounds")
                if val is not None:
                    print(f"      {svc}: £{val:,.0f}")


if __name__ == "__main__":
    main()
