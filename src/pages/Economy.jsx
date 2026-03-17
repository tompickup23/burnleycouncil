import { useMemo, useState, useEffect, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useData } from '../hooks/useData'
import { ChartCard } from '../components/ui/ChartCard'
import { StatCard } from '../components/ui/StatCard'
import { generateEconomyTalkingPoints } from '../utils/strategyEngine'
import SparkLine from '../components/ui/SparkLine'
import GaugeChart from '../components/ui/GaugeChart'
import CollapsibleSection from '../components/CollapsibleSection'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts'
import { CHART_COLORS, TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE, CHART_ANIMATION } from '../utils/constants'
import './Economy.css'

const ChoroplethMap = lazy(() => import('../components/ChoroplethMap'))

const INDUSTRY_COLORS = [
  '#12B6CF', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444',
  '#22c55e', '#ec4899', '#6366f1', '#14b8a6', '#f97316',
  '#a855f7', '#06b6d4', '#84cc16', '#e11d48', '#3b82f6',
  '#d946ef', '#10b981', '#f43f5e', '#0891b2', '#7c3aed',
]

export default function Economy() {
  const config = useCouncilConfig()
  const { data: economy, loading, error } = useData('/data/economy.json')
  const { data: wardBoundaries } = useData(
    config.data_sources?.ward_boundaries ? '/data/ward_boundaries.json' : null
  )

  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedWard, setSelectedWard] = useState('')
  const [mapMetric, setMapMetric] = useState('claimant_rate')

  useEffect(() => {
    if (economy) {
      document.title = `Economy & Work | ${config.council_name} Council Transparency`
    }
  }, [economy, config.council_name])

  // Pre-select ward from URL param (e.g. /economy?ward=Hapton)
  useEffect(() => {
    const wardParam = searchParams.get('ward')
    if (wardParam && !selectedWard) {
      setSelectedWard(wardParam)
      setActiveTab('wards')
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sorted wards for table + selector
  const sortedWards = useMemo(() => {
    if (!economy?.census?.wards) return []
    return Object.entries(economy.census.wards)
      .map(([code, data]) => ({ code, ...data }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [economy])

  // Claimant wards sorted by rate (for claimant tab)
  const claimantWards = useMemo(() => {
    if (!economy?.claimant_count?.wards) return []
    return Object.entries(economy.claimant_count.wards)
      .map(([code, data]) => ({ code, ...data }))
      .sort((a, b) => (b.rate_pct || 0) - (a.rate_pct || 0))
  }, [economy])

  // Ward detail
  const wardDetail = useMemo(() => {
    if (!selectedWard || !economy?.census?.wards) return null
    const entry = Object.entries(economy.census.wards).find(
      ([, d]) => d.name === selectedWard
    )
    return entry ? { code: entry[0], ...entry[1] } : null
  }, [selectedWard, economy])

  // Industry chart data (council totals)
  const industryData = useMemo(() => {
    const ind = economy?.census?.council_totals?.industry
    if (!ind) return []
    return Object.entries(ind)
      .filter(([, v]) => typeof v === 'number' && v > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12)
      .map(([k, v]) => ({ name: k.replace(/&/g, '&'), value: v }))
  }, [economy])

  // Occupation chart data
  const occupationData = useMemo(() => {
    const occ = economy?.census?.council_totals?.occupation
    if (!occ) return []
    return Object.entries(occ)
      .filter(([, v]) => typeof v === 'number' && v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => ({ name: k.replace(/^(\d)\s+/, ''), value: v }))
  }, [economy])

  // Claimant history for trend chart
  const claimantHistory = useMemo(() => {
    if (!economy?.claimant_count?.history) return []
    return economy.claimant_count.history.map(h => ({
      month: h.month?.replace(/\s+\d{4}$/, '') || h.date,
      count: h.count,
      rate: h.rate_pct,
    }))
  }, [economy])

  // Claimant sparkline data (counts)
  const claimantSparkData = useMemo(() => {
    if (!economy?.claimant_count?.history) return []
    return economy.claimant_count.history.map(h => h.count)
  }, [economy])

  // Hours worked data
  const hoursData = useMemo(() => {
    const hrs = economy?.census?.council_totals?.hours_worked
    if (!hrs) return []
    return Object.entries(hrs)
      .filter(([, v]) => typeof v === 'number' && v > 0)
      .map(([k, v]) => ({ name: k, value: v }))
  }, [economy])

  // Earnings comparison data
  const earningsComparison = useMemo(() => {
    const e = economy?.earnings
    if (!e?.median_weekly_pay) return []
    const items = [{ name: config.council_name, value: e.median_weekly_pay }]
    if (e.england_median_weekly) items.push({ name: 'England', value: e.england_median_weekly })
    return items
  }, [economy, config.council_name])

  // Strategy talking points for selected ward
  const economyTalkingPoints = useMemo(() => {
    if (!selectedWard || !economy) return []
    return generateEconomyTalkingPoints(selectedWard, economy)
  }, [selectedWard, economy])

  // Map metric values for choropleth
  const mapValues = useMemo(() => {
    if (mapMetric === 'claimant_rate') {
      if (!economy?.claimant_count?.wards) return {}
      const result = {}
      for (const [code, ward] of Object.entries(economy.claimant_count.wards)) {
        result[code] = ward.rate_pct || 0
      }
      return result
    }
    // Industry: professional %
    if (!economy?.census?.wards) return {}
    const result = {}
    for (const [code, ward] of Object.entries(economy.census.wards)) {
      const occ = ward.occupation || {}
      const total = Object.values(occ).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0)
      if (total) {
        const prof = Object.entries(occ)
          .filter(([k]) => k.toLowerCase().includes('professional') || k.toLowerCase().includes('manager'))
          .reduce((s, [, v]) => s + v, 0)
        result[code] = Math.round(prof / total * 1000) / 10
      }
    }
    return result
  }, [economy, mapMetric])

  if (loading) return <div className="loading-state"><div className="loading-spinner" /></div>
  if (error) return <div className="error-state"><p>Error loading economy data. Please try again later.</p></div>
  if (!economy) return <div className="empty-state"><p>No economy data available for this council.</p></div>

  const { summary = {}, claimant_count: claimant, earnings, census = {} } = economy
  const wardCount = Object.keys(census.wards || {}).length

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'wards', label: 'Ward Analysis' },
    { id: 'claimant', label: 'Claimant Trends' },
    { id: 'earnings', label: 'Earnings & Income' },
  ]

  const fmtK = (v) => v != null ? v.toLocaleString() : '—'
  const fmtPct = (v) => v != null ? `${v.toFixed(1)}%` : '—'
  const fmtPay = (v) => v != null ? `£${v.toLocaleString()}` : '—'

  return (
    <div className="economy-page">
      {/* Hero */}
      <div className="economy-hero">
        <h1>Economy & Work</h1>
        <p className="economy-hero-subtitle">
          Employment, earnings, industry & claimant count across {wardCount} wards
        </p>
      </div>

      {/* Summary stats */}
      <div className="economy-summary-grid">
        <StatCard
          label="Claimant Rate"
          value={fmtPct(summary.claimant_rate_pct)}
          subtitle={claimant?.latest?.month || ''}
        />
        <StatCard
          label="Weekly Pay"
          value={fmtPay(summary.median_weekly_pay)}
          subtitle={`Median gross${earnings?.year ? ` (${earnings.year})` : ''}`}
        />
        <StatCard
          label="Annual Pay"
          value={fmtPay(summary.median_annual_pay)}
          subtitle="Median gross"
        />
        <StatCard
          label="Top Industry"
          value={summary.top_industry || '—'}
          subtitle={summary.top_industry_pct ? `${summary.top_industry_pct}% of workers` : ''}
        />
        <StatCard
          label="Professional %"
          value={fmtPct(summary.professional_pct)}
          subtitle="Managers + professionals"
        />
        <StatCard
          label="Part-time %"
          value={fmtPct(summary.part_time_pct)}
          subtitle="Census 2021"
        />
      </div>

      {/* Claimant trend sparkline */}
      {claimantSparkData.length > 1 && (
        <div className="economy-sparkline-row">
          <span className="sparkline-label">Claimant trend ({claimantHistory.length} months)</span>
          <SparkLine data={claimantSparkData} width={160} height={28} trend fill />
          <span className="sparkline-value">{fmtK(claimant?.latest?.count)}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="economy-tabs" role="tablist">
        {tabs.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            className={`economy-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div role="tabpanel" className="economy-tab-content">
          <div className="economy-chart-grid">
            {industryData.length > 0 && (
              <ChartCard title="Industry" subtitle="Top employment sectors (Census 2021)">
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart data={industryData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis type="number" tick={AXIS_TICK_STYLE} />
                    <YAxis type="category" dataKey="name" width={180} tick={{ ...AXIS_TICK_STYLE, fontSize: 11 }} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v) => v.toLocaleString()} />
                    <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} {...CHART_ANIMATION} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {occupationData.length > 0 && (
              <ChartCard title="Occupation" subtitle="SOC major groups (Census 2021)">
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart data={occupationData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis type="number" tick={AXIS_TICK_STYLE} />
                    <YAxis type="category" dataKey="name" width={180} tick={{ ...AXIS_TICK_STYLE, fontSize: 11 }} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v) => v.toLocaleString()} />
                    <Bar dataKey="value" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} {...CHART_ANIMATION} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {earningsComparison.length > 0 && (
              <ChartCard title="Earnings Comparison" subtitle="Median weekly pay (ASHE)" span={2}>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={earningsComparison}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
                    <YAxis tick={AXIS_TICK_STYLE} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v) => `£${v.toLocaleString()}`} />
                    <Bar dataKey="value" name="Median weekly pay" radius={[4, 4, 0, 0]} {...CHART_ANIMATION}>
                      {earningsComparison.map((_, i) => (
                        <Cell key={i} fill={i === 0 ? CHART_COLORS[0] : CHART_COLORS[3]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>
        </div>
      )}

      {/* Ward Analysis Tab */}
      {activeTab === 'wards' && (
        <div role="tabpanel" className="economy-tab-content">
          {/* Ward selector */}
          <div className="economy-ward-controls">
            <label htmlFor="economy-ward-select">Select ward:</label>
            <select
              id="economy-ward-select"
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
            <div className="economy-map-section">
              <p>Map metric:{' '}
                <select value={mapMetric} onChange={e => setMapMetric(e.target.value)}>
                  <option value="claimant_rate">Claimant rate %</option>
                  <option value="professional_pct">Professional %</option>
                </select>
              </p>
              <Suspense fallback={<div className="loading-state"><div className="loading-spinner" /></div>}>
                <ChoroplethMap
                  boundaries={wardBoundaries}
                  values={mapValues}
                  label={mapMetric === 'claimant_rate' ? 'Claimant rate %' : 'Professional %'}
                />
              </Suspense>
            </div>
          )}

          {/* Ward detail */}
          {wardDetail && (
            <div className="economy-ward-detail">
              <h3>{wardDetail.name}</h3>
              {wardDetail.industry && (
                <div className="ward-economy-breakdown">
                  <h4>Industry</h4>
                  <div className="ward-economy-bars">
                    {Object.entries(wardDetail.industry)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 8)
                      .map(([k, v]) => {
                        const total = Object.values(wardDetail.industry).reduce((s, x) => s + x, 0)
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
              {wardDetail.occupation && (
                <div className="ward-economy-breakdown">
                  <h4>Occupation</h4>
                  <div className="ward-economy-bars">
                    {Object.entries(wardDetail.occupation)
                      .sort(([, a], [, b]) => b - a)
                      .map(([k, v]) => {
                        const total = Object.values(wardDetail.occupation).reduce((s, x) => s + x, 0)
                        const pct = total ? (v / total * 100).toFixed(1) : 0
                        return (
                          <div key={k} className="ward-bar-row">
                            <span className="ward-bar-label">{k.replace(/^(\d)\s+/, '')}</span>
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
              {economyTalkingPoints.length > 0 && (
                <div className="strategy-context" style={{ background: 'rgba(18,182,207,0.04)', border: '1px solid rgba(18,182,207,0.15)', borderRadius: 8, padding: '1rem 1.25rem', marginTop: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 700, color: '#12B6CF' }}>Political Context</h4>
                  {economyTalkingPoints.map((pt, i) => (
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
          <div className="economy-ward-table-wrap">
            <table className="economy-ward-table">
              <thead>
                <tr>
                  <th>Ward</th>
                  <th>Claimants</th>
                  <th>Rate %</th>
                  <th>Top Industry</th>
                  <th>Professional %</th>
                </tr>
              </thead>
              <tbody>
                {sortedWards.map(w => {
                  const cl = economy?.claimant_count?.wards?.[w.code]
                  const occ = w.occupation || {}
                  const occTotal = Object.values(occ).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0)
                  const profPct = occTotal ? Object.entries(occ)
                    .filter(([k]) => k.toLowerCase().includes('professional') || k.toLowerCase().includes('manager'))
                    .reduce((s, [, v]) => s + v, 0) / occTotal * 100 : 0

                  const ind = w.industry || {}
                  const topInd = Object.entries(ind).sort(([, a], [, b]) => b - a)[0]

                  return (
                    <tr key={w.code} className={w.name === selectedWard ? 'selected' : ''}>
                      <td>{w.name}</td>
                      <td>{cl?.count != null ? fmtK(cl.count) : '—'}</td>
                      <td>{cl?.rate_pct != null ? fmtPct(cl.rate_pct) : '—'}</td>
                      <td>{topInd ? topInd[0] : '—'}</td>
                      <td>{profPct.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Claimant Trends Tab */}
      {activeTab === 'claimant' && (
        <div role="tabpanel" className="economy-tab-content">
          {claimantHistory.length === 0 ? (
            <p className="economy-empty">No claimant count data available.</p>
          ) : (
            <>
              <ChartCard title="Claimant Count Trend" subtitle="Monthly claimants (UC + JSA)" span={2}>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={claimantHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="month" tick={AXIS_TICK_STYLE} />
                    <YAxis tick={AXIS_TICK_STYLE} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) =>
                      name === 'count' ? v.toLocaleString() : `${v}%`
                    } />
                    <Legend />
                    <Line type="monotone" dataKey="count" stroke={CHART_COLORS[0]} name="Claimants"
                      strokeWidth={2} dot={{ r: 4 }} {...CHART_ANIMATION} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Claimant Rate Trend" subtitle="% of working-age population" span={2}>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={claimantHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="month" tick={AXIS_TICK_STYLE} />
                    <YAxis tick={AXIS_TICK_STYLE} domain={['auto', 'auto']} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v) => `${v}%`} />
                    <Line type="monotone" dataKey="rate" stroke={CHART_COLORS[1]} name="Rate %"
                      strokeWidth={2} dot={{ r: 4 }} {...CHART_ANIMATION} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Ward claimant rates table */}
              {claimantWards.length > 0 && (
                <div className="economy-ward-table-wrap">
                  <h3>Ward Claimant Rates</h3>
                  <p className="economy-table-subtitle">
                    {claimant?.latest?.month || ''} — sorted by rate (highest first)
                  </p>
                  <table className="economy-ward-table">
                    <thead>
                      <tr>
                        <th>Ward</th>
                        <th>Claimants</th>
                        <th>Rate %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {claimantWards.map(w => (
                        <tr key={w.code} className={w.rate_pct >= 6 ? 'high-rate' : ''}>
                          <td>{w.name}</td>
                          <td>{fmtK(w.count)}</td>
                          <td className="rate-cell">{fmtPct(w.rate_pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Earnings & Income Tab */}
      {activeTab === 'earnings' && (
        <div role="tabpanel" className="economy-tab-content">
          {!earnings ? (
            <p className="economy-empty">No earnings data available for this council.</p>
          ) : (
            <div className="economy-chart-grid">
              {/* Earnings gauge */}
              <ChartCard title="Earnings Gap" subtitle="Median weekly pay vs England">
                <div className="economy-gauge-pair">
                  <GaugeChart
                    value={earnings.median_weekly_pay || 0}
                    max={earnings.england_median_weekly ? Math.round(earnings.england_median_weekly * 1.2) : 1000}
                    label={config.council_name}
                    format={(v) => `£${v.toFixed(0)}/wk`}
                  />
                  <p className="gauge-compare">England: £{earnings.england_median_weekly?.toFixed(0) || '—'}/wk</p>
                </div>
              </ChartCard>

              {/* Pay comparison bar */}
              {earningsComparison.length > 0 && (
                <ChartCard title="Weekly Pay Comparison" subtitle={`ASHE ${earnings.year || ''}`}>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={earningsComparison}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                      <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
                      <YAxis tick={AXIS_TICK_STYLE} />
                      <Tooltip {...TOOLTIP_STYLE} formatter={(v) => `£${v.toLocaleString()}`} />
                      <Bar dataKey="value" name="Median weekly pay" radius={[4, 4, 0, 0]} {...CHART_ANIMATION}>
                        {earningsComparison.map((_, i) => (
                          <Cell key={i} fill={i === 0 ? CHART_COLORS[0] : CHART_COLORS[3]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* Hours worked */}
              {hoursData.length > 0 && (
                <ChartCard title="Hours Worked" subtitle="Part-time vs full-time (Census 2021)" span={2}>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={hoursData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%" cy="50%"
                        outerRadius={90}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        {...CHART_ANIMATION}
                      >
                        {hoursData.map((_, i) => (
                          <Cell key={i} fill={INDUSTRY_COLORS[i % INDUSTRY_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip {...TOOLTIP_STYLE} formatter={(v) => v.toLocaleString()} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </div>
          )}

          <CollapsibleSection title="Understanding Economy Data" defaultOpen={false}>
            <div className="economy-explainer">
              <div className="explainer-item">
                <strong>Claimant count</strong>
                <p>People claiming Jobseeker's Allowance or Universal Credit (searching for work). A proxy for unemployment.</p>
              </div>
              <div className="explainer-item">
                <strong>ASHE earnings</strong>
                <p>Annual Survey of Hours and Earnings — median gross pay for full-time employees at workplace level.</p>
              </div>
              <div className="explainer-item">
                <strong>Census occupation/industry</strong>
                <p>Census 2021 data showing employment by Standard Occupational Classification and Standard Industrial Classification.</p>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* Source attribution */}
      <div className="economy-source">
        <p>
          Claimant count & earnings: <a href="https://www.nomisweb.co.uk" target="_blank" rel="noopener noreferrer">nomisweb.co.uk</a> (Nomis).
          Industry, occupation & hours: Census 2021 via Nomis.
          {economy?.meta?.generated && ` Generated ${new Date(economy.meta.generated).toLocaleDateString('en-GB')}.`}
        </p>
      </div>
    </div>
  )
}
