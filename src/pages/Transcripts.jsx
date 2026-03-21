import { useMemo, useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, X, Clock, Copy, Check, ExternalLink, ArrowUpDown, Mic, FileText, Play, Loader, Download, AlertCircle, Video } from 'lucide-react'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useData } from '../hooks/useData'
import { useClipboard } from '../hooks/useClipboard'
import ErrorState from '../components/ui/ErrorState'
import CollapsibleSection from '../components/CollapsibleSection'
import './Transcripts.css'

const fmt = (n) => typeof n === 'number' ? n.toLocaleString('en-GB') : '—'

const CLIP_SERVER = 'https://srv1464572.hstgr.cloud'

const CATEGORY_LABELS = {
  attack: 'Attack', defence: 'Defence', promise: 'Promise',
  revelation: 'Revelation', conflict: 'Conflict', policy: 'Policy',
  speech: 'Speech', procedural: 'Procedural', routine: 'Routine',
  finance: 'Finance', governance: 'Governance', housing: 'Housing',
  social_care: 'Social Care', highways: 'Highways', environment: 'Environment',
  reform: 'Reform', political: 'Political', controversy: 'Controversy',
  general: 'General',
}

const CLIP_LABELS = {
  soundbite: 'Soundbite', full_speech: 'Full Speech',
  key_exchange: 'Key Exchange', confrontation: 'Confrontation',
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

function parseTimestamp(ts) {
  if (typeof ts === 'number') return ts
  const parts = String(ts).split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return Number(ts) || 0
}

function formatTimestampInput(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function scoreClass(score) {
  if (score >= 7) return 'tr-score-high'
  if (score >= 4) return 'tr-score-mid'
  return 'tr-score-low'
}

function ScoreRing({ score }) {
  const radius = 13
  const circumference = 2 * Math.PI * radius
  const pct = Math.min(10, score || 0) / 10
  const offset = circumference * (1 - pct)
  const color = scoreColor(score)

  return (
    <div className="tr-score-ring">
      <svg width="32" height="32" viewBox="0 0 32 32">
        <circle className="tr-score-ring-bg" cx="16" cy="16" r={radius} />
        <circle
          className="tr-score-ring-fill"
          cx="16" cy="16" r={radius}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ animation: `tr-score-ring 0.8s ease-out forwards` }}
        />
      </svg>
      <span className="tr-score-ring-text">{score?.toFixed(1) ?? '—'}</span>
    </div>
  )
}

function Waveform() {
  return (
    <span className="tr-waveform">
      <span className="tr-waveform-bar" />
      <span className="tr-waveform-bar" />
      <span className="tr-waveform-bar" />
      <span className="tr-waveform-bar" />
      <span className="tr-waveform-bar" />
    </span>
  )
}

