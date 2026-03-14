import { useState, createElement } from 'react'
import { ChevronDown } from 'lucide-react'

/** Render icon prop — accepts pre-rendered elements or component refs */
function renderIcon(icon, size) {
  if (!icon) return null
  if (typeof icon === 'function') { try { return createElement(icon, { size }) } catch { return null } }
  if (typeof icon !== 'object') return null
  if (icon.$$typeof && icon.props !== undefined) return icon
  if (icon.$$typeof) { try { return createElement(icon, { size }) } catch { return null } }
  try { return createElement(icon, { size }) } catch { return null }
  return null
}

/**
 * Broadcast-styled collapsible section for data-heavy pages.
 * Extracts + enhances the ExpandableSection pattern from DOGE page.
 *
 * @param {string} title - Section heading
 * @param {string} [subtitle] - Optional subtitle text
 * @param {boolean} [defaultOpen=false] - Whether section starts expanded
 * @param {'info'|'warning'|'critical'|'neutral'} [severity='neutral'] - Left-border accent color
 * @param {string} [icon] - Optional icon element to show before title
 * @param {number} [count] - Optional badge count (e.g. "12 findings")
 * @param {string} [countLabel] - Label for the count badge
 * @param {React.ReactNode} children - Section content
 */
export default function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  severity = 'neutral',
  icon,
  count,
  countLabel,
  id,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`cs-section ${open ? 'cs-open' : ''} cs-${severity}`} id={id}>
      <button className="cs-header" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <div className="cs-title-row">
          {icon && <span className="cs-icon">{renderIcon(icon, 18)}</span>}
          <div className="cs-title-group">
            <h3 className="cs-title">{title}</h3>
            {subtitle && <span className="cs-subtitle">{subtitle}</span>}
          </div>
        </div>
        <div className="cs-header-right">
          {count != null && (
            <span className="cs-count">
              {count}{countLabel ? ` ${countLabel}` : ''}
            </span>
          )}
          <ChevronDown size={18} className={`cs-chevron ${open ? 'cs-chevron-open' : ''}`} />
        </div>
      </button>
      <div className={`cs-content ${open ? 'cs-content-open' : ''}`}>
        <div className="cs-content-inner">
          {children}
        </div>
      </div>
    </div>
  )
}
