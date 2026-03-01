import { useState, useEffect, useMemo, lazy, Suspense } from 'react'

const WardMap = lazy(() => import('../components/WardMap'))
import { useCouncilConfig } from '../context/CouncilConfig'
import { useData } from '../hooks/useData'
import { formatNumber } from '../utils/format'
import { TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE, AXIS_TICK_STYLE_SM } from '../utils/constants'
import {
  DEFAULT_ASSUMPTIONS,
  predictCouncil,
} from '../utils/electionModel'
import {
  rankBattlegrounds,
  calculatePathToControl,
  classifyWardArchetype,
  generateStrategySummary,
  calculateSwingHistory,
  allocateResources,
  generateStrategyCSV,
  generateWardDossier,
  computeWardCentroids,
  clusterWards,
  optimiseCanvassingRoute,
  generateCanvassingCSV,
  WARD_CLASSES,
} from '../utils/strategyEngine'
import { LoadingState } from '../components/ui'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import {
  Target, Users, Shield, AlertTriangle, ChevronDown, ChevronRight,
  Crosshair, TrendingUp, TrendingDown, MapPin, Briefcase, Globe,
  CheckCircle, Swords, GraduationCap, Lock, Clock, BarChart3,
  Download, FileText, ArrowLeft, Printer, Eye, Map, Navigation, Building,
  Heart, Leaf, Zap, PoundSterling, School,
} from 'lucide-react'
import './Strategy.css'

// Party colours (same as Elections)
const PARTY_COLORS = {
  Labour: '#DC241F', Conservative: '#0087DC', 'Liberal Democrats': '#FAA61A',
  'Lib Dem': '#FAA61A', Green: '#6AB023', 'Reform UK': '#12B6CF',
  Independent: '#888888', UKIP: '#70147A', 'Lab & Co-op': '#DC241F',
  BNP: '#2D2D86', 'Our West Lancs': '#5DADE2', Other: '#999999',
}

const CONFIDENCE_COLORS = { high: '#30d158', medium: '#ff9f0a', low: '#ff453a', none: '#8e8e93' }

const ICON_MAP = {
  Users, GraduationCap, Globe, Briefcase, TrendingDown, TrendingUp,
  Target, CheckCircle, MapPin, Swords, Building, Heart, Leaf, Zap,
  PoundSterling, School, AlertTriangle,
}

// Severity colors for attack lines
const SEVERITY_COLORS = { high: '#ff453a', medium: '#ff9f0a', low: '#8e8e93' }

// Section definitions
const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: Target },
  { id: 'battlegrounds', label: 'Battlegrounds', icon: Crosshair },
  { id: 'dossiers', label: 'Ward Dossiers', icon: FileText },
  { id: 'path', label: 'Path to Control', icon: TrendingUp },
  { id: 'vulnerable', label: 'Vulnerable Seats', icon: Shield },
  { id: 'swingHistory', label: 'Swing History', icon: Clock },
  { id: 'resources', label: 'Resources', icon: BarChart3 },
  { id: 'swingMap', label: 'Swing Map', icon: Map },
  { id: 'canvassing', label: 'Canvassing Routes', icon: Navigation },
  { id: 'archetypes', label: 'Ward Archetypes', icon: Users },
]

// Trend labels and colors
const TREND_CONFIG = {
  improving: { label: 'Improving', color: '#30d158', icon: TrendingUp },
  declining: { label: 'Declining', color: '#ff453a', icon: TrendingDown },
  stable: { label: 'Stable', color: '#0a84ff', icon: Target },
  volatile: { label: 'Volatile', color: '#ff9f0a', icon: AlertTriangle },
  insufficient: { label: 'Insufficient Data', color: '#8e8e93', icon: AlertTriangle },
  unknown: { label: 'No Data', color: '#8e8e93', icon: AlertTriangle },
}

const ROI_COLORS = { high: '#30d158', medium: '#ff9f0a', low: '#ff453a' }

function SectionNav({ activeSection, onSelect }) {
  return (
    <nav className="strategy-section-nav" aria-label="Strategy sections">
      {SECTIONS.map(s => (
        <button
          key={s.id}
          className={`strategy-nav-btn ${activeSection === s.id ? 'active' : ''}`}
          onClick={() => onSelect(s.id)}
          aria-current={activeSection === s.id ? 'true' : undefined}
        >
          <s.icon size={16} />
          <span>{s.label}</span>
        </button>
      ))}
    </nav>
  )
}

function PartyBadge({ party }) {
  return (
    <span className="strategy-party-badge" style={{ background: PARTY_COLORS[party] || '#888' }}>
      {party}
    </span>
  )
}

function ClassBadge({ classification, label, color }) {
  return (
    <span className="strategy-class-badge" style={{ background: color || '#888' }}>
      {label || classification}
    </span>
  )
}

function TalkingPointIcon({ iconName }) {
  const Icon = ICON_MAP[iconName] || Target
  return <Icon size={14} />
}

// ============================================================================
// Main Strategy Component
// ============================================================================

