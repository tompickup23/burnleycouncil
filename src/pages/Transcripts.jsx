import { useMemo, useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, X, Clock, Copy, Check, ExternalLink, ArrowUpDown, Mic, FileText, Play, Loader, Download } from 'lucide-react'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useData } from '../hooks/useData'
import { useClipboard } from '../hooks/useClipboard'
import ErrorState from '../components/ui/ErrorState'
import CollapsibleSection from '../components/CollapsibleSection'
import './Transcripts.css'

const fmt = (n) => typeof n === 'number' ? n.toLocaleString('en-GB') : '—'

const CLIP_SERVER = 'http://46.202.140.7:8420'

const CATEGORY_LABELS = {
  attack: 'Attack', defence: 'Defence', promise: 'Promise',
  revelation: 'Revelation', conflict: 'Conflict', policy: 'Policy',
  speech: 'Speech', procedural: 'Procedural', routine: 'Routine',
}

const CLIP_LABELS = {
  soundbite: 'Soundbite', full_speech: 'Full Speech',
  archive: 'Archive', none: '—',
}

function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function highlightText(text, term) {
  if (!term || term.length < 2) return text
  try {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === term.toLowerCase()
        ? <mark key={i}>{part}</mark>
        : part
    )
  } catch {
    return text
  }
}

function scoreColor(score) {
  if (score >= 8) return '#30d158'
  if (score >= 6) return '#ff9f0a'
  if (score >= 4) return '#ffd60a'
  return '#636366'
}

