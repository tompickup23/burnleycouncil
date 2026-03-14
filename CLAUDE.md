# AI DOGE — Claude Code Project Guide

## What This Is

Multi-council public spending transparency platform for Lancashire. React SPA deployed per-council via GitHub Pages at aidoge.co.uk.

**All 15 Lancashire councils live:**
- East Lancashire: Burnley (30,580 txns, £355M), Hyndburn (29,804 txns, £211M), Pendle (49,741 txns, £125M), Rossendale (42,536 txns, £64M)
- Central/South: Lancaster (32,574 txns, £184M), Ribble Valley (13,723 txns, £38M), Chorley (21,421 txns, £365M), South Ribble (18,517 txns, £177M)
- Fylde Coast/West: Preston (46,711 txns, £205M), West Lancashire (43,063 txns, £333M), Wyre (51,092 txns, £678M), Fylde (37,514 txns, £155M)
- County: Lancashire CC (753,220 txns, £3.6B — spending via v4 monthly chunks)
- Unitary: Blackpool (630,914 txns, £4.1B — spending via v4 monthly chunks), Blackburn with Darwen (492,973 txns, £1.7B — spending via v4 monthly chunks)

**Total: 2,361,000+ transactions, £12.9 billion+ tracked**

## Architecture

- **Frontend:** React 19 + Vite 7, lazy-loaded routes, config-driven per council, Web Worker for spending data
- **Data layer 1:** Council CSV spending data → `council_etl.py` → `spending.json` + year-chunked `spending-index.json` + `spending-YYYY-YY.json` (v3) or monthly `spending-YYYY-MM.json` (v4)
- **Data layer 2:** GOV.UK MHCLG standardised budgets → `govuk_budgets.py` → `budgets_govuk.json`
- **Analysis:** `doge_analysis.py` — duplicates, split payments, CH compliance, Benford's Law, cross-council pricing, weak competition, category monopolies, supplier concentration, fraud triangle
- **Deprivation:** `deprivation_etl.py` — IMD 2019 ward-level data from MHCLG + ONS ArcGIS
- **Demographics:** `census_etl.py` — Census 2021 ward-level age, sex, ethnicity, religion, country of birth, economic activity from ONS Nomis API (CSV format)
- **Elections:** `elections.json` per council — ward-level history, predictions, coalition modelling. `elections_reference.json` shared national polling data. `electionModel.js` with demographics-weighted swing model + LGR political projections
- **Constituencies:** `constituency_etl.py` → `constituencies.json` — GE2024 results, MP expenses (IPSA), voting records (TWFY), claimant count, activity topics. `ward_constituency_map.json` links wards to constituencies
- **Analytics:** `src/utils/analytics.js` — CPI-H deflation, z-scores, Gini coefficient, Benford's 2nd digit, reserves adequacy, peer benchmarking, integrity-weighted HHI, Benford→election signal (16 functions, 44 tests)
- **LGR Demographic Fiscal Intelligence:** `generate_lgr_enhanced.py` → `lgr_enhanced.json` (shared) + `demographic_fiscal.json` (per council). Fiscal resilience scoring, SEND exposure by ethnic composition, asylum cost projections, white flight analysis, Bradford/Oldham comparison. 6 LGR sub-components + 11 model functions. Flows through LGR Tracker, DOGE, Demographics, MyArea, CrossCouncil, Home, PropertyDetail.
- **Highways:** `roadworks_etl.py` + `traffic_etl.py` → `roadworks.json` + `traffic.json`. LCC MARIO ArcGIS roadworks, DfT traffic counts, JCI model, deferral recommendations, s59 clash detection. `HighwaysMap.jsx` (direct Leaflet) + `Highways.jsx` page with legal framework from `highways_legal.json`
- **Councillor Profiling:** `councillor_research_etl.py` → `councillor_profiles.json` — DOB, occupation, biography, structured employment/land/securities, committee memberships, electoral history (NOT YET RUN)
- **FOI Generation:** `foi_generator.py` — auto-generate FOI requests from DOGE anomalies + integrity findings (NOT YET RUN)
- **Auth:** Firebase Auth (free tier, 50K MAUs) + Firestore RBAC. Dual-mode: Firebase in production (`VITE_FIREBASE_API_KEY` set), PasswordGate for local dev. 8 hierarchical roles: unassigned(0), public(1), councillor(2), champion(3), lead_member(4), cabinet_member(5), leader(6), admin(7). Per-council/page/constituency/portfolio permissions. Backward compat: viewer→public, strategist→councillor.
- **Cabinet Command:** `cabinet_portfolios.json` → `savingsEngine.js` → Executive/CabinetDashboard/PortfolioDetail pages. 10 LCC portfolios with budget mapping, savings levers, statutory duties, governance routing. Prescriptive ACTION DIRECTIVES: DO/SAVE/LEGAL/ROUTE/HOW/EVIDENCE format. LCC-only (gated by `cabinet_portfolios` config flag).
- **Hosting:** GitHub Pages (free), custom domain aidoge.co.uk
- **Servers:** vps-news (Oracle x86, 1GB RAM, free), vps-main (Hostinger KVM8, 32GB RAM, £22/mo), 2x AWS t3.micro (free trial until Jul 2026)

## Key Build Commands

Builds MUST be sequential (shared `public/data/` causes race conditions):

