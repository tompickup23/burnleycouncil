/**
 * @module savings/crossCutting
 * Cross-cutting intelligence engine: demand quantification, budget realism,
 * inspection remediation, fiscal trajectory, highways, waste, fiscal overview.
 */

import { parseSavingRange, formatCurrency } from './core.js'

/**
 * Convert demand pressures to financial trajectories.
 * Quantifies qualitative "known_pressures" and "demand_pressures" into financial impact.
 *
 * @param {Object} portfolio - Portfolio object from cabinet_portfolios.json
 * @returns {Object} { pressures, total_annual, total_5yr, net_after_savings }
 */
export function quantifyDemandPressures(portfolio) {
  if (!portfolio) return { pressures: [], total_annual: 0, total_5yr: 0, net_after_savings: 0 }

  const pressures = []
  const serviceModel = portfolio.operational_context?.service_model

  // From demand_pressures array (text + estimated severity)
  for (const dp of (portfolio.demand_pressures || [])) {
    const text = typeof dp === 'string' ? dp : dp.pressure || dp.description || ''
    const severity = typeof dp === 'object' && dp.severity ? dp.severity : 'medium'

    // Estimate annual cost impact from text patterns
    let annualImpact = 0
    const match = text.match(/£([\d.]+)\s*(M|m|million)/i)
    if (match) {
      annualImpact = parseFloat(match[1]) * 1000000
    } else if (text.match(/demographic|population|ageing|growth/i)) {
      annualImpact = (portfolio.budget_latest?.net_expenditure ?? 0) * 0.02 // 2% of budget
    } else if (text.match(/inflation|cost pressure|pay award|NLW|NI/i)) {
      annualImpact = (portfolio.budget_latest?.net_expenditure ?? 0) * 0.04 // 4% inflation
    } else if (text.match(/backlog|waiting|overdue/i)) {
      annualImpact = 2000000 // Default backlog cost
    } else {
      annualImpact = 1000000 // Minimum for unquantified
    }

    pressures.push({
      name: text.length > 80 ? text.substring(0, 80) + '...' : text,
      severity,
      annual_impact: Math.round(annualImpact),
      '5yr_impact': Math.round(annualImpact * 5),
    })
  }

  // From service model quantified data
  if (serviceModel?.send_cost_model) {
    const send = serviceModel.send_cost_model
    if (send.ehcp_pipeline?.annual_growth_rate) {
      const baseCost = Object.values(send.placement_costs || {}).reduce((s, p) => s + (p?.total ?? 0), 0)
      pressures.push({ name: 'EHCP growth (10.5% pa)', severity: 'critical', annual_impact: Math.round(baseCost * send.ehcp_pipeline.annual_growth_rate), '5yr_impact': Math.round(baseCost * send.ehcp_pipeline.annual_growth_rate * 5) })
    }
    if (send.transport?.growth_2026_27) {
      pressures.push({ name: 'SEND transport growth', severity: 'critical', annual_impact: send.transport.growth_2026_27, '5yr_impact': send.transport.growth_2026_27 * 5 })
    }
    if (send.dsg_deficit?.current) {
      pressures.push({ name: 'DSG deficit (statutory override ends 2028)', severity: 'critical', annual_impact: send.dsg_deficit.current, '5yr_impact': send.dsg_deficit.projected_2028 || send.dsg_deficit.current * 5 })
    }
  }

  if (serviceModel?.asc_demand_model) {
    const asc = serviceModel.asc_demand_model
    if (asc.market_sustainability?.annual_cost_inflation) {
      pressures.push({ name: 'ASC cost inflation (NLW + NI)', severity: 'critical', annual_impact: asc.market_sustainability.annual_cost_inflation, '5yr_impact': asc.market_sustainability.annual_cost_inflation * 5 })
    }
    if (asc.demographics?.over_85?.growth_pct_pa) {
      const demandGrowth = (portfolio.budget_latest?.net_expenditure ?? 0) * (asc.demographics.over_85.growth_pct_pa / 100)
      pressures.push({ name: 'Over-85 demographic growth (3.5% pa)', severity: 'high', annual_impact: Math.round(demandGrowth), '5yr_impact': Math.round(demandGrowth * 5) })
    }
  }

  if (serviceModel?.children_cost_model) {
    const cm = serviceModel.children_cost_model
    if (cm.lac_population?.residential_growth_pct_pa) {
      const residentialCost = (cm.lac_population?.in_residential ?? 0) * (cm.placement_costs?.residential_annual_per_child ?? 312000)
      const growth = Math.round(residentialCost * cm.lac_population.residential_growth_pct_pa / 100)
      pressures.push({ name: `Residential placement growth (${cm.lac_population.residential_growth_pct_pa}% pa)`, severity: 'critical', annual_impact: growth, '5yr_impact': growth * 5 })
    }
    if (cm.uasc_model?.annual_shortfall_total) {
      pressures.push({ name: 'UASC Home Office grant shortfall', severity: 'high', annual_impact: cm.uasc_model.annual_shortfall_total, '5yr_impact': cm.uasc_model.annual_shortfall_total * 5 })
    }
    if (cm.agency_workforce?.agency_premium_per_sw) {
      const agencyCount = cm.agency_workforce?.apprentices_uclan ?? 97
      const premium = cm.agency_workforce.agency_premium_per_sw * agencyCount
      pressures.push({ name: 'Agency social worker premium', severity: 'high', annual_impact: premium, '5yr_impact': premium * 5 })
    }
  }

  if (serviceModel?.public_health_model) {
    const ph = serviceModel.public_health_model
    if (ph.grant?.real_terms_decline_pct_pa) {
      const decline = Math.round((ph.grant?.total_public_health_grant ?? 0) * ph.grant.real_terms_decline_pct_pa / 100)
      pressures.push({ name: `PH grant real-terms decline (${ph.grant.real_terms_decline_pct_pa}% pa)`, severity: 'high', annual_impact: decline, '5yr_impact': decline * 5 })
    }
    if (ph.substance_misuse?.ssmtr_adder_value) {
      pressures.push({ name: 'SSMTR/ADDER supplemental grant cliff edge', severity: 'critical', annual_impact: ph.substance_misuse.ssmtr_adder_value, '5yr_impact': ph.substance_misuse.ssmtr_adder_value * 5 })
    }
  }

  if (serviceModel?.property_cost_model) {
    const prop = serviceModel.property_cost_model
    if (prop.disposal_programme?.backlog_growth_pct_pa) {
      const backlog = prop.estate_summary?.maintenance_backlog_known ?? 5000000
      const growth = Math.round(backlog * prop.disposal_programme.backlog_growth_pct_pa / 100)
      pressures.push({ name: 'Property maintenance backlog growth', severity: 'medium', annual_impact: growth, '5yr_impact': growth * 5 })
    }
  }

  // Sort by annual impact descending
  pressures.sort((a, b) => b.annual_impact - a.annual_impact)

  const totalAnnual = pressures.reduce((s, p) => s + p.annual_impact, 0)
  const total5yr = pressures.reduce((s, p) => s + p['5yr_impact'], 0)

  // Compare against savings
  const totalSavings = (portfolio.savings_levers || []).reduce((s, l) => {
    const parsed = parseSavingRange(l.est_saving)
    return s + ((parsed.low + parsed.high) / 2)
  }, 0)

  return {
    pressures,
    total_annual: totalAnnual,
    total_5yr: total5yr,
    total_savings: totalSavings,
    net_after_savings: totalAnnual - totalSavings,
    coverage_pct: totalAnnual > 0 ? Math.round(totalSavings / totalAnnual * 100) : 0,
  }
}

