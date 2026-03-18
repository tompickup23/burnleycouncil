/**
 * @module savings/benchmarking
 * Department operations profiling, process efficiency, portfolio benchmarking,
 * financial health assessment, implementation scoring, priority matrix.
 */

import { computeDistributionStats, peerBenchmark, reservesAdequacy, cipfaResilience, realGrowthRate, benfordSecondDigit, materialityThreshold } from '../analytics.js'

/**
 * Build operational profile for a department/portfolio.
 *
 * @param {Array} spending - Portfolio-matched spending records
 * @param {Object} portfolio - Portfolio
 * @returns {Object|null} Operations profile
 */
export function departmentOperationsProfile(spending, portfolio) {
  if (!spending?.length || !portfolio) return null

  const stats = computeDistributionStats(spending.map(r => r.amount ?? 0))

  // Payment patterns
  const dayOfWeek = new Array(7).fill(0)
  const monthCounts = {}
  for (const r of spending) {
    if (r.date) {
      const d = new Date(r.date)
      dayOfWeek[d.getDay()]++
      const m = r.date.substring(0, 7)
      monthCounts[m] = (monthCounts[m] || 0) + 1
    }
  }

  // Supplier diversity
  const uniqueSuppliers = new Set(spending.map(r => r.supplier || r.supplier_canonical)).size
  const avgPerSupplier = spending.length / Math.max(uniqueSuppliers, 1)

  return {
    portfolio_id: portfolio.id,
    total_transactions: spending.length,
    total_spend: stats.count > 0 ? spending.reduce((s, r) => s + (r.amount ?? 0), 0) : 0,
    distribution: stats,
    payment_patterns: {
      day_of_week: dayOfWeek,
      monthly_volumes: monthCounts,
    },
    supplier_diversity: {
      unique_suppliers: uniqueSuppliers,
      avg_transactions_per_supplier: Math.round(avgPerSupplier * 10) / 10,
    },
    demand_pressures: portfolio.demand_pressures || [],
    key_contracts: portfolio.key_contracts || [],
    operational_context: portfolio.operational_context || null,
    key_services: portfolio.key_services || [],
  }
}

/**
 * Calculate process efficiency score for a portfolio.
 *
 * @param {Array} spending - Portfolio spending records
 * @param {Object} options - { procurement }
 * @returns {{ score: number, components: Array }}
 */
export function processEfficiency(spending, options = {}) {
  if (!spending?.length) return { score: 0, components: [] }

  const components = []
  let totalScore = 0
  let componentCount = 0

  // 1. Payment regularity (are payments evenly spread?)
  const monthCounts = {}
  for (const r of spending) {
    if (r.date) {
      const m = r.date.substring(0, 7)
      monthCounts[m] = (monthCounts[m] || 0) + 1
    }
  }
  const monthValues = Object.values(monthCounts)
  if (monthValues.length > 1) {
    const monthStats = computeDistributionStats(monthValues)
    const cv = monthStats.mean > 0 ? monthStats.stdDev / monthStats.mean : 0
    const regularity = Math.max(0, Math.min(100, 100 - cv * 100))
    components.push({ name: 'Payment Regularity', score: Math.round(regularity), max: 100 })
    totalScore += regularity
    componentCount++
  }

  // 2. Supplier diversity score
  const uniqueSuppliers = new Set(spending.map(r => r.supplier || r.supplier_canonical)).size
  const diversityScore = Math.min(100, uniqueSuppliers / spending.length * 500)
  components.push({ name: 'Supplier Diversity', score: Math.round(diversityScore), max: 100 })
  totalScore += diversityScore
  componentCount++

  // 3. Round number avoidance (lower % of round numbers = better)
  const roundCount = spending.filter(r => {
    const amt = Math.abs(r.amount ?? 0)
    return amt >= 1000 && amt % 1000 === 0
  }).length
  const roundPct = (roundCount / spending.length) * 100
  const roundScore = Math.max(0, 100 - roundPct * 5)
  components.push({ name: 'Pricing Precision', score: Math.round(roundScore), max: 100 })
  totalScore += roundScore
  componentCount++

  return {
    score: componentCount > 0 ? Math.round(totalScore / componentCount) : 0,
    components,
  }
}

/**
 * Benchmark a portfolio against GOV.UK peer data.
 *
 * @param {Object} portfolio - Portfolio
 * @param {Object} budgetsGovuk - budgets_govuk.json
 * @returns {Array|null} Benchmark results
 */
