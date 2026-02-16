# AI DOGE MASTER PLAN v14.0
## 16 February 2026 — Phases 1-15 Substantially Complete, All 15 Lancashire Councils Live

---

## 1. CURRENT STATE SNAPSHOT

### Platform Summary
- **15 Lancashire councils** across 3 tiers — ALL LIVE
- **2,286,000+ transactions** — £12 billion+ tracked
- **648 councillors** — full politics data for all 15
- **22 pages** — lazy-loaded with ErrorBoundary + Suspense
- **219 unit tests** (26 files) + **31 E2E tests** — all passing
- **Cost: £22/month** — LLM costs £0 (Gemini free tier)

### Live Council Sites
| Site | URL | Records | Spend | Councillors | Tier |
|------|-----|---------|-------|-------------|------|
| Burnley | aidoge.co.uk/lancashire/burnleycouncil/ | 30,580 | £355M | 45 | District |
| Hyndburn | aidoge.co.uk/lancashire/hyndburncouncil/ | 29,804 | £211M | 34 | District |
| Pendle | aidoge.co.uk/lancashire/pendlecouncil/ | 49,741 | £125M | 49 | District |
| Rossendale | aidoge.co.uk/lancashire/rossendalecouncil/ | 42,536 | £64M | 36 | District |
| Lancaster | aidoge.co.uk/lancashire/lancastercouncil/ | 32,574 | £184M | 61 | District |
| Ribble Valley | aidoge.co.uk/lancashire/ribblevalleycouncil/ | 13,723 | £38M | 40 | District |
| Chorley | aidoge.co.uk/lancashire/chorleycouncil/ | 21,421 | £365M | 42 | District |
| South Ribble | aidoge.co.uk/lancashire/southribblecouncil/ | 18,517 | £177M | 50 | District |
| Preston | aidoge.co.uk/lancashire/prestoncouncil/ | 46,711 | £205M | 48 | District |
| West Lancashire | aidoge.co.uk/lancashire/westlancashirecouncil/ | 43,063 | £333M | 45 | District |
| Wyre | aidoge.co.uk/lancashire/wyrecouncil/ | 51,092 | £678M | 50 | District |
| Fylde | aidoge.co.uk/lancashire/fyldecouncil/ | 37,514 | £155M | 37 | District |
| Lancashire CC | aidoge.co.uk/lancashire/lancashirecc/ | 753,220 | £3.6B | 84 | County |
| Blackpool | aidoge.co.uk/lancashire/blackpoolcouncil/ | 630,914 | £4.1B | 42 | Unitary |
| Blackburn | aidoge.co.uk/lancashire/blackburncouncil/ | 492,973 | £1.7B | 51 | Unitary |
| **Total** | | **2,286,332** | **£12B+** | **648** | |

### News Sites
| Site | URL | Status |
|------|-----|--------|
| News Lancashire | newslancashire.co.uk | ACTIVE — 4 crons running |
| News Burnley | newsburnley.co.uk | ACTIVE — deploy cron running |

### Autonomous Systems
| Cron | Server | Time | What |
|------|--------|------|------|
| data_monitor.py | vps-main | 07:00 | Check councils for new spending CSVs |
| auto_pipeline.py | vps-main | 08:00 | ETL + DOGE analysis + WhatsApp notify |
| article_pipeline.py | vps-main | 09:00 | AI article generation (2/council/day) |
| deploy_newslancashire.sh | vps-main | 10:00 | Hugo build + Cloudflare deploy |
| deploy_newsburnley.sh | vps-main | 10:30 | Rsync + Cloudflare deploy |
| pipeline_v4.sh | vps-news | */30 | News crawl + AI rewrite + export |
| sync_repos.sh | vps-main | 05:00 | Git pull + rsync scripts to vps-news |

### LLM Stack (£0/month)
Gemini 2.5 Flash (primary, free) → Kimi K2.5 (fallback, trial) → [Groq blocked from VPS] → [DeepSeek dead]

