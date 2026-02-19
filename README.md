# AI DOGE — Public Spending Transparency Platform

Multi-council public spending transparency platform for Lancashire. React SPA deployed per-council via GitHub Pages at [aidoge.co.uk](https://aidoge.co.uk).

**2,286,000+ transactions | £12 billion+ tracked | 15 Lancashire councils | 648 councillors**

## Live Councils

| Council | URL | Records | Total Spend | Tier |
|---------|-----|---------|-------------|------|
| [Burnley](https://aidoge.co.uk/lancashire/burnleycouncil/) | /burnleycouncil | 30,580 | £355M | District |
| [Hyndburn](https://aidoge.co.uk/lancashire/hyndburncouncil/) | /hyndburncouncil | 29,804 | £211M | District |
| [Pendle](https://aidoge.co.uk/lancashire/pendlecouncil/) | /pendlecouncil | 49,741 | £125M | District |
| [Rossendale](https://aidoge.co.uk/lancashire/rossendalecouncil/) | /rossendalecouncil | 42,536 | £64M | District |
| [Lancaster](https://aidoge.co.uk/lancashire/lancastercouncil/) | /lancastercouncil | 32,574 | £184M | District |
| [Ribble Valley](https://aidoge.co.uk/lancashire/ribblevalleycouncil/) | /ribblevalleycouncil | 13,723 | £38M | District |
| [Chorley](https://aidoge.co.uk/lancashire/chorleycouncil/) | /chorleycouncil | 21,421 | £365M | District |
| [South Ribble](https://aidoge.co.uk/lancashire/southribblecouncil/) | /southribblecouncil | 18,517 | £177M | District |
| [Preston](https://aidoge.co.uk/lancashire/prestoncouncil/) | /prestoncouncil | 46,711 | £205M | District |
| [West Lancashire](https://aidoge.co.uk/lancashire/westlancashirecouncil/) | /westlancashirecouncil | 43,063 | £333M | District |
| [Wyre](https://aidoge.co.uk/lancashire/wyrecouncil/) | /wyrecouncil | 51,092 | £678M | District |
| [Fylde](https://aidoge.co.uk/lancashire/fyldecouncil/) | /fyldecouncil | 37,514 | £155M | District |
| [Lancashire CC](https://aidoge.co.uk/lancashire/lancashirecc/) | /lancashirecc | 753,220 | £3.6B | County |
| [Blackpool](https://aidoge.co.uk/lancashire/blackpoolcouncil/) | /blackpoolcouncil | 630,914 | £4.1B | Unitary |
| [Blackburn](https://aidoge.co.uk/lancashire/blackburncouncil/) | /blackburncouncil | 492,973 | £1.7B | Unitary |

## Stack

- **Frontend:** React 19 + Vite 7, 25 pages across 28 lazy-loaded routes, config-driven per council
- **Data:** Council CSV spending data + GOV.UK MHCLG standardised budgets + Census 2021 demographics
- **Analysis:** DOGE forensic analysis, election predictions, councillor integrity scoring, LGR financial modelling
- **ETL:** 40 Python scripts — spending, budgets, integrity, elections, constituencies, demographics, procurement
- **Tests:** 446 unit tests + 49 E2E tests — all passing
- **Hosting:** GitHub Pages (free), CI/CD via GitHub Actions, £22/month total cost

## Quick Start

```bash
# Dev server
VITE_COUNCIL=burnley VITE_BASE=/ npx vite

# Build single council
VITE_COUNCIL=burnley VITE_BASE=/ npx vite build

# Run tests
npx vitest run
```

## Docs

- **[CLAUDE.md](./CLAUDE.md)** — Build commands, file locations, dev rules
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Software architecture, data pipeline, frontend patterns
- **[INFRASTRUCTURE.md](./INFRASTRUCTURE.md)** — Servers, AI tools, DNS, costs
- **[AIDOGE-MASTERPLAN.md](./AIDOGE-MASTERPLAN.md)** — Strategic roadmap, phases 1-17, current state
- **[IMPROVEMENTS.md](./IMPROVEMENTS.md)** — Auto-maintained issue tracker

## Repos

| Repo | Purpose |
|------|---------|
| [tompickup23/burnleycouncil](https://github.com/tompickup23/burnleycouncil) | Source (this repo) |
| [tompickup23/lancashire](https://github.com/tompickup23/lancashire) | Deploy (gh-pages) |
| [tompickup23/newslancashire](https://github.com/tompickup23/newslancashire) | News Lancashire pipeline |
