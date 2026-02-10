# AI DOGE — Full System Audit

> **Date:** 9 Feb 2026 (session 2) | **Branch:** `claude/setup-handover-docs-QUonH` | **Tests:** 103/103 passing

---

## Architecture (3 tiers)

```
CSV/ODS data ──► Python ETL ──► JSON files ──► Vite build ──► GitHub Pages
                 (VPS-NEWS)    (burnley-council/data/)       (aidoge.co.uk)
```

**Stack:** React 19 + Vite 7 + React Router 7 + Recharts 3 + TanStack Virtual 3
**Codebase:** 16,123 lines React (JSX/CSS) + 8,427 lines Python/Shell/JS scripts
**Data:** 142MB across 4 councils (~152K spending records, £757M tracked)

---

## Live Deployments

| Council | Path | Records | Spend | Data Size |
|---------|------|---------|-------|-----------|
| Burnley | `/burnleycouncil/` | 30,580 | £355M | 28MB |
| Hyndburn | `/lancashire/hyndburncouncil/` | 29,802 | £211M | 27MB |
| Pendle | `/lancashire/pendlecouncil/` | 49,741 | £127M | 47MB |
| Rossendale | `/lancashire/rossendalecouncil/` | 42,536 | £64M | 40MB |

**Note:** Burnley deploys from `tompickup23/burnleycouncil` repo. Hyndburn/Pendle/Rossendale deploy from `tompickup23/lancashire` repo under `/lancashire/{council}council/` paths.

---

## SPA Routes (15 pages)

| Route | Page | Data Files | Feature Flag |
|-------|------|-----------|-------------|
| `/` | Home | insights, doge_findings, politics_summary, articles-index, revenue_trends | multiple |
| `/spending` | Spending | spending.json (21-40MB) | `spending` |
| `/budgets` | Budgets | budgets.json OR budgets_govuk.json + revenue_trends | `budgets` / `budget_trends` |
| `/news` | News | articles-index.json | `news` |
| `/news/:id` | ArticleView | articles-index + articles/{id}.json | `news` |
| `/politics` | Politics | councillors, politics_summary, wards | `politics` |
| `/my-area` | MyArea | wards, councillors + postcodes.io API | `my_area` |
| `/meetings` | Meetings | meetings.json | `meetings` |
| `/pay` | PayComparison | pay_comparison.json | `pay_comparison` |
| `/compare` | CrossCouncil | cross_council.json | always |
| `/suppliers` | Suppliers | supplier_profiles.json (6-15MB) | always |
| `/supplier/:id` | SupplierView | supplier_profiles.json | always |
| `/foi` | FOI | foi_templates.json | `foi` |
| `/about` | About | config only | always |
| `/legal` | Legal | none (static) | always |

All routes are lazy-loaded via `React.lazy()` (including Home, added session 2).

---

## Data Files Per Council (20 files)

| File | Purpose | Size Range | Notes |
|------|---------|-----------|-------|
| `config.json` | Identity, features, publisher, theme | 3.4-3.7K | Drives everything |
| `spending.json` | All transactions | 8-14MB (optimised) | Stripped + split at build |
| `supplier_profiles.json` | Cross-council supplier data | 6-15MB | Second largest |
| `insights.json` | Top suppliers, patterns, YoY | 5-12K | |
| `revenue_trends.json` | 8yr GOV.UK revenue/capital | 30-34K | |
| `budgets_govuk.json` | MHCLG revenue outturn | 108K | All councils |
| `budgets_summary.json` | Service breakdown, council tax | 4.3-4.9K | |
| `pay_comparison.json` | CEO salary, ratios, history | 8.5-11K | |
| `cross_council.json` | 4-council comparison | 4.9K | **5 copies** |
| `councillors.json` | Elected members | 8.3-18K | |
| `politics_summary.json` | Party control, seats | 1.5-2.5K | |
| `wards.json` | Ward boundaries, pop | 2.1-5.2K | |
| `meetings.json` | Scraped calendar | 4.3-16K | Auto-updated weekly |
| `foi_templates.json` | Ready-made FOI requests | 7.4-19K | |
| `doge_findings.json` | Investigation results | 4.3-4.6K | |
| `doge_knowledge.json` | AI context | 2.7-4.9K | |
| `crime_stats.json` | Police API data | 11-13K | Missing: Rossendale |
| `metadata.json` | Record counts, suppliers | 2.6-18K | |
| `data_quality_report.json` | Validation scores | 1.2-7.9K | |
| `articles-index.json` | Article list | 3B-28K | Rossendale: empty `[]` |

---

## Config.json Feature Flags

| Flag | Burnley | Hyndburn | Pendle | Rossendale |
|------|---------|----------|--------|-----------|
| spending | true | true | true | true |
| **budgets** | **true** | false | false | false |
| budget_trends | true | true | true | true |
| politics | true | true | true | true |
| meetings | true | true | true | true |
| news | true | true | true | true |
| my_area | true | true | true | true |
| foi | true | true | true | true |
| doge_investigation | true | true | true | true |
| pay_comparison | true | true | true | true |

