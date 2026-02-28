/**
 * SupplierLink — Smart clickable supplier name with hover info.
 *
 * Every supplier name across the platform becomes a hot-linked element.
 * Hover shows: CH status badge, DOGE risk level, conflict count.
 * Click navigates to Spending page filtered by supplier.
 *
 * Props:
 *   name {string} - Supplier name
 *   chNumber {string} - Companies House number
 *   riskLevel {string} - DOGE risk level
 *   conflicts {number} - Number of councillor conflicts
 *   linkToSpending {boolean} - Link to spending page (default true)
 *   compact {boolean} - Compact mode
 */
import { Link } from 'react-router-dom'
import IntegrityBadge from './IntegrityBadge'

const RISK_TO_SCORE = { low: 90, medium: 70, elevated: 55, high: 30 }

export default function SupplierLink({
  name,
  chNumber,
  riskLevel,
  conflicts = 0,
  linkToSpending = true,
  compact = false,
}) {
  const spendingUrl = linkToSpending
    ? `/spending?supplier=${encodeURIComponent(name)}&ref=doge`
    : null

  const content = (
    <span
      className="supplier-link-wrapper"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
    >
      {spendingUrl ? (
        <Link
          to={spendingUrl}
          className="supplier-link"
          title={[
            name,
            chNumber && `CH: ${chNumber}`,
            riskLevel && `Risk: ${riskLevel}`,
            conflicts > 0 && `${conflicts} councillor conflict${conflicts > 1 ? 's' : ''}`,
          ].filter(Boolean).join(' ')}
          style={{
            color: 'var(--text-primary, #e2e8f0)',
            textDecoration: 'none',
            borderBottom: '1px dotted var(--accent, #0a84ff)',
            fontWeight: 500,
          }}
        >
          {name}
        </Link>
      ) : (
        <span style={{ fontWeight: 500 }}>{name}</span>
      )}
      {!compact && riskLevel && riskLevel !== 'low' && (
        <IntegrityBadge score={RISK_TO_SCORE[riskLevel] || 90} riskLevel={riskLevel} size="sm" />
      )}
      {!compact && chNumber && (
        <a
          href={`https://find-and-update.company-information.service.gov.uk/company/${chNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: '0.6rem',
            color: 'var(--text-secondary, #94a3b8)',
            textDecoration: 'none',
          }}
          title={`View on Companies House: ${chNumber}`}
        >
          CH
        </a>
      )}
      {!compact && conflicts > 0 && (
        <span
          style={{
            fontSize: '0.55rem',
            padding: '1px 4px',
            borderRadius: '4px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            color: '#ef4444',
            fontWeight: 600,
          }}
          title={`${conflicts} councillor conflict${conflicts > 1 ? 's' : ''}`}
        >
          {conflicts}
        </span>
      )}
    </span>
  )

  return content
}