### Infrastructure
| Server | Provider | RAM | Cost | Purpose |
|--------|----------|-----|------|---------|
| vps-main | Hostinger | 16GB | £22/mo | Clawdbot, email, CRM, pipelines |
| vps-news | Oracle Cloud | 1GB | Free | News crawl, ETL |
| aws-1 | AWS | 1GB | Free (until Jul 2026) | Unused — cancel |
| aws-2 | AWS | 1GB | Free (until Jul 2026) | Dead — cancel |

---

## 2. PLATFORM ARCHITECTURE

### 22 Pages (all lazy-loaded with ErrorBoundary + Suspense)
| Route | Page | What It Does |
|-------|------|-------------|
| `/` | Home | Dashboard: headline stats, top findings, politics, news preview |
| `/spending` | Spending | Full transaction search/filter/sort/export via Web Worker |
| `/doge` | DogeInvestigation | Forensic analysis: duplicates, splits, CH compliance, Benford's, fraud triangle |
| `/news` | News | Article listing with search, category filter, pagination |
| `/news/:id` | ArticleView | Article reader with DOMPurify, auto-ToC, related articles |
| `/budgets` | Budgets | GOV.UK budget data, Band D comparison, service breakdown, revenue trends |
| `/procurement` | Procurement | Contracts Finder explorer: expandable rows, CPV/year/value filters |
| `/politics` | Politics | Party breakdown, councillor grid, ward info |
| `/my-area` | MyArea | Postcode → ward → councillors + crime + deprivation |
| `/pay` | PayComparison | Cross-council executive salary comparison |
| `/compare` | CrossCouncil | Cross-council spending comparison (tier-aware, common-year normalised) |
| `/suppliers` | Suppliers | Supplier directory ranked by total spend |
| `/supplier/:id` | SupplierView | Individual supplier profile, payment history |
| `/demographics` | Demographics | Census 2021 ward-level age, sex, ethnicity, religion, economic activity |
| `/lgr` | LGRTracker | LGR reorganisation proposals, AI DOGE financial model, CCN critique |
| `/lgr-calculator` | LGRCostCalculator | "What your area costs" calculator + Financial Handover Dashboard |
| `/integrity` | Integrity | 8-source councillor integrity scoring |
| `/meetings` | Meetings | Council meeting calendar, how to attend |
| `/foi` | FOI | 41 FOI request templates with copy-to-clipboard |
| `/legal` | Legal | 12 UK council oversight laws with DOGE relevance |
| `/press` | Press | Publisher info, methodology, media kit, citations |
| `/about` | About | Publisher bio, methodology, data sources |

### Data Flow
```
Council CSV  →  council_etl.py  →  spending.json (v2) + v3/v4 chunks
                                →  insights.json, metadata.json
                  doge_analysis.py  →  doge_findings.json, doge_verification.json
GOV.UK ODS  →  govuk_budgets.py  →  budgets_govuk.json, budgets_summary.json
             →  govuk_trends.py   →  revenue_trends.json
CH API       →  council_etl.py    →  supplier enrichment
Contracts Finder → procurement_etl.py → procurement.json
Police API   →  police_etl.py     →  crime_stats.json, crime_history.json
IMD 2019     →  deprivation_etl.py → deprivation.json
Census 2021  →  census_etl.py     →  demographics.json
ModernGov    →  councillors_etl.py → councillors.json, politics_summary.json, wards.json
Councillor+CH → councillor_integrity_etl.py → integrity.json, integrity_cross_council.json
Article AI   →  article_pipeline.py → articles-index.json + articles/{id}.json
Cross-council → generate_cross_council.py → cross_council.json
Budget analysis → generate_budget_insights.py → budget_insights.json, budget_efficiency.json
```

### Spending Data Versions
| Version | Format | Councils | Notes |
|---------|--------|----------|-------|
| v2 | `{meta, filterOptions, records}` | All 15 | Base format |
| v3 | spending-index.json + spending-YYYY-YY.json | 12 districts | Year-chunked, ~4-8MB each |
| v4 | spending-index.json + spending-YYYY-MM.json | LCC, Blackpool, Blackburn | Monthly-chunked, field-stripped (42-45% savings), hydrated in worker |