/**
 * Validate lever savings against portfolio budget (reality check).
 *
 * @param {Object} portfolio - Portfolio object
 * @param {Array} levers - savings_levers array
 * @returns {Object} { total_budget, total_savings_low/high, savings_as_pct, flags, credibility_score }
 */
export function budgetRealismCheck(portfolio, levers) {
  if (!portfolio) return { total_budget: 0, total_savings_low: 0, total_savings_high: 0, savings_as_pct: 0, flags: [], credibility_score: 100 }

  const allLevers = levers || portfolio.savings_levers || []
  const budget = portfolio.budget_latest?.net_expenditure ?? 0
  const flags = []
  let credibilityPenalty = 0

  let totalLow = 0, totalHigh = 0
  for (const lever of allLevers) {
    const parsed = parseSavingRange(lever.est_saving)
    totalLow += parsed.low
    totalHigh += parsed.high

    // Flag individual levers that claim too much
    const leverPct = budget > 0 ? (parsed.high / budget * 100) : 0
    if (leverPct > 10) {
      flags.push(`${lever.lever}: claims ${leverPct.toFixed(1)}% of budget (${formatCurrency(parsed.high)})`)
      credibilityPenalty += 15
    }

    // Flag levers without evidence
    if (!lever.evidence_chain && !lever.evidence) {
      flags.push(`${lever.lever}: no evidence chain`)
      credibilityPenalty += 5
    }

    // Flag long-term levers counted at face value
    if (lever.timeline && lever.timeline.match(/long|24|36|48/i) && parsed.high > 5000000) {
      flags.push(`${lever.lever}: £${(parsed.high / 1000000).toFixed(0)}M claimed on long-term timeline`)
      credibilityPenalty += 10
    }
  }

  const totalPct = budget > 0 ? (totalHigh / budget * 100) : 0
  if (totalPct > 25) {
    flags.push(`Total savings (${formatCurrency(totalHigh)}) = ${totalPct.toFixed(1)}% of net budget, verify feasibility`)
    credibilityPenalty += 20
  }

  const credibilityScore = Math.max(0, 100 - credibilityPenalty)

  return {
    total_budget: budget,
    total_savings_low: totalLow,
    total_savings_high: totalHigh,
    savings_central: Math.round((totalLow + totalHigh) / 2),
    savings_as_pct: Math.round(totalPct * 10) / 10,
    flags,
    credibility_score: credibilityScore,
    credibility_level: credibilityScore >= 75 ? 'high' : credibilityScore >= 50 ? 'medium' : 'low',
    lever_count: allLevers.length,
    evidence_coverage: allLevers.length > 0 ? Math.round(allLevers.filter(l => l.evidence_chain || l.evidence).length / allLevers.length * 100) : 0,
  }
}

/**
 * Model inspection improvement timeline and cost.
 *
 * @param {Object} remediation - inspection_remediation object from service_model
 * @returns {Object} { current_rating, target_rating, est_months, improvement_cost, cost_of_intervention, roi }
 */
