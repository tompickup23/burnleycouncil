/**
 * GaugeChart — Radial arc gauge for scores and metrics.
 *
 * SVG semicircle arc with animated fill. Use for fraud triangle,
 * fiscal resilience, HHI concentration, data quality scores.
 *
 * Props:
 *   value {number}      — Current value
 *   max {number}        — Maximum value (default 100)
 *   label {string}      — Label below the value
 *   subtitle {string}   — Optional secondary text
 *   severity {string}   — 'critical'|'high'|'warning'|'medium'|'info'|'low' (auto if omitted)
 *   size {number}       — Diameter in px (default 160)
 *   thickness {number}  — Arc thickness in px (default 12)
 *   showValue {boolean} — Display value in center (default true)
 *   format {function}   — Value formatter (default: v => v.toFixed(0))
 */
import { memo, useMemo } from 'react'
import { SEVERITY_COLORS } from '../../utils/constants'

function autoSeverity(ratio) {
  if (ratio >= 0.8) return 'critical'
  if (ratio >= 0.6) return 'high'
  if (ratio >= 0.4) return 'warning'
  if (ratio >= 0.2) return 'medium'
  return 'low'
}

const GaugeChart = memo(function GaugeChart({
  value = 0,
  max = 100,
  label = '',
  subtitle = '',
  severity,
  size = 160,
  thickness = 12,
  showValue = true,
  format = (v) => v.toFixed(0),
}) {
  const ratio = Math.min(1, Math.max(0, value / (max || 1)))
  const effectiveSeverity = severity || autoSeverity(ratio)
  const color = SEVERITY_COLORS[effectiveSeverity] || '#00d4aa'

  const { bgArc, fgArc, cx, cy, r } = useMemo(() => {
    const cx = size / 2
    const cy = size / 2 + 4  // slight offset for visual balance
    const r = (size - thickness) / 2 - 4

    // Arc from 180° to 0° (left to right semicircle)
    const startAngle = Math.PI
    const endAngle = 0

    const describeArc = (startA, endA) => {
      const x1 = cx + r * Math.cos(startA)
      const y1 = cy - r * Math.sin(startA)
      const x2 = cx + r * Math.cos(endA)
      const y2 = cy - r * Math.sin(endA)
      const sweep = startA > endA ? 1 : 0
      return `M ${x1} ${y1} A ${r} ${r} 0 0 ${sweep} ${x2} ${y2}`
    }

    const bgArc = describeArc(startAngle, endAngle)

    // Foreground arc — sweep proportional to ratio
    const fgEndAngle = startAngle - ratio * Math.PI
    const fgArc = ratio > 0 ? describeArc(startAngle, fgEndAngle) : ''

    return { bgArc, fgArc, cx, cy, r }
  }, [size, thickness, ratio])

  return (
    <div className="gauge-chart" style={{ width: size, textAlign: 'center' }}>
      <svg width={size} height={size * 0.6 + 8} viewBox={`0 0 ${size} ${size * 0.6 + 8}`}>
        {/* Background arc */}
        <path
          d={bgArc}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={thickness}
          strokeLinecap="round"
        />
        {/* Foreground arc */}
        {fgArc && (
          <path
            d={fgArc}
            fill="none"
            stroke={color}
            strokeWidth={thickness}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 6px ${color}66)`,
              transition: 'stroke-dashoffset 0.8s ease-out',
            }}
          />
        )}
        {/* Glow effect */}
        {fgArc && (
          <path
            d={fgArc}
            fill="none"
            stroke={color}
            strokeWidth={thickness + 8}
            strokeLinecap="round"
            opacity={0.12}
          />
        )}
        {/* Value text */}
        {showValue && (
          <text
            x={cx}
            y={cy - 8}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#fff"
            fontSize={size * 0.18}
            fontWeight="700"
            style={{ letterSpacing: '-0.5px' }}
          >
            {format(value)}
          </text>
        )}
        {/* Scale markers */}
        <text x={cx - r} y={cy + 16} textAnchor="middle" fill="#636366" fontSize={9}>0</text>
        <text x={cx + r} y={cy + 16} textAnchor="middle" fill="#636366" fontSize={9}>{max}</text>
      </svg>
      {label && (
        <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, marginTop: -4, letterSpacing: '-0.3px' }}>
          {label}
        </div>
      )}
      {subtitle && (
        <div style={{ color: '#8e8e93', fontSize: 11, marginTop: 2 }}>
          {subtitle}
        </div>
      )}
    </div>
  )
})

export default GaugeChart
