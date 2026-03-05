import { useState, useMemo, useCallback, useRef, useEffect, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Construction, AlertTriangle, MapPin, Clock, Users, Filter, Search, ChevronLeft, ChevronRight, Route, Activity, Gavel, Eye, EyeOff, BarChart3, TrendingUp, Play, Pause, Calendar, Layers } from 'lucide-react'
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

// Sort options
const SORT_OPTIONS = [
  { value: 'severity', label: 'Severity' },
  { value: 'road_az', label: 'Road A-Z' },
  { value: 'road_za', label: 'Road Z-A' },
  { value: 'start_date', label: 'Start date' },
  { value: 'end_date', label: 'End date' },
  { value: 'operator', label: 'Operator' },
]

// Restriction classification
function classifyRestriction(rw) {
  const r = (rw.restrictions || rw.management_type || '').toLowerCase()
  const desc = (rw.description || '').toLowerCase()
  if (r.includes('road closure') || desc.includes('road closure') || r.includes('full closure')) return 'full_closure'
  if (r.includes('lane closure') || r.includes('contraflow') || r.includes('traffic control')
    || r.includes('two-way signals') || r.includes('multi-way signals') || r.includes('priority')) return 'lane_restriction'
  return 'minor'
}

/** Capacity loss percentage based on restriction type */
function capacityLoss(rw) {
  const rc = classifyRestriction(rw)
  if (rc === 'full_closure') return 100
  if (rc === 'lane_restriction') return 50
  return 15
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

/** Compute human-readable duration between start and end dates */
function computeDuration(startDate, endDate) {
  if (!startDate || !endDate) return null
  try {
    const start = new Date(startDate)
    const end = new Date(endDate)
    if (isNaN(start) || isNaN(end) || end <= start) return null
    const diffMs = end - start
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays < 1) return '< 1 day'
    if (diffDays === 1) return '1 day'
    if (diffDays < 14) return `${diffDays} days`
    const weeks = Math.round(diffDays / 7)
    if (weeks < 8) return `${weeks} weeks`
    const months = Math.round(diffDays / 30)
    return months === 1 ? '1 month' : `${months} months`
  } catch {
    return null
  }
}

/** Build page number array with ellipses */
function buildPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = []
  pages.push(1)
  if (current > 3) pages.push('...')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i)
  }
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
}

