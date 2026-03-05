/**
 * HighwaysMap — Leaflet map component for roadworks and traffic visualisation.
 *
 * Uses direct Leaflet integration (not react-leaflet) with CartoDB Dark Matter tiles.
 * Renders roadwork markers with severity-based colouring, ward boundary overlays,
 * marker clustering, and optional corridor/junction overlays.
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
 *   height {string}       — CSS height (default '600px')
 */
import { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

// CartoDB Dark Matter tiles — free, no API key, matches dark UI
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'

// Lancashire default center + zoom (used if no config provided)
const DEFAULT_CENTER = [53.85, -2.40]
const DEFAULT_ZOOM = 10

// District centers for flyTo on region selection
const DISTRICT_CENTERS = {
  Burnley:          { center: [53.789, -2.248], zoom: 13 },
  Hyndburn:         { center: [53.761, -2.390], zoom: 13 },
  Pendle:           { center: [53.879, -2.190], zoom: 12 },
  Rossendale:       { center: [53.685, -2.278], zoom: 12 },
  Lancaster:        { center: [54.047, -2.801], zoom: 11 },
  'Ribble Valley':  { center: [53.903, -2.418], zoom: 11 },
  Chorley:          { center: [53.653, -2.632], zoom: 12 },
  'South Ribble':   { center: [53.727, -2.706], zoom: 13 },
  Preston:          { center: [53.763, -2.703], zoom: 13 },
  'West Lancashire': { center: [53.608, -2.868], zoom: 11 },
  Wyre:             { center: [53.900, -2.832], zoom: 11 },
  Fylde:            { center: [53.798, -2.919], zoom: 12 },
}

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
  return `<div style="display:flex;align-items:center;gap:6px;margin:4px 0">`
    + `<div style="flex:1;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden">`
    + `<div style="width:${pct}%;height:100%;background:${color};border-radius:3px;transition:width 0.4s ease"></div></div>`
    + `<span style="color:${color};font-size:11px;font-weight:700;white-space:nowrap">${pct}%</span></div>`
}

