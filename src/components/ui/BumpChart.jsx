/**
 * BumpChart — Ranking change visualisation over time.
 *
 * Uses Recharts LineChart with inverted Y axis (rank 1 at top).
 * Use for council ranking changes, supplier position tracking.
 *
 * Props:
 *   data {array}         — [{ period: '2021/22', rankings: { 'Burnley': 3, 'Hyndburn': 7 } }]
 *   entities {array}     — Entity names to show (subset of all ranked items)
 *   colors {object}      — { entityName: '#color' } override map
 *   maxRank {number}     — Maximum rank value (auto-detected if omitted)
 *   height {number}      — Chart height (default 300)
 *   onEntityClick {fn}   — (entityName) => void
 */
import { memo, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { CHART_COLORS, TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE } from '../../utils/constants'

const BumpChart = memo(function BumpChart({
  data = [],
  entities = [],
  colors = {},
  maxRank,
  height = 300,
  onEntityClick,
}) {
  const [hoveredEntity, setHoveredEntity] = useState(null)

  const { chartData, allEntities, effectiveMaxRank } = useMemo(() => {
    if (!data.length) return { chartData: [], allEntities: [], effectiveMaxRank: 10 }

    // Determine which entities to show
    const allEntities = entities.length > 0
      ? entities
      : [...new Set(data.flatMap(d => Object.keys(d.rankings || {})))]

    // Find max rank
    let maxR = maxRank || 1
    if (!maxRank) {
      data.forEach(d => {
        Object.values(d.rankings || {}).forEach(r => {
          if (r > maxR) maxR = r
        })
      })
    }

    // Build chart data — each period has a value per entity
    const chartData = data.map(d => {
      const row = { period: d.period }
      allEntities.forEach(e => {
        row[e] = d.rankings?.[e] ?? null
      })
      return row
    })

    return { chartData, allEntities, effectiveMaxRank: maxR }
  }, [data, entities, maxRank])

  if (!chartData.length || !allEntities.length) return null

  return (
    <div className="bump-chart">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="period" tick={AXIS_TICK_STYLE} />
          <YAxis
            reversed
            domain={[1, effectiveMaxRank]}
            tick={AXIS_TICK_STYLE}
            label={{ value: 'Rank', angle: -90, position: 'insideLeft', fill: '#636366', fontSize: 11 }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, name) => [`#${value}`, name]}
          />
          {allEntities.map((entity, i) => {
            const color = colors[entity] || CHART_COLORS[i % CHART_COLORS.length]
            const isHovered = hoveredEntity === entity
            const isDimmed = hoveredEntity && !isHovered

            return (
              <Line
                key={entity}
                type="monotone"
                dataKey={entity}
                stroke={color}
                strokeWidth={isHovered ? 4 : isDimmed ? 1 : 2.5}
                strokeOpacity={isDimmed ? 0.2 : 1}
                dot={{ r: isHovered ? 6 : 4, fill: color, stroke: '#1c1c1e', strokeWidth: 2 }}
                activeDot={{ r: 7, stroke: '#fff', strokeWidth: 2 }}
                connectNulls
                animationDuration={800}
                onMouseEnter={() => setHoveredEntity(entity)}
                onMouseLeave={() => setHoveredEntity(null)}
                onClick={() => onEntityClick?.(entity)}
                style={{ cursor: onEntityClick ? 'pointer' : 'default', transition: 'stroke-width 0.2s, stroke-opacity 0.2s' }}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 8 }}>
        {allEntities.map((entity, i) => {
          const color = colors[entity] || CHART_COLORS[i % CHART_COLORS.length]
          return (
            <button
              key={entity}
              onClick={() => onEntityClick?.(entity)}
              onMouseEnter={() => setHoveredEntity(entity)}
              onMouseLeave={() => setHoveredEntity(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'none',
                border: 'none',
                color: hoveredEntity === entity ? '#fff' : '#8e8e93',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: 6,
                transition: 'all 0.15s',
                opacity: hoveredEntity && hoveredEntity !== entity ? 0.3 : 1,
              }}
            >
              <span style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: color,
                flexShrink: 0,
              }} />
              {entity}
            </button>
          )
        })}
      </div>
    </div>
  )
})

export default BumpChart
