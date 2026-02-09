# UK Free Data Sources for Commercial Property Transactions, Ownership & Contact Details

## Comprehensive Research Guide (February 2026)

---

## Table of Contents
1. [HM Land Registry](#1-hm-land-registry)
2. [Companies House](#2-companies-house)
3. [EPC Register](#3-epc-register)
4. [VOA (Valuation Office Agency)](#4-voa-valuation-office-agency)
5. [Planning Applications](#5-planning-applications)
6. [Other Free Sources](#6-other-free-sources)
7. [Cross-Referencing Guide](#7-cross-referencing-guide)
8. [Contact Details & Legal Considerations](#8-contact-details--legal-considerations)
9. [Data Pipeline Architecture](#9-data-pipeline-architecture)

---

## 1. HM Land Registry

### 1A. Price Paid Data (PPD)

| Attribute | Details |
|-----------|---------|
| **URL (Download)** | https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads |
| **URL (Search/API)** | https://landregistry.data.gov.uk/app/ppd/ |
| **API Catalogue** | https://www.api.gov.uk/hmlr/ |
| **Cost** | FREE |
| **Authentication** | None for downloads; API uses linked data endpoints |
| **Data Format** | CSV (4.3GB full), TXT (4.2GB full), Linked Data (API) |
| **Update Frequency** | Monthly (latest: 29 January 2026, containing December 2025 data) |
| **Licence** | Open Government Licence (OGL) - commercial use permitted |
| **Historical Data** | From January 1995 (Category A), October 2013 (Category B) |

#### CSV Fields (16 columns, NO headers supplied by default)

| # | Field | Description |
|---|-------|-------------|
| 1 | Transaction Unique ID | Auto-generated unique reference per sale |
| 2 | Price | Sale price from the transfer deed (GBP) |
| 3 | Date of Transfer | Completion date from the transfer deed |
| 4 | Postcode | Postcode at time of transaction |
| 5 | Property Type | D=Detached, S=Semi-Detached, T=Terraced, F=Flat, **O=Other** |
| 6 | Old/New | Y=New build, N=Established |
| 7 | Duration | F=Freehold, L=Leasehold (7+ years only) |
| 8 | PAON | Primary Addressable Object Name (house number/name) |
| 9 | SAON | Secondary Addressable Object Name (flat number) |
| 10 | Street | Street name |
| 11 | Locality | Locality |
| 12 | Town/City | Town or city |
| 13 | District | District |
| 14 | County | County |
| 15 | PPD Category Type | A=Standard residential, B=Additional (repossessions, BTL, non-private) |
| 16 | Record Status | A=Addition, C=Change, D=Deletion |

#### Can Price Paid Data be Filtered for Commercial Only?

**Short answer: Not directly.** There is no explicit "commercial" flag. To approximate commercial properties:

1. **Filter Property Type = "O" (Other)** - This captures properties not classified as D/S/T/F (all residential types). Commercial properties will appear here, but so will some non-standard residential.
2. **Filter PPD Category = "B"** - "Additional" entries include transfers to non-private individuals (companies), but also includes repossessions and BTL.
3. **Cross-reference with CCOD** - Match by postcode + address to identify corporate-owned properties.
4. **VAT exclusion note**: Commercial transactions where consideration is inclusive of VAT are EXCLUDED from the dataset entirely. This means the PPD significantly undercounts commercial transactions.

**Conclusion**: PPD is primarily a residential dataset. For comprehensive commercial property data, you MUST use CCOD/OCOD alongside it.

---

### 1B. CCOD - UK Companies That Own Property in England and Wales

*Formerly called "Commercial and Corporate Ownership Data"*

| Attribute | Details |
|-----------|---------|
| **URL (Download)** | https://use-land-property-data.service.gov.uk/datasets/ccod |
| **Tech Spec** | https://use-land-property-data.service.gov.uk/datasets/ccod/tech-spec |
| **Cost** | FREE (since November 2017) |
| **Authentication** | Requires free account registration on the portal |
| **Data Format** | CSV (UTF-8, comma-delimited, double-quoted fields) |
| **Update Frequency** | Monthly (2nd working day of month, contains previous month's data) |
| **File Types** | FULL monthly extract + COU (Change Only Update) |
| **File Naming** | `CCOD_FULL_YYYY_MM.csv` / `CCOD_COU_YYYY_MM.csv` |
| **Licence** | Restricted - check terms on download portal |
| **Records** | 3+ million rows |

#### CCOD Data Fields

| Field | Description |
|-------|-------------|
| **Title Number** | Unique land registry title - links to other HMLR datasets |
| **Tenure** | Freehold or Leasehold |
| **Proprietor Name (1-4)** | Company/corporate body name (up to 4 proprietors) |
| **Company Registration No (1-4)** | Companies House CRN (recorded since 1997) |
| **Proprietorship Category (1-4)** | Limited Company, PLC, Local Authority, Housing Association, etc. |
| **Property Address** | County, District, Region, Postcode |
| **Date Proprietor Added** | Date the proprietor was registered (~2% blank) |
| **Additional Proprietor Indicator** | Whether there are >4 proprietors |
| **Multiple Address Indicator** | Y if addresses are in a Property Schedule |
| **Correspondence Address (1-4)** | Address for correspondence |
| **Change Indicator** | For COU files: A=Add, D=Delete |
| **Price Paid** | Based on latest application (not all titles have this) |

#### Data Quality Caveats
- **~2% of post-1997 LTD/PLC titles have no Company Registration Number** due to data entry errors
- HM Land Registry **does NOT validate** Company Registration Numbers
- Typographic errors exist in CRNs
- Pre-1997 registrations rarely have CRNs
- Email addresses and BFPO addresses are removed from correspondence addresses
- **Exclusions**: Private individuals, overseas companies (see OCOD), and charities

---

### 1C. OCOD - Overseas Companies That Own Property in England and Wales

*Formerly called "Overseas Companies Ownership Data"*

| Attribute | Details |
|-----------|---------|
| **URL (Download)** | https://use-land-property-data.service.gov.uk/datasets/ocod |
| **Tech Spec** | https://use-land-property-data.service.gov.uk/datasets/ocod/tech-spec |
| **Cost** | FREE |
| **Authentication** | Requires free account registration |
| **Data Format** | CSV (same format as CCOD) |
| **Update Frequency** | Monthly (2nd working day) |
| **Records** | ~100,000 rows |

#### Key Differences from CCOD

| Feature | CCOD (UK Companies) | OCOD (Overseas) |
|---------|---------------------|------------------|
| Scope | UK-incorporated companies | Companies incorporated outside UK |
| Company Reg No | Companies House CRN | N/A (different jurisdictions) |
| Country of Incorporation | Not included (all UK) | Included (recorded since 1997, routinely since Jan 1999) |
| State/Province | N/A | Included where relevant |
| Price Paid | Included where available | Included where available |

#### OCOD-Specific Fields
- **Country Incorporated (1-4)** - Country and optionally state/province
- **Registered on** date (vs "Date Proprietor Added" in CCOD)

### 1D. What About "UKOD"?

**"UKOD" is NOT an official HM Land Registry term.** The dataset that some people informally call "UKOD" is actually the **CCOD dataset**, which was renamed to "UK companies that own property in England and Wales." There are only two corporate ownership datasets:
- **CCOD** = UK companies
- **OCOD** = Overseas companies

### 1E. Other HMLR Datasets

| Dataset | URL | Details |
|---------|-----|---------|
| **Title Number & UPRN Lookup** | https://use-land-property-data.service.gov.uk/datasets/nps/tech-spec/2 | Links title numbers to Unique Property Reference Numbers |
| **Title Descriptor** | https://use-land-property-data.service.gov.uk/datasets/nps/tech-spec/3 | Property class and tenure info |
| **HMLR Open Data Portal** | https://landregistry.data.gov.uk/ | SPARQL/Linked Data endpoints |
| **HMLR API Catalogue** | https://www.api.gov.uk/hmlr/ | 13 APIs available |

---

## 2. Companies House

### 2A. REST API (Public Data)

| Attribute | Details |
|-----------|---------|
| **Base URL** | `https://api.company-information.service.gov.uk/` |
| **Documentation** | https://developer-specs.company-information.service.gov.uk/ |
| **Get API Key** | https://developer.company-information.service.gov.uk/manage-applications |
| **Cost** | FREE |
| **Authentication** | HTTP Basic Auth (API key as username, password blank/colon) |
| **Rate Limit** | **600 requests per 5 minutes** (~2/second) |
| **Data Format** | JSON |
| **Rate Limit Increase** | Can be requested but not guaranteed |

#### Authentication Example
```
Authorization: Basic {base64(api_key + ":")}
```
```bash
curl -XGET -u YOUR_API_KEY: https://api.company-information.service.gov.uk/company/00000006
```

#### Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /company/{company_number}` | Company profile (name, status, registered address, SIC codes, accounts info) |
| `GET /company/{company_number}/officers` | List all officers (directors, secretaries) |
| `GET /company/{company_number}/persons-with-significant-control` | List all PSCs |
| `GET /company/{company_number}/filing-history` | Filing history |
| `GET /company/{company_number}/charges` | Charges/mortgages |
| `GET /company/{company_number}/insolvency` | Insolvency information |
| `GET /search/companies?q={query}` | Search companies by name |
| `GET /search/officers?q={query}` | Search officers by name |
| `GET /officers/{officer_id}/appointments` | All appointments for an officer |

#### Company Profile Fields
- Company name, number, status, date of creation
- Registered office address (full address)
- SIC codes (industry classification)
- Company type (ltd, plc, llp, etc.)
- Accounts next due, last made up to, type
- Confirmation statement next due, last made up to
- Has been liquidated, has insolvency history, has charges
- Previous company names

#### Officers Data Fields
- Name, officer role (director, secretary, etc.)
- Appointed on / Resigned on dates
- Nationality, occupation, country of residence
- Date of birth (month and year only - day is redacted)
- Correspondence address (this is the "service address", NOT home address)
- Officer ID (links to appointments endpoint)

#### PSC (Persons with Significant Control) Data Fields
- Name (and name elements: forename, middle_name, surname, title)
- Date of birth (month and year only)
- Nationality, country of residence
- Address (service address, NOT home address)
- Natures of control (e.g., "ownership-of-shares-75-to-100-percent")
- Notified on date, ceased on date
- Kind (individual-person, corporate-entity, legal-person, etc.)
- Is sanctioned flag
- For corporate PSCs: identification (registration number, legal authority, legal form, country registered)

**Important**: Companies House does NOT hold or provide:
- Personal email addresses
- Mobile/phone numbers
- Home addresses (only service addresses shown publicly)
- Domain names or website URLs

### 2B. Streaming API (Real-Time)

| Attribute | Details |
|-----------|---------|
| **Base URL** | `https://stream.companieshouse.gov.uk` |
| **Documentation** | https://developer-specs.company-information.service.gov.uk/streaming-api/guides/overview |
| **Cost** | FREE |
| **Authentication** | Separate streaming API key (different from REST API key) |
| **Data Format** | JSON (line-delimited, long-running HTTP connection) |

#### Available Streams
| Path | Description |
|------|-------------|
| `/companies` | Company profile changes |
| `/filings` | New filings |
| `/officers` | Officer appointments/resignations |
| `/persons-with-significant-control` | PSC changes |
| `/charges` | New/updated charges |
| `/insolvency-cases` | Insolvency updates |
| `/disqualified-officers` | Disqualification changes |

**Use case**: Keep a local database in sync with real-time changes after importing a bulk snapshot.

### 2C. Bulk Data Downloads (Free)

| Product | Format | Frequency | URL |
|---------|--------|-----------|-----|
| **Free Company Data** | CSV (ZIP) | Monthly | https://download.companieshouse.gov.uk/en_output.html |
| **PSC Snapshot** | JSON (ZIP, ~1GB zipped, ~6GB unzipped, ~10M records) | Daily (before 10am) | https://download.companieshouse.gov.uk/en_pscdata.html |
| **Accounts Data** | XBRL (ZIP) | Daily | https://download.companieshouse.gov.uk/en_accountsdata.html |
| **Officers Data** | Via FTP (request from CH) | Varies | Contact Companies House customer care |

#### Free Company Data CSV Fields
- Company name, number, status
- Company type, registered address
- SIC codes, date of incorporation
- Accounts: category, next due date, last made up date
- Confirmation statement: next due date, last made up date
- Previous names (up to 10)

### 2D. 2025-2026 Identity Verification Changes

From **18 November 2025**, all directors and PSCs must verify their identity with Companies House. Existing directors/PSCs have until **18 November 2026** (or their next confirmation statement, whichever is sooner). This will significantly improve data quality on the register.

---

## 3. EPC Register (Energy Performance Certificates)

### 3A. Non-Domestic (Commercial) API

| Attribute | Details |
|-----------|---------|
| **Portal** | https://epc.opendatacommunities.org/ |
| **API Documentation** | https://epc.opendatacommunities.org/docs/api/non-domestic |
| **API Base URL** | `https://epc.opendatacommunities.org/api/v1/non-domestic/` |
| **CSVW Schemas** | https://epc.opendatacommunities.org/docs/csvw |
| **Glossary** | https://epc.opendatacommunities.org/docs/guidance |
| **Cost** | FREE |
| **Authentication** | HTTP Basic Auth (email + API key, base64 encoded) |
| **Registration** | Free account at epc.opendatacommunities.org |
| **Data Format** | CSV or JSON (specify via Accept header) |
| **Update Frequency** | Monthly (latest: 30 January 2026, data through December 2025) |
| **Historical Data** | From 1 October 2008 |
| **Bulk Download** | Available (~5.6GB for all certificates) |
| **Page Size** | Default 25, max 5,000 per request |

#### Authentication Example
```bash
curl -X GET \
  -H "Accept: text/csv" \
  -H "Authorization: Basic {base64(email:api_key)}" \
  "https://epc.opendatacommunities.org/api/v1/non-domestic/search"
```

#### Key Non-Domestic EPC Endpoints
| Endpoint | Description |
|----------|-------------|
| `/api/v1/non-domestic/search` | Search with filters |
| `/api/v1/non-domestic/certificate/{lmk-key}` | Get specific certificate |
| `/api/v1/non-domestic/recommendations/{lmk-key}` | Get recommendations for a certificate |

#### Key Non-Domestic EPC Fields

| Field | Description |
|-------|-------------|
| **LMK_KEY** | Unique lodgement identifier |
| **BUILDING_REFERENCE_NUMBER** | Unique property identifier |
| **ADDRESS1, ADDRESS2, ADDRESS3** | Property address |
| **POSTCODE, POSTTOWN** | Postcode and town |
| **UPRN** | Unique Property Reference Number (links to other datasets) |
| **ASSET_RATING** | Numerical energy performance rating |
| **ASSET_RATING_BAND** | A+ to G grade |
| **PROPERTY_TYPE** | Based on planning use class |
| **FLOOR_AREA** | Total useful floor area (m2) |
| **TRANSACTION_TYPE** | What triggered the EPC (sale, let, construction, etc.) |
| **LODGEMENT_DATE** | Date lodged on the register |
| **INSPECTION_DATE** | Date of actual inspection |
| **LOCAL_AUTHORITY** | ONS code for local authority |
| **CONSTITUENCY** | Parliamentary constituency |
| **PRIMARY_ENERGY_VALUE** | kWh/m2 per year |
| **CO2_EMISSIONS** | CO2 emissions data |
| **REPORT_TYPE** | Assessment type (e.g., 102 = SBEM tool) |
| **UPRN_SOURCE** | "Energy Assessor" or "Address Matched" |

#### Filter Parameters
You can filter by: `postcode`, `local-authority`, `constituency`, `floor-area`, `from-month`, `from-year`, `to-month`, `to-year`, `energy-band`, and more. Filters combine as AND; multiple values for same filter combine as OR.

#### Why EPC Data is Valuable for Commercial Property
- **Floor area** is included (not available in CCOD or PPD)
- **Transaction type** tells you if it was triggered by a sale or let
- **UPRN** links to Land Registry and other datasets
- **Property type** based on planning use class gives better commercial classification
- Available for ALL buildings that have been sold, let, or constructed since 2008

### 3B. Python Client
```
pip install epc-api-python
```
Supports `client.non_domestic.search()`, `client.non_domestic.certificate()`, and `client.non_domestic.recommendations()`.

---

## 4. VOA (Valuation Office Agency)

### 4A. Rating List Bulk Downloads

| Attribute | Details |
|-----------|---------|
| **Download Page** | https://voaratinglists.blob.core.windows.net/html/rlidata.htm |
| **Data Specification** | https://voaratinglists.blob.core.windows.net/html/documents/Compiled%20Rating%20List%20and%20Summary%20Valuation%20Data%20Specification.pdf |
| **Cost** | FREE (but restricted licence - not OGL) |
| **Authentication** | None for downloads |
| **Data Format** | CSV (asterisk-delimited, NOT comma-delimited) |
| **Lists Available** | 2026 (draft), 2023 (current live), 2017, 2010 |
| **Updates** | Weekly change update schedules |
| **Commercial Use** | Restricted - check licence terms |

#### Key Data Fields

| Field | Description |
|-------|-------------|
| **BA Reference Number** | Billing Authority unique property reference |
| **UARN** | VOA Unique Address Reference Number |
| **Rateable Value** | Annual rental value (GBP) |
| **Primary Description Code** | Generic property use classification |
| **SCat Code** | Specific category code (detailed property use) |
| **Property Address** | Full address details |
| **Postcode** | Property postcode |
| **List Year** | Which rating list |
| **From Date / To Date** | When the record became/ceased current |
| **Floor Level Description** | Ground, first, mezzanine, etc. |
| **Accommodation Description** | Showroom, office, workshop, etc. |
| **Area** | Floor area for each space type |
| **Measuring Standard** | GIA (Gross Internal Area) or NIA (Net Internal Area) |

#### Important Notes
- Files use **asterisk** delimiters, not commas (despite .csv extension)
- Excel cannot handle the file sizes - use Access, Python, or similar
- Column headers are NOT included - must reference the specification PDF
- Contains Summary Valuation Data (SMV) with 7 record types showing how rateable value was calculated
- 2026 revaluation takes effect 1 April 2026 (based on 1 April 2024 rental values)

### 4B. Business Rates API (via HMRC)

| Attribute | Details |
|-----------|---------|
| **API Documentation** | https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/business-rates-api/2.0 |
| **API Catalogue** | https://www.api.gov.uk/hmrc/business-rates/ |
| **Cost** | FREE |
| **Authentication** | Registration with VOA required first |
| **Data Format** | JSON |
| **Sandbox** | Available with ~115,000 test properties |

### 4C. Find a Property (Online Search)

| Attribute | Details |
|-----------|---------|
| **URL** | https://www.tax.service.gov.uk/business-rates-find/search |
| **Cost** | FREE |
| **Authentication** | None |

### Why VOA Data is Valuable
- Covers ALL non-domestic rated properties (2+ million in England & Wales)
- Rateable value indicates property value/size
- SCat codes give precise property use classification
- Floor area data included in summary valuations
- Can identify all commercial properties in an area regardless of sale status

---

## 5. Planning Applications

### 5A. Planning Data (planning.data.gov.uk) - England

| Attribute | Details |
|-----------|---------|
| **URL** | https://www.planning.data.gov.uk/ |
| **API Docs** | https://www.planning.data.gov.uk/docs |
| **Cost** | FREE |
| **Authentication** | None |
| **Data Format** | JSON (OpenAPI spec available) |
| **Coverage** | England |
| **Licence** | Open source |
| **Status** | Planning application dataset is incomplete/under development |

### 5B. Planning London Datahub

| Attribute | Details |
|-----------|---------|
| **URL** | https://planninglondondatahub.london.gov.uk/ |
| **Cost** | FREE |
| **Authentication** | Guest access for read-only API |
| **Data Format** | JSON (Elasticsearch-based) |
| **Coverage** | All London Planning Authorities |
| **Update Frequency** | Daily |

### 5C. data.gov.uk

| Attribute | Details |
|-----------|---------|
| **URL** | https://www.data.gov.uk/ |
| **API Base URL** | `https://data.gov.uk/api/action/` |
| **Cost** | FREE |
| **Data Format** | Various (JSON API) |
| **Coverage** | UK-wide (aggregated from councils) |

### 5D. Planning API (api.planning.org.uk)

| Attribute | Details |
|-----------|---------|
| **URL** | https://api.planning.org.uk/ |
| **Cost** | FREE for search; credits required for full data returns |
| **Coverage** | UK-wide |

### Why Planning Data is Useful
- Identifies properties undergoing change of use, development, or refurbishment
- Can signal upcoming property sales or development opportunities
- Commercial planning applications indicate business activity
- Building control data shows construction completion dates

---

## 6. Other Free Sources

### 6A. OpenCorporates

| Attribute | Details |
|-----------|---------|
| **API URL** | https://api.opencorporates.com/ |
| **API Version** | v0.4 |
| **Cost** | FREE for open data projects; 500 requests/month without API key |
| **Authentication** | API token as query parameter |
| **Data Format** | JSON |
| **Coverage** | 145 jurisdictions worldwide |
| **Bulk Data** | Requires commercial licence |

Useful for: Cross-checking company data, finding companies across jurisdictions, reconciliation with Open Refine.

### 6B. Charity Commission (for charity-owned property)

| Attribute | Details |
|-----------|---------|
| **URL** | https://register-of-charities.charitycommission.gov.uk/ |
| **API** | Available |
| **Cost** | FREE |

### 6C. Insolvency Service

| Attribute | Details |
|-----------|---------|
| **URL** | https://www.insolvencydirect.bis.gov.uk/ |
| **Cost** | FREE |

### 6D. Food Standards Agency (for commercial premises)

| Attribute | Details |
|-----------|---------|
| **URL** | https://ratings.food.gov.uk/ |
| **API** | https://api.ratings.food.gov.uk/ |
| **Cost** | FREE |
| **Use** | Identifies commercial premises (restaurants, shops, etc.) with addresses |

### 6E. Ordnance Survey Open Data

| Attribute | Details |
|-----------|---------|
| **URL** | https://osdatahub.os.uk/ |
| **Cost** | FREE tier available (OS OpenData) |
| **Use** | Address matching, UPRN lookups, mapping |

---

## 7. Cross-Referencing Guide

### 7A. Linking Land Registry to Companies House

The **CCOD dataset is the primary bridge** between Land Registry and Companies House:

```
CCOD.Company_Registration_Number  -->  Companies House API /company/{CRN}
CCOD.Title_Number  -->  Other HMLR datasets
```

**Process:**
1. Download CCOD (monthly CSV)
2. Extract Company Registration Numbers
3. Query Companies House API for each CRN to get:
   - Company profile (registered address, SIC codes, status)
   - Officers/directors (names, service addresses, dates of birth)
   - PSCs (beneficial owners, natures of control)
   - Filing history (accounts, annual returns)

**Data Quality Issues:**
- ~2% of post-1997 entries have no CRN
- Typographic errors in CRNs
- CRN may map to a renamed company
- HMLR does NOT validate CRNs
- Pre-1997 registrations rarely have CRNs

### 7B. Linking Across All Datasets

```
CCOD (Title Number + CRN)
  |
  +--> Land Registry PPD (match by postcode + address for price)
  +--> Companies House API (CRN -> officers, PSCs, accounts)
  +--> EPC Register (match by UPRN or postcode + address for floor area, energy data)
  +--> VOA (match by postcode + address for rateable value, property classification)
  +--> Planning Data (match by postcode/address for development activity)
```

**Key linking fields:**
- **Title Number** - unique across HMLR datasets
- **Company Registration Number** - links CCOD to Companies House
- **UPRN** - links EPC, HMLR Title-UPRN lookup, and Ordnance Survey
- **Postcode + Address** - fuzzy matching fallback across all datasets

### 7C. Filtering for Commercial Properties Over GBP 1M

**Strategy:**
1. **Start with CCOD** - all corporate-owned properties
2. **Cross-reference with PPD** - filter Price >= 1,000,000 where Property Type = "O"
3. **Supplement with VOA** - rateable value can indicate high-value commercial properties
4. **Add EPC data** - floor area and transaction type confirm commercial use
5. **Use Companies House** - get owner details, directors, PSCs

**Note on PPD limitations for commercial:**
- Many commercial transactions don't appear in PPD (VAT-inclusive excluded)
- The "O" property type captures commercial but is not exhaustive
- For the most comprehensive commercial property database, CCOD is your primary source
- Price information is available in both PPD and CCOD (though not all CCOD entries have prices)

---

## 8. Contact Details & Legal Considerations

### 8A. What Contact Information is Freely Available?

| Source | Available | NOT Available |
|--------|-----------|---------------|
| **Companies House** | Director names, service addresses, nationality, occupation, DOB (month/year), officer ID | Personal email, mobile/phone, home address |
| **CCOD** | Company name, correspondence address, CRN | Director details, email, phone |
| **Companies House PSC** | PSC name, service address, nationality, DOB (month/year), natures of control | Personal email, mobile/phone, home address |
| **EPC Register** | Property address, assessor details | Owner contact details |
| **VOA** | Property address, occupier (in some cases) | Owner contact details |

### 8B. Free Business Directory APIs

| Service | Free Tier? | API? | Data |
|---------|-----------|------|------|
| **Companies House** | Yes (fully free) | Yes | Directors, registered address, filings |
| **OpenCorporates** | 500 req/month | Yes | Company data from 145 jurisdictions |
| **Endole** | No (paid API) | Yes | Directors, telephone, email, credit scores |
| **192.com** | Limited free search | No API | Director lookups, ceased companies |
| **Global Database** | Limited free | Yes | Email, phone, key employees |
| **Google Business Profile** | Free search | Google Places API | Business phone, website, hours |
| **Yell.com** | Free search | No public API | Business phone, address |
| **UK Phone Book** | Free search | No | Business telephone numbers |
| **Freeindex** | Free search | No | Business contact details |

### 8C. Can You Get Mobile Numbers or Personal Emails of Directors?

**No free government source provides personal mobile numbers or email addresses of company directors.**

The legal position:
- Director personal contact details (mobile, personal email) are **personal data under UK GDPR**
- Companies House does not hold email addresses or phone numbers
- **Generating speculative email addresses** from public data (e.g., combining director name with company domain) is **illegal under GDPR and PECR** without consent
- Buying contact lists is high-risk and requires due diligence on consent

**What you CAN legally do:**
1. Use the **registered office address** from Companies House for official correspondence
2. Use the **correspondence address** from CCOD for property-related correspondence
3. Look up company **websites** via Google/Bing and use the published contact forms
4. Use **LinkedIn** for professional outreach (subject to LinkedIn ToS)
5. Use the **legitimate interest** basis under GDPR for B2B marketing (but must offer opt-out)
6. **Google Business Profile** / **Yell** may have published business phone numbers

**Penalties for GDPR non-compliance:** Up to GBP 17.5 million or 4% of annual global turnover.

---

## 9. Data Pipeline Architecture

### Recommended Approach for Finding Recently Sold Commercial Properties Over GBP 1M

```
Step 1: CCOD Monthly Download
   Filter: All corporate-owned properties
   Extract: Title Number, CRN, Property Address, Price Paid, Tenure

Step 2: Cross-reference with PPD
   Match: Postcode + Address (fuzzy matching)
   Filter: Price >= 1,000,000 AND recent Date of Transfer
   Extract: Exact sale price, date of transfer

Step 3: Enrich with Companies House API
   Input: CRN from CCOD
   GET /company/{CRN} -> company profile, SIC codes
   GET /company/{CRN}/officers -> directors (names, service addresses)
   GET /company/{CRN}/persons-with-significant-control -> beneficial owners
   Rate limit: 600 requests per 5 minutes

Step 4: Add EPC Data
   Match: UPRN or Postcode + Address
   Extract: Floor area, property type, energy rating, transaction date

Step 5: Add VOA Data
   Match: Postcode + Address
   Extract: Rateable value, property classification, SCat code

Step 6: Contact Enrichment (Optional, with GDPR compliance)
   - Look up registered office website via SIC code / Google
   - Find published business contact details
   - Use LinkedIn for director profiles
```

### Summary of All URLs

| Source | URL |
|--------|-----|
| HMLR Price Paid Data | https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads |
| HMLR PPD API | https://landregistry.data.gov.uk/app/ppd/ |
| HMLR CCOD Download | https://use-land-property-data.service.gov.uk/datasets/ccod |
| HMLR OCOD Download | https://use-land-property-data.service.gov.uk/datasets/ocod |
| HMLR API Catalogue | https://www.api.gov.uk/hmlr/ |
| Companies House API | https://api.company-information.service.gov.uk/ |
| Companies House API Key | https://developer.company-information.service.gov.uk/manage-applications |
| Companies House API Docs | https://developer-specs.company-information.service.gov.uk/ |
| Companies House Streaming | https://stream.companieshouse.gov.uk |
| Companies House Bulk Data | https://download.companieshouse.gov.uk/en_output.html |
| Companies House PSC Data | https://download.companieshouse.gov.uk/en_pscdata.html |
| EPC Register Portal | https://epc.opendatacommunities.org/ |
| EPC Non-Domestic API | https://epc.opendatacommunities.org/api/v1/non-domestic/search |
| EPC API Docs | https://epc.opendatacommunities.org/docs/api/non-domestic |
| VOA Rating List Downloads | https://voaratinglists.blob.core.windows.net/html/rlidata.htm |
| VOA Business Rates API | https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/business-rates-api/2.0 |
| VOA Find a Property | https://www.tax.service.gov.uk/business-rates-find/search |
| Planning Data (England) | https://www.planning.data.gov.uk/ |
| Planning London Datahub | https://planninglondondatahub.london.gov.uk/ |
| data.gov.uk | https://www.data.gov.uk/ |
| OpenCorporates API | https://api.opencorporates.com/ |
