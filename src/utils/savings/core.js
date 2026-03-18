/**
 * @module savings/core
 * Pure utility functions and constants for the Savings Engine.
 * No external imports -- this module is the dependency root.
 */

// Borough elections May 2026 -- 12 Lancashire districts elect
export const BOROUGH_ELECTION_DATE = '2026-05-07'
export const LANCASHIRE_DISTRICTS = [
  'burnley', 'hyndburn', 'pendle', 'rossendale', 'lancaster', 'ribble_valley',
  'chorley', 'south_ribble', 'preston', 'west_lancashire', 'wyre', 'fylde',
]

/**
 * Parse GBP-amount strings like "£2-10M", "£5M", "£0.5-1.2M" into { low, high } in raw GBP.
 *
 * @param {string} str - Savings range string
 * @returns {{ low: number, high: number }}
 */
export function parseSavingRange(str) {
  if (!str) return { low: 0, high: 0 }
  const m = (str || '').match(/£([\d.]+)(?:\s*-\s*([\d.]+))?\s*([MBK])?/i)
  if (!m) return { low: 0, high: 0 }
  const multiplier = (m[3] || 'M').toUpperCase() === 'B' ? 1e9 : (m[3] || 'M').toUpperCase() === 'K' ? 1e3 : 1e6
  const low = parseFloat(m[1]) * multiplier
  const high = m[2] ? parseFloat(m[2]) * multiplier : low * 1.2
  return { low, high }
}

/**
 * Classify a timeline string into a standard bucket.
 *
 * @param {string} tl - Timeline description
 * @returns {'immediate'|'short_term'|'medium_term'|'long_term'}
 */
export function timelineBucket(tl) {
  const s = (tl || '').toLowerCase()
  if (s.includes('immediate') || s.includes('0-3')) return 'immediate'
  if (s.includes('3-6') || s.includes('short')) return 'short_term'
  if (s.includes('6-12') || s.includes('12-18') || s.includes('medium')) return 'medium_term'
  return 'long_term'
}

/**
 * Format a number as a GBP currency string.
 *
 * @param {number} amount - Raw amount in GBP
 * @returns {string} Formatted string e.g. "£1.5M"
 */
export function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '£0'
  if (Math.abs(amount) >= 1000000000) return `£${(amount / 1000000000).toFixed(1)}B`
  if (Math.abs(amount) >= 1000000) return `£${(amount / 1000000).toFixed(1)}M`
  if (Math.abs(amount) >= 1000) return `£${(amount / 1000).toFixed(0)}K`
  return `£${amount.toFixed(0)}`
}

/**
 * Get all portfolios accessible to a given role level.
 *
 * @param {Array} portfolios - All portfolios
 * @param {string} role - User role
 * @param {Array} portfolioIds - User's assigned portfolio IDs
 * @returns {Array} Accessible portfolios
 */
export function getAccessiblePortfolios(portfolios, role, portfolioIds = []) {
  if (!portfolios?.length) return []

  // Leader and admin see everything
  if (role === 'leader' || role === 'admin') return portfolios

  // Others see assigned portfolios
  if (portfolioIds.includes('*')) return portfolios
  return portfolios.filter(p => portfolioIds.includes(p.id))
}
