import { describe, it, expect } from 'vitest'
import {
  formatCurrency,
  formatNumber,
  formatDate,
  formatPercent,
  truncate,
  getFinancialYear,
  formatZScore,
  formatGini,
} from './format'

// ---------------------------------------------------------------------------
// formatCurrency
// ---------------------------------------------------------------------------
describe('formatCurrency', () => {
  it('formats a simple integer as GBP', () => {
    expect(formatCurrency(1000)).toBe('£1,000')
  })

  it('formats a decimal value with up to 2 fraction digits', () => {
    expect(formatCurrency(1234.5)).toBe('£1,234.5')
    expect(formatCurrency(1234.56)).toBe('£1,234.56')
  })

  it('returns "-" for null', () => {
    expect(formatCurrency(null)).toBe('-')
  })

  it('returns "-" for undefined', () => {
    expect(formatCurrency(undefined)).toBe('-')
  })

  it('returns "-" for NaN input', () => {
    expect(formatCurrency('abc')).toBe('-')
    expect(formatCurrency(NaN)).toBe('-')
  })

  it('handles zero', () => {
    expect(formatCurrency(0)).toBe('£0')
  })

  it('handles negative values', () => {
    expect(formatCurrency(-500)).toBe('-£500')
  })

  it('handles string numbers', () => {
    expect(formatCurrency('2500')).toBe('£2,500')
  })

  // compact mode
  it('formats millions in compact mode', () => {
    expect(formatCurrency(5_500_000, true)).toBe('£5.5M')
  })

  it('formats negative millions in compact mode', () => {
    expect(formatCurrency(-2_300_000, true)).toBe('£-2.3M')
  })

  it('formats thousands in compact mode', () => {
    expect(formatCurrency(45_000, true)).toBe('£45k')
  })

  it('formats negative thousands in compact mode', () => {
    expect(formatCurrency(-1_500, true)).toBe('£-2k')
  })

  it('does not compact values below 1000', () => {
    expect(formatCurrency(999, true)).toBe('£999')
  })
})

