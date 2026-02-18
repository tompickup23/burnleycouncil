/**
 * Shared Analytics Engine — pure computation functions for statistical analysis.
 *
 * Zero React dependencies. Used by Spending.jsx, Budgets.jsx, DogeInvestigation.jsx,
 * and the spending Web Worker.
 *
 * Architecture: Follows lgrModel.js pattern — all functions are pure, unit-testable,
 * and operate on plain data. Python pre-computes cross-council benchmarks;
 * this JS engine computes per-filter stats client-side for interactivity.
 */

// ONS CPI-H annual averages (2015/16 to 2025/26)
// Source: ONS series L55O — Consumer Prices Index including owner occupiers' housing costs
// Each value is the annual average index for that financial year (April–March)
// Base: 2015 = 100
export const CPI_H_INDEX = {
  '2015/16': 100.6,
  '2016/17': 102.3,
  '2017/18': 105.1,
  '2018/19': 107.4,
  '2019/20': 109.3,
  '2020/21': 110.3,
  '2021/22': 114.1,
  '2022/23': 124.7,
  '2023/24': 131.5,
  '2024/25': 136.0,
  '2025/26': 138.7,  // Forecast based on 2% CPI target
}

/**
 * Deflate a nominal amount to real terms.
 * Adjusts for inflation between two financial years using CPI-H.
 *
 * @param {number} nominal - Nominal amount in £
 * @param {string} fromYear - Financial year of the amount (e.g. '2023/24')
 * @param {string} toYear - Target financial year for comparison (e.g. '2024/25')
 * @returns {number|null} Real-terms amount, or null if years not in index
 */
export function deflate(nominal, fromYear, toYear) {
  if (nominal == null || isNaN(nominal)) return null
  const fromIdx = CPI_H_INDEX[fromYear]
  const toIdx = CPI_H_INDEX[toYear]
  if (!fromIdx || !toIdx) return null
  return nominal * (toIdx / fromIdx)
}

/**
 * Compute year-on-year real growth rates from nominal amounts.
 *
 * @param {number[]} amounts - Array of nominal amounts (chronological)
 * @param {string[]} years - Corresponding financial years
 * @returns {Array<{year: string, nominal: number, real: number, nominalGrowth: number|null, realGrowth: number|null}>}
 */
export function realGrowthRate(amounts, years) {
  if (!amounts || !years || amounts.length !== years.length) return []
  const latestYear = years[years.length - 1]

  return amounts.map((nominal, i) => {
    const real = deflate(nominal, years[i], latestYear) ?? nominal
    const prevNominal = i > 0 ? amounts[i - 1] : null
    const prevReal = i > 0 ? (deflate(amounts[i - 1], years[i - 1], latestYear) ?? amounts[i - 1]) : null

    return {
      year: years[i],
      nominal,
      real,
      nominalGrowth: prevNominal != null && prevNominal !== 0
        ? ((nominal - prevNominal) / prevNominal) * 100
        : null,
      realGrowth: prevReal != null && prevReal !== 0
        ? ((real - prevReal) / prevReal) * 100
        : null,
    }
  })
}

/**
 * Per-capita normalisation with null guard.
 *
 * @param {number} amount - Total amount in £
 * @param {number} population - Population count
 * @returns {number|null} Per-capita amount or null
 */
export function perCapita(amount, population) {
  if (amount == null || population == null || population <= 0) return null
  return amount / population
}

/**
 * Standard z-score calculation.
 *
 * @param {number} value - Observed value
 * @param {number} mean - Population/sample mean
 * @param {number} stdDev - Population/sample standard deviation
 * @returns {number|null} z-score or null if stdDev is 0
 */
export function zScore(value, mean, stdDev) {
  if (value == null || mean == null || stdDev == null || stdDev === 0) return null
  return (value - mean) / stdDev
}

/**
 * Compute distribution statistics from an array of amounts.
 * Uses Welford's online algorithm for numerically stable variance.
 *
 * @param {number[]} amounts - Array of numeric values
 * @returns {{mean: number, median: number, stdDev: number, variance: number,
 *            p10: number, p25: number, p75: number, p90: number,
 *            skewness: number|null, count: number, min: number, max: number, iqr: number}}
 */