```bash
# Deploy is AUTOMATIC — just push to main and deploy.yml handles everything.
# Manual commands below are for local testing only.

# Build single council for dev
VITE_COUNCIL=burnley VITE_BASE=/burnleycouncil/ npx vite build

# Manual build all 15 councils (if CI/CD is down)
rm -rf /tmp/lancashire-deploy
for entry in burnley:burnleycouncil hyndburn:hyndburncouncil pendle:pendlecouncil rossendale:rossendalecouncil lancaster:lancastercouncil ribble_valley:ribblevalleycouncil chorley:chorleycouncil south_ribble:southribblecouncil lancashire_cc:lancashirecc blackpool:blackpoolcouncil west_lancashire:westlancashirecouncil blackburn:blackburncouncil wyre:wyrecouncil preston:prestoncouncil fylde:fyldecouncil; do
  ID="${entry%%:*}"; SLUG="${entry##*:}"
  VITE_COUNCIL=$ID VITE_BASE=/$SLUG/ npx vite build --outDir /tmp/lancashire-deploy/$SLUG
done

# Hub pages + CNAME (deploy.yml does this automatically)
cp burnley-council/hub/index.html /tmp/lancashire-deploy/index.html
cp burnley-council/hub/404.html /tmp/lancashire-deploy/404.html
echo 'aidoge.co.uk' > /tmp/lancashire-deploy/CNAME
cp public/robots.txt /tmp/lancashire-deploy/robots.txt

# Manual deploy (only if CI/CD is down)
npx gh-pages -d /tmp/lancashire-deploy --repo https://github.com/tompickup23/lancashire.git --no-history
```

## Key File Locations

