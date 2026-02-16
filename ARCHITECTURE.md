# AI DOGE — Software Architecture

## System Overview

```
┌──────────────────┐     ┌──────────────────┐
│  Council CSVs    │     │  GOV.UK ODS      │
│  (Layer 1)       │     │  (Layer 2)       │
│                  │     │                  │
│ 15 councils      │     │ MHCLG Revenue    │
│ £250-500+        │     │ Outturn (CIPFA)  │
│ thresholds       │     │ Band D CT data   │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
    council_etl.py          govuk_budgets.py
         │                        │
         ▼                        ▼
┌──────────────────┐     ┌──────────────────┐
│ spending.json    │     │ budgets_govuk.json│
│ metadata.json    │     │ budgets_summary   │
│ insights.json    │     │ revenue_trends    │
│ (per council)    │     │ (per council)     │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         └────────┬───────────────┘
                  │
         ┌────────▼─────────┐
         │  doge_analysis.py│
         │  (cross-council) │
         │  Duplicates      │
         │  Split payments  │
         │  CH compliance   │
         │  Benford's Law   │
         │  Fraud triangle  │
         │  Price gaps      │
         └────────┬─────────┘
                  │
         ┌────────▼─────────┐
         │  React SPA       │
         │  (config-driven) │
         │                  │
         │  useData() hook  │
         │  30min TTL cache │
         │  Retry + backoff │
         │  LRU eviction    │
         │                  │
         │  Per-route error  │
         │  boundaries      │
         │  Route preloading │
         └────────┬─────────┘
                  │
         GitHub Actions CI/CD
         (sequential 15-council build)
                  │
         ┌────────▼─────────┐
         │  GitHub Pages    │
         │  (gh-pages)      │
         │                  │
         │  15 council sites │
         │  at aidoge.co.uk │
         └──────────────────┘
```

## Two Data Layers

**Layer 1 — Council CSVs** (transaction-level):
- Each council publishes spending CSVs under Transparency Code
- `council_etl.py` normalises to universal schema with custom parsers per council
- Good for: supplier analysis, payment drill-down, procurement patterns
- NOT comparable across councils (different thresholds, coverage)

**Layer 2 — GOV.UK MHCLG** (standardised budgets):
- MHCLG publishes identical CIPFA SeRCOP returns for all councils
- `govuk_budgets.py` parses ODS files
- Good for: cross-council comparisons, budget vs actual, Band D trends
- Inherently comparable — same definitions, same categories

## Frontend Architecture

**Stack:** React 19 + Vite 7, lazy-loaded routes, config-driven per council

### Data Layer
- `useData()` hook — module-level Map cache with 30-minute TTL, request deduplication, retry with exponential backoff (2 retries, 1s/2s), LRU eviction at 50 entries
- `preloadData()` — warms cache for predicted next routes (Home→Spending, Spending→Suppliers)
- `CouncilConfigProvider` — loads config.json, provides council context, drives feature flags for conditional nav/pages

### Error Handling
- Per-route `<Guarded>` wrapper — each route gets its own ErrorBoundary + Suspense boundary
- A crash in Spending won't take down Budgets or DOGE
- ErrorBoundary has "Try again" button for recovery

### Routing
- 22 lazy-loaded routes via React Router v7
- Config-driven nav visibility — `data_sources` flags in config.json control which nav items appear
- GitHub Pages SPA routing via hub 404.html redirect with `?p=` parameter

### Spending Data Architecture
- **Web Worker** (`spending.worker.js`) offloads all filtering, sorting, pagination, stats, and CSV export
- **v2**: `{meta, filterOptions, records}` — base format, all 15 councils
- **v3**: `spending-index.json` + `spending-YYYY-YY.json` per year — 12 districts
- **v4**: `spending-index.json` + `spending-YYYY-MM.json` per month — 3 large councils (LCC 484MB, Blackpool 370MB, Blackburn 307MB)
  - Field stripping saves 42-45%: null/empty/duplicate fields removed by ETL
  - Records hydrated in worker via `hydrateRecord()` (spending.utils.js)
  - Auto-loads latest month on init, then loads year/month on demand
  - `loadingYears`/`loadingMonths` guard Sets prevent race conditions
