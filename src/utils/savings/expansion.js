/**
 * @module savings/expansion
 * Treasury management, fees & charges, workforce optimisation, commercialisation pipeline.
 */

import { parseSavingRange } from './core.js'

/**
 * Treasury management savings model.
 * Reads administration.treasury data and calculates savings from:
 * - Idle cash optimisation (moving overnight deposits to MMFs/gilts)
 * - PWLB debt refinancing (legacy loans at above-market rates)
 * - MRP method switch (regulatory to asset life)
 * - Early payment discounts
 *
 * @param {Object} treasury - administration.treasury from cabinet_portfolios.json
 * @returns {{ idle_cash_cost: number, refinancing_potential: number, mrp_method_saving: number, early_payment_saving: number, total: number }}
 */
export function treasuryManagementSavings(treasury) {
  if (!treasury) return { idle_cash_cost: 0, refinancing_potential: 0, mrp_method_saving: 0, early_payment_saving: 0, total: 0 }

  // Idle cash: gap between benchmark yield and actual yield on cash balances
  const benchmarkIncome = treasury.investment_income_benchmark ?? 0
  const actualIncome = treasury.investment_income_actual ?? 0
  const idleCashCost = Math.max(0, benchmarkIncome - actualIncome)
  // Add any explicit idle cash opportunity from data
  const idleTotal = Math.max(idleCashCost, treasury.idle_cash_opportunity ?? 0)

  // Refinancing: legacy PWLB loans at above-market rates
  // Conservative: assume 30% of portfolio refinanceable (premium constraints)
  const rateDiff = (treasury.average_legacy_rate_pct ?? 0) - (treasury.current_pwlb_rate_pct ?? 0)
  const refinancingPotential = rateDiff > 0.5
    ? Math.round(treasury.total_borrowing * 0.3 * rateDiff / 100)
    : 0

  // MRP method switch
  const mrpSaving = treasury.asset_life_mrp_saving ?? 0

  // Early payment discount: 2% on 10-day payment terms for top suppliers
  // Assume 0.2% of debt service represents achievable early payment discount
  const earlyPaymentSaving = Math.round((treasury.annual_debt_service ?? 0) * 0.002)

  const total = idleTotal + refinancingPotential + mrpSaving + earlyPaymentSaving

  return {
    idle_cash_cost: idleTotal,
    refinancing_potential: refinancingPotential,
    mrp_method_saving: mrpSaving,
    early_payment_saving: earlyPaymentSaving,
    total,
  }
}

/**
 * Fees and charges review.
 * Scans portfolio savings levers for fee/charge/income-related items
 * and estimates the uplift potential from inflationary increases and
 * moving to full cost recovery.
 *
 * @param {Object} portfolio - Portfolio from cabinet_portfolios.json
 * @returns {{ current_income: number, inflationary_gap: number, cost_recovery_gap: number, uplift_potential: number, fee_lever_count: number }}
 */
export function feesAndChargesReview(portfolio) {
  if (!portfolio) return { current_income: 0, inflationary_gap: 0, cost_recovery_gap: 0, uplift_potential: 0, fee_lever_count: 0 }

  const FEE_KEYWORDS = /fee|charge|income|commercial|licence|permit|hire|parking|advertising|rent|sponsor/i
  const CPI_RATE = 0.032 // 3.2% CPI-H

  const feeLevers = (portfolio.savings_levers || []).filter(l =>
    FEE_KEYWORDS.test(l.lever || '') || FEE_KEYWORDS.test(l.description || '')
  )

  let totalLow = 0
  let totalHigh = 0
  for (const lever of feeLevers) {
    const { low, high } = parseSavingRange(lever.est_saving)
    totalLow += low
    totalHigh += high
  }

  // Estimate inflationary gap: budget gross expenditure * CPI * fee proportion
  const grossExp = portfolio.budget_latest?.gross_expenditure ?? 0
  const feeProportion = 0.08 // ~8% of gross is typically fee income
  const inflationary = Math.round(grossExp * feeProportion * CPI_RATE)

  // Cost recovery gap is the difference between mid-range lever savings and inflationary
  const midpoint = (totalLow + totalHigh) / 2
  const costRecoveryGap = Math.max(0, midpoint - inflationary)

  return {
    current_income: Math.round(grossExp * feeProportion),
    inflationary_gap: inflationary,
    cost_recovery_gap: costRecoveryGap,
    uplift_potential: Math.round(midpoint),
    fee_lever_count: feeLevers.length,
  }
}

/**
 * Workforce optimisation model.
 * Reads portfolio.workforce data and calculates savings from:
 * - Vacancy factor (3% budget hold)
 * - Agency premium (cost above permanent equivalent)
 * - Management delayering potential
 * - Turnover-related costs
 *
 * @param {Object} portfolio - Portfolio with workforce data
 * @returns {{ vacancy_savings: number, agency_premium: number, delayering_saving: number, turnover_cost: number, total: number }}
 */