### Frontend (React SPA)
| File | Purpose |
|------|---------|
| `src/App.jsx` | Router with 41 lazy-loaded routes, 44 routes total |
| `src/pages/` | 39 page components + 52 test files (Spending, Budgets, DOGE, News, Elections, Constituencies, MPComparison, Integrity, Intelligence, Strategy, CouncillorDossier, PropertyPortfolio, PropertyDetail, LGRTracker, Demographics, Highways, Housing, Crime, Health, Economy, Executive, CabinetDashboard, PortfolioDetail, etc.) |
| `src/components/` | Shared UI components (Layout, ChartCard, StatCard, CouncillorLink, SupplierLink, EvidenceChain, IntegrityBadge, NetworkGraph, WardMap, HighwaysMap, GlobalSearch, Breadcrumb, DataFreshnessStamp, etc.) |
| `src/context/CouncilConfig.jsx` | Council-specific config context provider |
| `src/context/AuthContext.jsx` | Firebase auth state, Firestore RBAC, 8-level hierarchical roles, portfolio permissions |
| `src/firebase.js` | Firebase app init (only when VITE_FIREBASE_API_KEY set) |
| `src/components/AuthGate.jsx` | Login/register UI (Google, Apple, Facebook, email/password) |
| `src/components/AdminPanel.jsx` | User management: 8-role picker, portfolio assignment, council/page toggles |
| `src/components/ProtectedRoute.jsx` | Route-level permission checks (council, page, minRole hierarchy) |
| `firestore.rules` | Firestore security rules (user reads own doc, admin reads all) |
| `src/hooks/useData.js` | Data fetching hook (loads from /data/*.json) |
| `src/hooks/useSpendingWorker.js` | Web Worker hook for spending data (v3 chunked + v2/v1 fallback) |
| `src/hooks/useCountUp.js` | rAF animated number counters (easeOutExpo, prefers-reduced-motion safe) |
| `src/hooks/useReveal.js` | IntersectionObserver scroll-triggered reveals (JSDOM-safe fallback) |
| `src/workers/spending.worker.js` | Web Worker: filter, sort, paginate, stats, charts, CSV export |
| `src/utils/constants.js` | Shared constants: CHART_COLORS, TYPE_LABELS, TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE, SEVERITY_COLORS, COUNCIL_COLORS, CHART_ANIMATION, COLOR_SCALES, useReducedMotion |
| `src/components/ui/SparkLine.jsx` | Inline SVG mini chart for tables/cards |
| `src/components/ui/GaugeChart.jsx` | Radial arc gauge for scores (fraud triangle, reserves, integrity) |
| `src/components/ui/TreemapChart.jsx` | Recharts Treemap wrapper with glass-morphism tooltips |
| `src/components/ui/WaterfallChart.jsx` | Revenue/expense waterfall (stacked BarChart technique) |
| `src/components/ui/HeatmapGrid.jsx` | GitHub-style day/week grid (spending calendar, voting record) |
| `src/components/ui/BumpChart.jsx` | Ranking changes over time (inverted Y-axis LineChart) |
| `src/components/ui/ChartTooltip.jsx` | Rich custom tooltip with glass-morphism styling |
| `src/components/ui/ChartGradient.jsx` | Parametric SVG gradient definition for Recharts |
| `src/components/ui/ChartGradients.jsx` | Preset named SVG gradients for common chart fills |
| `src/components/map/MapIcons.js` | SVG marker icon factory (7 types, severity-based coloring, pulse animation) |
| `src/components/map/MapIcons.css` | SVG marker animations and styling |
| `src/utils/savingsEngine.js` | Cabinet Command engine: centralised savings model, portfolio-spending mapping, prescriptive directives (DO/SAVE/LEGAL/ROUTE), decision pathways, reform playbooks, MTFS comparison, political impact, benchmarking. Tier 2: integrity-weighted HHI, CIPFA resilience, Benford screening, policy-area tagging, council attack lines, ward entrenchment, portfolio risk dashboard. Politics engine: Reform PR narrative (reformNarrativeEngine), electoral ripple (electoralRippleAssessment), borough election awareness, scrutiny premium, ward archetype targeting, REFORM_REBUTTALS matching, constituency resonance (29 functions, 127 tests) |
| `src/utils/analytics.js` | Shared analytics engine: CPI-H deflation, z-scores, Gini, Benford's 2nd digit, reserves adequacy, integrity-weighted HHI |
| `src/utils/lgrModel.js` | LGR economic model: cashflow, sensitivity, tornado, NPV, demographic fiscal risk, SEND exposure, asylum impact, timeline feasibility, property division (22 functions, 53 tests) |
| `src/utils/electionModel.js` | Election prediction model: ward-level swing, national polling, demographics-weighted |
| `src/workers/spending.utils.js` | Pure utility functions shared by worker and tests |
| `vite.config.js` | Build config with councilDataPlugin() for multi-council parameterisation |
| `index.html` | Template with %PLACEHOLDER% tokens replaced at build time |
| `src/components/lgr/` | LGR sub-components: LGRDemographicFiscalRisk, LGRTimelineChaos, LGRBoundaryMap, LGRDeprivationMap, LGRPropertyDivision, LGRCCAImpact (6 components + 6 test files) |
| `e2e/` | Playwright E2E tests: smoke, news, spending, legal, navigation, elections (49 tests, 6 files) |
| `src/**/*.test.{js,jsx}` | Unit tests: 2,584 tests across 53 files (vitest) |

### Data Pipeline (Python)
| File | Purpose |
|------|---------|
| `burnley-council/scripts/council_etl.py` | Main ETL: CSV → spending.json, CH enrichment, crime stats |
| `burnley-council/scripts/doge_analysis.py` | DOGE analysis: duplicates, splits, CH compliance, Benford's, cross-council |
| `burnley-council/scripts/govuk_budgets.py` | GOV.UK budget data fetch and parse |
| `burnley-council/scripts/govuk_trends.py` | Revenue trend analysis |
| `burnley-council/scripts/police_etl.py` | Police crime stats API |
| `burnley-council/scripts/procurement_etl.py` | Contracts Finder API → procurement.json per council |
| `burnley-council/scripts/deprivation_etl.py` | IMD 2019 ward-level deprivation from MHCLG + ONS ArcGIS |
| `burnley-council/scripts/census_etl.py` | Census 2021 demographics from ONS Nomis API (age, sex, ethnicity, religion, CoB, econ) |
| `burnley-council/scripts/councillors_etl.py` | ModernGov scraper → councillors.json, politics_summary.json, wards.json |
| `burnley-council/scripts/fts_etl.py` | Find a Tender Service ETL scaffold (needs CDP API key) |
| `burnley-council/scripts/charity_etl.py` | Charity Commission API cross-check for council suppliers |
| `burnley-council/scripts/councillor_integrity_etl.py` | 28-detection councillor integrity: CH directorships, co-directors, EC donations, FCA, insolvency, cross-council + v6: electoral, committee, register, DOGE, temporal, supplier profile, former councillor |
| `burnley-council/scripts/councillor_research_etl.py` | Councillor profiling ETL → councillor_profiles.json (DOB, occupation, committees, employment, electoral history) — NOT YET RUN |
| `burnley-council/scripts/foi_generator.py` | Auto-generate FOI requests from DOGE anomalies + integrity findings → foi_templates.json — NOT YET RUN |
| `burnley-council/scripts/register_of_interests_etl.py` | ModernGov register of interests scraper → register_of_interests.json per council |
| `burnley-council/scripts/meetings_etl.py` | ModernGov meetings scraper → meetings.json per council (11 councils, 280 meetings). Enhanced: document URLs, classification, minutes detection |
| `burnley-council/scripts/council_documents_etl.py` | ModernGov PDF download → text extraction → LLM analysis → SQLite → council_documents.json (11 councils, 392 decisions) |
| `burnley-council/scripts/votes_attendance_etl.py` | ModernGov recorded votes scraper → voting.json per council (11 councils). LLM enrichment: political summaries, council tax impact, key facts |
| `burnley-council/scripts/political_history_etl.py` | Generate ward-level political history from elections.json → political_history.json (15 councils) |
| `burnley-council/scripts/wargame_pipeline.py` | Meeting briefing generation from ModernGov documents + LLM analysis → meeting_briefings.json |
| `burnley-council/scripts/generate_budgets_from_govuk.py` | Auto-generate budgets.json from GOV.UK outturn data (13 councils, skips hand-curated Burnley/Hyndburn) |
| `burnley-council/scripts/budget_mapper.py` | Map AI DOGE spending departments → GOV.UK SeRCOP categories → budget_mapping.json |
| `burnley-council/scripts/collection_rates_etl.py` | GOV.UK QRC4 council tax collection rates → collection_rates.json (14 billing authorities) |
| `burnley-council/scripts/constituency_etl.py` | TWFY/IPSA → constituencies.json (MPs, GE2024, expenses, votes, activity) |
| `burnley-council/scripts/ipsa_etl.py` | IPSA MP expenses data extraction |
| `burnley-council/scripts/elections_etl.py` | Election data compilation → elections.json per council |
| `burnley-council/scripts/poll_aggregator.py` | National polling data aggregation → polling.json |
| `burnley-council/scripts/property_assets_etl.py` | Codex CSV enrichment → property_assets.json + property_assets_detail.json (CED mapping via shapely) |
| `burnley-council/scripts/hmo_etl.py` | HMO register scraper → hmo.json per council (multi-source: ASP.NET, XLSX, PDF, planning extraction) |
| `burnley-council/scripts/planning_etl.py` | PlanIt API scraper → planning.json per council (applications, decisions, ward mapping) |
| `burnley-council/scripts/housing_etl.py` | Census 2021 housing data (tenure, accommodation, overcrowding, bedrooms, household size) → housing.json per council |
| `burnley-council/scripts/health_etl.py` | Fingertips API + Census 2021 (health, disability, unpaid care) → health.json per council |
| `burnley-council/scripts/economy_etl.py` | Nomis Claimant Count + ASHE earnings + Census 2021 (industry, occupation, hours) → economy.json per council |
| `burnley-council/scripts/ward_boundaries_etl.py` | ONS ArcGIS ward boundary GeoJSON → ward_boundaries.json per council |
| `burnley-council/scripts/ward_constituency_map.py` | ONS ward-to-constituency lookup → ward_constituency_map.json |
| `burnley-council/scripts/calibrate_model.py` | Election model calibration using LCC 2025 results |
| `burnley-council/scripts/lgr_financial_model.py` | LGR financial modelling + savings calculations |
| `burnley-council/scripts/lgr_budget_model.py` | LGR budget model: council tax harmonisation per LGR proposal |
| `scripts/generate_lgr_enhanced.py` | LGR demographic fiscal intelligence: lgr_enhanced.json + 15× demographic_fiscal.json |
| `burnley-council/scripts/llm_router.py` | Multi-LLM router: Gemini Flash → Mistral Small → Cerebras → Groq failover. API keys via env vars only |
| `scripts/generate_cross_council.py` | Cross-council comparison data (collection rates, dependency ratio, reserves, HHI) |
| `scripts/generate_service_gaps.py` | Service gap analysis for LGR |
| `scripts/academic_export.py` | Academic export: panel dataset, LGR model inputs, cross-council efficiency CSVs |
| `scripts/daily_audit.py` | Daily automated code quality/data audit (runs via GitHub Actions) |
| `scripts/suggest_improvements.py` | Auto-scan for code issues → IMPROVEMENTS.md |
| `burnley-council/scripts/article_pipeline.py` | Fully automated article generation: 20+ topic templates (quarterly keys), Mistral free tier, lockfile, token budget (50K/day), numerical fact verification, auto-tagging, git push |
| `burnley-council/scripts/build_council.sh` | Shell wrapper for building a specific council |
| `scripts/setup_uptimerobot.sh` | Create UptimeRobot monitors for all council sites (requires API key) |
| `scripts/vps_backup.sh` | Weekly rsync backup of vps-main + vps-news to local machine |

### Highways ETL Scripts (on tompickup.co.uk repo: `/Users/tompickup/tompickup.co.uk/scripts/`)
| File | Purpose |
|------|---------|
| `highways_config.json` | Config-driven parameters for all 12 Lancashire districts (bbox, sport venues, schools, corridors, junctions) |
| `roadworks_etl.py` | Lancashire-wide roadworks from LCC MARIO ArcGIS → roadworks.json (1,722 works, 12 districts, dedup, severity sort) |
| `traffic_etl.py` | Traffic intelligence: DfT AADF, OSM signals, JCI model, deferral recommendations, s59 clash detection → traffic.json |
| `lcc_highways_etl.py` | LCC road status, road works lines, planning applications from ArcGIS → lcc_highways.json |

### News Lancashire Scripts (on vps-news: `/home/ubuntu/newslancashire/scripts/`)
| File | Purpose |
|------|---------|
| `ai_rewriter.py` | Batch rewrite article summaries via LLM (Gemini → Groq → Kimi → DeepSeek) |
| `ai_analyzer.py` | AI analysis of high-interest articles |
| `digest/ai_digest_generator.py` | Generate borough + category digests |
| `llm_rate_limiter.py` | File-based daily rate limiter — tracks requests + tokens per provider |
| `crawler_v3.py` | RSS/Bluesky/Google News crawling, SQLite storage |
| `export_json.py` | Export SQLite → JSON for Hugo site |
| `generate_hugo_content.py` | Generate Hugo markdown from JSON |

### Data Files (per council: `burnley-council/data/{council_id}/`)
| File | Generated By | Notes |
|------|-------------|-------|
| `spending.json` | council_etl.py | Core transaction data (15-40MB, v2 format) |
| `spending-index.json` | council_etl.py | v3/v4 manifest + filterOptions (~110-310KB, gitignored) |
| `spending-YYYY-YY.json` | council_etl.py | v3 year-chunked records (~4-8MB each, gitignored) |
| `spending-YYYY-MM.json` | council_etl.py | v4 monthly-chunked stripped records (0.02-18MB each, gitignored) |
| `config.json` | Manual | Controls features, branding, navigation |
| `procurement.json` | procurement_etl.py | Contracts Finder procurement notices |
| `doge_findings.json` | doge_analysis.py | Analysis findings for DOGE page |
| `doge_verification.json` | doge_analysis.py | Self-verification scores |
| `budgets.json` | generate_budgets_from_govuk.py / manual | Full budget data: revenue, capital, treasury, insights. Hand-curated (Burnley/Hyndburn) or auto-generated (13 others) |
| `budgets_govuk.json` | govuk_budgets.py | GOV.UK MHCLG Revenue Outturn data (multi-year service expenditure) |
| `budget_mapping.json` | budget_mapper.py | Spending→budget category mapping + coverage % |
| `budget_efficiency.json` | budget_mapper.py | Forensic analysis per budget category (HHI, duplicates, round numbers) |
| `budgets_summary.json` | govuk_budgets.py | Summary: reserves, council tax Band D, key ratios |
| `budget_insights.json` | budget_mapper.py | Cross-cutting budget insights and anomalies |
| `articles-index.json` | article_pipeline.py / manual | Article listings (auto-generated daily via cron) |
| `foi_templates.json` | Manual per council | FOI request templates |
| `revenue_trends.json` | govuk_trends.py | GOV.UK revenue data |
| `deprivation.json` | deprivation_etl.py | Ward-level IMD 2019 deprivation data |
| `supplier_profiles.json` | generate_supplier_profiles.py | Supplier deep dives |
| `councillors.json` | councillors_etl.py / manual | Councillor data (name, ward, party, contact) |
| `politics_summary.json` | councillors_etl.py / manual | Party seat counts, coalition info, majority threshold |
| `wards.json` | councillors_etl.py / manual | Ward→councillors mapping with party colours |
| `integrity.json` | councillor_integrity_etl.py | 28-detection councillor integrity scoring (CH, EC, FCA, co-directors, familial + v6 detections) |
| `councillor_profiles.json` | councillor_research_etl.py | Councillor profiling data (DOB, occupation, committees, employment, electoral history) — NOT YET GENERATED |
| `register_of_interests.json` | register_of_interests_etl.py | ModernGov register data (companies, employment, securities, land) |
| `meetings.json` | meetings_etl.py | Council meetings (title, date, committee, venue, agenda/minutes + document URLs) |
| `cabinet_portfolios.json` | Manual | 10 LCC cabinet portfolios: members, officers, budgets, spending patterns, statutory duties, savings levers (tier/owner fields), demand pressures, key contracts, operational context, cross-portfolio dependencies, governance, MTFS targets — LCC only |
| `council_documents.json` | council_documents_etl.py | LLM-analysed council decisions from PDF minutes/reports (11 councils, 392 decisions) |
| `voting.json` | votes_attendance_etl.py | Recorded votes per councillor + LLM-enriched political summaries (11 councils) |
| `political_history.json` | political_history_etl.py | Ward-level political history for strategy engine (15 councils) |
| `elections.json` | elections_etl.py / manual | Ward-level election history, current holders, upcoming elections |
| `constituencies.json` | constituency_etl.py | Parliamentary constituency data: GE2024, MP expenses, votes, activity |
| `ward_boundaries.json` | ward_boundaries_etl.py | Ward/division boundary GeoJSON (ONS ArcGIS BSC polygons + centroids) |
| `ward_constituency_map.json` | ward_constituency_map.py | ONS ward-to-constituency lookup |
| `collection_rates.json` | collection_rates_etl.py | Council tax collection rates (5-year history, billing authorities only) |
| `planning.json` | planning_etl.py | Planning applications from PlanIt API (applications, decisions, ward mapping) |
| `hmo.json` | hmo_etl.py | HMO register data (licensed HMOs, planning apps, ward-level density) — 7 councils |
| `property_assets.json` | property_assets_etl.py | Lean property listing (1,200 assets, 28 core fields each) — LCC only |
| `property_assets_detail.json` | property_assets_etl.py | Full enriched property data (EPC, deprivation, spend, disposal, co-location) — LCC only |
| `demographic_fiscal.json` | generate_lgr_enhanced.py | Per-council fiscal resilience score, service demand, SEND risk, asylum impact, threats, pressure zones |
| `roadworks.json` | roadworks_etl.py | Lancashire-wide roadworks (used by AI DOGE Highways page when highways:true in config) |
| `traffic.json` | traffic_etl.py | Traffic intelligence: JCI model, deferrals, s59 clashes (used by AI DOGE Highways page) |
| `housing.json` | housing_etl.py | Census 2021 housing data: tenure, accommodation type, overcrowding, bedrooms, household size — ward-level |
| `health.json` | health_etl.py | Fingertips indicators (life expectancy, mortality, obesity) + Census health/disability/unpaid care — ward-level |
| `economy.json` | economy_etl.py | Claimant count (LA history + ward latest), ASHE earnings, Census industry/occupation/hours — ward-level |
| `standing_orders.json` | Manual | Full Council procedural rules: time limits, motions, amendments, debate rules, voting, chair powers, tactical summaries — LCC only |

### Highways Data (on tompickup.co.uk: `public/data/`)
| File | Generated By | Notes |
|------|-------------|-------|
| `roadworks.json` | roadworks_etl.py | Lancashire-wide roadworks: 1,722 works, 12 districts, dedup, per-district stats (1.5MB) |
| `traffic.json` | traffic_etl.py | Traffic intelligence: 1,011 DfT count points, 2,001 junctions, JCI model, deferrals, s59 clashes, heatmap (1.5MB) |
| `lcc_highways.json` | lcc_highways_etl.py | Road status + planning apps from LCC ArcGIS |

### Shared Data (`burnley-council/data/shared/`)
| File | Purpose |
|------|---------|
| `legal_framework.json` | 23 UK council oversight laws (expanded in v6 from 12) |
| `hansard_cross_reference.json` | Hansard parliamentary debate cross-reference data |
| `lgr_tracker.json` | LGR Tracker data: proposals, financial models, demographics, political analysis |
| `lgr_budget_model.json` | Pre-computed council tax harmonisation Band D rates per LGR model |
| `elections_reference.json` | National polling data, LCC 2025 results, model parameters for election predictions |
| `polling.json` | National polling aggregation (latest polls, weighted averages) |
| `integrity_cross_council.json` | Cross-council councillor integrity comparison (conflict type classification) |
| `lgr_enhanced.json` | generate_lgr_enhanced.py | LGR demographic fiscal intelligence: per-model authority profiles, SEND exposure, asylum impact, timeline analysis, property division (~150KB) |
| `highways_legal.json` | Manual | NRSWA 1991, TMA 2004, Highways Act 1980, SI 2025/1074, CoP 6th Ed — restriction classifications, s59 thresholds |

## Critical Rules

1. **Never edit spending.json manually** — it's generated by council_etl.py
2. **Never edit doge_findings.json manually** — it's generated by doge_analysis.py
3. **Never edit integrity.json manually** — it's generated by councillor_integrity_etl.py
4. **Never edit auto-generated budgets.json** — for 13 councils, generated by `generate_budgets_from_govuk.py`. Only Burnley/Hyndburn have hand-curated budgets.json from budget book PDFs
5. **Builds must be sequential** — the vite plugin copies data to shared `public/data/`
6. **config.json is the source of truth** for council features (what pages show in nav, etc.)
7. **Data in public/ is ephemeral** — copied from burnley-council/data/ at build time, gitignored
8. **No API keys in code** — use environment variables
9. **Clawdbot config lives on vps-main only** — at `/opt/clawdbot/` and `/root/clawd/`. No agent config files in this repo.
10. **supplier_profiles.json files are huge** (~15MB/629K lines each) — only Rossendale's is committed to git. Suppliers nav gated by `supplier_profiles` data source flag in config.json
11. **Don't commit .json data files casually** — spending.json, supplier_profiles.json, doge_findings.json etc. are large generated files. Only commit when data has actually changed. spending-index.json, spending-YYYY-YY.json, and spending-YYYY-MM.json are gitignored (generated by ETL).
12. **Test builds before committing** — `VITE_COUNCIL=burnley VITE_BASE=/ npx vite build` should exit 0

## SSH Hosts (configured in ~/.ssh/config)

| Alias | Host | User | Key |
|-------|------|------|-----|
| `vps-news` | 141.147.79.228 | ubuntu | ~/.ssh/vps-news.key |
| `vps-main` | 46.202.140.7 | root | ~/.ssh/id_ed25519 |
| `aws-1` | 51.20.51.127 | ubuntu | ~/.ssh/aws-1.pem |
| `aws-2` | 56.228.32.194 | ubuntu | ~/.ssh/aws-2.pem |

## How Multi-Council Works

`vite.config.js` contains `councilDataPlugin()` which:
1. Reads `VITE_COUNCIL` env var (any of 15 council IDs: burnley, hyndburn, pendle, rossendale, lancaster, ribble_valley, chorley, south_ribble, lancashire_cc, blackpool, west_lancashire, blackburn, wyre, preston, fylde)
2. Copies `burnley-council/data/{council}/` → `public/data/`
3. Copies `burnley-council/data/shared/` → `public/data/shared/`
4. Replaces `%PLACEHOLDER%` tokens in index.html with council-specific values from config.json
5. Sets `base` path from `VITE_BASE` env var

The React app is council-agnostic — it reads config.json at runtime and conditionally renders features.

## DOGE Analysis Pipeline

```
council_etl.py --council {id}    →  spending.json (v2), spending-index.json + spending-YYYY-YY.json (v3) or spending-YYYY-MM.json (v4 monthly)
doge_analysis.py                 →  doge_findings.json, doge_verification.json (all councils)
generate_cross_council.py        →  cross_council.json (all councils, reads metadata.json)
councillors_etl.py --council {id} →  councillors.json, politics_summary.json, wards.json (ModernGov scraper)
register_of_interests_etl.py --council {id} →  register_of_interests.json (per council)
councillor_integrity_etl.py --council {id} →  integrity.json (per council) + integrity_cross_council.json (shared)
```

**IMPORTANT**: After re-running council_etl.py for any council, you MUST also re-run `generate_cross_council.py` to update cross-council comparison data. It lives at `scripts/generate_cross_council.py` (not in burnley-council/scripts/).

### Spending Data Versions
- **v1** (legacy): spending.json as plain array of records — no longer used (all migrated to v2, 10 Feb)
- **v2** (current): spending.json as `{ meta, filterOptions, records }` object — all 15 councils
- **v3** (chunked): spending-index.json (manifest + filterOptions) + spending-YYYY-YY.json per year — 12 districts
- **v4** (monthly): spending-index.json (v4 manifest with nested years→months) + spending-YYYY-MM.json per month — LCC, Blackpool, Blackburn
  - Field stripping saves ~42-45%: null/empty/duplicate fields removed by `strip_record_for_chunks()` in ETL
  - Records hydrated in worker via `hydrateRecord()` (spending.utils.js) — restores council, month, supplier_canonical, department, service_area
  - Auto-loads latest month on init (~3-18MB), then loads year/month on demand
  - `loadingYears`/`loadingMonths` guard Sets prevent re-entrant loading race conditions
  - Chunk files gitignored (~647MB total) — deploy locally, not via CI
- Worker (spending.worker.js) auto-detects version: tries v4 first, then v3, falls back to v2/v1
- Config `spending: false` for 3 large councils in CI (chunk data not in git). Flip to `true` for local builds with data present

Analysis checks: duplicate payments, split payment evasion, year-end spikes, round-number anomalies, Companies House compliance (temporal overlap), cross-council price gaps, Benford's Law forensic screening, payment cadence, day-of-week patterns, weak competition detection (short tenders, rapid awards), category monopoly analysis, late contract publication.

## Deployment

**Automated:** Push to `main` triggers `.github/workflows/deploy.yml` which builds all 15 councils and deploys to GitHub Pages. Zero AI tokens, zero cost.

- **Source repo:** tompickup23/burnleycouncil (this repo)
- **Deploy repo:** tompickup23/lancashire (gh-pages branch)
- **Hub repo:** tompickup23/tompickup23.github.io
- **Domain:** aidoge.co.uk → GitHub Pages with CNAME
- **CI/CD:** GitHub Actions (`deploy.yml`) — tests → build 15 councils → deploy → verify
- **Hub pages:** `burnley-council/hub/` — root 404.html handles SPA routing for all councils
- **Docs-only changes** (`.md` files, reports) do NOT trigger a rebuild

### DEPLOY_TOKEN Setup (one-time)
If the `DEPLOY_TOKEN` secret expires or needs rotating:
1. Create fine-grained PAT at https://github.com/settings/tokens?type=beta
2. Scope to `tompickup23/lancashire` repo, permission: Contents Read+Write
3. Add as secret at burnleycouncil repo → Settings → Secrets → Actions → `DEPLOY_TOKEN`

## Agent System

- **Gaius (Claude Code):** Heavy development, architecture, multi-file edits
- **Codex (OpenAI):** CLI dev agent, trial expires 2 Mar 2026
- **OpenCode:** CLI dev agent, free tier
- **Octavian (Clawdbot):** WhatsApp bot on vps-main via OpenClaw gateway. Primary: Groq Llama 4 Scout 17B (free, 30K TPM). Fallback: Nvidia NIM Kimi K2.5 (free, 40 RPM). Config: `/root/.openclaw/openclaw.json`
- **OpenAgents:** 3 agent processes on vps-main + Ollama (qwen2.5:7b)
- **clawd-worker:** AI DOGE data processing slave on vps-main
- **News Lancashire LLM chain:** Gemini 2.5 Flash (free primary) → Groq (blocked from VPS) → Kimi → DeepSeek (dead). Rate-limited via `llm_rate_limiter.py`.

See [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) for full server details, resource usage, and service inventory.

## Dev Server

```bash
VITE_COUNCIL=burnley VITE_BASE=/ npx vite
# Opens at http://localhost:5173
```

## Common Mistakes to Avoid

- **Don't create agent/bot config files in this repo** — Clawdbot lives on vps-main, not here
- **Don't assume Oracle VPS has lots of RAM** — vps-news is only 1GB RAM, memory-constrained. Never run Node.js/wrangler on it (OOM risk).
- **Don't run wrangler on vps-news** — caused OOM crash 9 Feb. Use `deploy_newslancashire.sh` on vps-main instead.
- **Don't run `git add .` or `git add -A`** — supplier_profiles.json files are 400K+ lines each
- **Don't edit generated JSON** — spending.json, doge_findings.json, doge_verification.json, budgets.json (13 auto-generated councils) are all generated
- **Don't duplicate info across docs** — CLAUDE.md = dev guide, ARCHITECTURE.md = software, INFRASTRUCTURE.md = ops
- **Don't forget CSP when adding external scripts** — `index.html` has a Content-Security-Policy meta tag. Firebase Auth needs `apis.google.com`, `*.firebaseapp.com`, `*.googleapis.com`, `*.firebaseio.com` whitelisted. Adding new third-party services requires updating the CSP.
- **Pre-render Lucide icons at call sites** — Pass `icon={<Zap size={24} />}` not `icon={Zap}`. Lucide forwardRef exports break in Vite HMR dev mode when passed as component refs between modules. renderIcon() in StatCard/CollapsibleSection prioritises pre-rendered elements. Production builds unaffected.

## Lancashire Three-Tier Architecture

Lancashire has **15 councils** across three tiers. Understanding this is critical:

| Tier | Councils | Services | Budget Scale |
|------|----------|----------|-------------|
| **County** (1) | Lancashire CC | Education, social care, highways, fire, libraries | £1,324M |
| **Unitary** (2) | Blackpool, Blackburn w/ Darwen | ALL services combined | £300-500M est. |
| **District** (12) | Burnley, Hyndburn, Pendle, Rossendale, Lancaster, Ribble Valley, Chorley, South Ribble + Preston, West Lancs, Fylde, Wyre | Housing, planning, waste collection, leisure | £12-355M |

**Key rule**: Districts are only comparable to other districts. LCC + district ≈ unitary (for LGR modelling).

### All 15 councils LIVE with spending (15 Feb 2026)
- 12 districts: All have spending data (v3 year-chunked)
- 1 county: LCC (v4 monthly-chunked, 20 files, 8-18MB each)
- 2 unitaries: Blackpool (v4, 77 files), Blackburn (v4, 68 files)
- **CI self-sustaining**: deploy.yml downloads v4 chunks from previous deploy, flips `spending:true`, builds, cleans monoliths. Config stays `spending: false` in git.

### Politics data — ALL 15 councils LIVE (15 Feb 2026)
- All 15 councils have councillors.json, politics_summary.json, wards.json
- 9 councils scraped via `councillors_etl.py` (ModernGov): LCC, Blackpool, Blackburn, Preston, West Lancs, Wyre, Lancaster, Chorley, South Ribble
- 2 councils compiled manually: Fylde (CMIS, no ModernGov), Ribble Valley (council website)
- 4 councils already had data: Burnley, Hyndburn, Pendle, Rossendale
- Total: 648 councillors, 345 wards/divisions across 15 councils

### Remaining data gaps
- **No Lancaster procurement.json**: Contracts Finder returned no results
- **No LCC deprivation.json**: County council — deprivation is at district level
- **Thin articles**: 6 newer councils have only 1-2 seed articles each (LCC, Blackpool, Blackburn, Wyre, West Lancs, Preston, Fylde)

### Phase History
- **Phases 1-13** (done): See AIDOGE-MASTERPLAN.md for details
- **Phase 14** (done, 15 Feb): All remaining 6 councils (Preston, West Lancs, Fylde, Wyre, Blackpool, Blackburn w/ Darwen)
- **Phase 15** (done, 15-16 Feb): LGR Tracker V3, councillor integrity checker (8-source, all 15 councils), data freshness sprint
- **Phase 16** (done, 16-17 Feb): Budget enrichment (all 15 budgets:true) + Integrity checker v3 overhaul
- **Phase 17** (done, 17-19 Feb): Elections page + ward-level predictions, Constituencies pages (MPs, GE2024, IPSA expenses, TWFY votes), analytics engine (14 functions), collection rates ETL, ward-constituency mapping, dependency ratio + reserves trajectory, per-service HHI, election→LGR projections, integrity conflict classification (48 commercial conflicts), article pipeline upgrade (Mistral/Groq), 37 new articles. 446 tests pass (32 files).
- **Phase 18a+b** (done, 20 Feb): Firebase Auth + RBAC. Dual-mode auth (Firebase prod / PasswordGate dev). 4 social providers + email. 4 roles (unassigned/viewer/strategist/admin). Per-council/page/constituency Firestore permissions. Admin panel. 17 files, 2,695 lines.
- **Phase 18c** (done, 21 Feb): Strategy Engine + UI. Ward classification, battleground ranking, path-to-control, talking points
- **Phase 18d** (done, 21 Feb): Advanced Strategy — historical swing, resource allocation, CSV export. 800 tests
- **Phase 18f** (done, 22 Feb): Intelligence war-game engine (attack predictions, counter-arguments), MP expenses comparison page, hub landing page redesign, registration profile capture (user type/party/constituency). 1,656 tests (36 files)
- **Phase 18e** (done, 28 Feb): Swing Map + Canvassing Route Optimisation. Leaflet.js ward boundary maps (CartoDB Dark Matter tiles), ONS ArcGIS boundary ETL (15 councils, 321 wards/divisions), k-means clustering + nearest-neighbor TSP route optimisation, 4 overlay modes (classification/swing/party/route), canvassing session cards + CSV export. 1,831 tests (37 files).
- **v6 Master Overhaul** (done, 27-28 Feb): "Leave No Stone Unturned" — 29 files, 5,991 lines. CouncillorDossier page, 8 shared components, election/LGR/analytics model upgrades, collapsible nav, 10 page upgrades with cross-references. Backend: legal_framework +11 laws, councillor_integrity_etl +791 lines (13 new detections), councillor_research_etl NEW, foi_generator NEW. 1,808 tests (37 files).
- **LCC Property Estate** (done, 28 Feb): 1,200 LCC-owned assets. PropertyPortfolio + PropertyDetail pages (strategist-only), WardMap property overlay, 6-page cross-system integration (Strategy/MyArea/DOGE/LGR/Elections/Budgets), property_assets_etl.py with CED point-in-polygon mapping, multi-tier ownership + Red Book valuation + sellability scoring. 73 new tests.
- **Planning + HMO Data** (done, 2 Mar): PlanIt planning applications for 12 councils (14,000+ apps), HMO register data for 7 councils (830 licensed, 17,260 bed spaces). planning_etl.py + hmo_etl.py (multi-source: ASP.NET, XLSX, PDF, planning extraction). MyArea/CrossCouncil integration. 1,955 tests (39 files).
- **LGR Demographic Fiscal Intelligence** (done, 2 Mar): Comprehensive demographic fiscal risk layer across entire platform. generate_lgr_enhanced.py ETL → lgr_enhanced.json + 15× demographic_fiscal.json. 11 new lgrModel.js functions. 6 new LGR sub-components (DemographicFiscalRisk, TimelineChaos, BoundaryMap, DeprivationMap, PropertyDivision, CCAImpact). Integrated into LGRTracker (6 new sections), DOGE (fiscal risk section), Demographics (fiscal outlook tab), MyArea (ward pressure), CrossCouncil (fiscal comparison), Home (fiscal banner), PropertyDetail (LGR tab). useData null URL safety fix. 2,102 tests (43 files).
- **Highways Feature** (done, 5 Mar): Lancashire-wide roadworks map + analytics system. Phases A-C: config-driven ETL refactoring (highways_config.json, 12 districts), roadworks_etl.py Lancashire-wide (1,722 works), traffic_etl.py (1,011 DfT count points, 2,001 junctions, JCI model with data_quality + confidence scoring + data freshness + s59 monitoring tier), lcc_highways_etl.py Lancashire-wide bbox. Visual: Leaflet.markercluster (severity-coloured), capacity bar popups, district filter + flyTo, speed controls, keyboard shortcuts, loading skeleton, mobile responsive. Phase D: AI DOGE React integration — HighwaysMap.jsx (direct Leaflet, severity markers, ward boundaries, JCI junctions, corridor overlays), Highways.jsx page (hero→map→analytics, s59 clashes, deferrals, traffic intelligence, legal framework from highways_legal.json), 51 new tests. 2,200 tests (45 files).
- **Advanced Visualisation Overhaul** (done, 8 Mar): 14 new reusable components (SparkLine, GaugeChart, TreemapChart, WaterfallChart, HeatmapGrid, BumpChart, ChartTooltip, ChartGradient, ChartGradients, ChoroplethMap, MapLegend, MapIcons, AdvancedCharts.css). 12 page upgrades: Demographics (choropleth), DOGE (gauges+treemap+heatmap), Spending (treemap+calendar+sparklines), Budgets (waterfall+stacked area), Elections (sparklines+brush), Integrity (gauge+pie), CrossCouncil (radar+bump), Constituencies (expenses+voting heatmap), PropertyPortfolio (EPC+treemap), MyArea (sparklines+gauge), Meetings (bar+pie+calendar), Highways (SVG icon markers). Full Reform UK turquoise (#12B6CF) sweep across 77+ files. CHART_ANIMATION on all Recharts charts. Brush zoom on 8+ time-series. Gzip/Brotli filter fix. 105 files changed, 4,829 insertions, 825 deletions. Build: 2,535 modules, 14.54s.
- **Data Enhancement Phases A-D** (done, 9 Mar): 4 new domain pages with dedicated ETLs. Housing (housing_etl.py, Census 2021 tenure/overcrowding/accommodation, 3 tabs, 31 tests). Crime (Crime.jsx using existing police_etl data, 4 tabs, 30 tests). Health (health_etl.py, Fingertips API + Census health/disability/care, 3 tabs, 31 tests). Economy (economy_etl.py, Nomis Claimant Count + ASHE + Census industry/occupation/hours, 4 tabs, 35 tests). 60× new data files (15 councils × 4 domains, minus LCC crime). 2,353 tests (49 files).
- **Cabinet Command / v7** (done, 14 Mar): Reform Operations Platform. 8-level hierarchical auth (unassigned→admin), portfolio-aware RBAC, cabinet_portfolios.json data spine (10 LCC portfolios, enriched with tier/owner savings levers, demand pressures, key contracts, operational context, MTFS targets, cross-portfolio dependencies), savingsEngine.js centralised savings model (24 pure functions, 69 tests — duplicates/procurement centralised under Resources, generateAllDirectives, mtfsComparison, parseSavingRange/timelineBucket helpers), 3 new pages: Executive.jsx (public cabinet/officer view), CabinetDashboard.jsx (operations command centre with Monday Morning List, savings pipeline, priority matrix), PortfolioDetail.jsx (9-tab parameterized page with Reform Playbook, decision pathways, statutory red lines). Layout nav restructured with Cabinet section. AdminPanel upgraded with 8-role picker + portfolio assignment. Pre-rendered Lucide icon pattern for Vite HMR compatibility. LCC-only (config-gated). 12 new/modified files, ~5,000 new lines. 2,526 tests (53 files).

## Cost: £22/month (Hostinger VPS — Clawdbot, email, clawd-worker). LLM costs: £0 (Mistral/Gemini/Groq/Nvidia free tiers). 2x AWS free trial ends Jul 2026.
