# AI DOGE — System Architecture & Operations Guide

> **For external collaborators.** This document describes the full AI DOGE system without exposing credentials, API keys, or personal data. Last updated: 7 February 2026.

---

## 1. What Is AI DOGE?

AI DOGE (Department of Government Efficiency) is an independent public spending transparency platform that audits UK council finances using AI and open data. It currently covers three East Lancashire borough councils:

| Council | Records | Total Spend | Data From | Threshold |
|---------|---------|-------------|-----------|-----------|
| Burnley | 30,580 | £355M | Apr 2021 | £500+ |
| Hyndburn | 29,802 | £211M | Jan 2017 | £250+ |
| Pendle | 48,785 | £127M | Apr 2021 | £500+ |
| **Total** | **110,000+** | **£693M** | | |

**Live sites:**
- https://aidoge.co.uk (homepage — all 3 councils)
- https://aidoge.co.uk/burnleycouncil/
- https://aidoge.co.uk/hyndburn/
- https://aidoge.co.uk/pendle/

**Monthly cost: £0.** Everything runs on free tiers.

---

## 2. Infrastructure

### VPS-MAIN (Hostinger)
- **Specs:** 4 CPU, 16GB RAM, 193GB disk, Ubuntu
- **Runs:** Clawdbot (WhatsApp AI bot), Ollama (local LLM), automation scripts, cron jobs
- **Services:** systemd user services

### VPS-NEWS (Oracle Cloud Free Tier)
- **Runs:** News Lancashire crawler, AIDOGE ETL scripts (council_etl.py)
- **Purpose:** Data ingestion from council open data portals
- **Accessed via:** SSH from VPS-MAIN

### GitHub Pages
- **Repo:** `tompickup23/burnleycouncil`
- **Branch `main`:** Source data, scripts, SPA source
- **Branch `gh-pages`:** Deployed static sites
- **Custom domain:** aidoge.co.uk

### MacBook (Development)
- **Used for:** Claude Code sessions, SPA builds, git operations, deployment
- **SSH access:** To both VPS-MAIN and VPS-NEWS

---

## 3. LLM Stack (Zero Cost)

### Multi-LLM Router (`llm_router.py`)
Automatic failover across 5 providers, all free:

| Priority | Provider | Model | Free Tier | Speed |
|----------|----------|-------|-----------|-------|
| 1 | Kimi (Moonshot) | kimi-k2.5 | Balance-based (free promo) | ~3s |
| 2 | Cerebras | Llama 3.3 70B | 1M tokens/day | ~2000 tok/s |
| 3 | Groq | Llama 3.3 70B | 500K tokens/day | ~300 tok/s |
| 4 | DeepSeek | deepseek-chat | When credits available | ~50 tok/s |
| 5 | Ollama (local) | Qwen 2.5 7B | Unlimited (on-device) | ~15 tok/s |

**Key function:** `generate(prompt, system_prompt, max_tokens)` returns `(text, provider_name)`

**Important quirk:** Kimi K2.5 requires `temperature: 1` (thinking model). Any other value returns 400. Response content may be in `reasoning_content` field instead of `content`.

---

## 4. Data Pipeline

```
Council Open Data (CSV files on council websites)
    |
    v
data_monitor.py -- detects page changes via SHA-256 hash
    |               sends WhatsApp alert when new data found
    v
council_etl.py -- downloads CSV, normalises, deduplicates
    |              outputs: spending.json, insights.json, metadata.json
    v
doge_analysis.py -- pure Python statistical analysis (no LLM)
    |                outputs: doge_findings.json
    v
mega_article_writer.py -- LLM-generated investigative articles
    |                      outputs: draft_articles/{council}/{id}.json
    v
Article injection -- converts drafts to SPA format
    |                 updates articles-index.json + articles/{id}.json
    v
GitHub Pages push -- gh-pages branch
    |
    v
aidoge.co.uk -- live to the public
```

---

## 5. Automation Scripts

### Content Generation

#### `mega_article_writer.py`
Generates 28 investigative articles across all councils using the LLM router:

- **Burnley (9):** Liberata exit, purchase cards, Charter Walk, waste contract, business rates cliff, LGR costs, audit findings, council tax debt, exec pay anomaly
- **Hyndburn (8):** Unaudited millions, leisure trust subsidy, exempt accommodation scam, reserves freefall, in-house vs outsourced, Accrington regeneration, waste crisis, Huncoat garden village
- **Pendle (8):** Financial time bomb, Liberata 54M, homelessness explosion, leisure centre dilemma, PEARL joint venture, planning costs, audit disclaimer, waste bill 2026
- **Cross-Council (3):** Liberata comparison, LGR debt inheritance, shared waste crisis

**Output format:** JSON with `{id, title, content (HTML), tags, council, word_count, generated_by, generated_at, status}`

**CLI:** `python3 mega_article_writer.py --council burnley --id audit-findings --dry-run`

