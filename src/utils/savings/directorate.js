/**
 * @module savings/directorate
 * Directorate-level functions for Cabinet Command v2: savings profiles,
 * evidence chain strength, KPI tracking, benchmarking, risk profiles.
 */

import { parseSavingRange, timelineBucket } from './core.js'
import { matchSpendingToPortfolio } from './spending.js'
import { portfolioBenchmark } from './benchmarking.js'
import { portfolioRiskDashboard } from './governance.js'

/**
 * Build a comprehensive savings profile for a directorate by aggregating
 * all its constituent portfolios' savings levers, evidence chains, and
 * MTFS targets.
 *
 * @param {Object} directorate - Directorate from cabinet_portfolios.json directorates[]
 * @param {Array} portfolios - All portfolios array
 * @param {Object} findings - doge_findings.json
 * @param {Object} cabinetData - Full cabinet_portfolios.json
 * @returns {Object|null} Directorate savings profile
 */
export function buildDirectorateSavingsProfile(directorate, portfolios, findings, cabinetData) {
  if (!directorate) return null

  const dirPortfolios = (portfolios || []).filter(p =>
    (directorate.portfolio_ids || []).includes(p.id)
  )

  // Aggregate all levers across constituent portfolios
  const allLevers = []
  for (const p of dirPortfolios) {
    for (const lever of (p.savings_levers || [])) {
      allLevers.push({ ...lever, portfolio_id: p.id, portfolio_title: p.short_title || p.title })
    }
  }

  // Compute savings by tier
  const byTier = {}
  const byTimeline = { immediate: 0, short_term: 0, medium_term: 0, long_term: 0 }
  let totalLow = 0
  let totalHigh = 0
  let evidencedCount = 0

  for (const lever of allLevers) {
    const { low, high } = parseSavingRange(lever.est_saving)
    totalLow += low
    totalHigh += high
    const mid = (low + high) / 2
    const tier = lever.tier || 'other'
    byTier[tier] = (byTier[tier] || 0) + mid
    byTimeline[timelineBucket(lever.timeline)] += mid
    if (lever.evidence) evidencedCount++
  }

  // MTFS coverage
  const mtfsTarget = directorate.mtfs_savings_target ?? 0
  const midpoint = (totalLow + totalHigh) / 2
  const coveragePct = mtfsTarget > 0 ? Math.round(midpoint / mtfsTarget * 100) : null

  // Prior year gap
  const priorTarget = directorate.prior_year_target ?? 0
  const priorAchieved = directorate.prior_year_achieved ?? 0
  const priorGap = priorTarget > 0 ? priorTarget - priorAchieved : null
  const priorPct = priorTarget > 0 ? Math.round(priorAchieved / priorTarget * 100) : null

  // Evidence strength
  const avgEvidenceStrength = allLevers.length > 0
    ? Math.round(allLevers.reduce((sum, l) => sum + evidenceChainStrength(l), 0) / allLevers.length)
    : 0

  return {
    directorate_id: directorate.id,
    title: directorate.title,
    executive_director: directorate.executive_director,
    portfolio_count: dirPortfolios.length,
    net_budget: directorate.net_budget,
    mtfs_target: mtfsTarget,
    savings_range: { low: totalLow, high: totalHigh, midpoint },
    coverage_pct: coveragePct,
    prior_year: priorGap != null ? { target: priorTarget, achieved: priorAchieved, gap: priorGap, achieved_pct: priorPct } : null,
    lever_count: allLevers.length,
    evidenced_count: evidencedCount,
    avg_evidence_strength: avgEvidenceStrength,
    by_tier: byTier,
    by_timeline: byTimeline,
    levers: allLevers,
    savings_narrative: directorate.savings_narrative || null,
    kpi_headline: directorate.kpi_headline || null,
    delivery_history: directorate.savings_delivery_history || null,
  }
}

/**
 * Score the evidence strength of a savings lever (0-100).
 *
 * Scoring: has data_points (15) + benchmark (15) + calculation (20)
 *   + kpi_link (15) + implementation_steps (15) + article_refs (10)
 *   + political_framing (10).
 * Used to sort levers by confidence and flag weak evidence.
 *
 * @param {Object} lever - A savings lever object (may or may not have evidence)
 * @returns {number} Score 0-100
 */
