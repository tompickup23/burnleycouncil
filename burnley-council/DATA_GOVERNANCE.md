# AI DOGE — Data Governance Framework

> Version 2.0 · February 2026
> Covers all Lancashire borough/district councils

---

## 1. Data Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    DATA FLOW PIPELINE                        │
│                                                              │
│  [Council Websites]  [GOV.UK]  [Police API]  [Companies House]
│         │               │           │              │         │
│         ▼               ▼           ▼              ▼         │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  THURINUS VPS (Ingestion Layer)                      │    │
│  │  council_etl.py --download --council <id>            │    │
│  │  govuk_budgets.py · police_etl.py · ch_cron.sh      │    │
│  └──────────────────────────────────────────────────────┘    │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  DATA LAYER (per council)                            │    │
│  │  spending.json · metadata.json · insights.json       │    │
│  │  supplier_profiles.json · cross_council.json         │    │
│  │  budgets_govuk.json · crime_stats.json               │    │
│  └──────────────────────────────────────────────────────┘    │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  VALIDATION LAYER                                    │    │
│  │  validate_data.py — schema checks, quality scores    │    │
│  │  data_quality_report.json per council                │    │
│  └──────────────────────────────────────────────────────┘    │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  SPA BUILD (build_council.sh)                        │    │
│  │  Vite → GitHub Pages → aidoge.co.uk                  │    │
│  └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Council Registry

### Currently Active

| Council | ONS Code | Threshold | Data Start | Download Method |
|---------|----------|-----------|------------|-----------------|
| Burnley | E07000117 | £500 | 2021/22 | Retrofit (JSON) |
| Hyndburn | E07000120 | £250 | 2016/17 | Web scrape |
| Pendle | E07000122 | £500 | 2021/22 | Direct CSV URL |
| Rossendale | E07000125 | £500 | 2021/22 | Direct CSV URL |

### Lancashire Expansion Targets

| Council | ONS Code | Threshold | Download Method | Status |
|---------|----------|-----------|-----------------|--------|
| Ribble Valley | E07000124 | £500 | Direct CSV URL | Planned |
| Lancaster | E07000121 | £500 | Transparency page | Planned |
| Chorley | E07000118 | £500 | Shared services | Planned |
| South Ribble | E07000126 | £500 | Shared services | Planned |
| West Lancashire | E07000127 | £500 | Direct CSV URL | Planned |
| Wyre | E07000128 | £500 | LGA format CSV | Planned |
| Fylde | E07000119 | £500 | Direct CSV URL | Planned |
| Preston | E07000123 | £500 | Transparency page | Planned |

---

## 3. Universal Spending Record Schema

Every council's CSV data is normalised to this universal schema. Fields marked
**required** must be non-null for a record to pass validation; **optional** fields
may be null and vary by council.

### Core Fields (Required)

| Field | Type | Validation | Notes |
|-------|------|------------|-------|
| `date` | string\|null | ISO 8601 `YYYY-MM-DD` | Null only if `financial_year` present |
| `financial_year` | string | `YYYY/YY` pattern | Derived from `date` |
| `supplier` | string | Non-empty, min 2 chars | Normalised supplier name |
| `amount` | number | Non-zero | GBP. Negative = credit/reversal |
| `council` | string | Must match registry | Council identifier |

### Standard Fields (Expected)

| Field | Type | Notes |
|-------|------|-------|
| `quarter` | string\|null | Q1-Q4 (financial year quarters) |
| `month` | integer\|null | 1-12 |
| `supplier_canonical` | string\|null | From taxonomy mapping |
| `department_raw` | string\|null | As published by council |
| `department` | string\|null | Normalised via taxonomy |
| `service_area_raw` | string\|null | As published |
| `service_area` | string\|null | Normalised |
| `description` | string\|null | Transaction description |
| `reference` | string\|null | Invoice/PO reference |
| `type` | string | `spend`, `purchase_card`, `contract` |
| `capital_revenue` | string\|null | `Capital`, `Revenue`, or null |
| `expenditure_category` | string\|null | ETL-assigned category |

### Companies House Fields (Post-Enrichment)

| Field | Type | Notes |
|-------|------|-------|
| `supplier_company_number` | string\|null | CH reg number |
| `supplier_company_url` | string\|null | CH profile URL |
| `supplier_compliance_flags` | array\|null | Active violations |
| `supplier_violation_count` | integer\|null | Count of violations |

### Council-Specific Fields (Optional)

