# AI DOGE MASTER PLAN v2.0
## February 2026 — Post-Audit Strategic Upgrade

---

## 1. WHERE WE ARE NOW

### Live Infrastructure (£22/month — Hostinger VPS)
| Asset | Status | Records | Spend Tracked |
|-------|--------|---------|---------------|
| Burnley SPA | LIVE | 30,580 | £355M |
| Hyndburn SPA | LIVE | 29,804 | £211M |
| Pendle SPA | LIVE | 49,741 | £125M |
| Rossendale SPA | LIVE | 42,536 | £64M |
| **Total** | | **152,661** | **£755M** |

### What Each Council Has vs Should Have

| Feature | Burnley | Hyndburn | Pendle | Rossendale | Target | Status |
|---------|---------|----------|--------|------------|--------|--------|
| Spending Explorer | YES | YES | YES | YES | All | ✅ |
| DOGE Findings | YES | YES | YES | YES | All | ✅ |
| Budget Trends (GOV.UK) | YES | YES | YES | YES | All | ✅ |
| Hand-Curated Budgets | YES | NO | NO | NO | Burnley only | ✅ |
| News/Articles | 44 | 20 | 19 | 6 | 27+ each | ⚠️ Rossendale gap |
| Politics | YES | YES | YES | YES | All | ✅ |
| My Area | YES | YES | YES | YES | Add postcode lookup | ⚠️ |
| FOI Templates | 11 | 9 | 9 | 12 | 10+ each | ✅ |
| Companies House | 23.8% | 18.9% | 19.0% | ~0% | 60%+ | ❌ |
| Crime Data | YES | YES | YES | NO | Monthly auto | ⚠️ |
| Executive Pay Comparison | YES | YES | YES | YES | All | ✅ |
| Article Sharing + ToC | YES | YES | YES | YES | All | ✅ |
| FOI Tracking + Success | YES | YES | YES | YES | All | ✅ |

---

## 2. CRITICAL FINDINGS FROM AUDIT

### 2A. Code Bugs (Must Fix)
1. **council_etl.py line 1016**: `or True` makes jurisdiction filter useless — all suppliers pass
2. **police_etl.py line 121**: `urllib.parse` imported inside function after it's used — will crash on POST calls
3. **council_etl.py lines 95-96**: 2-digit year parsing ambiguous — needs proper century cutoff
4. **police_etl.py lines 191-194**: 503 errors return empty list silently — creates data gaps

### 2B. Data Quality Issues
| Issue | Council | Records Affected | Fix |
|-------|---------|-----------------|-----|
| Missing departments | Burnley | 4,044 (13.2%) | Map service_area to departments |
| Duplicate records | Hyndburn | 954 (3.2%) | Dedup in ETL |
| Duplicate records | Pendle | 1,392 (2.8%) | Dedup in ETL |
| Pendle dept taxonomy | Pendle | All 49,741 | 0 department aliases — add mappings |
| Missing dates | Burnley | 209 (0.7%) | Investigate source CSVs |
| CH coverage low | All | 80% unlinked | Run CH matching + fuzzy matching |

### 2C. SPA Hardcoded References (Breaking Multi-Council)
| File | Issue |
|------|-------|
| Layout.jsx | "Burnley Council" hardcoded in mobile header + footer URL |
| Politics.jsx | "45 councillors representing 15 wards across Burnley" hardcoded |
| Spending.jsx | CSV export filename hardcoded to "burnley-spending-export" |
| About.jsx | Entire page is Tom Pickup bio — not parameterised |
| FOI.jsx | All 15 templates hardcoded to Burnley (Liberata, Charter Walk, Geldards) |

---

## 3. COUNCIL-SPECIFIC DOGE FINDINGS & CONTENT PLAN

### 3A. BURNLEY — Mature, Needs Depth

