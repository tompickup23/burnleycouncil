import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Target, TrendingUp, Shield, Zap, BarChart3, AlertTriangle, Scale,
  ChevronRight, Clock, Users, Calendar, FileText, Download, Eye, PoundSterling,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend, Cell, ScatterChart, Scatter, ZAxis,
} from 'recharts'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { isFirebaseEnabled } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { LoadingState } from '../components/ui'
import { StatCard } from '../components/ui/StatCard'
import { ChartCard, CHART_TOOLTIP_STYLE } from '../components/ui/ChartCard'
import CollapsibleSection from '../components/CollapsibleSection'
import { CHART_COLORS, GRID_STROKE, AXIS_TICK_STYLE, CHART_ANIMATION } from '../utils/constants'
import {
  buildDirectorateSavingsProfile,
  evidenceChainStrength,
  directorateKPITracker,
  benchmarkDirectorate,
  directorateRiskProfile,
  generateDirectives,
  generateAllDirectives,
  generateReformPlaybook,
  meetingBriefing,
  politicalContext,
  formatCurrency,
  parseSavingRange,
  timelineBucket,
  fundingConstraints,
  spendingBudgetVariance,
  spendingConcentration,
} from '../utils/savingsEngine'
import { useSpendingSummary } from '../hooks/useSpendingSummary'
import './DirectorateDetail.css'

const TIMELINE_ORDER = { immediate: 0, short_term: 1, medium_term: 2, long_term: 3 }
const TIMELINE_LABELS = { immediate: 'Immediate', short_term: '3-6 months', medium_term: '6-18 months', long_term: '18+ months' }
const EVIDENCE_COLORS = { high: '#28a745', medium: '#ffc107', low: '#dc3545' }

function evidenceLabel(score) {
  if (score >= 70) return { label: 'Strong', color: EVIDENCE_COLORS.high }
  if (score >= 40) return { label: 'Moderate', color: EVIDENCE_COLORS.medium }
  return { label: 'Weak', color: EVIDENCE_COLORS.low }
}

/**
 * DirectorateDetail — Deep savings intelligence per directorate.
 *
 * 5 tabs:
 *  1. Savings Overview (PUBLIC) — KPI→Savings evidence chains + pipeline
 *  2. Performance (PUBLIC) — Inspection ratings, demand, contracts
 *  3. Savings Detail (COUNCILLOR+) — Full evidence expansion, priority matrix
 *  4. Political Impact (COUNCILLOR+) — Reform framing, opposition predictions
 *  5. Action Plan (CABINET_MEMBER+) — Playbook, FOI, implementation calendar
 */