export function inspectionRemediationTimeline(remediation) {
  if (!remediation) return { current_rating: null, target_rating: null, est_months: 0, improvement_cost: 0, cost_of_intervention: 0, roi: '' }

  const current = remediation.cqc_rating || remediation.rating || 'Unknown'
  const target = remediation.target_rating || 'Good'
  const cost = remediation.improvement_plan_cost ?? 0
  const interventionCost = remediation.cost_of_intervention_if_inadequate ?? 0

  // Estimate months based on improvement path
  let estMonths = 18
  if (current === 'Inadequate') estMonths = 24
  else if (current === 'Requires Improvement') estMonths = 15
  else if (current === 'Good') estMonths = 12

  const roi = interventionCost > 0
    ? `${formatCurrency(cost)} spent to avoid ${formatCurrency(interventionCost)} intervention (${Math.round(interventionCost / cost)}x return)`
    : `${formatCurrency(cost)} improvement programme`

  return {
    current_rating: current,
    target_rating: target,
    est_months: estMonths,
    improvement_cost: cost,
    expected_reinspection: remediation.expected_reinspection || null,
    cost_of_intervention: interventionCost,
    risk_of_decline: current === 'Requires Improvement' ? 'medium' : current === 'Inadequate' ? 'high' : 'low',
    roi,
    key_findings: remediation.key_findings || [],
    historical: remediation.historical_ratings || [],
  }
}

/**
 * Net fiscal trajectory: demand growth - savings + cascades over N years.
 *
 * @param {Object} portfolio - Portfolio object
 * @param {Object} demandData - Output from quantifyDemandPressures
 * @param {Array} directives - Array of savings directives
 * @param {number} years - Projection horizon
 * @returns {Object} { yearly, breakeven_year, trajectory }
 */
export function netFiscalTrajectory(portfolio, demandData, directives, years = 5) {
  if (!portfolio) return { yearly: [], breakeven_year: null, trajectory: 'unknown' }

  const annualDemand = demandData?.total_annual ?? 0
  const totalSavings = (directives || []).reduce((s, d) => s + (d.save_central ?? 0), 0)

  // Categorize directives by timeline for phased saving delivery
  const immediateSavings = (directives || []).filter(d => d.timeline?.match(/immediate|0-3/i)).reduce((s, d) => s + (d.save_central ?? 0), 0)
  const shortTermSavings = (directives || []).filter(d => d.timeline?.match(/short|3-6/i)).reduce((s, d) => s + (d.save_central ?? 0), 0)
  const mediumTermSavings = (directives || []).filter(d => d.timeline?.match(/medium|6-18/i)).reduce((s, d) => s + (d.save_central ?? 0), 0)
  const longTermSavings = (directives || []).filter(d => d.timeline?.match(/long|18/i)).reduce((s, d) => s + (d.save_central ?? 0), 0)

  const yearly = []
  let breakeven = null
  let cumulativeNet = 0

  for (let y = 0; y < years; y++) {
    const demandCost = Math.round(annualDemand * Math.pow(1.03, y)) // 3% annual demand escalation
    let savingsAchieved = 0
    if (y === 0) savingsAchieved = immediateSavings
    else if (y === 1) savingsAchieved = immediateSavings + shortTermSavings
    else if (y === 2) savingsAchieved = immediateSavings + shortTermSavings + mediumTermSavings * 0.5
    else if (y === 3) savingsAchieved = immediateSavings + shortTermSavings + mediumTermSavings + longTermSavings * 0.3
    else savingsAchieved = totalSavings * 0.85 // 85% realisation at maturity

    savingsAchieved = Math.round(savingsAchieved)
    const netPosition = savingsAchieved - demandCost
    cumulativeNet += netPosition

    if (netPosition >= 0 && breakeven === null) breakeven = y + 1

    yearly.push({
      year: y + 1,
      label: `Year ${y + 1}`,
      demand_cost: demandCost,
      savings_achieved: savingsAchieved,
      net_position: netPosition,
      cumulative_net: cumulativeNet,
    })
  }

  // Determine trajectory
  const lastTwo = yearly.slice(-2)
  let trajectory = 'stable'
  if (lastTwo.length === 2) {
    if (lastTwo[1].net_position > lastTwo[0].net_position) trajectory = 'improving'
    else if (lastTwo[1].net_position < lastTwo[0].net_position) trajectory = 'declining'
  }

  return {
    yearly,
    breakeven_year: breakeven,
    trajectory,
    total_demand_5yr: yearly.reduce((s, y) => s + y.demand_cost, 0),
    total_savings_5yr: yearly.reduce((s, y) => s + y.savings_achieved, 0),
    net_5yr: cumulativeNet,
  }
}

/**
 * Highway asset deterioration vs investment trajectory.
 * Projects backlog growth over N years given investment and deterioration rates.
 *
 * @param {Object} assetModel - highway_asset_model from cabinet_portfolios.json
 * @param {number} years - Projection horizon (default 5)
 * @returns {Object} { yearly, optimal_spend, current_gap, preventative_ratio }
 */
