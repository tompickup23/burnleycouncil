/**
 * LGR Economic Model — client-side computation engine.
 *
 * All functions are pure (no side effects) and unit-testable.
 * Used by LGRTracker.jsx for time-phased cashflow modelling,
 * sensitivity analysis, tornado diagrams, and what-if calculations.
 *
 * Architecture: Python pre-computes base data → lgr_budget_model.json
 * This JS engine computes time-phasing, NPV, and scenarios client-side
 * to enable interactive slider-driven recalculation on static GitHub Pages.
 */

// Default assumptions — overridden by lgr_budget_model.json model_defaults
export const DEFAULT_ASSUMPTIONS = {
  savingsRealisationRate: 0.75,
  transitionCostOverrun: 1.0,  // 1.0 = no overrun (central case)
  backOfficeSavingPct: 0.18,
  procurementSavingPct: 0.03,
  discountRate: 0.035,          // HM Treasury Green Book
  inflationRate: 0.02,          // CPI target
}

// Labels for assumption display
export const ASSUMPTION_LABELS = {
  savingsRealisationRate: 'Savings realisation',
  transitionCostOverrun: 'Transition cost overrun',
  backOfficeSavingPct: 'Back-office savings %',
  procurementSavingPct: 'Procurement savings %',
  discountRate: 'Discount rate',
  inflationRate: 'Inflation rate',
}

/**
 * Generate year-by-year cashflow for a given model.
 *
 * @param {Object} params
 * @param {number} params.annualSavings - Gross annual savings at full realisation
 * @param {Object} params.transitionCosts - { it, redundancy, programme, legal, total }
 * @param {Object} params.costProfile - Year-by-year % allocation per cost category
 * @param {number[]} params.savingsRamp - S-curve ramp percentages [Y-1, Y1, Y2, ...]
 * @param {Object} params.assumptions - User-adjustable assumptions
 * @returns {Object[]} Array of year objects
 */
export function computeCashflow({ annualSavings, transitionCosts, costProfile,
                                   savingsRamp, assumptions }) {
  const merged = { ...DEFAULT_ASSUMPTIONS, ...assumptions }
  const { savingsRealisationRate, transitionCostOverrun, discountRate, inflationRate } = merged

  const years = []  // Y-1 through Y10 = 12 entries
  let cumulative = 0
  let npvTotal = 0

  for (let i = 0; i < 12; i++) {
    const yearLabel = i === 0 ? 'Y-1' : `Y${i}`
    const yearNum = i === 0 ? -1 : i

    // Transition costs for this year (profiled + overrun factor)
    let yearCost = 0
    for (const [category, profile] of Object.entries(costProfile)) {
      const yearKey = i === 0 ? 'year_minus_1' : `year_${i}`
      const pct = profile[yearKey] || 0
      yearCost += (transitionCosts[category] || 0) * pct * transitionCostOverrun
    }

    // Savings for this year (ramped + realisation rate + inflation-adjusted)
    const rampPct = i < savingsRamp.length ? savingsRamp[i] : 1.0
    const inflationFactor = Math.pow(1 + inflationRate, Math.max(0, yearNum))
    const yearSaving = annualSavings * rampPct * savingsRealisationRate * inflationFactor

    const net = yearSaving - yearCost
    cumulative += net

    // NPV: discount factor = 1 / (1 + r)^t, where t is years from Y1
    const discountFactor = yearNum <= 0 ? 1 : 1 / Math.pow(1 + discountRate, yearNum)
    npvTotal += net * discountFactor

    years.push({
      year: yearLabel,
      yearNum,
      costs: -yearCost,
      savings: yearSaving,
      net,
      cumulative,
      npv: npvTotal,
      discountFactor,
    })
  }

  return years
}

/**
 * Compute sensitivity scenarios (best/central/worst) for a given model.
 * Returns object with 3 cashflow arrays.
 */
export function computeSensitivity({ annualSavings, transitionCosts, costProfile,
                                      savingsRamp, assumptions }) {
  const central = { ...DEFAULT_ASSUMPTIONS, ...assumptions }

  const scenarios = {
    best: {
      ...central,
      savingsRealisationRate: Math.min(1.0, central.savingsRealisationRate * 1.33),
      transitionCostOverrun: 1.0,
    },
    central,
    worst: {
      ...central,
      savingsRealisationRate: central.savingsRealisationRate * 0.67,
      transitionCostOverrun: 1.5,
    },
  }

  return Object.fromEntries(
    Object.entries(scenarios).map(([key, scAssumptions]) => [
      key,
      computeCashflow({ annualSavings, transitionCosts, costProfile, savingsRamp,
                        assumptions: scAssumptions })
    ])
  )
}

/**
 * Compute tornado diagram data — sensitivity of each assumption independently.
 * For each assumption, compute NPV at low and high values while holding others at central.
 * Returns array sorted by impact magnitude.
 */
export function computeTornado({ annualSavings, transitionCosts, costProfile,
                                  savingsRamp, assumptions }) {
  const central = { ...DEFAULT_ASSUMPTIONS, ...assumptions }
  const baseCashflow = computeCashflow({
    annualSavings, transitionCosts, costProfile, savingsRamp, assumptions: central
  })
  const baseNPV = baseCashflow[baseCashflow.length - 1].npv

  const ranges = {
    savingsRealisationRate: { low: 0.50, high: 1.00, label: 'Savings realisation rate' },
    transitionCostOverrun: { low: 1.00, high: 1.50, label: 'Transition cost overrun' },
    backOfficeSavingPct: { low: 0.12, high: 0.25, label: 'Back-office savings %' },
    procurementSavingPct: { low: 0.02, high: 0.05, label: 'Procurement savings %' },
    discountRate: { low: 0.01, high: 0.06, label: 'Discount rate' },
    inflationRate: { low: 0.01, high: 0.04, label: 'Inflation rate' },
  }

  const results = Object.entries(ranges).map(([key, { low, high, label }]) => {
    const lowCashflow = computeCashflow({
      annualSavings, transitionCosts, costProfile, savingsRamp,
      assumptions: { ...central, [key]: low }
    })
    const highCashflow = computeCashflow({
      annualSavings, transitionCosts, costProfile, savingsRamp,
      assumptions: { ...central, [key]: high }
    })

    const lowNPV = lowCashflow[lowCashflow.length - 1].npv
    const highNPV = highCashflow[highCashflow.length - 1].npv

    return {
      label, key,
      lowValue: low, highValue: high,
      lowNPV, highNPV, baseNPV,
      impact: Math.abs(highNPV - lowNPV),
    }
  })

  return results.sort((a, b) => b.impact - a.impact)
}

/**
 * Find the breakeven year from a cashflow array.
 * Returns the year label where cumulative first turns positive, or null.
 */
export function findBreakevenYear(cashflow) {
  for (const year of cashflow) {
    if (year.cumulative > 0) return year.year
  }
  return null
}

/**
 * Map model_id to transition cost key used in lgr_tracker.json
 */
export const MODEL_KEY_MAP = {
  two_unitary: 'two_ua',
  three_unitary: 'three_ua',
  four_unitary: 'four_ua',
  four_unitary_alt: 'five_ua',
  county_unitary: 'county',
}
