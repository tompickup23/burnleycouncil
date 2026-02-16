import { useState, useEffect, useMemo } from 'react'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useData } from '../hooks/useData'
import { formatCurrency, formatNumber } from '../utils/format'
import { TOOLTIP_STYLE } from '../utils/constants'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ReferenceLine } from 'recharts'
import { AlertTriangle, Clock, Building, PoundSterling, Users, TrendingUp, TrendingDown, ChevronDown, ChevronRight, ExternalLink, Calendar, Shield, ArrowRight, Check, X as XIcon, ThumbsUp, ThumbsDown, Star, FileText, Globe, BookOpen, Vote, Brain, Lightbulb, BarChart3 } from 'lucide-react'
import './LGRTracker.css'

const SEVERITY_COLORS = { critical: '#ff453a', high: '#ff9f0a', medium: '#ffd60a', low: '#30d158' }
const MODEL_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a']
const SCORE_COLORS = { 10: '#30d158', 9: '#30d158', 8: '#30d158', 7: '#30d158', 6: '#ffd60a', 5: '#ff9f0a', 4: '#ff9f0a', 3: '#ff453a', 2: '#ff453a', 1: '#ff453a' }

function ScoreBar({ score, max = 10, label }) {
  const pct = (score / max) * 100
  const color = SCORE_COLORS[score] || '#636366'
  return (
    <div className="score-bar-container">
      {label && <span className="score-bar-cat">{label}</span>}
      <div className="score-bar-track">
        <div className="score-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="score-bar-label" style={{ color }}>{score}/10</span>
    </div>
  )
}

function PopulationThresholdBadge({ population, threshold = 500000 }) {
  const meets = population >= threshold
  return (
    <span className={`threshold-badge ${meets ? 'meets' : 'below'}`}>
      {meets ? <Check size={12} /> : <XIcon size={12} />}
      {meets ? 'Above' : 'Below'} 500K
    </span>
  )
}

