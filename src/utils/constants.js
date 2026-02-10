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

/** Per-council brand colours for cross-council charts */
export const COUNCIL_COLORS = {
  burnley: '#ff453a',
  hyndburn: '#0a84ff',
  pendle: '#30d158',
  rossendale: '#bf5af2',
  lancaster: '#1B5E20',
  ribble_valley: '#6A1B9A',
  chorley: '#C62828',
  south_ribble: '#E65100',
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
  notice: 'Forward Plan',
  partnership: 'Partnership',
}

/** Meeting type colours */
export const MEETING_TYPE_COLORS = {
  full_council: '#ff453a',
  executive: '#0a84ff',
  scrutiny: '#ff9f0a',
  planning: '#30d158',
  licensing: '#bf5af2',
  notice: '#8e8e93',
  partnership: '#64d2ff',
}

// ── Recharts Tooltip Styles ──

/** Standard dark tooltip style for Recharts */
export const TOOLTIP_STYLE = {
  background: 'rgba(28, 28, 30, 0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '10px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  padding: '12px 16px',
}