#### `councillor_scraper.py`
Scrapes councillor data from democracy websites:
- Burnley & Hyndburn: ModernGov system (standard council platform)
- Pendle: Custom scraper (different website structure)
- Extracts: name, party, ward, email, profile URL
- **Output:** `councillors/{council}.json`

### Analysis

#### `doge_analysis.py`
Pure Python spending analysis — no LLM needed. Eight analysis types:

1. **Duplicate Detection** — Same supplier + amount + date
2. **Split Payment Detection** — Multiple amounts just under thresholds (5K, 10K, 25K, 50K, 100K)
3. **Round Number Analysis** — Payments at exact 1K increments (estimates vs actual)
4. **Year-End Spike** — March spending vs monthly average (councils show 5-13x spikes)
5. **Supplier Concentration (HHI)** — Herfindahl-Hirschman Index for market concentration
6. **Companies House Compliance** — Supplier linkage rates
7. **Department Outliers** — Per-department spending anomalies
8. **Top Supplier Deep Dives** — Key supplier profiles

**Output:** `doge_findings.json` with nested analyses and summary stats

### Monitoring

#### `data_monitor.py`
- Checks 3 council open data URLs daily
- Compares SHA-256 hash of page content to detect updates
- Sends WhatsApp alert via Clawdbot when changes detected
- Also SSH-checks VPS-NEWS health
- **State file:** `monitor_state.json` (persists hashes between runs)

#### `health_check.sh`
Checks every 6 hours:
1. Clawdbot gateway (HTTP health endpoint)
2. Ollama LLM server (API endpoint)
3. VPS-NEWS SSH reachability
4. Website status codes (aidoge.co.uk, newsburnley.co.uk, newslancashire.co.uk)
5. Disk usage
6. Memory usage

### Deployment

#### `build_council.sh`
Builds a council SPA from shared codebase:
```bash
./scripts/build_council.sh <council_id> <base_path>
# e.g. ./scripts/build_council.sh hyndburn /hyndburn/
```
Copies council-specific data files, triggers Vite build with council-specific base path.

#### `deploy_articles.sh`
Converts draft articles to SPA format, merges into council article arrays.

---

## 6. Cron Schedule (VPS-MAIN)

| Time | Script | Purpose |
|------|--------|---------|
| 06:00 UTC daily | `mega_article_writer.py` | Generate new articles |
| 07:00 UTC daily | `data_monitor.py` | Check for new council data |
| 04:00 UTC, 1st of month | `councillor_scraper.py` | Update councillor data |
| Every 6 hours | `health_check.sh` | System health monitoring |
| Every 6 hours | SSH to VPS-NEWS | Remote health check |
| Sunday 00:00 | Log rotation | Truncate logs >10MB |

---

## 7. SPA Architecture

### Tech Stack
- **Framework:** React (built with Astro for static homepage, Vite for council SPAs)
- **Hosting:** GitHub Pages (static files)
- **Data:** JSON files served as static assets (no backend/database)
- **Routing:** Client-side SPA routing with 404.html fallback

### Data Files Per Council
Each council SPA loads these from `/{council}/data/`:

| File | Contents |
|------|----------|
| `spending.json` | All spending records (5-12MB) |
| `insights.json` | Pre-computed spending insights |
| `metadata.json` | Council metadata, data period |
| `config.json` | Council-specific configuration |
| `articles-index.json` | Article metadata (id, title, date, summary, tags) |
| `articles/{id}.json` | Individual article content (HTML) |
| `doge_findings.json` | DOGE analysis results |
| `councillors.json` | Councillor data |
| `foi_templates.json` | Pre-written FOI request templates |
| `pay_comparison.json` | Senior officer pay data |
| `revenue_trends.json` | Year-over-year revenue data |
| `budgets_govuk.json` | Gov.uk budget data |
| `crime_stats.json` | Police API crime statistics |

### Config Structure
Each `config.json` defines: council identity (id, name, ONS code, theme colour), data period and totals, budget context, key suppliers with amounts, DOGE summary findings, enabled features.

### Article Format
**Index entry** (`articles-index.json`):
```json
{
  "id": "audit-findings",
  "date": "2026-02-07",
  "category": "Investigation",
  "title": "No IT Change Management: What Burnley's Audit Really Found",
  "summary": "When external auditors examined...",
  "image": "/images/articles/documents.jpg",
  "author": "Burnley Council Transparency",
  "tags": ["audit", "IT", "CIVICA"]
}
```

**Content file** (`articles/audit-findings.json`):
```json
{
  "id": "audit-findings",
  "content": "<div class=\"key-findings\">...</div><h2>The Audit Landscape</h2>..."
}
```

---

## 8. Key Findings (As of Feb 2026)

### Burnley
- **2.48M** potential duplicate payments
- **10.5M** paid to suppliers with no published contract
- **19.8M** single capital payment to one law firm (Geldards, Pioneer Place)
- **5.7x** March spending spike vs monthly average
- **No IT change management** policy for core financial system (CIVICA)
- **2.1M** heritage asset underinsurance