Worker auto-detects v4→v3→v2 and loads accordingly. V4 chunks gitignored (~647MB total). CI restores from previous deploy.

### Test Coverage
- **219 unit tests** across 26 files — all passing
- **31 E2E tests** across 5 files (smoke, news, spending, legal, navigation)
- **18 page components** with tests, 4 without (Demographics, LGRTracker, LGRCostCalculator, Integrity)

---

## 3. COMPLETED PHASES

### Phase 1: Data Credibility ✅ (10 Feb)
Confidence levels, Benford's Law reframing, cross-council caveats, CSV duplicate fix, common-year comparability.

### Phase 2: Frontend Polish ✅ (10 Feb)
Centralised constants, article search+pagination, CSS consolidation, 31 E2E tests, ChartCard accessibility.

### Phase 3: New Data Sources ✅ (10 Feb)
Procurement ETL, payment timing, councillor allowances, Charity Commission cross-check.

### Phase 4: World-Class DOGE ✅ (10 Feb)
Procurement compliance, Contract Explorer, HHI concentration, payment velocity, accountability tracking, CH fuzzy matching, RSS, newsletters.

### Phase 5: Polish & Harden ✅ (10 Feb)
UptimeRobot, v2 migration, evidence chain, reading time, VPS backup.

### Phase 6: Expand Coverage ✅ (11 Feb)
4 new councils (Lancaster, Ribble Valley, Chorley, South Ribble). Hub redesign.

### Phase 7: Public Launch Readiness ✅ (12 Feb)
PWA, OG tags, sitemap, press page, citizen reporting, article pipeline resumed.

### Phase 8: Advanced Analysis ✅ (12 Feb)
FTS scaffold, weak competition detection, late publication, deprivation overlay, fraud triangle scoring.

### Phase 9: Quality & Accessibility ✅ (11 Feb)
Keyboard nav, ARIA tabs, clipboard fallback, URL hash tabs, chart accessibility.

### Phase 10: Data Completeness ✅ (12 Feb)
Budget display fix, Chorley CIPFA parser, Lancaster date fix, crime stats, seed articles, data banners.

### Phase 11: Data Gap Fill ✅ (12 Feb)
Ribble Valley +10K txns, Chorley re-crawl, fraud triangle live, cross_council.json regenerated, Suppliers nav gated.

### Phase 12: Multi-Tier Architecture ✅ (14 Feb)
council_tier in configs, tier-aware hub, CrossCouncil tier filtering, service scope badges, deploy.yml loop, Census 2021 demographics.

### Phase 13: Lancashire CC ✅ (14 Feb)
753K txns, £3.6B. V4 monthly chunking. County council live. Spending page via monthly chunks.

### Phase 14: All 15 Councils ✅ (15 Feb)
4 districts (Preston, West Lancs, Fylde, Wyre) + 2 unitaries (Blackpool, Blackburn). All councillors_etl.py scraped. 2,286,000+ txns total.

### Phase 15: LGR & Financial Analysis ✅ (15-16 Feb)
LGR Tracker V3 (independent financial model, CCN critique, demographics, political analysis). LGR Cost Calculator. Financial Handover Dashboard. Budget-aware DOGE analysis. Councillor Integrity Checker. Academic export. Data freshness sprint. Comprehensive audit.

**Key Phase 15 deliverables:**
- LGR Tracker V3: 8-section page, 5 real proposals modelled, multi-score verdicts, CCN critique, AI DOGE alternative proposals
- LGR Cost Calculator: "What your area costs" postcode-based calculator + Financial Handover Dashboard
- Budget Enrichment: Multi-year GOV.UK integration, variance analysis, efficiency scoring, contract cross-reference for all 15 councils
- Councillor Integrity: 8-source forensic investigation for all 691 councillors
- Academic Export: Panel dataset, LGR model inputs, cross-council efficiency CSVs
- Comprehensive Audit: All architecture issues fixed, 204 tests pass, zero critical bugs

---

## 4. KNOWN ISSUES & TECHNICAL DEBT