/** Format date for popup display */
function fmtDate(isoStr) {
  if (!isoStr) return ''
  try {
    return new Date(isoStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return '' }
}

/** Build roadwork popup HTML — enhanced glass-morphism design */
function buildPopupHTML(rw) {
  const rc = classifyRestriction(rw)
  const style = RESTRICTION_STYLES[rc]
  const cap = style.capacity
  const lines = []

  lines.push(`<div style="min-width:260px;max-width:340px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif">`)

  // Header with road name and restriction icon
  lines.push(`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">`)
  lines.push(`<span style="font-size:18px">${style.icon}</span>`)
  lines.push(`<div style="flex:1;min-width:0">`)
  lines.push(`<div style="font-size:15px;font-weight:700;color:#fff;line-height:1.3">${esc(rw.road || 'Unknown Road')}</div>`)
  if (rw.district) {
    lines.push(`<div style="font-size:11px;color:#8e8e93;margin-top:1px">${esc(rw.district)}</div>`)
  }
  lines.push(`</div></div>`)

  // Status + severity badges
  lines.push(`<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">`)
  const statusColor = rw.status === 'Works started' ? '#ff9f0a' : '#0a84ff'
  lines.push(`<span style="background:${statusColor}20;color:${statusColor};padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;border:1px solid ${statusColor}30">${esc(rw.status || 'Unknown')}</span>`)
  if (rw.severity) {
    const sevColor = SEVERITY_MARKER_COLORS[rw.severity] || '#8e8e93'
    lines.push(`<span style="background:${sevColor}20;color:${sevColor};padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;border:1px solid ${sevColor}30">${esc(rw.severity.charAt(0).toUpperCase() + rw.severity.slice(1))}</span>`)
  }
  lines.push(`<span style="background:${style.color}20;color:${style.color};padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;border:1px solid ${style.color}30">${esc(style.label)}</span>`)
  lines.push(`</div>`)

  // Capacity impact bar
  lines.push(`<div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:10px 12px;margin-bottom:10px;border:1px solid rgba(255,255,255,0.04)">`)
  lines.push(`<div style="font-size:10px;font-weight:600;color:#636366;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Capacity Impact</div>`)
  lines.push(capacityBar(cap))
  lines.push(`</div>`)

  // Description
  if (rw.description) {
    lines.push(`<div style="font-size:12px;color:#c7c7cc;margin-bottom:8px;line-height:1.5">${esc(rw.description.slice(0, 200))}${rw.description.length > 200 ? '…' : ''}</div>`)
  }

  // Operator
  if (rw.operator) {
    lines.push(`<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#8e8e93;margin-bottom:4px">`)
    lines.push(`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#636366" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`)
    lines.push(`<span>${esc(rw.operator)}</span></div>`)
  }

  // Dates with calendar icon
  const start = fmtDate(rw.start_date)
  const end = fmtDate(rw.end_date)
  if (start || end) {
    lines.push(`<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#8e8e93;margin-top:6px">`)
    lines.push(`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#636366" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`)
    lines.push(`<span>${start ? start : ''}${start && end ? ' → ' : ''}${end ? end : ''}</span>`)
    lines.push(`</div>`)
  }

  // Reference
  if (rw.reference) {
    lines.push(`<div style="font-size:10px;color:#48484a;margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.04)">Ref: ${esc(rw.reference)}</div>`)
  }

  lines.push(`</div>`)
  return lines.join('')
}

/** Build JCI junction popup */
function buildJunctionPopupHTML(jn) {
  const score = jn.jci_score || 0
  const color = jciColor(score)
  const lines = []
  lines.push(`<div style="min-width:220px;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif">`)
  lines.push(`<div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:6px">${esc(jn.name || 'Junction')}</div>`)

  // Score ring visual
  lines.push(`<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">`)
  lines.push(`<div style="width:52px;height:52px;border-radius:50%;border:3px solid ${color};display:flex;align-items:center;justify-content:center;background:${color}15">`)
  lines.push(`<span style="font-size:20px;font-weight:800;color:${color}">${score.toFixed(0)}</span>`)
  lines.push(`</div>`)
  lines.push(`<div>`)
  lines.push(`<div style="font-size:11px;color:#8e8e93">Junction Congestion</div>`)
  lines.push(`<div style="font-size:11px;color:#8e8e93">Index (JCI)</div>`)
  lines.push(`</div>`)
  lines.push(`</div>`)

  if (jn.data_quality) {
    const dqColor = jn.data_quality === 'high' ? '#30d158' : jn.data_quality === 'medium' ? '#ff9f0a' : '#ff453a'
    lines.push(`<div style="font-size:10px;color:${dqColor}">● Data quality: ${esc(jn.data_quality)}</div>`)
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
  height = '600px',
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(null)
  const boundaryLayerRef = useRef(null)
  const corridorLayerRef = useRef(null)
  const junctionLayerRef = useRef(null)
  const pulseLayerRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const wrapperRef = useRef(null)

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

  // Severity counts for legend
  const severityCounts = useMemo(() => {
    const counts = { closure: 0, lane: 0, minor: 0 }
    filtered.forEach(rw => {
      const rc = classifyRestriction(rw)
      if (rc === 'full_closure') counts.closure++
      else if (rc === 'lane_restriction') counts.lane++
      else counts.minor++
    })
    return counts
  }, [filtered])

  // Initialise map on mount
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: false, // We'll add custom position
      scrollWheelZoom: true,
      attributionControl: true,
      preferCanvas: true,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
    })

    // Custom zoom control position
    L.control.zoom({ position: 'topright' }).addTo(map)

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

  // Fly to district when district filter changes
  useEffect(() => {
    if (!mapRef.current) return
    const d = filters.district
    if (d && DISTRICT_CENTERS[d]) {
      const dc = DISTRICT_CENTERS[d]
      mapRef.current.flyTo(dc.center, dc.zoom, { duration: 1 })
    } else if (!d) {
      // Reset to default Lancashire-wide view
      mapRef.current.flyTo(mapCenter, mapZoom, { duration: 1 })
    }
  }, [filters.district, mapCenter, mapZoom])

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
        color: 'rgba(10, 132, 255, 0.2)',
        weight: 1.5,
        fillColor: 'rgba(10, 132, 255, 0.03)',
        fillOpacity: 1,
        dashArray: '4 3',
      }),
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.WD24NM || feature.properties?.CEDNM || feature.properties?.name || ''
        if (name) {
          layer.bindTooltip(esc(name), {
            className: 'hw-ward-tooltip',
            direction: 'center',
            permanent: false,
          })
          layer.on('mouseover', () => {
            layer.setStyle({
              color: 'rgba(10, 132, 255, 0.5)',
              weight: 2.5,
              fillColor: 'rgba(10, 132, 255, 0.08)',
            })
          })
          layer.on('mouseout', () => {
            layer.setStyle({
              color: 'rgba(10, 132, 255, 0.2)',
              weight: 1.5,
              fillColor: 'rgba(10, 132, 255, 0.03)',
            })
          })
        }
      },
    }).addTo(mapRef.current)

    boundaryLayerRef.current = geoLayer
  }, [boundaries])

  // Render roadwork markers with clustering
  useEffect(() => {
    if (!mapRef.current) return

    // Remove existing markers
    if (markersRef.current) {
      mapRef.current.removeLayer(markersRef.current)
      markersRef.current = null
    }

    if (!filtered.length) return

    // Use MarkerClusterGroup for performance and visual clarity
    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 45,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 15,
      chunkedLoading: true,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount()
        // Count severities in cluster
        let hasHigh = false
        let hasMedium = false
        cluster.getAllChildMarkers().forEach(m => {
          if (m.rwData?.severity === 'high' || classifyRestriction(m.rwData || {}) === 'full_closure') hasHigh = true
          if (m.rwData?.severity === 'medium' || classifyRestriction(m.rwData || {}) === 'lane_restriction') hasMedium = true
        })
        const bgColor = hasHigh ? '#ff453a' : hasMedium ? '#ff9f0a' : '#6b7280'
        const size = count > 50 ? 48 : count > 20 ? 42 : count > 5 ? 36 : 30

        return L.divIcon({
          html: `<div style="
            width:${size}px;height:${size}px;
            background:${bgColor};
            border:2px solid rgba(255,255,255,0.3);
            border-radius:50%;
            display:flex;align-items:center;justify-content:center;
            font-size:${size > 42 ? 14 : 12}px;font-weight:700;color:#fff;
            box-shadow:0 2px 12px ${bgColor}60, 0 0 0 4px ${bgColor}20;
            font-family:-apple-system,system-ui,sans-serif;
          ">${count}</div>`,
          className: 'hw-cluster-icon',
          iconSize: [size, size],
        })
      },
    })

    filtered.forEach(rw => {
      const rc = classifyRestriction(rw)
      const style = RESTRICTION_STYLES[rc]
      const isSelected = rw.id === selectedId

      const marker = L.circleMarker([rw.lat, rw.lng], {
        radius: isSelected ? 10 : rc === 'full_closure' ? 8 : rc === 'lane_restriction' ? 6 : 5,
        fillColor: style.color,
        color: isSelected ? '#fff' : 'rgba(255,255,255,0.3)',
        weight: isSelected ? 3 : 1.5,
        fillOpacity: isSelected ? 1 : 0.85,
        opacity: 1,
      })

      marker.bindPopup(buildPopupHTML(rw), {
        maxWidth: 360,
        className: 'hw-popup',
        closeButton: true,
      })

      if (onRoadworkClick) {
        marker.on('click', () => onRoadworkClick(rw))
      }

      marker.rwData = rw
      clusterGroup.addLayer(marker)
    })

    clusterGroup.addTo(mapRef.current)
    markersRef.current = clusterGroup
  }, [filtered, selectedId, onRoadworkClick])

  // Pulse animation for selected marker
  useEffect(() => {
    if (!mapRef.current) return

    // Remove old pulse
    if (pulseLayerRef.current) {
      mapRef.current.removeLayer(pulseLayerRef.current)
      pulseLayerRef.current = null
    }

    if (!selectedId) return
    const rw = filtered.find(r => r.id === selectedId)
    if (!rw?.lat || !rw?.lng) return

    const rc = classifyRestriction(rw)
    const color = RESTRICTION_STYLES[rc].color

    const pulse = L.circleMarker([rw.lat, rw.lng], {
      radius: 16,
      fillColor: 'transparent',
      color: color,
      weight: 2,
      opacity: 0.6,
      className: 'hw-pulse-marker',
    }).addTo(mapRef.current)

    pulseLayerRef.current = pulse
  }, [selectedId, filtered])

  // Render traffic corridors
  useEffect(() => {
    if (!mapRef.current) return

    if (corridorLayerRef.current) {
      mapRef.current.removeLayer(corridorLayerRef.current)
      corridorLayerRef.current = null
    }

    if (!showCorridors || !traffic?.congestion_model?.corridors) return

    const corridorGroup = L.layerGroup()

    traffic.congestion_model.corridors.forEach(cor => {
      if (!cor.coords || cor.coords.length < 2) return

      const latLngs = cor.coords // Already [lat, lng] format
      const jciScore = cor.severity ? cor.severity * 100 : 0
      const color = jciColor(jciScore)

      const line = L.polyline(latLngs, {
        color,
        weight: 5,
        opacity: 0.7,
        dashArray: jciScore > 60 ? null : '8 4',
        lineCap: 'round',
        lineJoin: 'round',
      })

      // Highlight on hover
      line.on('mouseover', () => line.setStyle({ weight: 8, opacity: 1 }))
      line.on('mouseout', () => line.setStyle({ weight: 5, opacity: 0.7 }))

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

    if (!showJunctions || !traffic?.congestion_model?.junctions) return

    const junctionGroup = L.layerGroup()

    traffic.congestion_model.junctions.forEach(jn => {
      if (!jn.lat || !jn.lng) return

      const score = jn.jci || 0
      const color = jciColor(score)
      const size = score > 60 ? 11 : score > 30 ? 9 : 7

      // Diamond-shaped marker for junctions (rotated square)
      const marker = L.circleMarker([jn.lat, jn.lng], {
        radius: size,
        fillColor: color,
        color: 'rgba(255,255,255,0.4)',
        weight: 1.5,
        fillOpacity: 0.9,
      })

      marker.bindPopup(buildJunctionPopupHTML(jn), {
        maxWidth: 300,
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

  // Fullscreen toggle handler
  const toggleFullscreen = useCallback(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    if (!document.fullscreenElement) {
      wrapper.requestFullscreen?.() || wrapper.webkitRequestFullscreen?.()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.() || document.webkitExitFullscreen?.()
      setIsFullscreen(false)
    }
  }, [])

  // Listen for fullscreen exit
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) setIsFullscreen(false)
    }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // Invalidate map size on fullscreen change
  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => mapRef.current?.invalidateSize(), 100)
    }
  }, [isFullscreen])

  // Fit to markers
  const fitToMarkers = useCallback(() => {
    if (!mapRef.current || !filtered.length) return
    const bounds = L.latLngBounds(filtered.map(rw => [rw.lat, rw.lng]))
    mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
  }, [filtered])

  return (
    <div ref={wrapperRef} className={`hw-map-wrapper ${isFullscreen ? 'hw-map-fullscreen' : ''}`} style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        style={{
          height: isFullscreen ? '100vh' : height,
          width: '100%',
          borderRadius: isFullscreen ? 0 : '12px',
          overflow: 'hidden',
          border: isFullscreen ? 'none' : '1px solid rgba(255,255,255,0.06)',
        }}
      />

      {/* Map controls overlay */}
      <div className="hw-map-toolbar">
        <button className="hw-map-btn" onClick={fitToMarkers} title="Fit to all markers" aria-label="Fit to markers">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
        <button className="hw-map-btn" onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} aria-label="Toggle fullscreen">
          {isFullscreen ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          )}
        </button>
      </div>

      {/* Marker count badge */}
      <div className="hw-map-count">
        <span className="hw-map-count-number">{filtered.length}</span>
        <span className="hw-map-count-label">works</span>
      </div>

      {/* Enhanced legend */}
      <div className="hw-map-legend">
        <div className="hw-legend-item">
          <span className="hw-legend-dot" style={{ background: '#ff453a', boxShadow: '0 0 6px rgba(255,69,58,0.4)' }} />
          <span>Closure <span className="hw-legend-count">{severityCounts.closure}</span></span>
        </div>
        <div className="hw-legend-item">
          <span className="hw-legend-dot" style={{ background: '#ff9f0a', boxShadow: '0 0 6px rgba(255,159,10,0.4)' }} />
          <span>Lane <span className="hw-legend-count">{severityCounts.lane}</span></span>
        </div>
        <div className="hw-legend-item">
          <span className="hw-legend-dot" style={{ background: '#6b7280', boxShadow: '0 0 6px rgba(107,114,128,0.3)' }} />
          <span>Minor <span className="hw-legend-count">{severityCounts.minor}</span></span>
        </div>
        {showJunctions && (
          <div className="hw-legend-item">
            <span className="hw-legend-dot" style={{ background: '#0a84ff', boxShadow: '0 0 6px rgba(10,132,255,0.4)' }} />
            <span>JCI</span>
          </div>
        )}
      </div>
    </div>
  )
}
