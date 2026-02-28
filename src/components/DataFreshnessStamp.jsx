/**
 * DataFreshnessStamp — "Data updated X days ago" with relative time.
 *
 * Props:
 *   lastUpdated {string} - ISO date string
 *   label {string} - Optional label prefix
 */
import { useMemo } from 'react'

function getRelativeTime(dateStr) {
  if (!dateStr) return null
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now - date
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'today'
    if (diffDays === 1) return 'yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`
    return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? 's' : ''} ago`
  } catch {
    return null
  }
}

export default function DataFreshnessStamp({ lastUpdated, label = 'Data updated' }) {
  const relative = useMemo(() => getRelativeTime(lastUpdated), [lastUpdated])

  if (!relative) return null

  return (
    <span
      className="data-freshness-stamp"
      style={{
        fontSize: '0.65rem',
        color: 'var(--text-secondary, #64748b)',
        fontWeight: 400,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
      }}
      title={lastUpdated}
    >
      <span style={{ opacity: 0.6 }}>📅</span>
      {label} {relative}
    </span>
  )
}
