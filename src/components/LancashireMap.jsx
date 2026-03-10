/**
 * LancashireMap — Leaflet map showing all Lancashire council boundaries.
 *
 * Uses direct Leaflet (same pattern as WardMap.jsx).
 * Shows council outlines colored by tier, spending, or political control.
 * Clicking a council navigates to that council's site.
 *
 * Props:
 *   councilBoundaries {object} — GeoJSON FeatureCollection from council_boundaries.json
 *   councilData {array} — Council stats from cross_council.json
 *   currentCouncilId {string} — Highlight the current council
 *   colorMode {string} — 'tier' | 'spend' | 'politics'
 *   onCouncilClick {function} — (councilId) => void
 *   height {string} — CSS height (default '500px')
 */
import { useRef, useEffect } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { COUNCIL_COLORS, PARTY_COLORS } from '../utils/constants'

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'

const TIER_COLORS = { district: '#12B6CF', county: '#ff9f0a', unitary: '#bf5af2' }
const TIER_LABELS = { district: 'District', county: 'County', unitary: 'Unitary' }

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatCompact(n) {
  if (!n) return '—'
  if (n >= 1e9) return `£${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `£${(n / 1e6).toFixed(0)}M`
  if (n >= 1e3) return `£${(n / 1e3).toFixed(0)}K`
  return `£${n}`
}

/** Multi-stop spend gradient: green → yellow → orange → red */
function getSpendColor(perCapita, allPerCapita) {
  if (!perCapita || !allPerCapita?.length) return '#333'
  const sorted = [...allPerCapita].sort((a, b) => a - b)
  const min = sorted[0] || 0
  const max = sorted[sorted.length - 1] || 1
  const ratio = Math.min(1, Math.max(0, (perCapita - min) / (max - min || 1)))

  // 4-stop gradient: teal → green → amber → red
  if (ratio < 0.33) {
    const t = ratio / 0.33
    return lerpColor([48, 209, 88], [255, 214, 10], t)
  } else if (ratio < 0.66) {
    const t = (ratio - 0.33) / 0.33
    return lerpColor([255, 214, 10], [255, 159, 10], t)
  } else {
    const t = (ratio - 0.66) / 0.34
    return lerpColor([255, 159, 10], [255, 69, 58], t)
  }
}

function lerpColor(a, b, t) {
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bl = Math.round(a[2] + (b[2] - a[2]) * t)
  return `rgb(${r},${g},${bl})`
}

const LGR_AUTH_COLORS = ['#12B6CF', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a', '#64d2ff', '#ffd60a', '#ff375f']

function getCouncilColor(feature, councilData, colorMode, allPerCapita, lgrAuthorities) {
  const id = feature.properties?.council_id
  if (colorMode === 'tier') {
    return TIER_COLORS[feature.properties?.council_tier] || '#666'
  }
  if (colorMode === 'spend') {
    return getSpendColor(feature.properties?.per_capita_spend, allPerCapita)
  }
  if (colorMode === 'politics') {
    const council = councilData?.find(c => c.council_id === id || c.council_name?.toLowerCase().includes(id?.replace(/_/g, ' ')))
    const party = council?.controlling_party || council?.largest_party
    return PARTY_COLORS[party] || '#888'
  }
  if (colorMode === 'lgr' && lgrAuthorities?.length) {
    const authIdx = lgrAuthorities.findIndex(a => a.councils?.includes(id))
    return authIdx >= 0 ? LGR_AUTH_COLORS[authIdx % LGR_AUTH_COLORS.length] : '#333'
  }
  return COUNCIL_COLORS[id] || '#666'
}

function buildTooltip(feature, councilData, colorMode) {
  const p = feature.properties || {}
  const name = esc(p.council_name || p.council_id || '')
  const tier = esc(TIER_LABELS[p.council_tier] || '')

  const lines = [
    `<div style="font-size:14px;font-weight:700;letter-spacing:-0.3px;margin-bottom:3px">${name}</div>`,
  ]

  if (tier) {
    const tierColor = TIER_COLORS[p.council_tier] || '#888'
    lines.push(`<div style="display:inline-block;padding:1px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${esc(tierColor)}22;color:${esc(tierColor)};margin-bottom:4px">${tier} Council</div>`)
  }

  // Stats grid
  const stats = []
  if (p.total_spend) stats.push(`<span style="color:#ff9f0a;font-weight:600">${esc(formatCompact(p.total_spend))}</span> tracked`)
  if (p.population) stats.push(`Pop: <strong>${esc(p.population.toLocaleString())}</strong>`)
  if (p.per_capita_spend) stats.push(`${esc(formatCompact(p.per_capita_spend))}/head`)

  if (stats.length > 0) {
    lines.push(`<div style="display:flex;flex-direction:column;gap:2px;margin:4px 0;font-size:11px">${stats.map(s => `<span>${s}</span>`).join('')}</div>`)
  }

  // Political control from cross_council data
  const council = councilData?.find(c => c.council_id === p.council_id)
  if (council?.controlling_party) {
    const party = council.controlling_party
    const color = PARTY_COLORS[party] || '#888'
    lines.push(`<div style="display:flex;align-items:center;gap:5px;margin-top:2px"><span style="width:8px;height:8px;border-radius:50%;background:${esc(color)};flex-shrink:0"></span><span style="color:${esc(color)};font-weight:600;font-size:11px">${esc(party)}</span></div>`)
  }

  lines.push(`<div style="color:#48484a;font-size:9px;margin-top:4px;letter-spacing:0.3px">CLICK TO EXPLORE</div>`)
  return lines.join('')
}

export default function LancashireMap({
  councilBoundaries,
  councilData = [],
  currentCouncilId,
  colorMode = 'tier',
  lgrAuthorities,
  onCouncilClick,
  height = '500px',
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const geoLayerRef = useRef(null)
  const labelsLayerRef = useRef(null)
  const onClickRef = useRef(onCouncilClick)
  useEffect(() => { onClickRef.current = onCouncilClick }, [onCouncilClick])

  // Precompute all per-capita values for relative scaling
  const allPerCapita = councilBoundaries?.features?.map(f => f.properties?.per_capita_spend).filter(Boolean) || []

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
      attributionControl: true,
      preferCanvas: true,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
    })

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 14,
      subdomains: 'abcd',
      opacity: 0.4,
    }).addTo(map)

    map.setView([53.82, -2.65], 9)
    mapRef.current = map

    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Create GeoJSON layer
  useEffect(() => {
    const map = mapRef.current
    if (!map || !councilBoundaries?.features?.length) return

    if (geoLayerRef.current) {
      map.removeLayer(geoLayerRef.current)
      geoLayerRef.current = null
    }
    if (labelsLayerRef.current) {
      map.removeLayer(labelsLayerRef.current)
      labelsLayerRef.current = null
    }

    // Sort features so county boundary renders first (behind districts/unitaries)
    const sortedBoundaries = {
      ...councilBoundaries,
      features: [...(councilBoundaries.features || [])].sort((a, b) => {
        const tierOrder = { county: 0, unitary: 1, district: 2 }
        return (tierOrder[a.properties?.council_tier] ?? 1) - (tierOrder[b.properties?.council_tier] ?? 1)
      }),
    }

    const layer = L.geoJSON(sortedBoundaries, {
      style: () => ({
        fillColor: '#666',
        fillOpacity: 0.5,
        color: 'rgba(255,255,255,0.3)',
        weight: 2,
        opacity: 0.8,
      }),
      onEachFeature: (feature, featureLayer) => {
        const id = feature.properties?.council_id
        const isCounty = feature.properties?.council_tier === 'county'

        // County boundary covers all districts — render it underneath with reduced interaction
        if (isCounty) {
          featureLayer.setStyle({ fillOpacity: 0.08, weight: 2, dashArray: '6 4', opacity: 0.4 })
          featureLayer.bindTooltip(buildTooltip(feature, councilData, colorMode), {
            sticky: false,
            direction: 'center',
            className: 'lancashire-map-tooltip lancashire-map-tooltip--county',
            permanent: false,
          })
          featureLayer.on('click', () => onClickRef.current?.(id))
          return
        }

        featureLayer.bindTooltip(buildTooltip(feature, councilData, colorMode), {
          sticky: true,
          direction: 'top',
          className: 'lancashire-map-tooltip',
          offset: [0, -8],
        })

        featureLayer.on('click', () => onClickRef.current?.(id))
        featureLayer.on('mouseover', (e) => {
          e.target.setStyle({
            weight: 3.5,
            color: '#fff',
            fillOpacity: 0.85,
          })
          e.target.bringToFront()
        })
        featureLayer.on('mouseout', (e) => {
          if (geoLayerRef.current) geoLayerRef.current.resetStyle(e.target)
        })
      },
    })

    layer.addTo(map)
    geoLayerRef.current = layer

    // Add council name labels at centroids
    const labelsGroup = L.layerGroup()
    councilBoundaries.features.forEach(feature => {
      const p = feature.properties || {}
      const centroid = p.centroid
      if (!centroid) return

      // Short labels for the map
      let label = (p.council_name || '')
        .replace('Lancashire CC', 'LCC')
        .replace('Blackburn w/ Darwen', 'Blackburn')
        .replace('West Lancashire', 'W. Lancs')
        .replace('South Ribble', 'S. Ribble')
        .replace('Ribble Valley', 'Ribble V.')

      const isCurrent = p.council_id === currentCouncilId

      const marker = L.marker([centroid[1], centroid[0]], {
        icon: L.divIcon({
          className: 'lancashire-map-label',
          html: `<span class="${isCurrent ? 'lancashire-map-label-current' : ''}">${esc(label)}</span>`,
          iconSize: [80, 20],
          iconAnchor: [40, 10],
        }),
        interactive: false,
      })
      labelsGroup.addLayer(marker)
    })
    labelsGroup.addTo(map)
    labelsLayerRef.current = labelsGroup

    try { map.fitBounds(layer.getBounds(), { padding: [20, 20] }) } catch { /* */ }
  }, [councilBoundaries, councilData, currentCouncilId, colorMode])

  // Update styles on color mode / selection change
  useEffect(() => {
    const layer = geoLayerRef.current
    if (!layer) return

    layer.eachLayer((featureLayer) => {
      const feature = featureLayer.feature
      const id = feature?.properties?.council_id
      const isCurrent = id === currentCouncilId
      const isCounty = feature?.properties?.council_tier === 'county'

      if (isCounty) {
        featureLayer.setStyle({
          fillColor: getCouncilColor(feature, councilData, colorMode, allPerCapita, lgrAuthorities),
          fillOpacity: 0.08,
          color: '#666',
          weight: 2,
          dashArray: '6 4',
          opacity: 0.4,
        })
      } else {
        featureLayer.setStyle({
          fillColor: getCouncilColor(feature, councilData, colorMode, allPerCapita, lgrAuthorities),
          fillOpacity: isCurrent ? 0.85 : 0.5,
          color: isCurrent ? '#ffffff' : 'rgba(255,255,255,0.25)',
          weight: isCurrent ? 3 : 2,
          opacity: isCurrent ? 1 : 0.8,
        })
      }

      featureLayer.setTooltipContent(buildTooltip(feature, councilData, colorMode))
    })

    // Update label highlighting
    if (labelsLayerRef.current) {
      labelsLayerRef.current.eachLayer(marker => {
        const el = marker.getElement?.()
        if (!el) return
        const span = el.querySelector('span')
        if (!span) return
        // We can't easily check council_id from the label, so just leave them
      })
    }
  }, [colorMode, currentCouncilId, councilData, allPerCapita, lgrAuthorities])

  return (
    <div className="lancashire-map-premium-wrapper" style={{ height: `calc(${height} + 40px)` }}>
      <div className="lancashire-map-glow" />
      <div
        ref={containerRef}
        className="lancashire-map-container"
        style={{ height, borderRadius: '16px', overflow: 'hidden' }}
        data-testid="lancashire-map"
      />
    </div>
  )
}
