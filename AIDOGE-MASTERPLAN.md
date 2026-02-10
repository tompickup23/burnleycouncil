# AI DOGE MASTER PLAN v4.0
## 10 February 2026 — Post-Phase 4 Review & Strategy

---

## 1. CURRENT STATE SNAPSHOT

### Live Sites (£22/month total cost)
| Site | URL | Records | Spend | Articles | Procurement | Status |
|------|-----|---------|-------|----------|-------------|--------|
| Burnley | aidoge.co.uk/lancashire/burnleycouncil/ | 30,580 | £355M | 62 | 94 notices | LIVE |
| Hyndburn | aidoge.co.uk/lancashire/hyndburncouncil/ | 29,804 | £211M | 25 | 32 notices | LIVE |
| Pendle | aidoge.co.uk/lancashire/pendlecouncil/ | 49,741 | £125M | 25 | 14 notices | LIVE |
| Rossendale | aidoge.co.uk/lancashire/rossendalecouncil/ | 42,536 | £64M | 22 | 90 notices | LIVE |
| **Total** | | **152,661 txns** | **£755M** | **134** | **230** | |

### Paused Sites
| Site | URL | Status | Why |
|------|-----|--------|-----|
| News Lancashire | newslancashire.co.uk | PAUSED | Coming Soon page deployed. Pipelines disabled 10 Feb. |
| News Burnley | newsburnley.co.uk | PAUSED | Coming Soon page deployed. Pipelines disabled 10 Feb. |

### Autonomous Systems
| Cron | Server | Time | Status | What |
|------|--------|------|--------|------|
| data_monitor.py | vps-main | 07:00 | ACTIVE | Check councils for new spending CSVs |
| auto_pipeline.py | vps-main | 08:00 | ACTIVE | ETL + DOGE analysis + WhatsApp notify |
| article_pipeline.py | vps-main | 09:00 | PAUSED | AI article generation (2/council/day) |
| deploy_newslancashire.sh | vps-main | 10:00 | PAUSED | Hugo build + Cloudflare deploy |
| deploy_newsburnley.sh | vps-main | 10:30 | PAUSED | Rsync + Cloudflare deploy |
| pipeline_v4.sh | vps-news | */30 | PAUSED | News crawl + AI rewrite + export |
| sync_repos.sh | vps-main | 05:00 | ACTIVE | Git pull + rsync scripts to vps-news |

### LLM Stack (£0/month)
Gemini 2.5 Flash (primary, free 500 req/day) → Kimi K2.5 (fallback, trial credits) → [Groq blocked from VPS] → [DeepSeek dead, 402]

### Infrastructure
| Server | Provider | RAM | Cost | Purpose |
|--------|----------|-----|------|---------|
| vps-main | Hostinger | 16GB | £22/mo | Clawdbot, email, CRM, pipelines, clawd-worker |
| vps-news (thurinus) | Oracle Cloud | 1GB | Free | News crawl, ETL, enrichment |
| aws-1 | AWS | 1GB | Free (until Jul 2026) | Unused — cancel before trial end |
| aws-2 | AWS | 1GB | Free (until Jul 2026) | Dead — cancel |

---

## 2. PLATFORM ARCHITECTURE

