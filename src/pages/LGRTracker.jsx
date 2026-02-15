import { useState, useEffect, useMemo } from 'react'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useData } from '../hooks/useData'
import { formatCurrency, formatNumber } from '../utils/format'
import { TOOLTIP_STYLE, CHART_COLORS } from '../utils/constants'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { AlertTriangle, Clock, Building, PoundSterling, Users, TrendingUp, ChevronDown, ChevronRight, ExternalLink, Calendar, Shield, ArrowRight } from 'lucide-react'
import './LGRTracker.css'

const SEVERITY_COLORS = { critical: '#ff453a', high: '#ff9f0a', medium: '#ffd60a', low: '#30d158' }
const MODEL_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a']

function LGRTracker() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const councilId = config.council_id || ''
  const { data, loading, error } = useData(['/data/shared/lgr_tracker.json', '/data/cross_council.json', '/data/budgets_summary.json'])
  const [lgrData, crossCouncil, budgetSummary] = data || [null, null, null]
  const [selectedModel, setSelectedModel] = useState(null)
  const [expandedIssue, setExpandedIssue] = useState(null)

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

  // Build financial aggregations for each proposed model using cross_council data
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
        const totalPop = authority.population_estimate || councils.reduce((sum, c) => sum + (c.population || 0), 0)

        // Aggregate reserves from budget summaries
        let totalReserves = 0
        let totalEarmarked = 0
        let totalUnallocated = 0
        councils.forEach(c => {
          if (c.budget_summary) {
            totalReserves += c.budget_summary.reserves_total || 0
            totalEarmarked += c.budget_summary.reserves_earmarked_closing || 0
            totalUnallocated += c.budget_summary.reserves_unallocated_closing || 0
          }
        })

        // Service expenditure aggregation
        let serviceExpenditure = 0
        let netRevenue = 0
        let ctRequirement = 0
        councils.forEach(c => {
          if (c.budget_summary) {
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
          serviceExpenditure,
          netRevenue,
          ctRequirement,
          reserves: totalReserves,
          earmarkedReserves: totalEarmarked,
          unallocatedReserves: totalUnallocated,
          notes: authority.notes
        }
      })
    })
    return result
  }, [lgrData, crossCouncil])

  // Calculate days until consultation closes
  const daysUntilClose = useMemo(() => {
    if (!lgrData?.meta?.consultation_closes) return null
    const closeDate = new Date(lgrData.meta.consultation_closes)
    const now = new Date()
    const diff = Math.ceil((closeDate - now) / (1000 * 60 * 60 * 24))
    return diff > 0 ? diff : 0
  }, [lgrData])

  if (loading) {
    return (
      <div className="lgr-page animate-fade-in">
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading LGR Tracker...</p>
        </div>
      </div>
    )
  }

  if (error || !lgrData) {
    return (
      <div className="lgr-page animate-fade-in">
        <header className="page-header">
          <h1>LGR Tracker</h1>
          <p className="subtitle">LGR tracking data is not yet available.</p>
        </header>
      </div>
    )
  }

  const activeModel = selectedModel || lgrData.proposed_models[0]?.id
  const activeFinancials = modelFinancials[activeModel] || []

  return (
    <div className="lgr-page animate-fade-in">
      <header className="page-header">
        <div className="lgr-header-row">
          <div>
            <h1>LGR <span className="accent">Tracker</span></h1>
            <p className="subtitle">
              Local Government Reorganisation — tracking the abolition of all 15 Lancashire councils
            </p>
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

      {/* Council-specific context banner */}
      <div className="lgr-context-banner">
        <AlertTriangle size={16} />
        <span>
          <strong>{config.council_full_name || councilName + ' Council'}</strong> is one of 15 Lancashire councils
          proposed for abolition. {relevantModels[0]?.myAuthority ? (
            <>Under the most-discussed model, {councilName} would become part of <strong>{relevantModels[0].myAuthority.name}</strong>.</>
          ) : (
            <>The government consultation closes on {lgrData.meta.consultation_closes}.</>
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

      {/* Proposed Models */}
      <section className="lgr-section">
        <h2><Building size={20} /> Proposed Models</h2>
        <p className="section-desc">Three main models are being discussed for restructuring Lancashire&apos;s 12 district councils + county council into new unitary authorities. Blackpool and Blackburn with Darwen are already unitary.</p>

        <div className="model-tabs">
          {lgrData.proposed_models.map(model => (
            <button
              key={model.id}
              className={`model-tab ${activeModel === model.id ? 'active' : ''}`}
              onClick={() => setSelectedModel(model.id)}
            >
              {model.name}
            </button>
          ))}
        </div>

        {lgrData.proposed_models.filter(m => m.id === activeModel).map(model => (
          <div key={model.id} className="model-detail">
            <p className="model-desc">{model.description}</p>
            <p className="model-source">Source: {model.source}</p>

            <div className="authority-cards">
              {model.authorities.map((authority, i) => {
                const fin = activeFinancials.find(f => f.name === authority.name)
                const isMyAuthority = authority.councils.includes(councilId)
                return (
                  <div key={i} className={`authority-card ${isMyAuthority ? 'my-authority' : ''}`}>
                    <div className="authority-color-bar" style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                    {isMyAuthority && <span className="my-badge">Your council</span>}
                    <h3>{authority.name}</h3>
                    <p className="authority-councils">
                      {authority.councils.map((c, j) => (
                        <span key={c} className={c === councilId ? 'highlight-council' : ''}>
                          {j > 0 && ', '}
                          {(fin?.councilNames?.[j]) || c}
                        </span>
                      ))}
                    </p>
                    <div className="authority-stats">
                      <div className="auth-stat">
                        <Users size={14} />
                        <span>{formatNumber(authority.population_estimate)} residents</span>
                      </div>
                      {fin && fin.annualSpend > 0 && (
                        <>
                          <div className="auth-stat">
                            <PoundSterling size={14} />
                            <span>{formatCurrency(fin.annualSpend, true)} annual spend</span>
                          </div>
                          <div className="auth-stat">
                            <TrendingUp size={14} />
                            <span>{formatCurrency(fin.spendPerHead)} per head</span>
                          </div>
                        </>
                      )}
                      {fin && fin.serviceExpenditure > 0 && (
                        <div className="auth-stat">
                          <Building size={14} />
                          <span>{formatCurrency(fin.serviceExpenditure, true)} service expenditure</span>
                        </div>
                      )}
                    </div>
                    <p className="authority-notes">{authority.notes}</p>
                  </div>
                )
              })}
            </div>

            {model.notes && <p className="model-footnote">{model.notes}</p>}
          </div>
        ))}
      </section>

      {/* Financial Comparison Chart */}
      {activeFinancials.length > 0 && activeFinancials.some(f => f.annualSpend > 0) && (
        <section className="lgr-section">
          <h2><PoundSterling size={20} /> Financial Comparison — {lgrData.proposed_models.find(m => m.id === activeModel)?.name}</h2>
          <p className="section-desc">Combined annual spending for each proposed successor authority (district-level spending only, excludes current LCC share).</p>

          <div className="lgr-chart-grid">
            <div className="lgr-chart-card">
              <h3>Annual Spend by Proposed Authority</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={activeFinancials.filter(f => f.annualSpend > 0)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" />
                  <XAxis dataKey="name" tick={{ fill: '#8e8e93', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#8e8e93', fontSize: 12 }} tickFormatter={v => `£${(v / 1e6).toFixed(0)}M`} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [formatCurrency(value, true), 'Annual Spend']}
                  />
                  <Bar dataKey="annualSpend" radius={[6, 6, 0, 0]}>
                    {activeFinancials.filter(f => f.annualSpend > 0).map((_, i) => (
                      <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="lgr-chart-card">
              <h3>Population Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={activeFinancials}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="population"
                    nameKey="name"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {activeFinancials.map((_, i) => (
                      <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [formatNumber(value), 'Population']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Reserves comparison */}
          {activeFinancials.some(f => f.reserves > 0) && (
            <div className="lgr-chart-card">
              <h3>Reserves by Proposed Authority</h3>
              <p className="chart-desc">Earmarked reserves are tied to specific obligations. Unallocated reserves are freely available.</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={activeFinancials.filter(f => f.reserves > 0)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" />
                  <XAxis dataKey="name" tick={{ fill: '#8e8e93', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#8e8e93', fontSize: 12 }} tickFormatter={v => `£${(v / 1e6).toFixed(0)}M`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [formatCurrency(value, true), '']} />
                  <Bar dataKey="earmarkedReserves" name="Earmarked" stackId="reserves" fill="#ff9f0a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="unallocatedReserves" name="Unallocated" stackId="reserves" fill="#30d158" radius={[6, 6, 0, 0]} />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      )}

      {/* Key Issues */}
      <section className="lgr-section">
        <h2><AlertTriangle size={20} /> Key Issues</h2>
        <p className="section-desc">The biggest financial and operational risks facing the reorganisation.</p>

        <div className="issues-list">
          {lgrData.key_issues.map(issue => (
            <div
              key={issue.id}
              className={`issue-card ${expandedIssue === issue.id ? 'expanded' : ''}`}
              onClick={() => setExpandedIssue(expandedIssue === issue.id ? null : issue.id)}
            >
              <div className="issue-header">
                <div className="issue-severity" style={{ background: SEVERITY_COLORS[issue.severity] }}>
                  {issue.severity}
                </div>
                <h3>{issue.title}</h3>
                {issue.figure && (
                  <span className="issue-figure">{issue.figure}</span>
                )}
                {expandedIssue === issue.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </div>
              {expandedIssue === issue.id && (
                <div className="issue-detail">
                  <p>{issue.description}</p>
                  {issue.figure_label && (
                    <p className="issue-figure-label">{issue.figure_label}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Precedents */}
      <section className="lgr-section">
        <h2><Shield size={20} /> Precedents</h2>
        <p className="section-desc">Recent UK reorganisations and their outcomes.</p>

        <div className="precedents-grid">
          {lgrData.precedents.map(p => (
            <div key={p.area} className="precedent-card">
              <div className="precedent-header">
                <h3>{p.area}</h3>
                <span className="precedent-year">{p.year}</span>
              </div>
              <div className="precedent-stats">
                <div><strong>{p.councils_merged}</strong> councils merged</div>
                <div><ArrowRight size={14} /></div>
                <div><strong>{p.new_unitaries}</strong> new {p.new_unitaries === 1 ? 'unitary' : 'unitaries'}</div>
              </div>
              <div className="precedent-financials">
                <div className="prec-stat">
                  <span className="prec-label">Transition cost</span>
                  <span className="prec-value">{p.transition_cost}</span>
                </div>
                <div className="prec-stat">
                  <span className="prec-label">Annual savings</span>
                  <span className="prec-value savings">{p.annual_savings}</span>
                </div>
                <div className="prec-stat">
                  <span className="prec-label">Payback</span>
                  <span className="prec-value">{p.payback_period}</span>
                </div>
              </div>
              <p className="precedent-notes">{p.notes}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Methodology */}
      <section className="lgr-section lgr-methodology">
        <h2>About This Page</h2>
        <p>
          This page tracks the Local Government Reorganisation consultation for Lancashire. Financial data comes from
          GOV.UK MHCLG outturn returns (2024-25) and council spending transparency data. Population estimates are from
          Census 2021 mid-year estimates. Proposed boundary models are based on publicly reported council leader
          proposals and government guidance.
        </p>
        <p>
          AI DOGE tracks spending data for all 15 Lancashire councils — a unique dataset that enables financial
          modelling of proposed successor authorities that no other public tool provides.
        </p>
      </section>
    </div>
  )
}

export default LGRTracker
