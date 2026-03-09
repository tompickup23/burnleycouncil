/**
 * TreemapChart — Hierarchical area visualisation using Recharts Treemap.
 *
 * Displays proportional rectangles for spending breakdown, category distribution, etc.
 *
 * Props:
 *   data {array}          — [{ name, value, category? }] — items to visualise
 *   colorBy {string}      — 'category' | 'value' | 'index' (default 'index')
 *   categoryColors {object} — { categoryName: '#color' } override
 *   formatValue {function} — Value label formatter (default: compact currency)
 *   onItemClick {function} — (item) => void
 *   height {number}       — Chart height (default 300)
 *   maxItems {number}     — Max items to show (default 20, rest grouped as "Other")
 */
import { memo, useMemo, useCallback } from 'react'
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts'
import { CHART_COLORS, TOOLTIP_STYLE } from '../../utils/constants'
import { formatCurrency } from '../../utils/format'

/** Custom treemap cell content renderer */
function TreemapCell({ x, y, width, height, name, value, color, formatValue }) {
  if (width < 40 || height < 30) return null // too small to label

  const displayName = name?.length > Math.floor(width / 7)
    ? name.slice(0, Math.floor(width / 7) - 1) + '…'
    : name

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        fill={color}
        fillOpacity={0.8}
        stroke="rgba(0,0,0,0.3)"
        strokeWidth={1}
        style={{ transition: 'fill-opacity 0.2s' }}
      />
      {height > 36 && (
        <>
          <text
            x={x + 8}
            y={y + 18}
            fill="#fff"
            fontSize={Math.min(12, width / 8)}
            fontWeight={600}
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
          >
            {displayName}
          </text>
          {height > 50 && (
            <text
              x={x + 8}
              y={y + 34}
              fill="rgba(255,255,255,0.7)"
              fontSize={Math.min(11, width / 9)}
            >
              {(formatValue || ((v) => formatCurrency(v, true)))(value)}
            </text>
          )}
        </>
      )}
    </g>
  )
}

const TreemapChart = memo(function TreemapChart({
  data = [],
  colorBy = 'index',
  categoryColors = {},
  formatValue,
  onItemClick,
  height = 300,
  maxItems = 20,
}) {
  const processedData = useMemo(() => {
    if (!data.length) return []
    const sorted = [...data].sort((a, b) => (b.value || 0) - (a.value || 0))
    const top = sorted.slice(0, maxItems)
    const rest = sorted.slice(maxItems)

    if (rest.length > 0) {
      top.push({
        name: `Other (${rest.length})`,
        value: rest.reduce((s, d) => s + (d.value || 0), 0),
        category: 'other',
      })
    }

    return top.map((item, i) => {
      let color = CHART_COLORS[i % CHART_COLORS.length]
      if (colorBy === 'category' && item.category && categoryColors[item.category]) {
        color = categoryColors[item.category]
      }
      return { ...item, color }
    })
  }, [data, colorBy, categoryColors, maxItems])

  const renderContent = useCallback((props) => {
    const item = processedData.find(d => d.name === props.name) || {}
    return <TreemapCell {...props} color={item.color || '#666'} formatValue={formatValue} />
  }, [processedData, formatValue])

  const handleClick = useCallback((item) => {
    if (onItemClick && item) onItemClick(item)
  }, [onItemClick])

  if (!processedData.length) return null

  return (
    <ResponsiveContainer width="100%" height={height}>
      <Treemap
        data={processedData}
        dataKey="value"
        nameKey="name"
        content={renderContent}
        onClick={handleClick}
        animationDuration={600}
        animationEasing="ease-out"
      >
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v) => (formatValue || ((val) => formatCurrency(val, true)))(v)}
        />
      </Treemap>
    </ResponsiveContainer>
  )
})

export default TreemapChart
