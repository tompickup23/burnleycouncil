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


// ═══════════════════════════════════════════════════════════════════════
// Advanced Benford's Law Suite (Nigrini 2012)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Benford's first-two digits test (primary audit sample selection tool).
 * Expected proportion for digits d (10-99): log10(1 + 1/d)
 *
 * @param {number[]} amounts - Transaction amounts (filters to >= 10)
 * @returns {{observed: number[], expected: number[], chiSquared: number,
 *            df: number, n: number, spikes: Array, conformity: string}|null}
 */
export function benfordFirstTwoDigits(amounts) {
  if (!amounts || amounts.length < 500) return null

  const expected = {}
  for (let d = 10; d <= 99; d++) {
    expected[d] = Math.log10(1 + 1 / d)
  }

  const digitCounts = {}
  for (let d = 10; d <= 99; d++) digitCounts[d] = 0
  let n = 0

  for (const amt of amounts) {
    const absAmt = Math.abs(amt)
    if (absAmt < 10) continue
    const str = absAmt.toString().replace('.', '').replace(/^0+/, '')
    if (str.length < 2) continue
    const ft = parseInt(str.substring(0, 2), 10)
    if (ft >= 10 && ft <= 99) {
      digitCounts[ft]++
      n++
    }
  }

  if (n < 500) return null

  let chiSquared = 0
  const observed = []
  const expectedArr = []
  const spikes = []

  for (let d = 10; d <= 99; d++) {
    const obs = digitCounts[d]
    const expCount = expected[d] * n
    const obsPct = (obs / n) * 100
    const expPct = expected[d] * 100
    chiSquared += Math.pow(obs - expCount, 2) / expCount
    observed.push(obs)
    expectedArr.push(expCount)

    if (obs > 20 && expCount > 0 && obs / expCount > 1.5) {
      spikes.push({ digits: d, observed: obs, expected: Math.round(expCount * 10) / 10, ratio: Math.round(obs / expCount * 100) / 100 })
    }
  }

  // df=89, critical: p=0.05→112.02, p=0.01→122.94, p=0.001→135.81
  let conformity
  if (chiSquared > 135.81) conformity = 'non_conforming'
  else if (chiSquared > 122.94) conformity = 'marginal'
  else if (chiSquared > 112.02) conformity = 'acceptable'
  else conformity = 'conforming'

  spikes.sort((a, b) => b.ratio - a.ratio)

  return { observed, expected: expectedArr, chiSquared: Math.round(chiSquared * 100) / 100, df: 89, n, spikes: spikes.slice(0, 10), conformity }
}

/**
 * Benford's last-two digits uniformity test (round-number fraud detection).
 * Last two digits should be uniformly distributed (~1% each for 00-99).
 *
 * @param {number[]} amounts - Transaction amounts (filters to >= 100)
 * @returns {{observed: number[], chiSquared: number, df: number, n: number,
 *            roundNumberExcess: number, conformity: string, topEndings: Array}|null}
 */
export function benfordLastTwoDigits(amounts) {
  if (!amounts || amounts.length < 500) return null

  const digitCounts = new Array(100).fill(0)
  let n = 0

  for (const amt of amounts) {
    const absAmt = Math.abs(amt)
    if (absAmt < 100) continue
    const intPart = Math.floor(absAmt)
    const lastTwo = intPart % 100
    digitCounts[lastTwo]++
    n++
  }

  if (n < 500) return null

  const expectedCount = n / 100
  let chiSquared = 0
  const observed = []
  let roundNumberExcess = 0

  for (let d = 0; d < 100; d++) {
    const obs = digitCounts[d]
    chiSquared += Math.pow(obs - expectedCount, 2) / expectedCount
    observed.push(obs)
    if (d === 0 || d === 50) {
      roundNumberExcess += obs - expectedCount
    }
  }

  // df=99, critical: p=0.05→123.23, p=0.01→135.81, p=0.001→149.45
  let conformity
  if (chiSquared > 149.45) conformity = 'non_conforming'
  else if (chiSquared > 135.81) conformity = 'marginal'
  else if (chiSquared > 123.23) conformity = 'acceptable'
  else conformity = 'conforming'

  // Top over-represented endings
  const endings = observed.map((obs, d) => ({ digits: d, observed: obs, excess: Math.round((obs / n * 100 - 1) * 100) / 100 }))
  endings.sort((a, b) => b.excess - a.excess)

  return {
    observed,
    chiSquared: Math.round(chiSquared * 100) / 100,
    df: 99,
    n,
    roundNumberExcess: Math.round(roundNumberExcess),
    roundNumberExcessPct: Math.round(roundNumberExcess / n * 10000) / 100,
    conformity,
    topEndings: endings.slice(0, 10),
  }
}