Only Burnley has `budgets: true` (hand-curated Budget Book data). Others use `budgets_govuk.json` via `budget_trends: true`.

---

## ETL Pipeline

```
run_all_lancashire.sh [--download] [--build] [--companies-house]
  ├── council_etl.py --council {id}         → spending.json, insights.json, metadata.json
  ├── govuk_budgets.py --councils ...       → budgets_govuk.json
  ├── govuk_trends.py                       → revenue_trends.json
  ├── generate_supplier_profiles.py         → supplier_profiles.json (cross-council)
  ├── validate_data.py --all                → data_quality_report.json
  └── build_council.sh {id} {base}          → dist/ (per-council SPA)
```

**Other scripts:** `police_etl.py` (crime data), `process_councillors.py`, `ch_cron.sh` (monthly Companies House matching)

---

## Build System

```bash
# Dev (Burnley)
npm run dev

# Dev (other council)
VITE_COUNCIL=hyndburn VITE_BASE=/hyndburn/ npm run dev

# Build
VITE_COUNCIL=pendle VITE_BASE=/pendle/ npm run build

# Deploy to gh-pages
npm run deploy
```

**Vite plugin `councilDataPlugin`:**
1. Copies `burnley-council/data/{council}/` → `public/data/`
2. Strips unused fields from `spending.json` (~50% size reduction) and splits into per-year chunks
3. Replaces 10+ `%PLACEHOLDER%` vars in `index.html` from config.json
4. Compression plugin generates `.gz` + `.br` for all output (spending.json: 14MB → 401KB brotli)

**Code splitting:** recharts (350KB), vendor (react+router), tanstack (query+virtual)

---

## CI/CD

| What | How | When |
|------|-----|------|
| Meeting scraper | GitHub Actions `update-meetings.yml` | Sundays 03:00 UTC |
| Daily audit | GitHub Actions `daily-audit.yml` | Daily 06:00 UTC |
| ETL pipeline | `run_all_lancashire.sh` on VPS-NEWS | Manual/cron |
| CH matching | `ch_cron.sh` on VPS | 1st of month |
| Deploy | `npm run deploy` → gh-pages | Manual |

---

## Key Dependencies

| Package | Version | Purpose | Bundle Impact |
|---------|---------|---------|--------------|
| react | 19.2.0 | UI framework | vendor chunk |
| react-router-dom | 7.13.0 | SPA routing | vendor chunk |
| recharts | 3.7.0 | Charts (6 types) | ~350KB own chunk |
| @tanstack/react-virtual | 3.13.18 | Virtual scrolling | tanstack chunk |
| @tanstack/react-query | 5.90.20 | (installed, not actively used — useData custom hook instead) | tanstack chunk |
| lucide-react | 0.563.0 | Icons | tree-shaken |

---

## Test Coverage

| File | Tests | What |
|------|-------|------|
| format.test.js | 54 | Currency, date, number, FY formatting |
| useData.test.js | 5 | Cache, loading, error states |
| About.test.jsx | 15 | Config-driven rendering, conditionals |
| PayComparison.test.jsx | 12 | CEO profiles, stats, charts, tables |
| Home.test.jsx | 6 | Loading, error, hero, disclaimer, total spend, minimal config |
| Spending.test.jsx | 5 | Loading, error, heading, search/filters, empty data |
| ErrorBoundary.test.jsx | 6 | Children render, error UI, null errors, retry, reset, console |
| **Total** | **103** | |

**Not tested:** Budgets, CrossCouncil, Suppliers, SupplierView, News, Politics, Meetings, MyArea, FOI, ArticleView, Legal

---

## Rossendale Quirks (added later, differs from others)

- `articles-index.json` must be `[]` not `{articles:[]}` ✅ Fixed
- No `articles/` directory (correct — no articles written yet)
- No `crime_stats.json` — `crime_stats: false` feature flag added ✅
- `budgets: false` but `budgets_govuk.json` exists — `budgets_govuk: true` flag added ✅
- `duplicate_count: 0` in cross_council.json (analysis not run)
- CEO has spot salary (£113,001) not a band
- Highest median employee salary (£27,803 vs ~£20,500 others)
- `cross_council.json` schema normalised ✅
- `insights.json` schema normalised to match Burnley format ✅
- `wards.json` converted from array to keyed object ✅
- `metadata.json` keys standardised (`record_count` → `total_records`) ✅

---

## Resolved Bugs (this session)

