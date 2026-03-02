import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, Check, X } from 'lucide-react'
import { LANCASHIRE_COUNCILS, COUNCIL_SLUG_MAP, COUNCIL_COLORS } from '../utils/constants'
import './CouncilPicker.css'

const TIER_LABELS = {
  district: 'District Councils',
  county: 'County Council',
  unitary: 'Unitary Authorities',
}

const TIER_ORDER = ['district', 'county', 'unitary']

function CouncilPicker({ currentCouncilId, onClose }) {
  const [query, setQuery] = useState('')
  const panelRef = useRef(null)
  const inputRef = useRef(null)

  // Focus search input on mount
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [])

  // Click-outside to close
  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Escape key to close
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Filter councils by search query
  const filtered = useMemo(() => {
    if (!query.trim()) return LANCASHIRE_COUNCILS
    const q = query.toLowerCase().trim()
    return LANCASHIRE_COUNCILS.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.id.replace(/_/g, ' ').toLowerCase().includes(q)
    )
  }, [query])

  // Group filtered councils by tier
  const grouped = useMemo(() => {
    const groups = {}
    for (const tier of TIER_ORDER) {
      const councils = filtered.filter(c => c.tier === tier)
      if (councils.length > 0) {
        groups[tier] = councils
      }
    }
    return groups
  }, [filtered])

  function handleSelect(id) {
    if (id === currentCouncilId) {
      onClose()
      return
    }
    window.location.href = '/' + COUNCIL_SLUG_MAP[id] + '/'
  }

  return (
    <div className="council-picker" ref={panelRef} role="dialog" aria-label="Switch council">
      <div className="council-picker-search">
        <Search size={16} className="council-picker-search-icon" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search councils..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="council-picker-input"
          aria-label="Search councils"
        />
        <button className="council-picker-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div className="council-picker-list">
        {Object.keys(grouped).length === 0 && (
          <div className="council-picker-empty">No councils match "{query}"</div>
        )}

        {TIER_ORDER.map(tier => {
          const councils = grouped[tier]
          if (!councils) return null
          return (
            <div key={tier} className="council-picker-group">
              <div className="council-picker-tier-label">{TIER_LABELS[tier]}</div>
              {councils.map(council => {
                const isCurrent = council.id === currentCouncilId
                return (
                  <button
                    key={council.id}
                    className={`council-picker-card ${isCurrent ? 'council-picker-card--current' : ''}`}
                    onClick={() => handleSelect(council.id)}
                    aria-current={isCurrent ? 'true' : undefined}
                  >
                    <span
                      className="council-picker-dot"
                      style={{ backgroundColor: COUNCIL_COLORS[council.id] || '#8e8e93' }}
                    />
                    <span className="council-picker-name">{council.name}</span>
                    {isCurrent && <Check size={16} className="council-picker-check" />}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default CouncilPicker