export function evidenceChainStrength(lever) {
  if (!lever) return 0
  const ev = lever.evidence
  if (!ev) return 0

  let score = 0

  // Data points - has at least 2 specific facts? (max 15)
  if (Array.isArray(ev.data_points) && ev.data_points.length >= 2) score += 15
  else if (Array.isArray(ev.data_points) && ev.data_points.length === 1) score += 8

  // Benchmark - has comparable reference? (max 15)
  if (ev.benchmark && ev.benchmark.length > 10) score += 15

  // Calculation - has arithmetic showing how the number was derived? (max 20)
  if (ev.calculation && ev.calculation.length > 10) score += 20

  // KPI link - connects to inspection/performance metric? (max 15)
  if (ev.kpi_link && ev.kpi_link.length > 10) score += 15

  // Implementation steps - has actionable plan? (max 15)
  if (Array.isArray(ev.implementation_steps) && ev.implementation_steps.length >= 3) score += 15
  else if (Array.isArray(ev.implementation_steps) && ev.implementation_steps.length >= 1) score += 8

  // Article references - has published evidence? (max 10)
  if (Array.isArray(ev.article_refs) && ev.article_refs.length >= 2) score += 10
  else if (Array.isArray(ev.article_refs) && ev.article_refs.length === 1) score += 5

  // Political framing - has Reform messaging? (max 10)
  if (ev.political_framing && ev.political_framing.length > 20) score += 10

  return score
}

/**
 * Extract and unify performance metrics from a directorate's data, grouping
 * by improving/stable/declining. Each metric carries its savings_link.
 *
 * @param {Object} directorate - Directorate from directorates[]
 * @param {Array} portfolios - All portfolios
 * @returns {{ metrics: Array, improving: Array, stable: Array, declining: Array, kpi_headline: string|null }}
 */
export function directorateKPITracker(directorate, portfolios) {
  if (!directorate) return { metrics: [], improving: [], stable: [], declining: [], kpi_headline: null }

  // Directorate-level performance metrics
  const metrics = (directorate.performance_metrics || []).map(m => ({
    ...m,
    source: 'directorate',
  }))

  // Also extract operational context KPIs from constituent portfolios
  const dirPortfolios = (portfolios || []).filter(p =>
    (directorate.portfolio_ids || []).includes(p.id)
  )
  for (const p of dirPortfolios) {
    const ctx = p.operational_context || {}
    // CQC rating
    if (ctx.cqc_rating) {
      metrics.push({
        name: `CQC Rating (${p.short_title || p.title})`,
        value: ctx.cqc_rating,
        date: ctx.cqc_date,
        source: p.id,
        type: 'inspection',
      })
    }
    // Ofsted rating
    if (ctx.ofsted_rating) {
      metrics.push({
        name: `Ofsted Rating (${p.short_title || p.title})`,
        value: ctx.ofsted_rating,
        date: ctx.ofsted_date,
        source: p.id,
        type: 'inspection',
      })
    }
    // SEND inspection
    if (ctx.send_inspection?.rating) {
      metrics.push({
        name: 'SEND Inspection',
        value: ctx.send_inspection.rating,
        date: ctx.send_inspection.date,
        source: p.id,
        type: 'inspection',
      })
    }
    // DfT rating
    if (ctx.dft_rating) {
      metrics.push({
        name: 'DfT Highway Maintenance Rating',
        value: ctx.dft_rating,
        source: p.id,
        type: 'inspection',
      })
    }
  }

  // Classify by trend
  const improving = metrics.filter(m =>
    m.trend === 'improving' || m.trend === 'near_complete'
  )
  const declining = metrics.filter(m =>
    m.trend === 'declining' || m.trend === 'worsening' || m.trend === 'rapidly_worsening' ||
    m.trend === 'exponential' || m.trend === 'critical_failure' || m.trend === 'rising_20pct_pa'
  )
  const stable = metrics.filter(m =>
    !improving.includes(m) && !declining.includes(m)
  )

  return {
    metrics,
    improving,
    stable,
    declining,
    kpi_headline: directorate.kpi_headline || null,
  }
}

/**
 * Benchmark a directorate against GOV.UK peer data at the directorate level,
 * wrapping existing portfolioBenchmark for each constituent portfolio.
 *
 * @param {Object} directorate - Directorate from directorates[]
 * @param {Array} portfolios - All portfolios
 * @param {Object} budgetsGovuk - GOV.UK budget data
 * @returns {Object|null} Directorate benchmark results
 */
export function benchmarkDirectorate(directorate, portfolios, budgetsGovuk) {
  if (!directorate) return null

  const dirPortfolios = (portfolios || []).filter(p =>
    (directorate.portfolio_ids || []).includes(p.id)
  )

  const benchmarks = dirPortfolios
    .map(p => {
      const bm = portfolioBenchmark(p, budgetsGovuk)
      return bm ? { portfolio_id: p.id, title: p.short_title || p.title, ...bm } : null
    })
    .filter(Boolean)

  // Summarise: what % above/below peer average across all categories
  let totalSpend = 0
  let totalPeerAvg = 0
  for (const bm of benchmarks) {
    for (const cat of (bm.categories || [])) {
      if (cat.council_spend && cat.peer_avg) {
        totalSpend += cat.council_spend
        totalPeerAvg += cat.peer_avg
      }
    }
  }

  const summary = totalPeerAvg > 0 ? {
    total_spend: totalSpend,
    total_peer_avg: totalPeerAvg,
    vs_peer_pct: Math.round((totalSpend / totalPeerAvg - 1) * 100),
    above_peer: totalSpend > totalPeerAvg,
  } : null

  return {
    directorate_id: directorate.id,
    title: directorate.title,
    portfolio_benchmarks: benchmarks,
    summary,
  }
}

