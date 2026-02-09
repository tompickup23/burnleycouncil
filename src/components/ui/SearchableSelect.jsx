import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import './SearchableSelect.css'

function SearchableSelect({ label, value, options, onChange, placeholder }) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const containerRef = useRef(null)
  const searchRef = useRef(null)

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const selectedLabel = value || placeholder

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
            <div className="select-options">
              <div
                role="option"
                aria-selected={!value}
                className={`select-option ${!value ? 'selected' : ''}`}
                onClick={() => { onChange(''); setIsOpen(false); setSearchTerm('') }}
              >
                {placeholder}
              </div>
              {filteredOptions.map(opt => (
                <div
                  key={opt}
                  role="option"
                  aria-selected={value === opt}
                  className={`select-option ${value === opt ? 'selected' : ''}`}
                  onClick={() => { onChange(opt); setIsOpen(false); setSearchTerm('') }}
                >
                  {opt}
                </div>
              ))}
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