/**
 * Benford's Summation Test (large fraud detection).
 * Sums values by first digit group — each should contribute ~11.1%.
 * Designed to catch single inflated invoices hiding in normal digit frequencies.
 *
 * @param {number[]} amounts - Transaction amounts (filters to > 0)
 * @returns {{digitAnalysis: Array, distortions: Array, totalSum: number}|null}
 */
export function benfordSummation(amounts) {
  if (!amounts || amounts.length < 100) return null

  const digitSums = {}
  const digitCounts = {}
  for (let d = 1; d <= 9; d++) { digitSums[d] = 0; digitCounts[d] = 0 }
  let totalSum = 0

  for (const amt of amounts) {
    if (amt <= 0) continue
    const str = Math.abs(amt).toString().replace('.', '').replace(/^0+/, '')
    if (!str) continue
    const fd = parseInt(str[0], 10)
    if (fd >= 1 && fd <= 9) {
      digitSums[fd] += amt
      digitCounts[fd]++
      totalSum += amt
    }
  }

  if (totalSum === 0) return null

  const expectedPct = 100 / 9
  const digitAnalysis = []
  const distortions = []

  for (let d = 1; d <= 9; d++) {
    const pct = (digitSums[d] / totalSum) * 100
    const deviation = pct - expectedPct
    digitAnalysis.push({
      digit: d,
      sum: Math.round(digitSums[d] * 100) / 100,
      count: digitCounts[d],
      pctOfTotal: Math.round(pct * 100) / 100,
      expectedPct: Math.round(expectedPct * 100) / 100,
      deviation: Math.round(deviation * 100) / 100,
    })

    if (deviation > 5) {
      distortions.push({ digit: d, pctOfTotal: Math.round(pct * 100) / 100, excessPct: Math.round(deviation * 100) / 100 })
    }
  }

  distortions.sort((a, b) => b.excessPct - a.excessPct)

  return { digitAnalysis, distortions, totalSum: Math.round(totalSum * 100) / 100 }
}


// ═══════════════════════════════════════════════════════════════════════
// Audit Standards Functions
// ═══════════════════════════════════════════════════════════════════════

/**
 * Calculate INTOSAI materiality threshold.
 * Standard: 1% of total expenditure (range 0.5-2%).
 *
 * @param {number} totalExpenditure - Total expenditure in £
 * @param {number} [pct=1.0] - Materiality percentage (default 1%)
 * @returns {{threshold: number, planningMateriality: number, pct: number}|null}
 */
export function materialityThreshold(totalExpenditure, pct = 1.0) {
  if (totalExpenditure == null || totalExpenditure <= 0) return null
  return {
    threshold: totalExpenditure * (pct / 100),
    planningMateriality: totalExpenditure * (pct / 200),  // Half of materiality
    pct,
  }
}

/**
 * CIPFA Financial Resilience assessment.
 * Scores council financial health across multiple components.
 *
 * @param {{reserves: number, expenditure: number, councilTaxDependency: number,
 *          debtRatio: number, interestPaymentsRatio: number}} data
 * @returns {{components: Array, overallRating: string, overallColor: string}}
 */
export function cipfaResilience(data) {
  if (!data) return null

  const components = []

  // Reserves assessment (uses existing reservesAdequacy)
  if (data.reserves != null && data.expenditure != null && data.expenditure > 0) {
    const res = reservesAdequacy(data.reserves, data.expenditure)
    if (res) {
      components.push({ name: 'Reserves', value: res.monthsCover, unit: 'months', rating: res.rating, color: res.color })
    }
  }

  // Council tax dependency
  if (data.councilTaxDependency != null) {
    const dep = data.councilTaxDependency
    let rating, color
    if (dep > 70) { rating = 'High Dependency'; color = '#dc3545' }
    else if (dep > 50) { rating = 'Moderate'; color = '#fd7e14' }
    else { rating = 'Diversified'; color = '#28a745' }
    components.push({ name: 'Council Tax Dependency', value: dep, unit: '%', rating, color })
  }

  // Debt ratio
  if (data.debtRatio != null) {
    const dr = data.debtRatio
    let rating, color
    if (dr > 100) { rating = 'Critical'; color = '#dc3545' }
    else if (dr > 50) { rating = 'Elevated'; color = '#fd7e14' }
    else { rating = 'Sustainable'; color = '#28a745' }
    components.push({ name: 'Debt Ratio', value: dr, unit: '%', rating, color })
  }

  // Overall rating
  const criticalCount = components.filter(c => c.color === '#dc3545').length
  const warningCount = components.filter(c => c.color === '#fd7e14').length
  let overallRating, overallColor
  if (criticalCount >= 2) { overallRating = 'Critical'; overallColor = '#dc3545' }
  else if (criticalCount >= 1 || warningCount >= 2) { overallRating = 'At Risk'; overallColor = '#fd7e14' }
  else { overallRating = 'Sustainable'; overallColor = '#28a745' }

  return { components, overallRating, overallColor }
}


