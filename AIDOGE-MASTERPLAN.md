# AI DOGE MASTER PLAN v3.0
## 10 February 2026 — Comprehensive Review & Strategy

---

## 1. CURRENT STATE SNAPSHOT

### Live Sites (£22/month total cost)
| Site | URL | Records | Spend | Articles | Status |
|------|-----|---------|-------|----------|--------|
| Burnley | aidoge.co.uk/lancashire/burnleycouncil/ | 30,580 | £355M | 44 | LIVE |
| Hyndburn | aidoge.co.uk/lancashire/hyndburncouncil/ | 29,804 | £211M | 20 | LIVE |
| Pendle | aidoge.co.uk/lancashire/pendlecouncil/ | 49,741 | £125M | 19 | LIVE |
| Rossendale | aidoge.co.uk/lancashire/rossendalecouncil/ | 42,536 | £64M | 6 | LIVE |
| News Lancashire | newslancashire.co.uk | 963 articles | - | - | LIVE |
| News Burnley | newsburnley.co.uk | 50 articles | - | - | LIVE |
| **Total** | | **152,661 txns** | **£755M** | **89** | |

### Autonomous Systems Running
| Cron | Server | Time | What |
|------|--------|------|------|
| pipeline_v4.sh | vps-news | */30 | News crawl + AI rewrite + export |
| data_monitor.py | vps-main | 07:00 | Check councils for new CSVs |
| auto_pipeline.py | vps-main | 08:00 | ETL + DOGE analysis |
| article_pipeline.py | vps-main | 09:00 | AI article generation + auto-deploy |
| deploy_newslancashire.sh | vps-main | 10:00 | Hugo build + Cloudflare deploy |
| deploy_newsburnley.sh | vps-main | 10:30 | Rsync + Cloudflare deploy |

### LLM Stack (£0/month)
Gemini 2.5 Flash (primary, free 500 req/day) -> Kimi K2.5 (fallback, trial credits) -> [Groq blocked from VPS] -> [DeepSeek dead]

---

## 2. AUDIT FINDINGS (10 Feb 2026)

### 2A. Data Accuracy Issues (CRITICAL)

These findings are currently live and could undermine credibility:

| # | Issue | Severity | Current Claim | Reality |
|---|-------|----------|---------------|---------|
| 1 | **298 "high-confidence" duplicates (£1.2M)** | HIGH | "Likely duplicate payments" | Most are CSV republication artifacts, not real duplicates. Only 2 suppliers genuinely problematic (DLH, Home First) |
| 2 | **Benford's Law anomaly (chi-sq=2541)** | HIGH | "Significant deviation" | Large sample size inflates chi-squared. 5% max deviation is normal for UK council spending. Misleading to non-technical readers |
| 3 | **EDF Energy 8772% price gap** | HIGH | Implies supplier overcharging | Different service scope (fleet vs street lighting). No service-level adjustment |
| 4 | **Year-end spike "anomaly"** | MED | March 1.5x average = suspicious | Normal UK fiscal year behaviour. March spending surge is expected budget management |
| 5 | **Burnley zero descriptions** | MED | 100% transactions have no description | Limits all downstream analysis credibility. Council publishing failure, not our bug |

**ACTION:** Add confidence metadata to all findings. Reframe misleading claims. Separate "investigation hint" from "proven finding."

### 2B. Missing Analysis (gaps that a world-class DOGE should have)

| Analysis | Why It Matters | Difficulty |
|----------|---------------|------------|
| Procurement compliance (>£25K threshold) | Are contracts competitively tendered? | Medium (needs Contracts Finder API) |
| Supplier payment timing | Who gets paid fast vs slow? Are SMEs disadvantaged? | Easy (date fields exist) |
| Service quality correlation | Does spending increase correlate with better outcomes? | Hard (needs external data) |
| Contract register cross-reference | Link payments to formal contracts | Medium (needs FOI or open data) |
| Fraud triangle analysis | Motive + opportunity + rationalisation per department | Hard (needs audit reports) |
| Temporal spending patterns | Unusual payment velocity, clustering before deadlines | Easy (spending.json has dates) |

