# Burnley Council Transparency Tool — Opus 4.6 Upgrade Plan

## Audit Summary

The current codebase is a well-built static React SPA (built on Opus 4.5) serving ~12MB of council financial data. It is competent but has clear structural ceilings that limit its ability to scale, perform, and maintain quality. This plan identifies every upgrade opportunity and maps each to specific Opus 4.6 capabilities.

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

### 1.2 Shared Component Library
**Current:** Every page reinvents UI patterns. There are at least 5 independent implementations of: stat cards, loading states, filter dropdowns, tab navigation, chart containers, and page headers.
**Upgrade:** Extract into `src/components/ui/`:
- `StatCard` — used on Home, Spending, Budgets
- `TabNav` — used on Spending, Budgets, Legal, News
- `ChartCard` — wrapper used on Home, Spending, Budgets (identical Recharts tooltip config repeated ~15 times)
- `PageHeader` — title + subtitle + actions pattern on every page
- `SearchableSelect` — currently defined inside `Spending.jsx`, should be shared
- `LoadingState` — skeleton/shimmer loader (currently inline `<div>Loading...</div>`)
- `Badge` — multiple badge implementations across pages
- `Pagination` — currently only in Spending, could be reused
- `ErrorBoundary` — does not exist, should wrap every route

**Opus 4.6 advantage:** Can trace identical patterns across all 9 page files simultaneously and extract the exact minimal shared API for each component.

### 1.3 Data Layer & Caching
**Current:** Every page independently `fetch()`es JSON in `useEffect`. If you navigate Home → Spending → Home, `insights.json` is fetched twice. The 12MB `spending.json` is re-fetched every time you visit `/spending`.
**Upgrade:**
- Create `src/hooks/useData.ts` — a custom hook with an in-memory cache (simple `Map` or module-level singleton)
- Or adopt a lightweight library like `swr` (~4KB) or `@tanstack/react-query` for automatic caching, deduplication, and stale-while-revalidate
- Shared data context for cross-page data (insights appear on Home and are useful on Spending)
- Preload critical data in `App.tsx` layout level

**Files affected:** `App.jsx`, all 8 page files, new `src/hooks/useData.ts`

### 1.4 Error Handling
**Current:** Zero error boundaries. Any rendering error in a chart or data transformation crashes the entire app with a white screen. `catch` blocks just `console.error`.
**Upgrade:**
- Add React `ErrorBoundary` component wrapping each route
- Add error state UI (not just `console.error`) — show user-friendly error messages
- Add data validation at fetch time (guard against malformed JSON)
- Add `window.onerror` / `unhandledrejection` handlers for global error tracking

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

### 3.1 News/Articles System Overhaul
**Current:** `News.jsx` is the single worst architectural decision in the project — it contains all article content as HTML template literals hardcoded directly in the component file. The file is so large it exceeds 25,000 tokens. Adding a new article means editing this massive JSX file.
**Upgrade:**
- Move articles to `public/data/articles/` as individual JSON or Markdown files
- Create `src/types/Article.ts` interface
- Build an article index (`articles-index.json`) with metadata (id, title, date, category, summary, image)
- Load article list from index, load full content on demand
- Add individual article routes: `/news/:articleId` instead of all articles on one page
- Add share buttons, reading time estimates, table of contents for long articles
- Support Markdown rendering (add `react-markdown` ~12KB)

**Files affected:** `News.tsx` (complete rewrite), `App.tsx` (add route), new data files
**Opus 4.6 advantage:** Can restructure the entire article system — data model, routing, component architecture, and content migration — as a coherent unit.

### 3.2 URL State for Filters
**Current:** All filter state on the Spending page lives in `useState`. Refreshing the page loses all filters. You can't share a filtered view via URL. The Home page has links like `/spending?supplier=LIBERATA` but nothing reads these query params.
**Upgrade:**
- Sync all filter state to URL search params using `useSearchParams` from React Router
- Read initial filter values from URL on mount
- Update URL as filters change (use `replaceState` to avoid polluting history)
- This makes filtered views bookmarkable and shareable

**Files affected:** `Spending.tsx`, `Budgets.tsx`

