/**
 * GlobalSearch — Cmd+K / Ctrl+K search modal.
 *
 * Searches across: councillor names, supplier names, ward names,
 * article titles, DOGE findings. Results grouped by type with icons.
 *
 * Props:
 *   isOpen {boolean}
 *   onClose {function}
 *   councillors {array} - [{name, id, ward, party}]
 *   suppliers {array} - [{name}]
 *   wards {array} - [{name}]
 *   articles {array} - [{title, id}]
 *   properties {array} - [{id, name, address, postcode, category}]
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

const MAX_RESULTS = 12

function searchItems(query, items, type, getLabel, getPath) {
  if (!items || !query) return []
  const q = query.toLowerCase()
  return items
    .filter(item => getLabel(item).toLowerCase().includes(q))
    .slice(0, 5)
    .map(item => ({
      type,
      label: getLabel(item),
      path: getPath(item),
      item,
    }))
}

const TYPE_ICONS = {
  councillor: '👤',
  supplier: '🏢',
  ward: '📍',
  article: '📰',
  property: '🏛️',
}

export default function GlobalSearch({ isOpen, onClose, councillors, suppliers, wards, articles, properties }) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Search results
  const results = useMemo(() => {
    if (!query || query.length < 2) return []
    const r = [
      ...searchItems(query, councillors, 'councillor', c => c.name, c => `/councillor/${c.id}`),
      ...searchItems(query, suppliers, 'supplier', s => s.name || s, s => `/spending?supplier=${encodeURIComponent(s.name || s)}`),
      ...searchItems(query, wards, 'ward', w => w.name || w, w => `/my-area?ward=${encodeURIComponent(w.name || w)}`),
      ...searchItems(query, articles, 'article', a => a.title, a => `/news?article=${a.id || a.slug}`),
      ...searchItems(query, properties, 'property',
        p => `${p.name || ''}${p.postcode ? ' (' + p.postcode + ')' : ''}`,
        p => `/property/${p.id}`),
    ]
    return r.slice(0, MAX_RESULTS)
  }, [query, councillors, suppliers, wards, articles, properties])

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      e.preventDefault()
      navigate(results[selectedIdx].path)
      onClose()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }, [results, selectedIdx, navigate, onClose])

  // Global keyboard shortcut
  useEffect(() => {
    function handleGlobalKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (isOpen) {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleGlobalKey)
    return () => window.removeEventListener('keydown', handleGlobalKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="global-search-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '20vh',
      }}
    >
      <div
        className="global-search-modal glass-card"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '520px',
          borderRadius: '12px',
          border: '1px solid var(--border-color, #334155)',
          background: 'var(--card-bg, rgba(15, 23, 42, 0.95))',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Search Input */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color, #334155)' }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIdx(0) }}
            onKeyDown={handleKeyDown}
            placeholder="Search councillors, suppliers, wards, properties..."
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary, #e2e8f0)',
              fontSize: '0.9rem',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
            {results.map((result, i) => (
              <button
                key={`${result.type}-${i}`}
                onClick={() => { navigate(result.path); onClose() }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '10px 16px',
                  border: 'none',
                  background: i === selectedIdx
                    ? 'rgba(10, 132, 255, 0.15)'
                    : 'transparent',
                  color: 'var(--text-primary, #e2e8f0)',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>
                  {TYPE_ICONS[result.type] || '📄'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {result.label}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary, #64748b)', textTransform: 'capitalize' }}>
                    {result.type}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {query.length >= 2 && results.length === 0 && (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            No results for &ldquo;{query}&rdquo;
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--border-color, #334155)',
          fontSize: '0.6rem',
          color: 'var(--text-secondary, #64748b)',
          display: 'flex',
          gap: '12px',
        }}>
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  )
}
