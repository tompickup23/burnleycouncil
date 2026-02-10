# HANDOVER.md - AI DOGE Project Handover

> **Last updated:** 9 February 2026 (session 2)
> **Repo:** `tompickup23/burnleycouncil`
> **Live site:** https://aidoge.co.uk
> **Owner:** Tom Pickup

---

## 1. What This Project Is

AI DOGE (Department of Government Efficiency) is a public spending transparency platform auditing UK council finances using open data and AI analysis. It serves static React SPAs via GitHub Pages at zero monthly cost.

**Live councils:**

| Council | URL | Repo | Records | Spend | Threshold |
|---------|-----|------|---------|-------|-----------|
| Burnley | /burnleycouncil/ | burnleycouncil | 30,580 | £355M | £500+ |
| Hyndburn | /lancashire/hyndburncouncil/ | lancashire | 29,802 | £211M | £250+ |
| Pendle | /lancashire/pendlecouncil/ | lancashire | 48,785 | £127M | £500+ |
| Rossendale | /lancashire/rossendalecouncil/ | lancashire | 42,536 | £64M | £500+ |
| **Total** | | | **152,000+** | **£757M** | |

---

## 2. Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 19 + Vite 7 | SPA with client-side routing |
| Routing | React Router DOM 7 | 15 pages, all lazy-loaded |
| Data fetching | TanStack React Query 5 | Caching + server state |
| Charts | Recharts 3 | All budget/spending visualisations |
| Icons | Lucide React | Consistent icon set |
| Virtualisation | TanStack React Virtual 3 | Large spending lists |
| Hosting | GitHub Pages | `gh-pages` branch, custom domain |
| CI | GitHub Actions | Weekly meeting scraper + daily audit |
| Testing | Vitest + React Testing Library | `npm run test` (103 tests) |
| Linting | ESLint 9 | `npm run lint` |
| Compression | vite-plugin-compression | Gzip + Brotli at build |

---

## 3. Repository Structure

```
burnleycouncil/
├── src/                        # React SPA source
│   ├── main.jsx                # Entry point
│   ├── App.jsx                 # Root router (13 routes)
│   ├── pages/                  # Route pages
│   │   ├── Home.jsx            # Landing
│   │   ├── Spending.jsx        # Transaction explorer
│   │   ├── Budgets.jsx         # Budget charts
│   │   ├── News.jsx            # Articles list
│   │   ├── ArticleView.jsx     # Single article
│   │   ├── Politics.jsx        # Councillor data
│   │   ├── MyArea.jsx          # Ward lookup
│   │   ├── Meetings.jsx        # Meeting calendar
│   │   ├── PayComparison.jsx   # Officer pay data
│   │   ├── CrossCouncil.jsx    # Multi-council comparison
│   │   ├── Suppliers.jsx       # Supplier search
│   │   ├── SupplierView.jsx    # Supplier detail
│   │   ├── FOI.jsx             # FOI templates
│   │   ├── About.jsx           # About page
│   │   └── Legal.jsx           # Disclaimers
│   ├── components/
│   │   ├── Layout.jsx          # Master layout wrapper
│   │   └── ui/                 # Reusable: PageHeader, StatCard,
│   │                           #   ChartCard, TabNav, SearchableSelect,
│   │                           #   LoadingState, ErrorBoundary, DataFreshness
│   ├── context/
│   │   └── CouncilConfig.jsx   # React Context for council config
│   ├── hooks/
│   │   └── useData.js          # Data fetching + caching
│   └── utils/
│       └── format.js           # Number/currency formatting
│
├── burnley-council/            # Data & analysis
│   ├── data/
│   │   ├── burnley/            # Burnley JSON data files
│   │   ├── hyndburn/           # Hyndburn JSON data files
│   │   ├── pendle/             # Pendle JSON data files
│   │   └── rossendale/         # Rossendale JSON data files
│   ├── schemas/                # JSON validation schemas
│   ├── doge_analysis.py        # Python spending analysis
│   └── *.md                    # Per-council docs
│
├── scripts/
│   ├── update-meetings.js      # Meeting scraper (GitHub Actions)
│   ├── daily_audit.py          # Automated health checks (GitHub Actions)
│   ├── suggest_improvements.py # Rule-based improvement scanner
│   └── sync_cross_council.sh   # Sync cross_council.json to all dirs
│
├── public/
│   ├── data/                   # Build-time council data (copied by Vite plugin)
│   └── images/                 # Article images
│
├── .github/workflows/
│   ├── update-meetings.yml     # Weekly cron: scrape + commit meetings
│   └── daily-audit.yml         # Daily health audit + issue creation
│
├── workspace/                  # Hugo themes + nginx configs (News sites)
├── memory/                     # AI agent session logs
├── vite.config.js              # Multi-council Vite build
├── package.json                # Dependencies
└── [Documentation .md files]   # ARCHITECTURE, MASTERPLAN, OVERVIEW, etc.
```

