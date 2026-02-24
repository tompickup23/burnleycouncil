# Infrastructure & Operations

## Servers

| Host | Server | Specs | IP | Cost | SSH | Status |
|------|--------|-------|-----|------|-----|--------|
| vps-news | Oracle Free Tier | 2 vCPU (EPYC 7742), 1GB RAM, 47GB disk | 141.147.79.228 | Free forever | `ssh vps-news` | Healthy |
| vps-main | Hostinger VPS | 4 vCPU (EPYC 9354P), 16GB RAM, 200GB disk | 76.13.254.176 | £22/mo | `ssh vps-main` | Healthy |
| aws-1 | AWS t3.micro (Stockholm) | 2 vCPU, 1GB RAM | 51.20.51.127 | Free until Jul 2026 | `ssh aws-1` | Healthy |
| aws-2 | AWS t3.micro | 2 vCPU, 1GB RAM | 56.228.32.194 | Free until Jul 2026 | `ssh aws-2` | UNREACHABLE |
| Bluehost | Shared hosting | — | — | Paid (shared) | Bluehost cPanel | Healthy |

**Monthly cost: £22/mo** (Hostinger VPS) + Bluehost shared hosting. Both AWS instances will be cancelled before trials end Jul 2026.

### Bluehost — Shared Hosting ⏰ EXPIRES 29 MARCH 2026

**Purpose:** Legacy/business websites (6 domains)

**Domains hosted:**
| Domain | Purpose | Migration Plan |
|--------|---------|----------------|
| tompickup.com | Personal site | TBD |
| airdustodour.com | Air quality consultancy (WordPress) | Rebuild as static HTML → Cloudflare Pages (plan ready) |
| imperiumsinefine.co.uk | Business site | TBD |
| poplarstuition.co.uk | Business site | TBD |
| innovation-support.co.uk | Business site | TBD |
| thebungalowburnley.co.uk | Business site | TBD |

**Management:** Bluehost cPanel. No SSH access needed — standard shared hosting.

**Migration deadline:** All 6 sites need to be migrated or domains parked before 29 March 2026. airdustodour.co.uk rebuild is planned (static HTML/CSS → Cloudflare Pages). Other sites need review.

### vps-news (Thurinus) — Oracle Free Tier

**Purpose:** News pipeline, AI DOGE ETL, ECA Leads data processing

**Resources:** 1GB RAM (497MB available) + 2GB swap, 47GB disk (19GB used, 42%)

**Running services:**
- News Lancashire pipeline (cron, every 30 min)
- AI DOGE Companies House matching (cron, 1st of month)
- AI DOGE Police ETL (cron, 5th of month)
- ECA Leads pipeline (cron — daily enrichment, weekly update checks, monthly full pipeline)
- Daily backup at 2am
- fail2ban

**Crons:**
```
# PAUSED 10 Feb 2026 — saving LLM credits until upgrades done
# */30 * * * *  News Lancashire pipeline_v4.sh
0 2 * * *     Daily backup
0 3 1 * *     AI DOGE CH matching
0 4 5 * *     AI DOGE Police ETL
0 1 3 * *     ECA Leads monthly full pipeline
0 4 * * *     ECA Leads daily CH enrichment
0 6 * * 1     ECA Leads weekly CCOD check
0 3 * * *     ECA Enrichment (100 companies/run)
```

**News Lancashire Pipeline (v4.1, audited 9 Feb 2026, fixes applied 9 Feb night):**
- 963 articles in SQLite DB (802 exported), updates every 30 min
- Hugo site (NOT Astro) — builds 1200 HTML pages in ~15s
- 9 pipeline phases, every 30 min via cron
- AI LLM chain (10 Feb): **Gemini 2.5 Flash** (primary, free) → Groq (blocked from VPS) → Kimi K2.5 → DeepSeek (dead)
- Rate limiter: `scripts/llm_rate_limiter.py` tracks daily req + token usage per provider in `logs/llm_usage.json`
- Free tier budget: ~80 calls/day × 2100 tokens ≈ 168K tokens/day (Gemini allows 250K)
- **Kimi content filter handling** — 400 errors from sensitive articles now handled gracefully (tries individually, skips filtered)
- **Date normalisation on INSERT** — All dates normalised to ISO 8601 on insert (143 legacy dates fixed)
- Git repo initialised: `~/newslancashire/` (3 commits, no remote — needs push to GitHub)
- Planning/council minutes scrapers disabled (broken endpoints)
- Per-phase error handling (no more cascade failures)
- **Deploy:** `deploy_newslancashire.sh` runs from vps-main (10am cron) — SSH builds Hugo on vps-news, rsyncs output to vps-main, wrangler deploys to Cloudflare Pages from vps-main (avoids OOM on 1GB vps-news)
- **Deploy tested and working** (9 Feb 2026 night) — 1426 files deployed successfully

