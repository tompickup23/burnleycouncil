import { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts'
import { CHART_COLORS, TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE, CHART_ANIMATION } from '../utils/constants'
import { Shield, MapPin, AlertTriangle, TrendingDown, Users, Search, Eye } from 'lucide-react'
import { generateCrimeTalkingPoints } from '../utils/strategyEngine'
import CollapsibleSection from '../components/CollapsibleSection'
import GaugeChart from '../components/ui/GaugeChart'
import ChartCard from '../components/ui/ChartCard'
import './Crime.css'

const ChoroplethMap = lazy(() => import('../components/ChoroplethMap'))

const fmt = (n) => typeof n === 'number' ? n.toLocaleString('en-GB') : '—'
const pct1 = (n, d) => (d && typeof n === 'number') ? (n / d * 100).toFixed(1) : '—'

// Friendly category display name fallback
const CATEGORY_NAMES = {
  'violent-crime': 'Violence & Sexual Offences',
  'anti-social-behaviour': 'Anti-Social Behaviour',
  'burglary': 'Burglary',
  'criminal-damage-arson': 'Criminal Damage & Arson',
  'shoplifting': 'Shoplifting',
  'other-theft': 'Other Theft',
  'public-order': 'Public Order',
  'vehicle-crime': 'Vehicle Crime',
  'other-crime': 'Other Crime',
  'drugs': 'Drugs',
  'bicycle-theft': 'Bicycle Theft',
  'robbery': 'Robbery',
  'possession-of-weapons': 'Weapons Possession',
  'theft-from-the-person': 'Theft from Person',
}

// Outcome grouping for solved rate
const SOLVED_OUTCOMES = [
  'Offender given a caution',
  'Offender given penalty notice',
  'Awaiting court outcome',
  'Local resolution',
  'Offender given a drugs possession warning',
  'Offender otherwise dealt with',
  'Offender sent to prison',
  'Suspect charged as part of another case',
]

function Crime() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const { data: crimeData, loading, error } = useData('/data/crime_stats.json')
  const { data: crimeHistory } = useData('/data/crime_history.json')
  const { data: wardBoundaries } = useData(
    config.data_sources?.ward_boundaries ? '/data/ward_boundaries.json' : null
  )
  const { data: deprivationRaw } = useData('/data/deprivation.json')
  const [selectedWard, setSelectedWard] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [mapMetric, setMapMetric] = useState('total_crimes')

  useEffect(() => {
    document.title = `Crime & Safety | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  const wards = crimeData?.wards || {}
  const categoryDisplay = crimeData?.category_display || {}
  const byCategory = crimeData?.by_category || {}
  const outcomes = crimeData?.outcomes || {}

  // Ward list sorted by total crimes descending
  const wardList = useMemo(() =>
    Object.entries(wards)
      .map(([code, w]) => ({ code, ...w }))
      .sort((a, b) => (b.total_crimes || 0) - (a.total_crimes || 0)),
    [wards]
  )

  // Category breakdown chart (sorted descending)
  const categoryChart = useMemo(() =>
    Object.entries(categoryDisplay)
      .map(([key, val]) => ({
        key,
        name: val.name || CATEGORY_NAMES[key] || key,
        count: val.count || 0,
      }))
      .sort((a, b) => b.count - a.count),
    [categoryDisplay]
  )

  // Outcomes chart
  const outcomeChart = useMemo(() =>
    Object.entries(outcomes)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    [outcomes]
  )

  // Solved rate
  const solvedRate = useMemo(() => {
    const totalOutcomes = Object.values(outcomes).reduce((s, v) => s + v, 0)
    if (!totalOutcomes) return 0
    const solved = Object.entries(outcomes)
      .filter(([k]) => SOLVED_OUTCOMES.some(o => k.toLowerCase().includes(o.toLowerCase())))
      .reduce((s, [, v]) => s + v, 0)
    return Math.round(solved / totalOutcomes * 1000) / 10
  }, [outcomes])

  // Trend data from crime_history
  const trendData = useMemo(() => {
    if (!Array.isArray(crimeHistory)) return []
    return crimeHistory
      .map(m => ({
        date: m.date || '',
        total: m.total_crimes || 0,
        violent: m.by_category?.['violent-crime'] || 0,
        asb: m.by_category?.['anti-social-behaviour'] || 0,
        burglary: m.by_category?.['burglary'] || 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-12)
  }, [crimeHistory])

  // Ward comparison data for map + table
  const wardComparison = useMemo(() =>
    wardList.map(w => {
      const violent = w.by_category?.['violent-crime'] || 0
      const asb = w.by_category?.['anti-social-behaviour'] || 0
      return {
        name: w.name,
        code: w.code || w.ward_id,
        total_crimes: w.total_crimes || 0,
        violent,
        asb,
        violent_pct: w.total_crimes ? Math.round(violent / w.total_crimes * 1000) / 10 : 0,
        stop_search: w.stop_and_search?.total || 0,
      }
    }),
    [wardList]
  )

  // Map values for ChoroplethMap
  const mapValues = useMemo(() => {
    const values = {}
    wardComparison.forEach(w => {
      if (mapMetric === 'violent') values[w.name] = w.violent
      else if (mapMetric === 'asb') values[w.name] = w.asb
      else values[w.name] = w.total_crimes
    })
    return values
  }, [wardComparison, mapMetric])

  // Selected ward detail
  const selectedWardData = useMemo(() => {
    if (!selectedWard) return null
    return wardComparison.find(w => w.name === selectedWard) || null
  }, [selectedWard, wardComparison])

  // Strategy talking points for selected ward
  const crimeTalkingPoints = useMemo(() => {
    if (!selectedWard) return []
    const dep = deprivationRaw?.wards?.[selectedWard]
    return generateCrimeTalkingPoints(selectedWard, null, dep)
  }, [selectedWard, deprivationRaw])

  if (loading) return <LoadingState />
  if (error) return <div className="error-state">Error loading crime data: {error.message}</div>
  if (!crimeData || !crimeData.total_crimes) return <div className="empty-state">No crime data available for {councilName}.</div>

  const total = crimeData.total_crimes
  const violentCount = byCategory['violent-crime'] || 0
  const asbCount = byCategory['anti-social-behaviour'] || 0
  const stopSearch = crimeData.total_stop_and_search || 0

  const mapLegendTitle = mapMetric === 'violent' ? 'Violent Crimes'
    : mapMetric === 'asb' ? 'ASB Incidents'
    : 'Total Crimes'

  return (
    <div className="crime-page">
      {/* Hero */}
      <div className="crime-hero">
        <div className="hero-content">
          <h1><Shield size={28} /> Crime & Safety</h1>
          <p className="hero-subtitle">
            {councilName} crime analysis — {fmt(total)} crimes recorded
            across {crimeData.ward_count || wardList.length} policing wards ({crimeData.date}).
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="crime-summary-grid">
        <div className="crime-card highlight">
          <div className="card-icon"><AlertTriangle size={20} /></div>
          <div className="card-value">{fmt(total)}</div>
          <div className="card-label">Total Crimes</div>
          <div className="card-period">{crimeData.date}</div>
        </div>
        <div className="crime-card">
          <div className="card-icon"><Shield size={20} /></div>
          <div className="card-value">{fmt(violentCount)}</div>
          <div className="card-label">Violent Crime</div>
          <div className="card-period">{pct1(violentCount, total)}%</div>
        </div>
        <div className="crime-card">
          <div className="card-icon"><Users size={20} /></div>
          <div className="card-value">{fmt(asbCount)}</div>
          <div className="card-label">Anti-Social Behaviour</div>
          <div className="card-period">{pct1(asbCount, total)}%</div>
        </div>
        <div className="crime-card">
          <div className="card-icon"><Search size={20} /></div>
          <div className="card-value">{fmt(stopSearch)}</div>
          <div className="card-label">Stop & Search</div>
        </div>
        <div className="crime-card">
          <div className="card-icon"><Eye size={20} /></div>
          <div className="card-value">{solvedRate}%</div>
          <div className="card-label">Resolution Rate</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="crime-tabs" role="tablist">
        {['overview', 'wards', 'trends', 'outcomes'].map(tab => (
          <button
            key={tab}
            className={`tab-button ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
            role="tab"
            aria-selected={activeTab === tab}
          >
            {tab === 'overview' ? 'Overview' : tab === 'wards' ? 'Ward Analysis' : tab === 'trends' ? 'Trends' : 'Outcomes'}
          </button>
        ))}
      </div>

      {/* === OVERVIEW TAB === */}
      {activeTab === 'overview' && (
        <div className="tab-content" role="tabpanel">
          <div className="chart-grid">
            {/* Category Bar Chart */}
            <ChartCard title="Crime by Category" description={`${fmt(total)} crimes in ${crimeData.date}`}>
              <ResponsiveContainer width="100%" height={Math.max(300, categoryChart.length * 30)}>
                <BarChart data={categoryChart} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
                  <XAxis type="number" tick={AXIS_TICK_STYLE} />
                  <YAxis type="category" dataKey="name" tick={{ ...AXIS_TICK_STYLE, fontSize: 11 }} width={160} />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value) => [fmt(value), 'Crimes']}
                  />
                  <Bar dataKey="count" fill={CHART_COLORS[0]} {...CHART_ANIMATION} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Outcomes Pie Chart */}
            <ChartCard title="Investigation Outcomes" description="How reported crimes are resolved">
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={outcomeChart.slice(0, 6)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="count"
                    nameKey="name"
                    label={({ name, percent }) => `${name.length > 20 ? name.slice(0, 18) + '…' : name} ${(percent * 100).toFixed(0)}%`}
                    {...CHART_ANIMATION}
                  >
                    {outcomeChart.slice(0, 6).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value) => [fmt(value), 'Cases']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Resolution Rate Gauge */}
            <ChartCard title="Resolution Rate" description="Percentage of crimes with a positive outcome">
              <div className="gauge-container">
                <GaugeChart
                  value={solvedRate}
                  max={50}
                  label="Resolved"
                  suffix="%"
                  thresholds={[10, 20, 35]}
                  colors={['#ff453a', '#ff9500', '#ffd60a', '#12B6CF']}
                />
                <p className="gauge-note">
                  Includes cautions, charges, penalty notices, and local resolutions
                </p>
              </div>
            </ChartCard>

            {/* Top 5 Ward Crimes */}
            <ChartCard title="Highest Crime Wards" description="Top 5 wards by total crime count">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={wardComparison.slice(0, 5)}>
                  <CartesianGrid stroke={GRID_STROKE} />
                  <XAxis dataKey="name" tick={{ ...AXIS_TICK_STYLE, fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={AXIS_TICK_STYLE} />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value) => [fmt(value), 'Crimes']}
                  />
                  <Bar dataKey="total_crimes" fill={CHART_COLORS[3]} name="Total" {...CHART_ANIMATION} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      )}

      {/* === WARD ANALYSIS TAB === */}
      {activeTab === 'wards' && (
        <div className="tab-content" role="tabpanel">
          {/* Map */}
          {wardBoundaries && (
            <div className="ward-map-section">
              <div className="map-controls">
                <label>Map metric: </label>
                <select value={mapMetric} onChange={e => setMapMetric(e.target.value)}>
                  <option value="total_crimes">Total Crimes</option>
                  <option value="violent">Violent Crime</option>
                  <option value="asb">Anti-Social Behaviour</option>
                </select>
              </div>
              <Suspense fallback={<LoadingState />}>
                <ChoroplethMap
                  boundaries={wardBoundaries}
                  values={mapValues}
                  colorScale="intensity"
                  legend={{ title: mapLegendTitle, format: v => Math.round(v).toString(), unit: '' }}
                  selectedWard={selectedWard}
                  onWardClick={(name) => setSelectedWard(name)}
                  height="450px"
                />
              </Suspense>
            </div>
          )}

          {/* Ward selector */}
          <div className="ward-selector">
            <label htmlFor="crime-ward-select"><MapPin size={16} /> Select ward:</label>
            <select
              id="crime-ward-select"
              value={selectedWard}
              onChange={e => setSelectedWard(e.target.value)}
            >
              <option value="">All wards</option>
              {wardList.map(w => (
                <option key={w.code || w.ward_id} value={w.name}>{w.name}</option>
              ))}
            </select>
          </div>

          {/* Selected ward detail */}
          {selectedWardData && (
            <div className="ward-detail">
              <h3>{selectedWardData.name}</h3>
              <div className="ward-stats">
                <span>{fmt(selectedWardData.total_crimes)} crimes</span>
                <span>{fmt(selectedWardData.violent)} violent</span>
                <span>{fmt(selectedWardData.asb)} ASB</span>
                <span>{fmt(selectedWardData.stop_search)} stop & search</span>
              </div>
            </div>
          )}

          {/* Political Context */}
          {crimeTalkingPoints.length > 0 && (
            <div className="strategy-context" style={{ background: 'rgba(18,182,207,0.04)', border: '1px solid rgba(18,182,207,0.15)', borderRadius: 8, padding: '1rem 1.25rem', marginTop: '1rem' }}>
              <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 700, color: '#12B6CF' }}>Political Context</h4>
              {crimeTalkingPoints.map((pt, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, fontSize: '0.8rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                  <span style={{ background: 'rgba(18,182,207,0.12)', color: '#12B6CF', padding: '1px 6px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 600, flexShrink: 0 }}>{pt.category}</span>
                  <span>{pt.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Ward comparison table */}
          <div className="ward-table-wrapper">
            <table className="ward-table">
              <thead>
                <tr>
                  <th>Ward</th>
                  <th>Total</th>
                  <th>Violent</th>
                  <th>ASB</th>
                  <th>Violent %</th>
                  <th>Stop & Search</th>
                </tr>
              </thead>
              <tbody>
                {wardComparison.map(w => (
                  <tr
                    key={w.code}
                    className={selectedWard === w.name ? 'selected' : ''}
                    onClick={() => setSelectedWard(w.name)}
                  >
                    <td className="ward-name">{w.name}</td>
                    <td className={w.total_crimes > (total / wardList.length * 1.5) ? 'high-value' : ''}>{fmt(w.total_crimes)}</td>
                    <td>{fmt(w.violent)}</td>
                    <td>{fmt(w.asb)}</td>
                    <td className={w.violent_pct > 40 ? 'high-value' : ''}>{w.violent_pct}%</td>
                    <td>{fmt(w.stop_search)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === TRENDS TAB === */}
      {activeTab === 'trends' && (
        <div className="tab-content" role="tabpanel">
          {trendData.length > 1 ? (
            <div className="chart-grid">
              <ChartCard title="Monthly Crime Trend" description="Total crimes over time" className="chart-wide">
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={trendData}>
                    <CartesianGrid stroke={GRID_STROKE} />
                    <XAxis dataKey="date" tick={AXIS_TICK_STYLE} />
                    <YAxis tick={AXIS_TICK_STYLE} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(value) => [fmt(value), 'Crimes']} />
                    <Legend />
                    <Line type="monotone" dataKey="total" stroke={CHART_COLORS[0]} name="Total" strokeWidth={2} dot={false} {...CHART_ANIMATION} />
                    <Line type="monotone" dataKey="violent" stroke="#ff453a" name="Violent" strokeWidth={1.5} dot={false} {...CHART_ANIMATION} />
                    <Line type="monotone" dataKey="asb" stroke="#ff9500" name="ASB" strokeWidth={1.5} dot={false} {...CHART_ANIMATION} />
                    <Line type="monotone" dataKey="burglary" stroke="#ffd60a" name="Burglary" strokeWidth={1.5} dot={false} {...CHART_ANIMATION} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Month-on-month change */}
              {trendData.length >= 2 && (() => {
                const latest = trendData[trendData.length - 1]
                const prev = trendData[trendData.length - 2]
                const change = latest.total - prev.total
                const changePct = prev.total ? ((change / prev.total) * 100).toFixed(1) : '—'
                return (
                  <ChartCard title="Month-on-Month Change" description={`${prev.date} → ${latest.date}`}>
                    <div className="mom-change">
                      <div className={`mom-value ${change > 0 ? 'up' : change < 0 ? 'down' : ''}`}>
                        <TrendingDown size={24} />
                        <span>{change > 0 ? '+' : ''}{fmt(change)} ({change > 0 ? '+' : ''}{changePct}%)</span>
                      </div>
                      <div className="mom-breakdown">
                        <div><span className="mom-label">Violent:</span> {fmt(latest.violent - prev.violent)}</div>
                        <div><span className="mom-label">ASB:</span> {fmt(latest.asb - prev.asb)}</div>
                        <div><span className="mom-label">Burglary:</span> {fmt(latest.burglary - prev.burglary)}</div>
                      </div>
                    </div>
                  </ChartCard>
                )
              })()}
            </div>
          ) : (
            <div className="empty-section">
              <p>No historical crime data available for {councilName}.</p>
              <p>Trend analysis requires multiple months of data.</p>
            </div>
          )}
        </div>
      )}

      {/* === OUTCOMES TAB === */}
      {activeTab === 'outcomes' && (
        <div className="tab-content" role="tabpanel">
          <div className="chart-grid">
            {/* Outcomes breakdown */}
            <ChartCard title="All Outcomes" description="How reported crimes are handled">
              <ResponsiveContainer width="100%" height={Math.max(300, outcomeChart.length * 35)}>
                <BarChart data={outcomeChart} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
                  <XAxis type="number" tick={AXIS_TICK_STYLE} />
                  <YAxis type="category" dataKey="name" tick={{ ...AXIS_TICK_STYLE, fontSize: 10 }} width={200} />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value) => [fmt(value), 'Cases']}
                  />
                  <Bar dataKey="count" fill={CHART_COLORS[1]} {...CHART_ANIMATION} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Resolution gauge */}
            <ChartCard title="Resolution Rate" description="Positive outcome percentage">
              <div className="gauge-container">
                <GaugeChart
                  value={solvedRate}
                  max={50}
                  label="Resolved"
                  suffix="%"
                  thresholds={[10, 20, 35]}
                  colors={['#ff453a', '#ff9500', '#ffd60a', '#12B6CF']}
                />
              </div>
            </ChartCard>
          </div>

          {/* Outcome explanation */}
          <CollapsibleSection
            title="Understanding Crime Outcomes"
            subtitle="What each outcome category means"
            defaultOpen={false}
          >
            <div className="outcome-explainer">
              <div className="explainer-item">
                <h4>Under Investigation</h4>
                <p>The crime is still being actively investigated by police.</p>
              </div>
              <div className="explainer-item">
                <h4>No Suspect Identified</h4>
                <p>Investigation complete but no suspect was identified — the case is closed.</p>
              </div>
              <div className="explainer-item">
                <h4>Unable to Prosecute</h4>
                <p>A suspect was identified but prosecution was not possible (insufficient evidence, victim withdrew, etc.).</p>
              </div>
              <div className="explainer-item">
                <h4>Local Resolution</h4>
                <p>Resolved through community-level response (e.g. mediation, restorative justice) without formal charge.</p>
              </div>
              <div className="explainer-item">
                <h4>Awaiting Court</h4>
                <p>Suspect has been charged and is awaiting court proceedings.</p>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* Data source */}
      <div className="crime-source">
        <p>
          Source: Data.Police.UK — street-level crime data for {councilName} ({crimeData.date}).
          Generated {crimeData.generated_at ? new Date(crimeData.generated_at).toLocaleDateString('en-GB') : ''}.
          {!crimeHistory && ' Historical trend data not yet available for this council.'}
        </p>
      </div>
    </div>
  )
}

export default Crime