export function highwayAssetTrajectory(assetModel, years = 5) {
  if (!assetModel?.asset_summary) return { yearly: [], optimal_spend: 0, current_gap: 0, preventative_ratio: 0 }

  const summary = assetModel.asset_summary
  const backlog = summary.maintenance_backlog ?? 0
  const deterioration = summary.annual_deterioration ?? 0
  const investment = summary.annual_investment ?? 0
  const gap = deterioration - investment
  const grCost = summary.gross_replacement_cost ?? 0

  // Lifecycle costs for preventative vs reactive comparison
  const lifecycle = assetModel.lifecycle_cost_per_km_pa || {}
  const preventativeCosts = [lifecycle.surface_dressing, lifecycle.micro_asphalt].filter(Boolean)
  const reactiveCosts = [lifecycle.resurfacing, lifecycle.reconstruction].filter(Boolean)
  const avgPreventative = preventativeCosts.length > 0 ? preventativeCosts.reduce((s, v) => s + v, 0) / preventativeCosts.length : 5000
  const avgReactive = reactiveCosts.length > 0 ? reactiveCosts.reduce((s, v) => s + v, 0) / reactiveCosts.length : 14000
  const preventativeRatio = avgReactive > 0 ? avgPreventative / avgReactive : 0.4

  // Managed service savings
  const managed = assetModel.managed_service || {}
  const managedSavingPct = managed.cost_before_per_sqm && managed.cost_after_per_sqm
    ? (managed.cost_before_per_sqm - managed.cost_after_per_sqm) / managed.cost_before_per_sqm
    : 0

  // Condition deterioration model
  const conditions = assetModel.condition_trends || {}
  const conditionData = Object.entries(conditions).map(([road_class, data]) => ({
    road_class,
    red_pct: data.red_pct ?? 0,
    prev_year: data.prev_year ?? data.red_pct ?? 0,
    national_avg: data.national_avg ?? 0,
    trend: data.trend ?? 'stable',
    annual_change: (data.red_pct ?? 0) - (data.prev_year ?? data.red_pct ?? 0),
  }))

  const yearly = []
  for (let y = 0; y <= years; y++) {
    const yearBacklog = backlog + (gap * y)
    const backlogPct = grCost > 0 ? (yearBacklog / grCost) * 100 : 0
    yearly.push({
      year: y,
      label: y === 0 ? 'Current' : `Year ${y}`,
      backlog: Math.max(0, yearBacklog),
      backlog_pct: Math.round(backlogPct * 10) / 10,
      deterioration: deterioration * (y > 0 ? 1 : 0),
      investment: investment * (y > 0 ? 1 : 0),
      net_change: y > 0 ? gap : 0,
      cumulative_gap: gap * y,
    })
  }

  // Optimal spend = deterioration + backlog clearance over 10 years
  const optimalSpend = deterioration + (backlog / 10)

  return {
    yearly,
    optimal_spend: optimalSpend,
    current_gap: gap,
    preventative_ratio: Math.round(preventativeRatio * 100) / 100,
    managed_service_saving_pct: Math.round(managedSavingPct * 100),
    condition_trends: conditionData,
    dft_allocation: assetModel.dft_allocation_2026_2030 ?? 0,
    cumulative_shortfall: assetModel.cumulative_shortfall_14yr ?? 0,
    led: assetModel.led_programme || null,
    s59: assetModel.s59_enforcement || null,
  }
}

/**
 * Waste disposal cost comparison: landfill vs MBT vs EfW scenarios.
 * Models landfill tax trajectory, food waste mandate, and EfW procurement ROI.
 *
 * @param {Object} wasteModel - waste_model from cabinet_portfolios.json
 * @returns {Object} { current_cost, scenarios, food_waste_impact, efw_saving, landfill_tax_5yr }
 */