**Resolved (9 Feb 2026):**
- ~~`openclaw-gateway.service` — OOM-crashed, orphaned~~ → Cleaned up with `systemctl reset-failed`
- ~~`~/clawdbot/` — empty leftover directory~~ → Deleted

### vps-main (Hostinger) — £22/mo

**Purpose:** Clawdbot (OpenClaw), clawd-worker, OpenAgents network, Ollama, email, ECA CRM

**Resources:** 16GB RAM (2.7GB used, 13GB available), 200GB disk (19GB used, 10%)

**Running services:**

| Service | Type | RAM | Notes |
|---------|------|-----|-------|
| `openclaw.service` | systemd | 364MB | Clawdbot gateway. WhatsApp only (Discord/Telegram disabled 9 Feb). Healthy. |
| `clawd-worker.service` | systemd | 5.4MB | AI DOGE data worker. Healthy, heartbeating. |
| OpenAgents network | Process | 78MB | `/opt/openagents` — network coordinator |
| OpenAgents gaius agent | Process | 86MB | `agents/gaius.yaml` |
| OpenAgents octavian agent | Process | 86MB | `agents/octavian.yaml` |
| OpenAgents octavian-vps | Process | 86MB | `/opt/clawdbot/octavian.yaml` — Kimi K2.5 model |
| `ollama.service` | systemd | 80MB idle | Serving qwen2.5:7b (4.7GB on disk) |
| `caddy.service` | systemd | — | Reverse proxy |
| `tailscaled.service` | systemd | — | Tailscale VPN |
| Docker: Mailu stack | 8 containers | 542MB total | Email (webmail, dovecot, rspamd, postfix, admin, nginx, redis, unbound) |
| PM2: `eca-crm` | PM2 | 69MB | Next.js app (v16.1.6) |

**Crons:**
```
0 5 * * *     Repo sync (sync_repos.sh — git pull + rsync scripts to vps-news)
# 0 6 * * *  DISABLED — mega_article_writer.py (28/28 queue exhausted, replaced by article_pipeline.py)
0 7 * * *     Data monitor (check councils for new CSVs)
0 8 * * *     Auto pipeline (ETL + analysis + articles if new data detected)
0 9 * * *     Article pipeline (article_pipeline.py --max-articles 3)
              # Re-enabled 24 Feb 2026 — fully automated, free tier safe
              # Lockfile prevents conflicts with auto_pipeline (8am)
              # Daily budget: 50K tokens (~12 articles, well within Mistral free 33M/day)
              # 20+ topic templates with quarterly keys — no exhaustion
# 0 10 * * *    News Lancashire deploy (deploy_newslancashire.sh)
# 30 10 * * *   News Burnley deploy (deploy_newsburnley.sh)
0 4 1 * *     Councillor scraper
0 */6 * * *   vps-news health check + health_check.sh
0 0 * * 0     Log_rotation (truncates openclaw, clawd-worker, openagents, ollama logs)
```

**Auto pipeline flow** (daily at 8am, after data_monitor at 7am):
1. Check data_monitor state for detected changes
2. SSH to vps-news → run council_etl.py for changed councils
3. Pull updated data back to vps-main
4. Run doge_analysis.py (cross-council)
5. Queue article generation for new findings
6. WhatsApp notification with results

### aws-1 (Octavianus) — AWS Free Trial

**Purpose:** ~~News Burnley static site~~ → Migrated to Cloudflare Pages (9 Feb 2026)

**Running:** Certbot + SSH + nginx. No longer needed.

**Plan:** Cancel ASAP. newsburnley.co.uk now served by Cloudflare Pages.

### aws-2 — AWS Free Trial

**Purpose:** Unknown / idle

**Status:** UNREACHABLE as of 9 Feb 2026. SSH times out. Check AWS Console.

**Plan:** Will be cancelled before trial ends Jul 2026.

## AI Tools & Agents

| Tool | Type | Cost | Status |
|------|------|------|--------|
| Claude Code (Gaius) | CLI dev agent | Anthropic Max subscription | Active — Mac terminal |
| Codex (OpenAI) | CLI dev agent | Trial expires 2 Mar 2026 | Active |
| OpenCode | CLI dev agent | Free tier | Active |
| Octavian (Clawdbot/OpenClaw) | WhatsApp bot | Kimi K2.5 free tier | Running on vps-main, healthy (WhatsApp only) |
| OpenAgents | Agent orchestration | Free (self-hosted) | 3 agents on vps-main |
| Ollama | Local LLM inference | Free (self-hosted) | qwen2.5:7b on vps-main |
| clawd-worker | Data processing slave | Free (Python) | Running on vps-main, healthy |