export function portfolioBenchmark(portfolio, budgetsGovuk) {
  if (!portfolio || !budgetsGovuk) return null

  const categories = portfolio.budget_categories || []
  if (!categories.length) return null

  // Find peer values for matching categories
  const results = []
  for (const cat of categories) {
    const peerData = budgetsGovuk?.services?.[cat] || budgetsGovuk?.categories?.[cat]
    if (peerData?.authorities) {
      const values = Object.values(peerData.authorities).filter(v => typeof v === 'number')
      const lccValue = peerData.authorities?.lancashire_cc || peerData.authorities?.['Lancashire']
      if (lccValue != null && values.length > 1) {
        const benchmark = peerBenchmark(lccValue, values)
        results.push({
          category: cat,
          lcc_value: lccValue,
          ...benchmark,
        })
      }
    }
  }

  // Add real-terms growth trend for LCC values where multi-year data exists
  for (const r of results) {
    const peerData = budgetsGovuk?.services?.[r.category] || budgetsGovuk?.categories?.[r.category]
    if (peerData?.years) {
      const years = Object.keys(peerData.years).sort()
      const lccValues = years.map(y => peerData.years[y]?.lancashire_cc ?? peerData.years[y]?.['Lancashire']).filter(v => v != null)
      if (lccValues.length >= 2 && years.length >= lccValues.length) {
        r.real_growth = realGrowthRate(lccValues, years.slice(0, lccValues.length))
      }
    }
  }

  return results.length > 0 ? results : null
}

/**
 * Financial health assessment combining reserves adequacy, CIPFA resilience,
 * materiality threshold and optional Benford screening.
 *
 * @param {Object} budgetSummary - Budget summary data (reserves, expenditure, council tax)
 * @param {Object} budgetsGovuk - GOV.UK budget data (for Benford screening of year totals)
 * @returns {Object|null} Financial health report
 */
export function financialHealthAssessment(budgetSummary, budgetsGovuk) {
  if (!budgetSummary) return null

  const reserves = budgetSummary.reserves?.total_closing ?? budgetSummary.reserves?.usable ?? 0
  const expenditure = budgetSummary.net_revenue_expenditure ?? budgetSummary.net_expenditure ?? 0

  const reservesResult = reservesAdequacy(reserves, expenditure)

  const resilience = cipfaResilience({
    reserves,
    expenditure,
    councilTaxDependency: budgetSummary.council_tax?.dependency_pct ?? null,
    debtRatio: budgetSummary.debt_ratio ?? null,
    interestPaymentsRatio: budgetSummary.interest_payments_ratio ?? null,
  })

  const matThreshold = materialityThreshold(expenditure)

  // Benford second-digit screening on year totals if enough data
  const yearTotals = []
  if (budgetsGovuk?.services) {
    for (const svc of Object.values(budgetsGovuk.services)) {
      if (svc?.authorities) {
        for (const v of Object.values(svc.authorities)) {
          if (typeof v === 'number' && v > 0) yearTotals.push(v)
        }
      }
    }
  }
  const benford = yearTotals.length >= 50 ? benfordSecondDigit(yearTotals) : null

  return {
    reserves: reservesResult,
    resilience,
    materiality: matThreshold,
    benford_screening: benford,
    summary: {
      reserves_months: reservesResult?.monthsCover ?? 0,
      reserves_rating: reservesResult?.rating ?? 'Unknown',
      overall_resilience: resilience?.overallRating ?? 'Unknown',
      overall_color: resilience?.overallColor ?? '#6c757d',
      materiality_threshold: matThreshold?.threshold ?? 0,
    },
  }
}

/**
 * Score implementation progress for directives.
 *
 * @param {Array} directives - Directives with optional `status` field
 * @returns {{ delivered: number, in_progress: number, blocked: number, not_started: number, delivery_rate: number, total_delivered_value: number }}
 */
export function scoreImplementation(directives) {
  if (!directives?.length) return { delivered: 0, in_progress: 0, blocked: 0, not_started: 0, delivery_rate: 0, total_delivered_value: 0 }

  let delivered = 0, inProgress = 0, blocked = 0, notStarted = 0
  let deliveredValue = 0

  for (const d of directives) {
    const status = d.status || 'not_started'
    if (status === 'delivered' || status === 'completed') {
      delivered++
      deliveredValue += d.save_central ?? 0
    } else if (status === 'in_progress') inProgress++
    else if (status === 'blocked') blocked++
    else notStarted++
  }

  return {
    delivered,
    in_progress: inProgress,
    blocked,
    not_started: notStarted,
    total: directives.length,
    delivery_rate: directives.length > 0 ? Math.round((delivered / directives.length) * 100) : 0,
    total_delivered_value: deliveredValue,
  }
}

/**
 * Classify directives into priority quadrants.
 *
 * @param {Array} directives - Directives with feasibility and impact scores
 * @returns {{ do_now: Array, plan: Array, delegate: Array, park: Array }}
 */
export function priorityMatrix(directives) {
  if (!directives?.length) return { do_now: [], plan: [], delegate: [], park: [] }

  const doNow = []
  const plan = []
  const delegate = []
  const park = []

  for (const d of directives) {
    const f = d.feasibility ?? 5
    const i = d.impact ?? 5

    if (f >= 6 && i >= 6) doNow.push(d)
    else if (f < 6 && i >= 6) plan.push(d)
    else if (f >= 6 && i < 6) delegate.push(d)
    else park.push(d)
  }

  return { do_now: doNow, plan, delegate, park }
}
