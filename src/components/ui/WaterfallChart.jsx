/**
 * WaterfallChart — Cumulative breakdown chart (income/expense/total).
 *
 * Built on Recharts stacked BarChart with invisible base bar technique.
 *
 * Props:
 *   data {array}          — [{ name, value, type: 'income'|'expense'|'total' }]
 *   formatValue {function} — Currency formatter (default: compact)
 *   height {number}       — Chart height (default 300)
 */
import { memo, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE } from '../../utils/constants'
import { formatCurrency } from '../../utils/format'

const WATERFALL_COLORS = {
  income: '#30d158',
  expense: '#ff453a',
  total: '#00d4aa',
}

const WaterfallChart = memo(function WaterfallChart({
  data = [],
  formatValue,
  height = 300,
}) {
  const chartData = useMemo(() => {
    if (!data.length) return []

    let running = 0
    return data.map((item) => {
      const isTotal = item.type === 'total'
      const value = Math.abs(item.value || 0)
      const isNeg = item.type === 'expense' || item.value < 0

      let base, delta
      if (isTotal) {
        base = 0
        delta = running
      } else if (isNeg) {
        running -= value
        base = running
        delta = value
      } else {
        base = running
        delta = value
        running += value
      }

      return {
        name: item.name,
        base: Math.max(0, base),
        delta,
        total: running,
        type: item.type || (isNeg ? 'expense' : 'income'),
        rawValue: item.value,
      }
    })
  }, [data])

  const fmt = formatValue || ((v) => formatCurrency(v, true))

  if (!chartData.length) return null

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis
          dataKey="name"
          tick={AXIS_TICK_STYLE}
          interval={0}
          angle={-30}
          textAnchor="end"
          height={60}
        />
        <YAxis
          tick={AXIS_TICK_STYLE}
          tickFormatter={(v) => fmt(v)}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v, name, props) => {
            const item = props.payload
            if (name === 'base') return [null, null]
            return [fmt(item.rawValue || item.delta), item.type === 'total' ? 'Total' : item.type === 'expense' ? 'Expense' : 'Income']
          }}
        />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" />
        {/* Invisible base bar */}
        <Bar dataKey="base" stackId="stack" fill="transparent" />
        {/* Visible delta bar */}
        <Bar dataKey="delta" stackId="stack" radius={[4, 4, 0, 0]} animationDuration={800}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={WATERFALL_COLORS[entry.type] || '#666'} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
})

export default WaterfallChart
