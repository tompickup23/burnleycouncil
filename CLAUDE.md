# AI DOGE — Claude Code Project Guide

## What This Is

Multi-council public spending transparency platform for Lancashire. React SPA deployed per-council via GitHub Pages at aidoge.co.uk.

**Live councils (8):**
- East Lancashire: Burnley (30,580 txns, £355M), Hyndburn (29,804 txns, £211M), Pendle (49,741 txns, £125M), Rossendale (42,536 txns, £64M)
- Central/South Lancashire: Lancaster (27,317 txns, £157M), Ribble Valley (3,767 txns, £12M), Chorley (17,212 txns, £338M), South Ribble (16,065 txns, £147M)

## Architecture

- **Frontend:** React 19 + Vite 7, lazy-loaded routes, config-driven per council, Web Worker for spending data
- **Data layer 1:** Council CSV spending data → `council_etl.py` → `spending.json` + year-chunked `spending-index.json` + `spending-YYYY-YY.json`
- **Data layer 2:** GOV.UK MHCLG standardised budgets → `govuk_budgets.py` → `budgets_govuk.json`
- **Analysis:** `doge_analysis.py` — duplicates, split payments, CH compliance, Benford's Law, cross-council pricing, weak competition, category monopolies, supplier concentration
- **Deprivation:** `deprivation_etl.py` — IMD 2019 ward-level data from MHCLG + ONS ArcGIS
- **Hosting:** GitHub Pages (free), custom domain aidoge.co.uk
- **Servers:** Thurinus (Oracle x86, 1GB RAM, free), vps-main (Hostinger, 16GB RAM, £22/mo), 2x AWS t3.micro (free trial until Jul 2026)

## Key Build Commands

Builds MUST be sequential (shared `public/data/` causes race conditions):

```bash
# Deploy is AUTOMATIC — just push to main and deploy.yml handles everything.
# Manual commands below are for local testing only.

# Build single council for dev
VITE_COUNCIL=burnley VITE_BASE=/lancashire/burnleycouncil/ npx vite build

# Manual build all 8 councils (if CI/CD is down)
rm -rf /tmp/lancashire-deploy
VITE_COUNCIL=burnley VITE_BASE=/lancashire/burnleycouncil/ npx vite build --outDir /tmp/lancashire-deploy/burnleycouncil
VITE_COUNCIL=hyndburn VITE_BASE=/lancashire/hyndburncouncil/ npx vite build --outDir /tmp/lancashire-deploy/hyndburncouncil
VITE_COUNCIL=pendle VITE_BASE=/lancashire/pendlecouncil/ npx vite build --outDir /tmp/lancashire-deploy/pendlecouncil
VITE_COUNCIL=rossendale VITE_BASE=/lancashire/rossendalecouncil/ npx vite build --outDir /tmp/lancashire-deploy/rossendalecouncil
VITE_COUNCIL=lancaster VITE_BASE=/lancashire/lancastercouncil/ npx vite build --outDir /tmp/lancashire-deploy/lancastercouncil
VITE_COUNCIL=ribble_valley VITE_BASE=/lancashire/ribblevalleycouncil/ npx vite build --outDir /tmp/lancashire-deploy/ribblevalleycouncil
VITE_COUNCIL=chorley VITE_BASE=/lancashire/chorleycouncil/ npx vite build --outDir /tmp/lancashire-deploy/chorleycouncil
VITE_COUNCIL=south_ribble VITE_BASE=/lancashire/southribblecouncil/ npx vite build --outDir /tmp/lancashire-deploy/southribblecouncil

# Hub pages + CNAME (deploy.yml does this automatically)
cp burnley-council/hub/index.html /tmp/lancashire-deploy/index.html
cp burnley-council/hub/404.html /tmp/lancashire-deploy/404.html
echo 'aidoge.co.uk' > /tmp/lancashire-deploy/CNAME
cp public/robots.txt /tmp/lancashire-deploy/robots.txt

# Manual deploy (only if CI/CD is down)
npx gh-pages -d /tmp/lancashire-deploy --repo https://github.com/tompickup23/lancashire.git --no-history
```

