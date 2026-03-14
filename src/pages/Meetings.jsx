import { useState, useEffect, useMemo } from 'react'
import { Calendar, Clock, MapPin, ExternalLink, AlertTriangle, ChevronRight, MessageSquare, Filter, Info, FileText, Users } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import CouncillorLink from '../components/CouncillorLink'
import HeatmapGrid from '../components/ui/HeatmapGrid'
import ChartCard from '../components/ui/ChartCard'
import { slugify } from '../utils/format'
import { MEETING_TYPE_LABELS as TYPE_LABELS, MEETING_TYPE_COLORS as TYPE_COLORS, CHART_COLORS, TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE, CHART_ANIMATION } from '../utils/constants'
import '../components/ui/AdvancedCharts.css'
import './Meetings.css'

function formatMeetingDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function formatTime(timeStr) {
  if (!timeStr) return 'TBC'
  const parts = timeStr.split(':')
  if (parts.length < 2) return timeStr
  const hour = parseInt(parts[0], 10)
  const min = parts[1] || '00'
  if (isNaN(hour)) return timeStr
  const displayHour = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour)
  return `${displayHour}:${min} ${hour >= 12 ? 'PM' : 'AM'}`
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

// Auto-detect spending relevance from agenda items when ETL hasn't set it
const SPENDING_KEYWORDS = /budget|revenue|capital|treasury|fee|charge|spend|financial|expenditure|procurement|contract|tender|grant|borrowing|reserves?|precept|council\s*tax|medium.term|estimates|accounts|audit|efficiency|savings|funding|levy|tariff|MRP|prudential/i