export default function DirectorateDetail() {
  const { directorateId } = useParams()
  const config = useCouncilConfig()
  const dataSources = config.data_sources || {}
  const authCtx = useAuth()
  const [activeTab, setActiveTab] = useState('savings_overview')

  const isCouncillor = authCtx?.isCouncillor || !isFirebaseEnabled
  const isCabinetLevel = authCtx?.isCabinetLevel || !isFirebaseEnabled
  const { summary: spendingSummary } = useSpendingSummary()

  const { data: allData, loading, error } = useData(
    dataSources.cabinet_portfolios
      ? ['/data/cabinet_portfolios.json', '/data/doge_findings.json', '/data/budgets.json',
         '/data/meetings.json', '/data/council_documents.json', '/data/procurement.json']
      : null
  )

  const [portfolioData, findingsData, budgetsData, meetingsData, documentsData, procurementData] = allData || Array(6).fill(null)

  const directorate = useMemo(() =>
    portfolioData?.directorates?.find(d => d.id === directorateId) || null,
  [portfolioData, directorateId])

  const portfolios = useMemo(() => {
    if (!directorate || !portfolioData?.portfolios) return []
    return portfolioData.portfolios.filter(p => directorate.portfolio_ids?.includes(p.id))
  }, [directorate, portfolioData])

  // Build savings profile
  const profile = useMemo(() => {
    if (!directorate) return null
    return buildDirectorateSavingsProfile(directorate, portfolioData?.portfolios, findingsData, portfolioData)
  }, [directorate, portfolioData, findingsData])

  // KPI tracker
  const kpiData = useMemo(() => {
    if (!directorate) return null
    return directorateKPITracker(directorate, portfolios)
  }, [directorate, portfolios])

  // Risk profile
  const riskData = useMemo(() => {
    if (!directorate) return null
    return directorateRiskProfile(directorate, portfolios, [], { findings: findingsData })
  }, [directorate, portfolios, findingsData])

  // Benchmark
  const benchmark = useMemo(() => {
    if (!directorate) return null
    return benchmarkDirectorate(directorate, portfolios, budgetsData)
  }, [directorate, portfolios, budgetsData])

  // Directorate-level spending intelligence
  const directorateSpending = useMemo(() => {
    if (!spendingSummary?.by_portfolio || !portfolios.length) return null
    let total = 0, suppliers = 0, transactions = 0
    const portfolioBreakdown = []
    for (const p of portfolios) {
      const ps = spendingSummary.by_portfolio[p.id]
      if (ps) {
        total += ps.total || 0
        suppliers += ps.unique_suppliers || 0
        transactions += ps.count || 0
        const variance = spendingBudgetVariance(p, spendingSummary)
        const concentration = spendingConcentration(ps)
        portfolioBreakdown.push({ id: p.id, title: p.title, total: ps.total, suppliers: ps.unique_suppliers, variance, concentration })
      }
    }
    if (total === 0) return null
    return { total, suppliers, transactions, portfolioBreakdown }
  }, [spendingSummary, portfolios])

  // All levers with evidence scores
  const allLevers = useMemo(() => {
    const levers = []
    for (const p of portfolios) {
      for (const lever of (p.savings_levers || [])) {
        const score = evidenceChainStrength(lever)
        const range = parseSavingRange(lever.est_saving)
        levers.push({
          ...lever,
          portfolio_id: p.id,
          portfolio_title: p.title || p.short_title,
          evidence_score: score,
          saving_low: range.low,
          saving_high: range.high,
          timeline_bucket: timelineBucket(lever.timeline),
        })
      }
    }
    return levers.sort((a, b) => b.evidence_score - a.evidence_score)
  }, [portfolios])

  // Directives across all portfolios in this directorate
  const procurementContracts = Array.isArray(procurementData) ? procurementData : procurementData?.contracts || []
  const fundingModel = portfolioData?.administration?.funding_model || null
  const allDirectives = useMemo(() => {
    if (!findingsData) return []
    const directives = []
    for (const p of portfolios) {
      directives.push(...generateDirectives(p, findingsData, [], { procurement: procurementContracts, fundingModel }))
    }
    return directives
  }, [portfolios, findingsData, procurementContracts, fundingModel])

  // Playbook (first portfolio as representative)
  const playbook = useMemo(() => {
    if (!portfolios.length) return null
    return generateReformPlaybook(portfolios[0], allDirectives)
  }, [portfolios, allDirectives])

  // Political context
  const politicalCtx = useMemo(() => {
    if (!portfolios.length) return null
    return politicalContext(portfolios[0], { dogeFindings: findingsData })
  }, [portfolios, findingsData])

  // Scatter data for priority matrix
  const scatterData = useMemo(() =>
    allDirectives.map(d => ({
      x: d.feasibility || 5,
      y: d.impact || 5,
      z: (d.save_central || 0) / 100000,
      name: d.action?.substring(0, 50),
    })),
  [allDirectives])

  // Meetings for this directorate
  const relevantMeetings = useMemo(() => {
    const meetings = Array.isArray(meetingsData) ? meetingsData : meetingsData?.meetings || []
    const committees = portfolios.flatMap(p => [p.scrutiny_committee?.name, p.scrutiny_committee?.id]).filter(Boolean)
    return meetings.filter(m => committees.some(c => m.committee?.toLowerCase().includes(c.toLowerCase())))
  }, [meetingsData, portfolios])

  // Key contracts
  const keyContracts = useMemo(() =>
    portfolios.flatMap(p => (p.key_contracts || []).map(c => ({ ...c, portfolio: p.title || p.short_title }))),
  [portfolios])

  // Funding constraints per portfolio in this directorate
  const directorateFunding = useMemo(() => {
    if (!fundingModel) return null
    const constraints = portfolios.map(p => ({ portfolio: p.title || p.short_title, ...fundingConstraints(p, fundingModel) })).filter(c => c.grants?.length > 0)
    if (!constraints.length) return null
    const totalRingFenced = constraints.reduce((s, c) => s + c.ring_fenced_total, 0)
    const totalBudget = constraints.reduce((s, c) => s + c.total_budget, 0)
    return { constraints, totalRingFenced, totalBudget, addressable: Math.max(0, totalBudget - totalRingFenced) }
  }, [portfolios, fundingModel])

  // Performance metrics chart
  const metricsChartData = useMemo(() => {
    if (!directorate?.performance_metrics) return []
    return directorate.performance_metrics
      .filter(m => typeof m.value === 'number' || typeof m.score === 'number')
      .map(m => ({
        name: m.name?.length > 25 ? m.name.substring(0, 22) + '...' : m.name,
        value: m.score ?? m.value,
        target: m.max ?? m.target ?? 100,
        fullName: m.name,
      }))
  }, [directorate])

  if (!dataSources.cabinet_portfolios) return <div className="page-empty"><p>Not available for this council.</p></div>
  if (loading) return <LoadingState message="Loading directorate intelligence..." />
  if (error || !portfolioData) return <div className="page-empty"><p>Failed to load directorate data.</p></div>
  if (!directorate) return (
    <div className="directorate-detail">
      <Link to="/cabinet" className="dd-back">← Savings Command Centre</Link>
      <h1>Directorate Not Found</h1>
      <p>No directorate with ID &quot;{directorateId}&quot;</p>
    </div>
  )

  const tabs = [
    { id: 'savings_overview', label: 'Savings Overview', icon: <TrendingUp size={14} />, public: true },
    { id: 'performance', label: 'Performance', icon: <BarChart3 size={14} />, public: true },
    { id: 'savings_detail', label: 'Savings Detail', icon: <Target size={14} />, minRole: 'councillor' },
    { id: 'political', label: 'Political Impact', icon: <Scale size={14} />, minRole: 'councillor' },
    { id: 'action_plan', label: 'Action Plan', icon: <Zap size={14} />, minRole: 'cabinet' },
  ]

  const visibleTabs = tabs.filter(t => {
    if (t.public) return true
    if (t.minRole === 'councillor') return isCouncillor
    if (t.minRole === 'cabinet') return isCabinetLevel
    return true
  })

  return (
    <div className="directorate-detail">
      <Link to="/cabinet" className="dd-back">← Savings Command Centre</Link>

      {/* Hero */}
      <div className="dd-hero">
        <h1>{directorate.title}</h1>
        <p className="dd-subtitle">Executive Director: {directorate.executive_director}</p>
        {directorate.kpi_headline && <div className="dd-kpi-headline">{directorate.kpi_headline}</div>}
      </div>

      {/* Hero stats */}
      {profile && (
        <div className="stat-grid stat-grid-4">
          <StatCard title="Net Budget" value={formatCurrency(profile.net_budget)} icon={<BarChart3 size={24} />} />
          <StatCard title="Savings Pipeline" value={`${formatCurrency(profile.savings_range?.low)}–${formatCurrency(profile.savings_range?.high)}`} icon={<TrendingUp size={24} />} />
          <StatCard title="MTFS Target" value={formatCurrency(profile.mtfs_target)} icon={<Target size={24} />} subtitle={`Coverage: ${profile.coverage_pct || 0}%`} />
          <StatCard title="Evidence Strength" value={`${profile.avg_evidence_strength}/100`} icon={<Shield size={24} />} subtitle={evidenceLabel(profile.avg_evidence_strength).label} />
        </div>
      )}

      {/* Tab nav */}
      <div className="dd-tabs">
        {visibleTabs.map(t => (
          <button key={t.id} className={`dd-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: Savings Overview (PUBLIC) */}
      {activeTab === 'savings_overview' && (
        <div className="dd-tab-content">
          {/* KPI → Savings Evidence Chains */}
          <CollapsibleSection title="KPI → Savings Evidence Chains" defaultOpen icon={<TrendingUp size={18} />}>
            <div className="evidence-chains">
              {(directorate.performance_metrics || []).filter(m => m.savings_link).map((m, i) => (
                <div key={i} className="evidence-chain-card">
                  <div className="ec-kpi">
                    <span className="ec-kpi-name">{m.name}</span>
                    <span className="ec-kpi-value">{typeof m.value === 'number' ? m.value : m.value}{m.unit ? m.unit : ''}</span>
                    {m.target && <span className="ec-kpi-target">Target: {m.target}{m.unit || ''}</span>}
                  </div>
                  <div className="ec-arrow"><ChevronRight size={14} /></div>
                  <div className="ec-savings-link">{m.savings_link}</div>
                </div>
              ))}
              {!(directorate.performance_metrics || []).some(m => m.savings_link) && (
                <p className="empty-message">No KPI→savings evidence chains available.</p>
              )}
            </div>
          </CollapsibleSection>

          {/* Savings Pipeline */}
          <CollapsibleSection title="Savings Pipeline" defaultOpen icon={<Target size={18} />}>
            <div className="savings-pipeline">
              <table className="dd-table">
                <thead>
                  <tr>
                    <th>Lever</th>
                    <th>Save Range</th>
                    <th>Timeline</th>
                    <th>Evidence</th>
                    <th>Sources</th>
                    <th>Portfolio</th>
                  </tr>
                </thead>
                <tbody>
                  {allLevers.map((l, i) => {
                    const ev = evidenceLabel(l.evidence_score)
                    const refs = l.evidence?.article_refs || []
                    return (
                      <tr key={i}>
                        <td className="dd-lever-name">{l.lever}</td>
                        <td>{l.est_saving || '—'}</td>
                        <td>{TIMELINE_LABELS[l.timeline_bucket] || l.timeline || '—'}</td>
                        <td>
                          <span className="dd-evidence-badge" style={{ color: ev.color }}>{l.evidence_score}</span>
                        </td>
                        <td>
                          {refs.length > 0 ? (
                            <span className="dd-article-refs">
                              {refs.map((r, j) => (
                                <Link key={j} to={`/news/${r.id}`} className="dd-article-link" title={r.title}><FileText size={12} /></Link>
                              ))}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="dd-portfolio-tag">{l.portfolio_title}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {allLevers.length === 0 && <p className="empty-message">No savings levers identified.</p>}
            </div>
          </CollapsibleSection>

          {/* MTFS Coverage */}
          {profile && (
            <CollapsibleSection title="Savings vs MTFS Target" icon={<BarChart3 size={18} />}>
              <div className="dd-mtfs-comparison">
                <div className="dd-mtfs-bar-row">
                  <span className="dd-mtfs-label">MTFS Target</span>
                  <div className="dd-mtfs-bar-track">
                    <div className="dd-mtfs-bar-target" style={{ width: '100%' }} />
                  </div>
                  <span className="dd-mtfs-val">{formatCurrency(profile.mtfs_target)}</span>
                </div>
                <div className="dd-mtfs-bar-row">
                  <span className="dd-mtfs-label">Identified (low)</span>
                  <div className="dd-mtfs-bar-track">
                    <div className="dd-mtfs-bar-fill" style={{ width: `${Math.min(100, (profile.savings_range?.low || 0) / (profile.mtfs_target || 1) * 100)}%` }} />
                  </div>
                  <span className="dd-mtfs-val">{formatCurrency(profile.savings_range?.low)}</span>
                </div>
                <div className="dd-mtfs-bar-row">
                  <span className="dd-mtfs-label">Identified (high)</span>
                  <div className="dd-mtfs-bar-track">
                    <div className="dd-mtfs-bar-fill dd-mtfs-bar-high" style={{ width: `${Math.min(100, (profile.savings_range?.high || 0) / (profile.mtfs_target || 1) * 100)}%` }} />
                  </div>
                  <span className="dd-mtfs-val">{formatCurrency(profile.savings_range?.high)}</span>
                </div>
                {profile.prior_year && (
                  <div className="dd-mtfs-bar-row">
                    <span className="dd-mtfs-label">Prior Year</span>
                    <div className="dd-mtfs-bar-track">
                      <div className="dd-mtfs-bar-prior" style={{ width: `${Math.min(100, (profile.prior_year.achieved || 0) / (profile.mtfs_target || 1) * 100)}%` }} />
                    </div>
                    <span className="dd-mtfs-val">{formatCurrency(profile.prior_year.achieved)} ({profile.prior_year.achieved_pct}%)</span>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* Directorate narrative */}
          {directorate.savings_narrative && (
            <CollapsibleSection title="Savings Context" icon={<FileText size={18} />}>
              <p className="dd-narrative">{directorate.savings_narrative}</p>
            </CollapsibleSection>
          )}

          {/* Directorate Spending Intelligence */}
          {directorateSpending && (
            <CollapsibleSection title="Spending Intelligence" defaultOpen icon={<PoundSterling size={18} />}>
              <div className="stat-grid stat-grid-3" style={{ marginBottom: '1rem' }}>
                <StatCard title="Actual Spend" value={formatCurrency(directorateSpending.total)} icon={<PoundSterling size={24} />} />
                <StatCard title="Transactions" value={directorateSpending.transactions.toLocaleString()} icon={<BarChart3 size={24} />} />
                <StatCard title="Unique Suppliers" value={directorateSpending.suppliers.toLocaleString()} icon={<Users size={24} />} />
              </div>
              <div className="dd-spending-portfolio-breakdown">
                {directorateSpending.portfolioBreakdown.map(pb => (
                  <div key={pb.id} className="dd-spending-portfolio-row">
                    <div className="dd-sp-header">
                      <Link to={`/cabinet/${pb.id}`} className="dd-sp-title">{pb.title}</Link>
                      <span className="dd-sp-total">{formatCurrency(pb.total)}</span>
                    </div>
                    <div className="dd-sp-meta">
                      <span>{pb.suppliers} suppliers</span>
                      {pb.variance && pb.variance.alert_level !== 'none' && (
                        <span className={`dd-sp-variance dd-sp-variance-${pb.variance.alert_level}`}>
                          {pb.variance.variance_pct > 0 ? '+' : ''}{pb.variance.variance_pct?.toFixed(1)}% vs budget
                        </span>
                      )}
                      {pb.concentration?.risk_level === 'high' && (
                        <span className="dd-sp-concentration-alert">⚠ High concentration (HHI {pb.concentration.hhi})</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <Link to="/spending" className="dd-spending-deep-link">
                View all transactions → Spending Explorer
              </Link>
            </CollapsibleSection>
          )}

          {/* Constituent Portfolios */}
          {portfolios.length > 0 && (
            <CollapsibleSection title="Portfolios in this Directorate" defaultOpen icon={<Users size={18} />}>
              <div className="dd-portfolio-cards">
                {portfolios.map(p => (
                  <Link key={p.id} to={`/cabinet/${p.id}`} state={{ from: `/directorate/${directorateId}` }} className="dd-portfolio-card">
                    <div className="dd-pc-header">
                      <h4>{p.short_title || p.title}</h4>
                      <span className="dd-pc-member">{p.cabinet_member?.name}</span>
                    </div>
                    {p.budget_latest?.net_expenditure && (
                      <span className="dd-pc-budget">{formatCurrency(p.budget_latest.net_expenditure)}</span>
                    )}
                    <span className="dd-pc-levers">{(p.savings_levers || []).length} savings levers</span>
                    <ChevronRight size={14} className="dd-pc-arrow" />
                  </Link>
                ))}
              </div>
            </CollapsibleSection>
          )}
        </div>
      )}

      {/* TAB 2: Performance (PUBLIC) */}
      {activeTab === 'performance' && (
        <div className="dd-tab-content">
          {/* Performance metrics */}
          {metricsChartData.length > 0 && (
            <ChartCard title="Performance Metrics" subtitle="Current vs target">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={metricsChartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis type="number" tick={AXIS_TICK_STYLE} />
                  <YAxis dataKey="name" type="category" tick={AXIS_TICK_STYLE} width={140} />
                  <RechartsTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="value" name="Current" fill="#12B6CF" {...CHART_ANIMATION} />
                  <Bar dataKey="target" name="Target" fill="rgba(255,255,255,0.15)" {...CHART_ANIMATION} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* KPI details with savings links */}
          <CollapsibleSection title="Performance Metrics — Savings Links" defaultOpen icon={<TrendingUp size={18} />}>
            <div className="dd-kpi-list">
              {kpiData?.metrics?.map((m, i) => (
                <div key={i} className={`dd-kpi-card dd-kpi-${m.trend || 'stable'}`}>
                  <div className="dd-kpi-header">
                    <span className="dd-kpi-name">{m.name}</span>
                    <span className={`dd-kpi-trend dd-trend-${m.trend || 'stable'}`}>{m.trend || 'stable'}</span>
                  </div>
                  <div className="dd-kpi-value">{m.value}{m.unit || ''}</div>
                  {m.savings_link && <p className="dd-kpi-savings-link">{m.savings_link}</p>}
                </div>
              )) || <p className="empty-message">No performance metrics available.</p>}
            </div>
          </CollapsibleSection>

          {/* Demand pressures */}
          <CollapsibleSection title="Demand Pressures" icon={<AlertTriangle size={18} />}>
            <div className="dd-pressures">
              {portfolios.flatMap(p => (p.known_pressures || []).map((pr, i) => (
                <div key={`${p.id}-${i}`} className="dd-pressure-item">
                  <AlertTriangle size={14} />
                  <span>{pr}</span>
                  <span className="dd-pressure-portfolio">{p.short_title || p.title}</span>
                </div>
              )))}
              {!portfolios.some(p => p.known_pressures?.length) && <p className="empty-message">No demand pressures documented.</p>}
            </div>
          </CollapsibleSection>

          {/* Key contracts */}
          {keyContracts.length > 0 && (
            <CollapsibleSection title="Key Contracts" icon={<FileText size={18} />}>
              <table className="dd-table">
                <thead>
                  <tr><th>Contract</th><th>Supplier</th><th>Value</th><th>Portfolio</th></tr>
                </thead>
                <tbody>
                  {keyContracts.map((c, i) => (
                    <tr key={i}>
                      <td>{c.name || c.service}</td>
                      <td>{c.supplier || '—'}</td>
                      <td>{c.value || c.annual_value || '—'}</td>
                      <td className="dd-portfolio-tag">{c.portfolio}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CollapsibleSection>
          )}

          {/* Funding constraints */}
          {directorateFunding && (
            <CollapsibleSection title="Funding Constraints" icon={<Scale size={18} />}>
              <div className="dd-funding-summary">
                <StatCard label="Ring-Fenced" value={formatCurrency(directorateFunding.totalRingFenced)} color="#e4002b" icon={<Shield size={18} />} />
                <StatCard label="Addressable" value={formatCurrency(directorateFunding.addressable)} icon={<Target size={18} />} />
              </div>
              {directorateFunding.constraints.map((c, i) => (
                <div key={i} className="dd-funding-portfolio">
                  <h4>{c.portfolio}: {c.addressable_pct}% addressable</h4>
                  {c.grants.map((g, j) => (
                    <div key={j} className="dd-funding-grant">
                      <span>{g.name} ({g.source})</span>
                      <span>{formatCurrency(g.value)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </CollapsibleSection>
          )}

          {/* Risk profile */}
          {riskData && (
            <CollapsibleSection title="Risk Profile" icon={<Shield size={18} />}>
              <div className="dd-risk-summary">
                <div className="dd-risk-level" style={{ color: riskData.risk_color }}>
                  {riskData.risk_level?.toUpperCase()} RISK
                </div>
                <div className="dd-risk-score">Score: {riskData.risk_score}/100</div>
                {riskData.inspection_risk && (
                  <div className="dd-risk-item">
                    <strong>Inspection:</strong> {riskData.inspection_risk.rating} — {riskData.inspection_risk.detail}
                  </div>
                )}
                {riskData.dsg_deficit_risk && (
                  <div className="dd-risk-item">
                    <strong>DSG Deficit:</strong> {riskData.dsg_deficit_risk.detail}
                  </div>
                )}
                {riskData.delivery_risk && (
                  <div className="dd-risk-item">
                    <strong>Savings Delivery:</strong> {riskData.delivery_risk.detail}
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}
        </div>
      )}

      {/* TAB 3: Savings Detail (COUNCILLOR+) */}
      {activeTab === 'savings_detail' && isCouncillor && (
        <div className="dd-tab-content">
          {/* Evidence-expanded levers */}
          <CollapsibleSection title="Savings Levers — Full Evidence" defaultOpen icon={<Target size={18} />}>
            <div className="dd-levers-expanded">
              {allLevers.map((l, i) => {
                const ev = evidenceLabel(l.evidence_score)
                return (
                  <div key={i} className="dd-lever-card">
                    <div className="dd-lever-header">
                      <h4>{l.lever}</h4>
                      <span className="dd-lever-save">{l.est_saving || '—'}</span>
                      <span className="dd-evidence-badge" style={{ color: ev.color }}>{ev.label} ({l.evidence_score})</span>
                    </div>
                    {l.evidence && (
                      <div className="dd-lever-evidence">
                        {l.evidence.data_points?.length > 0 && (
                          <div className="dd-ev-section">
                            <strong>Data Points</strong>
                            <ul>{l.evidence.data_points.map((dp, j) => <li key={j}>{dp}</li>)}</ul>
                          </div>
                        )}
                        {l.evidence.benchmark && (
                          <div className="dd-ev-section">
                            <strong>Benchmark</strong>
                            <p>{l.evidence.benchmark}</p>
                          </div>
                        )}
                        {l.evidence.calculation && (
                          <div className="dd-ev-section">
                            <strong>Calculation</strong>
                            <p>{l.evidence.calculation}</p>
                          </div>
                        )}
                        {l.evidence.kpi_link && (
                          <div className="dd-ev-section">
                            <strong>KPI Link</strong>
                            <p>{l.evidence.kpi_link}</p>
                          </div>
                        )}
                        {l.evidence.implementation_steps?.length > 0 && (
                          <div className="dd-ev-section">
                            <strong>Implementation Steps</strong>
                            <ol>
                              {l.evidence.implementation_steps.map((s, j) => (
                                <li key={j}>
                                  {s.step} {s.month && <span className="dd-step-month">({s.month})</span>}
                                  {s.cost && <span className="dd-step-cost">{s.cost}</span>}
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                        {l.evidence.political_framing && (
                          <div className="dd-ev-section dd-ev-political">
                            <strong>Political Framing</strong>
                            <p>{l.evidence.political_framing}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {!l.evidence && <p className="dd-no-evidence">No evidence chain documented — evidence score: {l.evidence_score}/100</p>}
                  </div>
                )
              })}
              {allLevers.length === 0 && <p className="empty-message">No savings levers identified.</p>}
            </div>
          </CollapsibleSection>

          {/* Priority matrix scatter */}
          {scatterData.length > 0 && (
            <ChartCard title="Priority Matrix" subtitle="Feasibility vs Impact (bubble size = savings)">
              <ResponsiveContainer width="100%" height={350}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="x" name="Feasibility" type="number" domain={[0, 10]} tick={AXIS_TICK_STYLE} label={{ value: 'Feasibility', position: 'bottom', fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} />
                  <YAxis dataKey="y" name="Impact" type="number" domain={[0, 10]} tick={AXIS_TICK_STYLE} label={{ value: 'Impact', angle: -90, position: 'left', fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} />
                  <ZAxis dataKey="z" range={[40, 400]} />
                  <RechartsTooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v, name) => name === 'z' ? `${v}` : v} />
                  <Scatter data={scatterData} fill="#12B6CF" />
                </ScatterChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Evidence strength heatmap */}
          <CollapsibleSection title="Evidence Strength by Lever" icon={<Eye size={18} />}>
            <div className="dd-evidence-heatmap">
              {allLevers.map((l, i) => {
                const ev = evidenceLabel(l.evidence_score)
                return (
                  <div key={i} className="dd-heatmap-row">
                    <span className="dd-heatmap-name">{l.lever}</span>
                    <div className="dd-heatmap-bar" style={{ width: `${l.evidence_score}%`, background: ev.color }} />
                    <span className="dd-heatmap-score">{l.evidence_score}</span>
                  </div>
                )
              })}
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* TAB 4: Political Impact (COUNCILLOR+) */}
      {activeTab === 'political' && isCouncillor && (
        <div className="dd-tab-content">
          {/* Political framing from evidence */}
          <CollapsibleSection title="Political Framing" defaultOpen icon={<Scale size={18} />}>
            <div className="dd-political-framing">
              {allLevers.filter(l => l.evidence?.political_framing).map((l, i) => (
                <div key={i} className="dd-framing-card">
                  <h4>{l.lever}</h4>
                  <p className="dd-framing-text">{l.evidence.political_framing}</p>
                  <span className="dd-framing-save">{l.est_saving}</span>
                </div>
              ))}
              {!allLevers.some(l => l.evidence?.political_framing) && (
                <p className="empty-message">No political framing documented for this directorate's levers.</p>
              )}
            </div>
          </CollapsibleSection>

          {/* Opposition predictions */}
          {politicalCtx?.opposition_attacks?.length > 0 && (
            <CollapsibleSection title="Opposition Attack Predictions" icon={<AlertTriangle size={18} />}>
              <div className="dd-attacks">
                {politicalCtx.opposition_attacks.map((a, i) => (
                  <div key={i} className="dd-attack-card">
                    <div className="dd-attack-vector">{a.vector || a.attack}</div>
                    {a.counter && <div className="dd-attack-counter"><strong>Counter:</strong> {a.counter}</div>}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Borough election relevance */}
          {politicalCtx?.borough_elections && (
            <CollapsibleSection title="Borough Election Impact" icon={<Calendar size={18} />}>
              <div className="dd-borough-elections">
                <p className="dd-borough-date">
                  Next elections: <strong>{politicalCtx.borough_elections.date || 'May 7, 2026'}</strong>
                </p>
                {politicalCtx.borough_elections.affected_districts?.length > 0 && (
                  <div className="dd-borough-districts">
                    <strong>Affected districts:</strong> {politicalCtx.borough_elections.affected_districts.join(', ')}
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* Reform narrative hooks */}
          {politicalCtx?.reform_narrative_hooks?.length > 0 && (
            <CollapsibleSection title="Reform Narrative Hooks" icon={<Zap size={18} />}>
              <div className="dd-narrative-hooks">
                {politicalCtx.reform_narrative_hooks.map((h, i) => (
                  <div key={i} className="dd-hook-card">{h}</div>
                ))}
              </div>
            </CollapsibleSection>
          )}
        </div>
      )}

      {/* TAB 5: Action Plan (CABINET_MEMBER+) */}
      {activeTab === 'action_plan' && isCabinetLevel && (
        <div className="dd-tab-content">
          {/* Reform Playbook */}
          {playbook && (
            <CollapsibleSection title="Reform Playbook" defaultOpen icon={<Zap size={18} />}>
              <div className="dd-playbook">
                {Object.entries(playbook).filter(([k]) => k.startsWith('year')).map(([key, items]) => (
                  <div key={key} className="dd-playbook-year">
                    <h4>{key.replace('year_', 'Year ').replace('_', ' ')}</h4>
                    {Array.isArray(items) && items.map((item, i) => (
                      <div key={i} className="dd-playbook-item">
                        <span className="dd-playbook-action">{typeof item === 'string' ? item : item.action || item.description || JSON.stringify(item)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Upcoming scrutiny meetings */}
          {relevantMeetings.length > 0 && (
            <CollapsibleSection title="Upcoming Scrutiny Meetings" icon={<Calendar size={18} />}>
              <div className="dd-meetings">
                {relevantMeetings.slice(0, 5).map((m, i) => (
                  <div key={i} className="dd-meeting-card">
                    <span className="dd-meeting-date">{m.date}</span>
                    <span className="dd-meeting-title">{m.title || m.committee}</span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Statutory red lines */}
          <CollapsibleSection title="Statutory Considerations" icon={<Shield size={18} />}>
            <div className="dd-statutory">
              {portfolios.flatMap(p => (p.statutory_duties || []).map((d, i) => (
                <div key={`${p.id}-${i}`} className="dd-statutory-item">
                  <span className="dd-statutory-duty">{typeof d === 'string' ? d : d.duty || d.name}</span>
                  <span className="dd-statutory-portfolio">{p.short_title || p.title}</span>
                </div>
              )))}
              {!portfolios.some(p => p.statutory_duties?.length) && <p className="empty-message">No statutory duties documented.</p>}
            </div>
          </CollapsibleSection>

          {/* Portfolio links */}
          <CollapsibleSection title="Constituent Portfolios" icon={<Users size={18} />}>
            <div className="dd-portfolio-links">
              {portfolios.map(p => (
                <Link key={p.id} to={`/cabinet/${p.id}`} className="dd-portfolio-link-card">
                  <span className="dd-pl-title">{p.title}</span>
                  <span className="dd-pl-member">{p.cabinet_member?.name}</span>
                  <ChevronRight size={14} />
                </Link>
              ))}
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  )
}
