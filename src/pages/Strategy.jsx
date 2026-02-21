import { useState, useEffect, useMemo } from 'react'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useData } from '../hooks/useData'
import { formatNumber } from '../utils/format'
import { TOOLTIP_STYLE } from '../utils/constants'
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
  Download,
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
  Target, CheckCircle, MapPin, Swords,
}

// Section definitions
const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: Target },
  { id: 'battlegrounds', label: 'Battlegrounds', icon: Crosshair },
  { id: 'path', label: 'Path to Control', icon: TrendingUp },
  { id: 'vulnerable', label: 'Vulnerable Seats', icon: Shield },
  { id: 'swingHistory', label: 'Swing History', icon: Clock },
  { id: 'resources', label: 'Resources', icon: BarChart3 },
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

  const { data: optData } = useData(['/data/demographics.json', '/data/deprivation.json'])
  const [demographicsData, deprivationData] = optData || [null, null]

  // --- State ---
  const [activeSection, setActiveSection] = useState('dashboard')
  const [ourParty, setOurParty] = useState('Reform UK')
  const [expandedWards, setExpandedWards] = useState({})
  const [totalHours, setTotalHours] = useState(1000)

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

  // --- Derived: resource allocation ---
  const resourceAllocation = useMemo(() => {
    if (!rankedWards.length) return []
    return allocateResources(rankedWards, totalHours)
  }, [rankedWards, totalHours])

  // --- Handlers ---
  const toggleWard = (wardName) => {
    setExpandedWards(prev => ({ ...prev, [wardName]: !prev[wardName] }))
  }

  const handleExportCSV = () => {
    const csv = generateStrategyCSV(rankedWards, resourceAllocation, ourParty, councilName)
    if (!csv) return
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `strategy-${config.council_id}-${ourParty.toLowerCase().replace(/\s+/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: '#aaa', fontSize: 12 }} />
                  <YAxis type="category" dataKey="ward" tick={{ fill: '#ccc', fontSize: 11 }} width={95} />
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
                  />
                ))}
              </tbody>
            </table>
          </div>
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
            <button className="strategy-export-btn" onClick={handleExportCSV} title="Export strategy data as CSV">
              <Download size={14} /> Export CSV
            </button>
          </div>

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
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis type="number" tick={{ fill: '#aaa', fontSize: 12 }} />
                    <YAxis type="category" dataKey="ward" tick={{ fill: '#ccc', fontSize: 11 }} width={105} />
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
                        <td className="resource-hours">{r.hours}</td>
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

function WardRow({ rank, ward, ourParty, expanded, onToggle }) {
  const swingReqPct = (ward.swingRequired * 100).toFixed(1)
  const weWin = ward.winner === ourParty

  return (
    <>
      <tr
        className={`strategy-row ${ward.classification} ${expanded ? 'expanded' : ''}`}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onToggle()}
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
      </tr>
      {expanded && ward.talkingPoints.length > 0 && (
        <tr className="talking-points-row">
          <td colSpan={9}>
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

// --- Helpers ---
function formatElectionDate(dateStr) {
  if (!dateStr) return 'TBC'
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}