| Component | Bug | Impact |
|-----------|-----|--------|
| council_etl.py | Jurisdiction filter computed but unused | Wrong supplier data |
| council_etl.py | 2-digit year guard ineffective | Mis-parsed dates |
| CrossCouncil.jsx | Rossendale data schema mismatch | Blank comparison page |
| CrossCouncil.jsx | `<rect>` instead of `<Cell>` in Recharts | Broken bar colors |
| CrossCouncil.jsx | Missing rossendale in COUNCIL_COLORS | No chart color |
| Budgets.jsx | State update in render body | React anti-pattern |
| Budgets.jsx | `departments['Earmarked Reserves']` no guard | TypeError crash |
| Budgets.jsx | `Object.entries(latestCapital.categories)` no guard | TypeError crash |
| Budgets.jsx | `getDeptValue()` accesses null departments | TypeError crash |
| SupplierView.jsx | `.charAt()` on undefined risk_level | TypeError crash |
| SupplierView.jsx | `.charAt()` on undefined council | TypeError crash |
| Home.jsx | `.map()` on undefined after `.slice()` | Homepage crash |
| useData.js | `preloadData()` cached 404 HTML as JSON | Corrupt cache |
| format.js | `getFinancialYear()` returns "NaN/NaN" | Display bug |
| Meetings.jsx | `new Date(undefined)` shows "Invalid Date" | Display bug |
| articles-index.json | Rossendale object vs array schema | News page crash |
| cross_council.json | 5 copies had wrong Rossendale entry | Compare page crash |

---

## Remaining Issues

| Priority | Issue | Notes |
|----------|-------|-------|
| Medium | `police_etl.py` silently returns empty on 503 | Data gaps undetectable |
| Medium | No articles for Rossendale | Needs `mega_article_writer.py` run |
| Medium | No crime_stats for Rossendale | Needs `police_etl.py` run |
| Medium | 3,167 "NAME WITHHELD" suppliers in Rossendale | 7.4% of spend |
| Medium | `MyArea.jsx` setTimeout leak | No cleanup on unmount |
| Medium | No E2E/integration tests | No Playwright/Cypress |
| Low | @tanstack/react-query installed but unused | `useData` custom hook used instead |
| Low | No TypeScript | All JSX |
| Low | 9 pages untested | Budgets, CrossCouncil, Suppliers, etc. |
| Low | Shared CSS patterns duplicated | Card/section styles repeated |
| Low | `ArticleView` image `alt=""` | Should use `article.title` |

---

## Session 2 Fixes (15 issues resolved)

| Category | Fix | Details |
|----------|-----|---------|
| Security | S1: DOMPurify for XSS | ArticleView sanitises HTML before rendering |
| Security | S2: CSP meta tag | `index.html` Content-Security-Policy header |
| Security | S3: Remove `shell=True` | `daily_audit.py` uses list syntax + `shlex.split()` |
| Security | S4: Actions interpolation | env vars instead of direct output interpolation |
| Security | S5: Job-level permissions | Scoped permissions in both workflow files |
| Security | S6: npm audit in CI | `npm audit --audit-level=moderate` added |
| Performance | A7: Lazy-load Home | All 15 pages now lazy-loaded via `React.lazy()` |
| Performance | A8: React.memo | StatCard, ChartCard wrapped in `memo()` |
| Performance | A3: useMemo | Chart data transforms memoised in Home, Budgets, PayComparison |
| Accessibility | A4: ARIA labels | Tab roles, aria-expanded, aria-label on interactive elements |
| Data | D1-D3: cross_council derived fields | avg_transaction, council_tax, top10_supplier_pct populated |
| Data | D4-D6: Rossendale schema | insights.json, wards.json, metadata.json normalised |
| Data | D8-D9: Feature flags | crime_stats, budgets_govuk flags added to configs |
| Testing | A2: Page tests | Home (6), Spending (5), ErrorBoundary (6) = 17 new tests |
| Performance | Spending data optimization | Strip unused fields (40MB→14MB), progressive year-chunk loading |
| Infra | 404.html SPA routing | Custom 404.html generated at build time for GitHub Pages |

---

## File Reference

```
burnleycouncil/
├── src/                          16,123 lines (JSX + CSS)
│   ├── pages/        15 pages   ~6,800 lines
│   ├── components/   11 components
│   ├── context/      CouncilConfig provider
│   ├── hooks/        useData, useSpendingData (progressive loader)
│   └── utils/        7 format functions
├── burnley-council/
│   ├── data/{council}/           142MB total (4 councils x ~20 files)
│   ├── scripts/                  8,427 lines (10 Python + 3 Shell)
│   └── schemas/                  2 JSON schemas
├── scripts/
│   ├── update-meetings.js        597 lines (meeting scraper)
│   ├── daily_audit.py            Health check runner
│   ├── suggest_improvements.py   Improvement scanner
│   └── sync_cross_council.sh     Cross-council data sync
├── public/data/                  Build-time copy of active council
├── vite.config.js                Plugin + compression + chunking + 404.html
├── package.json                  7 runtime + 12 dev dependencies
└── .github/workflows/            Meeting scraper + daily audit
```