// ═══════════════════════════════════════════════════════════════════════
// V6: Integrity-Weighted Analytics
// ═══════════════════════════════════════════════════════════════════════

/**
 * Integrity-weighted HHI — weights higher when supplier has councillor links.
 *
 * Standard HHI treats all suppliers equally. This variant applies a weight
 * multiplier when a supplier is linked to a councillor (via integrity.json),
 * amplifying the concentration signal for connected firms.
 *
 * @param {Array<{name: string, amount: number}>} suppliers - Supplier amounts
 * @param {Object} integrityData - integrity.json data
 * @param {number} conflictWeight - Multiplier for connected suppliers (default 1.5)
 * @returns {{ hhi: number, standardHhi: number, connectedSuppliers: number,
 *             amplification: number, isCouncillorConnected: boolean }}
 */
export function integrityWeightedHHI(suppliers, integrityData, conflictWeight = 1.5) {
  if (!suppliers || suppliers.length === 0) {
    return { hhi: 0, standardHhi: 0, connectedSuppliers: 0, amplification: 0, isCouncillorConnected: false };
  }

  // Build set of councillor-linked supplier names (lowercased)
  const connectedNames = new Set();
  if (integrityData?.councillors) {
    for (const cllr of integrityData.councillors) {
      const conflicts = cllr.ch?.supplier_conflicts || cllr.supplier_conflicts || [];
      for (const conflict of conflicts) {
        const name = conflict.supplier_match?.supplier || conflict.company_name || '';
        if (name) connectedNames.add(name.toLowerCase());
      }
      // Also check network crossovers
      const crossovers = cllr.ch?.network_crossovers || [];
      for (const co of crossovers) {
        if (co.supplier_company) connectedNames.add(co.supplier_company.toLowerCase());
      }
    }
  }

  // Calculate total spend
  const totalSpend = suppliers.reduce((sum, s) => sum + (s.amount || 0), 0);
  if (totalSpend === 0) {
    return { hhi: 0, standardHhi: 0, connectedSuppliers: 0, amplification: 0, isCouncillorConnected: false };
  }

  let standardHhi = 0;
  let weightedHhi = 0;
  let connectedCount = 0;

  for (const supplier of suppliers) {
    const share = (supplier.amount || 0) / totalSpend;
    const sharePct = share * 100;
    const standardContribution = sharePct * sharePct;
    standardHhi += standardContribution;

    const isConnected = connectedNames.has((supplier.name || '').toLowerCase());
    if (isConnected) {
      connectedCount++;
      weightedHhi += standardContribution * conflictWeight;
    } else {
      weightedHhi += standardContribution;
    }
  }

  return {
    hhi: Math.round(weightedHhi),
    standardHhi: Math.round(standardHhi),
    connectedSuppliers: connectedCount,
    amplification: standardHhi > 0 ? Math.round((weightedHhi / standardHhi - 1) * 100) : 0,
    isCouncillorConnected: connectedCount > 0,
  };
}

/**
 * Check if high Benford deviation should affect election model.
 * Returns a signal strength that can adjust incumbency bonus downward.
 *
 * @param {Object} benfordResult - Result from benfordSecondDigit() or benfordFirstTwoDigits()
 * @returns {{ signal: number, description: string }}
 */
export function benfordToElectionSignal(benfordResult) {
  if (!benfordResult) return { signal: 0, description: 'No Benford data' };

  // Non-conforming Benford → potential budget manipulation → local anger
  const conformity = benfordResult.conformity;
  const significant = benfordResult.significant;

  if (conformity === 'non_conforming' || (significant && benfordResult.chiSquared > 27.88)) {
    return {
      signal: -0.02, // -2pp incumbency adjustment
      description: `Highly non-conforming Benford (χ²=${benfordResult.chiSquared?.toFixed(1)}) → budget manipulation signal`,
    };
  }

  if (conformity === 'marginal' || (significant && benfordResult.chiSquared > 21.67)) {
    return {
      signal: -0.01, // -1pp
      description: `Marginal Benford conformity (χ²=${benfordResult.chiSquared?.toFixed(1)}) → minor concern signal`,
    };
  }

  return { signal: 0, description: 'Benford conforming — no election impact' };
}
