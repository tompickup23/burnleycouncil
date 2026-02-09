import { memo } from 'react'
import './StatCard.css'

const StatCard = memo(function StatCard({ value, label, icon: Icon, highlight = false, className = '' }) {
  return (
    <div className={`stat-card ${highlight ? 'highlight' : ''} ${className}`}>
      {Icon && (
        <div className="stat-card-icon">
          <Icon size={24} />
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