---

## 4. How to Run Locally

```bash
# Install dependencies
npm install

# Dev server (defaults to Burnley)
npm run dev

# Dev server for a different council
VITE_COUNCIL=hyndburn VITE_BASE=/hyndburn/ npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# Run tests
npm run test

# Lint
npm run lint
```

---

## 5. Multi-Council Build System

The SPA is council-agnostic. A custom Vite plugin (`councilDataPlugin` in `vite.config.js`) handles parameterisation:

1. Reads `VITE_COUNCIL` env var (default: `burnley`)
2. Copies data from `burnley-council/data/{council}/` to `public/data/`
3. **Optimises `spending.json`** — strips unused fields (~50% size reduction) and splits into per-financial-year chunks for progressive loading
4. Injects council name, totals, and metadata into `index.html` template placeholders
5. Builds with `VITE_BASE` as the base path (e.g. `/burnleycouncil/`, `/hyndburn/`)

**To build a specific council:**
```bash
VITE_COUNCIL=pendle VITE_BASE=/pendle/ npm run build
```

**To deploy (all councils):**
Each council is built separately and pushed to the `gh-pages` branch under its own path.

---

## 6. Data Files Per Council

Each council in `burnley-council/data/{council}/` has:

| File | Purpose |
|------|---------|
| `config.json` | Council identity, features, theme, publisher, DOGE context |
| `spending.json` | All transactions (8-14MB optimised at build, 21-40MB raw) |
| `insights.json` | Pre-computed spending insights |
| `metadata.json` | Data period, record counts |
| `articles-index.json` | Article list (id, title, date, summary, tags) |
| `articles/{id}.json` | Individual article content (HTML) |
| `doge_findings.json` | Statistical analysis results |
| `councillors.json` | Councillor names, parties, wards |
| `foi_templates.json` | Pre-written FOI request templates |
| `pay_comparison.json` | Senior officer pay data |
| `revenue_trends.json` | Year-over-year revenue |
| `budgets_govuk.json` | GOV.UK MHCLG budget data |
| `crime_stats.json` | Police API crime stats |
| `supplier_profiles.json` | Supplier metadata |
| `meetings.json` | Council meeting calendar (shared, in public/data/) |

At build time, the relevant council's data files are copied into `public/data/` so the SPA can load them as static assets. The build plugin also generates `spending-index.json` and per-year `spending-{year}.json` chunks for progressive loading.

### Key config.json Fields

| Field | Purpose |
|-------|---------|
| `council_id`, `council_name`, `council_full_name` | Identity |
| `official_website`, `moderngov_url` | External links |
| `spending_threshold` | Minimum payment value in data |
| `data_sources` | Feature flags (which nav items show) |
| `publisher`, `publisher_bio`, `publisher_titles` | About page creator section |
| `publisher_photo`, `publisher_quote`, `publisher_social` | Creator photo, quote, social links |
| `foi_url` | Council-specific FOI submission URL |
| `theme_accent` | Brand colour |
| `doge_context` | Spending analysis context for AI/LLM use |

---

## 7. Key React Patterns

### Council Context
`src/context/CouncilConfig.jsx` provides council configuration to all components. Every page reads council identity, feature flags, and theme from this context.

### Data Fetching
`src/hooks/useData.js` wraps TanStack React Query. All data files are fetched from `/data/{filename}` relative to the base path. Results are cached client-side.

### Routing
`src/App.jsx` defines all routes with React Router. Most pages are lazy-loaded via `React.lazy()`. A `404.html` on GitHub Pages handles SPA routing by redirecting with a `?p=` query parameter.

### UI Components
Shared components in `src/components/ui/` (barrel-exported from `index.js`): `PageHeader`, `StatCard`, `ChartCard`, `TabNav`, `SearchableSelect`, `LoadingState`, `ErrorBoundary`, `DataFreshness`.

---

## 8. Data Pipeline (Upstream)

Data is generated on separate infrastructure and committed to this repo:

```
Council open data (CSV) → council_etl.py → spending.json + insights.json + metadata.json
GOV.UK MHCLG (ODS)     → govuk_budgets.py → budgets_govuk.json
doge_analysis.py        → doge_findings.json
Police API              → police_etl.py → crime_stats.json
ModernGov/Jadu scraper  → update-meetings.js → meetings.json (via GitHub Actions)
mega_article_writer.py  → articles/{id}.json (LLM-generated via Kimi)
councillor_scraper.py   → councillors.json
```

**ETL scripts live on VPS-MAIN (Hostinger) and VPS-NEWS (Oracle).** They are NOT in this repo. The `burnley-council/doge_analysis.py` is a local copy for reference.

The only automated pipeline in this repo is the GitHub Actions meeting scraper (`.github/workflows/update-meetings.yml`), which runs weekly.

---

## 9. Infrastructure

| Server | Purpose | Cost |
|--------|---------|------|
| GitHub Pages | Static site hosting (aidoge.co.uk) | Free |
| VPS-MAIN (Hostinger) | Clawdbot, automation scripts, cron jobs | Paid (Tom's) |
| VPS-NEWS (Oracle Free Tier) | News crawlers, ETL scripts | Free forever |
| Cloudflare Pages | newslancashire.co.uk | Free |

**Domain:** `aidoge.co.uk` points to GitHub Pages via A records (185.199.108-111.153) + CNAME www.

---

## 10. GitHub Actions

### update-meetings.yml
- **Schedule:** Sundays 03:00 UTC + manual dispatch
- **What it does:** Runs `scripts/update-meetings.js` to scrape meeting data from 4 council democracy portals (Burnley, Hyndburn via ModernGov; Pendle, Rossendale via Jadu)
- **Output:** Updates `public/data/meetings.json`
- **Auto-commits** if data changed
- **Retry logic:** Exponential backoff (1s, 2s, 4s) on network failures

### daily-audit.yml
- **Schedule:** Daily 06:00 UTC + manual dispatch
- **What it does:** Runs `scripts/daily_audit.py` — tests, lint, build, data validation, git sync check
- **Output:** Creates GitHub issue if errors found
- **Security:** Job-level permissions, env-var interpolation (no shell injection)

---

## 11. Known Issues & Technical Debt

### Code Bugs (from MASTERPLAN audit) — RESOLVED
1. ~~`council_etl.py` line 1016: jurisdiction filter useless~~ ✅ Fixed: `uk_active` now used instead of `active`; dead `uk_jurisdictions` var removed
2. ~~`police_etl.py` line 121: `urllib.parse` imported after use~~ ✅ Already fixed (import at line 30)
3. ~~`council_etl.py` lines 95-96: ambiguous 2-digit year parsing~~ ✅ Fixed: replaced with year range validation (2000-2030)
4. `police_etl.py` lines 111-118: 503 errors return empty list after retries (prints warning but caller has no way to detect data gaps)

### SPA Hardcoded References — RESOLVED
All SPA components are now fully parameterised via `CouncilConfig` context:
- `Layout.jsx`: Uses `councilName` from config ✅
- `Politics.jsx`: Dynamic councillor/ward counts from data ✅
- `Spending.jsx`: CSV filename uses `councilId` ✅
- `About.jsx`: Creator section driven by config (photo, social, quote, bio) ✅
- `FOI.jsx`: Council-specific templates + config-driven FOI URL ✅

### SPA Bug Fixes (Feb 2026) — RESOLVED
- `CrossCouncil.jsx`: Rossendale data schema mismatch fixed (all 5 copies of cross_council.json), added rossendale to COUNCIL_COLORS, fixed `<rect>` → `<Cell>` in Recharts bars ✅
- `Budgets.jsx`: State update in render body moved to useEffect, optional chaining for departments access, guard on latestCapital.categories ✅
- `SupplierView.jsx`: Guard `.charAt()` on undefined risk_level and council ✅
- `Home.jsx`: Optional chaining on `.map()` after `.slice()` for top suppliers ✅
- `useData.js`: preloadData() now checks `r.ok` before caching ✅
- `format.js`: getFinancialYear() validates date before parsing ✅
- `Meetings.jsx`: Guard on undefined last_updated date ✅
- `Rossendale articles-index.json`: Changed from `{articles:[]}` object to `[]` array ✅

### Performance
- `spending.json` file sizes: Burnley 21MB, Hyndburn 21MB, Rossendale 25MB, **Pendle 40MB** (49,741 records)
- All spending data fetched in one `fetch()` call — no pagination at network level
- **TanStack React Virtual wired up** ✅ — Spending table `<tbody>` uses `useVirtualizer` with spacer-row pattern (replaced pagination with infinite scroll in 600px container, `overscan: 20`)
- **Pre-gzipping already handled** ✅ — `vite-plugin-compression` generates `.gz` and `.br` for all build output including JSON data files (spending.json: 21MB → 436KB brotli, 898KB gzip). GitHub Pages CDN (Fastly) also does on-the-fly gzip compression.
- No TypeScript (all JSX)
- Test coverage: 103 tests across 7 files (`format`, `useData`, `About`, `PayComparison`, `Home`, `Spending`, `ErrorBoundary`)

---

## 12. Features & Planned Work

### Completed
- **Executive Pay Comparison page** ✅ — CEO profiles, salary trends, pay ratios, TPA Rich List, councillor allowances, gender pay gap
- **Council-specific FOI templates** ✅ — all 4 councils have tailored templates with council-specific issues
- **Rossendale council** ✅ — fully integrated with all data files
- **SPA parameterisation** ✅ — all components config-driven, no hardcoded council references
- **Security hardening** ✅ — CSP meta tag, DOMPurify for article HTML, shell=True removal, Actions interpolation safety
- **Error handling** ✅ — all 15 pages handle `useData` errors with consistent error UI
- **Accessibility** ✅ — ARIA labels on interactive elements, semantic landmarks, tab roles
- **Performance** ✅ — React.memo on StatCard/ChartCard, useMemo on chart data transforms, Home lazy-loaded
- **Testing** ✅ — 103 tests across 7 test files (format, useData, About, PayComparison, Home, Spending, ErrorBoundary)
- **SPA routing** ✅ — Custom 404.html generated at build time for GitHub Pages sub-route support
- **Automated audit** ✅ — daily_audit.py + GitHub Actions workflow for continuous health monitoring
- **Data quality** ✅ — cross_council.json derived fields populated, Rossendale schema normalised

### Planned
- **Cross-Council Comparison dashboard** - side-by-side metrics
- **Supplier Deep Dive pages** - dynamic per-supplier profiles
- **"What Changed?" tracking** - accountability loop on published findings
- **Postcode to Ward lookup** - via postcodes.io (free, no key)
- **More councils** - Lancashire CC, Preston, Blackburn

---

## 13. How to Add a New Council

1. **Get data:** Download CSVs from council open data portal
2. **Run ETL:** `python3 council_etl.py --council {id}` to generate `spending.json`, `insights.json`, `metadata.json`
3. **Create config:** Add `burnley-council/data/{council}/config.json` (follow existing schema in `schemas/config.schema.json`)
4. **Add data files:** Place all JSON files in `burnley-council/data/{council}/`
5. **Build:** `VITE_COUNCIL={id} VITE_BASE=/{path}/ npm run build`
6. **Deploy:** Push build output to `gh-pages` branch under the council path

---

## 14. Key Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run test` | Run test suite |
| `npm run lint` | ESLint check |
| `npm run preview` | Preview prod build |
| `npm run deploy` | Build + push to gh-pages |
| `VITE_COUNCIL=X VITE_BASE=/X/ npm run dev` | Dev server for council X |
| `node scripts/update-meetings.js` | Scrape meeting data |
| `python3 scripts/daily_audit.py` | Run health audit |
| `python3 scripts/suggest_improvements.py` | Scan for improvements |
| `bash scripts/sync_cross_council.sh` | Sync cross_council.json |

---

## 15. Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_COUNCIL` | `burnley` | Which council to build |
| `VITE_BASE` | `/burnleycouncil/` | Base path for deployment |

No API keys or secrets are needed for the frontend build. API keys (Companies House, police data) are only used by upstream ETL scripts on the VPS servers.

---

## 16. Related Repos & Projects

| Project | Repo | Purpose |
|---------|------|---------|
| AI DOGE | tompickup23/burnleycouncil | This repo - council transparency SPAs |
| News Lancashire | tompickup23/newslancashire | Local news aggregator (Cloudflare Pages) |
| News Burnley | tompickup23/newsburnley | Burnley-specific news (AWS) |

---

## 17. Contact

- **Tom Pickup** - Project owner
- **GitHub:** tompickup23
- **Clawdbot (Octavian)** - AI assistant accessible via WhatsApp/Telegram/Discord

---

*This handover document provides everything needed to understand, build, run, and extend the AI DOGE platform. For strategic direction, see `AIDOGE-MASTERPLAN.md`. For full system architecture, see `AIDOGE-OVERVIEW.md`.*