/**
 * Comprehensive risk profile for a directorate: wraps portfolioRiskDashboard
 * and adds inspection risk, DSG deficit risk, and savings delivery risk.
 *
 * @param {Object} directorate - Directorate from directorates[]
 * @param {Array} portfolios - All portfolios
 * @param {Array} spending - All spending records
 * @param {Object} options - { findings, integrity, budgets }
 * @returns {Object|null} Risk dashboard
 */
export function directorateRiskProfile(directorate, portfolios, spending, options = {}) {
  if (!directorate) return null

  const dirPortfolios = (portfolios || []).filter(p =>
    (directorate.portfolio_ids || []).includes(p.id)
  )

  // Portfolio-level risk dashboards
  const portfolioRisks = dirPortfolios
    .map(p => {
      const pSpending = matchSpendingToPortfolio(spending || [], p)
      return portfolioRiskDashboard(p, pSpending, options)
    })
    .filter(Boolean)

  // Aggregate risk score
  let maxRisk = 0
  const allRisks = []
  for (const pr of portfolioRisks) {
    if (pr.risk_score > maxRisk) maxRisk = pr.risk_score
    allRisks.push(...pr.risks.map(r => ({ ...r, portfolio_id: pr.portfolio_id })))
  }

  // Inspection risk
  for (const p of dirPortfolios) {
    const ctx = p.operational_context || {}
    if (ctx.cqc_rating === 'Requires Improvement' || ctx.cqc_rating === 'Inadequate') {
      allRisks.push({ type: 'inspection', severity: 'high', detail: `CQC: ${ctx.cqc_rating}`, portfolio_id: p.id })
      maxRisk = Math.min(100, maxRisk + 20)
    }
    if (ctx.send_inspection?.improvement_notice) {
      allRisks.push({ type: 'inspection', severity: 'high', detail: 'DfE SEND Improvement Notice', portfolio_id: p.id })
      maxRisk = Math.min(100, maxRisk + 20)
    }
    if (ctx.ofsted_rating === 'Inadequate' || ctx.ofsted_rating === 'Requires Improvement') {
      allRisks.push({ type: 'inspection', severity: 'high', detail: `Ofsted: ${ctx.ofsted_rating}`, portfolio_id: p.id })
      maxRisk = Math.min(100, maxRisk + 15)
    }
  }

  // DSG deficit risk (Resources/Digital directorate)
  for (const p of dirPortfolios) {
    if (p.known_pressures?.some(pr => typeof pr === 'string' && pr.includes('DSG deficit'))) {
      allRisks.push({ type: 'fiscal', severity: 'critical', detail: 'DSG deficit trajectory: statutory override ends Mar 2028', portfolio_id: p.id })
      maxRisk = Math.min(100, maxRisk + 25)
    }
  }

  // Savings delivery risk (prior year shortfall)
  if (directorate.prior_year_target && directorate.prior_year_achieved != null) {
    const deliveryPct = Math.round(directorate.prior_year_achieved / directorate.prior_year_target * 100)
    if (deliveryPct < 50) {
      allRisks.push({ type: 'delivery', severity: 'critical', detail: `Prior year savings: ${deliveryPct}% delivered` })
      maxRisk = Math.min(100, maxRisk + 25)
    } else if (deliveryPct < 75) {
      allRisks.push({ type: 'delivery', severity: 'high', detail: `Prior year savings: ${deliveryPct}% delivered` })
      maxRisk = Math.min(100, maxRisk + 15)
    }
  }

  const riskScore = Math.min(100, maxRisk)
  const riskLevel = riskScore >= 60 ? 'critical' : riskScore >= 40 ? 'high' : riskScore >= 20 ? 'medium' : 'low'
  const riskColor = riskLevel === 'critical' ? '#dc3545' : riskLevel === 'high' ? '#fd7e14' : riskLevel === 'medium' ? '#ffc107' : '#28a745'

  return {
    directorate_id: directorate.id,
    title: directorate.title,
    risk_score: riskScore,
    risk_level: riskLevel,
    risk_color: riskColor,
    risks: allRisks,
    portfolio_risks: portfolioRisks,
  }
}
