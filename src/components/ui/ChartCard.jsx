import { memo } from 'react'
import './ChartCard.css'

const CHART_TOOLTIP_STYLE = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
}

const ChartCard = memo(function ChartCard({ title, description, note, wide = false, link, children }) {
  return (
    <div className={`chart-card ${wide ? 'wide' : ''}`}>
      {title && <h3>{title}</h3>}
      {description && <p className="chart-description">{description}</p>}
      <div className="chart-container">
        {children}
      </div>
      {note && <p className="chart-note text-secondary">{note}</p>}
      {link && <a href={link.href} className="chart-link">{link.text}</a>}
    </div>
  )
})

export { ChartCard, CHART_TOOLTIP_STYLE }
export default ChartCard