### 2C. Frontend Issues

| Issue | Impact | Fix Effort |
|-------|--------|-----------|
| Duplicate constants (TYPE_LABELS, CHART_COLORS) across files | Maintenance burden | 30 min |
| No accessibility for chart data (no data table fallback) | Screen reader users excluded | 2 hr |
| No E2E tests (Playwright configured but unused) | Regression risk | 2 hr |
| CSS inconsistency (mix of BEM, snake_case, plain) | Dev confusion | 1 hr |
| Home.jsx makes 5 parallel data requests | Potential waterfall on slow connections | 30 min |

### 2D. Documentation Sprawl (11 .md files, significant overlap)

**Current files:** CLAUDE.md, ARCHITECTURE.md, INFRASTRUCTURE.md, TODO.md, SYSTEM_AUDIT.md, IMPROVEMENTS.md, HANDOVER.md, HANDOVER-NEWSLANCASHIRE.md, AIDOGE-MASTERPLAN.md, ARTICLE-PIPELINE-AUDIT.md, README.md

**Proposed consolidation:**
| Keep | Purpose | Replaces |
|------|---------|----------|
| CLAUDE.md | Dev guide (AI reads this first) | - |
| AIDOGE-MASTERPLAN.md | Strategy + roadmap (this file) | SYSTEM_AUDIT.md overlap, IMPROVEMENTS.md overlap |
| INFRASTRUCTURE.md | Server ops + crons + keys | HANDOVER.md overlap |
| TODO.md | Active task tracker | - |
| ARTICLE-PIPELINE-AUDIT.md | Pipeline-specific audit | - |
| README.md | Public-facing project overview | - |
| **ARCHIVE:** | Move to docs/ folder | HANDOVER.md, HANDOVER-NEWSLANCASHIRE.md, SYSTEM_AUDIT.md, IMPROVEMENTS.md |

---

## 3. NAMING CONVENTIONS (for AI + human readability)

### File Naming
```
Scripts:     {domain}_{action}.py          e.g. council_etl.py, procurement_etl.py
Data:        {concept}.json                e.g. spending.json, procurement.json
Data chunks: {concept}-{period}.json       e.g. spending-2025-26.json
Config:      config.json (per council)
Articles:    {slug}.json in articles/      e.g. duplicate-payments-crisis.json
Pages:       {PascalCase}.jsx              e.g. Spending.jsx, ProcurementOverview.jsx
Components:  {PascalCase}.jsx              e.g. ChartCard.jsx, StatCard.jsx
Hooks:       use{PascalCase}.js            e.g. useData.js, useSpendingWorker.js
Workers:     {concept}.worker.js           e.g. spending.worker.js
Tests:       {filename}.test.{ext}         e.g. Spending.test.jsx, useData.test.js
CSS:         {ComponentName}.css            e.g. Spending.css, ChartCard.css
```

### Data Field Naming
```
JSON keys:   snake_case                    e.g. total_spend, department_name
React state: camelCase                     e.g. totalSpend, departmentName
Constants:   UPPER_SNAKE_CASE              e.g. CHART_COLORS, TYPE_LABELS
CSS classes: kebab-case                    e.g. .stat-card, .chart-container
```

### Council IDs
Always lowercase, no spaces: `burnley`, `hyndburn`, `pendle`, `rossendale`
URL paths: `/lancashire/{council_id}council/`

---

## 4. DATA COMPARABILITY FRAMEWORK

### The Problem
Different councils publish different numbers of years:
- Hyndburn: 10 years (2016-2026)
- Burnley: 5 years
- Pendle: 5 years
- Rossendale: 5 years

Comparing "total spend" across councils is misleading when year counts differ.

