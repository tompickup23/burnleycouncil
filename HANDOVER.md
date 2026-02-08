# HANDOVER.md - AI DOGE Project Handover

> **Last updated:** 8 February 2026
> **Repo:** `tompickup23/burnleycouncil`
> **Live site:** https://aidoge.co.uk
> **Owner:** Tom Pickup

---

## 1. What This Project Is

AI DOGE (Department of Government Efficiency) is a public spending transparency platform auditing UK council finances using open data and AI analysis. It serves static React SPAs via GitHub Pages at zero monthly cost.

**Live councils:**

| Council | URL | Records | Spend | Threshold |
|---------|-----|---------|-------|-----------|
| Burnley | /burnleycouncil/ | 30,580 | £355M | £500+ |
| Hyndburn | /hyndburn/ | 29,802 | £211M | £250+ |
| Pendle | /pendle/ | 48,785 | £127M | £500+ |
| **Total** | | **110,000+** | **£693M** | |

---

## 2. Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 19 + Vite 7 | SPA with client-side routing |
| Routing | React Router DOM 7 | 13 pages, lazy-loaded |
| Data fetching | TanStack React Query 5 | Caching + server state |
| Charts | Recharts 3 | All budget/spending visualisations |
| Icons | Lucide React | Consistent icon set |
| Virtualisation | TanStack React Virtual 3 | Large spending lists |
| Hosting | GitHub Pages | `gh-pages` branch, custom domain |
| CI | GitHub Actions | Weekly meeting scraper |
| Testing | Vitest + React Testing Library | `npm run test` |
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
│   └── update-meetings.js      # Meeting scraper (GitHub Actions)
│
├── public/
│   ├── data/                   # Build-time council data (copied by Vite plugin)
│   └── images/                 # Article images
│
├── .github/workflows/
│   └── update-meetings.yml     # Weekly cron: scrape + commit meetings
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
3. Injects council name, totals, and metadata into `index.html` template placeholders
4. Builds with `VITE_BASE` as the base path (e.g. `/burnleycouncil/`, `/hyndburn/`)

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
| `config.json` | Council identity, features, theme, DOGE context |
| `spending.json` | All transactions (5-40MB) |
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

At build time, the relevant council's data files are copied into `public/data/` so the SPA can load them as static assets.

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

---

## 11. Known Issues & Technical Debt

### Code Bugs (from MASTERPLAN audit)
1. `council_etl.py` line 1016: `or True` makes jurisdiction filter useless
2. `police_etl.py` line 121: `urllib.parse` imported after use
3. `council_etl.py` lines 95-96: ambiguous 2-digit year parsing
4. `police_etl.py` lines 191-194: 503 errors silently return empty list

### SPA Hardcoded References
- `Layout.jsx`: "Burnley Council" in mobile header + footer
- `Politics.jsx`: "45 councillors representing 15 wards across Burnley"
- `Spending.jsx`: CSV export filename hardcoded to "burnley-spending-export"
- `About.jsx`: Entire page is a personal bio, not parameterised
- `FOI.jsx`: All 15 templates hardcoded to Burnley issues

### Performance
- `spending.json` up to 40MB (Pendle) - needs pagination/lazy loading
- No TypeScript (all JSX)
- Shared components duplicated across pages in some cases
- Zero test coverage beyond `useData` and `format` utils

---

## 12. Planned Features (from MASTERPLAN)

- **Executive Pay Comparison page** - cross-council senior officer salary analysis
- **Cross-Council Comparison dashboard** - side-by-side metrics
- **Supplier Deep Dive pages** - dynamic per-supplier profiles
- **Council-specific FOI templates** - tailored per council (currently Burnley-only)
- **"What Changed?" tracking** - accountability loop on published findings
- **Postcode to Ward lookup** - via postcodes.io (free, no key)
- **More councils** - Rossendale (data exists), Lancashire CC, Preston, Blackburn

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