export function computeDistributionStats(amounts) {
  if (!amounts || amounts.length === 0) {
    return { mean: 0, median: 0, stdDev: 0, variance: 0,
             p10: 0, p25: 0, p75: 0, p90: 0,
             skewness: null, count: 0, min: 0, max: 0, iqr: 0 }
  }

  // Welford's online algorithm for mean and variance
  let n = 0, mean = 0, m2 = 0, m3 = 0
  let min = Infinity, max = -Infinity

  for (const x of amounts) {
    n++
    const delta = x - mean
    const deltaN = delta / n
    const deltaN2 = deltaN * deltaN
    const term1 = delta * deltaN * (n - 1)
    mean += deltaN
    m3 += term1 * deltaN * (n - 2) - 3 * deltaN * m2
    m2 += term1

    if (x < min) min = x
    if (x > max) max = x
  }

  const variance = n > 1 ? m2 / (n - 1) : 0
  const stdDev = Math.sqrt(variance)

  // Skewness (Fisher's, sample-corrected)
  let skewness = null
  if (n >= 3 && stdDev > 0) {
    skewness = (n * m3) / ((n - 1) * (n - 2) * stdDev * stdDev * stdDev)
  }

  // Sort for percentiles and median
  const sorted = [...amounts].sort((a, b) => a - b)
  const percentile = (p) => {
    const idx = (p / 100) * (sorted.length - 1)
    const lo = Math.floor(idx)
    const hi = Math.ceil(idx)
    if (lo === hi) return sorted[lo]
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
  }

  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2

  const p10 = percentile(10)
  const p25 = percentile(25)
  const p75 = percentile(75)
  const p90 = percentile(90)

  return {
    mean, median, stdDev, variance,
    p10, p25, p75, p90,
    skewness, count: n, min, max,
    iqr: p75 - p25,
  }
}

/**
 * Compute Gini coefficient for supplier concentration.
 * 0 = perfectly equal distribution, 1 = complete monopoly.
 *
 * @param {number[]} amounts - Array of positive amounts (e.g. supplier totals)
 * @returns {number} Gini coefficient [0, 1]
 */
export function giniCoefficient(amounts) {
  if (!amounts || amounts.length <= 1) return 0

  const sorted = [...amounts].filter(a => a > 0).sort((a, b) => a - b)
  const n = sorted.length
  if (n <= 1) return 0

  const sum = sorted.reduce((s, v) => s + v, 0)
  if (sum === 0) return 0

  let weightedSum = 0
  for (let i = 0; i < n; i++) {
    weightedSum += (2 * (i + 1) - n - 1) * sorted[i]
  }
  return weightedSum / (n * sum)
}

/**
 * Assess reserves adequacy against CIPFA guidance.
 * Returns months of cover and a rating.
 *
 * CIPFA thresholds:
 *  < 3 months = critical (red)
 *  3-6 months = low (orange)
 *  6-12 months = adequate (green)
 *  > 12 months = strong (blue)
 *
 * @param {number} reserves - Total usable reserves (£)
 * @param {number} expenditure - Annual net revenue expenditure (£)
 * @returns {{monthsCover: number, rating: string, color: string}|null}
 */
export function reservesAdequacy(reserves, expenditure) {
  if (reserves == null || expenditure == null || expenditure <= 0) return null
  const monthsCover = (reserves / expenditure) * 12

  let rating, color
  if (monthsCover < 3) { rating = 'Critical'; color = '#dc3545' }
  else if (monthsCover < 6) { rating = 'Low'; color = '#fd7e14' }
  else if (monthsCover < 12) { rating = 'Adequate'; color = '#28a745' }
  else { rating = 'Strong'; color = '#007bff' }

  return { monthsCover, rating, color }
}