### Data Accuracy (ongoing)
| Issue | Status | Impact |
|-------|--------|--------|
| Burnley: 100% transactions have no descriptions | Council's fault, not fixable | Limits analysis for Burnley |
| Rossendale: 3,167 NAME WITHHELD transactions | Documented as transparency flag | Genuine finding |
| Procurement value gap: 4-13% have awarded values | Contracts Finder limitation | Cannot do value analysis on most contracts |

### Code Quality
| Issue | Severity | Status |
|-------|----------|--------|
| 4 pages lack unit tests (Demographics, LGRTracker, LGRCostCalculator, Integrity) | LOW | Can add when modifying |
| Suppliers nav not gated by config flag | LOW | Page falls back gracefully |
| Unused lucide-react imports in LGRCostCalculator | INFO | Tree-shaken in production |

### Data Gaps (non-critical)
| Gap | Councils Affected | Status |
|-----|-------------------|--------|
| crime_history.json | Burnley, Hyndburn, Pendle | Needs VPS (Police API, local SSL broken) |
| doge_context empty fields | LCC, Blackpool, Blackburn, Fylde + others | key_suppliers, doge_findings, notable_suppliers not populated |
| budget_variance.json | All 15 | Never generated — script doesn't exist |
| meetings.json | 7 newer councils | Only 8 original councils have meetings data |
| Stale spending data | Chorley (Dec 2024), Ribble Valley (Apr 2024-Jan 2025) | Council hasn't published newer CSVs |

---

## 5. DATA COMPARABILITY FRAMEWORK

### The Tier Problem
- **District vs District**: Valid comparison (same services)
- **Unitary vs Unitary**: Valid comparison (all services combined)
- **District vs County/Unitary**: INVALID — different services
- **"Full Picture"**: District + LCC share ≈ unitary equivalent (for LGR modelling)

### The Time Problem
- Hyndburn: 10 years (2016-2026), £250 threshold — deepest history
- Ribble Valley: 10 months (2024-2025), £250 threshold — shallowest
- Common-year normalisation applied in cross-council comparisons

### Rules (all implemented)
1. Common year range — only overlapping years compared
2. Per-year averages — normalise by year count
3. Explicit labelling — always state comparison period
4. Threshold awareness — £250 vs £500 affects transaction count
5. Tier-aware comparison — only compare within same tier
6. Data confidence banners — warn when <5K records or year-range differences

---

## 6. LANCASHIRE THREE-TIER ARCHITECTURE

### The 15 Lancashire Councils
| Tier | Count | Councils | Services | Budget |
|------|-------|----------|----------|--------|
| **County** | 1 | Lancashire CC | Education, social care, highways, fire, libraries | £1,324M |
| **Unitary** | 2 | Blackpool, Blackburn w/ Darwen | ALL services combined | £300-500M est. |
| **District** | 12 | Burnley, Hyndburn, Pendle, Rossendale, Lancaster, Ribble Valley, Chorley, South Ribble, Preston, West Lancashire, Wyre, Fylde | Housing, planning, waste, leisure | £12-678M |

### Why This Matters
1. **Burnley ≠ Lancashire** — completely different services
2. **LCC + Burnley ≈ Blackpool** — district + county ≈ unitary
3. **Districts ARE comparable** — all 12 provide similar services
4. **LGR makes this essential** — modelling successor authority finances requires tier understanding

### Political Control (scraped 15 Feb 2026)
| Council | Ruling Party | Control |
|---------|-------------|---------|
| LCC | Reform UK (52/84) | Majority |
| Blackpool | Labour (27/42) | Majority |
| Blackburn | Labour (29/51) | Majority |
| Preston | Labour (26/48) | Majority |
| West Lancashire | Lab & Co-op (16/45) | Largest party |
| Wyre | Conservative (27/50) | Majority |
| Lancaster | Green (23/61) | NOC |
| Chorley | Labour (36/42) | Dominant |
| South Ribble | Labour (28/50) | Majority |
| Ribble Valley | Conservative (17/40) | NOC |
| Fylde | Conservative (21/37) | Majority |
| Burnley | Labour (23/45) | Coalition |
| Hyndburn | Labour (21/34) | Majority |
| Pendle | Conservative (21/49) | Largest party |
| Rossendale | Labour (18/36) | Majority |

