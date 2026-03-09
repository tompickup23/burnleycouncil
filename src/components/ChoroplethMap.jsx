/**
 * ChoroplethMap — Ward-level heat map visualisation using direct Leaflet.
 *
 * Extends the WardMap.jsx pattern (direct Leaflet, CartoDB Dark Matter tiles)
 * purpose-built for continuous-gradient geographic data display.
 *
 * Props:
 *   boundaries {object}     — GeoJSON FeatureCollection from ward_boundaries.json
 *   values {object}         — { wardName: numericValue } — data to visualise
 *   colorScale {string}     — Scale name from constants.js ('deprivation'|'spend'|'risk'|'demographic'|'intensity'|'diverging')
 *   legend {object}         — { title, format: v => string, unit? }
 *   selectedWard {string}   — Currently selected ward (highlighted border)
 *   onWardClick {function}  — (wardName, value) => void
 *   onWardHover {function}  — (wardName | null) => void
 *   height {string}         — CSS height (default '500px')
 *   showLegend {boolean}    — Show floating legend (default true)
 *   opacity {number}        — Fill opacity for colored wards (default 0.75)
 */
import { useRef, useEffect, useCallback, useMemo } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { scaleColor } from '../utils/constants'

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export default function ChoroplethMap({
  boundaries,
  values = {},
  colorScale = 'deprivation',
  legend,
  selectedWard,
  onWardClick,
  onWardHover,
  height = '500px',
  showLegend = true,
  opacity = 0.75,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const geoLayerRef = useRef(null)
  const legendRef = useRef(null)
  const onClickRef = useRef(onWardClick)
  const onHoverRef = useRef(onWardHover)

  useEffect(() => { onClickRef.current = onWardClick }, [onWardClick])
  useEffect(() => { onHoverRef.current = onWardHover }, [onWardHover])

  // Compute min/max for scale
  const { min, max, median, sorted } = useMemo(() => {
    const vals = Object.values(values).filter(v => typeof v === 'number' && !isNaN(v))
    if (!vals.length) return { min: 0, max: 1, median: 0.5, sorted: [] }
    const sorted = [...vals].sort((a, b) => a - b)
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: sorted[Math.floor(sorted.length / 2)],
      sorted,
    }
  }, [values])

  // Compute rank for each ward
  const ranks = useMemo(() => {
    const entries = Object.entries(values)
      .filter(([, v]) => typeof v === 'number')
      .sort((a, b) => b[1] - a[1])
    const r = {}
    entries.forEach(([k], i) => { r[k] = i + 1 })
    return r
  }, [values])

  // Build tooltip HTML
  const buildTooltip = useCallback((wardName) => {
    const value = values[wardName]
    const rank = ranks[wardName]
    const lines = [`<div style="font-size:13px;font-weight:700;letter-spacing:-0.3px;margin-bottom:2px">${esc(wardName)}</div>`]

    if (value != null) {
      const fmt = legend?.format || ((v) => typeof v === 'number' ? v.toFixed(1) : v)
      const unit = legend?.unit || ''
      const color = scaleColor(value, min, max, colorScale)
      lines.push(`<div style="display:flex;align-items:center;gap:6px;margin:3px 0">`)
      lines.push(`<span style="width:10px;height:10px;border-radius:3px;background:${color};flex-shrink:0"></span>`)
      lines.push(`<span style="font-size:15px;font-weight:700;color:#fff">${esc(String(fmt(value)))}${unit ? ' ' + esc(unit) : ''}</span>`)
      lines.push(`</div>`)
      if (rank) {
        const total = Object.keys(ranks).length
        lines.push(`<div style="font-size:10px;color:#636366">Rank ${rank} of ${total}</div>`)
      }
    } else {
      lines.push(`<div style="font-size:10px;color:#636366">No data</div>`)
    }

    return lines.join('')
  }, [values, ranks, legend, min, max, colorScale])

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
      attributionControl: true,
      preferCanvas: true,
    })

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 18,
      subdomains: 'abcd',
      opacity: 0.5,
    }).addTo(map)

    map.setView([53.77, -2.5], 10)
    mapRef.current = map

    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Create GeoJSON layer when boundaries change
  useEffect(() => {
    const map = mapRef.current
    if (!map || !boundaries?.features?.length) return

    if (geoLayerRef.current) {
      map.removeLayer(geoLayerRef.current)
      geoLayerRef.current = null
    }

    const layer = L.geoJSON(boundaries, {
      style: () => ({
        fillColor: '#333',
        fillOpacity: 0.2,
        color: 'rgba(255,255,255,0.15)',
        weight: 1,
        opacity: 0.6,
      }),
      onEachFeature: (feature, featureLayer) => {
        const name = feature.properties?.name

        featureLayer.bindTooltip('', {
          sticky: true,
          direction: 'top',
          className: 'choropleth-tooltip',
          offset: [0, -8],
        })

        featureLayer.on('click', () => {
          onClickRef.current?.(name, values[name])
        })
        featureLayer.on('mouseover', (e) => {
          onHoverRef.current?.(name)
          e.target.setStyle({
            weight: 3,
            color: '#fff',
            fillOpacity: 0.95,
          })
          e.target.bringToFront()
        })
        featureLayer.on('mouseout', (e) => {
          onHoverRef.current?.(null)
          if (geoLayerRef.current) geoLayerRef.current.resetStyle(e.target)
        })
      },
    })

    layer.addTo(map)
    geoLayerRef.current = layer

    try { map.fitBounds(layer.getBounds(), { padding: [20, 20] }) } catch { /* */ }
  }, [boundaries])

  // Update colors when values/scale/selection changes
  useEffect(() => {
    const layer = geoLayerRef.current
    if (!layer) return

    layer.eachLayer((featureLayer) => {
      const name = featureLayer.feature?.properties?.name
      const value = values[name]
      const hasValue = value != null && typeof value === 'number'
      const isSelected = selectedWard === name

      const fillColor = hasValue
        ? scaleColor(value, min, max, colorScale)
        : 'rgba(255,255,255,0.03)'

      featureLayer.setStyle({
        fillColor,
        fillOpacity: hasValue ? (isSelected ? 0.95 : opacity) : 0.1,
        color: isSelected ? '#fff' : 'rgba(255,255,255,0.15)',
        weight: isSelected ? 3 : 1,
        opacity: isSelected ? 1 : 0.6,
      })

      featureLayer.setTooltipContent(buildTooltip(name))
    })
  }, [values, colorScale, selectedWard, min, max, opacity, buildTooltip])

  // Add/update legend control
  useEffect(() => {
    const map = mapRef.current
    if (!map || !showLegend || min === max) return

    // Remove existing legend
    if (legendRef.current) {
      map.removeControl(legendRef.current)
      legendRef.current = null
    }

    const LegendControl = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd: function () {
        const div = L.DomUtil.create('div', 'choropleth-legend')
        const fmt = legend?.format || ((v) => v.toFixed(1))
        const title = legend?.title || 'Value'

        // Create gradient bar
        const stops = 10
        const gradientStops = Array.from({ length: stops }, (_, i) => {
          const ratio = i / (stops - 1)
          const val = min + ratio * (max - min)
          return scaleColor(val, min, max, colorScale)
        })
        const gradient = `linear-gradient(to right, ${gradientStops.join(', ')})`

        div.innerHTML = `
          <div style="background:rgba(28,28,30,0.9);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 14px;min-width:160px">
            <div style="font-size:10px;font-weight:600;color:#8e8e93;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">${esc(title)}</div>
            <div style="height:10px;border-radius:5px;background:${gradient};margin-bottom:4px"></div>
            <div style="display:flex;justify-content:space-between;font-size:9px;color:#636366">
              <span>${esc(String(fmt(min)))}</span>
              <span>${esc(String(fmt(median)))}</span>
              <span>${esc(String(fmt(max)))}</span>
            </div>
          </div>
        `

        L.DomEvent.disableClickPropagation(div)
        L.DomEvent.disableScrollPropagation(div)
        return div
      },
    })

    const control = new LegendControl()
    control.addTo(map)
    legendRef.current = control

    return () => {
      if (legendRef.current && mapRef.current) {
        try { mapRef.current.removeControl(legendRef.current) } catch { /* */ }
        legendRef.current = null
      }
    }
  }, [showLegend, min, max, median, colorScale, legend])

  return (
    <div
      ref={containerRef}
      style={{ height, borderRadius: '12px', overflow: 'hidden' }}
      data-testid="choropleth-map"
    />
  )
}