### The Fix
All cross-council comparisons MUST use:
1. **Common year range** — Only compare years that ALL councils have data for
2. **Per-year averages** — When showing totals, normalise by year count
3. **Explicit labelling** — Always state: "Based on data from 2021-22 to 2025-26 (5 years common to all councils)"
4. **cross_council.json** — `generate_cross_council.py` should enforce common-year calculation
5. **Spending page** — When "All Years" selected, show total with year count: "£355M over 5 years"

### Implementation
- `doge_analysis.py`: Add `common_years` field to cross-council comparison output
- `CrossCouncil.jsx`: Show footnote with year range used
- `Home.jsx` stats: Use normalised per-year figures for the headline stats

---

## 5. PASSWORD-PROTECTED HOMEPAGE

### Requirement
Temporarily gate the hub page (aidoge.co.uk) behind a simple password while development continues. Individual council pages remain accessible by direct URL.

### Implementation (client-side, no backend)
Add to `burnley-council/hub/index.html`:
- On page load, check `sessionStorage` for auth flag
- If not authenticated, show password overlay (dark modal, single input field)
- Correct password sets sessionStorage flag, reveals the page
- Password: configurable in the JS (not security-critical, just a development gate)
- Individual council URLs (`/lancashire/burnleycouncil/`) are NOT gated

### Why Client-Side
- GitHub Pages has no server-side auth
- This is a development gate, not security (the data is public anyway)
- sessionStorage clears on browser close (no permanent cookies)

---

## 6. IMPROVEMENT ROADMAP

### Phase 1: Data Credibility ✅ COMPLETED (10 Feb 2026)
| # | Task | Status | Result |
|---|------|--------|--------|
| 1.1 | Add confidence levels to all DOGE findings | ✅ Done | high/medium/low on every finding + key finding, ConfidenceBadge renders on cards |
| 1.2 | Reframe Benford's Law finding with context note | ✅ Done | <5% deviation → "Analysis" (info), >5% → "Anomaly" (warning). Only Rossendale flagged |
| 1.3 | Add service-level caveat to cross-council pricing | ✅ Done | Downgraded to info, context_note explaining limitations added |
| 1.4 | Fix duplicate count to exclude CSV republication | ✅ Done | Burnley 298→137, Hyndburn 905→334, Pendle 1283→523, Rossendale 1948→521 |
| 1.5 | Add year-end context to March spending spike | ✅ Done | Renamed "Pattern", fiscal year context, <3x = info |
| 1.6 | Implement common-year comparability in cross_council | ✅ Done | Only compares overlapping fiscal years per supplier |

### Phase 2: Frontend Polish (THIS MONTH)
| # | Task | Impact | Effort |
|---|------|--------|--------|
| 2.1 | Centralise constants (CHART_COLORS, TYPE_LABELS) into utils/constants.js | Maintainability | 30 min |
| 2.2 | Add password gate to hub page | Development protection | 30 min |
| 2.3 | Add article search + pagination (News page) | UX for 44+ articles | 1 hr |
| 2.4 | Add placeholder images for missing article images | Professional appearance | 30 min |
| 2.5 | Add related articles to ArticleView | Engagement, reduce bounce | 30 min |
| 2.6 | Consolidate duplicate CSS patterns | DRY, easier theming | 1 hr |
| 2.7 | Write E2E tests (Playwright already configured) | Regression safety net | 2 hr |
| 2.8 | Add chart accessibility (data tables as fallback) | Inclusivity | 2 hr |

### Phase 3: New Data Sources (THIS MONTH)
| # | Task | Impact | Effort |
|---|------|--------|--------|
| 3.1 | Contracts Finder API integration (`procurement_etl.py`) | Major new DOGE capability | 4 hr |
| 3.2 | Supplier payment timing analysis | Easy win from existing data | 2 hr |
| 3.3 | Councillor allowances data | Transparency of politician costs | 2 hr |
| 3.4 | Charity Commission cross-check | Verify "charities" receiving money | 2 hr |
| 3.5 | More Rossendale articles (currently 6, target 20+) | Content parity | 2 hr |

