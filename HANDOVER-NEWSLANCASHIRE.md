# News Lancashire — Project Handover

> For Claude Code sessions (iPhone or Mac). Last updated: 9 February 2026.

## What This Is

Two local news websites for Lancashire, England:
- **newslancashire.co.uk** — All 14 Lancashire boroughs (DEPLOY BROKEN — needs rebuild)
- **newsburnley.co.uk** — Burnley-focused subset (LIVE on Cloudflare Pages)

Automated pipeline crawls RSS feeds, Bluesky, Google News every 30 minutes. AI rewrites and analyses articles via Kimi K2.5 / DeepSeek. Everything runs on **vps-news** (Oracle, 1GB RAM, free).

## Where Things Live

**Server:** vps-news (141.147.79.228, user `ubuntu`)
```
ssh vps-news
```

**Project root:** `~/newslancashire/`
```
~/newslancashire/
├── pipeline_v4.sh          # Main pipeline (cron every 30min)
├── .env                    # API keys (MOONSHOT, DEEPSEEK, CLOUDFLARE)
├── db/news.db              # SQLite database (787 articles)
├── export/                 # Generated JSON for frontends
│   ├── articles.json       # All articles (655 exported)
│   └── burnley-news.json   # Burnley subset (50 articles)
├── scripts/
│   ├── crawler_v3.py       # Core RSS + Bluesky crawler
│   ├── social_crawler.py   # Social media crawler
│   ├── ai_rewriter.py      # Batch AI rewrites (Kimi → DeepSeek)
│   ├── ai_analyzer.py      # Deep analysis for high-interest articles
│   ├── export_json.py      # Exports DB to JSON
│   ├── enhanced_sources/   # 16+ scrapers (YouTube, Reddit, weather, etc.)
│   ├── planning/           # DISABLED — IDOX scraper (broken endpoints)
│   ├── council_minutes/    # DISABLED — Burnley minutes (DNS failure)
│   ├── digest/             # AI digest generator
│   └── legacy/             # Dead scripts (crawler.py, crawler-optimized.py)
├── config/
│   ├── feeds.json          # RSS feeds, Bluesky accounts
│   ├── categories.json     # Category keywords + interest boosters
│   └── social.json         # Social posting config
├── site/                   # Hugo site (disconnected from deploy)
├── logs/                   # Pipeline + script logs
└── data/                   # Misc data files
```

**News Burnley deploy:** `~/newsburnley/public/` → Cloudflare Pages

## Database

SQLite at `~/newslancashire/db/news.db`. Single `articles` table.

**Key columns:** id, title, link, source, published, summary, ai_rewrite, ai_analysis, content_tier, category, interest_score, trending_score, is_burnley...is_blackpool (14 borough flags)

**Content tiers:** aggregated (raw RSS, 82%), analysis (AI-analyzed, 11%), digest (AI roundups, 6%), data_driven (0.4%)

**Quick queries:**
```bash
ssh vps-news "sqlite3 ~/newslancashire/db/news.db 'SELECT COUNT(*) FROM articles'"
ssh vps-news "sqlite3 ~/newslancashire/db/news.db \"SELECT content_tier, COUNT(*) FROM articles GROUP BY content_tier\""
ssh vps-news "sqlite3 ~/newslancashire/db/news.db \"SELECT source, COUNT(*) FROM articles GROUP BY source ORDER BY 2 DESC LIMIT 10\""
```

## Pipeline (pipeline_v4.sh)

Runs every 30 minutes. 9 phases:

| Phase | What | Scripts |
|-------|------|---------|
| 1 | Core crawling | crawler_v3.py, social_crawler.py |
| 2 | Enhanced sources | 16 scripts (YouTube, Reddit, weather, etc.) |
| 3 | AI digests | ai_digest_generator.py |
| 4 | Planning | DISABLED (broken endpoints) |
| 5 | Council minutes | DISABLED (DNS failure) |
| 6 | Weekly digest | weekly_digest.py (Mondays) |
| 7 | AI processing | ai_rewriter.py, ai_analyzer.py |
| 8 | Export | export_json.py |
| 9 | News Burnley | news_burnley_sync.py → Cloudflare Pages |

**Error handling:** Per-phase (no cascade). Error count in log. `|| true` not needed — `run_script()` handles it.

**Logs:** `~/newslancashire/logs/pipeline.log`

## AI Writing

### Rewriter (ai_rewriter.py)
- Batch of 5 articles per API call, max 50 per run
- Kimi K2.5 (primary) → DeepSeek (fallback)
- Known issues: 43 truncated at 500 chars, 4 identical to input

### Analyzer (ai_analyzer.py)
- One article per API call, max 30 per run
- Only articles with interest_score >= 60
- Sets content_tier to 'analysis'
- Prompt: neutral, fact-based (bias removed 9 Feb 2026)

## Known Issues (as of 9 Feb 2026)

