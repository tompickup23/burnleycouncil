/**
 * @module savings/governance
 * FOI generation, cross-portfolio dependencies, portfolio risk dashboard.
 */

import { giniCoefficient, integrityWeightedHHI, benfordSecondDigit } from '../analytics.js'

/**
 * Auto-generate FOI request from a directive.
 *
 * @param {Object} directive - A directive
 * @param {Object} portfolio - Portfolio
 * @returns {Object|null} FOI template
 */
export function generatePortfolioFOI(directive, portfolio) {
  if (!directive || !portfolio) return null

  const foiTypes = {
    duplicate_recovery: {
      subject: `Duplicate payment recovery: ${portfolio.title}`,
      body: `Under the Freedom of Information Act 2000, I request:\n\n1. All duplicate payment recoveries processed by ${portfolio.title} in the last 24 months\n2. The total value of duplicate payments identified\n3. The total value successfully recovered\n4. The process for identifying and recovering duplicate payments\n5. Any internal audit reports relating to duplicate payments in this area`,
    },
    split_payment: {
      subject: `Payment splitting investigation: ${portfolio.title}`,
      body: `Under the Freedom of Information Act 2000, I request:\n\n1. All instances where multiple payments to the same supplier in the same month totalled above the procurement threshold\n2. The procurement method used for each contract/payment\n3. Whether any payments were referred to the procurement team for threshold review\n4. The total number of waivers of Contract Procedure Rules granted in the last 24 months`,
    },
    savings_lever: {
      subject: `Savings delivery: ${portfolio.title}`,
      body: `Under the Freedom of Information Act 2000, I request:\n\n1. All savings targets set for ${portfolio.title} in the current financial year\n2. Progress against each target (delivered / on track / at risk / missed)\n3. Any external consultancy spend relating to savings programmes\n4. Benchmarking data used to set efficiency targets`,
    },
    concentration: {
      subject: `Supplier concentration: ${portfolio.title}`,
      body: `Under the Freedom of Information Act 2000, I request:\n\n1. The top 10 suppliers by value for ${portfolio.title}\n2. Contract start and end dates for each\n3. Whether competitive tendering was used for each\n4. Any single-source procurement waivers granted in the last 24 months`,
    },
  }

  const template = foiTypes[directive.type] || {
    subject: `${directive.action}: ${portfolio.title}`,
    body: `Under the Freedom of Information Act 2000, I request information relating to: ${directive.action}`,
  }

  return {
    ...template,
    directive_id: directive.id,
    portfolio_id: portfolio.id,
    generated_date: new Date().toISOString().slice(0, 10),
  }
}

/**
 * Identify cross-portfolio savings dependencies.
 * Reads from cross_portfolio_dependencies in portfolio data first,
 * falls back to known local government patterns.
 *
 * @param {Array} portfolios - All portfolios
 * @returns {Array} Dependency links
 */
export function crossPortfolioDependencies(portfolios) {
  if (!portfolios?.length) return []

  const ids = new Set(portfolios.map(p => p.id))
  const seen = new Set()
  const dependencies = []

  // 1. Read from portfolio data (enriched in cabinet_portfolios.json)
  for (const p of portfolios) {
    for (const dep of (p.cross_portfolio_dependencies || [])) {
      const key = `${p.id}->${dep.portfolio || dep.to}`
      if (seen.has(key)) continue
      seen.add(key)
      dependencies.push({
        from: p.id,
        to: dep.portfolio || dep.to,
        type: dep.type || 'dependency',
        description: dep.description || dep.detail,
        roi_timeline: dep.roi_timeline || dep.timeline,
      })
    }
  }

  // 2. Add known structural dependencies not already covered
  const fallbacks = [
    { from: 'health_wellbeing', to: 'adult_social_care', type: 'prevention', description: 'Public health prevention programmes reduce Adult Social Care demand. £1 in falls prevention = £3.50 saved in hospital admissions and social care packages.', roi_timeline: '12-24 months' },
    { from: 'children_families', to: 'education_skills', type: 'early_intervention', description: 'Early intervention in children\'s services reduces SEND demand and exclusions. Family support reduces EHC plan escalation.', roi_timeline: '2-5 years' },
    { from: 'highways_transport', to: 'economic_development', type: 'infrastructure', description: 'Transport connectivity enables economic growth. Road condition affects business investment decisions.', roi_timeline: '3-10 years' },
    { from: 'data_technology', to: 'resources', type: 'digital_transformation', description: 'Digital services reduce property footprint needs and back-office processing costs.', roi_timeline: '12-18 months' },
  ]
  for (const fb of fallbacks) {
    const key = `${fb.from}->${fb.to}`
    if (!seen.has(key) && ids.has(fb.from) && ids.has(fb.to)) {
      dependencies.push(fb)
    }
  }

  return dependencies.filter(d => ids.has(d.from) && ids.has(d.to))
}

/**
 * Composite risk dashboard for a single portfolio: rolls up supplier concentration,
 * integrity amplification, DOGE findings, and Benford screening into a 0-100 score.
 *
 * @param {Object} portfolio - Portfolio definition
 * @param {Array} spending - Portfolio-matched spending records
 * @param {Object} options - { integrity, findings, mapFindingsToPortfolio, supplierPortfolioAnalysis }
 * @returns {Object|null} Risk dashboard
 */
