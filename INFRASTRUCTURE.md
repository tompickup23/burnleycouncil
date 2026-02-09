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

**Resources:** 1GB RAM (497MB available), 47GB disk (17GB used, 38%)

**Running services:**
- News Lancashire pipeline (cron, every 30 min)
- AI DOGE Companies House matching (cron, 1st of month)
- AI DOGE Police ETL (cron, 5th of month)
- ECA Leads pipeline (cron — daily enrichment, weekly update checks, monthly full pipeline)
- Daily backup at 2am
- fail2ban

**Crons:**
```
*/30 * * * *  News Lancashire pipeline_v4.sh
0 2 * * *     Daily backup
0 3 1 * *     AI DOGE CH matching
0 4 5 * *     AI DOGE Police ETL
0 1 3 * *     ECA Leads monthly full pipeline
0 4 * * *     ECA Leads daily CH enrichment
0 6 * * 1     ECA Leads weekly CCOD check
```

**News Lancashire Pipeline (v4.1, audited 9 Feb 2026):**
- 787 articles in SQLite DB, 655 exported (after R1 fix)
- 9 pipeline phases, every 30 min via cron
- AI: Kimi K2.5 → DeepSeek fallback (keys in `~/.env`)
- Git repo initialised: `~/newslancashire/` (needs push to GitHub)
- Planning/council minutes scrapers disabled (broken endpoints)
- Per-phase error handling (no more cascade failures)
- All dates normalised to ISO 8601

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
0 6 * * *     Article writer (mega_article_writer.py)
0 7 * * *     Data monitor (check councils for new CSVs)
0 8 * * *     Auto pipeline (ETL + analysis + articles if new data detected)
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
1. **Kimi K2.5** (free) — Default for all Octavian tasks
2. **DeepSeek V3** (free/cheap) — Fallback if Kimi is down
3. **qwen2.5:7b** (free, local) — Running via Ollama on vps-main
4. **Haiku** (~$0.25/M input) — Only if free models can't handle it
5. **Sonnet** (~$3/M input) — Only when explicitly requested
6. **Opus** (~$15/M input) — Never use automatically, only when Tom asks

### Task Routing

| Task | Agent | Why |
|------|-------|-----|
| Complex coding, architecture | Claude Code | Multi-file editing, deep reasoning |
| Quick questions, chat | Octavian (WhatsApp) | Free via Kimi |
| Content generation, articles | Octavian | Kimi handles this fine |
| ETL pipeline runs | clawd-worker / Clawdbot | SSH to vps-news, zero credits |
| Companies House batch | Cron on vps-news | Monthly, automated |
| Server maintenance | Claude Code | SSH + multi-step |

## GitHub Actions (Zero Cost)

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| `deploy.yml` | On push to main | Build all 4 councils → deploy to GitHub Pages (auto) |
| `daily-audit.yml` | 06:00 UTC daily | Health check, JSON validation, live site verification, JSX bug scan |
| `update-meetings.yml` | 03:00 UTC Sundays | Scrape ModernGov/Jadu for council meeting data |

**Deployment chain:** `git push main` → tests → build Burnley → build Hyndburn → build Pendle → build Rossendale → copy hub pages + CNAME → deploy to `tompickup23/lancashire` gh-pages → verify all URLs return 200.

**Cost:** Free (GitHub Actions free tier for public repos, or 2000 min/month for private). Each deploy uses ~10 min.

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
| Police Data | `data.police.uk/api/` | None | Free | police_etl.py |
| GOV.UK MHCLG | `assets.publishing.service.gov.uk` | None | Free (ODS downloads) | govuk_budgets.py |
| Postcodes.io | `postcodes.io/postcodes/` | None | Free | Not yet implemented |
| Kimi (Moonshot) | `api.moonshot.cn` | Bearer token | Free tier | Clawdbot (octavian.json) |
| DeepSeek | `api.deepseek.com` | Bearer token | Free/cheap | Clawdbot fallback |

**Register for CH API key:** https://developer.company-information.service.gov.uk/manage-applications
**CH API docs:** https://developer-specs.company-information.service.gov.uk/

## Known Issues

1. **aws-2 unreachable** — SSH times out. Check AWS Console for instance state.
2. ~~**openclaw on vps-main**~~ — ✅ Fixed 9 Feb 2026. Disabled broken Discord (Gateway 4014) and Telegram (409 conflict) channels. WhatsApp-only now, running clean.
3. **API key rotation needed** — Exposed keys (OpenAI, Kimi, DeepSeek, Companies House) were removed from .claude/settings.local.json but need rotating on provider dashboards.
4. **vps-news is memory-constrained** — Only 1GB RAM, currently at 50% usage. Cannot take on additional workloads.