export function workforceOptimisation(portfolio) {
  if (!portfolio?.workforce) return { vacancy_savings: 0, agency_premium: 0, delayering_saving: 0, turnover_cost: 0, total: 0 }

  const wf = portfolio.workforce
  const avgSalary = wf.average_salary ?? 32000
  const onCostMultiplier = 1.3 // NI + pension + on-costs

  // Vacancy factor: 3% of total staffing budget
  const totalStaffBudget = wf.fte_headcount * avgSalary * onCostMultiplier
  const vacancySavings = Math.round(totalStaffBudget * 0.03)

  // Agency premium: agency staff cost ~40% more than permanent
  const agencyFTE = wf.agency_fte ?? 0
  const agencySpend = wf.agency_spend ?? 0
  const permanentEquivalent = agencyFTE * avgSalary * onCostMultiplier
  const agencyPremium = Math.max(0, agencySpend - permanentEquivalent)

  // Delayering: if span of control < 7, savings from widening
  const span = wf.span_of_control ?? 6
  const layers = wf.management_layers ?? 5
  let delayeringSaving = 0
  if (span < 7 && layers > 4) {
    // Estimate management posts that could be removed
    const managementPosts = Math.round(wf.fte_headcount / (span + 1))
    const targetPosts = Math.round(wf.fte_headcount / 8) // target 1:8
    const removable = Math.max(0, managementPosts - targetPosts)
    const managementSalary = avgSalary * 1.3 // managers paid ~30% above average
    delayeringSaving = Math.round(removable * managementSalary * onCostMultiplier)
  }

  // Turnover cost: high turnover means recruitment costs
  const turnover = wf.voluntary_turnover_pct ?? 10
  const recruitmentCostPerHead = avgSalary * 0.15 // ~15% of salary
  const turnoverCost = Math.round(wf.fte_headcount * (turnover / 100) * recruitmentCostPerHead)

  return {
    vacancy_savings: vacancySavings,
    agency_premium: agencyPremium,
    delayering_saving: delayeringSaving,
    turnover_cost: turnoverCost,
    total: vacancySavings + agencyPremium + delayeringSaving,
  }
}

/**
 * Commercialisation pipeline - categorise and quantify income-generation levers.
 *
 * Legal framework:
 *  - LGA 2003 s93: Charging for discretionary services (cost recovery only)
 *  - LGA 2003 s95: Trading powers for profit (must be via company/Teckal)
 *  - Localism Act 2011: General power of competence (commercial via company)
 *  - Highways Act 1980 s115E: Objects/structures on highway (advertising, kiosks)
 *  - Road Traffic Regulation Act 1984: TROs for events
 *  - UK GDPR: Data monetisation constraints
 *  - Licensing Act 2003: Temporary event notices
 *
 * Six categories: traded, advertising, expertise, events, digital, fees
 *
 * @param {Object} portfolio - Portfolio from cabinet_portfolios.json
 * @returns {{ traded_income, advertising_income, expertise_income, events_income, digital_income, fees_income, commercial_lever_count, total, by_lever, quick_wins, legal_notes }}
 */
export function commercialisationPipeline(portfolio) {
  const empty = {
    traded_income: 0, advertising_income: 0, expertise_income: 0,
    events_income: 0, digital_income: 0, fees_income: 0,
    commercial_lever_count: 0, total: 0, by_lever: [], quick_wins: [], legal_notes: [],
  }
  if (!portfolio) return empty

  const TRADED_RE = /traded|sell.*service|academ|training|adult learning|school.*improve|shared.*service/i
  const ADVERTISING_RE = /advertising|sponsorship|roundabout|bus shelter|naming.*right|lamp.*column|banner|billboard/i
  const EXPERTISE_RE = /consultancy|programme.*management|expertise|cost-plus|NHS|external.*client/i
  const EVENTS_RE = /tour de france|event|conferencing|filming|location.*fee|sportive|camping|glamping|fan.*zone/i
  const DIGITAL_RE = /data.*moneti[sz]|analytics.*service|digital.*advert|website.*advert|platform|SaaS/i
  const FEES_RE = /fee.*charge|licen[sc]|permit|pre-app|building control|land.*charge|surplus.*charg/i
  const INCOME_TIER_RE = /income_generation/i

  const levers = portfolio.savings_levers || []
  const categories = { traded: 0, advertising: 0, expertise: 0, events: 0, digital: 0, fees: 0 }
  const byLever = []
  const quickWins = []
  const legalNotes = []

  for (const lever of levers) {
    const text = `${lever.lever ?? ''} ${lever.description ?? ''}`
    const { low, high } = parseSavingRange(lever.est_saving)
    const mid = (low + high) / 2
    if (mid <= 0) continue

    const isIncomeTier = INCOME_TIER_RE.test(lever.tier ?? '')
    let category = null

    if (EVENTS_RE.test(text)) category = 'events'
    else if (DIGITAL_RE.test(text)) category = 'digital'
    else if (ADVERTISING_RE.test(text)) category = 'advertising'
    else if (TRADED_RE.test(text)) category = 'traded'
    else if (EXPERTISE_RE.test(text)) category = 'expertise'
    else if (FEES_RE.test(text)) category = 'fees'
    else if (isIncomeTier) category = 'fees'

    if (!category) continue

    categories[category] += mid
    byLever.push({
      lever: lever.lever ?? '',
      category,
      low, high, mid,
      timeline: lever.timeline ?? '',
      risk: lever.risk ?? '',
      legal: lever.legal_constraints ?? '',
    })

    if (/0-3|0-6|3-6|6-12|immediate/i.test(lever.timeline ?? '') && /low|medium/i.test(lever.risk ?? '')) {
      quickWins.push({ lever: lever.lever ?? '', saving: lever.est_saving ?? '', timeline: lever.timeline ?? '', category })
    }

    if (lever.legal_constraints) {
      legalNotes.push(`${lever.lever}: ${lever.legal_constraints}`)
    }
  }

  const total = Object.values(categories).reduce((s, v) => s + v, 0)

  return {
    traded_income: Math.round(categories.traded),
    advertising_income: Math.round(categories.advertising),
    expertise_income: Math.round(categories.expertise),
    events_income: Math.round(categories.events),
    digital_income: Math.round(categories.digital),
    fees_income: Math.round(categories.fees),
    commercial_lever_count: byLever.length,
    total: Math.round(total),
    by_lever: byLever.sort((a, b) => b.mid - a.mid),
    quick_wins: quickWins,
    legal_notes: legalNotes,
  }
}
