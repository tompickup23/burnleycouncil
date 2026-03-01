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


// ═══════════════════════════════════════════════════════════════════════
// V6: DOGE-Adjusted Savings Realisation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Calculate per-authority savings realisation rate based on DOGE findings.
 *
 * Instead of a flat 75% realisation rate, adjust per-authority based on:
 * - Supplier HHI: High concentration = limited procurement savings
 * - Duplicate/fraud scores: Lower realisation for councils with weak controls
 * - Integrity conflicts: Connected firms in monopoly → minimal savings
 *
 * @param {Object} dogeFindings - doge_findings.json data for a council
 * @param {Object} integrityData - integrity.json data for a council
 * @returns {{ realisationRate: number, procurementSaving: number, factors: string[] }}
 */
export function calculateDogeAdjustedRealisation(dogeFindings, integrityData) {
  let realisationRate = 0.75; // Base rate
  let procurementSaving = 0.03; // Base procurement saving %
  const factors = [];

  if (!dogeFindings) {
    return { realisationRate, procurementSaving, factors: ['No DOGE data — using default 75% realisation'] };
  }

  // Supplier concentration assessment
  const findings = dogeFindings.findings || dogeFindings;
  const supplierHHI = Array.isArray(findings)
    ? findings.find(f => f.type === 'supplier_concentration' || f.type === 'category_monopoly')
    : null;

  if (supplierHHI) {
    const hhi = supplierHHI.hhi || supplierHHI.value || 0;
    if (hhi > 2500) {
      procurementSaving = 0.01; // Near-monopoly: minimal procurement savings
      factors.push(`HHI ${hhi} (HIGH concentration) → procurement saving 1%`);
    } else if (hhi > 1500) {
      procurementSaving = 0.02;
      factors.push(`HHI ${hhi} (moderate concentration) → procurement saving 2%`);
    } else if (hhi < 800) {
      procurementSaving = 0.05; // Low concentration: more savings possible
      factors.push(`HHI ${hhi} (low concentration) → procurement saving 5%`);
    }
  }

  // Duplicate/fraud risk → reduce realisation rate
  const duplicateRisk = Array.isArray(findings)
    ? findings.find(f => f.type === 'duplicate_payments' || f.type === 'likely_duplicates')
    : null;

  if (duplicateRisk) {
    const dupAmount = duplicateRisk.total_amount || duplicateRisk.value || 0;
    if (dupAmount > 500000) {
      realisationRate -= 0.10;
      factors.push(`High duplicate risk (£${(dupAmount / 1000).toFixed(0)}k) → realisation -10pp`);
    } else if (dupAmount > 100000) {
      realisationRate -= 0.05;
      factors.push(`Moderate duplicate risk (£${(dupAmount / 1000).toFixed(0)}k) → realisation -5pp`);
    }
  }

  // Integrity: councillor-connected monopoly suppliers
  if (integrityData?.summary) {
    const conflicts = integrityData.summary.supplier_conflicts || 0;
    if (conflicts >= 5) {
      procurementSaving = Math.max(0.01, procurementSaving - 0.01);
      factors.push(`${conflicts} councillor-supplier conflicts → procurement saving reduced`);
    }
  }

  realisationRate = Math.max(0.40, Math.min(1.0, realisationRate));

  return { realisationRate, procurementSaving, factors };
}

/**
 * Compute data quality risk adjustment for transition costs.
 *
 * @param {Object} dogeFindings - doge_findings.json data
 * @param {Object} integrityData - integrity.json data
 * @returns {{ dataRemediationCost: number, legalRiskCost: number, factors: string[] }}
 */
