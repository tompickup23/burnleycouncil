import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useData } from '../hooks/useData'
import {
  buildCouncillorDossier,
  predictBehaviour,
  findCommitteeForMeeting,
  buildMeetingBriefing,
  getTopicAttackLines,
  buildReformDefenceLines,
  generatePrintBriefing,
  PARTY_ATTACK_DATABASE,
  REFORM_REBUTTALS,
  POLICY_AREAS,
  cleanCouncillorName,
} from '../utils/intelligenceEngine'
import { LoadingState } from '../components/ui'
import CouncillorLink from '../components/CouncillorLink'
import { slugify } from '../utils/format'
import {
  Shield, AlertTriangle, ChevronDown, ChevronRight,
  Users, Target, FileText, Lock, Printer, Eye, Copy, Check,
  Calendar, MapPin, Star, Search, ArrowLeft, Swords, Award,
  BarChart3, BookOpen, UserCheck, AlertCircle, ExternalLink, Gavel,
} from 'lucide-react'
import { PARTY_COLORS, TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE } from '../utils/constants'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
import MeetingMode from '../components/intelligence/MeetingMode'
import './Intelligence.css'

const SEVERITY_COLORS = { high: '#ff453a', medium: '#ff9f0a', low: '#8e8e93' }
const RISK_COLORS = { high: '#ff453a', elevated: '#ff9f0a', medium: '#ffd60a', low: '#30d158' }

// Section definitions — labels are set dynamically below based on the ruling party
const BASE_SECTIONS = [
  { id: 'warRoom', label: 'Briefing Room', icon: Swords },
  { id: 'decisions', label: 'Decisions', icon: Gavel },
  { id: 'profiles', label: 'Opposition', icon: Users },
  { id: 'dossier', label: 'Dossier', icon: FileText },
  { id: 'rulingRecord', label: 'Our Record', icon: Award },
]

// ============================================================================
// Sub-components
// ============================================================================

