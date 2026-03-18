/**
 * @module savings/serviceModels
 * Children's services, public health, property estate, and resources service models.
 */

import { formatCurrency } from './core.js'

/**
 * Project children's services cost trajectory over N years.
 * Models LAC residential growth, fostering, agency workforce, UASC, and WOCL expansion.
 *
 * @param {Object} childrenModel - children_cost_model from cabinet_portfolios.json
 * @param {number} years - Projection horizon (default 5)
 * @returns {{ yearly: Array, base_cost: number, total_5yr_cost: number, growth_rate: number, cost_breakdown: Object, wocl_trajectory: Array }}
 */
export function childrenCostProjection(childrenModel, years = 5) {
  if (!childrenModel?.lac_population) return { yearly: [], base_cost: 0, total_5yr_cost: 0, growth_rate: 0, cost_breakdown: {}, wocl_trajectory: [] }

  const lac = childrenModel.lac_population
  const costs = childrenModel.placement_costs ?? {}
  const agency = childrenModel.agency_workforce ?? {}
  const uasc = childrenModel.uasc_model ?? {}
  const wocl = childrenModel.wocl_programme ?? {}
  const growthRate = (lac.residential_growth_pct_pa ?? 13.3) / 100

  // Base costs
  const baseResidentialCount = lac.in_residential ?? 262
  const baseResidentialCost = baseResidentialCount * (costs.residential_annual_per_child ?? 312000)
  const baseFosterCount = (lac.current ?? 1699) - baseResidentialCount - (uasc.uasc_in_care ?? 0)
  const baseFosterCost = baseFosterCount * (costs.fostering_annual_per_child ?? 30000)
  const baseAgencyPremium = (agency.apprentices_uclan ?? 0) * (agency.agency_premium_per_sw ?? 20000)
    + (agency.agency_eps_send ?? 0) * ((agency.ep_agency_daily ?? 800) - (agency.ep_permanent_daily ?? 300)) * 200
  const baseUascShortfall = uasc.annual_shortfall_total ?? 0
  const baseCost = baseResidentialCost + baseFosterCost + baseAgencyPremium + baseUascShortfall

  const yearly = []
  let cumulativeCost = 0

  for (let y = 0; y < years; y++) {
    const resFactor = Math.pow(1 + growthRate, y)
    const residentialCount = Math.round(baseResidentialCount * resFactor)
    const residentialCost = Math.round(residentialCount * (costs.residential_annual_per_child ?? 312000))

    // Fostering grows slower than residential (2% pa typical)
    const fosterFactor = Math.pow(1.02, y)
    const fosterCost = Math.round(baseFosterCost * fosterFactor)

    // Agency premium declines as workforce conversion progresses (5% pa reduction)
    const agencyDecline = Math.pow(0.95, y)
    const agencyPremium = Math.round(baseAgencyPremium * agencyDecline)

    // UASC shortfall grows with population (5% pa)
    const uascFactor = Math.pow(1.05, y)
    const uascShortfall = Math.round(baseUascShortfall * uascFactor)

    const yearTotal = residentialCost + fosterCost + agencyPremium + uascShortfall
    cumulativeCost += yearTotal

    yearly.push({
      year: y + 1,
      label: `Year ${y + 1}`,
      lac_count: Math.round((lac.current ?? 1699) * Math.pow(1.02, y)),
      residential_count: residentialCount,
      residential_cost: residentialCost,
      fostering_cost: fosterCost,
      agency_premium: agencyPremium,
      uasc_shortfall: uascShortfall,
      total: yearTotal,
    })
  }

  // WOCL trajectory - in-house homes expansion reduces agency dependency
  const woclTrajectory = []
  const currentHomes = wocl.current_homes ?? 15
  const targetHomes = wocl.target_homes ?? 30
  const homesPerYear = Math.ceil((targetHomes - currentHomes) / years)
  for (let y = 0; y < years; y++) {
    const homes = Math.min(currentHomes + homesPerYear * (y + 1), targetHomes)
    const beds = Math.round(homes * ((wocl.target_beds ?? 100) / (wocl.target_homes ?? 30)))
    const saving = (homes - currentHomes) * (wocl.saving_per_placement_pa ?? 100000)
    woclTrajectory.push({ year: y + 1, homes, beds, saving })
  }

  return {
    yearly,
    base_cost: baseCost,
    total_5yr_cost: cumulativeCost,
    growth_rate: growthRate,
    cost_breakdown: {
      residential: { value: baseResidentialCost, pct: baseCost > 0 ? Math.round(baseResidentialCost / baseCost * 100) : 0 },
      fostering: { value: baseFosterCost, pct: baseCost > 0 ? Math.round(baseFosterCost / baseCost * 100) : 0 },
      agency_premium: { value: baseAgencyPremium, pct: baseCost > 0 ? Math.round(baseAgencyPremium / baseCost * 100) : 0 },
      uasc: { value: baseUascShortfall, pct: baseCost > 0 ? Math.round(baseUascShortfall / baseCost * 100) : 0 },
    },
    wocl_trajectory: woclTrajectory,
  }
}

/**
 * Generate prescriptive directives for children's services cost model.
 *
 * @param {Object} childrenModel - children_cost_model from cabinet_portfolios.json
 * @returns {Array} Array of directive objects
 */
