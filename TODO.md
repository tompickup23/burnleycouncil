# AI DOGE — Task List

> Central task tracker. Updated by Claude Code sessions.
> Last updated: 10 February 2026 (free LLM providers live, pipeline audit updated)

## Priority 1 — Broken / Blocking

- [x] **Fix Clawdbot fetch errors** — ✅ Done (9 Feb 2026). Root cause: Discord (Gateway 4014 — Privileged Intents not enabled) and Telegram (409 conflict) were enabled but broken, causing continuous reconnection loops → `fetch failed` every 10-40s. Fix: disabled Discord and Telegram in `/root/.openclaw/openclaw.json`, restarted service. WhatsApp-only now, running clean.
- [x] **Register Companies House API key** — ✅ Done. Key `07316ecc-...` set in `/home/ubuntu/aidoge/.env` on vps-news. Ready for `council_etl.py --companies-house`.
- [x] **Set up DEPLOY_TOKEN for CI/CD** — ✅ Done (9 Feb 2026). deploy.yml fully fixed: tests before build, hub pages + CNAME + robots.txt in deploy, post-deploy verification. User creates PAT and adds as `DEPLOY_TOKEN` secret. Every push to main auto-deploys.
- [ ] **Rebuild airdustodour.co.uk** — ⏰ DEADLINE 29 Mar 2026 (Bluehost expires). **Separate project** at `/Users/tompickup/airdustodour/` with its own CLAUDE.md. Build started (CSS + logos done), HTML pages remaining. Static HTML/CSS → Cloudflare Pages (free).

## Priority 2 — High Impact

- [ ] **Set up monitoring/alerting** — No alerting exists. aws-2 died unnoticed. Free UptimeRobot (50 monitors) pinging 4 council sites + 2 servers would alert within 5 minutes.
- [x] **Split spending.json for mobile** — ✅ Done (9 Feb 2026). ETL generates v3 year-chunked files: spending-index.json + spending-YYYY-YY.json per year. Worker tries chunked first, falls back to monolith. Latest year auto-loaded (~4-8MB vs 21-40MB). Progressive loading for older years.
- [ ] **VPS backup strategy** — vps-main runs everything (Clawdbot, email, CRM, clawd-worker) with no backup. A `docker compose` export + rsync to Oracle (vps-news) would protect against Hostinger outage.
- [x] **Add analytics to council sites** — ✅ Active (9 Feb 2026). Cloudflare Web Analytics beacon deployed to all 4 councils via CI/CD. Token `477d0d4d...` set as CF_ANALYTICS_TOKEN repo secret. Beacon injected at build time by vite.config.js.

## Priority 3 — Improvements