### Phase 4: World-Class DOGE (NEXT MONTH)
| # | Task | Impact | Effort |
|---|------|--------|--------|
| 4.1 | Procurement compliance page (ProcurementOverview.jsx) | New major section | 8 hr |
| 4.2 | Contract Explorer with search/filter | Users can browse contracts | 4 hr |
| 4.3 | Supplier Win Rate analysis | Who wins most often? | 4 hr |
| 4.4 | Payment velocity analysis | Fast/slow payment patterns | 2 hr |
| 4.5 | "What Changed?" tracking (outcomes.json) | Accountability loop | 2 hr |
| 4.6 | Companies House match rate to 60%+ (fuzzy matching) | More suppliers verified | 4 hr |
| 4.7 | RSS feed per council for articles | SEO + syndication | 1 hr |
| 4.8 | Newsletter generation from top articles | Direct audience engagement | 3 hr |

### Phase 5: Scale (MARCH)
| # | Task | Impact | Effort |
|---|------|--------|--------|
| 5.1 | Add Lancaster as 5th council | Expand coverage | 4 hr |
| 5.2 | Add Ribble Valley as 6th council | Complete East Lancs | 4 hr |
| 5.3 | Per-borough News Lancashire sites (Hyndburn, Pendle, Rossendale) | 3 more local news sites | 2 hr each |
| 5.4 | Dark mode toggle | Modern UX expectation | 2 hr |
| 5.5 | PWA/offline support | Mobile engagement | 2 hr |

---

## 7. PAGE-TYPE STRATEGIES

### Spending Page
- **Data:** spending.json (v3 chunked for mobile)
- **Current:** Good. Web Worker, virtual scroll, year selection, export
- **Improve:** Add supplier payment timing column, link to procurement contracts, add "flag this transaction" citizen reporting

### DOGE / Investigation Page
- **Data:** doge_findings.json, doge_verification.json
- **Current:** Radar chart, severity badges, expandable findings
- **Improve:** Add confidence metadata to every finding. Add "evidence chain" (click finding -> see underlying transactions). Add "investigation hint" vs "proven finding" distinction

### News / Articles
- **Data:** articles-index.json, articles/{id}.json
- **Current:** Category filter, image fallbacks
- **Improve:** Text search, pagination (12 per page), related articles, RSS feed, reading time estimate, tags (currently always empty)

### Budgets
- **Data:** budgets.json OR budgets_govuk.json + revenue_trends.json
- **Current:** Band D comparison, service breakdown, revenue trends
- **Improve:** Year-on-year trend arrows, budget vs actual spend comparison, council tax affordability index

### FOI Templates
- **Data:** foi_templates.json (per council)
- **Current:** 41 templates, copy-to-clipboard, success stories
- **Improve:** Track which FOIs were actually submitted, add outcomes, link to WhatDoTheyKnow responses

### Procurement (NEW)
- **Data:** procurement.json (from Contracts Finder + Find a Tender APIs)
- **Pages:** ProcurementOverview.jsx, ContractExplorer.jsx, SupplierWins.jsx
- **Analysis:** Threshold avoidance, single-bidder contracts, late publication, contract splitting
- **Law:** Procurement Act 2023, Transparency Code 2015, Social Value Act 2012

### Politics
- **Data:** councillors.json, politics_summary.json, wards.json
- **Current:** Ward map, party breakdown, councillor grid
- **Improve:** Add allowances data, voting records (if available), declaration of interests

### My Area
- **Data:** wards.json + councillors.json + postcodes.io API
- **Current:** Ward selection -> councillors + crime stats
- **Improve:** Postcode lookup (enter postcode, get your ward instantly), add deprivation index, add service satisfaction

---

## 8. LEGAL FRAMEWORK EXPANSION

### Currently Tracked (12 laws in legal_framework.json)
Local Government Transparency Code 2015, Freedom of Information Act 2000, Accounts and Audit Regulations 2015, Public Contracts Regulations 2015, Local Audit and Accountability Act 2014, Localism Act 2011, and others.

