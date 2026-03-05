/**
 * HighwaysMap — Leaflet map component for roadworks and traffic visualisation.
 *
 * Uses direct Leaflet integration (not react-leaflet) with CartoDB Dark Matter tiles.
 * Renders roadwork markers with severity-based colouring, ward boundary overlays,
 * and optional marker clustering for large datasets.
 *
 * Props:
 *   roadworks {array}     — Array of roadwork records from roadworks.json
 *   traffic {object}      — Traffic intelligence from traffic.json (junctions, corridors, clashes)
 *   boundaries {object}   — GeoJSON FeatureCollection from ward_boundaries.json
 *   config {object}       — Council config with highways_context (map_center, map_zoom)
 *   onRoadworkClick {fn}  — (roadwork) => void — called when a roadwork marker is clicked
 *   selectedId {number}   — Currently selected roadwork ID (highlighted)
 *   filters {object}      — { severity, status, district, operator } active filter values
 *   showCorridors {bool}  — Whether to show traffic corridor overlays
 *   showJunctions {bool}  — Whether to show JCI junction markers
 *   height {string}       — CSS height (default '500px')
 */
import { useRef, useEffect, useCallback, useMemo } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// CartoDB Dark Matter tiles — free, no API key, matches dark UI
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'

// Lancashire default center + zoom (used if no config provided)
const DEFAULT_CENTER = [53.85, -2.40]
const DEFAULT_ZOOM = 10

// Severity → marker colours
const SEVERITY_MARKER_COLORS = {
  high: '#ff453a',
  medium: '#ff9f0a',
  low: '#8e8e93',
}

// Restriction type → display info
const RESTRICTION_STYLES = {
  full_closure: { color: '#ff453a', label: 'Road Closure', icon: '🚫', capacity: 100 },
  lane_restriction: { color: '#ff9f0a', label: 'Lane Restriction', icon: '⚠️', capacity: 50 },
  minor: { color: '#6b7280', label: 'Minor Works', icon: '🔧', capacity: 15 },
}

// JCI colour scale
const JCI_COLORS = [
  { threshold: 80, color: '#ff453a' },
  { threshold: 60, color: '#ff6d3b' },
  { threshold: 40, color: '#ff9f0a' },
  { threshold: 20, color: '#ffd60a' },
  { threshold: 0, color: '#30d158' },
]

/** Escape HTML entities to prevent XSS in Leaflet popups. */
function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Classify restriction type from roadwork record */
function classifyRestriction(rw) {
  const r = (rw.restrictions || rw.management_type || '').toLowerCase()
  const desc = (rw.description || '').toLowerCase()
  if (r.includes('road closure') || desc.includes('road closure') || r.includes('full closure')) return 'full_closure'
  if (r.includes('lane closure') || r.includes('contraflow') || r.includes('traffic control')
    || r.includes('two-way signals') || r.includes('multi-way signals') || r.includes('priority')) return 'lane_restriction'
  return 'minor'
}

/** Get JCI colour for a score */
function jciColor(score) {
  for (const { threshold, color } of JCI_COLORS) {
    if (score >= threshold) return color
  }
  return '#30d158'
}

/** Build capacity bar HTML */
function capacityBar(pct) {
  const filled = Math.round(pct / 10)
  const empty = 10 - filled
  const color = pct >= 80 ? '#ff453a' : pct >= 40 ? '#ff9f0a' : '#22c55e'
  return `<span style="font-family:monospace;font-size:11px;letter-spacing:1px">`
    + `<span style="color:${color}">${'\u2588'.repeat(filled)}</span>`
    + `<span style="color:rgba(255,255,255,0.1)">${'\u2591'.repeat(empty)}</span>`
    + `</span> <span style="color:${color};font-size:11px;font-weight:600">${pct}% loss</span>`
}

