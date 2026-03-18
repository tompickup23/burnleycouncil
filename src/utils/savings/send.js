/**
 * @module savings/send
 * SEND (Special Educational Needs and Disabilities) and children's service intelligence.
 * EHCP cost projections, early intervention ROI, LAC placement optimisation.
 */

import { formatCurrency } from './core.js'

/**
 * Project EHCP growth + placement costs over N years.
 * Models the cascade: EHCP identification -> assessment -> placement -> transport -> tribunal -> DSG deficit.
 *
 * @param {Object} sendModel - send_cost_model from cabinet_portfolios.json
 * @param {number} [years=5] - Projection horizon
 * @returns {Object} { yearly: [], growth_rate, cost_driver_breakdown, total_5yr_cost }
 */
export function sendCostProjection(sendModel, years = 5) {
  if (!sendModel?.ehcp_pipeline) return { yearly: [], growth_rate: 0, cost_driver_breakdown: {}, total_5yr_cost: 0 }

  const pipeline = sendModel.ehcp_pipeline
  const placements = sendModel.placement_costs || {}
  const transport = sendModel.transport || {}
  const tribunals = sendModel.tribunals || {}
  const dsg = sendModel.dsg_deficit || {}
  const growthRate = pipeline.annual_growth_rate ?? 0.105

  // Calculate base placement cost
  const placementTypes = ['mainstream', 'special_school_maintained', 'special_school_independent',
    'residential_special', 'residential_childrens_home', 'alternative_provision', 'post_16_specialist']
  const basePlacementCost = placementTypes.reduce((sum, type) => sum + (placements[type]?.total ?? 0), 0)
  const baseEhcps = pipeline.total_ehcps ?? 12317
  const baseTransport = transport.total_cost ?? 0
  const baseTribunalCost = (tribunals.annual_tribunal_cost ?? 0) + (tribunals.annual_placement_cost_from_losses ?? 0)

  const yearly = []
  let cumulativeCost = 0

  for (let y = 0; y < years; y++) {
    const factor = Math.pow(1 + growthRate, y)
    const ehcps = Math.round(baseEhcps * factor)
    const yearPlacementCost = Math.round(basePlacementCost * factor)

    // Transport grows faster than EHCPs (route complexity, distance)
    const transportGrowth = y === 0 ? baseTransport : Math.round(baseTransport * Math.pow(1 + growthRate * 1.15, y))

    // Tribunal costs grow with EHCP volume
    const yearTribunalCost = Math.round(baseTribunalCost * factor)

    // DSG deficit compounds at its own rate
    const dsgDeficit = dsg.current ? Math.round(dsg.current * Math.pow(1 + (dsg.annual_growth_rate ?? 0.38), y)) : 0

    // Per-placement breakdown for the year
    const placementBreakdown = {}
    for (const type of placementTypes) {
      if (!placements[type]) continue
      const count = Math.round((placements[type].count ?? 0) * factor)
      const cost = placements[type].avg_cost ?? 0
      placementBreakdown[type] = { count, cost: cost, total: count * cost }
    }

    const yearTotal = yearPlacementCost + transportGrowth + yearTribunalCost
    cumulativeCost += yearTotal

    yearly.push({
      year: y + 1,
      label: `Year ${y + 1}`,
      ehcps,
      placements: placementBreakdown,
      placement_cost: yearPlacementCost,
      transport: transportGrowth,
      tribunals: yearTribunalCost,
      dsg_deficit: dsgDeficit,
      total: yearTotal,
    })
  }

  // Cost driver breakdown (% of base year)
  const baseTotal = basePlacementCost + baseTransport + baseTribunalCost
  const costDriverBreakdown = {
    placements: { value: basePlacementCost, pct: baseTotal > 0 ? Math.round(basePlacementCost / baseTotal * 100) : 0 },
    transport: { value: baseTransport, pct: baseTotal > 0 ? Math.round(baseTransport / baseTotal * 100) : 0 },
    tribunals: { value: baseTribunalCost, pct: baseTotal > 0 ? Math.round(baseTribunalCost / baseTotal * 100) : 0 },
  }

  return {
    yearly,
    growth_rate: growthRate,
    cost_driver_breakdown: costDriverBreakdown,
    total_5yr_cost: cumulativeCost,
    base_year_cost: baseTotal,
    dsg_trajectory: yearly.map(y => ({ year: y.year, deficit: y.dsg_deficit })),
  }
}