---

## 7. WHAT'S NEXT — PHASE 16 OPTIONS

The platform is feature-complete for Phase 15. These are the most impactful next steps, ranked by value:

### HIGH VALUE — Can do now
| # | Task | Impact | Effort |
|---|------|--------|--------|
| 16.1 | **Fresh article generation** — Run article_pipeline.py for 6+ councils with only 1-2 articles | Fills obvious content gap (some councils have 46 articles, others have 1) | Medium — needs VPS |
| 16.2 | **Populate doge_context** — Fill empty key_suppliers/doge_findings/notable_suppliers in configs for 7+ councils | Improves DOGE page quality for newer councils | Low |
| 16.3 | **Data freshness sprint** — Re-crawl councils for latest spending CSVs | Keeps data current | Medium — needs CSV sources |
| 16.4 | **Unit tests for 4 untested pages** — Demographics, LGRTracker, LGRCostCalculator, Integrity | Improves regression safety for 3K lines of untested code | Medium |

### MEDIUM VALUE — Strategic
| # | Task | Impact | Effort |
|---|------|--------|--------|
| 16.5 | **Service gap analysis** — Map all services by provider, identify LGR gaps/duplications | Unique LGR insight | High |
| 16.6 | **Historical spending archive** — Preserve pre-LGR data before councils cease spring 2028 | Archival value — data will be lost | Medium |
| 16.7 | **Meetings data for newer councils** — Scrape ModernGov for meeting dates/agendas | Completes a feature gap | Medium |
| 16.8 | **crime_history.json for 3 councils** — Run police_etl.py from VPS for Burnley/Hyndburn/Pendle | Minor completeness | Low — needs VPS |

### LOWER VALUE — Future
| # | Task | Impact | Effort |
|---|------|--------|--------|
| 16.9 | **National expansion** — Architecture supports other two-tier counties (Kent, Hampshire) | New markets | Very High |
| 16.10 | **Declaration of interests** — Councillor interest register scraping | Transparency | High — data access unclear |
| 16.11 | **Service quality correlation** — Ofsted/CQC integration | Depth | High — primarily upper-tier |
| 16.12 | **Password protection** — ReformLancs2026! for restricted access | Access control | Low |

---

## 8. NAMING CONVENTIONS

### Files
```
Scripts:     {domain}_{action}.py          council_etl.py, procurement_etl.py
Data:        {concept}.json                spending.json, procurement.json
Chunks:      {concept}-{period}.json       spending-2025-26.json, spending-2025-01.json
Config:      config.json (per council)
Articles:    {slug}.json in articles/      duplicate-payments-crisis.json
Pages:       {PascalCase}.jsx              Spending.jsx, LGRTracker.jsx
Components:  {PascalCase}.jsx              ChartCard.jsx, StatCard.jsx
Hooks:       use{PascalCase}.js            useData.js, useSpendingWorker.js
Workers:     {concept}.worker.js           spending.worker.js
Tests:       {filename}.test.{ext}         Spending.test.jsx, useData.test.js
CSS:         {ComponentName}.css            Spending.css, LGRTracker.css
```

### Conventions
```
JSON keys:   snake_case                    total_spend, department_name
React state: camelCase                     totalSpend, departmentName
Constants:   UPPER_SNAKE_CASE              CHART_COLORS, COUNCIL_COLORS
CSS classes: kebab-case                    .stat-card, .chart-container
Council IDs: lowercase                     burnley, lancashire_cc, blackpool
URL paths:   /lancashire/{slug}council/    (or /lancashirecc/ for LCC)
```

---

## 9. LEGAL FRAMEWORK

### Currently Tracked (12 laws in shared/legal_framework.json)
Transparency Code 2015, Best Value Duty (LGA 1999 s.3), Companies Act 2006, Procurement Rules (PCR 2015 / Procurement Act 2023), Local Audit Act 2014, Section 151 Officer (LGA 1972), Freedom of Information Act 2000, Data Protection Act 2018, GDPR, Equality Act 2010, Public Services Reform, Public Interest Disclosure Act 1998.

