# AI DOGE MASTER PLAN v13.0
## 15 February 2026 — Phases 1-14 Complete, All 15 Lancashire Councils Live, Phase 15 Planned

---

## 1. CURRENT STATE SNAPSHOT

### Live Sites (£22/month total cost) — ALL 15 LANCASHIRE COUNCILS
| Site | URL | Records | Spend | Politics | Status |
|------|-----|---------|-------|----------|--------|
| Burnley | aidoge.co.uk/lancashire/burnleycouncil/ | 30,580 | £355M | 45 councillors | LIVE |
| Hyndburn | aidoge.co.uk/lancashire/hyndburncouncil/ | 29,804 | £211M | 34 councillors | LIVE |
| Pendle | aidoge.co.uk/lancashire/pendlecouncil/ | 49,741 | £125M | 49 councillors | LIVE |
| Rossendale | aidoge.co.uk/lancashire/rossendalecouncil/ | 42,536 | £64M | 36 councillors | LIVE |
| Lancaster | aidoge.co.uk/lancashire/lancastercouncil/ | 26,975 | £157M | 61 councillors | LIVE |
| Ribble Valley | aidoge.co.uk/lancashire/ribblevalleycouncil/ | 13,723 | £38M | 40 councillors | LIVE |
| Chorley | aidoge.co.uk/lancashire/chorleycouncil/ | 21,421 | £365M | 42 councillors | LIVE |
| South Ribble | aidoge.co.uk/lancashire/southribblecouncil/ | 16,065 | £147M | 50 councillors | LIVE |
| Preston | aidoge.co.uk/lancashire/prestoncouncil/ | 46,711 | £205M | 48 councillors | LIVE |
| West Lancashire | aidoge.co.uk/lancashire/westlancashirecouncil/ | 43,063 | £333M | 45 councillors | LIVE |
| Wyre | aidoge.co.uk/lancashire/wyrecouncil/ | 51,092 | £678M | 50 councillors | LIVE |
| Fylde | aidoge.co.uk/lancashire/fyldecouncil/ | 37,514 | £155M | 37 councillors | LIVE |
| Lancashire CC | aidoge.co.uk/lancashire/lancashirecc/ | 753,220 | £3.6B | 84 councillors | LIVE |
| Blackpool | aidoge.co.uk/lancashire/blackpoolcouncil/ | 630,914 | £4.1B | 42 councillors | LIVE |
| Blackburn | aidoge.co.uk/lancashire/blackburncouncil/ | 492,973 | £1.7B | 51 councillors | LIVE |
| **Total** | | **2,286,332 txns** | **£12B+** | **648 councillors** | |

### News Sites
| Site | URL | Status | Why |
|------|-----|--------|-----|
| News Lancashire | newslancashire.co.uk | ACTIVE | Pipelines resumed 12 Feb. |
| News Burnley | newsburnley.co.uk | ACTIVE | Pipelines resumed 12 Feb. |

