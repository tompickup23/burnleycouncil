import { useState, useEffect, useMemo } from 'react'
import { Search, User, Mail, Phone, MapPin, ChevronDown, ChevronUp, ExternalLink, FileText } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import { TOOLTIP_STYLE } from '../utils/constants'
import './Politics.css'

const ATTENDANCE_COLORS = { good: '#30d158', amber: '#ff9f0a', poor: '#ff453a' }
function attendanceColor(rate) {
  if (rate >= 0.85) return ATTENDANCE_COLORS.good
  if (rate >= 0.70) return ATTENDANCE_COLORS.amber
  return ATTENDANCE_COLORS.poor
}

function Politics() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const { data, loading, error } = useData([
    '/data/councillors.json',
    '/data/politics_summary.json',
    '/data/wards.json',
  ])
  const [councillors, summary, _wards] = data || [[], null, {}]

  // Optional voting/attendance data — separate fetch so failure doesn't block page
  // Always call useData (React hooks rule) but use a path that won't exist when feature disabled
  const hasVotingConfig = config?.data_sources?.voting_records
  const votingUrl = hasVotingConfig ? '/data/voting.json' : '/data/__noop__.json'
  const { data: votingData } = useData(votingUrl)

  const [search, setSearch] = useState('')
  const [partyFilter, setPartyFilter] = useState('')
  const [selectedCouncillor, setSelectedCouncillor] = useState(null)
  const [expandedVote, setExpandedVote] = useState(null)

  useEffect(() => {
    document.title = `Council Politics | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  // Attendance lookup by UID
  const attendanceByUid = useMemo(() => {
    if (!votingData?.attendance?.councillors) return {}
    const map = {}
    for (const rec of votingData.attendance.councillors) {
      if (rec.uid) map[rec.uid] = rec
    }
    return map
  }, [votingData])

  // Party colors for attendance chart
  const partyColorMap = useMemo(() => {
    const map = {}
    if (summary?.by_party) {
      for (const p of summary.by_party) {
        map[p.party] = p.color
      }
    }
    return map
  }, [summary])

  // Attendance chart data by party
  const attendanceChartData = useMemo(() => {
    if (!votingData?.attendance?.by_party) return []
    return Object.entries(votingData.attendance.by_party)
      .map(([party, d]) => ({
        party: party.length > 18 ? party.substring(0, 16) + '…' : party,
        fullParty: party,
        rate: Math.round(d.avg_attendance_rate * 100),
        count: d.count,
        color: partyColorMap[party] || '#666',
      }))
      .sort((a, b) => b.rate - a.rate)
  }, [votingData, partyColorMap])

  // Council-wide average attendance
  const avgAttendance = useMemo(() => {
    if (!votingData?.attendance?.councillors?.length) return null
    const rates = votingData.attendance.councillors.map(c => c.attendance_rate)
    return Math.round((rates.reduce((s, r) => s + r, 0) / rates.length) * 100)
  }, [votingData])

  // Best/worst attendees
  const bestAttendee = useMemo(() => {
    if (!votingData?.attendance?.councillors?.length) return null
    const sorted = [...votingData.attendance.councillors]
      .filter(c => c.expected >= 3)
      .sort((a, b) => b.attendance_rate - a.attendance_rate)
    return sorted[0] || null
  }, [votingData])

  const worstAttendee = useMemo(() => {
    if (!votingData?.attendance?.councillors?.length) return null
    const sorted = [...votingData.attendance.councillors]
      .filter(c => c.expected >= 3)
      .sort((a, b) => a.attendance_rate - b.attendance_rate)
    return sorted[0] || null
  }, [votingData])

  // Sorted votes: budget first, then by date
  const sortedVotes = useMemo(() => {
    if (!votingData?.votes?.length) return []
    return [...votingData.votes].sort((a, b) => {
      if (a.type === 'budget' && b.type !== 'budget') return -1
      if (b.type === 'budget' && a.type !== 'budget') return 1
      return (b.meeting_date || '').localeCompare(a.meeting_date || '')
    })
  }, [votingData])

  // Section nav items
  const navSections = useMemo(() => {
    const items = [
      { id: 'composition', label: 'Composition', always: true },
    ]
    if (summary?.opposition_groups?.length) {
      items.push({ id: 'opposition', label: 'Opposition Groups', always: false })
    }
    if (votingData?.attendance?.councillors?.length) {
      items.push({ id: 'attendance', label: 'Attendance', always: false })
    }
    if (votingData?.votes?.length) {
      items.push({ id: 'votes', label: 'Recorded Votes', always: false })
    }
    items.push({ id: 'councillors', label: 'Councillors', always: true })
    return items
  }, [summary, votingData])

  if (loading) {
    return <LoadingState message="Loading councillor data..." />
  }

  if (error) {
    return (
      <div className="page-error">
        <h2>Unable to load data</h2>
        <p>Please try refreshing the page.</p>
      </div>
    )
  }

  // Filter councillors
  const filteredCouncillors = councillors.filter(c => {
    const matchesSearch = !search ||
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.ward?.toLowerCase().includes(search.toLowerCase())
    const matchesParty = !partyFilter || c.party === partyFilter
    return matchesSearch && matchesParty
  })

  // Group by party for seat diagram
  const seatsByParty = summary?.by_party || []

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="politics-page animate-fade-in">
      <header className="page-header" aria-label="Council politics overview">
        <h1>Council Politics</h1>
        <p className="subtitle">
          {councillors.length} councillors representing {summary?.total_wards || ''} wards across {councilName}
        </p>
      </header>

      {/* Section Navigation */}
      {navSections.length > 2 && (
        <nav className="section-nav" aria-label="Page sections">
          {navSections.map(s => (
            <button key={s.id} className="section-nav-pill" onClick={() => scrollTo(s.id)}>
              {s.label}
            </button>
          ))}
        </nav>
      )}

      {/* Council Composition — data-driven from politics_summary.json */}
      {summary?.coalition && (
        <section id="composition" className="composition-section">
          <h2>Council Composition</h2>
          <div className="composition-grid">
            <div className="composition-card coalition">
              <h3>{summary.coalition.type === 'majority' ? 'Ruling Party' : 'Ruling Coalition'}</h3>
              <div className="coalition-makeup">
                <span className="coalition-total">{summary.coalition.total_seats}</span>
                <span className="coalition-label">seats</span>
              </div>
              <div className="coalition-parties">
                {(summary.coalition.parties || []).map(partyName => {
                  const partyData = seatsByParty.find(p => p.party === partyName)
                  if (!partyData) return null
                  const isLight = partyData.color?.toLowerCase() === '#faa61a' || partyData.color?.toLowerCase() === '#ffd60a'
                  return (
                    <span key={partyName} className="party-chip" style={{ background: partyData.color, color: isLight ? '#000' : undefined }}>
                      {partyName} {partyData.count}
                    </span>
                  )
                })}
              </div>
              <p className="coalition-note text-secondary">
                Majority threshold: {summary.majority_threshold || Math.floor((summary.total_councillors || 0) / 2) + 1} seats
              </p>
            </div>

            <div className="composition-card">
              <h3>Opposition</h3>
              <div className="opposition-makeup">
                <span className="opposition-total">{summary.opposition_seats}</span>
                <span className="opposition-label">seats</span>
              </div>
              <div className="opposition-parties">
                {seatsByParty
                  .filter(p => !(summary.coalition.parties || []).includes(p.party))
                  .map(partyData => {
                    const isLight = partyData.color?.toLowerCase() === '#faa61a' || partyData.color?.toLowerCase() === '#ffd60a'
                    return (
                      <span key={partyData.party} className="party-chip" style={{ background: partyData.color, color: isLight ? '#000' : undefined }}>
                        {partyData.party} {partyData.count}
                      </span>
                    )
                  })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Seat Diagram */}
      <section className="seats-section">
        <h2>Seat Diagram</h2>
        <div className="seats-diagram">
          {seatsByParty.map(party => (
            <div key={party.party} className="party-seats">
              <div className="seats-row">
                {Array.from({ length: party.count }).map((_, i) => (
                  <div
                    key={i}
                    className="seat"
                    style={{ background: party.color }}
                    title={party.party}
                  />
                ))}
              </div>
              <span className="party-label" style={{ color: party.color }}>
                {party.party} ({party.count})
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Key Figures */}
      <section className="key-figures">
        <h2>Key Figures</h2>
        <div className="figures-grid">
          {summary?.council_leader && (
            <div className="figure-card">
              <span className="figure-role">Leader of the Council</span>
              <span className="figure-name">{summary.council_leader}</span>
            </div>
          )}
          {summary?.deputy_leaders?.length > 0 && summary.deputy_leaders.map((dl, i) => (
            <div key={i} className="figure-card">
              <span className="figure-role">Deputy Leader</span>
              <span className="figure-name">{dl}</span>
            </div>
          ))}
          {summary?.mayor && (
            <div className="figure-card">
              <span className="figure-role">Mayor</span>
              <span className="figure-name">{summary.mayor}</span>
            </div>
          )}
          {summary?.deputy_mayor && (
            <div className="figure-card">
              <span className="figure-role">Deputy Mayor</span>
              <span className="figure-name">{summary.deputy_mayor}</span>
            </div>
          )}
          {summary?.opposition_leader && (
            <div className="figure-card">
              <span className="figure-role">Opposition Leader</span>
              <span className="figure-name">{summary.opposition_leader}</span>
            </div>
          )}
        </div>
      </section>

      {/* Opposition Groups */}
      {summary?.opposition_groups?.length > 0 && (
        <section id="opposition" className="opposition-section">
          <h2>Opposition Groups</h2>
          <div className="opposition-groups-grid">
            {summary.opposition_groups.map(group => (
              <div key={group.name} className="opposition-group-card" style={{ borderLeftColor: group.color }}>
                <div className="group-header">
                  <h3>{group.name}</h3>
                  <span className="group-seats-badge" style={{ background: group.color }}>
                    {group.seats} seat{group.seats !== 1 ? 's' : ''}
                  </span>
                </div>
                {group.leader && (
                  <div className="group-leader">
                    <span className="leader-badge">Leader</span>
                    <span className="leader-name">{group.leader}</span>
                    {group.leader_ward && <span className="leader-ward">{group.leader_ward}</span>}
                  </div>
                )}
                {group.deputy_leader && (
                  <div className="group-leader">
                    <span className="deputy-badge">Deputy</span>
                    <span className="leader-name">{group.deputy_leader}</span>
                    {group.deputy_leader_ward && <span className="leader-ward">{group.deputy_leader_ward}</span>}
                  </div>
                )}
                {group.composition?.length > 1 && (
                  <div className="group-composition">
                    {group.composition.map(c => (
                      <span key={c.party} className="comp-chip">
                        {c.count} {c.party}
                      </span>
                    ))}
                  </div>
                )}
                {group.formal_opposition && (
                  <span className="formal-opp-badge">Official Opposition</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Attendance Dashboard */}
      {votingData?.attendance?.councillors?.length > 0 && (
        <section id="attendance" className="attendance-section">
          <h2>Attendance</h2>
          <p className="section-subtitle">{votingData.attendance.date_range}</p>

          <div className="attendance-stats">
            {avgAttendance !== null && (
              <div className="stat-card-mini">
                <span className="stat-value-mini" style={{ color: attendanceColor(avgAttendance / 100) }}>
                  {avgAttendance}%
                </span>
                <span className="stat-label-mini">Council Average</span>
              </div>
            )}
            {bestAttendee && (
              <div className="stat-card-mini">
                <span className="stat-value-mini" style={{ color: ATTENDANCE_COLORS.good }}>
                  {Math.round(bestAttendee.attendance_rate * 100)}%
                </span>
                <span className="stat-label-mini">Best: {bestAttendee.name?.replace(/^County Councillor\s*/i, '')}</span>
              </div>
            )}
            {worstAttendee && (
              <div className="stat-card-mini">
                <span className="stat-value-mini" style={{ color: ATTENDANCE_COLORS.poor }}>
                  {Math.round(worstAttendee.attendance_rate * 100)}%
                </span>
                <span className="stat-label-mini">Lowest: {worstAttendee.name?.replace(/^County Councillor\s*/i, '')}</span>
              </div>
            )}
            <div className="stat-card-mini">
              <span className="stat-value-mini">{votingData.attendance.councillors.length}</span>
              <span className="stat-label-mini">Councillors Tracked</span>
            </div>
          </div>

          {attendanceChartData.length > 0 && (
            <div className="attendance-chart-container">
              <h3>Average Attendance by Party</h3>
              <ResponsiveContainer width="100%" height={Math.max(200, attendanceChartData.length * 50)}>
                <BarChart data={attendanceChartData} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
                  <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="party" width={140} tick={{ fontSize: 12 }} />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value, name, props) => [`${value}% (${props.payload.count} members)`, props.payload.fullParty]}
                  />
                  <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                    {attendanceChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      )}

      {/* Recorded Votes */}
      {sortedVotes.length > 0 && (
        <section id="votes" className="votes-section">
          <h2>Recorded Votes</h2>
          <p className="section-subtitle">{sortedVotes.length} recorded divisions since 2015</p>

          <div className="votes-list">
            {sortedVotes.map(vote => {
              const isExpanded = expandedVote === vote.id
              return (
                <div key={vote.id} className={`vote-card ${vote.type === 'budget' ? 'vote-budget' : ''}`}>
                  <button
                    className="vote-card-header"
                    onClick={() => setExpandedVote(isExpanded ? null : vote.id)}
                    aria-expanded={isExpanded}
                  >
                    <div className="vote-meta">
                      {vote.type === 'budget' && <span className="budget-badge">Budget</span>}
                      {vote.is_amendment && <span className="amendment-badge">Amendment{vote.amendment_by ? ` (${vote.amendment_by})` : ''}</span>}
                      {vote.significance === 'high' && <span className="significance-badge significance-high">Key Vote</span>}
                      <span className="vote-date">{vote.meeting_date}</span>
                    </div>
                    <h3 className="vote-title">{vote.title}</h3>
                    <div className="vote-summary">
                      <span className={`outcome-badge outcome-${vote.outcome}`}>
                        {vote.outcome === 'carried' ? 'Carried' : 'Rejected'}
                      </span>
                      <span className="vote-counts">
                        <span className="count-for">{vote.for_count} For</span>
                        <span className="count-against">{vote.against_count} Against</span>
                        {vote.abstain_count > 0 && <span className="count-abstain">{vote.abstain_count} Abstain</span>}
                      </span>
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="vote-detail">
                      <p className="vote-meeting">{vote.meeting}</p>

                      {/* Description */}
                      {vote.description && (
                        <p className="vote-description">{vote.description}</p>
                      )}

                      {/* Policy tags + council tax + proposer */}
                      <div className="vote-enrichment">
                        {vote.policy_area?.length > 0 && (
                          <div className="policy-tags">
                            {vote.policy_area.map(tag => (
                              <span key={tag} className="policy-tag">{tag.replace(/_/g, ' ')}</span>
                            ))}
                          </div>
                        )}
                        {vote.council_tax_change && (
                          <div className="council-tax-change">
                            <strong>Council Tax:</strong> {vote.council_tax_change}
                          </div>
                        )}
                        {(vote.proposer || vote.seconder) && (
                          <div className="vote-proposers">
                            {vote.proposer && <span><strong>Proposed by:</strong> {vote.proposer}</span>}
                            {vote.seconder && <span><strong>Seconded by:</strong> {vote.seconder}</span>}
                          </div>
                        )}
                      </div>

                      {/* Key facts */}
                      {vote.key_facts?.length > 0 && (
                        <div className="vote-key-facts">
                          <h4>Key Facts</h4>
                          <ul>
                            {vote.key_facts.map((fact, i) => (
                              <li key={i}>{fact}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Party breakdown */}
                      {Object.keys(vote.votes_by_party || {}).length > 0 && (
                        <div className="party-vote-breakdown">
                          <h4>Votes by Party</h4>
                          <table className="party-vote-table">
                            <thead>
                              <tr>
                                <th>Party</th>
                                <th>For</th>
                                <th>Against</th>
                                <th>Abstain</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(vote.votes_by_party)
                                .filter(([party]) => party !== 'Unknown')
                                .sort(([, a], [, b]) => (b.for + b.against + b.abstain) - (a.for + a.against + a.abstain))
                                .map(([party, counts]) => (
                                  <tr key={party}>
                                    <td>{party}</td>
                                    <td className="count-for">{counts.for || 0}</td>
                                    <td className="count-against">{counts.against || 0}</td>
                                    <td className="count-abstain">{counts.abstain || 0}</td>
                                  </tr>
                                ))
                              }
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Individual councillor votes */}
                      {vote.votes_by_councillor?.length > 0 && (
                        <details className="individual-votes">
                          <summary>{vote.votes_by_councillor.length} individual votes</summary>
                          <div className="individual-votes-grid">
                            {vote.votes_by_councillor.map((cv, i) => (
                              <span key={i} className={`individual-vote vote-${cv.vote}`}>
                                {cv.name?.replace(/^County Councillor\s*/i, '')}
                              </span>
                            ))}
                          </div>
                        </details>
                      )}

                      {/* Minutes link */}
                      {vote.minutes_url && (
                        <a href={vote.minutes_url} target="_blank" rel="noopener noreferrer" className="vote-minutes-link">
                          <FileText size={14} /> View meeting minutes
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Councillor Directory */}
      <section id="councillors" className="directory-section">
        <h2>All Councillors</h2>

        <div className="directory-filters">
          <div className="search-bar">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search by name or ward..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search councillors by name or ward"
            />
          </div>

          <select
            value={partyFilter}
            onChange={(e) => setPartyFilter(e.target.value)}
            aria-label="Filter by political party"
          >
            <option value="">All Parties</option>
            {seatsByParty.map(p => (
              <option key={p.party} value={p.party}>{p.party}</option>
            ))}
          </select>
        </div>

        <div className="councillors-grid">
          {filteredCouncillors.map(councillor => {
            const att = attendanceByUid[councillor.moderngov_uid]
            return (
              <div
                key={councillor.id}
                className="councillor-card"
                role="button"
                tabIndex={0}
                aria-expanded={selectedCouncillor?.id === councillor.id}
                onClick={() => setSelectedCouncillor(selectedCouncillor?.id === councillor.id ? null : councillor)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedCouncillor(selectedCouncillor?.id === councillor.id ? null : councillor) } }}
              >
                <div className="councillor-header">
                  <div
                    className="party-indicator"
                    style={{ background: councillor.party_color }}
                  />
                  <div className="councillor-info">
                    <h3>
                      {councillor.name}
                      {councillor.group_role && (
                        <span className={`group-role-badge ${councillor.group_role}`}>
                          {councillor.group_role === 'leader' ? 'Group Leader' : 'Deputy Leader'}
                        </span>
                      )}
                    </h3>
                    <span className="ward-name">{councillor.ward}</span>
                  </div>
                </div>

                <div className="councillor-badges">
                  <span className="party-tag" style={{ background: councillor.party_color + '30', color: councillor.party_color }}>
                    {councillor.party}
                  </span>
                  {att && (
                    <span className="attendance-badge" style={{ background: attendanceColor(att.attendance_rate) + '25', color: attendanceColor(att.attendance_rate) }}>
                      {Math.round(att.attendance_rate * 100)}% attendance
                    </span>
                  )}
                  {councillor.dual_hatted?.length > 0 && (
                    <span className="dual-hatted-badge" title={`Also serves on ${councillor.dual_hatted.join(', ')}`}>
                      Dual-hatted
                    </span>
                  )}
                </div>

                {councillor.roles?.length > 0 && (
                  <div className="councillor-roles">
                    {councillor.roles.slice(0, 3).map((role, i) => (
                      <span key={i} className="role-tag">{role}</span>
                    ))}
                    {councillor.roles.length > 3 && (
                      <span className="role-tag role-more">+{councillor.roles.length - 3} more</span>
                    )}
                  </div>
                )}

                {selectedCouncillor?.id === councillor.id && (
                  <div className="councillor-details">
                    {councillor.email && (
                      <a href={`mailto:${councillor.email}`} className="detail-link">
                        <Mail size={14} />
                        {councillor.email}
                      </a>
                    )}
                    {councillor.phone && (
                      <a href={`tel:${councillor.phone}`} className="detail-link">
                        <Phone size={14} />
                        {councillor.phone}
                      </a>
                    )}
                    {councillor.notable?.length > 0 && (
                      <div className="councillor-notable">
                        {councillor.notable.map((fact, i) => (
                          <p key={i} className="notable-fact">{fact}</p>
                        ))}
                      </div>
                    )}
                    {councillor.roles?.length > 3 && (
                      <div className="councillor-all-roles">
                        <strong>All committee roles:</strong>
                        {councillor.roles.map((role, i) => (
                          <span key={i} className="role-tag">{role}</span>
                        ))}
                      </div>
                    )}
                    {att && (
                      <div className="councillor-attendance-detail">
                        <strong>Attendance:</strong> {att.present} present out of {att.expected} expected ({Math.round(att.attendance_rate * 100)}%)
                        {att.present_virtual > 0 && ` • ${att.present_virtual} virtual`}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {filteredCouncillors.length === 0 && (
          <p className="no-results">No councillors found matching your search.</p>
        )}
      </section>
    </div>
  )
}

export default Politics