function MomentCard({ moment, meeting, searchTerm, onTopicClick, onCopy, copiedId }) {
  const webcastUrl = meeting?.webcast_url
  const tsFormatted = formatTimestamp(moment.start)
  const tsLink = webcastUrl ? `${webcastUrl}#t=${Math.floor(moment.start)}` : null
  const [clipState, setClipState] = useState('idle') // idle | loading | ready | error
  const [clipUrl, setClipUrl] = useState(null)

  const requestClip = useCallback(() => {
    if (clipState === 'loading') return
    setClipState('loading')

    // Build on-demand clip URL
    const url = `${CLIP_SERVER}/clip?meeting=${encodeURIComponent(moment.meeting_id)}&start=${moment.start}&end=${moment.end}`

    // Test if clip server is reachable, then set URL for video element
    fetch(`${CLIP_SERVER}/health`, { mode: 'cors' })
      .then(r => {
        if (r.ok) {
          setClipUrl(url)
          setClipState('ready')
        } else {
          setClipState('error')
        }
      })
      .catch(() => setClipState('error'))
  }, [moment, clipState])

  return (
    <div className="tr-moment">
      <div className="tr-moment-header">
        {tsLink ? (
          <a href={tsLink} target="_blank" rel="noopener noreferrer" className="tr-timestamp">
            {tsFormatted} <ExternalLink size={10} />
          </a>
        ) : (
          <span className="tr-timestamp">{tsFormatted}</span>
        )}

        {moment.speaker && (
          <span className="tr-speaker-badge">Cllr {moment.speaker}</span>
        )}

        <span className={`tr-category-badge tr-cat-${moment.category || 'routine'}`}>
          {CATEGORY_LABELS[moment.category] || moment.category}
        </span>

        {moment.clip_type && moment.clip_type !== 'none' && (
          <span className="tr-clip-badge">
            <Mic size={10} /> {CLIP_LABELS[moment.clip_type]}
          </span>
        )}

        <span className="tr-score">
          {moment.composite_score?.toFixed(1)}
          <span className="tr-score-bar">
            <span
              className="tr-score-fill"
              style={{
                width: `${(moment.composite_score || 0) * 10}%`,
                background: scoreColor(moment.composite_score),
              }}
            />
          </span>
        </span>
      </div>

      <div className="tr-moment-text">
        &ldquo;{highlightText(moment.text, searchTerm)}&rdquo;
      </div>

      {moment.summary && (
        <div className="tr-moment-summary">{moment.summary}</div>
      )}

      {/* Video player — shown when clip is ready */}
      {clipState === 'ready' && clipUrl && (
        <div className="tr-video-container">
          <video
            controls
            preload="auto"
            className="tr-video"
            src={clipUrl}
            onError={() => setClipState('error')}
          />
          <a href={clipUrl} download className="tr-download-btn">
            <Download size={12} /> Download clip
          </a>
        </div>
      )}

      {clipState === 'error' && (
        <div className="tr-clip-error">
          Clip extraction failed — try the webcast link instead
        </div>
      )}

      <div className="tr-moment-footer">
        {(moment.topics || []).slice(0, 6).map(topic => (
          <span
            key={topic}
            className="tr-topic-tag"
            onClick={() => onTopicClick(topic)}
          >
            {topic.replace(/_/g, ' ')}
          </span>
        ))}

        {/* Clip button */}
        {clipState === 'idle' && (
          <button className="tr-clip-btn" onClick={requestClip}>
            <Play size={12} /> Clip
          </button>
        )}
        {clipState === 'loading' && (
          <span className="tr-clip-loading">
            <Loader size={12} className="spin" /> Extracting...
          </span>
        )}

        <button
          className={`tr-copy-btn ${copiedId === moment.id ? 'copied' : ''}`}
          onClick={() => onCopy(moment)}
        >
          {copiedId === moment.id ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>
      </div>
    </div>
  )
}


export default function Transcripts() {
  // === ALL HOOKS BEFORE CONDITIONAL RETURNS ===
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'

  const { data, loading, error } = useData('/data/transcripts.json')
  const [searchParams, setSearchParams] = useSearchParams()
  const { copy } = useClipboard()
  const [copiedId, setCopiedId] = useState(null)
  const [visibleCount, setVisibleCount] = useState(50)

  // Read filters from URL
  const q = searchParams.get('q') || ''
  const meetingFilter = searchParams.get('meeting') || ''
  const categoryFilter = searchParams.get('category') || ''
  const clipFilter = searchParams.get('clip') || ''
  const speakerFilter = searchParams.get('speaker') || ''
  const topicFilter = searchParams.get('topic') || ''
  const minScore = searchParams.get('minScore') || ''
  const sortField = searchParams.get('sort') || 'score'
  const sortDir = searchParams.get('dir') || 'desc'

  // Filter helpers
  const setParam = useCallback((key, value) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (value) {
        next.set(key, value)
      } else {
        next.delete(key)
      }
      return next
    }, { replace: true })
    setVisibleCount(50) // Reset pagination on filter change
  }, [setSearchParams])

  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true })
    setVisibleCount(50)
  }, [setSearchParams])

  // Page title
  useEffect(() => {
    document.title = `Meeting Transcripts | ${councilName} Transparency`
    return () => { document.title = `${councilName} Transparency` }
  }, [councilName])

  // Derive filter options from data
  const filterOptions = useMemo(() => {
    if (!data?.moments) return { meetings: [], categories: [], speakers: [], clipTypes: [] }
    const meetings = (data.meetings || []).map(m => ({ id: m.id, label: `${m.committee} — ${m.date}` }))
    const categories = [...new Set(data.moments.map(m => m.category).filter(Boolean))]
    const speakers = [...new Set(data.moments.map(m => m.speaker).filter(Boolean))].sort()
    const clipTypes = [...new Set(data.moments.map(m => m.clip_type).filter(t => t && t !== 'none'))]
    return { meetings, categories, speakers, clipTypes }
  }, [data])

  // Filter + sort moments
  const filteredMoments = useMemo(() => {
    if (!data?.moments) return []
    let results = data.moments

    if (q) {
      const lower = q.toLowerCase()
      results = results.filter(m =>
        m.text.toLowerCase().includes(lower) ||
        (m.topics || []).some(t => t.toLowerCase().includes(lower)) ||
        (m.speaker || '').toLowerCase().includes(lower) ||
        (m.summary || '').toLowerCase().includes(lower)
      )
    }
    if (meetingFilter) results = results.filter(m => m.meeting_id === meetingFilter)
    if (categoryFilter) results = results.filter(m => m.category === categoryFilter)
    if (clipFilter) results = results.filter(m => m.clip_type === clipFilter)
    if (speakerFilter) results = results.filter(m => m.speaker === speakerFilter)
    if (topicFilter) results = results.filter(m => (m.topics || []).includes(topicFilter))
    if (minScore) results = results.filter(m => (m.composite_score || 0) >= Number(minScore))

    const dir = sortDir === 'asc' ? 1 : -1
    if (sortField === 'time') {
      results = [...results].sort((a, b) => dir * (a.start - b.start))
    } else {
      results = [...results].sort((a, b) => dir * ((a.composite_score || 0) - (b.composite_score || 0)))
    }

    return results
  }, [data, q, meetingFilter, categoryFilter, clipFilter, speakerFilter, topicFilter, minScore, sortField, sortDir])

  // Topic cloud data
  const topicCloud = useMemo(() => {
    if (!data?.topic_index) return []
    return Object.entries(data.topic_index)
      .map(([topic, mentions]) => ({ topic, count: mentions.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 60)
  }, [data])

  // Meeting lookup
  const meetingMap = useMemo(() => {
    if (!data?.meetings) return {}
    const map = {}
    for (const m of data.meetings) map[m.id] = m
    return map
  }, [data])

  // Active filters
  const activeFilters = useMemo(() => {
    const filters = []
    if (q) filters.push({ key: 'q', label: `Search: "${q}"` })
    if (meetingFilter) filters.push({ key: 'meeting', label: `Meeting: ${meetingFilter.split('-').slice(2).join(' ')}` })
    if (categoryFilter) filters.push({ key: 'category', label: CATEGORY_LABELS[categoryFilter] || categoryFilter })
    if (clipFilter) filters.push({ key: 'clip', label: CLIP_LABELS[clipFilter] || clipFilter })
    if (speakerFilter) filters.push({ key: 'speaker', label: `Cllr ${speakerFilter}` })
    if (topicFilter) filters.push({ key: 'topic', label: topicFilter.replace(/_/g, ' ') })
    if (minScore) filters.push({ key: 'minScore', label: `Score ${minScore}+` })
    return filters
  }, [q, meetingFilter, categoryFilter, clipFilter, speakerFilter, topicFilter, minScore])

  // Copy handler
  const handleCopy = useCallback((moment) => {
    const meeting = meetingMap[moment.meeting_id]
    const ts = formatTimestamp(moment.start)
    const speaker = moment.speaker ? `Cllr ${moment.speaker}` : 'Unknown speaker'
    const text = `"${moment.text}"\n— ${speaker}, ${meeting?.committee || 'Meeting'} ${meeting?.date || ''} [${ts}]`
    copy(text)
    setCopiedId(moment.id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [meetingMap, copy])

  // === LOADING/ERROR GUARDS ===
  if (loading) return <div className="page-loading"><div className="spinner" /></div>
  if (error || !data) return <ErrorState title="Unable to load transcripts" error={error} />

  const stats = data.stats || {}
  const visibleMoments = filteredMoments.slice(0, visibleCount)
  const hasMore = visibleCount < filteredMoments.length

  return (
    <div className="transcripts-page">
      <div className="tr-hero">
        <h1><FileText size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />Meeting Transcripts</h1>
        <p>Searchable archive of {councilName} council meeting transcripts with political intelligence scoring</p>
      </div>

      {/* Stats */}
      <div className="tr-stats">
        <div className="tr-stat">
          <span className="value">{fmt(stats.total_meetings)}</span>
          <span className="label">Meetings</span>
        </div>
        <div className="tr-stat">
          <span className="value">{fmt(stats.total_moments)}</span>
          <span className="label">Moments</span>
        </div>
        <div className="tr-stat">
          <span className="value">{fmt(stats.total_soundbites)}</span>
          <span className="label">Soundbites</span>
        </div>
        <div className="tr-stat">
          <span className="value">{fmt(stats.total_topics)}</span>
          <span className="label">Topics</span>
        </div>
        <div className="tr-stat">
          <span className="value">{fmt(stats.total_high_value)}</span>
          <span className="label">High Value</span>
        </div>
        <div className="tr-stat">
          <span className="value">{stats.total_duration_hours}h</span>
          <span className="label">Transcribed</span>
        </div>
      </div>

      {/* Filters */}
      <div className="tr-filters">
        <div className="tr-search">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search transcripts, topics, speakers..."
            value={q}
            onChange={e => setParam('q', e.target.value)}
          />
        </div>

        {filterOptions.meetings.length > 1 && (
          <select className="tr-filter-select" value={meetingFilter} onChange={e => setParam('meeting', e.target.value)}>
            <option value="">All Meetings</option>
            {filterOptions.meetings.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        )}

        <select className="tr-filter-select" value={categoryFilter} onChange={e => setParam('category', e.target.value)}>
          <option value="">All Categories</option>
          {filterOptions.categories.map(c => (
            <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>
          ))}
        </select>

        <select className="tr-filter-select" value={clipFilter} onChange={e => setParam('clip', e.target.value)}>
          <option value="">All Clip Types</option>
          {filterOptions.clipTypes.map(c => (
            <option key={c} value={c}>{CLIP_LABELS[c] || c}</option>
          ))}
        </select>

        {filterOptions.speakers.length > 0 && (
          <select className="tr-filter-select" value={speakerFilter} onChange={e => setParam('speaker', e.target.value)}>
            <option value="">All Speakers</option>
            {filterOptions.speakers.map(s => (
              <option key={s} value={s}>Cllr {s}</option>
            ))}
          </select>
        )}

        <select className="tr-filter-select" value={minScore} onChange={e => setParam('minScore', e.target.value)}>
          <option value="">Any Score</option>
          <option value="7">7+ (High Value)</option>
          <option value="5">5+ (Notable)</option>
          <option value="3">3+ (All Scored)</option>
        </select>

        {activeFilters.length > 0 && (
          <button className="tr-clear-btn" onClick={clearFilters}>
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {/* Active filter pills */}
      {activeFilters.length > 0 && (
        <div className="tr-pills">
          {activeFilters.map(f => (
            <span key={f.key} className="tr-pill" onClick={() => setParam(f.key, '')}>
              {f.label} <X size={10} />
            </span>
          ))}
        </div>
      )}

      {/* Results header */}
      <div className="tr-results-header">
        <span className="tr-results-count">
          {filteredMoments.length === data.moments.length
            ? `${fmt(filteredMoments.length)} moments`
            : `${fmt(filteredMoments.length)} of ${fmt(data.moments.length)} moments`
          }
        </span>
        <button
          className="tr-sort-btn"
          onClick={() => {
            if (sortField === 'score') {
              setParam('sort', 'time')
              setParam('dir', 'asc')
            } else {
              setParam('sort', 'score')
              setParam('dir', 'desc')
            }
          }}
        >
          <ArrowUpDown size={14} />
          {sortField === 'time' ? 'By time' : 'By score'}
        </button>
      </div>

      {/* Results */}
      {visibleMoments.length === 0 ? (
        <div className="tr-empty">
          <h3>No moments match your filters</h3>
          <p>Try broadening your search or clearing filters</p>
        </div>
      ) : (
        <>
          {visibleMoments.map(moment => (
            <MomentCard
              key={moment.id}
              moment={moment}
              meeting={meetingMap[moment.meeting_id]}
              searchTerm={q}
              onTopicClick={topic => setParam('topic', topic)}
              onCopy={handleCopy}
              copiedId={copiedId}
            />
          ))}

          {hasMore && (
            <button
              className="tr-load-more"
              onClick={() => setVisibleCount(prev => prev + 50)}
            >
              Show more ({filteredMoments.length - visibleCount} remaining)
            </button>
          )}
        </>
      )}

      {/* Topic Cloud */}
      <CollapsibleSection
        title="Topic Index"
        subtitle={`${topicCloud.length} topics across all meetings`}
        icon={<Clock size={18} />}
        defaultOpen={false}
      >
        <div className="tr-topic-cloud">
          {topicCloud.map(({ topic, count }) => (
            <span
              key={topic}
              className={`tr-cloud-tag ${topicFilter === topic ? 'active' : ''}`}
              style={{ fontSize: `${Math.max(0.7, Math.min(1.2, 0.7 + count / 20))}rem` }}
              onClick={() => setParam('topic', topicFilter === topic ? '' : topic)}
            >
              {topic.replace(/_/g, ' ')} ({count})
            </span>
          ))}
        </div>
      </CollapsibleSection>
    </div>
  )
}