| Issue | Impact | Fix |
|-------|--------|-----|
| **newslancashire.co.uk deploy broken** | Site serves stale cached content | Build simple HTML generator or rebuild Astro |
| **197 articles (25%) have no borough** | Don't appear on borough pages | Improve keyword detection + add source-based fallback |
| **305 articles (39%) have zero interest score** | Get buried | Add baseline score (10) + boost rules |
| **43 AI rewrites truncated (500 chars)** | Look obviously AI-generated | Increase max_tokens, add validation |
| **4 AI rewrites identical to input** | Pure RSS text as "original" | Add similarity check, re-run if >90% match |
| **Rewriter batches 5 articles** | Cross-contamination, lower quality | Switch to single-article rewrites |
| **Hugo site disconnected** | Unused 15MB in project | Decide: reconnect or delete |
| **No GitHub repo yet** | Can't clone on other devices | Create tompickup23/newslancashire (private) |
| **Planning scrapers broken** | No planning data | Wait for IDOX endpoints to come back up |
| **3 legacy scripts** | Clutter | Move to scripts/legacy/ |

## Next Steps (Tier 2 — AI Writing Quality)

These are the priority improvements to make articles pass AI detection:

### R6: Single-article rewrites
Change `ai_rewriter.py` from batch (5 per call) to one article per call. Slower but much higher quality. Set `max_tokens` to at least 500 tokens (not characters).

### R7: Better rewriter prompt
Replace the current "rewrite in 2-3 sentences" prompt with:
```
You are a local journalist for News Lancashire. Rewrite this news item in your own words.
- Write 60-100 words as a brief news update
- Open with the most interesting fact, not "A new report shows..."
- Vary sentence openings — never start two sentences the same way
- Include the source attribution naturally
- Write conversationally but factually, as if explaining to a neighbour
- Do NOT use: "In a significant development", "It has been revealed", "Sources say"
```

### R9: Rewrite validation
After API returns, check:
- Identical to input? → Re-run
- Under 100 chars? → Re-run
- Ends mid-sentence? → Re-run with higher max_tokens
- Cosine similarity to input > 0.9? → Re-run

### R10: Humaniser pass
Second prompt after rewriting that:
- Varies sentence length
- Adds local colour
- Checks for AI-sounding phrases
- Ensures natural paragraph flow

### R11: Better borough detection
Add fallback: if no borough from keywords, check source feed (e.g., Burnley Express → is_burnley). Add "lancashire-wide" tag for county-level stories.

### R12: Better interest scoring
Add baseline: every article starts at 10. Boost: has AI analysis (+20), from local source (+15), mentions specific entities (+10).

### R13: Frontend — rebuild newslancashire.co.uk
Three options:
- **A) Reconnect Hugo** — complex, Hugo needs installing
- **B) Python HTML generator** — simple, like news_burnley_sync.py but for all boroughs
- **C) New React/Astro frontend** — best UX, most effort

Option B is fastest for 1GB RAM server.

## Crons

```
# On vps-news (Oracle)
*/30 * * * *  ~/newslancashire/pipeline_v4.sh
0 2 * * *     ~/newslancashire/scripts/backup.sh
```

## Useful Commands

```bash
# Check pipeline is running
ssh vps-news "tail -20 ~/newslancashire/logs/pipeline.log"

# Check latest articles
ssh vps-news "sqlite3 ~/newslancashire/db/news.db \"SELECT title, source, interest_score FROM articles ORDER BY fetched_at DESC LIMIT 10\""

# Check AI rewrite quality
ssh vps-news "sqlite3 ~/newslancashire/db/news.db \"SELECT title, LENGTH(ai_rewrite) FROM articles WHERE ai_rewrite IS NOT NULL ORDER BY fetched_at DESC LIMIT 10\""

# Check error count from last pipeline run
ssh vps-news "grep 'Pipeline v4.1 complete' ~/newslancashire/logs/pipeline.log | tail -3"

# Run pipeline manually
ssh vps-news "cd ~/newslancashire && bash pipeline_v4.sh"

# Run just the AI rewriter
ssh vps-news "cd ~/newslancashire && source .env && python3 scripts/ai_rewriter.py"

# Export articles
ssh vps-news "cd ~/newslancashire && python3 scripts/export_json.py"

# Check DB size and article count
ssh vps-news "ls -lh ~/newslancashire/db/news.db; sqlite3 ~/newslancashire/db/news.db 'SELECT COUNT(*) FROM articles'"

# Git status
ssh vps-news "cd ~/newslancashire && git log --oneline -5 && git status --short"
```

## Git Setup (Needs Completing)

Git repo initialised on vps-news with 2 commits. To push to GitHub:

1. Create private repo: `tompickup23/newslancashire` on github.com
2. Generate SSH deploy key on vps-news:
   ```bash
   ssh vps-news "ssh-keygen -t ed25519 -f ~/.ssh/newslancashire_deploy -N ''"
   ssh vps-news "cat ~/.ssh/newslancashire_deploy.pub"
   ```
3. Add public key as deploy key on GitHub repo (Settings → Deploy keys, allow write)
4. Add SSH config on vps-news:
   ```bash
   ssh vps-news "cat >> ~/.ssh/config << 'EOF'
   Host github-newslancashire
       HostName github.com
       User git
       IdentityFile ~/.ssh/newslancashire_deploy
       IdentitiesOnly yes
   EOF"
   ```
5. Push:
   ```bash
   ssh vps-news "cd ~/newslancashire && git remote add origin git@github-newslancashire:tompickup23/newslancashire.git && git push -u origin master"
   ```

## Related Docs

- **[CLAUDE.md](./CLAUDE.md)** — AI DOGE project guide (the main React SPA)
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — AI DOGE software architecture
- **[INFRASTRUCTURE.md](./INFRASTRUCTURE.md)** — All servers, services, costs
- **[TODO.md](./TODO.md)** — Central task list across all projects
