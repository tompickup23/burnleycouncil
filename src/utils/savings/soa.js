/**
 * @module savings/soa
 * Statement of Accounts intelligence: bond analysis, loss trajectory,
 * opaque spending, savings delivery weighting.
 */

/**
 * Bond portfolio analysis.
 * Calculates the opportunity cost of holding UKMBA bonds vs alternative
 * treasury strategies, and the risk-adjusted position.
 *
 * @param {Object} treasury - administration.treasury from cabinet_portfolios.json (includes ukmba_bonds)
 * @returns {{ total_face_value: number, estimated_sale_loss: number, annual_coupon_income: number, opportunity_cost_annual: number, hold_recommendation: string, risk_rating: string, maturity_profile: Array }}
 */
export function bondPortfolioAnalysis(treasury) {
  if (!treasury?.ukmba_bonds) return { total_face_value: 0, estimated_sale_loss: 0, annual_coupon_income: 0, opportunity_cost_annual: 0, hold_recommendation: 'no_data', risk_rating: 'unknown', maturity_profile: [] }

  const bonds = treasury.ukmba_bonds
  const totalFace = bonds.total_face_value ?? 0
  const saleLoss = bonds.estimated_sale_loss ?? 0

  // Coupon income estimate: FRN at SONIA (~4.5%) + fixed at ~3.5% blended
  const frnFace = bonds.five_year_frn?.face_value ?? 0
  const fixedFace = bonds.forty_year_fixed?.face_value ?? 0
  const soniaRate = 0.045
  const fixedCouponRate = 0.035
  const annualCoupon = Math.round(frnFace * soniaRate + fixedFace * fixedCouponRate)

  // Opportunity cost: what would the capital earn if invested in gilts/MMFs instead?
  // Current gilt yield ~4.3%, vs blended coupon ~4.1% -> modest opportunity cost
  const altYield = 0.043
  const blendedCoupon = totalFace > 0 ? annualCoupon / totalFace : 0
  const opportunityCost = Math.max(0, Math.round(totalFace * (altYield - blendedCoupon)))

  // Loss ratio: sale loss as % of face value
  const lossRatio = totalFace > 0 ? saleLoss / totalFace : 0

  // Hold recommendation based on loss ratio
  let holdRec = 'hold_to_maturity'
  let riskRating = 'medium'
  if (lossRatio > 0.6) {
    holdRec = 'hold_to_maturity_critical'
    riskRating = 'high'
  } else if (lossRatio > 0.4) {
    holdRec = 'hold_to_maturity'
    riskRating = 'medium'
  } else if (lossRatio < 0.1) {
    holdRec = 'review_partial_sale'
    riskRating = 'low'
  }

  return {
    total_face_value: totalFace,
    estimated_sale_loss: saleLoss,
    loss_ratio_pct: Math.round(lossRatio * 100),
    annual_coupon_income: annualCoupon,
    opportunity_cost_annual: opportunityCost,
    hold_recommendation: holdRec,
    risk_rating: riskRating,
    maturity_profile: [
      { type: '5yr FRN', face_value: frnFace, rate_type: 'floating', est_rate_pct: Math.round(soniaRate * 1000) / 10 },
      { type: '40yr Fixed', face_value: fixedFace, rate_type: 'fixed', est_rate_pct: Math.round(fixedCouponRate * 1000) / 10 },
    ],
  }
}

/**
 * Statement of Accounts loss trajectory analysis.
 * Computes cumulative losses, year-on-year trends, worst-year identification,
 * and annualised loss rate to inform risk management.
 *
 * @param {Object} statementOfAccounts - administration.statement_of_accounts from cabinet_portfolios.json
 * @returns {{ cumulative_total: number, annual_average: number, worst_year: Object|null, trend: string, by_year: Array, loss_categories: Object }}
 */