/** Format a Date object as "5 Mar 2026" */
function fmtDay(d) {
  if (!d) return ''
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

/** Days between two Date objects */
function daysBetween(a, b) {
  return Math.round((b - a) / (1000 * 60 * 60 * 24))
}

/** Confidence dots display */
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
  const [sortBy, setSortBy] = useState('severity')

  // "Show all" expander toggles
  const [showAllDeferrals, setShowAllDeferrals] = useState(false)
  const [showAllJunctions, setShowAllJunctions] = useState(false)
  const [showAllCoordinations, setShowAllCoordinations] = useState(false)
  const [showAllMonitors, setShowAllMonitors] = useState(false)

  // Timeline state
  const [timelineMode, setTimelineMode] = useState('all') // 'all' | 'date'
  const [selectedDay, setSelectedDay] = useState(0) // index into date range
  const [isPlaying, setIsPlaying] = useState(false)
  const [playSpeed, setPlaySpeed] = useState(1)
  const playRef = useRef(null)

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

  // Destructure data (safe even when null/loading)
  const [roadworksData, trafficData, boundariesData, legalData] = allData || [null, null, null, null]
  const roadworks = roadworksData?.roadworks || []
  const stats = roadworksData?.stats || {}
  const meta = roadworksData?.meta || {}
  const traffic = trafficData || null
  const legal = legalData || null
  const infrastructure = traffic?.road_infrastructure || null

  // Timeline date range computation
  const dateRange = useMemo(() => {
    if (!roadworks.length) return { start: null, end: null, totalDays: 0, dates: [] }
    const allStarts = []
    const allEnds = []
    for (const rw of roadworks) {
      if (rw.start_date) { const d = new Date(rw.start_date); if (!isNaN(d)) allStarts.push(d) }
      if (rw.end_date) { const d = new Date(rw.end_date); if (!isNaN(d)) allEnds.push(d) }
    }
    if (!allStarts.length) return { start: null, end: null, totalDays: 0, dates: [] }
    allStarts.sort((a, b) => a - b)
    allEnds.sort((a, b) => a - b)
    const start = allStarts[0]
    // Use 95th percentile end date to avoid outlier long-running works
    const endIdx = Math.min(Math.floor(allEnds.length * 0.95), allEnds.length - 1)
    const end = allEnds.length ? allEnds[endIdx] : allStarts[allStarts.length - 1]
    const totalDays = Math.max(1, daysBetween(start, end))
    return { start, end, totalDays }
  }, [roadworks])

  // Heatmap: density per day bucket (60 buckets max)
  const heatmapData = useMemo(() => {
    if (!dateRange.start || !dateRange.totalDays) return []
    const bucketCount = Math.min(60, dateRange.totalDays)
    const bucketSize = dateRange.totalDays / bucketCount
    const buckets = new Array(bucketCount).fill(0)
    for (const rw of roadworks) {
      const s = rw.start_date ? new Date(rw.start_date) : null
      const e = rw.end_date ? new Date(rw.end_date) : null
      if (!s || isNaN(s)) continue
      const startDay = Math.max(0, daysBetween(dateRange.start, s))
      const endDay = e && !isNaN(e) ? Math.min(dateRange.totalDays, daysBetween(dateRange.start, e)) : startDay + 1
      for (let b = 0; b < bucketCount; b++) {
        const bStart = b * bucketSize
        const bEnd = (b + 1) * bucketSize
        if (startDay < bEnd && endDay > bStart) buckets[b]++
      }
    }
    const maxVal = Math.max(1, ...buckets)
    return buckets.map(v => v / maxVal)
  }, [roadworks, dateRange])

  // Current selected date
  const selectedDate = useMemo(() => {
    if (!dateRange.start) return null
    const d = new Date(dateRange.start)
    d.setDate(d.getDate() + selectedDay)
    return d
  }, [dateRange.start, selectedDay])

  // Count active works on selected date
  const activeOnDate = useMemo(() => {
    if (timelineMode !== 'date' || !selectedDate) return 0
    const sd = selectedDate.getTime()
    return roadworks.filter(rw => {
      const s = rw.start_date ? new Date(rw.start_date).getTime() : null
      const e = rw.end_date ? new Date(rw.end_date).getTime() : null
      if (!s) return false
      return s <= sd && (!e || e >= sd)
    }).length
  }, [roadworks, selectedDate, timelineMode])

  // Today index in the range
  const todayIndex = useMemo(() => {
    if (!dateRange.start) return 0
    const idx = daysBetween(dateRange.start, new Date())
    return Math.max(0, Math.min(dateRange.totalDays, idx))
  }, [dateRange])

  // Play/pause effect
  useEffect(() => {
    if (!isPlaying) {
      if (playRef.current) clearInterval(playRef.current)
      return
    }
    const interval = Math.round(300 / playSpeed)
    playRef.current = setInterval(() => {
      setSelectedDay(prev => {
        if (prev >= dateRange.totalDays) {
          setIsPlaying(false)
          return prev
        }
        return prev + 1
      })
    }, interval)
    return () => clearInterval(playRef.current)
  }, [isPlaying, playSpeed, dateRange.totalDays])

  // Timeline navigation callbacks
  const goToToday = useCallback(() => {
    setSelectedDay(todayIndex)
    setTimelineMode('date')
  }, [todayIndex])

  const toggleTimelineMode = useCallback(() => {
    setTimelineMode(prev => prev === 'all' ? 'date' : 'all')
    setIsPlaying(false)
  }, [])

  const stepDay = useCallback((delta) => {
    setTimelineMode('date')
    setSelectedDay(prev => Math.max(0, Math.min(dateRange.totalDays, prev + delta)))
  }, [dateRange.totalDays])

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

  // Timeline date filter — apply after other filters, only in date mode
  if (timelineMode === 'date' && selectedDate) {
    const sd = selectedDate.getTime()
    filtered = filtered.filter(rw => {
      const s = rw.start_date ? new Date(rw.start_date).getTime() : null
      const e = rw.end_date ? new Date(rw.end_date).getTime() : null
      if (!s) return false
      return s <= sd && (!e || e >= sd)
    })
  }

  // Sort
  const sortedFiltered = [...filtered]
  switch (sortBy) {
    case 'severity':
      sortedFiltered.sort((a, b) => {
        const sa = SEVERITY_ORDER[a.severity] ?? 9
        const sb = SEVERITY_ORDER[b.severity] ?? 9
        if (sa !== sb) return sa - sb
        return (a.road || '').localeCompare(b.road || '')
      })
      break
    case 'road_az':
      sortedFiltered.sort((a, b) => (a.road || '').localeCompare(b.road || ''))
      break
    case 'road_za':
      sortedFiltered.sort((a, b) => (b.road || '').localeCompare(a.road || ''))
      break
    case 'start_date':
      sortedFiltered.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
      break
    case 'end_date':
      sortedFiltered.sort((a, b) => (a.end_date || '').localeCompare(b.end_date || ''))
      break
    case 'operator':
      sortedFiltered.sort((a, b) => (a.operator || '').localeCompare(b.operator || ''))
      break
    default:
      break
  }

  // Pagination
  const totalPages = Math.ceil(sortedFiltered.length / PAGE_SIZE)
  const paginated = sortedFiltered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
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

  // Check if ANY strategic data exists
  const hasStrategicData = immediateActions.length > 0 || matchPreps.length > 0 || eventPreps.length > 0

  // Operator breakdown for chart
  const operatorData = Object.entries(stats.by_operator || {})
    .slice(0, 10)
    .map(([name, count], i) => ({ name: name.length > 20 ? name.slice(0, 18) + '...' : name, count, fill: CHART_COLORS[i % CHART_COLORS.length] }))

  // District breakdown
  const districtData = Object.entries(stats.by_district || {})
    .map(([name, data]) => ({ name, total: data.total, started: data.works_started, planned: data.planned_works }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12)

  // Sorted junctions for traffic intelligence
  const sortedJunctions = [...junctions].sort((a, b) => (b.jci || b.jci_score || 0) - (a.jci || a.jci_score || 0))
  const displayedJunctions = showAllJunctions ? sortedJunctions : sortedJunctions.slice(0, 15)

  // Corridor data sorted by severity
  const sortedCorridors = [...corridors].sort((a, b) => (b.jci || b.severity_score || b.congestion_score || 0) - (a.jci || a.severity_score || a.congestion_score || 0))

  // Displayed lists with "show all" toggles
  const displayedDeferrals = showAllDeferrals ? deferrals : deferrals.slice(0, 8)
  const displayedCoordinations = showAllCoordinations ? coordinations : coordinations.slice(0, 5)
  const displayedMonitors = showAllMonitors ? monitors : monitors.slice(0, 3)

  // Page numbers for pagination
  const pageNumbers = buildPageNumbers(page, totalPages)

  // Determine strategic section count and severity
  const strategicCount = immediateActions.length + matchPreps.length + eventPreps.length
  const strategicSeverity = immediateActions.some(a => a.priority === 'critical') ? 'critical'
    : immediateActions.length > 0 ? 'warning' : 'info'

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

        {/* Network Summary stat bar */}
        {(junctions.length > 0 || corridors.length > 0 || breaches.length > 0) && (
          <div className="hw-network-summary">
            {junctions.length > 0 && (
              <div className="hw-network-stat">
                <span className="hw-network-stat-value" style={{ color: '#0a84ff' }}>{junctions.length}</span>
                <span className="hw-network-stat-label">JCI Points</span>
              </div>
            )}
            {corridors.length > 0 && (
              <div className="hw-network-stat">
                <span className="hw-network-stat-value" style={{ color: '#bf5af2' }}>{corridors.length}</span>
                <span className="hw-network-stat-label">Corridors</span>
              </div>
            )}
            {breaches.length > 0 && (
              <div className="hw-network-stat">
                <span className="hw-network-stat-value" style={{ color: '#ff453a' }}>{breaches.length}</span>
                <span className="hw-network-stat-label">s59 Breaches</span>
              </div>
            )}
            {coordinations.length > 0 && (
              <div className="hw-network-stat">
                <span className="hw-network-stat-value" style={{ color: '#ff9f0a' }}>{coordinations.length}</span>
                <span className="hw-network-stat-label">Coordinations</span>
              </div>
            )}
            {deferrals.length > 0 && (
              <div className="hw-network-stat">
                <span className="hw-network-stat-value" style={{ color: '#30d158' }}>{deferrals.length}</span>
                <span className="hw-network-stat-label">Deferrals</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="hw-stats">
        <StatCard value={formatNumber(roadworks.length)} label="Total Works" icon={Construction} />
        <StatCard value={formatNumber(closureCount)} label="Road Closures" icon={AlertTriangle} highlight={closureCount > 0} />
        <StatCard value={formatNumber(highSevCount)} label="High Severity" icon={Activity} highlight={highSevCount > 20} />
        <StatCard value={formatNumber(startedCount)} label="Works Started" icon={Clock} />
        <StatCard value={formatNumber(districtCount)} label="Districts" icon={MapPin} />
      </div>

      {/* Regional toggle */}
      {districts.length > 1 && (
        <div className="hw-region-toggle" role="tablist" aria-label="Select region">
          <button
            className={`hw-region-pill ${!district ? 'active' : ''}`}
            onClick={() => setFilter('district', '')}
            role="tab"
            aria-selected={!district}
          >
            All Lancashire
          </button>
          {districts.map(d => (
            <button
              key={d}
              className={`hw-region-pill ${district === d ? 'active' : ''}`}
              onClick={() => setFilter('district', d)}
              role="tab"
              aria-selected={district === d}
            >
              {d}
            </button>
          ))}
        </div>
      )}

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
        <Suspense fallback={<div className="hw-map-fallback">Loading map...</div>}>
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
            height="min(500px, 65vh)"
          />
        </Suspense>
      </div>

      {/* Timeline */}
      {dateRange.start && dateRange.totalDays > 1 && (
        <div className="hw-timeline">
          <div className="hw-timeline-top">
            <div className="hw-timeline-nav">
              <button className="hw-timeline-nav-btn" onClick={() => stepDay(-1)} disabled={timelineMode === 'all' || selectedDay <= 0} aria-label="Previous day">
                <ChevronLeft size={16} />
              </button>
              <span className="hw-timeline-date-label">
                {timelineMode === 'all'
                  ? `${fmtDay(dateRange.start)} — ${fmtDay(dateRange.end)}`
                  : fmtDay(selectedDate)
                }
              </span>
              <button className="hw-timeline-nav-btn" onClick={() => stepDay(1)} disabled={timelineMode === 'all' || selectedDay >= dateRange.totalDays} aria-label="Next day">
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="hw-timeline-actions">
              <button className="hw-timeline-action-btn" onClick={goToToday}>
                <Calendar size={13} /> Today
              </button>
              <button className={`hw-timeline-action-btn ${timelineMode === 'date' ? 'active' : ''}`} onClick={toggleTimelineMode}>
                {timelineMode === 'all' ? 'Date mode' : 'All dates'}
              </button>
            </div>
          </div>

          <div className="hw-timeline-track">
            <div className="hw-heatmap">
              {heatmapData.map((intensity, i) => (
                <div
                  key={i}
                  className="hw-heatmap-bar"
                  style={{
                    background: intensity > 0.7 ? `rgba(255, 69, 58, ${0.3 + intensity * 0.7})`
                      : intensity > 0.4 ? `rgba(255, 159, 10, ${0.2 + intensity * 0.6})`
                      : `rgba(48, 209, 88, ${0.1 + intensity * 0.4})`,
                  }}
                  title={`${Math.round(intensity * 100)}% density`}
                />
              ))}
            </div>
            <input
              type="range"
              className="hw-timeline-slider"
              min={0}
              max={dateRange.totalDays}
              value={timelineMode === 'date' ? selectedDay : todayIndex}
              onChange={(e) => {
                setTimelineMode('date')
                setSelectedDay(parseInt(e.target.value, 10))
              }}
              aria-label="Timeline date slider"
            />
          </div>

          <div className="hw-play-row">
            <button
              className={`hw-play-btn ${isPlaying ? 'playing' : ''}`}
              onClick={() => {
                if (timelineMode === 'all') setTimelineMode('date')
                setIsPlaying(prev => !prev)
              }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              {isPlaying ? ' Pause' : ' Play'}
            </button>
            <div className="hw-speed-controls">
              {[0.5, 1, 2].map(speed => (
                <button
                  key={speed}
                  className={`hw-speed-btn ${playSpeed === speed ? 'active' : ''}`}
                  onClick={() => setPlaySpeed(speed)}
                >
                  {speed}x
                </button>
              ))}
            </div>
            {timelineMode === 'date' && (
              <span className="hw-timeline-status">
                Day {selectedDay + 1} of {dateRange.totalDays} — <strong>{activeOnDate}</strong> active
              </span>
            )}
          </div>
        </div>
      )}

      {/* Collapsible analysis sections */}
      <div className="hw-sections">
        {/* Strategic Recommendations — shows when ANY strategic data exists */}
        {hasStrategicData && (
          <CollapsibleSection
            title="Strategic Recommendations"
            subtitle="Actions LCC can take now to ease congestion — based on all current data"
            severity={strategicSeverity}
            icon={<TrendingUp size={18} />}
            count={strategicCount}
            countLabel="actions"
            defaultOpen
          >
            {/* Network summary */}
            {strategicSummary.total_works > 0 && (
              <div className="hw-strategic-summary-grid">
                {[
                  { label: 'Active Works', value: strategicSummary.active_works, color: '#ff9f0a' },
                  { label: 'Road Closures', value: strategicSummary.road_closures, color: '#ff453a' },
                  { label: 'LCC Controlled', value: strategicSummary.lcc_controlled, color: '#0a84ff' },
                  { label: 's59 Breaches', value: strategicSummary.s59_breaches, color: strategicSummary.s59_breaches > 0 ? '#ff453a' : '#30d158' },
                  { label: 'Actionable Deferrals', value: strategicSummary.actionable_deferrals, color: '#ff9f0a' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="hw-strategic-summary-cell">
                    <div className="hw-strategic-summary-value" style={{ color }}>{value || 0}</div>
                    <div className="hw-strategic-summary-label">{label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Immediate actions grouped by priority */}
            {['critical', 'high'].map(priority => {
              const actions = immediateActions.filter(a => a.priority === priority)
              if (!actions.length) return null
              const isCritical = priority === 'critical'
              const label = isCritical ? 'Critical — Action Required Today' : 'High Priority'
              return (
                <div key={priority} className="hw-priority-group">
                  <div className={`hw-priority-heading hw-priority-heading--${priority}`}>{label}</div>
                  {actions.slice(0, isCritical ? 10 : 5).map((a, i) => (
                    <div key={i} className={`hw-action-card hw-action-card--${priority}`}>
                      <div className="hw-action-title">{a.action}</div>
                      {a.detail && <div className="hw-action-detail">{a.detail}</div>}
                      {a.legal_basis && <div className="hw-action-legal">Legal basis: {a.legal_basis}</div>}
                    </div>
                  ))}
                </div>
              )
            })}

            {/* Upcoming match day preparations */}
            {matchPreps.length > 0 && (
              <div className="hw-priority-group">
                <div className="hw-priority-heading hw-priority-heading--match">Match Day Preparations (next 14 days)</div>
                {matchPreps.map((m, i) => (
                  <div key={i} className={`hw-action-card ${m.nearby_works > 0 ? 'hw-action-card--match-warn' : ''}`}>
                    <div className="hw-prep-card-header">
                      <span className="hw-prep-card-title">{m.venue} — {m.opponent}</span>
                      <span className="hw-prep-card-date">{m.date} ({m.days_away}d)</span>
                    </div>
                    {m.nearby_works > 0 && (
                      <div className="hw-prep-card-warning">
                        {m.nearby_works} works within 2km — issue timing directions
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Upcoming event preparations */}
            {eventPreps.length > 0 && (
              <div className="hw-priority-group">
                <div className="hw-priority-heading hw-priority-heading--event">Major Event Preparations</div>
                {eventPreps.map((e, i) => (
                  <div key={i} className={`hw-action-card ${e.clashing_works > 0 ? 'hw-action-card--event-warn' : ''}`}>
                    <div className="hw-prep-card-header">
                      <span className="hw-prep-card-title">{e.event}</span>
                      <span className="hw-prep-card-date">{e.date} ({e.days_away}d away, ~{(e.crowd || 0).toLocaleString()} crowd)</span>
                    </div>
                    {e.clashing_works > 0 && (
                      <div className="hw-prep-card-warning">
                        {e.clashing_works} works within impact zone — {e.action}
                      </div>
                    )}
                    {e.roads_affected?.length > 0 && (
                      <div className="hw-prep-card-roads">
                        Roads: {e.roads_affected.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>
        )}

        {/* Corridor Analysis */}
        {corridors.length > 0 && (
          <CollapsibleSection
            title="Corridor Analysis"
            subtitle="Top corridors by congestion severity and JCI scoring"
            defaultOpen
            severity={sortedCorridors[0]?.jci >= 70 || sortedCorridors[0]?.severity_score >= 70 ? 'warning' : 'neutral'}
            icon={<Route size={18} />}
            count={corridors.length}
            countLabel="corridors"
          >
            <div className="hw-corridor-list">
              {sortedCorridors.slice(0, 10).map((c, i) => {
                const score = c.jci || c.severity_score || c.congestion_score || 0
                const jciClass = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'
                const barColor = score >= 70 ? '#ff453a' : score >= 40 ? '#ff9f0a' : '#30d158'
                return (
                  <div key={i} className="hw-corridor-card">
                    <div className="hw-corridor-header">
                      <span className="hw-corridor-name">{c.name || c.corridor || `Corridor ${i + 1}`}</span>
                      <span className={`hw-corridor-jci hw-corridor-jci--${jciClass}`}>
                        JCI {score.toFixed(0)}
                      </span>
                    </div>
                    <div className="hw-corridor-meta">
                      {c.works_count != null && <span>{c.works_count} works</span>}
                      {c.length_km != null && <span>{c.length_km.toFixed(1)} km</span>}
                      {c.traffic_volume != null && <span>{formatNumber(c.traffic_volume)} vehicles/day</span>}
                      {c.capacity_reduction != null && <span>{Math.round(c.capacity_reduction * 100)}% capacity loss</span>}
                    </div>
                    <div className="hw-corridor-bar-wrap">
                      <div className="hw-corridor-bar">
                        <div className="hw-corridor-bar-fill" style={{ width: `${Math.min(score, 100)}%`, background: barColor }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
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
            defaultOpen
          >
            {breaches.length > 0 && (
              <div className="hw-s59-group">
                <div className="hw-s59-heading hw-s59-heading--breach">
                  s59 Breaches — {breaches.length} road sections exceed 30% capacity loss
                </div>
                {breaches.map((clash, i) => (
                  <div key={i} className="hw-clash-card">
                    <div className="hw-clash-road">{clash.road || clash.corridor || 'Unknown road'}</div>
                    <div className="hw-clash-meta">
                      {clash.concurrent_works} concurrent works · {clash.total_capacity_reduction ? `${Math.round(clash.total_capacity_reduction * 100)}%` : '>30%'} capacity loss
                      {clash.recommendation && <div className="hw-clash-recommendation">{clash.recommendation}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {coordinations.length > 0 && (
              <div className="hw-s59-group">
                <div className="hw-s59-heading hw-s59-heading--coordination">
                  Co-ordination Required — {coordinations.length} sections
                </div>
                {displayedCoordinations.map((clash, i) => (
                  <div key={i} className="hw-clash-card coordination">
                    <div className="hw-clash-road">{clash.road || clash.corridor || 'Unknown road'}</div>
                    <div className="hw-clash-meta">
                      {clash.concurrent_works} concurrent works
                      {clash.recommendation && <div className="hw-clash-recommendation">{clash.recommendation}</div>}
                    </div>
                  </div>
                ))}
                {coordinations.length > 5 && (
                  <button className="hw-show-all-btn" onClick={() => setShowAllCoordinations(v => !v)}>
                    {showAllCoordinations ? 'Show fewer' : `Show all ${coordinations.length} coordinations`}
                  </button>
                )}
              </div>
            )}
            {monitors.length > 0 && (
              <div className="hw-s59-group">
                <div className="hw-s59-heading hw-s59-heading--monitor">
                  Monitoring — {monitors.length} developing situations
                </div>
                {displayedMonitors.map((clash, i) => (
                  <div key={i} className="hw-clash-card monitor">
                    <div className="hw-clash-road">{clash.road || clash.corridor || 'Unknown road'}</div>
                    <div className="hw-clash-meta">
                      {clash.concurrent_works} concurrent works
                    </div>
                  </div>
                ))}
                {monitors.length > 3 && (
                  <button className="hw-show-all-btn" onClick={() => setShowAllMonitors(v => !v)}>
                    {showAllMonitors ? 'Show fewer' : `Show all ${monitors.length} monitors`}
                  </button>
                )}
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
            defaultOpen
          >
            {displayedDeferrals.map((def, i) => (
              <div key={i} className="hw-deferral-card">
                <div className="hw-deferral-header">
                  <div className="hw-deferral-road">{def.road || 'Unknown road'}</div>
                  {def.confidence != null && <ConfidenceDots value={def.confidence} />}
                </div>
                <div className="hw-deferral-reason">{def.reason || def.recommendation || ''}</div>
                {def.confidence_flags && def.confidence_flags.length > 0 && (
                  <div className="hw-deferral-flags">
                    Flags: {def.confidence_flags.join(', ')}
                  </div>
                )}
              </div>
            ))}
            {deferrals.length > 8 && (
              <button className="hw-show-all-btn" onClick={() => setShowAllDeferrals(v => !v)}>
                {showAllDeferrals ? 'Show fewer' : `Show all ${deferrals.length} recommendations`}
              </button>
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
            defaultOpen
          >
            <div className="hw-table-overflow">
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
                  {displayedJunctions.map((jn, i) => {
                    const score = jn.jci || jn.jci_score || 0
                    const qualityClass = jn.data_quality === 'high' ? 'high' : jn.data_quality === 'medium' ? 'medium' : 'low'
                    return (
                      <tr key={i}>
                        <td className="hw-td-bold">{jn.name || `Junction ${i + 1}`}</td>
                        <td>
                          <span className="hw-jci-score" style={{ color: score >= 80 ? '#ff453a' : score >= 60 ? '#ff6d3b' : score >= 40 ? '#ff9f0a' : '#30d158' }}>
                            {score.toFixed(0)}
                          </span>/100
                        </td>
                        <td>{jn.traffic_volume ? formatNumber(jn.traffic_volume) : '-'}</td>
                        <td>{jn.works_count || 0}</td>
                        <td>
                          <span className={`hw-data-quality hw-data-quality--${qualityClass}`}>
                            {jn.data_quality || 'unknown'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {junctions.length > 15 && (
              <button className="hw-show-all-btn" onClick={() => setShowAllJunctions(v => !v)}>
                {showAllJunctions ? 'Show top 15 only' : `Show all ${junctions.length} junctions`}
              </button>
            )}
          </CollapsibleSection>
        )}

        {/* Road Infrastructure */}
        <CollapsibleSection
          title="Road Infrastructure"
          subtitle="Traffic signals, crossings, restrictions and infrastructure hotspots"
          severity="neutral"
          icon={<Layers size={18} />}
          count={infrastructure?.summary?.total_features || null}
          defaultOpen
          countLabel="features"
        >
          {infrastructure ? (
            <>
              {/* Summary grid */}
              <div className="hw-infra-summary-grid">
                {[
                  { label: 'Traffic Signals', value: infrastructure.summary?.traffic_signals, color: '#0a84ff' },
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
                        const colors = { '20': '#30d158', '30': '#0a84ff', '40': '#bf5af2', '50': '#ff9f0a', '60': '#ff6d3b', '70': '#ff453a' }
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

        {/* District breakdown */}
        {districtData.length > 1 && (
          <CollapsibleSection
            title="District Breakdown"
            subtitle="Works distribution across Lancashire districts"
            severity="neutral"
            icon={<MapPin size={18} />}
            count={districtData.length}
            countLabel="districts"
            defaultOpen
          >
            <div className="hw-table-overflow">
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
                        <td className="hw-td-bold">{d.name}</td>
                        <td>{formatNumber(d.total)}</td>
                        <td>{formatNumber(d.started)}</td>
                        <td>{formatNumber(d.planned)}</td>
                        <td>
                          <div className="hw-district-share">
                            <div className="hw-district-bar">
                              <div className="hw-district-bar-fill" style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                            </div>
                            <span className="hw-district-pct">{pct}%</span>
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
            defaultOpen
          >
            {legal.legislation?.map((law, i) => (
              <div key={i} className="hw-law-block">
                <div className="hw-law-title">{law.title}</div>
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

        {/* Data Freshness */}
        {Object.keys(dataFreshness).length > 0 && (
          <CollapsibleSection
            title="Data Sources"
            subtitle="Freshness and coverage of each data source"
            severity="neutral"
            icon={<BarChart3 size={18} />}
            count={Object.keys(dataFreshness).length}
            countLabel="sources"
            defaultOpen
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
                    <td className="hw-td-bold">{src.source || key}</td>
                    <td>{src.records != null ? formatNumber(src.records) : '-'}</td>
                    <td style={{ fontSize: '0.8rem', color: '#8e8e93' }}>{src.update_cycle || '-'}</td>
                    <td>
                      {src.stale === true ? (
                        <span className="hw-freshness-stale">Stale ({src.stale_hours ? `${Math.round(src.stale_hours)}h` : ''})</span>
                      ) : src.stale === false ? (
                        <span className="hw-freshness-fresh">Fresh</span>
                      ) : (
                        <span className="hw-freshness-unknown">—</span>
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
              {sortedFiltered.length === roadworks.length
                ? `${formatNumber(roadworks.length)} works`
                : `${formatNumber(sortedFiltered.length)} of ${formatNumber(roadworks.length)} works`
              }
            </span>
          </div>
          <div className="hw-list-controls">
            <input
              type="text"
              className="hw-search-input"
              placeholder="Search roads, operators, wards…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <select
              className="hw-sort-select"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              aria-label="Sort roadworks"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>Sort: {opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="hw-card-list">
          {paginated.map(rw => {
            const rb = restrictionBadge(rw)
            const sb = statusBadge(rw.status)
            const sevColor = rw.severity === 'high' ? '#ff453a' : rw.severity === 'medium' ? '#ff9f0a' : '#8e8e93'
            const cap = capacityLoss(rw)
            const capClass = cap >= 80 ? 'high' : cap >= 40 ? 'medium' : 'low'
            const duration = computeDuration(rw.start_date, rw.end_date)
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
                    {duration && (
                      <span className="hw-card-duration">
                        <Clock size={10} /> {duration}
                      </span>
                    )}
                  </div>
                  {/* Capacity bar */}
                  <div className="hw-capacity-bar-wrap">
                    <div className="hw-capacity-bar">
                      <div className={`hw-capacity-bar-fill hw-capacity-bar-fill--${capClass}`} style={{ width: `${cap}%` }} />
                    </div>
                    <span className="hw-capacity-label">{cap}% capacity loss</span>
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

        {/* Styled empty state */}
        {sortedFiltered.length === 0 && (
          <div className="hw-empty hw-empty--styled">
            <div className="hw-empty-icon">🔍</div>
            <h3>No roadworks match your filters</h3>
            <p>
              {searchTerm
                ? `No results for "${searchTerm}". Try a different search term or adjust your filters.`
                : 'Try removing some filters to see more results.'
              }
            </p>
            {(severity || status || district || operator || searchTerm) && (
              <button className="hw-clear-btn" onClick={clearFilters}>Clear all filters</button>
            )}
          </div>
        )}

        {/* Pagination with page numbers */}
        {totalPages > 1 && (
          <div className="hw-pagination">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft size={16} style={{ verticalAlign: 'middle' }} /> Prev
            </button>
            {pageNumbers.map((p, i) =>
              p === '...' ? (
                <span key={`e${i}`} className="hw-page-ellipsis">...</span>
              ) : (
                <button
                  key={p}
                  className={`hw-page-btn ${p === page ? 'active' : ''}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              )
            )}
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Next <ChevronRight size={16} style={{ verticalAlign: 'middle' }} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
