/**
 * MapIcons — SVG marker icon factory for Leaflet maps.
 *
 * Creates custom L.divIcon instances with inline SVG for
 * roadworks, traffic, bridges, signals, and emergency markers.
 *
 * Usage:
 *   import { createSVGIcon } from './map/MapIcons'
 *   L.marker([lat, lng], { icon: createSVGIcon('roadworks', 'high') })
 */
import L from 'leaflet'

const SEVERITY_FILLS = {
  critical: '#ff453a',
  high: '#ff6b6b',
  warning: '#ff9f0a',
  medium: '#ffcc02',
  low: '#30d158',
  info: '#00d4aa',
  default: '#8e8e93',
}

const ICON_SVGS = {
  roadworks: (fill) => `
    <svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <polygon points="14,2 26,24 2,24" fill="${fill}" fill-opacity="0.9" stroke="#000" stroke-width="0.5"/>
      <text x="14" y="20" text-anchor="middle" fill="#000" font-size="14" font-weight="800">!</text>
    </svg>`,

  traffic: (fill) => `
    <svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <polygon points="8,2 20,2 24,26 4,26" fill="${fill}" fill-opacity="0.85" stroke="#000" stroke-width="0.5" rx="2"/>
      <line x1="6" y1="26" x2="22" y2="26" stroke="#000" stroke-width="1.5"/>
      <rect x="11" y="8" width="6" height="4" rx="1" fill="#000" fill-opacity="0.3"/>
    </svg>`,

  bridge: (fill) => `
    <svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <path d="M2,20 Q14,6 26,20" fill="none" stroke="${fill}" stroke-width="3" stroke-linecap="round"/>
      <line x1="8" y1="12" x2="8" y2="24" stroke="${fill}" stroke-width="2"/>
      <line x1="20" y1="12" x2="20" y2="24" stroke="${fill}" stroke-width="2"/>
      <line x1="2" y1="24" x2="26" y2="24" stroke="${fill}" stroke-width="2"/>
    </svg>`,

  signal: (fill) => `
    <svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <rect x="9" y="2" width="10" height="24" rx="3" fill="#1c1c1e" stroke="${fill}" stroke-width="1"/>
      <circle cx="14" cy="8" r="3" fill="#ff453a"/>
      <circle cx="14" cy="15" r="3" fill="#ffcc02"/>
      <circle cx="14" cy="22" r="3" fill="#30d158"/>
    </svg>`,

  emergency: (fill) => `
    <svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="14" r="12" fill="${fill}" fill-opacity="0.9" stroke="#fff" stroke-width="1.5"/>
      <text x="14" y="19" text-anchor="middle" fill="#fff" font-size="16" font-weight="900">!</text>
    </svg>`,

  closure: (fill) => `
    <svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="14" r="12" fill="${fill}" fill-opacity="0.85" stroke="#000" stroke-width="0.5"/>
      <line x1="8" y1="8" x2="20" y2="20" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
      <line x1="20" y1="8" x2="8" y2="20" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    </svg>`,

  utility: (fill) => `
    <svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="4" width="20" height="20" rx="4" fill="${fill}" fill-opacity="0.85" stroke="#000" stroke-width="0.5"/>
      <path d="M10,10 L14,18 L18,10" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="14" cy="22" r="1.5" fill="#fff"/>
    </svg>`,
}

/**
 * Create a Leaflet divIcon with inline SVG.
 * @param {string} type — 'roadworks'|'traffic'|'bridge'|'signal'|'emergency'|'closure'|'utility'
 * @param {string} severity — 'critical'|'high'|'warning'|'medium'|'low'|'info'|'default'
 * @param {object} opts — { size?: number, pulse?: boolean, className?: string }
 * @returns {L.DivIcon}
 */
export function createSVGIcon(type = 'roadworks', severity = 'default', opts = {}) {
  const size = opts.size || 28
  const fill = SEVERITY_FILLS[severity] || SEVERITY_FILLS.default
  const svgFn = ICON_SVGS[type] || ICON_SVGS.roadworks
  const svg = svgFn(fill)
  const pulse = opts.pulse || severity === 'critical'

  const className = [
    'svg-map-marker',
    pulse ? 'svg-map-marker--pulse' : '',
    `svg-map-marker--${severity}`,
    opts.className || '',
  ].filter(Boolean).join(' ')

  return L.divIcon({
    html: svg,
    className,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
}

/**
 * Get icon type from roadworks data.
 * @param {object} work — Roadwork data object
 * @returns {string} Icon type name
 */
export function getIconType(work) {
  if (!work) return 'roadworks'
  const desc = (work.description || work.works_description || '').toLowerCase()
  const cat = (work.category || work.works_category || '').toLowerCase()

  if (desc.includes('emergency') || cat.includes('emergency')) return 'emergency'
  if (desc.includes('closure') || desc.includes('closed') || cat.includes('closure')) return 'closure'
  if (desc.includes('bridge') || desc.includes('structure')) return 'bridge'
  if (desc.includes('signal') || desc.includes('traffic light')) return 'signal'
  if (desc.includes('gas') || desc.includes('water') || desc.includes('electric') || desc.includes('utility')) return 'utility'
  if (desc.includes('traffic') || desc.includes('temporary')) return 'traffic'
  return 'roadworks'
}

/**
 * Get severity from roadworks data.
 * @param {object} work — Roadwork data object
 * @returns {string} Severity level
 */
export function getSeverity(work) {
  if (!work) return 'default'
  const sev = (work.severity || work.impact || '').toLowerCase()
  if (sev.includes('critical') || sev.includes('emergency')) return 'critical'
  if (sev.includes('high') || sev.includes('major')) return 'high'
  if (sev.includes('medium') || sev.includes('moderate')) return 'warning'
  if (sev.includes('low') || sev.includes('minor')) return 'low'
  return 'default'
}
