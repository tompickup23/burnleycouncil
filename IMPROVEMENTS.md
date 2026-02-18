# AI DOGE — Suggested Improvements

> Auto-maintained by `scripts/suggest_improvements.py`.
> Manual entries are preserved; automated entries are marked `[auto]`.
> Last updated: 2026-02-18

**Summary**: 4 open issues | 1 auto-resolved this run | Critical: 0 | High: 1 | Medium: 3 | Low: 0

---

## Security

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|

## Data Quality

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|
| D9 | Medium | Feature flag / file existence mismatch [auto] | pendle: `budgets=false` but `budgets_summary.json` exists | rossendale: `budgets=false` but `budgets_summary.json` exists. UI hides available data. | fixed |

## Process Efficiency

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|
| P2 | High | cross_council.json maintained in multiple places [auto] | 5 copies found. Single source of truth should generate and copy to all locations. | open |

## App Development

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|
| A17 | Medium | Unguarded chained property access (90 instances) [auto] | At Budgets:394, Budgets:597, Budgets:1257, Budgets:1285, Budgets:1398.... Use optional chaining or `|| {}` defaults. | open |
| A4 | Medium | Accessibility gaps in 2 pages [auto] | Pages with no ARIA attributes: Demographics, LGRTracker. | open |
| A5 | Medium | setTimeout without cleanup [auto] | Memory leak risk at `src/pages/Press.jsx:55`. Add clearTimeout in useEffect cleanup. | open |

---

## Changelog

- **2026-02-10** — Auto-scan: 2 issues found
- **2026-02-11** — Auto-scan: 5 issues found
- **2026-02-12** — Auto-scan: 5 issues found
- **2026-02-13** — Auto-scan: 5 issues found
- **2026-02-14** — Auto-scan: 5 issues found
- **2026-02-15** — Auto-scan: 7 issues found
- **2026-02-16** — Auto-scan: 6 issues found, 1 resolved
- **2026-02-17** — Auto-scan: 5 issues found, 1 resolved
- **2026-02-18** — Auto-scan: 4 issues found, 1 resolved
