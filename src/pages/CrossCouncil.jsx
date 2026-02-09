import { useEffect, useMemo } from 'react'
import { Building, TrendingUp, Users, PoundSterling, Shield, BarChart3, AlertTriangle } from 'lucide-react'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend } from 'recharts'
import { formatCurrency } from '../utils/format'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import './CrossCouncil.css'

const COUNCIL_COLORS = {
  burnley: '#0a84ff',
  hyndburn: '#ff9f0a',
  pendle: '#30d158',
  rossendale: '#bf5af2',
}

const TOOLTIP_STYLE = {
  background: 'var(--card-bg, #1c1c1e)',
  border: '1px solid var(--border-color, #333)',
  borderRadius: '8px',
}

function CrossCouncil() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const councilId = config.council_id || 'council'

  const { data, loading, error } = useData('/data/cross_council.json')
  const comparison = data

  const councils = comparison?.councils || []

  useEffect(() => {
    document.title = `Cross-Council Comparison | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  const current = useMemo(
    () => councils.find(c => c.council_name?.toLowerCase() === councilName.toLowerCase()) || councils[0],
    [councils, councilName]
  )

  // Spend per head data
  const spendPerHead = useMemo(() => councils.map(c => ({
    name: c.council_name,
    spend: Math.round((c.total_spend || 0) / (c.population || 1)),
    isCurrent: c.council_name === councilName,
  })).sort((a, b) => b.spend - a.spend), [councils, councilName])

  // Service expenditure comparison
  const serviceCategories = ['housing', 'cultural', 'environmental', 'planning', 'central', 'other']
  const serviceLabels = {
    housing: 'Housing',
    cultural: 'Cultural',
    environmental: 'Environmental',
    planning: 'Planning',
    central: 'Central',
    other: 'Other',
  }
  const serviceData = useMemo(() => serviceCategories.map(cat => {
    const row = { category: serviceLabels[cat] }
    councils.forEach(c => {
      row[c.council_id] = Math.round((c.service_expenditure?.[cat] || 0) / (c.population || 1))
    })
    return row
  }), [councils])

  // Transparency radar data
  const radarData = useMemo(() => [
    { metric: 'Dates', fullMark: 100 },
    { metric: 'Suppliers', fullMark: 100 },
    { metric: 'Departments', fullMark: 100 },
  ].map(item => {
    councils.forEach(c => {
      const t = c.transparency || {}
      if (item.metric === 'Dates') item[c.council_id] = t.has_dates || 0
      if (item.metric === 'Suppliers') item[c.council_id] = t.has_suppliers || 0
      if (item.metric === 'Departments') item[c.council_id] = t.has_departments || 0
    })
    return item
  }), [councils])

  // CEO pay comparison
  const payData = useMemo(() => councils
    .filter(c => c.pay?.ceo_midpoint)
    .map(c => ({
      name: c.council_name,
      salary: c.pay.ceo_midpoint,
      ratio: c.pay.ceo_to_median_ratio,
      isCurrent: c.council_name === councilName,
    }))
    .sort((a, b) => b.salary - a.salary), [councils, councilName])

  // Duplicate flagged value comparison
  const dupeData = useMemo(() => councils.map(c => ({
    name: c.council_name,
    value: c.duplicate_value || 0,
    count: c.duplicate_count || 0,
    isCurrent: c.council_name === councilName,
  })).sort((a, b) => b.value - a.value), [councils, councilName])

  if (loading) return <LoadingState message="Loading comparison data..." />
  if (error) return (
    <div className="page-error">
      <h2>Unable to load data</h2>
      <p>Please try refreshing the page.</p>
    </div>
  )
  if (!councils.length) return <div className="cross-page"><p>No cross-council comparison data available.</p></div>

  return (
    <div className="cross-page animate-fade-in">
      <header className="cross-hero">
        <div className="hero-content">
          <h1>Cross-Council Comparison</h1>
          <p className="hero-subtitle">
            Side-by-side performance metrics for {councils.map(c => c.council_name).join(', ')} councils.
            {councilName} is highlighted throughout.
          </p>
        </div>
      </header>

      {/* Overview Cards */}
      <section className="cross-overview">
        <h2><Building size={22} /> Council Overview</h2>
        <div className="overview-grid">
          {councils.map(c => (
            <div key={c.council_id} className={`overview-card ${c.council_name === councilName ? 'current' : ''}`}>
              <div className="overview-header" style={{ borderColor: COUNCIL_COLORS[c.council_id] }}>
                <h3>{c.council_name}</h3>
                {c.council_name === councilName && <span className="current-badge">You are here</span>}
              </div>
              <div className="overview-stats">
                <div className="ov-stat">
                  <span className="ov-value">{formatCurrency(c.total_spend, true)}</span>
                  <span className="ov-label">Total External Spend</span>
                </div>
                <div className="ov-stat">
                  <span className="ov-value">{c.total_records?.toLocaleString()}</span>
                  <span className="ov-label">Transactions</span>
                </div>
                <div className="ov-stat">
                  <span className="ov-value">{c.unique_suppliers?.toLocaleString()}</span>
                  <span className="ov-label">Unique Suppliers</span>
                </div>
                <div className="ov-stat">
                  <span className="ov-value">{c.population?.toLocaleString()}</span>
                  <span className="ov-label">Population</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Spend Per Head */}
      <section className="cross-section">
        <h2><PoundSterling size={22} /> Spend Per Head of Population</h2>
        <p className="section-intro">
          Total external payments divided by population. Higher isn't necessarily worse — it depends on what services are provided.
        </p>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={spendPerHead} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color, #333)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} />
              <YAxis tickFormatter={v => `£${v.toLocaleString()}`} tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} />
              <Tooltip
                formatter={(v) => [`£${v.toLocaleString()}`, 'Spend per head']}
                contentStyle={TOOLTIP_STYLE}
              />
              <Bar dataKey="spend" radius={[4, 4, 0, 0]}>
                {spendPerHead.map((entry, i) => (
                  <Cell key={i} fill={entry.isCurrent ? '#0a84ff' : '#48484a'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Service Expenditure Per Head */}
      <section className="cross-section">
        <h2><BarChart3 size={22} /> Service Expenditure Per Head (£'000s)</h2>
        <p className="section-intro">
          GOV.UK revenue outturn data (2024-25) divided by population, showing how each council allocates spending across service categories.
        </p>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={serviceData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color, #333)" />
              <XAxis dataKey="category" tick={{ fill: 'var(--text-secondary, #999)', fontSize: 11 }} />
              <YAxis tickFormatter={v => `£${v}`} tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} />
              <Tooltip
                formatter={(v, name) => {
                  const label = councils.find(c => c.council_id === name)?.council_name || name
                  return [`£${v.toLocaleString()}k per head`, label]
                }}
                contentStyle={TOOLTIP_STYLE}
              />
              <Legend formatter={(value) => councils.find(c => c.council_id === value)?.council_name || value} />
              {councils.map(c => (
                <Bar key={c.council_id} dataKey={c.council_id} fill={COUNCIL_COLORS[c.council_id]} radius={[2, 2, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Transparency Scorecard */}
      <section className="cross-section">
        <h2><Shield size={22} /> Transparency Scorecard</h2>
        <p className="section-intro">
          Percentage of spending records that include key fields. 100% means every transaction has the field populated.
        </p>
        <div className="scorecard-grid">
          {councils.map(c => {
            const t = c.transparency || {}
            return (
              <div key={c.council_id} className={`scorecard-card ${c.council_name === councilName ? 'current' : ''}`}>
                <h3 style={{ color: COUNCIL_COLORS[c.council_id] }}>{c.council_name}</h3>
                <div className="score-bars">
                  <ScoreBar label="Dates" value={t.has_dates} />
                  <ScoreBar label="Suppliers" value={t.has_suppliers} />
                  <ScoreBar label="Departments" value={t.has_departments} />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* CEO Pay Comparison */}
      {payData.length > 0 && (
        <section className="cross-section">
          <h2><Users size={22} /> Chief Executive Pay</h2>
          <p className="section-intro">
            CEO salary midpoints and pay ratios from published Pay Policy Statements.
          </p>
          <div className="comparison-table-wrapper">
            <table className="cross-table" role="table" aria-label="Cross-council CEO pay comparison">
              <thead>
                <tr>
                  <th scope="col">Council</th>
                  <th scope="col">CEO Salary Midpoint</th>
                  <th scope="col">CEO:Median Ratio</th>
                  <th scope="col">Median Employee Pay</th>
                </tr>
              </thead>
              <tbody>
                {councils.filter(c => c.pay).map(c => (
                  <tr key={c.council_id} className={c.council_name === councilName ? 'highlight-row' : ''}>
                    <td className="council-name">{c.council_name}{c.council_name === councilName ? ' ★' : ''}</td>
                    <td>{formatCurrency(c.pay.ceo_midpoint)}</td>
                    <td>{c.pay.ceo_to_median_ratio ? `${c.pay.ceo_to_median_ratio}:1` : '—'}</td>
                    <td>{c.pay.median_employee_salary ? formatCurrency(c.pay.median_employee_salary) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Duplicate Payments Flagged */}
      <section className="cross-section">
        <h2><AlertTriangle size={22} /> Potential Duplicate Payments</h2>
        <p className="section-intro">
          Same-day payments to the same supplier for the same amount. These are flagged for investigation — not all are errors.
        </p>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dupeData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color, #333)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} />
              <YAxis tickFormatter={v => `£${(v / 1_000_000).toFixed(1)}M`} tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} />
              <Tooltip
                formatter={(v) => [formatCurrency(v), 'Flagged value']}
                contentStyle={TOOLTIP_STYLE}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {dupeData.map((entry, i) => (
                  <Cell key={i} fill={entry.isCurrent ? '#ff453a' : '#48484a'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="dupe-stats">
          {councils.map(c => (
            <div key={c.council_id} className="dupe-stat">
              <span className="dupe-council" style={{ color: COUNCIL_COLORS[c.council_id] }}>{c.council_name}</span>
              <span className="dupe-count">{(c.duplicate_count || 0).toLocaleString()} flagged transactions</span>
              <span className="dupe-value">{formatCurrency(c.duplicate_value || 0)} total value</span>
            </div>
          ))}
        </div>
      </section>

      {/* Methodology Note */}
      <section className="cross-section">
        <div className="methodology-note">
          <Shield size={18} />
          <div>
            <h4>Methodology</h4>
            <p>
              All data is sourced from publicly available council documents including transparency returns,
              GOV.UK revenue outturn data, and Pay Policy Statements. Spending figures cover external payments
              over £500 from {councils[0]?.financial_years?.[0] || '2021/22'} to {councils[0]?.financial_years?.slice(-1)[0] || '2025/26'}.
              Population figures from ONS mid-year estimates.
            </p>
            <p className="generated-date">Comparison generated: {comparison.generated}</p>
          </div>
        </div>
      </section>
    </div>
  )
}

function ScoreBar({ label, value }) {
  const pct = Math.round(value || 0)
  let color = '#30d158'
  if (pct < 80) color = '#ff9f0a'
  if (pct < 50) color = '#ff453a'

  return (
    <div className="score-bar-row">
      <span className="score-label">{label}</span>
      <div className="score-track">
        <div className="score-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="score-pct" style={{ color }}>{pct}%</span>
    </div>
  )
}

export default CrossCouncil
