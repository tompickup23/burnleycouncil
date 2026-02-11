# AI DOGE MASTER PLAN v7.0
## 11 February 2026 — Phase 9 Complete, All Systems Live

---

## 1. CURRENT STATE SNAPSHOT

### Live Sites (£22/month total cost)
| Site | URL | Records | Spend | Articles | Procurement | Status |
|------|-----|---------|-------|----------|-------------|--------|
| Burnley | aidoge.co.uk/lancashire/burnleycouncil/ | 30,580 | £355M | 62 | 94 notices | LIVE |
| Hyndburn | aidoge.co.uk/lancashire/hyndburncouncil/ | 29,804 | £211M | 25 | 32 notices | LIVE |
| Pendle | aidoge.co.uk/lancashire/pendlecouncil/ | 49,741 | £125M | 25 | 14 notices | LIVE |
| Rossendale | aidoge.co.uk/lancashire/rossendalecouncil/ | 42,536 | £64M | 22 | 90 notices | LIVE |
| Lancaster | aidoge.co.uk/lancashire/lancastercouncil/ | 24,266 | £142M | 0 | 90 notices | LIVE |
| Ribble Valley | aidoge.co.uk/lancashire/ribblevalleycouncil/ | 3,677 | £12M | 0 | - | LIVE |
| Chorley | aidoge.co.uk/lancashire/chorleycouncil/ | 875 | £142K | 0 | - | LIVE |
| South Ribble | aidoge.co.uk/lancashire/southribblecouncil/ | 15,974 | £146M | 0 | - | LIVE |
| **Total** | | **197,453 txns** | **£1.06B** | **134** | **320+** | |

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
- **200 unit tests** across 22 files
- **31 E2E tests** across 5 files (smoke, news, spending, legal, navigation)
- All tests passing

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
| council_etl.py line ~1016: `or True` CH filter bug | Low | Already patched but check |
| Pendle theme_accent same as Burnley (#0a84ff) | Low | Change Pendle to unique colour |

### Data Consistency Between Councils
| Data File | Burnley | Hyndburn | Pendle | Rossendale | Lancaster | Ribble V | Chorley | South Ribble |
|-----------|---------|----------|--------|------------|-----------|----------|---------|-------------|
| spending.json format | v2 | v2 | v2 | v2 | v2 | v2 | v2 | v2 |
| budgets_govuk.json | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| crime_stats.json | ✓ | ✓ | ✓ | ✓ | - | - | - | - |
| deprivation.json | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| procurement.json | ✓ | ✓ | ✓ | ✓ | ✓ | - | - | - |

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

### Phase 6: Expand Coverage — ✅ COMPLETE (11 Feb 2026)
Focus: Add more Lancashire councils. 4 new councils added, hub redesigned, all data pipelines run.

| # | Task | Status | Result |
|---|------|--------|--------|
| 6.1 | Add Lancaster City Council | ✅ | 24,266 txns, £142M. Custom CSV parser (title row detection). |
| 6.2 | Add Ribble Valley Borough Council | ✅ | 3,677 txns, £12M. Custom CSV parser (title row detection). |
| 6.3 | Add Chorley Borough Council | ✅ | 875 txns, £142K. Purchase card data only (not full supplier payments). |
| 6.4 | Add South Ribble Borough Council | ✅ | 15,974 txns, £146M. Custom CSV parser (User-Agent required). |
| 6.5 | Hub page redesign | ✅ | 8-council grid, accent bars, East/Central+South sections, responsive 4→2→1 |
| 6.6 | Cross-council comparison | ✅ | CrossCouncil.jsx is data-driven — automatically handles all councils via cross_council.json |

### Phase 7: Public Launch Readiness (IN PROGRESS — Feb 2026)
Focus: Make the platform ready for media, public, and councillor use.

| # | Task | Status | Result |
|---|------|--------|--------|
| 7.1 | Remove password gate from hub | ✅ | Gate removed from /lancashire/ hub. Fully public. |
| 7.2 | Dark mode toggle | N/A | Site is already dark-themed. Light mode toggle deferred. |
| 7.3 | PWA / offline support | ✅ | Service worker (cache-first static, network-first data), manifest.webmanifest per council, 192/512px icons. |
| 7.4 | Social sharing meta tags (Open Graph) | ✅ | OG + Twitter cards on hub pages. Per-council OG already existed in index.html template. |
| 7.5 | Google Search Console setup | ✅ | Sitemap index at /sitemap.xml, per-council sitemaps, robots.txt updated for 8 councils. Manual GSC verification still needed. |
| 7.6 | Media kit / press page | ✅ | /press route: elevator pitch, stats, coverage, citations (copy-to-clipboard), methodology, contact, licence. 17 tests. |
| 7.7 | Citizen reporting: "Flag this transaction" | ✅ | Flag icon on each spending row → mailto:press@aidoge.co.uk with pre-filled transaction details. Hidden on mobile. |
| 7.8 | Resume article pipeline + news sites | Pending | Uncomment crons, redeploy full sites (not coming soon pages) |

### Phase 8: Advanced Analysis (Feb 2026)
Focus: Deeper, more sophisticated DOGE analysis.

| # | Task | Status | Result |
|---|------|--------|--------|
| 8.1 | Find a Tender integration | ✅ | FTS ETL script created (fts_etl.py). Requires CDP API key from find-tender.service.gov.uk. Parses OCDS v1.1.5 with bid counts, procedure types. |
| 8.2 | Single-bidder / weak competition detection | ✅ | Proxy signals: short tender periods (<14d), rapid awards (<7d after deadline), category monopolies. Contracts Finder lacks bid counts. |
| 8.3 | Late publication analysis | ✅ | Detects contracts published after award date. Burnley: 74 late (avg 90d delay), Hyndburn: 16 (avg 185d). Frontend table with colour-coded severity. |
| 8.4 | Deprivation index overlay on MyArea | ✅ | IMD 2019 data aggregated LSOA→ward for all 8 councils. Deprivation panel + ward card badges. deprivation_etl.py + deprivation.json × 8. |
| 8.5 | Declaration of interests cross-reference | Pending | Compare councillor interests to suppliers receiving money. Needs FOI data. |
| 8.6 | Service quality correlation | Pending | OFSTED, CQC, other inspectorate data vs spending. Needs external data. |
| 8.7 | Fraud triangle scoring | Pending | Motive + opportunity + rationalisation per department/supplier. Needs audit reports. |

### Phase 9: Quality & Accessibility — ✅ COMPLETE (11 Feb 2026)
Focus: Keyboard accessibility, ARIA compliance, code quality polish. Based on comprehensive quality audit (11 Feb 2026, avg score 7.7/10 → 8.5/10+).

| # | Task | Status | Priority | Details |
|---|------|--------|----------|---------|
| 9.1 | Keyboard accessibility on clickable cards | ✅ | Critical | Added `role="button" tabIndex={0} onKeyDown` to Politics councillor cards, Meetings meeting cards, MyArea ward cards. All interactive elements now keyboard-navigable. |
| 9.2 | ARIA tab pattern on Legal.jsx | ✅ | Critical | Added role="tablist", role="tab" (aria-selected, aria-controls, id), role="tabpanel" (aria-labelledby, id). Screen readers now identify tab interface. |
| 9.3 | articles-index.json format guard | ✅ | Critical | News.jsx + Home.jsx both guard against plain array and `{articles: [...]}` wrapper. `const articles = Array.isArray(raw) ? raw : raw?.articles || []` |
| 9.4 | Chart accessibility | ✅ | High | Added `role="img" aria-label="..."` to chart containers in Home.jsx and CrossCouncil.jsx. ChartCard already had dataTable for screen readers. |
| 9.5 | Extract helpers from render bodies | ✅ | High | `getDeprivationColor` moved to module scope in MyArea.jsx (pure function, no component deps). |
| 9.6 | Static constants outside components | ✅ | High | `partyColors` → module scope (Home.jsx). `SERVICE_CATEGORIES` + `SERVICE_LABELS` → module scope (CrossCouncil.jsx). |
| 9.7 | Clipboard API fallback | ✅ | Medium | Added `fallbackCopy()` using textarea+execCommand for HTTP/older browsers in FOI.jsx and Press.jsx. Graceful degradation. |
| 9.8 | Spending.jsx double query fix | ✅ | Medium | Merged two overlapping useEffects into single effect with `loadedYears` in dependency array. No more double worker messages. |
| 9.9 | Meta tag cleanup | ✅ | Medium | Removed non-standard `meta name="title"` from index.html (duplicate of `<title>` tag). Unused `Mail` import removed from Legal.jsx. |
| 9.10 | Legal.jsx URL hash tabs | ✅ | Medium | Reads hash on mount (e.g. `/legal#privacy`), updates hash on tab change via `replaceState`. `TAB_IDS` constant validates hash. |
| 9.11 | Meetings formatTime midnight fix | Deferred | Low | Cosmetic only, rarely triggered. |
| 9.12 | Press.jsx derive PLATFORM_STATS | Deferred | Low | Would need config refactor. Current hardcoded values are accurate. |
| 9.13 | CrossCouncil ScoreBar ARIA | Deferred | Low | Would need ScoreBar component creation. Current implementation is visual-only. |

---

## 6. PAGE-BY-PAGE STATUS & IMPROVEMENTS

### Spending Page — 9/10 MATURE
- **Strengths:** Web Worker offloading, URL-persisted state, evidence trail banner, ARIA sort headers, CSV export, v3 chunked loading, single merged query effect
- **Fixed (P9):** Double query effect merged into single useEffect
- **Next:** Add "no results" message, chart aria-labels

### DOGE Investigation Page — 8/10 MATURE
- **Strengths:** Self-verification, confidence levels, expandable sections, weak competition + category monopolies, late publication, accountability tracking
- **Next:** Graceful degradation per section, CSS class consolidation, share/copy individual findings

### Procurement / Contract Explorer — 8/10 MATURE
- **Strengths:** Best-in-class ARIA (aria-sort, aria-expanded, role), proper keyboard handling, comprehensive filters
- **Next:** FTS integration (pending API key), CSV export

### News / Articles — 9/10 MATURE
- **Strengths:** Search + filter + pagination, reading time, image error handling, RSS feed, format guard for both array and wrapper formats
- **Fixed (P9):** articles-index.json wrapper guard added
- **Next:** Sort options, surface RSS link on page

### ArticleView — 9/10 MATURE
- **Strengths:** SEO (JSON-LD + OG tags), DOMPurify sanitization, auto-ToC, social sharing
- **Next:** Print button, scroll progress indicator

### Budgets — 8/10 GOOD
- **Strengths:** ARIA tabs, funding breakdown, revenue trends, department detail
- **Next:** Extract BudgetTrendsView to own file, memoize coreDepartments

### Politics — 9/10 MATURE
- **Strengths:** Seat diagram, key figures, party breakdown, keyboard-accessible councillor cards, aria-labeled search/filter
- **Fixed (P9):** Keyboard nav + aria-labels added
- **Next:** Ward detail drill-down

### My Area — 9/10 MATURE
- **Strengths:** Postcode API, deprivation panel + ward badges, keyboard-accessible ward cards, helpers at module scope
- **Fixed (P9):** Keyboard nav on ward cards, getDeprivationColor extracted to module scope
- **Next:** Map visualization

### FOI Templates — 8/10 GOOD
- **Strengths:** Pre-written templates, copy-to-clipboard with fallback, category selection
- **Fixed (P9):** Clipboard API fallback for HTTP/older browsers
- **Next:** Template customization, submission tracking

### Meetings — 8/10 GOOD
- **Strengths:** How-to-attend civic guidance, DOGE relevance indicator, keyboard-accessible meeting cards
- **Fixed (P9):** Keyboard nav on meeting cards
- **Next:** Fix formatTime midnight bug, iCal integration

### Pay Comparison — 8/10 GOOD
- **Strengths:** Comprehensive salary data, gender pay gap, allowances, FOI CTA
- **Next:** Historical trends, national benchmarks

### Cross-Council — 8/10 GOOD
- **Strengths:** Population-normalized metrics, methodology note, chart aria-labels, static constants at module scope
- **Fixed (P9):** serviceCategories/Labels moved to module scope, chart aria-labels added
- **Next:** ScoreBar progressbar ARIA, per-metric drill-down

### Legal — 9/10 MATURE
- **Strengths:** Honest accessibility statement, Elections Act 2022 compliance, full ARIA tab pattern, URL hash deep-linking
- **Fixed (P9):** ARIA tabs (tablist/tab/tabpanel), URL hash (#privacy, #cookies etc.), removed unused import
- **Next:** Update hardcoded dates

### Press — 8/10 GOOD
- **Strengths:** Citation copy buttons with clipboard fallback, methodology section, publisher contact
- **Fixed (P9):** Clipboard API fallback for HTTP/older browsers
- **Next:** Derive stats from data, downloadable media kit

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

| Metric | 7 Feb | 10 Feb (P4) | 11 Feb (P7) | Target | Status |
|--------|-------|-------------|-------------|--------|--------|
| Councils live | 4 | 4 | **8** | 8+ | ✅ Done (Phase 6) |
| Total articles | 27 | **134** | 200+ | Pipeline paused but 134 published |
| DOGE finding confidence | None | **All rated** | All rated | ✅ Done |
| Procurement data | None | **230 notices** | All councils | ✅ Done |
| Contract Explorer | None | **Live** | Advanced search + cross-reference | ✅ Done |
| Supplier concentration (HHI) | None | **Live** | Per-council analysis | ✅ Done |
| Payment velocity | None | **Live** | Rapid payers + patterns | ✅ Done |
| Accountability tracking | None | **Live** | outcomes.json per council | ✅ Done |
| RSS feeds | None | **Live** | Per-council XML | ✅ Done |
| Newsletter generator | None | **Built** | HTML+text per council | ✅ Built (not yet sent) |
| Unit tests | 103 | **168** | **200** | ✅ Done (22 files) |
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
burnley-council/data/{id}/  ← Per-council data (8 councils)
burnley-council/data/shared/ ← legal_framework.json, doge_knowledge_core.json
burnley-council/scripts/    ← 17 Python ETL/analysis scripts
.github/workflows/          ← deploy.yml (auto-deploy on push to main)
e2e/                        ← 5 Playwright E2E test files
__tests__/                  ← 20 Vitest unit test files
```

---

*Plan v7.0 updated: 11 February 2026*
*Phases 1-9 completed: 11 February 2026 — 8 councils live, £1B+ tracked, 200 tests, avg page quality 8.5/10+*
*Phase 9 complete: 10/13 items done (3 low-priority deferred). Keyboard a11y, ARIA tabs, clipboard fallback, format guards, hash tabs, double query fix, chart labels, module-scope constants.*
*Next: Phase 8.5-8.7 (external data: declaration of interests, OFSTED/CQC, audit reports)*