export function calculateTransitionRiskAdjustment(dogeFindings, integrityData) {
  let dataRemediationCost = 0;
  let legalRiskCost = 0;
  const factors = [];

  if (dogeFindings) {
    const findings = dogeFindings.findings || dogeFindings;
    // Missing descriptions → data quality issue
    const missingDescs = Array.isArray(findings)
      ? findings.find(f => f.type === 'missing_descriptions')
      : null;

    if (missingDescs) {
      const pct = missingDescs.pct || missingDescs.percentage || 0;
      if (pct > 50) {
        dataRemediationCost = 5000000; // £5M
        factors.push(`${pct}% missing descriptions → £5M data remediation estimate`);
      } else if (pct > 20) {
        dataRemediationCost = 2000000; // £2M
        factors.push(`${pct}% missing descriptions → £2M data remediation estimate`);
      }
    }
  }

  if (integrityData?.summary) {
    const highRisk = (integrityData.summary.risk_distribution?.high || 0) +
                     (integrityData.summary.risk_distribution?.elevated || 0);
    if (highRisk >= 10) {
      legalRiskCost = 1000000; // £1M additional legal
      factors.push(`${highRisk} high/elevated risk councillors → £1M legal risk provision`);
    }
  }

  return { dataRemediationCost, legalRiskCost, factors };
}

/**
 * Estimate property rationalisation savings from asset portfolio data.
 * Used in LGR modelling to quantify estate consolidation potential.
 *
 * Ownership-weighted: savings are scaled by ownership_pct. A 50% JV asset
 * only contributes 50% of its saving. Subsidiary assets may need board
 * approval for transfer under LGR.
 *
 * @param {Array} propertyAssets - Array of asset objects from property_assets.json
 * @returns {{ disposalSaving: number, coLocationSaving: number, conditionSaving: number,
 *             subsidiaryValue: number, subsidiaryCount: number, jvCount: number, factors: string[] }}
 */
export function estimatePropertyRationalisationSavings(propertyAssets) {
  const factors = [];
  if (!propertyAssets?.length) {
    return { disposalSaving: 0, coLocationSaving: 0, conditionSaving: 0,
             subsidiaryValue: 0, subsidiaryCount: 0, jvCount: 0,
             factors: ['No property data available'] };
  }

  // Helper: effective ownership weight (default 1.0 for direct LCC assets)
  const ownershipWeight = (a) => {
    const pct = a.ownership_pct ?? 1.0;
    return Math.max(0, Math.min(1, pct));
  };

  // Disposal savings: category A/B candidates × estimated annual holding cost, weighted by ownership
  const disposalCandidates = propertyAssets.filter(a => a.disposal?.category === 'A' || a.disposal?.category === 'B');
  const avgHoldingCost = 15000; // £15k average annual holding cost per property
  const disposalSaving = disposalCandidates.reduce((s, a) =>
    s + avgHoldingCost * 0.75 * ownershipWeight(a), 0);
  if (disposalCandidates.length > 0) {
    factors.push(`${disposalCandidates.length} disposal candidates → £${Math.round(disposalSaving / 1000)}k annual saving (75% realisation, ownership-weighted)`);
  }

  // Co-location savings: properties within 500m that could be consolidated
  const coLocatable = propertyAssets.filter(a => (a.nearby_500m || 0) > 0);
  const coLocationSaving = Math.floor(coLocatable.length / 2) * 25000 * 0.5; // Pairs × £25k × 50% realisation
  if (coLocatable.length >= 2) {
    factors.push(`${coLocatable.length} co-locatable assets (${Math.floor(coLocatable.length / 2)} pairs) → £${Math.round(coLocationSaving / 1000)}k potential`);
  }

  // Condition spend reduction via better estate management, weighted by ownership
  const totalCondition = propertyAssets.reduce((s, a) =>
    s + (a.condition_spend || 0) * ownershipWeight(a), 0);
  const conditionSaving = totalCondition * 0.20; // 20% efficiency from consolidated management
  if (totalCondition > 0) {
    factors.push(`£${Math.round(totalCondition / 1000)}k condition spend → £${Math.round(conditionSaving / 1000)}k saving (20% efficiency, ownership-weighted)`);
  }

  // Subsidiary/JV estate context for LGR planning
  const subsidiaryAssets = propertyAssets.filter(a => a.tier === 'subsidiary');
  const jvAssets = propertyAssets.filter(a => a.tier === 'jv');
  const subsidiaryValue = subsidiaryAssets.reduce((s, a) => s + (a.rb_market_value || a.gb_market_value || 0), 0);
  const jvValue = jvAssets.reduce((s, a) => s + ((a.rb_market_value || a.gb_market_value || 0) * ownershipWeight(a)), 0);

  if (subsidiaryAssets.length > 0) {
    const fmtVal = subsidiaryValue >= 1000000
      ? `£${(subsidiaryValue / 1000000).toFixed(1)}M`
      : `£${Math.round(subsidiaryValue / 1000)}k`;
    factors.push(`${subsidiaryAssets.length} subsidiary assets worth ${fmtVal} — board approval required for LGR transfer`);
  }
  if (jvAssets.length > 0) {
    const fmtJv = jvValue >= 1000000
      ? `£${(jvValue / 1000000).toFixed(1)}M`
      : `£${Math.round(jvValue / 1000)}k`;
    factors.push(`${jvAssets.length} JV assets (LCC share: ${fmtJv}) — partner consent required for LGR restructuring`);
  }

  return { disposalSaving, coLocationSaving, conditionSaving,
           subsidiaryValue, subsidiaryCount: subsidiaryAssets.length,
           jvCount: jvAssets.length, factors };
}


