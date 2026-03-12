/**
 * MeetingMode — Split-panel meeting briefing interface.
 *
 * Replaces the Briefing Room vertical scroll with a sidebar agenda stepper
 * and a detail panel for the selected agenda item. Designed for use during
 * live council meetings: keyboard navigation, per-councillor counters,
 * timer, and export functionality.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  X, Printer, Clock, ChevronDown, ChevronRight, Shield, AlertTriangle,
  Search, Copy, Check, BookOpen, Users, Play, Pause, RotateCcw, Download,
} from 'lucide-react'
import CouncillorChallengeCard from './CouncillorChallengeCard'
import { PARTY_COLORS } from '../../utils/constants'
import { POLICY_AREAS, cleanCouncillorName, buildSpeakerSuggestions } from '../../utils/intelligenceEngine'
import './MeetingMode.css'

const RISK_EMOJI = { high: '🔴', medium: '🟡', low: '🟢' }

// ---------------------------------------------------------------------------
// Meeting Timer — tracks standing order time limits
// ---------------------------------------------------------------------------
function MeetingTimer({ standingOrders }) {
  const [running, setRunning] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [limitMinutes, setLimitMinutes] = useState(30)
  const intervalRef = useRef(null)

  const motionLimit = standingOrders?.time_limits?.motion_debate?.per_motion_minutes || 30

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [running])

  const elapsed = seconds
  const total = limitMinutes * 60
  const remaining = Math.max(0, total - elapsed)
  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  const pct = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0
  const isWarning = remaining <= 300 && remaining > 60
  const isCritical = remaining <= 60

  return (
    <div className={`meeting-timer ${isCritical ? 'critical' : isWarning ? 'warning' : ''}`}>
      <div className="timer-display">
        <Clock size={14} />
        <span className="timer-time">{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}</span>
        <span className="timer-label">/ {limitMinutes}m</span>
      </div>
      <div className="timer-bar">
        <div className="timer-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="timer-controls">
        <button onClick={() => setRunning(!running)} title={running ? 'Pause' : 'Start'}>
          {running ? <Pause size={12} /> : <Play size={12} />}
        </button>
        <button onClick={() => { setSeconds(0); setRunning(false) }} title="Reset">
          <RotateCcw size={12} />
        </button>
        <select
          value={limitMinutes}
          onChange={e => { setLimitMinutes(Number(e.target.value)); setSeconds(0) }}
          className="timer-limit-select"
        >
          <option value={motionLimit}>{motionLimit}m (motion debate)</option>
          <option value={5}>5m (speech)</option>
          <option value={3}>3m (other speeches)</option>
          <option value={30}>30m (public questions)</option>
          <option value={120}>120m (all motions)</option>
        </select>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Standing Orders Mini Reference
// ---------------------------------------------------------------------------
function StandingOrdersMini({ standingOrders }) {
  const [expanded, setExpanded] = useState(false)
  if (!standingOrders) return null
  const tl = standingOrders.time_limits || {}

  return (
    <div className="so-mini">
      <button className="so-mini-toggle" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <BookOpen size={12} /> Standing Orders
      </button>
      {expanded && (
        <div className="so-mini-content">
          {tl.public_question_time && (
            <div className="so-mini-item">
              <span className="so-mini-label">Public Qs:</span>
              <span>{tl.public_question_time.total_minutes}m ({tl.public_question_time.so})</span>
            </div>
          )}
          {tl.member_question_time && (
            <div className="so-mini-item">
              <span className="so-mini-label">Member Qs:</span>
              <span>{tl.member_question_time.total_minutes}m, max {tl.member_question_time.max_questions}</span>
            </div>
          )}
          {tl.motion_debate && (
            <div className="so-mini-item">
              <span className="so-mini-label">Motion:</span>
              <span>{tl.motion_debate.per_motion_minutes}m per, {tl.motion_debate.total_all_motions_minutes}m total</span>
            </div>
          )}
          {tl.speeches && (
            <div className="so-mini-item">
              <span className="so-mini-label">Speeches:</span>
              <span>{tl.speeches.mover_minutes}m mover, {tl.speeches.other_minutes}m others</span>
            </div>
          )}
          {standingOrders.voting?.recorded_vote && (
            <div className="so-mini-item">
              <span className="so-mini-label">Recorded vote:</span>
              <span>{standingOrders.voting.recorded_vote.trigger}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main MeetingMode Component
// ---------------------------------------------------------------------------
export default function MeetingMode({
  meetingBriefing,
  allData,
  integrityData,
  standingOrdersData,
  rulingParty,
  onExit,
  onPrint,
}) {
  const [activeAgendaIdx, setActiveAgendaIdx] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const contentRef = useRef(null)

  const meeting = meetingBriefing?.meeting
  const agendaItems = meeting?.agendaItems || []
  const warGame = meetingBriefing?.warGame || []

  // Build agenda-to-wargame map for quick lookup
  const agendaWarGameMap = useMemo(() => {
    const map = {}
    for (const wg of warGame) {
      map[wg.agendaItem] = wg
    }
    return map
  }, [warGame])

  // Current agenda item's war game data
  const currentItem = agendaItems[activeAgendaIdx]
  const currentWarGame = currentItem ? agendaWarGameMap[currentItem] || agendaWarGameMap[typeof currentItem === 'string' ? currentItem : currentItem?.title] : null

  // Speaker suggestions + procedural notes per agenda item
  const speakerSuggestion = useMemo(() => {
    const itemText = typeof currentItem === 'string' ? currentItem : currentItem?.title || ''
    if (!itemText || !meetingBriefing?.reformMembers) return { speakers: [], procedural: { notes: [] } }
    const isReformMotion = /reform/i.test(itemText) // crude — ideally from meeting data
    return buildSpeakerSuggestions(
      itemText,
      currentWarGame?.policyAreas || [],
      meetingBriefing.reformMembers,
      allData,
      standingOrdersData,
      isReformMotion,
    )
  }, [currentItem, currentWarGame, meetingBriefing?.reformMembers, allData, standingOrdersData])

  // Councillor search filter
  const allOpposition = meetingBriefing?.oppositionMembers || []
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null
    const q = searchQuery.toLowerCase()
    return allOpposition.filter(m =>
      m.name?.toLowerCase().includes(q) ||
      m.party?.toLowerCase().includes(q) ||
      (m.dossier?.ward || '').toLowerCase().includes(q)
    )
  }, [searchQuery, allOpposition])

  // Jump to the agenda item where a councillor appears and scroll to their card
  const handleSearchSelect = useCallback((member) => {
    const name = member.name?.toLowerCase()
    if (!name) return
    // Find which agenda item has this councillor as a predicted attacker
    for (let i = 0; i < agendaItems.length; i++) {
      const itemText = typeof agendaItems[i] === 'string' ? agendaItems[i] : agendaItems[i]?.title || ''
      const wg = agendaWarGameMap[itemText]
      if (wg?.attackPredictions?.some(a => a.name?.toLowerCase().includes(name))) {
        setActiveAgendaIdx(i)
        setSearchQuery('')
        // Scroll to the councillor card after React re-renders
        setTimeout(() => {
          const cards = contentRef.current?.querySelectorAll('.challenge-card')
          if (cards) {
            for (const card of cards) {
              if (card.textContent?.toLowerCase().includes(name)) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' })
                card.classList.add('highlight-pulse')
                setTimeout(() => card.classList.remove('highlight-pulse'), 2000)
                break
              }
            }
          }
        }, 100)
        return
      }
    }
    // If not found in any agenda item, just clear search
    setSearchQuery('')
  }, [agendaItems, agendaWarGameMap])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        setActiveAgendaIdx(prev => Math.min(prev + 1, agendaItems.length - 1))
      }
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        setActiveAgendaIdx(prev => Math.max(prev - 1, 0))
      }
      if (e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key) - 1
        if (idx < agendaItems.length) setActiveAgendaIdx(idx)
      }
      if (e.key === 'Escape') onExit?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [agendaItems.length, onExit])

  // Scroll content to top when switching agenda items
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [activeAgendaIdx])

  // Export current item as formatted text
  const handleExport = useCallback(() => {
    if (!currentItem || !currentWarGame) return
    const lines = [`AGENDA ITEM: ${typeof currentItem === 'string' ? currentItem : currentItem.title}`, '']
    if (currentWarGame.attackPredictions?.length) {
      lines.push('OPPOSITION CHALLENGES:')
      for (const att of currentWarGame.attackPredictions) {
        lines.push(`\n  ${att.name} (${att.party})${att.ward ? ` — ${att.ward}` : ''}`)
        for (const c of att.specificCounters || []) {
          lines.push(`    IF: ${c.attack}`)
          lines.push(`    RESPOND: ${c.counter}`)
        }
      }
    }
    if (currentWarGame.counters?.length) {
      lines.push('\nGENERAL REBUTTALS:')
      for (const c of currentWarGame.counters) {
        if (c.trigger) lines.push(`  If challenged: "${c.trigger}"`)
        lines.push(`  Response: ${c.response}`)
      }
    }
    navigator.clipboard.writeText(lines.join('\n'))
  }, [currentItem, currentWarGame])

  if (!meetingBriefing || !meeting) return null

  const riskLevel = meetingBriefing.riskAssessment?.level || 'low'

  return (
    <div className="meeting-mode">
      {/* Sticky Header */}
      <div className="meeting-mode-header">
        <div className="meeting-mode-title-row">
          <div className="meeting-mode-title">
            <h2>{meeting.committee || meeting.title || 'Meeting'}</h2>
            <span className={`meeting-risk-badge risk-${riskLevel}`}>
              {RISK_EMOJI[riskLevel]} {riskLevel.toUpperCase()} RISK
            </span>
          </div>
          <div className="meeting-mode-actions">
            <button className="meeting-mode-btn" onClick={handleExport} title="Copy item briefing to clipboard">
              <Download size={14} /> Export
            </button>
            <button className="meeting-mode-btn" onClick={onPrint} title="Print full briefing">
              <Printer size={14} /> Print
            </button>
            <button className="meeting-mode-btn exit" onClick={onExit} title="Exit meeting mode (Esc)">
              <X size={14} /> Exit
            </button>
          </div>
        </div>
        <div className="meeting-mode-meta">
          <span>{new Date(meeting.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          {meeting.time && <span>{meeting.time}</span>}
          <span>{agendaItems.length} agenda items</span>
          <span>{meetingBriefing.oppositionMembers?.length || 0} opposition</span>
          <span className="meeting-mode-kbd-hint">↑↓ navigate • 1-9 jump • Esc exit</span>
        </div>
      </div>

      {/* Split Panel */}
      <div className="meeting-mode-panels">
        {/* Sidebar */}
        <div className="meeting-mode-sidebar">
          {/* Councillor search */}
          <div className="meeting-search">
            <Search size={14} />
            <input
              type="text"
              placeholder="Find councillor..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="meeting-search-input"
            />
          </div>

          {/* Search results */}
          {searchResults && (
            <div className="meeting-search-results">
              {searchResults.length === 0 ? (
                <p className="meeting-search-empty">No matches</p>
              ) : (
                searchResults.map((m, i) => (
                  <div key={i} className="meeting-search-result" onClick={() => handleSearchSelect(m)}>
                    <span className="search-result-name">{cleanCouncillorName(m.name)}</span>
                    <span className="search-result-party" style={{ color: PARTY_COLORS[m.party] || '#888' }}>{m.party}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Agenda Stepper */}
          <div className="meeting-agenda-stepper">
            <h4 className="stepper-label">Agenda</h4>
            {agendaItems.map((item, i) => {
              const itemText = typeof item === 'string' ? item : item?.title || item?.name || `Item ${i + 1}`
              const wg = agendaWarGameMap[itemText]
              const risk = wg?.riskLevel || 'low'
              const challengers = wg?.attackPredictions?.length || 0
              return (
                <button
                  key={i}
                  className={`stepper-item ${activeAgendaIdx === i ? 'active' : ''} risk-${risk}`}
                  onClick={() => setActiveAgendaIdx(i)}
                  title={itemText}
                >
                  <span className="stepper-number">{i + 1}</span>
                  <span className="stepper-text">{itemText.length > 40 ? itemText.slice(0, 38) + '...' : itemText}</span>
                  {challengers > 0 && (
                    <span className={`stepper-challengers risk-${risk}`}>{challengers}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Timer */}
          <MeetingTimer standingOrders={standingOrdersData} />

          {/* Our speakers + procedural guidance */}
          {speakerSuggestion.speakers.length > 0 && (
            <div className="meeting-our-speakers">
              <h4><Users size={12} /> Our Speakers</h4>
              {speakerSuggestion.speakers.map((s, i) => (
                <div key={i} className="our-speaker-item" title={s.reason}>
                  <span className="our-speaker-name">{cleanCouncillorName(s.name)}</span>
                  <span className={`our-speaker-role role-${s.role.toLowerCase()}`}>{s.role}</span>
                </div>
              ))}
            </div>
          )}

          {/* Procedural tactics */}
          {speakerSuggestion.procedural?.notes?.length > 0 && (
            <div className="meeting-procedural">
              <h4><Shield size={12} /> Procedure</h4>
              {speakerSuggestion.procedural.notes.map((note, i) => (
                <div key={i} className="procedural-note">{note}</div>
              ))}
            </div>
          )}

          {/* Standing Orders mini */}
          <StandingOrdersMini standingOrders={standingOrdersData} />
        </div>

        {/* Main Content */}
        <div className="meeting-mode-content" ref={contentRef}>
          {currentItem ? (
            <>
              {/* Item header */}
              <div className="meeting-item-header">
                <span className="meeting-item-number">Item {activeAgendaIdx + 1}</span>
                <h3>{typeof currentItem === 'string' ? currentItem : currentItem?.title || 'Unknown'}</h3>
                {currentWarGame && (
                  <div className="meeting-item-tags">
                    {currentWarGame.policyAreas?.map(area => (
                      <span key={area} className="policy-area-tag">{POLICY_AREAS[area] || area}</span>
                    ))}
                    <span className={`meeting-item-risk risk-${currentWarGame.riskLevel}`}>
                      {RISK_EMOJI[currentWarGame.riskLevel]} {currentWarGame.attackPredictions?.length || 0} challenger{currentWarGame.attackPredictions?.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* Per-councillor challenge cards — the main content */}
              {currentWarGame?.attackPredictions?.length > 0 ? (
                <div className="meeting-challengers">
                  <h4><AlertTriangle size={14} /> Opposition Challenges</h4>
                  {currentWarGame.attackPredictions.map((att, i) => (
                    <CouncillorChallengeCard key={i} attacker={att} integrityData={integrityData} />
                  ))}
                </div>
              ) : (
                <div className="meeting-no-challengers">
                  <Shield size={20} />
                  <p>No significant opposition challenges predicted for this item.</p>
                </div>
              )}

              {/* Generic rebuttals */}
              {currentWarGame?.counters?.length > 0 && (
                <div className="meeting-generic-rebuttals">
                  <h4><Shield size={14} /> Prepared Rebuttals</h4>
                  {currentWarGame.counters.map((c, i) => (
                    <div key={i} className={`meeting-rebuttal ${c.type}`}>
                      {c.type === 'rebuttal' && c.trigger && (
                        <div className="rebuttal-trigger">If challenged: "{c.trigger}"</div>
                      )}
                      <div className="rebuttal-response">
                        {c.type === 'rebuttal' ? '→ ' : '✓ '}{c.response}
                        {c.detail && <span className="rebuttal-detail"> — {c.detail}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Related council decisions */}
              {currentWarGame?.relatedDecisions?.length > 0 && (
                <div className="meeting-past-votes">
                  <h4>Related Council Decisions</h4>
                  {currentWarGame.relatedDecisions.map((d, i) => (
                    <div key={i} className="meeting-past-vote">
                      <span className="past-vote-title">{d.title}</span>
                      <span className="past-vote-date">{d.date}</span>
                      <span className={`past-vote-outcome ${d.outcome?.toLowerCase().includes('carried') ? 'carried' : 'defeated'}`}>{d.outcome}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Past vote context */}
              {currentWarGame?.pastVoteContext?.length > 0 && (
                <div className="meeting-past-votes">
                  <h4>Past Vote Context</h4>
                  {currentWarGame.pastVoteContext.map((v, i) => (
                    <div key={i} className="meeting-past-vote">
                      <span className="past-vote-title">{v.title}</span>
                      <span className="past-vote-date">{v.date}</span>
                      <span className={`past-vote-outcome ${v.outcome?.toLowerCase()}`}>{v.outcome}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Supporting data */}
              {currentWarGame?.supportingData?.length > 0 && (
                <div className="meeting-supporting-data">
                  <h4>Supporting DOGE Data</h4>
                  {currentWarGame.supportingData.map((d, i) => (
                    <div key={i} className="meeting-data-point">
                      <span className="data-label">{d.label}</span>
                      <span className="data-value">{d.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="meeting-no-item">
              <p>Select an agenda item from the sidebar to see intelligence.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
