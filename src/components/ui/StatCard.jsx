import { memo, createElement } from 'react'
import './StatCard.css'

/** Render icon prop — handles both component references (Zap) and rendered elements (<Zap />) */
function renderIcon(icon, size) {
  if (!icon) return null
  if (typeof icon === 'function') return createElement(icon, { size })
  if (typeof icon === 'object' && icon.type !== undefined && icon.props !== undefined) return icon
  if (typeof icon === 'object') { try { return createElement(icon, { size }) } catch { return null } }
  return null
}

const StatCard = memo(function StatCard({ value, label, icon: Icon, highlight = false, className = '' }) {
  return (
    <div className={`stat-card ${highlight ? 'highlight' : ''} ${className}`}>
      {Icon && (
        <div className="stat-card-icon">
          {renderIcon(Icon, 24)}
        </div>
      )}
      <div className="stat-card-content">
        <span className="stat-card-value">{value}</span>
        <span className="stat-card-label">{label}</span>
      </div>
    </div>
  )
})

function StatBar({ children }) {
  return <div className="stat-bar">{children}</div>
}

export { StatCard, StatBar }
export default StatCard
