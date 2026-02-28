/**
 * Breadcrumb — Context breadcrumbs for navigation.
 *
 * Examples:
 *   Home > Integrity > Cllr John Smith
 *   Home > DOGE > Finding: Split Payments > Supplier: Liberata
 *
 * Props:
 *   items {array} - [{ label, path? }]
 */
import { Link } from 'react-router-dom'

export default function Breadcrumb({ items = [] }) {
  if (!items || items.length <= 1) return null

  return (
    <nav
      className="breadcrumb"
      aria-label="Breadcrumb"
      style={{
        fontSize: '0.7rem',
        color: 'var(--text-secondary, #94a3b8)',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        flexWrap: 'wrap',
      }}
    >
      {items.map((item, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          {i > 0 && <span style={{ opacity: 0.5 }}>›</span>}
          {item.path && i < items.length - 1 ? (
            <Link
              to={item.path}
              style={{
                color: 'var(--accent, #0a84ff)',
                textDecoration: 'none',
                backgroundImage: 'none',
              }}
            >
              {item.label}
            </Link>
          ) : (
            <span style={{ color: i === items.length - 1 ? 'var(--text-primary, #e2e8f0)' : 'inherit' }}>
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}