/**
 * Calculate ROI of early intervention vs reactive placement.
 *
 * @param {Object} sendModel - send_cost_model from cabinet_portfolios.json
 * @param {Object} lacModel - lac_cost_model from cabinet_portfolios.json
 * @returns {Object} { current_reactive_cost, intervention_cost, net_saving, payback_years, children_diverted, programmes }
 */
export function earlyInterventionROI(sendModel, lacModel) {
  if (!sendModel?.early_intervention && !lacModel) {
    return { current_reactive_cost: 0, intervention_cost: 0, net_saving: 0, payback_years: 0, children_diverted: 0, programmes: [] }
  }

  const ei = sendModel?.early_intervention || {}
  const lac = lacModel || {}
  const programmes = []

  // 1. Troubled Families programme ROI
  const tf = ei.troubled_families_programme || {}
  if (tf.families_supported && tf.avg_cost && tf.estimated_saving_per_family) {
    const cost = tf.families_supported * tf.avg_cost
    const saving = tf.families_supported * tf.estimated_saving_per_family
    programmes.push({
      name: 'Troubled Families Programme',
      families: tf.families_supported,
      cost_pa: cost,
      saving_pa: saving,
      net_saving: saving - cost,
      roi_ratio: saving / cost,
      evidence: 'DCLG evaluation: £2.28 fiscal benefit per £1 invested',
    })
  }

  // 2. Family Safeguarding Model
  const fsm = ei.family_safeguarding_model || {}
  if (fsm.potential_saving_low || fsm.potential_saving_high) {
    const savingLow = fsm.potential_saving_low ?? 0
    const savingHigh = fsm.potential_saving_high ?? 0
    const implementationCost = 2500000 // Typical setup cost based on Hertfordshire model
    programmes.push({
      name: 'Family Safeguarding Model',
      implemented: fsm.implemented || false,
      cost_pa: implementationCost,
      saving_low: savingLow,
      saving_high: savingHigh,
      saving_pa: (savingLow + savingHigh) / 2,
      net_saving: ((savingLow + savingHigh) / 2) - implementationCost,
      evidence: fsm.evidence_base || 'Hertfordshire: 46% reduction in children in care',
    })
  }

  // 3. LAC avoidance through early help
  const avoidanceSaving = ei.lac_avoidance_saving_per_child ?? 55000
  const lacTotal = lac.total_lac ?? 0
  // Conservative: divert 5% of LAC through early intervention
  const diversionRate = 0.05
  const childrenDiverted = Math.round(lacTotal * diversionRate)
  const lacAvoidanceSaving = childrenDiverted * avoidanceSaving

  if (childrenDiverted > 0) {
    programmes.push({
      name: 'LAC Avoidance (Edge of Care)',
      children_diverted: childrenDiverted,
      saving_per_child: avoidanceSaving,
      cost_pa: childrenDiverted * 12000, // Edge of care support cost
      saving_pa: lacAvoidanceSaving,
      net_saving: lacAvoidanceSaving - (childrenDiverted * 12000),
      evidence: `Diverting ${childrenDiverted} children from care at ${formatCurrency(avoidanceSaving)} each`,
    })
  }

  // 4. EP workforce conversion (agency -> permanent)
  const wf = sendModel?.workforce || {}
  const ep = wf.educational_psychologists || {}
  if (ep.agency && ep.agency_day_rate && ep.permanent_equivalent_day) {
    const agencyDays = ep.agency * 220 // Working days per year
    const agencyCost = agencyDays * ep.agency_day_rate
    const permanentCost = agencyDays * ep.permanent_equivalent_day
    const conversionSaving = agencyCost - permanentCost
    const conversionTarget = Math.round(ep.agency * 0.3) // Convert 30% over time
    const saving = Math.round(conversionSaving * 0.3)
    programmes.push({
      name: 'EP Agency\u2192Permanent Conversion',
      agency_eps: ep.agency,
      conversion_target: conversionTarget,
      cost_pa: 0, // Recruitment cost offset by salary saving
      saving_pa: saving,
      net_saving: saving,
      evidence: `${ep.agency} agency EPs at £${ep.agency_day_rate}/day vs £${ep.permanent_equivalent_day}/day permanent`,
    })
  }

  const totalInterventionCost = programmes.reduce((sum, p) => sum + (p.cost_pa ?? 0), 0)
  const totalSaving = programmes.reduce((sum, p) => sum + (p.saving_pa ?? 0), 0)
  const totalNetSaving = programmes.reduce((sum, p) => sum + (p.net_saving ?? 0), 0)

  // Current reactive cost = residential placements + tribunal losses
  const residentialCost = Object.values(lac.by_placement || {}).reduce((sum, p) => sum + ((p.count ?? 0) * (p.avg_cost ?? 0)), 0)
  const tribunalCost = (sendModel?.tribunals?.annual_tribunal_cost ?? 0) + (sendModel?.tribunals?.annual_placement_cost_from_losses ?? 0)
  const currentReactiveCost = residentialCost + tribunalCost

  return {
    current_reactive_cost: currentReactiveCost,
    intervention_cost: totalInterventionCost,
    total_saving: totalSaving,
    net_saving: totalNetSaving,
    payback_years: totalNetSaving > 0 ? Math.round(totalInterventionCost / totalNetSaving * 10) / 10 : 0,
    children_diverted: childrenDiverted,
    programmes,
  }
}

