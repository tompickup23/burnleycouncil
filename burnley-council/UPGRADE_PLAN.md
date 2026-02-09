# AI DOGE — Upgrade Plan

> Originally written pre-Rossendale expansion. Updated 9 Feb 2026 to reflect completed work.
> Now covers 4 councils: Burnley, Hyndburn, Pendle, Rossendale.

## Audit Summary

The codebase has evolved significantly since the original plan. Key milestones achieved:
- **4 councils live** (up from 1), all config-driven from a single codebase
- **Shared component library** built (StatCard, ChartCard, LoadingState, etc.)
- **Data layer** with useData() hook (30min TTL cache, retry, LRU eviction)
- **Error handling** with per-route ErrorBoundary + Guarded wrappers
- **Test coverage** with 141+ unit tests (Vitest) and 9 E2E smoke tests (Playwright)
- **DOGE analysis pipeline** running cross-council (duplicates, splits, Benford's, CH compliance)
- **Automated data pipeline** (daily cron: data_monitor → ETL → analysis → articles → WhatsApp)
- **Accessibility** improvements (ARIA landmarks, keyboard navigation, alt text)
- **SEO** improvements (robots.txt, sitemap.xml, per-page titles, JSON-LD)
- **Security** hardened (DOMPurify for article HTML, CSP headers, workflow permissions tightened)

---

## What Opus 4.6 Brings Over 4.5

| Capability | Impact on This Project |
|---|---|
| **Deeper multi-file reasoning** | Can refactor across 10+ files simultaneously with full context awareness |
| **Stronger TypeScript generation** | Migrate from JSX to TSX with correct types in a single pass |
| **Better architectural planning** | Can design shared component libraries, data layers, and routing patterns holistically |
| **Improved code consistency** | Will maintain design system tokens, naming conventions, and patterns across all files |
| **Superior test generation** | Can produce meaningful Vitest + Testing Library tests that cover real user flows |
| **More nuanced performance reasoning** | Can implement Web Workers, virtual scrolling, and data compression with fewer iterations |
| **Better CSS-to-system refactoring** | Can extract repeated CSS patterns into a coherent component/utility system |

---

## PHASE 1: Structural Foundation (Critical)

### 1.1 TypeScript Migration
**Current:** All files are plain `.jsx` with zero type safety. `@types/react` is installed but unused.
**Upgrade:**
- Rename all `.jsx` → `.tsx`, all `.js` → `.ts`
- Add `tsconfig.json` with strict mode
- Type all component props, state, and data shapes
- Create `src/types/` with interfaces for: `SpendingRecord`, `Councillor`, `BudgetEntry`, `Ward`, `Article`, `Insight`, `DOGEFinding`
- Type the utility functions in `format.ts`

**Files affected:** Every `.jsx` and `.js` file (~20 files)
**Opus 4.6 advantage:** Can infer correct types from the JSON data shapes and apply them consistently across all files in a single pass, where 4.5 would lose context across files.

### 1.2 Shared Component Library ✅ DONE
**Status:** `src/components/ui/` contains StatCard, ChartCard, LoadingState, Badge, and more. ErrorBoundary wraps every route via `<Guarded>`. Shared CSS utility classes (pad-lg, rounded-lg, bg-card) in index.css reduce duplication.

### 1.3 Data Layer & Caching ✅ DONE
**Status:** `src/hooks/useData.js` — module-level Map cache with 30-minute TTL, request deduplication, retry with exponential backoff (2 retries, 1s/2s), LRU eviction at 50 entries. `preloadData()` warms cache for predicted next routes. `CouncilConfigProvider` loads config.json and provides council context.

### 1.4 Error Handling ✅ DONE
**Status:** Per-route `<Guarded>` wrapper gives each route its own ErrorBoundary + Suspense boundary. A crash in Spending won't take down Budgets or DOGE. ErrorBoundary has "Try again" button for recovery. All pages handle useData errors with consistent error UI. Optional chaining added across all data access patterns.

---

## PHASE 2: Performance (High Impact)

### 2.1 Spending Data — The 12MB Problem
**Current:** `spending.json` (12.1 MB, 30,580 records) is loaded entirely into the browser on every visit to `/spending`. On a 3G connection this is a 40+ second load. All filtering/sorting/charting then runs on this full dataset in `useMemo`.
**Upgrade options (pick one or combine):**
- **Option A: Split + lazy-load** — Pre-split `spending.json` by financial year into ~4 files (3MB each). Load the current year by default, load others on demand.
- **Option B: Compressed JSON** — Gzip the JSON (12MB → ~1.5MB with gzip). GitHub Pages supports gzip if files are served with `.json.gz` and proper headers, or compress at build time.
- **Option C: Web Worker for filtering** — Move the `useMemo` filtering/sorting into a Web Worker so the main thread stays responsive during complex filters on 30K records.
- **Option D: Virtual scrolling** — Replace the paginated table with `@tanstack/react-virtual` for instant scroll through all records without DOM overhead.
- **Recommended:** B + C + D combined.

**Files affected:** `Spending.tsx`, `vite.config.js`, new `src/workers/spending.worker.ts`
**Opus 4.6 advantage:** Can reason about the data flow end-to-end (fetch → parse → filter → sort → render) and implement the Worker + virtual scroll without introducing race conditions.

### 2.2 Build Optimisation
**Current:** Manual chunks for `recharts` and `vendor` only. No analysis of actual bundle composition.
**Upgrade:**
- Add `rollup-plugin-visualizer` to audit real bundle sizes
- Add `vite-plugin-compression` for brotli/gzip pre-compression of all assets
- Consider replacing Recharts (~350KB) with a lighter alternative like `lightweight-charts` or `uplot` for simpler charts — or at minimum use tree-shaking imports (currently importing entire modules)
- Add `<link rel="preload">` for critical data files in `index.html`
- Implement service worker for offline capability and asset caching

### 2.3 Image Optimisation
**Current:** Article images in `public/images/articles/` are unoptimised JPGs. No responsive images, no lazy loading, no WebP.
**Upgrade:**
- Convert all images to WebP with JPEG fallback
- Add `loading="lazy"` to all article images
- Add `srcset` for responsive image sizes
- Consider using `vite-plugin-image-optimizer` for build-time compression

---

## PHASE 3: Functionality Upgrades

### 3.1 News/Articles System Overhaul ✅ DONE
**Status:** Articles moved to JSON data files. `articles-index.json` provides metadata per council. Individual article content in `articles/{id}.json`. `News.jsx` now loads from `useData('/data/articles-index.json')` with category filtering. Separate `ArticleView.jsx` at `/news/:articleId` loads individual articles on demand with DOMPurify HTML sanitisation, JSON-LD structured data, and reading time estimates. `mega_article_writer.py` generates articles via LLM pipeline. Social sharing (Twitter/Facebook/WhatsApp + copy link) and auto-generated table of contents for long articles added 9 Feb 2026. Rossendale articles (6) written covering all key spending stories.

**Article counts:** Burnley 44, Hyndburn 20, Pendle 19, Rossendale 6 = **89 total**.

**Remaining opportunities:**
- Markdown rendering support (currently HTML-only)
- Related articles suggestion at bottom of articles
- Article search/full-text search

### 3.2 URL State for Filters ✅ DONE
**Status:** `Spending.jsx` fully syncs all filter state to URL search params via `useSearchParams`. All 10 filter keys (financial_year, quarter, month, type, service_division, expenditure_category, capital_revenue, supplier, min_amount, max_amount), plus search query, sort field/direction, page, and pageSize are all URL-persisted. Uses `replaceState` to avoid polluting browser history. `SupplierView.jsx` links directly to `/spending?supplier=...`. Filtered views are fully bookmarkable and shareable.

### 3.3 Accessibility (a11y) — PARTIALLY DONE
**Completed:**
- ARIA labels on all page sections and landmarks
- Single `role="main"` on Layout's `<main>` element (removed duplicates from 8 page components)
- `aria-expanded` on expandable UI elements
- `aria-label` on charts and interactive components
- Alt text on all images (article images use article.title)
- `useRef` cleanup for setTimeout timers (prevents memory leaks on unmount)

**Remaining opportunities:**
- Keyboard navigation for custom dropdowns and tab controls
- Focus trap for mobile sidebar overlay
- Skip-to-content link
- `prefers-reduced-motion` media query
- `prefers-color-scheme` support (light theme option)
- Screen reader testing pass

### 3.4 SEO & Meta — MOSTLY DONE
**Completed:**
- Per-page `<title>` via `document.title` in useEffect on all pages
- `robots.txt` with Allow/Disallow rules (blocks `/data/`)
- `sitemap.xml` auto-generated at build time via Vite closeBundle hook (14 routes per council)
- JSON-LD structured data on ArticleView (NewsArticle + BreadcrumbList)
- Open Graph + Twitter Card meta on ArticleView (og:title, og:description, og:image, article:published_time, article:author)
- Per-article meta descriptions from article summary
- Preconnect hints in index.html

**Remaining opportunities:**
- OG tags on non-article pages (Spending, DOGE, Budgets, etc.)
- Per-page meta descriptions for non-article pages

### 3.5 FOI System ✅ DONE
**Status:** FOI templates written for all 4 councils: Burnley (11), Hyndburn (9), Pendle (9), Rossendale (12) = **41 total templates** across spending, governance, housing, and services categories. Each template has researched context, specific data requests, and references relevant legislation. FOI page includes success stories from East Lancashire, response tracking links (WhatDoTheyKnow, ICO), and submission guidance. Templates are council-specific, referencing actual suppliers (Capita, Liberata, Rapid Recruit) and real spending figures from the data.

### 3.6 Dark/Light Theme Toggle
**Current:** Dark-only theme. The CSS custom properties are well-structured, which makes this upgrade straightforward.
**Upgrade:**
- Add a `ThemeProvider` context
- Define light theme variables as an override set
- Add toggle button in sidebar
- Persist preference in `localStorage`
- Respect `prefers-color-scheme` as default

### 3.6 Offline / PWA Support
**Current:** No service worker, no manifest, no offline capability. The site is purely online.
**Upgrade:**
- Add `vite-plugin-pwa` for automatic service worker generation
- Cache all static assets and JSON data files
- Add web app manifest for "Add to Home Screen"
- Show offline indicator when network unavailable
- Particularly valuable since the data doesn't change frequently

---

## PHASE 4: Code Quality & Maintainability

### 4.1 Testing ✅ DONE
**Status:**
- **Unit tests:** Vitest with @testing-library/react. 141+ tests across 19 test files covering all pages, components, hooks, and utilities.
- **E2E tests:** Playwright with 9 smoke tests (Home, Spending, DOGE, About, Budgets, Cross-council, Navigation, 404 SPA fallback, No console errors).
- **Config:** vitest.config.js (jsdom environment, e2e excluded), playwright.config.js (Chromium, vite preview server).

**Remaining opportunities:**
- SearchableSelect interaction tests
- CSV export E2E test
- CI integration (run tests in GitHub Actions)

### 4.2 CSS Architecture
**Current:** Plain CSS with page-scoped class prefixes. No CSS Modules, no scoping mechanism. CSS custom properties are well-defined but some utility classes duplicate Tailwind-like patterns without the framework.
**Upgrade options:**
- **Option A: CSS Modules** — Rename all `.css` → `.module.css`. Zero runtime cost, guaranteed scoping, works with Vite out of the box.
- **Option B: Keep current approach** but audit for unused CSS, consolidate duplicated patterns, and extract repeated chart tooltip styles into a shared class.
- **Recommended:** Option A for new components, Option B for existing pages (lower risk).

### 4.3 Linting & Formatting
**Current:** ESLint configured but no Prettier, no pre-commit hooks, no formatting enforcement.
**Upgrade:**
- Add Prettier with a config file
- Add `lint-staged` + `husky` for pre-commit formatting
- Extend ESLint config for TypeScript (`@typescript-eslint`)
- Add `eslint-plugin-jsx-a11y` for accessibility linting

### 4.4 Clean Up Dead Code
**Current:** Empty `src/hooks/` and `src/styles/` directories. Duplicate Python scripts (`process_budgets.py` and `process_budgets_v2.py`). `@types/react` installed but TypeScript not configured.
**Upgrade:**
- Remove empty placeholder directories (or populate them)
- Consolidate Python scripts — remove v1 if v2 supersedes it
- Remove unused dependencies or justify their presence
- Add `.nvmrc` for Node version pinning

---

## PHASE 5: Infrastructure & DevOps

### 5.1 CI/CD Enhancement ✅ MOSTLY DONE
**Status:** deploy.yml now fully functional — automated zero-token deploys on push to main.
**Done:**
- ✅ Test step (`npm test`) runs before builds — fails fast if tests break
- ✅ Hub pages (404.html + index.html) copied to deploy root for SPA routing
- ✅ CNAME + robots.txt generated automatically
- ✅ Post-deploy verification (curl all 5 URLs)
- ✅ `paths-ignore` — docs-only changes skip expensive builds
- ✅ npm cache enabled for faster installs
- ✅ Node version from .nvmrc (not hardcoded)
- ✅ Live site verification in daily audit (check_live_site)
**Remaining:**
- Add Lighthouse CI for automated performance audits
- Add bundle size tracking (fail CI if bundle grows unexpectedly)
- Add PR preview deployments

### 5.2 Environment & Configuration
**Current:** Version `0.0.0` in package.json. No environment variables. No staging environment.
**Upgrade:**
- Set a real version number and adopt semver
- Add `.env` support for any configurable values (e.g., data file paths if they ever change)
- Consider a staging deployment (e.g., `staging.burnleycouncil.co.uk`) for previewing changes

### 5.3 Data Pipeline Integration
**Current:** Python scripts in the root directory process raw CSV files manually. No automation, no scheduling, no validation.
**Upgrade:**
- Add a `scripts/update-data.sh` that runs the Python pipeline end-to-end
- Add data validation step (schema check on output JSON)
- Add a GitHub Action to run the pipeline on a schedule or manual trigger
- Document the data update process in the repo (the `UPDATE_GUIDE.md` exists but may be outdated)

---

## Implementation Priority (Updated 9 Feb 2026)

| Priority | Phase | Status | Notes |
|---|---|---|---|
| ~~1~~ | ~~3.1 News system overhaul~~ | ✅ DONE | 89 articles, sharing, ToC, JSON-LD, OG tags |
| ~~2~~ | ~~1.2 Shared component library~~ | ✅ DONE | StatCard, ChartCard, LoadingState, etc. |
| ~~3~~ | ~~1.3 Data layer & caching~~ | ✅ DONE | useData hook, 30min TTL, LRU eviction |
| ~~4~~ | ~~1.4 Error handling~~ | ✅ DONE | Guarded wrappers, ErrorBoundary per route |
| ~~5~~ | ~~4.1 Testing~~ | ✅ DONE | 141+ unit tests, 9 E2E tests |
| ~~6~~ | ~~3.5 FOI system~~ | ✅ DONE | 41 templates across 4 councils, tracking, success stories |
| ~~7~~ | ~~3.4 SEO (articles)~~ | ✅ DONE | JSON-LD, OG tags, breadcrumbs, meta descriptions on articles |
| ~~8~~ | ~~3.2 URL state for filters~~ | ✅ DONE | useSearchParams — all filters, sort, page synced to URL |
| 9 | 2.1 Spending data (12MB fix) | **TODO** | Web Worker + virtual scroll + compression |
| 10 | 3.3 Accessibility (remaining) | **TODO** | Keyboard nav, focus trap, skip-to-content |
| 11 | 3.4 SEO (non-article pages) | **TODO** | OG tags + meta descriptions for Spending, DOGE, etc. |
| 12 | 1.1 TypeScript migration | **TODO** | JSX → TSX with strict types |
| 13 | 2.2 Build optimisation | **TODO** | Bundle analysis, Brotli compression |
| 14 | 3.6 Theme toggle | **TODO** | Light/dark with prefers-color-scheme |
| 15 | 4.2-4.4 Code quality | **TODO** | Prettier, lint-staged, CSS Modules |
| 16 | 5.1-5.3 Infrastructure | **PARTIAL** | Daily audit + CI. Missing: Lighthouse CI, PR previews |
| 17 | 3.7 PWA/offline | **TODO** | Service worker, offline indicator |

---

## Completed Scope (9 Feb 2026)

- **35+ files modified** across all page components, hooks, configs, workflows
- **30+ new files created** (test files, E2E specs, playwright config, robots.txt, Rossendale articles, FOI templates)
- **1 major rewrite completed** (News.jsx → article JSON system with ArticleView)
- **4 councils live** (Burnley, Hyndburn, Pendle, Rossendale)
- **89 articles published** (Burnley 44, Hyndburn 20, Pendle 19, Rossendale 6)
- **41 FOI templates** across 4 councils with council-specific research
- **Social sharing + ToC** on all article pages
- **FOI tracking + success stories** on FOI page
- **0 open issues from suggest_improvements.py** (was 34, now 0 medium/low)
- **0 breaking changes to the public URL structure**