### Hyndburn
- **3.4M** duplicate payments (highest value of 3 councils)
- **12.9x** March spending spike (worst in East Lancashire)
- **3 years** without clean audit (disclaimer of opinion)
- **1.1M** paid to Companies House non-compliant suppliers
- **Reserves collapsed** from ~30M to ~12M in one year

### Pendle
- **48,785** transactions (highest volume despite lowest spend)
- **1,311** duplicate payment groups
- **54M** to single outsourcing company (Liberata)
- **5,400%** homelessness cost increase in 5 years
- **Reserves exhaustion** projected by 2027/28

---

## 9. Clawdbot (WhatsApp AI Bot)

- **Platform:** OpenClaw gateway on VPS-MAIN
- **WhatsApp:** Connected via WhatsApp Web protocol
- **LLM:** Kimi K2.5 via Moonshot API (primary), with router fallback
- **Port:** 18789 (localhost only)
- **Uses:** Auto-replies to WhatsApp messages, receives data monitor alerts, can trigger ad-hoc tasks
- **Runs as:** systemd user service (`openclaw-gateway.service`)

---

## 10. Repository Structure

```
burnleycouncil/                    (GitHub: tompickup23/burnleycouncil)
+-- burnley-council/
|   +-- burnley-app/               Compiled SPA output (deployed to gh-pages)
|   |   +-- index.html             Homepage (all 3 councils)
|   |   +-- burnleycouncil/        Burnley SPA
|   |   +-- hyndburn/              Hyndburn SPA
|   |   +-- pendle/                Pendle SPA
|   |   +-- about/                 Static pages
|   |   +-- _astro/                Shared CSS/JS assets
|   +-- data/
|   |   +-- burnley/
|   |   |   +-- spending.json      30K records
|   |   |   +-- articles-index.json 42 articles
|   |   |   +-- articles/          Individual article content
|   |   |   +-- config.json
|   |   +-- hyndburn/              19 articles
|   |   +-- pendle/                18 articles
|   +-- scripts/
|   |   +-- build_council.sh       SPA build script
|   |   +-- council_etl.py         Data ingestion
+-- AIDOGE-MASTERPLAN.md           Strategic roadmap
+-- AIDOGE-OVERVIEW.md             This document
```

### VPS-MAIN File Structure
```
/root/clawd-worker/
+-- aidoge/
|   +-- scripts/
|   |   +-- llm_router.py          Multi-LLM failover
|   |   +-- mega_article_writer.py Article generation
|   |   +-- doge_analysis.py       Spending analysis
|   |   +-- data_monitor.py        Change detection
|   |   +-- councillor_scraper.py  Democracy data
|   |   +-- deploy_articles.sh     Deployment pipeline
|   +-- data/
|       +-- draft_articles/        Generated articles
|       |   +-- burnley/
|       |   +-- hyndburn/
|       |   +-- pendle/
|       +-- councillors/           Scraped councillor data
|       +-- analysis/              DOGE findings output
|       +-- monitor_state.json     Data monitor state
+-- scripts/
|   +-- health_check.sh
+-- logs/                          All script logs
```

---

## 11. Current Article Counts

| Council | Hand-Written | AI-Generated | Total |
|---------|-------------|-------------|-------|
| Burnley | 32 | 10 | **42** |
| Hyndburn | 13 | 6 | **19** |
| Pendle | 13 | 5 | **18** |
| **Total** | **58** | **21** | **79** |

Target: 27+ articles per council (from MASTERPLAN).

---

## 12. What's Next (from MASTERPLAN)

### Features to Build
- **Executive Pay Comparison** — Cross-council senior officer salary analysis
- **Cross-Council Comparison Dashboard** — Side-by-side metrics
- **Supplier Deep Dive Pages** — Dynamic profiles per supplier
- **Postcode to Ward Lookup** — "Who represents me?"
- **"What Changed?" Tracking** — Did the council act on findings?

### Technical Debt
- 12MB `spending.json` needs splitting (virtual scrolling / Web Worker)
- TypeScript migration (currently all JSX)
- Shared component library (5+ independent implementations of same components)
- Test coverage (currently zero)

### Scale Target
- Expand to 5+ councils (Lancashire CC, Preston, Blackburn next)
- 60% Companies House match rate (currently ~20%)
- Fully automated data pipeline (currently semi-manual)

---

## 13. How to Explore

### View Live Sites
- Homepage: https://aidoge.co.uk
- Burnley: https://aidoge.co.uk/burnleycouncil/
- Hyndburn: https://aidoge.co.uk/hyndburn/
- Pendle: https://aidoge.co.uk/pendle/

### Browse the Code
- GitHub repo: `tompickup23/burnleycouncil` (ask Tom for collaborator access)
- `main` branch: source data + scripts
- `gh-pages` branch: deployed site

### Understand the Data
- Each council's `config.json` has the full context
- `doge_findings.json` has all statistical analysis
- `articles-index.json` lists all published articles
- `AIDOGE-MASTERPLAN.md` has the full strategic roadmap

---

*Generated by Claude (Opus 4) for AI DOGE project review. No credentials, API keys, phone numbers, or personal data are included.*