export function childrenServiceDirectives(childrenModel) {
  if (!childrenModel) return []

  const directives = []
  const wocl = childrenModel.wocl_programme ?? {}
  const agency = childrenModel.agency_workforce ?? {}
  const family = childrenModel.family_safeguarding ?? {}
  const uasc = childrenModel.uasc_model ?? {}
  const ifa = childrenModel.ifa_contract ?? {}

  // 1. WOCL Residential Expansion
  if (wocl.current_homes || wocl.target_homes) {
    const additionalHomes = (wocl.target_homes ?? 30) - (wocl.current_homes ?? 15)
    const saveLow = additionalHomes * (wocl.saving_per_placement_pa ?? 100000) * 0.5
    const saveHigh = additionalHomes * (wocl.saving_per_placement_pa ?? 100000)
    directives.push({
      id: 'children_wocl_expansion',
      type: 'service_model',
      tier: 'service_redesign',
      owner: 'portfolio',
      action: `DO: Expand WOCL programme from ${wocl.current_homes ?? 15} to ${wocl.target_homes ?? 30} in-house children's homes. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} pa vs agency placements at £${((childrenModel.placement_costs?.agency_residential_weekly ?? 6000) * 52).toLocaleString()} pa per child. HOW: Capital programme £${formatCurrency((wocl.capital_cost_per_home ?? 1200000) * additionalHomes)} over 3 years. EVIDENCE: In-house running cost £${formatCurrency(wocl.annual_running_cost_per_home ?? 450000)}/home vs agency £${formatCurrency(wocl.agency_equivalent_cost ?? 17400000)} equivalent.`,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Long-term (18+ months)',
      legal_basis: 'Children Act 1989 s22G: sufficiency duty to provide accommodation within local authority area',
      risk: 'Medium',
      risk_detail: 'Capital programme delivery risk; Ofsted registration required per home; staffing recruitment in competitive market',
      steps: ['Complete business cases for next 5 homes', 'Secure capital funding through prudential borrowing', 'Identify and acquire suitable properties', 'Register with Ofsted and recruit staff teams', 'Transition placements from agency to in-house'],
      governance_route: 'cabinet_decision',
      evidence: `Current: ${wocl.current_homes ?? 15} homes, ${wocl.current_beds ?? 60} beds. Target: ${wocl.target_homes ?? 30} homes. Net saving at capacity: ${formatCurrency(wocl.net_saving_at_capacity ?? 2100000)} pa.`,
      priority: 'high',
      feasibility: 6,
      impact: 8,
    })
  }

  // 2. Agency Workforce Conversion
  if (agency.apprentices_uclan || agency.agency_eps_send) {
    const swSaving = (agency.apprentices_uclan ?? 97) * (agency.agency_premium_per_sw ?? 20000)
    const epSaving = (agency.agency_eps_send ?? 110) * ((agency.ep_agency_daily ?? 800) - (agency.ep_permanent_daily ?? 300)) * 200
    const saveLow = Math.round((swSaving + epSaving) * 0.4)
    const saveHigh = Math.round((swSaving + epSaving) * 0.7)
    directives.push({
      id: 'children_agency_conversion',
      type: 'service_model',
      tier: 'demand_management',
      owner: 'portfolio',
      action: `DO: Convert agency social workers and EPs to permanent staff. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} pa. HOW: Accelerate UCLan apprentice programme (${agency.apprentices_uclan ?? 97} on programme), recruit ${agency.nqsws_jan_2025 ?? 20} NQSWs. EVIDENCE: Agency SW premium ${agency.agency_premium_pct_low ?? 40}-${agency.agency_premium_pct_high ?? 60}% above permanent; EP agency rate £${agency.ep_agency_daily ?? 800}/day vs permanent £${agency.ep_permanent_daily ?? 300}/day.`,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Medium-term (6-18 months)',
      legal_basis: 'Children Act 2004 s11: workforce sufficiency; Social Work England registration requirements',
      risk: 'Low',
      risk_detail: 'Competitive recruitment market; retention requires competitive packages; UCLan pipeline has 2-year lag',
      steps: ['Complete agency spend audit per team', 'Identify high-performing agency workers for conversion offers', 'Accelerate UCLan apprentice progression to qualification', 'Implement retention premiums for hard-to-fill roles', 'Set quarterly agency reduction targets by service area'],
      governance_route: 'officer_delegation',
      evidence: `Current: ${agency.apprentices_uclan ?? 97} apprentices, ${agency.nqsws_jan_2025 ?? 20} NQSWs. Agency EP cost: £${((agency.agency_eps_send ?? 110) * (agency.ep_agency_daily ?? 800) * 200).toLocaleString()} pa.`,
      priority: 'high',
      feasibility: 7,
      impact: 7,
    })
  }

  // 3. Family Safeguarding Expansion
  if (family.children_before || family.edge_of_care_posts_target) {
    const reductionRate = (family.reduction_pct ?? 26) / 100
    const saveLow = Math.round((family.edge_of_care_posts_target ?? 20) * (family.cost_per_family ?? 15000) * reductionRate * 0.5)
    const saveHigh = Math.round((family.edge_of_care_posts_target ?? 20) * (family.cost_per_family ?? 15000) * reductionRate)
    directives.push({
      id: 'children_family_safeguarding',
      type: 'service_model',
      tier: 'demand_management',
      owner: 'portfolio',
      action: `DO: Expand Family Safeguarding edge-of-care programme to ${family.edge_of_care_posts_target ?? 20} posts. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} pa through LAC diversion. HOW: Recruit edge-of-care workers at £${formatCurrency(family.edge_of_care_annual_cost ?? 800000)} pa total. EVIDENCE: ${family.reduction_pct ?? 26}% reduction in children on CP plans (${family.children_before ?? 388} -> ${family.children_after ?? 286}).`,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Medium-term (6-18 months)',
      legal_basis: 'Children Act 1989 s17: duty to safeguard and promote welfare; Working Together 2023',
      risk: 'Low',
      risk_detail: 'Proven model with evidence base; risk is under-recruitment not programme design',
      steps: ['Complete business case with Hertfordshire evidence base', 'Recruit 20 edge-of-care posts', 'Establish multi-agency working protocols', 'Implement outcome tracking framework', 'Report quarterly LAC diversion rates to cabinet'],
      governance_route: 'cabinet_decision',
      evidence: `Family Safeguarding: ${family.children_before ?? 388} -> ${family.children_after ?? 286} children (${family.reduction_pct ?? 26}% reduction). Cost per family: £${(family.cost_per_family ?? 15000).toLocaleString()}.`,
      priority: 'high',
      feasibility: 8,
      impact: 7,
    })
  }

  // 4. UASC Home Office Recovery
  if (uasc.annual_shortfall_total) {
    directives.push({
      id: 'children_uasc_recovery',
      type: 'service_model',
      tier: 'income_generation',
      owner: 'portfolio',
      action: `DO: Maximise UASC Home Office grant recovery. SAVE: ${formatCurrency(uasc.recoverable_estimate_low ?? 2000000)}-${formatCurrency(uasc.recoverable_estimate_high ?? 4000000)} pa. HOW: Challenge HO rates for ${uasc.uasc_in_care ?? 180} UASC + ${uasc.care_leavers ?? 58} care leavers. EVIDENCE: Daily shortfall £${uasc.daily_shortfall_estimate ?? 100}/child; total annual shortfall £${formatCurrency(uasc.annual_shortfall_total)}.`,
      save_low: uasc.recoverable_estimate_low ?? 2000000,
      save_high: uasc.recoverable_estimate_high ?? 4000000,
      save_central: Math.round(((uasc.recoverable_estimate_low ?? 2000000) + (uasc.recoverable_estimate_high ?? 4000000)) / 2),
      timeline: 'Short-term (3-6 months)',
      legal_basis: 'Immigration Act 2016 s69: National Transfer Scheme; Home Office UASC funding instructions',
      risk: 'Medium',
      risk_detail: 'Home Office discretionary; NTS compliance required; political sensitivity around asylum costs',
      steps: ['Audit actual costs per UASC age bracket', 'Submit evidenced claim to Home Office', 'Engage ADCS network for collective lobbying', 'Explore NTS transfer opportunities for over-quota', 'Implement monthly cost tracking per UASC'],
      governance_route: 'officer_delegation',
      evidence: `${uasc.uasc_in_care ?? 180} UASC in care, ${uasc.care_leavers ?? 58} care leavers. HO grant: £${uasc.ho_grant_under_16_daily ?? 143}/day (u16), £${uasc.ho_grant_16_17_daily ?? 200}/day (16-17). Actual cost: £${uasc.actual_cost_daily_low ?? 200}-${uasc.actual_cost_daily_high ?? 400}/day.`,
      priority: 'high',
      feasibility: 6,
      impact: 6,
    })
  }

  // 5. IFA Contract Optimisation
  if (ifa.value_total) {
    const offContractValue = Math.round((ifa.value_total ?? 155000000) * (ifa.off_contract_pct ?? 4) / 100)
    const saveLow = Math.round(offContractValue * 0.1)
    const saveHigh = Math.round(offContractValue * 0.25)
    directives.push({
      id: 'children_ifa_optimisation',
      type: 'service_model',
      tier: 'procurement',
      owner: 'portfolio',
      action: `DO: Reduce off-contract IFA placements from ${ifa.off_contract_pct ?? 4}% to <1%. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} pa. HOW: Enforce through-Lancashire routing (currently ${ifa.through_lancashire_pct ?? 85}%) on £${formatCurrency(ifa.value_total ?? 155000000)} ${ifa.duration_years ?? 9}-year framework. EVIDENCE: ${ifa.through_local_regional_pct ?? 96}% through local/regional providers; off-contract volume: ${formatCurrency(offContractValue)}.`,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Short-term (3-6 months)',
      legal_basis: 'Public Contracts Regulations 2015; Sufficiency Duty (Children Act 1989 s22G)',
      risk: 'Low',
      risk_detail: 'Contract terms already in place; enforcement requires operational discipline',
      steps: ['Audit all current off-contract placements', 'Issue compliance notices to commissioning teams', 'Establish escalation protocol for emergency off-contract', 'Report monthly off-contract rate to DCS', 'Benchmark rates against framework pricing'],
      governance_route: 'officer_delegation',
      evidence: `IFA framework: £${formatCurrency(ifa.value_total ?? 155000000)} over ${ifa.duration_years ?? 9} years. Through-Lancashire: ${ifa.through_lancashire_pct ?? 85}%. Off-contract: ${ifa.off_contract_pct ?? 4}%.`,
      priority: 'medium',
      feasibility: 8,
      impact: 5,
    })
  }

  return directives
}

