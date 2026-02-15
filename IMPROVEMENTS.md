# AI DOGE — Suggested Improvements

> Auto-maintained by `scripts/suggest_improvements.py`.
> Manual entries are preserved; automated entries are marked `[auto]`.
> Last updated: 2026-02-15

**Summary**: 7 open issues | Critical: 0 | High: 3 | Medium: 4 | Low: 0

---

## Security

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|

## Data Quality

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|
| D9 | Medium | Feature flag / file existence mismatch [auto] | pendle: `budgets=false` but `budgets_summary.json` exists | rossendale: `budgets=false` but `budgets_summary.json` exists. UI hides available data. | open |

## Process Efficiency

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|
| P1 | High | ETL doesn't populate derived fields [auto] | Zero-value fields in cross_council.json: reserves_total. Calculate from source data. | open |
| P2 | High | cross_council.json maintained in multiple places [auto] | 5 copies found. Single source of truth should generate and copy to all locations. | open |

## App Development

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|
| A2 | High | 1 pages have zero tests [auto] | Untested: Demographics (391L). | open |
| A17 | Medium | Unguarded chained property access (4 instances) [auto] | At Budgets:1083, Budgets:1125, Budgets:1126, Budgets:1127. Use optional chaining or `|| {}` defaults. | open |
| A4 | Medium | Accessibility gaps in 1 pages [auto] | Pages with no ARIA attributes: Demographics. | open |
| A5 | Medium | setTimeout without cleanup [auto] | Memory leak risk at `src/pages/Press.jsx:55`. Add clearTimeout in useEffect cleanup. | open |

---

## Changelog

- **2026-02-10** — Auto-scan: 2 issues found
- **2026-02-11** — Auto-scan: 5 issues found
- **2026-02-12** — Auto-scan: 5 issues found
- **2026-02-13** — Auto-scan: 5 issues found
- **2026-02-14** — Auto-scan: 5 issues found
- **2026-02-15** — Auto-scan: 7 issues found
