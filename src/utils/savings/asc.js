/**
 * @module savings/asc
 * Adult Social Care demand model: projections, market risk, CHC recovery, directives.
 */

import { formatCurrency } from './core.js'

/**
 * Project ASC demand growth over N years.
 * Models care-type cost trajectories, demographic growth, and inflation.
 *
 * @param {Object} ascModel - asc_demand_model from cabinet_portfolios.json
 * @param {number} years - Projection horizon (default 5)
 * @returns {Object} { yearly, base_cost, total_growth, blended_growth_rate, cost_breakdown }
 */
export function ascDemandProjection(ascModel, years = 5) {
  if (!ascModel?.demographics) return { yearly: [], total_growth: 0, demand_vs_savings_gap: 0 }

  const demo = ascModel.demographics
  const costs = ascModel.care_type_costs || {}
  const market = ascModel.market_sustainability || {}

  // Base year costs from care type data
  const residentialOlderCost = (costs.residential_older_people?.beds ?? 0) * (costs.residential_older_people?.avg_weekly_cost ?? 0) * 52
  const residentialNursingCost = (costs.residential_nursing?.beds ?? 0) * (costs.residential_nursing?.avg_weekly_cost ?? 0) * 52
  const homeCareFrameworkCost = (costs.home_care_framework?.hours_per_week ?? 0) * (costs.home_care_framework?.hourly_rate ?? 0) * 52
  const homeCareOffFrameworkCost = (costs.home_care_off_framework?.hours_per_week ?? 0) * (costs.home_care_off_framework?.hourly_rate ?? 0) * 52
  const ldCost = costs.ld_supported_living?.annual_cost ?? 0
  const dpCost = (costs.direct_payments?.recipients ?? 0) * (costs.direct_payments?.avg_annual ?? 0)
  const sharedLivesCost = (costs.shared_lives?.placements ?? 0) * (costs.shared_lives?.avg_cost ?? 0)

  const baseCost = residentialOlderCost + residentialNursingCost + homeCareFrameworkCost + homeCareOffFrameworkCost + ldCost + dpCost + sharedLivesCost

  const over65Growth = (demo.over_65?.growth_pct_pa ?? 2.1) / 100
  const over85Growth = (demo.over_85?.growth_pct_pa ?? 3.5) / 100
  const ldGrowth = (demo.working_age_ld?.growth_pct_pa ?? 1.8) / 100
  // Blended growth rate: 65+ drives home care, 85+ drives residential, LD has separate rate
  const blendedGrowth = (over65Growth * 0.4) + (over85Growth * 0.4) + (ldGrowth * 0.2)

  const yearly = []
  let cumulativeGrowth = 0

  for (let y = 0; y < years; y++) {
    const factor = Math.pow(1 + blendedGrowth, y)
    const inflationFactor = Math.pow(1.04, y) // 4% annual care cost inflation

    const over65 = Math.round((demo.over_65?.['2024'] ?? 248000) * Math.pow(1 + over65Growth, y))
    const over85 = Math.round((demo.over_85?.['2024'] ?? 32000) * Math.pow(1 + over85Growth, y))
    const wkAgLD = Math.round((demo.working_age_ld?.current ?? 4200) * Math.pow(1 + ldGrowth, y))

    const residentialCost = Math.round((residentialOlderCost + residentialNursingCost) * factor * inflationFactor)
    const homeCareCost = Math.round((homeCareFrameworkCost + homeCareOffFrameworkCost) * factor * inflationFactor)
    const ldCostYear = Math.round(ldCost * Math.pow(1 + ldGrowth, y) * inflationFactor)
    const yearTotal = residentialCost + homeCareCost + ldCostYear + Math.round((dpCost + sharedLivesCost) * factor * inflationFactor)

    const growthFromBase = yearTotal - baseCost
    cumulativeGrowth += growthFromBase

    yearly.push({
      year: y + 1,
      label: `Year ${y + 1}`,
      over_65: over65,
      over_85: over85,
      working_age_ld: wkAgLD,
      residential_cost: residentialCost,
      home_care_cost: homeCareCost,
      ld_cost: ldCostYear,
      total: yearTotal,
      inflation_adjustment: Math.round(yearTotal * 0.04),
      growth_from_base: growthFromBase,
    })
  }

  return {
    yearly,
    base_cost: baseCost,
    total_growth: cumulativeGrowth,
    blended_growth_rate: blendedGrowth,
    cost_breakdown: {
      residential: { value: residentialOlderCost + residentialNursingCost, pct: baseCost > 0 ? Math.round((residentialOlderCost + residentialNursingCost) / baseCost * 100) : 0 },
      home_care: { value: homeCareFrameworkCost + homeCareOffFrameworkCost, pct: baseCost > 0 ? Math.round((homeCareFrameworkCost + homeCareOffFrameworkCost) / baseCost * 100) : 0 },
      ld: { value: ldCost, pct: baseCost > 0 ? Math.round(ldCost / baseCost * 100) : 0 },
      other: { value: dpCost + sharedLivesCost, pct: baseCost > 0 ? Math.round((dpCost + sharedLivesCost) / baseCost * 100) : 0 },
    },
  }
}

