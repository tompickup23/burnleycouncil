import { Clock } from 'lucide-react'
import { useData } from '../../hooks/useData'
import './DataFreshness.css'

/**
 * Shows a small badge indicating how fresh the data is.
 * Fetches from metadata.json and shows the latest data date.
 *
 * Props:
 *   - source: optional label, e.g. "Spending data" (default: "Data")
 *   - compact: if true, show just the date without the label
 */
function DataFreshness({ source = 'Data', compact = false }) {
  const { data: metadata } = useData('/data/metadata.json')

  if (!metadata?.date_range?.max) return null

  const maxDate = metadata.date_range.max
  const minDate = metadata.date_range.min

  // Format date nicely
  const formatDate = (dateStr) => {
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    } catch {
      return dateStr
    }
  }

  // Calculate staleness
  const now = new Date()
  const latest = new Date(maxDate)
  const daysSince = Math.floor((now - latest) / (1000 * 60 * 60 * 24))

  let freshnessClass = 'fresh'       // < 90 days
  if (daysSince > 365) freshnessClass = 'stale'       // > 1 year
  else if (daysSince > 180) freshnessClass = 'aging'   // > 6 months

  if (compact) {
    return (
      <span className={`data-freshness-badge compact ${freshnessClass}`} title={`${source} covers ${formatDate(minDate)} – ${formatDate(maxDate)}`}>
        <Clock size={12} />
        {formatDate(maxDate)}
      </span>
    )
  }

  return (
    <div className={`data-freshness-badge ${freshnessClass}`}>
      <Clock size={14} />
      <span>
        {source}: {formatDate(minDate)} – {formatDate(maxDate)}
        {daysSince > 180 && <em className="freshness-warning"> ({daysSince > 365 ? 'over a year old' : `${Math.floor(daysSince / 30)} months old`})</em>}
      </span>
    </div>
  )
}

export default DataFreshness