/**
 * Project public health funding and prevention trajectory.
 * Models grant decline, prevention ROI, monopoly risk, supplemental cliff edge.
 *
 * @param {Object} phModel - public_health_model from cabinet_portfolios.json
 * @param {number} years - Projection horizon (default 5)
 * @returns {{ yearly: Array, base_grant: number, grant_decline_5yr: number, total_prevention_roi: number, monopoly_risk_value: number, supplemental_cliff: Object|null }}
 */
export function publicHealthProjection(phModel, years = 5) {
  if (!phModel?.grant) return { yearly: [], base_grant: 0, grant_decline_5yr: 0, total_prevention_roi: 0, monopoly_risk_value: 0, supplemental_cliff: null }

  const grant = phModel.grant
  const prevention = phModel.prevention_roi ?? {}
  const hcrg = phModel.hcrg_monopoly ?? {}
  const substance = phModel.substance_misuse ?? {}

  const baseGrant = grant.total_public_health_grant ?? 0
  const supplemental = grant.drug_alcohol_supplemental ?? 0
  const declineRate = (grant.real_terms_decline_pct_pa ?? 2.5) / 100

  // Prevention spend & avoidance totals
  const preventionCategories = ['falls', 'smoking', 'obesity', 'physical_activity']
  const totalPreventionSpend = preventionCategories.reduce((s, cat) => s + (prevention[cat]?.annual_spend ?? 0), 0)
  const totalPreventionAvoidance = preventionCategories.reduce((s, cat) => {
    const p = prevention[cat]
    return s + (p?.asc_avoidance_pa ?? p?.nhs_avoidance_pa ?? p?.health_saving_pa ?? 0)
  }, 0)

  const yearly = []
  let cumulativeCost = 0

  for (let y = 0; y < years; y++) {
    // Grant declines in real terms
    const grantRealTerms = Math.round(baseGrant * Math.pow(1 - declineRate, y))

    // Supplemental falls off after end date (year 0 has it, then gone)
    const supplementalActive = y === 0 && grant.supplemental_time_limited ? supplemental : 0

    // Prevention spend stays constant but avoidance compounds as population ages
    const avoidanceFactor = Math.pow(1.02, y) // 2% demographic growth increases avoidable cost
    const preventionAvoidance = Math.round(totalPreventionAvoidance * avoidanceFactor)

    // HCRG monopoly cost with inflation
    const hcrgCost = Math.round((hcrg.annual_equivalent ?? 0) * Math.pow(1.03, y))

    // Substance misuse - CGL continues, supplemental ends
    const substanceCost = (substance.cgl_annual ?? 0) + (y === 0 ? (substance.ssmtr_adder_value ?? 0) : 0)

    const totalSpend = grantRealTerms + supplementalActive
    cumulativeCost += totalSpend

    yearly.push({
      year: y + 1,
      label: `Year ${y + 1}`,
      grant_real_terms: grantRealTerms,
      supplemental: supplementalActive,
      prevention_spend: totalPreventionSpend,
      prevention_avoidance: preventionAvoidance,
      hcrg_cost: hcrgCost,
      substance_misuse_cost: Math.round(substanceCost),
      total_spend: totalSpend,
    })
  }

  const grantDecline5yr = baseGrant - Math.round(baseGrant * Math.pow(1 - declineRate, years))

  return {
    yearly,
    base_grant: baseGrant,
    grant_decline_5yr: grantDecline5yr,
    total_prevention_roi: totalPreventionAvoidance > 0 ? Math.round(totalPreventionAvoidance / totalPreventionSpend * 10) / 10 : 0,
    monopoly_risk_value: hcrg.annual_equivalent ?? 0,
    supplemental_cliff: supplemental > 0 ? { value: supplemental, end_date: substance.ssmtr_adder_end_date ?? null } : null,
  }
}

