/**
 * ChartGradient — Parametric SVG gradient definition for Recharts.
 *
 * Drop inside any Recharts chart to define a custom gradient fill.
 * Reference via fill="url(#yourGradientId)" on Area/Bar components.
 *
 * @param {string} id - Unique gradient ID to reference
 * @param {string} color - Gradient color (hex or rgb)
 * @param {number} topOpacity - Opacity at top (default 0.4)
 * @param {number} bottomOpacity - Opacity at bottom (default 0.05)
 */
export default function ChartGradient({ id, color, topOpacity = 0.4, bottomOpacity = 0.05 }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity={topOpacity} />
        <stop offset="100%" stopColor={color} stopOpacity={bottomOpacity} />
      </linearGradient>
    </defs>
  )
}