### Model Hierarchy (cheapest first)
1. **Mistral Small** (free Experiment tier) — Primary for AI DOGE article pipeline. EU/GDPR-safe. ~1B tokens/month
2. **Gemini 2.5 Flash** (free) — Primary for News Lancashire pipeline (rewriter, analyzer, digest)
3. **Groq Llama 3.3 70B** (free, 500K tokens/day) — AI DOGE article fallback. Blocked from VPS IPs (works locally only)
4. **Cerebras Llama 3.3 70B** (free, 1M tokens/day) — AI DOGE article fallback
5. **Kimi K2.5** (trial credits) — Default for Octavian tasks, fallback for News Lancashire
6. **DeepSeek V3** (credits exhausted) — HTTP 402, needs top-up
7. **qwen2.5:7b** (free, local) — Running via Ollama on vps-main
8. **Haiku** (~$0.25/M input) — Only if free models can't handle it
9. **Sonnet** (~$3/M input) — Only when explicitly requested
10. **Opus** (~$15/M input) — Never use automatically, only when Tom asks

### News Lancashire LLM Fallback Chain (10 Feb 2026)
```
Gemini 2.5 Flash → Groq Llama 3.3 70B → Kimi K2.5 → DeepSeek V3
   (primary)         (blocked from VPS)    (trial $)    (dead, 402)
```
- Rate limiter: `llm_rate_limiter.py` — daily request + token tracking, 90% safety margins
- Usage file: `logs/llm_usage.json` (auto-resets daily)
- Gemini free tier: 500 req/day, 250K tokens/day (pipeline uses ~80 req, ~170K tokens)
- Groq free tier: 1000 req/day, 100K tokens/day — but Cloudflare blocks VPS IPs (error 1010)
- Keys in `/home/ubuntu/newslancashire/.env`: GEMINI_API_KEY, GROQ_API_KEY, MOONSHOT_API_KEY, DEEPSEEK_API_KEY

### Task Routing

| Task | Agent | Why |
|------|-------|-----|
| Complex coding, architecture | Claude Code | Multi-file editing, deep reasoning |
| Quick questions, chat | Octavian (WhatsApp) | Free via Kimi |
| Content generation, articles | Octavian | Kimi handles this fine |
| News Lancashire AI (rewrite, analysis, digest) | Cron on vps-news | Gemini 2.5 Flash (free), auto every 30 min |
| ETL pipeline runs | clawd-worker / Clawdbot | SSH to vps-news, zero credits |
| Companies House batch | Cron on vps-news | Monthly, automated |
| Server maintenance | Claude Code | SSH + multi-step |

## GitHub Actions (Zero Cost)

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| `deploy.yml` | On push to main | Build all 15 councils → deploy to GitHub Pages (auto) |
| `daily-audit.yml` | 06:00 UTC daily | Health check, JSON validation, live site verification, JSX bug scan |
| `update-meetings.yml` | 03:00 UTC Sundays | Scrape ModernGov/Jadu for council meeting data |

**Deployment chain:** `git push main` → 446 unit tests → restore v4 chunks → build all 15 councils sequentially → clean v4 artefacts → copy hub pages + CNAME → deploy to `tompickup23/lancashire` gh-pages → verify all 15 URLs return 200.

**Cost:** Free (GitHub Actions free tier for public repos, or 2000 min/month for private). Each deploy uses ~22 min.

**Auth:** `DEPLOY_TOKEN` secret (fine-grained PAT scoped to lancashire repo, Contents: Read+Write).

## Communication Channels

| Channel | Platform | Use Case |
|---------|----------|----------|
| WhatsApp | +447308907628 | Quick tasks, on-the-go |
| Telegram | @octavian_gaius_julius_caesar_bot | Alternative mobile |
| Discord | Octavian bot | Community/testing |
| Claude Code | Mac terminal | Heavy development |

## DNS Configuration

### aidoge.co.uk (GitHub Pages)
- A records → GitHub Pages IPs (185.199.108-111.153)
- CNAME www → tompickup23.github.io

### newslancashire.co.uk (Cloudflare Pages)
- Managed by Cloudflare

### newsburnley.co.uk (One.com → Cloudflare Pages)
- CNAME → newsburnley.pages.dev (migrated 9 Feb 2026)
- Old A records to aws-1 should be removed