export function lossTrajectoryAnalysis(statementOfAccounts) {
  if (!statementOfAccounts) return { cumulative_total: 0, annual_average: 0, worst_year: null, trend: 'no_data', by_year: [], loss_categories: {} }

  const fiLosses = statementOfAccounts.financial_instrument_losses?.by_year ?? []
  const disposalLosses = statementOfAccounts.disposal_academy_losses?.by_year ?? []

  // Build combined year-by-year view
  const yearMap = {}
  for (const fi of fiLosses) {
    if (!yearMap[fi.year]) yearMap[fi.year] = { year: fi.year, financial_instruments: 0, disposals: 0, total: 0 }
    yearMap[fi.year].financial_instruments = fi.amount
  }
  for (const d of disposalLosses) {
    if (!yearMap[d.year]) yearMap[d.year] = { year: d.year, financial_instruments: 0, disposals: 0, total: 0 }
    yearMap[d.year].disposals = d.amount
  }
  const byYear = Object.values(yearMap)
    .map(y => ({ ...y, total: y.financial_instruments + y.disposals }))
    .sort((a, b) => a.year.localeCompare(b.year))

  // Cumulative
  let cumulative = 0
  for (const y of byYear) {
    cumulative += y.total
    y.cumulative = cumulative
  }

  // Worst year
  const worstYear = byYear.reduce((worst, y) => (y.total > (worst?.total ?? 0) ? y : worst), null)

  // Trend: compare last 2 years vs first 2 years
  const earlyAvg = byYear.length >= 2 ? (byYear[0].total + byYear[1].total) / 2 : 0
  const lateAvg = byYear.length >= 2 ? (byYear[byYear.length - 2].total + byYear[byYear.length - 1].total) / 2 : 0
  let trend = 'stable'
  if (lateAvg > earlyAvg * 1.5) trend = 'worsening'
  else if (lateAvg < earlyAvg * 0.7) trend = 'improving'

  // Overspends
  const schoolTotal = statementOfAccounts.overspends?.school_overspends?.total ?? 0
  const councilTotal = statementOfAccounts.overspends?.council_overspends?.total ?? 0
  const subsidyTotal = Object.values(statementOfAccounts.specific_subsidies ?? {}).reduce((s, v) => s + (v.amount ?? 0), 0)

  const strictAudited = statementOfAccounts.strict_audited_total ?? 0
  const broaderTotal = statementOfAccounts.broader_official_total ?? 0

  return {
    strict_audited_total: strictAudited,
    broader_official_total: broaderTotal,
    cumulative_total: cumulative,
    annual_average: byYear.length > 0 ? Math.round(cumulative / byYear.length) : 0,
    worst_year: worstYear,
    trend,
    years_covered: byYear.length,
    by_year: byYear,
    loss_categories: {
      financial_instruments: statementOfAccounts.financial_instrument_losses?.total ?? 0,
      disposals_academy: statementOfAccounts.disposal_academy_losses?.total ?? 0,
      school_overspends: schoolTotal,
      council_overspends: councilTotal,
      subsidies: subsidyTotal,
    },
    veltip_estimate: statementOfAccounts.veltip_sale_loss_estimate?.amount ?? 0,
    veltip_overlap_warning: statementOfAccounts.veltip_sale_loss_estimate?.overlap_warning ?? false,
  }
}

/**
 * Opaque spending analysis.
 * Identifies portfolios/departments where payment descriptions are missing,
 * generic, or provide no useful information. Flags transparency failures
 * that block accountability and savings identification.
 *
 * @param {Object} spendingSummary - Output from useSpendingSummary hook
 * @param {Array} portfolios - Array of portfolios from cabinet_portfolios.json
 * @returns {{ opaque_pct: number, opaque_value: number, total_value: number, by_portfolio: Array, risk_rating: string, transparency_score: number }}
 */