function detectDogeRelevance(meeting) {
  if (meeting.doge_relevance) return meeting.doge_relevance
  if (!meeting.agenda_items?.length) return null
  const matches = meeting.agenda_items.filter(item => SPENDING_KEYWORDS.test(typeof item === 'object' ? item.title || '' : item))
  if (matches.length === 0) return null
  const labels = matches.map(m => typeof m === 'object' ? m.title || '' : m)
  return `This meeting has ${matches.length} agenda item${matches.length > 1 ? 's' : ''} with spending relevance: ${labels.slice(0, 4).join('; ')}${matches.length > 4 ? ` (+${matches.length - 4} more)` : ''}.`
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
    return meetingsData.meetings.filter(m => !m.cancelled && detectDogeRelevance(m)).length
  }, [meetingsData])

  // ── Chart Data: Meetings Per Month ──
  const monthlyChartData = useMemo(() => {
    if (!meetingsData?.meetings) return []
    const counts = {}
    meetingsData.meetings.forEach(m => {
      if (m.cancelled) return
      const monthKey = m.date.slice(0, 7) // 'YYYY-MM'
      counts[monthKey] = (counts[monthKey] || 0) + 1
    })
    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => {
        const d = new Date(month + '-01')
        return {
          month,
          label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
          count,
        }
      })
  }, [meetingsData])

  // ── Chart Data: Meeting Type Distribution ──
  const typeDistributionData = useMemo(() => {
    if (!meetingsData?.meetings) return []
    const counts = {}
    meetingsData.meetings.forEach(m => {
      if (m.cancelled) return
      const type = m.type || 'other'
      counts[type] = (counts[type] || 0) + 1
    })
    return Object.entries(counts)
      .map(([type, count]) => ({
        type,
        name: TYPE_LABELS[type] || type,
        count,
        color: TYPE_COLORS[type] || '#8e8e93',
      }))
      .sort((a, b) => b.count - a.count)
  }, [meetingsData])

  // ── Chart Data: Calendar Heatmap ──
  const calendarHeatmapData = useMemo(() => {
    if (!meetingsData?.meetings) return []
    return meetingsData.meetings
      .filter(m => !m.cancelled && m.date)
      .map(m => ({ date: m.date, value: 1 }))
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

      {/* Meeting Analytics Charts */}
      {meetingsData?.meetings?.length > 0 && (
        <div className="meetings-charts-section">
          <div className="charts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            {/* Meetings Per Month BarChart */}
            {monthlyChartData.length > 0 && (
              <ChartCard title="Meetings Per Month" description="Distribution of council meetings across months">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={monthlyChartData} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
                    <YAxis tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value) => [`${value} meeting${value !== 1 ? 's' : ''}`, 'Count']}
                      labelFormatter={(label) => label}
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    />
                    <Bar
                      dataKey="count"
                      fill="#12B6CF"
                      radius={[4, 4, 0, 0]}
                      animationDuration={CHART_ANIMATION.duration}
                      animationEasing={CHART_ANIMATION.easing}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* Meeting Type Distribution PieChart */}
            {typeDistributionData.length > 0 && (
              <ChartCard title="Meeting Types" description="Breakdown by committee type">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={typeDistributionData}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={85}
                      innerRadius={40}
                      paddingAngle={2}
                      animationDuration={CHART_ANIMATION.duration}
                      animationEasing={CHART_ANIMATION.easing}
                    >
                      {typeDistributionData.map((entry, i) => (
                        <Cell key={entry.type} fill={entry.color} stroke="rgba(0,0,0,0.3)" strokeWidth={1} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value, name) => [`${value} meeting${value !== 1 ? 's' : ''}`, name]}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: '11px', color: '#8e8e93' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>

          {/* Meeting Calendar Heatmap — full width */}
          {calendarHeatmapData.length > 0 && (
            <ChartCard title="Meeting Calendar" description="Activity heatmap -- brighter cells indicate more meetings on that day" wide>
              <HeatmapGrid
                data={calendarHeatmapData}
                colorScale="intensity"
                cellSize={14}
                cellGap={2}
                formatValue={(v) => `${v} meeting${v !== 1 ? 's' : ''}`}
              />
            </ChartCard>
          )}
        </div>
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

      {/* Spending-Relevant Meetings Highlight */}
      {(() => {
        const spendingMeetings = meetings.filter(m => !m.cancelled && detectDogeRelevance(m))
        if (spendingMeetings.length === 0 || showPast) return null
        return (
          <div className="spending-meetings-highlight" style={{ background: 'rgba(255,159,10,0.06)', border: '1px solid rgba(255,159,10,0.2)', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ff9f0a', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={16} /> Meetings About Your Money
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
              {spendingMeetings.length} upcoming meeting{spendingMeetings.length > 1 ? 's' : ''} will discuss spending, budgets, or contracts.
              Your council is making decisions about your money — here&rsquo;s how to have your say.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {spendingMeetings.slice(0, 3).map(m => (
                <div key={m.id} style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.04)', padding: '0.5rem 0.75rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                >
                  <span><strong>{m.committee}</strong> — {formatMeetingDate(m.date)}</span>
                  <span style={{ color: '#ff9f0a', fontSize: '0.75rem' }}>{daysUntil(m.date)}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

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
                  {detectDogeRelevance(meeting) && <span className="doge-indicator" title="Spending relevance identified">£</span>}
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
                          <li key={i}>{typeof item === 'object' ? (item.title || item.name || '') : item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="meeting-detail-section">
                    <h4>Public Relevance</h4>
                    <p>{meeting.public_relevance}</p>
                  </div>

                  {detectDogeRelevance(meeting) && (
                    <div className="meeting-detail-section doge-section">
                      <h4><AlertTriangle size={16} /> Spending & Accountability</h4>
                      <p>{detectDogeRelevance(meeting)}</p>
                    </div>
                  )}

                  {meeting.speak_deadline && (
                    <div className="speak-deadline">
                      <MessageSquare size={14} />
                      <span>Register to speak by: <strong>{meeting.speak_deadline}</strong></span>
                    </div>
                  )}

                  {meeting.committee_members?.length > 0 && (
                    <div className="meeting-detail-section">
                      <h4><Users size={16} /> Committee Members</h4>
                      <div className="committee-members-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                        {meeting.committee_members.map((member, i) => (
                          <span key={i} className="committee-member-chip" style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <CouncillorLink name={member.name || member} councillorId={slugify(member.name || member)} compact />
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {meeting.documents?.length > 0 && (
                    <div className="meeting-detail-section">
                      <h4>Published Documents</h4>
                      <div className="doc-list">
                        {meeting.documents.map((doc, i) => {
                          const title = typeof doc === 'object' ? (doc.title || doc.name || 'Document') : doc
                          const url = typeof doc === 'object' ? doc.url : null
                          return url ? (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="doc-badge" onClick={e => e.stopPropagation()} style={{ textDecoration: 'none', color: 'inherit' }}>
                              <FileText size={12} /> {title} <ExternalLink size={10} />
                            </a>
                          ) : (
                            <span key={i} className="doc-badge"><FileText size={12} /> {title}</span>
                          )
                        })}
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
          Meeting data sourced from {config.moderngov_url ? <a href={config.moderngov_url} target="_blank" rel="noopener noreferrer">{councilName} Council ModernGov portal</a> : `the ${councilName} Council ModernGov portal`}.
          Updated weekly. Agendas are typically published 5 working days before each meeting.
          {meetingsData?.last_updated && ` Last checked: ${formatMeetingDate(meetingsData.last_updated.split('T')[0])}.`}
        </p>
      </div>
    </div>
  )
}

export default Meetings