| Field | Source | Notes |
|-------|--------|-------|
| `supplier_ref` | Pendle | Internal supplier code |
| `cipfa_code` | Pendle | CIPFA classification |
| `charity_number` | Pendle | Charity Commission number |
| `irrecoverable_vat` | Pendle | VAT flag |
| `is_vcse_grant` | Pendle | Voluntary sector grant |
| `service_division` | Hyndburn | Service division |
| `cipfa_type` | Burnley | CIPFA type code |
| `is_covid_related` | Burnley | COVID flag |

### Design Principle

> **Superset schema**: every field from any Lancashire council CSV is mapped
> into the universal schema. Unknown fields are stored in `_extra` (dict) and
> preserved but not validated. New councils may add new optional fields without
> breaking existing consumers.

---

## 4. Supplier Profile Schema

Each supplier that receives payments from any council gets a profile in
`supplier_profiles.json`. This powers the Supplier Deep Dive pages.

```
supplier_profiles.json
├── generated          — ISO datetime of generation
├── total_suppliers    — count of profiled suppliers
├── profiles[]         — array of SupplierProfile objects
│   ├── id             — URL-safe slug (e.g., "liberata-uk-ltd")
│   ├── name           — Display name
│   ├── canonical      — Normalised canonical name
│   ├── aliases[]      — All known name variants
│   │
│   ├── companies_house (nullable)
│   │   ├── company_number
│   │   ├── legal_name
│   │   ├── status       — active/dissolved/liquidation etc.
│   │   ├── company_type — ltd/plc/llp etc.
│   │   ├── sic_codes[]
│   │   ├── incorporated — date
│   │   ├── address      — registered office
│   │   └── url          — CH profile link
│   │
│   ├── spending
│   │   ├── total_all_councils   — £ total across all councils
│   │   ├── transaction_count
│   │   ├── avg_payment
│   │   ├── max_payment
│   │   ├── first_payment_date
│   │   ├── last_payment_date
│   │   ├── by_council[]         — { council, total, count, years[] }
│   │   ├── by_year{}            — { "2024/25": amount }
│   │   ├── by_quarter{}         — { "Q1": amount, ... }
│   │   └── by_department[]      — { department, total, count }
│   │
│   ├── compliance (nullable)
│   │   ├── risk_level     — clean/low/medium/high/critical
│   │   ├── violations[]   — active CH violations
│   │   ├── filing_status
│   │   │   ├── accounts_overdue     — bool
│   │   │   ├── accounts_days_late   — int|null
│   │   │   └── confirmation_overdue — bool
│   │   ├── insolvency_history       — bool
│   │   └── address_flags
│   │       ├── undeliverable — bool
│   │       └── in_dispute    — bool
│   │
│   ├── governance (nullable)
│   │   ├── directors[]    — { name, role, appointed, resigned }
│   │   └── pscs[]         — { name, kind, sanctioned }
│   │
│   └── metadata
│       ├── profile_created
│       ├── last_updated
│       └── data_quality    — 0.0-1.0 completeness score
```

---

## 5. Data Quality Rules

### 5.1 Validation Levels

| Level | Action | Example |
|-------|--------|---------|
| **ERROR** | Record rejected | Missing supplier, zero amount |
| **WARNING** | Record kept, flagged | Future date, null department |
| **INFO** | Logged only | Missing description (some councils never provide) |

### 5.2 Record-Level Checks

| Check | Level | Rule |
|-------|-------|------|
| Supplier present | ERROR | `supplier` non-empty, ≥2 chars |
| Amount non-zero | ERROR | `amount != 0` |
| Date parseable | WARNING | Valid ISO date or null with FY |
| Date not future | WARNING | `date <= today + 90 days` |
| Date reasonable | WARNING | `date >= 2010-01-01` |
| Financial year valid | WARNING | Matches `YYYY/YY` pattern |
| FY matches date | WARNING | Date falls within stated FY |
| Department present | INFO | Non-empty (Burnley often blank) |
| Description present | INFO | Non-empty |
| Reference present | INFO | Non-empty |
| Amount reasonable | WARNING | `abs(amount) < £50,000,000` |

### 5.3 Dataset-Level Checks

| Check | Level | Threshold |
|-------|-------|-----------|
| Date completeness | WARNING | < 95% of records have dates |
| Department completeness | INFO | < 80% have departments |
| Duplicate rate | WARNING | > 5% same-day same-supplier same-amount |
| Supplier concentration | INFO | Top 10 suppliers > 70% of spend |
| Record count stability | WARNING | > 30% change vs previous run |
| Total spend stability | WARNING | > 25% change vs previous run |

### 5.4 Cross-Council Checks

| Check | Level | Rule |
|-------|-------|------|
| Config–metadata consistency | WARNING | Record counts, total spend within 2% |
| Schema consistency | INFO | All councils share core fields |
| Supplier name consistency | INFO | Same company different names across councils |

---

## 6. Data Quality Scoring