/**
 * Analyse provider market risks and concentration.
 *
 * @param {Object} ascModel - asc_demand_model from cabinet_portfolios.json
 * @returns {Object} { provider_count, vacancy_rate, closure_trend, fair_cost_gap, inflation_pressure, risk_score, mitigation_options }
 */
export function ascMarketRisk(ascModel) {
  if (!ascModel?.market_sustainability && !ascModel?.care_type_costs) {
    return { provider_count: 0, vacancy_rate: 0, closure_trend: 0, fair_cost_gap: 0, inflation_pressure: 0, risk_score: 0, risk_level: 'low', mitigation_options: [] }
  }

  const market = ascModel.market_sustainability || {}
  const costs = ascModel.care_type_costs || {}
  const rop = costs.residential_older_people || {}

  const providerCount = (rop.providers ?? 0) + (costs.home_care_framework?.providers ?? 0) + (costs.home_care_off_framework?.providers ?? 0)
  const vacancyRate = rop.vacancy_pct ?? 0
  const closures = market.care_home_closures_3yr ?? 0
  const fairCostGap = rop.gap_per_week ?? 0
  const inflationPressure = market.annual_cost_inflation ?? 0

  // Risk scoring (0-100)
  let riskScore = 0
  if (closures > 10) riskScore += 25
  else if (closures > 5) riskScore += 15
  else if (closures > 0) riskScore += 5

  if (vacancyRate > 15) riskScore += 20
  else if (vacancyRate > 10) riskScore += 10
  else if (vacancyRate > 5) riskScore += 5

  if (fairCostGap > 100) riskScore += 25
  else if (fairCostGap > 50) riskScore += 15

  if (market.provider_failure_risk === 'high') riskScore += 20
  else if (market.provider_failure_risk === 'medium') riskScore += 10

  const offFrameworkPct = costs.home_care_off_framework?.pct_of_total ?? 0
  if (offFrameworkPct > 30) riskScore += 10
  else if (offFrameworkPct > 20) riskScore += 5

  riskScore = Math.min(100, riskScore)
  const riskLevel = riskScore >= 60 ? 'critical' : riskScore >= 40 ? 'high' : riskScore >= 20 ? 'medium' : 'low'

  const mitigations = []
  if (fairCostGap > 0) mitigations.push({ action: `Close fair cost gap (£${fairCostGap}/week) to stabilise provider market`, impact: 'high', cost: Math.round(rop.beds * fairCostGap * 52) })
  if (offFrameworkPct > 20) mitigations.push({ action: `Reduce off-framework home care from ${offFrameworkPct}% to <20%`, impact: 'medium', saving: Math.round((costs.home_care_off_framework?.hours_per_week ?? 0) * ((costs.home_care_off_framework?.hourly_rate ?? 0) - (costs.home_care_framework?.hourly_rate ?? 0)) * 52 * 0.5) })
  if (costs.shared_lives?.placements) mitigations.push({ action: `Expand Shared Lives from ${costs.shared_lives.placements} to ${costs.shared_lives.placements + 50} placements`, impact: 'medium', saving: 50 * ((costs.shared_lives.vs_residential ?? 28000) - (costs.shared_lives.avg_cost ?? 15000)) })
  if (market.in_house_maintenance_backlog) mitigations.push({ action: `Address £${(market.in_house_maintenance_backlog / 1000000).toFixed(1)}M maintenance backlog in ${market.in_house_homes} in-house homes`, impact: 'high', cost: market.in_house_maintenance_backlog })

  return {
    provider_count: providerCount,
    vacancy_rate: vacancyRate,
    closure_trend: closures,
    fair_cost_gap: fairCostGap,
    inflation_pressure: inflationPressure,
    risk_score: riskScore,
    risk_level: riskLevel,
    off_framework_pct: offFrameworkPct,
    mitigation_options: mitigations,
  }
}

