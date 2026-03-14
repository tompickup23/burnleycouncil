import { memo, createElement } from 'react'
import './StatCard.css'

/** Render icon prop — accepts pre-rendered elements (<Zap size={24} />) or component refs.
 *  IMPORTANT: In Vite HMR dev mode, Lucide forwardRef icons break when passed as
 *  component references between modules. Always pass pre-rendered: icon={<Zap size={24} />} */
function renderIcon(icon, size) {
  if (!icon) return null
  // Function component
  if (typeof icon === 'function') { try { return createElement(icon, { size }) } catch { return null } }
  if (typeof icon !== 'object') return null
  // Already-rendered React element (preferred path — works in all modes)
  if (icon.$$typeof && icon.props !== undefined) return icon
  // forwardRef/memo component ref — try createElement (may fail in Vite HMR)
  if (icon.$$typeof) { try { return createElement(icon, { size }) } catch { return null } }
  try { return createElement(icon, { size }) } catch { return null }
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