export function portfolioRiskDashboard(portfolio, spending, options = {}) {
  if (!portfolio) return null

  const risks = []
  let totalScore = 0

  // 1. Supplier concentration risk (existing + integrity-weighted)
  // Use provided supplierPortfolioAnalysis function, or compute inline
  const _supplierPortfolioAnalysis = options.supplierPortfolioAnalysis || _defaultSupplierAnalysis
  const supplierAnalysis = _supplierPortfolioAnalysis(spending, { integrity: options.integrity })

  if (supplierAnalysis.hhi > 2500) {
    risks.push({ type: 'concentration', severity: 'high', detail: `HHI ${supplierAnalysis.hhi} (highly concentrated)` })
    totalScore += 30
  } else if (supplierAnalysis.hhi > 1500) {
    risks.push({ type: 'concentration', severity: 'medium', detail: `HHI ${supplierAnalysis.hhi} (moderately concentrated)` })
    totalScore += 15
  }

  // 2. Integrity amplification
  if (supplierAnalysis.integrity_hhi?.isCouncillorConnected) {
    risks.push({ type: 'integrity', severity: 'high', detail: `${supplierAnalysis.integrity_hhi.connectedSuppliers} councillor-connected supplier(s)` })
    totalScore += 25
  }

  // 3. DOGE findings risk
  if (options.findings) {
    const _mapFindings = options.mapFindingsToPortfolio || _defaultMapFindings
    const pFindings = _mapFindings(options.findings, portfolio)
    const findingCount = (pFindings.duplicates?.length || 0) + (pFindings.splits?.length || 0) + (pFindings.ch_flags?.length || 0)
    if (findingCount > 10) {
      risks.push({ type: 'doge', severity: 'high', detail: `${findingCount} DOGE findings` })
      totalScore += 20
    } else if (findingCount > 3) {
      risks.push({ type: 'doge', severity: 'medium', detail: `${findingCount} DOGE findings` })
      totalScore += 10
    }
  }

  // 4. Benford screening on spending amounts
  const amounts = (spending || []).map(r => r.amount).filter(a => a != null && a > 0)
  const benford = amounts.length >= 50 ? benfordSecondDigit(amounts) : null
  if (benford?.significant) {
    risks.push({ type: 'benford', severity: 'medium', detail: benford.pDescription || 'Significant deviation from expected distribution' })
    totalScore += 15
  }

  const riskScore = Math.min(100, totalScore)
  const riskLevel = riskScore >= 50 ? 'high' : riskScore >= 25 ? 'medium' : 'low'
  const riskColor = riskLevel === 'high' ? '#dc3545' : riskLevel === 'medium' ? '#fd7e14' : '#28a745'

  return {
    portfolio_id: portfolio.id,
    risk_score: riskScore,
    risk_level: riskLevel,
    risk_color: riskColor,
    risks,
    supplier_analysis: supplierAnalysis,
    benford_result: benford,
  }
}

// ─── Private fallback helpers (used when not injected via options) ────

function _defaultSupplierAnalysis(spending, options = {}) {
  if (!spending?.length) return { suppliers: [], gini: 0, hhi: 0, total: 0 }
  const supplierMap = {}
  for (const r of spending) {
    const name = r.supplier || r.supplier_canonical || 'Unknown'
    if (!supplierMap[name]) supplierMap[name] = { name, total: 0, count: 0 }
    supplierMap[name].total += r.amount ?? 0
    supplierMap[name].count++
  }
  const suppliers = Object.values(supplierMap).sort((a, b) => b.total - a.total)
  const amounts = suppliers.map(s => s.total)
  const total = amounts.reduce((s, v) => s + v, 0)
  const gini = giniCoefficient(amounts)
  let hhi = 0
  for (const s of suppliers) {
    const share = (s.total / total) * 100
    hhi += share * share
  }
  const intHHI = options.integrity
    ? integrityWeightedHHI(suppliers.map(s => ({ name: s.name, amount: s.total })), options.integrity)
    : null
  return {
    suppliers: suppliers.slice(0, 25),
    total_suppliers: suppliers.length,
    total_spend: total,
    gini: Math.round(gini * 1000) / 1000,
    hhi: Math.round(hhi),
    top_5_share: suppliers.slice(0, 5).reduce((s, v) => s + v.total, 0) / total,
    integrity_hhi: intHHI,
  }
}

function _defaultMapFindings(findings, portfolio) {
  if (!findings || !portfolio) return { duplicates: [], splits: [], round_numbers: [], ch_flags: [], weak_competition: [] }
  const patterns = (portfolio.spending_department_patterns || []).map(p => new RegExp(p, 'i'))
  const matchDept = (dept) => patterns.some(p => p.test(dept || ''))
  const filterByDept = (items) => {
    if (!Array.isArray(items)) return []
    return items.filter(item => matchDept(item.department || item.service_division || item.service_area || ''))
  }
  return {
    duplicates: filterByDept(findings.likely_duplicates?.examples || findings.likely_duplicates || []),
    splits: filterByDept(findings.split_payments?.examples || findings.split_payments || []),
    round_numbers: filterByDept(findings.round_numbers?.examples || findings.round_numbers || []),
    ch_flags: filterByDept(findings.ch_red_flags?.examples || findings.ch_red_flags || []),
    weak_competition: filterByDept(findings.weak_competition?.examples || findings.weak_competition || []),
  }
}