// ---------------------------------------------------------------------------
// formatNumber
// ---------------------------------------------------------------------------
describe('formatNumber', () => {
  it('formats an integer with commas', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
  })

  it('formats with specified decimal places', () => {
    expect(formatNumber(1234.5678, 2)).toBe('1,234.57')
  })

  it('defaults to 0 decimal places', () => {
    expect(formatNumber(99.99)).toBe('100')
  })

  it('returns "-" for null', () => {
    expect(formatNumber(null)).toBe('-')
  })

  it('returns "-" for undefined', () => {
    expect(formatNumber(undefined)).toBe('-')
  })

  it('returns "-" for NaN', () => {
    expect(formatNumber('xyz')).toBe('-')
    expect(formatNumber(NaN)).toBe('-')
  })

  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0')
  })

  it('handles negative numbers', () => {
    expect(formatNumber(-4567)).toBe('-4,567')
  })

  it('handles string numbers', () => {
    expect(formatNumber('9876')).toBe('9,876')
  })
})

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe('formatDate', () => {
  it('formats a date string in short format by default', () => {
    const result = formatDate('2024-06-15')
    // en-GB short: "15 Jun 2024"
    expect(result).toBe('15 Jun 2024')
  })

  it('formats a date string in long format', () => {
    const result = formatDate('2024-06-15', 'long')
    expect(result).toBe('15 June 2024')
  })

  it('returns "-" for null', () => {
    expect(formatDate(null)).toBe('-')
  })

  it('returns "-" for undefined', () => {
    expect(formatDate(undefined)).toBe('-')
  })

  it('returns "-" for empty string', () => {
    expect(formatDate('')).toBe('-')
  })

  it('returns the original string for an invalid date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })

  it('handles ISO date-time strings', () => {
    const result = formatDate('2024-01-01T12:00:00Z')
    expect(result).toContain('2024')
    expect(result).toContain('Jan')
  })
})

// ---------------------------------------------------------------------------
// formatPercent
// ---------------------------------------------------------------------------
describe('formatPercent', () => {
  it('formats a percentage with 1 decimal by default', () => {
    expect(formatPercent(45.678)).toBe('45.7%')
  })

  it('formats a percentage with specified decimals', () => {
    expect(formatPercent(12.3456, 2)).toBe('12.35%')
  })

  it('formats with 0 decimals', () => {
    expect(formatPercent(99.5, 0)).toBe('100%')
  })

  it('returns "-" for null', () => {
    expect(formatPercent(null)).toBe('-')
  })

  it('returns "-" for undefined', () => {
    expect(formatPercent(undefined)).toBe('-')
  })

  it('returns "-" for NaN', () => {
    expect(formatPercent('abc')).toBe('-')
    expect(formatPercent(NaN)).toBe('-')
  })

  it('handles zero', () => {
    expect(formatPercent(0)).toBe('0.0%')
  })

  it('handles negative percentages', () => {
    expect(formatPercent(-5.2)).toBe('-5.2%')
  })

  it('handles string numbers', () => {
    expect(formatPercent('88.88')).toBe('88.9%')
  })
})

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------
describe('truncate', () => {
  it('returns the string unchanged if shorter than maxLength', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })

  it('returns the string unchanged if exactly maxLength', () => {
    expect(truncate('12345', 5)).toBe('12345')
  })

  it('truncates and adds ellipsis when longer than maxLength', () => {
    expect(truncate('hello world this is long', 10)).toBe('hello w...')
  })

  it('uses default maxLength of 50', () => {
    const longStr = 'a'.repeat(60)
    const result = truncate(longStr)
    expect(result.length).toBe(50)
    expect(result.endsWith('...')).toBe(true)
  })

  it('returns empty string for null', () => {
    expect(truncate(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(truncate(undefined)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(truncate('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// getFinancialYear
// ---------------------------------------------------------------------------
describe('getFinancialYear', () => {
  it('returns correct FY for a date in April (start of FY)', () => {
    expect(getFinancialYear('2024-04-01')).toBe('2024/25')
  })

  it('returns correct FY for a date in December', () => {
    expect(getFinancialYear('2024-12-15')).toBe('2024/25')
  })

  it('returns correct FY for a date in January (previous calendar year FY)', () => {
    expect(getFinancialYear('2025-01-15')).toBe('2024/25')
  })

  it('returns correct FY for a date in March (end of FY)', () => {
    expect(getFinancialYear('2025-03-31')).toBe('2024/25')
  })

  it('returns correct FY for a date in February', () => {
    expect(getFinancialYear('2024-02-28')).toBe('2023/24')
  })

  it('returns null for null', () => {
    expect(getFinancialYear(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(getFinancialYear(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(getFinancialYear('')).toBeNull()
  })

  it('handles year boundary correctly at April 1', () => {
    expect(getFinancialYear('2023-04-01')).toBe('2023/24')
    expect(getFinancialYear('2023-03-31')).toBe('2022/23')
  })
})

// ---------------------------------------------------------------------------
// formatZScore
// ---------------------------------------------------------------------------

describe('formatZScore', () => {
  it('formats positive z-score with + prefix and sigma', () => {
    expect(formatZScore(2.4)).toBe('+2.4σ')
  })

  it('formats negative z-score with - prefix and sigma', () => {
    expect(formatZScore(-1.8)).toBe('-1.8σ')
  })

  it('formats zero z-score', () => {
    expect(formatZScore(0)).toBe('0.0σ')
  })

  it('returns - for null/NaN', () => {
    expect(formatZScore(null)).toBe('-')
    expect(formatZScore(NaN)).toBe('-')
    expect(formatZScore(undefined)).toBe('-')
  })
})

// ---------------------------------------------------------------------------
// formatGini
// ---------------------------------------------------------------------------

describe('formatGini', () => {
  it('formats concentrated Gini', () => {
    expect(formatGini(0.75)).toBe('0.75 (concentrated)')
  })

  it('formats moderate Gini', () => {
    expect(formatGini(0.55)).toBe('0.55 (moderate)')
  })

  it('formats mixed Gini', () => {
    expect(formatGini(0.35)).toBe('0.35 (mixed)')
  })

  it('formats diverse Gini', () => {
    expect(formatGini(0.20)).toBe('0.20 (diverse)')
  })

  it('returns - for null/NaN', () => {
    expect(formatGini(null)).toBe('-')
    expect(formatGini(NaN)).toBe('-')
  })
})
