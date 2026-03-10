import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell, Legend } from 'recharts'
import { AlertTriangle, TrendingDown, Users, BookOpen, GraduationCap, Shield, Home, Briefcase, ChevronDown, ChevronRight } from 'lucide-react'
import { TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE } from '../../utils/constants'
import { formatNumber, formatCurrency } from '../../utils/format'
import { computeDemographicFiscalProfile, computeEducationSENDExposure, computeAsylumCostImpact } from '../../utils/lgrModel'
import './LGRDemographicFiscalRisk.css'

const RISK_COLORS = { 'Structurally Deficit': '#ff453a', 'At Risk': '#ff9f0a', 'Viable': '#30d158', Unknown: '#636366' }
const AUTH_COLORS = ['#12B6CF', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a', '#64d2ff']

function ScoreGauge({ score, label, size = 80 }) {
  const color = score < 30 ? '#ff453a' : score < 50 ? '#ff9f0a' : '#30d158'
  const pct = Math.min(100, Math.max(0, score))
  return (
    <div className="dfr-gauge" aria-label={`${label}: ${score} out of 100`}>
      <svg width={size} height={size} viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <circle cx="40" cy="40" r="34" fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${pct * 2.14} ${214 - pct * 2.14}`}
          strokeDashoffset="53.5" strokeLinecap="round" />
        <text x="40" y="38" textAnchor="middle" fill={color} fontSize="18" fontWeight="700">{score}</text>
        <text x="40" y="52" textAnchor="middle" fill="#8e8e93" fontSize="8">/100</text>
      </svg>
      <span className="dfr-gauge-label">{label}</span>
    </div>
  )
}

function RiskBadge({ category }) {
  return (
    <span className="dfr-risk-badge" style={{ background: `${RISK_COLORS[category] || '#636366'}20`, color: RISK_COLORS[category] || '#636366', borderColor: RISK_COLORS[category] || '#636366' }}>
      {category}
    </span>
  )
}

export default function LGRDemographicFiscalRisk({ fiscalProfile, sendExposure, asylumImpact, multipliers, bradfordComparison, selectedModel }) {
  const [showResearch, setShowResearch] = useState(false)

  const profiles = useMemo(() => computeDemographicFiscalProfile(fiscalProfile, selectedModel), [fiscalProfile, selectedModel])
  const sendData = useMemo(() => computeEducationSENDExposure(sendExposure, multipliers, selectedModel), [sendExposure, multipliers, selectedModel])
  const asylumData = useMemo(() => computeAsylumCostImpact(asylumImpact, selectedModel), [asylumImpact, selectedModel])

  if (!profiles.length) return null

  // ── Chart data ──
  const fiscalScoreData = profiles.map((p, i) => ({
    authority: p.authority.replace('Lancashire', 'Lancs'),
    fiscal: p.fiscal_sustainability_score,
    demand: p.service_demand_pressure_score,
    fill: AUTH_COLORS[i % AUTH_COLORS.length],
  }))

  const ethnicData = profiles.map((p, i) => ({
    authority: p.authority.replace('Lancashire', 'Lancs'),
    'Pakistani/Bangladeshi': p.pakistani_bangladeshi_pct,
    'GRT/Roma': Math.round((p.grt_count + p.roma_count) / (p.population || 1) * 1000) / 10,
    'Black African/Caribbean': p.black_african_caribbean_pct,
    'Mixed Heritage': p.mixed_heritage_pct,
    Muslim: p.muslim_pct,
    fill: AUTH_COLORS[i % AUTH_COLORS.length],
  }))

  const economicData = profiles.map((p, i) => ({
    authority: p.authority.replace('Lancashire', 'Lancs'),
    'Employment Rate': p.employment_rate_pct,
    'No Qualifications': p.no_qualifications_pct,
    'Social Rented': p.social_rented_pct,
    'Inactive': p.economically_inactive_pct,
  }))

  const sendChartData = sendData.map((s, i) => ({
    authority: s.authority.replace('Lancashire', 'Lancs'),
    'SEND Rate': s.estimated_send_rate_pct,
    'EAL Pupils': s.estimated_eal_pupils,
    'DSG Deficit/Cap': Math.round(s.dsg_deficit_per_capita),
    rating: s.send_risk_rating,
  }))

  const collectionData = profiles.map((p, i) => ({
    authority: p.authority.replace('Lancashire', 'Lancs'),
    'Collection Rate': p.collection_rate_weighted,
    'Band D': p.band_d_weighted,
  }))

  const asylumChartData = asylumData.map((a, i) => ({
    authority: a.authority.replace('Lancashire', 'Lancs'),
    Current: a.current_seekers,
    '2028 (Central)': a.projected_2028?.central || 0,
    '2032 (Central)': a.projected_2032?.central || 0,
    cost: a.annual_cost_estimate,
  }))

  // Bradford/Oldham comparison
  const comparisonData = bradfordComparison ? [
    ...(profiles.map(p => ({
      name: p.authority.replace('Lancashire', 'Lancs'),
      type: 'Proposed',
      muslim_pct: p.muslim_pct,
      under_16_pct: p.under_16_pct || 0,
      collection: p.collection_rate_weighted,
      employment: p.employment_rate_pct,
    }))),
    ...(bradfordComparison.bradford ? [{
      name: 'Bradford', type: 'Precedent',
      muslim_pct: bradfordComparison.bradford.muslim_pct,
      under_16_pct: bradfordComparison.bradford.under_16_pct,
      collection: bradfordComparison.bradford.collection_rate_pct,
      employment: bradfordComparison.bradford.employment_rate_pct || 0,
    }] : []),
    ...(bradfordComparison.oldham ? [{
      name: 'Oldham', type: 'Precedent',
      muslim_pct: bradfordComparison.oldham.muslim_pct,
      under_16_pct: bradfordComparison.oldham.under_16_pct,
      collection: bradfordComparison.oldham.collection_rate_pct,
      employment: bradfordComparison.oldham.employment_rate_pct || 0,
    }] : []),
  ] : null

  return (
    <div className="dfr-section" role="region" aria-label="Demographic Fiscal Risk Analysis">
      {/* Scorecard Row */}
      <div className="dfr-scorecard-row">
        {profiles.map((p, i) => (
          <div key={p.authority} className="dfr-scorecard" style={{ borderLeftColor: AUTH_COLORS[i % AUTH_COLORS.length] }}>
            <div className="dfr-scorecard-header">
              <h4>{p.authority}</h4>
              <RiskBadge category={p.risk_category} />
            </div>
            <div className="dfr-scorecard-gauges">
              <ScoreGauge score={p.fiscal_sustainability_score} label="Fiscal" />
              <ScoreGauge score={p.service_demand_pressure_score} label="Demand" />
            </div>
            <div className="dfr-scorecard-stats">
              <span>Pop: {formatNumber(p.population)}</span>
              <span>Muslim: {p.muslim_pct.toFixed(1)}%</span>
              <span>SEND: {p.estimated_send_rate_pct.toFixed(1)}%</span>
              <span>Collection: {p.collection_rate_weighted.toFixed(1)}%</span>
            </div>
            {p.risk_factors.length > 0 && (
              <ul className="dfr-risk-factors">
                {p.risk_factors.slice(0, 3).map((f, j) => (
                  <li key={j}><AlertTriangle size={11} /> {f}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* Ethnic Composition Comparison */}
      <div className="dfr-chart-panel">
        <h3><Users size={16} /> Ethnic Composition by Authority</h3>
        <p className="dfr-chart-desc">Shows how each LGR model concentrates ethnic diversity. Higher Pakistani/Bangladeshi and GRT populations correlate with elevated SEND costs and school demand.</p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={ethnicData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="authority" tick={AXIS_TICK_STYLE} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis tick={AXIS_TICK_STYLE} unit="%" />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v) => `${v.toFixed(1)}%`} />
            <Bar dataKey="Pakistani/Bangladeshi" stackId="eth" fill="#ff9f0a" />
            <Bar dataKey="GRT/Roma" stackId="eth" fill="#ff453a" />
            <Bar dataKey="Black African/Caribbean" stackId="eth" fill="#bf5af2" />
            <Bar dataKey="Mixed Heritage" stackId="eth" fill="#64d2ff" />
            <Legend />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* SEND Exposure */}
      {sendChartData.length > 0 && (
        <div className="dfr-chart-panel">
          <h3><GraduationCap size={16} /> SEND Exposure by Authority</h3>
          <p className="dfr-chart-desc">Estimated SEND prevalence weighted by ethnic composition using DfE published rates. GRT pupils have 35% SEND rate vs 14.8% national average.</p>
          <div className="dfr-chart-row">
            <div className="dfr-chart-half">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={sendChartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="authority" tick={AXIS_TICK_STYLE} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={AXIS_TICK_STYLE} unit="%" domain={[14, 'auto']} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="SEND Rate" fill="#ff9f0a">
                    {sendChartData.map((d, i) => (
                      <Cell key={i} fill={d.rating === 'CRITICAL' ? '#ff453a' : d.rating === 'HIGH' ? '#ff9f0a' : '#30d158'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="dfr-chart-half">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={sendChartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="authority" tick={AXIS_TICK_STYLE} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={AXIS_TICK_STYLE} unit="£" />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v) => `£${v}`} />
                  <Bar dataKey="DSG Deficit/Cap" fill="#ff453a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {multipliers?.send_prevalence_by_group && (
            <div className="dfr-multiplier-table">
              <h4>SEND Prevalence by Ethnic Group (DfE 2023)</h4>
              <table>
                <thead><tr><th>Group</th><th>SEND Rate</th><th>Source</th></tr></thead>
                <tbody>
                  {Object.entries(multipliers.send_prevalence_by_group).map(([k, v]) => (
                    <tr key={k}>
                      <td>{k.replace(/_/g, ' ')}</td>
                      <td style={{ color: v.rate_pct > 20 ? '#ff453a' : v.rate_pct > 16 ? '#ff9f0a' : '#30d158' }}>{v.rate_pct}%</td>
                      <td className="dfr-source-cell">{v.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Council Tax & Employment */}
      <div className="dfr-chart-panel">
        <h3><Briefcase size={16} /> Employment & Council Tax by Authority</h3>
        <p className="dfr-chart-desc">Employment rate, qualifications, and council tax collection — key fiscal capacity indicators.</p>
        <div className="dfr-chart-row">
          <div className="dfr-chart-half">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={economicData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="authority" tick={AXIS_TICK_STYLE} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={AXIS_TICK_STYLE} unit="%" />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => `${v.toFixed(1)}%`} />
                <Bar dataKey="Employment Rate" fill="#30d158" />
                <Bar dataKey="No Qualifications" fill="#ff9f0a" />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="dfr-chart-half">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={collectionData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="authority" tick={AXIS_TICK_STYLE} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={AXIS_TICK_STYLE} unit="%" domain={[90, 100]} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => `${v.toFixed(1)}%`} />
                <Bar dataKey="Collection Rate" fill="#12B6CF">
                  {collectionData.map((d, i) => (
                    <Cell key={i} fill={d['Collection Rate'] < 94 ? '#ff453a' : d['Collection Rate'] < 96 ? '#ff9f0a' : '#30d158'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Asylum Seekers */}
      {asylumChartData.some(a => a.Current > 0) && (
        <div className="dfr-chart-panel">
          <h3><Shield size={16} /> Asylum Dispersal Impact</h3>
          <p className="dfr-chart-desc">Current asylum seekers supported and realistic projections (decelerated growth: 10-15% pa 2025-28, 5% pa 2028-32).</p>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={asylumChartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="authority" tick={AXIS_TICK_STYLE} interval={0} angle={-20} textAnchor="end" height={50} />
              <YAxis tick={AXIS_TICK_STYLE} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Bar dataKey="Current" fill="#12B6CF" />
              <Bar dataKey="2028 (Central)" fill="#ff9f0a" />
              <Bar dataKey="2032 (Central)" fill="#ff453a" />
              <Legend />
            </BarChart>
          </ResponsiveContainer>
          <div className="dfr-asylum-cost-row">
            {asylumChartData.filter(a => a.cost > 0).map(a => (
              <div key={a.authority} className="dfr-asylum-cost-card">
                <span className="dfr-asylum-auth">{a.authority}</span>
                <span className="dfr-asylum-amount">{formatCurrency(a.cost)}</span>
                <span className="dfr-asylum-label">Estimated annual cost</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bradford/Oldham Comparison */}
      {comparisonData && (
        <div className="dfr-chart-panel dfr-comparison">
          <h3><TrendingDown size={16} /> Bradford & Oldham Precedent Comparison</h3>
          <p className="dfr-chart-desc">East Lancashire's demographic trajectory mirrors Bradford circa 2010. Post-industrial towns with concentrated demographic change, reduced tax base, and rising service demand followed a predictable path to fiscal unsustainability.</p>
          <div className="dfr-comparison-table-wrap">
            <table className="dfr-comparison-table">
              <thead>
                <tr>
                  <th>Authority</th>
                  <th>Muslim %</th>
                  <th>Under-16 %</th>
                  <th>Collection %</th>
                  <th>Employment %</th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.map(d => (
                  <tr key={d.name} className={d.type === 'Precedent' ? 'dfr-precedent-row' : ''}>
                    <td className="dfr-name-cell">
                      {d.name}
                      {d.type === 'Precedent' && <span className="dfr-precedent-badge">Precedent</span>}
                    </td>
                    <td style={{ color: d.muslim_pct > 20 ? '#ff453a' : d.muslim_pct > 10 ? '#ff9f0a' : '#8e8e93' }}>{d.muslim_pct.toFixed(1)}%</td>
                    <td>{d.under_16_pct.toFixed(1)}%</td>
                    <td style={{ color: d.collection < 94 ? '#ff453a' : '#8e8e93' }}>{d.collection.toFixed(1)}%</td>
                    <td>{d.employment.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bradfordComparison.east_lancs_comparison?.trajectory_narrative && (
            <div className="dfr-trajectory-note">
              <AlertTriangle size={14} />
              <p>{bradfordComparison.east_lancs_comparison.trajectory_narrative}</p>
            </div>
          )}
        </div>
      )}

      {/* Academic Research Panel */}
      <div className="dfr-research-panel">
        <button className="dfr-research-toggle" onClick={() => setShowResearch(!showResearch)} aria-expanded={showResearch}>
          <BookOpen size={16} />
          Academic Research & Sources
          {showResearch ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {showResearch && multipliers?.academic_sources && (
          <div className="dfr-research-list">
            {(Array.isArray(multipliers.academic_sources) ? multipliers.academic_sources : Object.values(multipliers.academic_sources)).map((s, i) => (
              <div key={i} className="dfr-research-item">
                <strong>{s.title || s.name}</strong> ({s.year || s.date || ''})
                {s.author && <span className="dfr-research-author"> — {s.author}</span>}
                {(s.key_finding || s.finding) && <p className="dfr-research-finding">{s.key_finding || s.finding}</p>}
                {s.relevance && <p className="dfr-research-relevance">{s.relevance}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
