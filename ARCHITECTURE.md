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
│ 3 sites:  │ │ Pipeline:  │ │ Legacy:     │
│ Lancashire│ │ Crawl      │ │ Keep until  │
│ Burnley   │ │ Generate   │ │ trial ends  │
│ Council   │ │ Build      │ │ Aug 2026    │
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

## Infrastructure

### GitHub Pages — All Websites (FREE)
All three websites are served via GitHub Pages CDN:

| Site | Repo | Domain |
|------|------|--------|
| News Lancashire | tompickup23/newslancashire | newslancashire.co.uk |
| News Burnley | tompickup23/newsburnley | newsburnley.co.uk |
| Burnley Council | tompickup23/burnleycouncil | burnleycouncil.co.uk |

Benefits: Global CDN, DDoS protection, free SSL, 99.99% uptime.

### Thurinus (Oracle VPS — 141.147.79.228) — BUILD SERVER
- **Role:** Pipeline server (crawl, generate, build, push to GitHub)
- **Stack:** Python + Hugo + Git + SQLite
- **Resources:** 1GB RAM, 2 vCPU, 45GB disk, 10TB bandwidth
- **Automation:** Hourly pipeline (crawl → generate → Hugo build → git push)
- **Cost:** £0/month (Oracle Always Free, permanent)
- **SSH:** `ssh -i ~/Downloads/ssh-key-2026-02-05.key ubuntu@141.147.79.228`

### Octavianus (AWS t3.micro — 51.20.51.127) — LEGACY
- **Role:** Previously hosted News Burnley, now redundant
- **Status:** Keep running until free trial expires (~August 2026)
- **Cost:** £0 during trial, then terminate
- **SSH:** `ssh -i ~/Downloads/clawdbotkeypair.pem ubuntu@51.20.51.127`

### AWS Account 2 (tompickup23@icloud.com, eu-north-1) — RESERVED
- **Status:** No instances running. Fresh 6-month free trial.
- **Use when needed:** Future projects requiring compute

## Content Pipeline

### Automatic (hourly, zero cost)
```
RSS Feeds → Crawler (Python) → SQLite → Hugo Content Gen → Hugo Build
  → git push → GitHub Pages (News Lancashire)
  → JSON export → git push → GitHub Pages (News Burnley)
```

Pipeline script: `/home/ubuntu/newslancashire/scripts/pipeline.sh`
Cron: `0 * * * *` (every hour)

### Deploy Keys (Thurinus → GitHub)
- News Lancashire: `~/.ssh/id_ed25519` → `github-lancashire` SSH host
- News Burnley: `~/.ssh/id_newsburnley` → `github-burnley` SSH host
- Config: `~/.ssh/config` maps hosts to keys

### AI Digest (Octavian, free via Kimi)
```
Tom: "Write a digest of today's Burnley news" (WhatsApp)
  → Octavian reads DB via SSH to Thurinus
  → Generates summary with Kimi (free)
  → Saves .md to Thurinus /digest/
  → Next pipeline run builds and deploys
```

### Original Reporting (Claude Code)
```
Tom: "Write an article about X" (Claude Code)
  → Claude Code researches, writes, optimises for SEO
  → Saves to /original/ on Thurinus
  → Next pipeline run builds and deploys
```

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

## Communication Channels

| Channel | Platform | Use Case |
|---------|----------|----------|
| WhatsApp | +447308907628 | Quick tasks, on-the-go |
| Telegram | @octavian_gaius_julius_caesar_bot | Alternative mobile |
| Discord | Octavian bot | Community/testing |
| Claude Code | Mac terminal | Heavy development |

## DNS Configuration

### newslancashire.co.uk (Gandi LiveDNS)
- A records → GitHub Pages IPs (185.199.108-111.153)
- CNAME www → tompickup23.github.io

### newsburnley.co.uk (One.com)
- A records → GitHub Pages IPs (185.199.108-111.153)
- CNAME www → tompickup23.github.io

## Expansion Roadmap

### Phase 1: Social Media Integration (Next)
Add prominent Lancashire figures' social feeds as news stories:
- **X/Twitter API** — MPs, councillors, local figures
- **Bluesky** — Open API, easy to integrate
- **Council RSS** — LCC press releases, district council feeds
- **Facebook Public Pages** — Local community pages

Implementation:
- Expand crawler to handle social APIs alongside RSS
- New content type in Hugo: "social" with profile pics, source badges
- New section: "What Lancashire is saying" or "Social Feed"
- Stored in same SQLite DB with `source_type` field

### Phase 2: Enhanced Design
- Trending topics section (AI-powered topic extraction)
- Better borough landing pages with stats and social feeds
- Mobile-first responsive redesign
- Dark/light mode toggle
- Real-time updates via JSON polling

### Phase 3: 24/7 Clawdbot
- Spin up Oracle ARM VM (4 OCPU, 24GB RAM, free forever)
- Migrate Clawdbot gateway from Mac to Oracle ARM
- Octavian works 24/7, even when laptop is closed
- Mac becomes dev-only (Claude Code)

### Phase 4: More Sites
- Pattern: Hugo on Thurinus → GitHub Pages
- Each new borough/topic site follows same pipeline
- Shared crawler, separate Hugo themes

## Future Projects Pattern
1. **Static sites** → GitHub Pages (free CDN + SSL)
2. **Build pipelines** → Thurinus (free Oracle VM)
3. **SPAs** → GitHub Pages (free)
4. **AI content** → Octavian via Kimi (free)
5. **24/7 bots** → Oracle ARM VM (free forever)
6. **Never** pay for hosting if a free tier exists
