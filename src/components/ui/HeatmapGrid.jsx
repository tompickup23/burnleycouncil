/**
 * HeatmapGrid — GitHub-contribution-style SVG grid for temporal patterns.
 *
 * Rows = days of week, columns = weeks. Cell color intensity = value magnitude.
 * Use for spending calendars, meeting frequency, voting attendance.
 *
 * Props:
 *   data {array}           — [{ date: 'YYYY-MM-DD', value: number }]
 *   colorScale {string}    — Color scale name from constants.js (default 'intensity')
 *   cellSize {number}      — Cell size in px (default 14)
 *   cellGap {number}       — Gap between cells (default 2)
 *   formatValue {function} — Tooltip value formatter
 *   formatDate {function}  — Tooltip date formatter
 *   showMonths {boolean}   — Show month labels (default true)
 *   showDays {boolean}     — Show day-of-week labels (default true)
 */
import { memo, useMemo, useState } from 'react'
import { scaleColor } from '../../utils/constants'

const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', '']
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const HeatmapGrid = memo(function HeatmapGrid({
  data = [],
  colorScale = 'intensity',
  cellSize = 14,
  cellGap = 2,
  formatValue = (v) => v.toLocaleString(),
  formatDate: fmtDate,
  showMonths = true,
  showDays = true,
}) {
  const [tooltip, setTooltip] = useState(null)

  const { grid, weeks, min, max, monthMarkers } = useMemo(() => {
    if (!data.length) return { grid: [], weeks: 0, min: 0, max: 0, monthMarkers: [] }

    // Build date→value map
    const dateMap = {}
    let minV = Infinity, maxV = -Infinity
    data.forEach(({ date, value }) => {
      dateMap[date] = (dateMap[date] || 0) + value
      if (dateMap[date] < minV) minV = dateMap[date]
      if (dateMap[date] > maxV) maxV = dateMap[date]
    })

    // Find date range
    const dates = Object.keys(dateMap).sort()
    if (!dates.length) return { grid: [], weeks: 0, min: 0, max: 0, monthMarkers: [] }

    const startDate = new Date(dates[0])
    const endDate = new Date(dates[dates.length - 1])

    // Align to Monday start
    const startDay = startDate.getDay()
    const offset = startDay === 0 ? 6 : startDay - 1 // Mon=0
    startDate.setDate(startDate.getDate() - offset)

    const grid = []
    const monthMarkers = []
    let prevMonth = -1
    const current = new Date(startDate)
    let weekIdx = 0

    while (current <= endDate || weekIdx < 1) {
      for (let day = 0; day < 7; day++) {
        const dateStr = current.toISOString().slice(0, 10)
        const value = dateMap[dateStr] || 0
        const month = current.getMonth()

        if (month !== prevMonth && day === 0) {
          monthMarkers.push({ week: weekIdx, month })
          prevMonth = month
        }

        grid.push({
          week: weekIdx,
          day,
          date: dateStr,
          value,
          hasData: dateStr in dateMap,
        })

        current.setDate(current.getDate() + 1)
        if (current > endDate && day === 6) break
      }
      weekIdx++
      if (current > endDate) break
    }

    return { grid, weeks: weekIdx, min: Math.min(0, minV), max: maxV, monthMarkers }
  }, [data])

  if (!grid.length) return null

  const dayLabelWidth = showDays ? 28 : 0
  const monthLabelHeight = showMonths ? 16 : 0
  const totalWidth = dayLabelWidth + weeks * (cellSize + cellGap) + cellGap
  const totalHeight = monthLabelHeight + 7 * (cellSize + cellGap) + cellGap

  const defaultFmtDate = (d) => {
    const dt = new Date(d)
    return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="heatmap-grid" style={{ position: 'relative', overflowX: 'auto' }}>
      <svg width={totalWidth} height={totalHeight} style={{ display: 'block' }}>
        {/* Month labels */}
        {showMonths && monthMarkers.map(({ week, month }) => (
          <text
            key={`m-${week}-${month}`}
            x={dayLabelWidth + week * (cellSize + cellGap) + cellGap}
            y={12}
            fill="#636366"
            fontSize={9}
            fontWeight={500}
          >
            {MONTH_LABELS[month]}
          </text>
        ))}

        {/* Day labels */}
        {showDays && DAY_LABELS.map((label, i) => (
          label && (
            <text
              key={`d-${i}`}
              x={0}
              y={monthLabelHeight + i * (cellSize + cellGap) + cellSize - 2}
              fill="#636366"
              fontSize={9}
              fontWeight={500}
            >
              {label}
            </text>
          )
        ))}

        {/* Grid cells */}
        {grid.map(({ week, day, date, value, hasData }) => {
          const x = dayLabelWidth + week * (cellSize + cellGap) + cellGap
          const y = monthLabelHeight + day * (cellSize + cellGap) + cellGap
          const fill = hasData && value > 0
            ? scaleColor(value, min, max, colorScale)
            : 'rgba(255,255,255,0.03)'

          return (
            <rect
              key={`${week}-${day}`}
              x={x}
              y={y}
              width={cellSize}
              height={cellSize}
              rx={2}
              fill={fill}
              stroke={tooltip?.date === date ? '#fff' : 'transparent'}
              strokeWidth={1}
              style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
              onMouseEnter={() => setTooltip({ date, value, x: x + cellSize / 2, y })}
              onMouseLeave={() => setTooltip(null)}
            />
          )
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="heatmap-tooltip"
          style={{
            position: 'absolute',
            left: tooltip.x,
            top: tooltip.y - 40,
            transform: 'translateX(-50%)',
            background: 'rgba(28, 28, 30, 0.95)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            padding: '6px 10px',
            color: '#fff',
            fontSize: 11,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}
        >
          <strong>{formatValue(tooltip.value)}</strong>
          <br />
          <span style={{ color: '#8e8e93' }}>{(fmtDate || defaultFmtDate)(tooltip.date)}</span>
        </div>
      )}
    </div>
  )
})

export default HeatmapGrid