### Autonomous Systems
| Cron | Server | Time | Status | What |
|------|--------|------|--------|------|
| data_monitor.py | vps-main | 07:00 | ACTIVE | Check councils for new spending CSVs |
| auto_pipeline.py | vps-main | 08:00 | ACTIVE | ETL + DOGE analysis + WhatsApp notify |
| article_pipeline.py | vps-main | 09:00 | ACTIVE | AI article generation (2/council/day) |
| deploy_newslancashire.sh | vps-main | 10:00 | ACTIVE | Hugo build + Cloudflare deploy |
| deploy_newsburnley.sh | vps-main | 10:30 | ACTIVE | Rsync + Cloudflare deploy |
| pipeline_v4.sh | vps-news | */30 | ACTIVE | News crawl + AI rewrite + export |
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
ModernGov     → councillors_etl.py → councillors.json, politics_summary.json, wards.json
```

### 11 Shared Components
Layout, ScrollToTop, ChartCard, DataFreshness, ErrorBoundary, LoadingState, PageHeader, SearchableSelect, StatCard, TabNav + barrel index.js

### Test Coverage
- **204 unit tests** across 22 files
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
| ~~Pendle theme_accent same as Burnley~~ | ✅ Fixed | Changed Pendle to #F9A825 (amber) — 12 Feb 2026 |

### Data Consistency Between Councils
| Data File | Burnley | Hyndburn | Pendle | Rossendale | Lancaster | Ribble V | Chorley | South Ribble |
|-----------|---------|----------|--------|------------|-----------|----------|---------|-------------|
| spending.json format | v2 | v2 | v2 | v2 | v2 | v2 | v2 | v2 |
| Spending date range | 2021-2025 | 2016-2026 | 2021-2026 | 2021-2026 | 2021-2025 | 2024-2025 | 2021-2025 | 2021-2025 |
| budgets.json (detailed) | ✓ | ✓ | - | - | - | - | - | - |
| budget_insights.json | ✓ | ✓ | - | - | - | - | - | - |
| budgets_govuk.json | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| revenue_trends.json | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| crime_stats.json | - | - | - | ✓ | - | - | - | - |
| deprivation.json | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| procurement.json | ✓ | ✓ | ✓ | ✓ | ✓ | ✓(21) | ✓(150) | ✓(88) |
| doge_findings.json | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| DOGE page enabled | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| articles (count) | 62 | 25 | 25 | 22 | 5 | 5 | 5 | 5 |
| outcomes.json | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| foi_templates.json | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### Critical Data Gaps (Phase 10 status — ALL RESOLVED)
| Council | Gap | Severity | Status |
|---------|-----|----------|--------|
| ALL except Burnley | Budget page shows wrong/stale £17.3M figure | CRITICAL | ✅ FIXED — config.json budgets:false, BudgetTrendsView enhanced with budgets_summary.json |
| Chorley | Only 875 txns / £142K (purchase cards) | CRITICAL | ✅ FIXED — parse_chorley() updated for CIPFA format. Now 17,212 txns / £338M |
| Ribble Valley | Only 3,677 txns from Apr 2024 (1 year) | HIGH | ✅ Confirmed — council only publishes from 2024. Config updated. Data confidence banners added. |
| Lancaster | Missing 2021/22 Q1 spending data | HIGH | ✅ FIXED — parse_date() missing `%b %d, %Y` format. Now 27,317 txns / £157M (+2,724 records) |
| South Ribble | Data stops Mar 2025 | MEDIUM | ✅ Verified current — no newer CSVs available from portal |
| 4 newer councils | No DOGE investigation page | HIGH | ✅ FIXED — all 8 councils have DOGE enabled |
| 4 newer councils | Zero articles | MEDIUM | ✅ FIXED — 20 seed articles created (5 per council) |
| RV/Chorley/SR | No procurement data | MEDIUM | ✅ FIXED — RV 21, Chorley 150, SR 88 contracts |
| 4 newer councils | No crime stats | MEDIUM | ✅ FIXED — police_etl.py run on VPS for all 4, config enabled |

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
| 6.1 | Add Lancaster City Council | ✅ | 27,317 txns, £157M. Custom CSV parser (title row detection). Date format fix added `%b %d, %Y`. |
| 6.2 | Add Ribble Valley Borough Council | ✅ | 3,767 txns, £12M. Custom CSV parser (title row detection). Only publishes from Apr 2024. |
| 6.3 | Add Chorley Borough Council | ✅ | 17,212 txns, £338M. Dual-format CIPFA (16-col) + PCard (10-col) detection. |
| 6.4 | Add South Ribble Borough Council | ✅ | 16,065 txns, £147M. Custom CSV parser (User-Agent required). |
| 6.5 | Hub page redesign | ✅ | 8-council grid, accent bars, East/Central+South sections, responsive 4→2→1 |
| 6.6 | Cross-council comparison | ✅ | CrossCouncil.jsx is data-driven — automatically handles all councils via cross_council.json |

### Phase 7: Public Launch Readiness — ✅ COMPLETE (12 Feb 2026)
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
| 7.8 | Resume article pipeline + news sites | ✅ | All 4 crons resumed 12 Feb: article_pipeline.py (09:00 vps-main), deploy_newslancashire.sh (10:00 vps-main), deploy_newsburnley.sh (10:30 vps-main), pipeline_v4.sh (*/30 vps-news). |

### Phase 8: Advanced Analysis — ✅ COMPLETE (12 Feb 2026)
Focus: Deeper, more sophisticated DOGE analysis. 8.5/8.6 deferred to Phase 11 (LCC expansion, where upper-tier data is available).

| # | Task | Status | Result |
|---|------|--------|--------|
| 8.1 | Find a Tender integration | ✅ | FTS ETL script created (fts_etl.py). Requires CDP API key from find-tender.service.gov.uk. Parses OCDS v1.1.5 with bid counts, procedure types. |
| 8.2 | Single-bidder / weak competition detection | ✅ | Proxy signals: short tender periods (<14d), rapid awards (<7d after deadline), category monopolies. Contracts Finder lacks bid counts. |
| 8.3 | Late publication analysis | ✅ | Detects contracts published after award date. Burnley: 74 late (avg 90d delay), Hyndburn: 16 (avg 185d). Frontend table with colour-coded severity. |
| 8.4 | Deprivation index overlay on MyArea | ✅ | IMD 2019 data aggregated LSOA→ward for all 8 councils. Deprivation panel + ward card badges. deprivation_etl.py + deprivation.json × 8. |
| 8.5 | Declaration of interests cross-reference | Deferred | Needs councillor interest register data. ModernGov scraping or FOI. Will implement when LCC expansion begins (Phase 11). |
| 8.6 | Service quality correlation | Deferred | Ofsted/CQC primarily upper-tier (county council) responsibility. Will implement alongside LCC expansion (Phase 11). |
| 8.7 | Fraud triangle scoring | ✅ | Three-dimension risk model (opportunity/pressure/rationalization) scoring 0-100 per council. Synthesises existing DOGE signals (splits, duplicates, CH compliance, concentration, Benford's, procurement). Radar chart + signal breakdown on DOGE page. |

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

### Phase 10: Data Completeness & Accuracy — ✅ COMPLETE (12 Feb 2026)
Focus: Fix the budget display bug, fill all data gaps so every council has comprehensive coverage from 2021/22 onwards, enable DOGE + articles + procurement for all 8 councils. Goal: no council should feel "half-built."

#### 10.1 — CRITICAL: Fix Budget Page Display Bug ✅ COMPLETED
| # | Task | Status | Details |
|---|------|--------|---------|
| 10.1.1 | Fix config.json for 6 councils | ✅ Done | Set `budgets: false` for Pendle, Rossendale, Lancaster, Ribble Valley, Chorley, South Ribble. |
| 10.1.2 | Verify BudgetTrendsView renders correctly | ✅ Done | Confirmed GOV.UK trends rendering path activates with budgets:false + budget_trends:true. |
| 10.1.3 | Enhance BudgetTrendsView with budgets_summary.json | ✅ Done | Added Band D Council Tax History chart + Detailed Service Breakdown table from budgets_summary.json as third data source. |
| 10.1.4 | Generate budgets.json for Pendle + Rossendale | Deferred | Requires manual budget book parsing — low ROI given BudgetTrendsView enhancement. |
| 10.1.5 | Generate budget_insights.json for all councils | Deferred | Requires script extension — lower priority now that BudgetTrendsView has richer data. |

#### 10.2 — CRITICAL: Spending Data Coverage Gaps ✅ COMPLETED
**Key Discovery:** Chorley had 44 CIPFA full supplier payment CSV files that were being completely ignored! The `parse_chorley()` function only handled the 2 purchase card files. Fixed to detect and parse both formats. Lancaster had a date parser bug (`%b %d, %Y` format missing).

| # | Task | Status | Details |
|---|------|--------|---------|
| 10.2.1 | Fix Chorley CIPFA parser | ✅ Done | **Major fix:** parse_chorley() now detects CIPFA (16-col) vs PCard (10-col) format. Chorley went from 885 txns/£142K to **17,212 txns/£338M** — a 20x improvement. |
| 10.2.2 | Investigate Ribble Valley historical CSVs | ✅ Done | Only data from Apr 2024 onwards (14 files). No historical data found. Config updated to "April 2024 – present". |
| 10.2.3 | Fix Lancaster 2021/22 Q1 gap | ✅ Done | **Root cause:** `parse_date()` was missing `%b %d, %Y` format (e.g. "Jun 28, 2021"). Added it → Lancaster jumped 24,593→**27,317 records** (+2,724). Full 2021/22 year now covered. 2022/23 genuinely missing from portal. |
| 10.2.4 | Update South Ribble with latest CSVs | ✅ Done | Verified data current to Mar 2025. No newer CSVs available from portal yet. |
| 10.2.5 | Re-run council_etl.py for Chorley | ✅ Done | 17,212 records, £338M, 1,786 suppliers, 4 financial years. |
| 10.2.6 | Update configs with accurate data periods | ✅ Done | Chorley: "January 2021 – present", Ribble Valley: "April 2024 – present". doge_context updated. |
| 10.2.7 | Add data confidence banners | ✅ Done | Limited data warning on Spending + DOGE pages when <5,000 records. Shows record count + data period. |

#### 10.3 — HIGH: Enable DOGE Investigation for All Councils ✅ COMPLETED
| # | Task | Status | Details |
|---|------|--------|---------|
| 10.3.1 | Set doge_investigation: true for 4 newer councils | ✅ Done | Lancaster, Ribble Valley, Chorley, South Ribble all enabled. |
| 10.3.2 | Re-run doge_analysis.py for all 8 councils | ✅ Done | All councils regenerated. Chorley now has meaningful findings: HHI=2131 (moderate concentration), 87 late publications, 7 weak competition, 2 monopoly categories. |
| 10.3.3 | DOGE nav already config-driven | ✅ N/A | Layout.jsx `requires: 'doge_investigation'` handles this automatically. |
| 10.3.4 | Data confidence banners for small datasets | ✅ Done | Merged into 10.2.7. |

#### 10.4 — HIGH: Procurement Data for Missing Councils ✅ COMPLETED
| # | Task | Status | Details |
|---|------|--------|---------|
| 10.4.1 | Run procurement_etl.py for Ribble Valley | ✅ Done | 21 contracts found. |
| 10.4.2 | Run procurement_etl.py for Chorley | ✅ Done | 150 contracts found. |
| 10.4.3 | Run procurement_etl.py for South Ribble | ✅ Done | 88 contracts found. |
| 10.4.4 | Enable procurement nav | ✅ N/A | Already enabled in config.json for all councils. |
| 10.4.5 | Re-run procurement for existing councils | Deferred | Can refresh later — current data is from Feb 2026. |

#### 10.5 — HIGH: Crime Stats Expansion ✅ COMPLETED
| # | Task | Status | Details |
|---|------|--------|---------|
| 10.5.1 | Add all 8 councils to police_etl.py | ✅ Done | Added Lancaster, Ribble Valley, Chorley, South Ribble to BOROUGH_CONFIG. Argparse now uses `list(BOROUGH_CONFIG.keys())`. |
| 10.5.2 | Run police_etl.py for all councils | ✅ Done | Ran on VPS (Python 3.13, OpenSSL 3.5.3). Lancaster 27 wards ~1,250 crimes/mo, Ribble Valley 26 wards ~310 crimes/mo, Chorley 14 wards ~850 crimes/mo, South Ribble 23 wards ~810 crimes/mo. |
| 10.5.3 | Enable crime_stats in config.json | ✅ Done | All 4 new councils now have `crime_stats: true`. |
| 10.5.4 | Verify MyArea crime display | ✅ Done | Builds verified for all councils. |

#### 10.6 — MEDIUM: Article Generation for New Councils ✅ COMPLETED
| # | Task | Priority | Details |
|---|------|----------|---------|
| 10.6.1 | Create seed articles for 4 new councils | ✅ Done | 20 seed articles created (5 per council): spending overview, duplicates, procurement, plus council-specific topics (Lancaster Eden Project, Chorley shared services, RV crime, SR Caddick Construction). |
| 10.6.2 | Enable news navigation for new councils | ✅ N/A | News nav already enabled via `news: true` in config.json. |
| 10.6.3 | Resume article_pipeline.py cron | ✅ Done | Cron uncommented on vps-main 12 Feb. Runs daily at 09:00 UTC, 2 articles/council/day. |

#### 10.7 — MEDIUM: Data Accuracy & Context ✅ COMPLETED
**Problem:** Data without context is misleading. Small datasets need explicit warnings; cross-council comparisons need fairness guards.

| # | Task | Priority | Details |
|---|------|----------|---------|
| 10.7.1 | Add data confidence banners | ✅ Done | Spending + DOGE already had banners. Added CrossCouncil.jsx `cross-data-banner` for low-data councils + year-range differences. |
| 10.7.2 | Fix CrossCouncil comparisons | ✅ Done | All metrics annualized (annual_spend, annual_records, num_years). Methodology section shows per-council data periods. Data confidence banner warns about year-range differences. |
| 10.7.3 | Update Home page stats dynamically | ✅ Done | Verified: Home.jsx already derives all headline stats (totalSpend, totalRecords, uniqueSuppliers, periodLabel) from insights.json, not config values. No code change needed. |
| 10.7.4 | Validate budgets_summary.json accuracy | ✅ Done | Cross-checked against GOV.UK ODS source files: 48/48 council tax Band D figures exact match (all 3 series × 8 councils × 2 years). 8/8 revenue expenditure figures match (3 councils have sub-thousand precision from detailed RO forms vs GOV.UK rounded summary — not errors, higher fidelity). doge_context transaction counts synced with insights.json for 6 councils. Pendle theme_accent changed from #0a84ff (duplicate of Burnley) to #F9A825 (amber). |

#### Phase 10 Dependencies & Execution Order
```
10.1 (Budget fix)     → Can be done immediately, no external dependencies
10.2 (Spending gaps)  → Requires CSV source research + ETL re-runs
10.3 (DOGE enable)    → Depends on 10.2.5 (latest spending data for analysis)
10.4 (Procurement)    → Can run in parallel with 10.2 (Contracts Finder API is independent)
10.5 (Crime stats)    → Can run in parallel (Police API is independent)
10.6 (Articles)       → Depends on 10.3 (need DOGE findings to generate articles from)
10.7 (Data accuracy)  → Can start immediately, ongoing
```

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

### The Tier Problem
Councils at different tiers provide DIFFERENT SERVICES and are NOT directly comparable:
- **District vs District**: Valid comparison (same services: housing, waste collection, planning)
- **Unitary vs Unitary**: Valid comparison (same services: all local government functions)
- **District vs County**: INVALID — different services entirely
- **District vs Unitary**: INVALID unless using "Full Picture" mode (district + county share)
- **"Full Picture"**: District spend + population-proportioned LCC share ≈ unitary equivalent

### The Time Problem
Councils publish different year ranges and have different thresholds:
- Hyndburn: 10 years (2016-2026), £250 threshold — deepest history
- Burnley: 5 years (2021-2026), £500 threshold
- Ribble Valley: 10 months (2024-2025), £250 threshold — shallowest
- Chorley: 4 years (2021-2024), £500 threshold — stale since Dec 2024

### Rules (all implemented)
1. **Common year range** — Cross-council comparisons only use overlapping years (2021-22 to 2025-26)
2. **Per-year averages** — Normalise by year count when showing totals
3. **Explicit labelling** — Always state the comparison period
4. **Threshold awareness** — Hyndburn/RV/SR £250 threshold means more transactions visible vs others' £500
5. **Tier-aware comparison** (Phase 12) — Only compare within same tier. Explain why tiers differ.
6. **"Full Picture" composite** (Phase 12) — For LGR: district + county share = synthetic unitary for valid comparison against Blackpool/Blackburn

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

*Plan v12.0 updated: 12 February 2026*
*Phases 1-10 completed: 12 February 2026 — 8 councils live, £1.41B tracked, 200 tests, avg page quality 8.5/10+*
*v12.0 (12 Feb): Comprehensive multi-tier architecture plan. Phases 11-15 cover all 15 Lancashire councils (12 districts + 1 county + 2 unitaries). LGR tracker planned for Phase 15. Three-tier service comparability framework designed.*
*Phase 8 (12 Feb): Fraud triangle analysis (Phase 8.7). doge_knowledge.json for all 8 councils.*

---

## 13. LANCASHIRE LOCAL GOVERNMENT: THREE-TIER ARCHITECTURE

### The 15 Lancashire Councils
Lancashire has a **three-tier** local government structure. Understanding this is CRITICAL for comparability:

| Tier | Authority | Type Code | Services | Budget Scale | Count |
|------|-----------|-----------|----------|-------------|-------|
| **Upper** | Lancashire County Council | `county` | Education, social care, highways, fire, waste disposal, libraries, public health | £1,324M | 1 |
| **Unitary** | Blackpool, Blackburn with Darwen | `unitary` | ALL services (combined district + county) | £300-500M est. | 2 |
| **Lower** | 12 district/borough/city councils | `district` | Housing, planning, waste collection, leisure, council tax collection, parking | £12-355M | 12 |

### Service Scope Comparison
```
UPPER TIER (LCC)              LOWER TIER (Districts)         UNITARY (Blackpool/Blackburn)
─────────────────             ──────────────────────         ─────────────────────────────
Education (£450M+)            Housing & planning             ALL of upper tier services
Adult social care (£370M+)    Waste collection               + ALL of lower tier services
Children's services           Leisure centres                = Complete local government
Highways & transport          Council tax collection
Fire & rescue                 Car parks & parking
Waste disposal                Env. health & licensing
Libraries                     Local planning
Public health                 Street cleaning
Trading standards             Elections administration
```

### Why This Matters for AI DOGE
1. **Burnley ≠ Lancashire** — Burnley spends £355M on housing, waste collection, leisure. LCC spends £1,324M on education, social care, highways. Completely different services.
2. **LCC + Burnley ≈ Blackpool** — A district council PLUS its county council together provide roughly the same services as a unitary authority. This is key to LGR assessment.
3. **Districts ARE comparable to each other** — All 12 districts provide similar services at similar scales. Cross-district comparison is valid.
4. **Unitaries ARE comparable to each other** — Blackpool vs Blackburn with Darwen is valid. Also comparable to "district + county share" synthetic authorities.
5. **LGR makes this essential** — If Lancashire abolishes all 15 councils and creates 2-3 unitaries, we need to model what the successor authorities inherit.

### All 15 Lancashire Councils
| # | Council | Type | ONS Code | Status | Data | Notes |
|---|---------|------|----------|--------|------|-------|
| 1 | Burnley | district | E07000117 | ✅ LIVE | 30,580 txns / £355M | |
| 2 | Hyndburn | district | E07000120 | ✅ LIVE | 29,802 txns / £211M | |
| 3 | Pendle | district | E07000122 | ✅ LIVE | 48,785 txns / £127M | |
| 4 | Rossendale | district | E07000125 | ✅ LIVE | 42,536 txns / £64M | |
| 5 | Lancaster | city/district | E07000121 | ✅ LIVE | 26,975 txns / £157M | |
| 6 | Ribble Valley | district | E07000124 | ✅ LIVE | 3,677 txns / £12M | Only from Apr 2024 |
| 7 | Chorley | district | E07000118 | ✅ LIVE | 17,052 txns / £338M | Stale — data to Dec 2024 |
| 8 | South Ribble | district | E07000126 | ✅ LIVE | 15,974 txns / £146M | Data to Mar 2025 |
| 9 | Preston | city/district | E07000123 | PLANNED | — | Spending URL TBC |
| 10 | West Lancashire | district | E07000127 | PLANNED | — | Spending URL TBC |
| 11 | Fylde | district | E07000119 | PLANNED | — | Spending URL TBC |
| 12 | Wyre | district | E07000128 | PLANNED | — | Spending URL TBC |
| 13 | **Lancashire CC** | **county** | **E10000017** | PLANNED | — | £1.3B budget, 100K+ txns expected |
| 14 | **Blackpool** | **unitary** | **E06000009** | PLANNED | budgets only | Budget data in govuk_budgets.py |
| 15 | **Blackburn w/ Darwen** | **unitary** | **E06000008** | PLANNED | budgets only | Budget data in govuk_budgets.py |

### Data Gaps to Fill (Existing 8 Councils)
| Council | Issue | Severity | Action |
|---------|-------|----------|--------|
| Chorley | Data stops Dec 2024 (14 months stale) | HIGH | Re-crawl for 2025 CSVs |
| Ribble Valley | Only 10 months of data (Apr 2024 – Jan 2025) | HIGH | Check for older CSVs on council site |
| Lancaster | Data stops Sep 2025 | MEDIUM | Re-crawl for latest quarter |
| South Ribble | Data stops Mar 2025 | MEDIUM | Re-crawl when new CSVs available |
| Hub page | Stats stale (Chorley shows "885", Lancaster shows "24,593") | HIGH | Update to current figures |
| Fraud triangle | Code written but not run — no councils have fraud_triangle in doge_findings.json | HIGH | Re-run doge_analysis.py |

---

## 14. EXPANSION PHASES (11-15)

### Phase 11: Data Gap Fill & Hardening (NEXT)
Focus: Fill gaps in existing 8 councils, run new analysis, update hub. Get the existing platform to maximum quality before expanding.

| # | Task | Priority | Details |
|---|------|----------|---------|
| 11.1 | Re-crawl Chorley for 2025 spending data | HIGH | Check chorley.gov.uk/transparency/spending-over-500 for new CSVs since Dec 2024. Run council_etl.py --council chorley. |
| 11.2 | Re-crawl Ribble Valley for historical data | HIGH | Check ribblevalley.gov.uk for any older spending CSVs (pre-Apr 2024). |
| 11.3 | Re-crawl Lancaster for latest quarter | MEDIUM | Check lancaster.gov.uk for CSVs after Sep 2025. |
| 11.4 | Re-crawl South Ribble for 2025/26 data | MEDIUM | Check southribble.gov.uk for CSVs after Mar 2025. |
| 11.5 | Update hub page stats | HIGH | Fix stale figures: Chorley 885→17,052, Lancaster 24,593→26,975, stats line 197K→215K. |
| 11.6 | Run doge_analysis.py with fraud triangle | HIGH | Generate fraud_triangle data in doge_findings.json for all 8 councils. |
| 11.7 | Add `council_tier` to all config.json files | MEDIUM | Add `"council_tier": "district"` to all 8 configs. Future-proofing for multi-tier comparison. |
| 11.8 | Declaration of interests (if data available) | LOW | Check ModernGov for councillor interest registers. May defer to Phase 13. |

### Phase 12: Multi-Tier Architecture
Focus: Restructure the platform to support county, unitary, and district councils as distinct tiers with appropriate comparison frameworks.

| # | Task | Priority | Details |
|---|------|----------|---------|
| 12.1 | Add `council_tier` field to config.json schema | HIGH | Values: `district`, `county`, `unitary`. Controls comparison grouping, hub placement, service scope display. |
| 12.2 | Restructure hub page to be tier-aware | HIGH | Three sections: "County Council" (1), "Unitary Authorities" (2), "District Councils" (12). Data-driven from config files or hub manifest JSON. |
| 12.3 | Tier-aware cross-council comparison | HIGH | CrossCouncil.jsx: only compare within same tier. Districts vs districts, unitaries vs unitaries. Add explanation of why tiers aren't compared. |
| 12.4 | "Full Picture" composite view | MEDIUM | New component: "What does it cost to run [district]?" = district spend + LCC share (population-proportioned). Enables comparison against unitaries. |
| 12.5 | Service scope badges on council pages | MEDIUM | Show which services the council provides (housing ✓, education ✗ for districts). Helps citizens understand tier split. |
| 12.6 | Update deploy.yml for N councils | MEDIUM | Move from hardcoded 8 build steps to a loop over COUNCIL_REGISTRY. |
| 12.7 | Add `comparable_councils` to config | LOW | Explicit list of valid comparison targets per council. |

### Phase 13: Lancashire County Council
Focus: Add LCC as the first upper-tier authority. This is the most complex addition — £1.3B budget, 100K+ transactions, unique DOGE issues (VeLTIP, DSG, CQC).

| # | Task | Priority | Details |
|---|------|----------|---------|
| 13.1 | Parse LCC spending CSVs | HIGH | Find CSV format at lancashire.gov.uk/council/finance/spending-over-500/. Write `parse_lancashire_cc()`. Expect 100K+ txns. |
| 13.2 | Create LCC config.json | HIGH | `council_tier: "county"`, all features enabled. Budget data already in govuk_budgets.py (E10000017). |
| 13.3 | Scale worker for LCC volume | HIGH | 100K+ txns = ~80MB spending.json. v3 chunking essential. Test year-chunk sizes. May need sub-year splitting (quarterly). |
| 13.4 | LCC-specific DOGE modules | HIGH | Custom analysis for: VeLTIP bonds (£350m paper loss), DSG deficit (£95.5m→£419.9m), savings delivery (48%), CQC (2.0/4), capital slippage (32%), Operation Sheridan. |
| 13.5 | LCC politics page | MEDIUM | 84 councillors, 7 parties, Reform UK majority. ModernGov scraping for meeting data + recorded votes. |
| 13.6 | LCC budget deep-dive | MEDIUM | £1.324B breakdown. Parse 452-page budget PDF or use MHCLG data + manual enhancement. |
| 13.7 | Run all ETL pipelines for LCC | MEDIUM | council_etl, doge_analysis, procurement_etl, police_etl, deprivation_etl, govuk_budgets. |
| 13.8 | Verify "Full Picture" mode | LOW | Test LCC + each district = synthetic unitary. Compare against Blackpool/Blackburn. |

### Phase 14: Remaining District Councils + Unitaries
Focus: Add the 4 missing districts (Preston, West Lancs, Fylde, Wyre) and 2 unitaries (Blackpool, Blackburn with Darwen).

| # | Task | Priority | Details |
|---|------|----------|---------|
| 14.1 | Add Preston City Council | HIGH | Find spending CSV URL. Write parser. ONS code E07000123. |
| 14.2 | Add West Lancashire Borough Council | HIGH | Find spending CSV URL. Write parser. ONS code E07000127. |
| 14.3 | Add Fylde Borough Council | MEDIUM | Find spending CSV URL. Write parser. ONS code E07000119. |
| 14.4 | Add Wyre Borough Council | MEDIUM | Find spending CSV URL. Write parser. ONS code E07000128. |
| 14.5 | Add Blackpool Council | HIGH | Find spending CSV URL. Budget data already exists. `council_tier: "unitary"`. ONS code E06000009. |
| 14.6 | Add Blackburn with Darwen Borough Council | HIGH | Find spending CSV URL. `council_tier: "unitary"`. ONS code E06000008. |
| 14.7 | Run all ETL pipelines for 6 new councils | HIGH | Full pipeline per council: spending, DOGE, procurement, deprivation, police, budgets. |
| 14.8 | Cross-tier comparison validation | MEDIUM | Verify district-to-district, unitary-to-unitary comparisons work. Test "full picture" composites. |

### Phase 15: Complete Lancashire & LGR Tracker
Focus: With all 15 councils live, build the LGR transition tracker — a unique product no one else has.

| # | Task | Priority | Details |
|---|------|----------|---------|
| 15.1 | LGR transition tracker page | HIGH | New page: map proposed unitary boundaries, model financial positions of successor authorities, track consultation progress. |
| 15.2 | "What your area costs" calculator | HIGH | Postcode → ward → district + LCC share → total cost per household. Compare against unitary equivalent. |
| 15.3 | Financial handover dashboard | HIGH | For each proposed unitary: aggregate all constituent council spending, debt, reserves, pension obligations. Show what the new authority inherits. |
| 15.4 | Service gap analysis | MEDIUM | Map all services by provider. Identify where LGR creates gaps or duplications. |
| 15.5 | 15-council cross-analysis | MEDIUM | Run doge_analysis.py cross-council with all 15. Largest cross-council pricing comparison in Lancashire history. |
| 15.6 | Historical spending archive | LOW | Preserve pre-LGR spending data. When councils cease to exist (spring 2028), this becomes the historical record. |
| 15.7 | National expansion planning | LOW | Architecture lessons learned for expanding beyond Lancashire (other two-tier counties: Kent, Hampshire, etc.) |

### Execution Order
```
Phase 11 (DONE)    → Data gap fill, fraud triangle, hub stats
Phase 12 (DONE)    → Multi-tier architecture, Census 2021 demographics
Phase 13 (DONE)    → LCC (753K txns, £3.6B, v4 monthly chunks)
Phase 14 (DONE)    → 4 districts + 2 unitaries (all 15 councils live)
Phase 14b (DONE)   → Politics data all 15 councils (councillors_etl.py, 648 councillors)
Phase 15 (NEXT)    → LGR tracker + "what your area costs" calculator
```

### LGR Context (Local Government Reorganisation)
- **Government consultation**: Launched 5 Feb 2026. Proposes abolishing all 15 Lancashire councils.
- **Timeline**: New unitary authorities by spring 2028 (shadow authorities elected ~2027).
- **AI DOGE's unique position**: With all 15 councils' spending data, we can model the financial position of successor authorities better than anyone — including the Government's own analysis.
- **Key questions we can answer**: What does each proposed unitary inherit? Where are the financial risks? Which services have the biggest gaps? What happens to joint arrangements (Chorley–South Ribble shared services, LCC-district transfers)?

---

## 15. LCC REFERENCE DATA

### LCC-Specific Data Sources
| Source | URL | Notes |
|--------|-----|-------|
| Spending >£500 | lancashire.gov.uk/council/finance/spending-over-500/ | Monthly CSVs, likely large (£1.3B budget) |
| Budget reports | council.lancashire.gov.uk (Cabinet papers) | 452-page PDF for 2026/27 budget pack |
| Full Council minutes | council.lancashire.gov.uk | Recorded votes available per meeting |
| Treasury Management | In budget pack | VeLTIP bond details, borrowing strategy |
| CQC Assessment | cqc.org.uk | "Requires Improvement" (2.0/4) |
| Standing Orders | lancashire.gov.uk/council/constitution | Section B: Full Council Procedural Standing Orders |
| MHCLG Budgets | GOV.UK | Already handled by govuk_budgets.py (E10000017) |

### Key LCC Financial Data (for DOGE analysis)
- **VeLTIP**: £519m invested in bonds, ~£169m current value (~£350m paper loss). Maturity up to 92 years. Annual income £16.9m.
- **DSG deficit**: £95.5m (2025/26) → £171.4m → £296.5m → £419.9m by 2028/29. Borrowing costs £11.5m→£25.6m.
- **Savings delivery**: 91.5% (2023/24) → 48% (2024/25). £103m needed over 2 years. Phase 1 efficiency review found £22m.
- **Adult Services**: CQC 2.0/4. 2,100 waiting initial assessment. 3,800+ waiting annual review (some 7+ years).
- **Capital programme**: £292m budget, £95.8m slippage (32%) in 2025/26.
- **Pension**: £21.2m reduction from triennial actuarial valuation.
- **Fair Funding Review**: £24m additional in 2026/27, rising to £58.4m by 2028/29.
- **Operation Sheridan**: Former leader Geoff Driver + 3 others awaiting criminal trial (2027). Charges: conspiracy to pervert course of justice, witness intimidation, misconduct in public office.

### Political Context (for politics page / articles)
- **Reform UK** won 53/84 seats in May 2025 on promises of CT freeze + DOGE unit. Neither delivered.
- **Labour minority administration** 2013-2017 (Leader: Jennifer Mein, then Ali as cabinet member): closed 40 libraries, 59 bus routes, 5 museums. Largest service closure programme in LCC history.
- **Conservative administration** 2017-2025: CT rises every year (48% cumulative). Bond portfolio created. Savings collapsed to 48%. Oracle Fusion IT failure. Geoff Driver (2017-2021), Phillippa Williamson (2021-2025).
- **Hypocrisy angles**: Azhar Ali voted FOR 3.99% CT in 2023, now calls 3.8% "whopping". Kim Snape's own Labour cabinet dismissed her Adlington Library call-in. David Whipp raises CT to max at Pendle BC where he's Leader.

### War-Game Reports (Reference Documents)
| File | Purpose |
|------|---------|
| `LCC_Budget_2026-27_War_Game.md` | Opposition attack playbook: 7 arguments, amendment, 6 exchanges, closing speech |
| `LCC_Budget_2026-27_Reform_Defence.md` | Reform counter-attack: opposition dossiers, voting records, hypocrisy, nuclear options |
| `~/Desktop/LCC_Budget_2026-27_War_Game.pdf` | PDF with 8 charts (budget growth, savings, DSG, VeLTIP, seats, etc.) |
| `~/Desktop/LCC_Budget_2026-27_Reform_Defence.pdf` | PDF with 7 charts (CT history, voting heatmap, closures, bonds timeline, etc.) |