### 17 Pages (all lazy-loaded with ErrorBoundary + Suspense)
| Route | Page | Data | What It Does |
|-------|------|------|-------------|
| `/` | Home | insights, doge_findings, politics_summary, articles-index, revenue_trends | Dashboard with headline stats, top findings, politics, news preview |
| `/spending` | Spending | spending.json (v3 chunks via Web Worker) | Full transaction search/filter/sort/export, year selection, charts |
| `/doge` | DogeInvestigation | doge_findings, doge_verification, outcomes | Forensic analysis: duplicates, splits, CH compliance, Benford's, procurement compliance, payment velocity, accountability tracking |
| `/news` | News | articles-index | Article listing with search, category filter, pagination |
| `/news/:id` | ArticleView | articles/{id}.json | Article reader with DOMPurify, auto-ToC, related articles |
| `/budgets` | Budgets | budgets_govuk, budgets_summary, revenue_trends | Band D comparison, service breakdown, revenue trends |
| `/procurement` | Procurement | procurement | Contract Explorer: expandable rows, CPV/year/value filters, spending cross-reference |
| `/politics` | Politics | councillors, politics_summary | Party breakdown, councillor grid, ward info |
| `/my-area` | MyArea | councillors, wards + postcodes.io API | Postcode → ward → councillors + crime stats |
| `/pay` | PayComparison | pay_comparison | Cross-council executive salary comparison |
| `/compare` | CrossCouncil | cross_council | Cross-council spending comparison with common-year normalisation |
| `/suppliers` | Suppliers | spending.json (aggregated by worker) | Supplier directory ranked by total spend |
| `/supplier/:id` | SupplierView | spending.json (filtered by worker) | Individual supplier profile, payment history |
| `/foi` | FOI | foi_templates | 41 FOI request templates with copy-to-clipboard |
| `/meetings` | Meetings | meetings | Council meeting calendar, how to attend |
| `/legal` | Legal | shared/legal_framework | 12 UK council oversight laws with DOGE relevance |
| `/about` | About | config | Publisher bio, methodology, data sources |

### Data Flow
```
Council CSV  →  council_etl.py  →  spending.json (v2) + v3 chunks
                                →  insights.json, metadata.json
                  doge_analysis.py  →  doge_findings.json, doge_verification.json
GOV.UK ODS  →  govuk_budgets.py  →  budgets_govuk.json, budgets_summary.json
             →  govuk_trends.py   →  revenue_trends.json
CH API       →  council_etl.py    →  supplier enrichment in spending.json
Contracts Finder → procurement_etl.py → procurement.json
Charity Commission → charity_etl.py → charity_check.json (Pendle only)
Police API   →  police_etl.py     →  crime_stats.json
Article pipeline → article_pipeline.py → articles-index.json + articles/{id}.json
```

### 11 Shared Components
Layout, ScrollToTop, ChartCard, DataFreshness, ErrorBoundary, LoadingState, PageHeader, SearchableSelect, StatCard, TabNav + barrel index.js

### Test Coverage
- **168 unit tests** across 20 files (all pages except Procurement.jsx)
- **31 E2E tests** across 5 files (smoke, news, spending, legal, navigation)
- **Gap:** Procurement.jsx has no test coverage

---

## 3. COMPLETED PHASES (1-4)

### Phase 1: Data Credibility — ✅ COMPLETE (10 Feb 2026)
Confidence levels on all findings, Benford's Law reframed (max deviation not chi-squared), cross-council pricing caveats, CSV duplicate fix (Burnley 298→137, Hyndburn 905→334, Pendle 1283→523, Rossendale 1948→521), year-end context, common-year comparability.

### Phase 2: Frontend Polish — ✅ COMPLETE (10 Feb 2026)
Centralised constants (utils/constants.js), article search+pagination+placeholders+related articles, CSS consolidation, 31 Playwright E2E tests, chart accessibility (ChartCard dataTable + sr-only).

### Phase 3: New Data Sources — ✅ COMPLETE (10 Feb 2026)
Procurement ETL + page, payment timing analysis, councillor allowances (Burnley), Charity Commission cross-check (Pendle), Rossendale articles expanded (7→22).

### Phase 4: World-Class DOGE — ✅ COMPLETE (10 Feb 2026)
Procurement compliance analysis (threshold avoidance, repeat winners, timing clusters), Contract Explorer (expandable rows, CPV/year/value filters, spending cross-reference), supplier concentration (HHI), payment velocity, "What Changed?" accountability tracking (outcomes.json), CH fuzzy matching (90%+), RSS feeds, newsletter generator.

---

## 4. KNOWN ISSUES & TECHNICAL DEBT