function LGRTracker() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const councilId = config.council_id || ''
  const { data, loading, error } = useData(['/data/shared/lgr_tracker.json', '/data/cross_council.json', '/data/budgets_summary.json'])
  const [lgrData, crossCouncil] = data || [null, null]
  const [selectedModel, setSelectedModel] = useState(null)
  const [expandedIssue, setExpandedIssue] = useState(null)
  const [expandedCritique, setExpandedCritique] = useState(null)
  const [activeSection, setActiveSection] = useState('proposals')

  useEffect(() => {
    document.title = `LGR Tracker | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  const relevantModels = useMemo(() => {
    if (!lgrData?.proposed_models) return []
    return lgrData.proposed_models.map(model => {
      const myAuthority = model.authorities.find(a => a.councils.includes(councilId))
      return { ...model, myAuthority }
    })
  }, [lgrData, councilId])

  const modelFinancials = useMemo(() => {
    if (!lgrData?.proposed_models || !crossCouncil) return {}
    const councilLookup = {}
    const ccData = Array.isArray(crossCouncil) ? crossCouncil : crossCouncil.councils || []
    ccData.forEach(c => { councilLookup[c.council_id] = c })

    const result = {}
    lgrData.proposed_models.forEach(model => {
      result[model.id] = model.authorities.map(authority => {
        const councils = authority.councils.map(id => councilLookup[id]).filter(Boolean)
        const totalSpend = councils.reduce((sum, c) => sum + (c.annual_spend || 0), 0)
        const totalRecords = councils.reduce((sum, c) => sum + (c.annual_records || 0), 0)
        const totalPop = authority.population || 0

        let totalReserves = 0, totalEarmarked = 0, totalUnallocated = 0
        let serviceExpenditure = 0, netRevenue = 0, ctRequirement = 0
        councils.forEach(c => {
          if (c.budget_summary) {
            totalReserves += c.budget_summary.reserves_total || 0
            totalEarmarked += c.budget_summary.reserves_earmarked_closing || 0
            totalUnallocated += c.budget_summary.reserves_unallocated_closing || 0
            serviceExpenditure += c.budget_summary.total_service_expenditure || 0
            netRevenue += c.budget_summary.net_revenue_expenditure || 0
            ctRequirement += c.budget_summary.council_tax_requirement || 0
          }
        })

        return {
          name: authority.name, councils: authority.councils,
          councilNames: councils.map(c => c.council_name || c.council_id),
          population: totalPop, annualSpend: totalSpend, annualRecords: totalRecords,
          spendPerHead: totalPop > 0 ? totalSpend / totalPop : 0,
          serviceExpenditure, netRevenue, ctRequirement,
          reserves: totalReserves, earmarkedReserves: totalEarmarked, unallocatedReserves: totalUnallocated,
          notes: authority.notes
        }
      })
    })
    return result
  }, [lgrData, crossCouncil])

  const daysUntilClose = useMemo(() => {
    if (!lgrData?.meta?.consultation_closes) return null
    const diff = Math.ceil((new Date(lgrData.meta.consultation_closes) - new Date()) / 86400000)
    return diff > 0 ? diff : 0
  }, [lgrData])

  const ccnChartData = useMemo(() => {
    if (!lgrData?.ccn_analysis?.models) return []
    return lgrData.ccn_analysis.models
      .filter(m => m.annual_savings !== null)
      .map(m => ({
        name: `${m.unitaries} UA${m.unitaries > 1 ? 's' : ''}`,
        unitaries: m.unitaries, savings: m.annual_savings / 1e6,
        transitionCost: m.transition_cost / 1e6, note: m.note
      }))
  }, [lgrData])

  // AI DOGE independent model comparison data
  const MODEL_LABELS = { two_unitary: '2 UAs', three_unitary: '3 UAs', four_unitary: '4 UAs', five_unitary: '5 UAs', county_unitary: 'County UA' }
  const dogeComparisonData = useMemo(() => {
    if (!lgrData?.independent_model?.payback_analysis) return []
    return lgrData.independent_model.payback_analysis.map(p => ({
      name: MODEL_LABELS[p.model] || p.label || p.model,
      dogeSavings: p.annual_saving / 1e6,
      transitionCost: p.transition_cost / 1e6,
      tenYearNet: p.ten_year_net / 1e6,
      realisticTenYear: (p.realistic_ten_year_net || p.ten_year_net) / 1e6,
      payback: p.payback_years
    }))
  }, [lgrData])

  // Savings breakdown chart data
  const savingsBreakdown = useMemo(() => {
    if (!lgrData?.independent_model?.savings_breakdown?.components) return []
    return lgrData.independent_model.savings_breakdown.components.map(c => ({
      category: c.category.replace(' elimination', '').replace(' consolidation', '').replace(' rationalisation', '').replace(' (5-year)', ''),
      two_ua: c.two_ua / 1e6, three_ua: c.three_ua / 1e6,
      four_ua: c.four_ua / 1e6, five_ua: c.five_ua / 1e6
    }))
  }, [lgrData])

  if (loading) {
    return <div className="lgr-page animate-fade-in"><div className="loading-state"><div className="spinner" /><p>Loading LGR Tracker...</p></div></div>
  }
  if (error || !lgrData) {
    return <div className="lgr-page animate-fade-in"><header className="page-header"><h1>LGR Tracker</h1><p className="subtitle">LGR tracking data is not yet available.</p></header></div>
  }

  const activeModel = selectedModel || lgrData.proposed_models[0]?.id
  const activeFinancials = modelFinancials[activeModel] || []
  const activeModelData = lgrData.proposed_models.find(m => m.id === activeModel)
  const dogeAssessment = lgrData.ai_doge_analysis?.assessments?.find(a => a.model_id === activeModel)

  const sectionNav = [
    { id: 'proposals', label: 'Proposals', icon: Building },
    { id: 'independent', label: 'AI DOGE Model', icon: Brain },
    { id: 'assets', label: 'Assets', icon: PoundSterling },
    { id: 'critique', label: 'CCN Critique', icon: BookOpen },
    { id: 'demographics', label: 'Demographics', icon: Users },
    { id: 'politics', label: 'Politics', icon: Vote },
    { id: 'national', label: 'National Context', icon: Globe },
    { id: 'risks', label: 'Risks', icon: AlertTriangle },
    { id: 'precedents', label: 'Precedents', icon: Shield }
  ]

  return (
    <div className="lgr-page animate-fade-in">
      <header className="page-header">
        <div className="lgr-header-row">
          <div>
            <h1>LGR <span className="accent">Tracker</span></h1>
            <p className="subtitle">Independent analysis of Lancashire&apos;s reorganisation — 5 proposals, £12B+ in spending data, 1.6 million residents</p>
          </div>
          {daysUntilClose !== null && daysUntilClose > 0 && (
            <div className="consultation-countdown">
              <Clock size={18} />
              <div>
                <span className="countdown-number">{daysUntilClose}</span>
                <span className="countdown-label">days until consultation closes</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Council-specific context */}
      <div className="lgr-context-banner">
        <AlertTriangle size={16} />
        <span>
          <strong>{config.council_full_name || councilName + ' Council'}</strong> is one of 15 Lancashire councils
          proposed for abolition by April 2028. {relevantModels[0]?.myAuthority ? (
            <>Under the most-discussed model, {councilName} would become part of <strong>{relevantModels[0].myAuthority.name}</strong>.</>
          ) : (
            <>Five proposals are under public consultation until 26 March 2026.</>
          )}
        </span>
      </div>

      {/* Section Navigation */}
      <nav className="lgr-section-nav">
        {sectionNav.map(s => (
          <button key={s.id} className={`section-nav-btn ${activeSection === s.id ? 'active' : ''}`}
            onClick={() => { setActiveSection(s.id); document.getElementById(`lgr-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
            <s.icon size={14} />
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      {/* Timeline */}
      <section className="lgr-section">
        <h2><Calendar size={20} /> Timeline</h2>
        <div className="lgr-timeline">
          {lgrData.timeline.map((event, i) => (
            <div key={i} className={`timeline-item ${event.upcoming ? 'upcoming' : 'past'}`}>
              <div className="timeline-marker" />
              <div className="timeline-content">
                <span className="timeline-date">{new Date(event.date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</span>
                <h3>{event.event}</h3>
                <p>{event.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* AI DOGE Independent Model */}
      <section className="lgr-section" id="lgr-independent">
        <h2><Brain size={20} /> AI DOGE Independent Financial Model</h2>
        <p className="section-desc">{lgrData.independent_model?.subtitle}</p>

        {dogeComparisonData.length > 0 && (
          <div className="lgr-chart-grid">
            <div className="lgr-chart-card">
              <h3>AI DOGE: Annual Savings by Model</h3>
              <p className="chart-desc">Built from actual spending data — not CCN estimates. Negative = costs MORE than current system.</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dogeComparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" />
                  <XAxis dataKey="name" tick={{ fill: '#8e8e93', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#8e8e93', fontSize: 12 }} tickFormatter={v => `£${v}M`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`£${v.toFixed(1)}M/year`, v >= 0 ? 'Annual Savings' : 'Annual Cost']} />
                  <ReferenceLine y={0} stroke="#636366" strokeDasharray="3 3" />
                  <Bar dataKey="dogeSavings" radius={[6, 6, 0, 0]}>
                    {dogeComparisonData.map((entry, i) => (
                      <Cell key={i} fill={entry.dogeSavings >= 0 ? '#30d158' : '#ff453a'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="lgr-chart-card">
              <h3>10-Year Net Financial Impact</h3>
              <p className="chart-desc">Total savings minus transition costs over 10 years</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dogeComparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" />
                  <XAxis dataKey="name" tick={{ fill: '#8e8e93', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#8e8e93', fontSize: 12 }} tickFormatter={v => `£${v}M`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`£${v.toFixed(0)}M`, v >= 0 ? '10yr Saving' : '10yr Cost']} />
                  <ReferenceLine y={0} stroke="#636366" strokeDasharray="3 3" />
                  <Bar dataKey="tenYearNet" radius={[6, 6, 0, 0]}>
                    {dogeComparisonData.map((entry, i) => (
                      <Cell key={i} fill={entry.tenYearNet >= 0 ? '#0a84ff' : '#ff453a'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Savings breakdown stacked bar */}
        {savingsBreakdown.length > 0 && (
          <div className="lgr-chart-card" style={{ marginTop: '1rem' }}>
            <h3>Where the Money Comes From (and Goes)</h3>
            <p className="chart-desc">Savings breakdown by category for the 2-unitary model (£M/year)</p>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={savingsBreakdown} layout="vertical" margin={{ top: 10, right: 30, left: 140, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" />
                <XAxis type="number" tick={{ fill: '#8e8e93', fontSize: 11 }} tickFormatter={v => `£${v}M`} />
                <YAxis type="category" dataKey="category" tick={{ fill: '#8e8e93', fontSize: 11 }} width={130} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`£${v.toFixed(1)}M`, '']} />
                <ReferenceLine x={0} stroke="#636366" />
                <Bar dataKey="two_ua" name="2 UAs" fill="#0a84ff" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Back-office cost discovery */}
        {lgrData.independent_model?.back_office_computed && (
          <div className="lgr-discovery-card">
            <h3><BarChart3 size={16} /> Key Discovery: Actual Back-Office Costs</h3>
            <div className="discovery-comparison">
              <div className="discovery-item old">
                <span className="discovery-label">Previously Estimated</span>
                <span className="discovery-value">{formatCurrency(lgrData.independent_model.back_office_computed.previously_estimated, true)}</span>
              </div>
              <ArrowRight size={20} className="discovery-arrow" />
              <div className="discovery-item new">
                <span className="discovery-label">Actual (GOV.UK Outturn)</span>
                <span className="discovery-value">{formatCurrency(lgrData.independent_model.back_office_computed.total_central_services, true)}</span>
              </div>
            </div>
            <p className="discovery-note">{lgrData.independent_model.back_office_computed.note}</p>
            <span className="data-source-badge">
              <Check size={12} /> Computed from GOV.UK data — {lgrData.independent_model.computation_date}
            </span>
          </div>
        )}

        {/* Newton Europe vs DOGE comparison */}
        {lgrData.independent_model?.presentation_comparison && (
          <div className="lgr-chart-card" style={{ marginTop: '1rem' }}>
            <h3>Newton Europe vs AI DOGE: Savings Comparison</h3>
            <p className="chart-desc">Newton Europe uses activity-based costing with wider scope; AI DOGE uses bottom-up GOV.UK outturn with conservative academic benchmarks</p>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={Object.entries(lgrData.independent_model.presentation_comparison).map(([key, val]) => ({
                  name: MODEL_LABELS[key] || key,
                  newton: (val.newton_europe_savings || 0) / 1e6,
                  doge: (val.doge_computed_savings || 0) / 1e6,
                }))}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" />
                <XAxis dataKey="name" tick={{ fill: '#8e8e93', fontSize: 12 }} />
                <YAxis tick={{ fill: '#8e8e93', fontSize: 12 }} tickFormatter={v => `£${v}M`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [`£${v?.toFixed(1)}M/yr`, name === 'newton' ? 'Newton Europe' : 'AI DOGE']} />
                <ReferenceLine y={0} stroke="#636366" strokeDasharray="3 3" />
                <Bar dataKey="newton" name="Newton Europe" fill="#636366" radius={[6, 6, 0, 0]} />
                <Bar dataKey="doge" name="AI DOGE" fill="#0a84ff" radius={[6, 6, 0, 0]} />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Net savings (gross minus ongoing costs) */}
        {lgrData.independent_model?.savings_breakdown?.net_annual && (
          <div className="lgr-net-savings">
            <h3>Net Annual Impact (Gross Savings Minus Ongoing Costs)</h3>
            <div className="net-savings-grid">
              {Object.entries(lgrData.independent_model.savings_breakdown.net_annual).map(([key, val]) => (
                <div key={key} className={`net-savings-item ${val.net >= 0 ? 'positive' : 'negative'}`}>
                  <span className="net-label">{MODEL_LABELS[key] || key}</span>
                  <div className="net-breakdown">
                    <span className="net-gross">Gross: {formatCurrency(val.gross, true)}</span>
                    <span className="net-costs">Costs: {formatCurrency(Math.abs(val.costs), true)}</span>
                    <span className={`net-total ${val.net >= 0 ? 'text-green' : 'text-red'}`}>
                      Net: {val.net >= 0 ? '+' : ''}{formatCurrency(val.net, true)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Model assumptions */}
        {lgrData.independent_model?.methodology?.assumptions && (
          <div className="lgr-assumptions">
            <h3>Model Assumptions (Transparent — Unlike CCN/PwC)</h3>
            <div className="assumptions-grid">
              {Object.entries(lgrData.independent_model.methodology.assumptions).map(([key, val]) => (
                <div key={key} className="assumption-item">
                  <span className="assumption-key">{key.replace(/_/g, ' ')}</span>
                  <span className="assumption-val">{typeof val === 'number' && val < 1 ? `${(val * 100).toFixed(0)}%` : typeof val === 'number' ? formatCurrency(val, true) : val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Self-critique */}
        {lgrData.independent_model?.methodology?.self_critique && (
          <div className="lgr-self-critique">
            <h3><BookOpen size={16} /> Methodology Self-Critique</h3>
            <p className="critique-intro">AI DOGE acknowledges the following limitations of this analysis:</p>
            <ul>
              {lgrData.independent_model.methodology.self_critique.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}
      </section>

      {/* Asset Division & Transition Risks */}
      {lgrData.independent_model?.asset_division && (
        <section className="lgr-section" id="lgr-assets">
          <h2><Building size={20} /> Asset Division & Transition</h2>
          <p className="section-desc">How £600M+ of assets, reserves, and liabilities would be divided between successor authorities</p>

          <div className="asset-principles-grid">
            {lgrData.independent_model.asset_division.principles.map((p, i) => (
              <div key={i} className={`asset-principle-card complexity-${p.complexity}`}>
                <div className="principle-header">
                  <h4>{p.principle}</h4>
                  <span className={`complexity-badge complexity-${p.complexity}`}>{p.complexity}</span>
                </div>
                <p className="principle-applies">{p.applies_to}</p>
                <p className="principle-method">{p.method}</p>
                <p className="principle-legal text-secondary">{p.legal_basis}</p>
                {p.note && <p className="principle-note"><AlertTriangle size={12} /> {p.note}</p>}
              </div>
            ))}
          </div>

          {lgrData.independent_model.asset_division.critical_issues && (
            <div className="critical-asset-issues">
              <h3><AlertTriangle size={16} /> Critical Asset Issues</h3>
              {lgrData.independent_model.asset_division.critical_issues.map((issue, i) => (
                <div key={i} className="asset-issue-card">
                  <h4>{issue.issue}</h4>
                  <p>{issue.detail}</p>
                  {issue.options && (
                    <ul className="asset-options">
                      {issue.options.map((opt, j) => <li key={j}>{opt}</li>)}
                    </ul>
                  )}
                  {issue.recommendation && <p className="asset-rec"><strong>Recommendation:</strong> {issue.recommendation}</p>}
                  {issue.precedent && <p className="asset-precedent text-secondary"><Shield size={12} /> Precedent: {issue.precedent}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* CCN Critique */}
      {lgrData.ccn_critique && (
        <section className="lgr-section" id="lgr-critique">
          <h2><BookOpen size={20} /> {lgrData.ccn_critique.title}</h2>
          <p className="section-desc">{lgrData.ccn_critique.summary}</p>

          {/* Side-by-side CCN vs DOGE chart */}
          {ccnChartData.length > 0 && dogeComparisonData.length > 0 && (
            <div className="lgr-chart-card" style={{ marginBottom: '1rem' }}>
              <h3>CCN/PwC vs AI DOGE Independent Model</h3>
              <p className="chart-desc">Comparing the lobby group&apos;s estimates with our independent analysis</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dogeComparisonData.map((d, i) => ({
                  ...d,
                  ccnSavings: i < ccnChartData.length ? ccnChartData[i].savings : null
                }))} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" />
                  <XAxis dataKey="name" tick={{ fill: '#8e8e93', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#8e8e93', fontSize: 12 }} tickFormatter={v => `£${v}M`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [`£${v?.toFixed(1)}M/yr`, name === 'ccnSavings' ? 'CCN/PwC' : 'AI DOGE']} />
                  <ReferenceLine y={0} stroke="#636366" strokeDasharray="3 3" />
                  <Bar dataKey="ccnSavings" name="CCN/PwC" fill="#636366" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="dogeSavings" name="AI DOGE" fill="#0a84ff" radius={[6, 6, 0, 0]} />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="critique-list">
            {lgrData.ccn_critique.issues.map(issue => (
              <div key={issue.id} className={`critique-card ${expandedCritique === issue.id ? 'expanded' : ''}`}
                onClick={() => setExpandedCritique(expandedCritique === issue.id ? null : issue.id)}>
                <div className="critique-header">
                  <div className="issue-severity" style={{ background: SEVERITY_COLORS[issue.severity] }}>{issue.severity}</div>
                  <h3>{issue.title}</h3>
                  {expandedCritique === issue.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </div>
                {expandedCritique === issue.id && (
                  <div className="critique-detail"><p>{issue.detail}</p></div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Proposed Models */}
      <section className="lgr-section" id="lgr-proposals">
        <h2><Building size={20} /> The Five Proposals</h2>
        <p className="section-desc">Five proposals submitted in November 2025. Each was submitted by a council with something to gain or lose. Select a proposal to explore.</p>

        <div className="model-tabs">
          {lgrData.proposed_models.map((model, i) => (
            <button key={model.id}
              className={`model-tab ${activeModel === model.id ? 'active' : ''}`}
              onClick={() => setSelectedModel(model.id)}
              style={activeModel === model.id ? { background: MODEL_COLORS[i] } : {}}>
              <span className="model-tab-name">{model.name}</span>
              <span className="model-tab-by">{model.short_name}</span>
            </button>
          ))}
        </div>

        {activeModelData && (
          <div className="model-detail">
            <div className="model-meta">
              <div className="model-meta-item"><strong>Submitted by:</strong> {activeModelData.submitted_by}</div>
              {activeModelData.submitter_control && (
                <div className="model-meta-item"><Vote size={14} /> {activeModelData.submitter_control}</div>
              )}
              <div className="model-meta-item">
                {activeModelData.meets_threshold ? (
                  <span className="threshold-pass"><Check size={14} /> All authorities meet 500K threshold</span>
                ) : (
                  <span className="threshold-fail"><XIcon size={14} /> Not all authorities meet 500K threshold</span>
                )}
              </div>
              {activeModelData.doge_annual_savings !== undefined && activeModelData.doge_annual_savings !== null && (
                <div className="model-meta-item">
                  {activeModelData.doge_annual_savings >= 0 ? (
                    <span className="savings-positive"><TrendingUp size={14} /> {formatCurrency(activeModelData.doge_annual_savings, true)}/yr savings (AI DOGE)</span>
                  ) : (
                    <span className="savings-negative"><TrendingDown size={14} /> {formatCurrency(Math.abs(activeModelData.doge_annual_savings), true)}/yr COST (AI DOGE)</span>
                  )}
                </div>
              )}
              {activeModelData.doge_payback_years && (
                <div className="model-meta-item"><Clock size={14} /> Payback: {activeModelData.doge_payback_years} years</div>
              )}
              {activeModelData.source_url && (
                <a href={activeModelData.source_url} target="_blank" rel="noopener noreferrer" className="model-source-link">
                  <FileText size={14} /> Full proposal <ExternalLink size={12} />
                </a>
              )}
            </div>

            <p className="model-desc">{activeModelData.description}</p>

            {/* Authority cards with demographics */}
            <div className="authority-cards">
              {activeModelData.authorities.map((authority, i) => {
                const fin = activeFinancials.find(f => f.name === authority.name)
                const isMyAuthority = authority.councils.includes(councilId)
                return (
                  <div key={i} className={`authority-card ${isMyAuthority ? 'my-authority' : ''}`}>
                    <div className="authority-color-bar" style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                    {isMyAuthority && <span className="my-badge">Your council</span>}
                    <div className="authority-name-row">
                      <h3>{authority.name}</h3>
                      <PopulationThresholdBadge population={authority.population} />
                    </div>
                    <p className="authority-councils">
                      {authority.councils.map((c, j) => (
                        <span key={c} className={c === councilId ? 'highlight-council' : ''}>
                          {j > 0 && ', '}{(fin?.councilNames?.[j]) || c}
                        </span>
                      ))}
                    </p>
                    <div className="authority-stats">
                      <div className="auth-stat"><Users size={14} /><span><strong>{formatNumber(authority.population)}</strong> residents</span></div>
                      {fin && fin.annualSpend > 0 && (
                        <>
                          <div className="auth-stat"><PoundSterling size={14} /><span>{formatCurrency(fin.annualSpend, true)} annual spend</span></div>
                          <div className="auth-stat"><TrendingUp size={14} /><span>{formatCurrency(fin.spendPerHead)} per head</span></div>
                        </>
                      )}
                    </div>
                    {authority.demographics && (
                      <div className="authority-demographics">
                        <div className="demo-row"><span>Over 65:</span><strong>{authority.demographics.over_65_pct}%</strong></div>
                        <div className="demo-row"><span>Ethnic diversity:</span><strong>{(100 - authority.demographics.white_pct).toFixed(1)}% non-white</strong></div>
                        <div className="demo-row"><span>Econ. active:</span><strong>{authority.demographics.economically_active_pct}%</strong></div>
                      </div>
                    )}
                    <p className="authority-notes">{authority.notes}</p>
                  </div>
                )
              })}
            </div>

            {/* Political analysis */}
            {activeModelData.political_analysis && (
              <div className="political-analysis-box">
                <h4><Vote size={16} /> Political Analysis</h4>
                <div className="pol-grid">
                  <div className="pol-item"><span className="pol-label">Likely control:</span><p>{activeModelData.political_analysis.likely_control}</p></div>
                  <div className="pol-item"><span className="pol-label">Councillor reduction:</span><p>{activeModelData.political_analysis.councillor_reduction}</p></div>
                  <div className="pol-item"><span className="pol-label">Who benefits:</span><p>{activeModelData.political_analysis.who_benefits}</p></div>
                  <div className="pol-item"><span className="pol-label">Who loses:</span><p>{activeModelData.political_analysis.who_loses}</p></div>
                </div>
              </div>
            )}

            {/* Strengths & Weaknesses */}
            {(activeModelData.strengths || activeModelData.weaknesses) && (
              <div className="strengths-weaknesses">
                {activeModelData.strengths && (
                  <div className="sw-column strengths">
                    <h4><ThumbsUp size={16} /> Strengths</h4>
                    <ul>{activeModelData.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </div>
                )}
                {activeModelData.weaknesses && (
                  <div className="sw-column weaknesses">
                    <h4><ThumbsDown size={16} /> Weaknesses</h4>
                    <ul>{activeModelData.weaknesses.map((w, i) => <li key={i}>{w}</li>)}</ul>
                  </div>
                )}
              </div>
            )}

            {/* AI DOGE Verdict with multi-score */}
            {dogeAssessment && (
              <div className="doge-verdict">
                <div className="doge-verdict-header">
                  <Shield size={18} />
                  <h4>AI DOGE Verdict: {dogeAssessment.verdict}</h4>
                </div>
                <div className="doge-multi-score">
                  <ScoreBar score={dogeAssessment.financial_score} label="Financial" />
                  <ScoreBar score={dogeAssessment.governance_score} label="Governance" />
                  <ScoreBar score={dogeAssessment.feasibility_score} label="Feasibility" />
                  <ScoreBar score={dogeAssessment.score} label="Overall" />
                </div>
                <p>{dogeAssessment.reasoning}</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Financial Comparison Charts */}
      {activeFinancials.length > 0 && activeFinancials.some(f => f.annualSpend > 0) && (
        <section className="lgr-section">
          <h2><PoundSterling size={20} /> Financial Comparison — {activeModelData?.name}</h2>
          <p className="section-desc">Combined annual spending and reserves for each proposed successor authority (from AI DOGE data).</p>
          <div className="lgr-chart-grid">
            <div className="lgr-chart-card">
              <h3>Annual Spend by Proposed Authority</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={activeFinancials.filter(f => f.annualSpend > 0)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" />
                  <XAxis dataKey="name" tick={{ fill: '#8e8e93', fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                  <YAxis tick={{ fill: '#8e8e93', fontSize: 12 }} tickFormatter={v => `£${(v / 1e6).toFixed(0)}M`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [formatCurrency(v, true), 'Annual Spend']} />
                  <Bar dataKey="annualSpend" radius={[6, 6, 0, 0]}>
                    {activeFinancials.filter(f => f.annualSpend > 0).map((_, i) => <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="lgr-chart-card">
              <h3>Population Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={activeFinancials} cx="50%" cy="50%" outerRadius={100} dataKey="population" nameKey="name"
                    label={({ name, percent }) => `${name.split(' ')[0]} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
                    {activeFinancials.map((_, i) => <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [formatNumber(v), 'Population']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          {activeFinancials.some(f => f.reserves > 0) && (
            <div className="lgr-chart-card">
              <h3>Reserves by Proposed Authority</h3>
              <p className="chart-desc">Earmarked reserves are tied to obligations. Unallocated reserves are freely available.</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={activeFinancials.filter(f => f.reserves > 0)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" />
                  <XAxis dataKey="name" tick={{ fill: '#8e8e93', fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                  <YAxis tick={{ fill: '#8e8e93', fontSize: 12 }} tickFormatter={v => `£${(v / 1e6).toFixed(0)}M`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [formatCurrency(v, true), '']} />
                  <Bar dataKey="earmarkedReserves" name="Earmarked" stackId="reserves" fill="#ff9f0a" />
                  <Bar dataKey="unallocatedReserves" name="Unallocated" stackId="reserves" fill="#30d158" radius={[6, 6, 0, 0]} />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      )}

      {/* AI DOGE Alternative Proposals */}
      {lgrData.ai_doge_proposals && (
        <section className="lgr-section">
          <div className="doge-proposals">
            <div className="doge-proposals-header">
              <Lightbulb size={24} />
              <div>
                <h2>{lgrData.ai_doge_proposals.title}</h2>
                <p className="doge-rec-subtitle">{lgrData.ai_doge_proposals.subtitle}</p>
              </div>
            </div>
            {lgrData.ai_doge_proposals.proposals.map(proposal => (
              <div key={proposal.id} className="doge-proposal-card">
                <h3>{proposal.name}</h3>
                <p className="doge-prop-desc">{proposal.description}</p>
                <p className="doge-prop-rationale"><strong>Rationale:</strong> {proposal.rationale}</p>
                <div className="doge-prop-authorities">
                  {proposal.authorities.map((a, i) => (
                    <div key={i} className="doge-prop-auth">
                      <div className="authority-color-bar" style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                      <h4>{a.name}</h4>
                      <div className="auth-stat"><Users size={14} /><span>{formatNumber(a.population)} residents</span></div>
                      <p className="authority-notes">{a.notes}</p>
                    </div>
                  ))}
                </div>
                <div className="doge-prop-cases">
                  <div className="prop-case"><strong>Financial:</strong> {proposal.financial_case}</div>
                  {proposal.democratic_case && <div className="prop-case"><strong>Democratic:</strong> {proposal.democratic_case}</div>}
                  <div className="prop-case risk"><strong>Risk:</strong> {proposal.risk}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* AI DOGE Recommendation */}
      {lgrData.ai_doge_analysis && (
        <section className="lgr-section">
          <div className="doge-recommendation">
            <div className="doge-rec-header">
              <Shield size={24} />
              <div>
                <h2>{lgrData.ai_doge_analysis.title}</h2>
                <p className="doge-rec-subtitle">{lgrData.ai_doge_analysis.subtitle}</p>
              </div>
            </div>
            <div className="doge-scores-grid">
              {lgrData.ai_doge_analysis.assessments.map(a => {
                const model = lgrData.proposed_models.find(m => m.id === a.model_id)
                return (
                  <div key={a.model_id} className="doge-score-card">
                    <div className="doge-score-name">{model?.name || a.model_id}</div>
                    <div className="doge-score-verdict">{a.verdict}</div>
                    <ScoreBar score={a.score} />
                  </div>
                )
              })}
            </div>
            <div className="doge-rec-text">
              <Star size={18} />
              <p>{lgrData.ai_doge_analysis.recommendation}</p>
            </div>
            {lgrData.ai_doge_analysis.academic_basis?.optimal_population_range && (
              <div className="academic-note">
                <BookOpen size={16} />
                <p><strong>Academic note:</strong> {lgrData.ai_doge_analysis.academic_basis.optimal_population_range.ai_doge_note}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Demographics */}
      {lgrData.demographic_projections && (
        <section className="lgr-section" id="lgr-demographics">
          <h2><Users size={20} /> {lgrData.demographic_projections.title}</h2>
          <p className="section-desc">{lgrData.demographic_projections.subtitle}</p>

          <div className="demo-trends">
            {lgrData.demographic_projections.lancashire_overview.key_trends.map((t, i) => (
              <div key={i} className="demo-trend-item"><ArrowRight size={14} /><span>{t}</span></div>
            ))}
          </div>

          {lgrData.demographic_projections.economic_implications?.key_dynamics && (
            <div className="demo-dynamics">
              <h3>Economic Implications</h3>
              {lgrData.demographic_projections.economic_implications.key_dynamics.map((d, i) => (
                <div key={i} className="dynamic-card">
                  <h4>{d.trend}</h4>
                  <p className="dynamic-areas">Areas: {d.areas.join(', ')}</p>
                  <p>{d.implication}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Political Context */}
      {lgrData.political_context && (
        <section className="lgr-section" id="lgr-politics">
          <h2><Vote size={20} /> {lgrData.political_context.title}</h2>
          <p className="section-desc">{lgrData.political_context.subtitle}</p>

          {/* Council control table */}
          <div className="council-control-table">
            <h3>Who Controls Each Council</h3>
            <div className="control-grid">
              {lgrData.political_context.council_control.map(c => (
                <div key={c.council} className="control-item">
                  <span className={`party-badge party-${c.ruling_party.toLowerCase().replace(/ /g, '-').replace(/&/g, '')}`}>
                    {c.ruling_party}
                  </span>
                  <span className="control-council">{c.council}</span>
                  <span className="control-seats">{c.majority}/{c.seats}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Self-interest analysis */}
          {lgrData.political_context.self_interest_analysis && (
            <div className="self-interest">
              <h3>Self-Interest Analysis: Who Gains From Each Proposal?</h3>
              {lgrData.political_context.self_interest_analysis.map((a, i) => (
                <div key={i} className="interest-card">
                  <div className="interest-header">
                    <h4>{a.proposal}</h4>
                    <span className={`conflict-badge conflict-${a.conflict_rating}`}>{a.conflict_rating} conflict</span>
                  </div>
                  <p>{a.submitter_motivation}</p>
                </div>
              ))}
            </div>
          )}

          {/* Reform UK impact */}
          {lgrData.political_context.reform_uk_impact && (
            <div className="reform-impact">
              <h3>Reform UK &amp; LGR</h3>
              <p>{lgrData.political_context.reform_uk_impact.description}</p>
              <ul>
                {lgrData.political_context.reform_uk_impact.key_points.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* National Context */}
      {lgrData.national_context && (
        <section className="lgr-section" id="lgr-national">
          <h2><Globe size={20} /> {lgrData.national_context.title}</h2>
          <p className="section-desc">{lgrData.national_context.summary}</p>

          <div className="national-stats">
            <div className="nat-stat"><span className="nat-number">{lgrData.national_context.areas_reorganising}</span><span className="nat-label">areas reorganising</span></div>
            <div className="nat-stat"><span className="nat-number">{lgrData.national_context.councils_affected}+</span><span className="nat-label">councils affected</span></div>
            <div className="nat-stat"><span className="nat-number">{lgrData.national_context.proposals_nationally}</span><span className="nat-label">proposals nationally</span></div>
          </div>

          <div className="national-facts">
            {lgrData.national_context.key_facts.map((f, i) => (
              <div key={i} className="nat-fact">
                <h4>{f.label}</h4>
                <p>{f.detail}</p>
              </div>
            ))}
          </div>

          {lgrData.national_context.comparison_table && (
            <div className="national-comparison">
              <h3>Scale Comparison: LGR Waves</h3>
              <div className="comparison-bars">
                {lgrData.national_context.comparison_table.map((row, i) => (
                  <div key={i} className="comparison-row">
                    <span className="comp-label">{row.wave}</span>
                    <div className="comp-bar-track">
                      <div className="comp-bar-fill" style={{ width: `${(row.councils_abolished / 180) * 100}%`, background: i === 3 ? '#ff453a' : '#48484a' }} />
                    </div>
                    <span className="comp-count">{row.councils_abolished}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Key Issues */}
      <section className="lgr-section" id="lgr-risks">
        <h2><AlertTriangle size={20} /> Key Risks</h2>
        <p className="section-desc">The biggest financial and operational risks facing the reorganisation, regardless of which model is chosen.</p>
        <div className="issues-list">
          {lgrData.key_issues.map(issue => (
            <div key={issue.id} className={`issue-card ${expandedIssue === issue.id ? 'expanded' : ''}`}
              onClick={() => setExpandedIssue(expandedIssue === issue.id ? null : issue.id)}>
              <div className="issue-header">
                <div className="issue-severity" style={{ background: SEVERITY_COLORS[issue.severity] }}>{issue.severity}</div>
                <h3>{issue.title}</h3>
                {issue.figure && <span className="issue-figure">{issue.figure}</span>}
                {expandedIssue === issue.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </div>
              {expandedIssue === issue.id && (
                <div className="issue-detail">
                  <p>{issue.description}</p>
                  {issue.figure_label && <p className="issue-figure-label">{issue.figure_label}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Precedents */}
      <section className="lgr-section" id="lgr-precedents">
        <h2><Shield size={20} /> UK Precedents</h2>
        <p className="section-desc">Recent English reorganisations — what actually happened, not just what was projected.</p>
        <div className="precedents-grid">
          {lgrData.precedents.map(p => (
            <div key={p.area} className="precedent-card">
              <div className="precedent-header"><h3>{p.area}</h3><span className="precedent-year">{p.year}</span></div>
              <div className="precedent-stats">
                <div><strong>{p.councils_merged}</strong> councils</div>
                <ArrowRight size={14} />
                <div><strong>{p.new_unitaries}</strong> {p.new_unitaries === 1 ? 'unitary' : 'unitaries'}</div>
              </div>
              <div className="precedent-financials">
                <div className="prec-stat"><span className="prec-label">Transition</span><span className="prec-value">{p.transition_cost}</span></div>
                <div className="prec-stat"><span className="prec-label">Annual savings</span><span className="prec-value savings">{p.annual_savings}</span></div>
                <div className="prec-stat"><span className="prec-label">Payback</span><span className="prec-value">{p.payback_period}</span></div>
              </div>
              {p.actual_outcome && <p className="precedent-outcome">{p.actual_outcome}</p>}
              <p className="precedent-notes">{p.notes}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sources */}
      <section className="lgr-section lgr-methodology">
        <h2>Sources &amp; Methodology</h2>
        <p>
          Proposals from <a href="https://lancashirelgr.co.uk/proposals" target="_blank" rel="noopener noreferrer">lancashirelgr.co.uk</a> and{' '}
          <a href={lgrData.meta.source_urls.consultation} target="_blank" rel="noopener noreferrer">GOV.UK</a>.
          Population: ONS Census 2021. Financial model: computed from GOV.UK MHCLG Revenue Outturn 2024-25 (forms RS, RSX, RO2, RO4, RO5, RO6) with peer-reviewed academic savings benchmarks.
          Spending data: {formatNumber(2286000)}+ transactions, £12B+ across all 15 Lancashire councils.
          Demographics: ONS Census 2021 via Nomis API. Newton Europe comparison data from Lancashire LGR People Services Analysis (2025).
          Academic evidence: Andrews &amp; Boyne (2009), Cheshire (2004), Dollery &amp; Fleming (2006), Slack &amp; Bird (2012).
        </p>
        <p>
          AI DOGE assessments are independent analytical opinions based on financial data patterns, academic evidence, and demographic analysis.
          All model assumptions are published above — unlike CCN/PwC, our methodology is fully transparent and open to scrutiny.
          All underlying data is public and verifiable.
        </p>
      </section>
    </div>
  )
}

export default LGRTracker
