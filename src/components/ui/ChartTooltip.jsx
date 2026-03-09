/**
 * ChartTooltip — Rich custom tooltip for Recharts charts.
 *
 * Glass-morphism styling with trend indicators and comparison to average.
 *
 * Usage with Recharts:
 *   <Tooltip content={<ChartTooltip formatValue={v => `£${v}`} average={50000} />} />
 *
 * Props:
 *   active {boolean}       — Recharts-injected: is tooltip active
 *   payload {array}        — Recharts-injected: data points
 *   label {string}         — Recharts-injected: X-axis label
 *   formatValue {function} — Custom value formatter
 *   formatLabel {function} — Custom label formatter
 *   average {number}       — Show comparison to this average value
 *   previousValue {object} — { key: prevValue } for trend calculation
 *   unit {string}          — Unit suffix (e.g. '%', 'k', '/head')
 */
import { memo } from 'react'

const ChartTooltip = memo(function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
  formatLabel,
  average,
  previousValue,
  unit = '',
}) {
  if (!active || !payload?.length) return null

  const fmtVal = formatValue || ((v) => typeof v === 'number' ? v.toLocaleString() : v)
  const fmtLbl = formatLabel || ((l) => l)

  return (
    <div style={{
      background: 'rgba(28, 28, 30, 0.95)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
      padding: '10px 14px',
      color: '#fff',
      minWidth: 120,
    }}>
      {label != null && (
        <div style={{ fontSize: 11, fontWeight: 600, color: '#8e8e93', marginBottom: 6, letterSpacing: '0.3px' }}>
          {fmtLbl(label)}
        </div>
      )}

      {payload.map((entry, i) => {
        if (entry.dataKey === 'base') return null // skip waterfall invisible bar

        const value = entry.value
        const color = entry.color || entry.stroke || '#00d4aa'
        const name = entry.name || entry.dataKey

        // Calculate trend if previous value provided
        let trend = null
        if (previousValue && previousValue[entry.dataKey] != null && value != null) {
          const prev = previousValue[entry.dataKey]
          const change = prev !== 0 ? ((value - prev) / Math.abs(prev)) * 100 : 0
          trend = { change, direction: Math.sign(change) }
        }

        // Compare to average
        let avgComp = null
        if (average != null && value != null && i === 0) {
          const diff = value - average
          const pct = average !== 0 ? (diff / Math.abs(average)) * 100 : 0
          avgComp = { diff, pct, above: diff > 0 }
        }

        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: i < payload.length - 1 ? 4 : 0 }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: color,
              flexShrink: 0,
              boxShadow: `0 0 6px ${color}66`,
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                  {fmtVal(value)}{unit}
                </span>
                {trend && (
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: trend.direction > 0 ? '#30d158' : trend.direction < 0 ? '#ff453a' : '#8e8e93',
                  }}>
                    {trend.direction > 0 ? '↑' : trend.direction < 0 ? '↓' : '→'}
                    {Math.abs(trend.change).toFixed(1)}%
                  </span>
                )}
              </div>
              <span style={{ fontSize: 10, color: '#636366' }}>{name}</span>
            </div>
          </div>
        )
      })}

      {payload.length > 0 && payload[0]?.value != null && average != null && (
        <div style={{
          marginTop: 6,
          paddingTop: 6,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          fontSize: 10,
          color: '#636366',
        }}>
          Avg: {fmtVal(average)}{unit}
          {(() => {
            const diff = ((payload[0].value - average) / Math.abs(average || 1)) * 100
            return (
              <span style={{ marginLeft: 6, color: diff > 0 ? '#ff9f0a' : '#30d158', fontWeight: 600 }}>
                ({diff > 0 ? '+' : ''}{diff.toFixed(1)}%)
              </span>
            )
          })()}
        </div>
      )}
    </div>
  )
})

export default ChartTooltip