export function wasteDisposalComparison(wasteModel) {
  if (!wasteModel?.disposal_costs) return { current_cost: 0, scenarios: [], food_waste_impact: 0, efw_saving: 0, landfill_tax_5yr: [] }

  const costs = wasteModel.disposal_costs
  const currentCost = wasteModel.total_disposal_cost ?? (
    (costs.landfill?.total ?? 0) + (costs.mbt?.total ?? 0) + (costs.recycling?.total ?? 0)
  )

  // Landfill tax trajectory
  const landfillTonnes = costs.landfill?.tonnes_pa ?? 0
  const baseTax = costs.landfill?.tax_per_tonne ?? 103
  const baseProcessing = costs.landfill?.cost_per_tonne ?? 120
  const taxIncrease = wasteModel.landfill_tax_trajectory?.annual_increase_pct ?? 3.5

  const landfill_tax_5yr = []
  for (let y = 0; y <= 5; y++) {
    const tax = baseTax * Math.pow(1 + taxIncrease / 100, y)
    const totalPerTonne = baseProcessing + tax
    landfill_tax_5yr.push({
      year: y,
      label: y === 0 ? 'Current' : `Year ${y}`,
      tax_per_tonne: Math.round(tax),
      total_per_tonne: Math.round(totalPerTonne),
      annual_cost: Math.round(landfillTonnes * totalPerTonne),
    })
  }

  // EfW scenario
  const efw = wasteModel.efw_procurement || {}
  const efwSavingPa = efw.potential_saving_pa ?? 0
  const efwCapital = efw.capital_cost ?? 0
  const efwTimeline = efw.timeline_years ?? 5
  const efwPayback = efwSavingPa > 0 ? Math.ceil(efwCapital / efwSavingPa) : 0

  // Food waste mandate
  const foodWaste = wasteModel.food_waste_mandate || {}
  const foodWasteCost = foodWaste.est_annual_cost ?? 0
  const foodWasteCapital = foodWaste.capital_required ?? 0

  // Market concentration
  const market = wasteModel.market_concentration || {}

  // Scenarios: status quo vs EfW vs expanded recycling
  const scenarios = [
    {
      name: 'Status Quo',
      annual_cost: currentCost,
      landfill_rate: wasteModel.landfill_rate_pct ?? 33.8,
      description: 'Continue with MBT + landfill. Costs rise with landfill tax.',
      year_5_cost: currentCost + (landfill_tax_5yr.length > 5 ? landfill_tax_5yr[5].annual_cost - landfill_tax_5yr[0].annual_cost : 0),
    },
    {
      name: 'Energy from Waste',
      annual_cost: currentCost - efwSavingPa,
      landfill_rate: Math.max(0, (wasteModel.landfill_rate_pct ?? 33.8) - 25),
      description: `EfW plant: £${(efwCapital / 1000000).toFixed(0)}M capital, ${efwPayback}yr payback.`,
      year_5_cost: currentCost - efwSavingPa,
      capital: efwCapital,
      payback_years: efwPayback,
    },
    {
      name: 'Recycling Expansion',
      annual_cost: currentCost - (landfillTonnes * 0.2 * ((baseProcessing + baseTax) - 30)),
      landfill_rate: Math.max(0, (wasteModel.landfill_rate_pct ?? 33.8) * 0.7),
      description: 'Divert 20% of landfill to recycling. Lower cost but limited capacity.',
      year_5_cost: currentCost - (landfillTonnes * 0.2 * ((baseProcessing + baseTax) - 30)),
    },
  ]

  return {
    current_cost: currentCost,
    national_avg_landfill_pct: wasteModel.national_avg_landfill_pct ?? 5.6,
    landfill_rate_pct: wasteModel.landfill_rate_pct ?? 33.8,
    ratio_to_national: wasteModel.ratio_to_national ?? 6.0,
    scenarios,
    food_waste_impact: foodWasteCost,
    food_waste_capital: foodWasteCapital,
    food_waste_effective: foodWaste.effective ?? null,
    efw_saving: efwSavingPa,
    efw_payback: efwPayback,
    landfill_tax_5yr,
    market_hhi: market.hhi ?? 0,
    duopoly_pct: market.duopoly_pct ?? 0,
    strategy_status: wasteModel.expired_waste_strategy ? `Expired ${wasteModel.expired_waste_strategy}` : 'Unknown',
  }
}

/**
 * Generate asset-specific directives from highway and waste service models.
 * Either or both models can be provided.
 *
 * @param {Object} highwayModel - highway_asset_model from cabinet_portfolios.json
 * @param {Object} wasteModel - waste_model from cabinet_portfolios.json
 * @returns {Array} directive objects
 */
