/**
 * LGRBoundaryMap — Leaflet-based ward boundary map for LGR model visualisation.
 *
 * Shows Lancashire wards coloured by LGR authority assignment, deprivation heat,
 * demographic pressure, or property asset locations. Uses the shared WardMap
 * component (lazy-loaded) with overlay data computed from lgr_enhanced.json.
 *
 * Props:
 *   boundaries {object}       — GeoJSON FeatureCollection from ward_boundaries.json
 *   authorities {array}       — authorities array from lgr_tracker.json for selectedModel
 *   fiscalProfile {array}     — computeDemographicFiscalProfile() result for selectedModel
 *   propertyAssets {array}    — property_assets.json assets array (LCC only)
 *   deprivation {object}      — deprivation.json ward-level data (keyed by ward name)
 */
import { useState, useMemo, Suspense, lazy } from 'react'
import { Map, Layers, Thermometer, Users, Building2 } from 'lucide-react'
import { formatNumber, formatPercent } from '../../utils/format'
import './LGRBoundaryMap.css'

const WardMap = lazy(() => import('../WardMap'))

const AUTH_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a', '#64d2ff', '#ffd60a', '#ff6482']

const OVERLAY_MODES = [
  { id: 'authority', label: 'LGR Authority', icon: Layers },
  { id: 'deprivation', label: 'Deprivation Heat', icon: Thermometer },
  { id: 'demographic', label: 'Demographic Pressure', icon: Users },
  { id: 'property', label: 'Property Locations', icon: Building2 },
]

/** Map IMD score to a red-green gradient. Higher IMD = more deprived = redder. */
function imdToColor(imdScore) {
  if (imdScore == null) return '#444'
  const t = Math.min(1, Math.max(0, imdScore / 60))
  // Green (#30d158) at 0 through yellow (#ffd60a) at 0.5 to red (#ff453a) at 1
  if (t < 0.5) {
    const p = t * 2
    const r = Math.round(0x30 + (0xff - 0x30) * p)
    const g = Math.round(0xd1 + (0xd6 - 0xd1) * p)
    const b = Math.round(0x58 + (0x0a - 0x58) * p)
    return `rgb(${r},${g},${b})`
  }
  const p = (t - 0.5) * 2
  const r = Math.round(0xff)
  const g = Math.round(0xd6 - (0xd6 - 0x45) * p)
  const b = Math.round(0x0a + (0x3a - 0x0a) * p)
  return `rgb(${r},${g},${b})`
}

/** Map demographic pressure (0-100 range) to colour. */
function pressureToColor(pressure) {
  if (pressure == null) return '#444'
  const t = Math.min(1, Math.max(0, pressure / 50))
  if (t < 0.5) {
    const p = t * 2
    return `rgb(${Math.round(48 + 207 * p)},${Math.round(209 - 50 * p)},${Math.round(88 - 78 * p)})`
  }
  const p = (t - 0.5) * 2
  return `rgb(${255},${Math.round(159 - 114 * p)},${Math.round(10 + 48 * p)})`
}

/** Build ward → authority lookup from authorities array. */
function buildWardAuthorityMap(authorities) {
  const map = {}
  if (!authorities?.length) return map
  authorities.forEach((auth, idx) => {
    const name = auth.name || auth.authority_name || `Authority ${idx + 1}`
    const color = AUTH_COLORS[idx % AUTH_COLORS.length]
    const wards = auth.wards || []
    const councils = auth.councils || []
    wards.forEach(w => { map[w] = { authority: name, color, idx } })
    // Also store council-level assignment for fallback
    councils.forEach(c => { map[`__council__${c}`] = { authority: name, color, idx } })
  })
  return map
}

