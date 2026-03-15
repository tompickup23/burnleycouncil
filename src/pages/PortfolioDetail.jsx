import { useMemo, useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { Users, PieChart, Target, ChevronRight, Calendar, TrendingUp, Shield, Zap, Briefcase, FileText, AlertTriangle, Scale, Building2, Wrench, MapPin, Download } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line, Legend, PieChart as RechartsPie, Pie, Cell, ScatterChart, Scatter, ZAxis } from 'recharts'
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
} from '../utils/savingsEngine'
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
  const directives = useMemo(() => generateDirectives(portfolio, findings, [], { procurement, fundingModel: portfolioData?.administration?.funding_model }), [portfolio, findings, procurement, portfolioData])
  const playbook = useMemo(() => generateReformPlaybook(portfolio, directives), [portfolio, directives])
  const matrix = useMemo(() => priorityMatrix(directives), [directives])
  const upcomingDecisions = useMemo(() => decisionPipeline(meetings, portfolio, documents), [meetings, portfolio, documents])
  const politicalCtx = useMemo(() => politicalContext(portfolio, {
    dogeFindings: findings,
  }), [portfolio, findings])
  const dependencies = useMemo(() => crossPortfolioDependencies(portfolios), [portfolios])
  const contractData = useMemo(() => contractPipeline(procurement, portfolio), [procurement, portfolio])
  const fundingData = useMemo(() => fundingConstraints(portfolio, portfolioData?.administration?.funding_model), [portfolio, portfolioData])

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