export function assetServiceDirectives(highwayModel, wasteModel) {
  const directives = []
  const now = new Date().toISOString().split('T')[0]

  if (highwayModel) {
    const summary = highwayModel.asset_summary || {}
    const led = highwayModel.led_programme || {}
    const managed = highwayModel.managed_service || {}
    const s59 = highwayModel.s59_enforcement || {}

    // LED completion
    if (led.remaining > 0) {
      directives.push({
        id: `asset-led-completion-${now}`,
        type: 'efficiency',
        tier: 2,
        owner: 'service',
        action: `DO: Complete LED conversion of remaining ${(led.remaining ?? 0).toLocaleString()} columns. SAVE: £${((led.dimming_saving_pa ?? 0) / 1000000).toFixed(1)}M/yr energy saving. HOW: Accelerate column replacement programme, target 100% conversion within 18 months.`,
        save_low: (led.dimming_saving_pa ?? 0) * 0.8,
        save_high: (led.dimming_saving_pa ?? 0) * 1.2,
        save_central: led.dimming_saving_pa ?? 0,
        timeline: 'Medium-term (1-2 years)',
        risk: 'low',
        feasibility: 8,
        impact: 6,
        priority: 'medium',
      })
    }

    // Managed service expansion
    if (managed.reduction_pct > 0) {
      const potentialSaving = summary.annual_investment ? summary.annual_investment * (managed.cost_after_per_sqm / managed.cost_before_per_sqm) : 0
      const saving = summary.annual_investment ? summary.annual_investment - potentialSaving : 0
      directives.push({
        id: `asset-managed-service-${now}`,
        type: 'efficiency',
        tier: 2,
        owner: 'service',
        action: `DO: Expand managed highways service to full network coverage. SAVE: ${managed.reduction_pct}% defect reduction, ${((1 - managed.cost_after_per_sqm / managed.cost_before_per_sqm) * 100).toFixed(0)}% unit cost reduction. EVIDENCE: ${managed.defects_before?.toLocaleString()} -> ${managed.defects_after?.toLocaleString()} defects in ${managed.months_live} months. HOW: Extend managed service contract scope, integrate AI inspections.`,
        save_low: saving * 0.5,
        save_high: saving * 1.0,
        save_central: saving * 0.75,
        timeline: 'Medium-term (1-2 years)',
        risk: 'medium',
        feasibility: 7,
        impact: 7,
        priority: 'high',
      })
    }

    // S59 enforcement income
    if (s59.potential_income > 0) {
      directives.push({
        id: `asset-s59-enforcement-${now}`,
        type: 'income',
        tier: 2,
        owner: 'service',
        action: `DO: Enforce s59 NRSWA overrun charges on utility works. SAVE: £${((s59.potential_income ?? 0) / 1000000).toFixed(1)}M/yr potential income. LEGAL: NRSWA 1991 s59, TMA 2004. HOW: Deploy overrun monitoring, automated breach detection at ${(s59.utility_works_pa ?? 0).toLocaleString()} utility works/year.`,
        save_low: s59.potential_income * 0.5,
        save_high: s59.potential_income * 1.0,
        save_central: s59.potential_income * 0.7,
        timeline: 'Short-term (3-12 months)',
        risk: 'medium',
        feasibility: 7,
        impact: 6,
        priority: 'high',
      })
    }

    // Preventative maintenance shift
    directives.push({
      id: `asset-preventative-shift-${now}`,
      type: 'efficiency',
      tier: 3,
      owner: 'service',
      action: `DO: Shift from reactive to preventative maintenance. SAVE: Preventative treatments cost ${Math.round(((highwayModel.lifecycle_cost_per_km_pa?.surface_dressing ?? 3750) / (highwayModel.lifecycle_cost_per_km_pa?.reconstruction ?? 18750)) * 100)}% of reconstruction. EVIDENCE: £${((summary.maintenance_backlog ?? 0) / 1000000000).toFixed(1)}B backlog growing at £${((summary.annual_deterioration - summary.annual_investment) / 1000000).toFixed(0)}M/yr. HOW: Asset management investment strategy, lifecycle modelling, condition-based prioritisation.`,
      save_low: summary.annual_deterioration ? summary.annual_deterioration * 0.1 : 2000000,
      save_high: summary.annual_deterioration ? summary.annual_deterioration * 0.25 : 8000000,
      save_central: summary.annual_deterioration ? summary.annual_deterioration * 0.15 : 5000000,
      timeline: 'Long-term (2-5 years)',
      risk: 'medium',
      feasibility: 6,
      impact: 8,
      priority: 'medium',
    })
  }

  if (wasteModel) {
    const efw = wasteModel.efw_procurement || {}
    const foodWaste = wasteModel.food_waste_mandate || {}
    const market = wasteModel.market_concentration || {}

    // EfW procurement
    if (efw.potential_saving_pa > 0) {
      directives.push({
        id: `asset-efw-procurement-${now}`,
        type: 'transformation',
        tier: 1,
        owner: 'corporate',
        action: `DO: Resume EfW procurement. SAVE: £${((efw.potential_saving_pa ?? 0) / 1000000).toFixed(0)}M/yr once operational. EVIDENCE: Landfill rate ${wasteModel.landfill_rate_pct}% vs national ${wasteModel.national_avg_landfill_pct}% (${wasteModel.ratio_to_national}x national). HOW: Restart procurement, secure planning, ${efw.timeline_years}-year build programme. Capital: £${((efw.capital_cost ?? 0) / 1000000).toFixed(0)}M.`,
        save_low: efw.potential_saving_pa * 0.7,
        save_high: efw.potential_saving_pa * 1.0,
        save_central: efw.potential_saving_pa * 0.85,
        timeline: 'Long-term (2-5 years)',
        risk: 'high',
        feasibility: 5,
        impact: 9,
        priority: 'high',
      })
    }

    // Food waste compliance
    if (foodWaste.est_annual_cost > 0) {
      directives.push({
        id: `asset-food-waste-compliance-${now}`,
        type: 'statutory',
        tier: 1,
        owner: 'service',
        action: `DO: Prepare for food waste collection mandate (${foodWaste.effective || '2026'}). SAVE: Avoid non-compliance penalties. LEGAL: Environment Act 2021 s57. HOW: Procure food waste collection fleet, secure anaerobic digestion capacity. Annual cost: £${((foodWaste.est_annual_cost ?? 0) / 1000000).toFixed(0)}M, capital: £${((foodWaste.capital_required ?? 0) / 1000000).toFixed(0)}M.`,
        save_low: 0,
        save_high: 0,
        save_central: 0,
        timeline: 'Immediate (0-3 months)',
        risk: 'high',
        feasibility: 6,
        impact: 7,
        priority: 'critical',
      })
    }

    // Market diversification
    if ((market.duopoly_pct ?? 0) > 70) {
      directives.push({
        id: `asset-waste-market-${now}`,
        type: 'procurement',
        tier: 2,
        owner: 'corporate',
        action: `DO: Diversify waste disposal market. Current duopoly controls ${market.duopoly_pct}% (HHI: ${market.hhi}). SAVE: Competition-driven price reduction 5-10%. HOW: New waste strategy (expired ${wasteModel.expired_waste_strategy}), market engagement, lot structuring for SME access.`,
        save_low: (wasteModel.total_disposal_cost ?? 0) * 0.03,
        save_high: (wasteModel.total_disposal_cost ?? 0) * 0.08,
        save_central: (wasteModel.total_disposal_cost ?? 0) * 0.05,
        timeline: 'Medium-term (1-2 years)',
        risk: 'medium',
        feasibility: 5,
        impact: 7,
        priority: 'medium',
      })
    }
  }

  return directives
}

/**
 * Build unified fiscal system overview across all portfolios.
 * Returns per-portfolio service model coverage, demand vs savings, inspection status.
 * Optionally includes statement_of_accounts loss trajectory and bond analysis.
 *
 * @param {Array} portfolios - Array of portfolios from cabinet_portfolios.json
 * @param {Object} [cabinetData] - Full cabinet_portfolios.json (optional, for statement_of_accounts + treasury)
 * @returns {Object} Fiscal system overview
 */
