# AI DOGE — Suggested Improvements

> Auto-maintained by `scripts/suggest_improvements.py`.
> Manual entries are preserved; automated entries are marked `[auto]`.
> Last updated: 2026-02-09

**Summary**: 30 open issues | Critical: 1 | High: 10 | Medium: 12 | Low: 7

---

## Security

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|
| S1 | Critical | XSS via `dangerouslySetInnerHTML` | `ArticleView.jsx:195` renders article HTML without sanitization. Install DOMPurify. | open |
| S2 | High | No Content Security Policy | `index.html` has no CSP meta tag — allows inline scripts, arbitrary resource loading. | open |
| S3 | Medium | `shell=True` in subprocess | `daily_audit.py` uses `subprocess.run(cmd, shell=True)`. Use array syntax. | open |
| S4 | Medium | GitHub Actions string interpolation | `daily-audit.yml:73` interpolates audit output into issue title without numeric validation. | open |
| S5 | Medium | Workflow permissions too broad | `daily-audit.yml` and `update-meetings.yml` have `contents: write` — can push to main. | open |
| S6 | Low | No `npm audit` in CI | No automated dependency vulnerability scanning in workflows. | open |

## Data Quality

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|
| D1 | High | `avg_transaction` is 0 for all councils | `cross_council.json` — should be `total_spend / total_records`. ETL must calculate. | open |
| D10 | Medium | 3,167 "NAME WITHHELD" suppliers | 7.4% of Rossendale spend has suppressed supplier names. | open |
| D11 | Low | `budgets_summary.json` schema gap | Rossendale missing `net_current_expenditure` field. | open |
| D12 | Low | Duplicate count = 0 for Rossendale | Not yet generated — duplicate detection not run. | open |
| D2 | High | `budget_summary` all zeros | `council_tax_band_d: 0`, `reserves_total: 0` despite real data in `budgets_summary.json`. | open |
| D3 | High | Rossendale `top10_supplier_pct: 0` | Placeholder — not calculated unlike other councils (0.5–0.7). | open |
| D4 | High | `insights.json` schema mismatch | Burnley vs Rossendale use completely different key names and structure. | open |
| D5 | High | `wards.json` structure mismatch | Burnley: object with ward keys. Rossendale: array of objects. Politics page will crash. | open |
| D6 | Medium | `metadata.json` key inconsistency | Burnley/Hyndburn/Pendle: `total_records`. Rossendale: `record_count`. | open |
| D7 | Medium | Hyndburn max date in future | `date_range.max: "2026-01-29"` — beyond generated date. Import error or projection? | open |
| D8 | Medium | Rossendale missing `crime_stats.json` | Exists for other 3 councils. Add feature flag or generate data. | open |
| D9 | Medium | Feature flag mismatch (budgets) | Hyndburn/Pendle/Rossendale: `budgets: false` but `budgets_govuk.json` exists (110KB). | open |

## Process Efficiency

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|
| P1 | High | ETL doesn't populate derived fields | `avg_transaction`, `council_tax_band_d`, `top10_supplier_pct` all 0. | open |
| P2 | High | cross_council.json in 5 places | No single source of truth — manual edits must be replicated 5×. | open |
| P3 | Medium | No schema validation in ETL | No JSON schema check in `run_all_lancashire.sh` pipeline. | open |
| P4 | Medium | No retry logic in `update-meetings.js` | ModernGov scraper silently fails on network errors. | open |
| P5 | Low | Audit runs full scan every time | No incremental mode — always checks all files. | open |
| P6 | Low | No sitemap.xml or robots.txt | Missing from build output. | open |

## App Development

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|
| A1 | High | 8 pages ignore `useData` errors | Budgets, Spending, Politics, Suppliers, SupplierView, ArticleView, PayComparison, CrossCouncil. | open |
| A10 | Low | No breadcrumb schema markup | ArticleView has article JSON-LD but no breadcrumb structured data. | open |
| A11 | Low | ArticleView image `alt=""` | Line 185: empty alt text. Should use `article.title`. | open |
| A12 | Low | No preconnect for data API | index.html only preconnects to Google Fonts. | open |
| A13 | Low | ErrorBoundary untested | Safety-net component has no test coverage. | open |
| A14 | Low | `reserves_earmarked` always null | Fields in budgets_summary.json never populated. Remove or populate. | open |
| A2 | High | 15 pages have zero tests | Only 4 files tested (86 tests). Spending, Budgets, Home are highest-risk gaps. | open |
| A3 | Medium | Missing `useMemo` on chart data | Budgets.jsx (5 transforms), Home.jsx, PayComparison.jsx recalculate every render. | open |
| A4 | Medium | Accessibility gaps in 10+ pages | Missing ARIA labels, no `aria-expanded` on collapsibles, no semantic landmarks. | open |
| A5 | Medium | `MyArea.jsx` setTimeout leak | Line 60: no cleanup ref — scroll attempt on unmounted component. | open |
| A6 | Medium | No E2E or integration tests | No Playwright/Cypress. Cross-page workflows untested. | open |
| A7 | Low | Home.jsx not lazy-loaded | 527-line page loaded eagerly — lazy-load for faster initial parse. | open |
| A8 | Low | No `React.memo` on any component | Stat cards, chart wrappers, table rows would benefit from memoization. | open |
| A9 | Low | Shared CSS patterns duplicated | Card/section/table styles repeated across 15+ page CSS files. | open |

---

## Changelog

- **2026-02-09** — Initial list created from comprehensive manual audit
- **2026-02-09** — Auto-scan: 30 issues found