export function opaqueSpendingAnalysis(spendingSummary, portfolios) {
  if (!spendingSummary) return { opaque_pct: 0, opaque_value: 0, total_value: 0, by_portfolio: [], risk_rating: 'no_data', transparency_score: 100 }

  // Analyse spending by portfolio
  const byPortfolio = []
  const portfolioSpend = spendingSummary.by_portfolio ?? {}

  for (const [id, data] of Object.entries(portfolioSpend)) {
    const total = data.total ?? 0
    const txnCount = data.count ?? 0
    // Look for empty description count in the portfolio data
    const emptyCount = data.empty_description_count ?? 0
    const emptyPct = txnCount > 0 ? Math.round((emptyCount / txnCount) * 100) : 0
    const emptyValue = data.empty_description_value ?? 0

    const portfolio = (portfolios ?? []).find(p => p.id === id)
    byPortfolio.push({
      id,
      title: portfolio?.short_title ?? portfolio?.title ?? id,
      total,
      txn_count: txnCount,
      opaque_count: emptyCount,
      opaque_pct: emptyPct,
      opaque_value: emptyValue,
      risk: emptyPct > 90 ? 'critical' : emptyPct > 50 ? 'high' : emptyPct > 20 ? 'medium' : 'low',
    })
  }

  // Sort by opaque percentage descending
  byPortfolio.sort((a, b) => b.opaque_pct - a.opaque_pct)

  // Totals
  const totalValue = byPortfolio.reduce((s, p) => s + p.total, 0)
  const opaqueValue = byPortfolio.reduce((s, p) => s + p.opaque_value, 0)
  const totalTxns = byPortfolio.reduce((s, p) => s + p.txn_count, 0)
  const opaqueTxns = byPortfolio.reduce((s, p) => s + p.opaque_count, 0)
  const opaquePct = totalTxns > 0 ? Math.round((opaqueTxns / totalTxns) * 100) : 0

  // Transparency score: 100 = fully transparent, 0 = fully opaque
  const transparencyScore = Math.max(0, 100 - opaquePct)

  // Risk rating
  let riskRating = 'low'
  if (opaquePct > 90) riskRating = 'critical'
  else if (opaquePct > 50) riskRating = 'high'
  else if (opaquePct > 20) riskRating = 'medium'

  return {
    opaque_pct: opaquePct,
    opaque_value: opaqueValue,
    total_value: totalValue,
    opaque_txn_count: opaqueTxns,
    total_txn_count: totalTxns,
    by_portfolio: byPortfolio,
    risk_rating: riskRating,
    transparency_score: transparencyScore,
  }
}

/**
 * Savings delivery weighting.
 * Takes historical delivery rate and discounts future savings estimates
 * to produce a probability-adjusted savings range. Directorates with
 * poor delivery history get lower adjusted estimates.
 *
 * @param {Object} profile - Directorate savings profile from buildDirectorateSavingsProfile()
 * @param {Object} directorate - Directorate data from cabinet_portfolios.json (with savings_delivery_history)
 * @returns {{ raw_range: Object, delivery_weight: number, adjusted_range: Object, confidence: string, history: Array }}
 */
export function savingsDeliveryWeighting(profile, directorate) {
  if (!profile) return { raw_range: { low: 0, high: 0, midpoint: 0 }, delivery_weight: 1.0, adjusted_range: { low: 0, high: 0, midpoint: 0 }, confidence: 'no_data', history: [] }

  const history = directorate?.savings_delivery_history ?? []
  const priorPct = profile.prior_year?.achieved_pct ?? null

  // Calculate delivery weight from history
  let deliveryWeight = 1.0
  if (history.length > 0) {
    // Weighted average: most recent year counts double
    let weightedSum = 0
    let weightTotal = 0
    for (let i = 0; i < history.length; i++) {
      const weight = i === 0 ? 2 : 1 // Most recent year (first in array) weighted 2x
      weightedSum += (history[i].pct ?? 100) * weight
      weightTotal += weight
    }
    deliveryWeight = Math.min(1.0, (weightedSum / weightTotal) / 100)
  } else if (priorPct != null) {
    // Fall back to single prior year from profile
    deliveryWeight = Math.min(1.0, priorPct / 100)
  }

  // Floor at 0.2 (even worst directorates likely to deliver something)
  deliveryWeight = Math.max(0.2, deliveryWeight)

  // Apply weight to savings range
  const rawLow = profile.savings_range?.low ?? 0
  const rawHigh = profile.savings_range?.high ?? 0
  const rawMid = profile.savings_range?.midpoint ?? (rawLow + rawHigh) / 2

  const adjLow = Math.round(rawLow * deliveryWeight)
  const adjHigh = Math.round(rawHigh * deliveryWeight)
  const adjMid = Math.round(rawMid * deliveryWeight)

  // Confidence rating
  let confidence = 'medium'
  if (deliveryWeight >= 0.75) confidence = 'high'
  else if (deliveryWeight >= 0.5) confidence = 'medium'
  else if (deliveryWeight >= 0.3) confidence = 'low'
  else confidence = 'very_low'

  return {
    raw_range: { low: rawLow, high: rawHigh, midpoint: rawMid },
    delivery_weight: Math.round(deliveryWeight * 100) / 100,
    delivery_weight_pct: Math.round(deliveryWeight * 100),
    adjusted_range: { low: adjLow, high: adjHigh, midpoint: adjMid },
    discount_amount: rawMid - adjMid,
    confidence,
    history,
  }
}
