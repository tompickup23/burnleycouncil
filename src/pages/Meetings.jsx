import { useState, useEffect, useMemo } from 'react'
import { Calendar, Clock, MapPin, ExternalLink, AlertTriangle, ChevronRight, MessageSquare, Filter, Info, FileText } from 'lucide-react'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import { MEETING_TYPE_LABELS as TYPE_LABELS, MEETING_TYPE_COLORS as TYPE_COLORS } from '../utils/constants'
import './Meetings.css'

function formatMeetingDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function formatTime(timeStr) {
  if (!timeStr) return 'TBC'
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h, 10)
  return `${hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

function daysUntil(dateStr) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff < 0) return 'Past'
  return `In ${diff} days`
}

function Meetings() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const { data: meetingsData, loading, error } = useData('/data/meetings.json')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showPast, setShowPast] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    document.title = `Meetings Calendar | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency | Where Your Money Goes` }
  }, [councilName])

  const meetings = useMemo(() => {
    if (!meetingsData?.meetings) return []
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return meetingsData.meetings
      .filter(m => {
        if (!showPast && new Date(m.date + 'T00:00:00') < now && !m.cancelled) return false
        if (m.cancelled && !showPast) return false
        if (typeFilter !== 'all' && m.type !== typeFilter) return false
        return true
      })
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [meetingsData, typeFilter, showPast])

  const meetingTypes = useMemo(() => {
    if (!meetingsData?.meetings) return []
    const types = new Set(meetingsData?.meetings?.map(m => m.type))
    return Array.from(types)
  }, [meetingsData])

  const dogeRelevantCount = useMemo(() => {
    if (!meetingsData?.meetings) return 0
    return meetingsData?.meetings?.filter(m => m.doge_relevance && !m.cancelled)?.length || 0
  }, [meetingsData])

  if (loading) return <LoadingState message="Loading meetings calendar..." />

  if (error || !meetingsData) {
    return (
      <div className="meetings-page animate-fade-in">
        <h1>Meetings Calendar</h1>
        <p>Failed to load meetings data. Please try refreshing.</p>
      </div>
    )
  }

  const howTo = meetingsData.how_to_attend || {}

  return (
    <div className="meetings-page animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <h1>Meetings Calendar</h1>
        <p className="subtitle">
          Upcoming {councilName} Council meetings with agenda analysis and public participation guidance
        </p>
      </div>

      {/* Quick Info Banner */}
      <div className="meetings-info-banner">
        <div className="info-stat">
          <Calendar size={18} />
          <span><strong>{meetings.filter(m => !m.cancelled).length}</strong> upcoming meetings</span>
        </div>
        <div className="info-stat">
          <AlertTriangle size={18} />
          <span><strong>{dogeRelevantCount}</strong> with spending relevance</span>
        </div>
        <div className="info-stat">
          <Clock size={18} />
          <span>Updated {meetingsData.last_updated ? new Date(meetingsData.last_updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'recently'}</span>
        </div>
      </div>

      {/* How to Attend Section */}
      {howTo.general && (
      <details className="how-to-attend">
        <summary>
          <Info size={18} />
          <span>How to attend and speak at council meetings</span>
          <ChevronRight size={16} className="chevron" />
        </summary>
        <div className="how-to-content">
          <div className="how-to-grid">
            <div className="how-to-card">
              <h4><MapPin size={16} /> Attending</h4>
              <p>{howTo.general}</p>
            </div>
            <div className="how-to-card">
              <h4><MessageSquare size={16} /> Speaking</h4>
              <p>{howTo.speak_at_meeting}</p>
            </div>
            {howTo.deadlines && (
            <div className="how-to-card">
              <h4><Clock size={16} /> Registration Deadlines</h4>
              <ul>
                <li><strong>Full Council, Executive, Scrutiny:</strong> {howTo.deadlines.full_council}</li>
                <li><strong>Planning & Licensing:</strong> {howTo.deadlines.development_control}</li>
              </ul>
            </div>
            )}
            <div className="how-to-card">
              <h4><FileText size={16} /> Public Questions</h4>
              <p>{howTo.public_questions}</p>
            </div>
          </div>
          {howTo.tips && (
          <div className="how-to-tips">
            <strong>Tips:</strong> {howTo.tips}
          </div>
          )}
          {howTo.contact && (
          <div className="how-to-contact">
            Contact: <a href={`mailto:${howTo.contact}`}>{howTo.contact}</a>
          </div>
          )}
        </div>
      </details>
      )}

      {/* Filters */}
      <div className="meetings-filters">
        <div className="type-filters">
          <Filter size={16} />
          <button
            className={`filter-pill ${typeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setTypeFilter('all')}
          >
            All
          </button>
          {meetingTypes.map(type => (
            <button
              key={type}
              className={`filter-pill ${typeFilter === type ? 'active' : ''}`}
              onClick={() => setTypeFilter(type)}
              style={typeFilter === type ? { background: TYPE_COLORS[type], borderColor: TYPE_COLORS[type] } : {}}
            >
              {TYPE_LABELS[type] || type}
            </button>
          ))}
        </div>
        <label className="show-past-toggle">
          <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} />
          Show past & cancelled
        </label>
      </div>

      {/* Meetings List */}
      <div className="meetings-list" aria-label="Meeting calendar">
        {meetings.length === 0 && (
          <div className="no-meetings">No meetings match your filters.</div>
        )}

        {meetings.map(meeting => {
          const isExpanded = expandedId === meeting.id
          const countdown = daysUntil(meeting.date)
          const isPast = countdown === 'Past'
          const isToday = countdown === 'Today'
          const isTomorrow = countdown === 'Tomorrow'

          return (
            <article
              key={meeting.id}
              className={`meeting-card ${meeting.cancelled ? 'cancelled' : ''} ${isPast ? 'past' : ''} ${isToday ? 'today' : ''} ${isExpanded ? 'expanded' : ''}`}
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
              onClick={() => setExpandedId(isExpanded ? null : meeting.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isExpanded ? null : meeting.id) } }}
            >
              <div className="meeting-header">
                <div className="meeting-date-block">
                  <span className="meeting-day">{new Date(meeting.date + 'T00:00:00').getDate()}</span>
                  <span className="meeting-month">{new Date(meeting.date + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short' })}</span>
                </div>

                <div className="meeting-info">
                  <div className="meeting-title-row">
                    <h3 className="meeting-title">{meeting.committee}</h3>
                    <span
                      className="meeting-type-badge"
                      style={{ background: `${TYPE_COLORS[meeting.type]}20`, color: TYPE_COLORS[meeting.type], borderColor: `${TYPE_COLORS[meeting.type]}40` }}
                    >
                      {TYPE_LABELS[meeting.type] || meeting.type}
                    </span>
                  </div>

                  <div className="meeting-meta">
                    {meeting.cancelled ? (
                      <span className="meeting-cancelled-badge">CANCELLED</span>
                    ) : (
                      <>
                        <span className="meta-item"><Clock size={14} /> {formatTime(meeting.time)}</span>
                        {meeting.venue && <span className="meta-item"><MapPin size={14} /> {meeting.venue}</span>}
                        <span className={`countdown-badge ${isToday ? 'today' : ''} ${isTomorrow ? 'soon' : ''}`}>
                          {countdown}
                        </span>
                      </>
                    )}
                  </div>

                  {meeting.status === 'agenda_published' && (
                    <span className="agenda-badge">Agenda Published</span>
                  )}
                </div>

                <div className="meeting-indicators">
                  {meeting.doge_relevance && <span className="doge-indicator" title="Spending relevance identified">£</span>}
                  <ChevronRight size={18} className={`expand-icon ${isExpanded ? 'rotated' : ''}`} />
                </div>
              </div>

              {isExpanded && !meeting.cancelled && (
                <div className="meeting-details">
                  <div className="meeting-detail-section">
                    <h4>Summary</h4>
                    <p>{meeting.summary}</p>
                  </div>

                  {meeting.agenda_items?.length > 0 && (
                    <div className="meeting-detail-section">
                      <h4>Agenda Items</h4>
                      <ul className="agenda-list">
                        {meeting.agenda_items.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="meeting-detail-section">
                    <h4>Public Relevance</h4>
                    <p>{meeting.public_relevance}</p>
                  </div>

                  {meeting.doge_relevance && (
                    <div className="meeting-detail-section doge-section">
                      <h4><AlertTriangle size={16} /> Spending & Accountability</h4>
                      <p>{meeting.doge_relevance}</p>
                    </div>
                  )}

                  {meeting.speak_deadline && (
                    <div className="speak-deadline">
                      <MessageSquare size={14} />
                      <span>Register to speak by: <strong>{meeting.speak_deadline}</strong></span>
                    </div>
                  )}

                  {meeting.documents?.length > 0 && (
                    <div className="meeting-detail-section">
                      <h4>Published Documents</h4>
                      <div className="doc-list">
                        {meeting.documents.map((doc, i) => (
                          <span key={i} className="doc-badge"><FileText size={12} /> {doc}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="meeting-actions">
                    {meeting.link && (
                      <a
                        href={meeting.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="meeting-link"
                        onClick={e => e.stopPropagation()}
                      >
                        <ExternalLink size={14} />
                        View on ModernGov
                      </a>
                    )}
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>

      {/* Data Source Note */}
      <div className="meetings-source">
        <p>
          Meeting data sourced from the <a href={config.moderngov_url || '#'} target="_blank" rel="noopener noreferrer">{councilName} Council ModernGov portal</a>.
          Updated weekly. Agendas are typically published 5 working days before each meeting.
          {meetingsData?.last_updated && ` Last checked: ${formatMeetingDate(meetingsData.last_updated.split('T')[0])}.`}
        </p>
      </div>
    </div>
  )
}

export default Meetings
