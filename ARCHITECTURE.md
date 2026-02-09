# AI DOGE — Software Architecture

## System Overview

```
┌──────────────────┐     ┌──────────────────┐
│  Council CSVs    │     │  GOV.UK ODS      │
│  (Layer 1)       │     │  (Layer 2)       │
│                  │     │                  │
│ Burnley: £500+   │     │ MHCLG Revenue    │
│ Hyndburn: £250+  │     │ Outturn (CIPFA)  │
│ Pendle: all      │     │ Band D CT data   │
│ Rossendale: all  │     │                  │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
    council_etl.py          govuk_budgets.py
         │                        │
         ▼                        ▼
┌──────────────────┐     ┌──────────────────┐
│ spending.json    │     │ budgets_govuk.json│
│ metadata.json    │     │ budgets_summary   │
│ insights.json    │     │ govuk_comparison  │
│ (per council)    │     │ (cross-council)   │
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
         (sequential 4-council build)
                  │
         ┌────────▼─────────┐
         │  GitHub Pages    │
         │  (gh-pages)      │
         │                  │
         │ /burnleycouncil/ │
         │ /hyndburncouncil/│
         │ /pendlecouncil/  │
         │ /rossendalecouncil/│
         └──────────────────┘
```

## Two Data Layers

**Layer 1 — Council CSVs** (transaction-level):
- Each council publishes spending CSVs under Transparency Code
- `council_etl.py` normalises to universal schema
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
- 16 lazy-loaded routes via React Router
- Config-driven nav visibility — `data_sources` flags in config.json control which nav items appear
- GitHub Pages SPA routing via 404.html → index.html copy

### Multi-Council Build System
`vite.config.js` contains `councilDataPlugin()` which:
1. Reads `VITE_COUNCIL` env var (burnley/hyndburn/pendle/rossendale)
2. Copies `burnley-council/data/{council}/` → `public/data/`
3. Copies `burnley-council/data/shared/` → `public/data/shared/`
4. Replaces `%PLACEHOLDER%` tokens in index.html with council-specific values from config.json
5. Sets `base` path from `VITE_BASE` env var

The React app is council-agnostic — it reads config.json at runtime and conditionally renders features.

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/deploy.yml`):
1. Triggers on push to `main` or manual dispatch
2. Builds all 4 councils **sequentially** (shared `public/data/` causes race conditions)
3. Each build: `VITE_COUNCIL={id} VITE_BASE=/lancashire/{id}council/ npx vite build`
4. Copies `index.html` → `404.html` per council for SPA routing
5. Deploys to `tompickup23/lancashire` repo via `gh-pages` with `DEPLOY_TOKEN` secret
6. Concurrency group ensures only one deploy runs at a time

## DOGE Analysis Pipeline

```
council_etl.py --council {id}    →  spending.json, taxonomy.json, insights.json
doge_analysis.py                 →  doge_findings.json, doge_verification.json (all councils)
```

Analysis checks: duplicate payments, split payment evasion, year-end spikes, round-number anomalies, Companies House compliance (temporal overlap), cross-council price gaps, Benford's Law forensic screening.

## Autonomous Data Pipeline

Runs daily on vps-main (cron 7am + 8am):

```
data_monitor.py (7am)                    auto_pipeline.py (8am)
  Check council URLs for                   Read monitor state
  new spending CSVs                        ↓
  ↓                                        SSH vps-news → council_etl.py
  Save hash changes to                     ↓
  monitor_state.json                       Pull spending.json back
  ↓                                        ↓
  WhatsApp alert if                        Run doge_analysis.py
  changes found                            ↓
                                           Queue article generation
                                           ↓
                                           WhatsApp summary
```

Scripts on vps-main: `auto_pipeline.py`, `data_monitor.py`, `mega_article_writer.py`, `llm_router.py`
Scripts on vps-news: `council_etl.py`, `police_etl.py`, `ch_cron.sh`

## Key Scripts

| Script | Location | Purpose |
|--------|----------|---------|
| `scripts/council_etl.py` | vps-news | CSV → spending.json (any council) |
| `scripts/doge_analysis.py` | vps-main | Cross-council DOGE analysis |
| `scripts/auto_pipeline.py` | vps-main | Autonomous ETL → analysis → articles |
| `scripts/data_monitor.py` | vps-main | Check council websites for new data |
| `scripts/mega_article_writer.py` | vps-main | LLM-generated articles from findings |
| `scripts/govuk_budgets.py` | local | GOV.UK ODS → budget JSON |
| `scripts/govuk_trends.py` | local | Revenue trend analysis |
| `scripts/police_etl.py` | vps-news | Police crime stats API |

## Companies House Integration

- **API:** `https://api.company-information.service.gov.uk/`
- **Register for key:** https://developer.company-information.service.gov.uk/manage-applications
- **Docs:** https://developer-specs.company-information.service.gov.uk/
- Code in `council_etl.py` (`--companies-house` flag)
- 100% confidence matching only (exact name, active, unambiguous)
- Rate limit: 600 req/5min (free, no payment required)
- Auth: HTTP Basic with API key as username, empty password

## Adding a New Council

1. **Plan:** Download CSVs, examine schema, identify columns
2. **Do:** Write adapter (~50 lines in council_etl.py), run ETL
3. **Check:** Spot-check 20 records, flag unmapped terms
4. **Act:** Update taxonomy.json, re-run. System gets smarter.
5. **Deploy:** Add to CI/CD workflow, push to main → auto-deploy

## Live Councils

| Council | URL Path | Records | Spend | Threshold | Features |
|---------|----------|---------|-------|-----------|----------|
| Burnley | /burnleycouncil/ | 30,580 | £355M | £500+ | Full (spending, budgets, politics, meetings, news, FOI, DOGE) |
| Hyndburn | /hyndburncouncil/ | 29,804 | £211M | £250+ | Spending, budgets, FOI, DOGE |
| Pendle | /pendlecouncil/ | 49,741 | £125M | All | Spending, DOGE |
| Rossendale | /rossendalecouncil/ | 42,536 | £64M | All | Spending, DOGE |

## Repos

- **Source:** tompickup23/burnleycouncil (main branch)
- **Deploy:** tompickup23/lancashire (gh-pages branch)
- **Hub:** tompickup23/tompickup23.github.io
- **Domain:** aidoge.co.uk

## News Lancashire Pipeline

```
[RSS Feeds] ─┐
[Bluesky]   ─┤
[Google News]─┼→ [pipeline_v4.sh] → [SQLite DB] → [export_json.py] → [Astro Build]
[Parliament] ─┤     (vps-news)        (news.db)                        → Cloudflare Pages
[Police API] ─┘                                                        (newslancashire.co.uk)
```

## Related Docs

- **[CLAUDE.md](./CLAUDE.md)** — Build commands, file locations, dev rules
- **[INFRASTRUCTURE.md](./INFRASTRUCTURE.md)** — Servers, AI tools, DNS, costs, known issues
