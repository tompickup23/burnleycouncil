# Multi-Agent Architecture - Tom Pickup's System

## Overview

```
                         ┌─────────────────┐
                         │      Tom         │
                         │  (Human Boss)    │
                         └────────┬────────┘
                                  │
                    ┌─────────────┤
                    │             │
              ┌─────▼─────┐ ┌────▼────────┐
              │  Claude    │ │  Octavian    │
              │  Code      │ │  (Clawdbot)  │
              │  (Gaius)   │ │  WhatsApp    │
              │            │ │  Telegram    │
              │ Mac CLI    │ │  Discord     │
              │ Heavy dev  │ │  Mac gateway │
              └─────┬──────┘ └──────┬──────┘
                    │               │
     ┌──────────────┼───────────────┤
     │              │               │
┌────▼──────┐ ┌────▼──────┐ ┌──────▼──────┐
│ GitHub    │ │ Thurinus   │ │ Octavianus  │
│ Pages     │ │ Oracle VPS │ │ AWS t3.micro│
│ FREE      │ │ FREE       │ │ FREE (trial)│
│           │ │            │ │             │
│ AI DOGE:  │ │ Pipeline:  │ │ Legacy:     │
│ Landing   │ │ Crawl      │ │ Keep until  │
│ Burnley   │ │ Generate   │ │ trial ends  │
│ Hyndburn  │ │ Build      │ │ Aug 2026    │
│           │ │ Push→GitHub│ │             │
└───────────┘ └────────────┘ └─────────────┘
```

**Total monthly cost: £0**

## Agents

### 1. Claude Code (Gaius) — Heavy Lifting
- **Where:** Mac terminal (Claude.app)
- **What:** Complex coding, multi-file edits, server management, architecture
- **Cost:** Anthropic subscription (Claude Max)
- **Best for:** Theme design, crawler rewrites, server config, debugging, multi-step tasks
- **NOT for:** Quick questions, reminders, chat

### 2. Octavian (OpenClaw/Clawdbot) — Daily Assistant
- **Where:** Mac background process, accessible via WhatsApp/Telegram/Discord
- **What:** Quick tasks, file management, AI digests, monitoring, reminders
- **Cost:** Kimi K2.5 free tier (primary), Anthropic credits (only if escalated)
- **Best for:** Quick answers, content generation, server checks, social posting
- **NOT for:** Complex multi-file coding, theme redesigns, architecture decisions
- **Future:** Move to Oracle ARM VM (24GB RAM, free forever) for 24/7 operation

## AI DOGE — Multi-Council Public Spending Audit

### Architecture

```
┌──────────────────┐     ┌──────────────────┐
│  Council CSVs    │     │  GOV.UK ODS      │
│  (Layer 1)       │     │  (Layer 2)       │
│                  │     │                  │
│ Burnley: £500+   │     │ MHCLG Revenue    │
│ Hyndburn: £250+  │     │ Outturn (CIPFA)  │
│ [Future councils]│     │ Band D CT data   │
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
         │  taxonomy.json   │
         │  (shared brain)  │
         │  Depts, Suppliers│
         │  Companies House │
         └────────┬─────────┘
                  │
         ┌────────▼─────────┐
         │  React SPA       │
         │  (config-driven) │
         │                  │
         │  config.json     │
         │  → CouncilContext│
         │  → Conditional   │
         │    routing/nav   │
         └────────┬─────────┘
                  │
    build_council.sh <id> <base>
                  │
         ┌────────▼─────────┐
         │  GitHub Pages    │
         │  (gh-pages)      │
         │                  │
         │ /burnleycouncil/ │
         │ /hyndburn/       │
         │ / (landing page) │
         └──────────────────┘
```

### Two Data Layers

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

### Key Scripts

| Script | Purpose | Run By |
|--------|---------|--------|
| `scripts/council_etl.py` | CSV → spending.json (any council) | Claude Code / Clawdbot |
| `scripts/govuk_budgets.py` | GOV.UK ODS → budget JSON | Claude Code |
| `scripts/build_council.sh` | Build SPA for specific council | Either |

