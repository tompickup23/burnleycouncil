import { useMemo, useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { Users, PieChart, Target, ChevronRight, Calendar, TrendingUp, TrendingDown, Shield, Zap, Briefcase, FileText, AlertTriangle, Scale, Building, Building2, Wrench, MapPin, Download, Activity, Truck, GraduationCap, Heart, Recycle, Home, DollarSign, Layers, BarChart2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line, Legend, PieChart as RechartsPie, Pie, Cell, ScatterChart, Scatter, ZAxis, AreaChart, Area, Treemap } from 'recharts'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { isFirebaseEnabled } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { LoadingState } from '../components/ui'
import { StatCard } from '../components/ui/StatCard'
import { ChartCard } from '../components/ui/ChartCard'
import CollapsibleSection from '../components/CollapsibleSection'
import { CHART_COLORS, TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE, CHART_ANIMATION } from '../utils/constants'
import {
  matchSpendingToPortfolio,
  mapFindingsToPortfolio,
  generateDirectives,
  generateReformPlaybook,
  decisionPathway,
  decisionPipeline,
  meetingBriefing,
  politicalContext,
  departmentOperationsProfile,
  priorityMatrix,
  generatePortfolioFOI,
  crossPortfolioDependencies,
  contractPipeline,
  fundingConstraints,
  formatCurrency,
  sendCostProjection,
  earlyInterventionROI,
  lacPlacementOptimisation,
  ascDemandProjection,
  ascMarketRisk,
  chcRecoveryModel,
  highwayAssetTrajectory,
  wasteDisposalComparison,
  quantifyDemandPressures,
  netFiscalTrajectory,
  spendingBudgetVariance,
  spendingConcentration,
  childrenCostProjection,
  publicHealthProjection,
  propertyEstateProjection,
} from '../utils/savingsEngine'
import { useSpendingSummary } from '../hooks/useSpendingSummary'
import './PortfolioDetail.css'

const TABS = [
  { id: 'overview', label: 'Overview', icon: <Users size={14} /> },
  { id: 'budget', label: 'Budget', icon: <PieChart size={14} /> },
  { id: 'spending', label: 'Spending', icon: <TrendingUp size={14} /> },
  { id: 'contracts', label: 'Contracts', icon: <Building2 size={14} /> },
  { id: 'savings', label: 'Savings', icon: <Target size={14} /> },
  { id: 'decisions', label: 'Decisions', icon: <Calendar size={14} /> },
  { id: 'legal', label: 'Legal & Political', icon: <Scale size={14} /> },
  { id: 'operations', label: 'Operations', icon: <Wrench size={14} /> },
  { id: 'playbook', label: 'Reform Playbook', icon: <Zap size={14} /> },
]

export default function PortfolioDetail() {
  const { portfolioId } = useParams()
  const location = useLocation()
  const config = useCouncilConfig()
  const dataSources = config.data_sources || {}
  const authCtx = useAuth()
  const [activeTab, setActiveTab] = useState('overview')

  const hasAccess = authCtx?.isCouncillor || !isFirebaseEnabled
  const isCabinetLevel = authCtx?.isCabinetLevel || !isFirebaseEnabled
  const { summary: spendingSummary } = useSpendingSummary()

  // Context-aware back navigation
  const referrer = location.state?.from
  const backLink = referrer?.startsWith('/directorate/') ? referrer
    : referrer === '/executive' ? '/executive'
    : '/cabinet'
  const backLabel = referrer?.startsWith('/directorate/') ? '← Back to Directorate'
    : referrer === '/executive' ? '← Back to Executive'
    : '← Savings Dashboard'

  const { data: allData, loading, error } = useData(
    dataSources.cabinet_portfolios
      ? ['/data/cabinet_portfolios.json', '/data/doge_findings.json', '/data/budgets.json',
         '/data/meetings.json', '/data/council_documents.json', '/data/councillors.json',
         '/data/procurement.json', '/data/integrity.json']
      : null
  )

  const [portfolioData, findingsData, budgetsData, meetingsData, documentsData, councillorsData, procurementData, integrityData] = allData || Array(8).fill(null)

  const portfolios = portfolioData?.portfolios || []
  const governance = portfolioData?.governance || {}
  const portfolio = portfolios.find(p => p.id === portfolioId)
  const findings = findingsData || {}
  const meetings = Array.isArray(meetingsData) ? meetingsData : meetingsData?.meetings || []
  const documents = Array.isArray(documentsData) ? documentsData : documentsData?.decisions || documentsData?.recent_decisions || []
  const procurement = Array.isArray(procurementData) ? procurementData : procurementData?.contracts || []

  // Compute all derived data with useMemo hooks BEFORE conditional returns
  const pFindings = useMemo(() => mapFindingsToPortfolio(findings, portfolio), [findings, portfolio])
  const directives = useMemo(() => generateDirectives(portfolio, findings, [], { procurement, fundingModel: portfolioData?.administration?.funding_model, spendingSummary }), [portfolio, findings, procurement, portfolioData, spendingSummary])
  const playbook = useMemo(() => generateReformPlaybook(portfolio, directives), [portfolio, directives])
  const matrix = useMemo(() => priorityMatrix(directives), [directives])
  const upcomingDecisions = useMemo(() => decisionPipeline(meetings, portfolio, documents), [meetings, portfolio, documents])
  const politicalCtx = useMemo(() => politicalContext(portfolio, {
    dogeFindings: findings,
  }), [portfolio, findings])
  const dependencies = useMemo(() => crossPortfolioDependencies(portfolios), [portfolios])
  const contractData = useMemo(() => contractPipeline(procurement, portfolio), [procurement, portfolio])
  const fundingData = useMemo(() => fundingConstraints(portfolio, portfolioData?.administration?.funding_model), [portfolio, portfolioData])

  // Service Intelligence: SEND cost model projections
  const serviceModel = portfolio?.operational_context?.service_model
  const sendProjection = useMemo(() => sendCostProjection(serviceModel?.send_cost_model), [serviceModel])
  const interventionROI = useMemo(() => earlyInterventionROI(serviceModel?.send_cost_model, serviceModel?.lac_cost_model), [serviceModel])
  const lacOptimisation = useMemo(() => lacPlacementOptimisation(serviceModel?.lac_cost_model), [serviceModel])
  const ascProjection = useMemo(() => ascDemandProjection(serviceModel?.asc_demand_model), [serviceModel])
  const ascMarket = useMemo(() => ascMarketRisk(serviceModel?.asc_demand_model), [serviceModel])
  const chcRecovery = useMemo(() => chcRecoveryModel(serviceModel?.asc_demand_model?.chc_model), [serviceModel])
  const highwayTrajectory = useMemo(() => highwayAssetTrajectory(serviceModel?.highway_asset_model), [serviceModel])
  const wasteComparison = useMemo(() => wasteDisposalComparison(serviceModel?.waste_model), [serviceModel])
  const childrenProjection = useMemo(() => childrenCostProjection(serviceModel?.children_cost_model), [serviceModel])
  const phProjection = useMemo(() => publicHealthProjection(serviceModel?.public_health_model), [serviceModel])
  const propertyProjection = useMemo(() => propertyEstateProjection(serviceModel?.property_cost_model), [serviceModel])
  const demandPressures = useMemo(() => quantifyDemandPressures(portfolio), [portfolio])
  const fiscalTrajectory = useMemo(() => netFiscalTrajectory(portfolio, demandPressures, directives), [portfolio, demandPressures, directives])

  // Scatter data for priority matrix
  const scatterData = useMemo(() =>
    directives.map(d => ({
      x: d.feasibility || 5,
      y: d.impact || 5,
      z: (d.save_central || 0) / 100000,
      name: d.action?.substring(0, 50),
    })),
  [directives])

  if (!dataSources.cabinet_portfolios) {
    return <div className="portfolio-detail"><h1>Portfolio Detail</h1><p>Not available for this council.</p></div>
  }
  if (!hasAccess) {
    return (
      <div className="portfolio-detail">
        <div className="portfolio-access-denied">
          <Shield size={48} />
          <h2>Councillor Access Required</h2>
        </div>
      </div>
    )
  }
  if (loading) return <LoadingState message="Loading portfolio..." />
  if (error) return <div className="portfolio-detail"><h1>Error</h1><p>{error.message || 'Failed to load'}</p></div>
  if (!portfolio) {
    const validIds = portfolios.map(p => p.id).filter(Boolean)
    return (
      <div className="portfolio-detail">
        <h1>Portfolio Not Found</h1>
        <p>No portfolio with ID &quot;{portfolioId}&quot;</p>
        {validIds.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <p>Available portfolios:</p>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {validIds.map(id => (
                <li key={id} style={{ margin: '0.25rem 0' }}>
                  <Link to={`/cabinet/${id}`} style={{ color: '#12B6CF' }}>{portfolios.find(p => p.id === id)?.title || id}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Link to="/cabinet" style={{ display: 'inline-block', marginTop: '1rem', color: '#12B6CF' }}>← Back to Savings Dashboard</Link>
      </div>
    )
  }

  const totalSavings = directives.reduce((s, d) => s + (d.save_central || 0), 0)

  return (
    <div className="portfolio-detail">
      {/* Hero */}
      <div className="portfolio-hero">
        <Link to={backLink} className="portfolio-back">{backLabel}</Link>
        <h1>{portfolio.title}</h1>
        <p className="portfolio-subtitle">{portfolio.cabinet_member?.name} — {portfolio.cabinet_member?.ward}</p>
        <div className="portfolio-hero-stats">
          {portfolio.budget_latest?.net_expenditure && (
            <StatCard label="Net Budget" value={formatCurrency(portfolio.budget_latest.net_expenditure)} icon={<PieChart size={24} />} />
          )}
          <StatCard label="Directives" value={directives.length} icon={<Target size={24} />} />
          <StatCard label="Savings Identified" value={formatCurrency(totalSavings)} icon={<TrendingUp size={24} />} />
          <StatCard label="Do Now" value={matrix.do_now.length} icon={<Zap size={24} />} />
        </div>
      </div>

      {/* Tab navigation */}
      <div className="portfolio-tabs">
        {TABS.filter(t => {
          if (t.id === 'playbook' || t.id === 'operations') return isCabinetLevel
          return true
        }).map(t => (
          <button
            key={t.id}
            className={`portfolio-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="portfolio-tab-content">
          <div className="portfolio-overview-grid">
            <div className="portfolio-overview-section">
              <h3>People</h3>
              <div className="portfolio-people-grid">
                <div className="portfolio-person-card portfolio-person-cabinet">
                  <strong>Cabinet Member</strong>
                  <span>{portfolio.cabinet_member?.name}</span>
                  <span className="portfolio-person-role">{portfolio.cabinet_member?.cabinet_role}</span>
                </div>
                <div className="portfolio-person-card">
                  <strong>Executive Director</strong>
                  <span>{portfolio.executive_director}</span>
                </div>
                {portfolio.lead_members?.map((l, i) => (
                  <div key={i} className="portfolio-person-card">
                    <strong>Lead Member</strong>
                    <span>{l.name} ({l.area})</span>
                  </div>
                ))}
                {portfolio.champions?.map((c, i) => (
                  <div key={i} className="portfolio-person-card">
                    <strong>Champion</strong>
                    <span>{c.name} ({c.area})</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="portfolio-overview-section">
              <h3>Key Services</h3>
              <ul className="portfolio-services-list">
                {(portfolio.key_services || []).map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>

            <div className="portfolio-overview-section">
              <h3>Scrutiny</h3>
              <p>{portfolio.scrutiny_committee?.name}</p>
            </div>

            <div className="portfolio-overview-section">
              <h3>Known Pressures</h3>
              <ul className="portfolio-pressures-list">
                {(portfolio.known_pressures || []).map((p, i) => (
                  <li key={i} className="portfolio-pressure-item"><AlertTriangle size={12} /> {p}</li>
                ))}
              </ul>
            </div>

            <div className="portfolio-overview-section">
              <h3>Directors</h3>
              <ul className="portfolio-services-list">
                {(portfolio.directors || []).map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>
          </div>

          {/* Service Intelligence Summary Card */}
          {serviceModel && Object.keys(serviceModel).length > 0 && (
            <div className="service-summary-card">
              <div className="service-summary-header">
                <Activity size={16} style={{ color: '#12B6CF' }} />
                <span className="service-summary-label">Service Intelligence</span>
                <span className="service-summary-models">{Object.keys(serviceModel).length} model{Object.keys(serviceModel).length > 1 ? 's' : ''} active</span>
              </div>
              <div className="service-summary-metrics">
                {demandPressures.total_annual > 0 && (
                  <div className="service-summary-metric">
                    <span className="ssm-value" style={{ color: '#dc3545' }}>{formatCurrency(demandPressures.total_annual)}/yr</span>
                    <span className="ssm-label">demand growth</span>
                  </div>
                )}
                {fiscalTrajectory.trajectory && (
                  <div className="service-summary-metric">
                    <span className="ssm-value" style={{ color: fiscalTrajectory.trajectory === 'improving' ? '#28a745' : fiscalTrajectory.trajectory === 'stable' ? '#fd7e14' : '#dc3545' }}>
                      {fiscalTrajectory.trajectory.charAt(0).toUpperCase() + fiscalTrajectory.trajectory.slice(1)}
                    </span>
                    <span className="ssm-label">fiscal trajectory</span>
                  </div>
                )}
                {demandPressures.coverage_pct > 0 && (
                  <div className="service-summary-metric">
                    <span className="ssm-value" style={{ color: demandPressures.coverage_pct >= 75 ? '#28a745' : demandPressures.coverage_pct >= 50 ? '#fd7e14' : '#dc3545' }}>
                      {demandPressures.coverage_pct}%
                    </span>
                    <span className="ssm-label">savings coverage</span>
                  </div>
                )}
                {fiscalTrajectory.breakeven_year > 0 && (
                  <div className="service-summary-metric">
                    <span className="ssm-value">Year {fiscalTrajectory.breakeven_year}</span>
                    <span className="ssm-label">breakeven</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Portfolio Spending Intelligence */}
          {spendingSummary?.by_portfolio?.[portfolioId] && (() => {
            const ps = spendingSummary.by_portfolio[portfolioId]
            const variance = spendingBudgetVariance(portfolio, spendingSummary)
            const concentration = spendingConcentration(ps)
            return (
              <CollapsibleSection title={`Spending Intelligence — ${formatCurrency(ps.total)} across ${ps.unique_suppliers} suppliers`} icon={<TrendingUp size={18} />} defaultOpen>
                <div className="service-stat-row">
                  <StatCard label="Total Spend" value={formatCurrency(ps.total)} icon={<TrendingUp size={18} />} />
                  <StatCard label="Transactions" value={ps.count?.toLocaleString()} icon={<Target size={18} />} />
                  <StatCard label="Suppliers" value={ps.unique_suppliers} icon={<Users size={18} />} />
                  {variance && <StatCard label="Budget Variance" value={`${variance.variance_pct > 0 ? '+' : ''}${variance.variance_pct}%`} color={variance.alert_level === 'red' ? '#dc3545' : variance.alert_level === 'amber' ? '#fd7e14' : '#28a745'} icon={<AlertTriangle size={18} />} />}
                </div>

                {/* Top Suppliers */}
                {ps.top_suppliers?.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', marginBottom: '8px' }}>Top Suppliers</h4>
                    <div className="portfolio-spending-suppliers">
                      {ps.top_suppliers.slice(0, 5).map((s, i) => (
                        <div key={i} className="portfolio-spending-supplier-row">
                          <span className="portfolio-spending-supplier-name">{s.name}</span>
                          <span className="portfolio-spending-supplier-total">{formatCurrency(s.total)}</span>
                          <span className="portfolio-spending-supplier-pct">{s.pct?.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Concentration Warning */}
                {concentration?.risk_level === 'high' && (
                  <div className="spending-concentration-warning">
                    <AlertTriangle size={14} /> High supplier concentration (HHI: {concentration.hhi}) — top supplier holds {concentration.top_supplier_pct}% of portfolio spend
                  </div>
                )}

                {/* Deep link to Spending page */}
                <div style={{ marginTop: '12px' }}>
                  <Link to={`/spending?spend_category=${ps.label || ''}`} className="spending-deep-link">
                    View all {ps.count?.toLocaleString()} transactions →
                  </Link>
                </div>
              </CollapsibleSection>
            )
          })()}

          {/* Service Intelligence: SEND Cost Cascade */}
          {serviceModel?.send_cost_model && (
            <div className="service-intelligence-section">
              <h2 className="service-intelligence-title"><Activity size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Service Intelligence: SEND Cost Cascade</h2>
              <p className="service-intelligence-subtitle">Modelling the cascade: EHCP identification → assessment → placement → transport → tribunal → DSG deficit</p>

              {/* EHCP Pipeline */}
              <CollapsibleSection title={`EHCP Pipeline (${serviceModel.send_cost_model.ehcp_pipeline?.total_ehcps?.toLocaleString()} EHCPs, ${(serviceModel.send_cost_model.ehcp_pipeline?.annual_growth_rate * 100 || 0).toFixed(1)}% annual growth)`} icon={<GraduationCap size={18} />} defaultOpen>
                <div className="service-stat-row">
                  <StatCard label="Total EHCPs" value={(serviceModel.send_cost_model.ehcp_pipeline?.total_ehcps || 0).toLocaleString()} icon={<GraduationCap size={18} />} />
                  <StatCard label="Requests/Month" value={serviceModel.send_cost_model.ehcp_pipeline?.new_requests_per_month || 0} icon={<TrendingUp size={18} />} />
                  <StatCard label="Assessment Capacity" value={`${serviceModel.send_cost_model.ehcp_pipeline?.assessment_capacity_per_month || 0}/month`} color="#dc3545" icon={<AlertTriangle size={18} />} />
                  <StatCard label="Timeliness" value={`${serviceModel.send_cost_model.ehcp_pipeline?.timeliness_pct || 0}%`} color="#dc3545" icon={<Target size={18} />} />
                </div>
                <div className="service-stat-row" style={{ marginTop: '12px' }}>
                  <StatCard label="Backlog (Current)" value={serviceModel.send_cost_model.ehcp_pipeline?.backlog_current || 0} icon={<AlertTriangle size={18} />} />
                  <StatCard label="Backlog (Peak)" value={(serviceModel.send_cost_model.ehcp_pipeline?.backlog_peak || 0).toLocaleString()} color="#dc3545" icon={<AlertTriangle size={18} />} />
                  <StatCard label="Median Weeks" value={`${serviceModel.send_cost_model.ehcp_pipeline?.median_weeks_to_issue || 0}w`} color="#fd7e14" icon={<Calendar size={18} />} />
                  <StatCard label="Statutory Target" value={`${serviceModel.send_cost_model.ehcp_pipeline?.statutory_target_weeks || 20}w`} icon={<Target size={18} />} />
                </div>
              </CollapsibleSection>

              {/* Placement Cost Pyramid */}
              {serviceModel.send_cost_model.placement_costs && (
                <CollapsibleSection title="Placement Cost Pyramid" icon={<Building2 size={18} />} defaultOpen>
                  <ChartCard title="Placement Count × Cost by Type" subtitle="Higher cost types at top — independent sector drives cost growth">
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart
                        data={Object.entries(serviceModel.send_cost_model.placement_costs)
                          .filter(([k, v]) => v?.count && v?.avg_cost)
                          .map(([k, v]) => ({ name: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), count: v.count, avg_cost: v.avg_cost, total: v.total || v.count * v.avg_cost }))
                          .sort((a, b) => a.avg_cost - b.avg_cost)}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 140, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                        <XAxis type="number" tick={AXIS_TICK_STYLE} tickFormatter={v => `£${(v / 1000000).toFixed(0)}M`} />
                        <YAxis type="category" dataKey="name" tick={AXIS_TICK_STYLE} width={130} />
                        <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [n === 'total' ? formatCurrency(v) : v.toLocaleString(), n === 'total' ? 'Total Cost' : 'Count']} />
                        <Bar dataKey="total" fill={CHART_COLORS[0]} {...CHART_ANIMATION} name="Total Cost" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </CollapsibleSection>
              )}

              {/* 5-Year Cost Projection */}
              {sendProjection.yearly.length > 0 && (
                <CollapsibleSection title={`5-Year Cost Projection (${formatCurrency(sendProjection.total_5yr_cost)} cumulative)`} icon={<TrendingUp size={18} />} defaultOpen>
                  <div className="service-stat-row" style={{ marginBottom: '16px' }}>
                    <StatCard label="Base Year Cost" value={formatCurrency(sendProjection.base_year_cost)} icon={<PieChart size={18} />} />
                    <StatCard label="Year 5 Cost" value={formatCurrency(sendProjection.yearly[sendProjection.yearly.length - 1]?.total || 0)} color="#dc3545" icon={<TrendingUp size={18} />} />
                    <StatCard label="Growth Rate" value={`${(sendProjection.growth_rate * 100).toFixed(1)}%/yr`} color="#fd7e14" icon={<TrendingUp size={18} />} />
                  </div>
                  <ChartCard title="Cost Trajectory" subtitle="Placement + transport + tribunal costs compound annually">
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={sendProjection.yearly} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                        <XAxis dataKey="label" tick={AXIS_TICK_STYLE} />
                        <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `£${(v / 1000000).toFixed(0)}M`} />
                        <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                        <Area type="monotone" dataKey="placement_cost" stackId="1" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.6} name="Placements" {...CHART_ANIMATION} />
                        <Area type="monotone" dataKey="transport" stackId="1" stroke={CHART_COLORS[1]} fill={CHART_COLORS[1]} fillOpacity={0.6} name="Transport" {...CHART_ANIMATION} />
                        <Area type="monotone" dataKey="tribunals" stackId="1" stroke={CHART_COLORS[2]} fill={CHART_COLORS[2]} fillOpacity={0.6} name="Tribunals" {...CHART_ANIMATION} />
                        <Legend />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  {/* DSG Deficit Trajectory */}
                  {sendProjection.dsg_trajectory?.some(d => d.deficit > 0) && (
                    <ChartCard title="DSG Deficit Trajectory" subtitle={`Statutory override ends ${serviceModel.send_cost_model.dsg_deficit?.statutory_override_ends || 'March 2028'}`}>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={sendProjection.dsg_trajectory} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                          <XAxis dataKey="year" tick={AXIS_TICK_STYLE} tickFormatter={v => `Year ${v}`} />
                          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `£${(v / 1000000).toFixed(0)}M`} />
                          <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                          <Line type="monotone" dataKey="deficit" stroke="#dc3545" strokeWidth={2} dot={{ fill: '#dc3545' }} name="DSG Deficit" {...CHART_ANIMATION} />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  )}
                </CollapsibleSection>
              )}

              {/* Transport */}
              {serviceModel.send_cost_model.transport && (
                <CollapsibleSection title={`SEND Transport (${formatCurrency(serviceModel.send_cost_model.transport.total_cost)})`} icon={<Truck size={18} />}>
                  <div className="service-stat-row">
                    <StatCard label="Transport Cost" value={formatCurrency(serviceModel.send_cost_model.transport.total_cost)} color="#dc3545" icon={<Truck size={18} />} />
                    <StatCard label="Eligible Pupils" value={(serviceModel.send_cost_model.transport.eligible_pupils || 0).toLocaleString()} icon={<Users size={18} />} />
                    <StatCard label="Cost/Pupil" value={`£${(serviceModel.send_cost_model.transport.cost_per_pupil || 0).toLocaleString()}`} icon={<PieChart size={18} />} />
                    <StatCard label="Growth 26/27" value={`+${formatCurrency(serviceModel.send_cost_model.transport.growth_2026_27)}`} color="#fd7e14" icon={<TrendingUp size={18} />} />
                  </div>
                  <div className="service-transport-levers" style={{ marginTop: '16px' }}>
                    <h4 style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '8px', fontSize: '0.85rem' }}>Cost Reduction Levers</h4>
                    <div className="service-lever-cards">
                      {serviceModel.send_cost_model.transport.personal_travel_budgets && (
                        <div className="service-lever-card">
                          <strong>Personal Travel Budgets</strong>
                          <span>{serviceModel.send_cost_model.transport.personal_travel_budgets.current} → {serviceModel.send_cost_model.transport.personal_travel_budgets.target}</span>
                          <span className="service-lever-saving">£{serviceModel.send_cost_model.transport.personal_travel_budgets.avg_saving?.toLocaleString()} avg saving each</span>
                        </div>
                      )}
                      {serviceModel.send_cost_model.transport.transport_assistant_grants && (
                        <div className="service-lever-card">
                          <strong>Transport Assistant Grants</strong>
                          <span>{serviceModel.send_cost_model.transport.transport_assistant_grants.current} → {serviceModel.send_cost_model.transport.transport_assistant_grants.target}</span>
                          <span className="service-lever-saving">£{serviceModel.send_cost_model.transport.transport_assistant_grants.avg_saving?.toLocaleString()} avg saving each</span>
                        </div>
                      )}
                      {serviceModel.send_cost_model.transport.minibus_programme && (
                        <div className="service-lever-card">
                          <strong>Ford Minibus Fleet</strong>
                          <span>{serviceModel.send_cost_model.transport.minibus_programme.vehicles} vehicles</span>
                          <span className="service-lever-saving">{serviceModel.send_cost_model.transport.minibus_programme.saving_per_passenger_pct}% saving per passenger</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CollapsibleSection>
              )}

              {/* Early Intervention ROI */}
              {interventionROI.programmes.length > 0 && (
                <CollapsibleSection title={`Early Intervention ROI (${formatCurrency(interventionROI.net_saving)} net saving)`} icon={<Heart size={18} />}>
                  <div className="service-stat-row" style={{ marginBottom: '16px' }}>
                    <StatCard label="Reactive Cost" value={formatCurrency(interventionROI.current_reactive_cost)} color="#dc3545" icon={<AlertTriangle size={18} />} />
                    <StatCard label="Intervention Cost" value={formatCurrency(interventionROI.intervention_cost)} icon={<Heart size={18} />} />
                    <StatCard label="Net Saving" value={formatCurrency(interventionROI.net_saving)} color="#28a745" icon={<TrendingUp size={18} />} />
                    <StatCard label="Payback" value={`${interventionROI.payback_years} yrs`} icon={<Calendar size={18} />} />
                  </div>
                  <div className="service-roi-programmes">
                    {interventionROI.programmes.map((p, i) => (
                      <div key={i} className="service-roi-card">
                        <div className="service-roi-header">
                          <strong>{p.name}</strong>
                          <span className="service-roi-net">{formatCurrency(p.net_saving)}/yr</span>
                        </div>
                        <div className="service-roi-detail">
                          {p.evidence && <span className="service-roi-evidence">{p.evidence}</span>}
                          {p.roi_ratio && <span className="service-roi-ratio">ROI: {p.roi_ratio.toFixed(1)}×</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              )}

              {/* LAC Placement Optimisation */}
              {lacOptimisation.saving > 0 && (
                <CollapsibleSection title={`LAC Placement Optimisation (${formatCurrency(lacOptimisation.saving)} saving)`} icon={<Users size={18} />}>
                  <div className="service-stat-row" style={{ marginBottom: '16px' }}>
                    <StatCard label="Current LAC Cost" value={formatCurrency(lacOptimisation.current_cost)} icon={<PieChart size={18} />} />
                    <StatCard label="Optimised Cost" value={formatCurrency(lacOptimisation.optimised_cost)} color="#28a745" icon={<Target size={18} />} />
                    <StatCard label="Saving" value={formatCurrency(lacOptimisation.saving)} color="#28a745" icon={<TrendingUp size={18} />} />
                    <StatCard label="Saving %" value={`${lacOptimisation.saving_pct}%`} icon={<PieChart size={18} />} />
                  </div>

                  {/* Step-down moves */}
                  {lacOptimisation.placements_moved.length > 0 && (
                    <div className="service-stepdown-table">
                      <h4 style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '8px', fontSize: '0.85rem' }}>Placement Step-Down Pathways</h4>
                      <table className="service-table">
                        <thead>
                          <tr><th>From</th><th>To</th><th>Count</th><th>Saving/Place</th><th>Total</th></tr>
                        </thead>
                        <tbody>
                          {lacOptimisation.placements_moved.map((m, i) => (
                            <tr key={i}>
                              <td>{m.from_label}</td>
                              <td>{m.to_label}</td>
                              <td>{m.count}</td>
                              <td>{formatCurrency(m.unit_saving)}</td>
                              <td className="service-table-highlight">{formatCurrency(m.total_saving)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* WOCL ROI */}
                  {lacOptimisation.wocl_roi && (
                    <div className="service-wocl-roi" style={{ marginTop: '16px' }}>
                      <h4 style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '8px', fontSize: '0.85rem' }}>WOCL Programme ROI</h4>
                      <div className="service-stat-row">
                        <StatCard label="New Homes" value={lacOptimisation.wocl_roi.additional_homes} icon={<Building2 size={18} />} />
                        <StatCard label="Capital Cost" value={formatCurrency(lacOptimisation.wocl_roi.capital_cost)} icon={<PieChart size={18} />} />
                        <StatCard label="Net Annual" value={formatCurrency(lacOptimisation.wocl_roi.net_annual)} color="#28a745" icon={<TrendingUp size={18} />} />
                        <StatCard label="Payback" value={`${lacOptimisation.wocl_roi.payback_years} yrs`} icon={<Calendar size={18} />} />
                      </div>
                    </div>
                  )}

                  {/* Timeline */}
                  {lacOptimisation.timeline.length > 0 && (
                    <ChartCard title="Step-Down Timeline" subtitle="Phased saving accumulation over 4 years">
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={lacOptimisation.timeline} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                          <XAxis dataKey="year" tick={AXIS_TICK_STYLE} tickFormatter={v => `Year ${v}`} />
                          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `£${(v / 1000000).toFixed(1)}M`} />
                          <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                          <Bar dataKey="saving" fill="#28a745" {...CHART_ANIMATION} name="Cumulative Saving" />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  )}
                </CollapsibleSection>
              )}

              {/* Workforce */}
              {serviceModel.send_cost_model.workforce && (
                <CollapsibleSection title="SEND Workforce" icon={<Users size={18} />}>
                  <div className="service-stat-row">
                    {serviceModel.send_cost_model.workforce.educational_psychologists && (
                      <>
                        <StatCard label="Permanent EPs" value={serviceModel.send_cost_model.workforce.educational_psychologists.permanent} icon={<Users size={18} />} />
                        <StatCard label="Agency EPs" value={serviceModel.send_cost_model.workforce.educational_psychologists.agency} color="#dc3545" icon={<Users size={18} />} />
                        <StatCard label="Agency Cost/yr" value={formatCurrency(serviceModel.send_cost_model.workforce.educational_psychologists.annual_agency_cost)} color="#dc3545" icon={<PieChart size={18} />} />
                        <StatCard label="Agency Premium" value={`${serviceModel.send_cost_model.workforce.agency_premium_pct || 167}%`} color="#fd7e14" icon={<AlertTriangle size={18} />} />
                      </>
                    )}
                  </div>
                  {serviceModel.send_cost_model.workforce.social_workers && (
                    <div className="service-stat-row" style={{ marginTop: '12px' }}>
                      <StatCard label="Permanent SWs" value={serviceModel.send_cost_model.workforce.social_workers.permanent} icon={<Users size={18} />} />
                      <StatCard label="Agency SWs" value={serviceModel.send_cost_model.workforce.social_workers.agency} color="#fd7e14" icon={<Users size={18} />} />
                      <StatCard label="Apprentices" value={serviceModel.send_cost_model.workforce.social_workers.apprentices_on_programme} color="#28a745" icon={<GraduationCap size={18} />} />
                      <StatCard label="NQSWs (Jan 25)" value={serviceModel.send_cost_model.workforce.social_workers.nqsw_started_jan_2025} icon={<Users size={18} />} />
                    </div>
                  )}
                </CollapsibleSection>
              )}
            </div>
          )}

          {/* Service Intelligence: ASC Demand Dashboard */}
          {serviceModel?.asc_demand_model && (
            <div className="service-intelligence-section">
              <h2 className="service-intelligence-title"><Activity size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Service Intelligence: ASC Demand & Market</h2>
              <p className="service-intelligence-subtitle">Demographic pressure, care market sustainability, and CHC recovery opportunity</p>

              {/* Demographic Pressure */}
              {ascProjection.yearly.length > 0 && (
                <CollapsibleSection title={`Demographic Pressure (${(ascProjection.blended_growth_rate * 100).toFixed(1)}% blended growth)`} icon={<TrendingUp size={18} />} defaultOpen>
                  <div className="service-stat-row" style={{ marginBottom: '16px' }}>
                    <StatCard label="Base Year Cost" value={formatCurrency(ascProjection.base_cost)} icon={<PieChart size={18} />} />
                    <StatCard label="Year 5 Cost" value={formatCurrency(ascProjection.yearly[ascProjection.yearly.length - 1]?.total || 0)} color="#dc3545" icon={<TrendingUp size={18} />} />
                    <StatCard label="5yr Growth" value={formatCurrency(ascProjection.total_growth)} color="#fd7e14" icon={<TrendingUp size={18} />} />
                  </div>
                  <ChartCard title="ASC Cost Trajectory" subtitle="Residential + home care + LD costs compound with demographic growth and inflation">
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={ascProjection.yearly} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                        <XAxis dataKey="label" tick={AXIS_TICK_STYLE} />
                        <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `£${(v / 1000000).toFixed(0)}M`} />
                        <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                        <Area type="monotone" dataKey="residential_cost" stackId="1" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.6} name="Residential" {...CHART_ANIMATION} />
                        <Area type="monotone" dataKey="home_care_cost" stackId="1" stroke={CHART_COLORS[1]} fill={CHART_COLORS[1]} fillOpacity={0.6} name="Home Care" {...CHART_ANIMATION} />
                        <Area type="monotone" dataKey="ld_cost" stackId="1" stroke={CHART_COLORS[2]} fill={CHART_COLORS[2]} fillOpacity={0.6} name="Learning Disability" {...CHART_ANIMATION} />
                        <Legend />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  {/* Population Growth */}
                  <ChartCard title="Population Projections" subtitle="Over-85s growing fastest — driving residential demand">
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={ascProjection.yearly} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                        <XAxis dataKey="label" tick={AXIS_TICK_STYLE} />
                        <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                        <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => v.toLocaleString()} />
                        <Line type="monotone" dataKey="over_65" stroke={CHART_COLORS[3]} strokeWidth={2} name="Over 65" {...CHART_ANIMATION} />
                        <Line type="monotone" dataKey="over_85" stroke="#dc3545" strokeWidth={2} name="Over 85" {...CHART_ANIMATION} />
                        <Legend />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </CollapsibleSection>
              )}

              {/* Market Sustainability */}
              {ascMarket.provider_count > 0 && (
                <CollapsibleSection title={`Market Sustainability (Risk: ${ascMarket.risk_level})`} icon={<AlertTriangle size={18} />}>
                  <div className="service-stat-row">
                    <StatCard label="Providers" value={ascMarket.provider_count} icon={<Building2 size={18} />} />
                    <StatCard label="Vacancy Rate" value={`${ascMarket.vacancy_rate}%`} icon={<PieChart size={18} />} />
                    <StatCard label="Closures (3yr)" value={ascMarket.closure_trend} color={ascMarket.closure_trend > 5 ? '#dc3545' : undefined} icon={<AlertTriangle size={18} />} />
                    <StatCard label="Fair Cost Gap" value={`£${ascMarket.fair_cost_gap}/wk`} color="#fd7e14" icon={<TrendingUp size={18} />} />
                  </div>
                  <div className="service-stat-row" style={{ marginTop: '12px' }}>
                    <StatCard label="Off-Framework" value={`${ascMarket.off_framework_pct}%`} color={ascMarket.off_framework_pct > 25 ? '#dc3545' : undefined} icon={<PieChart size={18} />} />
                    <StatCard label="Inflation Pressure" value={formatCurrency(ascMarket.inflation_pressure)} color="#dc3545" icon={<TrendingUp size={18} />} />
                    <StatCard label="Risk Score" value={`${ascMarket.risk_score}/100`} color={ascMarket.risk_score >= 40 ? '#dc3545' : '#fd7e14'} icon={<AlertTriangle size={18} />} />
                  </div>
                  {ascMarket.mitigation_options.length > 0 && (
                    <div style={{ marginTop: '16px' }}>
                      <h4 style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '8px', fontSize: '0.85rem' }}>Mitigation Options</h4>
                      {ascMarket.mitigation_options.map((m, i) => (
                        <div key={i} className="service-roi-card" style={{ marginBottom: '8px' }}>
                          <div className="service-roi-header">
                            <strong>{m.action}</strong>
                            <span className="service-roi-net">{m.saving ? formatCurrency(m.saving) + ' saving' : formatCurrency(m.cost) + ' cost'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CollapsibleSection>
              )}

              {/* CHC Recovery Pipeline */}
              {chcRecovery.gap > 0 && (
                <CollapsibleSection title={`CHC Recovery Pipeline (${formatCurrency(chcRecovery.gap)} opportunity)`} icon={<Heart size={18} />}>
                  <div className="service-stat-row" style={{ marginBottom: '16px' }}>
                    <StatCard label="Current Income" value={formatCurrency(chcRecovery.current_income)} icon={<PieChart size={18} />} />
                    <StatCard label="Target Income" value={formatCurrency(chcRecovery.target_income)} color="#28a745" icon={<Target size={18} />} />
                    <StatCard label="Recovery Gap" value={formatCurrency(chcRecovery.gap)} color="#12B6CF" icon={<TrendingUp size={18} />} />
                    <StatCard label="Net Benefit" value={formatCurrency(chcRecovery.net_benefit)} color="#28a745" icon={<TrendingUp size={18} />} />
                  </div>
                  <div className="service-stat-row">
                    <StatCard label="Current Rate" value={`${chcRecovery.current_rate}%`} color="#dc3545" icon={<PieChart size={18} />} />
                    <StatCard label="Target Rate" value={`${chcRecovery.target_rate}%`} icon={<Target size={18} />} />
                    <StatCard label="Additional Claims" value={chcRecovery.additional_claims} icon={<FileText size={18} />} />
                    <StatCard label="Add'l Reviewers" value={chcRecovery.additional_reviewers} icon={<Users size={18} />} />
                  </div>
                  {chcRecovery.timeline.length > 0 && (
                    <ChartCard title="CHC Recovery Timeline" subtitle="Phased increase in recovery rate">
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={chcRecovery.timeline} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                          <XAxis dataKey="year" tick={AXIS_TICK_STYLE} tickFormatter={v => `Year ${v}`} />
                          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `£${(v / 1000000).toFixed(1)}M`} />
                          <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                          <Bar dataKey="income" fill="#28a745" {...CHART_ANIMATION} name="CHC Income" />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  )}
                </CollapsibleSection>
              )}

              {/* Reablement Performance */}
              {serviceModel.asc_demand_model.reablement && (
                <CollapsibleSection title="Reablement Performance" icon={<Heart size={18} />}>
                  <div className="service-stat-row">
                    <StatCard label="Success Rate" value={`${serviceModel.asc_demand_model.reablement.success_rate_pct}%`} color="#28a745" icon={<Target size={18} />} />
                    <StatCard label="National Avg" value={`${serviceModel.asc_demand_model.reablement.national_avg_pct}%`} icon={<Target size={18} />} />
                    <StatCard label="Cost/Episode" value={formatCurrency(serviceModel.asc_demand_model.reablement.cost_per_episode)} icon={<PieChart size={18} />} />
                    <StatCard label="Residential Avoided" value={formatCurrency(serviceModel.asc_demand_model.reablement.residential_avoided_saving)} color="#28a745" icon={<TrendingUp size={18} />} />
                  </div>
                  {serviceModel.asc_demand_model.reablement.potential_expansion && (
                    <div className="service-roi-card" style={{ marginTop: '12px' }}>
                      <div className="service-roi-header">
                        <strong>Expansion Opportunity: +{serviceModel.asc_demand_model.reablement.potential_expansion.additional_episodes_pa} episodes/year</strong>
                        <span className="service-roi-net">{formatCurrency(serviceModel.asc_demand_model.reablement.potential_expansion.net_saving)}/yr</span>
                      </div>
                    </div>
                  )}
                </CollapsibleSection>
              )}
            </div>
          )}

          {/* Service Intelligence: Highway Asset Dashboard */}
          {serviceModel?.highway_asset_model && highwayTrajectory.yearly.length > 0 && (
            <div className="service-intelligence-section">
              <h2 className="service-intelligence-title"><Wrench size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Service Intelligence: Highway Assets</h2>
              <p className="service-intelligence-subtitle">Asset deterioration trajectory, managed service performance, and lifecycle cost optimisation</p>

              {/* Asset Summary */}
              <CollapsibleSection title={`Asset Trajectory (£${((highwayTrajectory.current_gap || 0) / 1000000).toFixed(0)}M/yr investment gap)`} icon={<TrendingUp size={18} />} defaultOpen>
                <div className="service-stat-row" style={{ marginBottom: '16px' }}>
                  <StatCard label="Backlog" value={formatCurrency(serviceModel.highway_asset_model.asset_summary?.maintenance_backlog || 0)} color="#dc3545" icon={<AlertTriangle size={18} />} />
                  <StatCard label="Annual Deterioration" value={formatCurrency(serviceModel.highway_asset_model.asset_summary?.annual_deterioration || 0)} color="#fd7e14" icon={<TrendingUp size={18} />} />
                  <StatCard label="Annual Investment" value={formatCurrency(serviceModel.highway_asset_model.asset_summary?.annual_investment || 0)} color="#28a745" icon={<Target size={18} />} />
                  <StatCard label="Optimal Spend" value={formatCurrency(highwayTrajectory.optimal_spend)} icon={<Target size={18} />} />
                </div>
                <ChartCard title="Maintenance Backlog Trajectory" subtitle="Backlog grows when deterioration exceeds investment">
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={highwayTrajectory.yearly} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                      <XAxis dataKey="label" tick={AXIS_TICK_STYLE} />
                      <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `£${(v / 1000000).toFixed(0)}M`} />
                      <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                      <Area type="monotone" dataKey="backlog" stroke="#dc3545" fill="#dc3545" fillOpacity={0.3} name="Backlog" {...CHART_ANIMATION} />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
              </CollapsibleSection>

              {/* Road Condition */}
              {highwayTrajectory.condition_trends.length > 0 && (
                <CollapsibleSection title="Road Condition vs National Average" icon={<AlertTriangle size={18} />}>
                  <ChartCard title="Red Condition %" subtitle="Higher = worse. Red roads need structural repair">
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={highwayTrajectory.condition_trends} margin={{ top: 10, right: 30, left: 10, bottom: 0 }} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                        <XAxis type="number" tick={AXIS_TICK_STYLE} tickFormatter={v => `${v}%`} />
                        <YAxis type="category" dataKey="road_class" tick={AXIS_TICK_STYLE} width={100} tickFormatter={v => v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} />
                        <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${v}%`} />
                        <Bar dataKey="red_pct" fill="#dc3545" {...CHART_ANIMATION} name="Lancashire" />
                        <Bar dataKey="national_avg" fill="rgba(255,255,255,0.3)" {...CHART_ANIMATION} name="National Avg" />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </CollapsibleSection>
              )}

              {/* Managed Service + S59 + LED */}
              <CollapsibleSection title="Savings Levers" icon={<Target size={18} />}>
                <div className="service-stat-row">
                  {highwayTrajectory.managed_service_saving_pct > 0 && (
                    <StatCard label="Managed Service" value={`${highwayTrajectory.managed_service_saving_pct}% cost cut`} color="#28a745" icon={<Wrench size={18} />} />
                  )}
                  {highwayTrajectory.s59?.potential_income > 0 && (
                    <StatCard label="S59 Income" value={formatCurrency(highwayTrajectory.s59.potential_income)} color="#12B6CF" icon={<Scale size={18} />} />
                  )}
                  {highwayTrajectory.led && (
                    <StatCard label="LED Saving" value={formatCurrency(highwayTrajectory.led.dimming_saving_pa || 0)} color="#28a745" icon={<Zap size={18} />} />
                  )}
                  <StatCard label="Preventative vs Reactive" value={`${Math.round((1 - highwayTrajectory.preventative_ratio) * 100)}% cheaper`} icon={<TrendingUp size={18} />} />
                </div>
                {highwayTrajectory.led && (
                  <div className="service-roi-card" style={{ marginTop: '12px' }}>
                    <div className="service-roi-header">
                      <strong>LED Programme: {((highwayTrajectory.led.converted || 0)).toLocaleString()} of {((highwayTrajectory.led.total_columns || 0)).toLocaleString()} converted ({Math.round((highwayTrajectory.led.converted / highwayTrajectory.led.total_columns) * 100)}%)</strong>
                      <span className="service-roi-net">{highwayTrajectory.led.energy_saving_pct}% energy saving</span>
                    </div>
                  </div>
                )}
                {highwayTrajectory.dft_allocation > 0 && (
                  <div className="service-roi-card" style={{ marginTop: '8px' }}>
                    <div className="service-roi-header">
                      <strong>DfT Allocation 2026-30</strong>
                      <span className="service-roi-net">{formatCurrency(highwayTrajectory.dft_allocation)}</span>
                    </div>
                  </div>
                )}
              </CollapsibleSection>
            </div>
          )}

          {/* Service Intelligence: Waste Disposal Dashboard */}
          {serviceModel?.waste_model && wasteComparison.current_cost > 0 && (
            <div className="service-intelligence-section">
              <h2 className="service-intelligence-title"><Recycle size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />Service Intelligence: Waste Disposal</h2>
              <p className="service-intelligence-subtitle">Disposal cost scenarios, landfill tax trajectory, and market concentration</p>

              {/* Key Stats */}
              <CollapsibleSection title={`Disposal Costs (${formatCurrency(wasteComparison.current_cost)}/yr)`} icon={<PieChart size={18} />} defaultOpen>
                <div className="service-stat-row" style={{ marginBottom: '16px' }}>
                  <StatCard label="Total Cost" value={formatCurrency(wasteComparison.current_cost)} icon={<PieChart size={18} />} />
                  <StatCard label="Landfill Rate" value={`${wasteComparison.landfill_rate_pct}%`} color="#dc3545" icon={<AlertTriangle size={18} />} />
                  <StatCard label="National Avg" value={`${wasteComparison.national_avg_landfill_pct}%`} icon={<Target size={18} />} />
                  <StatCard label="Ratio to National" value={`${wasteComparison.ratio_to_national}×`} color="#dc3545" icon={<TrendingUp size={18} />} />
                </div>

                {/* Landfill Tax Trajectory */}
                {wasteComparison.landfill_tax_5yr.length > 0 && (
                  <ChartCard title="Landfill Tax Trajectory" subtitle="Escalating tax makes landfill increasingly uneconomic">
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={wasteComparison.landfill_tax_5yr} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                        <XAxis dataKey="label" tick={AXIS_TICK_STYLE} />
                        <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `£${(v / 1000000).toFixed(0)}M`} />
                        <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => typeof v === 'number' && v > 1000 ? formatCurrency(v) : `£${v}/t`} />
                        <Bar dataKey="annual_cost" fill="#dc3545" {...CHART_ANIMATION} name="Annual Landfill Cost" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}
              </CollapsibleSection>

              {/* Disposal Scenarios */}
              {wasteComparison.scenarios.length > 0 && (
                <CollapsibleSection title="Disposal Scenarios" icon={<Target size={18} />}>
                  <ChartCard title="Annual Cost by Scenario" subtitle="EfW offers long-term savings but requires capital investment">
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={wasteComparison.scenarios} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                        <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
                        <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `£${(v / 1000000).toFixed(0)}M`} />
                        <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                        <Bar dataKey="annual_cost" fill={CHART_COLORS[0]} {...CHART_ANIMATION} name="Annual Cost" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  {wasteComparison.scenarios.map((s, i) => (
                    <div key={i} className="service-roi-card" style={{ marginTop: '8px' }}>
                      <div className="service-roi-header">
                        <strong>{s.name}: Landfill {s.landfill_rate.toFixed(0)}%</strong>
                        <span className="service-roi-net">{formatCurrency(s.annual_cost)}/yr</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>{s.description}</div>
                    </div>
                  ))}
                </CollapsibleSection>
              )}

              {/* Market + Mandates */}
              <CollapsibleSection title="Market & Mandates" icon={<AlertTriangle size={18} />}>
                <div className="service-stat-row">
                  <StatCard label="Market HHI" value={wasteComparison.market_hhi.toLocaleString()} color={wasteComparison.market_hhi > 2500 ? '#dc3545' : '#fd7e14'} icon={<PieChart size={18} />} />
                  <StatCard label="Duopoly Share" value={`${wasteComparison.duopoly_pct}%`} color="#dc3545" icon={<AlertTriangle size={18} />} />
                  <StatCard label="Strategy Status" value={wasteComparison.strategy_status} color="#fd7e14" icon={<FileText size={18} />} />
                  {wasteComparison.efw_saving > 0 && (
                    <StatCard label="EfW Saving" value={formatCurrency(wasteComparison.efw_saving)} color="#28a745" icon={<Target size={18} />} />
                  )}
                </div>
                {wasteComparison.food_waste_impact > 0 && (
                  <div className="service-roi-card" style={{ marginTop: '12px' }}>
                    <div className="service-roi-header">
                      <strong>Food Waste Mandate ({wasteComparison.food_waste_effective || 'TBC'})</strong>
                      <span className="service-roi-net">{formatCurrency(wasteComparison.food_waste_impact)}/yr + {formatCurrency(wasteComparison.food_waste_capital)} capital</span>
                    </div>
                  </div>
                )}
              </CollapsibleSection>
            </div>
          )}

          {/* Service Intelligence: Children's Services */}
          {serviceModel?.children_cost_model && childrenProjection.yearly.length > 0 && (
            <div className="service-intelligence-section">
              <h2 className="service-intelligence-title">
                <Users size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                Service Intelligence: Children&apos;s Services
              </h2>
              <p className="service-intelligence-subtitle">
                LAC placement costs, residential market capacity, workforce conversion, UASC recovery, WOCL programme trajectory
              </p>

              <CollapsibleSection title="Placement Cost Trajectory" icon={<TrendingUp size={16} />} defaultOpen>
                <div className="service-stat-row">
                  <StatCard label="LAC Population" value={(serviceModel.children_cost_model.lac_population?.current || 0).toLocaleString()} icon={<Users size={16} />} />
                  <StatCard label="In Residential" value={(serviceModel.children_cost_model.lac_population?.in_residential || 0).toLocaleString()} icon={<AlertTriangle size={16} />} />
                  <StatCard label="Base Year Cost" value={formatCurrency(childrenProjection.base_cost)} icon={<DollarSign size={16} />} />
                  <StatCard label="5yr Cumulative" value={formatCurrency(childrenProjection.total_5yr_cost)} icon={<TrendingUp size={16} />} />
                </div>
                <ChartCard title="Children's Services Cost Trajectory" subtitle="Residential growth drives cost escalation">
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={childrenProjection.yearly}>
                      <defs>
                        <linearGradient id="childResidential" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ff6b6b" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#ff6b6b" stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="childFostering" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#12B6CF" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#12B6CF" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" tick={{ fill: '#999', fontSize: 11 }} />
                      <YAxis tickFormatter={v => `£${(v / 1e6).toFixed(0)}M`} tick={{ fill: '#999', fontSize: 11 }} />
                      <Tooltip formatter={v => formatCurrency(v)} labelStyle={{ color: '#fff' }} contentStyle={{ background: 'rgba(30,30,40,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                      <Area type="monotone" dataKey="residential_cost" name="Residential" fill="url(#childResidential)" stroke="#ff6b6b" stackId="1" />
                      <Area type="monotone" dataKey="fostering_cost" name="Fostering" fill="url(#childFostering)" stroke="#12B6CF" stackId="1" />
                      <Area type="monotone" dataKey="agency_premium" name="Agency Premium" fill="rgba(255,193,7,0.15)" stroke="#ffc107" stackId="1" />
                      <Area type="monotone" dataKey="uasc_shortfall" name="UASC Shortfall" fill="rgba(168,85,247,0.15)" stroke="#a855f7" stackId="1" />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
              </CollapsibleSection>

              <CollapsibleSection title="WOCL Programme" icon={<Home size={16} />}>
                <div className="service-stat-row">
                  <StatCard label="Current Homes" value={serviceModel.children_cost_model.wocl_programme?.current_homes || 0} icon={<Home size={16} />} />
                  <StatCard label="Target Homes" value={serviceModel.children_cost_model.wocl_programme?.target_homes || 0} icon={<Target size={16} />} />
                  <StatCard label="Net Saving at Capacity" value={formatCurrency(serviceModel.children_cost_model.wocl_programme?.net_saving_at_capacity || 0)} icon={<TrendingDown size={16} />} />
                  <StatCard label="Residential Growth" value={`${serviceModel.children_cost_model.lac_population?.residential_growth_pct_pa || 0}% pa`} icon={<TrendingUp size={16} />} />
                </div>
                {childrenProjection.wocl_trajectory.length > 0 && (
                  <ChartCard title="WOCL Expansion Trajectory" subtitle="In-house homes growth and savings">
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={childrenProjection.wocl_trajectory}>
                        <XAxis dataKey="year" tickFormatter={v => `Yr ${v}`} tick={{ fill: '#999', fontSize: 11 }} />
                        <YAxis yAxisId="left" tickFormatter={v => v} tick={{ fill: '#999', fontSize: 11 }} />
                        <YAxis yAxisId="right" orientation="right" tickFormatter={v => `£${(v / 1e6).toFixed(1)}M`} tick={{ fill: '#999', fontSize: 11 }} />
                        <Tooltip formatter={(v, name) => name === 'Saving' ? formatCurrency(v) : v} contentStyle={{ background: 'rgba(30,30,40,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                        <Bar yAxisId="left" dataKey="homes" name="Homes" fill="#12B6CF" radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="right" dataKey="saving" name="Saving" fill="#28a745" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}
              </CollapsibleSection>

              <CollapsibleSection title="Workforce & Market" icon={<Briefcase size={16} />}>
                <div className="service-stat-row">
                  <StatCard label="Agency SWs" value={serviceModel.children_cost_model.agency_workforce?.apprentices_uclan || 0} icon={<Users size={16} />} sub="on UCLan programme" />
                  <StatCard label="Agency EPs (SEND)" value={serviceModel.children_cost_model.agency_workforce?.agency_eps_send || 0} icon={<AlertTriangle size={16} />} sub={`£${serviceModel.children_cost_model.agency_workforce?.ep_agency_daily || 0}/day`} />
                  <StatCard label="UASC in Care" value={serviceModel.children_cost_model.uasc_model?.uasc_in_care || 0} icon={<Users size={16} />} sub={`£${formatCurrency(serviceModel.children_cost_model.uasc_model?.annual_shortfall_total || 0)} shortfall`} />
                  <StatCard label="IFA Framework" value={formatCurrency(serviceModel.children_cost_model.ifa_contract?.value_total || 0)} icon={<FileText size={16} />} sub={`${serviceModel.children_cost_model.ifa_contract?.through_lancashire_pct || 0}% through Lancashire`} />
                </div>
              </CollapsibleSection>
            </div>
          )}

          {/* Service Intelligence: Public Health */}
          {serviceModel?.public_health_model && phProjection.yearly.length > 0 && (
            <div className="service-intelligence-section">
              <h2 className="service-intelligence-title">
                <Heart size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                Service Intelligence: Public Health
              </h2>
              <p className="service-intelligence-subtitle">
                Grant trajectory, prevention ROI, HCRG monopoly risk, substance misuse funding cliff, health inequalities
              </p>

              <CollapsibleSection title="Grant & Prevention Trajectory" icon={<TrendingDown size={16} />} defaultOpen>
                <div className="service-stat-row">
                  <StatCard label="PH Grant" value={formatCurrency(phProjection.base_grant)} icon={<DollarSign size={16} />} />
                  <StatCard label="5yr Real-Terms Decline" value={formatCurrency(phProjection.grant_decline_5yr)} icon={<TrendingDown size={16} />} />
                  <StatCard label="Prevention ROI" value={`${phProjection.total_prevention_roi}:1`} icon={<TrendingUp size={16} />} />
                  <StatCard label="Monopoly Risk" value={formatCurrency(phProjection.monopoly_risk_value)} icon={<AlertTriangle size={16} />} sub={`HHI ${serviceModel.public_health_model.hcrg_monopoly?.hhi || 0}`} />
                </div>
                <ChartCard title="Public Health Grant Real-Terms Trajectory" subtitle={`Declining ${serviceModel.public_health_model.grant?.real_terms_decline_pct_pa || 2.5}% pa in real terms`}>
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={phProjection.yearly}>
                      <defs>
                        <linearGradient id="phGrant" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#12B6CF" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#12B6CF" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" tick={{ fill: '#999', fontSize: 11 }} />
                      <YAxis tickFormatter={v => `£${(v / 1e6).toFixed(0)}M`} tick={{ fill: '#999', fontSize: 11 }} />
                      <Tooltip formatter={v => formatCurrency(v)} labelStyle={{ color: '#fff' }} contentStyle={{ background: 'rgba(30,30,40,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                      <Area type="monotone" dataKey="grant_real_terms" name="Grant (Real Terms)" fill="url(#phGrant)" stroke="#12B6CF" />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
              </CollapsibleSection>

              <CollapsibleSection title="Prevention ROI Dashboard" icon={<TrendingUp size={16} />}>
                <div className="service-roi-programmes">
                  {['falls', 'smoking', 'obesity', 'physical_activity'].map(cat => {
                    const p = serviceModel.public_health_model.prevention_roi?.[cat]
                    if (!p) return null
                    const avoidance = p.asc_avoidance_pa || p.nhs_avoidance_pa || p.health_saving_pa || 0
                    return (
                      <div key={cat} className="service-roi-card">
                        <div className="service-roi-header">
                          <strong style={{ textTransform: 'capitalize' }}>{cat.replace('_', ' ')}</strong>
                          <span className="service-roi-net">{formatCurrency(avoidance)}/yr avoidance</span>
                        </div>
                        <div className="service-roi-detail">
                          <span className="service-roi-evidence">Spend: {formatCurrency(p.annual_spend || 0)} pa</span>
                          <span className="service-roi-ratio">ROI {p.roi_ratio || 0}:1</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="HCRG Monopoly & Substance Misuse" icon={<AlertTriangle size={16} />}>
                <div className="service-stat-row">
                  <StatCard label="HCRG Annual" value={formatCurrency(serviceModel.public_health_model.hcrg_monopoly?.annual_equivalent || 0)} icon={<DollarSign size={16} />} sub={`HHI ${serviceModel.public_health_model.hcrg_monopoly?.hhi || 0}`} />
                  <StatCard label="CF Published" value={serviceModel.public_health_model.hcrg_monopoly?.contracts_finder_published ?? 'N/A'} icon={<FileText size={16} />} />
                  <StatCard label="CGL Annual" value={formatCurrency(serviceModel.public_health_model.substance_misuse?.cgl_annual || 0)} icon={<DollarSign size={16} />} />
                  <StatCard label="SSMTR/ADDER" value={formatCurrency(serviceModel.public_health_model.substance_misuse?.ssmtr_adder_value || 0)} icon={<AlertTriangle size={16} />} sub="Time-limited" />
                </div>
                {phProjection.supplemental_cliff && (
                  <div className="service-roi-card" style={{ marginTop: '12px', borderLeft: '3px solid #ff6b6b' }}>
                    <div className="service-roi-header">
                      <strong>⚠️ Funding Cliff Edge</strong>
                      <span style={{ color: '#ff6b6b', fontWeight: 700 }}>{formatCurrency(phProjection.supplemental_cliff.value)} at risk</span>
                    </div>
                    <div className="service-roi-detail">
                      <span className="service-roi-evidence">SSMTR/ADDER supplemental funding ends {phProjection.supplemental_cliff.end_date || 'TBC'}</span>
                    </div>
                  </div>
                )}
              </CollapsibleSection>

              {serviceModel.public_health_model.health_inequalities && (
                <CollapsibleSection title="Health Inequalities" icon={<Heart size={16} />}>
                  <div className="service-stat-row">
                    <StatCard label="LE Gap (Male)" value={`${serviceModel.public_health_model.health_inequalities.life_expectancy_gap_male || 0} years`} icon={<TrendingDown size={16} />} />
                    <StatCard label="LE Gap (Female)" value={`${serviceModel.public_health_model.health_inequalities.life_expectancy_gap_female || 0} years`} icon={<TrendingDown size={16} />} />
                    <StatCard label="ASC Residential" value={formatCurrency(serviceModel.public_health_model.health_inequalities.asc_residential_annual || 0)} icon={<DollarSign size={16} />} />
                    <StatCard label="Prevention Target" value={`${serviceModel.public_health_model.health_inequalities.prevention_asc_reduction_target_pct || 0}% reduction`} icon={<Target size={16} />} />
                  </div>
                </CollapsibleSection>
              )}
            </div>
          )}

          {/* Service Intelligence: Property & Procurement */}
          {(serviceModel?.property_cost_model || serviceModel?.procurement_model) && (
            <div className="service-intelligence-section">
              <h2 className="service-intelligence-title">
                <Building size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                Service Intelligence: Property &amp; Procurement
              </h2>
              <p className="service-intelligence-subtitle">
                Estate management, disposal pipeline, co-location savings, procurement concentration, invoice automation
              </p>

              {serviceModel?.property_cost_model && propertyProjection.yearly.length > 0 && (
                <CollapsibleSection title="Estate Cost Trajectory" icon={<Building size={16} />} defaultOpen>
                  <div className="service-stat-row">
                    <StatCard label="Total Properties" value={(serviceModel.property_cost_model.estate_summary?.total_properties || 0).toLocaleString()} icon={<Building size={16} />} />
                    <StatCard label="Running Cost" value={formatCurrency(propertyProjection.base_cost)} icon={<DollarSign size={16} />} sub={`${serviceModel.property_cost_model.estate_summary?.pct_of_total_spend || 0}% of spend`} />
                    <StatCard label="Disposal Target" value={formatCurrency(propertyProjection.disposal_pipeline)} icon={<TrendingUp size={16} />} />
                    <StatCard label="Backlog (5yr)" value={formatCurrency(propertyProjection.backlog_trajectory)} icon={<AlertTriangle size={16} />} />
                  </div>
                  <ChartCard title="Property Estate Net Cost Trajectory" subtitle="Running costs, backlog growth, disposal receipts, co-location savings">
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={propertyProjection.yearly}>
                        <XAxis dataKey="label" tick={{ fill: '#999', fontSize: 11 }} />
                        <YAxis tickFormatter={v => `£${(v / 1e6).toFixed(0)}M`} tick={{ fill: '#999', fontSize: 11 }} />
                        <Tooltip formatter={v => formatCurrency(v)} contentStyle={{ background: 'rgba(30,30,40,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                        <Bar dataKey="running_cost" name="Running Cost" fill="rgba(18,182,207,0.6)" stackId="cost" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="backlog" name="Backlog" fill="rgba(255,107,107,0.6)" stackId="cost" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="disposal_receipts" name="Disposal Receipts" fill="rgba(40,167,69,0.6)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="co_location_saving" name="Co-Location Saving" fill="rgba(255,193,7,0.6)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </CollapsibleSection>
              )}

              {serviceModel?.property_cost_model?.co_location_opportunity && (
                <CollapsibleSection title="Co-Location & Disposal" icon={<Home size={16} />}>
                  <div className="service-stat-row">
                    <StatCard label="Potential Merges" value={serviceModel.property_cost_model.co_location_opportunity.potential_consolidations || 0} icon={<Layers size={16} />} />
                    <StatCard label="Saving Per Merge" value={formatCurrency(serviceModel.property_cost_model.co_location_opportunity.estimated_saving_per_merge || 0)} icon={<DollarSign size={16} />} />
                    <StatCard label="Total Potential" value={formatCurrency(serviceModel.property_cost_model.co_location_opportunity.total_potential || 0)} icon={<TrendingUp size={16} />} />
                    <StatCard label="Care Home Backlog" value={formatCurrency(propertyProjection.care_home_liability)} icon={<AlertTriangle size={16} />} />
                  </div>
                  {serviceModel.property_cost_model.disposal_programme?.active_disposals?.length > 0 && (
                    <div className="service-roi-programmes" style={{ marginTop: '12px' }}>
                      <div className="service-roi-card">
                        <div className="service-roi-header">
                          <strong>Active Disposals</strong>
                          <span className="service-roi-net">{formatCurrency(serviceModel.property_cost_model.disposal_programme.target_receipts || 0)} target</span>
                        </div>
                        <div className="service-roi-detail">
                          <span className="service-roi-evidence">{serviceModel.property_cost_model.disposal_programme.active_disposals.join(', ')}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CollapsibleSection>
              )}

              {serviceModel?.procurement_model && (
                <CollapsibleSection title="Procurement Intelligence" icon={<FileText size={16} />}>
                  <div className="service-stat-row">
                    <StatCard label="HHI" value={(serviceModel.procurement_model.supplier_concentration?.overall_hhi || 0).toLocaleString()} icon={<BarChart2 size={16} />} />
                    <StatCard label="CF Coverage" value={`${serviceModel.procurement_model.contracts_finder_coverage?.overall_pct || 0}%`} icon={<FileText size={16} />} />
                    <StatCard label="Duplicate Risk" value={formatCurrency(serviceModel.procurement_model.duplicate_risk?.flagged_value || 0)} icon={<AlertTriangle size={16} />} />
                    <StatCard label="Invoice Automation" value={formatCurrency(serviceModel.procurement_model.invoice_processing?.automation_saving_potential || 0)} icon={<Zap size={16} />} sub="potential saving" />
                  </div>
                  <div className="service-stat-row" style={{ marginTop: '8px' }}>
                    <StatCard label="Top 10 Suppliers" value={`${serviceModel.procurement_model.supplier_concentration?.top_10_pct_of_spend || 0}%`} icon={<PieChart size={16} />} sub="of total spend" />
                    <StatCard label="Off-Contract" value={`${serviceModel.procurement_model.supplier_concentration?.off_contract_estimate_pct || 0}%`} icon={<AlertTriangle size={16} />} />
                    <StatCard label="Non-Compliant Value" value={formatCurrency(serviceModel.procurement_model.contracts_finder_coverage?.non_compliant_value || 0)} icon={<DollarSign size={16} />} />
                    <StatCard label="Finance FTEs" value={serviceModel.procurement_model.finance_automation_potential?.finance_ftes || 0} icon={<Users size={16} />} sub={`${serviceModel.procurement_model.finance_automation_potential?.automation_pct || 0}% automatable`} />
                  </div>
                </CollapsibleSection>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Budget */}
      {activeTab === 'budget' && (
        <div className="portfolio-tab-content">
          {portfolio.budget_latest && (
            <div className="portfolio-budget-cards">
              {portfolio.budget_latest.gross_expenditure && (
                <StatCard label="Gross Expenditure" value={formatCurrency(portfolio.budget_latest.gross_expenditure)} icon={<PieChart size={24} />} />
              )}
              {portfolio.budget_latest.net_expenditure && (
                <StatCard label="Net Expenditure" value={formatCurrency(portfolio.budget_latest.net_expenditure)} icon={<PieChart size={24} />} />
              )}
              {portfolio.budget_latest.income && (
                <StatCard label="Income" value={formatCurrency(Math.abs(portfolio.budget_latest.income))} icon={<TrendingUp size={24} />} />
              )}
              {portfolio.budget_latest.employees && (
                <StatCard label="Employee Costs" value={formatCurrency(portfolio.budget_latest.employees)} icon={<Users size={24} />} />
              )}
            </div>
          )}
          <div className="portfolio-budget-categories">
            <h3>Budget Categories (SeRCOP)</h3>
            <div className="portfolio-tag-list">
              {(portfolio.budget_categories || []).map((c, i) => (
                <span key={i} className="portfolio-tag">{c}</span>
              ))}
            </div>
          </div>

          {/* Ring-fenced Funding Constraints */}
          {fundingData && fundingData.grants.length > 0 && (
            <CollapsibleSection title="Ring-Fenced Funding" icon={<Shield size={18} />}>
              <div className="portfolio-stat-row" style={{ marginBottom: '1rem' }}>
                <StatCard label="Ring-Fenced Total" value={formatCurrency(fundingData.ring_fenced_total)} color="#e4002b" icon={<Shield size={18} />} />
                <StatCard label="Addressable Budget" value={formatCurrency(fundingData.addressable)} icon={<Target size={18} />} />
                <StatCard label="Addressable %" value={`${fundingData.addressable_pct}%`} icon={<PieChart size={18} />} />
              </div>
              {fundingData.grants.map((g, i) => (
                <div key={i} className="funding-grant-card">
                  <div>
                    <div className="funding-grant-name">
                      {g.name}
                      {g.saveable !== undefined && (
                        <span className={`funding-saveable funding-saveable-${g.saveable}`}>
                          {g.saveable === false ? 'Not saveable' : g.saveable === 'within_ringfence' ? 'Efficiency only' : String(g.saveable)}
                        </span>
                      )}
                    </div>
                    <div className="funding-grant-source">Source: {g.source}</div>
                    {g.note && <div className="funding-grant-note">{g.note}</div>}
                  </div>
                  <div className="funding-grant-value">{formatCurrency(g.value)}</div>
                </div>
              ))}
            </CollapsibleSection>
          )}
        </div>
      )}

      {/* Tab 3: Spending */}
      {activeTab === 'spending' && (
        <div className="portfolio-tab-content">
          <div className="portfolio-spending-info">
            <h3>Spending Department Patterns</h3>
            <p className="portfolio-spending-note">These patterns filter the 753K+ spending records to this portfolio:</p>
            <div className="portfolio-tag-list">
              {(portfolio.spending_department_patterns || []).map((p, i) => (
                <code key={i} className="portfolio-pattern-tag">{p}</code>
              ))}
            </div>
            <Link to="/spending" className="portfolio-section-link">View Full Spending Data <ChevronRight size={14} /></Link>
          </div>

          {/* DOGE Findings for this portfolio */}
          <CollapsibleSection title="DOGE Findings" icon={<Shield size={18} />} defaultOpen>
            <div className="portfolio-findings-grid">
              <div className="portfolio-finding-card">
                <h4>Likely Duplicates</h4>
                <span className="portfolio-finding-count">{pFindings.duplicates.length} groups</span>
                <span className="portfolio-finding-value">{formatCurrency(pFindings.duplicates.reduce((s, d) => s + (d.total_value || d.amount || 0), 0))}</span>
              </div>
              <div className="portfolio-finding-card">
                <h4>Split Payments</h4>
                <span className="portfolio-finding-count">{pFindings.splits.length} instances</span>
                <span className="portfolio-finding-value">{formatCurrency(pFindings.splits.reduce((s, d) => s + (d.total_value || d.amount || 0), 0))}</span>
              </div>
              <div className="portfolio-finding-card">
                <h4>CH Red Flags</h4>
                <span className="portfolio-finding-count">{pFindings.ch_flags.length} suppliers</span>
              </div>
              <div className="portfolio-finding-card">
                <h4>Round Numbers</h4>
                <span className="portfolio-finding-count">{pFindings.round_numbers.length} payments</span>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* Tab 4: Contracts & Procurement */}
      {activeTab === 'contracts' && (
        <div className="portfolio-tab-content">
          {/* Contract Coverage Stats */}
          <div className="portfolio-stat-row" style={{ marginBottom: '1.5rem' }}>
            <StatCard label="Matched Contracts" value={contractData.total_contracts} icon={<FileText size={18} />} />
            <StatCard label="Total Value" value={contractData.total_value > 0 ? formatCurrency(contractData.total_value) : '—'} icon={<TrendingUp size={18} />} />
            <StatCard label="Expiring <3 months" value={contractData.expiring_3m.length} color={contractData.expiring_3m.length > 0 ? '#e4002b' : undefined} icon={<AlertTriangle size={18} />} />
            <StatCard label="Expiring 3-12 months" value={contractData.expiring_6m.length + contractData.expiring_12m.length} icon={<Calendar size={18} />} />
          </div>

          {/* Key Contracts Table */}
          {portfolio.key_contracts?.length > 0 && (
            <CollapsibleSection title="Key Contracts" icon={<Briefcase size={18} />} defaultOpen>
              <div className="portfolio-contracts-table-wrap">
                <table className="portfolio-contracts-table">
                  <thead>
                    <tr>
                      <th>Contract</th>
                      <th>Provider</th>
                      <th>Value</th>
                      <th>Duration</th>
                      <th>CF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.key_contracts.map((kc, i) => (
                      <tr key={i}>
                        <td>
                          <span className="contract-name">{kc.name}</span>
                          {kc.note && <span className="contract-note">{kc.note}</span>}
                        </td>
                        <td>{kc.provider}</td>
                        <td className="contract-value">{kc.value}</td>
                        <td>{kc.duration}</td>
                        <td>
                          {kc.contracts_finder_ids?.length > 0
                            ? <span className="cf-badge cf-linked" title={`${kc.contracts_finder_ids.length} linked`}>{kc.contracts_finder_ids.length}</span>
                            : <span className="cf-badge cf-none" title="Not on Contracts Finder">—</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          )}

          {/* Contracts Finder Notices */}
          {contractData.relevant.length > 0 && (
            <CollapsibleSection title={`Contracts Finder Notices (${contractData.relevant.length})`} icon={<FileText size={18} />}>
              <div className="portfolio-contracts-table-wrap">
                <table className="portfolio-contracts-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Supplier</th>
                      <th>Value</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractData.relevant.slice(0, 25).map((c, i) => (
                      <tr key={c.id || i}>
                        <td>
                          {c.id ? <a href={`https://www.contractsfinder.service.gov.uk/Notice/${c.id}`} target="_blank" rel="noopener noreferrer" className="contract-link">{c.title}</a> : c.title}
                        </td>
                        <td>{c.supplier}</td>
                        <td className="contract-value">{c.value > 0 ? formatCurrency(c.value) : '—'}</td>
                        <td><span className={`contract-status contract-status-${c.status?.toLowerCase()}`}>{c.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          )}

          {/* Contract Expiry Pipeline */}
          {(contractData.expiring_3m.length > 0 || contractData.expiring_6m.length > 0 || contractData.expiring_12m.length > 0) && (
            <CollapsibleSection title="Contract Expiry Pipeline" icon={<AlertTriangle size={18} />}>
              {[
                { label: 'Expiring within 3 months', items: contractData.expiring_3m, urgency: 'critical' },
                { label: 'Expiring 3-6 months', items: contractData.expiring_6m, urgency: 'warning' },
                { label: 'Expiring 6-12 months', items: contractData.expiring_12m, urgency: 'info' },
              ].filter(g => g.items.length > 0).map(g => (
                <div key={g.label} className="expiry-group">
                  <h4 className={`expiry-heading expiry-${g.urgency}`}>{g.label} ({g.items.length})</h4>
                  {g.items.map((c, i) => (
                    <div key={i} className="expiry-card">
                      <span className="expiry-title">{c.title}</span>
                      <span className="expiry-supplier">{c.supplier}</span>
                      <span className="expiry-value">{c.value > 0 ? formatCurrency(c.value) : '—'}</span>
                      <span className="expiry-date">{c.end_date}</span>
                    </div>
                  ))}
                </div>
              ))}
            </CollapsibleSection>
          )}

          {contractData.total_contracts === 0 && !portfolio.key_contracts?.length && (
            <p className="portfolio-note">No Contracts Finder data matched this portfolio. Coverage gaps may exist — check procurement.json for department matching patterns.</p>
          )}
        </div>
      )}

      {/* Tab 5: Savings */}
      {activeTab === 'savings' && (
        <div className="portfolio-tab-content">
          <CollapsibleSection title="Action Directives" icon={<Target size={18} />} defaultOpen>
            <div className="portfolio-directives">
              {directives.length === 0 && <p className="portfolio-empty">No directives generated. Spending data may be required.</p>}
              {directives.map((d, i) => {
                const pathway = decisionPathway(d, governance)
                return (
                  <div key={d.id} className="portfolio-directive-card">
                    <div className="portfolio-directive-header">
                      <span className="portfolio-directive-type">{d.type.replace(/_/g, ' ')}</span>
                      <span className={`portfolio-directive-risk portfolio-risk-${d.risk?.toLowerCase()}`}>{d.risk}</span>
                    </div>
                    <div className="portfolio-directive-action"><strong>DO:</strong> {d.action}</div>
                    <div className="portfolio-directive-row">
                      <span><strong>SAVE:</strong> {formatCurrency(d.save_low)} – {formatCurrency(d.save_high)}</span>
                      <span><strong>BY WHEN:</strong> {d.timeline}</span>
                    </div>
                    <div className="portfolio-directive-row">
                      <span><strong>LEGAL:</strong> {d.legal_basis}</span>
                    </div>
                    {pathway && (
                      <div className="portfolio-directive-row">
                        <span><strong>ROUTE:</strong> {pathway.route.replace(/_/g, ' ')} — {pathway.authority}</span>
                        <span className="portfolio-directive-timeline-days">{pathway.timeline_days} days</span>
                      </div>
                    )}
                    {d.steps?.length > 0 && (
                      <div className="portfolio-directive-steps">
                        <strong>HOW:</strong>
                        <ol>{d.steps.map((s, j) => <li key={j}>{s}</li>)}</ol>
                      </div>
                    )}
                    {d.evidence && <div className="portfolio-directive-evidence"><strong>EVIDENCE:</strong> {d.evidence}</div>}
                    {d.funding_constraint && <div className="portfolio-directive-constraint"><strong>FUNDING:</strong> {d.funding_constraint}</div>}
                    {d.article_refs?.length > 0 && (
                      <div className="portfolio-directive-sources">
                        <strong>SOURCES:</strong>
                        {d.article_refs.map((r, j) => (
                          <Link key={j} to={`/news/${r.id}`} className="portfolio-source-link">
                            <FileText size={12} /> {r.title}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CollapsibleSection>

          {/* Priority Matrix */}
          {scatterData.length > 0 && (
            <ChartCard title="Priority Matrix" subtitle="Top-right = Do Now">
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="x" name="Feasibility" domain={[0, 10]} tick={AXIS_TICK_STYLE} />
                  <YAxis type="number" dataKey="y" name="Impact" domain={[0, 10]} tick={AXIS_TICK_STYLE} />
                  <ZAxis type="number" dataKey="z" range={[40, 400]} />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                  <Scatter data={scatterData} fill="#12B6CF" fillOpacity={0.6} />
                </ScatterChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </div>
      )}

      {/* Tab 6: Decisions */}
      {activeTab === 'decisions' && (
        <div className="portfolio-tab-content">
          <CollapsibleSection title="Upcoming Meetings" icon={<Calendar size={18} />} defaultOpen>
            {upcomingDecisions.length === 0 && <p className="portfolio-empty">No upcoming meetings found.</p>}
            {upcomingDecisions.map((d, i) => (
              <div key={i} className="portfolio-decision-item">
                <div className="portfolio-decision-date">{d.date}</div>
                <div className="portfolio-decision-content">
                  <h4>{d.meeting}</h4>
                  {d.venue && <span className="portfolio-decision-venue">{d.venue}</span>}
                </div>
              </div>
            ))}
          </CollapsibleSection>

          {/* Recent decisions from council documents */}
          {documents.length > 0 && (
            <CollapsibleSection title="Recent Decisions" icon={<FileText size={18} />}>
              <div className="portfolio-recent-decisions">
                {documents
                  .filter(d => {
                    const comm = (d.committee || '').toLowerCase()
                    return comm.includes('cabinet')
                  })
                  .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                  .slice(0, 10)
                  .map((d, i) => (
                    <div key={i} className="portfolio-decision-item">
                      <div className="portfolio-decision-date">{d.date}</div>
                      <div className="portfolio-decision-content">
                        <h4>{d.title || d.summary}</h4>
                        {d.decision_type && <span className={`portfolio-decision-type portfolio-dt-${d.decision_type}`}>{d.decision_type}</span>}
                      </div>
                    </div>
                  ))
                }
              </div>
            </CollapsibleSection>
          )}
        </div>
      )}

      {/* Tab 7: Legal & Political */}
      {activeTab === 'legal' && (
        <div className="portfolio-tab-content">
          <CollapsibleSection title="Statutory Duties" icon={<Scale size={18} />} defaultOpen>
            <div className="portfolio-statutory-grid">
              {(portfolio.statutory_duties || []).map((d, i) => (
                <div key={i} className={`portfolio-statutory-card portfolio-statutory-${d.risk_level}`}>
                  <div className="portfolio-statutory-header">
                    <span className={`portfolio-statutory-badge portfolio-badge-${d.risk_level}`}>
                      {d.risk_level === 'red' ? 'RED LINE' : d.risk_level === 'amber' ? 'AMBER ZONE' : 'GREEN SPACE'}
                    </span>
                  </div>
                  <h4>{d.act}</h4>
                  <p>{d.summary}</p>
                  <span className="portfolio-statutory-risk">{d.risk}</span>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {politicalCtx && (
            <CollapsibleSection title="Political Context" icon={<Shield size={18} />}>
              <div className="portfolio-political-grid">
                <div className="portfolio-political-item">
                  <strong>Reform Majority</strong>
                  <span>{politicalCtx.reform_majority ? 'Yes — comfortable majority' : 'No'}</span>
                </div>
                <div className="portfolio-political-item">
                  <strong>LGR Deadline</strong>
                  <span>{politicalCtx.lgr_deadline} — {politicalCtx.lgr_impact}</span>
                </div>
                <div className="portfolio-political-item">
                  <strong>Next Elections</strong>
                  <span>{politicalCtx.next_elections} — {politicalCtx.time_to_deliver}</span>
                </div>
                <div className="portfolio-political-item">
                  <strong>Opposition</strong>
                  <span>{politicalCtx.opposition_parties?.join(', ')}</span>
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* Decision Pathways */}
          <CollapsibleSection title="Decision Pathways" icon={<MapPin size={18} />}>
            <div className="portfolio-pathways">
              <div className="portfolio-pathway-card">
                <h4>Officer Delegation</h4>
                <p>Up to £250K (Director) / £500K (ED) / £1M (Chief Exec). No member decision needed. 5-10 days.</p>
              </div>
              <div className="portfolio-pathway-card">
                <h4>Cabinet Member Decision</h4>
                <p>£500K–£1M. 28 days Forward Plan notice. Published decision. 5-day call-in period.</p>
              </div>
              <div className="portfolio-pathway-card">
                <h4>Cabinet</h4>
                <p>Over £1M or policy significance. 28 days Forward Plan. Published decision. Call-in risk.</p>
              </div>
              <div className="portfolio-pathway-card">
                <h4>Full Council</h4>
                <p>Budget/Policy Framework changes. Cabinet recommendation → Full Council vote. Reform 53/84.</p>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* Tab 8: Operations (cabinet_member+) */}
      {activeTab === 'operations' && isCabinetLevel && (
        <div className="portfolio-tab-content">
          <p className="portfolio-note">Department operations analysis requires spending data to be loaded for full profile generation.</p>
          <div className="portfolio-overview-section">
            <h3>Known Pressures</h3>
            <ul className="portfolio-pressures-list">
              {(portfolio.known_pressures || []).map((p, i) => (
                <li key={i} className="portfolio-pressure-item"><AlertTriangle size={12} /> {p}</li>
              ))}
            </ul>
          </div>
          <div className="portfolio-overview-section">
            <h3>Cross-Portfolio Dependencies</h3>
            {dependencies.filter(d => d.from === portfolio.id || d.to === portfolio.id).length === 0 && (
              <p className="portfolio-empty">No direct dependencies identified.</p>
            )}
            {dependencies.filter(d => d.from === portfolio.id || d.to === portfolio.id).map((d, i) => (
              <div key={i} className="portfolio-dependency-card">
                <strong>{d.type.replace(/_/g, ' ')}</strong>
                <p>{d.description}</p>
                <span className="portfolio-dependency-roi">ROI: {d.roi_timeline}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 9: Reform Playbook (cabinet_member+) */}
      {activeTab === 'playbook' && isCabinetLevel && playbook && (
        <div className="portfolio-tab-content">
          {/* Phased Delivery */}
          <CollapsibleSection title="Phased Delivery Plan" icon={<Zap size={18} />} defaultOpen>
            {['year_1', 'year_2', 'year_3'].map(phase => {
              const p = playbook.phases[phase]
              return (
                <div key={phase} className="portfolio-playbook-phase">
                  <div className="portfolio-playbook-phase-header">
                    <h3>{p.label}</h3>
                    <span className="portfolio-playbook-phase-savings">{formatCurrency(p.total_savings)}</span>
                    <span className="portfolio-playbook-phase-count">{p.directives.length} directives</span>
                  </div>
                  {p.directives.length > 0 && (
                    <div className="portfolio-playbook-directives">
                      {p.directives.map(d => (
                        <div key={d.id} className="portfolio-playbook-directive">
                          <span className={`portfolio-playbook-risk portfolio-risk-${d.risk?.toLowerCase()}`}>{d.risk}</span>
                          <span className="portfolio-playbook-action">{d.action}</span>
                          <span className="portfolio-playbook-save">{formatCurrency(d.save_central)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </CollapsibleSection>

          {/* Red Lines / Amber / Green */}
          <CollapsibleSection title="Red Lines — Cannot Touch" icon={<AlertTriangle size={18} />}>
            {playbook.red_lines.length === 0 && <p className="portfolio-empty">No statutory red lines identified.</p>}
            {playbook.red_lines.map((r, i) => (
              <div key={i} className="portfolio-redline-card">
                <h4>{r.act}</h4>
                <p>{r.summary}</p>
                <span className="portfolio-redline-risk">{r.risk}</span>
              </div>
            ))}
          </CollapsibleSection>

          {playbook.amber_zones.length > 0 && (
            <CollapsibleSection title="Amber Zones — Proceed With Caution" icon={<Shield size={18} />}>
              {playbook.amber_zones.map((a, i) => (
                <div key={i} className="portfolio-amber-card">
                  <h4>{a.act}</h4>
                  <p>{a.summary}</p>
                  <span className="portfolio-amber-risk">{a.risk}</span>
                </div>
              ))}
            </CollapsibleSection>
          )}

          {playbook.green_space.length > 0 && (
            <CollapsibleSection title="Green Space — Full Freedom" icon={<Target size={18} />}>
              {playbook.green_space.map((g, i) => (
                <div key={i} className="portfolio-green-card">
                  <h4>{g.act}</h4>
                  <p>{g.summary}</p>
                </div>
              ))}
            </CollapsibleSection>
          )}

          {/* FOI Generation */}
          <CollapsibleSection title="Generate FOI Requests" icon={<FileText size={18} />}>
            <div className="portfolio-foi-grid">
              {directives.slice(0, 5).map(d => {
                const foi = generatePortfolioFOI(d, portfolio)
                if (!foi) return null
                return (
                  <div key={d.id} className="portfolio-foi-card">
                    <h4>{foi.subject}</h4>
                    <pre className="portfolio-foi-body">{foi.body}</pre>
                  </div>
                )
              })}
            </div>
          </CollapsibleSection>

          {/* Total */}
          <div className="portfolio-playbook-total">
            <div className="portfolio-playbook-total-inner">
              <span>Total Savings Pipeline</span>
              <strong>{formatCurrency(playbook.total_savings)}</strong>
              <span className="portfolio-playbook-total-count">{playbook.directive_count} directives across {Object.values(playbook.phases).filter(p => p.directives.length > 0).length} phases</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