/**
 * Model LAC placement step-down savings (WOCL programme).
 *
 * @param {Object} lacModel - lac_cost_model from cabinet_portfolios.json
 * @returns {Object} { current_cost, optimised_cost, saving, placements_moved, wocl_roi, timeline }
 */
export function lacPlacementOptimisation(lacModel) {
  if (!lacModel?.by_placement) return { current_cost: 0, optimised_cost: 0, saving: 0, placements_moved: [], wocl_roi: null, timeline: [] }

  const bp = lacModel.by_placement
  const wocl = lacModel.wocl_programme || {}

  // Current total cost
  const currentCost = Object.values(bp).reduce((sum, p) => sum + ((p.count ?? 0) * (p.avg_cost ?? 0)), 0)

  // Step-down opportunities (move from expensive -> cheaper placements)
  const moves = []

  // 1. Independent fostering -> In-house fostering (convert 20%)
  if (bp.foster_independent && bp.foster_in_house) {
    const moveCount = Math.round((bp.foster_independent.count ?? 0) * 0.2)
    const unitSaving = (bp.foster_independent.avg_cost ?? 0) - (bp.foster_in_house.avg_cost ?? 0)
    if (moveCount > 0 && unitSaving > 0) {
      moves.push({
        from: 'foster_independent', from_label: 'Independent Fostering',
        to: 'foster_in_house', to_label: 'In-house Fostering',
        count: moveCount, unit_saving: unitSaving, total_saving: moveCount * unitSaving,
        feasibility: 7, timeline: 'Medium-term (12-24 months)',
      })
    }
  }

  // 2. Independent residential -> In-house residential (WOCL programme)
  if (bp.residential_independent && bp.residential_in_house && wocl.target_in_house_homes) {
    const additionalHomes = (wocl.target_in_house_homes ?? 0) - (wocl.current_in_house_homes ?? 0)
    const moveCount = Math.min(additionalHomes * 3, bp.residential_independent.count ?? 0)
    const unitSaving = wocl.saving_per_placement_pa || ((bp.residential_independent.avg_cost ?? 0) - (bp.residential_in_house.avg_cost ?? 0))
    if (moveCount > 0 && unitSaving > 0) {
      moves.push({
        from: 'residential_independent', from_label: 'Independent Residential',
        to: 'residential_in_house', to_label: 'In-house Residential (WOCL)',
        count: moveCount, unit_saving: unitSaving, total_saving: moveCount * unitSaving,
        feasibility: 6, timeline: 'Long-term (24-48 months)',
      })
    }
  }

  // 3. Residential -> Specialist fostering (step-down)
  if (bp.residential_independent && bp.foster_independent) {
    const moveCount = Math.round((bp.residential_independent.count ?? 0) * 0.1)
    const unitSaving = (bp.residential_independent.avg_cost ?? 0) - (bp.foster_independent.avg_cost ?? 0)
    if (moveCount > 0 && unitSaving > 0) {
      moves.push({
        from: 'residential_independent', from_label: 'Independent Residential',
        to: 'foster_independent', to_label: 'Specialist Foster Care',
        count: moveCount, unit_saving: unitSaving, total_saving: moveCount * unitSaving,
        feasibility: 5, timeline: 'Medium-term (12-24 months)',
      })
    }
  }

  const totalSaving = moves.reduce((sum, m) => sum + m.total_saving, 0)
  const optimisedCost = currentCost - totalSaving

  // WOCL ROI calculation
  let woclROI = null
  if (wocl.target_in_house_homes && wocl.current_in_house_homes) {
    const additionalHomes = wocl.target_in_house_homes - wocl.current_in_house_homes
    const capitalCost = additionalHomes * (wocl.capital_cost_per_home ?? 1200000)
    const annualRunning = additionalHomes * (wocl.annual_running_cost ?? 450000)
    const annualSaving = additionalHomes * 3 * (wocl.saving_per_placement_pa ?? 100000)
    woclROI = {
      additional_homes: additionalHomes,
      capital_cost: capitalCost,
      annual_running_cost: annualRunning,
      annual_saving: annualSaving,
      net_annual: annualSaving,
      payback_years: annualSaving > 0 ? Math.round(capitalCost / annualSaving * 10) / 10 : 0,
    }
  }

  // Timeline: 4 years of step-down
  const timeline = [
    { year: 1, label: 'Year 1: Recruit foster carers + plan first WOCL homes', saving: Math.round(totalSaving * 0.15) },
    { year: 2, label: 'Year 2: First step-downs + 5 WOCL homes operational', saving: Math.round(totalSaving * 0.35) },
    { year: 3, label: 'Year 3: Full foster pipeline + 10 WOCL homes', saving: Math.round(totalSaving * 0.7) },
    { year: 4, label: 'Year 4: Programme maturity + 15 WOCL homes', saving: totalSaving },
  ]

  return {
    current_cost: currentCost, optimised_cost: optimisedCost,
    saving: totalSaving, saving_pct: currentCost > 0 ? Math.round(totalSaving / currentCost * 1000) / 10 : 0,
    placements_moved: moves, wocl_roi: woclROI, timeline,
    residential_growth: lacModel.residential_growth || null,
  }
}