**Key Stories Already Written (27 articles):**
- Liberata £21.2M outsourcing contract
- Geldards £20.1M Pioneer Place pass-through
- Purchase card spending (Netflix, ChatGPT, Domino's)
- Uncontracted suppliers £10.5M
- Insurance costs £5.3M, IT spending £3.6M

**Key Stories NOT Yet Written (from research):**
1. **Charter Walk Investment Risk** — £20.7M acquisition, rental income reportedly dropped 58%, now seeking external asset managers. Council debt ratio at 25% of revenue = danger zone.
2. **Waste Contract Award Without Tender** — FCC Environment (formerly Urbaser) got 8-year extension via negotiated procedure. New £4.7M/year contract (2026-2034).
3. **Business Rates Reset Cliff Edge** — £2.2M income loss from April 2026 reset. Combined with £3.4M cumulative gap = existential risk.
4. **LGR Transition Costs** — Burnley lobbying for 5-unitary model while paying consultants from reserves.
5. **Audit Findings** — No IT change management policy for CIVICA Financials. Heritage assets £2.1M underinsured.
6. **Council Tax Debt** — £13M uncollected. Collection cost vs recovery rate.
7. **Executive Pay Anomaly** — Only UK council with nobody earning >£100K in 2023/24 despite CE being on £120K+.

**FOI Templates to Add:**
- Charter Walk rental income vs debt servicing breakdown
- Pioneer Place post-completion review (due after April 2025)
- Business rates reset impact modelling
- LGR consultancy and submission costs
- CIVICA Financials change log (audit finding)

### 3B. HYNDBURN — Least Developed, Biggest Gaps

**Unique Context:**
- NO Liberata contract (in-house, 137 staff) — opposite model to Burnley/Pendle
- THREE YEARS of disclaimed audit opinions — accounts unverifiable
- £1M/year Housing Benefit subsidy black hole from exempt accommodation scams
- Leisure Trust loses money every year — £1M/year subsidy + £12M capital commitment
- Reserves dropping from £30M to £12M in ONE year
- £463M Huncoat Garden Village mega-project on a tiny council
- 60-70M Morgan Sindall regeneration already delayed
- No waste transfer station secured for April 2026

**Articles to Write:**
1. **Hyndburn's Unaudited Millions** — 3 years, £132M+ in spending with no audit sign-off
2. **The Leisure Trust Money Pit** — Perpetual subsidies, growing costs, £12M new facility while facing bankruptcy
3. **Exempt Accommodation: The Housing Benefit Scam** — For-profit operators disguised as charities extracting £800-1,500/week
4. **Reserves Free-Fall** — £18M drawdown in a single year
5. **In-House vs Outsourced** — Hyndburn runs services with 137 staff; Burnley pays Liberata £3.4M/year. Who gets better value?
6. **Accrington Town Square Delays** — £60-70M programme (10M discrepancy in stated value), Phase 2 slipping
7. **The Waste Disposal Crisis** — No transfer station, Whinney Hill closing, food waste mandate coming
8. **Huncoat Garden Village** — A £463M bet by a £17M council

**FOI Templates for Hyndburn:**
- Hyndburn Leisure Trust accounts + subsidy history since formation
- Exempt accommodation provider list + HB claim values per provider
- Huncoat Garden Village consultancy fees (Arcadis, Avison Young)
- Morgan Sindall contract value (is it £60M or £70M?) + variations
- Waste disposal contingency plans and cost modelling

**Data to Generate:**
- insights.json (DOGE findings — already in config but not rendered as articles)
- doge_findings.json (already populated in config)
- Councillor data (scrape from democracy.hyndburnbc.gov.uk)
- Politics summary

### 3C. PENDLE — Financial Crisis Council

**Unique Context:**
- Grant Thornton "significant weaknesses" in financial sustainability
- Disclaimer of opinion on 2023/24 accounts
- £54M Liberata contract (31% of net budget!) — same vendor as Burnley
- Leisure centres cost £1.8-1.9M/year subsidy, extended to 2033 during financial crisis
- Temporary accommodation costs up 5,400% (£5.5K → £303K) in 5 years
- 800+ empty homes while homelessness costs explode
- PEARL joint venture: 30% ownership but 50% voting rights, governance weaknesses flagged
- Planning spend highest of all NW districts (LGA finding)
- Waste disposal cliff edge same as Hyndburn/Burnley
- Budget gap: £8.26M cumulative by 2025/26

**Articles to Write:**
1. **Pendle's Financial Time Bomb** — Reserves exhaustion by 2027, £892K annual gap, auditor warnings
2. **Liberata's £54M Contract** — 31% of net budget to one company, only £490K/year claimed savings
3. **5,400% Homelessness Cost Explosion** — Empty homes everywhere, TA costs skyrocketing
4. **The Leisure Centre Dilemma** — £1.9M/year subsidy extended to 2033 mid-financial-crisis
5. **PEARL: Public Money, Private Control** — 30/70 ownership, 50/50 votes, £34M through JV
6. **Planning: Most Expensive in the North West** — LGA flagged Pendle's planning costs as highest
7. **The Audit Disclaimer** — What it means when auditors can't sign off your accounts
8. **Waste: The £2.6M Bill Coming in 2026** — Same disposal crisis as neighbours

**FOI Templates for Pendle:**
- Liberata contract annual payments by service line
- PEARL JV accounts + returns to council
- Temporary accommodation provider costs per night
- Leisure Trust subsidy schedule since formation
- Planning department staffing + cost benchmarking

---

## 4. NEW FEATURES TO BUILD

### 4A. Executive Pay Comparison Page ✅ BUILT
**Status:** `PayComparison.jsx` live for all 4 councils. Cross-council senior officer pay data from `pay_comparison.json`.

### 4B. Cross-Council Comparison Dashboard ✅ BUILT
**Status:** `CrossCouncil.jsx` live. Side-by-side metrics from `cross_council.json`. Generated by `generate_cross_council.py`.

### 4C. Supplier Deep Dive Pages ✅ BUILT
**Status:** `SupplierProfile.jsx` live. Dynamic route renders from `supplier_profiles.json`.

### 4D. Council-Specific FOI Templates ✅ BUILT
**Status:** 41 templates across 4 councils (Burnley 11, Hyndburn 9, Pendle 9, Rossendale 12). Each references real suppliers and data. FOI page includes success stories and tracking links.

### 4E. "What Changed?" Tracking — TODO
**What:** After publishing a finding, track whether the council acted on it.
**Why:** Closes the accountability loop. "We exposed X. Council did/didn't fix it."
**Implementation:** Manual updates to `outcomes.json`, rendered on article pages.

### 4F. Postcode → Ward Lookup — TODO
**What:** Enter postcode, get ward + councillors instantly.
**API:** postcodes.io (free, no key needed, returns ward names)
**Why:** "Who represents me?" is the #1 citizen question. Currently requires visiting external site.

---

## 5. PROCESS ARCHITECTURE — WHO DOES WHAT

### The Problem with Current Setup
Right now, Claude Code (Gaius) does everything: ETL, analysis, SPA coding, article writing, deployment. This burns Max subscription context on tasks that could run unattended.

### Proposed Task Delegation

| Task | Who | Why | Frequency |
|------|-----|-----|-----------|
| **CSV ETL** (new spending data) | Thurinus cron | Zero cost, runs unattended | When new CSVs published |
| **Companies House matching** | Thurinus cron | Rate-limited API, runs overnight | Monthly (1st) |
| **Police crime ETL** | Thurinus cron | API calls, runs unattended | Monthly (5th) |
| **GOV.UK data refresh** | Thurinus cron (NEW) | Download + parse when new outturn published | Annually (November) |
| **Council website scraping** | Thurinus cron (NEW) | Scrape councillor data, meeting agendas | Weekly |
| **Article generation drafts** | Clawdbot via Kimi | Free LLM, can draft from structured data | On-demand |
| **DOGE findings regeneration** | Thurinus script (NEW) | Pure Python analytics, no LLM needed | After each ETL run |
| **FOI template generation** | Claude Code | Needs research + context, one-time per council | Per council onboard |
| **SPA coding** | Claude Code | Complex React, needs full codebase context | As needed |
| **SPA deployment** | GitHub Actions (automatic) | Push to main → deploy.yml builds + deploys | On every push |
| **Executive pay data collection** | Clawdbot | Scrape Pay Policy PDFs, extract tables | Annually |
| **Data quality monitoring** | Thurinus script (NEW) | Automated checks, alerts via WhatsApp | Daily |

### New Thurinus Scripts Needed

1. **`scripts/doge_analysis.py`** — Pure Python, no LLM. Generates `insights.json` and `doge_findings.json` from spending.json. Runs: duplicate detection, split payment detection, round-number analysis, year-end spike detection, CH compliance cross-ref, supplier concentration. Currently this logic is embedded in `council_etl.py` — should be extracted as standalone.

2. **`scripts/data_monitor.py`** — Checks council websites for new CSV publications. Sends WhatsApp alert via Clawdbot when new data found. Checks: burnley.gov.uk/spending, hyndburnbc.gov.uk/open-data, pendle.gov.uk/open-data.

3. **`scripts/councillor_scraper.py`** — Scrapes councillor names, parties, wards, emails from ModernGov/democracy sites. Outputs `councillors.json` per council.

4. **`scripts/pay_scraper.py`** — Downloads Pay Policy Statement PDFs, extracts senior officer salary bands and pay multiples. Outputs `pay_data.json` per council.

### Why NOT a Separate AWS Server
- Thurinus (Oracle free tier) has 1GB RAM, 2 vCPU — lightweight but sufficient for cron-based ETL
- Adding a server adds cost, complexity, and another thing to maintain
- All scripts are lightweight Python — no GPU, no heavy compute needed
- Clawdbot can SSH to Thurinus to trigger any script on demand
- The only bottleneck is the CH API rate limit (600 req/5min), which is API-side not server-side

### Clawdbot's Role (Enhanced)
Clawdbot should become the **monitoring and alerting layer**:
- Monitor Thurinus cron job outcomes (did ETL succeed? any errors?)
- Alert Tom via WhatsApp when new data is published
- Draft article outlines from DOGE findings (using Kimi, free)
- Respond to "what's the latest on Burnley spending?" questions via WhatsApp
- Trigger ad-hoc ETL runs via SSH to Thurinus

---

## 6. NEW DATA SOURCES TO ADD

### Free, High-Value, Automatable

| Source | Data | URL/API | Cost | Priority |
|--------|------|---------|------|----------|
| **Councillor Allowances** | Annual allowances paid per councillor | Council transparency pages | Free | HIGH |
| **Pay Policy Statements** | Senior officer salary bands, pay multiples | Council websites (PDF) | Free | HIGH |
| **Contract Registers** | All contracts >£5K with supplier, value, dates | Council open data | Free | HIGH |
| **Electoral Commission** | Councillor donations, party spending | electoralcommission.org.uk | Free | MEDIUM |
| **Charity Commission** | Verify "charities" receiving council money | charity-search API | Free | MEDIUM |
| **Planning Applications** | Major applications, decisions, call-ins | planning.data.gov.uk | Free | MEDIUM |
| **WhatDoTheyKnow** | Previous FOI responses for each council | whatdotheyknow.com | Free | MEDIUM |
| **LG Inform** | CIPFA benchmarking data (waste costs, collection rates) | lginform.local.gov.uk | Free | MEDIUM |
| **ONS LSOA Data** | Deprivation, population, demographics per ward | geoportal.statistics.gov.uk | Free | LOW |
| **DLUHC Live Tables** | Housing, homelessness, TA stats per LA | gov.uk/statistical-data-sets | Free | LOW |

### Specifically for Each Council

**Burnley:**
- Charter Walk rental income (via FOI or Statement of Accounts)
- Pioneer Place occupancy and rental returns
- Liberata contract final-year payments (being brought in-house)

**Hyndburn:**
- Hyndburn Leisure Trust accounts (Companies House filing)
- Exempt accommodation provider register (via FOI)
- Morgan Sindall contract variations (via FOI or spending data)
- Huncoat Garden Village cost reports

**Pendle:**
- PEARL JV accounts (Companies House filing)
- Leisure Trust annual subsidy history
- Empty homes register (via FOI)
- Temporary accommodation provider payments

---

## 7. EFFICIENCY IMPROVEMENTS

### ETL Pipeline
1. **Extract DOGE analysis from council_etl.py** → standalone `doge_analysis.py`. Currently ETL + analysis are coupled. Analysis should run independently so it can be re-run without re-parsing CSVs.
2. **Add incremental mode** — track file hashes, skip already-processed CSVs.
3. **Fix CH jurisdiction filter** (the `or True` bug) — currently matching non-UK companies.
4. **Add fuzzy matching for CH** — Levenshtein distance with 90%+ threshold. Could recover 10-20% of the 41% unmatched suppliers.
5. **Add Charity Commission cross-check** — for suppliers claiming charitable status (relevant to Hyndburn exempt accommodation issue).

### SPA Performance
1. **Pendle's spending.json is 39.5MB** — this is too large for mobile. Need pagination or lazy loading of transaction data.
2. **Parameterise all hardcoded references** (Layout, Politics, Spending export, About, FOI).
3. **Add data freshness indicator** to every page ("Data last updated: 7 Feb 2026").

### Credit Efficiency
1. **Article drafting via Kimi** — Clawdbot drafts from structured DOGE findings, Claude Code only edits/polishes.
2. **Councillor scraping via Thurinus** — no LLM needed, pure HTML parsing.
3. **Pay data extraction via Thurinus** — PDF parsing with Python (pdfplumber), no LLM.
4. **Only use Claude Code for:** SPA coding, complex analysis design, research. Deployment is now fully automated via GitHub Actions (zero tokens).

---

## 8. CONTENT IMPROVEMENT PRIORITIES

### Per-Council Article Plan (Next Sprint)

**Hyndburn (8 articles needed — currently zero):**
1. Hyndburn's Unaudited Millions (3 years disclaimed)
2. The Leisure Trust Money Pit
3. Exempt Accommodation HB Scam
4. Reserves Free-Fall (£30M → £12M)
5. In-House vs Outsourced (cross-council comparison)
6. Accrington Town Square Delays
7. The Waste Disposal Crisis
8. Huncoat Garden Village Risks

**Pendle (8 articles needed — currently zero):**
1. Pendle's Financial Time Bomb
2. Liberata's £54M Contract
3. 5,400% Homelessness Cost Explosion
4. The Leisure Centre Dilemma
5. PEARL: Public Money, Private Control
6. Planning: Most Expensive in NW
7. The Audit Disclaimer
8. Waste: The £2.6M Bill

**Burnley (7 new articles):**
1. Charter Walk Investment Risk
2. Waste Contract Without Tender
3. Business Rates Reset Cliff Edge
4. LGR Transition Costs
5. Audit: No IT Change Management
6. £13M Council Tax Debt
7. Executive Pay Anomaly

### Cross-Council Articles (3):
1. **Lancashire's Liberata Problem** — £90M+ across Burnley + Pendle, same vendor, different outcomes
2. **The LGR Endgame** — What happens to debts, contracts, and reserves when councils merge
3. **Waste Disposal: Lancashire's Shared Crisis** — All 4 councils face same Whinney Hill closure

---

## 9. IMMEDIATE ACTION PLAN (Updated 9 Feb 2026)

### ✅ COMPLETED
- [x] Fix critical code bugs (parameterisation, hardcoded refs)
- [x] Parameterise hardcoded Burnley references in SPA
- [x] Generate Hyndburn + Pendle `doge_findings.json`
- [x] Write council-specific FOI templates for all 4 councils (41 total)
- [x] Build Executive Pay Comparison page
- [x] Build Cross-Council Comparison dashboard
- [x] Build Supplier Deep Dive pages
- [x] Write Hyndburn articles (20)
- [x] Write Pendle articles (19)
- [x] Write Rossendale articles (6)
- [x] Add article social sharing + table of contents
- [x] Add FOI tracking + success stories
- [x] Set up data monitoring + automation pipeline
- [x] 141+ unit tests + 9 E2E tests
- [x] Security hardening (DOMPurify, CSP, workflow permissions)
- [x] SEO (robots.txt, sitemap.xml, JSON-LD, OG tags on articles)
- [x] Deploy all 4 councils
- [x] URL state sync (useSearchParams — all filters, sort, page, pageSize synced to URL)

### HIGH PRIORITY — NEXT
- [ ] 12MB spending.json performance fix (Web Worker + virtual scroll)
- [ ] More Rossendale articles (currently 6, target 20+)
- [ ] Companies House match rate improvement (currently ~20%, target 60%)
- [ ] Postcode → ward lookup (postcodes.io)

### MEDIUM PRIORITY
- [ ] "What Changed?" tracking (outcomes.json)
- [ ] TypeScript migration
- [ ] Accessibility remaining (skip-to-content, focus trap, keyboard nav)
- [ ] OG tags on non-article pages
- [ ] Rossendale crime stats integration

### LOWER PRIORITY
- [ ] Theme toggle (light/dark)
- [ ] PWA/offline support
- [ ] Build optimisation (Brotli, bundle analysis)
- [ ] CSS Modules migration
- [ ] Lighthouse CI in GitHub Actions

### Ongoing (Automated)
- Daily: data_monitor.py checks for new CSVs, mega_article_writer.py generates drafts
- Monthly: CH matching cron, police crime ETL
- Quarterly: New spending CSV ingestion, DOGE findings regeneration
- Annually: GOV.UK outturn refresh, pay policy extraction, councillor data refresh

---

## 10. SUCCESS METRICS (Updated 9 Feb 2026)

| Metric | Was (7 Feb) | Now (9 Feb) | Target | Status |
|--------|-------------|-------------|--------|--------|
| Councils live | 4 | 4 | 5+ | ⚠️ |
| Articles | 27/0/0/0 | 44/20/19/6 = 89 | 27+ each | ✅ 3/4 councils hit target |
| FOI templates | 15 (Burnley only) | 11/9/9/12 = 41 | 10+ each | ✅ |
| CH match rate | ~20% | ~20% | 60% | ❌ Biggest gap |
| Unit tests | 0 | 141+ | 200+ | ✅ |
| E2E tests | 0 | 9 | 20+ | ⚠️ |
| Open issues | 34 | 2 (flaky) | 0 | ✅ |
| Monthly cost | £22 | £22 | £22 | ✅ |
| Data freshness | Manual | Auto-monitored | Auto | ✅ |
| Article sharing | None | Twitter/FB/WA/Copy | All platforms | ✅ |
| SEO (articles) | None | JSON-LD + OG + breadcrumbs | Full | ✅ |

---

*Plan authored: 2026-02-07*
*Based on: Full code audit, data quality review, 3x council research, SPA content review*
*Next review: After CH API key is active and first Hyndburn/Pendle articles published*