Each council receives a Data Quality Score (0–100) computed as:

```
DQS = (
    date_completeness     × 25 +   # % records with valid date
    supplier_completeness × 25 +   # % records with non-empty supplier
    department_coverage   × 15 +   # % records with department
    description_coverage  × 10 +   # % records with description
    reference_coverage    × 10 +   # % records with reference
    ch_match_rate         × 10 +   # % suppliers matched to Companies House
    consistency_score     × 5      # config vs metadata agreement
)
```

| Score | Rating | Interpretation |
|-------|--------|----------------|
| 90-100 | Excellent | Publication-ready, high confidence |
| 75-89 | Good | Minor gaps, suitable for analysis |
| 60-74 | Adequate | Usable with caveats noted |
| 40-59 | Poor | Significant gaps, use with caution |
| 0-39 | Critical | Data quality prevents reliable analysis |

---

## 7. File Inventory per Council

### Required Files

| File | Generator | Purpose |
|------|-----------|---------|
| `config.json` | Manual / ETL | Council identity, feature flags |
| `spending.json` | council_etl.py | Normalised transaction records |
| `metadata.json` | council_etl.py | Dataset statistics, date ranges |
| `insights.json` | council_etl.py | Supplier analysis, efficiency flags |

### Generated Files

| File | Generator | Purpose |
|------|-----------|---------|
| `supplier_profiles.json` | generate_supplier_profiles.py | Supplier deep dive data |
| `cross_council.json` | generate_cross_council.py | Cross-council comparison |
| `data_quality_report.json` | validate_data.py | Quality scores and issues |
| `budgets_govuk.json` | govuk_budgets.py | MHCLG budget data |
| `budgets_summary.json` | govuk_budgets.py | Budget highlights |
| `revenue_trends.json` | govuk_trends.py | Revenue time series |
| `crime_stats.json` | police_etl.py | Police crime data |
| `pay_comparison.json` | Manual | Executive pay data |

### Political Data (Optional)

| File | Generator | Purpose |
|------|-----------|---------|
| `councillors.json` | process_councillors.py | Councillor profiles |
| `wards.json` | process_councillors.py | Ward boundaries |
| `politics_summary.json` | process_councillors.py | Political composition |

### Content Files (Optional)

| File | Generator | Purpose |
|------|-----------|---------|
| `articles-index.json` | mega_article_writer.py | Article listing |
| `articles/*.json` | mega_article_writer.py | Individual articles |
| `doge_findings.json` | doge_analysis.py | Investigation findings |
| `doge_knowledge.json` | Manual | DOGE knowledge base |
| `foi_templates.json` | Manual | FOI request templates |
| `meetings.json` | Manual / scraper | Meeting records |

---

## 8. Lancashire Batch Processing

### All-Council Orchestrator

The `run_all_lancashire.sh` script processes every registered council:

```bash
./scripts/run_all_lancashire.sh [--download] [--companies-house] [--build]
```

**Pipeline per council:**
1. Download CSVs (if `--download` and council has download URL)
2. Parse and normalise to universal schema
3. Apply taxonomy mappings
4. Compute metadata and insights
5. Generate supplier profiles
6. Run data quality validation
7. Build SPA (if `--build`)

**Designed for Thurinus VPS:**
- All downloads and API calls run on Thurinus (free, always-on)
- Companies House API rate limited to 600 requests / 5 minutes
- 10-second pause between councils
- Logs to `~/aidoge/logs/lancashire_YYYY-MM-DD.log`
- Zero cost (no LLM credits used for ETL)

### Adding a New Council

1. Add entry to `COUNCIL_REGISTRY` in `council_etl.py`
2. Download a sample CSV and inspect columns
3. Write a `parse_<council>()` adapter function
4. Add CSV download logic (or manual CSV placement)
5. Run: `python council_etl.py --council <id> --download`
6. Validate: `python validate_data.py --council <id>`
7. Add to `run_all_lancashire.sh` COUNCILS list

---

## 9. Cron Schedule (Thurinus VPS)

| Schedule | Script | Purpose |
|----------|--------|---------|
| Daily 07:00 UTC | `data_monitor.py` | Check councils for new CSV uploads |
| 1st of month 03:00 | `ch_cron.sh` | Companies House batch matching |
| 1st of month 04:00 | `run_all_lancashire.sh` | Full ETL refresh |
| Daily 06:00 | `mega_article_writer.py` | Generate articles (uses free LLMs) |
| Monthly 04:00 | `councillor_scraper.py` | Councillor data refresh |

---

## 10. Known Data Quality Issues

