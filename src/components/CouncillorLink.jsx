/**
 * CouncillorLink — Smart clickable councillor name with hover card.
 *
 * Every councillor name across the platform becomes a hot-linked element.
 * Hover shows: integrity score mini-badge, active directorships count, risk level dot.
 * Click navigates to /councillor/:councillorId
 *
 * Props:
 *   name {string} - Councillor name
 *   councillorId {string} - Councillor ID for routing
 *   integrityScore {number} - Score 0-100
 *   riskLevel {string} - 'low' | 'medium' | 'elevated' | 'high'
 *   directorships {number} - Count of active directorships
 *   party {string} - Party name
 *   ward {string} - Ward name
 *   compact {boolean} - Compact mode (no hover card)
 */
import { Link } from 'react-router-dom'
import IntegrityBadge from './IntegrityBadge'

export default function CouncillorLink({
  name,
  councillorId,
  integrityScore,
  riskLevel,
  directorships = 0,
  party,
  ward,
  compact = false,
}) {
  if (!councillorId) {
    return <span>{name}</span>
  }

  const linkPath = `/councillor/${councillorId}`

  return (
    <span className="councillor-link-wrapper" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      <Link
        to={linkPath}
        className="councillor-link"
        title={[
          name,
          party && `(${party})`,
          ward && `— ${ward}`,
          integrityScore != null && `Score: ${integrityScore}/100`,
          directorships > 0 && `${directorships} directorship${directorships > 1 ? 's' : ''}`,
        ].filter(Boolean).join(' ')}
        style={{
          color: 'var(--text-primary, #e2e8f0)',
          textDecoration: 'none',
          borderBottom: '1px dotted var(--text-secondary, #94a3b8)',
          fontWeight: 500,
        }}
      >
        {name}
      </Link>
      {!compact && integrityScore != null && (
        <IntegrityBadge score={integrityScore} riskLevel={riskLevel} size="sm" />
      )}
      {!compact && directorships > 0 && (
        <span
          style={{
            fontSize: '0.6rem',
            color: 'var(--text-secondary, #94a3b8)',
            fontVariantNumeric: 'tabular-nums',
          }}
          title={`${directorships} active directorship${directorships > 1 ? 's' : ''}`}
        >
          {directorships}d
        </span>
      )}
    </span>
  )
}