function SectionNav({ activeSection, onSelect, sections }) {
  return (
    <nav className="intel-section-nav" aria-label="Intelligence sections">
      {sections.map(s => (
        <button
          key={s.id}
          className={`intel-nav-btn ${activeSection === s.id ? 'active' : ''}`}
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
    <span className="intel-party-badge" style={{ background: PARTY_COLORS[party] || '#888' }}>
      {party}
    </span>
  )
}

function RiskBadge({ level }) {
  if (!level) return null
  return (
    <span className="intel-risk-badge" style={{
      background: (RISK_COLORS[level] || '#888') + '22',
      color: RISK_COLORS[level] || '#888',
    }}>
      {level}
    </span>
  )
}

function SeverityBadge({ severity }) {
  return (
    <span className="intel-severity-dot" style={{ background: SEVERITY_COLORS[severity] || '#888' }} />
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)
  useEffect(() => () => clearTimeout(timerRef.current), [])
  const handleCopy = (e) => {
    e.stopPropagation()
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button className="intel-copy-btn" onClick={handleCopy} title="Copy to clipboard">
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  )
}

function BriefingNote({ line }) {
  return (
    <div className="intel-attack-line" style={{ borderLeftColor: SEVERITY_COLORS[line.severity] || '#888' }}>
      <div className="attack-line-content">
        <SeverityBadge severity={line.severity} />
        <span className="attack-line-text">{line.text}</span>
        <CopyButton text={line.text} />
      </div>
      {line.source && <div className="attack-line-source">{line.source}</div>}
    </div>
  )
}

function StandingOrdersPanel({ standingOrders, meetingType }) {
  const [expanded, setExpanded] = useState(false)
  if (!standingOrders) return null

  const isFullCouncil = meetingType === 'full_council'
  const tl = standingOrders.time_limits || {}
  const motions = standingOrders.motions || {}
  const debate = standingOrders.debate_rules || {}
  const voting = standingOrders.voting || {}
  const chair = standingOrders.chair_powers || {}

  return (
    <div className="intel-procedures-panel">
      <button
        className="procedures-toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <BookOpen size={14} />
        <span>Procedural Framework — Standing Orders</span>
      </button>
      {expanded && (
        <div className="procedures-content">
          {/* Time limits */}
          <div className="procedures-section">
            <h4>Time Limits</h4>
            <table className="procedures-table">
              <thead><tr><th>Segment</th><th>Limit</th><th>SO Ref</th><th>Notes</th></tr></thead>
              <tbody>
                {isFullCouncil && tl.public_question_time && (
                  <tr>
                    <td>Public Questions</td>
                    <td><strong>{tl.public_question_time.total_minutes} min</strong> (hard cap)</td>
                    <td>{tl.public_question_time.so}</td>
                    <td>No supplementaries. {tl.public_question_time.per_answer_minutes} min per answer</td>
                  </tr>
                )}
                {tl.member_question_time && (
                  <tr>
                    <td>Member Questions</td>
                    <td>Max {tl.member_question_time.max_questions_per_meeting} questions</td>
                    <td>{tl.member_question_time.so}</td>
                    <td>{tl.member_question_time.per_answer_minutes} min per answer. 1 supplementary each</td>
                  </tr>
                )}
                {isFullCouncil && tl.motion_debate && (
                  <>
                    <tr>
                      <td>Per-motion debate</td>
                      <td><strong>{tl.motion_debate.per_motion_minutes} min</strong></td>
                      <td>{tl.motion_debate.so}</td>
                      <td>Chair can extend</td>
                    </tr>
                    <tr>
                      <td>Total all motions</td>
                      <td><strong>{tl.motion_debate.total_all_motions_minutes} min</strong></td>
                      <td>{tl.motion_debate.so}</td>
                      <td>Motions not reached simply fall</td>
                    </tr>
                    <tr>
                      <td>Mover speech</td>
                      <td>{tl.motion_debate.mover_speech_minutes} min</td>
                      <td>{tl.motion_debate.so}</td>
                      <td>All other speeches: {tl.motion_debate.other_speech_minutes} min</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Tactical tools */}
          {standingOrders.tactical_summary && (
            <div className="procedures-section">
              <h4>Majority Tactical Tools</h4>
              <ul className="procedures-tools-list">
                {standingOrders.tactical_summary.majority_tools?.map((tool, i) => (
                  <li key={i}>{tool}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Key closure motions */}
          {debate.closure_motions?.options && (
            <div className="procedures-section">
              <h4>Closure Motions ({debate.closure_motions.so})</h4>
              <p className="procedures-note">Can only be moved by someone who has NOT spoken, moved, or seconded in the debate</p>
              <div className="closure-motions-grid">
                {debate.closure_motions.options.map((cm, i) => (
                  <div key={i} className="closure-motion-card">
                    <strong>"{cm.motion}"</strong>
                    <p>{cm.effect}</p>
                    {cm.tactical_note && <p className="closure-tactical">{cm.tactical_note}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Amendment rules */}
          {standingOrders.amendments?.general && (
            <div className="procedures-section">
              <h4>Amendment Rules ({standingOrders.amendments.general.so})</h4>
              <ul className="procedures-rules-list">
                <li>Max {standingOrders.amendments.general.max_per_member_per_motion} amendment per member per motion</li>
                <li>Cannot negate the motion</li>
                <li>Cannot introduce new topics</li>
                <li>Must be submitted in writing immediately</li>
                <li>Chair may reject on SO 34 grounds</li>
                {standingOrders.amendments.friendly && (
                  <li><strong>Friendly amendments ({standingOrders.amendments.friendly.so}):</strong> {standingOrders.amendments.friendly.rule}</li>
                )}
              </ul>
            </div>
          )}

          {/* Voting */}
          {voting.recorded_vote && (
            <div className="procedures-section">
              <h4>Voting ({voting.so})</h4>
              <ul className="procedures-rules-list">
                <li><strong>Recorded vote:</strong> {voting.recorded_vote.trigger}</li>
                <li>{voting.method}</li>
                <li>{voting.majority}</li>
                {voting.casting_vote && <li><strong>Casting vote:</strong> {voting.casting_vote.rules}</li>}
              </ul>
            </div>
          )}

          {/* Source */}
          {standingOrders.meta?.url && (
            <p className="procedures-source">
              Source: <a href={standingOrders.meta.url} target="_blank" rel="noopener noreferrer">
                {standingOrders.meta.source}
              </a>
              {standingOrders.meta.last_verified && ` (verified ${standingOrders.meta.last_verified})`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export default function Intelligence() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const dataSources = config.data_sources || {}

  // --- Required data ---
  const { data, loading, error } = useData([
    '/data/councillors.json',
    '/data/politics_summary.json',
    '/data/meetings.json',
  ])
  const [councillorsData, politicsSummary, meetingsData] = data || [null, null, null]

  // --- Optional data (graceful degradation) ---
  const { data: intelData } = useData([
    '/data/voting.json',
    '/data/integrity.json',
    '/data/register_of_interests.json',
    '/data/doge_findings.json',
    '/data/committees.json',
    '/data/reform_transformation.json',
    '/data/standing_orders.json',
  ])
  const [
    votingData, integrityData, interestsData,
    dogeFindings, committeesData, reformTransformation,
    standingOrdersData,
  ] = intelData || [null, null, null, null, null, null, null]

  // --- Ward-level data (for per-councillor counter-arguments) ---
  const { data: wardData } = useData([
    '/data/demographics.json', '/data/deprivation.json',
    '/data/economy.json', '/data/health.json', '/data/housing.json',
  ])
  const [demographicsData, deprivationData, economyData, healthData, housingData] = wardData || [null, null, null, null, null]

  // --- Council documents (LLM-extracted decisions) ---
  const { data: documentsData } = useData(
    dataSources.council_documents ? '/data/council_documents.json' : null
  )

  // --- State ---
  const [activeSection, setActiveSection] = useState('warRoom')
  const [selectedMeetingIdx, setSelectedMeetingIdx] = useState(null)
  const [expandedMembers, setExpandedMembers] = useState({})
  const [partyFilter, setPartyFilter] = useState('all')
  const [selectedCouncillor, setSelectedCouncillor] = useState(null)
  const [dossierTab, setDossierTab] = useState('profile')
  const [searchQuery, setSearchQuery] = useState('')
  const [decisionsCommitteeFilter, setDecisionsCommitteeFilter] = useState('all')
  const [decisionsTopicFilter, setDecisionsTopicFilter] = useState('all')
  const [expandedDecisions, setExpandedDecisions] = useState({})
  const [meetingMode, setMeetingMode] = useState(false)

  // --- Page title ---
  useEffect(() => {
    document.title = `Intelligence | ${councilName} Transparency`
    return () => { document.title = `${councilName} Transparency` }
  }, [councilName])

  // --- All data bundle for engine functions ---
  const allData = useMemo(() => ({
    councillors: councillorsData?.councillors || councillorsData || [],
    votingData,
    integrityData,
    interestsData,
    committeesData,
    politicsSummary,
    dogeFindings,
    reformTransformation,
    demographicsData,
    deprivationData,
    economyData,
    healthData,
    housingData,
    documentsData,
  }), [councillorsData, votingData, integrityData, interestsData, committeesData, politicsSummary, dogeFindings, reformTransformation, demographicsData, deprivationData, economyData, healthData, housingData, documentsData])

  // --- Derived: sorted meetings ---
  const sortedMeetings = useMemo(() => {
    const meetings = meetingsData?.meetings || []
    // Use start of today so meetings remain at the top until end of day
    // (e.g. Full Council at 2pm stays available even at 5pm)
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return [...meetings].sort((a, b) => {
      const da = new Date(a.date)
      const db = new Date(b.date)
      const aCurrentOrFuture = da >= todayStart
      const bCurrentOrFuture = db >= todayStart
      if (aCurrentOrFuture && !bCurrentOrFuture) return -1
      if (!aCurrentOrFuture && bCurrentOrFuture) return 1
      if (aCurrentOrFuture && bCurrentOrFuture) return da - db
      return db - da
    })
  }, [meetingsData])

  // Auto-select first upcoming meeting
  useEffect(() => {
    if (sortedMeetings.length > 0 && selectedMeetingIdx === null) {
      setSelectedMeetingIdx(0)
    }
  }, [sortedMeetings, selectedMeetingIdx])

  // --- Derived: selected meeting briefing ---
  const selectedMeeting = sortedMeetings[selectedMeetingIdx] || null
  const meetingBriefing = useMemo(() => {
    if (!selectedMeeting) return null
    return buildMeetingBriefing(selectedMeeting, allData)
  }, [selectedMeeting, allData])

  // --- Derived: ruling party (largest party by seats, from politics_summary) ---
  const rulingParty = useMemo(() => {
    if (!politicsSummary?.by_party?.length) return null
    // Largest party by seat count
    return [...politicsSummary.by_party].sort((a, b) => (b.count || 0) - (a.count || 0))[0]?.party || null
  }, [politicsSummary])

  // --- Derived: section labels (dynamic based on ruling party) ---
  const SECTIONS = useMemo(() => {
    return BASE_SECTIONS.map(s => {
      if (s.id === 'rulingRecord' && rulingParty) {
        return { ...s, label: `${rulingParty} Record` }
      }
      return s
    })
  }, [rulingParty])

  // --- Derived: opposition councillors ---
  const oppositionCouncillors = useMemo(() => {
    const councillors = allData.councillors || []
    if (!rulingParty) return councillors
    return councillors.filter(c => c.party && c.party !== rulingParty)
  }, [allData.councillors, rulingParty])

  // --- Derived: opposition parties for filter ---
  const oppositionParties = useMemo(() => {
    const parties = new Map()
    oppositionCouncillors.forEach(c => {
      parties.set(c.party, (parties.get(c.party) || 0) + 1)
    })
    return Array.from(parties.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([party, count]) => ({ party, count }))
  }, [oppositionCouncillors])

  // --- Derived: group leaders from politics_summary ---
  const groupLeaders = useMemo(() => {
    if (!politicsSummary?.opposition_groups) return []
    const leaders = []
    for (const g of politicsSummary.opposition_groups) {
      if (g.leader) leaders.push({ ...g.leader, groupRole: 'Leader', groupName: g.name, seats: g.seats })
      if (g.deputy_leader) leaders.push({ ...g.deputy_leader, groupRole: 'Deputy Leader', groupName: g.name, seats: g.seats })
    }
    return leaders
  }, [politicsSummary])

  // --- Derived: filtered opposition councillors ---
  const filteredOpposition = useMemo(() => {
    let list = oppositionCouncillors
    if (partyFilter !== 'all') {
      list = list.filter(c => c.party === partyFilter)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.party || '').toLowerCase().includes(q) ||
        (c.division || c.ward || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [oppositionCouncillors, partyFilter, searchQuery])

  // --- Derived: selected councillor dossier ---
  const selectedDossier = useMemo(() => {
    if (!selectedCouncillor) return null
    return buildCouncillorDossier(selectedCouncillor, allData)
  }, [selectedCouncillor, allData])

  // --- Handlers ---
  const toggleMember = (name) => {
    setExpandedMembers(prev => ({ ...prev, [name]: !prev[name] }))
  }

  const openDossier = useCallback((councillorName) => {
    setSelectedCouncillor(councillorName)
    setDossierTab('profile')
    setActiveSection('dossier')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handlePrintBriefing = useCallback(() => {
    if (!meetingBriefing) return
    const text = generatePrintBriefing(meetingBriefing)
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(`<html><head><title>Meeting Briefing</title>
        <style>body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.6; max-width: 800px; margin: 20px auto; white-space: pre-wrap; }</style>
        </head><body>${text.replace(/\n/g, '<br>')}</body></html>`)
      w.document.close()
      w.print()
    }
  }, [meetingBriefing])

  // --- Loading/error ---
  if (loading) return <LoadingState message="Loading intelligence data..." />

  if (error) {
    return (
      <div className="intel-page">
        <div className="intel-error">
          <AlertTriangle size={48} />
          <h2>Unable to load intelligence data</h2>
          <p>Councillor and meeting data is required for the intelligence engine.</p>
        </div>
      </div>
    )
  }

  // --- Render ---
  return (
    <div className="intel-page">
      <header className="intel-header">
        <div className="intel-header-top">
          <div>
            <h1><Shield size={28} /> {councilName} Intelligence</h1>
            <p className="intel-subtitle">
              Opposition analysis • {oppositionCouncillors.length} opposition councillors • {sortedMeetings.length} meetings tracked
            </p>
          </div>
        </div>
        <div className="intel-restricted-banner">
          <Lock size={14} /> Strategist access only — this page is not visible to viewers
        </div>
      </header>

      <SectionNav activeSection={activeSection} onSelect={setActiveSection} sections={SECTIONS} />

      {/* ================================================================ */}
      {/* SECTION A: MEETING BRIEFING ROOM / MEETING MODE */}
      {/* ================================================================ */}
      {activeSection === 'warRoom' && meetingMode && meetingBriefing && (
        <MeetingMode
          meetingBriefing={meetingBriefing}
          allData={allData}
          integrityData={integrityData}
          standingOrdersData={standingOrdersData}
          rulingParty={rulingParty}
          onExit={() => setMeetingMode(false)}
          onPrint={handlePrintBriefing}
        />
      )}
      {activeSection === 'warRoom' && !meetingMode && (
        <section className="intel-section">
          <h2><Swords size={20} /> Meeting Briefing Room</h2>
          <p className="intel-section-desc">
            Select a meeting to review attendees, view opposition profiles, and prepare briefing notes.
          </p>

          {/* Meeting selector */}
          <div className="intel-meeting-selector">
            <Calendar size={16} />
            <select
              value={selectedMeetingIdx ?? ''}
              onChange={e => {
                setSelectedMeetingIdx(Number(e.target.value))
                setExpandedMembers({})
              }}
              aria-label="Select meeting"
            >
              {sortedMeetings.map((m, i) => {
                const d = new Date(m.date)
                const now = new Date()
                const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                const tomorrowStart = new Date(todayStart.getTime() + 86400000)
                const isToday = d >= todayStart && d < tomorrowStart
                const isPast = d < todayStart
                const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                return (
                  <option key={i} value={i}>
                    {isToday ? '🔴 TODAY — ' : isPast ? '⏮ ' : '📅 '}{!isToday ? dateStr + ' — ' : ''}{m.committee || m.title}
                  </option>
                )
              })}
            </select>
            <button className="intel-print-btn" onClick={handlePrintBriefing} disabled={!meetingBriefing}>
              <Printer size={14} /> Print Briefing
            </button>
            <button className="intel-meeting-mode-btn" onClick={() => setMeetingMode(true)} disabled={!meetingBriefing}>
              <Swords size={14} /> Meeting Mode
            </button>
          </div>

          {/* Meeting details card */}
          {selectedMeeting && (
            <div className="intel-meeting-card">
              <div className="meeting-card-header">
                <h3>{selectedMeeting.committee || selectedMeeting.title}</h3>
                {meetingBriefing?.committee?.type && (
                  <span className="intel-committee-type-badge">
                    {meetingBriefing.committee.type}
                  </span>
                )}
              </div>
              <div className="meeting-card-meta">
                <span><Calendar size={14} /> {new Date(selectedMeeting.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                {selectedMeeting.time && <span>🕐 {selectedMeeting.time}</span>}
                {selectedMeeting.venue && <span><MapPin size={14} /> {selectedMeeting.venue}</span>}
              </div>
              {selectedMeeting.webcast_url && (
                <a href={selectedMeeting.webcast_url} target="_blank" rel="noopener noreferrer" className="meeting-link">
                  <ExternalLink size={14} /> View on ModernGov
                </a>
              )}

              {/* Agenda items */}
              {selectedMeeting.agenda_items?.length > 0 && (
                <div className="meeting-agenda">
                  <h4><BookOpen size={14} /> Agenda ({selectedMeeting.agenda_items.length} items)</h4>
                  <ul>
                    {selectedMeeting.agenda_items.map((item, i) => (
                      <li key={i}>{typeof item === 'string' ? item : item.title || item.name || JSON.stringify(item)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Standing Orders / Procedural Framework */}
          {selectedMeeting && (
            <StandingOrdersPanel
              standingOrders={standingOrdersData}
              meetingType={selectedMeeting.type}
            />
          )}

          {/* Committee members grid */}
          {meetingBriefing && (
            <div className="intel-members-section">
              <h3><Users size={16} /> Committee Members</h3>

              {/* Ruling party members */}
              {meetingBriefing.reformMembers?.length > 0 && (
                <div className="members-group">
                  <h4 className="members-group-label reform-label">
                    <UserCheck size={14} /> {rulingParty || 'Ruling Party'} ({meetingBriefing.reformMembers.length})
                  </h4>
                  <div className="members-grid">
                    {meetingBriefing.reformMembers.map((m, i) => (
                      <div key={i} className="member-card reform">
                        <span className="member-name">
                          <CouncillorLink name={m.name} councillorId={slugify(m.name)} integrityData={integrityData} compact />
                        </span>
                        <span className="member-role">{m.role || 'Member'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Opposition members */}
              {meetingBriefing.oppositionMembers?.length > 0 && (
                <div className="members-group">
                  <h4 className="members-group-label opposition-label">
                    <AlertCircle size={14} /> Opposition ({meetingBriefing.oppositionMembers.length})
                  </h4>
                  <div className="members-grid">
                    {meetingBriefing.oppositionMembers.map((m, i) => {
                      const isExpanded = !!expandedMembers[m.name]
                      const isLeader = groupLeaders.some(l => cleanCouncillorName(l.name) === cleanCouncillorName(m.name))
                      return (
                        <div key={i} className={`member-card opposition ${isExpanded ? 'expanded' : ''}`}>
                          <div
                            className="member-card-header"
                            onClick={() => toggleMember(m.name)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleMember(m.name)}
                          >
                            <div className="member-name-row">
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              <span className="member-name">
                                <CouncillorLink name={m.name} councillorId={slugify(m.name)} integrityData={integrityData} compact />
                              </span>
                              {isLeader && <Star size={12} className="leader-star" />}
                            </div>
                            <div className="member-meta">
                              <PartyBadge party={m.party} />
                              <span className="member-role">{m.role || 'Member'}</span>
                            </div>
                          </div>

                          {isExpanded && m.dossier && (
                            <div className="member-mini-dossier">
                              {m.prediction && (
                                <div className="mini-prediction">
                                  <span className={`prediction-badge ${m.prediction.likelyPosition}`}>
                                    {m.prediction.likelyPosition}
                                  </span>
                                  {m.prediction.likelyToSpeak && <span className="speaker-badge">Likely speaker</span>}
                                  <span className="prediction-confidence">{m.prediction.confidence} confidence</span>
                                </div>
                              )}
                              {m.dossier.integrityProfile?.riskLevel && (
                                <div className="mini-integrity">
                                  <RiskBadge level={m.dossier.integrityProfile.riskLevel} />
                                  {m.dossier.integrityProfile.redFlags?.length > 0 && (
                                    <span className="mini-red-flags">{m.dossier.integrityProfile.redFlags.length} red flags</span>
                                  )}
                                </div>
                              )}
                              {m.dossier.attackLines?.slice(0, 3).map((al, j) => (
                                <div key={j} className="mini-attack-line" style={{ borderLeftColor: SEVERITY_COLORS[al.severity] || '#888' }}>
                                  {al.text}
                                </div>
                              ))}
                              <button className="mini-dossier-btn" onClick={() => openDossier(m.name)}>
                                <Eye size={12} /> Full Dossier
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {!meetingBriefing.reformMembers?.length && !meetingBriefing.oppositionMembers?.length && (
                <p className="intel-empty-note">No committee membership data available. Run the committee ETL to populate.</p>
              )}
            </div>
          )}

          {/* Agenda intelligence */}
          {meetingBriefing?.agendaIntel?.length > 0 && (
            <div className="intel-agenda-section">
              <h3><BarChart3 size={16} /> Agenda Intelligence</h3>
              {meetingBriefing.agendaIntel.map((ai, i) => (
                <AgendaIntelCard key={i} intel={ai} />
              ))}
            </div>
          )}

          {/* Risk Assessment Banner */}
          {meetingBriefing?.riskAssessment && (
            <div className={`intel-risk-banner risk-${meetingBriefing.riskAssessment.level}`}>
              <div className="risk-banner-header">
                <Shield size={16} />
                <span className="risk-level-badge">{meetingBriefing.riskAssessment.level.toUpperCase()} RISK</span>
              </div>
              <div className="risk-banner-stats">
                <span>{meetingBriefing.riskAssessment.battlegroundCount} battleground item{meetingBriefing.riskAssessment.battlegroundCount !== 1 ? 's' : ''}</span>
                <span>{meetingBriefing.riskAssessment.oppositionSpeakers} likely speaker{meetingBriefing.riskAssessment.oppositionSpeakers !== 1 ? 's' : ''}</span>
                <span>{meetingBriefing.riskAssessment.likelyOpposers} likely opposer{meetingBriefing.riskAssessment.likelyOpposers !== 1 ? 's' : ''}</span>
                <span>{meetingBriefing.riskAssessment.politicalItems}/{meetingBriefing.riskAssessment.totalAgendaItems} political items</span>
              </div>
            </div>
          )}

          {/* Key battlegrounds */}
          {meetingBriefing?.keyBattlegrounds?.length > 0 && (
            <div className="intel-battlegrounds">
              <h3><Target size={16} /> Key Battlegrounds</h3>
              <div className="battleground-list">
                {meetingBriefing.keyBattlegrounds.map((bg, i) => (
                  <div key={i} className="battleground-card">
                    <h4>{bg.item}</h4>
                    <p>{bg.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scenario analysis — per-item opposition challenge scenarios and counter-arguments */}
          {meetingBriefing?.warGame?.length > 0 && (
            <div className="intel-wargame-section">
              <h3><Swords size={16} /> Scenario Analysis — Opposition Challenges &amp; Responses</h3>
              <p className="intel-section-desc">
                Modelled opposition challenges per agenda item with prepared counter-arguments and supporting data.
                These are data-informed projections, not certainties.
              </p>
              {meetingBriefing.warGame.map((wg, i) => (
                <WarGameCard key={i} warGame={wg} integrityData={integrityData} />
              ))}
            </div>
          )}

          {/* Documents */}
          {meetingBriefing?.meeting?.documents?.length > 0 && (
            <div className="intel-documents-section">
              <h3><BookOpen size={16} /> Meeting Documents</h3>
              <div className="documents-list">
                {meetingBriefing.meeting.documents.map((doc, i) => (
                  <div key={i} className="document-item">
                    <FileText size={14} />
                    {doc.url ? (
                      <a href={doc.url} target="_blank" rel="noopener noreferrer">{doc.title}</a>
                    ) : (
                      <span>{doc.title}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ================================================================ */}
      {/* SECTION: COUNCIL DECISIONS */}
      {/* ================================================================ */}
      {activeSection === 'decisions' && documentsData && (
        <section className="intel-section">
          <h2><Gavel size={20} /> Council Decisions</h2>
          <p className="intel-section-desc">
            {documentsData.decisions_count} decisions extracted from {documentsData.documents_count} council documents
            {documentsData.date_range && ` (${documentsData.date_range})`}
          </p>

          {/* Filters */}
          <div className="intel-decisions-filters">
            {documentsData.by_committee && Object.keys(documentsData.by_committee).length > 1 && (
              <select
                value={decisionsCommitteeFilter}
                onChange={e => setDecisionsCommitteeFilter(e.target.value)}
                className="intel-filter-select"
              >
                <option value="all">All committees</option>
                {Object.entries(documentsData.by_committee)
                  .sort((a, b) => b[1] - a[1])
                  .map(([committee, count]) => (
                    <option key={committee} value={committee}>{committee} ({count})</option>
                  ))}
              </select>
            )}
            <select
              value={decisionsTopicFilter}
              onChange={e => setDecisionsTopicFilter(e.target.value)}
              className="intel-filter-select"
            >
              <option value="all">All topics</option>
              {(() => {
                const topics = new Map()
                ;(documentsData.recent_decisions || []).forEach(d => {
                  ;(d.policy_areas || []).forEach(t => topics.set(t, (topics.get(t) || 0) + 1))
                })
                return [...topics.entries()].sort((a, b) => b[1] - a[1]).map(([topic, count]) => (
                  <option key={topic} value={topic}>{topic.replace(/_/g, ' ')} ({count})</option>
                ))
              })()}
            </select>
          </div>

          {/* Department breakdown */}
          {documentsData.by_department && Object.keys(documentsData.by_department).length > 0 && (
            <div className="intel-dept-breakdown">
              <h3>By Department</h3>
              <div className="dept-chips">
                {Object.entries(documentsData.by_department)
                  .sort((a, b) => b[1].count - a[1].count)
                  .slice(0, 10)
                  .map(([dept, info]) => (
                    <span key={dept} className="dept-chip">
                      {dept}: {info.count}
                      {info.total_value > 0 && ` (${(info.total_value >= 1e6 ? `£${(info.total_value / 1e6).toFixed(1)}M` : `£${(info.total_value / 1e3).toFixed(0)}K`)})`}
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Decision cards */}
          <div className="intel-decisions-list">
            {(documentsData.recent_decisions || [])
              .filter(d => decisionsCommitteeFilter === 'all' || d.committee === decisionsCommitteeFilter)
              .filter(d => decisionsTopicFilter === 'all' || (d.policy_areas || []).includes(decisionsTopicFilter))
              .map(d => {
                const isExpanded = !!expandedDecisions[d.decision_id]
                return (
                  <div key={d.decision_id} className={`intel-decision-card outcome-${d.outcome || 'unknown'}`}>
                    <div
                      className="decision-card-header"
                      onClick={() => setExpandedDecisions(prev => ({
                        ...prev, [d.decision_id]: !prev[d.decision_id]
                      }))}
                      role="button" tabIndex={0}
                      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setExpandedDecisions(prev => ({
                        ...prev, [d.decision_id]: !prev[d.decision_id]
                      }))}
                    >
                      <div className="decision-title-row">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span className="decision-title">{d.title}</span>
                        <span className={`decision-outcome-badge ${d.outcome || ''}`}>
                          {d.outcome || 'unknown'}
                        </span>
                      </div>
                      <div className="decision-meta">
                        <span><Calendar size={12} /> {d.date}</span>
                        <span>{d.committee}</span>
                        {d.department && <span>{d.department}</span>}
                        {d.financial_value != null && (
                          <span className="decision-financial">
                            £{d.financial_value >= 1e6 ? `${(d.financial_value / 1e6).toFixed(1)}M` : d.financial_value >= 1e3 ? `${(d.financial_value / 1e3).toFixed(0)}K` : d.financial_value.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="decision-detail">
                        {d.political_summary && (
                          <p className="decision-summary">{d.political_summary}</p>
                        )}

                        {/* Vote split */}
                        {(d.vote_for != null || d.vote_against != null) && (
                          <div className="decision-votes">
                            <span className="vote-for">{d.vote_for ?? 0} for</span>
                            <span className="vote-against">{d.vote_against ?? 0} against</span>
                            {d.vote_abstain > 0 && <span className="vote-abstain">{d.vote_abstain} abstained</span>}
                            {d.is_recorded_vote && <span className="recorded-vote-badge">Recorded vote</span>}
                          </div>
                        )}

                        {/* Key data points */}
                        {d.key_data_points?.length > 0 && (
                          <ul className="decision-key-facts">
                            {d.key_data_points.map((fact, j) => <li key={j}>{fact}</li>)}
                          </ul>
                        )}

                        {/* Policy area tags */}
                        {d.policy_areas?.length > 0 && (
                          <div className="decision-tags">
                            {d.policy_areas.map(t => (
                              <span key={t} className="decision-policy-tag">{t.replace(/_/g, ' ')}</span>
                            ))}
                          </div>
                        )}

                        {/* Motions */}
                        {d.motions?.length > 0 && (
                          <div className="decision-motions">
                            <h4>Motions</h4>
                            {d.motions.map((m, j) => (
                              <div key={j} className={`motion-item motion-${m.outcome || 'unknown'}`}>
                                <div className="motion-header">
                                  <span className={`motion-type-badge ${m.type}`}>{m.type}</span>
                                  <span className={`motion-outcome ${m.outcome}`}>{m.outcome}</span>
                                </div>
                                {m.proposer && <div className="motion-proposer">Proposed: {m.proposer}{m.seconder ? ` / Seconded: ${m.seconder}` : ''}</div>}
                                {m.text && <p className="motion-text">{m.text}</p>}
                                {(m.vote_for != null || m.vote_against != null) && (
                                  <div className="motion-votes">
                                    {m.vote_for != null && <span className="vote-for">{m.vote_for} for</span>}
                                    {m.vote_against != null && <span className="vote-against">{m.vote_against} against</span>}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {d.financial_context && (
                          <p className="decision-financial-context">{d.financial_context}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </section>
      )}

      {activeSection === 'decisions' && !documentsData && (
        <section className="intel-section">
          <h2><Gavel size={20} /> Council Decisions</h2>
          <p className="intel-empty-note">
            No council documents data available. Run the council_documents_etl.py pipeline to extract decisions from meeting minutes.
          </p>
        </section>
      )}

      {/* ================================================================ */}
      {/* SECTION B: OPPOSITION PROFILES */}
      {/* ================================================================ */}
      {activeSection === 'profiles' && (
        <section className="intel-section">
          <h2><Users size={20} /> Opposition Profiles</h2>
          <p className="intel-section-desc">
            {oppositionCouncillors.length} opposition councillors across {oppositionParties.length} parties/groups.
            Click any councillor to open their full dossier.
          </p>

          {/* Party filter tabs */}
          <div className="intel-party-filter">
            <button
              className={`party-filter-btn ${partyFilter === 'all' ? 'active' : ''}`}
              onClick={() => setPartyFilter('all')}
            >
              All ({oppositionCouncillors.length})
            </button>
            {oppositionParties.map(({ party, count }) => (
              <button
                key={party}
                className={`party-filter-btn ${partyFilter === party ? 'active' : ''}`}
                onClick={() => setPartyFilter(party)}
                style={partyFilter === party ? { borderColor: PARTY_COLORS[party] || '#888', color: PARTY_COLORS[party] || '#888' } : {}}
              >
                {party} ({count})
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="intel-search">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search by name, party, or ward..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Group leaders panel */}
          {partyFilter === 'all' && !searchQuery && groupLeaders.length > 0 && (
            <div className="intel-leaders-panel">
              <h3><Star size={16} /> Group Leaders & Deputies</h3>
              <div className="leaders-grid">
                {groupLeaders.map((leader, i) => {
                  const integrity = integrityData?.councillors?.find(c =>
                    cleanCouncillorName(c.name) === cleanCouncillorName(leader.name)
                  )
                  return (
                    <button
                      key={i}
                      className="leader-card"
                      onClick={() => openDossier(leader.name)}
                    >
                      <div className="leader-card-header">
                        <span className="leader-name">
                          <CouncillorLink name={leader.name} councillorId={slugify(leader.name)} integrityData={integrityData} compact />
                        </span>
                        {leader.groupRole && <span className="leader-role-badge">{leader.groupRole}</span>}
                      </div>
                      <div className="leader-card-meta">
                        <PartyBadge party={leader.party || leader.groupName} />
                        <span className="leader-group">{leader.groupName} ({leader.seats} seats)</span>
                      </div>
                      {integrity?.risk_level && (
                        <div className="leader-card-risk">
                          <RiskBadge level={integrity.risk_level} />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* All opposition councillors */}
          <div className="intel-councillor-list">
            {filteredOpposition.map((c, i) => {
              const integrity = integrityData?.councillors?.find(ic =>
                cleanCouncillorName(ic.name) === cleanCouncillorName(c.name)
              )
              return (
                <button
                  key={i}
                  className="intel-councillor-card"
                  onClick={() => openDossier(c.name)}
                >
                  <div className="councillor-card-top">
                    <span className="councillor-card-name">
                      <CouncillorLink name={cleanCouncillorName(c.name)} councillorId={slugify(c.name)} integrityData={integrityData} compact />
                    </span>
                    <PartyBadge party={c.party} />
                  </div>
                  <div className="councillor-card-bottom">
                    <span className="councillor-card-ward">{c.division || c.ward || '—'}</span>
                    {integrity?.risk_level && <RiskBadge level={integrity.risk_level} />}
                  </div>
                </button>
              )
            })}
            {filteredOpposition.length === 0 && (
              <p className="intel-empty-note">No councillors match your search.</p>
            )}
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* SECTION C: COUNCILLOR DOSSIER */}
      {/* ================================================================ */}
      {activeSection === 'dossier' && (
        <section className="intel-section">
          {selectedDossier ? (
            <CouncillorDossierView
              dossier={selectedDossier}
              activeTab={dossierTab}
              onTabChange={setDossierTab}
              onBack={() => {
                setSelectedCouncillor(null)
                setActiveSection('profiles')
              }}
            />
          ) : (
            <div className="intel-empty-state">
              <FileText size={48} />
              <h3>No councillor selected</h3>
              <p>Select a councillor from the Opposition Profiles or Briefing Room to view their full dossier.</p>
              <button className="intel-action-btn" onClick={() => setActiveSection('profiles')}>
                <Users size={14} /> Browse Opposition
              </button>
            </div>
          )}
        </section>
      )}

      {/* ================================================================ */}
      {/* SECTION D: RULING PARTY RECORD */}
      {/* ================================================================ */}
      {activeSection === 'rulingRecord' && (
        <section className="intel-section">
          <h2><Award size={20} /> {rulingParty ? `${rulingParty} Record` : 'Administration Record'}</h2>
          <p className="intel-section-desc">
            Data-informed discussion points and achievements by policy area. Use these to respond to opposition challenges.
          </p>

          {/* Reform rebuttals */}
          {REFORM_REBUTTALS.length > 0 && (
            <div className="intel-rebuttals-section">
              <h3><Shield size={16} /> Rebuttal Guide</h3>
              <p className="intel-section-desc">Common opposition challenges with data-informed responses.</p>
              <div className="rebuttal-list">
                {REFORM_REBUTTALS.map((r, i) => (
                  <div key={i} className="rebuttal-card">
                    <div className="rebuttal-attack">
                      <span className="rebuttal-label">Challenge:</span> "{r.attack}"
                    </div>
                    <div className="rebuttal-response">
                      <span className="rebuttal-label">Response:</span> {r.rebuttal}
                    </div>
                    <div className="rebuttal-areas">
                      {r.policyAreas.map(area => (
                        <span key={area} className="policy-area-tag">{POLICY_AREAS[area] || area}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Achievements by policy area */}
          {reformTransformation && (
            <div className="intel-achievements-section">
              <h3><Award size={16} /> Achievements</h3>
              {Object.entries(reformTransformation.achievements || {}).map(([key, cat], i) => (
                <div key={key} className="achievement-category">
                  <h4>{cat.headline || key}</h4>
                  <ul>
                    {cat.items?.map((item, j) => (
                      <li key={j}>
                        <strong>{item.metric || item.title}:</strong> {item.detail || item.description}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {/* Comparison table */}
              {(reformTransformation.comparison_table?.rows?.length > 0 || (Array.isArray(reformTransformation.comparison_table) && reformTransformation.comparison_table.length > 0)) && (
                <div className="intel-comparison">
                  <h4>{reformTransformation.comparison_table?.title || 'Administration Comparison'}</h4>
                  <div className="comparison-table-wrap">
                    <table className="intel-comparison-table">
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th>Previous Administration</th>
                          <th>Current Administration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(reformTransformation.comparison_table?.rows || reformTransformation.comparison_table || []).map((row, i) => (
                          <tr key={i}>
                            <td>{row.metric}</td>
                            <td className="comparison-old">{row.conservative || row.old}</td>
                            <td className="comparison-new">{row.reform || row.new}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Inherited problems */}
              {reformTransformation.inherited_problems && (
                <div className="intel-inherited">
                  <h4><AlertTriangle size={14} /> Inherited Problems</h4>
                  <ul className="inherited-list">
                    {Array.isArray(reformTransformation.inherited_problems)
                      ? reformTransformation.inherited_problems.map((p, i) => (
                          <li key={i}>{typeof p === 'string' ? p : p.problem || p.description || JSON.stringify(p)}</li>
                        ))
                      : Object.entries(reformTransformation.inherited_problems).map(([key, val]) => (
                          <li key={key}>
                            <strong>{key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}:</strong>{' '}
                            {typeof val === 'boolean' ? (val ? 'Yes' : 'No') : typeof val === 'number' ? val.toLocaleString() : String(val)}
                          </li>
                        ))
                    }
                  </ul>
                </div>
              )}
            </div>
          )}

          {!reformTransformation && (
            <p className="intel-empty-note">No reform_transformation.json data available.</p>
          )}

          {/* Defence lines by policy area */}
          <div className="intel-defence-section">
            <h3><Shield size={16} /> Response Points by Policy Area</h3>
            <div className="defence-area-grid">
              {Object.entries(POLICY_AREAS).map(([areaKey, areaLabel]) => {
                const defence = buildReformDefenceLines(areaKey, reformTransformation)
                if (!defence.achievements?.length && !defence.rebuttals?.length) return null
                return (
                  <div key={areaKey} className="defence-area-card">
                    <h4>{areaLabel}</h4>
                    {defence.achievements?.map((a, i) => (
                      <div key={i} className="defence-achievement">{a}</div>
                    ))}
                    {defence.rebuttals?.map((r, i) => (
                      <div key={i} className="defence-rebuttal">
                        <span className="rebuttal-mini-label">Rebuttal:</span> {r.rebuttal}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="intel-footer">
        <p>
          Intelligence engine powered by AI DOGE data (voting records, integrity checks, register of interests, DOGE findings).
          Briefing notes are data-informed discussion points for internal strategic use only. Always verify facts independently before use.
        </p>
      </footer>
    </div>
  )
}

// ============================================================================
// Agenda Intelligence Card
// ============================================================================

function WarGameCard({ warGame, integrityData }) {
  const [expanded, setExpanded] = useState(false)
  const [showAllAttackers, setShowAllAttackers] = useState(false)
  if (!warGame) return null
  const ATTACKER_LIMIT = 5
  const visibleAttackers = showAllAttackers
    ? warGame.attackPredictions
    : warGame.attackPredictions.slice(0, ATTACKER_LIMIT)
  const hiddenCount = warGame.attackPredictions.length - ATTACKER_LIMIT

  return (
    <div className={`wargame-card risk-${warGame.riskLevel} ${expanded ? 'expanded' : ''}`}>
      <div
        className="wargame-card-header"
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setExpanded(!expanded)}
      >
        <div className="wargame-card-title-row">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className={`wargame-risk-indicator risk-${warGame.riskLevel}`}>
            {warGame.riskLevel === 'high' ? '🔴' : warGame.riskLevel === 'medium' ? '🟡' : '🟢'}
          </span>
          <span className="wargame-card-title">{warGame.agendaItem}</span>
        </div>
        <div className="wargame-card-tags">
          <span className="wargame-attack-count">{warGame.attackPredictions.length} projected challenger{warGame.attackPredictions.length !== 1 ? 's' : ''}</span>
          <span className="wargame-counter-count">{warGame.counters.length} response{warGame.counters.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {expanded && (
        <div className="wargame-card-body">
          {/* Projected challenges per opposition member */}
          {warGame.attackPredictions.length > 0 && (
            <div className="wargame-subsection attacks">
              <h5><AlertTriangle size={12} /> Projected Challenges</h5>
              {visibleAttackers.map((att, i) => (
                <div key={i} className="wargame-attacker">
                  <div className="wargame-attacker-header">
                    <span className="wargame-attacker-name">
                      <CouncillorLink name={att.name} councillorId={slugify(att.name)} integrityData={integrityData} compact />
                    </span>
                    <PartyBadge party={att.party} />
                    {att.likelyToSpeak && <span className="speaker-badge">Likely Speaker</span>}
                  </div>
                  {att.attackLines.length > 0 && (
                    <div className="wargame-attack-lines">
                      {att.attackLines.map((al, j) => (
                        <div key={j} className="wargame-attack-line" style={{ borderLeftColor: SEVERITY_COLORS[al.severity] || '#888' }}>
                          {al.text}
                        </div>
                      ))}
                    </div>
                  )}
                  {att.predictedArguments.length > 0 && (
                    <div className="wargame-predicted-args">
                      {att.predictedArguments.map((arg, j) => (
                        <span key={j} className="wargame-arg-chip">{typeof arg === 'string' ? arg : arg.text || arg.argument || JSON.stringify(arg)}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {!showAllAttackers && hiddenCount > 0 && (
                <button className="wargame-show-more" onClick={() => setShowAllAttackers(true)}>
                  Show {hiddenCount} more challenger{hiddenCount !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          )}

          {/* Counter-arguments */}
          {warGame.counters.length > 0 && (
            <div className="wargame-subsection counters">
              <h5><Shield size={12} /> Counter-Arguments &amp; Administration Record</h5>
              {warGame.counters.map((c, i) => (
                <div key={i} className={`wargame-counter ${c.type}`}>
                  {c.type === 'rebuttal' && c.trigger && (
                    <div className="wargame-counter-trigger">If they say: "{c.trigger}"</div>
                  )}
                  <div className="wargame-counter-response">
                    {c.type === 'rebuttal' ? '→ ' : '✓ '}{c.response}
                    {c.detail && <span className="wargame-counter-detail"> — {c.detail}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Supporting data */}
          {warGame.supportingData.length > 0 && (
            <div className="wargame-subsection data">
              <h5><BarChart3 size={12} /> Supporting DOGE Data</h5>
              {warGame.supportingData.map((d, i) => (
                <div key={i} className="wargame-data-point">
                  <span className="wargame-data-label">{d.label}</span>
                  <span className="wargame-data-value">{d.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Past vote context */}
          {warGame.pastVoteContext.length > 0 && (
            <div className="wargame-subsection context">
              <h5>📊 Past Vote Context</h5>
              {warGame.pastVoteContext.map((v, i) => (
                <div key={i} className="wargame-past-vote">
                  <span>{v.title}</span>
                  <span className="wargame-vote-date">{v.date}</span>
                  <span className={`wargame-vote-outcome ${v.outcome?.toLowerCase()}`}>{v.outcome}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AgendaIntelCard({ intel }) {
  const [expanded, setExpanded] = useState(false)
  if (!intel) return null

  return (
    <div className={`agenda-intel-card ${expanded ? 'expanded' : ''}`}>
      <div
        className="agenda-intel-header"
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="agenda-intel-title">{intel.text}</span>
        <div className="agenda-intel-tags">
          {intel.policyAreas?.map(area => (
            <span key={area} className="policy-area-tag">{POLICY_AREAS[area] || area}</span>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="agenda-intel-body">
          {intel.matchingVotes?.length > 0 && (
            <div className="agenda-intel-subsection">
              <h5>Related Past Votes</h5>
              {intel.matchingVotes.map((v, i) => (
                <div key={i} className="past-vote-item">
                  <span className="past-vote-title">{v.title || v.description}</span>
                  <span className="past-vote-date">{v.date}</span>
                  <span className={`past-vote-outcome ${v.outcome?.toLowerCase()}`}>{v.outcome}</span>
                </div>
              ))}
            </div>
          )}

          {intel.matchingAchievements?.length > 0 && (
            <div className="agenda-intel-subsection">
              <h5>Administration Achievements</h5>
              {intel.matchingAchievements.map((a, i) => (
                <div key={i} className="agenda-achievement">
                  <strong>{a.title || a.headline}</strong>
                  {a.detail && <span className="achievement-detail"> — {a.detail}</span>}
                </div>
              ))}
            </div>
          )}

          {intel.matchingRebuttals?.length > 0 && (
            <div className="agenda-intel-subsection">
              <h5>Prepared Rebuttals</h5>
              {intel.matchingRebuttals.map((r, i) => (
                <div key={i} className="agenda-rebuttal">
                  <strong>If challenged:</strong> "{r.attack}" → <strong>Suggested response:</strong> {r.rebuttal}
                </div>
              ))}
            </div>
          )}

          {intel.matchingFindings?.length > 0 && (
            <div className="agenda-intel-subsection">
              <h5>DOGE Findings</h5>
              {intel.matchingFindings.map((f, i) => (
                <div key={i} className="agenda-doge-finding">{f.label}: {f.value}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Councillor Dossier View
// ============================================================================

const DOSSIER_TABS = [
  { id: 'profile', label: 'Profile', icon: Users },
  { id: 'voting', label: 'Voting Record', icon: BarChart3 },
  { id: 'integrity', label: 'Integrity', icon: Shield },
  { id: 'attacks', label: 'Briefing Notes', icon: Swords },
]

function CouncillorDossierView({ dossier, activeTab, onTabChange, onBack }) {
  if (!dossier) return null

  return (
    <div className="intel-dossier-view">
      {/* Header */}
      <div className="dossier-view-header">
        <button className="intel-back-btn" onClick={onBack}>
          <ArrowLeft size={16} /> Opposition Profiles
        </button>
        <div className="dossier-view-title">
          <h2><CouncillorLink name={dossier.name} councillorId={slugify(dossier.name)} /></h2>
          <div className="dossier-view-badges">
            <PartyBadge party={dossier.party} />
            {dossier.groupInfo?.role && (
              <span className="dossier-group-role">{dossier.groupInfo.role} — {dossier.groupInfo.groupName}</span>
            )}
            {dossier.integrityProfile?.riskLevel && (
              <RiskBadge level={dossier.integrityProfile.riskLevel} />
            )}
          </div>
        </div>
        {(dossier.ward || dossier.division) && (
          <p className="dossier-view-ward"><MapPin size={14} /> {dossier.ward || dossier.division}</p>
        )}
      </div>

      {/* Tab bar */}
      <nav className="dossier-view-tabs" aria-label="Dossier sections">
        {DOSSIER_TABS.map(t => (
          <button
            key={t.id}
            className={`dossier-view-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => onTabChange(t.id)}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="dossier-view-content">
        {activeTab === 'profile' && <DossierProfileTab dossier={dossier} />}
        {activeTab === 'voting' && <DossierVotingTab dossier={dossier} />}
        {activeTab === 'integrity' && <DossierIntegrityTab dossier={dossier} />}
        {activeTab === 'attacks' && <DossierAttacksTab dossier={dossier} />}
      </div>
    </div>
  )
}

function DossierProfileTab({ dossier }) {
  return (
    <div className="dossier-tab-panel">
      <div className="dossier-profile-grid">
        <div className="dossier-profile-item"><span className="dossier-profile-label">Name</span><span className="dossier-profile-value">{dossier.name}</span></div>
        <div className="dossier-profile-item"><span className="dossier-profile-label">Party</span><span className="dossier-profile-value"><PartyBadge party={dossier.party} /></span></div>
        <div className="dossier-profile-item"><span className="dossier-profile-label">Ward/Division</span><span className="dossier-profile-value">{dossier.ward || dossier.division || '—'}</span></div>
        {dossier.groupInfo?.role && (
          <div className="dossier-profile-item"><span className="dossier-profile-label">Group Role</span><span className="dossier-profile-value">{dossier.groupInfo.role} — {dossier.groupInfo.groupName}</span></div>
        )}
        {dossier.email && (
          <div className="dossier-profile-item"><span className="dossier-profile-label">Email</span><span className="dossier-profile-value">{dossier.email}</span></div>
        )}
      </div>

      {dossier.notable?.length > 0 && (
        <div className="dossier-subsection">
          <h4>Notable Facts</h4>
          <ul className="dossier-facts-list">
            {dossier.notable.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      )}

      {dossier.committees?.length > 0 && (
        <div className="dossier-subsection">
          <h4>Committee Memberships ({dossier.committees.length})</h4>
          <div className="dossier-committee-list">
            {dossier.committees.map((c, i) => (
              <div key={i} className="dossier-committee-item">
                <span className="committee-name">{c.name}</span>
                <span className="committee-role">{c.role || 'Member'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dossier.interestsProfile && (
        <div className="dossier-subsection">
          <h4>Register of Interests</h4>
          {dossier.interestsProfile.companies?.length > 0 && (
            <p className="dossier-interest-line">Companies: {dossier.interestsProfile.companies.join(', ')}</p>
          )}
          {dossier.interestsProfile.employment?.length > 0 && (
            <p className="dossier-interest-line">Employment: {dossier.interestsProfile.employment.join(', ')}</p>
          )}
          {dossier.interestsProfile.securities?.length > 0 && (
            <p className="dossier-interest-line">Securities: {dossier.interestsProfile.securities.join(', ')}</p>
          )}
          {dossier.interestsProfile.land?.length > 0 && (
            <p className="dossier-interest-line">Property: {dossier.interestsProfile.land.length} declared</p>
          )}
          {dossier.interestsProfile.sponsorship?.length > 0 && (
            <p className="dossier-interest-line">Sponsorship: {dossier.interestsProfile.sponsorship.join(', ')}</p>
          )}
          {dossier.interestsProfile.memberships?.length > 0 && (
            <p className="dossier-interest-line">Memberships: {dossier.interestsProfile.memberships.join(', ')}</p>
          )}
        </div>
      )}
    </div>
  )
}

function DossierVotingTab({ dossier }) {
  if (!dossier.votingRecord?.length) {
    return <p className="dossier-empty-tab">No recorded votes found for this councillor.</p>
  }

  return (
    <div className="dossier-tab-panel">
      <div className="dossier-voting-stats">
        <div className="voting-stat">
          <span className="voting-stat-number">{dossier.votingRecord.length}</span>
          <span className="voting-stat-label">Votes</span>
        </div>
        <div className="voting-stat">
          <span className="voting-stat-number">{dossier.rebelCount || 0}</span>
          <span className="voting-stat-label">Rebel Votes</span>
        </div>
        {dossier.votingRecord.length > 0 && (
          <div className="voting-stat">
            <span className="voting-stat-number">
              {Math.round((dossier.rebelRate || 0) * 100)}%
            </span>
            <span className="voting-stat-label">Rebel Rate</span>
          </div>
        )}
      </div>

      {/* Vote timeline dot grid — month × policy area */}
      {dossier.votingRecord.length >= 3 && (() => {
        // Build month × policy area matrix
        const grid = {}
        const months = new Set()
        const areas = new Set()
        for (const v of dossier.votingRecord) {
          const mo = v.date ? v.date.slice(0, 7) : 'unknown' // YYYY-MM
          months.add(mo)
          const pa = v.policyAreas?.[0] || 'other'
          areas.add(pa)
          const key = `${mo}|${pa}`
          if (!grid[key]) grid[key] = []
          grid[key].push(v.position || 'abstain')
        }
        const sortedMonths = [...months].sort()
        const sortedAreas = [...areas]
        if (sortedMonths.length < 2 && sortedAreas.length < 2) return null
        const posColor = { for: '#30d158', against: '#ff453a', abstain: '#ff9f0a' }

        return (
          <div className="dossier-subsection">
            <h4>Vote Pattern</h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '0.7rem', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}></th>
                    {sortedMonths.map(mo => (
                      <th key={mo} style={{ padding: '4px 6px', color: 'var(--text-secondary)', fontWeight: 500, textAlign: 'center' }}>
                        {mo.slice(5)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedAreas.map(area => (
                    <tr key={area}>
                      <td style={{ padding: '3px 8px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {(POLICY_AREAS[area] || area).slice(0, 14)}
                      </td>
                      {sortedMonths.map(mo => {
                        const votes = grid[`${mo}|${area}`] || []
                        return (
                          <td key={mo} style={{ textAlign: 'center', padding: '3px' }}>
                            {votes.map((pos, i) => (
                              <span key={i} title={pos} style={{
                                display: 'inline-block', width: 10, height: 10, borderRadius: '50%', margin: 1,
                                background: posColor[pos] || '#666',
                              }} />
                            ))}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#30d158', marginRight: 3 }} />For</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ff453a', marginRight: 3 }} />Against</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ff9f0a', marginRight: 3 }} />Abstain</span>
            </div>
          </div>
        )
      })()}

      {/* Policy positions chart */}
      {dossier.policyPositions && Object.keys(dossier.policyPositions).length > 0 && (() => {
        const chartData = Object.entries(dossier.policyPositions).map(([area, counts]) => ({
          area: (POLICY_AREAS[area] || area).length > 12
            ? (POLICY_AREAS[area] || area).slice(0, 10) + '…'
            : (POLICY_AREAS[area] || area),
          fullArea: POLICY_AREAS[area] || area,
          for: counts.for || 0,
          against: counts.against || 0,
          abstain: counts.abstain || 0,
        })).filter(d => d.for + d.against + d.abstain > 0)

        return chartData.length > 0 ? (
          <div className="dossier-subsection">
            <h4><BarChart3 size={14} /> Voting by Policy Area</h4>
            <div className="intel-chart-wrap">
              <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 36)}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis type="number" tick={AXIS_TICK_STYLE} allowDecimals={false} />
                  <YAxis dataKey="area" type="category" tick={AXIS_TICK_STYLE} width={100} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v, name) => [v, name === 'for' ? 'For' : name === 'against' ? 'Against' : 'Abstain']}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullArea || label}
                  />
                  <Bar dataKey="for" fill="#30d158" radius={[0, 4, 4, 0]} stackId="votes" />
                  <Bar dataKey="against" fill="#ff453a" radius={[0, 4, 4, 0]} stackId="votes" />
                  <Bar dataKey="abstain" fill="#ffd60a" radius={[0, 4, 4, 0]} stackId="votes" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null
      })()}

      {/* Policy positions grid */}
      {dossier.policyPositions && Object.keys(dossier.policyPositions).length > 0 && (
        <div className="dossier-subsection">
          <h4>Policy Positions</h4>
          <div className="policy-positions-grid">
            {Object.entries(dossier.policyPositions).map(([area, counts]) => {
              const total = (counts.for || 0) + (counts.against || 0) + (counts.abstain || 0)
              const dominant = counts.for >= counts.against ? (counts.for > 0 ? 'supportive' : 'neutral') : 'opposing'
              return (
                <div key={area} className="policy-position-item">
                  <span className="policy-area-name">{POLICY_AREAS[area] || area}</span>
                  <span className={`policy-position-badge ${dominant}`}>
                    {counts.for}F / {counts.against}A{counts.abstain > 0 ? ` / ${counts.abstain}Ab` : ''} ({total})
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Individual votes */}
      <div className="dossier-subsection">
        <h4>Recorded Votes</h4>
        <div className="dossier-votes-list">
          {dossier.votingRecord.map((v, i) => (
              <div key={i} className={`dossier-vote-item ${v.isRebel ? 'rebel' : ''}`}>
                <div className="vote-item-header">
                  <span className="vote-title">{v.title}</span>
                  <span className="vote-date">{v.date}</span>
                </div>
                <div className="vote-item-meta">
                  <span className={`vote-position ${v.position}`}>{v.position}</span>
                  <span className={`vote-outcome ${v.outcome?.toLowerCase()}`}>{v.outcome}</span>
                  {v.isRebel && <span className="rebel-badge">REBEL</span>}
                  {v.isAmendment && <span className="amendment-badge">AMENDMENT</span>}
                  {v.policyAreas?.map(area => (
                    <span key={area} className="policy-area-tag small">{POLICY_AREAS[area] || area}</span>
                  ))}
                </div>
                {v.description && <p className="vote-description">{v.description}</p>}
              </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DossierIntegrityTab({ dossier }) {
  const profile = dossier.integrityProfile
  if (!profile) {
    return <p className="dossier-empty-tab">No integrity data available for this councillor.</p>
  }

  return (
    <div className="dossier-tab-panel">
      <div className="integrity-header">
        <div className="integrity-score">
          <span className="integrity-score-number">{profile.score || '—'}</span>
          <span className="integrity-score-label">/100</span>
        </div>
        <RiskBadge level={profile.riskLevel} />
        {profile.redFlags?.length > 0 && (
          <span className="integrity-red-flags">{profile.redFlags.length} red flags</span>
        )}
      </div>

      {/* Red flags */}
      {profile.redFlags?.length > 0 && (
        <div className="dossier-subsection">
          <h4>Red Flags</h4>
          <div className="red-flags-list">
            {profile.redFlags.map((flag, i) => (
              <div key={i} className="red-flag-item">
                <AlertTriangle size={12} className="red-flag-icon" />
                <span>{typeof flag === 'string' ? flag : flag.description || flag.flag || JSON.stringify(flag)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Directorships */}
      {profile.companies?.length > 0 && (
        <div className="dossier-subsection">
          <h4>Companies House Directorships ({profile.companies.length})</h4>
          <div className="directorship-list">
            {profile.companies.map((d, i) => (
              <div key={i} className={`directorship-item ${d.status === 'active' ? 'active' : 'resigned'}`}>
                <span className="directorship-name">{d.name}</span>
                <span className="directorship-status">{d.status}</span>
                {d.number && <span className="directorship-number">#{d.number}</span>}
                {d.sicCodes?.length > 0 && <span className="directorship-sic">{d.sicCodes.join(', ')}</span>}
                {d.redFlags?.length > 0 && <span className="directorship-flags">{d.redFlags.length} flags</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Supplier conflicts */}
      {profile.supplierConflicts?.length > 0 && (
        <div className="dossier-subsection">
          <h4>⚠ Potential Supplier Conflicts ({profile.supplierConflicts.length})</h4>
          <div className="conflict-list">
            {profile.supplierConflicts.map((c, i) => (
              <div key={i} className="conflict-item">
                <span>{typeof c === 'string' ? c : c.description || JSON.stringify(c)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DossierAttacksTab({ dossier }) {
  if (!dossier.attackLines?.length) {
    return <p className="dossier-empty-tab">No briefing notes generated for this councillor.</p>
  }

  return (
    <div className="dossier-tab-panel">
      <p className="intel-section-desc">
        {dossier.attackLines.length} data-informed briefing notes sorted by relevance.
        These are factual discussion points drawn from public records. Click the copy icon to copy individual notes.
      </p>

      {/* Attack severity distribution chart */}
      {(() => {
        const severityCounts = ['high', 'medium', 'low'].map(sev => ({
          severity: sev.charAt(0).toUpperCase() + sev.slice(1),
          count: dossier.attackLines.filter(l => l.severity === sev).length,
          fill: SEVERITY_COLORS[sev] || '#888',
        })).filter(d => d.count > 0)

        return severityCounts.length > 0 ? (
          <div className="intel-chart-wrap intel-severity-chart">
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={severityCounts} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis type="number" tick={AXIS_TICK_STYLE} allowDecimals={false} />
                <YAxis dataKey="severity" type="category" tick={AXIS_TICK_STYLE} width={70} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v) => [`${v} briefing note${v !== 1 ? 's' : ''}`, 'Count']}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {severityCounts.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : null
      })()}

      {/* Group by severity */}
      {['high', 'medium', 'low'].map(sev => {
        const lines = dossier.attackLines.filter(l => l.severity === sev)
        if (lines.length === 0) return null
        return (
          <div key={sev} className="attack-severity-group">
            <h4 style={{ color: SEVERITY_COLORS[sev] }}>
              {sev.charAt(0).toUpperCase() + sev.slice(1)} Severity ({lines.length})
            </h4>
            {lines.map((line, i) => (
              <BriefingNote key={i} line={line} />
            ))}
          </div>
        )
      })}
    </div>
  )
}
