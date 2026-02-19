import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useData } from '../hooks/useData'
import { formatCurrency, formatNumber, formatDate, formatPercent } from '../utils/format'
import { TOOLTIP_STYLE } from '../utils/constants'
import { LoadingState } from '../components/ui'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts'
import {
  User, Vote, CheckSquare, MessageSquare, PoundSterling,
  TrendingDown, Building, Database, ExternalLink, Calendar,
  AlertTriangle, FileText, Tag,
} from 'lucide-react'
import './ConstituencyView.css'

// --- Fallback party colours ---
const FALLBACK_PARTY_COLORS = {
  Labour: '#DC241F', 'Labour (Co-op)': '#DC241F', 'Lab & Co-op': '#DC241F',
  Conservative: '#0087DC', 'Liberal Democrats': '#FAA61A', 'Lib Dem': '#FAA61A',
  Green: '#6AB023', 'Reform UK': '#12B6CF', Independent: '#888888',
  UKIP: '#70147A', 'Workers Party': '#b71c1c', Other: '#999999',
}

// --- Council ID to slug mapping (matches deploy.yml) ---
const COUNCIL_SLUG_MAP = {
  burnley: 'burnleycouncil', hyndburn: 'hyndburncouncil', pendle: 'pendlecouncil',
  rossendale: 'rossendalecouncil', lancaster: 'lancastercouncil', ribble_valley: 'ribblevalleycouncil',
  chorley: 'chorleycouncil', south_ribble: 'southribblecouncil', lancashire_cc: 'lancashirecc',
  blackpool: 'blackpoolcouncil', west_lancashire: 'westlancashirecouncil', blackburn: 'blackburncouncil',
  wyre: 'wyrecouncil', preston: 'prestoncouncil', fylde: 'fyldecouncil',
}

// --- Council display names ---
const COUNCIL_NAMES = {
  burnley: 'Burnley', hyndburn: 'Hyndburn', pendle: 'Pendle', rossendale: 'Rossendale',
  lancaster: 'Lancaster', ribble_valley: 'Ribble Valley', chorley: 'Chorley',
  south_ribble: 'South Ribble', lancashire_cc: 'Lancashire CC', blackpool: 'Blackpool',
  west_lancashire: 'West Lancashire', blackburn: 'Blackburn with Darwen',
  wyre: 'Wyre', preston: 'Preston', fylde: 'Fylde',
}

// --- Section definitions ---
const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: User },
  { id: 'election', label: 'Election', icon: Vote },
  { id: 'voting', label: 'Voting', icon: CheckSquare },
  { id: 'activity', label: 'Activity', icon: MessageSquare },
  { id: 'expenses', label: 'Expenses', icon: PoundSterling },
  { id: 'claimants', label: 'Claimants', icon: TrendingDown },
  { id: 'councils', label: 'Councils', icon: Building },
  { id: 'sources', label: 'Sources', icon: Database },
]

// --- Helpers ---

function getPartyColor(party, partyColors) {
  if (!party) return '#888'
  // Try exact match from elections_reference first
  if (partyColors?.[party]) return partyColors[party]
  // Try fallback map
  if (FALLBACK_PARTY_COLORS[party]) return FALLBACK_PARTY_COLORS[party]
  // Try partial match
  const lp = party.toLowerCase()
  for (const [key, color] of Object.entries(FALLBACK_PARTY_COLORS)) {
    if (lp.includes(key.toLowerCase())) return color
  }
  return '#888'
}

function formatMoney(value) {
  if (value == null || isNaN(value)) return '-'
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value)
}

function formatMoneyWhole(value) {
  if (value == null || isNaN(value)) return '-'
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value)
}

function formatElectedDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function PartyBadge({ party, color }) {
  return (
    <span className="cv-party-badge" style={{ background: color || '#888' }}>
      {party}
    </span>
  )
}

function VoteBadge({ vote }) {
  const isAye = vote === 'Aye'
  return (
    <span className={`cv-vote-badge ${isAye ? 'aye' : 'no'}`}>
      {vote}
    </span>
  )
}

function StatBox({ label, value, sub }) {
  return (
    <div className="cv-stat-box">
      <span className="cv-stat-value">{value}</span>
      <span className="cv-stat-label">{label}</span>
      {sub && <span className="cv-stat-sub">{sub}</span>}
    </div>
  )
}

