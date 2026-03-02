# AI DOGE — Suggested Improvements

> Auto-maintained by `scripts/suggest_improvements.py`.
> Manual entries are preserved; automated entries are marked `[auto]`.
> Last updated: 2026-03-02

**Summary**: 8 open issues | 1 auto-resolved this run | Critical: 0 | High: 5 | Medium: 3 | Low: 0

---

## Security

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|

## Data Quality

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|
| D2 | High | `budget_summary` fields all zeros [auto] | Councils with zero `council_tax_band_d`: Lancashire PCC, Lancashire Fire. Real data exists in `budgets_summary.json`. | open |

## Process Efficiency

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|
| P1 | High | ETL doesn't populate derived fields [auto] | Zero-value fields in cross_council.json: council_tax_band_d, reserves_total. Calculate from source data. | open |
| P2 | High | cross_council.json maintained in multiple places [auto] | 5 copies found. Single source of truth should generate and copy to all locations. | open |

## App Development

| ID | Severity | Issue | Detail | Status |
|----|----------|-------|--------|--------|
| A1 | High | 1 pages have no `useData` error handling [auto] | Pages: SupplierView. Add error fallback UI. | open |
| A2 | High | 1 pages have zero tests [auto] | Untested: MPComparison (609L). | open |
| A17 | Medium | Unguarded chained property access (149 instances) [auto] | At Budgets:452, Budgets:647, Budgets:1485, Budgets:1513, Budgets:1626.... Use optional chaining or `|| {}` defaults. | open |
| A4 | Medium | Accessibility gaps in 6 pages [auto] | Pages with no ARIA attributes: Constituencies, ConstituencyView, CouncillorDossier, MPComparison, PropertyDetail, PropertyPortfolio. | open |
| A5 | Medium | setTimeout without cleanup [auto] | Memory leak risk at `src/pages/Intelligence.jsx:101`, `src/pages/Strategy.jsx:406`, `src/pages/Strategy.jsx:418`. Add clearTimeout in useEffect cleanup. | open |
| A3 | Medium | Missing `useMemo` on data transforms [auto] | Pages with unmemoized data processing: PropertyDetail (4 data transforms, 1 useMemo). | fixed |

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
- **2026-02-23** — Auto-scan: 6 issues found
- **2026-02-24** — Auto-scan: 6 issues found
- **2026-02-25** — Auto-scan: 6 issues found
- **2026-02-26** — Auto-scan: 6 issues found
- **2026-02-27** — Auto-scan: 6 issues found
- **2026-02-28** — Auto-scan: 7 issues found
- **2026-03-01** — Auto-scan: 7 issues found, 1 resolved
- **2026-03-02** — Auto-scan: 8 issues found, 1 resolved
