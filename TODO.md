# AI DOGE — Task List

> Central task tracker. Updated by Claude Code sessions.
> Last updated: 9 February 2026 (evening session)

## Priority 1 — Broken / Blocking

- [x] **Fix Clawdbot fetch errors** — ✅ Done (9 Feb 2026). Root cause: Discord (Gateway 4014 — Privileged Intents not enabled) and Telegram (409 conflict) were enabled but broken, causing continuous reconnection loops → `fetch failed` every 10-40s. Fix: disabled Discord and Telegram in `/root/.openclaw/openclaw.json`, restarted service. WhatsApp-only now, running clean.
- [x] **Register Companies House API key** — ✅ Done. Key `07316ecc-...` set in `/home/ubuntu/aidoge/.env` on vps-news. Ready for `council_etl.py --companies-house`.
- [x] **Set up DEPLOY_TOKEN for CI/CD** — ✅ Done (9 Feb 2026). deploy.yml fully fixed: tests before build, hub pages + CNAME + robots.txt in deploy, post-deploy verification. User creates PAT and adds as `DEPLOY_TOKEN` secret. Every push to main auto-deploys.
- [ ] **Rebuild airdustodour.co.uk** — ⏰ DEADLINE 29 Mar 2026 (Bluehost expires). Plan ready at `.claude/plans/wild-zooming-rose.md`. Static HTML/CSS → Cloudflare Pages (free). Replaces WordPress. Need to: build site, set up Formspree contact form, create GitHub repo, deploy, point DNS.

## Priority 2 — High Impact

- [ ] **Set up monitoring/alerting** — No alerting exists. aws-2 died unnoticed. Free UptimeRobot (50 monitors) pinging 4 council sites + 2 servers would alert within 5 minutes.
- [x] **Split spending.json for mobile** — ✅ Done (9 Feb 2026). ETL generates v3 year-chunked files: spending-index.json + spending-YYYY-YY.json per year. Worker tries chunked first, falls back to monolith. Latest year auto-loaded (~4-8MB vs 21-40MB). Progressive loading for older years.
- [ ] **VPS backup strategy** — vps-main runs everything (Clawdbot, email, CRM, clawd-worker) with no backup. A `docker compose` export + rsync to Oracle (vps-news) would protect against Hostinger outage.
- [x] **Add analytics to council sites** — ✅ Done (9 Feb 2026). Cloudflare Web Analytics (free, cookieless). Code wired via VITE_CF_ANALYTICS_TOKEN env var in vite.config.js + deploy.yml. Inactive until CF_ANALYTICS_TOKEN secret is added to GitHub repo. User needs to: create Cloudflare account → add site → copy beacon token → add as repo secret.

## Priority 3 — Improvements

- [ ] **Cancel both AWS instances** — Both trials end July 2026. aws-2 is already dead. aws-1 no longer needed (newsburnley moved to Cloudflare Pages).
- [ ] **Rotate exposed API keys** — OpenAI, Kimi, DeepSeek, Companies House keys were in .claude/settings.local.json (now removed). Need rotating on provider dashboards.
- [x] **Fix council_etl.py `or True` bug** — ✅ Done (9 Feb 2026). Removed redundant jurisdiction filter — CH API only returns UK companies. Previous filter had overly broad `or not country` clause.
- [x] **Fix police_etl.py import bug** — ✅ Already fixed. urllib.parse is correctly imported at line 30 (top of file). The bug was resolved in a prior session.
- [ ] **Autonomous article pipeline** — ✅ Built (auto_pipeline.py on vps-main, cron 8am daily). Needs testing with real data change.
- [ ] **Rebuild newslancashire.co.uk deploy** — Astro build dir was deleted (broken). Pipeline now exports 655 articles but can't deploy to Cloudflare Pages. Need to either rebuild Astro site or create a simple static HTML generator.
- [ ] **Push newslancashire repo to GitHub** — Git repo initialised on vps-news (2 commits). Need to create `tompickup23/newslancashire` private repo on GitHub, add SSH deploy key, push. One-time 5-minute task.
- [ ] **News Lancashire Tier 2 improvements** — AI writing quality: switch to single-article rewrites, better prompts, rewrite validation, humaniser pass. See HANDOVER-NEWSLANCASHIRE.md for full list.
- [x] **Commit accumulated work** — ✅ Done (9 Feb 2026). 3 clean commits: docs/CI/CD/git hygiene, data across 4 councils, frontend features (Web Worker, DogeInvestigation, tests). Pushed to main, CI/CD auto-deployed.
- [ ] **Update newsburnley.co.uk DNS** — CNAME set to newsburnley.pages.dev. Remove old A records pointing to aws-1 (51.20.51.127). Waiting for Cloudflare domain verification.

## Priority 4 — Content & Features

- [ ] **Write Hyndburn articles** (8 planned in MASTERPLAN)
- [ ] **Write Pendle articles** (8 planned in MASTERPLAN)
- [ ] **Write more Rossendale articles** (6 published, target 20+)
- [x] **Build Executive Pay Comparison page** (PayComparison.jsx) — ✅ Done
- [x] **Build Cross-Council Comparison dashboard** — ✅ Done (CrossCouncil.jsx)
- [x] **Build Supplier Deep Dive pages** (dynamic route `/supplier/:supplierId`) — ✅ Done (SupplierView.jsx)
- [x] **Council-specific FOI templates** for Hyndburn, Pendle, Rossendale — ✅ Done (9 Feb 2026). Burnley 11, Hyndburn 9, Pendle 9, Rossendale 12 = 41 total templates
- [ ] **Postcode → ward lookup** (postcodes.io, free)

## Completed

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
