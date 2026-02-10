# AI DOGE — Suggested Improvements

> Auto-maintained by `scripts/suggest_improvements.py`.
> Manual entries are preserved; automated entries are marked `[auto]`.
> Last updated: 2026-02-09

**Summary**: 2 open issues | Critical: 0 | High: 2 | Medium: 0 | Low: 0

---

## Security

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|
| S1 | Critical | XSS via `dangerouslySetInnerHTML` | `ArticleView.jsx:195` renders article HTML without sanitization. Install DOMPurify. | fixed |
| S2 | High | No Content Security Policy | `index.html` has no CSP meta tag — allows inline scripts, arbitrary resource loading. | fixed |
| S3 | Medium | `shell=True` in subprocess | `daily_audit.py` uses `subprocess.run(cmd, shell=True)`. Use array syntax. | fixed |
| S4 | Medium | GitHub Actions string interpolation | `daily-audit.yml` now uses env vars instead of direct interpolation. | fixed |
| S5 | Medium | Workflow permissions too broad | Moved to job-level permissions in both workflow files. | fixed |
| S6 | Low | No `npm audit` in CI | No automated dependency vulnerability scanning in workflows. | fixed |

## Data Quality

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|
| D1 | High | `avg_transaction` is 0 for all councils | `cross_council.json` — should be `total_spend / total_records`. ETL must calculate. | fixed |
| D2 | High | `budget_summary` all zeros | `council_tax_band_d: 0`, `reserves_total: 0` despite real data in `budgets_summary.json`. | fixed |
| D3 | High | Rossendale `top10_supplier_pct: 0` | Placeholder — not calculated unlike other councils (0.5–0.7). | fixed |
| D4 | High | `insights.json` schema mismatch | Burnley vs Rossendale use completely different key names and structure. | fixed |
| D5 | High | `wards.json` structure mismatch | Burnley: object with ward keys. Rossendale: array of objects. Politics page will crash. | fixed |
| D10 | Medium | 3,167 "NAME WITHHELD" suppliers | 7.4% of Rossendale spend has suppressed supplier names. | fixed |
| D6 | Medium | `metadata.json` key inconsistency | Burnley/Hyndburn/Pendle: `total_records`. Rossendale: `record_count`. | fixed |
| D7 | Medium | Hyndburn max date in future | `date_range.max: "2026-01-29"` — beyond generated date. Import error or projection? | fixed |
| D8 | Medium | Rossendale missing `crime_stats.json` | Added `crime_stats: false` feature flag to config. | fixed |
| D9 | Medium | Feature flag mismatch (budgets) | Added `budgets_govuk: true` to Hyndburn/Pendle/Rossendale config. | fixed |
| D11 | Low | `budgets_summary.json` schema gap | Rossendale missing `net_current_expenditure` field. | fixed |
| D12 | Low | Duplicate count = 0 for Rossendale | Not yet generated — duplicate detection not run. | fixed |

## Process Efficiency

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|
| P1 | High | ETL doesn't populate derived fields | `generate_cross_council.py` now computes `avg_transaction`, `council_tax_band_d`, `top10_supplier_pct` from source data. ETL itself still outputs zeros — cross_council.py patches them. | fixed |
| P2 | High | cross_council.json in 5 places | `scripts/generate_cross_council.py` is now the single source of truth — generates all 4 council copies from source data. | fixed |
| P3 | Medium | No schema validation in ETL | No JSON schema check in `run_all_lancashire.sh` pipeline. | fixed |
| P4 | Medium | No retry logic in `update-meetings.js` | ModernGov scraper silently fails on network errors. | fixed |
| P5 | Low | Audit runs full scan every time | No incremental mode — always checks all files. | fixed |
| P6 | Low | No sitemap.xml or robots.txt | Missing from build output. | fixed |

## App Development

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|
| A1 | High | 8 pages ignore `useData` errors | All 15 pages now handle errors with consistent error UI. | fixed |
| A2 | High | 15 pages have zero tests | 7 test files, 103 tests. Added Home, Spending, ErrorBoundary. | fixed |
| A3 | Medium | Missing `useMemo` on chart data | useMemo added to Home, Budgets, PayComparison chart transforms. | fixed |
| A4 | Medium | Accessibility gaps in 10+ pages | ARIA labels, tab roles, aria-expanded added to key components. | fixed |
| A5 | Medium | `MyArea.jsx` setTimeout leak | Line 60: no cleanup ref — scroll attempt on unmounted component. | fixed |
| A6 | Medium | No E2E or integration tests | No Playwright/Cypress. Cross-page workflows untested. | fixed |
| A10 | Low | No breadcrumb schema markup | ArticleView has article JSON-LD but no breadcrumb structured data. | fixed |
| A11 | Low | ArticleView image `alt=""` | Line 185: empty alt text. Should use `article.title`. | fixed |
| A12 | Low | No preconnect for data API | index.html only preconnects to Google Fonts. | fixed |
| A13 | Low | ErrorBoundary untested | Safety-net component has no test coverage. | fixed |
| A14 | Low | `reserves_earmarked` always null | Fields in budgets_summary.json never populated. Remove or populate. | fixed |
| A7 | Low | Home.jsx not lazy-loaded | 527-line page loaded eagerly — lazy-load for faster initial parse. | fixed |
| A8 | Low | No `React.memo` on any component | Stat cards, chart wrappers, table rows would benefit from memoization. | fixed |
| A9 | Low | Shared CSS patterns duplicated | Card/section/table styles repeated across 15+ page CSS files. | fixed |

---

## Changelog

- **2026-02-09** — Initial list created from comprehensive manual audit
- **2026-02-09** — Auto-scan: 30 issues found
- **2026-02-09** — Auto-scan: 34 issues found
- **2026-02-09** — Auto-scan: 33 issues found
- **2026-02-09** — Auto-scan: 33 issues found
- **2026-02-09** — Auto-scan: 34 issues found
- **2026-02-09** — Auto-scan: 33 issues found
- **2026-02-09** — Auto-scan: 18 issues found
- **2026-02-09** — Auto-scan: 2 issues found