---

## 10. DEADLINES

| Deadline | What | Action | Priority |
|----------|------|--------|----------|
| **29 Mar 2026** | Bluehost expires (6 domains) | ADO rebuild on Cloudflare Pages | HIGH |
| **Jul 2026** | AWS free tier ends (aws-1, aws-2) | Cancel both instances | MEDIUM |
| **Spring 2028** | LGR — councils cease to exist | Archive all spending data before then | WATCH |

---

## 11. AI-FRIENDLY SYSTEM STRUCTURE

### For Claude Code Sessions
```
CLAUDE.md            ← READ FIRST. Dev guide, file locations, build commands
AIDOGE-MASTERPLAN.md ← READ SECOND. Strategy, roadmap, current state
MEMORY.md            ← Auto-memory: gotchas, patterns, cross-session learnings
```

### For Finding Things Fast
```
src/pages/{Page}.jsx          ← 22 page components (all lazy-loaded)
src/components/ui/            ← 11 shared UI components
src/hooks/                    ← useData.js, useSpendingWorker.js
src/workers/                  ← spending.worker.js + spending.utils.js
src/utils/                    ← constants.js, format.js
burnley-council/data/{id}/    ← Per-council data (15 councils)
burnley-council/data/shared/  ← legal_framework.json, lgr_tracker.json
burnley-council/scripts/      ← 20+ Python ETL/analysis scripts
scripts/                      ← generate_cross_council.py, generate_budget_insights.py
.github/workflows/            ← deploy.yml (auto-deploy on push to main)
e2e/                          ← 5 Playwright E2E test files
```

---

## 12. LCC REFERENCE DATA

### Key LCC Financial Data
- **VeLTIP**: £519m invested, ~£169m current value (~£350m paper loss). Maturity up to 92 years.
- **DSG deficit**: £95.5m (2025/26) → £419.9m by 2028/29.
- **Savings delivery**: 91.5% (2023/24) → 48% (2024/25).
- **CQC**: "Requires Improvement" (2.0/4, joint lowest county council).
- **Capital slippage**: £95.8m (32%) in 2025/26.
- **Operation Sheridan**: Former leader Geoff Driver awaiting criminal trial (2027).

### LCC Budget History
| Year | Net Budget | CT Rise | Administration |
|------|-----------|---------|----------------|
| 2020/21 | £844.9m | 3.99% | Conservative |
| 2021/22 | £881.4m | 3.99% | Conservative |
| 2022/23 | £948.1m | 3.99% | Conservative |
| 2023/24 | £1,039m | 3.99% | Conservative |
| 2024/25 | £1,039m | 4.99% | Conservative |
| 2025/26 | £1,243.1m | 4.99% | Conservative |
| 2026/27 | £1,324.4m | 3.80% | Reform UK |

---

## 13. SUCCESS METRICS

| Metric | 7 Feb | 12 Feb | 16 Feb | Notes |
|--------|-------|--------|--------|-------|
| Councils live | 4 | 8 | **15** | All Lancashire |
| Total transactions | 148K | 215K | **2,286K** | 15x growth |
| Total spend tracked | £755M | £1.4B | **£12B+** | 16x growth |
| Councillors tracked | 0 | 0 | **648** | All 15 councils |
| Page components | 16 | 17 | **22** | +Demographics, LGR, LGRCalc, Integrity |
| Unit tests | 103 | 204 | **204** | Stable |
| E2E tests | 0 | 31 | **31** | Stable |
| Articles (total) | 27 | 134 | **141+** | Seed articles for all 15 |
| Python ETL scripts | 10 | 14 | **20+** | Budget, integrity, councillors, census added |
| Monthly cost | £22 | £22 | **£22** | Zero increase at 15x scale |

---

*Plan v14.0 updated: 16 February 2026*
*Phases 1-15 complete: 15 Lancashire councils live, 2,286,000+ transactions, £12B+ tracked*
*All architecture issues fixed, 204 tests pass, zero critical bugs*