export default function LGRBoundaryMap({ boundaries, authorities, fiscalProfile, propertyAssets, deprivation }) {
  const [overlayMode, setOverlayMode] = useState('authority')

  // Build authority assignment map
  const authorityMap = useMemo(() => buildWardAuthorityMap(authorities), [authorities])

  // Build deprivation ward map
  const deprivationMap = useMemo(() => {
    if (!deprivation) return {}
    // deprivation.json can be { wards: {...} } or directly keyed by ward name
    const wards = deprivation.wards || deprivation
    const map = {}
    if (typeof wards === 'object' && !Array.isArray(wards)) {
      Object.entries(wards).forEach(([wardName, data]) => {
        const imd = data?.imd_score ?? data?.IMD_Score ?? data?.overall_score ?? null
        if (imd != null) map[wardName] = imd
      })
    }
    return map
  }, [deprivation])

  // Build demographic pressure map from fiscal profile
  const demographicMap = useMemo(() => {
    if (!fiscalProfile?.length) return {}
    const map = {}
    // fiscalProfile is per-authority; we need per-ward data
    // For now, assign authority-level pressure to all wards in that authority
    fiscalProfile.forEach((auth) => {
      const pressure = (auth.muslim_pct || 0) + (auth.under_16_pct || 0)
      // Find wards belonging to this authority
      Object.entries(authorityMap).forEach(([ward, info]) => {
        if (info.authority === auth.authority) {
          map[ward] = pressure
        }
      })
    })
    return map
  }, [fiscalProfile, authorityMap])

  // Build property assets for map markers
  const assetMarkers = useMemo(() => {
    if (!propertyAssets?.length) return []
    return propertyAssets
      .filter(a => a.lat && a.lng)
      .map(a => ({
        id: a.id || a.name,
        name: a.name || 'Unknown',
        lat: a.lat,
        lng: a.lng,
        category: a.category,
        linkedSpend: a.linked_supplier_spend_total || a.linkedSpend || 0,
        epcRating: a.epc_rating || a.epcRating,
      }))
  }, [propertyAssets])

  // Build wardData overlay for the current mode
  const wardData = useMemo(() => {
    const data = {}
    if (!boundaries?.features?.length) return data

    boundaries.features.forEach(f => {
      const name = f.properties?.name
      if (!name) return

      if (overlayMode === 'authority') {
        const info = authorityMap[name]
        if (info) {
          data[name] = { color: info.color, classLabel: info.authority }
        }
      } else if (overlayMode === 'deprivation') {
        const imd = deprivationMap[name]
        data[name] = { color: imdToColor(imd), classLabel: imd != null ? `IMD: ${imd.toFixed(1)}` : 'No data' }
      } else if (overlayMode === 'demographic') {
        const pressure = demographicMap[name]
        data[name] = { color: pressureToColor(pressure), classLabel: pressure != null ? `Pressure: ${pressure.toFixed(1)}` : 'No data' }
      }
      // 'property' mode: wards not coloured, markers handled by assets prop
    })
    return data
  }, [boundaries, overlayMode, authorityMap, deprivationMap, demographicMap])

  // All wards visible (not dimmed)
  const wardsUp = useMemo(() => {
    if (!boundaries?.features?.length) return []
    return boundaries.features.map(f => f.properties?.name).filter(Boolean)
  }, [boundaries])

  // Early return for missing data
  if (!boundaries?.features?.length) return null

  // Authority legend items
  const legendItems = useMemo(() => {
    if (overlayMode === 'authority') {
      if (!authorities?.length) return []
      return authorities.map((auth, i) => ({
        label: auth.name || auth.authority_name || `Authority ${i + 1}`,
        color: AUTH_COLORS[i % AUTH_COLORS.length],
      }))
    }
    if (overlayMode === 'deprivation') {
      return [
        { label: 'Least deprived', color: '#30d158' },
        { label: 'Moderate', color: '#ffd60a' },
        { label: 'Most deprived', color: '#ff453a' },
      ]
    }
    if (overlayMode === 'demographic') {
      return [
        { label: 'Low pressure', color: '#30d158' },
        { label: 'Moderate', color: '#ff9f0a' },
        { label: 'High pressure', color: '#ff453a' },
      ]
    }
    if (overlayMode === 'property') {
      return [
        { label: 'Property asset', color: '#0a84ff' },
      ]
    }
    return []
  }, [overlayMode, authorities])

  return (
    <div className="lgr-map-container" role="region" aria-label="LGR Boundary Map">
      {/* Overlay mode tabs */}
      <div className="lgr-map-tabs" role="tablist" aria-label="Map overlay mode">
        {OVERLAY_MODES.map(mode => {
          const Icon = mode.icon
          return (
            <button
              key={mode.id}
              role="tab"
              aria-selected={overlayMode === mode.id}
              className={`lgr-map-tab${overlayMode === mode.id ? ' lgr-map-tab--active' : ''}`}
              onClick={() => setOverlayMode(mode.id)}
            >
              <Icon size={14} />
              <span>{mode.label}</span>
            </button>
          )
        })}
      </div>

      {/* Map */}
      <div className="lgr-map-viewport">
        <Suspense fallback={<div className="lgr-map-fallback" data-testid="map-loading">Loading map...</div>}>
          <WardMap
            boundaries={boundaries}
            wardData={wardData}
            wardsUp={wardsUp}
            overlayMode="classification"
            assets={overlayMode === 'property' ? assetMarkers : []}
            height="460px"
          />
        </Suspense>
      </div>

      {/* Legend */}
      {legendItems.length > 0 && (
        <div className="lgr-map-legend" role="list" aria-label="Map legend">
          <div className="lgr-map-legend-title">
            <Map size={12} />
            Legend
          </div>
          <div className="lgr-map-legend-items">
            {legendItems.map(item => (
              <div key={item.label} className="lgr-map-legend-item" role="listitem">
                <span className="lgr-map-legend-swatch" style={{ background: item.color }} />
                <span className="lgr-map-legend-label">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Authority summary stats (only in authority mode) */}
      {overlayMode === 'authority' && fiscalProfile?.length > 0 && (
        <div className="lgr-map-stats-grid">
          {fiscalProfile.map((auth, i) => (
            <div key={auth.authority} className="lgr-map-stat-card" style={{ borderLeftColor: AUTH_COLORS[i % AUTH_COLORS.length] }}>
              <div className="lgr-map-stat-name">{auth.authority}</div>
              <div className="lgr-map-stat-row">
                <span>Population</span>
                <strong>{formatNumber(auth.population)}</strong>
              </div>
              <div className="lgr-map-stat-row">
                <span>Dependency</span>
                <strong>{formatPercent(auth.dependency_ratio, 1)}</strong>
              </div>
              <div className="lgr-map-stat-row">
                <span>Demand Score</span>
                <strong>{auth.service_demand_pressure_score || '-'}</strong>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
