import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Target, TrendingUp, AlertTriangle, ChevronRight, Zap, BarChart3, Shield, Users, Clock, PoundSterling } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, Cell, PieChart, Pie, LabelList } from 'recharts'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { isFirebaseEnabled } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { LoadingState } from '../components/ui'
import { StatCard } from '../components/ui/StatCard'
import { ChartCard, CHART_TOOLTIP_STYLE } from '../components/ui/ChartCard'
import CollapsibleSection from '../components/CollapsibleSection'
import { CHART_COLORS, GRID_STROKE, AXIS_TICK_STYLE, CHART_ANIMATION } from '../utils/constants'
import GaugeChart from '../components/ui/GaugeChart'
import {
  buildDirectorateSavingsProfile,
  evidenceChainStrength,
  directorateRiskProfile,
  aggregateSavings,
  generateDirectives,
  generateAllDirectives,
  matchSpendingToPortfolio,
  formatCurrency,
  getAccessiblePortfolios,
  contractPipeline,
  fiscalSystemOverview,
  quantifyDemandPressures,
  budgetRealismCheck,
  spendingBudgetVariance,
  spendingConcentration,
  mtfsComparison,
  electoralRippleAssessment,
  treasuryManagementSavings,
  workforceOptimisation,
  parseSavingRange,
} from '../utils/savingsEngine'
import { useSpendingSummary } from '../hooks/useSpendingSummary'
import { usePDFExport } from '../components/pdf/usePDFExport'
import './DirectorateDashboard.css'

const RISK_COLORS = { critical: '#dc3545', high: '#fd7e14', medium: '#ffc107', low: '#28a745' }
const TIER_LABELS = {
  immediate_recovery: 'Immediate', procurement_reform: 'Procurement',
  service_redesign: 'Service Redesign', demand_management: 'Demand Mgmt',
  income_generation: 'Income', other: 'Other',
}

/**
 * Directorate Dashboard — Reform Savings Command Centre.
 *
 * Requires councillor+ role. Replaces the old CabinetDashboard with a
 * directorate-first architecture focused on evidence-backed savings.
 */
