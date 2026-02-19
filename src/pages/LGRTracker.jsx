import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useData } from '../hooks/useData'
import { formatCurrency, formatNumber } from '../utils/format'
import { TOOLTIP_STYLE } from '../utils/constants'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ReferenceLine, LineChart, Line, ComposedChart, Area } from 'recharts'
import { AlertTriangle, Clock, Building, PoundSterling, Users, TrendingUp, TrendingDown, ChevronDown, ChevronRight, ExternalLink, Calendar, Shield, ArrowRight, Check, X as XIcon, ThumbsUp, ThumbsDown, Star, FileText, Globe, BookOpen, Vote, Brain, Lightbulb, BarChart3, MapPin, Sliders, RotateCcw } from 'lucide-react'
import { computeCashflow, computeSensitivity, computeTornado, findBreakevenYear, DEFAULT_ASSUMPTIONS, MODEL_KEY_MAP } from '../utils/lgrModel'
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

function AssumptionSlider({ label, value, min, max, step, format, onChange, description }) {
  return (
    <div className="assumption-slider">
      <div className="slider-header">
        <span className="slider-label">{label}</span>
        <span className="slider-value">{format(value)}</span>
      </div>
      {description && <span className="slider-desc">{description}</span>}
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider-input"
      />
      <div className="slider-range">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  )
}

function HealthIndicator({ label, value, format, status, detail }) {
  const colors = { good: '#30d158', warning: '#ff9f0a', danger: '#ff453a', neutral: '#8e8e93' }
  const labels = { good: 'Good', warning: 'Warning', danger: 'Risk', neutral: 'N/A' }
  return (
    <div className="health-indicator">
      <div className="health-indicator-header">
        <span className="health-label">{label}</span>
        <span className="health-status" style={{ color: colors[status] || colors.neutral }}>
          {status === 'good' ? <Check size={12} /> : status === 'danger' ? <AlertTriangle size={12} /> : null}
          {labels[status] || 'N/A'}
        </span>
      </div>
      <div className="health-value" style={{ color: colors[status] || colors.neutral }}>{format ? format(value) : value}</div>
      {detail && <div className="health-detail">{detail}</div>}
    </div>
  )
}

function FinancialHealthScorecard({ financials }) {
  if (!financials) return null
  const { minCollectionRate, avgCollectionRate, councilsBelowTarget, totalUncollected,
    avgDependencyRatio, maxDependencyRatio, avgElderlyPct, avgYouthPct,
    reservesMonths, reservesDirection, name } = financials

  // Revenue risk: uncollected CT + councils below target
  const collectionStatus = minCollectionRate == null ? 'neutral' : minCollectionRate >= 96 ? 'good' : minCollectionRate >= 94 ? 'warning' : 'danger'
  const dependencyStatus = avgDependencyRatio == null ? 'neutral' : avgDependencyRatio < 60 ? 'good' : avgDependencyRatio < 65 ? 'warning' : 'danger'
  const reservesStatus = reservesMonths == null ? 'neutral' : reservesMonths >= 6 ? 'good' : reservesMonths >= 3 ? 'warning' : 'danger'

  // Overall score: simple traffic light
  const statuses = [collectionStatus, dependencyStatus, reservesStatus].filter(s => s !== 'neutral')
  const dangerCount = statuses.filter(s => s === 'danger').length
  const warningCount = statuses.filter(s => s === 'warning').length
  const overallStatus = dangerCount >= 2 ? 'danger' : dangerCount >= 1 || warningCount >= 2 ? 'warning' : 'good'
  const overallLabel = overallStatus === 'good' ? 'Healthy' : overallStatus === 'warning' ? 'Some Risks' : 'Significant Risks'

  return (
    <div className={`financial-health-scorecard scorecard-${overallStatus}`}>
      <div className="scorecard-header">
        <div className="scorecard-title">
          <BarChart3 size={14} />
          <span>Financial Health</span>
        </div>
        <span className={`scorecard-overall scorecard-${overallStatus}`}>{overallLabel}</span>
      </div>

      <div className="scorecard-indicators">
        <HealthIndicator
          label="CT Collection"
          value={avgCollectionRate != null ? `${avgCollectionRate.toFixed(1)}%` : 'N/A'}
          status={collectionStatus}
          detail={councilsBelowTarget?.length > 0
            ? `${councilsBelowTarget.map(c => `${c.name} (${c.rate}%)`).join(', ')} below 94%`
            : minCollectionRate != null ? `Min: ${minCollectionRate.toFixed(1)}%` : null}
        />
        <HealthIndicator
          label="Dependency Ratio"
          value={avgDependencyRatio != null ? `${avgDependencyRatio}%` : 'N/A'}
          status={dependencyStatus}
          detail={avgDependencyRatio != null ? `${avgElderlyPct}% elderly, ${avgYouthPct}% youth` : null}
        />
        <HealthIndicator
          label="Reserves Buffer"
          value={reservesMonths != null ? `${reservesMonths} months` : 'N/A'}
          status={reservesStatus}
          detail={reservesDirection && reservesDirection !== 'unknown' ? `Trend: ${reservesDirection}` : null}
        />
      </div>
      {totalUncollected > 0 && (
        <div className="scorecard-warning">
          <AlertTriangle size={12} /> {formatCurrency(totalUncollected, true)} uncollected council tax across constituent councils
        </div>
      )}
    </div>
  )
}