/** Format date for popup display */
function fmtDate(isoStr) {
  if (!isoStr) return ''
  try {
    return new Date(isoStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return '' }
}

/** Build roadwork popup HTML */
function buildPopupHTML(rw) {
  const rc = classifyRestriction(rw)
  const style = RESTRICTION_STYLES[rc]
  const cap = style.capacity
  const lines = []

  lines.push(`<div style="min-width:240px;max-width:320px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif">`)
  lines.push(`<div style="font-size:14px;font-weight:700;margin-bottom:6px;color:#fff">${esc(rw.road || 'Unknown Road')}</div>`)

  // Status badge
  const statusColor = rw.status === 'Works started' ? '#ff9f0a' : '#0a84ff'
  lines.push(`<div style="margin-bottom:8px"><span style="background:${statusColor};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">${esc(rw.status || 'Unknown')}</span>`)
  if (rw.severity) {
    const sevColor = SEVERITY_MARKER_COLORS[rw.severity] || '#8e8e93'
    lines.push(` <span style="background:${sevColor};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">${esc(rw.severity.charAt(0).toUpperCase() + rw.severity.slice(1))}</span>`)
  }
  lines.push(`</div>`)

  // Capacity impact
  lines.push(`<div style="background:rgba(255,255,255,0.05);border-radius:6px;padding:8px;margin-bottom:8px">`)
  lines.push(`<div style="font-size:11px;color:#8e8e93;margin-bottom:4px">Capacity Impact</div>`)
  lines.push(capacityBar(cap))
  lines.push(`<div style="font-size:11px;color:#8e8e93;margin-top:2px">${style.icon} ${esc(style.label)}</div>`)
  lines.push(`</div>`)

  // Details
  if (rw.description) {
    lines.push(`<div style="font-size:12px;color:#c7c7cc;margin-bottom:6px">${esc(rw.description.slice(0, 200))}</div>`)
  }
  if (rw.operator) {
    lines.push(`<div style="font-size:11px;color:#8e8e93">Operator: <span style="color:#c7c7cc">${esc(rw.operator)}</span></div>`)
  }
  if (rw.district) {
    lines.push(`<div style="font-size:11px;color:#8e8e93">District: <span style="color:#c7c7cc">${esc(rw.district)}</span></div>`)
  }

  // Dates
  const start = fmtDate(rw.start_date)
  const end = fmtDate(rw.end_date)
  if (start || end) {
    lines.push(`<div style="font-size:11px;color:#8e8e93;margin-top:4px">${start ? 'From: ' + esc(start) : ''}${start && end ? ' — ' : ''}${end ? 'To: ' + esc(end) : ''}</div>`)
  }

  // Reference
  if (rw.reference) {
    lines.push(`<div style="font-size:10px;color:#636366;margin-top:6px">Ref: ${esc(rw.reference)}</div>`)
  }

  lines.push(`</div>`)
  return lines.join('')
}

/** Build JCI junction popup */
function buildJunctionPopupHTML(jn) {
  const score = jn.jci_score || 0
  const color = jciColor(score)
  const lines = []
  lines.push(`<div style="min-width:200px;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif">`)
  lines.push(`<div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:4px">${esc(jn.name || 'Junction')}</div>`)
  lines.push(`<div style="font-size:24px;font-weight:800;color:${color};margin-bottom:4px">${score.toFixed(0)}<span style="font-size:12px;font-weight:400;color:#8e8e93">/100</span></div>`)
  lines.push(`<div style="font-size:11px;color:#8e8e93">Junction Congestion Index</div>`)
  if (jn.data_quality) {
    const dqColor = jn.data_quality === 'high' ? '#30d158' : jn.data_quality === 'medium' ? '#ff9f0a' : '#ff453a'
    lines.push(`<div style="font-size:10px;color:${dqColor};margin-top:4px">Data quality: ${esc(jn.data_quality)}</div>`)
  }
  if (jn.works_count) {
    lines.push(`<div style="font-size:11px;color:#c7c7cc;margin-top:4px">${jn.works_count} nearby works</div>`)
  }
  if (jn.traffic_volume) {
    lines.push(`<div style="font-size:11px;color:#8e8e93">AADF: ${Number(jn.traffic_volume).toLocaleString()} vehicles/day</div>`)
  }
  lines.push(`</div>`)
  return lines.join('')
}

export default function HighwaysMap({
  roadworks = [],
  traffic = null,
  boundaries = null,
  config = null,
  onRoadworkClick,
  selectedId,
  filters = {},
  showCorridors = false,
  showJunctions = false,
  height = '500px',
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(null)
  const boundaryLayerRef = useRef(null)
  const corridorLayerRef = useRef(null)
  const junctionLayerRef = useRef(null)

  // Derive map center + zoom from config
  const mapCenter = useMemo(() => {
    if (config?.highways_context?.map_center) return config.highways_context.map_center
    // Try to compute from roadworks bounds
    if (roadworks.length > 0) {
      const lats = roadworks.filter(r => r.lat).map(r => r.lat)
      const lngs = roadworks.filter(r => r.lng).map(r => r.lng)
      if (lats.length) return [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lngs) + Math.max(...lngs)) / 2]
    }
    return DEFAULT_CENTER
  }, [config, roadworks])

  const mapZoom = config?.highways_context?.map_zoom || DEFAULT_ZOOM

  // Filtered roadworks
  const filtered = useMemo(() => {
    let items = roadworks
    if (filters.severity) items = items.filter(r => r.severity === filters.severity)
    if (filters.status) items = items.filter(r => r.status === filters.status)
    if (filters.district) items = items.filter(r => r.district === filters.district)
    if (filters.operator) items = items.filter(r => r.operator === filters.operator)
    return items.filter(r => r.lat && r.lng)
  }, [roadworks, filters])

  // Initialise map on mount
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
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map)

    map.setView(mapCenter, mapZoom)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update center when config changes
  useEffect(() => {
    if (!mapRef.current) return
    mapRef.current.setView(mapCenter, mapZoom, { animate: true })
  }, [mapCenter, mapZoom])

  // Render ward boundaries
  useEffect(() => {
    if (!mapRef.current || !boundaries) return

    // Remove existing
    if (boundaryLayerRef.current) {
      mapRef.current.removeLayer(boundaryLayerRef.current)
      boundaryLayerRef.current = null
    }

    const geoLayer = L.geoJSON(boundaries, {
      style: () => ({
        color: 'rgba(255,255,255,0.15)',
        weight: 1,
        fillColor: 'rgba(255,255,255,0.02)',
        fillOpacity: 1,
      }),
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.WD24NM || feature.properties?.CEDNM || feature.properties?.name || ''
        if (name) {
          layer.bindTooltip(esc(name), {
            className: 'hw-ward-tooltip',
            direction: 'center',
            permanent: false,
          })
        }
      },
    }).addTo(mapRef.current)

    boundaryLayerRef.current = geoLayer
  }, [boundaries])

  // Render roadwork markers
  useEffect(() => {
    if (!mapRef.current) return

    // Remove existing markers
    if (markersRef.current) {
      mapRef.current.removeLayer(markersRef.current)
      markersRef.current = null
    }

    if (!filtered.length) return

    const markerGroup = L.layerGroup()

    filtered.forEach(rw => {
      const rc = classifyRestriction(rw)
      const style = RESTRICTION_STYLES[rc]
      const sevColor = SEVERITY_MARKER_COLORS[rw.severity] || '#8e8e93'
      const isSelected = rw.id === selectedId

      const marker = L.circleMarker([rw.lat, rw.lng], {
        radius: isSelected ? 9 : rc === 'full_closure' ? 7 : 5,
        fillColor: style.color,
        color: isSelected ? '#fff' : sevColor,
        weight: isSelected ? 3 : 1.5,
        fillOpacity: 0.85,
        opacity: 1,
      })

      marker.bindPopup(buildPopupHTML(rw), {
        maxWidth: 340,
        className: 'hw-popup',
      })

      if (onRoadworkClick) {
        marker.on('click', () => onRoadworkClick(rw))
      }

      marker.rwData = rw
      markerGroup.addLayer(marker)
    })

    markerGroup.addTo(mapRef.current)
    markersRef.current = markerGroup
  }, [filtered, selectedId, onRoadworkClick])

  // Render traffic corridors
  useEffect(() => {
    if (!mapRef.current) return

    if (corridorLayerRef.current) {
      mapRef.current.removeLayer(corridorLayerRef.current)
      corridorLayerRef.current = null
    }

    if (!showCorridors || !traffic?.corridors) return

    const corridorGroup = L.layerGroup()

    traffic.corridors.forEach(cor => {
      if (!cor.polyline || cor.polyline.length < 2) return

      const latLngs = cor.polyline.map(p => [p[1], p[0]]) // [lng,lat] → [lat,lng]
      const jciScore = cor.avg_jci || 0
      const color = jciColor(jciScore)

      const line = L.polyline(latLngs, {
        color,
        weight: 4,
        opacity: 0.7,
        dashArray: jciScore > 60 ? null : '8 4',
      })

      line.bindTooltip(`<strong>${esc(cor.name || 'Corridor')}</strong><br/>JCI: ${jciScore.toFixed(0)}/100`, {
        className: 'hw-ward-tooltip',
        sticky: true,
      })

      corridorGroup.addLayer(line)
    })

    corridorGroup.addTo(mapRef.current)
    corridorLayerRef.current = corridorGroup
  }, [showCorridors, traffic])

  // Render JCI junction markers
  useEffect(() => {
    if (!mapRef.current) return

    if (junctionLayerRef.current) {
      mapRef.current.removeLayer(junctionLayerRef.current)
      junctionLayerRef.current = null
    }

    if (!showJunctions || !traffic?.junctions) return

    const junctionGroup = L.layerGroup()

    traffic.junctions.forEach(jn => {
      if (!jn.lat || !jn.lng) return

      const score = jn.jci_score || 0
      const color = jciColor(score)
      const size = score > 60 ? 10 : score > 30 ? 8 : 6

      const marker = L.circleMarker([jn.lat, jn.lng], {
        radius: size,
        fillColor: color,
        color: 'rgba(255,255,255,0.3)',
        weight: 1,
        fillOpacity: 0.9,
      })

      marker.bindPopup(buildJunctionPopupHTML(jn), {
        maxWidth: 280,
        className: 'hw-popup',
      })

      junctionGroup.addLayer(marker)
    })

    junctionGroup.addTo(mapRef.current)
    junctionLayerRef.current = junctionGroup
  }, [showJunctions, traffic])

  // Fly to selected roadwork
  useEffect(() => {
    if (!mapRef.current || !selectedId) return
    const rw = filtered.find(r => r.id === selectedId)
    if (rw?.lat && rw?.lng) {
      mapRef.current.flyTo([rw.lat, rw.lng], 15, { duration: 0.8 })
    }
  }, [selectedId, filtered])

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        style={{
          height,
          width: '100%',
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      />
      {/* Legend */}
      <div className="hw-map-legend">
        <div className="hw-legend-item">
          <span className="hw-legend-dot" style={{ background: '#ff453a' }} />
          <span>Closure</span>
        </div>
        <div className="hw-legend-item">
          <span className="hw-legend-dot" style={{ background: '#ff9f0a' }} />
          <span>Lane restriction</span>
        </div>
        <div className="hw-legend-item">
          <span className="hw-legend-dot" style={{ background: '#6b7280' }} />
          <span>Minor works</span>
        </div>
        {showJunctions && (
          <div className="hw-legend-item">
            <span className="hw-legend-dot" style={{ background: '#0a84ff', border: '1px solid rgba(255,255,255,0.3)' }} />
            <span>JCI point</span>
          </div>
        )}
      </div>
    </div>
  )
}
