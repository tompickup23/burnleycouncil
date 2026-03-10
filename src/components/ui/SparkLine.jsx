/**
 * SparkLine — Tiny inline SVG chart for embedding in tables and cards.
 *
 * Pure SVG polyline — zero Recharts overhead. Use for trend indicators.
 *
 * Props:
 *   data {number[]}      — Array of values to plot
 *   color {string}        — Line color (default '#12B6CF')
 *   width {number}        — SVG width in px (default 80)
 *   height {number}       — SVG height in px (default 24)
 *   fill {boolean}        — Show gradient area fill below line (default false)
 *   showDot {boolean}     — Show end-point dot (default true)
 *   showMinMax {boolean}  — Show min/max dots (default false)
 *   trend {boolean}       — Show trend arrow after chart (default false)
 *   className {string}    — Additional CSS class
 */
import { memo, useMemo } from 'react'

const SparkLine = memo(function SparkLine({
  data = [],
  color = '#12B6CF',
  width = 80,
  height = 24,
  fill = false,
  showDot = true,
  showMinMax = false,
  trend = false,
  className = '',
}) {
  const { points, areaPath, minIdx, maxIdx, trendDir } = useMemo(() => {
    if (!data.length) return { points: '', areaPath: '', minIdx: -1, maxIdx: -1, trendDir: 0 }

    const padding = 2
    const w = width - padding * 2
    const h = height - padding * 2
    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1

    const pts = data.map((v, i) => {
      const x = padding + (i / Math.max(data.length - 1, 1)) * w
      const y = padding + (1 - (v - min) / range) * h
      return [x, y]
    })

    const polyline = pts.map(([x, y]) => `${x},${y}`).join(' ')

    // Area path for gradient fill
    let area = ''
    if (fill && pts.length > 1) {
      area = `M${pts[0][0]},${height - padding} ` +
        pts.map(([x, y]) => `L${x},${y}`).join(' ') +
        ` L${pts[pts.length - 1][0]},${height - padding} Z`
    }

    // Find min/max indices
    let mi = 0, ma = 0
    data.forEach((v, i) => {
      if (v < data[mi]) mi = i
      if (v > data[ma]) ma = i
    })

    // Trend: compare last value to first
    const td = data.length >= 2 ? Math.sign(data[data.length - 1] - data[0]) : 0

    return { points: polyline, areaPath: area, minIdx: mi, maxIdx: ma, trendDir: td }
  }, [data, width, height, fill])

  if (!data.length) return null

  const padding = 2
  const w = width - padding * 2
  const h = height - padding * 2
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const getXY = (i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * w
    const y = padding + (1 - (data[i] - min) / range) * h
    return [x, y]
  }

  const lastPt = getXY(data.length - 1)
  const minPt = getXY(minIdx)
  const maxPt = getXY(maxIdx)

  const gradientId = `spark-fill-${Math.random().toString(36).slice(2, 8)}`

  return (
    <span className={`sparkline-container ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        {fill && (
          <>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#${gradientId})`} />
          </>
        )}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {showDot && (
          <circle cx={lastPt[0]} cy={lastPt[1]} r={2.5} fill={color} />
        )}
        {showMinMax && minIdx !== maxIdx && (
          <>
            <circle cx={minPt[0]} cy={minPt[1]} r={2} fill="#ff453a" />
            <circle cx={maxPt[0]} cy={maxPt[1]} r={2} fill="#30d158" />
          </>
        )}
      </svg>
      {trend && trendDir !== 0 && (
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          color: trendDir > 0 ? '#30d158' : '#ff453a',
          lineHeight: 1,
        }}>
          {trendDir > 0 ? '↑' : '↓'}
        </span>
      )}
    </span>
  )
})

export default SparkLine