export function fiscalSystemOverview(portfolios, cabinetData) {
  if (!Array.isArray(portfolios) || portfolios.length === 0) return { portfolios: [], total_demand: 0, total_savings: 0, coverage_pct: 0, inspection_summary: [], service_model_coverage: 0 }

  // Lazy-import to avoid circular: soa functions are only needed when cabinetData is provided
  let lossTrajectoryAnalysisFn = null
  let bondPortfolioAnalysisFn = null

  const results = portfolios.map(p => {
    const serviceModel = p.operational_context?.service_model
    const hasServiceModel = !!(serviceModel && Object.keys(serviceModel).length > 0)
    const modelTypes = serviceModel ? Object.keys(serviceModel) : []

    // Demand pressures: quantify if possible
    let demandAnnual = 0
    if (p.demand_pressures?.length) {
      for (const dp of p.demand_pressures) {
        const text = dp.pressure || dp.description || ''
        const match = text.match(/£([\d.]+)\s*(M|m|million|B|b|billion)/i)
        if (match) {
          const val = parseFloat(match[1])
          const multiplier = match[2].toLowerCase().startsWith('b') ? 1000000000 : 1000000
          demandAnnual += val * multiplier
        }
      }
    }

    // Savings: aggregate from levers
    let savingsCentral = 0
    if (p.savings_levers?.length) {
      for (const lever of p.savings_levers) {
        const range = parseSavingRange(lever.est_saving || lever.saving)
        savingsCentral += (range.low + range.high) / 2
      }
    }

    // Inspection status
    let inspectionStatus = null
    if (serviceModel?.inspection_remediation || p.operational_context?.inspection_remediation) {
      const rem = serviceModel?.inspection_remediation || p.operational_context?.inspection_remediation
      inspectionStatus = {
        current_rating: rem.cqc_rating || rem.rating || rem.dft_rating || 'Unknown',
        target_rating: rem.target_rating || 'Good',
        date: rem.date || null,
      }
    }

    // Net trajectory
    const netPosition = savingsCentral - demandAnnual
    const coveragePct = demandAnnual > 0 ? Math.round((savingsCentral / demandAnnual) * 100) : (savingsCentral > 0 ? 100 : 0)

    return {
      id: p.id,
      title: p.short_title || p.title,
      has_service_model: hasServiceModel,
      model_types: modelTypes,
      demand_annual: demandAnnual,
      savings_central: savingsCentral,
      net_position: netPosition,
      coverage_pct: coveragePct,
      inspection: inspectionStatus,
      trajectory: netPosition >= 0 ? 'improving' : netPosition > -demandAnnual * 0.5 ? 'stable' : 'declining',
    }
  })

  const totalDemand = results.reduce((s, r) => s + r.demand_annual, 0)
  const totalSavings = results.reduce((s, r) => s + r.savings_central, 0)
  const withModel = results.filter(r => r.has_service_model).length
  const inspections = results.filter(r => r.inspection).map(r => ({ portfolio: r.title, ...r.inspection }))

  // Statement of Accounts loss data (if available) -- inline to avoid circular import
  let lossTrajectory = null
  let bondAnalysis = null
  if (cabinetData?.administration?.statement_of_accounts) {
    // Inline lossTrajectoryAnalysis to avoid circular import from soa.js
    const soa = cabinetData.administration.statement_of_accounts
    const fiLosses = soa.financial_instrument_losses?.by_year ?? []
    const disposalLosses = soa.disposal_academy_losses?.by_year ?? []
    const yearMap = {}
    for (const fi of fiLosses) {
      if (!yearMap[fi.year]) yearMap[fi.year] = { year: fi.year, financial_instruments: 0, disposals: 0, total: 0 }
      yearMap[fi.year].financial_instruments = fi.amount
    }
    for (const d of disposalLosses) {
      if (!yearMap[d.year]) yearMap[d.year] = { year: d.year, financial_instruments: 0, disposals: 0, total: 0 }
      yearMap[d.year].disposals = d.amount
    }
    const byYear = Object.values(yearMap).map(y => ({ ...y, total: y.financial_instruments + y.disposals })).sort((a, b) => a.year.localeCompare(b.year))
    let cumulative = 0
    for (const y of byYear) { cumulative += y.total; y.cumulative = cumulative }
    const worstYear = byYear.reduce((worst, y) => (y.total > (worst?.total ?? 0) ? y : worst), null)
    const earlyAvg = byYear.length >= 2 ? (byYear[0].total + byYear[1].total) / 2 : 0
    const lateAvg = byYear.length >= 2 ? (byYear[byYear.length - 2].total + byYear[byYear.length - 1].total) / 2 : 0
    let trend = 'stable'
    if (lateAvg > earlyAvg * 1.5) trend = 'worsening'
    else if (lateAvg < earlyAvg * 0.7) trend = 'improving'
    lossTrajectory = {
      strict_audited_total: soa.strict_audited_total ?? 0,
      broader_official_total: soa.broader_official_total ?? 0,
      cumulative_total: cumulative,
      annual_average: byYear.length > 0 ? Math.round(cumulative / byYear.length) : 0,
      worst_year: worstYear,
      trend,
      years_covered: byYear.length,
      by_year: byYear,
    }
  }
  if (cabinetData?.administration?.treasury?.ukmba_bonds) {
    // Inline bondPortfolioAnalysis to avoid circular import from soa.js
    const treasury = cabinetData.administration.treasury
    const bonds = treasury.ukmba_bonds
    const totalFace = bonds.total_face_value ?? 0
    const saleLoss = bonds.estimated_sale_loss ?? 0
    const frnFace = bonds.five_year_frn?.face_value ?? 0
    const fixedFace = bonds.forty_year_fixed?.face_value ?? 0
    const soniaRate = 0.045
    const fixedCouponRate = 0.035
    const annualCoupon = Math.round(frnFace * soniaRate + fixedFace * fixedCouponRate)
    const altYield = 0.043
    const blendedCoupon = totalFace > 0 ? annualCoupon / totalFace : 0
    const opportunityCost = Math.max(0, Math.round(totalFace * (altYield - blendedCoupon)))
    const lossRatio = totalFace > 0 ? saleLoss / totalFace : 0
    let holdRec = 'hold_to_maturity'
    let riskRating = 'medium'
    if (lossRatio > 0.6) { holdRec = 'hold_to_maturity_critical'; riskRating = 'high' }
    else if (lossRatio < 0.1) { holdRec = 'review_partial_sale'; riskRating = 'low' }
    bondAnalysis = {
      total_face_value: totalFace,
      estimated_sale_loss: saleLoss,
      loss_ratio_pct: Math.round(lossRatio * 100),
      annual_coupon_income: annualCoupon,
      opportunity_cost_annual: opportunityCost,
      hold_recommendation: holdRec,
      risk_rating: riskRating,
    }
  }

  return {
    portfolios: results,
    total_demand: totalDemand,
    total_savings: totalSavings,
    coverage_pct: totalDemand > 0 ? Math.round((totalSavings / totalDemand) * 100) : 0,
    service_model_coverage: Math.round((withModel / results.length) * 100),
    service_model_count: withModel,
    total_portfolios: results.length,
    inspection_summary: inspections,
    net_position: totalSavings - totalDemand,
    loss_trajectory: lossTrajectory,
    bond_analysis: bondAnalysis,
  }
}

