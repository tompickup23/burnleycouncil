import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  TrendingUp, AlertTriangle, Users, Building, PoundSterling, FileText,
  Search, ChevronRight, Shield, Eye, Info, Newspaper, FileQuestion,
  Calendar, Repeat, GitCompareArrows, Zap, Scale, BarChart3, Target,
  HelpCircle, MapPin, Landmark, Construction
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import { formatCurrency, formatNumber, formatPercent } from '../utils/format'
import { TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE, PARTY_COLORS, CHART_ANIMATION } from '../utils/constants'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState, DataFreshness } from '../components/ui'
import SparkLine from '../components/ui/SparkLine'
import ReformShowcase from '../components/ReformShowcase'
import { useCountUp } from '../hooks/useCountUp'
import { useReveal } from '../hooks/useReveal'
import './Home.css'

const WardMap = lazy(() => import('../components/WardMap'))

// Map icon names from doge_findings.json to Lucide components
const iconMap = {
  'alert-triangle': AlertTriangle,
  'repeat': Repeat,
  'users': Users,
  'trending-up': TrendingUp,
  'building': Building,
  'pound-sterling': PoundSterling,
  'git-compare-arrows': GitCompareArrows,
}

// Use canonical party colors from constants
const partyColors = PARTY_COLORS

function Home() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const councilFullName = config.council_full_name || 'Borough Council'
  const officialUrl = config.official_website || '#'
  const dataSources = config.data_sources || {}
  const hasSpending = !!dataSources.spending
  const spendingLink = hasSpending ? '/spending' : '/doge'
  const spendingThreshold = config.spending_threshold || 500
  const spendingPeriod = config.spending_data_period || 'Recent years'

  // Build list of data files to fetch — only request what exists
  const dataUrls = ['/data/insights.json']
  if (dataSources.doge_investigation) dataUrls.push('/data/doge_findings.json')
  if (dataSources.politics) dataUrls.push('/data/politics_summary.json')
  if (dataSources.news) dataUrls.push('/data/articles-index.json')
  if (dataSources.budget_trends) dataUrls.push('/data/revenue_trends.json')
  // Reform transformation showcase (only LCC currently) — loaded separately so failure doesn't break the page
  const hasReformShowcase = config.council_id === 'lancashire_cc'

  const { data, loading, error } = useData(dataUrls)

  const { data: reformTransformationData } = useData(hasReformShowcase ? '/data/reform_transformation.json' : null)

  // Map data
  const wardBoundariesEnabled = !!dataSources.ward_boundaries
  const { data: wardBoundariesData } = useData(wardBoundariesEnabled ? '/data/ward_boundaries.json' : null)
  const { data: wardsData } = useData(dataSources.my_area ? '/data/wards.json' : null)
  const { data: deprivationData } = useData(dataSources.deprivation ? '/data/deprivation.json' : null)
  const { data: demoFiscalData } = useData('/data/demographic_fiscal.json')
  const { data: pipelineStateData } = useData('/data/shared/pipeline_state.json')

  useEffect(() => {
    document.title = `Home | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  // JSON-LD structured data for SEO (schema.org/WebSite)
  useEffect(() => {
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: `${councilName} Council Transparency`,
      url: window.location.origin + (window.location.pathname.split('/').slice(0, -1).join('/') || '/'),
      description: `Independent transparency platform for ${councilName} Borough Council public spending, budgets, and accountability.`,
      publisher: { '@type': 'Organization', name: 'AI DOGE' },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${window.location.origin}${window.location.pathname}spending?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    }
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.textContent = JSON.stringify(jsonLd)
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [councilName])

  // Unpack data based on what was requested (must be before any early return)
  let idx = 0
  const insights = data?.[idx++]
  const dogeFindings = dataSources.doge_investigation ? data?.[idx++] : null
  const politicsSummary = dataSources.politics ? data?.[idx++] : null
  const articlesRaw = dataSources.news ? data?.[idx++] : null
  // Guard against both plain array and {articles: [...]} wrapper formats
  const articlesIndex = Array.isArray(articlesRaw) ? articlesRaw : articlesRaw?.articles || articlesRaw || []
  const revenueTrends = dataSources.budget_trends ? data?.[idx++] : null
  const reformTransformation = reformTransformationData || null

  // Summary stats — handle both field name variants
  const totalSpend = insights?.summary?.total_spend || insights?.summary?.total_transaction_spend || 0
  const totalRecords = insights?.summary?.transaction_count || insights?.transparency_metrics?.total_records || 0
  const uniqueSuppliers = insights?.summary?.unique_suppliers || 0
  const topSupplierConcentration = insights?.supplier_analysis?.concentration_ratio || 0
  // Date range label from insights
  const dateRange = insights?.summary?.date_range
  const periodLabel = dateRange
    ? `${new Date(dateRange.min).getFullYear()}-${String(new Date(dateRange.max).getFullYear()).slice(-2)}`
    : spendingPeriod

  // DOGE savings calculation from efficiency flags
  const dogeStats = useMemo(() => {
    const flags = insights?.efficiency_flags || []
    const duplicates = flags.find(f => f.type === 'same_day_duplicates')
    const roundNumbers = flags.find(f => f.type === 'round_number_payments')
    const frequentSmall = flags.find(f => f.type === 'frequent_small_transactions')

    const potentialSavings = (duplicates?.potential_value || 0)
    const flagsCount = flags.reduce((sum, f) => sum + (f.count || 0), 0)

    return { potentialSavings, flagsCount, duplicates, roundNumbers, frequentSmall }
  }, [insights])

  // Prepare chart data for top suppliers
  const topSuppliersChart = useMemo(() => insights?.supplier_analysis?.top_20_suppliers?.slice(0, 8)?.map(s => ({
    name: s.supplier.split(' ').slice(0, 2).join(' '),
    fullName: s.supplier,
    amount: s.total / 1_000_000,
  })) || [], [insights])

  // Prepare spending by year chart data
  const spendByYearChart = useMemo(() => Object.entries(insights?.yoy_analysis?.spend_by_year || {}).map(([year, amount]) => ({
    year,
    amount: amount / 1_000_000,
  })), [insights])

  const partyData = useMemo(() => politicsSummary?.by_party?.map(p => ({
    name: p.party,
    value: p.count,
    color: partyColors[p.party] || '#808080',
  })) || [], [politicsSummary])

  // Animated count-up for hero stats
  const animatedSpend = useCountUp(totalSpend, { formatter: v => formatCurrency(v, true) })
  const animatedRecords = useCountUp(totalRecords, { formatter: v => formatNumber(Math.round(v)) })
  const animatedSuppliers = useCountUp(uniqueSuppliers, { formatter: v => formatNumber(Math.round(v)) })
  const animatedSavings = useCountUp(dogeStats.potentialSavings, { formatter: v => formatCurrency(v, true) })

  // Scroll-triggered reveals for below-fold sections
  const [explainerRef, explainerVisible] = useReveal()
  const [chartsRef, chartsVisible] = useReveal()
  const [sourcesRef, sourcesVisible] = useReveal()

  const [wardMapMode, setWardMapMode] = useState('party')

  const wardMapData = useMemo(() => {
    if (!wardsData) return {}
    const map = {}
    const wardEntries = typeof wardsData === 'object' && !Array.isArray(wardsData) ? Object.entries(wardsData) : []
    wardEntries.forEach(([wardName, ward]) => {
      const councillors = ward.councillors || []
      const mainParty = councillors[0]?.party
      map[wardName] = {
        color: councillors[0]?.color || '#666',
        winner: mainParty,
        partyColor: councillors[0]?.color || '#666',
      }
    })
    return map
  }, [wardsData])

  // Deprivation-based ward colouring (IMD 2019 heat map)
  const deprivationWardData = useMemo(() => {
    if (!deprivationData) return {}
    const wards = typeof deprivationData === 'object' && !Array.isArray(deprivationData) ? deprivationData : {}
    const entries = Object.entries(wards)
    if (entries.length === 0) return {}
    const scores = entries.map(([, w]) => w.imd_score || w.average_score || 0).filter(Boolean)
    if (scores.length === 0) return {}
    const min = Math.min(...scores)
    const range = (Math.max(...scores) - min) || 1
    const map = {}
    entries.forEach(([wardName, ward]) => {
      const score = ward.imd_score || ward.average_score || 0
      if (!score) return
      const t = (score - min) / range
      const r = t < 0.5 ? Math.round(48 + 207 * t * 2) : 255
      const g = t < 0.5 ? 209 : Math.round(209 - 140 * (t - 0.5) * 2)
      const b = t < 0.5 ? Math.round(88 - 78 * t * 2) : Math.round(10 + 48 * (t - 0.5) * 2)
      map[wardName] = { color: `rgb(${r},${g},${b})`, winner: `IMD ${score.toFixed(1)}`, partyColor: `rgb(${r},${g},${b})` }
    })
    return map
  }, [deprivationData])

  const activeWardMapData = wardMapMode === 'deprivation' && Object.keys(deprivationWardData).length > 0
    ? deprivationWardData : wardMapData

  if (loading) {
    return <LoadingState message="Loading dashboard data..." />
  }

  if (error) {
    return (
      <div className="page-error">
        <h2>Unable to load data</h2>
        <p>Please try refreshing the page.</p>
      </div>
    )
  }

  // DOGE findings from data file
  const findings = dogeFindings?.findings || []
  const keyFindings = dogeFindings?.key_findings || []

  return (
    <div className="home-page animate-fade-in" aria-busy={loading}>
      {/* Disclaimer Banner */}
      <div className="disclaimer-banner">
        <Shield size={16} />
        <span>
          <strong>Independent Transparency Tool</strong> — NOT affiliated with {councilFullName}.
          Data may contain errors — always <a href={officialUrl} target="_blank" rel="noopener noreferrer">verify with official sources</a>. <Link to="/legal">Legal disclaimer</Link>
        </span>
      </div>

      {/* ===== NEW HERO: Impact-First Dashboard ===== */}
      <header className="hero-section" aria-label="Council spending overview">
        <div className="hero-content">
          <div className="hero-eyebrow">
            <Shield size={16} />
            <span>AI DOGE — Department of Government Efficiency</span>
          </div>
          <h1>Your Council Spent {animatedSpend}.<br /><span className="highlight">Here&apos;s Where It Went.</span></h1>
          <p className="hero-subtitle">
            Every payment {councilFullName} makes is published by law. We collected every one,
            ran automated analysis, and made the spending data easy to explore.
          </p>
        </div>

        {/* Impact Stats — the headline numbers */}
        <div className="impact-grid stagger-children">
          <div className="impact-card impact-spend">
            <PoundSterling size={20} className="impact-icon" />
            <span className="impact-value">{animatedSpend}</span>
            <span className="impact-label">Total Spending Tracked</span>
            <span className="impact-period">{periodLabel}</span>
          </div>
          <div className="impact-card impact-transactions">
            <FileText size={20} className="impact-icon" />
            <span className="impact-value">{animatedRecords}</span>
            <span className="impact-label">Individual Payments</span>
            <span className="impact-period">Each one searchable</span>
          </div>
          <div className="impact-card impact-suppliers">
            <Building size={20} className="impact-icon" />
            <span className="impact-value">{animatedSuppliers}</span>
            <span className="impact-label">Companies Paid</span>
            <span className="impact-period">Cross-referenced</span>
          </div>
          {dogeStats.potentialSavings > 0 && (
            <div className="impact-card impact-savings">
              <Zap size={20} className="impact-icon" />
              <span className="impact-value">{animatedSavings}</span>
              <span className="impact-label">Spending Patterns Flagged</span>
              <span className="impact-period">For further review</span>
            </div>
          )}
        </div>

        {/* Fiscal Resilience Banner */}
        {demoFiscalData?.fiscal_resilience_score != null && (
          <Link to="/doge" className={`fiscal-threat-banner fiscal-threat-banner--${demoFiscalData.fiscal_resilience_score < 30 ? 'critical' : 'warning'}`}>
            <AlertTriangle size={18} className={`fiscal-threat-icon fiscal-threat-icon--${demoFiscalData.fiscal_resilience_score < 30 ? 'critical' : 'warning'}`} />
            <div className="fiscal-threat-content">
              <span className="fiscal-threat-title">
                Fiscal Resilience: <span className={`fiscal-threat-score--${demoFiscalData.fiscal_resilience_score < 30 ? 'critical' : 'warning'}`}>{demoFiscalData.fiscal_resilience_score}/100</span>
              </span>
              <span className="fiscal-threat-detail">
                {demoFiscalData.threats?.length || 0} demographic fiscal pressures identified
              </span>
            </div>
            <span className="fiscal-threat-link">View analysis →</span>
          </Link>
        )}

        <div className="hero-actions">
          <Link to={spendingLink} className="btn-primary">
            <Search size={18} />
            Search Every Payment
          </Link>
          {dataSources.doge_investigation && (
            <Link to="/doge" className="btn-accent">
              <Shield size={18} />
              View the Full Analysis
            </Link>
          )}
          {dataSources.budgets && (
            <Link to="/budgets" className="btn-secondary">
              View Budgets
              <ChevronRight size={18} />
            </Link>
          )}
        </div>
        <DataFreshness source="Spending data" />
      </header>

      {/* ===== COUNCIL WARD MAP — Premium 3D Hero ===== */}
      {wardBoundariesData?.features?.length > 0 && Object.keys(wardMapData).length > 0 && (
        <section className="premium-map-section premium-map-section--hero">
          <div className="premium-map-header">
            <h2><MapPin size={22} /> {councilName} Ward Map</h2>
            <p className="section-intro">
              Interactive ward-level data. Click any ward to explore councillors, spending, and demographics.
            </p>
            <div className="premium-map-toggles">
              <button
                className={wardMapMode === 'party' ? 'active' : ''}
                onClick={() => setWardMapMode('party')}
              >
                Party Control
              </button>
              {deprivationData && Object.keys(deprivationWardData).length > 0 && (
                <button
                  className={wardMapMode === 'deprivation' ? 'active' : ''}
                  onClick={() => setWardMapMode('deprivation')}
                >
                  Deprivation
                </button>
              )}
            </div>
          </div>
          <div className="premium-map-3d">
            <div className="premium-map-orb premium-map-orb--red" />
            <div className="premium-map-orb premium-map-orb--blue" />
            <div className="premium-map-frame">
              <Suspense fallback={<div className="premium-map-loading" style={{ minHeight: '480px' }}>Loading map...</div>}>
                <WardMap
                  boundaries={wardBoundariesData}
                  wardData={activeWardMapData}
                  wardsUp={Object.keys(activeWardMapData)}
                  overlayMode="party"
                  height="480px"
                  onWardClick={(name) => {
                    window.location.href = import.meta.env.BASE_URL + 'my-area?ward=' + encodeURIComponent(name)
                  }}
                />
              </Suspense>
            </div>
          </div>
          <div className="premium-map-legend">
            {wardMapMode === 'party' && partyData.length > 0 && (
              <div className="premium-map-legend-items">
                {partyData.map(p => (
                  <span key={p.name} className="premium-map-legend-item">
                    <span className="premium-map-legend-dot" style={{ background: p.color }} />
                    {p.name} <strong>{p.value}</strong>
                  </span>
                ))}
              </div>
            )}
            {wardMapMode === 'deprivation' && (
              <div className="premium-map-legend-gradient">
                <span>Least deprived</span>
                <div className="premium-map-legend-gradient-bar" />
                <span>Most deprived</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ===== CCA CONTEXT — Lancashire Combined County Authority ===== */}
      {dataSources.lgr_tracker && (
        <div className="cca-context-banner">
          <div className="cca-context-content">
            <div className="cca-context-icon">
              <Landmark size={20} />
            </div>
            <div className="cca-context-text">
              <strong>Lancashire Combined County Authority</strong>
              <span>£166M devolved from Westminster — transport, skills, housing &amp; economic powers now managed locally across Lancashire.</span>
            </div>
            <Link to="/lgr#lgr-cca" className="cca-context-link">
              Track the CCA <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      )}

      {/* ===== WHAT IS THIS? — For complete novices ===== */}
      <section ref={explainerRef} className={`explainer-section reveal ${explainerVisible ? "is-visible" : ""}`}>
        <div className="explainer-card">
          <h2><HelpCircle size={22} /> What Is This?</h2>
          <div className="explainer-grid">
            <div className="explainer-item">
              <div className="explainer-step">1</div>
              <div>
                <h4>Your council spends your money</h4>
                <p>
                  {councilFullName} collects council tax and spends it on local services.
                  By law, they must publish every payment over {formatCurrency(spendingThreshold)}.
                </p>
              </div>
            </div>
            <div className="explainer-item">
              <div className="explainer-step">2</div>
              <div>
                <h4>We collected all the data</h4>
                <p>
                  We downloaded {formatNumber(totalRecords)} payment records covering {periodLabel} and
                  built a searchable database anyone can explore.
                </p>
              </div>
            </div>
            <div className="explainer-item">
              <div className="explainer-step">3</div>
              <div>
                <h4>Automated spending checks</h4>
                <p>
                  Duplicate payments, split payment patterns, Companies House status,
                  statistical checks (including Benford&apos;s Law digit analysis), and more — all automated, all transparent.
                </p>
              </div>
            </div>
            <div className="explainer-item">
              <div className="explainer-step">4</div>
              <div>
                <h4>You can explore it yourself</h4>
                <p>
                  Use this data at council meetings, in FOI requests, or simply to understand
                  where your money goes. Public services work best when people are informed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Service Scope — shows what this council tier handles */}
      <ServiceScope tier={config.council_tier} councilName={councilName} />

      {/* ===== DOGE FINDINGS — Spending analysis results ===== */}
      {findings.length > 0 && (
        <section className="doge-section">
          <div className="doge-header">
            <div className="doge-header-text">
              <h2><Shield size={22} /> DOGE Spending Analysis</h2>
              <p className="section-intro">
                Our automated checks flagged {dogeStats.flagsCount > 0 ? formatNumber(dogeStats.flagsCount) + ' notable patterns' : 'these patterns'} across {formatNumber(totalRecords)} transactions.
                These are statistical observations, not accusations — they highlight areas that may warrant further review.
              </p>
            </div>
          </div>

          <div className="doge-findings-grid stagger-children">
            {findings.slice(0, 4).map((f, i) => (
              <Link key={i} to={f.link || spendingLink} className={`doge-card ${f.severity || 'info'}`}>
                <div className="doge-card-header">
                  <span className={`doge-severity ${f.severity || 'info'}`}>{f.severity || 'info'}</span>
                  {f.confidence && <span className="doge-confidence">{f.confidence} confidence</span>}
                </div>
                <span className="doge-value">{f.value}</span>
                <span className="doge-label">{f.label}</span>
                <span className="doge-detail">{f.detail}</span>
              </Link>
            ))}
          </div>

          {findings.length > 4 && (
            <div className="doge-more-findings">
              {findings.slice(4).map((f, i) => (
                <Link key={i} to={f.link || spendingLink} className={`doge-mini-card ${f.severity || 'info'}`}>
                  <span className="doge-mini-value">{f.value}</span>
                  <span className="doge-mini-label">{f.label}</span>
                </Link>
              ))}
            </div>
          )}

          <Link to="/doge" className="doge-cta">
            View the full DOGE analysis with methodology &amp; sources <ChevronRight size={16} />
          </Link>
        </section>
      )}

      {/* ===== KEY FINDINGS — Data-driven observation cards ===== */}
      {keyFindings.length > 0 && (
        <section className="findings-section">
          <h2>Key Findings</h2>
          <p className="section-intro">
            Notable patterns identified in the spending data.
          </p>

          <div className="findings-grid stagger-children">
            {keyFindings.slice(0, 4).map((f, i) => {
              const IconComponent = iconMap[f.icon] || AlertTriangle
              return (
                <Link key={i} to={f.link || spendingLink} className={`finding-card ${f.severity || 'info'}`}>
                  <div className="finding-header">
                    <IconComponent size={24} className="finding-icon" />
                    <span className="finding-badge">{f.badge}</span>
                  </div>
                  <h3>{f.title}</h3>
                  <p>{f.description}</p>
                  <span className="finding-link">{f.link_text || 'View details \u2192'}</span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ===== FOLLOW THE MONEY — Charts ===== */}
      <section ref={chartsRef} className={`charts-section reveal ${chartsVisible ? "is-visible" : ""}`}>
        <h2><BarChart3 size={22} /> Spending Breakdown</h2>
        <p className="section-intro">
          Where does your council tax go? Here are the largest recipients and spending trends over time.
        </p>

        <div className="charts-grid">
          {/* Top Suppliers Chart */}
          <div className="chart-card">
            <h3>Largest Suppliers ({periodLabel})</h3>
            <p className="chart-description">
              The 8 suppliers receiving the highest total payments. The top 20 suppliers account
              for {formatPercent(topSupplierConcentration * 100)} of all recorded payments.
            </p>
            <div className="chart-container" role="img" aria-label="Bar chart showing top 8 suppliers by total payment value">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topSuppliersChart} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis
                    type="number"
                    tick={AXIS_TICK_STYLE}
                    tickFormatter={(v) => `\u00A3${v}M`}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fill: '#e5e5e7', fontSize: 12 }}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value, name, props) => [`\u00A3${value.toFixed(2)}M`, props.payload.fullName]}
                  />
                  <Bar dataKey="amount" fill="var(--accent-orange)" radius={[0, 4, 4, 0]} animationDuration={CHART_ANIMATION.duration} animationEasing={CHART_ANIMATION.easing} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Link to={spendingLink} className="chart-link">Search all supplier payments &rarr;</Link>
          </div>

          {/* Spending by Year */}
          {spendByYearChart.length > 0 && (
            <div className="chart-card">
              <h3>Annual External Payments</h3>
              <p className="chart-description">Total payments to suppliers by financial year (millions)</p>
              <div className="chart-container" role="img" aria-label="Bar chart showing annual external payment totals by financial year">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={spendByYearChart} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis
                      dataKey="year"
                      tick={AXIS_TICK_STYLE}
                    />
                    <YAxis
                      tick={AXIS_TICK_STYLE}
                      tickFormatter={(v) => `\u00A3${v}M`}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value) => [`\u00A3${value.toFixed(2)}M`, 'External Payments']}
                    />
                    <Bar dataKey="amount" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} animationDuration={CHART_ANIMATION.duration} animationEasing={CHART_ANIMATION.easing} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Data Context Banner */}
      <div className="context-banner">
        <Info size={18} />
        <div>
          <strong>Understanding the numbers:</strong> The spending data shows external payments to suppliers
          (invoices over {formatCurrency(spendingThreshold)}, contracts over {formatCurrency(5000)}, purchase cards) — covering <em>both</em> revenue spending
          (day-to-day running costs) and capital spending (one-off investments like construction projects).
          {revenueTrends?.latest_budget && (
            <> The council&apos;s <strong>Net Revenue Budget</strong> is {formatCurrency(revenueTrends.latest_budget, true)}, funded
            by council tax and business rates.</>
          )}
          {dataSources.budgets && <Link to="/budgets"> See full budget breakdown &rarr;</Link>}
        </div>
      </div>

      {/* ===== SUPPLIER CONCENTRATION — Always available from insights ===== */}
      <section className="findings-section">
        <h2><Target size={22} /> Supplier Concentration</h2>
        <p className="section-intro">
          {formatNumber(uniqueSuppliers)} companies were paid by the council. Here is how spending is distributed.
        </p>

        <div className="concentration-grid">
          <div className="concentration-stat">
            <span className="concentration-value">{formatPercent(topSupplierConcentration * 100)}</span>
            <span className="concentration-label">of all payments go to just 20 suppliers</span>
          </div>
          <div className="concentration-stat">
            <span className="concentration-value">{formatNumber(insights?.supplier_analysis?.single_transaction_suppliers || 0)}</span>
            <span className="concentration-label">suppliers were paid only once</span>
          </div>
        </div>

        <Link to={spendingLink} className="doge-cta" style={{ marginTop: 'var(--space-md)' }}>
          Explore all supplier payments <ChevronRight size={16} />
        </Link>
      </section>

      {/* ===== REFORM TRANSFORMATION — LCC only ===== */}
      {reformTransformation && (
        <ReformShowcase data={reformTransformation} />
      )}

      {/* ===== WHO RUNS YOUR COUNCIL — Politics section ===== */}
      {politicsSummary && partyData.length > 0 && (
        <section className="politics-section">
          <h2><Users size={22} /> Who Runs Your Council?</h2>
          <p className="section-intro">
            {politicsSummary.total_councillors || ''} elected councillors make decisions about how your money is spent.
            They set the budget, approve contracts, and answer to you.
          </p>

          <div className="politics-grid">
            <div className="council-composition">
              <div className="composition-visual">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={partyData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      label={({ value }) => `${value}`}
                      labelLine={false}
                      animationDuration={CHART_ANIMATION.duration}
                      animationEasing={CHART_ANIMATION.easing}
                    >
                      {partyData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value, name) => [`${value} seats`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="party-breakdown">
                <h4>Council Seats</h4>
                {politicsSummary.by_party?.map((party, i) => (
                  <div key={i} className="party-row">
                    <span
                      className="party-dot"
                      style={{ background: partyColors[party.party] || '#808080' }}
                    />
                    <span className="party-name">{party.party}</span>
                    <span className="party-count">{party.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {politicsSummary.coalition && (
              <div className="coalition-info">
                <div className="coalition-card ruling">
                  <h4>Ruling Coalition</h4>
                  <div className="coalition-seats">
                    <span className="seat-count">{politicsSummary.coalition.total_seats || 0}</span>
                    <span className="seat-label">of {politicsSummary.total_councillors || ''} seats</span>
                  </div>
                  <p className="coalition-parties">
                    {politicsSummary.coalition.parties?.join(' + ') || 'Coalition'}
                  </p>
                </div>

                <Link to="/politics" className="view-councillors-btn">
                  <Users size={18} />
                  View All Councillors
                  <ChevronRight size={18} />
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ===== LATEST NEWS — Articles and analysis ===== */}
      {articlesIndex.length > 0 && (
        <section className="news-preview-section">
          <h2><Newspaper size={24} /> Latest Analysis</h2>
          <p className="section-intro">
            Data-driven articles and analysis for {councilName} Council.
          </p>

          <div className="news-preview-grid">
            {articlesIndex.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 3).map((article, i) => (
              <Link key={article.id} to={`/news/${article.id}`} className={`news-preview-card${i === 0 ? ' featured' : ''}`}>
                <span className={`category-badge ${(article.category || 'analysis').toLowerCase()}`}>{article.category || 'Analysis'}</span>
                <h4>{article.title}</h4>
                <p>{article.summary?.slice(0, 180)}{article.summary?.length > 180 ? '\u2026' : ''}</p>
                <span className="read-more">Read more <ChevronRight size={14} /></span>
              </Link>
            ))}
          </div>

          <Link to="/news" className="view-all-link">
            View all articles <ChevronRight size={16} />
          </Link>
        </section>
      )}

      {/* ===== UPCOMING MEETINGS ===== */}
      {dataSources.meetings && (
        <section className="meetings-preview-section">
          <h2><Calendar size={24} /> Upcoming Meetings</h2>
          <p className="section-intro">
            Council meetings where decisions about local services and spending are made. Members of the public can attend and ask questions.
          </p>
          <div className="meetings-preview-grid">
            <Link to="/meetings" className="meetings-preview-card highlight">
              <span className="meeting-preview-label">Full Council</span>
              <h4>Public Question Time</h4>
              <p>Every resident can ask questions at Full Council meetings. Use this spending data to inform your questions.</p>
              <span className="read-more">View meetings calendar <ChevronRight size={14} /></span>
            </Link>
            <Link to="/meetings" className="meetings-preview-card">
              <span className="meeting-preview-label">Scrutiny</span>
              <h4>Scrutiny Committees</h4>
              <p>Scrutiny committees review Executive decisions and can look into concerns raised by the public.</p>
              <span className="read-more">See upcoming scrutiny <ChevronRight size={14} /></span>
            </Link>
          </div>
        </section>
      )}

      {/* ===== HIGHWAYS — Roadworks overview ===== */}
      {dataSources.highways && (
        <section className="highways-preview-section">
          <h2><Construction size={24} /> Highways &amp; Roadworks</h2>
          <p className="section-intro">
            Live roadworks data, traffic analysis, and infrastructure impact assessment.
            See current works, estimated capacity effects, and where schemes overlap.
          </p>
          <div className="meetings-preview-grid">
            <Link to="/highways" className="meetings-preview-card highlight">
              <span className="meeting-preview-label">Live Map</span>
              <h4>Current Roadworks</h4>
              <p>Interactive map of all active and planned roadworks with severity classification, capacity loss estimates, and ward boundaries.</p>
              <span className="read-more">View roadworks map <ChevronRight size={14} /></span>
            </Link>
            <Link to="/highways" className="meetings-preview-card">
              <span className="meeting-preview-label">Analysis</span>
              <h4>Traffic &amp; Scheduling Analysis</h4>
              <p>Junction congestion scoring, overlapping works detection, and scheduling recommendations based on traffic data.</p>
              <span className="read-more">See traffic analysis <ChevronRight size={14} /></span>
            </Link>
          </div>
        </section>
      )}

      {/* ===== DATA PIPELINE — Automated monitoring dashboard ===== */}
      {pipelineStateData?.councils && (
        <section className="pipeline-dashboard-section">
          <h2><Zap size={22} /> Data Pipeline</h2>
          <p className="section-intro">
            Automated monitoring of {Object.keys(pipelineStateData.councils).length} council transparency pages.
            {pipelineStateData.last_global_run && (
              <> Last check: {new Date(pipelineStateData.last_global_run).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.</>
            )}
          </p>
          {(() => {
            const councils = pipelineStateData.councils
            const entries = Object.entries(councils)
            const fresh = entries.filter(([, c]) => (c.staleness_days || 0) < 90).length
            const aging = entries.filter(([, c]) => (c.staleness_days || 0) >= 90 && (c.staleness_days || 0) < 180).length
            const stale = entries.filter(([, c]) => (c.staleness_days || 0) >= 180).length
            const totalRecords = entries.reduce((sum, [, c]) => sum + (c.record_count || 0), 0)
            const avgQc = entries.filter(([, c]) => c.qc_score != null).length > 0
              ? Math.round(entries.filter(([, c]) => c.qc_score != null).reduce((sum, [, c]) => sum + c.qc_score, 0) / entries.filter(([, c]) => c.qc_score != null).length)
              : null
            const recordTrend = entries.slice(0, 8).map(([, c]) => c.record_count || 0)
            return (
              <>
                <div className="pipeline-stats-row">
                  <div className="pipeline-stat">
                    <span className="pipeline-stat-value" style={{ color: '#30d158' }}>{fresh}</span>
                    <span className="pipeline-stat-label">Fresh (&lt;90d)</span>
                  </div>
                  <div className="pipeline-stat">
                    <span className="pipeline-stat-value" style={{ color: '#ff9f0a' }}>{aging}</span>
                    <span className="pipeline-stat-label">Aging (90-180d)</span>
                  </div>
                  <div className="pipeline-stat">
                    <span className="pipeline-stat-value" style={{ color: '#ff453a' }}>{stale}</span>
                    <span className="pipeline-stat-label">Stale (&gt;180d)</span>
                  </div>
                  <div className="pipeline-stat">
                    <span className="pipeline-stat-value">{formatNumber(totalRecords)}</span>
                    <span className="pipeline-stat-label">Total Records</span>
                  </div>
                  {avgQc != null && (
                    <div className="pipeline-stat">
                      <span className="pipeline-stat-value" style={{ color: avgQc >= 90 ? '#30d158' : avgQc >= 70 ? '#ff9f0a' : '#ff453a' }}>{avgQc}/100</span>
                      <span className="pipeline-stat-label">Avg QC Score</span>
                    </div>
                  )}
                  {recordTrend.length > 2 && (
                    <div className="pipeline-stat">
                      <SparkLine data={recordTrend} color="#00d4aa" width={80} height={24} />
                      <span className="pipeline-stat-label">Data Volume</span>
                    </div>
                  )}
                </div>
                <div className="pipeline-council-grid">
                  {entries.map(([id, council]) => {
                    const days = council.staleness_days || 0
                    const statusColor = days < 90 ? '#30d158' : days < 180 ? '#ff9f0a' : '#ff453a'
                    const statusIcon = days < 90 ? '✅' : days < 180 ? '🟡' : '🔴'
                    const qcColor = council.qc_score == null ? '#666' : council.qc_score >= 90 ? '#30d158' : council.qc_score >= 70 ? '#ff9f0a' : '#ff453a'
                    return (
                      <div key={id} className="pipeline-council-card" style={{ borderLeftColor: statusColor }}>
                        <div className="pipeline-council-header">
                          <span className="pipeline-council-icon">{statusIcon}</span>
                          <span className="pipeline-council-name">{id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace('Cc', 'CC')}</span>
                        </div>
                        <div className="pipeline-council-meta">
                          <span>{formatNumber(council.record_count || 0)} records</span>
                          <span style={{ color: statusColor }}>{days}d old</span>
                          {council.qc_score != null && <span style={{ color: qcColor }}>QC: {council.qc_score}</span>}
                          <span className="pipeline-version-badge">{council.spending_version || 'v3'}</span>
                        </div>
                        {council.gaps?.length > 0 && (
                          <div className="pipeline-gap-alert">⚠️ Missing: {council.gaps.join(', ')}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )
          })()}
        </section>
      )}

      {/* ===== DATA SOURCES — Trust and credibility ===== */}
      <section ref={sourcesRef} className={`sources-section reveal ${sourcesVisible ? "is-visible" : ""}`}>
        <h2><Eye size={22} /> About the Data</h2>
        <p className="section-intro">
          Everything on this site comes from publicly available sources. Here&apos;s exactly where.
        </p>

        <div className="sources-grid">
          <div className="source-card">
            <FileText size={24} />
            <h4>Council Spending Data</h4>
            <p>
              Every payment over {formatCurrency(spendingThreshold)} published under the Local Government Transparency Code 2015.
              Councils are legally required to publish this data.
            </p>
            <span className="source-period">{spendingPeriod}</span>
          </div>
          {dataSources.politics && (
            <div className="source-card">
              <Users size={24} />
              <h4>Councillor Data</h4>
              <p>Names, wards, and party affiliations from the council&apos;s committee management system (ModernGov).</p>
              <span className="source-period">Current members</span>
            </div>
          )}
          <div className="source-card">
            <Shield size={24} />
            <h4>Companies House</h4>
            <p>Every supplier cross-referenced against the official company register to check compliance status.</p>
            <span className="source-period">Live API checks</span>
          </div>
          <div className="source-card">
            <Scale size={24} />
            <h4>Data Quality</h4>
            <p>
              {insights?.transparency_metrics
                ? `${formatPercent(
                    (insights.transparency_metrics.has_dates +
                      insights.transparency_metrics.has_suppliers +
                      (insights.transparency_metrics.has_departments || 0)) / 3
                  )} average completeness across ${formatNumber(totalRecords)} records.`
                : `${formatNumber(totalRecords)} records analysed.`
              }
            </p>
            <span className="source-period">May contain errors — always verify</span>
          </div>
        </div>
      </section>

      {/* ===== CTA — What to do next ===== */}
      <section className="cta-section">
        <div className="cta-content">
          <h2>What Do You Want to Know?</h2>
          <p>
            This is publicly available data, made easier to explore. Search, browse, or dig into the details.
          </p>
          <div className="cta-actions">
            <Link to={spendingLink} className="btn-primary">
              <Search size={18} />
              Search Spending
            </Link>
            {dataSources.doge_investigation && (
              <Link to="/doge" className="btn-secondary">
                <Shield size={18} />
                DOGE Analysis
              </Link>
            )}
            {dataSources.meetings && (
              <Link to="/meetings" className="btn-secondary">
                <Calendar size={18} />
                Meetings
              </Link>
            )}
            {dataSources.foi && (
              <Link to="/foi" className="btn-secondary">
                <FileQuestion size={18} />
                Submit an FOI
              </Link>
            )}
            {dataSources.my_area && (
              <Link to="/my-area" className="btn-secondary">
                <Users size={18} />
                Find Your Councillors
              </Link>
            )}
            {dataSources.lgr_tracker && (
              <Link to="/lgr" className="btn-secondary">
                <GitCompareArrows size={18} />
                LGR Tracker
              </Link>
            )}
            {dataSources.highways && (
              <Link to="/highways" className="btn-secondary">
                <Construction size={18} />
                Roadworks
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

// Service scope badges — shows which services each council tier provides
const SERVICE_SCOPE = {
  district: {
    provides: ['Housing', 'Planning', 'Waste Collection', 'Leisure', 'Parking', 'Council Tax Collection'],
    doesNotProvide: ['Education', 'Social Care', 'Highways', 'Fire', 'Libraries'],
    note: 'Education, social care and highways are provided by Lancashire County Council.',
  },
  county: {
    provides: ['Education', 'Social Care', 'Highways', 'Fire', 'Libraries', 'Public Health', 'Waste Disposal'],
    doesNotProvide: ['Housing', 'Planning', 'Waste Collection', 'Leisure', 'Parking'],
    note: 'Housing, planning and waste collection are provided by the 12 district councils.',
  },
  unitary: {
    provides: ['Housing', 'Planning', 'Education', 'Social Care', 'Highways', 'Waste', 'Leisure', 'Fire'],
    doesNotProvide: [],
    note: 'Unitary authorities provide all council services.',
  },
}

function ServiceScope({ tier, councilName }) {
  const scope = SERVICE_SCOPE[tier || 'district']
  if (!scope) return null

  return (
    <div className="service-scope">
      <div className="service-scope-header">
        <Building size={16} />
        <strong>{councilName} is a {tier === 'county' ? 'county council' : tier === 'unitary' ? 'unitary authority' : 'district council'}</strong>
        <span className="scope-explainer">
          — {tier === 'county' ? 'responsible for major services across Lancashire'
             : tier === 'unitary' ? 'responsible for all council services'
             : 'responsible for local services in your area'}
        </span>
      </div>
      <div className="service-scope-badges">
        {scope.provides.map(s => (
          <span key={s} className="scope-badge scope-yes">{s}</span>
        ))}
        {scope.doesNotProvide.map(s => (
          <span key={s} className="scope-badge scope-no">{s}</span>
        ))}
      </div>
      {scope.note && <p className="service-scope-note">{scope.note}</p>}
    </div>
  )
}

export default Home