### Burnley
- **100% empty descriptions** — council publishes no transaction descriptions
- **21.8% missing references** — no PO/invoice numbers for many records
- **13.2% empty expenditure_category** — uncategorised spend
- **Missing political data** — no councillors.json, wards.json, politics_summary.json
- **209 null dates** (0.68%) — records with financial year but no date

### Hyndburn
- **622 raw department codes** — inconsistent naming, mixed case, duplicates
- **Year-end spike: 12.9x** — March spending surge (worst of 4 councils)
- **Record count off by 2** — config says 29,802, metadata says 29,804
- **Supplier count off by 1** — config 2,394 vs metadata 2,395

### Pendle
- **956-record discrepancy** — config says 48,785, metadata says 49,741
- **£2M spend discrepancy** — config says £127M, metadata says £124.95M
- **1.92% negative amounts** — legitimate credits but should be documented
- **3.45% empty expenditure_category** — VAT/capital adjustments

### Rossendale
- **3,167 "NAME WITHHELD" transactions** — supplier names suppressed (safeguarding, <1% threshold considered normal)
- **No crime_stats.json** — feature flag set to false in config.json
- **6 articles published** — covering Capita outsourcing, NAME WITHHELD, agency spend, COVID grants, leisure trust, spending overview. Target: 20+

### Cross-Council
- **Schema divergence** — each council has different optional fields
- **Spending threshold inconsistency** — Hyndburn £250 vs others £500
- **Date range variation** — Hyndburn has 9 years, others have 4-5
- **Burnley theme_accent matches Pendle** — both use `#0a84ff`

---

## 11. Data Dictionary

### Spending Record Fields

| Field | Definition | Source | Example |
|-------|-----------|--------|---------|
| `date` | Payment execution date | Council CSV | `2024-03-15` |
| `financial_year` | UK FY (Apr-Mar) | Derived from date | `2023/24` |
| `quarter` | Financial quarter | Derived from date | `Q4` |
| `month` | Calendar month number | Derived from date | `3` |
| `supplier` | Normalised payee name | CSV + normalisation | `LIBERATA UK LTD` |
| `supplier_canonical` | Taxonomy-mapped name | taxonomy.json | `LIBERATA UK LIMITED` |
| `amount` | Net payment in GBP | CSV | `45000.00` |
| `department_raw` | Department as published | CSV verbatim | `RESO - Resources` |
| `department` | Mapped department name | taxonomy.json | `Resources & Finance` |
| `service_area_raw` | Service as published | CSV verbatim | `AAB - Benefits` |
| `service_area` | Mapped service name | taxonomy.json | `Benefits Administration` |
| `description` | Payment purpose | CSV | `Housing Benefit Q3 payment` |
| `reference` | Transaction reference | CSV | `INV-2024-001234` |
| `type` | Payment mechanism | ETL logic | `spend` \| `purchase_card` \| `contract` |
| `capital_revenue` | Capital vs revenue | CSV or derived | `Revenue` |
| `expenditure_category` | Spending category | ETL classification | `Housing` |
| `council` | Council identifier | ETL config | `burnley` |

### Supplier Profile Fields

| Field | Definition | Source |
|-------|-----------|--------|
| `id` | URL-safe slug | Generated from name |
| `name` | Display name | taxonomy.json |
| `canonical` | Normalised name | taxonomy.json |
| `companies_house` | CH registration data | Companies House API |
| `spending.total_all_councils` | Aggregate £ paid | Computed from spending.json |
| `spending.by_council[]` | Per-council breakdown | Computed |
| `spending.by_year{}` | Annual trend | Computed |
| `compliance.risk_level` | Risk classification | CH violations analysis |
| `compliance.violations[]` | Active compliance issues | CH API enrichment |
| `governance.directors[]` | Company directors | CH API |

---

## 12. Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-02-08 | Initial governance framework | AI DOGE |
| 2026-02-08 | Added Lancashire expansion targets | AI DOGE |
| 2026-02-08 | Added supplier profile schema | AI DOGE |
| 2026-02-08 | Added data quality scoring system | AI DOGE |
| 2026-02-09 | Rossendale moved from Planned to Active | AI DOGE |
| 2026-02-09 | Added Rossendale data quality issues | AI DOGE |
| 2026-02-09 | Rossendale articles generated (6) — updated from empty | AI DOGE |
| 2026-02-09 | FOI templates added for all 4 councils (41 total) | AI DOGE |
| 2026-02-09 | Rebuilt and deployed all 4 councils — live site verified | AI DOGE |
| 2026-02-09 | Fixed root 404.html SPA routing for GitHub Pages | AI DOGE |
| 2026-02-09 | Added live site verification to daily audit (check_live_site) | AI DOGE |
| 2026-02-09 | Automated deployment pipeline — deploy.yml fully fixed | AI DOGE |
