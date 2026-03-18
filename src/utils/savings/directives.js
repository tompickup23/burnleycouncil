/**
 * @module savings/directives
 * Prescriptive ACTION DIRECTIVE generation for Reform operations.
 * Core directive engine: maps findings to portfolios, aggregates savings,
 * and generates the full directive set including service model Phase 5/8.
 */

import { parseSavingRange, timelineBucket, formatCurrency } from './core.js'
import { giniCoefficient } from '../analytics.js'
import { spendingBudgetVariance, spendingConcentration } from './spending.js'
import { contractPipeline, fundingConstraints } from './operations.js'
import { sendServiceDirectives } from './send.js'
import { ascServiceDirectives } from './asc.js'
import { assetServiceDirectives } from './crossCutting.js'
import { childrenServiceDirectives, publicHealthDirectives, resourcesServiceDirectives } from './serviceModels.js'
import { treasuryManagementSavings, feesAndChargesReview, workforceOptimisation, commercialisationPipeline } from './expansion.js'

/**
 * Map DOGE findings to a specific portfolio.
 *
 * @param {Object} findings - doge_findings.json data
 * @param {Object} portfolio - Portfolio from cabinet_portfolios.json
 * @returns {Object} Filtered findings for this portfolio
 */
export function mapFindingsToPortfolio(findings, portfolio) {
  if (!findings || !portfolio) return { duplicates: [], splits: [], round_numbers: [], ch_flags: [], weak_competition: [] }

  const patterns = (portfolio.spending_department_patterns || []).map(p => new RegExp(p, 'i'))
  const matchDept = (dept) => patterns.some(p => p.test(dept || ''))

  const filterByDept = (items) => {
    if (!Array.isArray(items)) return []
    return items.filter(item => {
      const dept = item.department || item.service_division || item.service_area || ''
      return matchDept(dept)
    })
  }

  return {
    duplicates: filterByDept(findings.likely_duplicates?.examples || findings.likely_duplicates || []),
    splits: filterByDept(findings.split_payments?.examples || findings.split_payments || []),
    round_numbers: filterByDept(findings.round_numbers?.examples || findings.round_numbers || []),
    ch_flags: filterByDept(findings.ch_red_flags?.examples || findings.ch_red_flags || []),
    weak_competition: filterByDept(findings.weak_competition?.examples || findings.weak_competition || []),
  }
}

/**
 * Aggregate savings across all portfolios, respecting centralised vs portfolio-specific.
 * Centralised savings (duplicates, procurement, contracts) counted once under Resources.
 * Portfolio-specific levers (demand management, service redesign) counted per-portfolio.
 *
 * @param {Array} portfolios - All portfolios from cabinet_portfolios.json
 * @param {Object} findings - doge_findings.json data
 * @param {Object} cabinetData - Full cabinet_portfolios.json (for reform_operations)
 * @returns {Object} Cross-portfolio savings totals
 */
export function aggregateSavings(portfolios, findings, cabinetData) {
  if (!portfolios?.length) return { total_identified: 0, by_portfolio: [], by_timeline: {}, centralised: 0, portfolio_specific: 0, vs_mtfs: null }

  // 1. Centralised savings from reform_operations (counted once, not per-portfolio)
  const centralisedFunctions = cabinetData?.reform_operations?.centralised_savings?.functions || []
  let centralisedTotal = 0
  const centralisedTimeline = { immediate: 0, short_term: 0, medium_term: 0, long_term: 0 }
  for (const fn of centralisedFunctions) {
    const { low, high } = parseSavingRange(fn.est_saving)
    const central = (low + high) / 2
    centralisedTotal += central
    centralisedTimeline[timelineBucket(fn.timeline)] += central
  }

  // 2. Portfolio-specific levers (only those with owner !== 'centralised')
  const byPortfolio = portfolios.map(p => {
    const pFindings = mapFindingsToPortfolio(findings, p)

    // Only count portfolio-owned levers (not centralised ones)
    const portfolioLevers = (p.savings_levers || []).filter(l => l.owner !== 'centralised')
    const leverTotal = portfolioLevers.reduce((sum, l) => {
      const { low, high } = parseSavingRange(l.est_saving)
      return sum + (low + high) / 2
    }, 0)

    return {
      portfolio_id: p.id,
      title: p.short_title || p.title,
      cabinet_member: p.cabinet_member?.name,
      lever_savings: leverTotal,
      lever_count: portfolioLevers.length,
      finding_count: pFindings.duplicates.length + pFindings.splits.length + pFindings.round_numbers.length,
    }
  })

  const portfolioTotal = byPortfolio.reduce((sum, p) => sum + p.lever_savings, 0)
  const total = centralisedTotal + portfolioTotal

  // Timeline breakdown - portfolio-specific levers only (centralised handled above)
  const byTimeline = { ...centralisedTimeline }
  for (const p of portfolios) {
    for (const lever of (p.savings_levers || [])) {
      if (lever.owner === 'centralised') continue
      const { low, high } = parseSavingRange(lever.est_saving)
      byTimeline[timelineBucket(lever.timeline)] += (low + high) / 2
    }
  }

  // MTFS comparison
  const mtfs = cabinetData?.administration?.mtfs
  const vsMtfs = mtfs ? {
    target_year1: mtfs.savings_targets?.['2026_27'] || 0,
    target_two_year: mtfs.savings_targets?.two_year_total || 0,
    identified_total: total,
    coverage_year1_pct: mtfs.savings_targets?.['2026_27'] ? Math.round(total / mtfs.savings_targets['2026_27'] * 100) : null,
    coverage_two_year_pct: mtfs.savings_targets?.two_year_total ? Math.round(total / mtfs.savings_targets.two_year_total * 100) : null,
  } : null

  return { total_identified: total, by_portfolio: byPortfolio, by_timeline: byTimeline, centralised: centralisedTotal, portfolio_specific: portfolioTotal, vs_mtfs: vsMtfs }
}


