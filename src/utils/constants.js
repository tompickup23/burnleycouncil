/**
 * Shared constants used across multiple pages/components.
 * Single source of truth — import from here, don't redefine locally.
 */

// ── Chart Color Palettes ──

/** Primary chart palette (10 colours). Use for pie charts, bar charts, etc. */
export const CHART_COLORS = [
  '#0a84ff', '#30d158', '#ff9f0a', '#ff453a', '#bf5af2',
  '#64d2ff', '#ff375f', '#ffd60a', '#ac8e68', '#8e8e93',
]

/** Extended palette (15 colours) for charts with more categories */
export const CHART_COLORS_EXTENDED = [
  '#0a84ff', '#30d158', '#ff9f0a', '#ff453a', '#bf5af2',
  '#64d2ff', '#ffd60a', '#ff6482', '#ac8e68', '#8e8e93',
  '#ff375f', '#34c759', '#007aff', '#5856d6', '#af52de',
]

/** Per-council brand colours for cross-council charts (all 15 councils) */
export const COUNCIL_COLORS = {
  burnley: '#ff453a',
  hyndburn: '#0a84ff',
  pendle: '#30d158',
  rossendale: '#bf5af2',
  lancaster: '#1B5E20',
  ribble_valley: '#6A1B9A',
  chorley: '#C62828',
  south_ribble: '#E65100',
  lancashire_cc: '#ff9f0a',
  blackpool: '#ff6482',
  west_lancashire: '#64d2ff',
  blackburn: '#5856d6',
  wyre: '#34c759',
  preston: '#007aff',
  fylde: '#ac8e68',
}

// ── Severity / Risk Colours ──

/** DOGE finding severity colours — canonical palette */
export const SEVERITY_COLORS = {
  critical: '#ff453a',
  alert: '#ff453a',
  high: '#ff6b6b',
  warning: '#ff9f0a',
  medium: '#ffcc02',
  info: '#0a84ff',
  low: '#30d158',
}

// ── Type Labels ──

/** Spending data type labels */
export const SPENDING_TYPE_LABELS = {
  spend: 'Spend',
  contracts: 'Contracts',
  purchase_cards: 'Purchase Cards',
}

/** Meeting type labels */
export const MEETING_TYPE_LABELS = {
  full_council: 'Full Council',
  executive: 'Executive',
  scrutiny: 'Scrutiny',
  planning: 'Planning',
  licensing: 'Licensing',
  audit: 'Audit & Governance',
  notice: 'Forward Plan',
  partnership: 'Partnership',
  other: 'Committee',
}

/** Meeting type colours */
export const MEETING_TYPE_COLORS = {
  full_council: '#ff453a',
  executive: '#0a84ff',
  scrutiny: '#ff9f0a',
  planning: '#30d158',
  licensing: '#bf5af2',
  audit: '#ff6b35',
  notice: '#8e8e93',
  partnership: '#64d2ff',
  other: '#a0a0a0',
}

// ── Recharts Tooltip Styles ──

/** Standard dark tooltip style for Recharts — white text on dark bg */
export const TOOLTIP_STYLE = {
  background: 'rgba(28, 28, 30, 0.95)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: '12px',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
  padding: '12px 16px',
  color: '#ffffff',
}

// ── Chart Grid & Axis Styles ──

/** Standardised grid line stroke for CartesianGrid */
export const GRID_STROKE = 'rgba(255, 255, 255, 0.06)'

/** Axis tick style — readable on dark backgrounds (WCAG AA) */
export const AXIS_TICK_STYLE = { fill: '#8e8e93', fontSize: 12 }

/** Smaller axis tick variant for tight spaces */
export const AXIS_TICK_STYLE_SM = { fill: '#8e8e93', fontSize: 11 }

// ── Council Display Names ──

/** Short names for charts/tables where space is limited */
export const COUNCIL_SHORT_NAMES = {
  burnley: 'Burnley',
  hyndburn: 'Hyndburn',
  pendle: 'Pendle',
  rossendale: 'Rossendale',
  lancaster: 'Lancaster',
  ribble_valley: 'Ribble Valley',
  chorley: 'Chorley',
  south_ribble: 'South Ribble',
  lancashire_cc: 'Lancashire CC',
  blackpool: 'Blackpool',
  west_lancashire: 'West Lancs',
  blackburn: 'Blackburn',
  wyre: 'Wyre',
  preston: 'Preston',
  fylde: 'Fylde',
}

/** Shorten council names for chart labels */
export function shortenCouncilName(name) {
  if (!name) return name
  return name
    .replace(/Blackburn with Darwen/gi, 'Blackburn')
    .replace(/Blackburn With Darwen/gi, 'Blackburn')
    .replace(/West Lancashire/gi, 'West Lancs')
    .replace(/Lancashire County Council/gi, 'Lancashire CC')
    .replace(/Lancashire CC/gi, 'Lancashire CC')
}
