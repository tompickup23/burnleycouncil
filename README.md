# AI DOGE — Public Spending Transparency Platform

Multi-council public spending transparency platform for East Lancashire. React SPA deployed per-council via GitHub Pages at [aidoge.co.uk](https://aidoge.co.uk).

## Live Councils

| Council | Records | Total Spend | Threshold |
|---------|---------|-------------|-----------|
| [Burnley](https://aidoge.co.uk/lancashire/burnleycouncil/) | 30,580 | £355M | £500+ |
| [Hyndburn](https://aidoge.co.uk/lancashire/hyndburncouncil/) | 29,804 | £211M | £250+ |
| [Pendle](https://aidoge.co.uk/lancashire/pendlecouncil/) | 49,741 | £125M | All |
| [Rossendale](https://aidoge.co.uk/lancashire/rossendalecouncil/) | 42,536 | £64M | All |

## Stack

- **Frontend:** React 19 + Vite 7, lazy-loaded routes, config-driven per council
- **Data:** Council CSV spending data + GOV.UK MHCLG standardised budgets
- **Analysis:** Duplicate detection, split payment evasion, Companies House compliance, Benford's Law
- **Hosting:** GitHub Pages (free), CI/CD via GitHub Actions

## Quick Start

```bash
# Dev build (single council)
VITE_COUNCIL=burnley VITE_BASE=/lancashire/burnleycouncil/ npx vite build

# Dev server
VITE_COUNCIL=burnley VITE_BASE=/ npx vite
```

## Docs

- **[CLAUDE.md](./CLAUDE.md)** — Build commands, file locations, dev rules
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Software architecture, data pipeline, frontend patterns
- **[INFRASTRUCTURE.md](./INFRASTRUCTURE.md)** — Servers, AI tools, DNS, costs
- **[AIDOGE-MASTERPLAN.md](./AIDOGE-MASTERPLAN.md)** — Strategic roadmap, feature plans, content priorities
- **[TODO.md](./TODO.md)** — Central task list
- **[HANDOVER-NEWSLANCASHIRE.md](./HANDOVER-NEWSLANCASHIRE.md)** — News Lancashire project guide (for iPhone Claude Code)

## Repos

| Repo | Purpose |
|------|---------|
| [tompickup23/burnleycouncil](https://github.com/tompickup23/burnleycouncil) | Source (this repo) |
| [tompickup23/lancashire](https://github.com/tompickup23/lancashire) | Deploy (gh-pages) |
| tompickup23/newslancashire | News Lancashire pipeline (private, needs push) |