### Adding a New Council (PDCA Loop)

1. **Plan:** Download CSVs, examine schema, identify columns
2. **Do:** Write adapter (~50 lines in council_etl.py), run ETL
3. **Check:** Spot-check 20 records, flag unmapped terms
4. **Act:** Update taxonomy.json, re-run. System gets smarter.
5. **Deploy:** `build_council.sh <id> /<path>/`, push to gh-pages

### Companies House Integration

- Code in `council_etl.py` (`--companies-house` flag)
- 100% confidence matching only (exact name, active, unambiguous)
- Needs API key: register at developer.company-information.service.gov.uk
- Rate limit: 600 req/5min (free)
- Clawdbot can run batch matching on Thurinus once key is provided

### Live Councils

| Council | URL | Records | Spend | Threshold | Features |
|---------|-----|---------|-------|-----------|----------|
| Burnley | /burnleycouncil/ | 30,580 | £355M | £500+ | Full (spending, budgets, politics, meetings, news, FOI, DOGE) |
| Hyndburn | /hyndburn/ | 29,802 | £211M | £250+ | Spending + FOI |

### Repo & Deployment

- **Repo:** tompickup23/burnleycouncil
- **Branch:** gh-pages (deployed content)
- **Domain:** aidoge.co.uk (GitHub Pages, custom domain)
- **SPA routing:** Root 404.html redirects with ?p= parameter

## News Lancashire

### Pipeline

```
[RSS Feeds] ─┐
[Bluesky]   ─┤
[Google News]─┼→ [pipeline_v3.sh] → [SQLite DB] → [export_json.py] → [Astro Build]
[Parliament] ─┤     (Thurinus)        (news.db)                        → Cloudflare Pages
[Police API] ─┘                                                        (newslancashire.co.uk)
```

### Infrastructure

| Site | Hosting | Domain | Repo |
|------|---------|--------|------|
| News Lancashire | Cloudflare Pages | newslancashire.co.uk | tompickup23/newslancashire |
| News Burnley | Octavianus (AWS) | newsburnley.co.uk | tompickup23/newsburnley |
| AI DOGE | GitHub Pages | aidoge.co.uk | tompickup23/burnleycouncil |

### Servers

| Server | IP | Cost | SSH |
|--------|-----|------|-----|
| Thurinus (Oracle) | 141.147.79.228 | £0 forever | `ssh -i ~/Downloads/ssh-key-2026-02-05.key ubuntu@141.147.79.228` |
| Octavianus (AWS) | 51.20.51.127 | £0 until Aug 2026 | `ssh -i ~/Downloads/clawdbotkeypair.pem ubuntu@51.20.51.127` |

## Credit Efficiency Rules

### Model Hierarchy (cheapest first)
1. **Kimi K2.5** (free) — Default for all Octavian tasks
2. **DeepSeek V3** (free/cheap) — Fallback if Kimi is down
3. **Haiku** (~$0.25/M input) — Only if free models can't handle it
4. **Sonnet** (~$3/M input) — Only when explicitly requested
5. **Opus** (~$15/M input) — Never use automatically, only when Tom asks

### What Goes Where
| Task | Agent | Why |
|------|-------|-----|
| Quick question | Octavian (WhatsApp) | Free via Kimi |
| Write an article | Octavian | Kimi handles this fine |
| Generate AI digest | Octavian | Batch via SSH to Thurinus |
| Fix a bug in code | Claude Code | Multi-file editing |
| Redesign a theme | Claude Code | Complex CSS/HTML |
| Server maintenance | Claude Code | SSH + multi-step |
| Social media post | Octavian | Quick, templated |
| Architecture decisions | Claude Code | Needs deep reasoning |
| Run ETL pipeline | Clawdbot | SSH to Thurinus, zero credits |
| Companies House batch | Clawdbot | Cron job on Thurinus |
| Monitor pipeline | Clawdbot | 24/7 via WhatsApp alerts |

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

### newsburnley.co.uk (One.com → AWS)
- A records → Octavianus IP
- Plan: Migrate to Cloudflare Pages before Aug 2026
