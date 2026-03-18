/**
 * @module savings/spending
 * Spending intelligence functions: portfolio matching, budget variance, concentration.
 */

/**
 * Match spending records to a portfolio using spending_department_patterns.
 *
 * @param {Array} records - Spending records with department/service_division fields
 * @param {Object} portfolio - Portfolio from cabinet_portfolios.json
 * @param {Object} [summary] - Optional spending summary for fast-path
 * @returns {Array|Object} Matched spending records or portfolio-level aggregates
 */
export function matchSpendingToPortfolio(records, portfolio, summary) {
  // If a spending summary is available, return portfolio-level aggregates from it
  if (summary?.by_portfolio?.[portfolio?.id]) {
    return summary.by_portfolio[portfolio.id]
  }
  if (!records || !portfolio?.spending_department_patterns?.length) return []
  const patterns = portfolio.spending_department_patterns.map(p => new RegExp(p, 'i'))
  return records.filter(r => {
    const dept = r.department || r.service_division || r.service_area || ''
    return patterns.some(p => p.test(dept))
  })
}

/**
 * Compare actual spend from summary against budget allocation.
 *
 * @param {Object} portfolio - Portfolio from cabinet_portfolios.json
 * @param {Object} spendingSummary - From computeSpendingSummary()
 * @returns {{ budget: number, actual: number, variance: number, variance_pct: number, alert_level: string, months_data: Object[] }|null}
 */
export function spendingBudgetVariance(portfolio, spendingSummary) {
  if (!portfolio || !spendingSummary?.by_portfolio) return null

  const portfolioSpend = spendingSummary.by_portfolio[portfolio.id]
  if (!portfolioSpend) return null

  // Determine budget from portfolio data
  const budget = portfolio.budget_latest?.gross_expenditure
    || portfolio.budget_latest?.allocation
    || portfolio.budget_latest?.allocation_2026_27
    || 0

  if (!budget) return null

  const actual = portfolioSpend.total ?? 0

  // Annualise actual if data covers less than 12 months
  const monthCount = portfolioSpend.by_month?.length ?? 1
  const annualised = monthCount < 12 ? (actual / monthCount) * 12 : actual

  const variance = annualised - budget
  const variance_pct = budget > 0 ? (variance / budget) * 100 : 0

  let alert_level = 'green'
  if (Math.abs(variance_pct) > 15) alert_level = 'red'
  else if (Math.abs(variance_pct) > 5) alert_level = 'amber'

  return {
    budget,
    actual,
    annualised,
    months_of_data: monthCount,
    variance,
    variance_pct: Math.round(variance_pct * 10) / 10,
    alert_level,
    months_data: portfolioSpend.by_month || [],
  }
}

/**
 * Compute supplier concentration metrics within a portfolio.
 *
 * @param {Object} portfolioSpending - Portfolio spending from summary.by_portfolio[id]
 * @returns {{ hhi: number, top_supplier_pct: number, unique_suppliers: number, risk_level: string, top_3: Object[] }|null}
 */
export function spendingConcentration(portfolioSpending) {
  if (!portfolioSpending) return null

  const hhi = portfolioSpending.hhi ?? 0
  const topSuppliers = portfolioSpending.top_suppliers || []
  const uniqueSuppliers = portfolioSpending.unique_suppliers ?? 0
  const total = portfolioSpending.total ?? 0

  const topPct = topSuppliers[0] && total > 0 ? (topSuppliers[0].total / total * 100) : 0

  let risk_level = 'low'
  if (hhi > 2500) risk_level = 'high'
  else if (hhi > 1500) risk_level = 'moderate'

  return {
    hhi,
    top_supplier_pct: Math.round(topPct * 10) / 10,
    unique_suppliers: uniqueSuppliers,
    risk_level,
    top_3: topSuppliers.slice(0, 3).map(s => ({
      name: s.name,
      total: s.total,
      pct: Math.round(s.pct * 10) / 10,
    })),
  }
}