### Data Accuracy (addressed in Phase 1 but ongoing)
| Issue | Status | Impact |
|-------|--------|--------|
| Burnley: 100% transactions have no descriptions | Council's fault, not fixable | Limits analysis credibility for Burnley specifically |
| Rossendale: 3,167 NAME WITHHELD transactions (£1M) | Documented as transparency flag | Genuine finding — council anonymises supplier names |
| Procurement value gap: only 4-13% of notices have awarded values | Data limitation from Contracts Finder | Cannot do meaningful value analysis on most contracts |
| Hyndburn procurement: only 32 notices vs Burnley 94 | Different publishing practices | Hyndburn may publish less on Contracts Finder |

### Code Issues
| Issue | Severity | Fix Effort |
|-------|----------|------------|
| Procurement.jsx has no unit test | Medium | 1 hr |
| Pendle spending.json is v1 format (plain array) | Low | Re-run ETL with v2 flag |
| council_etl.py line ~1016: `or True` CH filter bug | Low | Already patched but check |
| police_etl.py line ~121: urllib.parse import ordering | Low | Already fixed |
| Rossendale crime_stats disabled (no data collected) | Low | Needs police_etl run |
| Pendle theme_accent same as Burnley (#0a84ff) | Low | Change Pendle to unique colour |
| Data flow diagram in old masterplan said "ProcurementOverview.jsx" | Fixed | Corrected to Procurement.jsx |

### Data Consistency Between Councils
| Data File | Burnley | Hyndburn | Pendle | Rossendale |
|-----------|---------|----------|--------|------------|
| budgets.json (legacy) | ✓ | ✓ | missing | missing |
| budget_insights.json | ✓ | ✓ | missing | missing |
| crime_stats.json | ✓ | ✓ | ✓ | missing (disabled) |
| charity_check.json | - | - | ✓ (unique) | - |
| Spending format | v2 | v2 | **v1** | v2 |
| Spending years | 5 | **10** | 5 | 5 |

---

## 5. IMPROVEMENT ROADMAP

### Phase 5: Polish & Harden (COMPLETED 10 Feb 2026)
Focus: Fix gaps exposed by the Phase 1-4 sprint, improve what exists before expanding.

| # | Task | Status | Result |
|---|------|--------|--------|
| 5.1 | Procurement.jsx unit test | ✅ | 15 tests added. 183 total (21 files) |
| 5.2 | UptimeRobot monitoring | ✅ | `scripts/setup_uptimerobot.sh` — 11 monitors (homepages, data, RSS) |
| 5.3 | Spending v2 migration | ✅ | All 4 councils converted from v1→v2 format |
| 5.4 | Rossendale crime stats | ✅ | 6 months data (Jul-Dec 2025), 10 wards, config enabled |
| 5.5 | Evidence chain | ✅ | `ref=doge` param shows blue banner on Spending page. All DOGE supplier links carry evidence trail. CH compliance top_cases clickable |
| 5.6 | Reading time estimates | ✅ | `estimateReadingTime()` in format.js. Shown on News cards + ArticleView |
| 5.7 | Budget vs actual | ✅ | Assessed: Burnley has 0 service divisions, others have 7-24. Needs manual mapping table. Deferred to Phase 6+ |
| 5.8 | VPS backup strategy | ✅ | `scripts/vps_backup.sh` — weekly rsync, 4-week retention |

### Phase 6: Expand Coverage (NEXT — Feb/Mar 2026)
Focus: Add more Lancashire councils. The architecture already supports it — just needs new data.

| # | Task | Why | Effort |
|---|------|-----|--------|
| 6.1 | Add Lancaster City Council | Largest district in Lancashire (population 144K). CSV spending data published. | 4 hr |
| 6.2 | Add Ribble Valley Borough Council | Completes East Lancashire coverage. CSV data published. | 4 hr |
| 6.3 | Add Chorley Borough Council | South Lancashire. Strong spending data publication. | 4 hr |
| 6.4 | Add South Ribble Borough Council | Adjacent to Chorley, similar data format | 4 hr |
| 6.5 | Hub page redesign | Current hub is password-gated placeholder. Needs proper landing page for 6-8 councils | 3 hr |
| 6.6 | Cross-council comparison expansion | CrossCouncil.jsx needs to handle 6-8 councils, not just 4 | 2 hr |

### Phase 7: Public Launch Readiness (Apr/May 2026)
Focus: Make the platform ready for media, public, and councillor use.

| # | Task | Why | Effort |
|---|------|-----|--------|
| 7.1 | Remove password gate from hub | Go fully public | 0.5 hr |
| 7.2 | Dark mode toggle | Modern UX expectation, especially for data-heavy reading | 3 hr |
| 7.3 | PWA / offline support | Service worker for caching, "Add to Home Screen" on mobile | 3 hr |
| 7.4 | Social sharing meta tags (Open Graph) | When sharing council pages on WhatsApp/Twitter, show proper previews | 1 hr |
| 7.5 | Google Search Console setup | Get pages indexed, submit sitemaps | 1 hr |
| 7.6 | Media kit / press page | One-page summary for journalists, councillors, residents | 2 hr |
| 7.7 | Citizen reporting: "Flag this transaction" | Allow public to flag suspicious transactions for investigation | 4 hr |
| 7.8 | Resume article pipeline + news sites | Uncomment crons, redeploy full sites (not coming soon pages) | 1 hr |

### Phase 8: Advanced Analysis (May/Jun 2026)
Focus: Deeper, more sophisticated DOGE analysis.

| # | Task | Why | Effort |
|---|------|-----|--------|
| 8.1 | Find a Tender integration | Above-threshold contract data (EU/UK procurement portal) | 4 hr |
| 8.2 | Single-bidder contract detection | Procurement notices with only 1 bid indicate weak competition | 3 hr |
| 8.3 | Late publication analysis | Contracts published after award date = retrospective compliance | 2 hr |
| 8.4 | Deprivation index overlay on MyArea | IMD data per ward — correlate spending with deprivation | 3 hr |
| 8.5 | Declaration of interests cross-reference | Compare councillor interests to suppliers receiving money | 4 hr (needs FOI) |
| 8.6 | Service quality correlation | OFSTED, CQC, other inspectorate data vs spending | Hard — external data needed |
| 8.7 | Fraud triangle scoring | Motive + opportunity + rationalisation per department/supplier | Hard — needs audit reports |

---

## 6. PAGE-BY-PAGE STATUS & IMPROVEMENTS

### Spending Page — MATURE
- **Current:** Web Worker (filter, sort, paginate, stats, charts, CSV export), v3 year-chunked loading (4-8MB vs 21-40MB), year selector, search, column sort
- **Next:** Link to procurement contracts for same supplier, evidence chain from DOGE findings

### DOGE Investigation Page — MATURE
- **Current:** Confidence badges, context notes, severity scoring, radar chart, expandable findings, procurement compliance, supplier concentration (HHI), payment velocity, accountability tracking (outcomes.json)
- **Next:** Evidence chain (click finding → see transactions), trend comparison (this quarter vs last)

### Procurement / Contract Explorer — MATURE
- **Current:** Stats grid, year chart, status pie, top suppliers, expandable detail rows, CPV/year/value advanced filters, spending cross-reference link
- **Next:** Find a Tender integration, single-bidder detection, late publication analysis

### News / Articles — GOOD
- **Current:** 134 articles across 4 councils, search, category filter, 12/page pagination, placeholder images, related articles, RSS feed
- **Next:** Reading time estimate, article tags (currently empty), resume article pipeline

### Budgets — GOOD
- **Current:** Band D comparison, service breakdown, revenue trends
- **Next:** Budget vs actual spend comparison, year-on-year trend arrows, council tax affordability index

### Politics — ADEQUATE
- **Current:** Party breakdown, councillor grid, ward info
- **Next:** Allowances display, declaration of interests, voting records (if obtainable)

### My Area — ADEQUATE
- **Current:** Postcode lookup via postcodes.io, ward → councillors, crime stats
- **Next:** Deprivation index, service satisfaction data

### FOI Templates — ADEQUATE
- **Current:** 41 templates across 4 councils, copy-to-clipboard
- **Next:** Track submission outcomes, link to WhatDoTheyKnow

### Meetings — ADEQUATE
- **Current:** Calendar view, how to attend info
- **Next:** Meeting minutes links (requires ModernGov scraping)

### Pay Comparison — ADEQUATE
- **Current:** Cross-council executive salary comparison
- **Next:** Historical trend, national comparison benchmarks

### Cross-Council — ADEQUATE
- **Current:** Common-year normalised spending comparison
- **Next:** Expand to 6-8 councils, add procurement comparison, add service comparison

### Suppliers / Supplier View — ADEQUATE
- **Current:** Directory ranked by spend, individual profiles with payment history
- **Next:** CH compliance badges inline, link to procurement contracts

### Legal — COMPLETE
- **Current:** 12 UK laws with DOGE relevance, tabbed interface
- **Next:** Add Procurement Act 2023 detail, Late Payment of Commercial Debts Act

### About — COMPLETE
- **Current:** Publisher bio, methodology, data sources
- **Next:** No changes needed

---

## 7. DATA COMPARABILITY FRAMEWORK

### The Problem
Councils publish different year ranges and have different thresholds:
- Hyndburn: 10 years (2016-2026), £250 threshold — deepest history
- Burnley: 5 years (2021-2026), £500 threshold
- Pendle: 5 years (2021-2026), £500 threshold
- Rossendale: 5 years (2021-2026), £500 threshold

### Rules (all implemented)
1. **Common year range** — Cross-council comparisons only use overlapping years (2021-22 to 2025-26)
2. **Per-year averages** — Normalise by year count when showing totals
3. **Explicit labelling** — Always state the comparison period
4. **Threshold awareness** — Hyndburn's £250 threshold means more transactions visible vs others' £500

---

## 8. NAMING CONVENTIONS

### Files
```
Scripts:     {domain}_{action}.py          council_etl.py, procurement_etl.py
Data:        {concept}.json                spending.json, procurement.json
Chunks:      {concept}-{period}.json       spending-2025-26.json
Config:      config.json (per council)
Articles:    {slug}.json in articles/      duplicate-payments-crisis.json
Pages:       {PascalCase}.jsx              Spending.jsx, Procurement.jsx
Components:  {PascalCase}.jsx              ChartCard.jsx, StatCard.jsx
Hooks:       use{PascalCase}.js            useData.js, useSpendingWorker.js
Workers:     {concept}.worker.js           spending.worker.js
Tests:       {filename}.test.{ext}         Spending.test.jsx, useData.test.js
CSS:         {ComponentName}.css            Spending.css, ChartCard.css
```

### Conventions
```
JSON keys:   snake_case                    total_spend, department_name
React state: camelCase                     totalSpend, departmentName
Constants:   UPPER_SNAKE_CASE              CHART_COLORS, TYPE_LABELS
CSS classes: kebab-case                    .stat-card, .chart-container
Council IDs: lowercase                     burnley, hyndburn, pendle, rossendale
URL paths:   /lancashire/{id}council/
```

---

## 9. LEGAL FRAMEWORK

### Currently Tracked (12 laws in shared/legal_framework.json)
Transparency Code 2015, Best Value Duty (LGA 1999 s.3), Companies Act 2006, Procurement Rules (PCR 2015 / Procurement Act 2023), Local Audit Act 2014, Section 151 Officer (LGA 1972), Freedom of Information Act 2000, Data Protection Act 2018, GDPR, Equality Act 2010, Public Services Reform, Public Interest Disclosure Act 1998.

### Laws to Add
| Law | DOGE Application |
|-----|------------------|
| Late Payment of Commercial Debts (Interest) Act 1998 | Councils must pay SMEs within 30 days — links to payment velocity analysis |
| Social Value Act 2012 | Procurement must consider social value — contract award analysis |
| Best Value (Accountability for Quality) Act 2023 | Continuous improvement duty — links to outcomes tracking |

---

## 10. SUCCESS METRICS

| Metric | 7 Feb | 10 Feb (P4) | Target | Status |
|--------|-------|-------------|--------|--------|
| Councils live | 4 | 4 | 8+ | Phase 6 will add Lancaster, Ribble Valley, Chorley, South Ribble |
| Total articles | 27 | **134** | 200+ | Pipeline paused but 134 published |
| DOGE finding confidence | None | **All rated** | All rated | ✅ Done |
| Procurement data | None | **230 notices** | All councils | ✅ Done |
| Contract Explorer | None | **Live** | Advanced search + cross-reference | ✅ Done |
| Supplier concentration (HHI) | None | **Live** | Per-council analysis | ✅ Done |
| Payment velocity | None | **Live** | Rapid payers + patterns | ✅ Done |
| Accountability tracking | None | **Live** | outcomes.json per council | ✅ Done |
| RSS feeds | None | **Live** | Per-council XML | ✅ Done |
| Newsletter generator | None | **Built** | HTML+text per council | ✅ Built (not yet sent) |
| Unit tests | 103 | **168** | 200+ | Need Procurement test |
| E2E tests | 0 | **31** | 30+ | ✅ Target exceeded |
| Monthly cost | £22 | £22 | £22 | LLMs free (Gemini) |
| CH fuzzy matching | ~20% | **90%+** | 90%+ | ✅ Done |

---

## 11. DEADLINES

| Deadline | What | Action | Priority |
|----------|------|--------|----------|
| **29 Mar 2026** | Bluehost expires (6 domains) | ADO rebuild must be live on Cloudflare Pages before this | HIGH |
| **Jul 2026** | AWS free tier ends (aws-1, aws-2) | Cancel both instances | MEDIUM |
| **2 Mar 2026** | Codex OpenAI trial expires | Let expire — Claude Code covers all needs | LOW |
| **Ongoing** | LGR (Local Government Reorganisation) | Monitor for East Lancashire unitary authority implications | WATCH |

---

## 12. AI-FRIENDLY SYSTEM STRUCTURE

### For Claude Code Sessions
```
CLAUDE.md            ← READ FIRST. Dev guide, file locations, build commands
AIDOGE-MASTERPLAN.md ← READ SECOND. Strategy, roadmap, current state
TODO.md              ← Active task list with checkboxes
MEMORY.md            ← Auto-memory: gotchas, patterns, cross-session learnings
```

### For Finding Things Fast
```
src/pages/{Page}.jsx        ← 17 page components (all lazy-loaded)
src/components/ui/          ← 11 shared UI components
src/hooks/                  ← useData.js, useSpendingWorker.js
src/workers/                ← spending.worker.js + spending.utils.js
src/utils/                  ← constants.js, format.js
burnley-council/data/{id}/  ← Per-council data (4 councils)
burnley-council/data/shared/ ← legal_framework.json, doge_knowledge_core.json
burnley-council/scripts/    ← 17 Python ETL/analysis scripts
.github/workflows/          ← deploy.yml (auto-deploy on push to main)
e2e/                        ← 5 Playwright E2E test files
__tests__/                  ← 20 Vitest unit test files
```

---

*Plan v4.0 authored: 10 February 2026*
*Phases 1-4 completed: 10 February 2026 (30/30 tasks done)*
*Based on: Live site verification (all 4 councils confirmed), full codebase audit, data file comparison, config analysis*
*Phase 5 complete 10 Feb 2026. Next review: After Phase 6 (Expand Coverage) complete*
