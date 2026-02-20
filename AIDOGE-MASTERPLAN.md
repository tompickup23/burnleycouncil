# AI DOGE MASTER PLAN v15.0
## 19 February 2026 — Phases 1-17 Complete, All 15 Lancashire Councils Live

---

## 1. CURRENT STATE SNAPSHOT

### Platform Summary
- **15 Lancashire councils** across 3 tiers — ALL LIVE
- **2,286,000+ transactions** — £12 billion+ tracked
- **648 councillors** — full politics data for all 15
- **25 page components** across 28 routes — lazy-loaded with ErrorBoundary + Suspense
- **446 unit tests** (32 files) + **49 E2E tests** (6 files) — all passing
- **40 Python ETL/analysis scripts** — 35 in burnley-council/scripts/ + 5 in scripts/
- **Cost: £22/month** — LLM costs £0 (Gemini/Mistral/Groq free tiers)

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
- **AI DOGE articles:** Mistral Small (free, EU/GDPR-safe) → Groq Llama 3.3 70B (free) → Cerebras → Ollama local
- **News Lancashire:** Gemini 2.5 Flash (free) → Kimi K2.5 (trial) → [Groq blocked from VPS] → [DeepSeek dead]

### Infrastructure
| Server | Provider | RAM | Cost | Purpose |
|--------|----------|-----|------|---------|
| vps-main | Hostinger | 16GB | £22/mo | Clawdbot, email, CRM, pipelines |
| vps-news | Oracle Cloud | 1GB | Free | News crawl, ETL |
| aws-1 | AWS | 1GB | Free (until Jul 2026) | Unused — cancel |
| aws-2 | AWS | 1GB | Free (until Jul 2026) | Dead — cancel |

---

## 2. PLATFORM ARCHITECTURE

### 25 Pages across 28 Routes (all lazy-loaded with ErrorBoundary + Suspense)
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
| `/elections` | Elections | Ward-level election history, May 2026 predictions, ward builder, coalitions, LGR projections |
| `/constituencies` | Constituencies | Parliamentary constituency cards with GE2024, claimant count, MP expenses |
| `/constituencies/:id` | ConstituencyView | Individual constituency detail: MP, voting record, expenses, activity |
| `/lgr` | LGRTracker | LGR reorganisation proposals, AI DOGE financial model, CCN critique |
| `/lgr-calculator` | LGRCostCalculator | "What your area costs" calculator + Financial Handover Dashboard |
| `/integrity` | Integrity | 8-source councillor integrity scoring with conflict classification |
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
             →  collection_rates_etl.py → collection_rates.json (council tax collection)
CH API       →  council_etl.py    →  supplier enrichment
Contracts Finder → procurement_etl.py → procurement.json
Police API   →  police_etl.py     →  crime_stats.json, crime_history.json
IMD 2019     →  deprivation_etl.py → deprivation.json
Census 2021  →  census_etl.py     →  demographics.json
ModernGov    →  councillors_etl.py → councillors.json, politics_summary.json, wards.json
Councillor+CH → councillor_integrity_etl.py → integrity.json (conflict type classification)
TWFY/IPSA    →  constituency_etl.py → constituencies.json (MPs, expenses, votes, activity)
             →  ipsa_etl.py       → IPSA MP expenses data
ONS lookups  →  ward_constituency_map.py → ward_constituency_map.json
Elections    →  elections_etl.py   → elections.json, elections_reference.json
             →  poll_aggregator.py → polling.json (national polling aggregation)
Article AI   →  article_pipeline.py → articles-index.json + articles/{id}.json
Cross-council → generate_cross_council.py → cross_council.json (collection rates, dependency ratio, reserves, HHI)
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
- **446 unit tests** across 32 files — all passing
- **49 E2E tests** across 6 files (smoke, news, spending, legal, navigation, elections)
- **25 page components** all have tests (every page in src/pages/ has a .test.jsx)
- **4 utility test files**: analytics.test.js, electionModel.test.js, spending.utils.test.js, format.test.js

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