export default function DirectorateDashboard() {
  const config = useCouncilConfig()
  const dataSources = config.data_sources || {}
  const authCtx = useAuth()
  const [activeTab, setActiveTab] = useState('command')

  const hasAccess = authCtx?.isCouncillor || !isFirebaseEnabled
  const { summary: spendingSummary, loading: spendingLoading } = useSpendingSummary()

  const { data: allData, loading, error } = useData(
    dataSources.cabinet_portfolios
      ? ['/data/cabinet_portfolios.json', '/data/doge_findings.json', '/data/budgets.json', '/data/meetings.json', '/data/council_documents.json', '/data/procurement.json']
      : null
  )

  const [portfolioData, findingsData, budgetsData, meetingsData, documentsData, procurementData] = allData || [null, null, null, null, null, null]
  const procurement = Array.isArray(procurementData) ? procurementData : procurementData?.contracts || []

  // Build directorate profiles
  const directorateProfiles = useMemo(() => {
    if (!portfolioData?.directorates?.length || !portfolioData?.portfolios) return []
    return portfolioData.directorates.map(d =>
      buildDirectorateSavingsProfile(d, portfolioData.portfolios, findingsData, portfolioData)
    ).filter(Boolean).sort((a, b) => (b.savings_range?.midpoint || 0) - (a.savings_range?.midpoint || 0))
  }, [portfolioData, findingsData])

  // Build risk profiles
  const riskProfiles = useMemo(() => {
    if (!portfolioData?.directorates?.length) return {}
    const map = {}
    for (const d of portfolioData.directorates) {
      map[d.id] = directorateRiskProfile(d, portfolioData.portfolios, [], { findings: findingsData })
    }
    return map
  }, [portfolioData, findingsData])

  // Aggregate totals
  const totals = useMemo(() => {
    if (!directorateProfiles.length) return null
    const totalLow = directorateProfiles.reduce((s, d) => s + (d.savings_range?.low || 0), 0)
    const totalHigh = directorateProfiles.reduce((s, d) => s + (d.savings_range?.high || 0), 0)
    const totalMtfs = directorateProfiles.reduce((s, d) => s + (d.mtfs_target || 0), 0)
    const mtfsTarget = portfolioData?.administration?.mtfs?.savings_targets?.['2026_27'] || totalMtfs || 0
    const midpoint = (totalLow + totalHigh) / 2
    const priorTarget = portfolioData?.administration?.mtfs?.prior_year_performance?.target || 0
    const priorPct = portfolioData?.administration?.mtfs?.prior_year_performance?.achieved_pct || 0
    const priorGap = priorTarget > 0 ? Math.round(priorTarget * (1 - priorPct / 100)) : 0
    return { totalLow, totalHigh, midpoint, mtfsTarget, coveragePct: mtfsTarget > 0 ? Math.round(midpoint / mtfsTarget * 100) : 0, priorTarget, priorPct, priorGap }
  }, [directorateProfiles, portfolioData])

  // Monday Morning List — top directives across all directorates
  const mondayList = useMemo(() => {
    if (!portfolioData?.portfolios || !findingsData) return []
    const allDirectives = generateAllDirectives(portfolioData.portfolios, findingsData, [], portfolioData, { spendingSummary })
    return allDirectives
      .filter(d => d.save_central > 0 || d.save_high > 0 || d.category === 'spending_intelligence')
      .sort((a, b) => {
        const aScore = evidenceChainStrength(portfolioData.portfolios.flatMap(p => p.savings_levers || []).find(l => l.lever === a.lever_name) || {})
        const bScore = evidenceChainStrength(portfolioData.portfolios.flatMap(p => p.savings_levers || []).find(l => l.lever === b.lever_name) || {})
        return bScore - aScore
      })
      .slice(0, 15)
  }, [portfolioData, findingsData, spendingSummary])

  // Spending intelligence per directorate
  const spendingByDirectorate = useMemo(() => {
    if (!spendingSummary?.by_portfolio || !portfolioData?.directorates) return {}
    const result = {}
    for (const d of portfolioData.directorates) {
      const portfolios = portfolioData.portfolios?.filter(p => d.portfolio_ids?.includes(p.id)) || []
      let total = 0, suppliers = 0, alerts = []
      for (const p of portfolios) {
        const ps = spendingSummary.by_portfolio[p.id]
        if (ps) {
          total += ps.total || 0
          suppliers += ps.unique_suppliers || 0
          const conc = spendingConcentration(ps)
          if (conc?.risk_level === 'high') alerts.push({ portfolio: p.title, hhi: conc.hhi, top: conc.top_3[0]?.name })
          const variance = spendingBudgetVariance(p, spendingSummary)
          if (variance?.alert_level === 'red') alerts.push({ portfolio: p.title, type: 'variance', pct: variance.variance_pct })
        }
      }
      result[d.id] = { total, suppliers, alerts, portfolio_count: portfolios.length }
    }
    return result
  }, [spendingSummary, portfolioData])

  // Contract expiry counts per directorate
  const contractCounts = useMemo(() => {
    if (!procurement.length || !portfolioData?.directorates?.length) return {}
    const counts = {}
    for (const d of portfolioData.directorates) {
      const portfolios = portfolioData.portfolios.filter(p => d.portfolio_ids?.includes(p.id))
      let expiring = 0
      for (const p of portfolios) {
        const pipeline = contractPipeline(procurement, p)
        expiring += pipeline.expiring_3m.length
      }
      if (expiring > 0) counts[d.id] = expiring
    }
    return counts
  }, [procurement, portfolioData])

  // MTFS chart data
  const mtfsChartData = useMemo(() => {
    return directorateProfiles.map(d => ({
      name: d.title.split(',')[0].split('&')[0].trim().slice(0, 12),
      mtfs: (d.mtfs_target || 0) / 1e6,
      identified_low: (d.savings_range?.low || 0) / 1e6,
      identified_high: (d.savings_range?.high || 0) / 1e6 - (d.savings_range?.low || 0) / 1e6,
    }))
  }, [directorateProfiles])

  // Timeline chart data
  const timelineData = useMemo(() => {
    const buckets = { immediate: 0, short_term: 0, medium_term: 0, long_term: 0 }
    for (const d of directorateProfiles) {
      for (const [key, val] of Object.entries(d.by_timeline || {})) {
        buckets[key] = (buckets[key] || 0) + val
      }
    }
    return [
      { name: 'Immediate', value: buckets.immediate / 1e6 },
      { name: 'Short (3-6m)', value: buckets.short_term / 1e6 },
      { name: 'Medium (6-18m)', value: buckets.medium_term / 1e6 },
      { name: 'Long (18m+)', value: buckets.long_term / 1e6 },
    ]
  }, [directorateProfiles])

  // Fiscal System Overview — service model coverage + demand vs savings
  const fiscalSystem = useMemo(() => {
    if (!portfolioData?.portfolios?.length) return null
    return fiscalSystemOverview(portfolioData.portfolios)
  }, [portfolioData])

  // MTFS comparison for leader PDF
  const mtfsData = useMemo(() => {
    if (!portfolioData?.portfolios?.length || !mondayList?.length) return null
    return mtfsComparison(mondayList, portfolioData)
  }, [portfolioData, mondayList])

  // Political/electoral ripple for leader PDF
  const politicalImpact = useMemo(() => {
    if (!portfolioData?.portfolios?.length || !mondayList?.length) return null
    const actions = portfolioData.portfolios.map(p => ({
      portfolio: p,
      savings: mondayList.filter(d => d.portfolio_id === p.id).reduce((s, d) => s + (d.save_central || 0), 0),
      directives_count: mondayList.filter(d => d.portfolio_id === p.id).length,
    }))
    return electoralRippleAssessment(actions)
  }, [portfolioData, mondayList])

  // Treasury + workforce summary for leader PDF
  const treasurySummary = useMemo(() => {
    const treasury = portfolioData?.administration?.treasury
    if (!treasury) return null
    return treasuryManagementSavings(treasury)
  }, [portfolioData])

  const workforceSummary = useMemo(() => {
    if (!portfolioData?.portfolios?.length) return null
    const totals = { fte: 0, vacancies: 0, agency_spend: 0, agency_fte: 0, total_salary_budget: 0 }
    for (const p of portfolioData.portfolios) {
      if (!p.workforce) continue
      totals.fte += p.workforce.fte_headcount || 0
      totals.vacancies += Math.round((p.workforce.fte_headcount || 0) * (p.workforce.vacancy_rate_pct || 0) / 100)
      totals.agency_spend += p.workforce.agency_spend || 0
      totals.agency_fte += p.workforce.agency_fte || 0
      totals.total_salary_budget += (p.workforce.fte_headcount || 0) * (p.workforce.average_salary || 32000) * 1.3
    }
    return totals
  }, [portfolioData])

  // Savings by tier — for pie chart
  const tierData = useMemo(() => {
    if (!directorateProfiles.length) return []
    const buckets = {}
    for (const dp of directorateProfiles) {
      for (const [tier, val] of Object.entries(dp.by_tier || {})) {
        buckets[tier] = (buckets[tier] || 0) + val
      }
    }
    return Object.entries(buckets)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([tier, value]) => ({
        name: TIER_LABELS[tier] || tier.replace(/_/g, ' '),
        value: value / 1e6,
        rawValue: value,
      }))
  }, [directorateProfiles])

  // Top 10 savings levers across all portfolios
  const topLeversData = useMemo(() => {
    if (!portfolioData?.portfolios?.length) return []
    const all = portfolioData.portfolios.flatMap(p =>
      (p.savings_levers || []).map(l => {
        const range = parseSavingRange(l.est_saving)
        return { name: l.lever, midpoint: (range.low + range.high) / 2, range: l.est_saving, tier: l.tier, portfolio: p.short_title || p.title }
      })
    )
    return all.sort((a, b) => b.midpoint - a.midpoint).slice(0, 10).map(l => ({
      name: (l.name || '').substring(0, 28),
      value: l.midpoint / 1e6,
      rawValue: l.midpoint,
      range: l.range,
      portfolio: l.portfolio,
    }))
  }, [portfolioData])

  // --- PDF Export: Leader Briefing ---
  const { generatePDF, isGenerating: pdfGenerating } = usePDFExport()
  const handleExportLeaderPDF = async () => {
    if (pdfGenerating) return
    const { LeaderBriefingPDF } = await import('../components/pdf/LeaderBriefingPDF.jsx')
    const doc = <LeaderBriefingPDF
      portfolios={portfolioData?.portfolios || []}
      directorates={directorateProfiles}
      allDirectives={mondayList}
      fiscalOverview={fiscalSystem}
      mondayMorningList={mondayList}
      councilName={config.council_name || 'Lancashire County Council'}
      mtfsComparison={mtfsData}
      politicalImpact={politicalImpact}
      riskProfiles={riskProfiles}
      spendingByDirectorate={spendingByDirectorate}
      totals={totals}
      budgetsData={budgetsData}
      treasurySummary={treasurySummary}
      workforceSummary={workforceSummary}
      treasuryRaw={portfolioData?.administration?.treasury}
      spendingSummary={spendingSummary}
    />
    generatePDF(doc, `leader-briefing-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  if (!dataSources.cabinet_portfolios) return <div className="page-empty"><p>Cabinet portfolios not available for this council.</p></div>
  if (!hasAccess) return <div className="page-empty"><p>Councillor access required.</p></div>
  if (loading) return <LoadingState message="Loading Savings Command Centre..." />
  if (error || !portfolioData) return <div className="page-empty"><p>Failed to load cabinet data.</p></div>
  if (!portfolioData.directorates?.length) return <div className="page-empty"><p>Directorate data not yet available.</p></div>

  const tabs = [
    { id: 'command', label: 'Command Centre', icon: <Zap size={14} /> },
    { id: 'directorates', label: 'Directorates', icon: <BarChart3 size={14} /> },
    { id: 'mtfs', label: 'MTFS Tracker', icon: <Target size={14} /> },
  ]

  return (
    <div className="directorate-dashboard">
      <div className="page-hero reform-hero">
        <h1><Zap size={28} /> Reform Savings Command Centre</h1>
        <p className="hero-subtitle">Evidence-backed savings intelligence across {directorateProfiles.length} directorates</p>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem' }}>
          <Link to="/executive" className="dd-cross-link"><Users size={14} /> View Cabinet & Executive</Link>
          <button onClick={handleExportLeaderPDF} disabled={pdfGenerating} style={{ padding: '0.4rem 1rem', background: 'rgba(18,182,207,0.15)', border: '1px solid #12B6CF', borderRadius: '6px', color: '#12B6CF', cursor: 'pointer', fontSize: '0.85rem' }}>
            <PoundSterling size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {pdfGenerating ? 'Generating...' : "Leader's Briefing PDF"}
          </button>
        </div>
      </div>

      {/* Hero stats */}
      {totals && (
        <div className="stat-grid stat-grid-4">
          <StatCard
            title="Total Pipeline"
            value={`${formatCurrency(totals.totalLow)}–${formatCurrency(totals.totalHigh)}`}
            icon={<TrendingUp size={24} />}
            trend="identified"
          />
          <StatCard
            title="MTFS Target"
            value={formatCurrency(totals.mtfsTarget)}
            icon={<Target size={24} />}
            subtitle="Year 1 (2026/27)"
          />
          <StatCard
            title="Coverage"
            value={`${totals.coveragePct}%`}
            icon={<Shield size={24} />}
            trend={totals.coveragePct >= 100 ? 'up' : 'down'}
            subtitle="Identified vs MTFS"
          />
          <StatCard
            title="Prior Year Gap"
            value={formatCurrency(totals.priorGap)}
            icon={<AlertTriangle size={24} />}
            subtitle={`${totals.priorPct}% delivered`}
            trend="down"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="dashboard-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`dashboard-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Command Centre Tab */}
      {activeTab === 'command' && (
        <div className="tab-content">
          {/* Directorate Cards */}
          <CollapsibleSection title="Directorate Savings Overview" defaultOpen icon={<BarChart3 size={18} />}>
            <div className="directorate-cards">
              {directorateProfiles.map(dp => {
                const risk = riskProfiles[dp.directorate_id]
                return (
                  <Link key={dp.directorate_id} to={`/directorate/${dp.directorate_id}`} className="directorate-card">
                    <div className="dc-header">
                      <h3>{dp.title}</h3>
                      <span className="dc-director">{dp.executive_director}</span>
                    </div>
                    <div className="dc-budget-bar">
                      <div className="dc-bar-label">Budget: {formatCurrency(dp.net_budget)}</div>
                      <div className="dc-bar-track">
                        <div className="dc-bar-mtfs" style={{ width: `${Math.min(100, (dp.mtfs_target || 0) / (dp.net_budget || 1) * 100 * 10)}%` }} title={`MTFS: ${formatCurrency(dp.mtfs_target)}`} />
                        <div className="dc-bar-identified" style={{ width: `${Math.min(100, (dp.savings_range?.midpoint || 0) / (dp.net_budget || 1) * 100 * 10)}%` }} title={`Identified: ${formatCurrency(dp.savings_range?.midpoint)}`} />
                      </div>
                    </div>
                    <div className="dc-metrics">
                      <span className="dc-metric">
                        <strong>{dp.lever_count}</strong> levers
                      </span>
                      <span className="dc-metric">
                        <strong>{dp.coverage_pct || 0}%</strong> MTFS coverage
                      </span>
                      <span className="dc-metric" title="Evidence strength">
                        <strong>{dp.avg_evidence_strength}</strong>/100 evidence
                      </span>
                      {contractCounts[dp.directorate_id] > 0 && (
                        <span className="dc-expiry-badge" title="Contracts expiring within 3 months">
                          {contractCounts[dp.directorate_id]} expiring
                        </span>
                      )}
                      {risk && (
                        <span className="dc-risk-badge" style={{ color: risk.risk_color }}>
                          {risk.risk_level}
                        </span>
                      )}
                    </div>
                    {dp.kpi_headline && (
                      <div className="dc-kpi-badge">{dp.kpi_headline}</div>
                    )}
                    {dp.prior_year && (
                      <div className="dc-prior">
                        Prior year: {dp.prior_year.achieved_pct}% of {formatCurrency(dp.prior_year.target)} delivered
                      </div>
                    )}
                    <div className="dc-arrow"><ChevronRight size={16} /></div>
                  </Link>
                )
              })}
            </div>
          </CollapsibleSection>

          {/* Monday Morning List */}
          <CollapsibleSection title="Monday Morning List — Top 10 Actions" defaultOpen icon={<Zap size={18} />}>
            <div className="monday-list">
              {mondayList.map((d, i) => (
                <div key={i} className="monday-item">
                  <span className="monday-rank">#{i + 1}</span>
                  <div className="monday-content">
                    <strong className="monday-action">DO</strong> {d.action}
                    {d.save_range && <span className="monday-save">SAVE {d.save_range}</span>}
                  </div>
                  <span className="monday-portfolio">{d.portfolio_title || d.portfolio_id}</span>
                </div>
              ))}
              {mondayList.length === 0 && <p className="empty-message">No directives generated yet.</p>}
            </div>
          </CollapsibleSection>

          {/* Spending Intelligence */}
          {spendingSummary && Object.keys(spendingByDirectorate).length > 0 && (
            <CollapsibleSection title={`Spending Intelligence — ${formatCurrency(spendingSummary.total_spend)} tracked (${spendingSummary.coverage?.pct || 0}% classified)`} icon={<PoundSterling size={18} />}>
              <div className="spending-intel-grid">
                {portfolioData?.directorates?.map(d => {
                  const ds = spendingByDirectorate[d.id]
                  if (!ds || ds.total === 0) return null
                  return (
                    <div key={d.id} className="spending-directorate-card">
                      <div className="spending-directorate-header">
                        <Link to={`/directorate/${d.id}`}>{d.title.split(',')[0]}</Link>
                        <span className="spending-directorate-total">{formatCurrency(ds.total)}</span>
                      </div>
                      <div className="spending-directorate-meta">
                        <span>{ds.suppliers} suppliers</span>
                        <span>{ds.portfolio_count} portfolios</span>
                      </div>
                      {ds.alerts.length > 0 && (
                        <div className="spending-directorate-alerts">
                          {ds.alerts.map((a, i) => (
                            <div key={i} className="spending-alert-item">
                              <AlertTriangle size={12} />
                              {a.type === 'variance' ? `${a.portfolio}: ${a.pct > 0 ? '+' : ''}${a.pct}% budget variance` : `${a.portfolio}: HHI ${a.hhi} (${a.top})`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {spendingLoading && <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginTop: '8px' }}>Loading full spending data...</p>}
            </CollapsibleSection>
          )}

          {/* Fiscal System Overview */}
          {fiscalSystem && (
            <CollapsibleSection title={`Fiscal System — ${fiscalSystem.service_model_count}/${fiscalSystem.total_portfolios} portfolios modelled`} icon={<Shield size={18} />}>
              <div className="fiscal-system-grid">
                <StatCard label="Service Models" value={`${fiscalSystem.service_model_coverage}%`} color={fiscalSystem.service_model_coverage >= 50 ? '#28a745' : '#fd7e14'} icon={<BarChart3 size={18} />} />
                <StatCard label="Net Position" value={formatCurrency(fiscalSystem.net_position)} color={fiscalSystem.net_position >= 0 ? '#28a745' : '#dc3545'} icon={<TrendingUp size={18} />} />
                {fiscalSystem.inspection_summary.length > 0 && (
                  <StatCard label="Inspections" value={`${fiscalSystem.inspection_summary.length} active`} color="#fd7e14" icon={<AlertTriangle size={18} />} />
                )}
              </div>

              {/* Service Model Coverage badges */}
              <div className="fiscal-coverage-badges">
                {fiscalSystem.portfolios.map(p => (
                  <Link key={p.id} to={`/portfolio/${p.id}`} className={`fiscal-badge ${p.has_service_model ? 'modelled' : 'descriptive'}`}>
                    <span className="fiscal-badge-dot" />
                    <span className="fiscal-badge-name">{p.title}</span>
                    {p.has_service_model && <span className="fiscal-badge-types">{p.model_types.join(', ')}</span>}
                  </Link>
                ))}
              </div>

              {/* Inspection Status */}
              {fiscalSystem.inspection_summary.length > 0 && (
                <div className="fiscal-inspections">
                  <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', marginBottom: '8px' }}>Inspection Status</h4>
                  {fiscalSystem.inspection_summary.map((ins, i) => (
                    <div key={i} className="fiscal-inspection-row">
                      <span className="fiscal-inspection-portfolio">{ins.portfolio}</span>
                      <span className={`fiscal-inspection-rating ${ins.current_rating?.toLowerCase().includes('requires') ? 'requires-improvement' : ins.current_rating?.toLowerCase().includes('good') ? 'good' : ''}`}>
                        {ins.current_rating}
                      </span>
                      <span className="fiscal-inspection-target">→ {ins.target_rating}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Demand Pressure Heatmap */}
              {fiscalSystem.portfolios.some(p => p.demand_annual > 0 || p.savings_central > 0) && (
                <div className="fiscal-demand-matrix">
                  <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', marginBottom: '8px' }}>Demand vs Savings by Portfolio</h4>
                  <ChartCard title="" subtitle="">
                    <ResponsiveContainer width="100%" height={Math.max(180, fiscalSystem.portfolios.filter(p => p.demand_annual > 0 || p.savings_central > 0).length * 40)}>
                      <BarChart data={fiscalSystem.portfolios.filter(p => p.demand_annual > 0 || p.savings_central > 0)} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                        <XAxis type="number" tick={AXIS_TICK_STYLE} tickFormatter={v => `£${(v / 1000000).toFixed(0)}M`} />
                        <YAxis type="category" dataKey="title" tick={AXIS_TICK_STYLE} width={80} />
                        <RechartsTooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                        <Legend />
                        <Bar dataKey="demand_annual" name="Demand Pressure" fill="#dc3545" {...CHART_ANIMATION} />
                        <Bar dataKey="savings_central" name="Savings Identified" fill="#28a745" {...CHART_ANIMATION} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>
              )}
            </CollapsibleSection>
          )}

          {/* Savings Tier Breakdown */}
          {tierData.length > 0 && (
            <CollapsibleSection title="Savings by Tier" icon={<Target size={18} />}>
              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '0 0 280px' }}>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={tierData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={100} paddingAngle={3} {...CHART_ANIMATION}>
                        {tierData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={v => `£${Number(v).toFixed(1)}M`} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  {tierData.map((t, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <span style={{ color: CHART_COLORS[i % CHART_COLORS.length], fontWeight: 600 }}>{t.name}</span>
                      <span style={{ color: 'rgba(255,255,255,0.7)' }}>£{t.value.toFixed(1)}M ({formatCurrency(t.rawValue)})</span>
                    </div>
                  ))}
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* Top 10 Savings Levers */}
          {topLeversData.length > 0 && (
            <CollapsibleSection title="Top 10 Savings Levers" icon={<TrendingUp size={18} />}>
              <ChartCard title="" subtitle="">
                <ResponsiveContainer width="100%" height={Math.max(280, topLeversData.length * 36)}>
                  <BarChart data={topLeversData} layout="vertical" margin={{ left: 10, right: 40, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis type="number" tick={AXIS_TICK_STYLE} tickFormatter={v => `£${v.toFixed(0)}M`} />
                    <YAxis dataKey="name" type="category" tick={AXIS_TICK_STYLE} width={180} />
                    <RechartsTooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v, name, props) => [`£${Number(v).toFixed(1)}M`, `${props.payload.portfolio}: ${props.payload.range}`]} />
                    <Bar dataKey="value" name="Midpoint (£M)" fill="#12B6CF" {...CHART_ANIMATION}>
                      <LabelList dataKey="value" position="right" formatter={v => `£${Number(v).toFixed(1)}M`} fill="rgba(255,255,255,0.6)" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </CollapsibleSection>
          )}

          {/* MTFS Coverage Gauge */}
          {totals && (
            <CollapsibleSection title="MTFS Coverage" icon={<Shield size={18} />}>
              <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
                <GaugeChart
                  value={Math.min(totals.coveragePct, 200)}
                  max={200}
                  label="MTFS Coverage %"
                  size={180}
                  severity={totals.coveragePct >= 100 ? 'low' : totals.coveragePct >= 80 ? 'medium' : totals.coveragePct >= 50 ? 'high' : 'critical'}
                />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: totals.coveragePct >= 100 ? '#28a745' : '#dc3545' }}>
                    {totals.coveragePct}%
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
                    {formatCurrency(totals.midpoint)} of {formatCurrency(totals.mtfsTarget)} target
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: '4px' }}>
                    Range: {formatCurrency(totals.totalLow)} - {formatCurrency(totals.totalHigh)}
                  </div>
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* Treasury Opportunity */}
          {treasurySummary && (
            <CollapsibleSection title={`Treasury Opportunity — ${formatCurrency(treasurySummary.total)} identified`} icon={<PoundSterling size={18} />}>
              <div className="stat-grid stat-grid-4">
                <StatCard title="Idle Cash" value={formatCurrency(treasurySummary.idle_cash_cost)} icon={<PoundSterling size={18} />} subtitle="Move to MMFs/gilts" />
                <StatCard title="Refinancing" value={formatCurrency(treasurySummary.refinancing_potential)} icon={<TrendingUp size={18} />} subtitle="PWLB legacy loans" />
                <StatCard title="MRP Switch" value={formatCurrency(treasurySummary.mrp_method_saving)} icon={<Target size={18} />} subtitle="Asset life method" />
                <StatCard title="Total Treasury" value={formatCurrency(treasurySummary.total)} icon={<Zap size={18} />} trend="up" />
              </div>
            </CollapsibleSection>
          )}

          {/* Workforce Overview */}
          {workforceSummary && (
            <CollapsibleSection title="Workforce Overview" icon={<Users size={18} />}>
              <div className="stat-grid stat-grid-4">
                <StatCard title="Total FTE" value={workforceSummary.fte.toLocaleString()} icon={<Users size={18} />} />
                <StatCard title="Vacancies" value={workforceSummary.vacancies.toLocaleString()} icon={<AlertTriangle size={18} />} subtitle={`${workforceSummary.fte > 0 ? Math.round(workforceSummary.vacancies / workforceSummary.fte * 100) : 0}% rate`} />
                <StatCard title="Agency Spend" value={formatCurrency(workforceSummary.agency_spend)} icon={<PoundSterling size={18} />} trend="down" />
                <StatCard title="Agency FTE" value={workforceSummary.agency_fte.toLocaleString()} icon={<Users size={18} />} />
              </div>
              <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Portfolio</th>
                      <th style={{ textAlign: 'right' }}>FTE</th>
                      <th style={{ textAlign: 'right' }}>Vacancy %</th>
                      <th style={{ textAlign: 'right' }}>Agency Spend</th>
                      <th style={{ textAlign: 'right' }}>Span</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolioData.portfolios.filter(p => p.workforce).map(p => (
                      <tr key={p.id}>
                        <td><Link to={`/portfolio/${p.id}`}>{p.short_title || p.title}</Link></td>
                        <td style={{ textAlign: 'right' }}>{p.workforce.fte_headcount?.toLocaleString()}</td>
                        <td style={{ textAlign: 'right', color: p.workforce.vacancy_rate_pct > 10 ? '#dc3545' : p.workforce.vacancy_rate_pct > 7 ? '#fd7e14' : '#28a745' }}>
                          {p.workforce.vacancy_rate_pct}%
                        </td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(p.workforce.agency_spend)}</td>
                        <td style={{ textAlign: 'right' }}>{p.workforce.span_of_control ? `1:${p.workforce.span_of_control}` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          )}
        </div>
      )}

      {/* Directorates Tab */}
      {activeTab === 'directorates' && (
        <div className="tab-content">
          <ChartCard title="MTFS Target vs Identified Savings by Directorate" subtitle="£ millions">
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={mtfsChartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis type="number" tick={AXIS_TICK_STYLE} tickFormatter={v => `£${v.toFixed(0)}M`} />
                <YAxis dataKey="name" type="category" tick={AXIS_TICK_STYLE} width={100} />
                <RechartsTooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v) => v != null ? `£${Number(v).toFixed(1)}M` : '—'} />
                <Legend />
                <Bar dataKey="mtfs" name="MTFS Target" fill="#dc3545" {...CHART_ANIMATION} />
                <Bar dataKey="identified_low" name="Identified (low)" stackId="identified" fill="#12B6CF" {...CHART_ANIMATION} />
                <Bar dataKey="identified_high" name="Identified (additional)" stackId="identified" fill="rgba(18,182,207,0.4)" {...CHART_ANIMATION} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Savings Timeline" subtitle="When savings can be realised">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={timelineData} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
                <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `£${v.toFixed(0)}M`} />
                <RechartsTooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v) => v != null ? `£${Number(v).toFixed(1)}M` : '—'} />
                <Bar dataKey="value" name="Savings (£M)" {...CHART_ANIMATION}>
                  {timelineData.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                  <LabelList dataKey="value" position="top" formatter={v => v > 0 ? `£${Number(v).toFixed(1)}M` : ''} fill="rgba(255,255,255,0.7)" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {/* MTFS Tracker Tab */}
      {activeTab === 'mtfs' && totals && (
        <div className="tab-content">
          <div className="mtfs-tracker">
            <div className="mtfs-row">
              <span className="mtfs-label">Year 1 Target (2026/27)</span>
              <div className="mtfs-bar-track">
                <div className="mtfs-bar-fill" style={{ width: `${Math.min(100, totals.coveragePct)}%` }} />
              </div>
              <span className="mtfs-value">{totals.coveragePct}%</span>
            </div>
            <div className="mtfs-row">
              <span className="mtfs-label">Two-Year Target</span>
              <div className="mtfs-bar-track">
                <div className="mtfs-bar-fill" style={{
                  width: `${Math.min(100, portfolioData?.administration?.mtfs?.savings_targets?.two_year_total
                    ? Math.round(totals.midpoint / portfolioData.administration.mtfs.savings_targets.two_year_total * 100) : 0)}%`
                }} />
              </div>
              <span className="mtfs-value">
                {portfolioData?.administration?.mtfs?.savings_targets?.two_year_total
                  ? Math.round(totals.midpoint / portfolioData.administration.mtfs.savings_targets.two_year_total * 100) : 0}%
              </span>
            </div>
          </div>

          <CollapsibleSection title="Prior Year Performance Warning" defaultOpen icon={<AlertTriangle size={18} />}>
            <div className="prior-year-warning">
              <p>
                <strong>2024/25 savings target: {formatCurrency(totals.priorTarget)}</strong> — only{' '}
                <strong>{totals.priorPct}%</strong> delivered ({formatCurrency(Math.round(totals.priorTarget * totals.priorPct / 100))}).
              </p>
              <p>
                Adult Social Care alone had a <strong>{formatCurrency(portfolioData?.administration?.mtfs?.prior_year_performance?.adult_services_shortfall || 0)}</strong> shortfall
                and overspent by <strong>{formatCurrency(portfolioData?.administration?.mtfs?.prior_year_performance?.adult_services_overspend || 0)}</strong>.
              </p>
              <p className="warning-emphasis">
                The 2026/27 target is {formatCurrency(totals.mtfsTarget)}. At the prior year delivery rate,
                only {formatCurrency(Math.round(totals.mtfsTarget * totals.priorPct / 100))} would be delivered —
                a {formatCurrency(Math.round(totals.mtfsTarget * (1 - totals.priorPct / 100)))} gap.
              </p>
            </div>
          </CollapsibleSection>

          {/* Per-directorate MTFS breakdown */}
          <CollapsibleSection title="Directorate MTFS Breakdown" icon={<Target size={18} />}>
            <div className="mtfs-breakdown">
              {directorateProfiles.map(dp => (
                <div key={dp.directorate_id} className="mtfs-dir-row">
                  <Link to={`/directorate/${dp.directorate_id}`} className="mtfs-dir-name">{dp.title}</Link>
                  <span className="mtfs-dir-target">Target: {formatCurrency(dp.mtfs_target)}</span>
                  <span className="mtfs-dir-identified">
                    Identified: {formatCurrency(dp.savings_range?.low)}–{formatCurrency(dp.savings_range?.high)}
                  </span>
                  <span className={`mtfs-dir-coverage ${(dp.coverage_pct || 0) >= 100 ? 'covered' : 'gap'}`}>
                    {dp.coverage_pct || 0}%
                  </span>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  )
}