/**
 * Generate prescriptive ACTION DIRECTIVES for a portfolio.
 *
 * Cross-cutting findings (duplicates, splits, CH compliance) are ONLY generated
 * for the Resources portfolio (centralised model). Other portfolios get
 * portfolio-specific levers, supplier concentration, and demand-side directives.
 *
 * @param {Object} portfolio - Portfolio from cabinet_portfolios.json
 * @param {Object} findings - doge_findings.json
 * @param {Array} spending - Matched spending records
 * @param {Object} options - { budgets, procurement, integrity, cabinetData }
 * @returns {Array} Directive objects
 */
export function generateDirectives(portfolio, findings, spending, options = {}) {
  if (!portfolio) return []
  const directives = []
  const isResourcesPortfolio = portfolio.id === 'resources'
  const spendingSummary = options.spendingSummary || null

  // 1. Cross-cutting DOGE directives - ONLY on Resources portfolio (centralised)
  // Duplicates, splits, and CH compliance are system-wide financial management
  // issues. Resources/S151 investigates first (Oracle transparency fix), then
  // either recovers centrally or assigns to individual directorates.
  if (isResourcesPortfolio && findings) {
    // Aggregate ALL findings across all departments (not just Resources patterns)
    const allDuplicates = findings.likely_duplicates?.examples || findings.likely_duplicates || []
    const allSplits = findings.split_payments?.examples || findings.split_payments || []
    const allChFlags = findings.ch_red_flags?.examples || findings.ch_red_flags || []

    if (allDuplicates.length > 0) {
      const totalDuplicates = allDuplicates.reduce((s, d) => s + (d.total_value || d.amount || 0), 0)
      if (totalDuplicates > 10000) {
        directives.push({
          id: 'centralised_dup_recovery',
          type: 'duplicate_recovery',
          tier: 'immediate_recovery',
          owner: 'centralised',
          action: `Investigate ${formatCurrency(totalDuplicates)} in flagged duplicates. Establish Oracle data quality baseline first`,
          save_low: totalDuplicates * 0.02, // Conservative - most likely Oracle artifacts
          save_high: totalDuplicates * 0.1,
          save_central: totalDuplicates * 0.05,
          timeline: 'Short-term (3-6 months)',
          legal_basis: 'Financial Procedure Rules: S151 statutory responsibility for financial management',
          risk: 'Low',
          risk_detail: 'Internal financial management. Oracle ERP transparency issues (100% empty descriptions) mean many flagged items may be CSV export artifacts, not genuine duplicates. S151/Finance must triage first.',
          steps: [
            'Commission Oracle transparency audit: why are 713K+ transaction descriptions empty?',
            'Establish data quality baseline: what % of flagged duplicates are genuine vs export artifacts',
            'For confirmed genuine duplicates: issue recovery notices to suppliers',
            'For systemic issues: escalate to Data, Technology & Efficiency portfolio for Oracle fix',
            'Report findings to Audit, Risk & Governance Committee',
          ],
          governance_route: 'officer_delegation',
          evidence: `${allDuplicates.length} flagged duplicate groups across all departments. Likely inflated by Oracle data quality issues.`,
          portfolio_id: 'resources',
          officer: 'Laurence Ainsworth (interim S151)',
          priority: 'high',
          feasibility: 8,
          impact: Math.min(10, Math.ceil(totalDuplicates * 0.05 / 500000)),
        })
      }
    }

    if (allSplits.length > 0) {
      const totalSplits = allSplits.reduce((s, d) => s + (d.total_value || d.amount || 0), 0)
      if (totalSplits > 50000) {
        directives.push({
          id: 'centralised_split_investigation',
          type: 'split_payment',
          tier: 'procurement_reform',
          owner: 'centralised',
          action: `Investigate ${formatCurrency(totalSplits)} in suspected split payments across all directorates`,
          save_low: totalSplits * 0.05,
          save_high: totalSplits * 0.15,
          save_central: totalSplits * 0.1,
          timeline: 'Short-term (3-6 months)',
          legal_basis: 'Contract Procedure Rules: threshold avoidance prohibited',
          risk: 'Medium',
          risk_detail: 'May reveal procurement non-compliance. Handle via Internal Audit, not individual portfolio holders.',
          steps: [
            'Internal Audit to extract all same-supplier transactions below procurement threshold',
            'Identify patterns suggesting deliberate splitting vs legitimate purchase orders',
            'Refer confirmed cases to Head of Procurement for process improvement',
            'Report systemic findings to Audit, Risk & Governance Committee',
          ],
          governance_route: 'officer_delegation',
          evidence: `${allSplits.length} suspected split payment instances council-wide`,
          portfolio_id: 'resources',
          officer: 'Laurence Ainsworth (interim S151)',
          priority: 'medium',
          feasibility: 7,
          impact: Math.min(10, Math.ceil(totalSplits * 0.1 / 2000000)),
        })
      }
    }

    if (allChFlags.length > 0) {
      directives.push({
        id: 'centralised_ch_compliance',
        type: 'compliance',
        tier: 'procurement_reform',
        owner: 'centralised',
        action: `Review ${allChFlags.length} suppliers with Companies House red flags council-wide`,
        save_low: 0,
        save_high: 0,
        save_central: 0,
        timeline: 'Immediate (0-3 months)',
        legal_basis: 'Public Contracts Regulations 2015 / Procurement Act 2023: exclusion grounds',
        risk: 'Low',
        risk_detail: 'Regulatory compliance: failure to act is the greater risk. Procurement team action.',
        steps: [
          'Procurement team to check current CH status of each flagged supplier',
          'Review active contracts with dissolved/dormant companies',
          'Issue termination notices or alternative procurement where appropriate',
          'Update pre-award checks to include CH status verification as standard',
        ],
        governance_route: 'officer_delegation',
        evidence: `${allChFlags.length} suppliers with CH compliance issues across all portfolios`,
        portfolio_id: 'resources',
        officer: 'Laurence Ainsworth (interim S151)',
        priority: 'high',
        feasibility: 9,
        impact: 3,
      })
    }

    // Centralised savings functions from reform_operations
    const centralisedFunctions = options.cabinetData?.reform_operations?.centralised_savings?.functions || []
    for (const fn of centralisedFunctions) {
      // Skip duplicates - already handled above from DOGE findings
      if (fn.function.toLowerCase().includes('duplicate')) continue
      const { low, high } = parseSavingRange(fn.est_saving)
      if (low === 0 && high === 0 && !fn.function.toLowerCase().includes('oracle')) continue
      directives.push({
        id: `centralised_${fn.function.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        type: 'centralised_reform',
        tier: 'procurement_reform',
        owner: 'centralised',
        action: fn.function,
        save_low: low,
        save_high: high,
        save_central: (low + high) / 2,
        timeline: fn.timeline || 'Medium-term',
        legal_basis: fn.legal_basis || 'Best Value duty (LGA 1999)',
        risk: fn.risk || 'Medium',
        risk_detail: fn.description,
        steps: [fn.description],
        governance_route: fn.decision_route || 'cabinet_decision',
        evidence: fn.doge_finding || fn.description,
        portfolio_id: 'resources',
        officer: options.cabinetData?.reform_operations?.centralised_savings?.executive_director || portfolio.executive_director,
        priority: fn.risk === 'Low' ? 'high' : fn.risk === 'High' ? 'low' : 'medium',
        feasibility: fn.risk === 'Low' ? 8 : fn.risk === 'High' ? 4 : 6,
        impact: Math.min(10, Math.ceil((low + high) / 2 / 1000000)),
      })
    }
  }

  // 2. Portfolio-specific levers (only those owned by the portfolio)
  for (const lever of (portfolio.savings_levers || [])) {
    // Skip centralised levers if we're not on Resources - they're generated above
    if (lever.owner === 'centralised' && !isResourcesPortfolio) continue

    const { low, high } = parseSavingRange(lever.est_saving)

    directives.push({
      id: `${portfolio.id}_lever_${(lever.lever || lever.description || '').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      type: 'savings_lever',
      tier: lever.tier || 'demand_management',
      owner: lever.owner || 'portfolio',
      action: lever.lever || lever.description,
      save_low: low,
      save_high: high,
      save_central: (low + high) / 2,
      timeline: lever.timeline || 'Medium-term',
      legal_basis: lever.legal_constraints || 'No specific legal constraint identified',
      risk: lever.risk || 'Medium',
      risk_detail: lever.description || '',
      steps: lever.steps || [lever.description],
      governance_route: high > 500000 ? 'cabinet' : 'officer_delegation',
      evidence: lever.description,
      article_refs: lever.evidence?.article_refs || [],
      lever_name: lever.lever,
      portfolio_id: portfolio.id,
      officer: portfolio.executive_director,
      priority: lever.risk === 'Low' ? 'high' : lever.risk === 'High' ? 'low' : 'medium',
      feasibility: lever.risk === 'Low' ? 8 : lever.risk === 'High' ? 4 : 6,
      impact: Math.min(10, Math.ceil((low + high) / 2 / 1000000)),
    })
  }

  // 3. Supplier concentration directives - per-portfolio (not centralised)
  if (spending?.length > 100) {
    const supplierTotals = {}
    for (const r of spending) {
      const name = r.supplier || r.supplier_canonical || 'Unknown'
      supplierTotals[name] = (supplierTotals[name] || 0) + (r.amount || 0)
    }
    const amounts = Object.values(supplierTotals)
    const gini = giniCoefficient(amounts)

    if (gini > 0.7) {
      const topSupplier = Object.entries(supplierTotals).sort((a, b) => b[1] - a[1])[0]
      directives.push({
        id: `${portfolio.id}_concentration`,
        type: 'concentration',
        tier: 'procurement_reform',
        owner: 'portfolio',
        action: `Reduce supplier concentration (Gini ${(gini * 100).toFixed(0)}%): top supplier ${topSupplier[0]} has ${formatCurrency(topSupplier[1])}`,
        save_low: topSupplier[1] * 0.05,
        save_high: topSupplier[1] * 0.15,
        save_central: topSupplier[1] * 0.1,
        timeline: 'Medium-term (12-24 months)',
        legal_basis: 'Best Value duty (LGA 1999): requirement to secure continuous improvement',
        risk: 'Medium',
        risk_detail: 'Changing major suppliers requires careful transition. Coordinate with centralised procurement reform.',
        steps: [
          'Map all contracts with top 5 suppliers',
          'Identify alternative suppliers via framework agreements',
          'Phase contract renewals to introduce competition',
          'Monitor service quality during transition',
        ],
        governance_route: 'cabinet',
        evidence: `Gini coefficient ${gini.toFixed(3)}, ${Object.keys(supplierTotals).length} suppliers`,
        portfolio_id: portfolio.id,
        officer: portfolio.executive_director,
        priority: 'medium',
        feasibility: 5,
        impact: Math.min(10, Math.ceil(topSupplier[1] * 0.1 / 1000000)),
      })
    }
  }

  // 4. Contract-aware directives (from procurement data)
  if (options.procurement?.length > 0) {
    const pipeline = contractPipeline(options.procurement, portfolio)

    // Expiring contract renegotiation opportunity
    if (pipeline.expiring_3m.length > 0) {
      const expiringValue = pipeline.expiring_3m.reduce((s, c) => s + (c.value || 0), 0)
      if (expiringValue > 50000) {
        directives.push({
          id: `${portfolio.id}_contract_expiry_3m`,
          type: 'contract_renegotiation',
          tier: 'procurement_reform',
          owner: 'portfolio',
          action: `${pipeline.expiring_3m.length} contracts expiring within 3 months (${formatCurrency(expiringValue)}). Renegotiate or retender`,
          save_low: expiringValue * 0.03,
          save_high: expiringValue * 0.12,
          save_central: expiringValue * 0.07,
          timeline: 'Immediate (0-3 months)',
          legal_basis: 'Public Contracts Regulations 2015 / Procurement Act 2023',
          risk: 'Medium',
          risk_detail: 'Short timeline. May need to extend existing contracts if retender not possible within window.',
          steps: ['Review contract terms and performance', 'Assess market alternatives', 'Issue retender or negotiate extension with improved terms'],
          governance_route: expiringValue > 500000 ? 'cabinet' : 'officer_delegation',
          evidence: `Contracts Finder: ${pipeline.expiring_3m.map(c => c.title).join('; ')}`,
          portfolio_id: portfolio.id,
          officer: portfolio.executive_director,
          priority: 'high',
          feasibility: 7,
          impact: Math.min(10, Math.ceil(expiringValue * 0.07 / 500000)),
        })
      }
    }

    // Weak competition warning (single bidder contracts)
    if (pipeline.single_bidder_count > 0 && pipeline.total_contracts > 2) {
      const singleBidderPct = Math.round((pipeline.single_bidder_count / pipeline.total_contracts) * 100)
      if (singleBidderPct > 30) {
        directives.push({
          id: `${portfolio.id}_weak_competition`,
          type: 'competition_improvement',
          tier: 'procurement_reform',
          owner: 'portfolio',
          action: `${singleBidderPct}% of contracts have single bidder. Improve market engagement`,
          save_low: 0,
          save_high: pipeline.total_value * 0.05,
          save_central: pipeline.total_value * 0.02,
          timeline: 'Medium-term (6-18 months)',
          legal_basis: 'Best Value duty (LGA 1999): duty to secure competition',
          risk: 'Low',
          risk_detail: 'Better procurement practices. Market warming, lot-splitting, and framework diversification.',
          steps: ['Analyse why single-bidder outcomes occur', 'Conduct pre-market engagement for upcoming retenders', 'Consider lot-splitting to widen competition'],
          governance_route: 'officer_delegation',
          evidence: `${pipeline.single_bidder_count}/${pipeline.total_contracts} contracts had single bidder`,
          portfolio_id: portfolio.id,
          officer: portfolio.executive_director,
          priority: 'medium',
          feasibility: 6,
          impact: Math.min(8, Math.ceil(pipeline.total_value * 0.02 / 1000000)),
        })
      }
    }
  }

  // 5. Service-model-driven directives (SEND, ASC, etc.)
  const serviceModel = portfolio.operational_context?.service_model
  if (serviceModel?.send_cost_model) {
    const sendDirectives = sendServiceDirectives(serviceModel.send_cost_model, serviceModel.lac_cost_model)
    directives.push(...sendDirectives.map(d => ({ ...d, portfolio_id: portfolio.id, officer: portfolio.executive_director })))
  }
  if (serviceModel?.asc_demand_model) {
    const ascDirectives = ascServiceDirectives(serviceModel.asc_demand_model)
    directives.push(...ascDirectives.map(d => ({ ...d, portfolio_id: portfolio.id, officer: portfolio.executive_director })))
  }
  if (serviceModel?.highway_asset_model) {
    const hwDirectives = assetServiceDirectives(serviceModel.highway_asset_model, null)
    directives.push(...hwDirectives.map(d => ({ ...d, portfolio_id: portfolio.id, officer: portfolio.executive_director })))
  }
  if (serviceModel?.waste_model) {
    const wasteDirectives = assetServiceDirectives(null, serviceModel.waste_model)
    directives.push(...wasteDirectives.map(d => ({ ...d, portfolio_id: portfolio.id, officer: portfolio.executive_director })))
  }
  if (serviceModel?.children_cost_model) {
    const childDirectives = childrenServiceDirectives(serviceModel.children_cost_model)
    directives.push(...childDirectives.map(d => ({ ...d, portfolio_id: portfolio.id, officer: portfolio.executive_director })))
  }
  if (serviceModel?.public_health_model) {
    const phDirectives = publicHealthDirectives(serviceModel.public_health_model)
    directives.push(...phDirectives.map(d => ({ ...d, portfolio_id: portfolio.id, officer: portfolio.executive_director })))
  }
  if (serviceModel?.property_cost_model || serviceModel?.procurement_model) {
    const resDirectives = resourcesServiceDirectives(serviceModel.property_cost_model, serviceModel.procurement_model)
    directives.push(...resDirectives.map(d => ({ ...d, portfolio_id: portfolio.id, officer: portfolio.executive_director })))
  }

  // 6. Funding constraint metadata on existing directives
  if (options.fundingModel) {
    const constraints = fundingConstraints(portfolio, options.fundingModel)
    if (constraints && constraints.addressable_pct < 50) {
      for (const d of directives) {
        d.funding_constraint = `Only ${constraints.addressable_pct}% of budget addressable (${formatCurrency(constraints.ring_fenced_total)} ring-fenced)`
      }
    }
  }

  // 7. Spending-intelligence directives (when summary available)
  if (spendingSummary?.by_portfolio?.[portfolio.id]) {
    const variance = spendingBudgetVariance(portfolio, spendingSummary)
    const concentration = spendingConcentration(spendingSummary.by_portfolio[portfolio.id])

    // Budget variance alert
    if (variance && variance.alert_level === 'red') {
      directives.push({
        category: 'spending_intelligence',
        action: `INVESTIGATE: ${portfolio.title} actual spend ${variance.variance_pct > 0 ? 'exceeds' : 'under'} budget by ${Math.abs(variance.variance_pct).toFixed(1)}%`,
        evidence: `Annualised spend ${formatCurrency(variance.annualised)} vs budget ${formatCurrency(variance.budget)} (${variance.months_of_data} months data)`,
        save_low: 0,
        save_high: Math.abs(variance.variance) > 0 ? Math.abs(variance.variance) : 0,
        save_central: Math.abs(variance.variance) * 0.5,
        timeline: 'immediate',
        priority: 'high',
        feasibility: 7,
        impact: 8,
        portfolio_id: portfolio.id,
      })
    }

    // Supplier concentration warning
    if (concentration && concentration.risk_level === 'high') {
      directives.push({
        category: 'spending_intelligence',
        action: `REVIEW: High supplier concentration in ${portfolio.title} (HHI ${concentration.hhi})`,
        evidence: `Top supplier: ${concentration.top_3[0]?.name || 'Unknown'} (${concentration.top_supplier_pct}% of portfolio spend). ${concentration.unique_suppliers} unique suppliers.`,
        save_low: 0,
        save_high: 0,
        save_central: 0,
        timeline: 'short_term',
        priority: 'medium',
        feasibility: 6,
        impact: 5,
        portfolio_id: portfolio.id,
      })
    }

    // Enrich existing directives with actual spend evidence
    for (const d of directives) {
      if (!d.actual_spend && spendingSummary.by_portfolio[portfolio.id]) {
        d.actual_spend = spendingSummary.by_portfolio[portfolio.id].total
        d.actual_suppliers = spendingSummary.by_portfolio[portfolio.id].unique_suppliers
      }
    }
  }

  // 8. Treasury, workforce, fees and commercialisation directives (when data present)
  const treasury = options.cabinetData?.administration?.treasury
  if (isResourcesPortfolio && treasury) {
    const treasuryResult = treasuryManagementSavings(treasury)
    if (treasuryResult.total > 0) {
      if (treasuryResult.idle_cash_cost > 100000) {
        directives.push({
          id: 'treasury_idle_cash',
          type: 'treasury',
          tier: 'immediate_recovery',
          owner: 'centralised',
          action: `DO: Move £${Math.round(treasury.cash_balances_average * 0.3 / 1000000)}M from overnight deposits to MMFs and short gilts. SAVE: ${formatCurrency(treasuryResult.idle_cash_cost)} pa. HOW: Switch to DMADF, MMFs, and short-dated gilts within existing CIPFA Treasury Management Code limits. EVIDENCE: £${Math.round(treasury.cash_balances_average / 1000000)}M average balance earning below base rate.`,
          save_low: Math.round(treasuryResult.idle_cash_cost * 0.6),
          save_high: treasuryResult.idle_cash_cost,
          save_central: Math.round(treasuryResult.idle_cash_cost * 0.8),
          timeline: 'Immediate (0-3 months)',
          legal_basis: 'CIPFA Treasury Management Code, MHCLG Investment Guidance 2018, S12 LGA 2003',
          risk: 'Low',
          risk_detail: 'Government-backed instruments only. No credit risk increase.',
          steps: ['Review maturity profile with treasury team', 'Benchmark yields against CIPFA peer group', 'Restructure: reduce overnight, increase MMFs and short gilts', 'Report to Full Council in Treasury Management Strategy'],
          governance_route: 'full_council',
          evidence: `Cash: £${Math.round(treasury.cash_balances_average / 1000000)}M. Actual yield: £${(treasury.investment_income_actual / 1000000).toFixed(1)}M. Benchmark: £${(treasury.investment_income_benchmark / 1000000).toFixed(1)}M. Gap: £${((treasury.investment_income_benchmark - treasury.investment_income_actual) / 1000000).toFixed(1)}M.`,
          portfolio_id: 'resources',
          officer: portfolio.executive_director,
          priority: 'high',
          feasibility: 9,
          impact: Math.min(10, Math.ceil(treasuryResult.idle_cash_cost / 500000)),
        })
      }
      if (treasuryResult.refinancing_potential > 100000) {
        directives.push({
          id: 'treasury_debt_refinance',
          type: 'treasury',
          tier: 'medium_term_reform',
          owner: 'centralised',
          action: `DO: Refinance ${treasury.pwlb_legacy_loans} legacy PWLB loans averaging ${treasury.average_legacy_rate_pct}% to current ${treasury.current_pwlb_rate_pct}%. SAVE: ${formatCurrency(treasuryResult.refinancing_potential)} pa. HOW: Early repayment and reborrowing where premium is less than 3-year interest saving. EVIDENCE: ${treasury.average_legacy_rate_pct - treasury.current_pwlb_rate_pct}% rate gap on £${Math.round(treasury.total_borrowing / 1000000)}M portfolio.`,
          save_low: Math.round(treasuryResult.refinancing_potential * 0.4),
          save_high: treasuryResult.refinancing_potential,
          save_central: Math.round(treasuryResult.refinancing_potential * 0.7),
          timeline: 'Medium-term (6-18 months)',
          legal_basis: 'S12 LGA 2003, CIPFA Prudential Code, PWLB lending arrangements',
          risk: 'Medium',
          risk_detail: 'Early repayment premiums may reduce net saving. Interest rate risk on variable rate reborrowing.',
          steps: ['Obtain PWLB early repayment quotes for all legacy loans', 'Calculate net saving after premiums for each loan', 'Refinance where 3-year payback on premium', 'Consider variable rate for short-duration borrowing', 'Report to Audit, Risk & Governance'],
          governance_route: 'cabinet_decision',
          evidence: `${treasury.pwlb_legacy_loans} loans at avg ${treasury.average_legacy_rate_pct}%. Current rate ${treasury.current_pwlb_rate_pct}%. Annual debt service: £${Math.round(treasury.annual_debt_service / 1000000)}M.`,
          portfolio_id: 'resources',
          officer: portfolio.executive_director,
          priority: 'medium',
          feasibility: 6,
          impact: Math.min(10, Math.ceil(treasuryResult.refinancing_potential / 1000000)),
        })
      }
      if (treasuryResult.mrp_method_saving > 100000) {
        directives.push({
          id: 'treasury_mrp_review',
          type: 'treasury',
          tier: 'medium_term_reform',
          owner: 'centralised',
          action: `DO: Switch MRP method from regulatory to asset life. SAVE: ${formatCurrency(treasuryResult.mrp_method_saving)} pa. HOW: Adopt CIPFA-compliant asset life MRP method, matching repayment to useful asset life. EVIDENCE: Current MRP charge £${Math.round(treasury.mrp_annual_charge / 1000000)}M using conservative regulatory method.`,
          save_low: Math.round(treasuryResult.mrp_method_saving * 0.7),
          save_high: treasuryResult.mrp_method_saving,
          save_central: Math.round(treasuryResult.mrp_method_saving * 0.85),
          timeline: 'Medium-term (3-6 months)',
          legal_basis: 'MHCLG MRP Guidance 2018, CIPFA Prudential Code, S21 LGA 2003',
          risk: 'Low',
          risk_detail: 'Widely adopted by councils. External audit may scrutinise but asset life method is CIPFA-compliant.',
          steps: ['Review current MRP policy and asset register', 'Model asset life method for each asset class', 'Draft revised MRP statement for Full Council approval', 'Implement from 2026/27 financial year'],
          governance_route: 'full_council',
          evidence: `Current: regulatory method, £${Math.round(treasury.mrp_annual_charge / 1000000)}M charge. Asset life method saving: £${(treasury.asset_life_mrp_saving / 1000000).toFixed(1)}M.`,
          portfolio_id: 'resources',
          officer: portfolio.executive_director,
          priority: 'high',
          feasibility: 8,
          impact: Math.min(10, Math.ceil(treasuryResult.mrp_method_saving / 1000000)),
        })
      }
    }
  }

  // Workforce directives (when portfolio has workforce data)
  if (portfolio.workforce) {
    const wfResult = workforceOptimisation(portfolio)
    if (wfResult.total > 200000) {
      if (wfResult.vacancy_savings > 100000) {
        directives.push({
          id: `${portfolio.id}_vacancy_factor`,
          type: 'workforce',
          tier: 'immediate_recovery',
          owner: 'portfolio',
          action: `DO: Enforce 3% vacancy factor on ${portfolio.title} budget. SAVE: ${formatCurrency(wfResult.vacancy_savings)} pa. HOW: Mandatory 8-week recruitment delay, all posts reviewed before filling. EVIDENCE: ${portfolio.workforce.vacancy_rate_pct}% vacancy rate, ${portfolio.workforce.fte_headcount} FTE.`,
          save_low: Math.round(wfResult.vacancy_savings * 0.6),
          save_high: wfResult.vacancy_savings,
          save_central: Math.round(wfResult.vacancy_savings * 0.8),
          timeline: 'Immediate (0-3 months)',
          legal_basis: 'Best Value duty (LGA 1999), local financial regulations',
          risk: 'Low',
          risk_detail: 'May slow recruitment for hard-to-fill posts. Exempt statutory roles.',
          steps: ['Implement 8-week recruitment delay policy', 'Review all vacancies with ED before advertising', 'Track vacancy savings monthly via Oracle', 'Report to portfolio holder monthly'],
          governance_route: 'officer_delegation',
          evidence: `${portfolio.workforce.fte_headcount} FTE. ${portfolio.workforce.vacancy_rate_pct}% vacancies. Avg salary £${(portfolio.workforce.average_salary || 32000).toLocaleString()}.`,
          portfolio_id: portfolio.id,
          officer: portfolio.executive_director,
          priority: 'high',
          feasibility: 9,
          impact: Math.min(8, Math.ceil(wfResult.vacancy_savings / 500000)),
        })
      }
      if (wfResult.agency_premium > 100000) {
        directives.push({
          id: `${portfolio.id}_agency_reduction`,
          type: 'workforce',
          tier: 'demand_management',
          owner: 'portfolio',
          action: `DO: Reduce agency spend by 30% in ${portfolio.title}. SAVE: ${formatCurrency(Math.round(wfResult.agency_premium * 0.3))} pa. HOW: Convert long-term agency to permanent, renegotiate framework rates, enforce hiring manager authorisation. EVIDENCE: £${(portfolio.workforce.agency_spend / 1000000).toFixed(1)}M agency spend, ${portfolio.workforce.agency_fte} agency FTE.`,
          save_low: Math.round(wfResult.agency_premium * 0.15),
          save_high: Math.round(wfResult.agency_premium * 0.4),
          save_central: Math.round(wfResult.agency_premium * 0.3),
          timeline: 'Short-term (3-6 months)',
          legal_basis: 'Agency Workers Regulations 2010 (12-week parity), procurement regulations',
          risk: 'Medium',
          risk_detail: 'Some agency use covers statutory roles (social workers, teachers). Conversion requires funded establishment posts.',
          steps: ['Audit all agency placements over 12 weeks', 'Convert qualifying roles to fixed-term or permanent', 'Renegotiate master vendor framework rates', 'Implement ED sign-off for all new agency requests'],
          governance_route: 'officer_delegation',
          evidence: `Agency: £${(portfolio.workforce.agency_spend / 1000000).toFixed(1)}M for ${portfolio.workforce.agency_fte} FTE. Permanent equivalent cost ~${Math.round(portfolio.workforce.agency_fte * (portfolio.workforce.average_salary || 32000) / 1000000 * 10) / 10}M. Premium: £${(wfResult.agency_premium / 1000000).toFixed(1)}M.`,
          portfolio_id: portfolio.id,
          officer: portfolio.executive_director,
          priority: 'medium',
          feasibility: 7,
          impact: Math.min(8, Math.ceil(wfResult.agency_premium * 0.3 / 500000)),
        })
      }
    }
  }

  // Fees and charges directives (when portfolio has fees data in levers)
  const feesResult = feesAndChargesReview(portfolio)
  if (feesResult.uplift_potential > 50000) {
    directives.push({
      id: `${portfolio.id}_fees_charges`,
      type: 'income',
      tier: 'immediate_recovery',
      owner: 'portfolio',
      action: `DO: Review all ${portfolio.title} fees and charges for full cost recovery. SAVE: ${formatCurrency(feesResult.uplift_potential)} pa. HOW: Uplift discretionary fees by CPI (3.2%) minimum, move to full cost recovery where permitted. EVIDENCE: ${feesResult.fee_lever_count} fee-related savings levers identified.`,
      save_low: Math.round(feesResult.uplift_potential * 0.5),
      save_high: feesResult.uplift_potential,
      save_central: Math.round(feesResult.uplift_potential * 0.75),
      timeline: 'Immediate (0-3 months)',
      legal_basis: 'LGA 2003 s93 (discretionary charges), Localism Act 2011 general power of competence',
      risk: 'Low',
      risk_detail: 'Some fees are statutory (planning). Discretionary fees can be set to recover costs. Political sensitivity on visible charges.',
      steps: ['List all fees and charges by statutory vs discretionary', 'Calculate full cost recovery rate for each', 'Uplift discretionary fees to cost recovery from April 2026', 'Benchmark against peer authorities'],
      governance_route: portfolio.id === 'resources' ? 'cabinet_decision' : 'officer_delegation',
      evidence: `${feesResult.fee_lever_count} fee levers. Estimated inflationary gap: ${formatCurrency(feesResult.inflationary_gap)}. Cost recovery gap: ${formatCurrency(feesResult.cost_recovery_gap)}.`,
      portfolio_id: portfolio.id,
      officer: portfolio.executive_director,
      priority: 'high',
      feasibility: 8,
      impact: Math.min(8, Math.ceil(feesResult.uplift_potential / 500000)),
    })
  }

  // Commercialisation directives (when portfolio has traded/income levers)
  const commResult = commercialisationPipeline(portfolio)
  if (commResult.total > 100000) {
    // Build detailed evidence string from all categories
    const catParts = [
      commResult.traded_income > 0 ? `Traded services: ${formatCurrency(commResult.traded_income)}` : null,
      commResult.advertising_income > 0 ? `Advertising/sponsorship: ${formatCurrency(commResult.advertising_income)}` : null,
      commResult.expertise_income > 0 ? `Expertise/consultancy: ${formatCurrency(commResult.expertise_income)}` : null,
      commResult.events_income > 0 ? `Events/filming: ${formatCurrency(commResult.events_income)}` : null,
      commResult.digital_income > 0 ? `Digital/data: ${formatCurrency(commResult.digital_income)}` : null,
      commResult.fees_income > 0 ? `Fees/charges: ${formatCurrency(commResult.fees_income)}` : null,
    ].filter(Boolean)

    const howParts = []
    if (commResult.events_income > 0) howParts.push('commercialise events and venues')
    if (commResult.advertising_income > 0) howParts.push('deploy advertising and sponsorship')
    if (commResult.traded_income > 0) howParts.push('sell traded services')
    if (commResult.expertise_income > 0) howParts.push('provide consultancy and expertise')
    if (commResult.digital_income > 0) howParts.push('monetise data and digital assets')
    if (commResult.fees_income > 0) howParts.push('review fees and charges')

    const quickWinNote = commResult.quick_wins.length > 0
      ? ` ${commResult.quick_wins.length} quick-win opportunities in first year.`
      : ''

    directives.push({
      id: `${portfolio.id}_commercialisation`,
      type: 'income',
      tier: 'medium_term_reform',
      owner: 'portfolio',
      action: `DO: Develop commercial income from ${portfolio.title}. SAVE: ${formatCurrency(commResult.total)} pa. HOW: ${howParts.join(', ')}. EVIDENCE: ${commResult.commercial_lever_count} opportunities identified.${quickWinNote}`,
      save_low: Math.round(commResult.total * 0.4),
      save_high: commResult.total,
      save_central: Math.round(commResult.total * 0.7),
      timeline: commResult.quick_wins.length > 0 ? '0-12 months (quick wins) to 18 months (full pipeline)' : 'Medium-term (6-18 months)',
      legal_basis: 'LGA 2003 s93 (cost recovery charging), s95 (trading via company), Localism Act 2011 (general power of competence), Highways Act 1980 s115E (highway advertising)',
      legal: commResult.legal_notes.length > 0 ? commResult.legal_notes[0] : 'Profits from trading must go through a Teckal company or LATCo under LGA 2003 s95',
      risk: commResult.quick_wins.length > 2 ? 'Low' : 'Medium',
      risk_detail: 'Commercial income requires market development. Traded services via company vehicle. Quick wins (fees, events, advertising) achievable within existing powers.',
      steps: ['Audit all income-generation opportunities across portfolio', 'Prioritise quick wins deliverable in year 1', 'Set pricing frameworks (cost-plus for trading, market rate for advertising)', 'Establish LATCo or trading account where s95 applies', 'Procure concession partners for advertising/sponsorship assets'],
      governance_route: commResult.total > 1000000 ? 'full_council' : 'cabinet_decision',
      evidence: catParts.join('. ') + '.',
      portfolio_id: portfolio.id,
      officer: portfolio.executive_director,
      priority: commResult.quick_wins.length > 0 ? 'high' : 'medium',
      feasibility: commResult.quick_wins.length > 2 ? 7 : 5,
      impact: Math.min(8, Math.ceil(commResult.total / 500000)),
    })
  }

  // Sort: high priority + high feasibility first
  const priorityOrder = { high: 3, medium: 2, low: 1 }
  directives.sort((a, b) => {
    const pDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0)
    if (pDiff !== 0) return pDiff
    return (b.feasibility * b.impact) - (a.feasibility * a.impact)
  })

  return directives
}

/**
 * Generate ALL directives across ALL portfolios: the "Monday morning list".
 * Centralised directives appear once (under Resources), not duplicated.
 *
 * @param {Array} portfolios - All portfolios
 * @param {Object} findings - doge_findings.json
 * @param {Object} allSpending - Map of portfolio_id -> spending records
 * @param {Object} cabinetData - Full cabinet_portfolios.json
 * @returns {Array} All directives, de-duplicated, sorted by impact
 */
export function generateAllDirectives(portfolios, findings, allSpending, cabinetData, options = {}) {
  if (!portfolios?.length) return []
  const all = []
  for (const p of portfolios) {
    const spending = allSpending?.[p.id] || []
    const directives = generateDirectives(p, findings, spending, { cabinetData, spendingSummary: options.spendingSummary })
    all.push(...directives)
  }
  // Sort by save_central descending for the overall priority view
  all.sort((a, b) => (b.save_central || 0) - (a.save_central || 0))
  return all
}