// ═══════════════════════════════════════════════════════════════════════
// Planning Workload Analysis for LGR
// ═══════════════════════════════════════════════════════════════════════

/**
 * Estimate planning department consolidation savings from planning data.
 * Under LGR, planning services could be merged across authorities.
 *
 * @param {Object} planningDataMap - { council_id: planning.json } for councils in an LGR model
 * @returns {{ totalApps: number, totalPlanningSpend: number, avgCostPerApp: number,
 *             bestCostPerApp: number, consolidationSaving: number, factors: string[] }}
 */
export function estimatePlanningConsolidationSavings(planningDataMap) {
  const factors = [];
  if (!planningDataMap || Object.keys(planningDataMap).length === 0) {
    return { totalApps: 0, totalPlanningSpend: 0, avgCostPerApp: 0,
             bestCostPerApp: 0, consolidationSaving: 0, factors: ['No planning data'] };
  }

  let totalApps = 0;
  let totalSpend = 0;
  const costPerAppByCouncil = {};

  for (const [cid, pd] of Object.entries(planningDataMap)) {
    const eff = pd?.efficiency;
    if (!eff) continue;

    const apps = eff.apps_per_year || 0;
    const spend = eff.development_control_spend || 0;
    totalApps += apps;
    totalSpend += spend;

    if (apps > 0 && spend > 0) {
      costPerAppByCouncil[cid] = Math.round(spend / apps);
    }
  }

  const councils = Object.entries(costPerAppByCouncil);
  if (councils.length === 0) {
    return { totalApps, totalPlanningSpend: totalSpend, avgCostPerApp: 0,
             bestCostPerApp: 0, consolidationSaving: 0,
             factors: ['Insufficient planning budget data'] };
  }

  const avgCostPerApp = totalApps > 0 ? Math.round(totalSpend / totalApps) : 0;
  const bestCost = Math.min(...councils.map(([, c]) => c));
  const bestCouncil = councils.find(([, c]) => c === bestCost)?.[0] || '';

  // Savings: if all councils operated at 80th percentile efficiency
  const targetCost = bestCost * 1.1; // 10% above best (realistic)
  const consolidationSaving = Math.max(0, totalSpend - (targetCost * totalApps));

  factors.push(`${councils.length} councils, ${totalApps} apps/year, £${Math.round(totalSpend / 1000)}k total spend`);
  factors.push(`Cost range: £${bestCost}/app (${bestCouncil}) to £${Math.max(...councils.map(([, c]) => c))}/app`);
  if (consolidationSaving > 0) {
    factors.push(`Consolidation to 80th percentile (£${targetCost}/app) → £${Math.round(consolidationSaving / 1000)}k annual saving`);
  }

  return {
    totalApps,
    totalPlanningSpend: totalSpend,
    avgCostPerApp,
    bestCostPerApp: bestCost,
    bestCouncil,
    consolidationSaving,
    costPerAppByCouncil,
    factors,
  };
}