### Phase 16: Budget Enrichment & Integrity v3 ✅ (16-17 Feb)
Budget enrichment for all 15 councils. Integrity checker v3 overhaul with register-anchored DOB-verified matching.

**Key Phase 16 deliverables:**
- Budget Enrichment: ALL 15 councils now have `budgets: true`. 13 auto-generated via `generate_budgets_from_govuk.py`, 2 hand-curated (Burnley/Hyndburn)
- Integrity Checker v3: Register-anchored DOB-verified matching pipeline, 90% name threshold (was 60%), geographic proximity scoring, register compliance checking (Localism Act 2011 s30)
- New register_of_interests_etl.py: ModernGov register scraper for all 15 councils
- False positives dramatically reduced (e.g. Burnley 181→93 flags, SIC 96090/formation agent cleanup)
- Results: 691 councillors, 2,221 directorships (1,570 active), 3,350 red flags, 9 empty registers across 3 councils
- West Lancashire integrity report PDF (7 high-risk, 6 elevated-risk councillors, 6 empty registers)

### Phase 17: Site Audit, Data Enrichment & Cross-System Integration ✅ (17-19 Feb)
Comprehensive platform audit, bug fixes across all pages, and systematic data enrichment connecting all existing data sources.

**Key Phase 17 deliverables:**
- **Elections page** (18 Feb): Ward-level election history, May 2026 predictions with demographics-weighted swing model, ward builder, coalition scenarios, LGR political projections, demographics scatter. New files: Elections.jsx, Elections.css, electionModel.js (+ tests). Data: elections.json + elections_reference.json + polling.json per council
- **Constituencies pages** (18 Feb): Parliamentary constituency cards (Constituencies.jsx) + individual constituency view (ConstituencyView.jsx) with GE2024 results, MP expenses (IPSA), voting records (TWFY), claimant count data, activity topics. New scripts: constituency_etl.py, ipsa_etl.py, ward_constituency_map.py
- **Analytics engine** (18 Feb): New src/utils/analytics.js with 10 functions + CPI-H index (deflation, z-scores, Gini coefficient, Benford's 2nd digit, reserves adequacy, peer benchmarking). 48 unit tests
- **Collection rates ETL** (18 Feb): collection_rates_etl.py parses GOV.UK QRC4 Table 2 ODS data for 14 billing authorities (districts + unitaries, not LCC). Feeds into cross_council.json and LGR model
- **Ward-constituency mapping** (18 Feb): ONS ward-to-constituency lookup for all 14 councils. ward_constituency_map.json enables constituencyMap in election predictions
- **Dependency ratio + reserves trajectory** (18 Feb): Census 2021 age pyramids → dependency ratio. Multi-year budget data → reserves trajectory + 2-year linear projection. Both in cross_council.json
- **Per-service HHI** (18 Feb): Budget efficiency analysis with per-service supplier concentration (HHI). Heatmap in CrossCouncil.jsx
- **Election→LGR integration** (18 Feb): `projectToLGRAuthority()` in electionModel.js computes political control per proposed LGR authority from ward-level predictions
- **Integrity conflict classification** (19 Feb): Supplier conflicts classified as commercial, community_trustee, council_appointed, or arms_length_body. 48 commercial conflicts across 15 councils. Regenerated all 15 integrity.json files with donor name verification fix
- **Article pipeline upgrade** (18 Feb): Switched to Mistral Small (free, EU/GDPR-safe) + Groq Llama 3.3 70B via llm_router.py. Generated 37 new articles for thin councils. Improved fact verification + structured article format
- **LGR model accuracy overhaul** (18 Feb): Realistic savings figures (net of ongoing costs, 75% realisation rate). Payback years recalculated. Cost Calculator gated behind postcode entry
- **Test expansion**: 219→446 unit tests (32 files), 31→49 E2E tests (6 files). All 25 page components have tests. New test suites for electionModel, analytics, Elections, Constituencies, ConstituencyView, Demographics, LGRTracker, LGRCostCalculator, Integrity

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
| React hooks after early return in SupplierView.jsx:135 | MEDIUM | Rules of Hooks violation — move useMemo before return |
| 108 unguarded chained property accesses (mostly Budgets.jsx) | LOW | Use optional chaining |
| Accessibility gaps in Demographics, LGRTracker (no ARIA attributes) | LOW | Can add when modifying |

### Data Gaps (non-critical)
| Gap | Councils Affected | Status |
|-----|-------------------|--------|
| crime_history.json | Burnley, Hyndburn, Pendle | Needs VPS (Police API, local SSL broken) |
| doge_context empty fields | LCC, Blackpool, Blackburn, Fylde + others | key_suppliers, doge_findings, notable_suppliers not populated |
| Thin articles | 6+ councils have only 1-5 articles | LCC, Blackpool, Blackburn, Wyre, West Lancs, Preston |
| Stale spending data | Chorley (Dec 2024), Ribble Valley (Apr 2024-Jan 2025) | Council hasn't published newer CSVs |
| Blackpool integrity conflict types | Blackpool council-owned companies | Classified as commercial, should be arms_length_body |

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

## 7. PHASE 18: FIREBASE AUTH + RBAC + ELECTION STRATEGY

### Phase 18a+b: Firebase Auth + RBAC ✅ (20 Feb)
Dual-mode authentication system deployed. Firebase Auth in production (when `VITE_FIREBASE_API_KEY` set), old PasswordGate for local dev. Supports Google, Apple, Facebook, and email/password login. Four roles (unassigned, viewer, strategist, admin) with per-council, per-page, per-constituency permissions stored in Firestore. Admin panel at /admin for user management. 17 files, 2,695 lines. 6 GitHub secrets configured.

**Key files created:** firebase.js, AuthContext.jsx, AuthGate.jsx, AdminPanel.jsx, ProtectedRoute.jsx, firestore.rules, .env.example
**Key files modified:** App.jsx (dual-mode routing), Layout.jsx (admin nav), PasswordGate.jsx (dev badge), deploy.yml (secrets)

### Phase 18c-e: Strategy Engine + UI (planned)
Ward archetype classification (8 types), auto-talking-points from data, battleground ranking, 3-tier geographic mapping (constituency → county division → borough ward). Strategy pages per council and per constituency.

---

## 8. WHAT'S NEXT — FUTURE OPTIONS

The platform is feature-complete through Phase 18a+b. These are the most impactful next steps, ranked by value:

### HIGH VALUE — User Engagement & Content
| # | Task | Impact | Effort |
|---|------|--------|--------|
| 18.1 | **Fresh article generation** — Run article_pipeline.py for 6+ councils with only 1-5 articles | Fills obvious content gap (Burnley 46 articles, others have 1-5) | Medium — needs VPS |
| 18.2 | **Meeting & voting analysis** — Scrape LCC recorded votes, attendance records, committee participation. Build voting record page | Unique political accountability data | High |
| 18.3 | **Geographic visualisation** — Ward-level choropleth maps (deprivation, spending, election results). Leaflet.js or similar | Makes spatial patterns visible | High |
| 18.4 | **Newsletter/email digest** — Weekly summary per council via Amazon SES (3K/month free) | Direct audience engagement | Medium |

### MEDIUM VALUE — Data Depth
| # | Task | Impact | Effort |
|---|------|--------|--------|
| 18.5 | **Real-time data pipeline** — Auto-detect new council CSVs, ETL, analysis, deploy without manual intervention | Autonomous operation | Medium |
| 18.6 | **Historical spending archive** — Preserve pre-LGR data before councils cease spring 2028 | Archival value — data will be lost | Medium |
| 18.7 | **FOI automation** — Generate, send, and track FOI requests. Build response database | Active transparency tool | High |
| 18.8 | **Service quality correlation** — Ofsted/CQC ratings mapped to spending levels and council tier | Outcome-based analysis | High |

### STRATEGIC — Expansion
| # | Task | Impact | Effort |
|---|------|--------|--------|
| 18.9 | **National expansion** — Architecture supports other two-tier counties (Kent, Hampshire, Essex) | New markets | Very High |
| 18.10 | **Reform councillor intelligence platform** — Dedicated briefing platform for Reform UK councillors | Political market | High (plan exists) |
| 18.11 | **Investigation tools** — Deep-dive investigation workflows: supplier network mapping, company chain tracing, cross-reference registers | Journalism tool | High |
| 18.12 | **API layer** — Public API for researchers, journalists, civic apps to query spending data | Platform ecosystem | Medium |

---

## 9. NAMING CONVENTIONS

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

## 10. LEGAL FRAMEWORK

### Currently Tracked (12 laws in shared/legal_framework.json)
Transparency Code 2015, Best Value Duty (LGA 1999 s.3), Companies Act 2006, Procurement Rules (PCR 2015 / Procurement Act 2023), Local Audit Act 2014, Section 151 Officer (LGA 1972), Freedom of Information Act 2000, Data Protection Act 2018, GDPR, Equality Act 2010, Public Services Reform, Public Interest Disclosure Act 1998.

---

## 11. DEADLINES

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
src/pages/{Page}.jsx          ← 25 page components (all lazy-loaded, all tested)
src/components/ui/            ← 11 shared UI components
src/hooks/                    ← useData.js, useSpendingWorker.js
src/workers/                  ← spending.worker.js + spending.utils.js
src/utils/                    ← constants.js, format.js, analytics.js, electionModel.js, lgrModel.js
burnley-council/data/{id}/    ← Per-council data (15 councils)
burnley-council/data/shared/  ← legal_framework.json, lgr_tracker.json
burnley-council/scripts/      ← 35 Python ETL/analysis scripts
scripts/                      ← generate_cross_council.py, generate_budget_insights.py, academic_export.py, daily_audit.py, suggest_improvements.py
.github/workflows/            ← deploy.yml (auto-deploy on push to main)
e2e/                          ← 6 Playwright E2E test files (49 tests)
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

| Metric | 7 Feb | 12 Feb | 16 Feb | 19 Feb | Notes |
|--------|-------|--------|--------|--------|-------|
| Councils live | 4 | 8 | 15 | **15** | All Lancashire |
| Total transactions | 148K | 215K | 2,286K | **2,286K** | Stable |
| Total spend tracked | £755M | £1.4B | £12B+ | **£12B+** | Stable |
| Councillors tracked | 0 | 0 | 648 | **648** | All 15 councils |
| Page components | 16 | 17 | 22 | **25** | +Elections, Constituencies, ConstituencyView |
| Routes | 16 | 17 | 22 | **28** | +elections, constituencies, constituency view |
| Unit tests | 103 | 204 | 219 | **446** | +227 (elections, analytics, all pages) |
| E2E tests | 0 | 31 | 31 | **49** | +18 (election flows) |
| Test files | — | — | 26 | **32** | All 25 pages have tests |
| Articles (total) | 27 | 134 | 141 | **178+** | +37 via Mistral/Groq |
| Python scripts | 10 | 14 | 20 | **40** | +elections, constituencies, analytics, LGR |
| Monthly cost | £22 | £22 | £22 | **£22** | Zero increase at 15x scale |

---

*Plan v15.0 updated: 19 February 2026*
*Phases 1-17 complete: 15 Lancashire councils live, 2,286,000+ transactions, £12B+ tracked*
*446 unit tests + 49 E2E tests pass, 25 page components, 40 Python scripts, zero critical bugs*
