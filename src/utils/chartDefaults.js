/**
 * Recharts chart defaults — reduce boilerplate across 27+ pages.
 *
 * Usage:
 *   import { gridProps, xAxisProps, yAxisProps } from '../utils/chartDefaults'
 *   <CartesianGrid {...gridProps} />
 *   <XAxis {...xAxisProps} dataKey="name" />
 *   <YAxis {...yAxisProps} />
 */
import { GRID_STROKE, AXIS_TICK_STYLE, TOOLTIP_STYLE, CHART_ANIMATION } from './constants'

/** Standard CartesianGrid props */
export const gridProps = {
  strokeDasharray: '3 3',
  stroke: GRID_STROKE,
}

/** Standard XAxis props (add dataKey at call site) */
export const xAxisProps = {
  tick: AXIS_TICK_STYLE,
  stroke: GRID_STROKE,
}

/** Standard YAxis props (add tickFormatter at call site) */
export const yAxisProps = {
  tick: AXIS_TICK_STYLE,
  stroke: GRID_STROKE,
}

/** Standard Tooltip props */
export const tooltipProps = {
  contentStyle: TOOLTIP_STYLE,
}

/** Standard animation props for Bar, Line, Area, Pie */
export const animProps = {
  animationDuration: CHART_ANIMATION.duration,
  animationEasing: CHART_ANIMATION.easing,
}