/**
 * Generate SEND-specific savings directives from cost model data.
 *
 * @param {Object} sendModel - send_cost_model from cabinet_portfolios.json
 * @param {Object} lacModel - lac_cost_model from cabinet_portfolios.json
 * @returns {Array} directive objects
 */
export function sendServiceDirectives(sendModel, lacModel) {
  if (!sendModel) return []
  const directives = []

  // 1. EP Workforce Conversion
  const wf = sendModel.workforce || {}
  const ep = wf.educational_psychologists || {}
  if (ep.agency > 0 && ep.agency_day_rate && ep.permanent_equivalent_day) {
    const agencyCostPA = ep.agency * 220 * ep.agency_day_rate
    const permanentCostPA = ep.agency * 220 * ep.permanent_equivalent_day
    const maxSaving = agencyCostPA - permanentCostPA
    const targetConversion = 0.3
    const saveLow = Math.round(maxSaving * 0.2)
    const saveHigh = Math.round(maxSaving * 0.4)
    directives.push({
      id: 'send_ep_conversion', type: 'service_model', tier: 'demand_management', owner: 'portfolio',
      action: `Convert ${Math.round(ep.agency * targetConversion)} of ${ep.agency} agency EPs to permanent. Agency premium is ${wf.agency_premium_pct ?? 167}%. Builds capacity AND cuts cost.`,
      save_low: saveLow, save_high: saveHigh, save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Medium-term (6-18 months)',
      legal_basis: 'Children and Families Act 2014: duty to provide educational psychology assessments',
      risk: 'Medium', risk_detail: 'Recruitment market competitive. Permanent EPs require 3-year doctorate. Consider grow-your-own via trainee programme.',
      steps: ['Benchmark permanent EP salary against agency day rate', 'Launch "Grow Your Own" EP trainee programme (3 per year)', 'Offer golden hellos (£10K) for permanent EP recruitment', 'Negotiate volume agency rate reduction during transition', 'Target 30% conversion in 18 months'],
      governance_route: 'cabinet_decision',
      evidence: `${ep.agency} agency EPs at £${ep.agency_day_rate}/day vs £${ep.permanent_equivalent_day}/day permanent. Annual agency cost: ${formatCurrency(agencyCostPA)}`,
      priority: 'high', feasibility: 6, impact: 8,
    })
  }

  // 2. Transport Optimisation
  const transport = sendModel.transport || {}
  if (transport.total_cost > 0) {
    const ptb = transport.personal_travel_budgets || {}
    const tag = transport.transport_assistant_grants || {}
    const minibus = transport.minibus_programme || {}
    const ptbSaving = ((ptb.target ?? 0) - (ptb.current ?? 0)) * (ptb.avg_saving ?? 0)
    const tagSaving = ((tag.target ?? 0) - (tag.current ?? 0)) * (tag.avg_saving ?? 0)
    const minibusSaving = Math.round(transport.total_cost * (minibus.saving_per_passenger_pct ?? 0) / 100 * 0.1)
    const saveLow = ptbSaving + tagSaving
    const saveHigh = ptbSaving + tagSaving + minibusSaving
    if (saveLow > 0) {
      directives.push({
        id: 'send_transport_optimisation', type: 'service_model', tier: 'demand_management', owner: 'portfolio',
        action: `Expand personal travel budgets (${ptb.current}->${ptb.target}) and transport assistant grants (${tag.current}->${tag.target}). Deploy ${minibus.vehicles ?? 0} Ford minibuses on highest-cost routes.`,
        save_low: saveLow, save_high: saveHigh, save_central: Math.round((saveLow + saveHigh) / 2),
        timeline: 'Short-term (3-6 months)',
        legal_basis: 'Education Act 1996 s.508B: home to school transport duty for EHCP pupils',
        risk: 'Low', risk_detail: 'Personal travel budgets are voluntary. Parents must consent. Some routes are too complex for independent travel.',
        steps: [`Identify ${(ptb.target ?? 0) - (ptb.current ?? 0)} additional families suitable for personal travel budgets`, `Recruit ${(tag.target ?? 0) - (tag.current ?? 0)} additional transport assistant grant recipients`, `Deploy Ford minibus fleet on top 10 highest cost-per-pupil routes`, 'Negotiate volume taxi contract rates for remaining routes', 'Implement route optimisation software across all SEND transport'],
        governance_route: 'officer_delegation',
        evidence: `Total transport: ${formatCurrency(transport.total_cost)}, £${transport.cost_per_pupil}/pupil. Growth projection: +${formatCurrency(transport.growth_2026_27)} in 2026/27`,
        priority: 'high', feasibility: 8, impact: 7,
      })
    }
  }

  // 3. Placement Step-Down
  if (lacModel?.by_placement) {
    const optimisation = lacPlacementOptimisation(lacModel)
    if (optimisation.saving > 0) {
      directives.push({
        id: 'send_lac_placement_stepdown', type: 'service_model', tier: 'service_redesign', owner: 'portfolio',
        action: `Step-down ${optimisation.placements_moved.reduce((s, m) => s + m.count, 0)} LAC placements from independent to in-house. WOCL programme: ${lacModel.wocl_programme?.target_in_house_homes ?? 0} homes target.`,
        save_low: Math.round(optimisation.saving * 0.6), save_high: optimisation.saving, save_central: Math.round(optimisation.saving * 0.8),
        timeline: 'Long-term (18+ months)',
        legal_basis: 'Children Act 1989: sufficiency duty. Statutory guidance: in-house placements preferred.',
        risk: 'Medium', risk_detail: 'Requires capital investment in WOCL homes. Foster carer recruitment pipeline must expand. Ofsted registration timeline.',
        steps: optimisation.placements_moved.map(m => `Move ${m.count} from ${m.from_label} to ${m.to_label} (saving ${formatCurrency(m.unit_saving)}/placement)`),
        governance_route: 'cabinet_decision',
        evidence: `Current LAC cost: ${formatCurrency(optimisation.current_cost)}. ${optimisation.placements_moved.length} step-down pathways identified.`,
        priority: 'high', feasibility: 5, impact: 9,
      })
    }
  }

  // 4. Tribunal Reduction
  const tribunals = sendModel.tribunals || {}
  if (tribunals.appeals_registered_pa > 0) {
    const currentCost = (tribunals.annual_tribunal_cost ?? 0) + (tribunals.annual_placement_cost_from_losses ?? 0)
    const mediationTarget = 0.7
    const mediationSuccess = (tribunals.mediation_success_pct ?? 65) / 100
    const currentMediation = (tribunals.mediation_rate_pct ?? 0) / 100
    const additionalMediated = Math.round(tribunals.appeals_registered_pa * (mediationTarget - currentMediation))
    const appealsAvoided = Math.round(additionalMediated * mediationSuccess)
    const costPerAppealAvoided = (tribunals.avg_cost_per_tribunal ?? 0) + ((tribunals.parent_win_rate_pct ?? 94) / 100 * (tribunals.avg_cost_if_lost ?? 0))
    const saving = appealsAvoided * costPerAppealAvoided
    if (saving > 0) {
      directives.push({
        id: 'send_tribunal_reduction', type: 'service_model', tier: 'demand_management', owner: 'portfolio',
        action: `Increase mediation rate from ${tribunals.mediation_rate_pct}% to 70%, avoiding ~${appealsAvoided} tribunal appeals/year. Parents win ${tribunals.parent_win_rate_pct}%: early resolution is cheaper.`,
        save_low: Math.round(saving * 0.6), save_high: saving, save_central: Math.round(saving * 0.8),
        timeline: 'Medium-term (6-18 months)',
        legal_basis: 'SEND Code of Practice 2015: duty to resolve disputes without tribunal where possible',
        risk: 'Low', risk_detail: 'Mediation requires parental consent. Investment in SEND casework quality reduces appeals at source.',
        steps: [`Train ${Math.round(additionalMediated * 0.5)} additional mediators`, 'Implement "early resolution" triage at EHCP annual review stage', 'Publish transparent placement decision criteria', 'Establish parent partnership service with dedicated caseworkers', 'Monitor tribunal feedback to identify systemic decision failures'],
        governance_route: 'officer_delegation',
        evidence: `${tribunals.appeals_registered_pa} appeals/year, parents win ${tribunals.parent_win_rate_pct}%. Cost: ${formatCurrency(currentCost)}/year`,
        priority: 'medium', feasibility: 7, impact: 6,
      })
    }
  }

  // 5. Early Intervention ROI-backed directive
  if (sendModel.early_intervention?.family_safeguarding_model) {
    const fsm = sendModel.early_intervention.family_safeguarding_model
    const saveLow = fsm.potential_saving_low ?? 8000000
    const saveHigh = fsm.potential_saving_high ?? 15000000
    directives.push({
      id: 'send_early_intervention', type: 'service_model', tier: 'service_redesign', owner: 'portfolio',
      action: `Implement Family Safeguarding Model. ${fsm.evidence_base}. Prevents children entering care system.`,
      save_low: saveLow, save_high: saveHigh, save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Long-term (18+ months)',
      legal_basis: 'Children Act 1989: preventive duty. DfE Innovation Programme evidence.',
      risk: 'Medium', risk_detail: 'Requires whole-system transformation. 2-3 year implementation. Evidence from Hertfordshire may not fully transfer.',
      steps: ['Commission feasibility study based on Hertfordshire model', 'Recruit multi-disciplinary team (adult mental health, substance misuse, domestic abuse workers)', 'Pilot in 2 districts with highest LAC rates', 'Measure child safety outcomes at 6 and 12 months', 'Scale across county if pilot shows >25% LAC reduction'],
      governance_route: 'cabinet_decision',
      evidence: fsm.evidence_base || 'Hertfordshire: 46% reduction in children in care',
      priority: 'high', feasibility: 5, impact: 9,
    })
  }

  return directives
}