export default function Strategy() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const isCounty = config.council_tier === 'county'
  const wardLabel = isCounty ? 'Division' : 'Ward'

  // --- Data loading ---
  const { data, loading, error } = useData([
    '/data/elections.json',
    '/data/shared/elections_reference.json',
    '/data/politics_summary.json',
  ])
  const [electionsData, referenceData, politicsSummary] = data || [null, null, null]

  const { data: optData } = useData(['/data/demographics.json', '/data/deprivation.json', '/data/ward_boundaries.json'])
  const [demographicsData, deprivationData, boundariesData] = optData || [null, null, null]

  // Dossier data sources (loaded separately to avoid blocking main render)
  const { data: dossierData } = useData([
    '/data/councillors.json',
    '/data/integrity.json',
    '/data/register_of_interests.json',
    '/data/doge_findings.json',
    '/data/budgets_summary.json',
    '/data/collection_rates.json',
    '/data/shared/constituencies.json',
    '/data/ward_constituency_map.json',
    '/data/property_assets.json',
    '/data/planning.json',
  ])
  const [
    councillorsData, integrityData, interestsData,
    dogeFindings, budgetSummary, collectionRates,
    constituenciesData, wardConstituencyMap,
    propertyAssetsRaw, planningData,
  ] = dossierData || [null, null, null, null, null, null, null, null, null, null]
  const propertyAssets = propertyAssetsRaw?.assets || []

  // --- State ---
  const [activeSection, setActiveSection] = useState('dashboard')
  const [ourParty, setOurParty] = useState('Reform UK')
  const [expandedWards, setExpandedWards] = useState({})
  const [totalHours, setTotalHours] = useState(1000)
  const [wardHourOverrides, setWardHourOverrides] = useState({}) // { wardName: hours }
  const [selectedDossierWard, setSelectedDossierWard] = useState(null)
  const [dossierTab, setDossierTab] = useState('profile')
  const [mapOverlay, setMapOverlay] = useState('classification')

  // --- Page title ---
  useEffect(() => {
    document.title = `Strategy | ${councilName} Transparency`
    return () => { document.title = `${councilName} Transparency` }
  }, [councilName])

  // --- Derived: party list ---
  const partyList = useMemo(() => {
    if (!politicsSummary?.by_party) return ['Reform UK', 'Labour', 'Conservative', 'Liberal Democrats']
    return politicsSummary.by_party.map(p => p.party).filter(Boolean)
  }, [politicsSummary])

  // --- Derived: wards up for election ---
  const wardsUp = useMemo(() => {
    return electionsData?.meta?.next_election?.wards_up || []
  }, [electionsData])

  // --- Derived: demographics maps ---
  const { demoByName, depByName } = useMemo(() => {
    const demoByName = {}
    if (demographicsData?.wards) {
      for (const [, val] of Object.entries(demographicsData.wards)) {
        if (val?.name) demoByName[val.name] = val
        if (val?.ward_name) demoByName[val.ward_name] = val
      }
    }
    const depByName = deprivationData?.wards || {}
    return { demoByName, depByName }
  }, [demographicsData, deprivationData])

  // --- Derived: council prediction ---
  const councilPrediction = useMemo(() => {
    if (!electionsData?.wards || !wardsUp.length) return null
    const nationalPolling = referenceData?.national_polling?.parties || {}
    const ge2024Result = referenceData?.national_polling?.ge2024_result || {}
    const lcc2025 = referenceData?.lancashire_lcc_2025?.results || null

    return predictCouncil(
      electionsData,
      wardsUp,
      DEFAULT_ASSUMPTIONS,
      nationalPolling,
      ge2024Result,
      demoByName,
      depByName,
      null, // constituency map
      lcc2025,
      null, // model params
    )
  }, [electionsData, wardsUp, referenceData, demoByName, depByName])

  // --- Derived: ranked battlegrounds ---
  const rankedWards = useMemo(() => {
    if (!councilPrediction || !wardsUp.length) return []
    return rankBattlegrounds(
      wardsUp, councilPrediction, electionsData, ourParty, demoByName, depByName
    )
  }, [wardsUp, councilPrediction, electionsData, ourParty, demoByName, depByName])

  // --- Derived: path to control ---
  const pathToControl = useMemo(() => {
    if (!rankedWards.length || !politicsSummary) return null
    const seatTotals = {}
    for (const entry of (politicsSummary.by_party || [])) {
      seatTotals[entry.party] = entry.count
    }
    const totalSeats = politicsSummary.total_councillors || 0
    return calculatePathToControl(rankedWards, seatTotals, totalSeats, ourParty)
  }, [rankedWards, politicsSummary, ourParty])

  // --- Derived: strategy summary ---
  const summary = useMemo(() => {
    if (!rankedWards.length) return null
    return generateStrategySummary(rankedWards, ourParty)
  }, [rankedWards, ourParty])

  // --- Derived: ward archetypes ---
  const archetypes = useMemo(() => {
    if (!wardsUp.length) return []
    return wardsUp.map(wardName => {
      const demo = demoByName[wardName] || null
      const dep = depByName[wardName] || null
      return { ward: wardName, ...classifyWardArchetype(demo, dep) }
    })
  }, [wardsUp, demoByName, depByName])

  // --- Derived: swing histories ---
  const swingHistories = useMemo(() => {
    if (!wardsUp.length || !electionsData?.wards) return []
    return wardsUp.map(wardName => {
      const wardData = electionsData.wards[wardName]
      const history = calculateSwingHistory(wardData, ourParty)
      const ranked = rankedWards.find(w => w.ward === wardName)
      return { ward: wardName, ...history, classification: ranked?.classLabel || 'Unknown', score: ranked?.score || 0 }
    }).sort((a, b) => {
      // Sort: improving first, then by volatility (most volatile = most interesting)
      const trendOrder = { improving: 0, volatile: 1, declining: 2, stable: 3, insufficient: 4, unknown: 5 }
      return (trendOrder[a.trend] ?? 5) - (trendOrder[b.trend] ?? 5) || b.volatility - a.volatility
    })
  }, [wardsUp, electionsData, ourParty, rankedWards])

  // --- Derived: resource allocation (with per-ward overrides) ---
  const resourceAllocation = useMemo(() => {
    if (!rankedWards.length) return []
    const baseAllocation = allocateResources(rankedWards, totalHours)

    // Apply per-ward overrides: fix overridden hours, redistribute remaining
    const overrideKeys = Object.keys(wardHourOverrides)
    if (overrideKeys.length === 0) return baseAllocation

    const overriddenHours = overrideKeys.reduce((sum, w) => sum + (wardHourOverrides[w] || 0), 0)
    const remainingHours = Math.max(0, totalHours - overriddenHours)
    const nonOverriddenTotal = baseAllocation
      .filter(r => !wardHourOverrides.hasOwnProperty(r.ward))
      .reduce((sum, r) => sum + r.hours, 0)

    return baseAllocation.map(r => {
      if (wardHourOverrides.hasOwnProperty(r.ward)) {
        const hours = wardHourOverrides[r.ward]
        return { ...r, hours, pctOfTotal: totalHours > 0 ? Math.round((hours / totalHours) * 1000) / 10 : 0, overridden: true }
      }
      // Redistribute remaining hours proportionally among non-overridden wards
      const scale = nonOverriddenTotal > 0 ? remainingHours / nonOverriddenTotal : 0
      const hours = Math.round(r.hours * scale)
      return { ...r, hours, pctOfTotal: totalHours > 0 ? Math.round((hours / totalHours) * 1000) / 10 : 0 }
    }).sort((a, b) => b.hours - a.hours)
  }, [rankedWards, totalHours, wardHourOverrides])

  // --- Derived: ward centroids from boundary data ---
  const wardCentroids = useMemo(() => {
    return computeWardCentroids(boundariesData)
  }, [boundariesData])

  // --- Derived: per-ward map data based on overlay mode ---
  const wardMapData = useMemo(() => {
    const data = {}
    if (!rankedWards.length) return data
    for (const w of rankedWards) {
      const swingH = swingHistories.find(s => s.ward === w.ward)
      const alloc = resourceAllocation.find(r => r.ward === w.ward)
      const entry = {
        color: '#888',
        partyColor: PARTY_COLORS[w.winner] || '#888',
        winner: w.winner,
        predPct: Math.round((w.ourPct || 0) * 100 * 10) / 10,
        classLabel: w.classLabel,
        hours: alloc?.hours || 0,
      }

      if (mapOverlay === 'classification') {
        entry.color = w.classColor || WARD_CLASSES[w.classification]?.color || '#888'
      } else if (mapOverlay === 'swing') {
        const trend = swingH?.trend
        entry.color = TREND_CONFIG[trend]?.color || '#555'
        entry.swingTrend = TREND_CONFIG[trend]?.label || 'Unknown'
      } else if (mapOverlay === 'party') {
        entry.color = PARTY_COLORS[w.winner] || '#888'
      }
      data[w.ward] = entry
    }
    return data
  }, [rankedWards, mapOverlay, swingHistories, resourceAllocation])

  // --- Derived: canvassing route ---
  const canvassingData = useMemo(() => {
    if (!wardCentroids.size || !wardsUp.length) return { sessions: [], routeLines: [], clusters: [] }
    const clusters = clusterWards(wardCentroids, wardsUp, 4)
    const allocMap = {}
    for (const r of resourceAllocation) {
      allocMap[r.ward] = r
    }
    const { sessions, routeLines } = optimiseCanvassingRoute(clusters, wardCentroids, allocMap)
    return { sessions, routeLines, clusters }
  }, [wardCentroids, wardsUp, resourceAllocation])

  // --- Derived: active ward dossier ---
  const activeDossier = useMemo(() => {
    if (!selectedDossierWard) return null
    return generateWardDossier(selectedDossierWard, {
      electionsData, referenceData, politicsSummary,
      demographicsData, deprivationData,
      councillorsData, integrityData, interestsData,
      dogeFindings, budgetSummary, collectionRates,
      constituenciesData, wardConstituencyMap,
      councilPrediction, rankedWard: rankedWards.find(w => w.ward === selectedDossierWard),
      meetingsData: null,
      propertyAssets, planningData,
    }, ourParty)
  }, [selectedDossierWard, electionsData, referenceData, politicsSummary,
      demographicsData, deprivationData, councillorsData, integrityData,
      interestsData, dogeFindings, budgetSummary, collectionRates,
      constituenciesData, wardConstituencyMap, councilPrediction, rankedWards, ourParty, propertyAssets, planningData])

  // --- Handlers ---
  const toggleWard = (wardName) => {
    setExpandedWards(prev => ({ ...prev, [wardName]: !prev[wardName] }))
  }

  const openDossier = (wardName) => {
    setSelectedDossierWard(wardName)
    setDossierTab('profile')
    setActiveSection('dossiers')
  }

  const handleWardHoursChange = (wardName, hours) => {
    const numHours = parseInt(hours, 10)
    if (isNaN(numHours) || numHours < 0) {
      // Remove override if invalid/cleared
      setWardHourOverrides(prev => {
        const next = { ...prev }
        delete next[wardName]
        return next
      })
    } else {
      setWardHourOverrides(prev => ({ ...prev, [wardName]: numHours }))
    }
  }

  const resetWardOverrides = () => setWardHourOverrides({})

  const handleExportCSV = () => {
    const csv = generateStrategyCSV(rankedWards, resourceAllocation, ourParty, councilName)
    if (!csv) return
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `strategy-${config.council_id}-${ourParty.toLowerCase().replace(/\s+/g, '-')}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const handleExportCanvassingCSV = () => {
    if (!canvassingData.sessions.length) return
    const csv = generateCanvassingCSV(canvassingData.sessions, ourParty, councilName)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `canvassing-${config.council_id}-${ourParty.toLowerCase().replace(/\s+/g, '-')}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // --- Loading/error ---
  if (loading) return <LoadingState message="Loading strategy data..." />

  if (error) {
    return (
      <div className="strategy-page">
        <div className="strategy-error">
          <AlertTriangle size={48} />
          <h2>Unable to load strategy data</h2>
          <p>Elections data is required for the strategy engine.</p>
        </div>
      </div>
    )
  }

  if (!electionsData?.wards || !wardsUp.length) {
    return (
      <div className="strategy-page">
        <div className="strategy-error">
          <AlertTriangle size={48} />
          <h2>No upcoming elections</h2>
          <p>No wards are scheduled for election. Strategy tools will be available closer to the next election date.</p>
        </div>
      </div>
    )
  }

  // --- Classification pie data ---
  const classificationPie = summary ? Object.entries(summary.byClassification)
    .map(([cls, count]) => ({
      name: WARD_CLASSES[cls]?.label || cls,
      value: count,
      color: WARD_CLASSES[cls]?.color || '#888',
    }))
    .sort((a, b) => b.value - a.value) : []

  // --- Render ---
  return (
    <div className="strategy-page">
      <header className="strategy-header">
        <div className="strategy-header-top">
          <div>
            <h1><Target size={28} /> {councilName} Strategy Engine</h1>
            <p className="strategy-subtitle">
              {wardsUp.length} {wardLabel.toLowerCase()}s up for election
              {electionsData.meta?.next_election?.date && ` on ${formatElectionDate(electionsData.meta.next_election.date)}`}
            </p>
          </div>
          <div className="strategy-party-select">
            <label htmlFor="our-party">Strategise for:</label>
            <select
              id="our-party"
              value={ourParty}
              onChange={e => setOurParty(e.target.value)}
            >
              {partyList.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="strategy-restricted-banner">
          <Lock size={14} /> Strategist access only — this page is not visible to viewers
        </div>
      </header>

      <SectionNav activeSection={activeSection} onSelect={setActiveSection} />

      {/* ================================================================ */}
      {/* DASHBOARD */}
      {/* ================================================================ */}
      {activeSection === 'dashboard' && summary && pathToControl && (
        <section className="strategy-section">
          <h2>Strategy Dashboard</h2>

          <div className="strategy-stat-grid">
            <div className="strategy-stat-card">
              <div className="stat-number">{pathToControl.currentSeats}</div>
              <div className="stat-label">Current Seats</div>
            </div>
            <div className="strategy-stat-card">
              <div className="stat-number">{pathToControl.majorityThreshold}</div>
              <div className="stat-label">Majority Threshold</div>
            </div>
            <div className="strategy-stat-card accent">
              <div className="stat-number">{pathToControl.seatsNeeded > 0 ? `+${pathToControl.seatsNeeded}` : 'Majority'}</div>
              <div className="stat-label">{pathToControl.seatsNeeded > 0 ? 'Seats Needed' : 'Already Achieved'}</div>
            </div>
            <div className="strategy-stat-card">
              <div className="stat-number">{summary.topOpportunities}</div>
              <div className="stat-label">Top Opportunities</div>
            </div>
            <div className="strategy-stat-card warn">
              <div className="stat-number">{summary.vulnerableSeats}</div>
              <div className="stat-label">Vulnerable Seats</div>
            </div>
            <div className="strategy-stat-card">
              <div className="stat-number">{wardsUp.length}</div>
              <div className="stat-label">{wardLabel}s Contested</div>
            </div>
          </div>

          {/* Classification breakdown */}
          <div className="strategy-charts-row">
            <div className="strategy-chart-card">
              <h3>{wardLabel} Classification</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={classificationPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name} (${value})`}>
                    {classificationPie.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="strategy-chart-card">
              <h3>Top 10 Priority {wardLabel}s</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={rankedWards.slice(0, 10)} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK_STYLE} />
                  <YAxis type="category" dataKey="ward" tick={AXIS_TICK_STYLE_SM} width={95} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}/100`, 'Priority Score']} />
                  <Bar dataKey="score" fill="#12B6CF" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* BATTLEGROUNDS TABLE */}
      {/* ================================================================ */}
      {activeSection === 'battlegrounds' && (
        <section className="strategy-section">
          <h2><Crosshair size={20} /> Battleground {wardLabel}s</h2>
          <p className="strategy-section-desc">
            All {wardsUp.length} contested {wardLabel.toLowerCase()}s ranked by strategic priority for {ourParty}.
            Click a {wardLabel.toLowerCase()} to see talking points.
          </p>

          <div className="strategy-table-wrap">
            <table className="strategy-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{wardLabel}</th>
                  <th>Class</th>
                  <th>Predicted Winner</th>
                  <th>Our Share</th>
                  <th>Swing Req</th>
                  <th>Win Prob</th>
                  <th>Turnout</th>
                  <th>Score</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rankedWards.map((ward, i) => (
                  <WardRow
                    key={ward.ward}
                    rank={i + 1}
                    ward={ward}
                    ourParty={ourParty}
                    expanded={!!expandedWards[ward.ward]}
                    onToggle={() => toggleWard(ward.ward)}
                    onDossier={() => openDossier(ward.ward)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* WARD DOSSIERS */}
      {/* ================================================================ */}
      {activeSection === 'dossiers' && (
        <section className="strategy-section">
          {selectedDossierWard && activeDossier ? (
            <WardDossierView
              dossier={activeDossier}
              ourParty={ourParty}
              wardLabel={wardLabel}
              activeTab={dossierTab}
              onTabChange={setDossierTab}
              onBack={() => setSelectedDossierWard(null)}
            />
          ) : (
            <>
              <h2><FileText size={20} /> {wardLabel} Dossiers</h2>
              <p className="strategy-section-desc">
                Select a {wardLabel.toLowerCase()} to generate a full campaign dossier with councillor intel,
                council criticism, constituency data, and a printable cheat sheet.
              </p>
              <div className="dossier-ward-grid">
                {rankedWards.map(w => {
                  const cls = WARD_CLASSES[w.classification] || {}
                  return (
                    <button
                      key={w.ward}
                      className="dossier-ward-card"
                      onClick={() => openDossier(w.ward)}
                    >
                      <div className="dossier-ward-header">
                        <span className="dossier-ward-name">{w.ward}</span>
                        <ClassBadge classification={w.classification} label={w.classLabel} color={cls.color} />
                      </div>
                      <div className="dossier-ward-meta">
                        <span>Defender: {w.defender || '—'}</span>
                        <span>Score: {w.score}/100</span>
                      </div>
                      <div className="dossier-ward-bar">
                        <div className="dossier-score-fill" style={{ width: `${w.score}%` }} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </section>
      )}

      {/* ================================================================ */}
      {/* PATH TO CONTROL */}
      {/* ================================================================ */}
      {activeSection === 'path' && pathToControl && (
        <section className="strategy-section">
          <h2><TrendingUp size={20} /> Path to Control</h2>

          {pathToControl.seatsNeeded === 0 ? (
            <div className="strategy-path-achieved">
              <CheckCircle size={32} />
              <h3>{ourParty} already holds a majority ({pathToControl.currentSeats}/{pathToControl.totalSeats})</h3>
              <p>Focus on defending vulnerable seats to maintain control.</p>
            </div>
          ) : (
            <>
              <div className="strategy-path-summary">
                <p>
                  {ourParty} currently holds <strong>{pathToControl.currentSeats}</strong> of{' '}
                  <strong>{pathToControl.totalSeats}</strong> seats.
                  Majority requires <strong>{pathToControl.majorityThreshold}</strong> seats
                  — need <strong>+{pathToControl.seatsNeeded}</strong> net gain.
                </p>
                {pathToControl.defendingCount > 0 && (
                  <p className="strategy-defending-note">
                    <Shield size={14} /> Defending {pathToControl.defendingCount} seat{pathToControl.defendingCount > 1 ? 's' : ''} in this election.
                  </p>
                )}
              </div>

              {/* Scenarios */}
              {pathToControl.scenarios.length > 0 && (
                <div className="strategy-scenarios">
                  <h3>Scenarios</h3>
                  <div className="scenario-cards">
                    {pathToControl.scenarios.map((s, i) => (
                      <div key={i} className={`scenario-card ${s.enough ? 'enough' : ''}`}>
                        <div className="scenario-wards">{s.wardsWon} {wardLabel.toLowerCase()}{s.wardsWon > 1 ? 's' : ''} won</div>
                        <div className="scenario-seats">{s.seats} seats</div>
                        <div className="scenario-prob">{Math.round(s.probability * 100)}% combined prob</div>
                        {s.enough && <div className="scenario-majority">Majority achieved</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top targets */}
              {pathToControl.topTargets.length > 0 && (
                <div className="strategy-top-targets">
                  <h3>Top Gain Targets</h3>
                  <div className="target-cards">
                    {pathToControl.topTargets.slice(0, 8).map(t => (
                      <div key={t.ward} className="target-card">
                        <div className="target-ward">{t.ward}</div>
                        <div className="target-details">
                          <span>Defender: <PartyBadge party={t.defender || 'Unknown'} /></span>
                          <span>Win prob: {Math.round(t.winProbability * 100)}%</span>
                          <span>Swing: {t.swingRequired > 0 ? '+' : ''}{(t.swingRequired * 100).toFixed(1)}pp</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* ================================================================ */}
      {/* VULNERABLE SEATS */}
      {/* ================================================================ */}
      {activeSection === 'vulnerable' && pathToControl && (
        <section className="strategy-section">
          <h2><Shield size={20} /> Vulnerable Seats</h2>
          <p className="strategy-section-desc">
            {wardLabel}s where {ourParty} is the current defender but predicted to lose.
          </p>

          {pathToControl.vulnerable.length === 0 ? (
            <div className="strategy-empty">
              <CheckCircle size={32} />
              <p>No {ourParty} seats are currently at risk. Strong defensive position.</p>
            </div>
          ) : (
            <div className="strategy-table-wrap">
              <table className="strategy-table">
                <thead>
                  <tr>
                    <th>{wardLabel}</th>
                    <th>Predicted Winner</th>
                    <th>Our Share</th>
                    <th>Deficit</th>
                    <th>Confidence</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {pathToControl.vulnerable.map(ward => (
                    <tr key={ward.ward} className="strategy-row vulnerable">
                      <td className="ward-name">{ward.ward}</td>
                      <td><PartyBadge party={ward.winner} /></td>
                      <td>{(ward.ourPct * 100).toFixed(1)}%</td>
                      <td className="deficit">{(ward.swingRequired * 100).toFixed(1)}pp</td>
                      <td>
                        <span className="confidence-dot" style={{ background: CONFIDENCE_COLORS[ward.confidence] || '#8e8e93' }} />
                        {ward.confidence}
                      </td>
                      <td>{ward.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ================================================================ */}
      {/* SWING HISTORY */}
      {/* ================================================================ */}
      {activeSection === 'swingHistory' && (
        <section className="strategy-section">
          <h2><Clock size={20} /> Historical Swing Analysis</h2>
          <p className="strategy-section-desc">
            {ourParty} vote share trends across past elections for each contested {wardLabel.toLowerCase()}.
            Identifies momentum, volatility, and wards where support is growing or declining.
          </p>

          {swingHistories.length === 0 ? (
            <div className="strategy-empty">
              <AlertTriangle size={32} />
              <p>No historical election data available for swing analysis.</p>
            </div>
          ) : (
            <div className="swing-history-grid">
              {swingHistories.map(sh => {
                const tc = TREND_CONFIG[sh.trend] || TREND_CONFIG.unknown
                const TrendIcon = tc.icon
                return (
                  <div key={sh.ward} className={`swing-card trend-${sh.trend}`}>
                    <div className="swing-card-header">
                      <div className="swing-ward">{sh.ward}</div>
                      <span className="swing-trend-badge" style={{ background: tc.color + '22', color: tc.color, borderColor: tc.color }}>
                        <TrendIcon size={12} /> {tc.label}
                      </span>
                    </div>
                    <div className="swing-card-meta">
                      <span>Class: {sh.classification}</span>
                      <span>Score: {sh.score}</span>
                      <span>Volatility: {(sh.volatility * 100).toFixed(1)}pp</span>
                    </div>
                    {sh.swings.length > 0 ? (
                      <div className="swing-sparkline">
                        {sh.swings.map((s, i) => {
                          const pct = s.ourPct * 100
                          const barHeight = Math.max(3, pct * 2)
                          return (
                            <div key={i} className="spark-col" title={`${s.year}: ${pct.toFixed(1)}% (${s.winnerParty} won)`}>
                              <div className="spark-bar" style={{
                                height: `${barHeight}px`,
                                background: s.winnerParty === ourParty ? '#30d158' : tc.color,
                              }} />
                              <div className="spark-year">{String(s.year).slice(-2)}</div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="swing-no-data">No election history</div>
                    )}
                    {sh.swings.length > 0 && (
                      <div className="swing-card-footer">
                        <span>Latest: {(sh.swings[sh.swings.length - 1]?.ourPct * 100).toFixed(1)}%</span>
                        <span>Avg swing: {sh.avgSwing > 0 ? '+' : ''}{(sh.avgSwing * 100).toFixed(1)}pp/election</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ================================================================ */}
      {/* RESOURCE ALLOCATION */}
      {/* ================================================================ */}
      {activeSection === 'resources' && (
        <section className="strategy-section">
          <h2><BarChart3 size={20} /> Resource Allocation</h2>
          <p className="strategy-section-desc">
            Optimised campaign hour distribution across {wardsUp.length} contested {wardLabel.toLowerCase()}s.
            Balances win probability, electorate size, and strategic priority.
          </p>

          <div className="resource-controls">
            <label htmlFor="total-hours">Total campaign hours:</label>
            <input
              id="total-hours"
              type="range"
              min={200}
              max={5000}
              step={100}
              value={totalHours}
              onChange={e => setTotalHours(Number(e.target.value))}
            />
            <span className="resource-hours-value">{formatNumber(totalHours)} hrs</span>
            {Object.keys(wardHourOverrides).length > 0 && (
              <button className="strategy-reset-btn" onClick={resetWardOverrides} title="Reset all per-ward overrides">
                Reset Overrides ({Object.keys(wardHourOverrides).length})
              </button>
            )}
            <button className="strategy-export-btn" onClick={handleExportCSV} title="Export strategy data as CSV">
              <Download size={14} /> Export CSV
            </button>
          </div>
          <p className="resource-hint">
            Click any hours value in the table to manually adjust. Remaining hours redistribute automatically.
          </p>

          {resourceAllocation.length > 0 && (
            <>
              {/* Resource stat cards */}
              <div className="strategy-stat-grid" style={{ marginBottom: 20 }}>
                <div className="strategy-stat-card">
                  <div className="stat-number">{resourceAllocation.filter(r => r.roi === 'high').length}</div>
                  <div className="stat-label">High ROI {wardLabel}s</div>
                </div>
                <div className="strategy-stat-card accent">
                  <div className="stat-number">{formatNumber(totalHours)}</div>
                  <div className="stat-label">Total Hours</div>
                </div>
                <div className="strategy-stat-card">
                  <div className="stat-number">
                    {formatNumber(resourceAllocation.reduce((s, r) => s + r.incrementalVotes, 0))}
                  </div>
                  <div className="stat-label">Est. Incremental Votes</div>
                </div>
              </div>

              {/* Allocation bar chart */}
              <div className="strategy-chart-card" style={{ marginBottom: 20 }}>
                <h3>Hours per {wardLabel}</h3>
                <ResponsiveContainer width="100%" height={Math.max(250, resourceAllocation.length * 28)}>
                  <BarChart data={resourceAllocation.slice(0, 20)} layout="vertical" margin={{ left: 110 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis type="number" tick={AXIS_TICK_STYLE} />
                    <YAxis type="category" dataKey="ward" tick={AXIS_TICK_STYLE_SM} width={105} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [name === 'hours' ? `${v} hrs` : v, name]} />
                    <Bar dataKey="hours" fill="#12B6CF" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Detailed table */}
              <div className="strategy-table-wrap">
                <table className="strategy-table">
                  <thead>
                    <tr>
                      <th>{wardLabel}</th>
                      <th>Class</th>
                      <th>Win Prob</th>
                      <th>Hours</th>
                      <th>% of Total</th>
                      <th>Est. Votes</th>
                      <th>Cost/Vote</th>
                      <th>ROI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resourceAllocation.map(r => (
                      <tr key={r.ward} className="strategy-row">
                        <td className="ward-name">{r.ward}</td>
                        <td><ClassBadge label={r.classLabel} /></td>
                        <td>
                          <span className={`win-prob ${r.winProbability > 0.5 ? 'high' : r.winProbability > 0.3 ? 'med' : 'low'}`}>
                            {Math.round(r.winProbability * 100)}%
                          </span>
                        </td>
                        <td className={`resource-hours ${r.overridden ? 'overridden' : ''}`}>
                          <input
                            type="number"
                            className="hours-input"
                            value={wardHourOverrides.hasOwnProperty(r.ward) ? wardHourOverrides[r.ward] : r.hours}
                            min={0}
                            max={totalHours}
                            step={10}
                            onChange={e => handleWardHoursChange(r.ward, e.target.value)}
                            onFocus={e => e.target.select()}
                            title={r.overridden ? 'Manual override — click Reset to restore' : 'Click to adjust hours'}
                            aria-label={`Hours for ${r.ward}`}
                          />
                        </td>
                        <td>{r.pctOfTotal}%</td>
                        <td>{r.incrementalVotes}</td>
                        <td>{r.costPerVote === Infinity ? '—' : `${r.costPerVote}h`}</td>
                        <td>
                          <span className="roi-badge" style={{ color: ROI_COLORS[r.roi] || '#888' }}>
                            {r.roi.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {/* ================================================================ */}
      {/* WARD ARCHETYPES */}
      {/* ================================================================ */}
      {/* ================================================================ */}
      {/* SWING MAP */}
      {/* ================================================================ */}
      {activeSection === 'swingMap' && (
        <section className="strategy-section">
          <h2><Map size={20} /> Swing Map</h2>
          <p className="strategy-section-desc">
            Geographic view of {wardLabel.toLowerCase()} boundaries coloured by strategy overlay. Click a {wardLabel.toLowerCase()} to open its dossier.
          </p>

          {!boundariesData?.features?.length ? (
            <div className="strategy-empty-state">
              <Map size={48} />
              <p>No ward boundary data available. Run <code>ward_boundaries_etl.py</code> to generate boundary data for this council.</p>
            </div>
          ) : (
            <>
              <div className="map-overlay-controls">
                {[
                  { id: 'classification', label: 'Classification' },
                  { id: 'swing', label: 'Swing Trend' },
                  { id: 'party', label: 'Party Control' },
                ].map(mode => (
                  <button
                    key={mode.id}
                    className={`map-overlay-btn ${mapOverlay === mode.id ? 'active' : ''}`}
                    onClick={() => setMapOverlay(mode.id)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              <Suspense fallback={<div className="map-loading">Loading map...</div>}>
                <WardMap
                  boundaries={boundariesData}
                  wardData={wardMapData}
                  wardsUp={wardsUp}
                  overlayMode={mapOverlay}
                  selectedWard={selectedDossierWard}
                  onWardClick={openDossier}
                  height="500px"
                />
              </Suspense>

              <div className="map-legend">
                {mapOverlay === 'classification' && Object.entries(WARD_CLASSES).map(([key, cls]) => (
                  <div key={key} className="legend-item">
                    <span className="legend-swatch" style={{ background: cls.color }} />
                    <span>{cls.label}</span>
                  </div>
                ))}
                {mapOverlay === 'swing' && Object.entries(TREND_CONFIG).filter(([k]) => k !== 'unknown').map(([key, cfg]) => (
                  <div key={key} className="legend-item">
                    <span className="legend-swatch" style={{ background: cfg.color }} />
                    <span>{cfg.label}</span>
                  </div>
                ))}
                {mapOverlay === 'party' && Object.entries(PARTY_COLORS).slice(0, 8).map(([party, color]) => (
                  <div key={party} className="legend-item">
                    <span className="legend-swatch" style={{ background: color }} />
                    <span>{party}</span>
                  </div>
                ))}
              </div>

              <div className="map-summary-bar">
                <span>{wardsUp.length} contested {wardLabel.toLowerCase()}s</span>
                {summary && <span>{summary.predictedGains} predicted gains</span>}
                {summary && <span>{summary.predictedLosses} predicted losses</span>}
              </div>
            </>
          )}
        </section>
      )}

      {/* ================================================================ */}
      {/* CANVASSING ROUTES */}
      {/* ================================================================ */}
      {activeSection === 'canvassing' && (
        <section className="strategy-section">
          <h2><Navigation size={20} /> Canvassing Routes</h2>
          <p className="strategy-section-desc">
            Optimised canvassing sessions grouping nearby {wardLabel.toLowerCase()}s for efficient door-knocking campaigns.
            {wardLabel.toLowerCase()}s are clustered by geographic proximity with nearest-neighbor visit ordering.
          </p>

          {!boundariesData?.features?.length || !canvassingData.sessions.length ? (
            <div className="strategy-empty-state">
              <Navigation size={48} />
              <p>
                {!boundariesData?.features?.length
                  ? <>No ward boundary data available. Run <code>ward_boundaries_etl.py</code> to generate boundary data.</>
                  : 'No canvassing sessions could be computed. Ensure ward boundary data includes centroids.'
                }
              </p>
            </div>
          ) : (
            <>
              <Suspense fallback={<div className="map-loading">Loading map...</div>}>
                <WardMap
                  boundaries={boundariesData}
                  wardData={wardMapData}
                  wardsUp={wardsUp}
                  overlayMode="route"
                  selectedWard={selectedDossierWard}
                  onWardClick={openDossier}
                  routeLines={canvassingData.routeLines}
                  routeClusters={canvassingData.sessions.map(s => ({
                    wards: s.wards.map(w => w.ward),
                    color: s.color,
                  }))}
                  height="500px"
                />
              </Suspense>

              <div className="canvassing-summary">
                <div className="canvassing-stat">{canvassingData.sessions.length} sessions</div>
                <div className="canvassing-stat">
                  {canvassingData.sessions.reduce((s, sess) => s + sess.totalHours, 0)} total hours
                </div>
                <div className="canvassing-stat">
                  {canvassingData.sessions.reduce((s, sess) => s + sess.estimatedBlocks, 0)} x 4hr blocks
                </div>
                <button className="canvassing-export-btn" onClick={handleExportCanvassingCSV}>
                  <Download size={14} /> Export CSV
                </button>
              </div>

              <div className="canvassing-sessions-grid">
                {canvassingData.sessions.map(session => (
                  <div key={session.sessionNumber} className="canvassing-session-card" style={{ borderTopColor: session.color }}>
                    <div className="session-header">
                      <span className="session-number" style={{ background: session.color }}>
                        {session.sessionNumber}
                      </span>
                      <span className="session-hours">{session.totalHours}hrs ({session.estimatedBlocks} blocks)</span>
                    </div>
                    <ol className="session-ward-list">
                      {session.wards.map(w => (
                        <li key={w.ward} className="session-ward-item">
                          <button
                            className="session-ward-link"
                            onClick={() => openDossier(w.ward)}
                          >
                            {w.ward}
                          </button>
                          <span className="session-ward-hours">{w.hours}hrs</span>
                          <span className={`session-ward-roi roi-${w.roi}`}>{w.roi}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {activeSection === 'archetypes' && (
        <section className="strategy-section">
          <h2><Users size={20} /> {wardLabel} Archetypes</h2>
          <p className="strategy-section-desc">
            Demographic classification for targeted messaging. Each archetype suggests different campaign priorities.
          </p>

          <div className="archetype-grid">
            {archetypes.map(a => (
              <div key={a.ward} className={`archetype-card archetype-${a.archetype}`}>
                <div className="archetype-ward">{a.ward}</div>
                <div className="archetype-label">{a.label}</div>
                <div className="archetype-desc">{a.description}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="strategy-footer">
        <p>
          Strategy engine powered by AI DOGE election model, Census 2021 demographics, and IMD 2019 deprivation data.
          Predictions are estimates — always validate with local intelligence.
        </p>
      </footer>
    </div>
  )
}

// --- Ward row sub-component (expandable with talking points) ---

function WardRow({ rank, ward, ourParty, expanded, onToggle, onDossier }) {
  const swingReqPct = (ward.swingRequired * 100).toFixed(1)
  const weWin = ward.winner === ourParty

  return (
    <>
      <tr
        className={`strategy-row ${ward.classification} ${expanded ? 'expanded' : ''}`}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        aria-expanded={expanded}
      >
        <td className="rank">{rank}</td>
        <td className="ward-name">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {ward.ward}
        </td>
        <td><ClassBadge classification={ward.classification} label={ward.classLabel} color={ward.classColor} /></td>
        <td><PartyBadge party={ward.winner} /></td>
        <td className={weWin ? 'our-share win' : 'our-share'}>
          {(ward.ourPct * 100).toFixed(1)}%
        </td>
        <td className={ward.swingRequired <= 0 ? 'swing positive' : 'swing negative'}>
          {ward.swingRequired <= 0 ? '' : '+'}{swingReqPct}pp
        </td>
        <td>
          <span className={`win-prob ${ward.winProbability > 0.5 ? 'high' : ward.winProbability > 0.3 ? 'med' : 'low'}`}>
            {Math.round(ward.winProbability * 100)}%
          </span>
        </td>
        <td>{Math.round(ward.turnout * 100)}%</td>
        <td className="score">
          <div className="score-bar" style={{ width: `${ward.score}%` }} />
          {ward.score}
        </td>
        <td>
          <button
            className="dossier-btn-inline"
            onClick={e => { e.stopPropagation(); onDossier && onDossier() }}
            title={`Full dossier for ${ward.ward}`}
          >
            <FileText size={14} />
          </button>
        </td>
      </tr>
      {expanded && ward.talkingPoints.length > 0 && (
        <tr className="talking-points-row">
          <td colSpan={10}>
            <div className="talking-points">
              <h4>Talking Points for {ward.ward}</h4>
              <ul>
                {ward.talkingPoints.map((tp, i) => (
                  <li key={i} className={`tp-item tp-${tp.category.toLowerCase()}`}>
                    <TalkingPointIcon iconName={tp.icon} />
                    <span className="tp-category">{tp.category}</span>
                    <span className="tp-text">{tp.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// --- Ward Dossier View Sub-Component ---

const DOSSIER_TABS = [
  { id: 'profile', label: 'Profile', icon: Users },
  { id: 'election', label: 'Election', icon: Target },
  { id: 'councillors', label: 'Councillors', icon: Eye },
  { id: 'council', label: 'Council', icon: AlertTriangle },
  { id: 'constituency', label: 'Constituency', icon: MapPin },
  { id: 'property', label: 'Property', icon: Building },
  { id: 'talkingPoints', label: 'Talking Points', icon: Briefcase },
  { id: 'cheatSheet', label: 'Cheat Sheet', icon: Printer },
]

function WardDossierView({ dossier, ourParty, wardLabel, activeTab, onTabChange, onBack }) {
  if (!dossier) return null
  const cls = dossier.election?.classification || {}

  return (
    <div className="ward-dossier">
      {/* Header */}
      <div className="dossier-header">
        <button className="dossier-back-btn" onClick={onBack}>
          <ArrowLeft size={16} /> All {wardLabel}s
        </button>
        <div className="dossier-header-main">
          <h2>{dossier.ward}</h2>
          <div className="dossier-header-badges">
            {cls.label && <ClassBadge classification={cls.classification} label={cls.label} color={cls.color || WARD_CLASSES[cls.classification]?.color} />}
            <span className="dossier-score-badge">Score: {dossier.overallScore}/100</span>
          </div>
        </div>
        {dossier.cheatSheet?.target && (
          <p className="dossier-target-line">
            Target: <strong>{dossier.cheatSheet.target}</strong>
            {dossier.cheatSheet.swingNeeded && <> | Swing: <strong>{dossier.cheatSheet.swingNeeded}</strong></>}
            {dossier.electionDate && <> | Election: <strong>{formatElectionDate(dossier.electionDate)}</strong></>}
          </p>
        )}
      </div>

      {/* Tab bar */}
      <nav className="dossier-tab-bar" aria-label="Dossier sections">
        {DOSSIER_TABS.map(t => (
          <button
            key={t.id}
            className={`dossier-tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => onTabChange(t.id)}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="dossier-content">
        {activeTab === 'profile' && <DossierProfile profile={dossier.profile} />}
        {activeTab === 'election' && <DossierElection election={dossier.election} ourParty={ourParty} />}
        {activeTab === 'councillors' && <DossierCouncillors councillors={dossier.councillors} />}
        {activeTab === 'council' && <DossierCouncilPerf perf={dossier.councilPerformance} />}
        {activeTab === 'constituency' && <DossierConstituency constituency={dossier.constituency} />}
        {activeTab === 'property' && <DossierProperty propertySummary={dossier.propertySummary} />}
        {activeTab === 'talkingPoints' && <DossierTalkingPoints talkingPoints={dossier.talkingPoints} />}
        {activeTab === 'cheatSheet' && <DossierCheatSheet cheatSheet={dossier.cheatSheet} />}
      </div>
    </div>
  )
}

function DossierProfile({ profile }) {
  if (!profile) return <p className="dossier-empty">No profile data available.</p>
  const stats = [
    { label: 'Population', value: profile.population?.toLocaleString() || '—' },
    { label: 'Electorate', value: profile.electorate?.toLocaleString() || '—' },
    { label: 'Over 65', value: profile.over65Pct ? `${Math.round(profile.over65Pct * 100)}%` : '—' },
    { label: 'Under 18', value: profile.under18Pct ? `${Math.round(profile.under18Pct * 100)}%` : '—' },
    { label: 'White British', value: profile.whiteBritishPct ? `${Math.round(profile.whiteBritishPct * 100)}%` : '—' },
    { label: 'Home Ownership', value: profile.homeOwnershipPct ? `${Math.round(profile.homeOwnershipPct * 100)}%` : '—' },
    { label: 'Social Rented', value: profile.socialRentedPct ? `${Math.round(profile.socialRentedPct * 100)}%` : '—' },
    { label: 'Unemployment', value: profile.unemploymentPct ? `${(profile.unemploymentPct * 100).toFixed(1)}%` : '—' },
    { label: 'Retired', value: profile.retiredPct ? `${Math.round(profile.retiredPct * 100)}%` : '—' },
  ]
  return (
    <div className="dossier-panel">
      <h3>Ward Profile</h3>
      <div className="dossier-stat-grid">
        {stats.map(s => (
          <div key={s.label} className="dossier-stat-item">
            <div className="dossier-stat-value">{s.value}</div>
            <div className="dossier-stat-label">{s.label}</div>
          </div>
        ))}
      </div>
      {profile.deprivation && (
        <div className="dossier-subsection">
          <h4>Deprivation (IMD 2019)</h4>
          <div className="dossier-stat-grid small">
            <div className="dossier-stat-item"><div className="dossier-stat-value">{profile.deprivation.decile}</div><div className="dossier-stat-label">IMD Decile</div></div>
            <div className="dossier-stat-item"><div className="dossier-stat-value">{profile.deprivation.level}</div><div className="dossier-stat-label">Level</div></div>
            <div className="dossier-stat-item"><div className="dossier-stat-value">{profile.deprivation.rank?.toLocaleString()}</div><div className="dossier-stat-label">Rank</div></div>
          </div>
        </div>
      )}
      {profile.archetype?.label && (
        <div className="dossier-subsection">
          <h4>Archetype</h4>
          <div className={`archetype-card archetype-${profile.archetype.archetype}`} style={{ margin: 0 }}>
            <div className="archetype-label">{profile.archetype.label}</div>
            <div className="archetype-desc">{profile.archetype.description}</div>
          </div>
        </div>
      )}
      {profile.constituency && (
        <p className="dossier-meta">Constituency: <strong>{profile.constituency}</strong></p>
      )}
    </div>
  )
}

function DossierElection({ election, ourParty }) {
  if (!election) return <p className="dossier-empty">No election data available.</p>
  return (
    <div className="dossier-panel">
      <h3>Election Intelligence</h3>
      {election.defender && (
        <div className="dossier-defender-card">
          <h4>Defending Councillor</h4>
          <p><strong>{election.defender.name || 'Unknown'}</strong> — <PartyBadge party={election.defender.party} /></p>
        </div>
      )}
      {election.prediction && (
        <div className="dossier-subsection">
          <h4>Prediction</h4>
          <div className="dossier-stat-grid small">
            <div className="dossier-stat-item"><div className="dossier-stat-value"><PartyBadge party={election.prediction.winner} /></div><div className="dossier-stat-label">Predicted Winner</div></div>
            <div className="dossier-stat-item"><div className="dossier-stat-value">{((election.prediction.ourPct ?? 0) * 100).toFixed(1)}%</div><div className="dossier-stat-label">Our Share</div></div>
            <div className="dossier-stat-item"><div className="dossier-stat-value">{Math.round((election.prediction.winProbability ?? 0) * 100)}%</div><div className="dossier-stat-label">Win Probability</div></div>
            <div className="dossier-stat-item"><div className="dossier-stat-value">{(election.prediction.swingRequired ?? 0) > 0 ? '+' : ''}{((election.prediction.swingRequired ?? 0) * 100).toFixed(1)}pp</div><div className="dossier-stat-label">Swing Needed</div></div>
          </div>
        </div>
      )}
      {election.history?.length > 0 && (
        <div className="dossier-subsection">
          <h4>Election History ({ourParty})</h4>
          <div className="dossier-history-list">
            {election.history.map((h, i) => (
              <div key={i} className="dossier-history-item">
                <span className="dossier-history-year">{h.year}</span>
                <span className="dossier-history-pct">{(h.ourPct * 100).toFixed(1)}%</span>
                <span className="dossier-history-winner">{h.winnerParty} won</span>
                <span className="dossier-history-turnout">T/O: {Math.round(h.turnout * 100)}%</span>
              </div>
            ))}
          </div>
          {election.trend && (
            <p className="dossier-meta">
              Trend: <span style={{ color: TREND_CONFIG[election.trend]?.color || '#888' }}>{TREND_CONFIG[election.trend]?.label || election.trend}</span>
              {election.avgSwing != null && <> | Avg swing: {election.avgSwing > 0 ? '+' : ''}{(election.avgSwing * 100).toFixed(1)}pp/election</>}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function DossierCouncillors({ councillors }) {
  if (!councillors?.length) return <p className="dossier-empty">No councillor data available.</p>
  return (
    <div className="dossier-panel">
      <h3>Councillor Dossiers</h3>
      {councillors.map((c, i) => (
        <div key={i} className={`councillor-card ${c.isDefender ? 'defender' : ''}`}>
          <div className="councillor-card-header">
            <span className="councillor-name">{c.name}</span>
            <PartyBadge party={c.party} />
            {c.isDefender && <span className="defender-badge">DEFENDER</span>}
          </div>
          {c.roles?.length > 0 && (
            <p className="councillor-roles">Roles: {c.roles.map(r => typeof r === 'string' ? r : r.role).join(', ')}</p>
          )}
          {c.integrity && (
            <div className="councillor-integrity">
              <span>Integrity: <strong>{c.integrity.score}/100</strong></span>
              <span className={`risk-badge risk-${c.integrity.riskLevel}`}>{c.integrity.riskLevel}</span>
              {c.integrity.directorships > 0 && <span>{c.integrity.directorships} directorships</span>}
              {c.integrity.redFlags?.length > 0 && <span className="red-flag-count">{c.integrity.redFlags.length} red flags</span>}
            </div>
          )}
          {c.interests && (c.interests.companies?.length > 0 || c.interests.employment?.length > 0 || c.interests.securities?.length > 0) && (
            <div className="councillor-interests">
              <h5>Declared Interests</h5>
              {c.interests.companies?.length > 0 && <p>Companies: {c.interests.companies.join(', ')}</p>}
              {c.interests.employment?.length > 0 && <p>Employment: {c.interests.employment.join(', ')}</p>}
              {c.interests.securities?.length > 0 && <p>Securities: {c.interests.securities.join(', ')}</p>}
            </div>
          )}
          {c.attackLines?.length > 0 && (
            <div className="councillor-attack-lines">
              <h5>Attack Lines</h5>
              {c.attackLines.map((a, j) => (
                <div key={j} className="attack-line" style={{ borderLeftColor: SEVERITY_COLORS[a.severity] || '#888' }}>
                  {a.text}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function DossierCouncilPerf({ perf }) {
  if (!perf) return <p className="dossier-empty">No council performance data available.</p>
  return (
    <div className="dossier-panel">
      <h3>Council Performance</h3>
      <div className="dossier-stat-grid small">
        <div className="dossier-stat-item"><div className="dossier-stat-value">{perf.politicalControl}</div><div className="dossier-stat-label">Political Control</div></div>
        {perf.fraudTriangleScore != null && <div className="dossier-stat-item"><div className="dossier-stat-value" style={{ color: perf.fraudTriangleScore > 70 ? '#ff453a' : perf.fraudTriangleScore > 60 ? '#ff9f0a' : '#30d158' }}>{perf.fraudTriangleScore}</div><div className="dossier-stat-label">Fraud Triangle</div></div>}
        {perf.collectionRate && <div className="dossier-stat-item"><div className="dossier-stat-value">{perf.collectionRate.latest}%</div><div className="dossier-stat-label">Collection Rate</div></div>}
        {perf.councilTaxBandD != null && <div className="dossier-stat-item"><div className="dossier-stat-value">£{perf.councilTaxBandD.toFixed(2)}</div><div className="dossier-stat-label">Band D</div></div>}
      </div>

      {perf.topFindings?.length > 0 && (
        <div className="dossier-subsection">
          <h4>Key DOGE Findings</h4>
          {perf.topFindings.map((f, i) => (
            <div key={i} className={`doge-finding severity-${f.severity}`}>
              <span className="finding-label">{f.label}</span>
              <span className="finding-value">{f.value}</span>
            </div>
          ))}
        </div>
      )}

      {perf.attackLines?.length > 0 && (
        <div className="dossier-subsection">
          <h4>Council Attack Lines</h4>
          {perf.attackLines.map((a, i) => (
            <div key={i} className="attack-line" style={{ borderLeftColor: SEVERITY_COLORS[a.severity] || '#888' }}>
              <span className="attack-category">{a.category}</span>
              {a.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DossierConstituency({ constituency }) {
  if (!constituency) return <p className="dossier-empty">No constituency data available.</p>
  return (
    <div className="dossier-panel">
      <h3>{constituency.name} Constituency</h3>
      {constituency.mp && (
        <div className="dossier-mp-card">
          <h4>MP: {constituency.mp.name}</h4>
          <PartyBadge party={constituency.mp.party} />
          {constituency.mpExpenses && (
            <p className="dossier-meta">Expenses: £{Math.round(constituency.mpExpenses.total / 1000)}K claimed (rank {constituency.mpExpenses.rank}/650)</p>
          )}
          {constituency.votingRecord && (
            <p className="dossier-meta">
              Voting: {constituency.votingRecord.rebellions || 0} rebellions in {constituency.votingRecord.total_divisions || '—'} divisions
              {constituency.votingRecord.rebellions === 0 && <span style={{ color: '#ff9f0a' }}> — lobby fodder</span>}
            </p>
          )}
        </div>
      )}
      {constituency.ge2024?.results && (
        <div className="dossier-subsection">
          <h4>GE2024 Results</h4>
          <div className="ge2024-results">
            {constituency.ge2024.results
              .sort((a, b) => (b.pct || 0) - (a.pct || 0))
              .slice(0, 5)
              .map((r, i) => (
                <div key={i} className="ge2024-result-row">
                  <PartyBadge party={r.party} />
                  <div className="ge2024-bar-wrap">
                    <div className="ge2024-bar" style={{ width: `${(r.pct || 0) * 100}%`, background: PARTY_COLORS[r.party] || '#888' }} />
                  </div>
                  <span className="ge2024-pct">{((r.pct || 0) * 100).toFixed(1)}%</span>
                  <span className="ge2024-votes">{r.votes?.toLocaleString()}</span>
                </div>
              ))}
          </div>
        </div>
      )}
      {constituency.claimantCount?.length > 0 && (
        <p className="dossier-meta">
          Claimant count: {constituency.claimantCount[0].claimant_rate_pct}% ({constituency.claimantCount[0].claimant_count?.toLocaleString()} people)
        </p>
      )}
    </div>
  )
}

const CATEGORY_LABELS_SHORT = {
  education: 'Education', library: 'Library', children_social_care: 'Children/SC',
  office_civic: 'Office/Civic', operations_depot_waste: 'Ops/Depot',
  transport_highways: 'Transport', land_general: 'Land', land_woodland: 'Woodland',
  land_open_space: 'Open Space', other_building: 'Other',
}

const PATHWAY_SHORT = {
  quick_win_auction: 'Quick Win', private_treaty_sale: 'Sell', development_partnership: 'Develop',
  community_asset_transfer: 'CAT', long_lease_income: 'Lease', meanwhile_use: 'Meanwhile',
  energy_generation: 'Energy', carbon_offset_woodland: 'Carbon', housing_partnership: 'Housing',
  co_locate_consolidate: 'Co-locate', strategic_hold: 'Hold', governance_review: 'Gov Review',
  refurbish_relet: 'Refurb/Let',
}
const PATHWAY_COL = {
  quick_win_auction: '#30d158', private_treaty_sale: '#0a84ff', development_partnership: '#bf5af2',
  community_asset_transfer: '#ff9f0a', long_lease_income: '#64d2ff', meanwhile_use: '#ffd60a',
  energy_generation: '#34c759', carbon_offset_woodland: '#00c7be', housing_partnership: '#ff6482',
  co_locate_consolidate: '#ac8e68', strategic_hold: '#8e8e93', governance_review: '#ff453a',
  refurbish_relet: '#5e5ce6',
}

function DossierProperty({ propertySummary }) {
  if (!propertySummary) return <p className="dossier-empty">No property data for this division.</p>

  const { total, totalSpend, conditionSpend, quickWinCount, energyRiskCount, pathways, occupancy, categories, assets } = propertySummary

  return (
    <div className="dossier-property">
      <div className="dossier-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '16px' }}>
        <div className="dossier-stat-card" style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 600, color: '#0a84ff' }}>{total}</div>
          <div style={{ fontSize: '0.65rem', color: '#8e8e93' }}>LCC Assets</div>
        </div>
        <div className="dossier-stat-card" style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 600, color: totalSpend > 0 ? '#ff9f0a' : '#8e8e93' }}>
            {totalSpend > 0 ? `£${Math.round(totalSpend / 1000)}k` : '—'}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#8e8e93' }}>Supplier Spend</div>
        </div>
        <div className="dossier-stat-card" style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 600, color: conditionSpend > 0 ? '#ff9f0a' : '#8e8e93' }}>
            {conditionSpend > 0 ? `£${Math.round(conditionSpend / 1000)}k` : '—'}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#8e8e93' }}>Condition Spend</div>
        </div>
        <div className="dossier-stat-card" style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 600, color: quickWinCount > 0 ? '#30d158' : '#8e8e93' }}>{quickWinCount}</div>
          <div style={{ fontSize: '0.65rem', color: '#8e8e93' }}>Quick Wins</div>
        </div>
        <div className="dossier-stat-card" style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 600, color: energyRiskCount > 0 ? '#ff9f0a' : '#30d158' }}>{energyRiskCount}</div>
          <div style={{ fontSize: '0.65rem', color: '#8e8e93' }}>Energy Risk</div>
        </div>
      </div>

      {/* Pathway breakdown */}
      {pathways && Object.keys(pathways).length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ fontSize: '0.75rem', color: '#e2e8f0', marginBottom: '6px' }}>Disposal Pathways</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {Object.entries(pathways).sort((a, b) => b[1] - a[1]).map(([pw, count]) => (
              <span key={pw} style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: '4px', background: `${PATHWAY_COL[pw] || '#666'}22`, color: PATHWAY_COL[pw] || '#cbd5e1', border: `1px solid ${PATHWAY_COL[pw] || '#666'}44` }}>
                {PATHWAY_SHORT[pw] || pw} ({count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Occupancy breakdown */}
      {occupancy && Object.keys(occupancy).length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ fontSize: '0.75rem', color: '#e2e8f0', marginBottom: '6px' }}>Occupancy Status</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {Object.entries(occupancy).sort((a, b) => b[1] - a[1]).map(([occ, count]) => (
              <span key={occ} style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#cbd5e1' }}>
                {occ.replace(/_/g, ' ')} ({count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Category breakdown */}
      {Object.keys(categories).length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ fontSize: '0.75rem', color: '#e2e8f0', marginBottom: '6px' }}>By Category</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {Object.entries(categories).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
              <span key={cat} style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#cbd5e1' }}>
                {CATEGORY_LABELS_SHORT[cat] || cat} ({count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Asset list */}
      {assets?.length > 0 && (
        <div>
          <h4 style={{ fontSize: '0.75rem', color: '#e2e8f0', marginBottom: '6px' }}>Assets</h4>
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.65rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#8e8e93', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>Name</th>
                  <th style={{ textAlign: 'center', padding: '4px 6px' }}>Pathway</th>
                  <th style={{ textAlign: 'center', padding: '4px 6px' }}>Complexity</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px' }}>Spend</th>
                </tr>
              </thead>
              <tbody>
                {assets.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '4px 6px' }}>
                      <a href={`#/property/${a.id}`} style={{ color: '#0a84ff', textDecoration: 'none', fontSize: '0.65rem' }}>{a.name}</a>
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                      <span style={{ color: PATHWAY_COL[a.disposal_pathway] || '#8e8e93', fontSize: '0.6rem' }}>
                        {PATHWAY_SHORT[a.disposal_pathway] || a.disposal_pathway || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.6rem', color: (a.disposal_complexity || 0) > 60 ? '#ff453a' : (a.disposal_complexity || 0) > 30 ? '#ff9f0a' : '#30d158' }}>
                        {a.disposal_complexity ?? '—'}
                      </span>
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', color: '#e2e8f0' }}>
                      {a.linked_spend > 0 ? `£${Math.round(a.linked_spend / 1000)}k` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function DossierTalkingPoints({ talkingPoints }) {
  if (!talkingPoints) return <p className="dossier-empty">No talking points available.</p>
  const categories = [
    { key: 'local', label: 'Local (Ward-Specific)', icon: MapPin },
    { key: 'council', label: 'Council Criticism', icon: AlertTriangle },
    { key: 'national', label: 'National Reform Lines', icon: Globe },
    { key: 'constituency', label: 'Constituency', icon: Briefcase },
  ]
  return (
    <div className="dossier-panel">
      <h3>Talking Points</h3>
      {categories.map(cat => {
        const points = talkingPoints[cat.key] || []
        if (points.length === 0) return null
        const CatIcon = cat.icon
        return (
          <div key={cat.key} className="dossier-subsection">
            <h4><CatIcon size={16} /> {cat.label} ({points.length})</h4>
            <ul className="dossier-tp-list">
              {points.map((p, i) => (
                <li key={i} className="dossier-tp-item">
                  <TalkingPointIcon iconName={p.icon} />
                  <span>{p.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function DossierCheatSheet({ cheatSheet }) {
  if (!cheatSheet) return <p className="dossier-empty">No cheat sheet data available.</p>

  const handlePrint = () => window.print()

  return (
    <div className="dossier-panel cheat-sheet-panel">
      <div className="cheat-sheet-header">
        <h3>Campaign Cheat Sheet</h3>
        <button className="dossier-print-btn" onClick={handlePrint}>
          <Printer size={14} /> Print
        </button>
      </div>

      <div className="cheat-sheet" id="cheat-sheet-print">
        <div className="cheat-sheet-title">
          <h2>{cheatSheet.wardName}</h2>
          <p className="cheat-target">{cheatSheet.target} | Swing: {cheatSheet.swingNeeded} | Score: {cheatSheet.overallScore}/100</p>
          <p className="cheat-date">Election: {formatElectionDate(cheatSheet.electionDate)}</p>
        </div>

        <div className="cheat-section">
          <h4>Key Stats</h4>
          <div className="cheat-stats">
            {cheatSheet.keyStats?.map((s, i) => <span key={i} className="cheat-stat">{s}</span>)}
          </div>
        </div>

        <div className="cheat-section">
          <h4>Defender: {cheatSheet.defenderName} ({cheatSheet.defenderParty})</h4>
        </div>

        <div className="cheat-section">
          <h4>Top 5 Talking Points</h4>
          <ol className="cheat-tp-list">
            {cheatSheet.top5TalkingPoints?.map((tp, i) => (
              <li key={i}>{tp.text}</li>
            ))}
          </ol>
        </div>

        {cheatSheet.doNotSay?.length > 0 && (
          <div className="cheat-section cheat-dontsay">
            <h4>⚠ Do Not Say</h4>
            <ul>
              {cheatSheet.doNotSay.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Helpers ---
function formatElectionDate(dateStr) {
  if (!dateStr) return 'TBC'
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}
