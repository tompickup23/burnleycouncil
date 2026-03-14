import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, PieChart, Target, AlertTriangle, ChevronRight, Calendar, TrendingUp, Shield, Zap, Briefcase } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ScatterChart, Scatter, ZAxis, PieChart as RechartsPie, Pie, Cell, Legend } from 'recharts'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { isFirebaseEnabled } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { LoadingState } from '../components/ui'
import { StatCard } from '../components/ui/StatCard'
import { ChartCard, CHART_TOOLTIP_STYLE } from '../components/ui/ChartCard'
import CollapsibleSection from '../components/CollapsibleSection'
import { CHART_COLORS, TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE, CHART_ANIMATION } from '../utils/constants'
import {
  aggregateSavings,
  generateDirectives,
  matchSpendingToPortfolio,
  decisionPipeline,
  priorityMatrix,
  formatCurrency,
  getAccessiblePortfolios,
  buildImplementationCalendar,
} from '../utils/savingsEngine'
import './CabinetDashboard.css'

/**
 * Cabinet Dashboard — the Reform command centre.
 *
 * Requires councillor+ role. Shows:
 * - 10 portfolio cards with budget, savings, risk
 * - Reform Operations Centre: top directives, savings pipeline, priority matrix
 * - Decision pipeline: upcoming cabinet meetings
 * - Budget health overview
 */