### 3.3 Accessibility (a11y)
**Current:** Minimal accessibility. The `SearchableSelect` dropdown has no ARIA attributes, no keyboard navigation, no `role="listbox"`. Tables lack proper scope attributes. Charts have no text alternatives. Focus management on mobile menu is missing.
**Upgrade:**
- Add ARIA roles and attributes to all interactive components (`SearchableSelect`, tabs, modals)
- Add keyboard navigation to custom dropdowns and tab controls
- Add `aria-label` and `aria-describedby` to charts
- Add skip-to-content link
- Add focus trap for mobile sidebar overlay
- Test with screen reader and keyboard-only navigation
- Add `prefers-reduced-motion` media query to disable animations
- Add `prefers-color-scheme` support (currently dark-only, which is an a11y concern for users who need high contrast or light backgrounds)

### 3.4 SEO & Meta
**Current:** Basic meta tags in `index.html`. No per-page titles, no per-page meta descriptions, no Open Graph tags for individual pages.
**Upgrade:**
- Add `react-helmet-async` or use React 19's built-in `<title>` support
- Set unique `<title>` and `<meta description>` per route
- Add Open Graph and Twitter Card meta per page
- Add structured data (JSON-LD) for articles and datasets
- Generate a `sitemap.xml` at build time
- Add `robots.txt`

### 3.5 Dark/Light Theme Toggle
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

### 4.1 Testing
**Current:** Zero tests. No test runner, no test files, no test configuration.
**Upgrade:**
- Add Vitest (native Vite integration, fast)
- Add `@testing-library/react` for component tests
- Add `@testing-library/user-event` for interaction tests
- Priority test targets:
  1. `format.ts` utilities — pure functions, easy to test, high value
  2. `SearchableSelect` — complex interactive component
  3. `Spending` page filtering logic — extract filter logic to a testable function
  4. Data loading hooks — test caching and error states
  5. Routing — test that all routes render without crashing
- Add Playwright for E2E smoke tests (all pages load, spending filter works, CSV export works)
- Add test script to `package.json` and CI workflow

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

### 5.1 CI/CD Enhancement
**Current:** Single GitHub Actions workflow that builds and deploys. No linting, no testing, no type checking in CI.
**Upgrade:**
- Add lint step (`npm run lint`)
- Add type-check step (`tsc --noEmit`)
- Add test step (`npm test`)
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

## Implementation Priority

| Priority | Phase | Effort | Impact |
|---|---|---|---|
| 1 | 2.1 Spending data (12MB fix) | Medium | Removes the single biggest UX problem |
| 2 | 3.1 News system overhaul | Medium | Unblocks content scalability, fixes the worst architectural debt |
| 3 | 1.2 Shared component library | Medium | Reduces duplication, speeds up future development |
| 4 | 1.3 Data layer & caching | Low | Prevents redundant network requests, improves nav speed |
| 5 | 3.2 URL state for filters | Low | Makes spending explorer shareable and bookmarkable |
| 6 | 1.1 TypeScript migration | High | Foundation for long-term maintainability |
| 7 | 1.4 Error handling | Low | Prevents white-screen crashes |
| 8 | 3.3 Accessibility | Medium | Legal compliance (Equality Act 2010), ethical obligation |
| 9 | 4.1 Testing | Medium | Safety net for all future changes |
| 10 | 3.4 SEO & meta | Low | Improves discoverability |
| 11 | 2.2 Build optimisation | Low | Faster loads, smaller bundles |
| 12 | 3.5 Theme toggle | Low | Accessibility improvement |
| 13 | 4.2-4.4 Code quality | Low | Developer experience |
| 14 | 5.1-5.3 Infrastructure | Medium | Automation and reliability |
| 15 | 3.6 PWA/offline | Low | Nice-to-have for repeat visitors |

---

## Estimated Scope

- **~20 files modified** (every existing source file)
- **~10 new files created** (types, hooks, workers, tests, configs)
- **1 major rewrite** (News.jsx → article system)
- **1 major refactor** (Spending.jsx → Web Worker + virtual scroll)
- **0 breaking changes to the public URL structure** (all routes preserved)