function MomentCard({ moment, meeting, searchTerm, onTopicClick, onCopy, copiedId }) {
  const webcastUrl = meeting?.webcast_url
  const isYouTube = moment.source === 'youtube' || meeting?.source === 'youtube'
  const videoId = moment.video_id || meeting?.video_id
  const tsFormatted = formatTimestamp(moment.start)
  const tsLink = isYouTube && videoId
    ? `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(moment.start)}`
    : webcastUrl ? `${webcastUrl}#currenttime=${Math.floor(moment.start)}` : null
  const [clipState, setClipState] = useState('idle') // idle | loading | ready | error | youtube
  const [clipUrl, setClipUrl] = useState(null)
  const [showTimingEditor, setShowTimingEditor] = useState(false)
  const [clipStart, setClipStart] = useState(formatTimestampInput(moment.start))
  const [clipEnd, setClipEnd] = useState(formatTimestampInput(moment.end))

  const clipDuration = useMemo(() => {
    const s = parseTimestamp(clipStart)
    const e = parseTimestamp(clipEnd)
    return Math.max(0, e - s)
  }, [clipStart, clipEnd])

  const requestClip = useCallback(() => {
    if (clipState === 'loading' || clipState === 'youtube') return

    // YouTube source — use embedded player
    if (isYouTube && videoId) {
      const start = Math.floor(parseTimestamp(clipStart))
      const end = Math.floor(parseTimestamp(clipEnd))
      setClipUrl(`https://www.youtube.com/embed/${videoId}?start=${start}&end=${end}&autoplay=1`)
      setClipState('youtube')
      return
    }

    const start = parseTimestamp(clipStart)
    const end = parseTimestamp(clipEnd)
    if (end <= start) return
    if (end - start > 300) return // 5 min max

    setClipState('loading')

    const meetingId = encodeURIComponent(moment.meeting_id)
    const manifestUrl = `${CLIP_SERVER}/clips/${meetingId}/manifest.json`

    // Step 1: Check manifest for a pre-clip covering this time range
    fetch(manifestUrl, { mode: 'cors' })
      .then(r => r.ok ? r.json() : null)
      .then(manifest => {
        if (manifest?.clips) {
          const match = manifest.clips.find(c =>
            c.start - 5 <= start && c.end + 5 >= end
          )
          if (match) {
            setClipUrl(`${CLIP_SERVER}/clips/${meetingId}/${match.filename}`)
            setClipState('ready')
            return
          }
        }
        // Step 2: No pre-clip — try on-demand extraction (fetch as blob, can take minutes)
        const onDemandUrl = `${CLIP_SERVER}/clip?meeting=${meetingId}&start=${start}&end=${end}`
        return fetch(onDemandUrl, { mode: 'cors' })
          .then(r => {
            if (!r.ok) throw new Error('extraction failed')
            return r.blob()
          })
          .then(blob => {
            const url = URL.createObjectURL(blob)
            setClipUrl(url)
            setClipState('ready')
          })
      })
      .catch(() => {
        setClipState('error')
      })
  }, [moment.meeting_id, clipStart, clipEnd, clipState, isYouTube, videoId])

  const resetTiming = useCallback(() => {
    setClipStart(formatTimestampInput(moment.start))
    setClipEnd(formatTimestampInput(moment.end))
    setClipState('idle')
    if (clipUrl?.startsWith('blob:')) URL.revokeObjectURL(clipUrl)
    setClipUrl(null)
  }, [moment.start, moment.end, clipUrl])

  // Clean up blob URLs on unmount
  useEffect(() => {
    return () => { if (clipUrl?.startsWith('blob:')) URL.revokeObjectURL(clipUrl) }
  }, [clipUrl])

  const [downloading, setDownloading] = useState(false)

  const downloadClip = useCallback(async () => {
    if (downloading) return
    const filename = `clip_${moment.meeting_id}_${Math.floor(moment.start)}s.mp4`

    // YouTube source — extract via clip server
    if (isYouTube && videoId) {
      setDownloading(true)
      try {
        const start = Math.floor(parseTimestamp(clipStart))
        const end = Math.floor(parseTimestamp(clipEnd))
        const url = `${CLIP_SERVER}/ytclip?video=${encodeURIComponent(videoId)}&start=${start}&end=${end}`
        const resp = await fetch(url, { mode: 'cors' })
        if (!resp.ok) throw new Error('extraction failed')
        const blob = await resp.blob()
        const blobUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = filename
        a.click()
        URL.revokeObjectURL(blobUrl)
      } catch {
        // Fallback: open on YouTube
        window.open(`https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(moment.start)}`, '_blank')
      } finally {
        setDownloading(false)
      }
      return
    }

    // Mediasite clip — already loaded
    if (!clipUrl) return
    // Blob URLs can be downloaded directly
    if (clipUrl.startsWith('blob:')) {
      const a = document.createElement('a')
      a.href = clipUrl
      a.download = filename
      a.click()
      return
    }
    // Cross-origin clip server URLs: fetch as blob first
    setDownloading(true)
    try {
      const resp = await fetch(clipUrl, { mode: 'cors' })
      const blob = await resp.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      a.click()
      URL.revokeObjectURL(blobUrl)
    } catch {
      window.open(clipUrl, '_blank')
    } finally {
      setDownloading(false)
    }
  }, [clipUrl, clipStart, clipEnd, moment.meeting_id, moment.start, isYouTube, videoId, downloading])

  // Nudge start/end by seconds
  const nudge = useCallback((field, delta) => {
    if (field === 'start') {
      const v = Math.max(0, parseTimestamp(clipStart) + delta)
      setClipStart(formatTimestampInput(v))
    } else {
      const v = Math.max(0, parseTimestamp(clipEnd) + delta)
      setClipEnd(formatTimestampInput(v))
    }
    // Reset clip if timing changed after extraction
    if (clipState === 'ready') {
      setClipState('idle')
      setClipUrl(null)
    }
  }, [clipStart, clipEnd, clipState])

  const speakerInitial = moment.speaker ? moment.speaker.charAt(0).toUpperCase() : null

  return (
    <div className={`tr-moment ${scoreClass(moment.composite_score)}`}>
      <div className="tr-moment-header">
        {tsLink ? (
          <a href={tsLink} target="_blank" rel="noopener noreferrer" className="tr-timestamp">
            {tsFormatted} <ExternalLink size={10} />
          </a>
        ) : (
          <span className="tr-timestamp">{tsFormatted}</span>
        )}

        {moment.speaker && (
          <span className="tr-speaker-badge">
            <span className="tr-speaker-initial">{speakerInitial}</span>
            {moment.speaker.startsWith('Speaker_') || moment.speaker === 'Chair'
              ? moment.speaker.replace('_', ' ')
              : `Cllr ${moment.speaker}`}
          </span>
        )}

        <span className={`tr-category-badge tr-cat-${moment.category || 'routine'}`}>
          {CATEGORY_LABELS[moment.category] || moment.category}
        </span>

        {moment.clip_type && moment.clip_type !== 'none' && (
          <span className="tr-clip-badge">
            {moment.clip_type === 'soundbite' ? <Waveform /> : <Mic size={10} />}
            {' '}{CLIP_LABELS[moment.clip_type]}
          </span>
        )}

        <div className="tr-score-container">
          <ScoreRing score={moment.composite_score} />
        </div>
      </div>

      <div className="tr-moment-text">
        &ldquo;{highlightText(moment.text, searchTerm)}&rdquo;
      </div>

      {moment.summary && (
        <div className="tr-moment-summary">{moment.summary}</div>
      )}

      {/* Timing editor — adjust clip start/end before extracting */}
      {showTimingEditor && (
        <div className="tr-timing-editor">
          <div className="tr-timing-row">
            <div className="tr-timing-field">
              <label>Start</label>
              <div className="tr-timing-controls">
                <button className="tr-nudge" onClick={() => nudge('start', -10)}>-10s</button>
                <button className="tr-nudge" onClick={() => nudge('start', -5)}>-5s</button>
                <input
                  type="text"
                  className="tr-timing-input"
                  value={clipStart}
                  onChange={e => {
                    setClipStart(e.target.value)
                    if (clipState === 'ready') { setClipState('idle'); setClipUrl(null) }
                  }}
                  placeholder="H:MM:SS"
                />
                <button className="tr-nudge" onClick={() => nudge('start', 5)}>+5s</button>
                <button className="tr-nudge" onClick={() => nudge('start', 10)}>+10s</button>
              </div>
            </div>
            <div className="tr-timing-field">
              <label>End</label>
              <div className="tr-timing-controls">
                <button className="tr-nudge" onClick={() => nudge('end', -10)}>-10s</button>
                <button className="tr-nudge" onClick={() => nudge('end', -5)}>-5s</button>
                <input
                  type="text"
                  className="tr-timing-input"
                  value={clipEnd}
                  onChange={e => {
                    setClipEnd(e.target.value)
                    if (clipState === 'ready') { setClipState('idle'); setClipUrl(null) }
                  }}
                  placeholder="H:MM:SS"
                />
                <button className="tr-nudge" onClick={() => nudge('end', 5)}>+5s</button>
                <button className="tr-nudge" onClick={() => nudge('end', 10)}>+10s</button>
              </div>
            </div>
          </div>
          <div className="tr-timing-info">
            <span>Duration: {clipDuration}s</span>
            {clipDuration > 300 && <span className="tr-timing-warn">Max 5 minutes</span>}
            <button className="tr-timing-reset" onClick={resetTiming}>Reset to suggested</button>
          </div>
        </div>
      )}

      {/* YouTube embed — shown for YouTube-sourced clips */}
      {clipState === 'youtube' && clipUrl && (
        <div className="tr-video-container tr-youtube-container">
          <iframe
            className="tr-youtube-embed"
            src={clipUrl}
            title={`${meeting?.title || 'Meeting'} clip`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
          <div className="tr-video-actions">
            <a href={tsLink} target="_blank" rel="noopener noreferrer" className="tr-download-btn">
              <ExternalLink size={12} /> Open on YouTube
            </a>
            <button className="tr-download-btn" onClick={downloadClip} disabled={downloading}>
              {downloading ? <><Loader size={12} className="spin" /> Extracting...</> : <><Download size={12} /> Download clip</>}
            </button>
            <button className="tr-reclip-btn" onClick={() => { setClipState('idle'); setClipUrl(null) }}>
              Adjust timing
            </button>
          </div>
        </div>
      )}

      {/* Video player — shown when clip is ready (Mediasite source) */}
      {clipState === 'ready' && clipUrl && (
        <div className="tr-video-container">
          <video
            controls
            preload="auto"
            className="tr-video"
            src={clipUrl}
            onError={() => setClipState('error')}
          />
          <div className="tr-video-actions">
            <button className="tr-download-btn" onClick={downloadClip} disabled={downloading}>
              {downloading ? <><Loader size={12} className="spin" /> Downloading...</> : <><Download size={12} /> Download clip</>}
            </button>
            <button className="tr-reclip-btn" onClick={() => { setClipState('idle'); setClipUrl(null) }}>
              Adjust &amp; re-clip
            </button>
          </div>
        </div>
      )}

      {clipState === 'error' && (
        <div className="tr-clip-error">
          <AlertCircle size={14} />
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

        {/* Clip controls */}
        {clipState === 'idle' && (
          <>
            <button className="tr-clip-btn" onClick={() => { setShowTimingEditor(false); requestClip() }}>
              <Play size={12} /> {isYouTube ? 'Watch' : 'Clip'}
            </button>
            <button className="tr-clip-btn" onClick={downloadClip} disabled={downloading} title="Download as MP4">
              {downloading ? <Loader size={12} className="spin" /> : <Download size={12} />}
              {downloading ? ' Extracting...' : ' Download'}
            </button>
            <button
              className="tr-clip-btn tr-clip-edit"
              onClick={() => setShowTimingEditor(!showTimingEditor)}
              title="Adjust clip timing"
            >
              <Clock size={12} /> {showTimingEditor ? 'Hide' : 'Edit timing'}
            </button>
            {showTimingEditor && (
              <button className="tr-clip-btn" onClick={requestClip}>
                <Play size={12} /> {isYouTube ? 'Watch custom clip' : 'Extract custom clip'}
              </button>
            )}
          </>
        )}
        {clipState === 'loading' && (
          <span className="tr-clip-loading">
            <Loader size={12} className="spin" /> Extracting clip — this may take a minute...
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

  // Per-meeting moment counts for the meeting chips
  const meetingMomentCounts = useMemo(() => {
    if (!data?.moments) return {}
    const counts = {}
    for (const m of data.moments) {
      counts[m.meeting_id] = (counts[m.meeting_id] || 0) + 1
    }
    return counts
  }, [data])

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
      {/* Hero */}
      <div className="tr-hero">
        <div className="tr-hero-icon">
          <Video size={24} />
        </div>
        <h1>Meeting Transcripts</h1>
        <div className="tr-hero-accent" />
        <p>AI-powered political intelligence from {councilName} council chamber — every word scored, searchable, and clippable</p>
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

      {/* Meeting Timeline */}
      {(data.meetings || []).length > 0 && (
        <div className="tr-meetings-row">
          <div
            className={`tr-meeting-chip ${!meetingFilter ? 'active' : ''}`}
            onClick={() => setParam('meeting', '')}
          >
            <span className="tr-meeting-dot" />
            <span className="tr-meeting-date">All Meetings</span>
            <span className="tr-meeting-moments">{fmt(data.moments?.length)}</span>
          </div>
          {(data.meetings || []).map(m => (
            <div
              key={m.id}
              className={`tr-meeting-chip ${meetingFilter === m.id ? 'active' : ''}`}
              onClick={() => setParam('meeting', meetingFilter === m.id ? '' : m.id)}
            >
              <span className="tr-meeting-dot" />
              <span className="tr-meeting-date">{m.date}</span>
              <span className="tr-meeting-meta">{m.committee}</span>
              <span className="tr-meeting-moments">{fmt(meetingMomentCounts[m.id] || 0)}</span>
            </div>
          ))}
        </div>
      )}

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