/**
 * Model CHC (Continuing Healthcare) recovery potential.
 *
 * @param {Object} chcModel - asc_demand_model.chc_model from cabinet_portfolios.json
 * @returns {Object} { current_income, target_income, gap, net_benefit, timeline }
 */
export function chcRecoveryModel(chcModel) {
  if (!chcModel) return { current_income: 0, target_income: 0, gap: 0, net_benefit: 0, implementation_cost: 0, timeline: [] }

  const currentRate = chcModel.current_recovery_rate_pct ?? 0
  const targetRate = chcModel.target_recovery_rate_pct ?? 10
  const avgClaim = chcModel.avg_claim_value ?? 28000
  const casesPA = chcModel.cases_reviewed_pa ?? 0
  const currentSuccessful = chcModel.successful_claims ?? 0

  const currentIncome = currentSuccessful * avgClaim
  const targetSuccessful = Math.round(casesPA * targetRate / 100)
  const targetIncome = targetSuccessful * avgClaim
  const gap = targetIncome - currentIncome

  // Implementation: CHC review team
  const additionalReviewers = Math.ceil((targetSuccessful - currentSuccessful) / 120) // 120 cases per reviewer per year
  const reviewerCost = 45000 // Average salary
  const implementationCost = additionalReviewers * reviewerCost
  const legalCost = Math.round(gap * 0.05) // 5% legal costs for contested claims

  const netBenefit = gap - implementationCost - legalCost

  const timeline = [
    { year: 1, label: 'Year 1: Recruit CHC team + process review', recovery_rate: currentRate + (targetRate - currentRate) * 0.3, income: Math.round(currentIncome + gap * 0.3) },
    { year: 2, label: 'Year 2: Backlog clearance + systematic reviews', recovery_rate: currentRate + (targetRate - currentRate) * 0.6, income: Math.round(currentIncome + gap * 0.6) },
    { year: 3, label: 'Year 3: Full target rate achieved', recovery_rate: targetRate, income: targetIncome },
  ]

  return {
    current_income: currentIncome,
    current_rate: currentRate,
    target_income: targetIncome,
    target_rate: targetRate,
    gap,
    additional_claims: targetSuccessful - currentSuccessful,
    implementation_cost: implementationCost + legalCost,
    net_benefit: netBenefit,
    additional_reviewers: additionalReviewers,
    timeline,
  }
}

/**
 * Generate ASC-specific savings directives from demand model.
 *
 * @param {Object} ascModel - asc_demand_model from cabinet_portfolios.json
 * @returns {Array} directive objects
 */
