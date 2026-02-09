import { useState, useRef, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronDown } from 'lucide-react'
import './SearchableSelect.css'

// Virtualize dropdown when option count exceeds this threshold
const VIRTUALIZE_THRESHOLD = 100

function SearchableSelect({ label, value, options, onChange, placeholder }) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const containerRef = useRef(null)
  const searchRef = useRef(null)
  const listRef = useRef(null)

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const selectedLabel = value || placeholder
  const useVirtual = filteredOptions.length > VIRTUALIZE_THRESHOLD

  // Virtual list for large option sets (e.g. 4000+ suppliers)
  const virtualizer = useVirtualizer({
    count: filteredOptions.length + 1, // +1 for the "All" placeholder option
    getScrollElement: () => listRef.current,
    estimateSize: () => 36,
    overscan: 10,
    enabled: isOpen && useVirtual,
  })

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  // Focus search input when opening
  useEffect(() => {
    if (isOpen && searchRef.current) {
      searchRef.current.focus()
    }
  }, [isOpen])

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
      setSearchTerm('')
    } else if (e.key === 'Enter' && !isOpen) {
      setIsOpen(true)
    }
  }

  const handleSelect = (opt) => {
    onChange(opt)
    setIsOpen(false)
    setSearchTerm('')
  }

  return (
    <div className="searchable-select" ref={containerRef} onKeyDown={handleKeyDown}>
      {label && <label>{label}</label>}
      <div className="select-container">
        <button
          type="button"
          className="select-trigger"
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={`${label || 'Select'}: ${value || placeholder || 'None selected'}`}
        >
          <span className={value ? '' : 'placeholder'}>{selectedLabel}</span>
          <ChevronDown size={16} className={`select-chevron ${isOpen ? 'open' : ''}`} />
        </button>

        {isOpen && (
          <div className="select-dropdown" role="listbox">
            <input
              ref={searchRef}
              type="text"
              className="select-search"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label={`Search ${label || 'options'}`}
            />
            <div
              className="select-options"
              ref={listRef}
            >
              {useVirtual ? (
                // Virtualized rendering for large lists (100+ options)
                <div
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {virtualizer.getVirtualItems().map(virtualItem => {
                    const index = virtualItem.index
                    // Index 0 = placeholder "All" option, rest are filtered options
                    const opt = index === 0 ? null : filteredOptions[index - 1]
                    return (
                      <div
                        key={virtualItem.key}
                        role="option"
                        aria-selected={opt ? value === opt : !value}
                        className={`select-option ${opt ? (value === opt ? 'selected' : '') : (!value ? 'selected' : '')}`}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${virtualItem.size}px`,
                          transform: `translateY(${virtualItem.start}px)`,
                        }}
                        onClick={() => handleSelect(opt || '')}
                      >
                        {opt || placeholder}
                      </div>
                    )
                  })}
                </div>
              ) : (
                // Direct rendering for small lists (< 100 options)
                <>
                  <div
                    role="option"
                    aria-selected={!value}
                    className={`select-option ${!value ? 'selected' : ''}`}
                    onClick={() => handleSelect('')}
                  >
                    {placeholder}
                  </div>
                  {filteredOptions.map(opt => (
                    <div
                      key={opt}
                      role="option"
                      aria-selected={value === opt}
                      className={`select-option ${value === opt ? 'selected' : ''}`}
                      onClick={() => handleSelect(opt)}
                    >
                      {opt}
                    </div>
                  ))}
                </>
              )}
              {filteredOptions.length === 0 && (
                <div className="select-no-results">No matches</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SearchableSelect
