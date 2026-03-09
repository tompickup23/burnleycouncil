/**
 * MapLegend — Floating glass-morphism legend panel for map visualisations.
 *
 * Supports two modes:
 *   1. Gradient bar — for continuous scales (choropleth)
 *   2. Category swatches — for discrete categories (marker types)
 *
 * Props:
 *   mode {'gradient'|'category'}  — Display mode (default 'gradient')
 *   title {string}                — Legend title
 *   --- gradient mode ---
 *   min {number}                  — Minimum value
 *   max {number}                  — Maximum value
 *   colorScale {string}           — Scale name from COLOR_SCALES
 *   format {function}             — Value formatter (default v => v.toFixed(0))
 *   --- category mode ---
 *   items {Array}                 — [{ label, color, count?, active? }]
 *   onToggle {function}           — (label) => void — toggle category visibility
 *   --- shared ---
 *   position {'bottomright'|'bottomleft'|'topright'|'topleft'} — CSS position
 *   collapsed {boolean}           — Start collapsed (default false)
 */
import { memo, useState, useMemo } from 'react'
import { scaleColor } from '../../utils/constants'

const POSITIONS = {
  bottomright: { bottom: 12, right: 12 },
  bottomleft: { bottom: 12, left: 12 },
  topright: { top: 12, right: 12 },
  topleft: { top: 12, left: 12 },
}

const MapLegend = memo(function MapLegend({
  mode = 'gradient',
  title = 'Legend',
  min = 0,
  max = 100,
  colorScale = 'deprivation',
  format = (v) => v.toFixed(0),
  items = [],
  onToggle,
  position = 'bottomright',
  collapsed: initialCollapsed = false,
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed)

  const gradientCSS = useMemo(() => {
    if (mode !== 'gradient') return ''
    const stops = 10
    const colors = Array.from({ length: stops }, (_, i) => {
      const ratio = i / (stops - 1)
      const val = min + ratio * (max - min)
      return scaleColor(val, min, max, colorScale)
    })
    return `linear-gradient(to right, ${colors.join(', ')})`
  }, [mode, min, max, colorScale])

  const posStyle = POSITIONS[position] || POSITIONS.bottomright

  return (
    <div
      className="map-legend"
      style={{
        position: 'absolute',
        ...posStyle,
        zIndex: 1000,
        pointerEvents: 'auto',
      }}
    >
      <div className="map-legend__panel">
        <button
          className="map-legend__header"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
        >
          <span className="map-legend__title">{title}</span>
          <span className="map-legend__toggle">{collapsed ? '+' : '\u2212'}</span>
        </button>

        {!collapsed && (
          <div className="map-legend__body">
            {mode === 'gradient' && (
              <>
                <div
                  className="map-legend__gradient"
                  style={{ background: gradientCSS }}
                />
                <div className="map-legend__labels">
                  <span>{format(min)}</span>
                  <span>{format((min + max) / 2)}</span>
                  <span>{format(max)}</span>
                </div>
              </>
            )}

            {mode === 'category' && (
              <div className="map-legend__items">
                {items.map((item) => (
                  <button
                    key={item.label}
                    className={`map-legend__item ${item.active === false ? 'map-legend__item--inactive' : ''}`}
                    onClick={() => onToggle?.(item.label)}
                    type="button"
                  >
                    <span
                      className="map-legend__swatch"
                      style={{ background: item.color }}
                    />
                    <span className="map-legend__label">{item.label}</span>
                    {item.count != null && (
                      <span className="map-legend__count">{item.count}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

export default MapLegend
