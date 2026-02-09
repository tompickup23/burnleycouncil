# AI DOGE — Update Guide

> Updated 9 Feb 2026. Covers all 4 councils (Burnley, Hyndburn, Pendle, Rossendale).

## Quick Reference

| What to update | Source location | How to update |
|---------------|-----------------|---------------|
| Spending data | `burnley-council/data/{council}/spending.json` | Re-run council_etl.py on vps-news |
| Budget data | `burnley-council/data/{council}/budgets_*.json` | Re-run govuk_budgets.py |
| News articles | `burnley-council/data/{council}/articles/` | mega_article_writer.py or manual JSON |
| DOGE analysis | `burnley-council/data/{council}/doge_findings.json` | Re-run doge_analysis.py |
| Cross-council | `burnley-council/data/{council}/cross_council.json` | Re-run generate_cross_council.py |
| Councillors | `burnley-council/data/{council}/councillors.json` | Re-run councillor_scraper.py |
| FOI templates | `burnley-council/data/{council}/foi_templates.json` | Edit JSON manually |
| Config | `burnley-council/data/{council}/config.json` | Edit JSON manually |

---

## 1. Updating Spending Data

### Automated (Daily Pipeline)

The daily pipeline on vps-main handles this automatically:
1. `data_monitor.py` (7am) checks council websites for new CSVs
2. `auto_pipeline.py` (8am) runs ETL if changes detected
3. WhatsApp notification sent with results

### Manual

```bash
# On vps-news:
python3 council_etl.py --council burnley --download

# Pull back to local:
scp vps-news:~/aidoge/data/burnley/spending.json burnley-council/data/burnley/

# Run cross-council analysis:
python3 doge_analysis.py
python3 scripts/generate_cross_council.py
```

---

## 2. Updating Budget Data

```bash
# On local machine:
cd burnley-council/scripts
python3 govuk_budgets.py    # Fetches MHCLG ODS files
python3 govuk_trends.py     # Revenue trend analysis
```

Output: `budgets_govuk.json`, `budgets_summary.json`, `revenue_trends.json` per council.

---

## 3. Updating News Articles

Articles are stored as JSON data files (NOT in React source code).

### Article Structure

**Index file** (`burnley-council/data/{council}/articles-index.json`):
```json
[
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
]
```

**Content file** (`burnley-council/data/{council}/articles/{id}.json`):
```json
{
  "id": "audit-findings",
  "content": "<div class=\"key-findings\">...</div><h2>The Audit Landscape</h2>..."
}
```

### Adding a New Article Manually

1. Create `burnley-council/data/{council}/articles/{id}.json` with HTML content
2. Add entry to `burnley-council/data/{council}/articles-index.json`
3. Categories: `Investigation`, `Analysis`, `Democracy`

### Automated Article Generation

`mega_article_writer.py` generates articles via the LLM router (Kimi K2.5 > Cerebras > Groq > DeepSeek > Ollama):

```bash
python3 mega_article_writer.py --council burnley --id audit-findings --dry-run
```

---

## 4. Updating FOI Templates

Edit `burnley-council/data/{council}/foi_templates.json` directly. Structure:

```json
{
  "categories": [
    {
      "id": "spending",
      "name": "Spending & Procurement",
      "description": "Requests about council spending...",
      "templates": [
        {
          "title": "Purchase Card Spending",
          "why": "Why this matters",
          "context": "Background context",
          "template": "Dear FOI Officer,\n\nUnder the Freedom of Information Act 2000..."
        }
      ]
    }
  ]
}
```

---

## 5. Building & Deploying

### Dev Server

```bash
VITE_COUNCIL=burnley VITE_BASE=/ npx vite
# Opens at http://localhost:5173
```

### Build All 4 Councils

```bash
rm -rf /tmp/lancashire-deploy

VITE_COUNCIL=burnley VITE_BASE=/lancashire/burnleycouncil/ npx vite build --outDir /tmp/lancashire-deploy/burnleycouncil
VITE_COUNCIL=hyndburn VITE_BASE=/lancashire/hyndburncouncil/ npx vite build --outDir /tmp/lancashire-deploy/hyndburncouncil
VITE_COUNCIL=pendle VITE_BASE=/lancashire/pendlecouncil/ npx vite build --outDir /tmp/lancashire-deploy/pendlecouncil
VITE_COUNCIL=rossendale VITE_BASE=/lancashire/rossendalecouncil/ npx vite build --outDir /tmp/lancashire-deploy/rossendalecouncil

# Copy 404.html for SPA routing
for dir in burnleycouncil hyndburncouncil pendlecouncil rossendalecouncil; do
  cp /tmp/lancashire-deploy/$dir/index.html /tmp/lancashire-deploy/$dir/404.html
done

# Deploy
npx gh-pages -d /tmp/lancashire-deploy --repo https://github.com/tompickup23/lancashire.git --no-history
```

**Important:** Builds must be sequential — the Vite plugin copies data to shared `public/data/`.

### Running Tests

```bash
# Unit tests
npx vitest run

# E2E tests (requires build first)
VITE_COUNCIL=burnley VITE_BASE=/ npx vite build
npx playwright test
```

---

## 6. Running Audits

```bash
# Run the improvement scanner
python3 scripts/suggest_improvements.py

# Run the daily audit
python3 scripts/daily_audit.py --build
```

---

## 7. File Structure

```
clawd/
+-- src/                           React SPA (multi-council)
|   +-- pages/                     32 page components
|   +-- components/                Shared UI (StatCard, ChartCard, etc.)
|   +-- hooks/useData.js           Data fetching with cache
|   +-- context/CouncilConfig.jsx  Council-specific config
+-- burnley-council/
|   +-- data/                      Per-council data directories
|   |   +-- burnley/
|   |   +-- hyndburn/
|   |   +-- pendle/
|   |   +-- rossendale/
|   |   +-- shared/
|   +-- scripts/                   ETL, analysis, budget scripts
+-- scripts/                       Tooling (suggest_improvements.py, etc.)
+-- e2e/                           Playwright E2E tests
+-- .github/workflows/             CI/CD
+-- vite.config.js                 Multi-council build plugin
+-- vitest.config.js               Unit test config
+-- playwright.config.js           E2E test config
```

---

## 8. Troubleshooting

### Build Fails
```bash
VITE_COUNCIL=burnley VITE_BASE=/ npx vite build  # Should exit 0
npx vitest run                                      # Should pass 141+ tests
```

### Data Not Updating After Deploy
1. GitHub Pages CDN caches ~10 minutes after deploy
2. Hard refresh (Ctrl+Shift+R) to bypass browser cache
3. Check that data was copied to the right council directory

### Generated Files — Do Not Edit Manually
- `spending.json` — generated by council_etl.py
- `doge_findings.json` — generated by doge_analysis.py
- `cross_council.json` — generated by generate_cross_council.py
- `supplier_profiles.json` — generated by generate_supplier_profiles.py (400K+ lines, gitignored)