### Bluehost Domains
- tompickup.com
- airdustodour.com
- imperiumsinefine.co.uk
- poplarstuition.co.uk
- innovation-support.co.uk
- thebungalowburnley.co.uk

## External APIs & Data Sources

| API | URL | Auth | Cost | Used By |
|-----|-----|------|------|---------|
| Companies House | `api.company-information.service.gov.uk` | HTTP Basic (key as username) | Free (600 req/5min) | council_etl.py `--companies-house` |
| Contracts Finder | `www.contractsfinder.service.gov.uk/Published/` | None | Free | procurement_etl.py |
| Charity Commission | `api.charitycommission.gov.uk/register/api` | None | Free (~1000 req/day) | charity_etl.py |
| Police Data | `data.police.uk/api/` | None | Free | police_etl.py |
| GOV.UK MHCLG | `assets.publishing.service.gov.uk` | None | Free (ODS downloads) | govuk_budgets.py |
| Postcodes.io | `postcodes.io/postcodes/` | None | Free | MyArea.jsx (ward lookup, councillor matching) |
| Gemini (Google) | `generativelanguage.googleapis.com/v1beta/openai/` | Bearer token | Free (500 req/day, 250K tokens/day) | News Lancashire pipeline (primary) |
| Groq | `api.groq.com/openai/v1/` | Bearer token | Free (1000 req/day) — **blocked from VPS IPs** | Fallback (unusable from Oracle/Hostinger) |
| Kimi (Moonshot) | `api.moonshot.ai` | Bearer token | Trial credits | Clawdbot + News Lancashire fallback |
| DeepSeek | `api.deepseek.com` | Bearer token | Credits exhausted (402) | Dead — needs top-up |

**Register for CH API key:** https://developer.company-information.service.gov.uk/manage-applications
**CH API docs:** https://developer-specs.company-information.service.gov.uk/

## Cloudflare Web Analytics

- **Beacon token:** Set as `CF_ANALYTICS_TOKEN` GitHub Actions secret
- **Injection:** `vite.config.js` injects beacon script at build time when `VITE_CF_ANALYTICS_TOKEN` env var is set
- **CSP:** `index.html` Content-Security-Policy updated to allow `static.cloudflareinsights.com`
- **Coverage:** All 4 council sites (injected during CI/CD build)
- **Cost:** Free, cookieless, no GDPR consent needed
- **Status:** ✅ Active (secret set 9 Feb 2026, beacon confirmed in production builds)

## Known Issues

1. **aws-2 unreachable** — SSH times out. Check AWS Console for instance state.
2. ~~**openclaw on vps-main**~~ — ✅ Fixed 9 Feb 2026. Disabled broken Discord (Gateway 4014) and Telegram (409 conflict) channels. WhatsApp-only now, running clean.
3. **API key rotation needed** — Exposed keys (OpenAI, Kimi, DeepSeek, Companies House) were removed from .claude/settings.local.json but need rotating on provider dashboards.
4. **vps-news is memory-constrained** — Only 1GB RAM, currently at 50% usage. Cannot take on additional workloads. **Do NOT run Node.js/wrangler on vps-news** — causes OOM. Wrangler deploys must run from vps-main (16GB).
5. **vps-news OOM vulnerability** — Running `npx wrangler pages deploy` directly on vps-news caused OOM crash (9 Feb 2026), making server unresponsive. Fix: `deploy_newslancashire.sh` and `deploy_newsburnley.sh` now run wrangler from vps-main instead. `news_burnley_sync.py` wrangler call disabled. 2GB swap added to prevent future OOM. Recovery: reboot via Oracle Cloud web console.
6. ~~**DeepSeek API credits exhausted**~~ — Returns HTTP 402. Mitigated: Gemini 2.5 Flash is now primary (free), Kimi K2.5 is fallback. DeepSeek is last resort (dead until topped up).
7. **Kimi content filter** — Kimi K2.5 rejects batches containing sensitive content (HTTP 400 "content_filter"). Fixed in ai_rewriter.py, ai_analyzer.py, ai_digest_generator.py to try articles individually and skip filtered ones.
8. ~~**newslancashire repo has no GitHub remote**~~ — ✅ Fixed (10 Feb 2026). 4 commits pushed to `tompickup23/newslancashire`. Deploy key added, remote set, branch `master`.
9. **Groq blocked from VPS IPs** — Groq uses Cloudflare bot detection (error 1010) that blocks Oracle Cloud and Hostinger server IPs. Only works from residential IPs. Cannot be used as server-side fallback.
