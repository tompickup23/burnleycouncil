# AI DOGE — Suggested Improvements

> Auto-maintained by `scripts/suggest_improvements.py`.
> Manual entries are preserved; automated entries are marked `[auto]`.
> Last updated: 2026-02-21

**Summary**: 0 open issues | 6 resolved this run | Critical: 0 | High: 0 | Medium: 0 | Low: 0

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
| P2 | High | cross_council.json maintained in multiple places [auto] | 5 copies found. By design: generate_cross_council.py is the single source, copies are per-council build artefacts. | wontfix |

## App Development

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|
| A15 | Critical | React hooks after early return (Rules of Hooks violation) [auto] | Violations: SupplierView:135 (useMemo). Move ALL hooks before any `return` statements. | fixed |
| A1 | High | 1 pages have no `useData` error handling [auto] | Pages: SupplierView. Add error fallback UI. | fixed |
| A2 | High | 1 pages have zero tests [auto] | Untested: Elections (1448L). Now has 54 tests. | fixed |
| A17 | Medium | Unguarded chained property access (108 instances) [auto] | At Budgets:394, Budgets:597, Budgets:1259, Budgets:1287, Budgets:1400.... All verified safe: guarded by JSX short-circuit `&&` or early returns with `?.`. | wontfix |
| A4 | Medium | Accessibility gaps in 2 pages [auto] | Pages with no ARIA attributes: Demographics, LGRTracker. Added aria-labels, roles, keyboard nav, aria-expanded, aria-selected, meter roles. | fixed |
| A5 | Medium | setTimeout without cleanup [auto] | Memory leak risk at `src/pages/Press.jsx:55`. Add clearTimeout in useEffect cleanup. | fixed |

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
