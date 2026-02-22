import { memo } from 'react'

/**
 * Reusable SVG gradient definitions for Recharts charts.
 * Drop <ChartGradients /> as first child inside any Recharts chart component.
 * Reference gradients via fill="url(#chartGradientBlue)" etc.
 * SVG <defs> are inert until referenced — zero visual cost when unused.
 */
const ChartGradients = memo(function ChartGradients() {
  return (
    <defs>
      {/* Area/fill gradients — fade to transparent */}
      <linearGradient id="chartGradientBlue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0a84ff" stopOpacity={0.4} />
        <stop offset="40%" stopColor="#0a84ff" stopOpacity={0.15} />
        <stop offset="100%" stopColor="#0a84ff" stopOpacity={0} />
      </linearGradient>
      <linearGradient id="chartGradientGreen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#30d158" stopOpacity={0.4} />
        <stop offset="40%" stopColor="#30d158" stopOpacity={0.15} />
        <stop offset="100%" stopColor="#30d158" stopOpacity={0} />
      </linearGradient>
      <linearGradient id="chartGradientOrange" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ff9f0a" stopOpacity={0.4} />
        <stop offset="40%" stopColor="#ff9f0a" stopOpacity={0.15} />
        <stop offset="100%" stopColor="#ff9f0a" stopOpacity={0} />
      </linearGradient>
      <linearGradient id="chartGradientPurple" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#bf5af2" stopOpacity={0.4} />
        <stop offset="40%" stopColor="#bf5af2" stopOpacity={0.15} />
        <stop offset="100%" stopColor="#bf5af2" stopOpacity={0} />
      </linearGradient>
      <linearGradient id="chartGradientRed" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ff453a" stopOpacity={0.4} />
        <stop offset="40%" stopColor="#ff453a" stopOpacity={0.15} />
        <stop offset="100%" stopColor="#ff453a" stopOpacity={0} />
      </linearGradient>
      <linearGradient id="chartGradientTeal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#64d2ff" stopOpacity={0.4} />
        <stop offset="40%" stopColor="#64d2ff" stopOpacity={0.15} />
        <stop offset="100%" stopColor="#64d2ff" stopOpacity={0} />
      </linearGradient>
      {/* Bar glow gradients — solid top to slightly dim bottom */}
      <linearGradient id="barGlowBlue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0a84ff" stopOpacity={1} />
        <stop offset="100%" stopColor="#0a84ff" stopOpacity={0.7} />
      </linearGradient>
      <linearGradient id="barGlowGreen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#30d158" stopOpacity={1} />
        <stop offset="100%" stopColor="#30d158" stopOpacity={0.7} />
      </linearGradient>
      <linearGradient id="barGlowPurple" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#bf5af2" stopOpacity={1} />
        <stop offset="100%" stopColor="#bf5af2" stopOpacity={0.7} />
      </linearGradient>
      <linearGradient id="barGlowOrange" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ff9f0a" stopOpacity={1} />
        <stop offset="100%" stopColor="#ff9f0a" stopOpacity={0.7} />
      </linearGradient>
    </defs>
  )
})

export default ChartGradients