### Laws to Add
| Law | Why It Matters | DOGE Application |
|-----|---------------|------------------|
| **Procurement Act 2023** | Replaced PCR 2015 from Oct 2024 | New transparency requirements, pipeline notices, KPI publication |
| **Late Payment of Commercial Debts (Interest) Act 1998** | Councils must pay SMEs within 30 days | Payment velocity analysis |
| **Social Value Act 2012** | Procurement must consider social value | Contract award analysis |
| **Public Services (Social Value) Act 2012** | Must consider social, economic, environmental wellbeing | Procurement decisions |
| **Best Value (Accountability for Quality of Local Authority Services)** | Councils must secure continuous improvement | Performance metrics |

---

## 9. AI-FRIENDLY SYSTEM STRUCTURE

### For Claude Code Sessions
```
CLAUDE.md           <- READ FIRST. Dev guide, file locations, build commands
AIDOGE-MASTERPLAN.md <- READ SECOND. Strategy, roadmap, what's working/broken
TODO.md             <- Active task list with checkboxes
MEMORY.md           <- Auto-memory: gotchas, patterns, cross-session learnings
```

### For Finding Things Fast
```
src/pages/{Page}.jsx        <- Every page component
src/components/ui/          <- Shared UI components
src/hooks/                  <- Data hooks
src/workers/                <- Web workers
burnley-council/data/{id}/  <- Per-council data
burnley-council/scripts/    <- Python pipeline
.github/workflows/          <- CI/CD
```

### For Understanding Data Flow
```
Council CSV -> council_etl.py -> spending.json -> Web Worker -> Spending.jsx
                              -> doge_findings.json -> DogeInvestigation.jsx
                              -> articles-index.json -> News.jsx
GOV.UK ODS -> govuk_budgets.py -> budgets_govuk.json -> Budgets.jsx
CH API -> council_etl.py -> supplier enrichment -> Suppliers.jsx
Contracts Finder -> procurement_etl.py (NEW) -> procurement.json -> ProcurementOverview.jsx (NEW)
```

---

## 10. SUCCESS METRICS

| Metric | 7 Feb | 10 Feb | Target | Notes |
|--------|-------|--------|--------|-------|
| Councils live | 4 | 4 | 6+ | Lancaster + Ribble Valley next |
| Total articles | 27 | 89 | 120+ | Rossendale needs 14 more |
| DOGE finding confidence | None | **All rated** | All findings rated | ✅ Phase 1 complete |
| CH match rate | ~20% | ~20% | 60%+ | Fuzzy matching needed |
| Procurement data | None | None | All 4 councils | Phase 3-4 |
| Unit tests | 103 | 168 | 200+ | Good trajectory |
| E2E tests | 0 | 0 | 20+ | Playwright ready, tests not written |
| Monthly cost | £22 | £22 | £22 | LLMs now free (Gemini) |
| Data freshness | Manual | Auto-monitored | Fully auto | Pipeline working |
| Article generation | Manual | Daily auto (2/council) | Daily auto | Working via cron |
| Procurement section | None | None | Live | Phase 4 |

---

## 11. DEADLINES

| Deadline | What | Action |
|----------|------|--------|
| **29 Mar 2026** | Bluehost expires (6 domains) | ADO rebuild must be live before this |
| **Jul 2026** | AWS free tier ends (aws-1, aws-2) | Cancel or migrate workloads |
| **2 Mar 2026** | Codex OpenAI trial expires | Evaluate if worth paying |
| **Ongoing** | LGR timeline | Monitor for council merger implications |

---

*Plan v3.0 authored: 10 February 2026*
*Phase 1 completed: 10 February 2026 (6/6 tasks done)*
*Based on: Full 4-agent codebase audit, live site review, data pipeline analysis, documentation review*
*Next review: After Phase 2 (frontend polish) complete*
