import { useState, useMemo, useCallback, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Construction, AlertTriangle, MapPin, Clock, Users, Filter, Search, ChevronLeft, ChevronRight, Route, Activity, Gavel, Eye, EyeOff, BarChart3, TrendingUp } from 'lucide-react'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import { StatCard, StatBar } from '../components/ui/StatCard'
import { ChartCard, CHART_TOOLTIP_STYLE } from '../components/ui/ChartCard'
import CollapsibleSection from '../components/CollapsibleSection'
import DataFreshnessStamp from '../components/DataFreshnessStamp'
import { formatNumber, formatDate } from '../utils/format'
import { CHART_COLORS, SEVERITY_COLORS, TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE } from '../utils/constants'
import './Highways.css'

const HighwaysMap = lazy(() => import('../components/HighwaysMap'))

const PAGE_SIZE = 30

// Severity ordering for sorting
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 }

// Restriction classification
function classifyRestriction(rw) {
  const r = (rw.restrictions || rw.management_type || '').toLowerCase()
  const desc = (rw.description || '').toLowerCase()
  if (r.includes('road closure') || desc.includes('road closure') || r.includes('full closure')) return 'full_closure'
  if (r.includes('lane closure') || r.includes('contraflow') || r.includes('traffic control')
    || r.includes('two-way signals') || r.includes('multi-way signals') || r.includes('priority')) return 'lane_restriction'
  return 'minor'
}

function restrictionBadge(rw) {
  const rc = classifyRestriction(rw)
  if (rc === 'full_closure') return { cls: 'hw-badge-closure', label: 'Closure' }
  if (rc === 'lane_restriction') return { cls: 'hw-badge-lane', label: 'Lane restriction' }
  return { cls: 'hw-badge-minor', label: 'Minor' }
}

function statusBadge(status) {
  if (status === 'Works started') return { cls: 'hw-badge-started', label: 'Started' }
  return { cls: 'hw-badge-planned', label: 'Planned' }
}

/** Confidence dots display (●●●●○) */
function ConfidenceDots({ value }) {
  const filled = Math.round((value || 0) * 5)
  const empty = 5 - filled
  const color = filled >= 4 ? '#30d158' : filled >= 3 ? '#ff9f0a' : '#ff453a'
  const label = filled >= 4 ? 'High' : filled >= 3 ? 'Medium' : 'Low'
  return (
    <span className="hw-confidence">
      <span className="hw-confidence-dots">
        {Array.from({ length: filled }, (_, i) => (
          <span key={`f${i}`} className="hw-confidence-dot" style={{ background: color }} />
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <span key={`e${i}`} className="hw-confidence-dot" style={{ background: 'rgba(255,255,255,0.1)' }} />
        ))}
      </span>
      <span style={{ color }}>{label}</span>
    </span>
  )
}