export default function CabinetDashboard() {
  const config = useCouncilConfig()
  const dataSources = config.data_sources || {}
  const authCtx = useAuth()
  const [activeTab, setActiveTab] = useState('operations')

  // Access check
  const hasAccess = authCtx?.isCouncillor || !isFirebaseEnabled

  const { data: allData, loading, error } = useData(
    dataSources.cabinet_portfolios
      ? ['/data/cabinet_portfolios.json', '/data/doge_findings.json', '/data/budgets.json', '/data/meetings.json', '/data/council_documents.json']
      : null
  )

  const [portfolioData, findingsData, budgetsData, meetingsData, documentsData] = allData || [null, null, null, null, null]

  const portfolios = portfolioData?.portfolios || []
  const governance = portfolioData?.governance || {}
  const administration = portfolioData?.administration || {}
  const findings = findingsData || {}
  const meetings = Array.isArray(meetingsData) ? meetingsData : meetingsData?.meetings || []

  // Accessible portfolios for this user
  const accessiblePortfolios = useMemo(() => {
    const role = authCtx?.role || 'public'
    const ids = authCtx?.permissions?.portfolio_ids || []
    return getAccessiblePortfolios(portfolios, role, ids)
  }, [portfolios, authCtx])

  // Aggregate savings across all portfolios
  const savings = useMemo(() => aggregateSavings(portfolios, findings), [portfolios, findings])

  // Generate all directives across portfolios
  const allDirectives = useMemo(() => {
    const directives = []
    for (const p of portfolios) {
      const matched = [] // Would need spending data per portfolio in a real implementation
      const pDirectives = generateDirectives(p, findings, matched)
      directives.push(...pDirectives)
    }
    return directives
  }, [portfolios, findings])

  // Priority matrix
  const matrix = useMemo(() => priorityMatrix(allDirectives), [allDirectives])

  // Top 5 "Do Now" directives
  const topDirectives = useMemo(() => matrix.do_now.slice(0, 5), [matrix])

  // Savings by type for pie chart
  const savingsByType = useMemo(() => {
    const types = {}
    for (const d of allDirectives) {
      const type = d.type || 'other'
      types[type] = (types[type] || 0) + (d.save_central || 0)
    }
    return Object.entries(types)
      .map(([name, value], i) => ({ name: name.replace(/_/g, ' '), value: Math.round(value / 1000000), fill: CHART_COLORS[i % CHART_COLORS.length] }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [allDirectives])

  // Scatter data for priority matrix
  const scatterData = useMemo(() => {
    return allDirectives.map(d => ({
      x: d.feasibility || 5,
      y: d.impact || 5,
      z: (d.save_central || 0) / 100000,
      name: d.action?.substring(0, 40),
      portfolio: d.portfolio_id,
    }))
  }, [allDirectives])

  // Portfolio cards data
  const portfolioCards = useMemo(() => {
    return portfolios.map((p, i) => {
      const pDirectives = allDirectives.filter(d => d.portfolio_id === p.id)
      const totalSavings = pDirectives.reduce((s, d) => s + (d.save_central || 0), 0)
      const highPriority = pDirectives.filter(d => d.priority === 'high').length
      return {
        ...p,
        directive_count: pDirectives.length,
        total_savings: totalSavings,
        high_priority: highPriority,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }
    })
  }, [portfolios, allDirectives])

  // Decision pipeline
  const upcomingDecisions = useMemo(() => {
    const pipeline = []
    for (const p of portfolios) {
      pipeline.push(...decisionPipeline(meetings, p))
    }
    return pipeline.sort((a, b) => (a.date || '').localeCompare(b.date || '')).slice(0, 10)
  }, [portfolios, meetings])

  // Implementation calendar
  const calendar = useMemo(() =>
    buildImplementationCalendar(allDirectives.slice(0, 20), meetings, governance),
  [allDirectives, meetings, governance])

  if (!dataSources.cabinet_portfolios) {
    return <div className="cabinet-dashboard"><h1>Cabinet Dashboard</h1><p>Not available for this council.</p></div>
  }

  if (!hasAccess) {
    return (
      <div className="cabinet-dashboard">
        <div className="cabinet-access-denied">
          <Shield size={48} />
          <h2>Councillor Access Required</h2>
          <p>You need councillor access or above to view the Cabinet Dashboard.</p>
        </div>
      </div>
    )
  }

  if (loading) return <LoadingState message="Loading cabinet data..." />
  if (error) return <div className="cabinet-dashboard"><h1>Error</h1><p>{error.message || 'Failed to load'}</p></div>

  const tabs = [
    { id: 'operations', label: 'Operations', icon: <Zap size={16} /> },
    { id: 'portfolios', label: 'Portfolios', icon: <Briefcase size={16} /> },
    { id: 'decisions', label: 'Decisions', icon: <Calendar size={16} /> },
    { id: 'budget', label: 'Budget', icon: <PieChart size={16} /> },
  ]

  return (
    <div className="cabinet-dashboard">
      {/* Hero */}
      <div className="cabinet-hero">
        <h1>Cabinet Dashboard</h1>
        <p className="cabinet-subtitle">Reform Operations Centre — {administration.party} {administration.seats}/{administration.total}</p>
        <div className="cabinet-hero-stats">
          <StatCard label="Total Savings Identified" value={formatCurrency(savings.total_identified)} icon={<TrendingUp size={24} />} />
          <StatCard label="Action Directives" value={allDirectives.length} icon={<Target size={24} />} />
          <StatCard label="Do Now" value={matrix.do_now.length} icon={<Zap size={24} />} />
          <StatCard label="Portfolios" value={portfolios.length} icon={<Users size={24} />} />
        </div>
      </div>

      {/* Tab navigation */}
      <div className="cabinet-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`cabinet-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Operations Tab */}
      {activeTab === 'operations' && (
        <div className="cabinet-operations">
          {/* Top 5 Do Now */}
          <CollapsibleSection title="Monday Morning List — Do Now" icon={<Zap size={18} />} defaultOpen>
            <div className="cabinet-directives">
              {topDirectives.length === 0 && <p className="cabinet-empty">No high-priority directives identified.</p>}
              {topDirectives.map((d, i) => (
                <div key={d.id} className="cabinet-directive-card">
                  <div className="cabinet-directive-rank">{i + 1}</div>
                  <div className="cabinet-directive-body">
                    <div className="cabinet-directive-action">DO: {d.action}</div>
                    <div className="cabinet-directive-meta">
                      <span className="cabinet-directive-save">SAVE: {formatCurrency(d.save_low)} – {formatCurrency(d.save_high)}</span>
                      <span className="cabinet-directive-timeline">{d.timeline}</span>
                      <span className={`cabinet-directive-risk cabinet-risk-${d.risk?.toLowerCase()}`}>{d.risk} risk</span>
                    </div>
                    <div className="cabinet-directive-legal">LEGAL: {d.legal_basis}</div>
                    <div className="cabinet-directive-route">ROUTE: {d.governance_route?.replace(/_/g, ' ')}</div>
                    <Link to={`/cabinet/${d.portfolio_id}`} className="cabinet-directive-link">
                      View Portfolio <ChevronRight size={12} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* Savings Pipeline & Priority Matrix */}
          <div className="cabinet-charts-row">
            {savingsByType.length > 0 && (
              <ChartCard title="Savings by Type (£M)">
                <ResponsiveContainer width="100%" height={280}>
                  <RechartsPie>
                    <Pie data={savingsByType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: £${value}M`} {...CHART_ANIMATION}>
                      {savingsByType.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`£${v}M`]} />
                  </RechartsPie>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {scatterData.length > 0 && (
              <ChartCard title="Priority Matrix (Feasibility × Impact)" subtitle="Top-right = Do Now">
                <ResponsiveContainer width="100%" height={280}>
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="x" name="Feasibility" domain={[0, 10]} tick={AXIS_TICK_STYLE} label={{ value: 'Feasibility →', position: 'bottom', fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                    <YAxis type="number" dataKey="y" name="Impact" domain={[0, 10]} tick={AXIS_TICK_STYLE} label={{ value: 'Impact →', angle: -90, position: 'left', fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                    <ZAxis type="number" dataKey="z" range={[50, 400]} />
                    <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [v, name]} />
                    <Scatter data={scatterData} fill="#12B6CF" fillOpacity={0.6} />
                  </ScatterChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>

          {/* Savings timeline */}
          <CollapsibleSection title="Savings Timeline" icon={<TrendingUp size={18} />}>
            <div className="cabinet-timeline-grid">
              <div className="cabinet-timeline-item">
                <span className="cabinet-timeline-label">Immediate (0-3m)</span>
                <span className="cabinet-timeline-value">{formatCurrency(savings.by_timeline.immediate)}</span>
              </div>
              <div className="cabinet-timeline-item">
                <span className="cabinet-timeline-label">Short-term (3-12m)</span>
                <span className="cabinet-timeline-value">{formatCurrency(savings.by_timeline.short_term)}</span>
              </div>
              <div className="cabinet-timeline-item">
                <span className="cabinet-timeline-label">Medium-term (12-24m)</span>
                <span className="cabinet-timeline-value">{formatCurrency(savings.by_timeline.medium_term)}</span>
              </div>
              <div className="cabinet-timeline-item">
                <span className="cabinet-timeline-label">Long-term (24m+)</span>
                <span className="cabinet-timeline-value">{formatCurrency(savings.by_timeline.long_term)}</span>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* Portfolios Tab */}
      {activeTab === 'portfolios' && (
        <div className="cabinet-portfolios-tab">
          <div className="cabinet-portfolio-grid">
            {portfolioCards.map(p => (
              <Link key={p.id} to={`/cabinet/${p.id}`} className="cabinet-portfolio-card">
                <div className="cabinet-portfolio-card-header" style={{ borderLeftColor: p.color }}>
                  <h3>{p.short_title || p.title}</h3>
                  <span className="cabinet-portfolio-member">{p.cabinet_member?.name}</span>
                </div>
                <div className="cabinet-portfolio-card-stats">
                  {p.budget_latest?.net_expenditure && (
                    <div className="cabinet-portfolio-stat">
                      <span className="cabinet-portfolio-stat-label">Budget</span>
                      <span className="cabinet-portfolio-stat-value">{formatCurrency(p.budget_latest.net_expenditure)}</span>
                    </div>
                  )}
                  <div className="cabinet-portfolio-stat">
                    <span className="cabinet-portfolio-stat-label">Savings</span>
                    <span className="cabinet-portfolio-stat-value">{formatCurrency(p.total_savings)}</span>
                  </div>
                  <div className="cabinet-portfolio-stat">
                    <span className="cabinet-portfolio-stat-label">Directives</span>
                    <span className="cabinet-portfolio-stat-value">{p.directive_count}</span>
                  </div>
                  {p.high_priority > 0 && (
                    <div className="cabinet-portfolio-stat cabinet-portfolio-stat-alert">
                      <span className="cabinet-portfolio-stat-label">High Priority</span>
                      <span className="cabinet-portfolio-stat-value">{p.high_priority}</span>
                    </div>
                  )}
                </div>
                <div className="cabinet-portfolio-card-services">
                  {(p.key_services || []).slice(0, 3).join(' · ')}
                </div>
                <ChevronRight size={16} className="cabinet-portfolio-arrow" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Decisions Tab */}
      {activeTab === 'decisions' && (
        <div className="cabinet-decisions-tab">
          <CollapsibleSection title="Upcoming Meetings" icon={<Calendar size={18} />} defaultOpen>
            {upcomingDecisions.length === 0 && <p className="cabinet-empty">No upcoming meetings found.</p>}
            {upcomingDecisions.map((d, i) => (
              <div key={i} className="cabinet-decision-item">
                <div className="cabinet-decision-date">{d.date}</div>
                <div className="cabinet-decision-content">
                  <h4>{d.meeting}</h4>
                  {d.venue && <span className="cabinet-decision-venue">{d.venue}</span>}
                </div>
              </div>
            ))}
          </CollapsibleSection>

          {calendar.length > 0 && (
            <CollapsibleSection title="Implementation Calendar" icon={<Target size={18} />}>
              <div className="cabinet-calendar">
                {calendar.map((c, i) => (
                  <div key={i} className="cabinet-calendar-item">
                    <div className="cabinet-calendar-date">{c.target_date}</div>
                    <div className="cabinet-calendar-action">
                      <span className={`cabinet-calendar-route cabinet-route-${c.route}`}>{c.route.replace(/_/g, ' ')}</span>
                      {c.action}
                    </div>
                    <div className="cabinet-calendar-save">{formatCurrency(c.save_central)}</div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}
        </div>
      )}

      {/* Budget Tab */}
      {activeTab === 'budget' && (
        <div className="cabinet-budget-tab">
          <ChartCard title="Portfolio Budgets (£M)" subtitle="Net expenditure by portfolio">
            <ResponsiveContainer width="100%" height={Math.max(300, portfolioCards.length * 45)}>
              <BarChart data={portfolioCards.filter(p => p.budget_latest?.net_expenditure).map(p => ({ name: p.short_title, budget: Math.round(p.budget_latest.net_expenditure / 1000000), savings: Math.round(p.total_savings / 1000000) })).sort((a, b) => b.budget - a.budget)} layout="vertical" margin={{ left: 100, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK_STYLE} />
                <YAxis type="category" dataKey="name" tick={AXIS_TICK_STYLE} width={95} />
                <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [`£${v}M`, name === 'budget' ? 'Budget' : 'Savings Identified']} />
                <Bar dataKey="budget" fill="#12B6CF" radius={[0, 4, 4, 0]} {...CHART_ANIMATION} />
                <Bar dataKey="savings" fill="#28a745" radius={[0, 4, 4, 0]} {...CHART_ANIMATION} />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </div>
  )
}