- [ ] **Cancel both AWS instances** — Both trials end July 2026. aws-2 is already dead. aws-1 no longer needed (newsburnley moved to Cloudflare Pages).
- [ ] **Rotate exposed API keys** — OpenAI, Kimi, DeepSeek, Companies House keys were in .claude/settings.local.json (now removed). Need rotating on provider dashboards.
- [x] **Fix council_etl.py `or True` bug** — ✅ Done (9 Feb 2026). Removed redundant jurisdiction filter — CH API only returns UK companies. Previous filter had overly broad `or not country` clause.
- [x] **Fix police_etl.py import bug** — ✅ Already fixed. urllib.parse is correctly imported at line 30 (top of file). The bug was resolved in a prior session.
- [x] **Autonomous article pipeline** — ✅ Done (9 Feb 2026). New article_pipeline.py: data-driven topic discovery from spending data → LLM generation (Kimi K2.5 → Cerebras → Groq → DeepSeek failover) → fact verification → output to articles dir. Cron 9am daily on vps-main, 2 articles/council/run. Old mega_article_writer disabled (28/28 queue exhausted). Generates supplier concentration, department spending, DOGE findings, spending trends articles. **Auto-commit added (9 Feb night):** articles now auto-committed + pushed to trigger CI/CD deploy.
- [x] **Rebuild newslancashire.co.uk deploy** — ✅ Done (9 Feb 2026). Site is actually Hugo (not Astro). Pipeline: generate_hugo_content.py → hugo --minify → deploy via wrangler. Deploy moved from vps-news (1GB OOM risk) to vps-main (16GB). deploy_newslancashire.sh: SSH build on vps-news → rsync to vps-main → wrangler deploy. Cron 10am daily. 962 pages built from 796 articles.
- [x] **Push newslancashire repo to GitHub** — ✅ Done (10 Feb 2026). 4 commits pushed to `tompickup23/newslancashire` (private). Deploy key added (vps-news SSH key, write access). Remote: `origin git@github.com:tompickup23/newslancashire.git`. Branch: `master`.
- [x] **Switch to free LLM providers** — ✅ Done (10 Feb 2026). Gemini 2.5 Flash is now primary (free, 500 req/day, 250K tokens/day). Fallback chain: Gemini → Groq (blocked from VPS) → Kimi → DeepSeek (dead). Rate limiter (`llm_rate_limiter.py`) tracks daily usage per provider. All 3 pipeline scripts patched: ai_rewriter.py, ai_analyzer.py, ai_digest_generator.py. Tested: 16 digests generated via Gemini in single run. Pipeline uses ~80 req/day, ~170K tokens — well within free tier.
- [ ] ~~**Top up DeepSeek API credits**~~ — Mitigated: Gemini is free primary. DeepSeek still dead (402) but no longer needed.
- [ ] **Check Moonshot/Kimi credit balance** — api.moonshot.ai working but may have limited credits. Check at platform.moonshot.ai. Now only used as fallback (not primary).
- [ ] **News Lancashire Tier 2 improvements** — AI writing quality: switch to single-article rewrites, better prompts, rewrite validation, humaniser pass. See HANDOVER-NEWSLANCASHIRE.md for full list.
- [x] **Commit accumulated work** — ✅ Done (9 Feb 2026). 3 clean commits: docs/CI/CD/git hygiene, data across 4 councils, frontend features (Web Worker, DogeInvestigation, tests). Pushed to main, CI/CD auto-deployed.
- [ ] **Update newsburnley.co.uk DNS** — CNAME set to newsburnley.pages.dev. Remove old A records pointing to aws-1 (51.20.51.127). Waiting for Cloudflare domain verification.
- [x] **Fix News Burnley deploy** — ✅ Done (9 Feb 2026). `news_burnley_sync.py` wrangler call disabled on vps-news (caused OOM). New `deploy_newsburnley.sh` on vps-main: rsync from vps-news → wrangler deploy. Cron 10:30am daily. 50 Burnley-filtered articles.
- [x] **Add swap to vps-news** — ✅ Done (9 Feb 2026). 2GB swap file (`/swapfile`) added and made permanent in fstab. Swappiness=60. Prevents future OOM crashes from rogue processes.
- [x] **Recover vps-news from OOM crash** — ✅ Done (9 Feb 2026). Force rebooted via Oracle Cloud Console. All crons intact (news pipeline, CH matching, police ETL, ECA leads). 958 articles in DB.

## Priority 4 — Procurement Section (NEW)

> **Goal:** Add a procurement intelligence section to AI DOGE, giving residents visibility into how councils award contracts, who wins them, and whether procurement follows best practice.