/**
 * Summarise highways intelligence from asset model, traffic, and roadworks data.
 * Designed to wire existing highways_assets/traffic/roadworks data into Cabinet Command.
 *
 * @param {Object} highwayAssets - highway_asset_model from cabinet_portfolios.json
 * @param {Object} trafficData - traffic.json data
 * @param {Object} roadworksData - roadworks.json data
 * @returns {Object} Highways intelligence summary
 */
export function highwaysIntelligenceSummary(highwayAssets, trafficData, roadworksData) {
  const result = {
    defect_trend: null,
    condition_dashboard: [],
    deferral_count: 0,
    s59_breaches: 0,
    lifecycle_savings_opportunity: 0,
    utility_coordination_score: 0,
    roadworks_active: 0,
    traffic_hotspots: 0,
  }

  // Highway assets condition dashboard
  if (highwayAssets?.condition_trends) {
    result.condition_dashboard = Object.entries(highwayAssets.condition_trends).map(([road_class, data]) => ({
      road_class,
      red_pct: data.red_pct ?? 0,
      national_avg: data.national_avg ?? 0,
      trend: data.trend ?? 'stable',
      gap: (data.red_pct ?? 0) - (data.national_avg ?? 0),
    }))
  }

  // Managed service defect trend
  if (highwayAssets?.managed_service) {
    const m = highwayAssets.managed_service
    result.defect_trend = {
      before: m.defects_before ?? 0,
      after: m.defects_after ?? 0,
      reduction_pct: m.reduction_pct ?? 0,
      unit_cost_saving_pct: m.cost_before_per_sqm && m.cost_after_per_sqm
        ? Math.round(((m.cost_before_per_sqm - m.cost_after_per_sqm) / m.cost_before_per_sqm) * 100)
        : 0,
    }
  }

  // Lifecycle savings: difference between preventative and reactive
  if (highwayAssets?.lifecycle_cost_per_km_pa) {
    const lc = highwayAssets.lifecycle_cost_per_km_pa
    const cheapest = Math.min(...Object.values(lc).filter(v => typeof v === 'number'))
    const dearest = Math.max(...Object.values(lc).filter(v => typeof v === 'number'))
    result.lifecycle_savings_opportunity = dearest > 0 ? Math.round((1 - cheapest / dearest) * 100) : 0
  }

  // Traffic data
  if (trafficData) {
    if (trafficData.stats) {
      result.traffic_hotspots = trafficData.stats.high_jci_count ?? trafficData.stats.junction_count ?? 0
    }
    if (trafficData.s59_clashes) {
      result.s59_breaches = Array.isArray(trafficData.s59_clashes) ? trafficData.s59_clashes.length : 0
    }
    if (trafficData.deferrals) {
      result.deferral_count = Array.isArray(trafficData.deferrals) ? trafficData.deferrals.length : 0
    }
  }

  // Roadworks data
  if (roadworksData) {
    result.roadworks_active = roadworksData.stats?.total ?? (Array.isArray(roadworksData.records) ? roadworksData.records.length : 0)
    // Utility coordination: % of works that are utility vs highway authority
    if (roadworksData.stats?.by_operator) {
      const operators = roadworksData.stats.by_operator
      const total = Object.values(operators).reduce((s, v) => s + v, 0)
      const utilityWorks = total - (operators['Lancashire County Council'] ?? 0)
      result.utility_coordination_score = total > 0 ? Math.round((1 - utilityWorks / total) * 100) : 50
    }
  }

  return result
}
