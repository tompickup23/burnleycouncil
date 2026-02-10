import { memo } from 'react'
import './ChartCard.css'

const CHART_TOOLTIP_STYLE = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
}

const ChartCard = memo(function ChartCard({ title, description, note, wide = false, link, dataTable, children }) {
  return (
    <div className={`chart-card ${wide ? 'wide' : ''}`}>
      {title && <h3>{title}</h3>}
      {description && <p className="chart-description">{description}</p>}
      <div className="chart-container" aria-hidden="true">
        {children}
      </div>
      {dataTable && (
        <div className="sr-only">
          <table>
            <caption>{title || 'Chart data'}</caption>
            <thead>
              <tr>
                {dataTable.headers.map((h, i) => <th key={i} scope="col">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {dataTable.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => <td key={j}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {note && <p className="chart-note text-secondary">{note}</p>}
      {link && <a href={link.href} className="chart-link">{link.text}</a>}
    </div>
  )
})

export { ChartCard, CHART_TOOLTIP_STYLE }
export default ChartCard