export default function Highways() {
  const config = useCouncilConfig()
  const dataSources = config.data_sources || {}

  // Load data
  const { data: allData, loading, error } = useData(
    dataSources.highways
      ? ['/data/roadworks.json', '/data/traffic.json', '/data/ward_boundaries.json', '/data/shared/highways_legal.json']
      : null
  )

  // State
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState(null)
  const [showCorridors, setShowCorridors] = useState(false)
  const [showJunctions, setShowJunctions] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  // Parse URL params
  const severity = searchParams.get('severity') || ''
  const status = searchParams.get('status') || ''
  const district = searchParams.get('district') || ''
  const operator = searchParams.get('operator') || ''
  const page = parseInt(searchParams.get('page') || '1', 10)

  const setFilter = useCallback((key, value) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      next.delete('page') // reset page on filter change
      return next
    })
  }, [setSearchParams])

  const clearFilters = useCallback(() => {
    setSearchParams({})
    setSearchTerm('')
  }, [setSearchParams])

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

  const [roadworksData, trafficData, boundariesData, legalData] = allData || [null, null, null, null]
  const roadworks = roadworksData?.roadworks || []
  const stats = roadworksData?.stats || {}
  const meta = roadworksData?.meta || {}
  const traffic = trafficData || null
  const legal = legalData || null

  // Filter options
  const districts = [...new Set(roadworks.map(r => r.district).filter(Boolean))].sort()
  const operators = [...new Set(roadworks.map(r => r.operator).filter(Boolean))].sort()

  // Apply filters
  const filters = { severity, status, district, operator }
  let filtered = roadworks
  if (severity) filtered = filtered.filter(r => r.severity === severity)
  if (status) filtered = filtered.filter(r => r.status === status)
  if (district) filtered = filtered.filter(r => r.district === district)
  if (operator) filtered = filtered.filter(r => r.operator === operator)
  if (searchTerm) {
    const term = searchTerm.toLowerCase()
    filtered = filtered.filter(r =>
      (r.road || '').toLowerCase().includes(term) ||
      (r.description || '').toLowerCase().includes(term) ||
      (r.operator || '').toLowerCase().includes(term) ||
      (r.ward || '').toLowerCase().includes(term)
    )
  }

  // Sort: severity (high first), then road name
  filtered.sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 9
    const sb = SEVERITY_ORDER[b.severity] ?? 9
    if (sa !== sb) return sa - sb
    return (a.road || '').localeCompare(b.road || '')
  })

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const setPage = (p) => setSearchParams(prev => {
    const next = new URLSearchParams(prev)
    if (p > 1) next.set('page', String(p))
    else next.delete('page')
    return next
  })

  // Derived stats
  const closureCount = roadworks.filter(r => classifyRestriction(r) === 'full_closure').length
  const highSevCount = roadworks.filter(r => r.severity === 'high').length
  const startedCount = stats.works_started || 0
  const plannedCount = stats.planned_works || 0
  const districtCount = stats.district_count || districts.length

  // Traffic intelligence
  const junctions = traffic?.congestion_model?.junctions || []
  const corridors = traffic?.congestion_model?.corridors || []
  const clashes = traffic?.operational_intelligence?.corridor_clashes || []
  const deferrals = traffic?.operational_intelligence?.deferral_recommendations || []
  const dataFreshness = traffic?.meta?.data_freshness || {}
  const strategic = traffic?.strategic_recommendations || {}
  const majorEvents = traffic?.major_events || []
  const matchPreps = strategic?.match_preparations || []
  const eventPreps = strategic?.event_preparations || []
  const immediateActions = strategic?.immediate_actions || []
  const strategicSummary = strategic?.summary || {}

  // s59 categorisation
  const breaches = clashes.filter(c => c.s59_breach)
  const coordinations = clashes.filter(c => c.s59_coordination_needed && !c.s59_breach)
  const monitors = clashes.filter(c => c.s59_monitor && !c.s59_breach && !c.s59_coordination_needed)

  // Operator breakdown for chart
  const operatorData = Object.entries(stats.by_operator || {})
    .slice(0, 10)
    .map(([name, count], i) => ({ name: name.length > 20 ? name.slice(0, 18) + '…' : name, count, fill: CHART_COLORS[i % CHART_COLORS.length] }))

  // District breakdown
  const districtData = Object.entries(stats.by_district || {})
    .map(([name, data]) => ({ name, total: data.total, started: data.works_started, planned: data.planned_works }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12)

  return (
    <div className="highways-page">
      {/* Hero */}
      <div className="hw-hero">
        <h1>
          <Construction size={28} style={{ verticalAlign: 'middle', marginRight: 8, color: '#ff9f0a' }} />
          Highways &amp; Roadworks
        </h1>
        <p className="hw-subtitle">
          Live roadworks data across {meta.scope || 'Lancashire'} — {formatNumber(roadworks.length)} active and planned works
        </p>
        {meta.generated && <DataFreshnessStamp lastUpdated={meta.generated} label="Roadworks data" />}
      </div>

      {/* Stat cards */}
      <div className="hw-stats">
        <StatCard value={formatNumber(roadworks.length)} label="Total Works" icon={Construction} />
        <StatCard value={formatNumber(closureCount)} label="Road Closures" icon={AlertTriangle} highlight={closureCount > 0} />
        <StatCard value={formatNumber(highSevCount)} label="High Severity" icon={Activity} highlight={highSevCount > 20} />
        <StatCard value={formatNumber(startedCount)} label="Works Started" icon={Clock} />
        <StatCard value={formatNumber(districtCount)} label="Districts" icon={MapPin} />
      </div>

      {/* Filters */}
      <div className="hw-filters">
        <span className="hw-filter-label">Filter:</span>
        <div className="hw-filter-group">
          <select className="hw-filter-select" value={severity} onChange={e => setFilter('severity', e.target.value)}>
            <option value="">All severities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div className="hw-filter-group">
          <select className="hw-filter-select" value={status} onChange={e => setFilter('status', e.target.value)}>
            <option value="">All statuses</option>
            <option value="Works started">Works started</option>
            <option value="Planned works">Planned works</option>
          </select>
        </div>
        <div className="hw-filter-group">
          <select className="hw-filter-select" value={district} onChange={e => setFilter('district', e.target.value)}>
            <option value="">All districts</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="hw-filter-group">
          <select className="hw-filter-select" value={operator} onChange={e => setFilter('operator', e.target.value)}>
            <option value="">All operators</option>
            {operators.slice(0, 30).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        {(severity || status || district || operator || searchTerm) && (
          <button className="hw-clear-btn" onClick={clearFilters}>Clear all</button>
        )}
      </div>

      {/* Map */}
      <div className="hw-map-section">
        <div className="hw-map-controls">
          <button
            className={`hw-toggle ${showCorridors ? 'active' : ''}`}
            onClick={() => setShowCorridors(v => !v)}
          >
            <Route size={14} />
            {showCorridors ? 'Hide' : 'Show'} Corridors
          </button>
          <button
            className={`hw-toggle ${showJunctions ? 'active' : ''}`}
            onClick={() => setShowJunctions(v => !v)}
          >
            <Activity size={14} />
            {showJunctions ? 'Hide' : 'Show'} JCI Points
          </button>
        </div>
        <Suspense fallback={<div style={{ height: '500px', background: 'rgba(28,28,30,0.7)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8e8e93' }}>Loading map…</div>}>
          <HighwaysMap
            roadworks={filtered}
            traffic={traffic}
            boundaries={boundariesData}
            config={config}
            onRoadworkClick={rw => setSelectedId(rw.id)}
            selectedId={selectedId}
            filters={filters}
            showCorridors={showCorridors}
            showJunctions={showJunctions}
            height="500px"
          />
        </Suspense>
      </div>

      {/* Collapsible analysis sections */}
      <div className="hw-sections">
        {/* Strategic Recommendations — what LCC can do NOW */}
        {immediateActions.length > 0 && (
          <CollapsibleSection
            title="Strategic Recommendations"
            subtitle="Actions LCC can take now to ease congestion — based on all current data"
            severity={immediateActions.some(a => a.priority === 'critical') ? 'critical' : 'warning'}
            icon={<TrendingUp size={18} />}
            count={immediateActions.length}
            countLabel="actions"
            defaultOpen
          >
            {/* Network summary */}
            {strategicSummary.total_works > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 16 }}>
                {[
                  { label: 'Active Works', value: strategicSummary.active_works, color: '#ff9f0a' },
                  { label: 'Road Closures', value: strategicSummary.road_closures, color: '#ff453a' },
                  { label: 'LCC Controlled', value: strategicSummary.lcc_controlled, color: '#0a84ff' },
                  { label: 's59 Breaches', value: strategicSummary.s59_breaches, color: strategicSummary.s59_breaches > 0 ? '#ff453a' : '#30d158' },
                  { label: 'Actionable Deferrals', value: strategicSummary.actionable_deferrals, color: '#ff9f0a' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color }}>{value || 0}</div>
                    <div style={{ fontSize: '0.7rem', color: '#8e8e93' }}>{label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Immediate actions grouped by priority */}
            {['critical', 'high'].map(priority => {
              const actions = immediateActions.filter(a => a.priority === priority)
              if (!actions.length) return null
              const color = priority === 'critical' ? '#ff453a' : '#ff9f0a'
              const label = priority === 'critical' ? '🔴 Critical — Action Required Today' : '🟠 High Priority'
              return (
                <div key={priority} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: '0.8rem', color, fontWeight: 600, marginBottom: 8 }}>{label}</div>
                  {actions.slice(0, priority === 'critical' ? 10 : 5).map((a, i) => (
                    <div key={i} className="hw-clash-card" style={{ borderLeft: `3px solid ${color}` }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4 }}>{a.action}</div>
                      {a.detail && <div style={{ fontSize: '0.8rem', color: '#c7c7cc' }}>{a.detail}</div>}
                      {a.legal_basis && <div style={{ fontSize: '0.7rem', color: '#636366', marginTop: 4 }}>Legal basis: {a.legal_basis}</div>}
                    </div>
                  ))}
                </div>
              )
            })}

            {/* Upcoming match day preparations */}
            {matchPreps.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.8rem', color: '#0a84ff', fontWeight: 600, marginBottom: 8 }}>⚽ Match Day Preparations (next 14 days)</div>
                {matchPreps.map((m, i) => (
                  <div key={i} className="hw-clash-card" style={{ borderLeft: m.nearby_works > 0 ? '3px solid #ff9f0a' : '3px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{m.venue} — {m.opponent}</span>
                      <span style={{ fontSize: '0.75rem', color: '#8e8e93' }}>{m.date} ({m.days_away}d)</span>
                    </div>
                    {m.nearby_works > 0 && (
                      <div style={{ fontSize: '0.8rem', color: '#ff9f0a', marginTop: 4 }}>
                        ⚠ {m.nearby_works} works within 2km — issue timing directions
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Upcoming event preparations */}
            {eventPreps.length > 0 && (
              <div>
                <div style={{ fontSize: '0.8rem', color: '#bf5af2', fontWeight: 600, marginBottom: 8 }}>🎪 Major Event Preparations</div>
                {eventPreps.map((e, i) => (
                  <div key={i} className="hw-clash-card" style={{ borderLeft: e.clashing_works > 0 ? '3px solid #ff9f0a' : '3px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{e.event}</span>
                      <span style={{ fontSize: '0.75rem', color: '#8e8e93' }}>{e.date} ({e.days_away}d away, ~{(e.crowd || 0).toLocaleString()} crowd)</span>
                    </div>
                    {e.clashing_works > 0 && (
                      <div style={{ fontSize: '0.8rem', color: '#ff9f0a', marginTop: 4 }}>
                        ⚠ {e.clashing_works} works within impact zone — {e.action}
                      </div>
                    )}
                    {e.roads_affected?.length > 0 && (
                      <div style={{ fontSize: '0.75rem', color: '#636366', marginTop: 2 }}>
                        Roads: {e.roads_affected.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>
        )}

        {/* s59 Clashes */}
        {clashes.length > 0 && (
          <CollapsibleSection
            title="Co-ordination Clashes (NRSWA s59)"
            subtitle="Multiple concurrent works creating capacity constraints"
            severity={breaches.length > 0 ? 'critical' : coordinations.length > 0 ? 'warning' : 'info'}
            icon={<AlertTriangle size={18} />}
            count={clashes.length}
            countLabel="clashes"
            defaultOpen={breaches.length > 0}
          >
            {breaches.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '0.8rem', color: '#ff453a', fontWeight: 600, marginBottom: 8 }}>
                  ⚠️ s59 Breaches — {breaches.length} road sections exceed 30% capacity loss
                </div>
                {breaches.map((clash, i) => (
                  <div key={i} className="hw-clash-card">
                    <div className="hw-clash-road">{clash.road || clash.corridor || 'Unknown road'}</div>
                    <div className="hw-clash-meta">
                      {clash.concurrent_works} concurrent works · {clash.total_capacity_reduction ? `${Math.round(clash.total_capacity_reduction * 100)}%` : '>30%'} capacity loss
                      {clash.recommendation && <div style={{ marginTop: 4, color: '#c7c7cc' }}>{clash.recommendation}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {coordinations.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '0.8rem', color: '#ff9f0a', fontWeight: 600, marginBottom: 8 }}>
                  Co-ordination Required — {coordinations.length} sections
                </div>
                {coordinations.slice(0, 5).map((clash, i) => (
                  <div key={i} className="hw-clash-card coordination">
                    <div className="hw-clash-road">{clash.road || clash.corridor || 'Unknown road'}</div>
                    <div className="hw-clash-meta">
                      {clash.concurrent_works} concurrent works
                      {clash.recommendation && <div style={{ marginTop: 4, color: '#c7c7cc' }}>{clash.recommendation}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {monitors.length > 0 && (
              <div>
                <div style={{ fontSize: '0.8rem', color: '#0a84ff', fontWeight: 600, marginBottom: 8 }}>
                  Monitoring — {monitors.length} developing situations
                </div>
                {monitors.slice(0, 3).map((clash, i) => (
                  <div key={i} className="hw-clash-card monitor">
                    <div className="hw-clash-road">{clash.road || clash.corridor || 'Unknown road'}</div>
                    <div className="hw-clash-meta">
                      {clash.concurrent_works} concurrent works
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>
        )}

        {/* Deferral Recommendations */}
        {deferrals.length > 0 && (
          <CollapsibleSection
            title="Deferral Recommendations"
            subtitle="Works that could be rescheduled to reduce network impact"
            severity="info"
            icon={<Clock size={18} />}
            count={deferrals.length}
            countLabel="recommendations"
          >
            {deferrals.slice(0, 8).map((def, i) => (
              <div key={i} className="hw-deferral-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="hw-deferral-road">{def.road || 'Unknown road'}</div>
                  {def.confidence != null && <ConfidenceDots value={def.confidence} />}
                </div>
                <div className="hw-deferral-reason">{def.reason || def.recommendation || ''}</div>
                {def.confidence_flags && def.confidence_flags.length > 0 && (
                  <div style={{ fontSize: '0.7rem', color: '#636366' }}>
                    Flags: {def.confidence_flags.join(', ')}
                  </div>
                )}
              </div>
            ))}
            {deferrals.length > 8 && (
              <div style={{ fontSize: '0.85rem', color: '#8e8e93', textAlign: 'center', marginTop: 8 }}>
                + {deferrals.length - 8} more recommendations
              </div>
            )}
          </CollapsibleSection>
        )}

        {/* Traffic Intelligence */}
        {junctions.length > 0 && (
          <CollapsibleSection
            title="Traffic Intelligence"
            subtitle="Junction Congestion Index analysis from DfT + roadworks data"
            severity="neutral"
            icon={<TrendingUp size={18} />}
            count={junctions.length}
            countLabel="junctions"
          >
            <div style={{ overflowX: 'auto' }}>
              <table className="hw-legal-table">
                <thead>
                  <tr>
                    <th>Junction</th>
                    <th>JCI Score</th>
                    <th>Traffic Vol.</th>
                    <th>Nearby Works</th>
                    <th>Data Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {junctions
                    .sort((a, b) => (b.jci || b.jci_score || 0) - (a.jci || a.jci_score || 0))
                    .slice(0, 15)
                    .map((jn, i) => {
                      const score = jn.jci || jn.jci_score || 0
                      const scoreColor = score >= 80 ? '#ff453a' : score >= 60 ? '#ff6d3b' : score >= 40 ? '#ff9f0a' : '#30d158'
                      return (
                        <tr key={i}>
                          <td style={{ fontWeight: 500 }}>{jn.name || `Junction ${i + 1}`}</td>
                          <td><span style={{ color: scoreColor, fontWeight: 700 }}>{score.toFixed(0)}</span>/100</td>
                          <td>{jn.traffic_volume ? formatNumber(jn.traffic_volume) : '-'}</td>
                          <td>{jn.works_count || 0}</td>
                          <td>
                            <span style={{
                              color: jn.data_quality === 'high' ? '#30d158' : jn.data_quality === 'medium' ? '#ff9f0a' : '#ff453a',
                              fontSize: '0.8rem'
                            }}>
                              {jn.data_quality || 'unknown'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
        )}

        {/* District breakdown */}
        {districtData.length > 1 && (
          <CollapsibleSection
            title="District Breakdown"
            subtitle="Works distribution across Lancashire districts"
            severity="neutral"
            icon={<MapPin size={18} />}
            count={districtData.length}
            countLabel="districts"
          >
            <div style={{ overflowX: 'auto' }}>
              <table className="hw-legal-table">
                <thead>
                  <tr>
                    <th>District</th>
                    <th>Total</th>
                    <th>Started</th>
                    <th>Planned</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {districtData.map((d, i) => {
                    const pct = roadworks.length ? ((d.total / roadworks.length) * 100).toFixed(1) : 0
                    return (
                      <tr key={i} style={{ cursor: 'pointer' }} onClick={() => setFilter('district', d.name)}>
                        <td style={{ fontWeight: 500 }}>{d.name}</td>
                        <td>{formatNumber(d.total)}</td>
                        <td>{formatNumber(d.started)}</td>
                        <td>{formatNumber(d.planned)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 60, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: CHART_COLORS[i % CHART_COLORS.length], borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: '0.8rem' }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
        )}

        {/* Legal Framework */}
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
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.95rem' }}>{law.title}</div>
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
                        <td style={{ fontWeight: 500, color: '#0a84ff' }}>{s.section}</td>
                        <td>{s.title}</td>
                        <td>{s.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {/* Key thresholds */}
            {legal.key_thresholds && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: '0.95rem' }}>Key Thresholds</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 8 }}>
                  {Object.entries(legal.key_thresholds).map(([key, val]) => (
                    <div key={key} style={{
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: 8,
                      padding: '10px 14px',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 2 }}>{val.label}</div>
                      <div style={{ fontSize: '0.8rem', color: '#8e8e93' }}>{val.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CollapsibleSection>
        )}

        {/* Data Freshness */}
        {Object.keys(dataFreshness).length > 0 && (
          <CollapsibleSection
            title="Data Sources"
            subtitle="Freshness and coverage of each data source"
            severity="neutral"
            icon={<BarChart3 size={18} />}
            count={Object.keys(dataFreshness).length}
            countLabel="sources"
          >
            <table className="hw-legal-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Records</th>
                  <th>Refresh</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(dataFreshness).map(([key, src]) => (
                  <tr key={key}>
                    <td style={{ fontWeight: 500 }}>{src.source || key}</td>
                    <td>{src.records != null ? formatNumber(src.records) : '-'}</td>
                    <td style={{ fontSize: '0.8rem', color: '#8e8e93' }}>{src.update_cycle || '-'}</td>
                    <td>
                      {src.stale === true ? (
                        <span style={{ color: '#ff453a', fontSize: '0.8rem' }}>⚠ Stale ({src.stale_hours ? `${Math.round(src.stale_hours)}h` : ''})</span>
                      ) : src.stale === false ? (
                        <span style={{ color: '#30d158', fontSize: '0.8rem' }}>✓ Fresh</span>
                      ) : (
                        <span style={{ color: '#8e8e93', fontSize: '0.8rem' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CollapsibleSection>
        )}
      </div>

      {/* Roadworks list */}
      <div className="hw-list-section">
        <div className="hw-list-header">
          <div>
            <h2>Roadworks</h2>
            <span className="hw-list-count">
              {filtered.length === roadworks.length
                ? `${formatNumber(roadworks.length)} works`
                : `${formatNumber(filtered.length)} of ${formatNumber(roadworks.length)} works`
              }
            </span>
          </div>
          <input
            type="text"
            className="hw-search-input"
            placeholder="Search roads, operators, wards…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="hw-card-list">
          {paginated.map(rw => {
            const rb = restrictionBadge(rw)
            const sb = statusBadge(rw.status)
            const sevColor = rw.severity === 'high' ? '#ff453a' : rw.severity === 'medium' ? '#ff9f0a' : '#8e8e93'
            return (
              <div
                key={rw.id}
                className={`hw-card ${rw.id === selectedId ? 'selected' : ''}`}
                onClick={() => setSelectedId(rw.id === selectedId ? null : rw.id)}
              >
                <div className="hw-card-severity" style={{ background: sevColor }} />
                <div className="hw-card-body">
                  <div className="hw-card-road">{rw.road || 'Unknown Road'}</div>
                  {rw.description && <div className="hw-card-desc">{rw.description}</div>}
                  <div className="hw-card-meta">
                    {rw.operator && <span>{rw.operator}</span>}
                    {rw.district && <span>{rw.district}</span>}
                    {rw.start_date && <span>From {formatDate(rw.start_date)}</span>}
                    {rw.end_date && <span>To {formatDate(rw.end_date)}</span>}
                  </div>
                </div>
                <div className="hw-card-badges">
                  <span className={`hw-badge ${rb.cls}`}>{rb.label}</span>
                  <span className={`hw-badge ${sb.cls}`}>{sb.label}</span>
                  {rw.urgent && <span className="hw-badge hw-badge-urgent">Urgent</span>}
                </div>
              </div>
            )
          })}
        </div>

        {filtered.length === 0 && (
          <div className="hw-empty">
            <div className="hw-empty-icon">🔍</div>
            <h3>No roadworks found</h3>
            <p>Try adjusting your filters or search term.</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="hw-pagination">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft size={16} style={{ verticalAlign: 'middle' }} /> Previous
            </button>
            <span className="hw-pagination-info">
              Page {page} of {totalPages}
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Next <ChevronRight size={16} style={{ verticalAlign: 'middle' }} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