### Phase 1 — Research & Planning
- [ ] **Research procurement APIs:**
  - [Find a Tender Service](https://find-a-tender.service.gov.uk) — UK public procurement notices (replaced OJEU post-Brexit). Publishes contract notices, award notices, pipeline notices for above-threshold contracts.
  - [Contracts Finder](https://contractsfinder.service.gov.uk) — Mandatory for English public sector contracts >£10k (goods/services) or >£25k (sub-central). REST API available.
  - [BidStats.uk](https://bidstats.uk) — Aggregator/analytics layer over UK procurement data. May provide enriched/historical data.
  - Document API endpoints, auth requirements, rate limits, data formats (OCDS?), coverage for East Lancashire councils
- [ ] **Research relevant laws & processes:**
  - Procurement Act 2023 (replaced Public Contracts Regs 2015, in force from Oct 2024)
  - Transparency requirements: pipeline notices, contract details, KPI publication
  - Local Government Transparency Code 2015 (procurement-related requirements)
  - Freedom of Information Act 2000 (procurement-related requests)
  - Late Payment of Commercial Debts regulations
  - Social Value Act 2012 (procurement obligations)
- [ ] **Analyse data structures:**
  - Open Contracting Data Standard (OCDS) — international standard for procurement data
  - Contracts Finder schema (planning, tender, award stages)
  - Map available fields to useful transparency metrics (contract value, duration, extensions, single-bidder %, local supplier %, SME %, award method)
- [ ] **Design features & pages:**
  - Procurement Overview dashboard (total contracts, open tenders, recent awards)
  - Contract Explorer (searchable/filterable table of all contracts)
  - Supplier Win Rates (which companies win most often, single-bidder alerts)
  - Procurement Timeline (pipeline → tender → award → delivery)
  - Contract Value Analysis (distribution, outliers, comparison across councils)
  - Compliance Checks (DOGE-style: late publications, missing data, threshold avoidance)
  - Integration with existing Spending page (link payments to contracts)
- [ ] **Plan implementation architecture:**
  - New ETL script: `procurement_etl.py` (Contracts Finder + Find a Tender → procurement.json)
  - Data format: procurement.json per council + shared cross-council file
  - React pages: ProcurementOverview.jsx, ContractExplorer.jsx, SupplierWins.jsx
  - Config flags: add `procurement` to config.json `data_sources`

### Phase 2 — Build (after research complete)
- [ ] **Build procurement ETL** — Fetch from Contracts Finder + Find a Tender APIs, normalise to internal schema
- [ ] **Build procurement React pages** — Overview, Explorer, Supplier analysis
- [ ] **DOGE procurement analysis** — Threshold avoidance, single-bidder contracts, late publication, contract splitting
- [ ] **Cross-reference with spending data** — Link contract awards to actual payments in spending.json
- [ ] **Deploy and test** — Add to CI/CD, verify all 4 councils

## Priority 5 — Content & Features

- [ ] **Write Hyndburn articles** — 20 published, 8 from MASTERPLAN. article_pipeline.py will auto-generate 4 more data-driven topics.
- [ ] **Write Pendle articles** — 19 published, 8 from MASTERPLAN. article_pipeline.py will auto-generate 4 more data-driven topics.
- [ ] **Write more Rossendale articles** — 7 published (6 + 1 auto-generated), target 20+. article_pipeline.py has 3 more queued.
- [x] **Build Executive Pay Comparison page** (PayComparison.jsx) — ✅ Done
- [x] **Build Cross-Council Comparison dashboard** — ✅ Done (CrossCouncil.jsx)
- [x] **Build Supplier Deep Dive pages** (dynamic route `/supplier/:supplierId`) — ✅ Done (SupplierView.jsx)
- [x] **Council-specific FOI templates** for Hyndburn, Pendle, Rossendale — ✅ Done (9 Feb 2026). Burnley 11, Hyndburn 9, Pendle 9, Rossendale 12 = 41 total templates
- [x] **Postcode → ward lookup** — ✅ Already implemented in MyArea.jsx. Full postcodes.io integration, ward matching, councillor display.

## Completed

- [x] Fixed CI/CD deploy: gh-pages --user format broke all deploys (brackets in email). Fixed, all 4 councils deploying (9 Feb 2026)
- [x] Accessibility: aria-live="polite" + aria-busy on Spending, Budgets, Suppliers pages (9 Feb 2026)
- [x] SEO: JSON-LD structured data (schema.org/Dataset on Spending, schema.org/WebSite on Home) (9 Feb 2026)
- [x] Generated v3 year-chunked spending data for Hyndburn, Pendle, Rossendale locally (9 Feb 2026)
- [x] Built article_pipeline.py: data-driven topic discovery + LLM generation, deployed to vps-main cron 9am (9 Feb 2026)
- [x] Rebuilt newslancashire.co.uk deploy: Hugo site (962 pages), deploy via vps-main to Cloudflare Pages (9 Feb 2026)
- [x] Activated Cloudflare Web Analytics on all 4 councils (CF_ANALYTICS_TOKEN secret + beacon injection) (9 Feb 2026)
- [x] Fixed Clawdbot fetch errors: disabled broken Discord (4014) + Telegram (409) in openclaw.json, WhatsApp-only, running clean (9 Feb 2026)
- [x] Architecture improvements: useData() TTL cache, retry, LRU eviction (9 Feb 2026)
- [x] Per-route error boundaries in App.jsx (9 Feb 2026)
- [x] Predictive data preloading in Layout.jsx (9 Feb 2026)
- [x] Split ARCHITECTURE.md / INFRASTRUCTURE.md (9 Feb 2026)
- [x] Full server audit: corrected Oracle specs (1GB not 24GB), documented all vps-main services (9 Feb 2026)
- [x] Cleaned up vps-news orphaned openclaw-gateway service (9 Feb 2026)
- [x] Rewrote Clawdbot docs on vps-main (/opt/clawdbot/) (9 Feb 2026)
- [x] Deleted stale docs/agent/ from repo (9 Feb 2026)
- [x] Created CI/CD pipeline (.github/workflows/deploy.yml) (9 Feb 2026)
- [x] Added supplier_profiles.json to .gitignore (9 Feb 2026)
- [x] Cleaned up doc sprawl: deleted AIDOGE-OVERVIEW.md, HANDOVER.md, moved ECA doc (9 Feb 2026)
- [x] Built auto_pipeline.py and deployed to vps-main cron (9 Feb 2026)
- [x] Added External APIs section to INFRASTRUCTURE.md and Clawdbot TOOLS.md (9 Feb 2026)
- [x] Synced vps-main aidoge repo (was 18 commits behind, rebased) (9 Feb 2026)
- [x] Created Rossendale data dir on vps-news (9 Feb 2026)
- [x] Fixed News Lancashire DB: real DB is at ~/newslancashire/db/news.db (787 articles), removed stale 0-byte copies (9 Feb 2026)
- [x] Cleaned up vps-news legacy dirs: aidoge-astro, newslancashire-astro, dist-burnley-fix, github-burnleycouncil (~777MB freed) (9 Feb 2026)
- [x] Created sync_repos.sh on vps-main: daily git pull (5am), safe (skips if local changes), syncs scripts to vps-news via rsync (9 Feb 2026)
- [x] Created data_sync_to_git.sh on vps-main: copies generated data into git repo, optional auto-push (9 Feb 2026)
- [x] Initial script sync from vps-main to vps-news via rsync (15 scripts) (9 Feb 2026)
- [x] Moved newsburnley.co.uk to Cloudflare Pages: created project, deployed, added custom domains. DNS change needed at One.com (9 Feb 2026)
- [x] Set News Lancashire API keys: MOONSHOT_API_KEY + DEEPSEEK_API_KEY in ~/newslancashire/.env (9 Feb 2026)
- [x] Fixed pipeline_v4.sh: sources .env, removed broken Astro build, reordered phases, added News Burnley deploy (9 Feb 2026)
- [x] Updated news_burnley_sync.py: deploys to Cloudflare Pages instead of git push (9 Feb 2026)
- [x] News Lancashire full audit completed — 18 recommendations across 4 tiers (9 Feb 2026)
- [x] News Lancashire git repo initialised on vps-news (519 files, 2 commits) (9 Feb 2026)
- [x] R1: Fixed export gap — removed 7-day filter, increased limit 500→2000, now exports 655 articles (was 432) (9 Feb 2026)
- [x] R2: Removed `set -e` from pipeline_v4.sh, added per-phase error handling with error count + health summary (9 Feb 2026)
- [x] R3: Disabled broken planning scrapers (IDOX 500/404/SSL) and council minutes scraper (DNS failure) (9 Feb 2026)
- [x] R4: Added normalise_date_iso() to crawler_v3.py, migrated 645 of 787 existing DB records to ISO 8601 (9 Feb 2026)
- [x] R8: Removed political bias from ai_analyzer.py prompt — replaced with neutral editorial guidelines (9 Feb 2026)
- [x] Created HANDOVER-NEWSLANCASHIRE.md — full project guide for iPhone Claude Code sessions (9 Feb 2026)
- [x] Merged iPhone Claude branch (setup-handover-docs) — 10 commits, DOMPurify security, SPA routing, tests, audit system (9 Feb 2026)
- [x] Fixed React hooks-after-return crashes in Home.jsx, Budgets.jsx, PayComparison.jsx — useMemo placed after early returns violates Rules of Hooks (9 Feb 2026)
- [x] Fixed missing `<Guarded>` wrapper on Home route — lazy-loaded without Suspense = React #310 (9 Feb 2026)
- [x] Fixed Meetings.jsx crash — `how_to_attend` data undefined, added defensive guards (9 Feb 2026)
- [x] Rebuilt and deployed all 4 councils — all pages verified working on live site (9 Feb 2026)
- [x] Cleaned up 998MB stale Claude session cache (9 Feb 2026)
- [x] Added spending Web Worker — all data processing (filter, sort, aggregate, chart) off main thread (9 Feb 2026)
- [x] Built DogeInvestigation page with timeline, risk scoring, automated analysis (9 Feb 2026)
- [x] Added 168 unit tests across all pages + e2e smoke test (9 Feb 2026)
- [x] Committed all accumulated work: 3 clean commits (docs/CI/CD, data, frontend), pushed to main (9 Feb 2026)
- [x] Split spending.json for mobile: v3 year-chunked format, progressive loading, 75-78% initial download savings (9 Feb 2026)
- [x] Removed unused @tanstack/react-query dependency (9 Feb 2026)
- [x] ETL v2 format with pre-computed filterOptions (9 Feb 2026)
- [x] Fixed useData.test.js: 2 pre-existing test failures (fetch error timeout + cache race condition) (9 Feb 2026)
- [x] Fixed council_etl.py CH jurisdiction filter: removed redundant `or not country` clause (9 Feb 2026)
- [x] Added Cloudflare Web Analytics: CSP updated, vite.config.js injection, deploy.yml env var, Legal.jsx updated (9 Feb 2026)
- [x] Recovered vps-news from OOM crash: force rebooted via Oracle Cloud Console, all crons intact (9 Feb 2026)
- [x] Added 2GB swap to vps-news: `/swapfile`, permanent in fstab, swappiness=60 (9 Feb 2026)
- [x] Fixed News Burnley deploy: disabled wrangler in news_burnley_sync.py, created deploy_newsburnley.sh on vps-main, cron 10:30am (9 Feb 2026)
- [x] Updated all docs: INFRASTRUCTURE.md (swap, crons, article count), MEMORY.md (News Burnley, swap, Oracle Console) (9 Feb 2026)
- [x] Article pipeline auto-commit: git_commit_and_push() added to article_pipeline.py, tested (9 Feb 2026 night)
- [x] Fixed article images: remapped 6 broken refs, added onError handlers in News.jsx + ArticleView.jsx (9 Feb 2026 night)
- [x] Fixed deploy_newslancashire.sh: removed NVM dependency (Node.js is global on vps-main) (9 Feb 2026 night)
- [x] Fixed deploy_newsburnley.sh: removed hardcoded Cloudflare credentials (9 Feb 2026 night)
- [x] Fixed Kimi content filter: ai_rewriter.py now tries articles individually when batch is filtered (9 Feb 2026 night)
- [x] Fixed ai_analyzer.py model: changed kimi-latest to kimi-k2.5 (9 Feb 2026 night)
- [x] Fixed date normalisation on INSERT: normalise_date_iso() in crawler_v3.py insert_article(), 143 legacy dates fixed (9 Feb 2026 night)
- [x] Full end-to-end deploy test: News Lancashire (1426 files) + News Burnley (2 files) deployed to Cloudflare Pages successfully (9 Feb 2026 night)
- [x] Added procurement section to TODO.md: API research, law review, data structures, feature planning (9 Feb 2026 night)