/**
 * Generate prescriptive directives for public health cost model.
 *
 * @param {Object} phModel - public_health_model from cabinet_portfolios.json
 * @returns {Array} Array of directive objects
 */
export function publicHealthDirectives(phModel) {
  if (!phModel) return []

  const directives = []
  const hcrg = phModel.hcrg_monopoly ?? {}
  const substance = phModel.substance_misuse ?? {}
  const prevention = phModel.prevention_roi ?? {}
  const inequalities = phModel.health_inequalities ?? {}
  const grant = phModel.grant ?? {}

  // 1. HCRG Recommissioning
  if (hcrg.annual_equivalent) {
    const saveLow = Math.round(hcrg.annual_equivalent * (hcrg.benchmark_saving_pct_low ?? 10) / 100)
    const saveHigh = Math.round(hcrg.annual_equivalent * (hcrg.benchmark_saving_pct_high ?? 15) / 100)
    directives.push({
      id: 'ph_hcrg_recommission',
      type: 'service_model',
      tier: 'procurement',
      owner: 'portfolio',
      action: `DO: Recommission HCRG community health contract. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} pa. HOW: Competitive tender to break HHI ${hcrg.hhi ?? 3615} monopoly (${hcrg.category_spend_pct ?? 85}% single supplier). EVIDENCE: Zero Contracts Finder publications; ${hcrg.market_alternatives ?? 3} alternative providers identified; benchmark savings ${hcrg.benchmark_saving_pct_low ?? 10}-${hcrg.benchmark_saving_pct_high ?? 15}%.`,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Long-term (18+ months)',
      legal_basis: 'Public Contracts Regulations 2015; Provider Selection Regime 2024; Health and Care Act 2022',
      risk: 'High',
      risk_detail: 'Service continuity risk during transition; TUPE obligations; political sensitivity; dual entity structure complicates procurement',
      steps: ['Commission independent market review', 'Publish Prior Information Notice on Contracts Finder', 'Develop lot structure to enable SME participation', 'Run competitive dialogue with minimum 3 bidders', 'Implement 6-month transition period with incumbent'],
      governance_route: 'cabinet_decision',
      evidence: `HCRG: ${formatCurrency(hcrg.annual_equivalent)} pa. HHI: ${hcrg.hhi ?? 3615}. Dual entity: ${hcrg.dual_entity ? 'Yes' : 'No'}. CF published: ${hcrg.contracts_finder_published ?? 0}. Monthly rebilling: ${formatCurrency(hcrg.rebilling_pattern_monthly ?? 0)}.`,
      priority: 'high',
      feasibility: 5,
      impact: 9,
    })
  }

  // 2. CGL/Substance Misuse Contract Review
  if (substance.cgl_annual) {
    const saveLow = Math.round(substance.cgl_annual * 0.05)
    const saveHigh = Math.round(substance.cgl_annual * 0.10)
    directives.push({
      id: 'ph_substance_misuse_review',
      type: 'service_model',
      tier: 'procurement',
      owner: 'portfolio',
      action: `DO: Review CGL substance misuse contract ahead of SSMTR/ADDER cliff edge. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} pa. HOW: Prepare service redesign for loss of £${formatCurrency(substance.ssmtr_adder_value ?? 10600000)} supplemental funding (ends ${substance.ssmtr_adder_end_date ?? '2025-03-31'}). EVIDENCE: CGL dual entity; total substance misuse spend ${formatCurrency(substance.total_substance_misuse_annual ?? 25000000)} pa.`,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Medium-term (6-18 months)',
      legal_basis: 'Care Act 2014 s6B: drug and alcohol dependence; Misuse of Drugs Act 1971',
      risk: 'Medium',
      risk_detail: 'Supplemental funding cliff edge creates service gap; demand unlikely to reduce; CGL dual entity complicates novation',
      steps: ['Map all SSMTR/ADDER funded posts and activities', 'Model service levels post-supplemental', 'Negotiate CGL contract variation or exit provisions', 'Develop contingency commissioning plan', 'Brief cabinet on funding cliff timeline'],
      governance_route: 'cabinet_decision',
      evidence: `CGL: ${formatCurrency(substance.cgl_annual)} pa. SSMTR/ADDER: ${formatCurrency(substance.ssmtr_adder_value ?? 0)} (time-limited). We Are With You: ${formatCurrency(substance.we_are_with_you_value_20mo ?? 0)} (20mo).`,
      priority: 'high',
      feasibility: 6,
      impact: 7,
    })
  }

  // 3. Prevention Invest-to-Save
  const preventionCategories = ['falls', 'smoking', 'obesity', 'physical_activity']
  const totalAvoidance = preventionCategories.reduce((s, cat) => {
    const p = prevention[cat]
    return s + (p?.asc_avoidance_pa ?? p?.nhs_avoidance_pa ?? p?.health_saving_pa ?? 0)
  }, 0)
  if (totalAvoidance > 0) {
    const expansionPct = 0.2 // 20% expansion of prevention spend
    const totalSpend = preventionCategories.reduce((s, cat) => s + (prevention[cat]?.annual_spend ?? 0), 0)
    const saveLow = Math.round(totalAvoidance * expansionPct * 0.5)
    const saveHigh = Math.round(totalAvoidance * expansionPct)
    directives.push({
      id: 'ph_prevention_expansion',
      type: 'service_model',
      tier: 'demand_management',
      owner: 'portfolio',
      action: `DO: Expand prevention programmes by 20%. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} pa in ASC/NHS cost avoidance. HOW: Invest additional ${formatCurrency(Math.round(totalSpend * expansionPct))} in falls (ROI ${prevention.falls?.roi_ratio ?? 3.5}:1), smoking (ROI ${prevention.smoking?.roi_ratio ?? 2.8}:1), obesity (ROI ${prevention.obesity?.roi_ratio ?? 3.7}:1). EVIDENCE: Current avoidance ${formatCurrency(totalAvoidance)} pa from ${formatCurrency(totalSpend)} spend.`,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Medium-term (6-18 months)',
      legal_basis: 'Health and Social Care Act 2012 s12: public health improvement; Care Act 2014 prevention duty',
      risk: 'Low',
      risk_detail: 'Evidence-based interventions with proven ROI; savings accrue to ASC/NHS not PH budget directly',
      steps: ['Prioritise highest-ROI programmes for expansion', 'Develop joint funding agreements with NHS ICB', 'Target top deprivation quintile wards', 'Establish shared outcome tracking with ASC', 'Report prevention-to-ASC savings quarterly'],
      governance_route: 'officer_delegation',
      evidence: `Falls ROI ${prevention.falls?.roi_ratio ?? 3.5}:1 (${formatCurrency(prevention.falls?.annual_spend ?? 0)} -> ${formatCurrency(prevention.falls?.asc_avoidance_pa ?? 0)}). Smoking ROI ${prevention.smoking?.roi_ratio ?? 2.8}:1. Obesity ROI ${prevention.obesity?.roi_ratio ?? 3.7}:1.`,
      priority: 'high',
      feasibility: 8,
      impact: 7,
    })
  }

  // 4. Health Inequalities Reduction
  if (inequalities.life_expectancy_gap_male || inequalities.asc_residential_annual) {
    const targetReduction = inequalities.prevention_asc_reduction_target_pct ?? 5
    const saveLow = Math.round((inequalities.asc_residential_annual ?? 0) * targetReduction / 100 * 0.3)
    const saveHigh = Math.round((inequalities.asc_residential_annual ?? 0) * targetReduction / 100)
    directives.push({
      id: 'ph_health_inequalities',
      type: 'service_model',
      tier: 'demand_management',
      owner: 'portfolio',
      action: `DO: Target health inequalities to reduce ASC demand. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} pa. HOW: Focus prevention on worst deprivation quintile (LE gap ${inequalities.life_expectancy_gap_male ?? 10.6} years male, ${inequalities.life_expectancy_gap_female ?? 8.2} years female). EVIDENCE: ${targetReduction}% ASC residential reduction target = ${formatCurrency(Math.round((inequalities.asc_residential_annual ?? 0) * targetReduction / 100))} from ${formatCurrency(inequalities.asc_residential_annual ?? 0)} base.`,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Long-term (18+ months)',
      legal_basis: 'Health and Social Care Act 2012 s12: reduce health inequalities; Equality Act 2010 PSED',
      risk: 'Medium',
      risk_detail: 'Long-term payback (3-5 years); requires cross-portfolio working; outcome attribution complex',
      steps: ['Map top 20 wards by deprivation-health gap', 'Deploy targeted prevention resources', 'Establish ward-level outcome baselines', 'Quarterly cross-portfolio impact reporting', 'Joint commissioning with NHS ICB for worst quintile'],
      governance_route: 'cabinet_decision',
      evidence: `LE gap: ${inequalities.life_expectancy_gap_male ?? 10.6} years (male), ${inequalities.life_expectancy_gap_female ?? 8.2} years (female). Deprivation quintile gap: ${inequalities.deprivation_quintile_gap_years ?? 10.6} years. ASC residential: ${formatCurrency(inequalities.asc_residential_annual ?? 0)} pa.`,
      priority: 'medium',
      feasibility: 5,
      impact: 8,
    })
  }

  // 5. Grant Maximisation
  if (grant.real_terms_decline_pct_pa) {
    const annualDecline = Math.round((grant.total_public_health_grant ?? 0) * grant.real_terms_decline_pct_pa / 100)
    const saveLow = Math.round(annualDecline * 0.3)
    const saveHigh = Math.round(annualDecline * 0.6)
    directives.push({
      id: 'ph_grant_maximisation',
      type: 'service_model',
      tier: 'income_generation',
      owner: 'portfolio',
      action: `DO: Mitigate PH grant real-terms decline. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} pa. HOW: Lobby DHSC for inflation uplift; redirect ring-fenced underspend to prevention ROI programmes; explore s256 NHS agreements. EVIDENCE: Grant ${formatCurrency(grant.total_public_health_grant ?? 0)} declining ${grant.real_terms_decline_pct_pa}% pa real terms (${formatCurrency(annualDecline)}/yr).`,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Short-term (3-6 months)',
      legal_basis: 'Health and Social Care Act 2012 s31: public health grant conditions',
      risk: 'Low',
      risk_detail: 'Grant uplift depends on DHSC settlement; s256 agreements require NHS co-operation',
      steps: ['Calculate real-terms decline trajectory to 2030', 'Prepare DHSC submission with ADPH', 'Identify ring-fenced underspend for reallocation', 'Negotiate s256 agreements with ICB', 'Report grant efficiency to cabinet quarterly'],
      governance_route: 'officer_delegation',
      evidence: `PH grant: ${formatCurrency(grant.total_public_health_grant ?? 0)}. Supplemental: ${formatCurrency(grant.drug_alcohol_supplemental ?? 0)} (time-limited). Real-terms decline: ${grant.real_terms_decline_pct_pa}% pa.`,
      priority: 'medium',
      feasibility: 7,
      impact: 5,
    })
  }

  return directives
}

