import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Building2, PieChart, ChevronRight, ExternalLink, Briefcase, Shield, Calendar, Landmark, Zap } from 'lucide-react'
import { Treemap, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { isFirebaseEnabled } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { LoadingState } from '../components/ui'
import { StatCard } from '../components/ui/StatCard'
import { ChartCard, CHART_TOOLTIP_STYLE } from '../components/ui/ChartCard'
import CollapsibleSection from '../components/CollapsibleSection'
import { CHART_COLORS, TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE, CHART_ANIMATION } from '../utils/constants'
import { formatCurrency, contractPipeline } from '../utils/savingsEngine'
import { useSpendingSummary } from '../hooks/useSpendingSummary'
import './Executive.css'

/**
 * Executive Page — public view of who runs the council.
 *
 * Shows:
 * - Cabinet member grid with portfolios and budget bars
 * - Senior officer structure
 * - Committee structure
 * - Budget treemap by portfolio
 * - Recent cabinet decisions
 */
export default function Executive() {
  const config = useCouncilConfig()
  const dataSources = config.data_sources || {}
  const authCtx = useAuth()
  const hasCouncillorAccess = authCtx?.isCouncillor || !isFirebaseEnabled
  const [selectedMember, setSelectedMember] = useState(null)
  const { summary: spendingSummary } = useSpendingSummary()

  const { data: allData, loading, error } = useData(
    dataSources.cabinet_portfolios
      ? ['/data/cabinet_portfolios.json', '/data/committees.json', '/data/council_documents.json', '/data/budgets.json', '/data/councillors.json', '/data/procurement.json']
      : null
  )

  const [portfolioData, committeesData, documentsData, budgetsData, councillorsData, procurementData] = allData || [null, null, null, null, null, null]

  const portfolios = portfolioData?.portfolios || []
  const governance = portfolioData?.governance || {}
  const seniorOfficers = portfolioData?.senior_officers || {}
  const administration = portfolioData?.administration || {}
  const committees = committeesData?.committees || committeesData || []
  const documents = Array.isArray(documentsData) ? documentsData : documentsData?.decisions || []
  const councillors = Array.isArray(councillorsData) ? councillorsData : councillorsData?.councillors || []

  // Budget treemap data
  const treemapData = useMemo(() => {
    if (!portfolios.length) return []
    return portfolios
      .filter(p => p.budget_latest?.net_expenditure)
      .map((p, i) => ({
        name: p.short_title || p.title,
        value: Math.round((p.budget_latest.net_expenditure || 0) / 1000000),
        portfolio_id: p.id,
        cabinet_member: p.cabinet_member?.name,
        fill: CHART_COLORS[i % CHART_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value)
  }, [portfolios])

  // Budget bar chart
  const budgetBars = useMemo(() => {
    if (!portfolios.length) return []
    return portfolios
      .filter(p => p.budget_latest?.net_expenditure)
      .map(p => {
        const ps = spendingSummary?.by_portfolio?.[p.id]
        return {
          name: p.short_title || p.title,
          net: Math.round((p.budget_latest.net_expenditure || 0) / 1000000),
          gross: Math.round((p.budget_latest.gross_expenditure || 0) / 1000000),
          actual: ps ? Math.round((ps.total || 0) / 1000000) : null,
        }
      })
      .sort((a, b) => b.net - a.net)
  }, [portfolios, spendingSummary])

  // Recent cabinet decisions
  const recentDecisions = useMemo(() => {
    if (!documents.length) return []
    return documents
      .filter(d => {
        const committee = (d.committee || d.meeting_type || '').toLowerCase()
        return committee.includes('cabinet')
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 10)
  }, [documents])

  // Committee breakdown
  const committeesByType = useMemo(() => {
    if (!committees.length) return {}
    const groups = {}
    for (const c of committees) {
      const type = c.type || c.category || 'Other'
      if (!groups[type]) groups[type] = []
      groups[type].push(c)
    }
    return groups
  }, [committees])

  // Total budget
  const totalBudget = useMemo(() => {
    return portfolios.reduce((s, p) => s + (p.budget_latest?.net_expenditure || 0), 0)
  }, [portfolios])

  // Contract coverage health
  const procurement = Array.isArray(procurementData) ? procurementData : procurementData?.contracts || []
  const contractHealth = useMemo(() => {
    if (!procurement.length || !portfolios.length) return null
    const perPortfolio = portfolios.map(p => {
      const pipeline = contractPipeline(procurement, p)
      return { id: p.id, title: p.short_title || p.title, ...pipeline }
    })
    const totalContracts = perPortfolio.reduce((s, p) => s + p.total_contracts, 0)
    const expiringUrgent = perPortfolio.reduce((s, p) => s + p.expiring_3m.length, 0)
    return { perPortfolio: perPortfolio.filter(p => p.total_contracts > 0), totalContracts, expiringUrgent }
  }, [procurement, portfolios])

  if (!dataSources.cabinet_portfolios) {
    return (
      <div className="executive-page">
        <h1>Cabinet & Executive</h1>
        <p>Cabinet portfolio data is not available for this council.</p>
      </div>
    )
  }

  if (loading) return <LoadingState message="Loading executive data..." />
  if (error) return <div className="executive-page"><h1>Error</h1><p>{error.message || 'Failed to load data'}</p></div>

  return (
    <div className="executive-page">
      {/* Hero */}
      <div className="executive-hero">
        <h1>Cabinet & Executive</h1>
        <p className="executive-subtitle">
          {config.council_full_name || config.council_name} — {administration.party} administration
          ({administration.seats}/{administration.total} seats, majority of {administration.seats - administration.majority_threshold})
        </p>
        <div className="executive-hero-stats">
          <StatCard label="Cabinet Members" value={portfolios.length} icon={Users} />
          <StatCard label="Net Budget" value={formatCurrency(totalBudget)} icon={PieChart} />
          <StatCard label="Committees" value={committees.length} icon={Landmark} />
          <StatCard label="Control Since" value={administration.control_since?.slice(0, 4) || 'N/A'} icon={Calendar} />
        </div>
      </div>

      {/* Savings Dashboard cross-link */}
      {hasCouncillorAccess && (
        <Link to="/cabinet" className="executive-savings-link">
          <Zap size={16} /> View Savings Dashboard — evidence-backed savings intelligence <ChevronRight size={14} />
        </Link>
      )}

      {/* Cabinet Grid */}
      <CollapsibleSection title="Cabinet" icon={<Users size={18} />} defaultOpen>
        <div className="executive-cabinet-grid">
          {portfolios.map((p, i) => (
            <div
              key={p.id}
              className={`executive-cabinet-card ${selectedMember === p.id ? 'selected' : ''}`}
              onClick={() => setSelectedMember(selectedMember === p.id ? null : p.id)}
            >
              <div className="executive-card-header" style={{ borderTopColor: CHART_COLORS[i % CHART_COLORS.length] }}>
                <h3>{p.cabinet_member?.name || 'Vacant'}</h3>
                <span className="executive-card-role">{p.cabinet_member?.cabinet_role || 'Member'}</span>
              </div>
              <div className="executive-card-body">
                <p className="executive-card-portfolio">{p.short_title || p.title}</p>
                <p className="executive-card-ward">{p.cabinet_member?.ward}</p>
                {p.budget_latest?.net_expenditure && (
                  <div className="executive-card-budget">
                    <span className="executive-card-budget-label">Net budget</span>
                    <span className="executive-card-budget-value">{formatCurrency(p.budget_latest.net_expenditure)}</span>
                    <div className="executive-card-budget-bar">
                      <div
                        className="executive-card-budget-fill"
                        style={{
                          width: `${Math.min(100, (p.budget_latest.net_expenditure / totalBudget) * 100 * 3)}%`,
                          backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
              {selectedMember === p.id && (
                <div className="executive-card-details">
                  <div className="executive-card-detail-row">
                    <strong>Executive Director:</strong> {p.executive_director}
                  </div>
                  <div className="executive-card-detail-row">
                    <strong>Scrutiny:</strong> {p.scrutiny_committee?.name}
                  </div>
                  {p.key_services?.length > 0 && (
                    <div className="executive-card-detail-row">
                      <strong>Key services:</strong> {p.key_services.slice(0, 4).join(', ')}
                    </div>
                  )}
                  {p.lead_members?.length > 0 && (
                    <div className="executive-card-detail-row">
                      <strong>Lead Members:</strong> {p.lead_members.map(l => l.name).join(', ')}
                    </div>
                  )}
                  {p.champions?.length > 0 && (
                    <div className="executive-card-detail-row">
                      <strong>Champions:</strong> {p.champions.map(c => `${c.name} (${c.area})`).join(', ')}
                    </div>
                  )}
                  {spendingSummary?.by_portfolio?.[p.id] && (
                    <div className="executive-card-detail-row">
                      <strong>Actual Spend:</strong> {formatCurrency(spendingSummary.by_portfolio[p.id].total)}
                      <span className="executive-card-spend-count"> ({spendingSummary.by_portfolio[p.id].count?.toLocaleString()} txns)</span>
                    </div>
                  )}
                  <Link to={`/cabinet/${p.id}`} state={{ from: '/executive' }} className="executive-card-link">
                    View Portfolio Detail <ChevronRight size={14} />
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Budget Treemap */}
      {treemapData.length > 0 && (
        <CollapsibleSection title="Budget by Portfolio" icon={<PieChart size={18} />} defaultOpen>
          <div className="executive-budget-section">
            <ChartCard title="Net Budget Allocation (£M)" subtitle="Click a segment to see portfolio detail">
              <ResponsiveContainer width="100%" height={350}>
                <Treemap
                  data={treemapData}
                  dataKey="value"
                  stroke="#1c1c1e"
                  animationDuration={CHART_ANIMATION.duration}
                >
                  <RechartsTooltip
                    formatter={(value, name, props) => [`£${value}M`, props.payload.name]}
                    contentStyle={TOOLTIP_STYLE}
                  />
                </Treemap>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Net Budget by Portfolio (£M)">
              <ResponsiveContainer width="100%" height={Math.max(300, budgetBars.length * 45)}>
                <BarChart data={budgetBars} layout="vertical" margin={{ left: 100, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                  <XAxis type="number" tick={AXIS_TICK_STYLE} />
                  <YAxis type="category" dataKey="name" tick={AXIS_TICK_STYLE} width={95} />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`£${v}M`]} />
                  <Bar dataKey="net" name="Budget (Net)" fill="#12B6CF" radius={[0, 4, 4, 0]} {...CHART_ANIMATION} />
                  {budgetBars.some(b => b.actual !== null) && (
                    <Bar dataKey="actual" name="Actual Spend" fill="rgba(253, 126, 20, 0.7)" radius={[0, 4, 4, 0]} {...CHART_ANIMATION} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </CollapsibleSection>
      )}

      {/* Senior Officers */}
      <CollapsibleSection title="Senior Officers" icon={<Briefcase size={18} />}>
        <div className="executive-officers">
          {seniorOfficers.chief_executive && (
            <div className="executive-officer-card executive-officer-chief">
              <h4>{typeof seniorOfficers.chief_executive === 'object' ? seniorOfficers.chief_executive.name : seniorOfficers.chief_executive}</h4>
              <span>Chief Executive</span>
            </div>
          )}
          <div className="executive-officer-grid">
            {(seniorOfficers.executive_directors || []).map((ed, i) => (
              <div key={i} className="executive-officer-card">
                <h4>{ed.name || ed}</h4>
                <span>{ed.title || 'Executive Director'}</span>
              </div>
            ))}
          </div>
          <div className="executive-statutory-officers">
            <h4>Statutory Officers</h4>
            <div className="executive-officer-grid">
              {seniorOfficers.s151_officer && (
                <div className="executive-officer-card executive-officer-statutory">
                  <h4>{typeof seniorOfficers.s151_officer === 'object' ? seniorOfficers.s151_officer.name : seniorOfficers.s151_officer}</h4>
                  <span>S151 Officer (Finance)</span>
                </div>
              )}
              {seniorOfficers.monitoring_officer && (
                <div className="executive-officer-card executive-officer-statutory">
                  <h4>{typeof seniorOfficers.monitoring_officer === 'object' ? seniorOfficers.monitoring_officer.name : seniorOfficers.monitoring_officer}</h4>
                  <span>Monitoring Officer (Legal)</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Committee Structure */}
      {committees.length > 0 && (
        <CollapsibleSection title="Committee Structure" icon={<Landmark size={18} />}>
          <div className="executive-committees">
            {Object.entries(committeesByType).map(([type, comms]) => (
              <div key={type} className="executive-committee-group">
                <h4>{type} ({comms.length})</h4>
                <div className="executive-committee-list">
                  {comms.map((c, i) => (
                    <div key={i} className="executive-committee-item">
                      <span className="executive-committee-name">{c.title || c.name}</span>
                      {c.chair && <span className="executive-committee-chair">Chair: {c.chair}</span>}
                      {c.members_count && <span className="executive-committee-members">{c.members_count} members</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Recent Cabinet Decisions */}
      {recentDecisions.length > 0 && (
        <CollapsibleSection title="Recent Cabinet Decisions" icon={<Shield size={18} />}>
          <div className="executive-decisions">
            {recentDecisions.map((d, i) => (
              <div key={i} className="executive-decision-item">
                <div className="executive-decision-date">{d.date || 'Unknown date'}</div>
                <div className="executive-decision-content">
                  <h4>{d.title || d.summary}</h4>
                  {d.committee && <span className="executive-decision-committee">{d.committee}</span>}
                  {d.decision_type && <span className={`executive-decision-type executive-decision-${d.decision_type}`}>{d.decision_type}</span>}
                  {d.summary && d.title && <p>{d.summary}</p>}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Governance Quick Facts */}
      {governance.constitution && (
        <CollapsibleSection title="How Decisions Are Made" icon={<Shield size={18} />}>
          <div className="executive-governance">
            <div className="executive-governance-card">
              <h4>Key Decision Threshold</h4>
              <p>£{(governance.constitution?.key_decision_threshold || 500000).toLocaleString()} or affects 2+ electoral divisions</p>
            </div>
            <div className="executive-governance-card">
              <h4>Forward Plan</h4>
              <p>28 days&apos; notice required for all Key Decisions</p>
            </div>
            <div className="executive-governance-card">
              <h4>Call-In</h4>
              <p>5 non-executive signatures within 5 working days of decision publication</p>
            </div>
            <div className="executive-governance-card">
              <h4>Political Arithmetic</h4>
              <p>
                {administration.party} {administration.seats}/{administration.total} seats —
                majority of {(administration.seats || 0) - (administration.majority_threshold || 0)}
              </p>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {/* Contract Coverage Health */}
      {contractHealth && contractHealth.totalContracts > 0 && (
        <CollapsibleSection title={`Contract Coverage (${contractHealth.totalContracts} matched)`} icon={<Briefcase size={18} />}>
          <div className="executive-stat-row" style={{ marginBottom: '1rem' }}>
            <StatCard label="Total Matched" value={contractHealth.totalContracts} icon={<Briefcase size={18} />} />
            <StatCard label="Expiring <3m" value={contractHealth.expiringUrgent} color={contractHealth.expiringUrgent > 0 ? '#e4002b' : undefined} icon={<Calendar size={18} />} />
          </div>
          <div className="executive-contracts-grid">
            {contractHealth.perPortfolio.map(p => (
              <Link key={p.id} to={`/portfolio/${p.id}`} state={{ from: '/executive' }} className="executive-contract-card">
                <span className="executive-contract-title">{p.title}</span>
                <span className="executive-contract-count">{p.total_contracts} contracts</span>
                {p.expiring_3m.length > 0 && <span className="executive-contract-urgent">{p.expiring_3m.length} expiring</span>}
              </Link>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  )
}
