/**
 * Format a number as currency (GBP)
 */
export function formatCurrency(value, compact = false) {
  if (value === null || value === undefined) return '-'

  const num = Number(value)
  if (isNaN(num)) return '-'

  if (compact) {
    if (Math.abs(num) >= 1_000_000) {
      return `£${(num / 1_000_000).toFixed(1)}M`
    }
    if (Math.abs(num) >= 1_000) {
      return `£${(num / 1_000).toFixed(0)}k`
    }
  }

  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num)
}

/**
 * Format a number with commas
 */
export function formatNumber(value, decimals = 0) {
  if (value === null || value === undefined) return '-'

  const num = Number(value)
  if (isNaN(num)) return '-'

  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num)
}

/**
 * Format a date string
 */
export function formatDate(dateStr, format = 'short') {
  if (!dateStr) return '-'

  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr

  if (format === 'short') {
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Format a percentage
 */
export function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined) return '-'

  const num = Number(value)
  if (isNaN(num)) return '-'

  return `${num.toFixed(decimals)}%`
}

/**
 * Truncate text with ellipsis
 */
export function truncate(str, maxLength = 50) {
  if (!str) return ''
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength - 3) + '...'
}

/**
 * Create a URL-safe slug from a string.
 * Must match the Python slugify in generate_supplier_profiles.py.
 */
export function slugify(str) {
  if (!str) return ''
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Get financial year from date
 */
export function getFinancialYear(dateStr) {
  if (!dateStr) return null

  const date = new Date(dateStr)
  const month = date.getMonth() // 0-11
  const year = date.getFullYear()

  // Financial year runs April to March
  // If Jan-Mar, it's part of previous calendar year's FY
  if (month < 3) {
    return `${year - 1}/${String(year).slice(-2)}`
  }
  return `${year}/${String(year + 1).slice(-2)}`
}