/**
 * Project property estate cost trajectory.
 * Models running costs, maintenance backlog growth, disposal receipts, co-location savings.
 *
 * @param {Object} propModel - property_cost_model from cabinet_portfolios.json
 * @param {number} years - Projection horizon (default 5)
 * @returns {{ yearly: Array, base_cost: number, backlog_trajectory: number, disposal_pipeline: number, co_location_potential: number, care_home_liability: number }}
 */
export function propertyEstateProjection(propModel, years = 5) {
  if (!propModel?.estate_summary) return { yearly: [], base_cost: 0, backlog_trajectory: 0, disposal_pipeline: 0, co_location_potential: 0, care_home_liability: 0 }

  const estate = propModel.estate_summary
  const disposal = propModel.disposal_programme ?? {}
  const coLoc = propModel.co_location_opportunity ?? {}
  const careHomes = propModel.in_house_care_homes ?? {}

  const baseCost = estate.property_estates_facilities_cost ?? 0
  const baseBacklog = estate.maintenance_backlog_known ?? 5000000
  const backlogGrowthRate = (disposal.backlog_growth_pct_pa ?? 8) / 100
  const disposalTarget = disposal.target_receipts ?? 0

  const yearly = []
  let cumulativeCost = 0

  for (let y = 0; y < years; y++) {
    // Running costs inflate at 3% pa
    const runningCost = Math.round(baseCost * Math.pow(1.03, y))

    // Backlog compounds
    const backlog = Math.round(baseBacklog * Math.pow(1 + backlogGrowthRate, y))

    // Disposal receipts spread over 5 years (front-loaded: 30% yr1, 25% yr2, 20% yr3, 15% yr4, 10% yr5)
    const disposalWeights = [0.3, 0.25, 0.2, 0.15, 0.1]
    const disposalReceipts = Math.round(disposalTarget * (disposalWeights[y] ?? 0))

    // Co-location savings ramp up (20% per year)
    const coLocSaving = Math.round((coLoc.total_potential ?? 0) * Math.min(0.2 * (y + 1), 1))

    const netCost = runningCost + backlog - disposalReceipts - coLocSaving
    cumulativeCost += netCost

    yearly.push({
      year: y + 1,
      label: `Year ${y + 1}`,
      running_cost: runningCost,
      backlog,
      disposal_receipts: disposalReceipts,
      co_location_saving: coLocSaving,
      net_cost: netCost,
    })
  }

  return {
    yearly,
    base_cost: baseCost,
    backlog_trajectory: Math.round(baseBacklog * Math.pow(1 + backlogGrowthRate, years)),
    disposal_pipeline: disposalTarget,
    co_location_potential: coLoc.total_potential ?? 0,
    care_home_liability: (careHomes.maintenance_backlog ?? 0),
  }
}

