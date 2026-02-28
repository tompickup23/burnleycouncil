/**
 * IntegrityBadge — Inline risk indicator for councillors and suppliers.
 *
 * Small coloured dot/badge for inline use:
 *   - green (low risk)
 *   - amber (medium/elevated)
 *   - red (high risk)
 *
 * Props:
 *   score {number} - integrity score 0-100
 *   riskLevel {string} - 'low' | 'medium' | 'elevated' | 'high'
 *   size {'sm' | 'md'} - badge size
 *   showScore {boolean} - whether to show numeric score
 */
const RISK_COLORS = {
  low: '#22c55e',
  medium: '#f59e0b',
  elevated: '#f97316',
  high: '#ef4444',
}

const RISK_LABELS = {
  low: 'Low Risk',
  medium: 'Medium Risk',
  elevated: 'Elevated Risk',
  high: 'High Risk',
}

export default function IntegrityBadge({ score, riskLevel, size = 'sm', showScore = false }) {
  const level = riskLevel || (score >= 90 ? 'low' : score >= 70 ? 'medium' : score >= 50 ? 'elevated' : 'high')
  const color = RISK_COLORS[level] || RISK_COLORS.low
  const label = RISK_LABELS[level] || 'Unknown'
  const dotSize = size === 'md' ? 10 : 7

  return (
    <span
      className="integrity-badge"
      title={`${label}${score != null ? ` (${score}/100)` : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: size === 'md' ? '0.75rem' : '0.65rem',
        fontWeight: 600,
        color,
      }}
    >
      <span
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          backgroundColor: color,
          display: 'inline-block',
          boxShadow: level === 'high' ? `0 0 4px ${color}` : 'none',
        }}
      />
      {showScore && score != null && (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{score}</span>
      )}
    </span>
  )
}