- Worker auto-detects v4→v3→v2 and loads accordingly

### Multi-Council Build System
`vite.config.js` contains `councilDataPlugin()` which:
1. Reads `VITE_COUNCIL` env var (any of 15 council IDs)
2. Copies `burnley-council/data/{council}/` → `public/data/`
3. Copies `burnley-council/data/shared/` → `public/data/shared/`
4. Replaces `%PLACEHOLDER%` tokens in index.html with council-specific values from config.json
5. Sets `base` path from `VITE_BASE` env var
6. Generates sitemap.xml, manifest.webmanifest, feed.xml per council

The React app is council-agnostic — it reads config.json at runtime and conditionally renders features.

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/deploy.yml`):
1. Triggers on push to `main` (ignores `.md` files) or manual dispatch
2. Installs deps, runs 204 unit tests
3. **Restores v4 spending chunks** from previous deploy (self-sustaining for 3 large councils)
4. Builds all 15 councils **sequentially** (shared `public/data/` causes race conditions)
5. **Cleans v4 artifacts** — removes spending.json monoliths, keeps only index + monthly chunks
6. Copies hub pages, generates sitemap index
7. Deploys to `tompickup23/lancashire` repo via `gh-pages` with `DEPLOY_TOKEN` secret
8. **Syncs hub** to `tompickup23/tompickup23.github.io` (root domain)
9. Verifies all 15 council URLs return HTTP 200
10. Concurrency group ensures only one deploy runs at a time

Build time: ~22 minutes for all 15 councils.

## DOGE Analysis Pipeline

```
council_etl.py --council {id}      →  spending.json (v2) + v3/v4 chunks
                                   →  insights.json, metadata.json
doge_analysis.py                   →  doge_findings.json, doge_verification.json (all councils)
generate_cross_council.py          →  cross_council.json (reads metadata.json from all 15)
generate_budget_insights.py        →  budget_insights.json, budget_efficiency.json (all councils)
```

Analysis checks: duplicate payments, split payment evasion, year-end spikes, round-number anomalies, Companies House compliance (temporal overlap), cross-council price gaps, Benford's Law forensic screening, payment cadence, day-of-week patterns, weak competition detection, category monopolies, supplier concentration (HHI), late contract publication, fraud triangle scoring.

## Procurement Pipeline

```
procurement_etl.py --council {id}  →  procurement.json (per council)
```

Data from Contracts Finder API (gov.uk). Free, no auth. Most councils publish <15% of contract award values.

## Autonomous Data Pipeline

Runs daily on vps-main (cron 7am–10:30am):

```
data_monitor.py (7am)          auto_pipeline.py (8am)          article_pipeline.py (9am)
  Check 15 council URLs for      Read monitor state               Data-driven topic discovery
  new spending CSVs              ↓                                from spending + DOGE findings
  ↓                              SSH vps-news → council_etl.py    ↓
  Save hash changes to           ↓                                LLM generation (Gemini 2.5
  monitor_state.json             Pull spending.json back          Flash → Kimi → fallbacks)
  ↓                              ↓                                ↓
  WhatsApp alert if              Run doge_analysis.py             Fact verification
  changes found                  ↓                                ↓
                                 WhatsApp summary                 Save to articles-index.json
                                                                  ↓
                                                                  Git commit + push → CI/CD deploy

deploy_newslancashire.sh (10am)
  SSH vps-news → hugo --minify
  rsync public/ → vps-main
  wrangler pages deploy (from vps-main, NOT vps-news — 1GB OOM risk)

deploy_newsburnley.sh (10:30am)
  rsync vps-news public/ → vps-main
  wrangler pages deploy (from vps-main)