/**
 * Benford's second-digit analysis with chi-squared goodness of fit.
 *
 * Expected second-digit distribution (Nigrini, 2012):
 * Digit: 0=11.97%, 1=11.39%, 2=10.88%, 3=10.43%, 4=10.03%,
 *        5=9.67%, 6=9.34%, 7=9.04%, 8=8.76%, 9=8.50%
 *
 * @param {number[]} amounts - Transaction amounts (filters out ≤ 9)
 * @returns {{observed: number[], expected: number[], chiSquared: number,
 *            df: number, n: number, significant: boolean, pDescription: string}|null}
 */
export function benfordSecondDigit(amounts) {
  if (!amounts || amounts.length === 0) return null

  const expectedPct = [0.1197, 0.1139, 0.1088, 0.1043, 0.1003,
                        0.0967, 0.0934, 0.0904, 0.0876, 0.0850]

  // Extract second digits from amounts > 9
  const digitCounts = new Array(10).fill(0)
  let n = 0

  for (const amt of amounts) {
    const absAmt = Math.abs(amt)
    if (absAmt < 10) continue

    // Get the second significant digit
    const str = absAmt.toString().replace('.', '')
    const digits = str.replace(/^0+/, '')
    if (digits.length < 2) continue

    const secondDigit = parseInt(digits[1], 10)
    if (!isNaN(secondDigit)) {
      digitCounts[secondDigit]++
      n++
    }
  }

  if (n < 50) return null  // Need minimum sample for chi-squared

  // Chi-squared goodness of fit
  let chiSquared = 0
  const observed = []
  const expected = []

  for (let d = 0; d < 10; d++) {
    const obs = digitCounts[d]
    const exp = expectedPct[d] * n
    observed.push(obs)
    expected.push(exp)
    chiSquared += Math.pow(obs - exp, 2) / exp
  }

  const df = 9  // 10 digits - 1

  // Critical values for chi-squared with 9 df
  // p=0.05 → 16.92, p=0.01 → 21.67, p=0.001 → 27.88
  let significant, pDescription
  if (chiSquared > 27.88) { significant = true; pDescription = 'p < 0.001 (highly significant)' }
  else if (chiSquared > 21.67) { significant = true; pDescription = 'p < 0.01 (very significant)' }
  else if (chiSquared > 16.92) { significant = true; pDescription = 'p < 0.05 (significant)' }
  else { significant = false; pDescription = 'p > 0.05 (not significant)' }

  return { observed, expected, chiSquared, df, n, significant, pDescription }
}

/**
 * Peer benchmarking — rank a value against peers.
 *
 * @param {number} value - The council's value
 * @param {number[]} peerValues - Array of all peer values (including this council)
 * @returns {{rank: number, total: number, percentile: number, median: number,
 *            rating: string, color: string}}
 */
export function peerBenchmark(value, peerValues) {
  if (!peerValues || peerValues.length === 0 || value == null) {
    return { rank: 0, total: 0, percentile: 0, median: 0, rating: 'N/A', color: '#6c757d' }
  }

  const sorted = [...peerValues].sort((a, b) => a - b)
  const n = sorted.length

  // Rank (1 = lowest)
  const rank = sorted.filter(v => v <= value).length

  // Median
  const mid = Math.floor(n / 2)
  const median = n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2

  // Percentile
  const percentile = (rank / n) * 100

  // Rating (lower spend = better for efficiency metrics)
  let rating, color
  if (percentile <= 25) { rating = 'Low'; color = '#28a745' }
  else if (percentile <= 75) { rating = 'Average'; color = '#fd7e14' }
  else { rating = 'High'; color = '#dc3545' }

  return { rank, total: n, percentile, median, rating, color }
}

/**
 * Normalise financial year format.
 * Converts between: 2021-22 ↔ 2021/22
 *
 * @param {string} year - Financial year in either format
 * @param {string} format - Target format: 'slash' (2021/22) or 'dash' (2021-22)
 * @returns {string} Normalised financial year
 */
export function normalizeFinancialYear(year, format = 'slash') {
  if (!year) return year
  const sep = format === 'slash' ? '/' : '-'
  return year.replace(/[/-]/, sep)
}
