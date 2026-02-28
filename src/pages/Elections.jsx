import { useState, useEffect, useMemo, useCallback } from 'react'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useData } from '../hooks/useData'
import { formatNumber } from '../utils/format'
import { TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE } from '../utils/constants'
import {
  DEFAULT_ASSUMPTIONS,
  predictWard,
  predictCouncil,
  applyOverrides,
  computeCoalitions,
  projectToLGRAuthority,
  predictConstituencyGE,
} from '../utils/electionModel'
import { LoadingState } from '../components/ui'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, ScatterChart, Scatter, ZAxis,
} from 'recharts'
import { Link } from 'react-router-dom'
import {
  Calendar, Users, Vote, TrendingUp, ChevronDown, ChevronRight,
  MapPin, Sliders, RotateCcw, Building, ExternalLink, AlertTriangle,
  BarChart3, Target, Handshake, Map, PieChart as PieChartIcon, Landmark,
} from 'lucide-react'
import { slugify } from '../utils/format'
import CouncillorLink from '../components/CouncillorLink'
import IntegrityBadge from '../components/IntegrityBadge'
import './Elections.css'

// --- Council ID to slug mapping (for cross-council links) ---
const COUNCIL_SLUG_MAP = {
  burnley: 'burnleycouncil', hyndburn: 'hyndburncouncil', pendle: 'pendlecouncil',
  rossendale: 'rossendalecouncil', lancaster: 'lancastercouncil', ribble_valley: 'ribblevalleycouncil',
  chorley: 'chorleycouncil', south_ribble: 'southribblecouncil', lancashire_cc: 'lancashirecc',
  blackpool: 'blackpoolcouncil', west_lancashire: 'westlancashirecouncil', blackburn: 'blackburncouncil',
  wyre: 'wyrecouncil', preston: 'prestoncouncil', fylde: 'fyldecouncil',
}
const COUNCIL_NAME_MAP = {
  burnley: 'Burnley', hyndburn: 'Hyndburn', pendle: 'Pendle', rossendale: 'Rossendale',
  lancaster: 'Lancaster', ribble_valley: 'Ribble Valley', chorley: 'Chorley',
  south_ribble: 'South Ribble', lancashire_cc: 'Lancashire CC', blackpool: 'Blackpool',
  west_lancashire: 'West Lancs', blackburn: 'Blackburn', wyre: 'Wyre',
  preston: 'Preston', fylde: 'Fylde',
}

// --- Fallback party colours ---
const FALLBACK_PARTY_COLORS = {
  Labour: '#DC241F', Conservative: '#0087DC', 'Liberal Democrats': '#FAA61A',
  'Lib Dem': '#FAA61A', Green: '#6AB023', 'Reform UK': '#12B6CF',
  Independent: '#888888', UKIP: '#70147A', 'Lab & Co-op': '#DC241F',
  BNP: '#2D2D86', 'Our West Lancs': '#5DADE2', Other: '#999999',
}

// --- Confidence colours ---
const CONFIDENCE_COLORS = { high: '#30d158', medium: '#ff9f0a', low: '#ff453a', none: '#8e8e93' }

// --- Helpers ---

/** Format election type from snake_case to readable text */
function formatElectionType(type) {
  if (!type) return 'Borough'
  const MAP = {
    borough: 'Borough', borough_thirds: 'Borough (Thirds)', borough_halves: 'Borough (Halves)',
    all_out: 'All-out', shadow_authority: 'Shadow Authority', vesting_day: 'Vesting Day',
    county: 'County', constituency: 'Constituency', by_election: 'By-election',
  }
  return MAP[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/** Format date from ISO string to readable "7 May 2026" */
function formatElectionDate(dateStr) {
  if (!dateStr) return 'TBC'
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Ensure party-coloured text is readable on dark backgrounds — boost luminance if needed */
function readablePartyColor(color) {
  if (!color) return '#ccc'
  // Parse hex to RGB
  const hex = color.replace('#', '')
  if (hex.length !== 6) return color
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  // Relative luminance (WCAG formula)
  const sRGB = [r, g, b].map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const L = 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2]
  // If too dark for dark backgrounds (L < 0.15), lighten it
  if (L < 0.15) {
    const lighten = (v) => Math.min(255, Math.round(v * 255 * 1.8 + 60))
    return `rgb(${lighten(r)}, ${lighten(g)}, ${lighten(b)})`
  }
  return color
}

// --- Small reusable components ---

function PartyBadge({ party, color }) {
  return (
    <span className="elec-party-badge" style={{ background: color || FALLBACK_PARTY_COLORS[party] || '#888' }}>
      {party}
    </span>
  )
}

function ConfidenceDot({ confidence }) {
  return (
    <span
      className="elec-confidence-dot"
      style={{ background: CONFIDENCE_COLORS[confidence] || '#8e8e93' }}
      title={`${confidence} confidence`}
      aria-label={`${confidence} confidence prediction`}
    />
  )
}

function AssumptionSlider({ label, value, min, max, step, format, onChange, description }) {
  return (
    <div className="elec-assumption-slider">
      <div className="elec-slider-header">
        <span className="elec-slider-label">{label}</span>
        <span className="elec-slider-value">{format ? format(value) : value}</span>
      </div>
      {description && <span className="elec-slider-desc">{description}</span>}
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="elec-slider-input"
        aria-label={label}
      />
      <div className="elec-slider-range">
        <span>{format ? format(min) : min}</span>
        <span>{format ? format(max) : max}</span>
      </div>
    </div>
  )
}

// --- Custom Recharts tooltip ---
function ElectionTooltip({ active, payload, label, partyColors }) {
  if (!active || !payload?.length) return null
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#fff' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ margin: '2px 0', color: p.color || partyColors?.[p.name] || '#ccc', fontSize: '13px' }}>
          {p.name}: {typeof p.value === 'number' ? (p.value < 1 ? `${(p.value * 100).toFixed(1)}%` : formatNumber(p.value)) : p.value}
        </p>
      ))}
    </div>
  )
}

// --- Section nav definition (dynamic labels set in component based on tier) ---
function getSections(isCounty) {
  const areaLabel = isCounty ? 'Division' : 'Ward'
  return [
    { id: 'overview', label: 'Overview', icon: Calendar },
    { id: 'polling', label: 'Polling', icon: TrendingUp },
    { id: 'history', label: 'Council History', icon: BarChart3 },
    { id: 'wards', label: `${areaLabel} Explorer`, icon: MapPin },
    { id: 'predictions', label: 'Predictions', icon: Target },
    { id: 'builder', label: `${areaLabel} Builder`, icon: Vote },
    { id: 'coalitions', label: 'Coalitions', icon: Handshake },
    { id: 'lgr', label: 'LGR Projections', icon: Map },
    { id: 'demographics', label: 'Demographics', icon: Users },
    { id: 'constituencies', label: 'MPs', icon: Landmark },
  ]
}

// ============================================================================
// Main Elections Component
// ============================================================================

