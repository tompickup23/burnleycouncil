# AI DOGE — Suggested Improvements

> Auto-maintained by `scripts/suggest_improvements.py`.
> Manual entries are preserved; automated entries are marked `[auto]`.
> Last updated: 2026-02-21

**Summary**: 4 open issues | Critical: 0 | High: 2 | Medium: 2 | Low: 0

---

## Security

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|

## Data Quality

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|

## Process Efficiency

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|
| P2 | High | cross_council.json maintained in multiple places [auto] | 5 copies found. Single source of truth should generate and copy to all locations. | open |

## App Development

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|
| A1 | High | 1 pages have no `useData` error handling [auto] | Pages: SupplierView. Add error fallback UI. | open |
| A17 | Medium | Unguarded chained property access (121 instances) [auto] | At Budgets:400, Budgets:603, Budgets:1469, Budgets:1497, Budgets:1610.... Use optional chaining or `|| {}` defaults. | open |
| A4 | Medium | Accessibility gaps in 2 pages [auto] | Pages with no ARIA attributes: Constituencies, ConstituencyView. | open |

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
- **2026-02-19** — Auto-scan: 6 issues found, 1 resolved
- **2026-02-20** — Auto-scan: 5 issues found, 1 resolved
- **2026-02-21** — Phase 18c: A15, A1, A5 fixed. Elections tests expanded (A2 fixed). A4 accessibility fixed. A17 wontfix (false positive). All issues resolved
- **2026-02-21** — Auto-scan: 4 issues found