export function ascServiceDirectives(ascModel) {
  if (!ascModel) return []
  const directives = []

  // 1. CHC Recovery
  const chc = ascModel.chc_model
  if (chc && chc.current_recovery_rate_pct < (chc.target_recovery_rate_pct ?? 10)) {
    const recovery = chcRecoveryModel(chc)
    if (recovery.gap > 0) {
      directives.push({
        id: 'asc_chc_recovery',
        type: 'service_model',
        tier: 'income_generation',
        owner: 'portfolio',
        action: `Increase CHC recovery rate from ${chc.current_recovery_rate_pct}% to ${chc.target_recovery_rate_pct}%. National average is ${chc.national_avg_pct}%. Currently leaving ${formatCurrency(recovery.gap)}/year on the table.`,
        save_low: Math.round(recovery.gap * 0.5),
        save_high: recovery.gap,
        save_central: Math.round(recovery.gap * 0.75),
        timeline: 'Medium-term (6-18 months)',
        legal_basis: 'National Framework for NHS Continuing Healthcare (2022): ICB duty to assess and fund',
        risk: 'Low',
        risk_detail: 'NHS will contest claims. Requires dedicated CHC review team and legal support.',
        steps: [
          `Recruit ${recovery.additional_reviewers} additional CHC reviewers`,
          'Implement systematic screening at care package review',
          'Commission independent CHC assessment expertise',
          `Clear backlog of ${chc.cases_reviewed_pa ?? 0} cases per year`,
          'Challenge NHS ICB refusals through dispute resolution',
        ],
        governance_route: 'officer_delegation',
        evidence: `Recovery rate ${chc.current_recovery_rate_pct}% vs national ${chc.national_avg_pct}%. ${chc.successful_claims} claims at ${formatCurrency(chc.avg_claim_value)} each`,
        priority: 'high',
        feasibility: 8,
        impact: 8,
      })
    }
  }

  // 2. Off-Framework Home Care Reduction
  const offFw = ascModel.care_type_costs?.home_care_off_framework
  const onFw = ascModel.care_type_costs?.home_care_framework
  if (offFw && onFw && offFw.pct_of_total > 20) {
    const rateGap = (offFw.hourly_rate ?? 0) - (onFw.hourly_rate ?? 0)
    const hoursToConvert = Math.round((offFw.hours_per_week ?? 0) * 0.5) // Convert 50% to framework
    const annualSaving = hoursToConvert * rateGap * 52
    if (annualSaving > 0) {
      directives.push({
        id: 'asc_off_framework_reduction',
        type: 'service_model',
        tier: 'procurement_reform',
        owner: 'portfolio',
        action: `Reduce off-framework home care from ${offFw.pct_of_total}% to <20%. Rate gap: £${rateGap.toFixed(2)}/hour. Convert ${hoursToConvert.toLocaleString()} hours/week to framework providers.`,
        save_low: Math.round(annualSaving * 0.6),
        save_high: annualSaving,
        save_central: Math.round(annualSaving * 0.8),
        timeline: 'Medium-term (6-18 months)',
        legal_basis: 'Care Act 2014: market shaping duty. Public Contracts Regulations 2015',
        risk: 'Medium',
        risk_detail: 'Off-framework providers fill gaps where framework cannot. Rapid switch risks service disruption.',
        steps: [
          'Map off-framework hours by area and provider',
          'Negotiate framework expansion with top 10 providers',
          'Incentivise framework compliance (guaranteed hours)',
          'Phase transition: 6-month switchover per area',
          'Monitor service quality during transition',
        ],
        governance_route: 'cabinet_decision',
        evidence: `${offFw.pct_of_total}% off-framework at £${offFw.hourly_rate}/hr vs framework £${onFw.hourly_rate}/hr. ${offFw.providers} providers`,
        priority: 'high',
        feasibility: 6,
        impact: 7,
      })
    }
  }

  // 3. Reablement Expansion
  const reab = ascModel.reablement
  if (reab?.potential_expansion) {
    const netSaving = reab.potential_expansion.net_saving ?? 0
    if (netSaving > 0) {
      directives.push({
        id: 'asc_reablement_expansion',
        type: 'service_model',
        tier: 'demand_management',
        owner: 'portfolio',
        action: `Expand reablement by ${reab.potential_expansion.additional_episodes_pa} episodes/year. ${reab.success_rate_pct}% success rate (national: ${reab.national_avg_pct}%). Each successful episode avoids ${formatCurrency(reab.residential_avoided_saving)} residential care.`,
        save_low: Math.round(netSaving * 0.7),
        save_high: netSaving,
        save_central: Math.round(netSaving * 0.85),
        timeline: 'Short-term (3-6 months)',
        legal_basis: 'Care Act 2014 s.2: prevention duty',
        risk: 'Low',
        risk_detail: 'Reablement is proven. Success rate already above national average. Risk is capacity, not effectiveness.',
        steps: [
          `Recruit additional reablement workers for ${reab.potential_expansion.additional_episodes_pa} episodes`,
          'Negotiate hospital discharge pathway priority',
          `Increase discharge reablement offer from ${reab.offered_after_discharge_pct}% to 5%`,
          'Integrate with NHS intermediate care teams',
          'Track 91-day outcomes for quality assurance',
        ],
        governance_route: 'officer_delegation',
        evidence: `Success rate ${reab.success_rate_pct}% vs national ${reab.national_avg_pct}%. ${formatCurrency(reab.cost_per_episode)}/episode vs ${formatCurrency(reab.residential_avoided_saving)} residential avoided`,
        priority: 'high',
        feasibility: 8,
        impact: 7,
      })
    }
  }

  // 4. Shared Lives Expansion
  const sl = ascModel.care_type_costs?.shared_lives
  if (sl && sl.vs_residential && sl.avg_cost) {
    const expansionTarget = 50
    const saving = expansionTarget * (sl.vs_residential - sl.avg_cost)
    directives.push({
      id: 'asc_shared_lives_expansion',
      type: 'service_model',
      tier: 'service_redesign',
      owner: 'portfolio',
      action: `Expand Shared Lives from ${sl.placements} to ${sl.placements + expansionTarget} placements. CQC Outstanding. Saves ${formatCurrency(sl.vs_residential - sl.avg_cost)} per placement vs residential.`,
      save_low: Math.round(saving * 0.6),
      save_high: saving,
      save_central: Math.round(saving * 0.8),
      timeline: 'Medium-term (6-18 months)',
      legal_basis: 'Care Act 2014: market shaping duty. Shared Lives Plus quality framework.',
      risk: 'Low',
      risk_detail: 'CQC Outstanding scheme. Main barrier is carer recruitment and matching.',
      steps: [
        'Launch Shared Lives recruitment campaign',
        `Identify ${expansionTarget} suitable service users from residential/supported living`,
        'Train new Shared Lives carers (12-week programme)',
        'Match and transition with 4-week supported placement',
        'Monitor outcomes and maintain CQC Outstanding rating',
      ],
      governance_route: 'officer_delegation',
      evidence: `CQC: ${sl.cqc_rating}. ${sl.placements} placements at ${formatCurrency(sl.avg_cost)} vs ${formatCurrency(sl.vs_residential)} residential`,
      priority: 'medium',
      feasibility: 7,
      impact: 6,
    })
  }

  // 5. Digital Care & Technology
  const demandPressures = ascModel.demand_pressures
  if (demandPressures?.assessment_backlog || demandPressures?.annual_reviews_overdue) {
    const backlogSaving = Math.round(((demandPressures.assessment_backlog?.waiting ?? 0) + (demandPressures.annual_reviews_overdue ?? 0)) * 500) // £500 per digitally-assisted review
    directives.push({
      id: 'asc_digital_care',
      type: 'service_model',
      tier: 'service_redesign',
      owner: 'portfolio',
      action: `Deploy digital care technology to clear ${(demandPressures.assessment_backlog?.waiting ?? 0).toLocaleString()} assessment backlog + ${(demandPressures.annual_reviews_overdue ?? 0).toLocaleString()} overdue reviews. Self-service portals for lower-complexity cases.`,
      save_low: Math.round(backlogSaving * 0.3),
      save_high: backlogSaving,
      save_central: Math.round(backlogSaving * 0.5),
      timeline: 'Medium-term (6-18 months)',
      legal_basis: 'Care Act 2014: duty to assess. Digital transformation does not remove statutory obligations.',
      risk: 'Medium',
      risk_detail: 'CQC flagged unreliable electronic records. Must fix foundation before building digital services.',
      steps: [
        'Replace/upgrade unreliable electronic records system',
        'Deploy self-service portal for lower-complexity assessments',
        'Implement digital triage for new referrals',
        'Automate annual review scheduling and tracking',
        'Use predictive analytics for demand management',
      ],
      governance_route: 'cabinet_decision',
      evidence: `${(demandPressures.assessment_backlog?.waiting ?? 0).toLocaleString()} waiting assessment (max ${demandPressures.assessment_backlog?.max_wait_days ?? 0} days), ${(demandPressures.annual_reviews_overdue ?? 0).toLocaleString()} overdue reviews`,
      priority: 'medium',
      feasibility: 5,
      impact: 7,
    })
  }

  return directives
}
