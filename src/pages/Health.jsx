import { useMemo, useState, useEffect, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useData } from '../hooks/useData'
import { ChartCard } from '../components/ui/ChartCard'
import { StatCard } from '../components/ui/StatCard'
import { generateHealthTalkingPoints } from '../utils/strategyEngine'
import CollapsibleSection from '../components/CollapsibleSection'
import GaugeChart from '../components/ui/GaugeChart'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { CHART_COLORS, TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE, CHART_ANIMATION } from '../utils/constants'
import './Health.css'

const ChoroplethMap = lazy(() => import('../components/ChoroplethMap'))

const HEALTH_COLORS = ['#22c55e', '#86efac', '#fbbf24', '#f87171', '#dc2626']
const HEALTH_LABELS = ['Very good', 'Good', 'Fair', 'Bad', 'Very bad']

export default function Health() {
  const config = useCouncilConfig()
  const { data: health, loading, error } = useData('/data/health.json')
  const { data: wardBoundaries } = useData(
    config.data_sources?.ward_boundaries ? '/data/ward_boundaries.json' : null
  )

  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedWard, setSelectedWard] = useState('')
  const [mapMetric, setMapMetric] = useState('good_health')

  useEffect(() => {
    if (health) {
      document.title = `Health | ${config.council_name} Council Transparency`
    }
  }, [health, config.council_name])

  // Pre-select ward from URL param (e.g. /health?ward=Hapton)
  useEffect(() => {
    const wardParam = searchParams.get('ward')
    if (wardParam && !selectedWard) {
      setSelectedWard(wardParam)
      setActiveTab('wards')
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sorted wards for table + selector
  const sortedWards = useMemo(() => {
    if (!health?.census?.wards) return []
    return Object.entries(health.census.wards)
      .map(([code, data]) => ({ code, ...data }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [health])

  // Ward detail
  const wardDetail = useMemo(() => {
    if (!selectedWard || !health?.census?.wards) return null
    const entry = Object.entries(health.census.wards).find(
      ([, d]) => d.name === selectedWard
    )
    return entry ? { code: entry[0], ...entry[1] } : null
  }, [selectedWard, health])

  // Health chart data
  const healthChartData = useMemo(() => {
    const gh = health?.census?.council_totals?.general_health
    if (!gh) return []
    return HEALTH_LABELS.map(label => {
      const count = Object.entries(gh).find(
        ([k]) => k.toLowerCase().includes(label.toLowerCase())
      )?.[1] || 0
      return { name: label, value: count }
    }).filter(d => d.value > 0)
  }, [health])

  // Disability chart data
  const disabilityData = useMemo(() => {
    const dis = health?.census?.council_totals?.disability
    if (!dis) return []
    return Object.entries(dis)
      .filter(([, v]) => typeof v === 'number' && v > 0)
      .map(([k, v]) => ({ name: k.replace('Day-to-day activities ', '').replace('Has long term ', 'Long term '), value: v }))
  }, [health])

  // Indicator comparison data
  const indicatorComparison = useMemo(() => {
    if (!health?.indicators) return []
    return Object.entries(health.indicators)
      .filter(([, v]) => v.value != null && v.england_value != null)
      .map(([key, v]) => ({
        name: v.label?.replace(/\(.*\)/, '').trim() || key,
        value: v.value,
        england: v.england_value,
        unit: v.unit,
        compared: v.compared_to_england,
      }))
  }, [health])

  // Strategy talking points for selected ward
  const healthTalkingPoints = useMemo(() => {
    if (!selectedWard || !health) return []
    return generateHealthTalkingPoints(selectedWard, health)
  }, [selectedWard, health])

  // Map metric values for choropleth
  const mapValues = useMemo(() => {
    if (!health?.census?.wards) return {}
    const result = {}
    for (const [code, ward] of Object.entries(health.census.wards)) {
      const gh = ward.general_health || {}
      const dis = ward.disability || {}
      const total_gh = Object.values(gh).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0)
      const total_dis = Object.values(dis).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0)

      if (mapMetric === 'good_health') {
        const good = Object.entries(gh).filter(([k]) => k.toLowerCase().includes('good')).reduce((s, [, v]) => s + v, 0)
        result[code] = total_gh ? Math.round(good / total_gh * 1000) / 10 : 0
      } else if (mapMetric === 'disability') {
        const limited = Object.entries(dis).filter(([k]) => k.toLowerCase().includes('limited')).reduce((s, [, v]) => s + v, 0)
        result[code] = total_dis ? Math.round(limited / total_dis * 1000) / 10 : 0
      }
    }
    return result
  }, [health, mapMetric])

  if (loading) return <div className="loading-state"><div className="loading-spinner" /></div>
  if (error) return <div className="error-state"><p>Error loading health data. Please try again later.</p></div>
  if (!health) return <div className="empty-state"><p>No health data available for this council.</p></div>

  const { indicators = {}, summary = {}, census = {} } = health
  const wardCount = Object.keys(census.wards || {}).length
  const indicatorCount = Object.keys(indicators).length

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'wards', label: 'Ward Analysis' },
    { id: 'indicators', label: 'Indicators' },
  ]

  const pct1 = (v) => v != null ? `${v.toFixed(1)}%` : '—'

  return (
    <div className="health-page">
      {/* Hero */}
      <div className="health-hero">
        <h1>Health & Wellbeing</h1>
        <p className="health-hero-subtitle">
          {indicatorCount} public health indicators tracked across {wardCount} wards
        </p>
      </div>

      {/* Summary stats */}
      <div className="health-summary-grid">
        <StatCard
          label="Life Expectancy (M)"
          value={summary.life_expectancy_male != null ? summary.life_expectancy_male.toFixed(1) : '—'}
          unit="years"
          subtitle={indicators.life_expectancy_male?.compared_to_england || ''}
        />
        <StatCard
          label="Life Expectancy (F)"
          value={summary.life_expectancy_female != null ? summary.life_expectancy_female.toFixed(1) : '—'}
          unit="years"
          subtitle={indicators.life_expectancy_female?.compared_to_england || ''}
        />
        <StatCard
          label="Obesity"
          value={summary.obesity_prevalence != null ? pct1(summary.obesity_prevalence) : '—'}
          subtitle={indicators.obesity_prevalence?.compared_to_england || ''}
        />
        <StatCard
          label="Good Health"
          value={summary.good_health_pct != null ? pct1(summary.good_health_pct) : '—'}
          subtitle="Census 2021"
        />
        <StatCard
          label="Disability"
          value={summary.disability_pct != null ? pct1(summary.disability_pct) : '—'}
          subtitle="Census 2021"
        />
        <StatCard
          label="Unpaid Carers"
          value={summary.unpaid_carers_pct != null ? pct1(summary.unpaid_carers_pct) : '—'}
          subtitle="Census 2021"
        />
      </div>

      {/* Tabs */}
      <div className="health-tabs" role="tablist">
        {tabs.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            className={`health-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div role="tabpanel" className="health-tab-content">
          <div className="health-chart-grid">
            {healthChartData.length > 0 && (
              <ChartCard title="General Health" subtitle="Census 2021 self-reported health">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={healthChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%" cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      {...CHART_ANIMATION}
                    >
                      {healthChartData.map((_, i) => (
                        <Cell key={i} fill={HEALTH_COLORS[i % HEALTH_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v) => v.toLocaleString()} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {disabilityData.length > 0 && (
              <ChartCard title="Disability" subtitle="Census 2021 Equality Act status">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={disabilityData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis type="number" tick={AXIS_TICK_STYLE} />
                    <YAxis type="category" dataKey="name" width={160} tick={AXIS_TICK_STYLE} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v) => v.toLocaleString()} />
                    <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} {...CHART_ANIMATION} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {indicatorComparison.length > 0 && (
              <ChartCard title="Key Mortality Rates" subtitle="vs England average" span={2}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={indicatorComparison.filter(d => d.unit === 'per 100,000')}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="name" tick={AXIS_TICK_STYLE} interval={0} angle={-20} textAnchor="end" height={80} />
                    <YAxis tick={AXIS_TICK_STYLE} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Legend />
                    <Bar dataKey="value" fill={CHART_COLORS[0]} name={config.council_name} radius={[4, 4, 0, 0]} {...CHART_ANIMATION} />
                    <Bar dataKey="england" fill={CHART_COLORS[3]} name="England" radius={[4, 4, 0, 0]} {...CHART_ANIMATION} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>

          {/* Life expectancy gauge */}
          {summary.life_expectancy_male != null && (
            <div className="health-gauge-row">
              <ChartCard title="Life Expectancy Gap" subtitle="Compared to England average">
                <div className="health-gauge-pair">
                  <div className="health-gauge-item">
                    <GaugeChart
                      value={summary.life_expectancy_male}
                      max={85}
                      label="Male"
                      format={(v) => `${v.toFixed(1)} yrs`}
                    />
                    <p className="gauge-compare">England: {indicators.life_expectancy_male?.england_value?.toFixed(1) || '—'}</p>
                  </div>
                  <div className="health-gauge-item">
                    <GaugeChart
                      value={summary.life_expectancy_female || 0}
                      max={90}
                      label="Female"
                      format={(v) => `${v.toFixed(1)} yrs`}
                    />
                    <p className="gauge-compare">England: {indicators.life_expectancy_female?.england_value?.toFixed(1) || '—'}</p>
                  </div>
                </div>
              </ChartCard>
            </div>
          )}
        </div>
      )}

      {/* Ward Analysis Tab */}
      {activeTab === 'wards' && (
        <div role="tabpanel" className="health-tab-content">
          {/* Ward selector */}
          <div className="health-ward-controls">
            <label htmlFor="health-ward-select">Select ward:</label>
            <select
              id="health-ward-select"
              value={selectedWard}
              onChange={(e) => setSelectedWard(e.target.value)}
            >
              <option value="">All wards</option>
              {sortedWards.map(w => (
                <option key={w.code} value={w.name}>{w.name}</option>
              ))}
            </select>
          </div>

          {/* Map section */}
          {config.data_sources?.ward_boundaries && wardBoundaries && (
            <div className="health-map-section">
              <p>Map metric:{' '}
                <select value={mapMetric} onChange={e => setMapMetric(e.target.value)}>
                  <option value="good_health">Good health %</option>
                  <option value="disability">Disability %</option>
                </select>
              </p>
              <Suspense fallback={<div className="loading-state"><div className="loading-spinner" /></div>}>
                <ChoroplethMap
                  boundaries={wardBoundaries}
                  values={mapValues}
                  label={mapMetric === 'good_health' ? 'Good health %' : 'Disability %'}
                />
              </Suspense>
            </div>
          )}

          {/* Ward detail */}
          {wardDetail && (
            <div className="health-ward-detail">
              <h3>{wardDetail.name}</h3>
              {wardDetail.general_health && (
                <div className="ward-health-breakdown">
                  <h4>General Health</h4>
                  <div className="ward-health-bars">
                    {Object.entries(wardDetail.general_health).map(([k, v]) => {
                      const total = Object.values(wardDetail.general_health).reduce((s, x) => s + x, 0)
                      const pct = total ? (v / total * 100).toFixed(1) : 0
                      return (
                        <div key={k} className="ward-bar-row">
                          <span className="ward-bar-label">{k}</span>
                          <div className="ward-bar-track">
                            <div className="ward-bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="ward-bar-value">{pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {wardDetail.disability && (
                <div className="ward-health-breakdown">
                  <h4>Disability</h4>
                  <div className="ward-health-bars">
                    {Object.entries(wardDetail.disability).map(([k, v]) => {
                      const total = Object.values(wardDetail.disability).reduce((s, x) => s + x, 0)
                      const pct = total ? (v / total * 100).toFixed(1) : 0
                      return (
                        <div key={k} className="ward-bar-row">
                          <span className="ward-bar-label">{k}</span>
                          <div className="ward-bar-track">
                            <div className="ward-bar-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <span className="ward-bar-value">{pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Political Context */}
              {healthTalkingPoints.length > 0 && (
                <div className="strategy-context" style={{ background: 'rgba(18,182,207,0.04)', border: '1px solid rgba(18,182,207,0.15)', borderRadius: 8, padding: '1rem 1.25rem', marginTop: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 700, color: '#12B6CF' }}>Political Context</h4>
                  {healthTalkingPoints.map((pt, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, fontSize: '0.8rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                      <span style={{ background: 'rgba(18,182,207,0.12)', color: '#12B6CF', padding: '1px 6px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 600, flexShrink: 0 }}>{pt.category}</span>
                      <span>{pt.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Ward comparison table */}
          <div className="health-ward-table-wrap">
            <table className="health-ward-table">
              <thead>
                <tr>
                  <th>Ward</th>
                  <th>Good Health %</th>
                  <th>Bad Health %</th>
                  <th>Disability %</th>
                  <th>Carers %</th>
                </tr>
              </thead>
              <tbody>
                {sortedWards.map(w => {
                  const gh = w.general_health || {}
                  const dis = w.disability || {}
                  const uc = w.unpaid_care || {}
                  const ghTotal = Object.values(gh).reduce((s, v) => s + v, 0)
                  const disTotal = Object.values(dis).reduce((s, v) => s + v, 0)
                  const ucTotal = Object.values(uc).reduce((s, v) => s + v, 0)
                  const goodPct = ghTotal ? Object.entries(gh).filter(([k]) => k.toLowerCase().includes('good')).reduce((s, [, v]) => s + v, 0) / ghTotal * 100 : 0
                  const badPct = ghTotal ? Object.entries(gh).filter(([k]) => k.toLowerCase().includes('bad')).reduce((s, [, v]) => s + v, 0) / ghTotal * 100 : 0
                  const disPct = disTotal ? Object.entries(dis).filter(([k]) => k.toLowerCase().includes('limited')).reduce((s, [, v]) => s + v, 0) / disTotal * 100 : 0
                  const carerPct = ucTotal ? Object.entries(uc).filter(([k]) => !k.toLowerCase().includes('no unpaid') && !k.toLowerCase().includes('provides no')).reduce((s, [, v]) => s + v, 0) / ucTotal * 100 : 0
                  return (
                    <tr key={w.code} className={w.name === selectedWard ? 'selected' : ''}>
                      <td>{w.name}</td>
                      <td>{goodPct.toFixed(1)}%</td>
                      <td>{badPct.toFixed(1)}%</td>
                      <td>{disPct.toFixed(1)}%</td>
                      <td>{carerPct.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Indicators Tab */}
      {activeTab === 'indicators' && (
        <div role="tabpanel" className="health-tab-content">
          {Object.keys(indicators).length === 0 ? (
            <p className="health-empty">No Fingertips indicator data available for this council.</p>
          ) : (
            <>
              <div className="health-indicators-table-wrap">
                <table className="health-indicators-table">
                  <thead>
                    <tr>
                      <th>Indicator</th>
                      <th>Value</th>
                      <th>Period</th>
                      <th>England</th>
                      <th>NW</th>
                      <th>Comparison</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(indicators).map(([key, ind]) => (
                      <tr key={key} className={`indicator-row ${ind.compared_to_england === 'Worse' ? 'worse' : ind.compared_to_england === 'Better' ? 'better' : ''}`}>
                        <td>{ind.label}</td>
                        <td className="ind-value">
                          {ind.value != null ? ind.value.toFixed(1) : '—'}
                          {ind.unit === 'pct' ? '%' : ''}
                        </td>
                        <td>{ind.period || '—'}</td>
                        <td>{ind.england_value != null ? ind.england_value.toFixed(1) : '—'}</td>
                        <td>{ind.nw_value != null ? ind.nw_value.toFixed(1) : '—'}</td>
                        <td>
                          <span className={`comparison-badge ${(ind.compared_to_england || '').toLowerCase()}`}>
                            {ind.compared_to_england || '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <CollapsibleSection title="Understanding Health Indicators" defaultOpen={false}>
                <div className="health-explainer">
                  <div className="explainer-item">
                    <strong>Life expectancy</strong>
                    <p>Average number of years a newborn would live based on current mortality rates.</p>
                  </div>
                  <div className="explainer-item">
                    <strong>Compared to England</strong>
                    <p>Statistical comparison using confidence intervals. "Worse" means significantly below the national average.</p>
                  </div>
                  <div className="explainer-item">
                    <strong>Census health data</strong>
                    <p>Self-reported health status from Census 2021. Ward-level data allows comparison within the borough.</p>
                  </div>
                </div>
              </CollapsibleSection>
            </>
          )}
        </div>
      )}

      {/* Source attribution */}
      <div className="health-source">
        <p>
          Indicator data: <a href="https://fingertips.phe.org.uk" target="_blank" rel="noopener noreferrer">fingertips.phe.org.uk</a> (OHID).
          Ward-level data: Census 2021 via <a href="https://www.nomisweb.co.uk" target="_blank" rel="noopener noreferrer">nomisweb.co.uk</a>.
          {health?.meta?.generated && ` Generated ${new Date(health.meta.generated).toLocaleDateString('en-GB')}.`}
        </p>
      </div>
    </div>
  )
}