// --- Custom Recharts tooltip ---
function CvTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#fff' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ margin: '2px 0', color: p.color || '#ccc', fontSize: '13px' }}>
          {p.name}: {typeof p.value === 'number' ? formatNumber(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

function ExpensesTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#fff' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ margin: '2px 0', color: p.color || '#0a84ff', fontSize: '13px' }}>
          {formatMoney(p.value)}
        </p>
      ))}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export default function ConstituencyView() {
  const { constituencyId } = useParams()
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'

  const { data, loading, error } = useData([
    '/data/shared/constituencies.json',
    '/data/shared/elections_reference.json',
  ])
  const [constituencies, electionsRef] = data || [null, null]

  const [activeSection, setActiveSection] = useState('overview')

  // Find the constituency by ID
  const constituency = useMemo(() => {
    if (!constituencies) return null
    const list = Array.isArray(constituencies) ? constituencies : constituencies.constituencies || []
    return list.find(c => c.id === constituencyId) || null
  }, [constituencies, constituencyId])

  // Party colors from elections reference
  const partyColors = useMemo(() => {
    if (!electionsRef?.party_colors) return FALLBACK_PARTY_COLORS
    return { ...FALLBACK_PARTY_COLORS, ...electionsRef.party_colors }
  }, [electionsRef])

  // Set page title
  useEffect(() => {
    const name = constituency?.name || constituencyId || 'Constituency'
    document.title = `${name} | MP Profile | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [constituency, constituencyId, councilName])

  // Election results chart data
  const electionChartData = useMemo(() => {
    if (!constituency?.ge2024?.results) return []
    return constituency.ge2024.results
      .sort((a, b) => b.votes - a.votes)
      .map(c => ({
        name: c.candidate,
        party: c.party,
        votes: c.votes,
        pct: c.pct,
        fill: getPartyColor(c.party, partyColors),
      }))
  }, [constituency, partyColors])

  // Expenses chart data
  const expensesChartData = useMemo(() => {
    const exp = constituency?.mp?.expenses
    if (!exp) return []
    return [
      { category: 'Staffing', amount: exp.staffing || 0 },
      { category: 'Office Costs', amount: exp.office_costs || 0 },
      { category: 'Accommodation', amount: exp.accommodation || 0 },
      { category: 'Travel', amount: exp.travel || 0 },
      { category: 'Other', amount: exp.other || 0 },
    ].filter(d => d.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  }, [constituency])

  // Claimant count chart data
  const claimantChartData = useMemo(() => {
    if (!constituency?.claimant_count?.length) return []
    return constituency.claimant_count
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .map(d => ({
        month: d.month?.replace(/\s+\d{4}$/, '') || d.date || '',
        fullLabel: d.month || d.date || '',
        count: d.claimant_count,
        rate: d.claimant_rate_pct,
      }))
  }, [constituency])

  // Latest claimant rate
  const latestClaimant = useMemo(() => {
    if (!constituency?.claimant_count?.length) return null
    const sorted = [...constituency.claimant_count].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return sorted[0]
  }, [constituency])

  // Handle scroll to section
  function scrollToSection(sectionId) {
    setActiveSection(sectionId)
    document.getElementById(`cv-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Loading state
  if (loading) return <LoadingState message="Loading constituency data..." />

  // Error state
  if (error) {
    return (
      <div className="cv-page">
        <div className="cv-error">
          <AlertTriangle size={48} />
          <h2>Unable to load constituency data</h2>
          <p>Please try again later.</p>
        </div>
      </div>
    )
  }

  // Not found
  if (!constituency) {
    return (
      <div className="cv-page">
        <div className="cv-error">
          <AlertTriangle size={48} />
          <h2>Constituency not found</h2>
          <p>No data found for constituency ID "{constituencyId}".</p>
          <Link to="/elections" className="cv-back-link">Back to Elections</Link>
        </div>
      </div>
    )
  }

  const mp = constituency.mp || {}
  const ge2024 = constituency.ge2024 || {}
  const voting = constituency.voting_record || {}
  const activity = constituency.parliamentary_activity || {}
  const expenses = constituency?.mp?.expenses || {}
  const mpPartyColor = getPartyColor(mp.party, partyColors)

  return (
    <div className="cv-page">
      {/* Header */}
      <div className="cv-header">
        <Link to="/elections" className="cv-back-link">
          Back to Elections
        </Link>
        <h1>{constituency.name}</h1>
        <p className="cv-subtitle">
          Parliamentary constituency profile — MP voting record, expenses, election results, and local economic data.
        </p>
      </div>

      {/* Section Nav */}
      <nav className="cv-section-nav">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            className={`section-nav-btn ${activeSection === s.id ? 'active' : ''}`}
            onClick={() => scrollToSection(s.id)}
          >
            <s.icon size={14} />
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      {/* ================================================================ */}
      {/* 1. Overview Section                                              */}
      {/* ================================================================ */}
      <section id="cv-overview" className="cv-section">
        <h2><User size={20} /> Overview</h2>
        <div className="cv-hero">
          <div className="cv-hero-photo-col">
            {mp.photo_url ? (
              <img
                src={mp.photo_url}
                alt={`${mp.name || 'MP'} portrait`}
                className="cv-mp-photo"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            ) : (
              <div className="cv-mp-photo-placeholder">
                <User size={64} />
              </div>
            )}
            <PartyBadge party={mp.party} color={mpPartyColor} />
          </div>
          <div className="cv-hero-info-col">
            <h3 className="cv-mp-name">{mp.name || 'Unknown'}</h3>
            <p className="cv-mp-constituency">
              MP for <strong>{constituency.name}</strong>
            </p>
            <div className="cv-hero-stats">
              <StatBox
                label="Elected"
                value={formatElectedDate(mp.elected)}
              />
              <StatBox
                label="Majority"
                value={formatNumber(mp.majority)}
                sub={mp.majority_pct != null ? `(${formatPercent(mp.majority_pct * 100)})` : null}
              />
              <StatBox
                label="Salary"
                value={expenses.salary ? formatMoneyWhole(expenses.salary) : '-'}
              />
              <StatBox
                label="Total Cost to Taxpayer"
                value={expenses.total_cost_to_taxpayer ? formatMoneyWhole(expenses.total_cost_to_taxpayer) : '-'}
                sub={expenses.year ? `(${expenses.year})` : null}
              />
            </div>
            {mp.parliament_id && (
              <a
                href={`https://members.parliament.uk/member/${mp.parliament_id}/contact`}
                target="_blank"
                rel="noopener noreferrer"
                className="cv-parliament-link"
              >
                <ExternalLink size={14} />
                View on Parliament.uk
              </a>
            )}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* 2. Election Results Section                                      */}
      {/* ================================================================ */}
      <section id="cv-election" className="cv-section">
        <h2><Vote size={20} /> General Election 2024</h2>
        <p className="cv-section-desc">
          Full results from the 4 July 2024 general election in {constituency.name}.
        </p>

        <div className="cv-election-summary">
          <StatBox label="Result" value={ge2024.result || '-'} />
          <StatBox label="Turnout" value={ge2024.turnout ? formatNumber(ge2024.turnout) : '-'}
            sub={ge2024.turnout_pct ? `(${formatPercent(ge2024.turnout_pct * 100)})` : null} />
          <StatBox label="Electorate" value={ge2024.electorate ? formatNumber(ge2024.electorate) : '-'} />
        </div>

        {electionChartData.length > 0 && (
          <div className="cv-chart-card">
            <h3>Candidate Results</h3>
            <ResponsiveContainer width="100%" height={Math.max(250, electionChartData.length * 50)}>
              <BarChart data={electionChartData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#8e8e93', fontSize: 12 }} tickFormatter={v => formatNumber(v)} />
                <YAxis
                  type="category" dataKey="name" width={140}
                  tick={{ fill: '#e5e5e7', fontSize: 12 }}
                />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload
                  return (
                    <div style={TOOLTIP_STYLE}>
                      <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#fff' }}>{d.name}</p>
                      <p style={{ margin: '2px 0', color: d.fill, fontSize: '13px' }}>{d.party}</p>
                      <p style={{ margin: '2px 0', color: '#ccc', fontSize: '13px' }}>
                        {formatNumber(d.votes)} votes ({formatPercent(d.pct * 100)})
                      </p>
                    </div>
                  )
                }} />
                <Bar dataKey="votes" radius={[0, 6, 6, 0]}>
                  {electionChartData.map((entry, idx) => (
                    <rect key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Candidate table */}
            <div className="cv-candidates-table-wrap">
              <table className="cv-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Party</th>
                    <th style={{ textAlign: 'right' }}>Votes</th>
                    <th style={{ textAlign: 'right' }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {electionChartData.map((c, i) => (
                    <tr key={i}>
                      <td>
                        <span className="cv-candidate-marker" style={{ background: c.fill }} />
                        {c.name}
                        {i === 0 && <span className="cv-elected-badge">Elected</span>}
                      </td>
                      <td><PartyBadge party={c.party} color={c.fill} /></td>
                      <td style={{ textAlign: 'right' }}>{formatNumber(c.votes)}</td>
                      <td style={{ textAlign: 'right' }}>{formatPercent(c.pct * 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ================================================================ */}
      {/* 3. Voting Record Section                                         */}
      {/* ================================================================ */}
      <section id="cv-voting" className="cv-section">
        <h2><CheckSquare size={20} /> Voting Record</h2>
        <p className="cv-section-desc">
          Parliamentary division voting record for {mp.name || 'this MP'}.
        </p>

        <div className="cv-voting-summary">
          <StatBox
            label="Divisions Voted In"
            value={voting.voted_in != null ? formatNumber(voting.voted_in) : '-'}
          />
          <StatBox
            label="Total Career Divisions"
            value={voting.total_career_divisions != null ? formatNumber(voting.total_career_divisions) : '-'}
          />
          {voting.voted_in != null && voting.total_career_divisions > 0 && (
            <StatBox
              label="Participation Rate"
              value={formatPercent((voting.voted_in / voting.total_career_divisions) * 100)}
            />
          )}
        </div>

        {voting.notable_votes?.length > 0 ? (
          <div className="cv-chart-card">
            <h3>Notable Votes</h3>
            <div className="cv-table-wrap">
              <table className="cv-table">
                <thead>
                  <tr>
                    <th>Division</th>
                    <th>Date</th>
                    <th style={{ textAlign: 'center' }}>Vote</th>
                  </tr>
                </thead>
                <tbody>
                  {voting.notable_votes.map((v, i) => (
                    <tr key={i}>
                      <td className="cv-vote-title">{v.title}</td>
                      <td className="cv-vote-date">{formatDate(v.date)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <VoteBadge vote={v.voted} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="cv-pending-card">
            <FileText size={24} />
            <p>Notable votes data pending. Full voting record available on Parliament.uk.</p>
            {mp.parliament_id && (
              <a
                href={`https://members.parliament.uk/member/${mp.parliament_id}/voting`}
                target="_blank"
                rel="noopener noreferrer"
                className="cv-parliament-link"
              >
                <ExternalLink size={14} />
                View voting record
              </a>
            )}
          </div>
        )}
      </section>

      {/* ================================================================ */}
      {/* 4. Parliamentary Activity Section                                */}
      {/* ================================================================ */}
      <section id="cv-activity" className="cv-section">
        <h2><MessageSquare size={20} /> Parliamentary Activity</h2>
        <p className="cv-section-desc">
          Questions, motions, and engagement metrics for {mp.name || 'this MP'} since election.
        </p>

        <div className="cv-activity-grid">
          <div className="cv-activity-card">
            <span className="cv-activity-count">{activity.written_questions ?? '-'}</span>
            <span className="cv-activity-label">Written Questions</span>
          </div>
          <div className="cv-activity-card">
            <span className="cv-activity-count">{activity.oral_questions ?? '-'}</span>
            <span className="cv-activity-label">Oral Questions</span>
          </div>
          <div className="cv-activity-card">
            <span className="cv-activity-count">{activity.edms_sponsored ?? '-'}</span>
            <span className="cv-activity-label">EDMs Sponsored</span>
          </div>
          <div className="cv-activity-card">
            <span className="cv-activity-count">{activity.edms_signed ?? '-'}</span>
            <span className="cv-activity-label">EDMs Signed</span>
          </div>
        </div>

        {activity.top_topics?.length > 0 && (
          <div className="cv-chart-card">
            <h3><Tag size={16} /> Top Question Topics</h3>
            <div className="cv-topic-tags">
              {activity.top_topics.map((topic, i) => (
                <span key={i} className="cv-topic-tag">
                  {typeof topic === 'string' ? topic : topic.department}
                  {topic.count != null && <span className="cv-topic-count">{topic.count}</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="cv-activity-hint">
          Data sourced from written and oral parliamentary questions tabled since the MP's election.
        </div>
      </section>

      {/* ================================================================ */}
      {/* 5. Expenses Section                                              */}
      {/* ================================================================ */}
      <section id="cv-expenses" className="cv-section">
        <h2><PoundSterling size={20} /> Expenses</h2>
        <p className="cv-section-desc">
          IPSA expenses data for {mp.name || 'this MP'}{expenses.year ? ` (${expenses.year})` : ''}.
        </p>

        {expenses.total_claimed != null ? (
          <>
            <div className="cv-expenses-summary">
              <StatBox label="Total Claimed" value={formatMoney(expenses.total_claimed)} />
              <StatBox label="Salary" value={expenses.salary ? formatMoneyWhole(expenses.salary) : '-'} />
              <StatBox
                label="Total Cost to Taxpayer"
                value={formatMoney(expenses.total_cost_to_taxpayer)}
              />
              <StatBox
                label="Rank"
                value={expenses.rank_of_650 ? `${expenses.rank_of_650} / 650` : '-'}
                sub="MPs ranked by total claimed"
              />
            </div>

            {expensesChartData.length > 0 && (
              <div className="cv-chart-card">
                <h3>Expenses Breakdown</h3>
                <ResponsiveContainer width="100%" height={expensesChartData.length * 55 + 30}>
                  <BarChart data={expensesChartData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" horizontal={false} />
                    <XAxis
                      type="number" tick={{ fill: '#8e8e93', fontSize: 12 }}
                      tickFormatter={v => `£${(v / 1000).toFixed(0)}k`}
                    />
                    <YAxis type="category" dataKey="category" width={120} tick={{ fill: '#e5e5e7', fontSize: 12 }} />
                    <Tooltip content={ExpensesTooltip} />
                    <Bar dataKey="amount" fill="#0a84ff" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        ) : (
          <div className="cv-pending-card">
            <PoundSterling size={24} />
            <p>Expenses data not yet available for this MP.</p>
          </div>
        )}
      </section>

      {/* ================================================================ */}
      {/* 6. Claimant Count Section                                        */}
      {/* ================================================================ */}
      <section id="cv-claimants" className="cv-section">
        <h2><TrendingDown size={20} /> Claimant Count</h2>
        <p className="cv-section-desc">
          Monthly DWP Claimant Count (JSA + Universal Credit) for {constituency.name} constituency.
        </p>

        {claimantChartData.length > 0 ? (
          <>
            {latestClaimant && (
              <div className="cv-claimant-latest">
                <div className="cv-claimant-latest-value">
                  <span className="cv-claimant-count">{formatNumber(latestClaimant.claimant_count)}</span>
                  <span className="cv-claimant-month">{latestClaimant.month}</span>
                </div>
                {latestClaimant.claimant_rate_pct != null && (
                  <div className="cv-claimant-rate-badge">
                    {formatPercent(latestClaimant.claimant_rate_pct)} rate
                  </div>
                )}
              </div>
            )}

            <div className="cv-chart-card">
              <h3>Monthly Claimant Count Trend</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={claimantChartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2e" />
                  <XAxis
                    dataKey="fullLabel" tick={{ fill: '#8e8e93', fontSize: 11 }}
                    angle={-45} textAnchor="end" height={60}
                    interval={Math.max(0, Math.floor(claimantChartData.length / 8) - 1)}
                  />
                  <YAxis tick={{ fill: '#8e8e93', fontSize: 12 }} tickFormatter={v => formatNumber(v)} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload
                    return (
                      <div style={TOOLTIP_STYLE}>
                        <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#fff' }}>{d.fullLabel}</p>
                        <p style={{ margin: '2px 0', color: '#0a84ff', fontSize: '13px' }}>
                          Claimants: {formatNumber(d.count)}
                        </p>
                        {d.rate != null && (
                          <p style={{ margin: '2px 0', color: '#ff9f0a', fontSize: '13px' }}>
                            Rate: {formatPercent(d.rate)}
                          </p>
                        )}
                      </div>
                    )
                  }} />
                  <Line
                    type="monotone" dataKey="count" stroke="#0a84ff"
                    strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#0a84ff' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div className="cv-pending-card">
            <TrendingDown size={24} />
            <p>Claimant count data not yet available for this constituency.</p>
          </div>
        )}
      </section>

      {/* ================================================================ */}
      {/* 7. Local Councils Section                                        */}
      {/* ================================================================ */}
      <section id="cv-councils" className="cv-section">
        <h2><Building size={20} /> Local Councils</h2>
        <p className="cv-section-desc">
          Local authorities that overlap with the {constituency.name} parliamentary constituency.
        </p>

        {constituency.overlapping_councils?.length > 0 ? (
          <div className="cv-councils-grid">
            {constituency.overlapping_councils.map(councilId => {
              const slug = COUNCIL_SLUG_MAP[councilId]
              const name = COUNCIL_NAMES[councilId] || councilId
              return (
                <a
                  key={councilId}
                  href={slug ? `https://aidoge.co.uk/lancashire/${slug}/` : '#'}
                  className="cv-council-card"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Building size={20} />
                  <div className="cv-council-card-info">
                    <span className="cv-council-card-name">{name}</span>
                    <span className="cv-council-card-sub">View on AI DOGE</span>
                  </div>
                  <ExternalLink size={14} className="cv-council-card-arrow" />
                </a>
              )
            })}
          </div>
        ) : (
          <div className="cv-pending-card">
            <Building size={24} />
            <p>No overlapping council data available.</p>
          </div>
        )}
      </section>

      {/* ================================================================ */}
      {/* 8. Data Sources Section                                          */}
      {/* ================================================================ */}
      <section id="cv-sources" className="cv-section">
        <h2><Database size={20} /> Data Sources</h2>
        <p className="cv-section-desc">
          All data on this page is sourced from official public APIs and datasets.
        </p>

        <div className="cv-sources-list">
          <div className="cv-source-item">
            <div className="cv-source-badge parliament">Parliament API</div>
            <div className="cv-source-detail">
              <strong>UK Parliament Members API</strong>
              <span>MP details, photo, voting record, parliamentary questions, EDMs</span>
              <a href="https://members-api.parliament.uk" target="_blank" rel="noopener noreferrer">
                members-api.parliament.uk <ExternalLink size={12} />
              </a>
            </div>
          </div>
          <div className="cv-source-item">
            <div className="cv-source-badge ipsa">IPSA</div>
            <div className="cv-source-detail">
              <strong>Independent Parliamentary Standards Authority</strong>
              <span>MP expenses claims, salary, staffing costs, accommodation</span>
              <a href="https://www.theipsa.org.uk" target="_blank" rel="noopener noreferrer">
                theipsa.org.uk <ExternalLink size={12} />
              </a>
            </div>
          </div>
          <div className="cv-source-item">
            <div className="cv-source-badge nomis">Nomis / DWP</div>
            <div className="cv-source-detail">
              <strong>ONS Nomis - Official Labour Market Statistics</strong>
              <span>Claimant Count (JSA + UC) by parliamentary constituency</span>
              <a href="https://www.nomisweb.co.uk" target="_blank" rel="noopener noreferrer">
                nomisweb.co.uk <ExternalLink size={12} />
              </a>
            </div>
          </div>
          <div className="cv-source-item">
            <div className="cv-source-badge election">Electoral Commission</div>
            <div className="cv-source-detail">
              <strong>General Election 2024 Results</strong>
              <span>Candidate votes, turnout, electorate data</span>
              <a href="https://www.electoralcommission.org.uk" target="_blank" rel="noopener noreferrer">
                electoralcommission.org.uk <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>

        <div className="cv-sources-note">
          Data compiled by AI DOGE from official sources. Last updated with available data as of February 2026.
          Election results are from the 4 July 2024 general election. Expenses data is from IPSA published figures.
          Claimant count data is from ONS Nomis (Jobseekers Allowance + Universal Credit).
        </div>
      </section>
    </div>
  )
}
