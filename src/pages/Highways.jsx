import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Construction, AlertTriangle, Layers, Building2, Lightbulb, TrendingUp, TrendingDown, DollarSign, Wrench, Briefcase, FileText, Gavel, MapPin } from 'lucide-react'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line, Legend, ComposedChart } from 'recharts'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import { StatCard, StatBar } from '../components/ui/StatCard'
import { ChartCard, CHART_TOOLTIP_STYLE } from '../components/ui/ChartCard'
import CollapsibleSection from '../components/CollapsibleSection'
import DataFreshnessStamp from '../components/DataFreshnessStamp'
import { formatNumber } from '../utils/format'
import { CHART_COLORS, TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE } from '../utils/constants'
import './Highways.css'

export default function Highways() {
  const config = useCouncilConfig()
  const dataSources = config.data_sources || {}

  // Load data — no roadworks.json or ward_boundaries.json needed
  const { data: allData, loading, error } = useData(
    dataSources.highways
      ? ['/data/traffic.json', '/data/shared/highways_legal.json', '/data/shared/highways_assets.json']
      : null
  )

  // Load procurement pipeline data (separate useData to avoid conditional hook issues)
  const { data: procPipelineData } = useData('/data/shared/procurement_pipeline.json')
  const procPipeline = procPipelineData || null

  // Destructure data (safe even when null/loading)
  const [trafficData, legalData, assetsData] = allData || [null, null, null]
  const traffic = trafficData || null
  const legal = legalData || null
  const assets = assetsData || null
  const infrastructure = traffic?.road_infrastructure || null

  // Assets — derived chart data (all useMemo hooks MUST be before conditional returns)
  const assetChartData = useMemo(() => {
    if (!assets?.asset_categories) return []
    return assets.asset_categories
      .filter(c => c.grc_estimate != null)
      .map(c => ({
        name: c.category === 'Structures (Bridges & Retaining Walls)' ? 'Structures'
          : c.category === 'Footways & Cycleways' ? 'Footways'
          : c.category === 'Traffic Management & Signals' ? 'Traffic Mgmt'
          : c.category === 'Drainage (Gullies, Pipes, SuDS)' ? 'Drainage'
          : c.category,
        fullName: c.category, value: Math.round(c.grc_estimate / 1e6), fill: c.fill || '#8e8e93'
      }))
  }, [assets])

  const lifecycleData = useMemo(() => {
    if (!assets?.lifecycle_models) return []
    return assets.lifecycle_models.map(m => ({
      name: m.treatment,
      costKm: m.cost_per_km,
      lifespanYrs: m.lifespan_years,
      costPerYr: m.cost_per_km_per_year,
      effectiveness: m.effectiveness,
    }))
  }, [assets])

  const budgetTrendData = useMemo(() => {
    if (!assets?.budget_trend?.years) return []
    return assets.budget_trend.years
      .filter(y => y.net_revenue != null || y.capital_programme != null)
      .map(y => ({
        year: y.year.replace(/^20/, ''),
        fullYear: y.year,
        net: y.net_revenue ? Math.round(y.net_revenue / 1e6) : null,
        gross: y.total_expenditure ? Math.round(y.total_expenditure / 1e6) : null,
        capital: y.capital_programme ? Math.round(y.capital_programme / 1e6) : null,
        isBudget: y.data_type === 'budget_estimate',
      }))
  }, [assets])

  // Historic investment gap chart data
  const historicInvestmentData = useMemo(() => {
    if (!assets?.historic_investment?.annual_investment) return []
    return assets.historic_investment.annual_investment.map(y => ({
      year: y.year.replace(/^20/, ''),
      fullYear: y.year,
      invested: Math.round(y.total_capital / 1e6),
      needed: Math.round(y.estimated_need / 1e6),
      shortfall: Math.round(y.shortfall / 1e6),
      dft: Math.round(y.dft_grant / 1e6),
      lcc: Math.round(y.lcc_contribution / 1e6),
      isBudget: y.data_quality === 'budget_estimate',
      isEstimated: y.data_quality === 'estimated',
    }))
  }, [assets])

  // Guard: feature not enabled
  if (!dataSources.highways) {
    return (
      <div className="highways-page">
        <div className="hw-empty">
          <div className="hw-empty-icon">🚧</div>
          <h2>Highways data not available</h2>
          <p>Highways monitoring is not enabled for {config.council_name || 'this council'}.</p>
        </div>
      </div>
    )
  }

  if (loading) return <LoadingState message="Loading highways data..." />
  if (error) {
    return (
      <div className="highways-page">
        <div className="hw-empty">
          <div className="hw-empty-icon">⚠️</div>
          <h2>Failed to load highways data</h2>
          <p>Please try refreshing the page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="highways-page">
      {/* Hero */}
      <div className="hw-hero">
        <h1>
          <Construction size={28} style={{ verticalAlign: 'middle', marginRight: 8, color: '#ff9f0a' }} />
          Highways Department
        </h1>
        <p className="hw-subtitle">
          Lancashire County Council manages a highway asset base valued at £{assets?.network_summary?.gross_replacement_cost ? (assets.network_summary.gross_replacement_cost / 1e9).toFixed(0) : '10'}B (gross replacement cost) across a {assets?.network_summary?.total_length_km?.toLocaleString() || '7,142'}km road network — including {assets?.network_summary?.structures_count?.toLocaleString() || '2,009'} bridges and structures and {assets?.network_summary?.traffic_signals_count?.toLocaleString() || '5,778'} traffic signals.
        </p>
        {assets?.meta?.generated && <DataFreshnessStamp lastUpdated={assets.meta.generated} label="Highways data" />}
      </div>

      {/* CTA — View Live Roadworks Map */}
      <Link to="/roadworks" className="hw-cta-card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 24px', margin: '0 0 24px', background: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.25)', borderRadius: 12, textDecoration: 'none', color: 'inherit', transition: 'border-color 0.2s, background 0.2s' }}>
        <MapPin size={28} style={{ color: '#12B6CF', flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#12B6CF' }}>View Live Roadworks Map</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 2 }}>View live roadworks, traffic intelligence and corridor analysis</div>
        </div>
        <span style={{ marginLeft: 'auto', color: '#12B6CF', fontSize: '1.2rem', fontWeight: 700 }}>&rarr;</span>
      </Link>

      {/* Collapsible sections */}
      <div className="hw-sections">

        {/* 1. Road Infrastructure */}
        <CollapsibleSection
          title="Road Infrastructure"
          subtitle="Traffic signals, crossings, restrictions and infrastructure hotspots"
          severity="neutral"
          icon={<Layers size={18} />}
          count={infrastructure?.summary?.total_features || null}
          countLabel="features"
        >
          {infrastructure ? (
            <>
              {/* Summary grid */}
              <div className="hw-infra-summary-grid">
                {[
                  { label: 'Traffic Signals', value: infrastructure.summary?.traffic_signals, color: '#12B6CF' },
                  { label: 'Roundabouts', value: infrastructure.summary?.roundabouts, color: '#bf5af2' },
                  { label: 'Mini Roundabouts', value: infrastructure.summary?.mini_roundabouts, color: '#af52de' },
                  { label: 'Level Crossings', value: infrastructure.summary?.level_crossings, color: '#ff453a' },
                  { label: 'Narrow Roads', value: infrastructure.summary?.narrow_roads, color: '#ff9f0a' },
                  { label: 'Bridges', value: infrastructure.summary?.bridges, color: '#30d158' },
                  { label: 'Weight Restrictions', value: infrastructure.summary?.weight_restrictions, color: '#ff6d3b' },
                  { label: 'Height Restrictions', value: infrastructure.summary?.height_restrictions, color: '#ffd60a' },
                ].filter(item => item.value != null).map(({ label, value, color }) => (
                  <div key={label} className="hw-infra-summary-cell">
                    <div className="hw-infra-summary-value" style={{ color }}>{formatNumber(value)}</div>
                    <div className="hw-infra-summary-label">{label}</div>
                  </div>
                ))}
              </div>

              {/* Speed limit breakdown */}
              {infrastructure.speed_zones && Object.keys(infrastructure.speed_zones).length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>Speed Limit Distribution</div>
                  <div className="hw-speed-bar-container">
                    {Object.entries(infrastructure.speed_zones)
                      .sort(([a], [b]) => parseInt(a) - parseInt(b))
                      .map(([limit, data]) => {
                        const count = typeof data === 'number' ? data : data?.count || 0
                        const total = Object.values(infrastructure.speed_zones).reduce((sum, v) => sum + (typeof v === 'number' ? v : v?.count || 0), 0)
                        const pct = total > 0 ? (count / total) * 100 : 0
                        const colors = { '20': '#30d158', '30': '#12B6CF', '40': '#bf5af2', '50': '#ff9f0a', '60': '#ff6d3b', '70': '#ff453a' }
                        const barColor = colors[limit] || '#8e8e93'
                        return (
                          <div key={limit} className="hw-speed-bar-row">
                            <span className="hw-speed-bar-label">{limit}mph</span>
                            <div className="hw-speed-bar">
                              <div className="hw-speed-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
                            </div>
                            <span className="hw-speed-bar-value">{formatNumber(count)} ({pct.toFixed(1)}%)</span>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}

              {/* Infrastructure hotspots */}
              {infrastructure.hotspots && infrastructure.hotspots.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>Infrastructure Hotspots</div>
                  {infrastructure.hotspots.slice(0, 10).map((hs, i) => {
                    const sevClass = hs.severity === 'high' ? 'high' : hs.severity === 'medium' ? 'medium' : 'low'
                    return (
                      <div key={i} className="hw-hotspot-card">
                        <div className="hw-hotspot-header">
                          <span className="hw-hotspot-name">{hs.name || hs.location || `Hotspot ${i + 1}`}</span>
                          <span className={`hw-hotspot-severity hw-hotspot-severity--${sevClass}`}>
                            {hs.severity || 'unknown'}
                          </span>
                        </div>
                        {hs.detail && <div className="hw-hotspot-detail">{hs.detail}</div>}
                        <div className="hw-hotspot-meta">
                          {hs.nearby_works != null && <span>{hs.nearby_works} nearby works</span>}
                          {hs.feature_count != null && <span>{hs.feature_count} features</span>}
                          {hs.type && <span>{hs.type}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Level crossings table */}
              {infrastructure.level_crossings_detail && infrastructure.level_crossings_detail.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>Level Crossings</div>
                  <div className="hw-table-overflow">
                    <table className="hw-legal-table">
                      <thead>
                        <tr>
                          <th>Name / Location</th>
                          <th>Barrier Type</th>
                          <th>Nearby Works</th>
                        </tr>
                      </thead>
                      <tbody>
                        {infrastructure.level_crossings_detail.map((lc, i) => (
                          <tr key={i}>
                            <td className="hw-td-bold">{lc.name || lc.location || `Crossing ${i + 1}`}</td>
                            <td>{lc.barrier_type || lc.type || '-'}</td>
                            <td>{lc.nearby_works != null ? lc.nearby_works : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="hw-empty hw-empty--styled" style={{ padding: '24px 16px' }}>
              <div className="hw-empty-icon" style={{ fontSize: '2rem' }}>🔧</div>
              <h3>Infrastructure data being collected</h3>
              <p>Road infrastructure intelligence (traffic signals, crossings, restrictions) is currently being gathered for this area. Check back soon.</p>
            </div>
          )}
        </CollapsibleSection>

        {/* 2. Assets & Investment */}
        {assets && (
          <CollapsibleSection
            title="Assets &amp; Investment"
            subtitle={`£${(assets.network_summary?.gross_replacement_cost / 1e9).toFixed(0)}B asset base — road condition, true maintenance cost, lifecycle economics`}
            severity="neutral"
            icon={<Building2 size={18} />}
          >
            {/* Data quality notice */}
            <div className="hw-asset-notice">
              <AlertTriangle size={14} style={{ flexShrink: 0, color: '#ff9f0a' }} />
              <span>{assets.meta?.data_quality_note}</span>
            </div>

            {/* A. Asset Valuation Overview */}
            <div className="hw-assets-sub-heading">Network Asset Valuation</div>
            <div className="hw-asset-stat-row">
              <div className="hw-asset-stat">
                <div className="hw-asset-stat-value">£{(assets.network_summary?.gross_replacement_cost / 1e9).toFixed(0)}B</div>
                <div className="hw-asset-stat-label">Gross Replacement Cost</div>
                <div className="hw-asset-stat-note">CIPFA Transport Infrastructure Code</div>
              </div>
              <div className="hw-asset-stat">
                <div className="hw-asset-stat-value">{assets.network_summary?.total_length_km?.toLocaleString()}km</div>
                <div className="hw-asset-stat-label">Road Network</div>
                <div className="hw-asset-stat-note">{assets.network_summary?.total_length_miles?.toLocaleString()} miles managed by LCC</div>
              </div>
              <div className="hw-asset-stat">
                <div className="hw-asset-stat-value">{assets.network_summary?.structures_count?.toLocaleString()}</div>
                <div className="hw-asset-stat-label">Bridges &amp; Structures</div>
                <div className="hw-asset-stat-note">Each requiring periodic inspection</div>
              </div>
              <div className="hw-asset-stat">
                <div className="hw-asset-stat-value">{assets.network_summary?.traffic_signals_count?.toLocaleString()}</div>
                <div className="hw-asset-stat-label">Traffic Signals</div>
                <div className="hw-asset-stat-note">From OSM Overpass data</div>
              </div>
            </div>
            {assetChartData.length > 0 && (
              <ChartCard title="GRC by Asset Category (£M)" subtitle="Carriageways dominate at ~75% of total network replacement cost">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={assetChartData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                    <XAxis type="number" tick={AXIS_TICK_STYLE} tickFormatter={v => `£${v}M`} />
                    <YAxis type="category" dataKey="name" tick={{ ...AXIS_TICK_STYLE, fontSize: 11 }} width={120} />
                    <RechartsTooltip
                      {...CHART_TOOLTIP_STYLE}
                      formatter={(v, _, p) => [`£${Number(v).toLocaleString()}M`, p.payload.fullName]}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {assetChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* B. Road Condition Reality */}
            <div className="hw-assets-sub-heading" style={{ marginTop: 24 }}>Road Condition — {assets.road_condition?.current_year}</div>
            <div className="hw-condition-note">{assets.road_condition?.survey_method}</div>
            {['a_roads', 'bc_roads', 'unclassified'].map(key => {
              const labels = { a_roads: 'A Roads', bc_roads: 'B &amp; C Roads', unclassified: 'Unclassified (residential)' }
              const rc = assets.road_condition?.[key]
              if (!rc) return null
              const pct = rc.red_pct || 0
              const isCritical = key === 'unclassified' && pct > 20
              const isWarning = pct > 6
              const barColor = isCritical ? '#ff453a' : isWarning ? '#ff9f0a' : '#30d158'
              return (
                <div key={key} className="hw-condition-row">
                  <div className="hw-condition-label">{labels[key]}</div>
                  <div className="hw-condition-bar-track">
                    <div className="hw-condition-bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
                  </div>
                  <div className="hw-condition-pct" style={{ color: barColor }}>{pct.toFixed(1)}% red</div>
                  {rc.note && <div className="hw-condition-sub">{rc.note}</div>}
                </div>
              )
            })}
            <div className="hw-condition-insight">{assets.road_condition?.key_insight}</div>

            {/* Condition trend chart */}
            {assets.road_condition?.trend?.some(t => t.a_red != null || t.bc_red != null || t.uc_red != null) && (
              <ChartCard title="Road Condition Trend — % in Red Category" subtitle="Higher = worse. Note: unclassified roads on different scale to classified.">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={assets.road_condition.trend.filter(t => t.a_red != null || t.bc_red != null || t.uc_red != null)} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="year" tick={{ ...AXIS_TICK_STYLE, fontSize: 11 }} tickFormatter={y => y.replace(/^20/, '').replace(' (survey)', '')} />
                    <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `${v}%`} />
                    <RechartsTooltip {...CHART_TOOLTIP_STYLE} formatter={(v, n) => [`${v}%`, n === 'a_red' ? 'A Roads' : n === 'bc_red' ? 'B&C Roads' : 'Unclassified']} />
                    <Legend formatter={v => ({ a_red: 'A Roads', bc_red: 'B&C Roads', uc_red: 'Unclassified' }[v] || v)} />
                    <Line type="monotone" dataKey="a_red" stroke="#30d158" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="bc_red" stroke="#ff9f0a" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="uc_red" stroke="#ff453a" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="none" connectNulls />
                  </LineChart>
                </ResponsiveContainer>
                <div className="hw-condition-transition">{assets.road_condition?.transition_note}</div>
              </ChartCard>
            )}

            {/* C. True Cost of Getting Roads Right */}
            <div className="hw-assets-sub-heading" style={{ marginTop: 24 }}>
              <DollarSign size={15} style={{ verticalAlign: 'middle', marginRight: 6, color: '#ff453a' }} />
              True Cost of Getting Roads Right
            </div>
            <div className="hw-cost-analysis">
              <div className="hw-cost-grid">
                <div className="hw-cost-card hw-cost-card--backlog">
                  <div className="hw-cost-card-label">Maintenance Backlog</div>
                  <div className="hw-cost-card-value">£{(assets.investment_analysis?.lcc_maintenance_backlog / 1e6).toFixed(0)}M</div>
                  <div className="hw-cost-card-note">{assets.investment_analysis?.lcc_backlog_source}</div>
                </div>
                <div className="hw-cost-card hw-cost-card--steadystate">
                  <div className="hw-cost-card-label">Practical Steady-State Need</div>
                  <div className="hw-cost-card-value">£{(assets.investment_analysis?.practical_steady_state / 1e6).toFixed(0)}M<span className="hw-cost-card-unit">/yr</span></div>
                  <div className="hw-cost-card-note">Based on 25-year resurfacing cycle + all asset classes. The theoretical CIPFA figure is £400M/yr.</div>
                </div>
                <div className="hw-cost-card hw-cost-card--actual">
                  <div className="hw-cost-card-label">2026/27 Capital Programme</div>
                  <div className="hw-cost-card-value">£{(assets.investment_analysis?.current_best_annual_capital / 1e6).toFixed(0)}M</div>
                  <div className="hw-cost-card-note">Budgeted. {assets.investment_analysis?.capital_as_pct_practical_steady_state}% of practical steady-state need.</div>
                </div>
                <div className="hw-cost-card hw-cost-card--gap">
                  <div className="hw-cost-card-label">Years to Clear Backlog</div>
                  <div className="hw-cost-card-value">~{Math.round(assets.investment_analysis?.lcc_maintenance_backlog / assets.investment_analysis?.current_best_annual_capital)}yr</div>
                  <div className="hw-cost-card-note">At current spend, assuming zero new deterioration (not achievable in practice).</div>
                </div>
              </div>
              <div className="hw-cost-insight">{assets.investment_analysis?.key_insight}</div>
            </div>

            {/* C2. 14-Year Historic Investment Gap */}
            {historicInvestmentData.length > 0 && (
              <>
                <div className="hw-assets-sub-heading" style={{ marginTop: 24 }}>
                  <TrendingDown size={15} style={{ verticalAlign: 'middle', marginRight: 6, color: '#ff453a' }} />
                  {assets.historic_investment?.section_title || 'Historic Investment Gap (2013\u20132027)'}
                </div>
                <div className="hw-investment-summary">{assets.historic_investment?.summary}</div>

                {/* Cumulative stats */}
                {assets.historic_investment?.cumulative_analysis && (
                  <div className="hw-cost-grid" style={{ marginBottom: 16 }}>
                    <div className="hw-cost-card hw-cost-card--actual">
                      <div className="hw-cost-card-label">Total Invested (14 years)</div>
                      <div className="hw-cost-card-value">£{(assets.historic_investment.cumulative_analysis.total_invested / 1e6).toFixed(0)}M</div>
                      <div className="hw-cost-card-note">Avg £{(assets.historic_investment.cumulative_analysis.average_annual_investment / 1e6).toFixed(0)}M/yr capital</div>
                    </div>
                    <div className="hw-cost-card hw-cost-card--steadystate">
                      <div className="hw-cost-card-label">Total Needed (14 years)</div>
                      <div className="hw-cost-card-value">£{(assets.historic_investment.cumulative_analysis.total_needed / 1e6).toFixed(0)}M</div>
                      <div className="hw-cost-card-note">Avg £{(assets.historic_investment.cumulative_analysis.average_annual_need / 1e6).toFixed(0)}M/yr estimated need</div>
                    </div>
                    <div className="hw-cost-card hw-cost-card--backlog">
                      <div className="hw-cost-card-label">Cumulative Shortfall</div>
                      <div className="hw-cost-card-value">£{(assets.historic_investment.cumulative_analysis.cumulative_shortfall / 1e6).toFixed(0)}M</div>
                      <div className="hw-cost-card-note">Only {assets.historic_investment.cumulative_analysis.investment_as_pct_of_need}% of need was met</div>
                    </div>
                    <div className="hw-cost-card hw-cost-card--gap">
                      <div className="hw-cost-card-label">National Resurfacing Cycle</div>
                      <div className="hw-cost-card-value">{assets.historic_investment?.national_context?.resurfacing_cycle_years || 93}yr</div>
                      <div className="hw-cost-card-note">At current rates, each road is resurfaced once every 93 years. Industry guidance suggests a 25-year cycle.</div>
                    </div>
                  </div>
                )}

                {/* Investment gap chart */}
                <ChartCard title="Capital Investment vs Estimated Need (£M/year)" subtitle="Red line = estimated need. Orange bars = DfT grant. Blue bars = LCC contribution. The gap between the bars and the line is the annual shortfall.">
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={historicInvestmentData} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                      <XAxis dataKey="year" tick={{ ...AXIS_TICK_STYLE, fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={50} />
                      <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `£${v}M`} domain={[0, 'auto']} />
                      <RechartsTooltip
                        {...CHART_TOOLTIP_STYLE}
                        formatter={(v, n, p) => {
                          const labels = { dft: 'DfT Grant', lcc: 'LCC Contribution', needed: 'Estimated Need' }
                          const qual = p.payload.isBudget ? ' (budgeted)' : p.payload.isEstimated ? ' (est.)' : ''
                          return [`£${v}M${qual}`, labels[n] || n]
                        }}
                      />
                      <Legend formatter={v => ({ dft: 'DfT Grant', lcc: 'LCC Contribution', needed: 'Estimated Need' }[v] || v)} />
                      <Bar dataKey="dft" stackId="a" fill="#ff9f0a" radius={[0, 0, 0, 0]} name="dft" />
                      <Bar dataKey="lcc" stackId="a" fill="#12B6CF" radius={[2, 2, 0, 0]} name="lcc" />
                      <Line type="monotone" dataKey="needed" stroke="#ff453a" strokeWidth={2} dot={{ r: 3, fill: '#ff453a' }} name="needed" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* National context */}
                {assets.historic_investment?.national_context && (
                  <div style={{ marginTop: 16 }}>
                    <div className="hw-assets-sub-heading">National Context (ALARM Survey 2025)</div>
                    <div className="hw-cost-grid">
                      <div className="hw-cost-card hw-cost-card--backlog">
                        <div className="hw-cost-card-label">National Backlog</div>
                        <div className="hw-cost-card-value">£{(assets.historic_investment?.national_context.national_backlog / 1e9).toFixed(1)}B</div>
                        <div className="hw-cost-card-note">AIA ALARM Survey 2025. Lancashire = ~{assets.historic_investment?.national_context.lancashire_backlog_pct_of_national}%</div>
                      </div>
                      <div className="hw-cost-card hw-cost-card--gap">
                        <div className="hw-cost-card-label">Roads &lt;5yr Life Left</div>
                        <div className="hw-cost-card-value">{formatNumber(assets.historic_investment?.national_context.roads_under_5yr_life_miles)} mi</div>
                        <div className="hw-cost-card-note">Nationally. {assets.historic_investment?.national_context.roads_under_15yr_life_pct}% of network has &lt;15yr life remaining</div>
                      </div>
                      <div className="hw-cost-card hw-cost-card--steadystate">
                        <div className="hw-cost-card-label">Funding Disparity</div>
                        <div className="hw-cost-card-value">{assets.historic_investment?.national_context.funding_disparity_ratio}×</div>
                        <div className="hw-cost-card-note">National Highways gets £{formatNumber(assets.historic_investment?.national_context.national_highways_per_mile)}/mile vs £{formatNumber(assets.historic_investment?.national_context.local_authority_per_mile)}/mile for local roads</div>
                      </div>
                      <div className="hw-cost-card hw-cost-card--actual">
                        <div className="hw-cost-card-label">Decade of Spend</div>
                        <div className="hw-cost-card-value">£{(assets.historic_investment?.national_context.decade_spend_total / 1e9).toFixed(0)}B</div>
                        <div className="hw-cost-card-note">{assets.historic_investment?.national_context.decade_spend_note}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* What would it actually cost — scenarios */}
                {assets.historic_investment?.what_it_would_cost?.scenarios && (
                  <div style={{ marginTop: 16 }}>
                    <div className="hw-assets-sub-heading">
                      <TrendingUp size={15} style={{ verticalAlign: 'middle', marginRight: 6, color: '#12B6CF' }} />
                      {assets.historic_investment?.what_it_would_cost.title}
                    </div>
                    <div className="hw-scenario-grid">
                      {assets.historic_investment?.what_it_would_cost.scenarios.map((s, i) => (
                        <div key={i} className={`hw-scenario-card hw-scenario-card--${s.severity}`}>
                          <div className="hw-scenario-name">{s.name}</div>
                          <div className="hw-scenario-stats">
                            <div className="hw-scenario-stat">
                              <span className="hw-scenario-stat-label">Annual capital</span>
                              <span className="hw-scenario-stat-value">£{(s.annual_capital / 1e6).toFixed(0)}M</span>
                            </div>
                            <div className="hw-scenario-stat">
                              <span className="hw-scenario-stat-label">10yr total</span>
                              <span className="hw-scenario-stat-value">£{(s.total_10yr_cost / 1e6).toFixed(0)}M</span>
                            </div>
                            <div className="hw-scenario-stat">
                              <span className="hw-scenario-stat-label">Backlog cleared</span>
                              <span className="hw-scenario-stat-value">{s.years_to_clear_backlog}</span>
                            </div>
                          </div>
                          <div className="hw-scenario-outcome">{s.outcome}</div>
                        </div>
                      ))}
                    </div>
                    <div className="hw-cost-insight" style={{ marginTop: 12 }}>
                      {assets.historic_investment?.what_it_would_cost.key_finding}
                    </div>
                    {assets.historic_investment?.what_it_would_cost.lcc_statement && (
                      <div className="hw-lcc-statement">
                        <span className="hw-lcc-statement-label">LCC&apos;s own assessment: </span>
                        {assets.historic_investment?.what_it_would_cost.lcc_statement}
                      </div>
                    )}
                  </div>
                )}

                {/* BCIS Forecasts within investment context */}
                {assets.cost_inflation?.bcis_forecasts_2025_2030 && (
                  <div style={{ marginTop: 16 }}>
                    <div className="hw-assets-sub-heading">BCIS Cost Forecasts to 2030</div>
                    <div className="hw-asset-stat-row">
                      <div className="hw-asset-stat">
                        <div className="hw-asset-stat-value" style={{ color: '#ff453a' }}>+{assets.cost_inflation.bcis_forecasts_2025_2030.civil_engineering_tender_prices_pct}%</div>
                        <div className="hw-asset-stat-label">Civil Engineering Tenders</div>
                      </div>
                      <div className="hw-asset-stat">
                        <div className="hw-asset-stat-value" style={{ color: '#ff9f0a' }}>+{assets.cost_inflation.bcis_forecasts_2025_2030.labour_costs_pct}%</div>
                        <div className="hw-asset-stat-label">Labour Costs</div>
                      </div>
                      <div className="hw-asset-stat">
                        <div className="hw-asset-stat-value" style={{ color: '#ff9f0a' }}>+{assets.cost_inflation.bcis_forecasts_2025_2030.building_costs_pct}%</div>
                        <div className="hw-asset-stat-label">Building Costs</div>
                      </div>
                    </div>
                    <p className="hw-muted-note">{assets.cost_inflation.bcis_forecasts_2025_2030.note}</p>
                  </div>
                )}

                {/* Backlog timeline */}
                {assets.cost_inflation?.backlog_inflation_impact && (
                  <div style={{ marginTop: 16 }}>
                    <div className="hw-assets-sub-heading">Projected Backlog Growth With Inflation</div>
                    <div className="hw-backlog-timeline">
                      <div className="hw-backlog-step">
                        <span className="hw-backlog-year">Today</span>
                        <span className="hw-backlog-amt">£{(assets.cost_inflation.backlog_inflation_impact.backlog_today / 1e6).toFixed(0)}M</span>
                      </div>
                      <span className="hw-backlog-arrow">&rarr;</span>
                      <div className="hw-backlog-step">
                        <span className="hw-backlog-year">+5 years</span>
                        <span className="hw-backlog-amt">£{(assets.cost_inflation.backlog_inflation_impact.backlog_in_5yr / 1e6).toFixed(0)}M</span>
                      </div>
                      <span className="hw-backlog-arrow">&rarr;</span>
                      <div className="hw-backlog-step">
                        <span className="hw-backlog-year">+10 years</span>
                        <span className="hw-backlog-amt">£{(assets.cost_inflation.backlog_inflation_impact.backlog_in_10yr / 1e6).toFixed(0)}M</span>
                      </div>
                    </div>
                    <p className="hw-muted-note">{assets.cost_inflation.backlog_inflation_impact.note}</p>
                  </div>
                )}
              </>
            )}

            {/* Revenue Expenditure Trend */}
            {budgetTrendData.length > 0 && (
              <>
                <ChartCard title="Highways Revenue & Capital Expenditure (£M)" subtitle="Revenue: confirmed outturn (GOV.UK MHCLG). Capital: from DfT allocations and LCC cabinet reports." style={{ marginTop: 16 }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={budgetTrendData} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                      <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
                      <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `£${v}M`} />
                      <RechartsTooltip
                        {...CHART_TOOLTIP_STYLE}
                        formatter={(v, n, p) => {
                          const label = n === 'net' ? 'Net Revenue' : n === 'gross' ? 'Gross Expenditure' : 'Capital Programme'
                          const suffix = p.payload.isBudget ? ' (budgeted)' : ' (confirmed outturn)'
                          return [`£${v}M${suffix}`, label]
                        }}
                      />
                      <Legend formatter={v => ({ net: 'Net Revenue', gross: 'Gross Expenditure', capital: 'Capital Programme' }[v] || v)} />
                      <Bar dataKey="gross" fill="#12B6CF" radius={[2, 2, 0, 0]} name="gross" />
                      <Bar dataKey="net" fill="#30d158" radius={[2, 2, 0, 0]} name="net" />
                      <Bar dataKey="capital" fill="#ff9f0a" radius={[2, 2, 0, 0]} name="capital" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <p className="hw-budget-note">* 2025/26 and 2026/27 figures are budgeted allocations, not confirmed outturn</p>
              </>
            )}

            {/* Maintenance contract performance */}
            {assets.maintenance_contract_performance && (
              <div style={{ marginTop: 16 }}>
                <div className="hw-assets-sub-heading">New Maintenance Contract Performance ({assets.maintenance_contract_performance.year})</div>
                <div className="hw-cost-grid">
                  <div className="hw-cost-card hw-cost-card--actual">
                    <div className="hw-cost-card-label">Defect Reduction</div>
                    <div className="hw-cost-card-value">{assets.maintenance_contract_performance.defect_reduction_pct}%</div>
                    <div className="hw-cost-card-note">{formatNumber(assets.maintenance_contract_performance.defects_before)} &rarr; {formatNumber(assets.maintenance_contract_performance.defects_after)} defects</div>
                  </div>
                  <div className="hw-cost-card hw-cost-card--steadystate">
                    <div className="hw-cost-card-label">Repair Size Increase</div>
                    <div className="hw-cost-card-value">{assets.maintenance_contract_performance.avg_repair_size_after_m2 / assets.maintenance_contract_performance.avg_repair_size_before_m2}×</div>
                    <div className="hw-cost-card-note">{assets.maintenance_contract_performance.avg_repair_size_before_m2}m² &rarr; {assets.maintenance_contract_performance.avg_repair_size_after_m2}m² average (more durable)</div>
                  </div>
                  <div className="hw-cost-card hw-cost-card--actual">
                    <div className="hw-cost-card-label">Cost per m² Saving</div>
                    <div className="hw-cost-card-value">{assets.maintenance_contract_performance.cost_saving_pct}%</div>
                    <div className="hw-cost-card-note">£{assets.maintenance_contract_performance.avg_repair_cost_before_per_m2}/m² &rarr; £{assets.maintenance_contract_performance.avg_repair_cost_after_per_m2}/m²</div>
                  </div>
                </div>
              </div>
            )}

            {/* D. Lifecycle Economics */}
            <div className="hw-assets-sub-heading" style={{ marginTop: 24 }}>
              <Wrench size={15} style={{ verticalAlign: 'middle', marginRight: 6, color: '#bf5af2' }} />
              Lifecycle Economics — Which Treatment is Best Value?
            </div>
            <div className="hw-lifecycle-intro">Cost per km per year of life provides a comparison across treatment types. On this measure, surface dressing (£3,750/yr) costs approximately one-fifth of full reconstruction (£18,750/yr).</div>
            <div className="hw-table-overflow">
              <table className="hw-legal-table">
                <thead>
                  <tr>
                    <th>Treatment</th>
                    <th>Cost/km</th>
                    <th>Lifespan</th>
                    <th className="hw-th-highlight">£/km/year</th>
                    <th>Best for</th>
                  </tr>
                </thead>
                <tbody>
                  {lifecycleData.map((m, i) => {
                    const isBest = m.effectiveness === 'best_value'
                    const isWorst = m.effectiveness === 'most_expensive'
                    return (
                      <tr key={i} className={isBest ? 'hw-tr-best' : isWorst ? 'hw-tr-worst' : ''}>
                        <td className="hw-td-bold">
                          {m.name}
                          {isBest && <span className="hw-lifecycle-badge hw-lifecycle-best">Best value</span>}
                          {isWorst && <span className="hw-lifecycle-badge hw-lifecycle-worst">Most expensive</span>}
                        </td>
                        <td>£{m.costKm?.toLocaleString()}</td>
                        <td>{m.lifespanYrs} years</td>
                        <td className="hw-td-cost" style={{ color: isBest ? '#30d158' : isWorst ? '#ff453a' : 'inherit' }}>
                          £{m.costPerYr?.toLocaleString()}
                        </td>
                        <td className="hw-td-secondary">{assets.lifecycle_models?.[i]?.suitable_for}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* E. Valuation Questions */}
            {assets.valuation_questions?.questions?.length > 0 && (
              <>
                <div className="hw-assets-sub-heading" style={{ marginTop: 24 }}>
                  <Lightbulb size={15} style={{ verticalAlign: 'middle', marginRight: 6, color: '#ffd60a' }} />
                  Valuation Questions — Is the £10B Figure Right?
                </div>
                <div className="hw-valuation-intro">{assets.valuation_questions.intro}</div>
                <div className="hw-valuation-grid">
                  {assets.valuation_questions.questions.map((q, i) => (
                    <div key={i} className="hw-valuation-card">
                      <div className="hw-valuation-title">{q.title}</div>
                      <div className="hw-valuation-question">{q.question}</div>
                      <div className="hw-valuation-analysis">{q.analysis}</div>
                      <div className="hw-valuation-implication">
                        <span className="hw-valuation-imp-label">Implication: </span>
                        {q.implication}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* F. Innovation Opportunities */}
            {assets.innovation_opportunities?.length > 0 && (
              <>
                <div className="hw-assets-sub-heading" style={{ marginTop: 24 }}>
                  <Lightbulb size={15} style={{ verticalAlign: 'middle', marginRight: 6, color: '#30d158' }} />
                  Innovation Opportunities
                </div>
                <div className="hw-innovation-grid">
                  {assets.innovation_opportunities.map((opp, i) => (
                    <div key={i} className="hw-innovation-card">
                      <div className="hw-innovation-header">
                        <span className="hw-innovation-title">{opp.title}</span>
                        <span className="hw-innovation-cat">{opp.category}</span>
                      </div>
                      <div className="hw-innovation-status-row">
                        <span className={`hw-innovation-status hw-innovation-status--${opp.status.toLowerCase().includes('implement') ? 'active' : opp.status.toLowerCase().includes('mandatory') ? 'warning' : 'opportunity'}`}>
                          {opp.status}
                        </span>
                        {opp.payback_years && <span className="hw-innovation-payback">{opp.payback_years}yr payback</span>}
                      </div>
                      <div className="hw-innovation-value">{opp.value_summary}</div>
                      <div className="hw-innovation-lancashire">{opp.lancashire_angle}</div>
                      {opp.risk_note && <div className="hw-innovation-risk">{opp.risk_note}</div>}
                      <div className="hw-innovation-policy">{opp.policy_driver}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* G. Asset Management Framework */}
            {assets.asset_management_framework && (
              <>
                <div className="hw-assets-sub-heading" style={{ marginTop: 24 }}>Asset Management Framework</div>
                <div className="hw-table-overflow" style={{ marginBottom: 12 }}>
                  <table className="hw-legal-table">
                    <thead><tr><th>Legislation</th><th>Section</th><th>Duty</th></tr></thead>
                    <tbody>
                      {assets.asset_management_framework.legislation?.map((l, i) => (
                        <tr key={i}>
                          <td className="hw-td-blue">{l.act}</td>
                          <td>{l.section}</td>
                          <td>{l.duty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="hw-table-overflow">
                  <table className="hw-legal-table">
                    <thead><tr><th>Standard</th><th>Version</th><th>Purpose</th></tr></thead>
                    <tbody>
                      {assets.asset_management_framework.standards?.map((s, i) => (
                        <tr key={i}>
                          <td className="hw-td-bold">{s.standard}</td>
                          <td style={{ color: '#8e8e93', fontSize: '0.8rem' }}>{s.version}</td>
                          <td>{s.purpose}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CollapsibleSection>
        )}

        {/* 3. Construction Cost Inflation */}
        {assets?.cost_inflation && (
          <CollapsibleSection
            title="Construction Cost Inflation"
            subtitle={`Road construction costs +${assets.cost_inflation.indices?.construction_infrastructure_2015_2025 || 45}% since 2015 — outpacing CPI (${assets.cost_inflation.indices?.cpi_cumulative_2015_2025 || 40}%)`}
            severity="warning"
            icon={<TrendingUp size={18} />}
          >
            {/* Buying power insight */}
            <div className="hw-inflation-insight">
              <strong>Buying power in real terms:</strong> LCC&apos;s 2026/27 highways capital budget is £72M, up from £{assets.cost_inflation.buying_power_analysis?.budget_2015 ? (assets.cost_inflation.buying_power_analysis.budget_2015 / 1e6).toFixed(0) : '25'}M in 2015. However, construction costs have risen {assets.cost_inflation.indices?.construction_infrastructure_2015_2025 || 45}% over the same period. Adjusted for inflation, £72M purchases approximately £{assets.cost_inflation.buying_power_analysis?.budget_2027_in_2015_terms ? (assets.cost_inflation.buying_power_analysis.budget_2027_in_2015_terms / 1e6).toFixed(0) : '50'}M of 2015-equivalent road work.
            </div>

            {/* Component costs bar chart */}
            <div className="hw-assets-sub-heading">Material &amp; Labour Cost Increases (2015&ndash;2025)</div>
            {assets.cost_inflation.component_costs?.length > 0 && (
              <ChartCard title="">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={assets.cost_inflation.component_costs.map(c => ({
                    name: c.material,
                    change: c.change_pct,
                    fill: c.change_pct >= 80 ? '#ff453a' : c.change_pct >= 50 ? '#ff9f0a' : '#30d158'
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="name" tick={AXIS_TICK_STYLE} angle={-25} textAnchor="end" height={80} />
                    <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `+${v}%`} />
                    <RechartsTooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v) => [`+${v}%`, 'Change since 2015']} />
                    <Bar dataKey="change" radius={[4, 4, 0, 0]}>
                      {assets.cost_inflation.component_costs.map((c, i) => (
                        <Cell key={i} fill={c.change_pct >= 80 ? '#ff453a' : c.change_pct >= 50 ? '#ff9f0a' : '#30d158'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* Component detail cards */}
            <div className="hw-inflation-grid">
              {assets.cost_inflation.component_costs?.map((c, i) => (
                <div key={i} className="hw-inflation-card">
                  <div className="hw-inflation-card-head">
                    <span className="hw-inflation-material">{c.material}</span>
                    <span className={`hw-inflation-pct ${c.change_pct >= 80 ? 'extreme' : c.change_pct >= 50 ? 'high' : ''}`}>+{c.change_pct}%</span>
                  </div>
                  <p className="hw-inflation-note">{c.note}</p>
                  <span className="hw-inflation-src">{c.source}</span>
                </div>
              ))}
            </div>

            <p className="hw-source-note">{assets.cost_inflation.source_note}</p>
          </CollapsibleSection>
        )}

        {/* 4. Future Pressures on the Network */}
        {assets?.future_outlook && (
          <CollapsibleSection
            title="Future Pressures on the Network"
            subtitle={assets.future_outlook.summary?.slice(0, 120) + '\u2026'}
            severity="warning"
            icon={<TrendingDown size={18} />}
          >
            <div className="hw-future-grid">
              {/* Population */}
              {assets.future_outlook.population && (
                <div className="hw-future-card">
                  <div className="hw-future-icon">👥</div>
                  <div className="hw-future-body">
                    <div className="hw-future-head">
                      <h4>Population Growth</h4>
                      <span className="hw-future-stat">+{assets.future_outlook.population.growth_pct_25yr}%</span>
                    </div>
                    <p>{assets.future_outlook.population.highway_impact}</p>
                    <span className="hw-future-src">{assets.future_outlook.population.source}</span>
                  </div>
                </div>
              )}

              {/* EV Transition */}
              {assets.future_outlook.ev_transition && (
                <div className="hw-future-card hw-future-card--warning">
                  <div className="hw-future-icon">🔋</div>
                  <div className="hw-future-body">
                    <div className="hw-future-head">
                      <h4>Electric Vehicle Weight</h4>
                      <span className="hw-future-stat">{assets.future_outlook.ev_transition.ev_weight_premium_pct}% heavier</span>
                    </div>
                    <p>{assets.future_outlook.ev_transition.highway_impact}</p>
                    <span className="hw-future-src">{assets.future_outlook.ev_transition.source}</span>
                  </div>
                </div>
              )}

              {/* LGV Growth */}
              {assets.future_outlook.lgv_growth && (
                <div className="hw-future-card">
                  <div className="hw-future-icon">🚚</div>
                  <div className="hw-future-body">
                    <div className="hw-future-head">
                      <h4>Light Goods Vehicle Growth</h4>
                      <span className="hw-future-stat">+{assets.future_outlook.lgv_growth.lgv_increase_2010_2023_pct}%</span>
                    </div>
                    <p>{assets.future_outlook.lgv_growth.highway_impact}</p>
                    <span className="hw-future-src">{assets.future_outlook.lgv_growth.source}</span>
                  </div>
                </div>
              )}

              {/* Climate Change */}
              {assets.future_outlook.climate_change && (
                <div className="hw-future-card hw-future-card--danger">
                  <div className="hw-future-icon">🌧️</div>
                  <div className="hw-future-body">
                    <div className="hw-future-head">
                      <h4>Climate-Related Deterioration</h4>
                      <span className="hw-future-stat">+{assets.future_outlook.climate_change.bc_roads_deterioration_2024_25_pct}% deterioration</span>
                    </div>
                    <p>{assets.future_outlook.climate_change.highway_impact}</p>
                    <span className="hw-future-src">{assets.future_outlook.climate_change.source}</span>
                  </div>
                </div>
              )}

              {/* Autonomous Vehicles */}
              {assets.future_outlook.autonomous_vehicles && (
                <div className="hw-future-card">
                  <div className="hw-future-icon">🤖</div>
                  <div className="hw-future-body">
                    <div className="hw-future-head">
                      <h4>Autonomous Vehicles</h4>
                      <span className="hw-future-stat">Act 2024</span>
                    </div>
                    <p>{assets.future_outlook.autonomous_vehicles.highway_impact}</p>
                    <span className="hw-future-src">{assets.future_outlook.autonomous_vehicles.source}</span>
                  </div>
                </div>
              )}

              {/* Motoring Tax Crisis */}
              {assets.future_outlook.motoring_tax_crisis && (
                <div className="hw-future-card hw-future-card--warning">
                  <div className="hw-future-icon">💰</div>
                  <div className="hw-future-body">
                    <div className="hw-future-head">
                      <h4>Motoring Tax Revenue Pressure</h4>
                      <span className="hw-future-stat">£{(assets.future_outlook.motoring_tax_crisis.cost_of_freeze_since_2011 / 1e9).toFixed(0)}B lost</span>
                    </div>
                    <p>{assets.future_outlook.motoring_tax_crisis.highway_impact}</p>
                    <span className="hw-future-src">{assets.future_outlook.motoring_tax_crisis.source}</span>
                  </div>
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* 5. Highways Spending Analysis */}
        {assets?.spending_integration && assets.spending_integration.top_contractors?.length > 0 && (
          <CollapsibleSection
            title="Highways Spending Analysis"
            subtitle={`£${assets.spending_integration.total_identifiable_highways_spend ? (assets.spending_integration.total_identifiable_highways_spend / 1e6).toFixed(1) : '8.1'}M identifiable spend across ${assets.spending_integration.budget_departments_count || 42} department codes`}
            severity="neutral"
            icon={<DollarSign size={18} />}
          >
            <p className="hw-muted-note" style={{ marginBottom: 16 }}>{assets.spending_integration.data_source}</p>

            {/* Top contractors chart */}
            <ChartCard title="Top Highways Contractors by Annual Spend">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={assets.spending_integration.top_contractors.map(c => ({
                  name: c.supplier.split(' ').slice(0, 2).join(' '),
                  spend: c.annual_spend,
                  share: c.share_pct
                }))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis type="number" tick={AXIS_TICK_STYLE} tickFormatter={v => `£${(v / 1e6).toFixed(1)}M`} />
                  <YAxis type="category" dataKey="name" tick={AXIS_TICK_STYLE} width={120} />
                  <RechartsTooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v, n) => [n === 'share' ? `${v}%` : `£${(v / 1e6).toFixed(1)}M`, n === 'share' ? 'Market share' : 'Annual spend']} />
                  <Bar dataKey="spend" fill="#ff9f0a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Contractor detail table */}
            <div className="hw-table-overflow">
              <table className="hw-legal-table">
                <thead>
                  <tr>
                    <th>Contractor</th>
                    <th>Annual Spend</th>
                    <th>Share</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.spending_integration.top_contractors.map((c, i) => (
                    <tr key={i}>
                      <td><strong>{c.supplier}</strong></td>
                      <td>£{(c.annual_spend / 1e6).toFixed(1)}M</td>
                      <td style={{ color: c.share_pct > 50 ? '#ff453a' : '#ff9f0a', fontWeight: 600 }}>{c.share_pct}%</td>
                      <td className="hw-td-muted">{c.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Concentration warning */}
            <div className="hw-concentration-note">
              {assets.spending_integration.concentration_note}
            </div>

            <p className="hw-muted-note">{assets.spending_integration.cross_reference_note}</p>
          </CollapsibleSection>
        )}

        {/* 6. Highways Procurement Pipeline (LGR Contract Analysis) */}
        {procPipeline?.service_tiers?.upper_tier?.contracts?.highways && (() => {
          const hw = procPipeline.service_tiers.upper_tier.contracts.highways
          const dft = hw.dft_settlement
          return (
            <CollapsibleSection
              title="Highways Procurement Pipeline"
              subtitle={`${hw.exercises?.length || 9} LCC exercises worth £${(hw.total_value / 1e6).toFixed(0)}M + 3 highway authority contracts — all crossing LGR vesting day`}
              severity="warning"
              icon={<Briefcase size={18} />}
            >
              <p className="hw-muted-note" style={{ marginBottom: 16 }}>
                LCC&apos;s March 2026 cabinet procurement pipeline includes {hw.exercises?.length || 9} highways exercises
                totalling £{(hw.total_value / 1e6).toFixed(0)}M. All are 4-year contracts crossing the proposed LGR vesting day.
                Additionally, Blackpool and Blackburn (as separate highway authorities) have their own active contracts.
              </p>

              {/* Stat cards */}
              <StatBar>
                <StatCard value={`£${(hw.total_value / 1e6).toFixed(0)}M`} label="LCC highways pipeline" icon="📋" />
                <StatCard value={hw.exercises?.length || 9} label="Procurement exercises" icon="📄" />
                <StatCard value="3" label="Highway authorities" icon="🛣️" highlight />
                {dft && <StatCard value={`£${(dft.total / 1e6).toFixed(0)}M`} label="DfT 4-year settlement" icon="💰" />}
              </StatBar>

              {/* LCC exercises table */}
              <div className="hw-assets-sub-heading" style={{ marginTop: 20 }}>
                <FileText size={15} style={{ verticalAlign: 'middle', marginRight: 6, color: '#12B6CF' }} />
                LCC Highways Exercises (March 2026 Pipeline)
              </div>
              <div className="hw-table-overflow">
                <table className="hw-legal-table">
                  <thead>
                    <tr>
                      <th>Exercise</th>
                      <th>Value</th>
                      <th>Term</th>
                      <th>Geographic Lots</th>
                      <th>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(hw.exercises || []).map((ex, i) => (
                      <tr key={i}>
                        <td>
                          <strong>{ex.title}</strong>
                          {ex.note && <div style={{ fontSize: '0.72rem', color: '#8e8e93', marginTop: 2 }}>{ex.note}</div>}
                        </td>
                        <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>£{(ex.value / 1e6).toFixed(1)}M</td>
                        <td>{ex.term}</td>
                        <td>{ex.geographic_lots || '\u2014'}</td>
                        <td>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 600,
                            background: ex.risk === 'critical' ? 'rgba(255,69,58,0.15)' : ex.risk === 'high' ? 'rgba(255,159,10,0.15)' : 'rgba(48,209,88,0.15)',
                            color: ex.risk === 'critical' ? '#ff453a' : ex.risk === 'high' ? '#ff9f0a' : '#30d158'
                          }}>
                            {ex.risk}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Unitary highway authority contracts */}
              {hw.unitary_contracts?.length > 0 && (
                <>
                  <div className="hw-assets-sub-heading" style={{ marginTop: 20 }}>
                    Blackpool &amp; Blackburn Highway Authority Contracts
                  </div>
                  <p className="hw-muted-note" style={{ marginBottom: 10 }}>
                    As separate highway authorities, Blackpool and Blackburn with Darwen have their own highways contracts
                    that must also be integrated under LGR.
                  </p>
                  <div className="hw-table-overflow">
                    <table className="hw-legal-table">
                      <thead>
                        <tr>
                          <th>Contract</th>
                          <th>Authority</th>
                          <th>Value</th>
                          <th>Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hw.unitary_contracts.map((uc, i) => (
                          <tr key={i}>
                            <td><strong>{uc.title}</strong>{uc.note && <div style={{ fontSize: '0.72rem', color: '#8e8e93', marginTop: 2 }}>{uc.note}</div>}</td>
                            <td style={{ color: '#12B6CF' }}>{uc.authority}</td>
                            <td style={{ fontWeight: 600 }}>{uc.value ? `£${(uc.value / 1e6).toFixed(1)}M` : '\u2014'}</td>
                            <td style={{ fontSize: '0.78rem', color: '#8e8e93' }}>{uc.source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* DfT Settlement bar chart */}
              {dft && (
                <>
                  <div className="hw-assets-sub-heading" style={{ marginTop: 20 }}>
                    DfT 4-Year Highway Settlement — £{(dft.total / 1e6).toFixed(0)}M
                  </div>
                  <ChartCard title="" note={dft.note}>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={dft.years.map(y => ({
                        year: y.year,
                        amount: y.amount / 1e6,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                        <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
                        <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `£${v}M`} />
                        <RechartsTooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v) => [`£${v.toFixed(1)}M`, 'Settlement']} />
                        <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                          {dft.years.map((y, i) => (
                            <Cell key={i} fill={y.year <= '2027/28' ? '#30d158' : '#ff9f0a'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </>
              )}

              {/* Geographic lotting insight */}
              <div className="hw-concentration-note" style={{ marginTop: 16 }}>
                <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                <strong>Geographic Lotting Risk:</strong> Current A/B&amp;C/Unclassified road contracts use North/South/East lots.
                Under LGR, successor authority boundaries will not align with existing lot boundaries — requiring complete
                contract restructuring, not simple novation. The 7,142km network must be re-lotted across 2&ndash;5 successor authorities.
              </div>

              {/* LGR delay impact */}
              {procPipeline.delay_case && (
                <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(10,132,255,0.06)', border: '1px solid rgba(10,132,255,0.2)', borderRadius: 10 }}>
                  <strong style={{ color: '#12B6CF', fontSize: '0.88rem' }}>LGR Delay Impact on Highways:</strong>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '6px 0 0' }}>
                    Delaying vesting from April 2028 to April 2029 means 3 of 4 DfT settlement years would be managed by LCC
                    under existing contractual arrangements, with only the final year requiring renegotiation. Under the current
                    timeline, 2 years transfer mid-contract creating funding uncertainty.
                  </p>
                  <Link to="/lgr" style={{ display: 'inline-block', marginTop: 8, fontSize: '0.78rem', color: '#12B6CF', textDecoration: 'none' }}>
                    Full delay case analysis on LGR Tracker &rarr;
                  </Link>
                </div>
              )}

              <p className="hw-source-note" style={{ marginTop: 16 }}>
                Source: LCC Cabinet March 2026 Procurement Pipeline Report, Contracts Finder API, DfT Highway Maintenance
                Funding Allocations 2026&ndash;2030.
              </p>
            </CollapsibleSection>
          )
        })()}

        {/* 7. Legal Framework */}
        {legal && (
          <CollapsibleSection
            title="Legal Framework"
            subtitle="Key highways legislation and enforcement thresholds"
            severity="neutral"
            icon={<Gavel size={18} />}
            count={legal.legislation?.length || 0}
            countLabel="statutes"
          >
            {legal.legislation?.map((law, i) => (
              <div key={i} className="hw-law-block">
                <div className="hw-law-title">{law.title}</div>
                <div className="hw-table-overflow">
                <table className="hw-legal-table">
                  <thead>
                    <tr>
                      <th style={{ width: 80 }}>Section</th>
                      <th style={{ width: 180 }}>Title</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {law.sections.map((s, j) => (
                      <tr key={j}>
                        <td className="hw-td-blue">{s.section}</td>
                        <td>{s.title}</td>
                        <td>{s.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            ))}

            {/* Key thresholds */}
            {legal.key_thresholds && (
              <div>
                <div className="hw-thresholds-heading">Key Thresholds</div>
                <div className="hw-thresholds-grid">
                  {Object.entries(legal.key_thresholds).map(([key, val]) => (
                    <div key={key} className="hw-threshold-card">
                      <div className="hw-threshold-label">{val.label}</div>
                      <div className="hw-threshold-desc">{val.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CollapsibleSection>
        )}
      </div>
    </div>
  )
}
