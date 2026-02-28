/**
 * WardMap — Leaflet map component for ward boundary visualisation.
 *
 * Uses direct Leaflet integration (not react-leaflet) with CartoDB Dark Matter tiles.
 * Renders ward boundary polygons with configurable colour overlays for
 * strategy analysis (classification, swing trend, party control, route).
 *
 * Props:
 *   boundaries {object} — GeoJSON FeatureCollection from ward_boundaries.json
 *   wardData {object} — Map of wardName → { color, opacity, label, ...stats }
 *   wardsUp {array} — Ward names that are contested (others dimmed)
 *   overlayMode {string} — 'classification' | 'swing' | 'party' | 'route'
 *   selectedWard {string} — Currently selected ward (highlighted border)
 *   onWardClick {function} — (wardName) => void
 *   onWardHover {function} — (wardName | null) => void
 *   routeLines {array} — [[centroid1, centroid2], ...] for route visualisation
 *   routeClusters {array} — [{ wards: [names], color }] for cluster colouring
 *   height {string} — CSS height (default '500px')
 */
import { useRef, useEffect, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// CartoDB Dark Matter tiles — free, no API key, matches dark UI
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'

// Default colours for clusters in route mode
const CLUSTER_COLORS = [
  '#12B6CF', '#f97316', '#a855f7', '#22c55e',
  '#f43f5e', '#facc15', '#6366f1', '#14b8a6',
  '#e879f9', '#84cc16', '#f59e0b', '#8b5cf6',
]

/** Escape HTML entities to prevent XSS in Leaflet tooltips. */
function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildTooltipHTML(wardName, data) {
  const safeName = esc(wardName || '')
  if (!data) return `<strong>${safeName}</strong>`
  const lines = [`<strong>${safeName}</strong>`]
  if (data.winner) lines.push(`<span style="color:${esc(data.partyColor || '#ccc')}">${esc(data.winner)}</span>`)
  if (data.predPct != null) lines.push(`Predicted: ${esc(String(data.predPct))}%`)
  if (data.swingTrend) lines.push(`Swing: ${esc(data.swingTrend)}`)
  if (data.hours) lines.push(`Hours: ${esc(String(data.hours))}`)
  if (data.classLabel) lines.push(esc(data.classLabel))
  return lines.join('<br/>')
}

export default function WardMap({
  boundaries,
  wardData = {},
  wardsUp = [],
  overlayMode = 'classification',
  selectedWard,
  onWardClick,
  onWardHover,
  routeLines = [],
  routeClusters = [],
  height = '500px',
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const geoLayerRef = useRef(null)
  const routeLayerRef = useRef(null)
  const markersLayerRef = useRef(null)
  const boundariesIdRef = useRef(null) // track which boundaries are loaded

  // Initialise Leaflet map on mount
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
    }).addTo(map)

    // Set initial view to Lancashire area
    map.setView([53.77, -2.5], 10)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Stable callback refs to avoid re-renders
  const onClickRef = useRef(onWardClick)
  const onHoverRef = useRef(onWardHover)
  useEffect(() => { onClickRef.current = onWardClick }, [onWardClick])
  useEffect(() => { onHoverRef.current = onWardHover }, [onWardHover])

  // Get ward colour — route mode uses cluster colours
  const getWardColor = useCallback((wardName) => {
    if (overlayMode === 'route' && routeClusters.length > 0) {
      const cluster = routeClusters.find(c => c.wards?.includes(wardName))
      if (cluster) return cluster.color
    }
    return wardData[wardName]?.color || '#666'
  }, [overlayMode, routeClusters, wardData])

  // Create GeoJSON layer when boundaries change (only on new boundary data)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !boundaries?.features?.length) return

    // Check if boundaries actually changed (avoid rebuild on wardData/overlay changes)
    const boundariesId = boundaries.features.length + ':' + (boundaries.features[0]?.properties?.name || '')
    if (boundariesIdRef.current === boundariesId && geoLayerRef.current) return
    boundariesIdRef.current = boundariesId

    // Remove existing layer
    if (geoLayerRef.current) {
      map.removeLayer(geoLayerRef.current)
      geoLayerRef.current = null
    }

    const layer = L.geoJSON(boundaries, {
      style: () => ({
        fillColor: '#666',
        fillOpacity: 0.15,
        color: '#333',
        weight: 0.5,
        opacity: 0.3,
      }),
      onEachFeature: (feature, featureLayer) => {
        const name = feature.properties?.name

        // Tooltip (updated dynamically via setTooltipContent in style effect)
        featureLayer.bindTooltip(buildTooltipHTML(name, null), {
          sticky: true,
          direction: 'top',
          className: 'ward-map-tooltip',
        })

        // Events
        featureLayer.on('click', () => onClickRef.current?.(name))
        featureLayer.on('mouseover', (e) => {
          onHoverRef.current?.(name)
          e.target.setStyle({
            weight: 3,
            color: '#fff',
            fillOpacity: 0.85,
          })
        })
        featureLayer.on('mouseout', (e) => {
          onHoverRef.current?.(null)
          if (geoLayerRef.current) {
            geoLayerRef.current.resetStyle(e.target)
          }
        })
      },
    })

    layer.addTo(map)
    geoLayerRef.current = layer

    // Fit bounds only when boundaries change (not on style/overlay changes)
    try {
      map.fitBounds(layer.getBounds(), { padding: [20, 20] })
    } catch { /* empty boundaries */ }
  }, [boundaries])

  // Update styles in-place when wardData/overlay/selection changes (no layer rebuild)
  useEffect(() => {
    const layer = geoLayerRef.current
    if (!layer) return

    const wardsUpSet = new Set(wardsUp)

    layer.eachLayer((featureLayer) => {
      const name = featureLayer.feature?.properties?.name
      const isContested = wardsUpSet.has(name)
      const isSelected = selectedWard === name

      featureLayer.setStyle({
        fillColor: getWardColor(name),
        fillOpacity: isContested ? 0.65 : 0.15,
        color: isSelected ? '#fff' : (isContested ? '#555' : '#333'),
        weight: isSelected ? 3 : (isContested ? 1.5 : 0.5),
        opacity: isContested ? 1 : 0.3,
      })

      // Update tooltip content
      const data = wardData[name]
      featureLayer.setTooltipContent(buildTooltipHTML(name, data))
    })
  }, [wardData, wardsUp, overlayMode, selectedWard, getWardColor])

  // Draw route lines
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Clear previous
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current)
      routeLayerRef.current = null
    }
    if (markersLayerRef.current) {
      map.removeLayer(markersLayerRef.current)
      markersLayerRef.current = null
    }

    if (overlayMode !== 'route' || !routeLines?.length) return

    const routeGroup = L.layerGroup()
    const markerGroup = L.layerGroup()

    // Draw polylines between consecutive wards
    routeLines.forEach(([from, to]) => {
      if (!from || !to) return
      // Leaflet uses [lat, lng] not [lng, lat]
      const line = L.polyline(
        [[from[1], from[0]], [to[1], to[0]]],
        {
          color: '#12B6CF',
          weight: 2.5,
          opacity: 0.8,
          dashArray: '8, 4',
        }
      )
      routeGroup.addLayer(line)

      // Arrow head at midpoint
      const midLat = (from[1] + to[1]) / 2
      const midLng = (from[0] + to[0]) / 2
      const arrow = L.circleMarker([midLat, midLng], {
        radius: 3,
        fillColor: '#12B6CF',
        fillOpacity: 1,
        color: 'transparent',
        weight: 0,
      })
      routeGroup.addLayer(arrow)
    })

    // Add numbered markers at session starts
    if (routeClusters.length > 0) {
      routeClusters.forEach((cluster, clusterIdx) => {
        const firstWard = cluster.wards?.[0]
        if (!firstWard) return
        // Find centroid from boundaries
        const feature = boundaries?.features?.find(f => f.properties?.name === firstWard)
        const centroid = feature?.properties?.centroid
        if (!centroid) return

        const marker = L.marker([centroid[1], centroid[0]], {
          icon: L.divIcon({
            className: 'ward-map-session-marker',
            html: `<span>${clusterIdx + 1}</span>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
        })
        markerGroup.addLayer(marker)
      })
    }

    routeGroup.addTo(map)
    markerGroup.addTo(map)
    routeLayerRef.current = routeGroup
    markersLayerRef.current = markerGroup

    return () => {
      if (routeLayerRef.current) { map.removeLayer(routeLayerRef.current); routeLayerRef.current = null }
      if (markersLayerRef.current) { map.removeLayer(markersLayerRef.current); markersLayerRef.current = null }
    }
  }, [overlayMode, routeLines, routeClusters, boundaries])

  return (
    <div
      ref={containerRef}
      style={{ height, borderRadius: '12px', overflow: 'hidden' }}
      data-testid="ward-map"
    />
  )
}
