import { useState, useEffect, useMemo } from 'react'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useData } from '../hooks/useData'
import { formatCurrency, formatNumber } from '../utils/format'
import { TOOLTIP_STYLE } from '../utils/constants'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ReferenceLine } from 'recharts'
import { AlertTriangle, Clock, Building, PoundSterling, Users, TrendingUp, TrendingDown, ChevronDown, ChevronRight, ExternalLink, Calendar, Shield, ArrowRight, Check, X as XIcon, ThumbsUp, ThumbsDown, Star, FileText } from 'lucide-react'
import './LGRTracker.css'

const SEVERITY_COLORS = { critical: '#ff453a', high: '#ff9f0a', medium: '#ffd60a', low: '#30d158' }
const MODEL_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a']
const SCORE_COLORS = { 8: '#30d158', 7: '#30d158', 6: '#ffd60a', 5: '#ff9f0a', 4: '#ff9f0a', 3: '#ff453a', 2: '#ff453a', 1: '#ff453a' }

function ScoreBar({ score, max = 10 }) {
  const pct = (score / max) * 100
  const color = SCORE_COLORS[score] || '#636366'
  return (
    <div className="score-bar-container">
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
  const [showStrengths, setShowStrengths] = useState({})

  useEffect(() => {
    document.title = `LGR Tracker | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  // Find which proposed models include this council
  const relevantModels = useMemo(() => {
    if (!lgrData?.proposed_models) return []
    return lgrData.proposed_models.map(model => {
      const myAuthority = model.authorities.find(a => a.councils.includes(councilId))
      return { ...model, myAuthority }
    })
  }, [lgrData, councilId])

  // Build financial aggregations using cross_council data
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
          name: authority.name,
          councils: authority.councils,
          councilNames: councils.map(c => c.council_name || c.council_id),
          population: totalPop,
          annualSpend: totalSpend,
          annualRecords: totalRecords,
          spendPerHead: totalPop > 0 ? totalSpend / totalPop : 0,
          serviceExpenditure, netRevenue, ctRequirement,
          reserves: totalReserves, earmarkedReserves: totalEarmarked, unallocatedReserves: totalUnallocated,
          notes: authority.notes
        }
      })
    })
    return result
  }, [lgrData, crossCouncil])

  // Days until consultation closes
  const daysUntilClose = useMemo(() => {
    if (!lgrData?.meta?.consultation_closes) return null
    const diff = Math.ceil((new Date(lgrData.meta.consultation_closes) - new Date()) / 86400000)
    return diff > 0 ? diff : 0
  }, [lgrData])

  // CCN chart data
  const ccnChartData = useMemo(() => {
    if (!lgrData?.ccn_analysis?.models) return []
    return lgrData.ccn_analysis.models
      .filter(m => m.annual_savings !== null)
      .map(m => ({
        name: `${m.unitaries} UA${m.unitaries > 1 ? 's' : ''}`,
        unitaries: m.unitaries,
        savings: m.annual_savings / 1e6,
        transitionCost: m.transition_cost / 1e6,
        note: m.note
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

  return (
    <div className="lgr-page animate-fade-in">
      <header className="page-header">
        <div className="lgr-header-row">
          <div>
            <h1>LGR <span className="accent">Tracker</span></h1>
            <p className="subtitle">Tracking the abolition of all 15 Lancashire councils — 5 proposals, 1.6 million residents</p>
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

      {/* CCN Savings Analysis */}
      {ccnChartData.length > 0 && (
        <section className="lgr-section">
          <h2><PoundSterling size={20} /> The Fewer Unitaries, The More You Save</h2>
          <p className="section-desc">County Councils Network / PwC analysis shows a clear pattern: more councils = higher costs. Four or more unitaries would cost Lancashire taxpayers MORE than the current system.</p>
          <div className="lgr-chart-grid">
            <div className="lgr-chart-card">
              <h3>Projected Annual Savings by Model</h3>
              <p className="chart-desc">Negative values = costs more than the current 15-council system</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={ccnChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" />
                  <XAxis dataKey="name" tick={{ fill: '#8e8e93', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#8e8e93', fontSize: 12 }} tickFormatter={v => `£${v}M`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`£${v.toFixed(1)}M/year`, v >= 0 ? 'Annual Savings' : 'Annual Cost']} />
                  <ReferenceLine y={0} stroke="#636366" strokeDasharray="3 3" />
                  <Bar dataKey="savings" radius={[6, 6, 0, 0]}>
                    {ccnChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.savings >= 0 ? '#30d158' : '#ff453a'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="lgr-chart-card">
              <h3>One-Off Transition Costs</h3>
              <p className="chart-desc">Set-up costs increase with each additional authority created</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={ccnChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" />
                  <XAxis dataKey="name" tick={{ fill: '#8e8e93', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#8e8e93', fontSize: 12 }} tickFormatter={v => `£${v}M`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`£${v.toFixed(1)}M`, 'Transition Cost']} />
                  <Bar dataKey="transitionCost" fill="#ff9f0a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <p className="ccn-source">Source: County Councils Network / PricewaterhouseCoopers. Detailed assumptions not publicly available.</p>
        </section>
      )}

      {/* Proposed Models */}
      <section className="lgr-section">
        <h2><Building size={20} /> The Five Proposals</h2>
        <p className="section-desc">Five proposals were submitted to government in November 2025. Each represents a different vision for Lancashire&apos;s future. Select a proposal to explore.</p>

        <div className="model-tabs">
          {lgrData.proposed_models.map((model, i) => (
            <button
              key={model.id}
              className={`model-tab ${activeModel === model.id ? 'active' : ''}`}
              onClick={() => setSelectedModel(model.id)}
              style={activeModel === model.id ? { background: MODEL_COLORS[i] } : {}}
            >
              <span className="model-tab-name">{model.name}</span>
              <span className="model-tab-by">{model.short_name}</span>
            </button>
          ))}
        </div>

        {activeModelData && (
          <div className="model-detail">
            <div className="model-meta">
              <div className="model-meta-item">
                <strong>Submitted by:</strong> {activeModelData.submitted_by}
              </div>
              <div className="model-meta-item">
                {activeModelData.meets_threshold ? (
                  <span className="threshold-pass"><Check size={14} /> All authorities meet 500K threshold</span>
                ) : (
                  <span className="threshold-fail"><XIcon size={14} /> Not all authorities meet 500K threshold</span>
                )}
              </div>
              {activeModelData.ccn_annual_savings !== null && (
                <div className="model-meta-item">
                  {activeModelData.ccn_annual_savings >= 0 ? (
                    <span className="savings-positive"><TrendingUp size={14} /> {formatCurrency(activeModelData.ccn_annual_savings, true)}/year savings (CCN est.)</span>
                  ) : (
                    <span className="savings-negative"><TrendingDown size={14} /> {formatCurrency(Math.abs(activeModelData.ccn_annual_savings), true)}/year ADDITIONAL cost (CCN est.)</span>
                  )}
                </div>
              )}
              {activeModelData.source_url && (
                <a href={activeModelData.source_url} target="_blank" rel="noopener noreferrer" className="model-source-link">
                  <FileText size={14} /> Read full proposal <ExternalLink size={12} />
                </a>
              )}
            </div>

            <p className="model-desc">{activeModelData.description}</p>

            {/* Authority cards */}
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
                      {fin && fin.serviceExpenditure > 0 && (
                        <div className="auth-stat"><Building size={14} /><span>{formatCurrency(fin.serviceExpenditure, true)} service expenditure</span></div>
                      )}
                    </div>
                    <p className="authority-notes">{authority.notes}</p>
                  </div>
                )
              })}
            </div>

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

            {/* AI DOGE Verdict */}
            {dogeAssessment && (
              <div className="doge-verdict">
                <div className="doge-verdict-header">
                  <Shield size={18} />
                  <h4>AI DOGE Verdict: {dogeAssessment.verdict}</h4>
                  <ScoreBar score={dogeAssessment.score} />
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
          <p className="section-desc">Combined annual spending and reserves for each proposed successor authority (district-level spending data from AI DOGE).</p>
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
          </div>
        </section>
      )}

      {/* Key Issues */}
      <section className="lgr-section">
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
      <section className="lgr-section">
        <h2><Shield size={20} /> UK Precedents</h2>
        <p className="section-desc">Recent English reorganisations and their outcomes — all created 1-2 unitaries and achieved payback within a year.</p>
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
              <p className="precedent-notes">{p.notes}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sources */}
      <section className="lgr-section lgr-methodology">
        <h2>Sources &amp; Methodology</h2>
        <p>
          Proposals sourced from <a href="https://lancashirelgr.co.uk/proposals" target="_blank" rel="noopener noreferrer">lancashirelgr.co.uk</a> and the{' '}
          <a href="https://www.gov.uk/government/consultations/local-government-reorganisation-in-lancashire-blackburn-with-darwen-and-blackpool/proposals-for-local-government-reorganisation-in-lancashire-blackburn-with-darwen-and-blackpool" target="_blank" rel="noopener noreferrer">GOV.UK consultation page</a>.
          Population figures from Blog Preston / ONS Census 2024 estimates. Financial projections from the County Councils Network / PricewaterhouseCoopers analysis.
          Spending data from AI DOGE&apos;s analysis of {formatNumber(2286000)}+ council transactions totalling £12B+ across all 15 Lancashire councils.
        </p>
        <p>
          AI DOGE assessments are independent analytical opinions based on financial data patterns, not political positions. All underlying data is public and verifiable.
        </p>
      </section>
    </div>
  )
}

export default LGRTracker
