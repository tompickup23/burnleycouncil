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


/**
 * Find transcript moments relevant to a topic or set of topics.
 * Used by directives, FOI generation, and evidence chain scoring
 * to cross-reference spoken council testimony with DOGE findings.
 *
 * @param {Object} transcriptsData - From useData('/data/transcripts.json')
 * @param {string|string[]} topics - Topic tag(s) to search for
 * @param {Object} [opts] - Options
 * @param {number} [opts.minScore=3] - Minimum composite score
 * @param {number} [opts.limit=10] - Max moments to return
 * @param {string} [opts.category] - Filter by category (attack/defence/promise/etc)
 * @returns {Array} Matching moments sorted by composite score desc
 */
export function getTranscriptEvidence(transcriptsData, topics, opts = {}) {
  if (!transcriptsData?.moments) return []
  const topicList = Array.isArray(topics) ? topics : [topics]
  const minScore = opts.minScore ?? 3
  const limit = opts.limit ?? 10
  const categoryFilter = opts.category ?? null

  const topicSet = new Set(topicList.map(t => t.toLowerCase().replace(/\s+/g, '_')))

  return transcriptsData.moments
    .filter(m => {
      if ((m.composite_score ?? 0) < minScore) return false
      if (categoryFilter && m.category !== categoryFilter) return false
      const momentTopics = (m.topics || []).map(t => t.toLowerCase())
      return momentTopics.some(t => topicSet.has(t))
    })
    .sort((a, b) => (b.composite_score ?? 0) - (a.composite_score ?? 0))
    .slice(0, limit)
    .map(m => ({
      moment_id: m.id,
      meeting_id: m.meeting_id,
      timestamp: (() => {
        const h = Math.floor(m.start / 3600)
        const min = Math.floor((m.start % 3600) / 60)
        const s = Math.floor(m.start % 60)
        return `${h}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      })(),
      quote: m.text,
      speaker: m.speaker,
      score: m.composite_score,
      category: m.category,
      clip_type: m.clip_type,
    }))
}