/**
 * Generate prescriptive directives for resources portfolio (property + procurement).
 *
 * @param {Object} propModel - property_cost_model from cabinet_portfolios.json (optional)
 * @param {Object} procModel - procurement_model from cabinet_portfolios.json (optional)
 * @returns {Array} Array of directive objects
 */
export function resourcesServiceDirectives(propModel, procModel) {
  if (!propModel && !procModel) return []

  const directives = []

  // Property directives
  if (propModel) {
    const estate = propModel.estate_summary ?? {}
    const disposal = propModel.disposal_programme ?? {}
    const coLoc = propModel.co_location_opportunity ?? {}
    const careHomes = propModel.in_house_care_homes ?? {}

    // 1. Estate Rationalisation
    if (disposal.target_receipts) {
      const saveLow = Math.round(disposal.target_receipts * 0.5)
      const saveHigh = disposal.target_receipts
      directives.push({
        id: 'resources_estate_rationalisation',
        type: 'service_model',
        tier: 'income_generation',
        owner: 'portfolio',
        action: `DO: Accelerate estate disposal programme. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} capital receipts. HOW: Progress ${(disposal.active_disposals ?? []).length} active disposals (${(disposal.active_disposals ?? []).slice(0, 3).join(', ')}). EVIDENCE: Target receipts ${formatCurrency(disposal.target_receipts)}; backlog growing ${disposal.backlog_growth_pct_pa ?? 8}% pa without disposal.`,
        save_low: saveLow,
        save_high: saveHigh,
        save_central: Math.round((saveLow + saveHigh) / 2),
        timeline: 'Medium-term (6-18 months)',
        legal_basis: 'Local Government Act 1972 s123: disposal at best consideration; CIPFA Asset Management Framework',
        risk: 'Medium',
        risk_detail: 'Market conditions affect receipts; planning permissions required; political sensitivity on community assets',
        steps: ['Complete condition surveys on surplus portfolio', 'Obtain planning consent for key sites', 'Instruct disposal via competitive marketing', 'Ring-fence receipts for backlog reduction', 'Report quarterly to cabinet on disposal progress'],
        governance_route: 'cabinet_decision',
        evidence: `${estate.total_properties ?? 1200} properties. Running cost: ${formatCurrency(estate.property_estates_facilities_cost ?? 0)} (${estate.pct_of_total_spend ?? 6.3}% of spend). Backlog: ${formatCurrency(estate.maintenance_backlog_known ?? 0)}.`,
        priority: 'high',
        feasibility: 7,
        impact: 7,
      })
    }

    // 2. Co-Location Programme
    if (coLoc.potential_consolidations) {
      directives.push({
        id: 'resources_co_location',
        type: 'service_model',
        tier: 'service_redesign',
        owner: 'portfolio',
        action: `DO: Implement co-location programme across ${coLoc.potential_consolidations} sites. SAVE: ${formatCurrency(coLoc.total_potential ?? 3000000)} pa at full implementation. HOW: Merge co-located services at ${formatCurrency(coLoc.estimated_saving_per_merge ?? 200000)} per consolidation. EVIDENCE: ${coLoc.potential_consolidations} potential consolidations identified; average saving ${formatCurrency(coLoc.estimated_saving_per_merge ?? 200000)} per merge.`,
        save_low: Math.round((coLoc.total_potential ?? 3000000) * 0.5),
        save_high: coLoc.total_potential ?? 3000000,
        save_central: Math.round((coLoc.total_potential ?? 3000000) * 0.75),
        timeline: 'Long-term (18+ months)',
        legal_basis: 'CIPFA Asset Management Framework; Localism Act 2011 general competence',
        risk: 'Low',
        risk_detail: 'Requires service agreement between occupying directorates; ICT infrastructure costs',
        steps: ['Identify top 5 quick-win co-locations', 'Develop business cases per site', 'Agree service-level sharing protocols', 'Implement phased migration over 24 months', 'Report occupancy efficiencies quarterly'],
        governance_route: 'officer_delegation',
        evidence: `${coLoc.potential_consolidations} potential merges. Avg saving: ${formatCurrency(coLoc.estimated_saving_per_merge ?? 200000)}. Total potential: ${formatCurrency(coLoc.total_potential ?? 0)} pa.`,
        priority: 'medium',
        feasibility: 7,
        impact: 6,
      })
    }

    // 3. Care Home Investment
    if (careHomes.maintenance_backlog) {
      directives.push({
        id: 'resources_care_home_investment',
        type: 'service_model',
        tier: 'statutory',
        owner: 'portfolio',
        action: `DO: Address ${formatCurrency(careHomes.maintenance_backlog)} care home maintenance backlog. SAVE: Avoids CQC regulatory action and emergency placement costs. HOW: Prioritise investment across ${careHomes.count ?? 16} in-house care homes (${careHomes.under_review ?? 5} under review). EVIDENCE: ${careHomes.closure_commitment ?? 'All 5 county care homes saved'}.`,
        save_low: 0,
        save_high: Math.round(careHomes.maintenance_backlog * 0.3),
        save_central: Math.round(careHomes.maintenance_backlog * 0.15),
        timeline: 'Medium-term (6-18 months)',
        legal_basis: 'Care Act 2014 s5: market shaping; Health and Social Care Act 2008 registration requirements',
        risk: 'High',
        risk_detail: 'CQC enforcement risk if not addressed; political commitment constrains options',
        steps: ['Complete structural surveys on all 16 homes', 'Prioritise safety-critical works', 'Develop 5-year capital programme', 'Report condition vs CQC requirements quarterly', 'Brief cabinet on investment options'],
        governance_route: 'cabinet_decision',
        evidence: `${careHomes.count ?? 16} in-house homes. Backlog: ${formatCurrency(careHomes.maintenance_backlog)}. Under review: ${careHomes.under_review ?? 5}. Commitment: ${careHomes.closure_commitment ?? 'none'}.`,
        priority: 'high',
        feasibility: 6,
        impact: 7,
      })
    }
  }

  // Procurement directives
  if (procModel) {
    const invoicing = procModel.invoice_processing ?? {}
    const concentration = procModel.supplier_concentration ?? {}
    const cfCoverage = procModel.contracts_finder_coverage ?? {}
    const automation = procModel.finance_automation_potential ?? {}

    // 4. E-Invoicing Automation
    if (invoicing.automation_saving_potential) {
      directives.push({
        id: 'resources_e_invoicing',
        type: 'service_model',
        tier: 'efficiency',
        owner: 'portfolio',
        action: `DO: Implement e-invoicing across ${invoicing.annual_invoices?.toLocaleString() ?? '600,000'} annual invoices. SAVE: ${formatCurrency(invoicing.automation_saving_potential)} pa. HOW: Move from manual (£${invoicing.manual_cost_per_invoice ?? 5}/invoice) to automated (£${invoicing.automated_cost_per_invoice ?? 0.50}/invoice) processing. EVIDENCE: ${invoicing.monthly_invoices?.toLocaleString() ?? '50,000'} invoices/month; current manual processing.`,
        save_low: Math.round((invoicing.automation_saving_potential ?? 0) * 0.6),
        save_high: invoicing.automation_saving_potential ?? 0,
        save_central: Math.round((invoicing.automation_saving_potential ?? 0) * 0.8),
        timeline: 'Medium-term (6-18 months)',
        legal_basis: 'Public Procurement (Electronic Invoices etc.) Regulations 2019; Late Payment of Commercial Debts Act 1998',
        risk: 'Low',
        risk_detail: 'Proven technology; requires ERP system upgrade; supplier onboarding effort',
        steps: ['Procure e-invoicing module/upgrade ERP', 'Pilot with top 50 suppliers (80% of volume)', 'Implement PO matching automation', 'Roll out to remaining suppliers over 12 months', 'Track processing time and exception rates'],
        governance_route: 'officer_delegation',
        evidence: `${invoicing.annual_invoices?.toLocaleString() ?? '600,000'} invoices pa. Manual: £${invoicing.manual_cost_per_invoice ?? 5}/invoice. Automated: £${invoicing.automated_cost_per_invoice ?? 0.50}/invoice.`,
        priority: 'high',
        feasibility: 8,
        impact: 6,
      })
    }

    // 5. Supplier Diversification
    if (concentration.overall_hhi) {
      const offContract = Math.round((cfCoverage.non_compliant_value ?? 0) * (concentration.off_contract_estimate_pct ?? 15) / 100)
      const saveLow = Math.round(offContract * 0.05)
      const saveHigh = Math.round(offContract * 0.15)
      directives.push({
        id: 'resources_supplier_diversification',
        type: 'service_model',
        tier: 'procurement',
        owner: 'portfolio',
        action: `DO: Reduce supplier concentration and off-contract spend. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} pa. HOW: Address ${concentration.off_contract_estimate_pct ?? 15}% off-contract spend; improve HHI from ${concentration.overall_hhi ?? 1200}. EVIDENCE: Top 10 suppliers = ${concentration.top_10_pct_of_spend ?? 45}% of spend; CF coverage only ${cfCoverage.overall_pct ?? 33}%.`,
        save_low: saveLow,
        save_high: saveHigh,
        save_central: Math.round((saveLow + saveHigh) / 2),
        timeline: 'Medium-term (6-18 months)',
        legal_basis: 'Public Contracts Regulations 2015; Procurement Act 2023 (from Feb 2025); Social Value Act 2012',
        risk: 'Medium',
        risk_detail: 'Requires cultural change in commissioning; some concentration is efficient for specialist services',
        steps: ['Audit off-contract spend by category', 'Establish framework agreements for high-value categories', 'Implement approval workflow for non-framework spend', 'Publish pipeline on Contracts Finder', 'Report quarterly on CF coverage and HHI'],
        governance_route: 'officer_delegation',
        evidence: `HHI: ${concentration.overall_hhi ?? 1200}. Top 10: ${concentration.top_10_pct_of_spend ?? 45}%. CF coverage: ${cfCoverage.overall_pct ?? 33}%. Non-compliant value: ${formatCurrency(cfCoverage.non_compliant_value ?? 0)}.`,
        priority: 'medium',
        feasibility: 7,
        impact: 6,
      })
    }

    // 6. Finance Automation
    if (automation.automation_pct) {
      const saving = automation.headcount_saving ?? Math.round(automation.finance_ftes * automation.automation_pct / 100 * automation.avg_salary)
      directives.push({
        id: 'resources_finance_automation',
        type: 'service_model',
        tier: 'efficiency',
        owner: 'portfolio',
        action: `DO: Automate ${automation.automation_pct}% of finance processes. SAVE: ${formatCurrency(Math.round(saving * 0.6))}-${formatCurrency(saving)} pa. HOW: Deploy RPA/AI across ${automation.finance_ftes ?? 80} finance FTEs for routine tasks. EVIDENCE: ${automation.automation_pct}% automatable at avg salary £${(automation.avg_salary ?? 35000).toLocaleString()}.`,
        save_low: Math.round(saving * 0.6),
        save_high: saving,
        save_central: Math.round(saving * 0.8),
        timeline: 'Long-term (18+ months)',
        legal_basis: 'CIPFA Financial Management Code; Accounts and Audit Regulations 2015',
        risk: 'Medium',
        risk_detail: 'Requires change management; redeployment/redundancy implications; technology investment',
        steps: ['Map finance processes by automation potential', 'Pilot RPA on highest-volume transactions', 'Develop redeployment plan for affected staff', 'Roll out across remaining processes', 'Track error rates and processing times'],
        governance_route: 'cabinet_decision',
        evidence: `${automation.finance_ftes ?? 80} finance FTEs. ${automation.automation_pct}% automatable. Avg salary: £${(automation.avg_salary ?? 35000).toLocaleString()}. Headcount saving: ${formatCurrency(saving)}.`,
        priority: 'medium',
        feasibility: 6,
        impact: 5,
      })
    }
  }

  return directives
}