## Key File Locations

### Frontend (React SPA)
| File | Purpose |
|------|---------|
| `src/App.jsx` | Router with 16 lazy-loaded routes |
| `src/pages/` | 32 page components + tests (Spending, Budgets, DOGE, News, Procurement, etc.) |
| `src/components/` | Shared UI components (Layout, ChartCard, StatCard, etc.) |
| `src/context/CouncilConfig.jsx` | Council-specific config context provider |
| `src/hooks/useData.js` | Data fetching hook (loads from /data/*.json) |
| `src/hooks/useSpendingWorker.js` | Web Worker hook for spending data (v3 chunked + v2/v1 fallback) |
| `src/workers/spending.worker.js` | Web Worker: filter, sort, paginate, stats, charts, CSV export |
| `src/utils/constants.js` | Shared constants: CHART_COLORS, TYPE_LABELS, TOOLTIP_STYLE, SEVERITY_COLORS, COUNCIL_COLORS |
| `src/workers/spending.utils.js` | Pure utility functions shared by worker and tests |
| `vite.config.js` | Build config with councilDataPlugin() for multi-council parameterisation |
| `index.html` | Template with %PLACEHOLDER% tokens replaced at build time |
| `e2e/` | Playwright E2E tests: smoke, news, spending, legal, navigation (31 tests) |

### Data Pipeline (Python)
| File | Purpose |
|------|---------|
| `burnley-council/scripts/council_etl.py` | Main ETL: CSV → spending.json, CH enrichment, crime stats |
| `burnley-council/scripts/doge_analysis.py` | DOGE analysis: duplicates, splits, CH compliance, Benford's, cross-council |
| `burnley-council/scripts/govuk_budgets.py` | GOV.UK budget data fetch and parse |
| `burnley-council/scripts/govuk_trends.py` | Revenue trend analysis |
| `burnley-council/scripts/police_etl.py` | Police crime stats API |
| `burnley-council/scripts/procurement_etl.py` | Contracts Finder API → procurement.json per council |
| `burnley-council/scripts/deprivation_etl.py` | IMD 2019 ward-level deprivation from MHCLG + ONS ArcGIS |
| `burnley-council/scripts/fts_etl.py` | Find a Tender Service ETL scaffold (needs CDP API key) |
| `burnley-council/scripts/charity_etl.py` | Charity Commission API cross-check for council suppliers |
| `burnley-council/scripts/article_pipeline.py` | Data-driven article generation (topic discovery + LLM + fact verification) |
| `burnley-council/scripts/build_council.sh` | Shell wrapper for building a specific council |
| `scripts/setup_uptimerobot.sh` | Create UptimeRobot monitors for all council sites (requires API key) |
| `scripts/vps_backup.sh` | Weekly rsync backup of vps-main + vps-news to local machine |

### News Lancashire Scripts (on vps-news: `/home/ubuntu/newslancashire/scripts/`)
| File | Purpose |
|------|---------|
| `ai_rewriter.py` | Batch rewrite article summaries via LLM (Gemini → Groq → Kimi → DeepSeek) |
| `ai_analyzer.py` | AI analysis of high-interest articles |
| `digest/ai_digest_generator.py` | Generate borough + category digests |
| `llm_rate_limiter.py` | File-based daily rate limiter — tracks requests + tokens per provider |
| `crawler_v3.py` | RSS/Bluesky/Google News crawling, SQLite storage |
| `export_json.py` | Export SQLite → JSON for Hugo site |
| `generate_hugo_content.py` | Generate Hugo markdown from JSON |

### Data Files (per council: `burnley-council/data/{council_id}/`)
| File | Generated By | Notes |
|------|-------------|-------|
| `spending.json` | council_etl.py | Core transaction data (15-40MB, v2 format) |
| `spending-index.json` | council_etl.py | v3 year manifest + filterOptions (~110KB, gitignored) |
| `spending-YYYY-YY.json` | council_etl.py | Year-chunked records (~4-8MB each, gitignored) |
| `config.json` | Manual | Controls features, branding, navigation |
| `procurement.json` | procurement_etl.py | Contracts Finder procurement notices |
| `doge_findings.json` | doge_analysis.py | Analysis findings for DOGE page |
| `doge_verification.json` | doge_analysis.py | Self-verification scores |
| `articles-index.json` | article_pipeline.py / manual | Article listings (auto-generated daily via cron) |
| `foi_templates.json` | Manual per council | FOI request templates |
| `revenue_trends.json` | govuk_trends.py | GOV.UK revenue data |
| `deprivation.json` | deprivation_etl.py | Ward-level IMD 2019 deprivation data |
| `supplier_profiles.json` | generate_supplier_profiles.py | Supplier deep dives |

### Shared Data (`burnley-council/data/shared/`)
| File | Purpose |
|------|---------|
| `legal_framework.json` | 12 UK council oversight laws |

## Critical Rules

1. **Never edit spending.json manually** — it's generated by council_etl.py
2. **Never edit doge_findings.json manually** — it's generated by doge_analysis.py
3. **Builds must be sequential** — the vite plugin copies data to shared `public/data/`
4. **config.json is the source of truth** for council features (what pages show in nav, etc.)
5. **Data in public/ is ephemeral** — copied from burnley-council/data/ at build time, gitignored
6. **No API keys in code** — use environment variables
7. **Clawdbot config lives on vps-main only** — at `/opt/clawdbot/` and `/root/clawd/`. No agent config files in this repo.
8. **supplier_profiles.json files are huge** (~400K lines each) — don't `git add` them without checking size first
9. **Don't commit .json data files casually** — spending.json, supplier_profiles.json, doge_findings.json etc. are large generated files. Only commit when data has actually changed. spending-index.json and spending-YYYY-YY.json are gitignored (generated by ETL).
10. **Test builds before committing** — `VITE_COUNCIL=burnley VITE_BASE=/ npx vite build` should exit 0

## SSH Hosts (configured in ~/.ssh/config)

| Alias | Host | User | Key |
|-------|------|------|-----|
| `vps-news` | 141.147.79.228 | ubuntu | ~/.ssh/vps-news.key |
| `vps-main` | 76.13.254.176 | root | ~/.ssh/id_ed25519 |
| `aws-1` | 51.20.51.127 | ubuntu | ~/.ssh/aws-1.pem |
| `aws-2` | 56.228.32.194 | ubuntu | ~/.ssh/aws-2.pem |

## How Multi-Council Works

`vite.config.js` contains `councilDataPlugin()` which:
1. Reads `VITE_COUNCIL` env var (burnley/hyndburn/pendle/rossendale/lancaster/ribble_valley/chorley/south_ribble)
2. Copies `burnley-council/data/{council}/` → `public/data/`
3. Copies `burnley-council/data/shared/` → `public/data/shared/`
4. Replaces `%PLACEHOLDER%` tokens in index.html with council-specific values from config.json
5. Sets `base` path from `VITE_BASE` env var

The React app is council-agnostic — it reads config.json at runtime and conditionally renders features.

## DOGE Analysis Pipeline

```
council_etl.py --council {id}    →  spending.json (v2), spending-index.json + spending-YYYY-YY.json (v3 chunks)
doge_analysis.py                 →  doge_findings.json, doge_verification.json (all councils)
```

### Spending Data Versions
- **v1** (legacy): spending.json as plain array of records — no longer used (all migrated to v2, 10 Feb)
- **v2** (current): spending.json as `{ meta, filterOptions, records }` object — all 8 councils
- **v3** (chunked): spending-index.json (manifest + filterOptions) + spending-YYYY-YY.json per year
- Worker (spending.worker.js) auto-detects version: tries v3 first, falls back to v2/v1
- v3 reduces initial mobile download from 21-40MB to ~4-8MB (latest year only)

Analysis checks: duplicate payments, split payment evasion, year-end spikes, round-number anomalies, Companies House compliance (temporal overlap), cross-council price gaps, Benford's Law forensic screening, payment cadence, day-of-week patterns, weak competition detection (short tenders, rapid awards), category monopoly analysis, late contract publication.

## Deployment

**Automated:** Push to `main` triggers `.github/workflows/deploy.yml` which builds all 8 councils and deploys to GitHub Pages. Zero AI tokens, zero cost.

- **Source repo:** tompickup23/burnleycouncil (this repo)
- **Deploy repo:** tompickup23/lancashire (gh-pages branch)
- **Hub repo:** tompickup23/tompickup23.github.io
- **Domain:** aidoge.co.uk → GitHub Pages with CNAME
- **CI/CD:** GitHub Actions (`deploy.yml`) — tests → build 8 councils → deploy → verify
- **Hub pages:** `burnley-council/hub/` — root 404.html handles SPA routing for all councils
- **Docs-only changes** (`.md` files, reports) do NOT trigger a rebuild

### DEPLOY_TOKEN Setup (one-time)
If the `DEPLOY_TOKEN` secret expires or needs rotating:
1. Create fine-grained PAT at https://github.com/settings/tokens?type=beta
2. Scope to `tompickup23/lancashire` repo, permission: Contents Read+Write
3. Add as secret at burnleycouncil repo → Settings → Secrets → Actions → `DEPLOY_TOKEN`

## Agent System

- **Gaius (Claude Code):** Heavy development, architecture, multi-file edits
- **Codex (OpenAI):** CLI dev agent, trial expires 2 Mar 2026
- **OpenCode:** CLI dev agent, free tier
- **Octavian (Clawdbot):** WhatsApp bot on vps-main, uses Kimi K2.5 (trial credits)
- **OpenAgents:** 3 agent processes on vps-main + Ollama (qwen2.5:7b)
- **clawd-worker:** AI DOGE data processing slave on vps-main
- **News Lancashire LLM chain:** Gemini 2.5 Flash (free primary) → Groq (blocked from VPS) → Kimi → DeepSeek (dead). Rate-limited via `llm_rate_limiter.py`.

See [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) for full server details, resource usage, and service inventory.

## Dev Server

```bash
VITE_COUNCIL=burnley VITE_BASE=/ npx vite
# Opens at http://localhost:5173
```

## Common Mistakes to Avoid

- **Don't create agent/bot config files in this repo** — Clawdbot lives on vps-main, not here
- **Don't assume Oracle VPS has lots of RAM** — vps-news is only 1GB RAM, memory-constrained. Never run Node.js/wrangler on it (OOM risk).
- **Don't run wrangler on vps-news** — caused OOM crash 9 Feb. Use `deploy_newslancashire.sh` on vps-main instead.
- **Don't run `git add .` or `git add -A`** — supplier_profiles.json files are 400K+ lines each
- **Don't edit generated JSON** — spending.json, doge_findings.json, doge_verification.json are all generated
- **Don't duplicate info across docs** — CLAUDE.md = dev guide, ARCHITECTURE.md = software, INFRASTRUCTURE.md = ops

## Expansion Targets

### Lancashire County Council (upper-tier)
- **Net budget**: £1,324.444m (Reform UK, 53/84 seats)
- **Spending data**: lancashire.gov.uk/council/finance/spending-over-500/
- **Budget data**: Already in MHCLG dataset (govuk_budgets.py)
- **Key issues**: VeLTIP bonds (£350m loss), DSG deficit (£171m→£420m), CQC worst, Operation Sheridan
- **War-game reports**: `LCC_Budget_2026-27_War_Game.md`, `LCC_Budget_2026-27_Reform_Defence.md`

### Blackpool (unitary authority)
- **Data dir exists**: `burnley-council/data/blackpool/` (budgets_govuk.json + budgets_summary.json only)
- **NOT yet in COUNCIL_REGISTRY** — needs spending CSV parser
- **Budget analysis**: `blackpool_budget_analysis.md` (Reform councillor strategy)

### Adding New Councils
See AIDOGE-MASTERPLAN.md Phase 11 for full expansion plan. Key constraint: LCC is 10x larger than any current district council — may need worker optimisation for 100K+ transactions.

## Cost: £22/month (Hostinger VPS — Clawdbot, email, clawd-worker). LLM costs: £0 (Gemini free tier). 2x AWS free trial ends Jul 2026.