function LGRTracker() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const councilId = config.council_id || ''
  const { data, loading, error } = useData(['/data/shared/lgr_tracker.json', '/data/cross_council.json', '/data/shared/lgr_budget_model.json'])
  const [lgrData, crossCouncil, budgetModel] = data || [null, null, null]
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

        // Collection rate metrics (billing authorities only — LCC excluded)
        const collectionCouncils = councils.filter(c => c.collection_rate != null)
        const minCollectionRate = collectionCouncils.length > 0 ? Math.min(...collectionCouncils.map(c => c.collection_rate)) : null
        const avgCollectionRate = collectionCouncils.length > 0 ? collectionCouncils.reduce((s, c) => s + c.collection_rate, 0) / collectionCouncils.length : null
        const councilsBelowTarget = collectionCouncils.filter(c => c.collection_rate < 94).map(c => ({ name: c.council_name, rate: c.collection_rate }))
        const totalUncollected = collectionCouncils.reduce((s, c) => s + (c.uncollected_ct_gbp || 0), 0)

        // Dependency ratio metrics
        const depCouncils = councils.filter(c => c.dependency_ratio > 0)
        const avgDependencyRatio = depCouncils.length > 0 ? Math.round(depCouncils.reduce((s, c) => s + c.dependency_ratio, 0) / depCouncils.length * 10) / 10 : null
        const maxDependencyRatio = depCouncils.length > 0 ? Math.max(...depCouncils.map(c => c.dependency_ratio)) : null
        const avgElderlyPct = depCouncils.length > 0 ? Math.round(depCouncils.reduce((s, c) => s + (c.elderly_ratio || 0), 0) / depCouncils.length * 10) / 10 : null
        const avgYouthPct = depCouncils.length > 0 ? Math.round(depCouncils.reduce((s, c) => s + (c.youth_ratio || 0), 0) / depCouncils.length * 10) / 10 : null

        // Reserves adequacy: months of spend covered
        const monthlySpend = serviceExpenditure > 0 ? serviceExpenditure / 12 : (netRevenue > 0 ? netRevenue / 12 : 0)
        const reservesMonths = monthlySpend > 0 ? Math.round(totalReserves / monthlySpend * 10) / 10 : null

        // Reserves trajectory: aggregate across constituent councils
        const trajectoryYears = new Map()
        councils.forEach(c => {
          (c.reserves_trajectory || []).forEach(rt => {
            const existing = trajectoryYears.get(rt.year) || { earmarked: 0, unallocated: 0, total: 0 }
            existing.earmarked += rt.earmarked || 0
            existing.unallocated += rt.unallocated || 0
            existing.total += rt.total || 0
            trajectoryYears.set(rt.year, existing)
          })
        })
        const reservesTrajectory = [...trajectoryYears.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([year, data]) => ({ year, ...data }))

        // Reserves direction: compare last 2 years of trajectory
        let reservesDirection = 'unknown'
        if (reservesTrajectory.length >= 2) {
          const last = reservesTrajectory[reservesTrajectory.length - 1].total
          const prev = reservesTrajectory[reservesTrajectory.length - 2].total
          reservesDirection = last > prev * 1.03 ? 'growing' : last < prev * 0.97 ? 'declining' : 'stable'
        }

        return {
          name: authority.name, councils: authority.councils,
          councilNames: councils.map(c => c.council_name || c.council_id),
          population: totalPop, annualSpend: totalSpend, annualRecords: totalRecords,
          spendPerHead: totalPop > 0 ? totalSpend / totalPop : 0,
          serviceExpenditure, netRevenue, ctRequirement,
          reserves: totalReserves, earmarkedReserves: totalEarmarked, unallocatedReserves: totalUnallocated,
          notes: authority.notes,
          // New Part 5 metrics
          minCollectionRate, avgCollectionRate, councilsBelowTarget, totalUncollected,
          avgDependencyRatio, maxDependencyRatio, avgElderlyPct, avgYouthPct,
          reservesMonths, reservesTrajectory, reservesDirection
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
      dogeSavingsGross: (p.annual_saving_gross || p.annual_saving) / 1e6,
      transitionCost: p.transition_cost / 1e6,
      tenYearNet: p.ten_year_net / 1e6,
      realisticTenYear: (p.realistic_ten_year_net || p.ten_year_net) / 1e6,
      payback: p.payback_years,
      savingNote: p.annual_saving_note || '',
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

  // What-if calculator state
  const [userAssumptions, setUserAssumptions] = useState(null)
  const [whatIfOpen, setWhatIfOpen] = useState(false)

  // Active model (computed early for use in cashflow hooks — safe when lgrData is null)
  const activeModel = selectedModel || lgrData?.proposed_models?.[0]?.id || null

  // Time-phased cashflow model
  const cashflowData = useMemo(() => {
    if (!budgetModel?.transition_cost_profile || !budgetModel?.savings_ramp_profile) return null
    if (!lgrData?.independent_model?.transition_costs) return null

    const modelKey = MODEL_KEY_MAP[activeModel]
    if (!modelKey) return null
    const transitionCosts = lgrData.independent_model.transition_costs[modelKey]
    const annualSavings = budgetModel.per_service_savings?.[activeModel]?.total_annual_savings || 0

    if (!transitionCosts || annualSavings <= 0) return null

    const assumptions = userAssumptions || budgetModel.model_defaults || DEFAULT_ASSUMPTIONS

    return computeCashflow({
      annualSavings,
      transitionCosts,
      costProfile: budgetModel.transition_cost_profile,
      savingsRamp: budgetModel.savings_ramp_profile,
      assumptions,
    })
  }, [budgetModel, lgrData, activeModel, userAssumptions])

  // Sensitivity analysis (best/central/worst)
  const sensitivityData = useMemo(() => {
    if (!budgetModel?.transition_cost_profile || !budgetModel?.savings_ramp_profile) return null
    if (!lgrData?.independent_model?.transition_costs) return null

    const modelKey = MODEL_KEY_MAP[activeModel]
    if (!modelKey) return null
    const transitionCosts = lgrData.independent_model.transition_costs[modelKey]
    const annualSavings = budgetModel.per_service_savings?.[activeModel]?.total_annual_savings || 0

    if (!transitionCosts || annualSavings <= 0) return null

    const assumptions = userAssumptions || budgetModel.model_defaults || DEFAULT_ASSUMPTIONS

    return computeSensitivity({
      annualSavings,
      transitionCosts,
      costProfile: budgetModel.transition_cost_profile,
      savingsRamp: budgetModel.savings_ramp_profile,
      assumptions,
    })
  }, [budgetModel, lgrData, activeModel, userAssumptions])

  // Tornado diagram data
  const tornadoData = useMemo(() => {
    if (!budgetModel?.transition_cost_profile || !budgetModel?.savings_ramp_profile) return null
    if (!lgrData?.independent_model?.transition_costs) return null

    const modelKey = MODEL_KEY_MAP[activeModel]
    if (!modelKey) return null
    const transitionCosts = lgrData.independent_model.transition_costs[modelKey]
    const annualSavings = budgetModel.per_service_savings?.[activeModel]?.total_annual_savings || 0

    if (!transitionCosts || annualSavings <= 0) return null

    const assumptions = userAssumptions || budgetModel.model_defaults || DEFAULT_ASSUMPTIONS

    return computeTornado({
      annualSavings,
      transitionCosts,
      costProfile: budgetModel.transition_cost_profile,
      savingsRamp: budgetModel.savings_ramp_profile,
      assumptions,
    })
  }, [budgetModel, lgrData, activeModel, userAssumptions])

  if (loading) {
    return <div className="lgr-page animate-fade-in"><div className="loading-state"><div className="spinner" /><p>Loading LGR Tracker...</p></div></div>
  }
  if (error || !lgrData) {
    return <div className="lgr-page animate-fade-in"><header className="page-header"><h1>LGR Tracker</h1><p className="subtitle">LGR tracking data is not yet available.</p></header></div>
  }

  // activeModel already computed above for use in hooks
  const activeFinancials = modelFinancials[activeModel] || []
  const activeModelData = lgrData.proposed_models.find(m => m.id === activeModel)
  const dogeAssessment = lgrData.ai_doge_analysis?.assessments?.find(a => a.model_id === activeModel)

  const sectionNav = [
    { id: 'proposals', label: 'Proposals', icon: Building },
    { id: 'independent', label: 'AI DOGE Model', icon: Brain },
    { id: 'cashflow', label: 'Cashflow', icon: TrendingUp },
    { id: 'sensitivity', label: 'Sensitivity', icon: Sliders },
    { id: 'council-tax', label: 'Council Tax', icon: PoundSterling },
    { id: 'assets', label: 'Assets', icon: PoundSterling },
    { id: 'handover', label: 'Handover', icon: ArrowRight },
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
          {' '}<Link to="/lgr-calculator" className="lgr-calc-link">See what it means for your council tax →</Link>
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
          <>
            <div className="lgr-savings-explainer">
              <h3><AlertTriangle size={16} /> How We Calculate Savings</h3>
              <p>
                AI DOGE computes savings bottom-up from 192 real GOV.UK budget lines across all 15 Lancashire councils.
                The chart below shows <strong>realistic annual savings</strong> — after deducting ongoing costs of the new
                authorities and applying a <strong>75% realisation rate</strong> (because reorganisations never achieve
                100% of projected savings — see E&amp;Y 2016, Durham/Wiltshire evidence).
                Transition costs assume a <strong>1.25× overrun factor</strong> based on Buckinghamshire, Cornwall and
                Northamptonshire evidence (NAO).
              </p>
            </div>
            <div className="lgr-chart-grid">
              <div className="lgr-chart-card">
                <h3>Realistic Annual Savings by Model</h3>
                <p className="chart-desc">Net of ongoing costs, at 75% realisation rate. Negative = costs MORE than current system.</p>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dogeComparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" />
                    <XAxis dataKey="name" tick={{ fill: '#8e8e93', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#8e8e93', fontSize: 12 }} tickFormatter={v => `£${v}M`} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => {
                      const label = name === 'dogeSavingsGross' ? 'Gross savings (before deductions)' : 'Realistic savings (net, 75% realised)'
                      return [`£${v.toFixed(1)}M/year`, label]
                    }} />
                    <ReferenceLine y={0} stroke="#636366" strokeDasharray="3 3" />
                    <Bar dataKey="dogeSavingsGross" name="Gross" fill="#48484a" radius={[6, 6, 0, 0]} opacity={0.4} />
                    <Bar dataKey="dogeSavings" name="Realistic" radius={[6, 6, 0, 0]}>
                      {dogeComparisonData.map((entry, i) => (
                        <Cell key={i} fill={entry.dogeSavings >= 0 ? '#30d158' : '#ff453a'} />
                      ))}
                    </Bar>
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="lgr-chart-card">
                <h3>10-Year Net Financial Impact</h3>
                <p className="chart-desc">Realistic savings minus transition costs (with 1.25× overrun) over 10 years</p>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dogeComparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" />
                    <XAxis dataKey="name" tick={{ fill: '#8e8e93', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#8e8e93', fontSize: 12 }} tickFormatter={v => `£${v}M`} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`£${v.toFixed(0)}M`, v >= 0 ? '10yr Net Saving' : '10yr Net Cost']} />
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
          </>
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
            <h3>Consultants vs AI DOGE: Gross Savings Comparison</h3>
            <p className="chart-desc">
              Newton Europe (commissioned by LCC) uses activity-based costing with wider scope and higher savings assumptions.
              AI DOGE uses bottom-up GOV.UK outturn data with conservative academic benchmarks.
              Both figures shown are <strong>gross</strong> (before realisation adjustments).
              Note: County UA is the hypothetical single-authority option — no council proposed this.
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={Object.entries(lgrData.independent_model.presentation_comparison)
                  .map(([key, val]) => ({
                    name: MODEL_LABELS[key] || key,
                    newton: (val.newton_europe_savings || 0) / 1e6,
                    doge: (val.doge_computed_savings || 0) / 1e6,
                  }))}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" />
                <XAxis dataKey="name" tick={{ fill: '#8e8e93', fontSize: 12 }} />
                <YAxis tick={{ fill: '#8e8e93', fontSize: 12 }} tickFormatter={v => `£${v}M`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [
                  `£${v?.toFixed(1)}M/yr (gross)`,
                  name === 'newton' ? 'Newton Europe (consultants)' : 'AI DOGE (independent)'
                ]} />
                <ReferenceLine y={0} stroke="#636366" strokeDasharray="3 3" />
                <Bar dataKey="newton" name="Newton Europe (consultants)" fill="#636366" radius={[6, 6, 0, 0]} />
                <Bar dataKey="doge" name="AI DOGE (independent)" fill="#0a84ff" radius={[6, 6, 0, 0]} />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
            <p className="chart-note text-secondary" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
              Newton Europe figures from Lancashire LGR People Services Analysis (2025). AI DOGE figures from GOV.UK MHCLG Revenue Outturn 2024-25.
              The realistic AI DOGE figures (shown in the chart above) are significantly lower after applying 75% realisation and deducting ongoing costs.
            </p>
          </div>
        )}

        {/* Net savings (gross minus ongoing costs) */}
        {lgrData.independent_model?.savings_breakdown?.net_annual && (
          <div className="lgr-net-savings">
            <h3>Net Annual Impact Before Realisation Adjustment</h3>
            <p className="chart-desc" style={{ marginBottom: '0.75rem' }}>
              Gross savings from service consolidation, minus ongoing costs of running the new authority/ies.
              The realistic figures above apply a further 75% realisation rate to these net savings.
            </p>
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
            <h3>Model Assumptions (Published for Scrutiny)</h3>
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

      {/* ========== Cashflow Section ========== */}
      {cashflowData && (
        <section className="lgr-section" id="lgr-cashflow">
          <h2><TrendingUp size={20} /> Year-by-Year Financial Trajectory</h2>
          <p className="section-desc">
            Time-phased cashflow model using HM Treasury Green Book 3.5% discount rate,
            S-curve savings ramp, and profiled transition costs. This shows when the investment pays back.
          </p>

          {/* What-If Calculator Panel */}
          <div className="whatif-panel">
            <button className="whatif-toggle" onClick={() => setWhatIfOpen(!whatIfOpen)}>
              <Sliders size={18} />
              <span>Interactive Calculator — Adjust Assumptions</span>
              <span className="whatif-badge">{userAssumptions ? 'Custom' : 'Defaults'}</span>
              {whatIfOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            <div className={`whatif-content ${whatIfOpen ? 'open' : ''}`}>
              <div className="whatif-grid">
                <AssumptionSlider
                  label="Savings realisation rate"
                  description="What % of projected savings are actually achieved"
                  value={(userAssumptions || budgetModel.model_defaults || DEFAULT_ASSUMPTIONS).savingsRealisationRate || 0.75}
                  min={0.50} max={1.00} step={0.05}
                  format={v => `${(v * 100).toFixed(0)}%`}
                  onChange={v => setUserAssumptions(prev => ({ ...(prev || budgetModel.model_defaults || DEFAULT_ASSUMPTIONS), savingsRealisationRate: v }))}
                />
                <AssumptionSlider
                  label="Transition cost overrun"
                  description="Multiplier on estimated transition costs"
                  value={(userAssumptions || budgetModel.model_defaults || DEFAULT_ASSUMPTIONS).transitionCostOverrun || 1.0}
                  min={1.00} max={1.50} step={0.05}
                  format={v => `${v.toFixed(2)}×`}
                  onChange={v => setUserAssumptions(prev => ({ ...(prev || budgetModel.model_defaults || DEFAULT_ASSUMPTIONS), transitionCostOverrun: v }))}
                />
                <AssumptionSlider
                  label="Discount rate"
                  description="HM Treasury Green Book rate for NPV"
                  value={(userAssumptions || budgetModel.model_defaults || DEFAULT_ASSUMPTIONS).discountRate || 0.035}
                  min={0.01} max={0.06} step={0.005}
                  format={v => `${(v * 100).toFixed(1)}%`}
                  onChange={v => setUserAssumptions(prev => ({ ...(prev || budgetModel.model_defaults || DEFAULT_ASSUMPTIONS), discountRate: v }))}
                />
                <AssumptionSlider
                  label="Inflation rate"
                  description="Annual cost inflation (CPI)"
                  value={(userAssumptions || budgetModel.model_defaults || DEFAULT_ASSUMPTIONS).inflationRate || 0.02}
                  min={0.01} max={0.04} step={0.005}
                  format={v => `${(v * 100).toFixed(1)}%`}
                  onChange={v => setUserAssumptions(prev => ({ ...(prev || budgetModel.model_defaults || DEFAULT_ASSUMPTIONS), inflationRate: v }))}
                />
              </div>
              {userAssumptions && (
                <button className="whatif-reset" onClick={() => setUserAssumptions(null)}>
                  <RotateCcw size={14} /> Reset to defaults
                </button>
              )}
            </div>
          </div>

          {/* Headline stats */}
          <div className="cashflow-headline">
            <div className="cashflow-stat">
              <span className={`cashflow-stat-value ${(cashflowData[cashflowData.length - 1]?.cumulative || 0) >= 0 ? 'positive' : 'negative'}`}>
                £{Math.abs((cashflowData[cashflowData.length - 1]?.cumulative || 0) / 1e6).toFixed(0)}M
              </span>
              <span className="cashflow-stat-label">11-Year Cumulative Net</span>
            </div>
            <div className="cashflow-stat">
              <span className={`cashflow-stat-value ${(cashflowData[cashflowData.length - 1]?.npv || 0) >= 0 ? 'positive' : 'negative'}`}>
                £{Math.abs((cashflowData[cashflowData.length - 1]?.npv || 0) / 1e6).toFixed(0)}M
              </span>
              <span className="cashflow-stat-label">Net Present Value</span>
            </div>
            <div className="cashflow-stat">
              <span className="cashflow-stat-value" style={{ color: '#0a84ff' }}>
                {findBreakevenYear(cashflowData) || 'Never'}
              </span>
              <span className="cashflow-stat-label">Breakeven Year</span>
            </div>
          </div>

          {/* Cashflow chart */}
          <div className="lgr-chart-card">
            <h3>Annual Costs, Savings & Cumulative Position</h3>
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={cashflowData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" />
                <XAxis dataKey="year" tick={{ fill: '#8e8e93', fontSize: 12 }} />
                <YAxis tick={{ fill: '#8e8e93', fontSize: 12 }} tickFormatter={v => `£${(v / 1e6).toFixed(0)}M`} />
                <Tooltip
                  contentStyle={{ ...TOOLTIP_STYLE }}
                  formatter={(v) => [`£${(v / 1e6).toFixed(1)}M`]}
                />
                <ReferenceLine y={0} stroke="#636366" strokeDasharray="3 3" />
                <Area dataKey="cumulative" name="Cumulative" fill="rgba(10, 132, 255, 0.08)" stroke="none" />
                <Bar dataKey="costs" name="Costs" fill="#ff453a" radius={[2, 2, 0, 0]} barSize={20} />
                <Bar dataKey="savings" name="Savings" fill="#30d158" radius={[2, 2, 0, 0]} barSize={20} />
                <Line dataKey="cumulative" name="Cumulative" stroke="#0a84ff" strokeWidth={2} dot={{ fill: '#0a84ff', r: 3 }} />
                <Line dataKey="npv" name="NPV" stroke="#bf5af2" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
                <Legend />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Per-Authority Financial Position */}
          {budgetModel?.per_authority_savings?.[activeModel] && budgetModel?.authority_balance_sheets?.[activeModel] && (
            <>
              <h3 style={{ marginTop: '1.5rem' }}><Building size={16} /> Per-Authority Financial Position</h3>
              <div className="authority-financial-cards">
                {Object.entries(budgetModel.per_authority_savings[activeModel]).map(([authName, authData]) => {
                  const bs = budgetModel.authority_balance_sheets[activeModel]?.[authName] || {}
                  const breakeven = (() => {
                    // Rough breakeven: transition cost share / annual savings
                    const modelKey = MODEL_KEY_MAP[activeModel]
                    const tc = lgrData.independent_model?.transition_costs?.[modelKey]?.total || 0
                    const popShare = (bs.population_share_pct || 0) / 100
                    const tcShare = tc * popShare
                    return authData.annual_savings > 0 ? Math.ceil(tcShare / (authData.annual_savings * 0.75)) : null
                  })()
                  const cardClass = breakeven && breakeven <= 5 ? 'positive' : breakeven && breakeven <= 10 ? 'breakeven-slow' : 'negative'

                  return (
                    <div key={authName} className={`authority-financial-card ${cardClass}`}>
                      <h4 className="auth-fin-name">{authName}</h4>
                      <div className="auth-fin-row">
                        <span className="auth-fin-label">Annual savings</span>
                        <span className="auth-fin-value" style={{ color: '#30d158' }}>£{(authData.annual_savings / 1e6).toFixed(1)}M</span>
                      </div>
                      <div className="auth-fin-row">
                        <span className="auth-fin-label">Councils merging</span>
                        <span className="auth-fin-value">{authData.num_merging_entities}</span>
                      </div>
                      <div className="auth-fin-row">
                        <span className="auth-fin-label">Reserves (total)</span>
                        <span className="auth-fin-value">£{((bs.reserves_total || 0) / 1e6).toFixed(1)}M</span>
                      </div>
                      <div className="auth-fin-row">
                        <span className="auth-fin-label">LCC debt share</span>
                        <span className="auth-fin-value" style={{ color: '#ff453a' }}>−£{((bs.lcc_debt_share || 0) / 1e6).toFixed(0)}M</span>
                      </div>
                      <div className="auth-fin-row">
                        <span className="auth-fin-label">DSG deficit share</span>
                        <span className="auth-fin-value" style={{ color: '#ff453a' }}>−£{((bs.dsg_deficit_share || 0) / 1e6).toFixed(1)}M</span>
                      </div>
                      <div className="auth-fin-row" style={{ borderTop: '1px solid #3a3a3c', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                        <span className="auth-fin-label" style={{ fontWeight: 600 }}>Opening net position</span>
                        <span className="auth-fin-value" style={{ color: (bs.opening_net_position || 0) >= 0 ? '#30d158' : '#ff453a' }}>
                          {(bs.opening_net_position || 0) >= 0 ? '' : '−'}£{Math.abs((bs.opening_net_position || 0) / 1e6).toFixed(0)}M
                        </span>
                      </div>
                      {breakeven && (
                        <div className="auth-fin-row">
                          <span className="auth-fin-label">Est. breakeven</span>
                          <span className="auth-fin-value" style={{ color: breakeven <= 3 ? '#30d158' : breakeven <= 6 ? '#ff9f0a' : '#ff453a' }}>
                            Year {breakeven}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </section>
      )}

      {/* ========== Sensitivity Analysis ========== */}
      {sensitivityData && (
        <section className="lgr-section" id="lgr-sensitivity">
          <h2><Sliders size={20} /> Sensitivity Analysis</h2>
          <p className="section-desc">
            Best, central, and worst case scenarios showing how different assumptions
            affect the financial outcome. The shaded band shows the range of uncertainty.
          </p>

          {/* Scenario comparison table */}
          <table className="sensitivity-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th className="scenario-best">Best Case</th>
                <th className="scenario-central">Central Case</th>
                <th className="scenario-worst">Worst Case</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Savings realisation</td>
                <td style={{ color: '#30d158' }}>100%</td>
                <td>75%</td>
                <td style={{ color: '#ff453a' }}>50%</td>
              </tr>
              <tr>
                <td>Cost overrun</td>
                <td style={{ color: '#30d158' }}>1.0×</td>
                <td>1.0×</td>
                <td style={{ color: '#ff453a' }}>1.5×</td>
              </tr>
              <tr>
                <td>11-Year cumulative</td>
                <td style={{ color: '#30d158' }}>£{((sensitivityData.best[sensitivityData.best.length - 1]?.cumulative || 0) / 1e6).toFixed(0)}M</td>
                <td>£{((sensitivityData.central[sensitivityData.central.length - 1]?.cumulative || 0) / 1e6).toFixed(0)}M</td>
                <td style={{ color: (sensitivityData.worst[sensitivityData.worst.length - 1]?.cumulative || 0) >= 0 ? '#30d158' : '#ff453a' }}>
                  {(sensitivityData.worst[sensitivityData.worst.length - 1]?.cumulative || 0) >= 0 ? '' : '−'}£{Math.abs((sensitivityData.worst[sensitivityData.worst.length - 1]?.cumulative || 0) / 1e6).toFixed(0)}M
                </td>
              </tr>
              <tr>
                <td>Net Present Value</td>
                <td style={{ color: '#30d158' }}>£{((sensitivityData.best[sensitivityData.best.length - 1]?.npv || 0) / 1e6).toFixed(0)}M</td>
                <td>£{((sensitivityData.central[sensitivityData.central.length - 1]?.npv || 0) / 1e6).toFixed(0)}M</td>
                <td style={{ color: (sensitivityData.worst[sensitivityData.worst.length - 1]?.npv || 0) >= 0 ? '#30d158' : '#ff453a' }}>
                  {(sensitivityData.worst[sensitivityData.worst.length - 1]?.npv || 0) >= 0 ? '' : '−'}£{Math.abs((sensitivityData.worst[sensitivityData.worst.length - 1]?.npv || 0) / 1e6).toFixed(0)}M
                </td>
              </tr>
              <tr>
                <td>Breakeven</td>
                <td style={{ color: '#30d158' }}>{findBreakevenYear(sensitivityData.best) || 'Never'}</td>
                <td>{findBreakevenYear(sensitivityData.central) || 'Never'}</td>
                <td style={{ color: findBreakevenYear(sensitivityData.worst) ? '#ff9f0a' : '#ff453a' }}>
                  {findBreakevenYear(sensitivityData.worst) || 'Never'}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Confidence band chart */}
          <div className="lgr-chart-card">
            <h3>Cumulative Net Position — Confidence Range</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={sensitivityData.central.map((c, i) => ({
                year: c.year,
                central: c.cumulative,
                best: sensitivityData.best[i].cumulative,
                worst: sensitivityData.worst[i].cumulative,
                bandBase: sensitivityData.worst[i].cumulative,
                bandWidth: sensitivityData.best[i].cumulative - sensitivityData.worst[i].cumulative,
              }))} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" />
                <XAxis dataKey="year" tick={{ fill: '#8e8e93', fontSize: 12 }} />
                <YAxis tick={{ fill: '#8e8e93', fontSize: 12 }} tickFormatter={v => `£${(v / 1e6).toFixed(0)}M`} />
                <Tooltip
                  contentStyle={{ ...TOOLTIP_STYLE }}
                  formatter={(v) => [`£${(v / 1e6).toFixed(1)}M`]}
                />
                <ReferenceLine y={0} stroke="#636366" strokeDasharray="3 3" />
                <Area dataKey="bandBase" stackId="band" fill="transparent" stroke="none" />
                <Area dataKey="bandWidth" stackId="band" fill="rgba(10, 132, 255, 0.1)" stroke="none" />
                <Line dataKey="best" name="Best case" stroke="#30d158" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
                <Line dataKey="central" name="Central case" stroke="#0a84ff" strokeWidth={2} dot={{ fill: '#0a84ff', r: 3 }} />
                <Line dataKey="worst" name="Worst case" stroke="#ff453a" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
                <Legend />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="confidence-band-note">
              Shaded area shows the range between best and worst case scenarios.
              Central case uses 75% savings realisation with no cost overrun.
            </p>
          </div>

          {/* Tornado diagram */}
          {tornadoData && tornadoData.length > 0 && (
            <>
              <h3 style={{ marginTop: '1.5rem' }}><BarChart3 size={16} /> What Drives the Result? (Tornado Diagram)</h3>
              <p className="tornado-explanation">
                Each bar shows how much the 10-year NPV changes when a single assumption is varied
                from low to high, while holding all other assumptions at their central values.
                The widest bars represent the most influential assumptions.
              </p>
              <div className="lgr-chart-card">
                <ResponsiveContainer width="100%" height={Math.max(200, tornadoData.length * 50 + 60)}>
                  <BarChart
                    data={tornadoData.map(t => ({
                      label: t.label,
                      downside: (Math.min(t.lowNPV, t.highNPV) - t.baseNPV) / 1e6,
                      upside: (Math.max(t.lowNPV, t.highNPV) - t.baseNPV) / 1e6,
                    }))}
                    layout="vertical"
                    margin={{ top: 5, right: 30, bottom: 5, left: 150 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" />
                    <XAxis type="number" tick={{ fill: '#8e8e93', fontSize: 12 }}
                      tickFormatter={v => `${v >= 0 ? '+' : ''}£${v.toFixed(0)}M`} />
                    <YAxis type="category" dataKey="label" width={140} tick={{ fill: '#e5e5e7', fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ ...TOOLTIP_STYLE }}
                      formatter={(v) => [`${v >= 0 ? '+' : ''}£${v.toFixed(0)}M`]}
                    />
                    <ReferenceLine x={0} stroke="#636366" strokeDasharray="3 3" />
                    <Bar dataKey="downside" name="Downside" fill="#ff453a" stackId="tornado" />
                    <Bar dataKey="upside" name="Upside" fill="#30d158" stackId="tornado" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </section>
      )}

      {/* Council Tax Harmonisation */}
      {budgetModel?.council_tax_harmonisation && (
        <section className="lgr-section" id="lgr-council-tax">
          <h2><PoundSterling size={20} /> Council Tax Harmonisation</h2>
          <p className="section-desc">
            What happens to your council tax when councils merge. Each new unitary replaces the district + county
            elements with a single harmonised Band D rate. Police and fire precepts (£340-£380) are unchanged.
            The bars below show each council&apos;s <strong>current combined rate</strong> (district + LCC county, 2025/26)
            vs the new harmonised rate.
          </p>

          <div className="handover-model-tabs">
            {lgrData.proposed_models.map((model, idx) => (
              <button
                key={model.id}
                className={`handover-tab ${(selectedModel || lgrData.proposed_models[0]?.id) === model.id ? 'active' : ''}`}
                onClick={() => setSelectedModel(model.id)}
                style={{ '--tab-color': MODEL_COLORS[idx] }}
              >
                {model.short_name}
              </button>
            ))}
          </div>

          {(() => {
            const activeModelId = selectedModel || lgrData.proposed_models[0]?.id
            const ctData = budgetModel.council_tax_harmonisation[activeModelId]
            if (!ctData) return null
            const activeProposal = lgrData.proposed_models.find(m => m.id === activeModelId)

            return (
              <div className="ct-harmonisation-content animate-fade-in">
                {/* CCN vs AI DOGE savings for this model */}
                {activeProposal && (
                  <div className="ct-savings-comparison">
                    <div className="ct-savings-item doge">
                      <span className="ct-savings-label"><Brain size={14} /> AI DOGE realistic savings</span>
                      <span className={`ct-savings-value ${(activeProposal.doge_annual_savings || 0) >= 0 ? 'text-green' : 'text-red'}`}>
                        {(activeProposal.doge_annual_savings || 0) >= 0
                          ? `${formatCurrency(activeProposal.doge_annual_savings, true)}/yr`
                          : `Costs ${formatCurrency(Math.abs(activeProposal.doge_annual_savings), true)}/yr MORE`
                        }
                      </span>
                    </div>
                    <div className="ct-savings-item gov">
                      <span className="ct-savings-label"><BookOpen size={14} /> Government (CCN/PwC)</span>
                      <span className={`ct-savings-value ${activeProposal.ccn_annual_savings == null ? 'text-secondary' : activeProposal.ccn_annual_savings >= 0 ? 'text-green' : 'text-red'}`}>
                        {activeProposal.ccn_annual_savings == null
                          ? 'Not modelled'
                          : activeProposal.ccn_annual_savings >= 0
                            ? `${formatCurrency(activeProposal.ccn_annual_savings, true)}/yr`
                            : `Costs ${formatCurrency(Math.abs(activeProposal.ccn_annual_savings), true)}/yr MORE`
                        }
                      </span>
                    </div>
                  </div>
                )}

                {ctData.authorities.map((auth, ai) => {
                  const isMine = auth.councils.some(c => c.council_id === councilId)
                  return (
                    <div key={ai} className={`ct-authority-card ${isMine ? 'mine' : ''}`}>
                      <div className="ct-authority-header">
                        <h3>{auth.name}</h3>
                        <div className="ct-harmonised-rate">
                          <span className="ct-rate-value">£{auth.harmonised_band_d.toFixed(2)}</span>
                          <span className="ct-rate-label">New harmonised Band D (from 2028)</span>
                        </div>
                      </div>

                      <div className="ct-bar-chart">
                        <div className="ct-bar-header">
                          <span className="ct-bar-header-label">Council (current combined Band D)</span>
                          <span className="ct-bar-header-label">Change</span>
                        </div>
                        {auth.councils.map((c, ci) => {
                          const maxBandD = Math.max(...auth.councils.map(x => x.current_combined_element), auth.harmonised_band_d)
                          const currentPct = (c.current_combined_element / maxBandD) * 100
                          const harmonisedPct = (auth.harmonised_band_d / maxBandD) * 100
                          const isCurrentCouncil = c.council_id === councilId

                          return (
                            <div key={ci} className={`ct-bar-row ${isCurrentCouncil ? 'current' : ''}`}>
                              <span className="ct-bar-name" title={`Current: £${c.current_combined_element.toFixed(2)} (district + LCC county)`}>
                                {c.name}
                                <span className="ct-bar-amount">£{c.current_combined_element.toFixed(0)}</span>
                              </span>
                              <div className="ct-bar-track">
                                <div
                                  className={`ct-bar-fill ${c.winner ? 'falls' : 'rises'}`}
                                  style={{ width: `${currentPct}%` }}
                                />
                                <div
                                  className="ct-harmonised-line"
                                  style={{ left: `${harmonisedPct}%` }}
                                />
                              </div>
                              <span className={`ct-bar-delta ${Math.round(c.delta) === 0 ? 'text-secondary' : c.winner ? 'text-green' : 'text-red'}`}>
                                {Math.round(c.delta) === 0 ? '±£0' : c.delta > 0 ? `+£${Math.round(c.delta)}/yr` : `−£${Math.abs(Math.round(c.delta))}/yr`}
                              </span>
                            </div>
                          )
                        })}
                      </div>

                      <div className="ct-legend">
                        <span className="ct-legend-item"><span className="ct-legend-dot falls" /> Bill falls</span>
                        <span className="ct-legend-item"><span className="ct-legend-dot rises" /> Bill rises</span>
                        <span className="ct-legend-item"><span className="ct-legend-line" /> New harmonised rate</span>
                      </div>

                      {auth.lcc_ct_share > 0 && (
                        <p className="ct-note text-secondary">
                          Includes £{(auth.lcc_ct_share / 1e6).toFixed(1)}M share of LCC county services
                          (pro-rata by tax base). Total CT requirement: {formatCurrency(auth.total_ct_requirement, true)}.
                        </p>
                      )}
                    </div>
                  )
                })}

                <div className="ct-explainer">
                  <h4><AlertTriangle size={14} /> How harmonisation works</h4>
                  <p>
                    Today, district council taxpayers pay two main elements: their <strong>district council</strong> (£170-£364 Band D)
                    plus the <strong>Lancashire County Council</strong> precept (£{ctData.lcc_band_d_element?.toFixed(0) || '1,736'} Band D).
                    Combined, these range from about £1,900 to £2,100 depending on your district.
                    After LGR (from April 2028), these two elements merge into a single unitary rate — the <strong>harmonised rate</strong>,
                    which is a weighted average of all constituent councils.
                    Councils whose current combined rate is above the average see their bill fall;
                    those below see it rise. Police and fire precepts (£340-£380) are unchanged.
                    Use the <Link to="/lgr-calculator">LGR Cost Calculator</Link> for your specific postcode and council tax band.
                  </p>
                </div>
              </div>
            )
          })()}
        </section>
      )}

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

      {/* Financial Handover Dashboard */}
      {Object.keys(modelFinancials).length > 0 && (
        <section className="lgr-section" id="lgr-handover">
          <h2><PoundSterling size={20} /> Financial Handover Dashboard</h2>
          <p className="section-desc">
            What each proposed successor authority would inherit — aggregated budgets, reserves and spending
            from constituent councils. Select a model to see the financial starting position.
          </p>

          <div className="handover-model-tabs">
            {lgrData.proposed_models.map((model, idx) => (
              <button
                key={model.id}
                className={`handover-tab ${selectedModel === model.id || (!selectedModel && idx === 0) ? 'active' : ''}`}
                onClick={() => setSelectedModel(model.id)}
                style={{ '--tab-color': MODEL_COLORS[idx] }}
              >
                {model.short_name}
              </button>
            ))}
          </div>

          {(() => {
            const activeModelId = selectedModel || lgrData.proposed_models[0]?.id
            const authorities = modelFinancials[activeModelId]
            const activeModel = lgrData.proposed_models.find(m => m.id === activeModelId)
            if (!authorities || !activeModel) return null

            const totalReserves = authorities.reduce((s, a) => s + a.reserves, 0)
            const totalSpend = authorities.reduce((s, a) => s + a.serviceExpenditure, 0)
            const totalPop = authorities.reduce((s, a) => s + a.population, 0)

            return (
              <div className="handover-content animate-fade-in">
                {/* Summary row */}
                <div className="handover-summary-row">
                  <div className="handover-stat">
                    <span className="hs-value">{formatCurrency(totalSpend, true)}</span>
                    <span className="hs-label">Combined service expenditure</span>
                  </div>
                  <div className="handover-stat">
                    <span className="hs-value">{formatCurrency(totalReserves, true)}</span>
                    <span className="hs-label">Combined reserves</span>
                  </div>
                  <div className="handover-stat">
                    <span className="hs-value">{formatNumber(totalPop)}</span>
                    <span className="hs-label">Total population</span>
                  </div>
                  <div className="handover-stat">
                    <span className="hs-value">{activeModel.num_authorities}</span>
                    <span className="hs-label">New authorities</span>
                  </div>
                </div>

                {/* Per-authority cards */}
                <div className="handover-authority-cards">
                  {authorities.map((auth, ai) => {
                    const isMine = auth.councils.includes(councilId)
                    const reservesPerHead = auth.population > 0 ? auth.reserves / auth.population : 0
                    const spendPerHead = auth.population > 0 ? auth.serviceExpenditure / auth.population : 0
                    const meetsThreshold = auth.population >= 500000

                    return (
                      <div key={ai} className={`handover-card ${isMine ? 'mine' : ''}`}>
                        <div className="handover-card-header">
                          <h4>
                            {auth.name}
                            {isMine && <span className="your-authority-badge"><MapPin size={12} /> Your authority</span>}
                          </h4>
                          <span className={`threshold-badge ${meetsThreshold ? 'meets' : 'below'}`}>
                            {meetsThreshold ? <Check size={12} /> : <XIcon size={12} />}
                            {meetsThreshold ? 'Above' : 'Below'} 500K
                          </span>
                        </div>

                        <div className="handover-metrics">
                          <div className="hm-row">
                            <span className="hm-label">Population</span>
                            <span className="hm-value">{formatNumber(auth.population)}</span>
                          </div>
                          <div className="hm-row">
                            <span className="hm-label">Service expenditure</span>
                            <span className="hm-value">{formatCurrency(auth.serviceExpenditure, true)}</span>
                          </div>
                          <div className="hm-row">
                            <span className="hm-label">Spend per head</span>
                            <span className="hm-value">{formatCurrency(spendPerHead)}</span>
                          </div>
                          <div className="hm-row">
                            <span className="hm-label">CT requirement</span>
                            <span className="hm-value">{formatCurrency(auth.ctRequirement, true)}</span>
                          </div>
                          <div className="hm-row">
                            <span className="hm-label">Total reserves</span>
                            <span className="hm-value">{formatCurrency(auth.reserves, true)}</span>
                          </div>
                          <div className="hm-row">
                            <span className="hm-label">Earmarked reserves</span>
                            <span className="hm-value">{formatCurrency(auth.earmarkedReserves, true)}</span>
                          </div>
                          <div className="hm-row">
                            <span className="hm-label">Unallocated reserves</span>
                            <span className="hm-value">{formatCurrency(auth.unallocatedReserves, true)}</span>
                          </div>
                          <div className="hm-row">
                            <span className="hm-label">Reserves per head</span>
                            <span className="hm-value">{formatCurrency(reservesPerHead)}</span>
                          </div>
                        </div>

                        <div className="handover-councils">
                          <span className="hm-label">Constituent councils ({auth.councils.length})</span>
                          <div className="council-list">
                            {auth.councilNames.map((name, ci) => (
                              <span key={ci} className={`council-chip ${auth.councils[ci] === councilId ? 'current' : ''}`}>
                                {auth.councils[ci] === councilId && <MapPin size={12} />}
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Budget composition from lgr_budget_model */}
                        {(() => {
                          const composition = budgetModel?.authority_composition?.[activeModelId]
                          const authComp = composition?.find(a => a.name === auth.name)
                          if (!authComp?.services || Object.keys(authComp.services).length === 0) return null

                          const SERVICE_SHORT = {
                            'Education services': 'Education',
                            'Adult Social Care': 'Adult social care',
                            'Childrens Social Care': "Children's social care",
                            'Public Health': 'Public health',
                            'Highways and transport services': 'Highways & transport',
                            'Housing services (GFRA only)': 'Housing',
                            'Cultural and related services': 'Culture & leisure',
                            'Environmental and regulatory services': 'Environment',
                            'Planning and development services': 'Planning',
                            'Central services': 'Central services',
                            'Other services': 'Other',
                          }
                          const SVC_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a', '#5ac8fa', '#ffd60a', '#ff6482', '#64d2ff', '#ac8e68', '#636366']
                          const svcEntries = Object.entries(authComp.services)
                            .map(([name, data]) => ({ name: SERVICE_SHORT[name] || name, ...data }))
                            .filter(s => s.net > 0)
                            .sort((a, b) => b.net - a.net)

                          const totalNet = svcEntries.reduce((s, e) => s + e.net, 0)

                          return (
                            <div className="budget-composition">
                              <span className="hm-label">Budget composition</span>
                              <div className="composition-bar">
                                {svcEntries.map((s, si) => (
                                  <div
                                    key={si}
                                    className="composition-segment"
                                    style={{
                                      width: `${(s.net / totalNet) * 100}%`,
                                      background: SVC_COLORS[si % SVC_COLORS.length],
                                    }}
                                    title={`${s.name}: ${formatCurrency(s.net, true)} (${s.pct}%)`}
                                  />
                                ))}
                              </div>
                              <div className="composition-legend">
                                {svcEntries.slice(0, 6).map((s, si) => (
                                  <span key={si} className="comp-legend-item">
                                    <span className="comp-dot" style={{ background: SVC_COLORS[si % SVC_COLORS.length] }} />
                                    {s.name} ({s.pct}%)
                                  </span>
                                ))}
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })}
                </div>

                {/* Comparison chart */}
                {authorities.length > 1 && (
                  <div className="handover-chart">
                    <h3>Spend per head by proposed authority</h3>
                    <ResponsiveContainer width="100%" height={Math.max(200, authorities.length * 60)}>
                      <BarChart
                        data={authorities.map((a, i) => ({
                          name: a.name,
                          spendPerHead: a.population > 0 ? Math.round(a.serviceExpenditure / a.population) : 0,
                          fill: MODEL_COLORS[i % MODEL_COLORS.length],
                        }))}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis type="number" tick={{ fill: '#8e8e93', fontSize: 12 }} tickFormatter={v => `£${v}`} />
                        <YAxis type="category" dataKey="name" tick={{ fill: '#8e8e93', fontSize: 12 }} width={130} />
                        <Tooltip formatter={(v) => [formatCurrency(v), 'Spend per head']} contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="spendPerHead" radius={[0, 6, 6, 0]}>
                          {authorities.map((_, i) => (
                            <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )
          })()}
        </section>
      )}

      {/* CCN Critique */}
      {lgrData.ccn_critique && (
        <section className="lgr-section" id="lgr-critique">
          <h2><BookOpen size={20} /> {lgrData.ccn_critique.title}</h2>
          <p className="section-desc">{lgrData.ccn_critique.summary}</p>

          {/* Side-by-side CCN vs DOGE chart — properly aligned by model */}
          {ccnChartData.length > 0 && dogeComparisonData.length > 0 && (() => {
            // Build a properly aligned comparison — CCN has different model ordering
            const ccnByModel = {}
            const ccnModels = lgrData.ccn_analysis?.models || []
            ccnModels.forEach(m => {
              const key = m.unitaries === 1 ? 'County UA' : `${m.unitaries} UA${m.unitaries > 1 ? 's' : ''}`
              ccnByModel[key] = m.annual_savings !== null ? m.annual_savings / 1e6 : null
            })
            const comparisonData = dogeComparisonData
              .filter(d => d.dogeSavings !== 0 || ccnByModel[d.name] != null)
              .map(d => ({
                name: d.name,
                ccnSavings: ccnByModel[d.name] ?? null,
                dogeSavings: d.dogeSavings,
              }))

            return (
              <div className="lgr-chart-card" style={{ marginBottom: '1rem' }}>
                <h3>CCN/PwC vs AI DOGE: Realistic Annual Savings</h3>
                <p className="chart-desc">
                  Comparing the CCN (county council lobby group) estimates with AI DOGE&apos;s independent analysis.
                  AI DOGE figures are <strong>realistic</strong> (net of ongoing costs, at 75% realisation).
                  CCN did not model the 5-UA option.
                </p>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={comparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" />
                    <XAxis dataKey="name" tick={{ fill: '#8e8e93', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#8e8e93', fontSize: 12 }} tickFormatter={v => `£${v}M`} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [
                      v != null ? `£${v.toFixed(1)}M/yr` : 'Not modelled',
                      name === 'ccnSavings' ? 'CCN/PwC estimate' : 'AI DOGE realistic'
                    ]} />
                    <ReferenceLine y={0} stroke="#636366" strokeDasharray="3 3" />
                    <Bar dataKey="ccnSavings" name="CCN/PwC" fill="#636366" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="dogeSavings" name="AI DOGE (realistic)" fill="#0a84ff" radius={[6, 6, 0, 0]} />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          })()}

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
                    <span className="savings-positive">
                      <TrendingDown size={14} /> AI DOGE: {formatCurrency(activeModelData.doge_annual_savings, true)}/yr realistic savings
                      {activeModelData.doge_annual_savings_gross && (
                        <span className="text-secondary" style={{ fontSize: '0.85em' }}> (gross: {formatCurrency(activeModelData.doge_annual_savings_gross, true)})</span>
                      )}
                    </span>
                  ) : (
                    <span className="savings-negative"><TrendingUp size={14} /> AI DOGE: {formatCurrency(Math.abs(activeModelData.doge_annual_savings), true)}/yr net cost</span>
                  )}
                </div>
              )}
              {activeModelData.ccn_annual_savings !== undefined && activeModelData.ccn_annual_savings !== null && (
                <div className="model-meta-item">
                  {activeModelData.ccn_annual_savings >= 0 ? (
                    <span className="savings-positive text-secondary">
                      <TrendingDown size={14} /> Gov (CCN/PwC): {formatCurrency(activeModelData.ccn_annual_savings, true)}/yr
                    </span>
                  ) : (
                    <span className="savings-negative text-secondary">
                      <TrendingUp size={14} /> Gov (CCN/PwC): Costs {formatCurrency(Math.abs(activeModelData.ccn_annual_savings), true)}/yr MORE
                    </span>
                  )}
                </div>
              )}
              {activeModelData.doge_payback_years && (
                <div className="model-meta-item"><Clock size={14} /> Payback: {activeModelData.doge_payback_years} years (realistic estimate)</div>
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
                    <FinancialHealthScorecard financials={fin} />
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

          {/* Revenue Risk & Service Demand Analysis */}
          {activeFinancials.some(f => f.avgCollectionRate != null || f.avgDependencyRatio != null) && (
            <div className="lgr-risk-analysis">
              <h3><AlertTriangle size={16} /> Revenue Risk & Service Demand</h3>
              <p className="chart-desc">Identifies financial risks each proposed authority would inherit from constituent councils.</p>
              <div className="risk-cards-grid">
                {activeFinancials.map((fin, i) => {
                  const hasCollection = fin.avgCollectionRate != null
                  const hasDependency = fin.avgDependencyRatio != null
                  const hasReserves = fin.reservesMonths != null

                  // Revenue at risk: gap between actual and 97% target × net collectable debit (estimated)
                  const revenueRisk = hasCollection && fin.avgCollectionRate < 97 && fin.ctRequirement > 0
                    ? Math.round(fin.ctRequirement * (97 - fin.avgCollectionRate) / 100)
                    : 0

                  // Service demand pressure from elderly population
                  const elderlyDemand = hasDependency && fin.avgElderlyPct > 20
                    ? 'high' : hasDependency && fin.avgElderlyPct > 18 ? 'moderate' : 'low'

                  return (
                    <div key={i} className="risk-card">
                      <div className="risk-card-header">
                        <div className="authority-color-bar" style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                        <h4>{fin.name}</h4>
                      </div>
                      <div className="risk-metrics">
                        {hasCollection && (
                          <div className="risk-metric">
                            <span className="risk-metric-label">Collection rate</span>
                            <span className={`risk-metric-value ${fin.avgCollectionRate >= 96 ? 'good' : fin.avgCollectionRate >= 94 ? 'warning' : 'danger'}`}>
                              {fin.avgCollectionRate.toFixed(1)}%
                            </span>
                            {fin.councilsBelowTarget?.length > 0 && (
                              <span className="risk-flag">
                                <AlertTriangle size={10} /> {fin.councilsBelowTarget.length} council{fin.councilsBelowTarget.length > 1 ? 's' : ''} below 94%
                              </span>
                            )}
                          </div>
                        )}
                        {revenueRisk > 0 && (
                          <div className="risk-metric">
                            <span className="risk-metric-label">Revenue at risk (vs 97% target)</span>
                            <span className="risk-metric-value danger">{formatCurrency(revenueRisk, true)}/yr</span>
                          </div>
                        )}
                        {fin.totalUncollected > 0 && (
                          <div className="risk-metric">
                            <span className="risk-metric-label">Current uncollected CT</span>
                            <span className="risk-metric-value warning">{formatCurrency(fin.totalUncollected, true)}</span>
                          </div>
                        )}
                        {hasDependency && (
                          <div className="risk-metric">
                            <span className="risk-metric-label">Dependency ratio</span>
                            <span className={`risk-metric-value ${fin.avgDependencyRatio < 60 ? 'good' : fin.avgDependencyRatio < 65 ? 'warning' : 'danger'}`}>
                              {fin.avgDependencyRatio}%
                            </span>
                            <span className="risk-detail">
                              {fin.avgElderlyPct}% elderly, {fin.avgYouthPct}% youth
                              {elderlyDemand === 'high' && <span className="demand-flag high"> — High social care demand</span>}
                              {elderlyDemand === 'moderate' && <span className="demand-flag moderate"> — Moderate social care demand</span>}
                            </span>
                          </div>
                        )}
                        {hasReserves && (
                          <div className="risk-metric">
                            <span className="risk-metric-label">Reserves buffer</span>
                            <span className={`risk-metric-value ${fin.reservesMonths >= 6 ? 'good' : fin.reservesMonths >= 3 ? 'warning' : 'danger'}`}>
                              {fin.reservesMonths} months of spend
                            </span>
                            {fin.reservesDirection && fin.reservesDirection !== 'unknown' && (
                              <span className="risk-detail">
                                Trend: {fin.reservesDirection === 'growing' ? '📈 Growing' : fin.reservesDirection === 'declining' ? '📉 Declining' : '➡️ Stable'}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="risk-methodology">
                <p>Revenue at risk = gap between current collection rate and 97% national target × council tax requirement.
                  Dependency ratio measures dependents (under 16 + over 65) per 100 working-age residents.
                  Reserves buffer shows months of service expenditure covered by total reserves.</p>
              </div>
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
          All model assumptions are published above for scrutiny. All underlying data is public and verifiable.
          Savings figures represent <strong>realistic estimates</strong>: gross savings minus ongoing costs of new authorities,
          at 75% realisation rate (based on E&amp;Y 2016 evidence from Durham, Wiltshire and Buckinghamshire reorganisations).
          Transition costs include a 1.25× overrun factor based on NAO evidence.
          These are independent estimates — not commissioned by any council, lobby group or political party.
        </p>
      </section>
    </div>
  )
}

export default LGRTracker