```

## Key Scripts

| Script | Location | Purpose |
|--------|----------|---------|
| `burnley-council/scripts/council_etl.py` | local/vps | CSV → spending.json (all councils) |
| `burnley-council/scripts/doge_analysis.py` | local/vps | Cross-council DOGE analysis |
| `burnley-council/scripts/procurement_etl.py` | local/vps | Contracts Finder API → procurement.json |
| `burnley-council/scripts/police_etl.py` | vps-news | Police crime stats API |
| `burnley-council/scripts/deprivation_etl.py` | local | IMD 2019 → deprivation.json |
| `burnley-council/scripts/census_etl.py` | local | Census 2021 → demographics.json |
| `burnley-council/scripts/councillors_etl.py` | local | ModernGov scraper → councillors/politics/wards |
| `burnley-council/scripts/councillor_integrity_etl.py` | local | 8-source integrity scoring |
| `burnley-council/scripts/govuk_budgets.py` | local | GOV.UK ODS → budget JSON |
| `burnley-council/scripts/govuk_trends.py` | local | Revenue trend analysis |
| `burnley-council/scripts/charity_etl.py` | local/vps | Charity Commission cross-check |
| `burnley-council/scripts/article_pipeline.py` | vps-main | Data-driven article generation |
| `scripts/generate_cross_council.py` | local | Cross-council comparison data |
| `scripts/generate_budget_insights.py` | local | Budget insights + efficiency scoring |

## Companies House Integration

- **API:** `https://api.company-information.service.gov.uk/`
- Code in `council_etl.py` (`--companies-house` flag)
- 100% confidence matching only (exact name, active, unambiguous)
- Rate limit: 600 req/5min (free, no payment required)
- Auth: HTTP Basic with API key as username, empty password

## Adding a New Council

1. **Plan:** Download CSVs, examine schema, identify columns
2. **Do:** Write adapter in council_etl.py (parse function + CSV location), run ETL
3. **Check:** Spot-check records, verify metadata, run doge_analysis
4. **Config:** Create config.json with appropriate data_sources flags
5. **Deploy:** Add to COUNCILS list in deploy.yml env var, push to main → auto-deploy

## Live Councils (15)

| Tier | Council | Records | Spend | Spending Version |
|------|---------|---------|-------|-----------------|
| District | Burnley | 30,580 | £355M | v3 |
| District | Hyndburn | 29,804 | £211M | v3 |
| District | Pendle | 49,741 | £125M | v3 |
| District | Rossendale | 42,536 | £64M | v3 |
| District | Lancaster | 32,574 | £184M | v3 |
| District | Ribble Valley | 13,723 | £38M | v3 |
| District | Chorley | 21,421 | £365M | v3 |
| District | South Ribble | 18,517 | £177M | v3 |
| District | Preston | 46,711 | £205M | v3 |
| District | West Lancashire | 43,063 | £333M | v3 |
| District | Wyre | 51,092 | £678M | v3 |
| District | Fylde | 37,514 | £155M | v3 |
| County | Lancashire CC | 753,220 | £3.6B | v4 (monthly) |
| Unitary | Blackpool | 630,914 | £4.1B | v4 (monthly) |
| Unitary | Blackburn w/ Darwen | 492,973 | £1.7B | v4 (monthly) |

## Repos

- **Source:** tompickup23/burnleycouncil (main branch)
- **Deploy:** tompickup23/lancashire (gh-pages branch)
- **Hub:** tompickup23/tompickup23.github.io
- **Domain:** aidoge.co.uk

## News Lancashire Pipeline

```
[RSS Feeds] ─┐
[Bluesky]   ─┤
[Google News]─┼→ [pipeline_v4.sh] → [SQLite DB] → [export_json.py] → [Hugo Build]
[Parliament] ─┤     (vps-news)        (news.db)       (962 pages)       → Cloudflare Pages
[Police API] ─┘                                                        (newslancashire.co.uk)
```

## Related Docs

- **[CLAUDE.md](./CLAUDE.md)** — Build commands, file locations, dev rules
- **[AIDOGE-MASTERPLAN.md](./AIDOGE-MASTERPLAN.md)** — Strategy, roadmap, current state
- **[INFRASTRUCTURE.md](./INFRASTRUCTURE.md)** — Servers, AI tools, DNS, costs, known issues