export default function Elections() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const councilId = config.council_id || ''

  // --- Data loading ---
  const { data, loading, error } = useData([
    '/data/elections.json',
    '/data/shared/elections_reference.json',
    '/data/politics_summary.json',
  ])
  const [electionsData, referenceData, politicsSummary] = data || [null, null, null]

  // Optional data (demographics, deprivation) — may fail
  const { data: optData } = useData(['/data/demographics.json', '/data/deprivation.json'])
  const [demographicsData, deprivationData] = optData || [null, null]

  // LGR data for projections section
  const { data: lgrData } = useData('/data/shared/lgr_tracker.json')

  // Polling + Constituency data
  const { data: pollingData } = useData('/data/shared/polling.json')
  const { data: constData } = useData('/data/shared/constituencies.json')
  const { data: modelCoeffs } = useData('/data/shared/model_coefficients.json')
  const { data: integrityData } = useData('/data/integrity.json')

  // --- State ---
  const [activeSection, setActiveSection] = useState('overview')
  const [selectedWard, setSelectedWard] = useState('')
  const [assumptions, setAssumptions] = useState({ ...DEFAULT_ASSUMPTIONS })
  const [overrides, setOverrides] = useState({})
  const [expandedWorkings, setExpandedWorkings] = useState({})
  const [selectedCoalition, setSelectedCoalition] = useState(null)

  // --- Tier-aware labels ---
  const isCounty = config.council_tier === 'county'
  const wardLabel = isCounty ? 'division' : 'ward'
  const wardLabelCap = isCounty ? 'Division' : 'Ward'
  const wardsLabel = isCounty ? 'divisions' : 'wards'
  const wardsLabelCap = isCounty ? 'Divisions' : 'Wards'
  const sections = useMemo(() => getSections(isCounty), [isCounty])

  // --- Page title ---
  useEffect(() => {
    document.title = `Elections | ${councilName} Transparency`
    return () => { document.title = `${councilName} Transparency` }
  }, [councilName])

  // --- Derived data ---
  const partyColors = useMemo(() => {
    return { ...FALLBACK_PARTY_COLORS, ...(referenceData?.party_colors || {}) }
  }, [referenceData])

  const wardNames = useMemo(() => {
    if (!electionsData?.wards) return []
    return Object.keys(electionsData.wards).sort()
  }, [electionsData])

  const wardsUp = useMemo(() => {
    return electionsData?.meta?.next_election?.wards_up || []
  }, [electionsData])

  const totalSeats = useMemo(() => {
    return electionsData?.meta?.total_seats || 0
  }, [electionsData])

  const majorityThreshold = useMemo(() => {
    return Math.floor(totalSeats / 2) + 1
  }, [totalSeats])

  // Current composition from politics_summary
  const currentComposition = useMemo(() => {
    if (!politicsSummary?.parties) return []
    return Object.entries(politicsSummary.parties)
      .map(([party, info]) => ({
        party,
        seats: typeof info === 'number' ? info : info.seats || 0,
      }))
      .filter(p => p.seats > 0)
      .sort((a, b) => b.seats - a.seats)
  }, [politicsSummary])

  // Turnout trend
  const turnoutTrend = useMemo(() => {
    if (!electionsData?.turnout_trends?.length) return []
    return electionsData.turnout_trends
      .filter(t => t.turnout != null)
      .map(t => ({
        year: t.year,
        turnout: Math.round(t.turnout * 1000) / 10,
        type: t.type || 'borough',
      }))
      .sort((a, b) => a.year - b.year)
  }, [electionsData])

  // Council history chart data
  const councilHistoryData = useMemo(() => {
    if (!electionsData?.council_history?.length) return { seats: [], voteShare: [], parties: [], majorParties: [], minorParties: [] }

    // Collect all parties and rank by total seats won (most important first)
    const partySeatTotals = {}
    for (const election of electionsData.council_history) {
      if (election.results_by_party) {
        for (const [p, data] of Object.entries(election.results_by_party)) {
          partySeatTotals[p] = (partySeatTotals[p] || 0) + (data.won || 0)
        }
      }
    }
    const parties = Object.keys(partySeatTotals).sort((a, b) => partySeatTotals[b] - partySeatTotals[a])

    // Split into major parties (won 2+ seats ever, or top 6) and minor parties
    // This keeps the table readable while charts show everything
    const majorParties = parties.filter((p, i) => partySeatTotals[p] >= 2 || i < 6)
    const minorParties = parties.filter(p => !majorParties.includes(p))

    const seats = electionsData.council_history
      .sort((a, b) => a.year - b.year)
      .map(e => {
        const row = { year: e.year, type: e.type || '' }
        for (const p of parties) {
          row[p] = e.results_by_party?.[p]?.won || 0
        }
        return row
      })

    const voteShare = electionsData.council_history
      .sort((a, b) => a.year - b.year)
      .map(e => {
        const row = { year: e.year }
        for (const p of parties) {
          row[p] = e.results_by_party?.[p]?.pct != null
            ? Math.round(e.results_by_party[p].pct * 1000) / 10
            : 0
        }
        return row
      })

    return { seats, voteShare, parties, majorParties, minorParties }
  }, [electionsData])

  // Ward explorer data for selected ward
  const selectedWardData = useMemo(() => {
    if (!selectedWard || !electionsData?.wards?.[selectedWard]) return null
    return electionsData.wards[selectedWard]
  }, [selectedWard, electionsData])

  // Demographics/deprivation maps indexed by ward name
  // Data may be array [{ward_name, ...}] or object {code: {name, ...}} or {name: {...}}
  const demographicsMap = useMemo(() => {
    if (!demographicsData?.wards) return {}
    const wards = demographicsData.wards
    const map = {}
    if (Array.isArray(wards)) {
      for (const ward of wards) {
        if (ward.ward_name) map[ward.ward_name] = ward
      }
    } else {
      // Object keyed by ward code or name
      for (const [key, ward] of Object.entries(wards)) {
        const name = ward.ward_name || ward.name || key
        map[name] = { ...ward, ward_name: name }
      }
    }
    return map
  }, [demographicsData])

  const deprivationMap = useMemo(() => {
    if (!deprivationData?.wards) return {}
    const wards = deprivationData.wards
    const map = {}
    if (Array.isArray(wards)) {
      for (const ward of wards) {
        if (ward.ward_name) map[ward.ward_name] = ward
      }
    } else {
      // Object keyed by ward name
      for (const [key, ward] of Object.entries(wards)) {
        const name = ward.ward_name || ward.name || key
        map[name] = { ...ward, ward_name: name }
      }
    }
    return map
  }, [deprivationData])

  // Build constituency map: wardName → GE2024 party shares for Reform proxy
  const constituencyMap = useMemo(() => {
    if (!constData?.constituencies || !electionsData?.wards) return null
    const map = {}
    const wardNameList = Object.keys(electionsData.wards)

    // Find constituencies overlapping this council
    const relevantConstituencies = constData.constituencies.filter(c =>
      c.overlapping_councils?.includes(councilId)
    )

    if (relevantConstituencies.length === 0) return null

    // Build party result map from GE2024 for each relevant constituency
    const constituencyResults = relevantConstituencies.map(c => {
      const partyShares = {}
      for (const r of (c.ge2024?.results || [])) {
        partyShares[r.party] = r.pct || 0
      }
      return { id: c.id, name: c.name, wards: c.overlapping_wards || {}, partyShares }
    })

    if (relevantConstituencies.length === 1) {
      // Single constituency → all wards map to it
      const result = constituencyResults[0].partyShares
      for (const wardName of wardNameList) {
        map[wardName] = result
      }
    } else {
      // Multiple constituencies: check overlapping_wards for ward-level mapping
      // If overlapping_wards is populated, use it; otherwise, average all constituencies
      let anyMapped = false
      for (const cr of constituencyResults) {
        if (cr.wards && Object.keys(cr.wards).length > 0) {
          for (const wardName of Object.keys(cr.wards)) {
            map[wardName] = cr.partyShares
            anyMapped = true
          }
        }
      }
      // Fallback: if no ward-level mapping, assign average to all wards
      if (!anyMapped) {
        const avgShares = {}
        for (const cr of constituencyResults) {
          for (const [party, share] of Object.entries(cr.partyShares)) {
            avgShares[party] = (avgShares[party] || 0) + share / constituencyResults.length
          }
        }
        for (const wardName of wardNameList) {
          map[wardName] = avgShares
        }
      }
    }

    return Object.keys(map).length > 0 ? map : null
  }, [constData, electionsData, councilId])

  // --- PREDICTIONS ---
  const councilPrediction = useMemo(() => {
    if (!electionsData || !wardsUp.length || !referenceData) return null

    // 1B.3: Use live polling data when available, fall back to stale reference data
    // polling.json aggregate values are already proportions (e.g., 0.296 = 29.6%)
    const nationalPolling = pollingData?.aggregate || referenceData.national_polling?.parties || {}
    const ge2024Result = referenceData.national_polling?.ge2024_result || {}
    const lcc2025 = referenceData.lancashire_lcc_2025 || null
    const modelParams = referenceData.model_parameters || null

    return predictCouncil(
      electionsData, wardsUp, assumptions,
      nationalPolling, ge2024Result,
      demographicsMap, deprivationMap,
      constituencyMap, // Now properly built from GE2024 data
      lcc2025, modelParams
    )
  }, [electionsData, wardsUp, assumptions, referenceData, demographicsMap, deprivationMap, constituencyMap, pollingData])

  // Seat totals after user overrides (for Ward Builder)
  const builderSeatTotals = useMemo(() => {
    if (!councilPrediction) return {}
    if (Object.keys(overrides).length === 0) return councilPrediction.seatTotals
    return applyOverrides(councilPrediction, overrides, totalSeats)
  }, [councilPrediction, overrides, totalSeats])

  // Coalition analysis from builder seat totals
  const coalitions = useMemo(() => {
    if (!builderSeatTotals || !majorityThreshold) return []
    return computeCoalitions(builderSeatTotals, majorityThreshold)
  }, [builderSeatTotals, majorityThreshold])

  // LGR projections
  const lgrProjections = useMemo(() => {
    if (!lgrData?.proposed_models || !builderSeatTotals) return []

    // Build a simple council seat totals map
    const councilSeats = { [councilId]: builderSeatTotals }
    return lgrData.proposed_models.map(model => ({
      ...model,
      projection: projectToLGRAuthority(councilSeats, model),
    }))
  }, [lgrData, builderSeatTotals, councilId])

  // Demographics scatter data — uses demographicsMap (already normalized from object or array)
  const demoScatterData = useMemo(() => {
    if (!Object.keys(demographicsMap).length || !electionsData?.wards) return []
    const points = []
    for (const [wardName, dWard] of Object.entries(demographicsMap)) {
      const eWard = electionsData.wards[wardName]
      if (!eWard?.history?.length) continue
      const latest = [...eWard.history].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
      if (!latest?.turnout) continue
      points.push({
        ward: wardName,
        turnout: Math.round(latest.turnout * 1000) / 10,
        deprivation: deprivationMap[wardName]?.avg_imd_decile || 5,
        over65: dWard.age_65_plus_pct ? Math.round(dWard.age_65_plus_pct * 1000) / 10 : null,
        winner: latest.candidates?.sort((a, b) => b.votes - a.votes)?.[0]?.party || 'Unknown',
      })
    }
    return points
  }, [demographicsMap, electionsData, deprivationMap])

  // --- Callbacks ---
  const scrollToSection = useCallback((sectionId) => {
    setActiveSection(sectionId)
    document.getElementById(`elec-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const toggleWorkings = useCallback((wardName) => {
    setExpandedWorkings(prev => ({ ...prev, [wardName]: !prev[wardName] }))
  }, [])

  const setOverride = useCallback((wardName, party) => {
    setOverrides(prev => {
      const updated = { ...prev }
      if (updated[wardName] === party) {
        delete updated[wardName]
      } else {
        updated[wardName] = party
      }
      return updated
    })
  }, [])

  const resetOverrides = useCallback(() => {
    setOverrides({})
    setSelectedCoalition(null)
  }, [])

  const updateAssumption = useCallback((key, value) => {
    setAssumptions(prev => ({ ...prev, [key]: value }))
  }, [])

  // --- Loading / error states ---
  if (loading) return <LoadingState message="Loading election data..." />
  if (error || !electionsData) {
    return (
      <div className="elec-page">
        <div className="elec-error">
          <AlertTriangle size={24} />
          <h2>Election data not available</h2>
          <p>Election data has not been generated for {councilName} yet. Check back soon.</p>
        </div>
      </div>
    )
  }

  const meta = electionsData.meta || {}
  const nextElection = meta.next_election || null

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="elec-page">
      {/* Page Header */}
      <div className="elec-header">
        <h1><Vote size={28} /> Elections</h1>
        <p className="elec-subtitle">
          {wardLabelCap}-level election history, predictions and coalition modelling for {meta.council_name || councilName}.
          {meta.total_seats ? ` ${meta.total_seats} seats across ${meta.total_wards || wardNames.length} ${wardsLabel}.` : ''}
          {meta.election_cycle ? ` Elections by ${meta.election_cycle === 'thirds' ? 'thirds (one-third of seats each year)' : meta.election_cycle === 'halves' ? 'halves (half the seats each cycle)' : meta.election_cycle}.` : ''}
        </p>
      </div>

      {/* Section Navigation */}
      <nav className="elec-section-nav" aria-label="Election page sections">
        {sections.map(s => (
          <button
            key={s.id}
            className={`section-nav-btn ${activeSection === s.id ? 'active' : ''}`}
            onClick={() => scrollToSection(s.id)}
            aria-current={activeSection === s.id ? 'true' : undefined}
          >
            <s.icon size={14} />
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      {/* ================================================================ */}
      {/* SECTION 1: Overview                                              */}
      {/* ================================================================ */}
      <section className="elec-section" id="elec-overview">
        <h2><Calendar size={20} /> Overview</h2>

        {/* No upcoming election — link to other councils */}
        {!nextElection && referenceData?.election_calendar?.length > 0 && (() => {
          const nextCal = referenceData.election_calendar.find(
            ev => ev.councils?.length > 0 && new Date(ev.date) > new Date()
          )
          if (!nextCal) return null
          const otherCouncils = nextCal.councils.filter(c => c !== councilId)
          if (!otherCouncils.length) return null
          return (
            <div className="elec-no-election-banner">
              <Calendar size={18} />
              <div>
                <strong>No upcoming election for {meta.council_name || councilName}.</strong>
                <p>
                  The next elections in Lancashire are on <strong>{formatElectionDate(nextCal.date)}</strong>{' '}
                  ({formatElectionType(nextCal.type)}) in {otherCouncils.length} council{otherCouncils.length !== 1 ? 's' : ''}:
                </p>
                <div className="elec-cross-council-links">
                  {otherCouncils.map(cId => {
                    const slug = COUNCIL_SLUG_MAP[cId]
                    const name = COUNCIL_NAME_MAP[cId] || cId.replace(/_/g, ' ')
                    if (!slug) return <span key={cId} className="elec-council-chip">{name}</span>
                    return (
                      <a
                        key={cId}
                        href={`/lancashire/${slug}/elections`}
                        className="elec-council-chip elec-council-link"
                      >
                        <Vote size={12} />
                        {name}
                      </a>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })()}

        {/* Next election info card */}
        {nextElection && (
          <div className="elec-next-election-card">
            <div className="elec-next-election-header">
              <Calendar size={18} />
              <h3>Next Election: {formatElectionDate(nextElection.date)}</h3>
            </div>
            <div className="elec-next-election-stats">
              <div className="elec-stat">
                <span className="elec-stat-value">{nextElection.seats_up || wardsUp.length}</span>
                <span className="elec-stat-label">Seats up</span>
              </div>
              <div className="elec-stat">
                <span className="elec-stat-value">{wardsUp.length}</span>
                <span className="elec-stat-label">Wards contested</span>
              </div>
              <div className="elec-stat">
                <span className="elec-stat-value">{formatElectionType(nextElection.type)}</span>
                <span className="elec-stat-label">Election type</span>
              </div>
              <div className="elec-stat">
                <span className="elec-stat-value">{totalSeats}</span>
                <span className="elec-stat-label">Total council seats</span>
              </div>
            </div>
          </div>
        )}

        {/* Election calendar timeline */}
        {referenceData?.election_calendar?.length > 0 && (
          <div className="elec-calendar">
            <h3>Upcoming Elections</h3>
            <div className="elec-timeline">
              {referenceData.election_calendar.slice(0, 6).map((ev, i) => {
                const isThisCouncil = ev.councils?.includes(councilId)
                return (
                  <div key={i} className={`elec-timeline-item ${isThisCouncil ? 'highlight' : ''}`}>
                    <div className="elec-timeline-marker" />
                    <div className="elec-timeline-content">
                      <span className="elec-timeline-date">{formatElectionDate(ev.date)}</span>
                      <span className="elec-timeline-desc">
                        {ev.note || ev.description || formatElectionType(ev.type)}
                      </span>
                      {ev.councils?.length > 0 && (
                        <div className="elec-timeline-councils">
                          {ev.councils.map(cId => {
                            const slug = COUNCIL_SLUG_MAP[cId]
                            const name = COUNCIL_NAME_MAP[cId] || cId.replace(/_/g, ' ')
                            if (cId === councilId) {
                              return <span key={cId} className="elec-council-chip current">{name}</span>
                            }
                            if (!slug) return <span key={cId} className="elec-council-chip">{name}</span>
                            return (
                              <a
                                key={cId}
                                href={`/lancashire/${slug}/elections`}
                                className="elec-council-chip elec-council-link"
                              >
                                {name}
                              </a>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="elec-overview-grid">
          {/* Current composition pie chart */}
          {currentComposition.length > 0 && (
            <div className="elec-chart-card">
              <h3>Current Council Composition</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={currentComposition}
                    dataKey="seats"
                    nameKey="party"
                    cx="50%" cy="50%"
                    outerRadius={100}
                    label={({ party, seats }) => `${party} (${seats})`}
                    labelLine={{ strokeWidth: 1 }}
                  >
                    {currentComposition.map((entry, i) => (
                      <Cell key={i} fill={partyColors[entry.party] || '#888'} />
                    ))}
                  </Pie>
                  <Tooltip content={<ElectionTooltip partyColors={partyColors} />} />
                </PieChart>
              </ResponsiveContainer>
              {majorityThreshold > 0 && (
                <p className="elec-chart-note">Majority threshold: {majorityThreshold} seats</p>
              )}
            </div>
          )}

          {/* Turnout trend */}
          {turnoutTrend.length > 0 && (
            <div className="elec-chart-card">
              <h3>Turnout Trend</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={turnoutTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="year" axisLine={false} tickLine={false} tick={AXIS_TICK_STYLE} />
                  <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK_STYLE} unit="%" domain={[0, 'auto']} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${v}%`} />
                  <Line type="monotone" dataKey="turnout" stroke="#0a84ff" strokeWidth={2} dot={{ r: 4 }} name="Turnout" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION: Polling Dashboard                                       */}
      {/* ================================================================ */}
      <section id="elec-polling" className="elec-section">
        <h2 className="elec-section-title">
          <TrendingUp size={22} className="elec-section-icon" />
          National Polling
        </h2>

        {pollingData?.aggregate ? (
          <div className="elec-polling-dashboard">
            <div className="elec-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              {Object.entries(pollingData.aggregate)
                .sort((a, b) => b[1] - a[1])
                .map(([party, share]) => {
                  const trend = pollingData.trend_30d?.[party]
                  return (
                    <div key={party} className="elec-stat-card">
                      <div className="elec-stat-label" style={{ color: partyColors[party] || '#ccc' }}>{party}</div>
                      <div className="elec-stat-value">{(share * 100).toFixed(1)}%</div>
                      {trend != null && (
                        <div className={`elec-stat-trend ${trend > 0 ? 'positive' : trend < 0 ? 'negative' : ''}`}>
                          {trend > 0 ? '\u25B2' : trend < 0 ? '\u25BC' : '\u2014'} {Math.abs(trend * 100).toFixed(1)}pp / 30d
                        </div>
                      )}
                    </div>
                  )
                })
              }
            </div>

            {/* Individual polls table */}
            {pollingData.individual_polls?.length > 0 && (
              <div className="elec-card" style={{ marginTop: '1rem' }}>
                <h3 className="elec-card-title">Recent Polls</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="elec-table">
                    <thead>
                      <tr>
                        <th>Pollster</th>
                        <th>Date</th>
                        <th>Sample</th>
                        {Object.keys(pollingData.aggregate).sort((a, b) => (pollingData.aggregate[b] || 0) - (pollingData.aggregate[a] || 0)).slice(0, 5).map(p => (
                          <th key={p} style={{ color: partyColors[p] || '#ccc' }}>{p.replace('Liberal Democrats', 'Lib Dem').replace('Reform UK', 'Reform').replace('Green Party', 'Green')}</th>
                        ))}
                        <th>Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pollingData.individual_polls.slice(0, 10).map((poll, i) => (
                        <tr key={i}>
                          <td>{poll.pollster}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{poll.end_date}</td>
                          <td>{poll.sample_size?.toLocaleString()}</td>
                          {Object.keys(pollingData.aggregate).sort((a, b) => (pollingData.aggregate[b] || 0) - (pollingData.aggregate[a] || 0)).slice(0, 5).map(p => (
                            <td key={p} style={{ color: partyColors[p] || '#ccc' }}>
                              {poll.parties?.[p] ? `${(poll.parties[p] * 100).toFixed(0)}%` : '\u2014'}
                            </td>
                          ))}
                          <td>{poll.weight ? (poll.weight * 100).toFixed(0) + '%' : '\u2014'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="elec-methodology-note" style={{ marginTop: '0.75rem' }}>
                  Methodology: {pollingData.meta?.methodology?.weighting || 'Weighted average of recent polls'}.
                  {pollingData.meta?.polls_aggregated && ` ${pollingData.meta.polls_aggregated} polls aggregated.`}
                </p>
              </div>
            )}

            {/* Swing from GE2024 */}
            {pollingData.swing_from_ge2024 && (
              <div className="elec-card" style={{ marginTop: '1rem' }}>
                <h3 className="elec-card-title">Swing from GE2024</h3>
                <div className="elec-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                  {Object.entries(pollingData.swing_from_ge2024)
                    .sort((a, b) => b[1] - a[1])
                    .map(([party, swing]) => (
                      <div key={party} className="elec-stat-card">
                        <div className="elec-stat-label" style={{ color: partyColors[party] || '#ccc' }}>{party}</div>
                        <div className={`elec-stat-value ${swing > 0 ? 'positive' : 'negative'}`} style={{ color: swing > 0.01 ? '#30d158' : swing < -0.01 ? '#ff453a' : '#8e8e93' }}>
                          {swing > 0 ? '+' : ''}{(swing * 100).toFixed(1)}pp
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="elec-card">
            <p style={{ color: '#8e8e93' }}>Polling data not available. Run poll_aggregator.py to generate polling.json.</p>
          </div>
        )}
      </section>

      {/* ================================================================ */}
      {/* SECTION 2: Council History                                       */}
      {/* ================================================================ */}
      <section className="elec-section" id="elec-history">
        <h2><BarChart3 size={20} /> Council History</h2>

        {councilHistoryData.seats.length > 0 ? (
          <>
            {/* Seats won stacked bar chart */}
            <div className="elec-chart-card">
              <h3>Seats Won by Party</h3>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={councilHistoryData.seats}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="year" axisLine={false} tickLine={false} tick={AXIS_TICK_STYLE} />
                  <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK_STYLE} />
                  <Tooltip content={<ElectionTooltip partyColors={partyColors} />} />
                  <Legend />
                  {councilHistoryData.parties.map(party => (
                    <Bar
                      key={party}
                      dataKey={party}
                      stackId="seats"
                      fill={partyColors[party] || '#888'}
                      name={party}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Vote share trend */}
            {councilHistoryData.voteShare.length > 0 && (
              <div className="elec-chart-card">
                <h3>Vote Share Trend (%)</h3>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={councilHistoryData.voteShare}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="year" axisLine={false} tickLine={false} tick={AXIS_TICK_STYLE} />
                    <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK_STYLE} unit="%" />
                    <Tooltip content={<ElectionTooltip partyColors={partyColors} />} />
                    <Legend />
                    {councilHistoryData.parties.map(party => (
                      <Line
                        key={party}
                        type="monotone"
                        dataKey={party}
                        stroke={partyColors[party] || '#888'}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        name={party}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Summary table — major parties as columns, minor parties grouped as "Others" */}
            <div className="elec-table-wrap">
              <table className="elec-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Type</th>
                    <th>Seats</th>
                    <th>Turnout</th>
                    {councilHistoryData.majorParties.map(p => (
                      <th key={p} style={{ color: readablePartyColor(partyColors[p]) }}>{p}</th>
                    ))}
                    {councilHistoryData.minorParties.length > 0 && <th>Others</th>}
                  </tr>
                </thead>
                <tbody>
                  {electionsData.council_history
                    .sort((a, b) => b.year - a.year)
                    .map((e, i) => {
                      // Compute "Others" column — sum of minor party seats & votes
                      const otherSeats = councilHistoryData.minorParties.reduce(
                        (sum, p) => sum + (e.results_by_party?.[p]?.won || 0), 0
                      )
                      const otherPct = councilHistoryData.minorParties.reduce(
                        (sum, p) => sum + (e.results_by_party?.[p]?.pct || 0), 0
                      )
                      const otherNames = councilHistoryData.minorParties
                        .filter(p => e.results_by_party?.[p]?.won > 0 || e.results_by_party?.[p]?.pct > 0)
                        .map(p => `${p}: ${e.results_by_party[p].won || 0}`)
                        .join(', ')
                      return (
                        <tr key={i}>
                          <td><strong>{e.year}</strong></td>
                          <td>{formatElectionType(e.type)}</td>
                          <td>{e.seats_contested || '-'}</td>
                          <td>{e.turnout != null ? `${(e.turnout * 100).toFixed(1)}%` : '-'}</td>
                          {councilHistoryData.majorParties.map(p => (
                            <td key={p}>
                              {e.results_by_party?.[p]
                                ? `${e.results_by_party[p].won} (${e.results_by_party[p].pct != null ? (e.results_by_party[p].pct * 100).toFixed(1) + '%' : '-'})`
                                : '-'}
                            </td>
                          ))}
                          {councilHistoryData.minorParties.length > 0 && (
                            <td title={otherNames || 'No minor party results'}>
                              {otherSeats > 0 || otherPct > 0
                                ? `${otherSeats} (${(otherPct * 100).toFixed(1)}%)`
                                : '-'}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="elec-no-data">No council-level election history available.</p>
        )}
      </section>

      {/* ================================================================ */}
      {/* SECTION 3: Ward Explorer                                        */}
      {/* ================================================================ */}
      <section className="elec-section" id="elec-wards">
        <h2><MapPin size={20} /> {wardLabelCap} Explorer</h2>

        <div className="elec-ward-selector">
          <label htmlFor="ward-select">Select {wardLabel}:</label>
          <select
            id="ward-select"
            value={selectedWard}
            onChange={(e) => setSelectedWard(e.target.value)}
            aria-label={`Select a ${wardLabel} to explore`}
          >
            <option value="">-- Choose a {wardLabel} --</option>
            {wardNames.map(w => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>

        {selectedWardData ? (
          <div className="elec-ward-detail">
            <h3>{selectedWard}</h3>

            {/* Current holders */}
            {selectedWardData.current_holders?.length > 0 && (
              <div className="elec-ward-holders">
                <h4>Current Councillors</h4>
                <div className="elec-holder-list">
                  {selectedWardData.current_holders.map((h, i) => (
                    <div key={i} className="elec-holder-item">
                      <PartyBadge party={h.party} color={partyColors[h.party]} />
                      <CouncillorLink
                        name={h.name}
                        councillorId={h.id || slugify(h.name)}
                        compact
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ward stats */}
            <div className="elec-ward-stats">
              {selectedWardData.electorate && (
                <div className="elec-stat">
                  <span className="elec-stat-value">{formatNumber(selectedWardData.electorate)}</span>
                  <span className="elec-stat-label">Electorate</span>
                </div>
              )}
              {selectedWardData.seats && (
                <div className="elec-stat">
                  <span className="elec-stat-value">{selectedWardData.seats}</span>
                  <span className="elec-stat-label">Seats</span>
                </div>
              )}
              {demographicsMap[selectedWard]?.total_population && (
                <div className="elec-stat">
                  <span className="elec-stat-value">{formatNumber(demographicsMap[selectedWard].total_population)}</span>
                  <span className="elec-stat-label">Population</span>
                </div>
              )}
              {deprivationMap[selectedWard]?.avg_imd_decile && (
                <div className="elec-stat">
                  <span className="elec-stat-value">{deprivationMap[selectedWard].avg_imd_decile}</span>
                  <span className="elec-stat-label">IMD Decile</span>
                </div>
              )}
            </div>

            {/* Election history table */}
            {selectedWardData.history?.length > 0 ? (
              <div className="elec-table-wrap">
                <h4>Election History</h4>
                <table className="elec-table elec-table-compact">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Candidate</th>
                      <th>Party</th>
                      <th>Votes</th>
                      <th>%</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...selectedWardData.history]
                      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                      .map((election, ei) =>
                        (election.candidates || [])
                          .sort((a, b) => (b.votes || 0) - (a.votes || 0))
                          .map((candidate, ci) => (
                            <tr
                              key={`${ei}-${ci}`}
                              className={ci === 0 ? 'elec-election-start' : ''}
                            >
                              {ci === 0 ? (
                                <td rowSpan={election.candidates.length}>
                                  <strong>{formatElectionDate(election.date)}</strong>
                                  {election.turnout != null && (
                                    <div className="elec-cell-sub">
                                      Turnout: {(election.turnout * 100).toFixed(1)}%
                                    </div>
                                  )}
                                </td>
                              ) : null}
                              {ci === 0 ? (
                                <td rowSpan={election.candidates.length}>
                                  {formatElectionType(election.type)}
                                </td>
                              ) : null}
                              <td>{candidate.name}</td>
                              <td>
                                <PartyBadge party={candidate.party} color={partyColors[candidate.party]} />
                              </td>
                              <td>{formatNumber(candidate.votes)}</td>
                              <td>{candidate.pct != null ? `${(candidate.pct * 100).toFixed(1)}%` : '-'}</td>
                              <td>{candidate.elected ? <span className="elec-elected">Elected</span> : ''}</td>
                            </tr>
                          ))
                      )}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="elec-no-data">No election history for this ward.</p>
            )}

            {/* Majority trend mini chart */}
            {selectedWardData.history?.length > 1 && (() => {
              const majorityData = selectedWardData.history
                .filter(e => e.majority_pct != null)
                .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
                .map(e => ({
                  year: e.year,
                  majority: Math.round(e.majority_pct * 1000) / 10,
                  winner: e.candidates?.sort((ca, cb) => cb.votes - ca.votes)?.[0]?.party || 'Unknown',
                }))
              if (majorityData.length < 2) return null
              return (
                <div className="elec-chart-card elec-chart-card-sm">
                  <h4>Majority Trend</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={majorityData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                      <XAxis dataKey="year" axisLine={false} tickLine={false} tick={AXIS_TICK_STYLE} />
                      <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK_STYLE} unit="%" />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${v}%`} />
                      <Line type="monotone" dataKey="majority" stroke="#ff9f0a" strokeWidth={2} dot={{ r: 3 }} name="Majority" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )
            })()}
          </div>
        ) : (
          <p className="elec-no-data">Select a {wardLabel} above to explore its election history.</p>
        )}
      </section>

      {/* ================================================================ */}
      {/* SECTION 4: May 2026 Predictions                                 */}
      {/* ================================================================ */}
      <section className="elec-section" id="elec-predictions">
        <h2><Target size={20} /> {nextElection?.date ? formatElectionDate(nextElection.date) : 'Next Election'} Predictions</h2>

        {/* 1B.5: Explain thirds rotation system if applicable */}
        {nextElection && electionsData?.meta?.election_cycle === 'thirds' && (
          <div className="elec-info-banner elec-info-thirds">
            <Calendar size={16} />
            <span>
              <strong>Thirds rotation:</strong> Each of {councilName}'s {electionsData.meta.seats_per_ward || 3}-seat {wardsLabel} has one seat
              contested per year (every {electionsData.meta.seats_per_ward || 3} years per seat).
              {wardsUp.length > 0 && <> In {nextElection.date?.split('-')[0] || 'the next election'}, <strong>{wardsUp.length} {wardsLabel}</strong> are up.
              The "Defending" column shows the councillor whose seat is being contested — not necessarily the first-listed councillor in the ward.</>}
            </span>
          </div>
        )}

        {!nextElection ? (
          <div className="elec-info-banner">
            <AlertTriangle size={16} />
            <span>
              No upcoming election for {meta.council_name || councilName}.
              {(() => {
                const nextCal = referenceData?.election_calendar?.find(
                  ev => ev.councils?.length > 0 && new Date(ev.date) > new Date()
                )
                if (!nextCal) return ' Predictions will appear when a next election is scheduled.'
                const others = nextCal.councils.filter(c => c !== councilId)
                if (!others.length) return ' Predictions will appear when a next election is scheduled.'
                return ` See predictions for the ${formatElectionDate(nextCal.date)} elections above.`
              })()}
            </span>
          </div>
        ) : !councilPrediction ? (
          <div className="elec-info-banner">
            <AlertTriangle size={16} />
            <span>Insufficient data to generate predictions. Ensure ward history and reference data are available.</span>
          </div>
        ) : (
          <>
            {/* Assumption sliders */}
            <div className="elec-assumptions-panel">
              <h3><Sliders size={16} /> Assumptions</h3>
              <div className="elec-assumptions-grid">
                <AssumptionSlider
                  label="Swing Multiplier"
                  value={assumptions.swingMultiplier}
                  min={0.5} max={1.5} step={0.1}
                  format={(v) => `${v.toFixed(1)}x`}
                  onChange={(v) => updateAssumption('swingMultiplier', v)}
                  description="Scale national-to-local swing (1.0 = standard)"
                />
                <AssumptionSlider
                  label="Turnout Adjustment"
                  value={assumptions.turnoutAdjustment}
                  min={-0.05} max={0.05} step={0.01}
                  format={(v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}pp`}
                  onChange={(v) => updateAssumption('turnoutAdjustment', v)}
                  description="Adjust baseline turnout up or down"
                />
                <div className="elec-toggle-row">
                  <label className="elec-toggle-label">
                    <input
                      type="checkbox"
                      checked={assumptions.reformStandsInAllWards}
                      onChange={(e) => updateAssumption('reformStandsInAllWards', e.target.checked)}
                    />
                    Reform UK stands in all wards
                  </label>
                </div>
              </div>
            </div>

            {/* Prediction summary */}
            <div className="elec-prediction-summary">
              <h3>Predicted Council Composition</h3>
              <div className="elec-seat-bars">
                {Object.entries(councilPrediction.seatTotals)
                  .sort((a, b) => b[1] - a[1])
                  .map(([party, seats]) => (
                    <div key={party} className="elec-seat-bar-row">
                      <span className="elec-seat-bar-label" style={{ color: readablePartyColor(partyColors[party]) }}>
                        {party}
                      </span>
                      <div className="elec-seat-bar-track">
                        <div
                          className="elec-seat-bar-fill"
                          style={{
                            width: `${totalSeats > 0 ? (seats / totalSeats) * 100 : 0}%`,
                            background: partyColors[party] || '#888',
                          }}
                        />
                      </div>
                      <span className="elec-seat-bar-count">{seats}</span>
                    </div>
                  ))}
              </div>
              <p className="elec-chart-note">
                Majority threshold: {majorityThreshold}. Total seats: {totalSeats}.
              </p>
            </div>

            {/* Ward-by-ward predictions table */}
            <div className="elec-table-wrap">
              <h3>{wardLabelCap}-by-{wardLabelCap} Predictions ({wardsUp.length} {wardsLabel})</h3>
              <table className="elec-table">
                <thead>
                  <tr>
                    <th>{wardLabelCap}</th>
                    <th>Predicted Winner</th>
                    <th>Defending</th>
                    <th>Confidence</th>
                    <th>Majority</th>
                    <th>Turnout Est.</th>
                    <th>Workings</th>
                  </tr>
                </thead>
                <tbody>
                  {wardsUp.map(wardName => {
                    const result = councilPrediction.wards[wardName]
                    if (!result) return null
                    // Use defenders data (correct for thirds rotation) with fallback to first current holder
                    const defender = electionsData.meta?.next_election?.defenders?.[wardName]
                    const currentHolder = defender?.party || electionsData.wards[wardName]?.current_holders?.[0]?.party || '-'
                    const isChange = result.winner && result.winner !== currentHolder && currentHolder !== '-'

                    return [
                      <tr key={wardName} className={isChange ? 'elec-row-change' : ''}>
                        <td><strong>{wardName}</strong></td>
                        <td>
                          {result.winner ? (
                            <PartyBadge party={result.winner} color={partyColors[result.winner]} />
                          ) : '-'}
                          {isChange && <span className="elec-change-arrow" title="Seat change"> GAIN</span>}
                        </td>
                        <td>
                          {currentHolder !== '-' ? (
                            <PartyBadge party={currentHolder} color={partyColors[currentHolder]} />
                          ) : '-'}
                        </td>
                        <td><ConfidenceDot confidence={result.confidence} /> {result.confidence}</td>
                        <td>
                          {result.majority != null
                            ? `${formatNumber(result.majority)} (${result.majorityPct != null ? (result.majorityPct * 100).toFixed(1) + '%' : '-'})`
                            : '-'}
                        </td>
                        <td>{result.estimatedTurnout ? `${(result.estimatedTurnout * 100).toFixed(1)}%` : '-'}</td>
                        <td>
                          <button
                            className="elec-btn-small"
                            onClick={() => toggleWorkings(wardName)}
                            aria-expanded={expandedWorkings[wardName] ? 'true' : 'false'}
                            aria-label={`Show workings for ${wardName}`}
                          >
                            {expandedWorkings[wardName] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </td>
                      </tr>,
                      expandedWorkings[wardName] && (
                        <tr key={`${wardName}-workings`} className="elec-workings-row">
                          <td colSpan={7}>
                            <div className="elec-workings">
                              <h4>Methodology for {wardName}</h4>
                              {result.methodology?.map((step, si) => (
                                <div key={si} className="elec-workings-step">
                                  <span className="elec-step-num">Step {step.step}</span>
                                  <strong>{step.name}</strong>
                                  <p>{step.description}</p>
                                  {step.data && (
                                    <div className="elec-workings-data">
                                      {Object.entries(step.data).map(([party, val]) => (
                                        <span key={party} style={{ color: readablePartyColor(partyColors[party]) }}>
                                          {party}: {typeof val === 'number' ? `${(val * 100).toFixed(1)}%` : val}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {step.factors?.length > 0 && (
                                    <ul className="elec-workings-factors">
                                      {step.factors.map((f, fi) => <li key={fi}>{f}</li>)}
                                    </ul>
                                  )}
                                </div>
                              ))}
                              {/* Final predicted shares */}
                              {result.prediction && (
                                <div className="elec-workings-final">
                                  <strong>Final Predicted Shares:</strong>
                                  <div className="elec-workings-data">
                                    {Object.entries(result.prediction)
                                      .sort((a, b) => b[1].votes - a[1].votes)
                                      .map(([party, data]) => (
                                        <span key={party} style={{ color: readablePartyColor(partyColors[party]) }}>
                                          {party}: {(data.pct * 100).toFixed(1)}% ({formatNumber(data.votes)} votes)
                                        </span>
                                      ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ),
                    ]
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* ================================================================ */}
      {/* SECTION 5: Ward Builder                                         */}
      {/* ================================================================ */}
      <section className="elec-section" id="elec-builder">
        <h2><Vote size={20} /> {wardLabelCap} Builder</h2>
        <p className="elec-section-desc">
          Click a party name to override the predicted winner for each {wardLabel}. Running seat totals update in real time.
        </p>

        {!councilPrediction || !wardsUp.length ? (
          <div className="elec-info-banner">
            <AlertTriangle size={16} />
            <span>{wardLabelCap} Builder requires prediction data. Ensure the Predictions section has valid results.</span>
          </div>
        ) : (
          <>
            {/* Running totals */}
            <div className="elec-builder-totals">
              <div className="elec-builder-totals-bar">
                {Object.entries(builderSeatTotals)
                  .sort((a, b) => b[1] - a[1])
                  .map(([party, seats]) => (
                    <div
                      key={party}
                      className="elec-builder-segment"
                      style={{
                        width: `${totalSeats > 0 ? (seats / totalSeats) * 100 : 0}%`,
                        background: partyColors[party] || '#888',
                      }}
                      title={`${party}: ${seats} seats`}
                    >
                      {seats >= 1 && <span>{seats}</span>}
                    </div>
                  ))}
              </div>
              <div className="elec-builder-legend">
                {Object.entries(builderSeatTotals)
                  .sort((a, b) => b[1] - a[1])
                  .map(([party, seats]) => (
                    <span key={party} className="elec-builder-legend-item">
                      <span className="elec-legend-dot" style={{ background: partyColors[party] || '#888' }} />
                      {party}: {seats}
                      {seats >= majorityThreshold && <span className="elec-majority-badge">MAJORITY</span>}
                    </span>
                  ))}
              </div>
              <div className="elec-builder-actions">
                {Object.keys(overrides).length > 0 && (
                  <button className="elec-btn-reset" onClick={resetOverrides}>
                    <RotateCcw size={14} /> Reset Overrides ({Object.keys(overrides).length})
                  </button>
                )}
              </div>
            </div>

            {/* Ward override grid */}
            <div className="elec-builder-grid">
              {wardsUp.map(wardName => {
                const result = councilPrediction.wards[wardName]
                if (!result) return null
                const currentWinner = overrides[wardName] || result.winner
                // All parties that appeared in prediction
                const allParties = result.prediction ? Object.keys(result.prediction) : []

                return (
                  <div key={wardName} className={`elec-builder-ward ${overrides[wardName] ? 'overridden' : ''}`}>
                    <div className="elec-builder-ward-header">
                      <strong>{wardName}</strong>
                      {overrides[wardName] && <span className="elec-override-badge">Overridden</span>}
                    </div>
                    <div className="elec-builder-ward-parties">
                      {allParties.map(party => (
                        <button
                          key={party}
                          className={`elec-party-btn ${currentWinner === party ? 'selected' : ''}`}
                          style={{
                            borderColor: partyColors[party] || '#888',
                            background: currentWinner === party ? (partyColors[party] || '#888') : 'transparent',
                            color: currentWinner === party ? '#fff' : readablePartyColor(partyColors[party]),
                          }}
                          onClick={() => setOverride(wardName, party)}
                          aria-label={`Set ${wardName} winner to ${party}`}
                        >
                          {party.length > 14 ? party.slice(0, 12) + '…' : party}
                        </button>
                      ))}
                    </div>
                    <div className="elec-builder-ward-meta">
                      <ConfidenceDot confidence={result.confidence} />
                      <span className="elec-ward-meta-text">
                        {result.confidence} conf. | Maj: {result.majorityPct != null ? `${(result.majorityPct * 100).toFixed(0)}%` : '?'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>

      {/* ================================================================ */}
      {/* SECTION 6: Coalition Modeller                                   */}
      {/* ================================================================ */}
      <section className="elec-section" id="elec-coalitions">
        <h2><Handshake size={20} /> Coalition Modeller</h2>
        <p className="elec-section-desc">
          Based on {Object.keys(overrides).length > 0 ? 'your Ward Builder scenario' : 'the predicted results'}.
          Majority threshold: {majorityThreshold} of {totalSeats} seats.
        </p>

        {coalitions.length === 0 ? (
          <div className="elec-info-banner">
            <AlertTriangle size={16} />
            <span>No viable coalitions found. Ensure prediction data is available.</span>
          </div>
        ) : (
          <div className="elec-coalitions-list">
            {coalitions.map((coalition, i) => {
              const isSelected = selectedCoalition === i
              return (
                <div
                  key={i}
                  className={`elec-coalition-card ${coalition.type} ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedCoalition(isSelected ? null : i)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${coalition.parties.join(' + ')} coalition: ${coalition.totalSeats} seats`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedCoalition(isSelected ? null : i) }}
                >
                  <div className="elec-coalition-header">
                    <div className="elec-coalition-parties">
                      {coalition.parties.map(party => (
                        <PartyBadge key={party} party={party} color={partyColors[party]} />
                      ))}
                    </div>
                    <span className={`elec-coalition-type ${coalition.type}`}>
                      {coalition.type === 'majority' ? 'Single-Party Majority' : `${coalition.parties.length}-Party Coalition`}
                    </span>
                  </div>
                  <div className="elec-coalition-stats">
                    <div className="elec-stat">
                      <span className="elec-stat-value">{coalition.totalSeats}</span>
                      <span className="elec-stat-label">Total seats</span>
                    </div>
                    <div className="elec-stat">
                      <span className="elec-stat-value">+{coalition.majority}</span>
                      <span className="elec-stat-label">Working majority</span>
                    </div>
                    <div className="elec-stat">
                      <span className="elec-stat-value">
                        {totalSeats > 0 ? ((coalition.totalSeats / totalSeats) * 100).toFixed(0) : 0}%
                      </span>
                      <span className="elec-stat-label">Council share</span>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="elec-coalition-detail">
                      <h4>Seat Breakdown</h4>
                      {coalition.parties.map(party => (
                        <div key={party} className="elec-coalition-breakdown-row">
                          <span style={{ color: readablePartyColor(partyColors[party]) }}>{party}</span>
                          <span>{builderSeatTotals[party] || 0} seats</span>
                        </div>
                      ))}
                      <p className="elec-coalition-note">
                        {coalition.majority >= 5
                          ? 'Comfortable working majority for stable governance.'
                          : coalition.majority >= 2
                            ? 'Slim majority. Vulnerable to by-election losses or rebellions.'
                            : 'Razor-thin majority. Governance may be unstable.'}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ================================================================ */}
      {/* SECTION 7: LGR Projections                                      */}
      {/* ================================================================ */}
      <section className="elec-section" id="elec-lgr">
        <h2><Map size={20} /> LGR Projections</h2>
        <p className="elec-section-desc">
          How predicted election results might map onto proposed Local Government Reorganisation boundaries.
          Note: These projections use only {councilName} data.
          Full LGR analysis requires data from all constituent councils.
          <Link to="/lgr" className="elec-link-inline"> View full LGR Tracker <ExternalLink size={12} /></Link>
        </p>

        {lgrProjections.length === 0 ? (
          <div className="elec-info-banner">
            <AlertTriangle size={16} />
            <span>LGR projection data not available. Ensure lgr_tracker.json and prediction data are loaded.</span>
          </div>
        ) : (
          <div className="elec-lgr-grid">
            {lgrProjections.map((model, mi) => {
              const myAuthority = model.authorities?.find(a => a.councils?.includes(councilId))
              const projKey = myAuthority?.name
              const proj = projKey ? model.projection?.[projKey] : null

              return (
                <div key={mi} className="elec-lgr-card">
                  <h3>{model.name || model.id}</h3>
                  {model.source && <span className="elec-lgr-source">{model.source}</span>}

                  {myAuthority && (
                    <p className="elec-lgr-authority">
                      {councilName} would be in: <strong>{myAuthority.name}</strong>
                    </p>
                  )}

                  {proj ? (
                    <div className="elec-lgr-projection">
                      <div className="elec-lgr-control">
                        <span className={`elec-lgr-control-badge ${proj.hasMajority ? 'majority' : 'noc'}`}>
                          {proj.hasMajority
                            ? `${proj.largestParty} Majority`
                            : `NOC (${proj.largestParty} largest)`}
                        </span>
                      </div>
                      <div className="elec-lgr-seats">
                        {Object.entries(proj.seats)
                          .sort((a, b) => b[1] - a[1])
                          .map(([party, seats]) => (
                            <div key={party} className="elec-lgr-seat-row">
                              <span style={{ color: readablePartyColor(partyColors[party]) }}>{party}</span>
                              <span>{seats}</span>
                            </div>
                          ))}
                      </div>
                      <p className="elec-chart-note">
                        Based on {councilName} data only. Other councils in this authority may have different results.
                      </p>
                    </div>
                  ) : (
                    <p className="elec-no-data">{councilName} not found in this model.</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ================================================================ */}
      {/* SECTION 8: Demographics & Voting                                */}
      {/* ================================================================ */}
      <section className="elec-section" id="elec-demographics">
        <h2><Users size={20} /> Demographics &amp; Voting</h2>

        {demoScatterData.length === 0 ? (
          <div className="elec-info-banner">
            <AlertTriangle size={16} />
            <span>
              Demographics data not available for {councilName}.
              This section requires demographics.json and deprivation.json to analyse voting patterns by ward demographics.
            </span>
          </div>
        ) : (
          <>
            {/* Deprivation vs Turnout scatter */}
            <div className="elec-chart-card">
              <h3>Deprivation vs Turnout</h3>
              <p className="elec-chart-desc">
                Each dot is a ward. Higher IMD decile = less deprived. Colour = winning party in most recent election.
              </p>
              <ResponsiveContainer width="100%" height={380}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis
                    type="number" dataKey="deprivation" name="IMD Decile"
                    axisLine={false} tickLine={false} tick={AXIS_TICK_STYLE} domain={[0, 10]}
                    label={{ value: 'IMD Decile (10 = least deprived)', position: 'bottom', fill: '#8e8e93' }}
                  />
                  <YAxis
                    type="number" dataKey="turnout" name="Turnout"
                    axisLine={false} tickLine={false} tick={AXIS_TICK_STYLE} unit="%"
                    label={{ value: 'Turnout %', angle: -90, position: 'insideLeft', fill: '#8e8e93' }}
                  />
                  <ZAxis type="number" range={[60, 200]} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value, name) => {
                      if (name === 'Turnout') return `${value}%`
                      return value
                    }}
                    labelFormatter={(v) => {
                      const point = demoScatterData.find(d => d.deprivation === v)
                      return point?.ward || ''
                    }}
                  />
                  <Scatter
                    data={demoScatterData}
                    name="Wards"
                  >
                    {demoScatterData.map((entry, i) => (
                      <Cell key={i} fill={partyColors[entry.winner] || '#888'} fillOpacity={0.8} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* Over-65 vs Turnout scatter (if data available) */}
            {demoScatterData.some(d => d.over65 != null) && (
              <div className="elec-chart-card">
                <h3>Over-65 Population vs Turnout</h3>
                <ResponsiveContainer width="100%" height={340}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis
                      type="number" dataKey="over65" name="Over 65%"
                      axisLine={false} tickLine={false} tick={AXIS_TICK_STYLE} unit="%"
                      label={{ value: 'Over 65 %', position: 'bottom', fill: '#8e8e93' }}
                    />
                    <YAxis
                      type="number" dataKey="turnout" name="Turnout"
                      axisLine={false} tickLine={false} tick={AXIS_TICK_STYLE} unit="%"
                    />
                    <ZAxis type="number" range={[60, 200]} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Scatter
                      data={demoScatterData.filter(d => d.over65 != null)}
                      name="Wards"
                    >
                      {demoScatterData.filter(d => d.over65 != null).map((entry, i) => (
                        <Cell key={i} fill={partyColors[entry.winner] || '#888'} fillOpacity={0.8} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Party-by-deprivation summary table */}
            {(() => {
              const partyDeprivation = {}
              for (const d of demoScatterData) {
                if (!partyDeprivation[d.winner]) {
                  partyDeprivation[d.winner] = { wards: 0, totalDecile: 0, totalTurnout: 0 }
                }
                partyDeprivation[d.winner].wards++
                partyDeprivation[d.winner].totalDecile += d.deprivation
                partyDeprivation[d.winner].totalTurnout += d.turnout
              }

              const rows = Object.entries(partyDeprivation)
                .map(([party, data]) => ({
                  party,
                  wards: data.wards,
                  avgDecile: (data.totalDecile / data.wards).toFixed(1),
                  avgTurnout: (data.totalTurnout / data.wards).toFixed(1),
                }))
                .sort((a, b) => b.wards - a.wards)

              return (
                <div className="elec-table-wrap">
                  <h3>Party Performance by Demographics</h3>
                  <table className="elec-table">
                    <thead>
                      <tr>
                        <th>Party</th>
                        <th>Wards Won</th>
                        <th>Avg IMD Decile</th>
                        <th>Avg Turnout</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.party}>
                          <td><PartyBadge party={r.party} color={partyColors[r.party]} /></td>
                          <td>{r.wards}</td>
                          <td>{r.avgDecile}</td>
                          <td>{r.avgTurnout}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </>
        )}
      </section>

      {/* ================================================================ */}
      {/* SECTION: Constituency Predictions                                */}
      {/* ================================================================ */}
      <section id="elec-constituencies" className="elec-section">
        <h2 className="elec-section-title">
          <Landmark size={22} className="elec-section-icon" />
          Lancashire MPs
        </h2>

        {constData?.constituencies?.length > 0 ? (
          <div className="elec-constituency-predictions">
            <div className="elec-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {constData.constituencies.map(c => {
                const mp = c.mp || {}
                const partyColor = partyColors[mp.party] || partyColors[mp.party?.replace(' (Co-op)', '')] || '#888'
                const pred = pollingData && modelCoeffs
                  ? predictConstituencyGE(c, pollingData, modelCoeffs)
                  : null

                return (
                  <Link
                    key={c.id}
                    to={`/constituency/${c.id}`}
                    className="elec-card elec-constituency-card"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: partyColor }} />
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                      {mp.photo_url && (
                        <img
                          src={mp.photo_url}
                          alt={mp.name}
                          style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid #3a3a3c' }}
                          loading="lazy"
                          onError={e => { e.target.style.display = 'none' }}
                        />
                      )}
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{c.name}</div>
                        <div style={{ fontSize: '0.8rem', color: '#a1a1a6' }}>{mp.name}</div>
                        <div style={{ fontSize: '0.75rem', color: partyColor, fontWeight: 600 }}>{mp.party}</div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.78rem' }}>
                      <div>
                        <span style={{ color: '#636366' }}>GE2024 majority: </span>
                        <span style={{ fontWeight: 600 }}>{mp.majority_pct ? `${(mp.majority_pct * 100).toFixed(1)}%` : '\u2014'}</span>
                      </div>
                      {pred?.prediction && (
                        <>
                          <div>
                            <span style={{ color: '#636366' }}>Predicted winner: </span>
                            <span style={{ fontWeight: 600, color: partyColors[pred.winner] || '#ccc' }}>{pred.winner}</span>
                          </div>
                          {pred.mpChange && (
                            <div style={{ gridColumn: '1 / -1', color: '#ff9f0a', fontWeight: 600 }}>
                              Seat change: {mp.party?.replace(' (Co-op)', '')} &rarr; {pred.winner}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>

            <p className="elec-methodology-note" style={{ marginTop: '1rem' }}>
              Constituency predictions based on uniform national swing from polling aggregate, with party-specific dampening.
              {constData.meta?.generated && ` Data updated ${constData.meta.generated.split('T')[0]}.`}
            </p>
          </div>
        ) : (
          <div className="elec-card">
            <p style={{ color: '#8e8e93' }}>Constituency data not available.</p>
          </div>
        )}
      </section>

      {/* Footer */}
      <div className="elec-footer">
        <p>
          Election predictions use a composite model combining historical ward results, national polling swing,
          demographic adjustments, incumbency effects and Reform UK entry estimates. All methodology is transparent
          and shown per-ward. Predictions are illustrative, not forecasts.
        </p>
        {referenceData?.national_polling?.latest_date && (
          <p className="elec-footer-note">
            National polling data: {referenceData.national_polling.source || 'aggregated'}, {referenceData.national_polling.latest_date}.
          </p>
        )}
      </div>
    </div>
  )
}
