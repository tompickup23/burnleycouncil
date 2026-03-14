/**
 * Savings Engine — prescriptive directives for Reform operations.
 *
 * Pure functions that power the Cabinet Command tier. No React dependencies.
 * Reuses analytics.js (deflate, giniCoefficient, peerBenchmark, computeDistributionStats),
 * and connects portfolio data to spending, DOGE findings, meetings, and governance.
 *
 * Architecture: cabinet_portfolios.json is the spine. Every function takes
 * portfolio data + operational data → actionable intelligence.
 */

import { deflate, giniCoefficient, peerBenchmark, computeDistributionStats } from './analytics.js'

// ═══════════════════════════════════════════════════════════════════════
// Finding → Portfolio Mapping
// ═══════════════════════════════════════════════════════════════════════

/**
 * Match spending records to a portfolio using spending_department_patterns.
 *
 * @param {Array} records - Spending records with department/service_division fields
 * @param {Object} portfolio - Portfolio from cabinet_portfolios.json
 * @returns {Array} Matched spending records
 */
export function matchSpendingToPortfolio(records, portfolio) {
  if (!records || !portfolio?.spending_department_patterns?.length) return []
  const patterns = portfolio.spending_department_patterns.map(p => new RegExp(p, 'i'))
  return records.filter(r => {
    const dept = r.department || r.service_division || r.service_area || ''
    return patterns.some(p => p.test(dept))
  })
}

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
 * Aggregate savings across all portfolios.
 *
 * @param {Array} portfolios - All portfolios from cabinet_portfolios.json
 * @param {Object} findings - doge_findings.json data
 * @returns {Object} Cross-portfolio savings totals
 */
export function aggregateSavings(portfolios, findings) {
  if (!portfolios?.length) return { total_identified: 0, by_portfolio: [], by_timeline: {} }

  const byPortfolio = portfolios.map(p => {
    const pFindings = mapFindingsToPortfolio(findings, p)
    const duplicateValue = pFindings.duplicates.reduce((sum, d) => sum + (d.total_value || d.amount || 0), 0)
    const splitValue = pFindings.splits.reduce((sum, s) => sum + (s.total_value || s.amount || 0), 0)

    // Sum savings levers
    const leverTotal = (p.savings_levers || []).reduce((sum, l) => {
      const match = (l.est_saving || '').match(/£([\d.]+)/)
      return sum + (match ? parseFloat(match[1]) * 1000000 : 0)
    }, 0)

    return {
      portfolio_id: p.id,
      title: p.short_title || p.title,
      duplicate_savings: duplicateValue,
      split_savings: splitValue,
      lever_savings: leverTotal,
      finding_count: pFindings.duplicates.length + pFindings.splits.length + pFindings.round_numbers.length,
    }
  })

  const total = byPortfolio.reduce((sum, p) => sum + p.duplicate_savings + p.lever_savings, 0)

  // Timeline breakdown from savings levers
  const byTimeline = { immediate: 0, short_term: 0, medium_term: 0, long_term: 0 }
  for (const p of portfolios) {
    for (const lever of (p.savings_levers || [])) {
      const match = (lever.est_saving || '').match(/£([\d.]+)/)
      const amount = match ? parseFloat(match[1]) * 1000000 : 0
      const tl = (lever.timeline || '').toLowerCase()
      if (tl.includes('immediate') || tl.includes('0-3')) byTimeline.immediate += amount
      else if (tl.includes('3-6') || tl.includes('6-12') || tl.includes('short')) byTimeline.short_term += amount
      else if (tl.includes('12-18') || tl.includes('12-24') || tl.includes('medium')) byTimeline.medium_term += amount
      else byTimeline.long_term += amount
    }
  }

  return { total_identified: total, by_portfolio: byPortfolio, by_timeline: byTimeline }
}


// ═══════════════════════════════════════════════════════════════════════
// Prescriptive Directives
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate prescriptive ACTION DIRECTIVES for a portfolio.
 *
 * Each directive is a specific, actionable instruction:
 * DO: [what], SAVE: [how much], BY WHEN: [timeline], LEGAL: [basis],
 * RISK: [assessment], HOW: [steps], ROUTE: [governance], EVIDENCE: [data]
 *
 * @param {Object} portfolio - Portfolio from cabinet_portfolios.json
 * @param {Object} findings - doge_findings.json
 * @param {Array} spending - Matched spending records
 * @param {Object} options - { budgets, procurement, integrity }
 * @returns {Array} Directive objects
 */
export function generateDirectives(portfolio, findings, spending, options = {}) {
  if (!portfolio) return []
  const directives = []

  // 1. Directives from DOGE findings
  const pFindings = mapFindingsToPortfolio(findings, portfolio)

  // Duplicate recovery directives
  if (pFindings.duplicates.length > 0) {
    const totalDuplicates = pFindings.duplicates.reduce((s, d) => s + (d.total_value || d.amount || 0), 0)
    if (totalDuplicates > 10000) {
      directives.push({
        id: `${portfolio.id}_dup_recovery`,
        type: 'duplicate_recovery',
        action: `Recover ${formatCurrency(totalDuplicates)} in likely duplicate payments`,
        save_low: totalDuplicates * 0.6,
        save_high: totalDuplicates * 1.0,
        save_central: totalDuplicates * 0.8,
        timeline: 'Immediate (0-3 months)',
        legal_basis: 'Financial Procedure Rules — internal recovery, no external constraint',
        risk: 'Low',
        risk_detail: 'Internal financial management — no service impact, no political risk',
        steps: [
          'Pull transaction report for flagged duplicates',
          'Cross-reference invoice numbers and dates',
          'Issue recovery notices to suppliers',
          'Escalate unrecovered amounts to S151 Officer',
        ],
        governance_route: 'officer_delegation',
        evidence: `${pFindings.duplicates.length} likely duplicate groups identified`,
        portfolio_id: portfolio.id,
        officer: portfolio.executive_director,
        priority: 'high',
        feasibility: 9,
        impact: Math.min(10, Math.ceil(totalDuplicates / 500000)),
      })
    }
  }

  // Split payment investigation
  if (pFindings.splits.length > 0) {
    const totalSplits = pFindings.splits.reduce((s, d) => s + (d.total_value || d.amount || 0), 0)
    if (totalSplits > 50000) {
      directives.push({
        id: `${portfolio.id}_split_investigation`,
        type: 'split_payment',
        action: `Investigate ${formatCurrency(totalSplits)} in suspected split payments`,
        save_low: totalSplits * 0.1,
        save_high: totalSplits * 0.3,
        save_central: totalSplits * 0.2,
        timeline: 'Short-term (3-6 months)',
        legal_basis: 'Contract Procedure Rules — threshold avoidance prohibited',
        risk: 'Medium',
        risk_detail: 'May reveal procurement non-compliance. Could implicate officers. Handle via audit.',
        steps: [
          'Extract all transactions to same supplier below procurement threshold',
          'Identify patterns suggesting deliberate splitting',
          'Refer confirmed cases to Head of Procurement',
          'Report findings to Audit Committee',
        ],
        governance_route: 'officer_delegation',
        evidence: `${pFindings.splits.length} suspected split payment instances`,
        portfolio_id: portfolio.id,
        officer: portfolio.executive_director,
        priority: 'medium',
        feasibility: 7,
        impact: Math.min(10, Math.ceil(totalSplits / 2000000)),
      })
    }
  }

  // CH compliance directives
  if (pFindings.ch_flags.length > 0) {
    directives.push({
      id: `${portfolio.id}_ch_compliance`,
      type: 'compliance',
      action: `Review ${pFindings.ch_flags.length} suppliers with Companies House red flags`,
      save_low: 0,
      save_high: 0,
      save_central: 0,
      timeline: 'Immediate (0-3 months)',
      legal_basis: 'Public Contracts Regulations 2015 — exclusion grounds for dissolved/insolvent companies',
      risk: 'Low',
      risk_detail: 'Regulatory compliance — failure to act is greater risk',
      steps: [
        'Check current CH status of each flagged supplier',
        'Review active contracts with dissolved/dormant companies',
        'Issue termination notices where appropriate',
        'Ensure procurement team checks CH status before new awards',
      ],
      governance_route: 'officer_delegation',
      evidence: `${pFindings.ch_flags.length} suppliers with CH compliance issues`,
      portfolio_id: portfolio.id,
      officer: portfolio.executive_director,
      priority: 'high',
      feasibility: 9,
      impact: 3,
    })
  }

  // 2. Directives from savings levers in portfolio data
  for (const lever of (portfolio.savings_levers || [])) {
    const match = (lever.est_saving || '').match(/£([\d.]+)(?:-([\d.]+))?M?/)
    let saveLow = 0, saveHigh = 0
    if (match) {
      saveLow = parseFloat(match[1]) * 1000000
      saveHigh = match[2] ? parseFloat(match[2]) * 1000000 : saveLow * 1.2
    }

    directives.push({
      id: `${portfolio.id}_lever_${lever.lever?.toLowerCase().replace(/\s+/g, '_')}`,
      type: 'savings_lever',
      action: lever.lever || lever.description,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: (saveLow + saveHigh) / 2,
      timeline: lever.timeline || 'Medium-term',
      legal_basis: lever.legal_constraints || 'No specific legal constraint identified',
      risk: lever.risk || 'Medium',
      risk_detail: lever.description || '',
      steps: lever.steps || [lever.description],
      governance_route: saveHigh > 500000 ? 'cabinet' : 'officer_delegation',
      evidence: lever.description,
      portfolio_id: portfolio.id,
      officer: portfolio.executive_director,
      priority: lever.risk === 'Low' ? 'high' : lever.risk === 'High' ? 'low' : 'medium',
      feasibility: lever.risk === 'Low' ? 8 : lever.risk === 'High' ? 4 : 6,
      impact: Math.min(10, Math.ceil((saveLow + saveHigh) / 2 / 1000000)),
    })
  }

  // 3. Supplier concentration directives (from spending data)
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
        action: `Reduce supplier concentration (Gini ${(gini * 100).toFixed(0)}%) — top supplier ${topSupplier[0]} has ${formatCurrency(topSupplier[1])}`,
        save_low: topSupplier[1] * 0.05,
        save_high: topSupplier[1] * 0.15,
        save_central: topSupplier[1] * 0.1,
        timeline: 'Medium-term (12-24 months)',
        legal_basis: 'Best Value duty (LGA 1999) — requirement to secure continuous improvement',
        risk: 'Medium',
        risk_detail: 'Changing major suppliers requires careful transition. May face supplier pushback or service disruption.',
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

  // Sort: high priority + high feasibility first
  const priorityOrder = { high: 3, medium: 2, low: 1 }
  directives.sort((a, b) => {
    const pDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0)
    if (pDiff !== 0) return pDiff
    return (b.feasibility * b.impact) - (a.feasibility * a.impact)
  })

  return directives
}


// ═══════════════════════════════════════════════════════════════════════
// Reform Playbook
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a phased Reform Playbook for a portfolio.
 *
 * @param {Object} portfolio - Portfolio from cabinet_portfolios.json
 * @param {Array} directives - Output from generateDirectives()
 * @returns {Object} Playbook with phases, red lines, targets
 */
export function generateReformPlaybook(portfolio, directives) {
  if (!portfolio) return null

  // Phase directives by timeline
  const year1 = directives.filter(d => {
    const tl = (d.timeline || '').toLowerCase()
    return tl.includes('immediate') || tl.includes('0-3') || tl.includes('3-6') || tl.includes('short')
  })
  const year2 = directives.filter(d => {
    const tl = (d.timeline || '').toLowerCase()
    return tl.includes('6-12') || tl.includes('12-18') || tl.includes('medium')
  })
  const year3 = directives.filter(d => {
    const tl = (d.timeline || '').toLowerCase()
    return tl.includes('18-') || tl.includes('24-') || tl.includes('long') || tl.includes('structural')
  })

  // Uncategorized go to year 2
  const categorized = new Set([...year1, ...year2, ...year3].map(d => d.id))
  for (const d of directives) {
    if (!categorized.has(d.id)) year2.push(d)
  }

  const sumSavings = (items) => items.reduce((s, d) => s + (d.save_central || 0), 0)

  // Red lines — statutory duties rated 'red'
  const redLines = (portfolio.statutory_duties || [])
    .filter(d => d.risk_level === 'red')
    .map(d => ({ act: d.act, summary: d.summary, risk: d.risk }))

  // Amber zones — statutory duties rated 'amber'
  const amberZones = (portfolio.statutory_duties || [])
    .filter(d => d.risk_level === 'amber')
    .map(d => ({ act: d.act, summary: d.summary, risk: d.risk }))

  // Green space — statutory duties rated 'green'
  const greenSpace = (portfolio.statutory_duties || [])
    .filter(d => d.risk_level === 'green')
    .map(d => ({ act: d.act, summary: d.summary, risk: d.risk }))

  return {
    portfolio_id: portfolio.id,
    portfolio_title: portfolio.title,
    cabinet_member: portfolio.cabinet_member?.name,
    phases: {
      year_1: { label: 'Quick Wins & Recovery', directives: year1, total_savings: sumSavings(year1) },
      year_2: { label: 'Procurement Reform & Restructure', directives: year2, total_savings: sumSavings(year2) },
      year_3: { label: 'Structural Transformation', directives: year3, total_savings: sumSavings(year3) },
    },
    total_savings: sumSavings(directives),
    directive_count: directives.length,
    red_lines: redLines,
    amber_zones: amberZones,
    green_space: greenSpace,
  }
}


// ═══════════════════════════════════════════════════════════════════════
// Decision Pathway Engine
// ═══════════════════════════════════════════════════════════════════════

/**
 * Determine governance route for a directive.
 *
 * Uses LCC constitution thresholds from cabinet_portfolios.json:
 * - Key Decision = £500K+ or affects 2+ wards
 * - Officer delegation thresholds: Director £250K, ED £500K, Chief Exec £1M
 *
 * @param {Object} directive - A directive from generateDirectives()
 * @param {Object} governance - Governance section from cabinet_portfolios.json
 * @returns {Object} Route, timeline, requirements
 */
export function decisionPathway(directive, governance) {
  if (!directive || !governance) return null

  const value = directive.save_central || 0
  const routes = governance.decision_routes || []
  const thresholds = governance.officer_thresholds || []
  const political = governance.political_arithmetic || {}

  // Determine route based on value and type
  let route, timelineDays, authority, requirements

  if (value < 250000 && directive.type !== 'compliance') {
    // Below officer delegation threshold
    route = 'officer_delegation'
    timelineDays = 5
    authority = 'Director'
    requirements = 'Report to next Cabinet for noting'
  } else if (value < 500000) {
    route = 'officer_delegation'
    timelineDays = 10
    authority = 'Executive Director'
    requirements = 'Key decision notice if affects 2+ wards'
  } else if (value < 1000000) {
    route = 'cabinet_member'
    timelineDays = 35
    authority = 'Cabinet Member individual decision'
    requirements = '28 days Forward Plan notice. Published decision. 5-day call-in period.'
  } else {
    route = 'cabinet'
    timelineDays = 42
    authority = 'Cabinet collective decision'
    requirements = '28 days Forward Plan notice. Published decision. 5-day call-in period. May need Full Council if policy framework change.'
  }

  // Budget changes over a certain threshold need Full Council
  if (directive.type === 'structural' && value > 5000000) {
    route = 'full_council'
    timelineDays = 56
    authority = 'Full Council'
    requirements = 'Budget/Policy Framework change. Cabinet recommendation → Full Council vote. Reform majority 53/84.'
  }

  // Political arithmetic
  const majoritySize = political.majority_size || 10
  const hasMajority = majoritySize > 0

  return {
    route,
    timeline_days: timelineDays,
    authority,
    requirements,
    political_arithmetic: hasMajority
      ? `Reform ${political.reform_seats || 53}/${political.total_seats || 84} — comfortable majority (${majoritySize} over threshold)`
      : 'No overall control — requires cross-party support',
    shortcuts: value < 500000 ? ['Officer delegation — no formal member decision needed'] : [],
    call_in_risk: route === 'cabinet' || route === 'cabinet_member'
      ? `5 non-executive signatures required for call-in. ${political.opposition_seats || 31} opposition members.`
      : 'N/A — not a member decision',
  }
}

/**
 * Build implementation calendar mapping directives to meeting schedule.
 *
 * @param {Array} directives - All directives
 * @param {Array} meetings - meetings.json data
 * @param {Object} governance - Governance section
 * @returns {Array} Calendar items sorted by date
 */
export function buildImplementationCalendar(directives, meetings, governance) {
  if (!directives?.length) return []

  // Find upcoming cabinet meetings
  const now = new Date()
  const cabinetMeetings = (meetings || [])
    .filter(m => {
      const title = (m.title || m.committee || '').toLowerCase()
      return title.includes('cabinet') && !title.includes('scrutiny')
    })
    .filter(m => new Date(m.date || m.start_date) >= now)
    .sort((a, b) => new Date(a.date || a.start_date) - new Date(b.date || b.start_date))

  const calendar = []

  for (const d of directives) {
    const pathway = decisionPathway(d, governance)
    if (!pathway) continue

    // Find best meeting slot
    let targetMeeting = null
    if (pathway.route === 'cabinet' || pathway.route === 'cabinet_member') {
      // Need 28 days Forward Plan notice
      const forwardPlanDeadline = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000)
      targetMeeting = cabinetMeetings.find(m => new Date(m.date || m.start_date) >= forwardPlanDeadline)
    }

    calendar.push({
      directive_id: d.id,
      action: d.action,
      route: pathway.route,
      timeline_days: pathway.timeline_days,
      target_date: targetMeeting
        ? new Date(targetMeeting.date || targetMeeting.start_date).toISOString().slice(0, 10)
        : new Date(now.getTime() + pathway.timeline_days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      meeting: targetMeeting?.title || null,
      authority: pathway.authority,
      portfolio_id: d.portfolio_id,
      save_central: d.save_central,
    })
  }

  calendar.sort((a, b) => a.target_date.localeCompare(b.target_date))
  return calendar
}


// ═══════════════════════════════════════════════════════════════════════
// Supplier & Procurement Intelligence
// ═══════════════════════════════════════════════════════════════════════

/**
 * Analyse suppliers within a portfolio context.
 *
 * @param {Array} spending - Portfolio-matched spending records
 * @param {Object} options - { integrity, procurement }
 * @returns {Object} Supplier analysis
 */
export function supplierPortfolioAnalysis(spending, options = {}) {
  if (!spending?.length) return { suppliers: [], gini: 0, hhi: 0, total: 0 }

  const supplierMap = {}
  for (const r of spending) {
    const name = r.supplier || r.supplier_canonical || 'Unknown'
    if (!supplierMap[name]) supplierMap[name] = { name, total: 0, count: 0, months: new Set() }
    supplierMap[name].total += r.amount || 0
    supplierMap[name].count++
    if (r.date) supplierMap[name].months.add(r.date.substring(0, 7))
  }

  const suppliers = Object.values(supplierMap)
    .map(s => ({ ...s, months: s.months.size }))
    .sort((a, b) => b.total - a.total)

  const amounts = suppliers.map(s => s.total)
  const total = amounts.reduce((s, v) => s + v, 0)
  const gini = giniCoefficient(amounts)

  // HHI
  let hhi = 0
  for (const s of suppliers) {
    const share = (s.total / total) * 100
    hhi += share * share
  }

  return {
    suppliers: suppliers.slice(0, 25),
    total_suppliers: suppliers.length,
    total_spend: total,
    gini: Math.round(gini * 1000) / 1000,
    hhi: Math.round(hhi),
    top_5_share: suppliers.slice(0, 5).reduce((s, v) => s + v.total, 0) / total,
  }
}

/**
 * Analyse contract expiry pipeline (from procurement data).
 *
 * @param {Array} contracts - procurement.json data
 * @param {Object} portfolio - Portfolio for filtering
 * @returns {Object} Contract pipeline analysis
 */
export function contractPipeline(contracts, portfolio) {
  if (!contracts?.length || !portfolio) return { expiring_3m: [], expiring_6m: [], expiring_12m: [], total_value: 0 }

  const now = new Date()
  const m3 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
  const m6 = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000)
  const m12 = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)

  // Filter contracts relevant to portfolio (simple keyword match on title/description)
  const keywords = (portfolio.key_services || []).map(s => s.toLowerCase().split(' ')).flat()
  const isRelevant = (contract) => {
    const text = `${contract.title || ''} ${contract.description || ''}`.toLowerCase()
    return keywords.some(k => k.length > 3 && text.includes(k))
  }

  const relevant = contracts.filter(isRelevant)

  const categorize = (items) => items.map(c => ({
    title: c.title,
    supplier: c.supplier || c.awarded_to,
    value: c.value || c.contract_value,
    end_date: c.end_date,
  }))

  const expiring3m = relevant.filter(c => c.end_date && new Date(c.end_date) <= m3 && new Date(c.end_date) >= now)
  const expiring6m = relevant.filter(c => c.end_date && new Date(c.end_date) <= m6 && new Date(c.end_date) > m3)
  const expiring12m = relevant.filter(c => c.end_date && new Date(c.end_date) <= m12 && new Date(c.end_date) > m6)

  return {
    expiring_3m: categorize(expiring3m),
    expiring_6m: categorize(expiring6m),
    expiring_12m: categorize(expiring12m),
    total_value: relevant.reduce((s, c) => s + (c.value || c.contract_value || 0), 0),
    total_contracts: relevant.length,
  }
}


// ═══════════════════════════════════════════════════════════════════════
// Meeting & Decision Pipeline
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get upcoming decisions relevant to a portfolio.
 *
 * @param {Array} meetings - meetings.json
 * @param {Object} portfolio - Portfolio
 * @param {Array} documents - council_documents.json
 * @returns {Array} Upcoming decisions
 */
export function decisionPipeline(meetings, portfolio, documents) {
  if (!meetings?.length) return []

  const now = new Date()
  const scrutinyId = portfolio?.scrutiny_committee?.id || ''
  const scrutinyName = portfolio?.scrutiny_committee?.name || ''

  const upcoming = meetings
    .filter(m => new Date(m.date || m.start_date) >= now)
    .filter(m => {
      const title = (m.title || m.committee || '').toLowerCase()
      return title.includes('cabinet') || title.includes(scrutinyName.toLowerCase().split(' ')[0])
    })
    .sort((a, b) => new Date(a.date || a.start_date) - new Date(b.date || b.start_date))
    .slice(0, 10)

  return upcoming.map(m => ({
    meeting: m.title || m.committee,
    date: m.date || m.start_date,
    venue: m.venue,
    agenda_items: m.enriched_agenda || m.agenda_items || [],
    portfolio_relevant: true,
  }))
}

/**
 * Generate meeting briefing for a portfolio holder.
 *
 * @param {Object} meeting - Single meeting object
 * @param {Object} portfolio - Portfolio
 * @param {Object} data - { spending, findings, budgets }
 * @returns {Object} Briefing object
 */
export function meetingBriefing(meeting, portfolio, data = {}) {
  if (!meeting || !portfolio) return null

  const briefing = {
    meeting_title: meeting.title || meeting.committee,
    meeting_date: meeting.date || meeting.start_date,
    portfolio: portfolio.short_title || portfolio.title,
    cabinet_member: portfolio.cabinet_member?.name,
    data_points: [],
    opposition_questions: [],
    standing_order_notes: [],
  }

  // Data points to cite
  if (portfolio.budget_latest?.net_expenditure) {
    briefing.data_points.push(`Net budget: ${formatCurrency(portfolio.budget_latest.net_expenditure)}`)
  }
  if (portfolio.known_pressures?.length) {
    briefing.data_points.push(`Key pressures: ${portfolio.known_pressures.slice(0, 3).join('; ')}`)
  }

  // Likely opposition questions based on pressures and findings
  for (const pressure of (portfolio.known_pressures || []).slice(0, 3)) {
    briefing.opposition_questions.push({
      question: `What is the Cabinet Member doing about: ${pressure}?`,
      suggested_response: `Reform is addressing this through [specific action]. Unlike the previous administration, we are taking a data-driven approach with clear savings targets.`,
    })
  }

  return briefing
}


// ═══════════════════════════════════════════════════════════════════════
// Political Engine
// ═══════════════════════════════════════════════════════════════════════

/**
 * Assess political context for a portfolio's operations.
 *
 * @param {Object} portfolio - Portfolio
 * @param {Object} options - { elections, councillors, politicalHistory }
 * @returns {Object} Political context
 */
export function politicalContext(portfolio, options = {}) {
  if (!portfolio) return null

  const { elections, councillors, politicalHistory } = options

  return {
    portfolio_id: portfolio.id,
    cabinet_member: portfolio.cabinet_member?.name,
    ward: portfolio.cabinet_member?.ward,
    scrutiny_committee: portfolio.scrutiny_committee?.name,
    // Key political facts
    reform_majority: true,
    opposition_parties: ['Progressive Lancashire', 'Conservative', 'Labour', 'Lib Dem', 'OWL'],
    // LGR context
    lgr_impact: 'Portfolio will transfer to unitary successor(s). Current reform period is window of opportunity.',
    lgr_deadline: '2028-04',
    // Electoral timing
    next_elections: '2029-05',
    time_to_deliver: 'Approx 3 years before next county elections',
  }
}

/**
 * Assess political impact of a specific directive.
 *
 * @param {Object} directive - A directive
 * @param {Object} portfolio - Portfolio
 * @param {Object} options - { councillors, elections }
 * @returns {Object} Impact assessment
 */
export function politicalImpactAssessment(directive, portfolio, options = {}) {
  if (!directive || !portfolio) return null

  const riskLevel = directive.risk || 'Medium'
  const isServiceChange = directive.type === 'savings_lever' || directive.type === 'structural'

  return {
    directive_id: directive.id,
    overall_risk: riskLevel,
    service_impact: isServiceChange ? 'Potential public-facing service change' : 'Internal process — no public impact',
    electoral_risk: riskLevel === 'High' ? 'Could affect Reform support in affected wards' : 'Minimal electoral risk',
    media_risk: directive.save_central > 5000000 ? 'Large savings figure may attract media attention' : 'Low media interest',
    opposition_angle: isServiceChange ? 'Opposition will characterise as "cuts to vital services"' : 'Difficult for opposition to attack internal efficiency',
    counter_narrative: isServiceChange
      ? 'Reform is reforming wasteful practices left by the previous administration while protecting frontline services'
      : 'This is good financial management — recovering money that should never have been spent',
  }
}


// ═══════════════════════════════════════════════════════════════════════
// Department Operations
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build operational profile for a department/portfolio.
 *
 * @param {Array} spending - Portfolio-matched spending records
 * @param {Object} portfolio - Portfolio
 * @returns {Object} Operations profile
 */
export function departmentOperationsProfile(spending, portfolio) {
  if (!spending?.length || !portfolio) return null

  const stats = computeDistributionStats(spending.map(r => r.amount || 0))

  // Payment patterns
  const dayOfWeek = new Array(7).fill(0)
  const monthCounts = {}
  for (const r of spending) {
    if (r.date) {
      const d = new Date(r.date)
      dayOfWeek[d.getDay()]++
      const m = r.date.substring(0, 7)
      monthCounts[m] = (monthCounts[m] || 0) + 1
    }
  }

  // Supplier diversity
  const uniqueSuppliers = new Set(spending.map(r => r.supplier || r.supplier_canonical)).size
  const avgPerSupplier = spending.length / Math.max(uniqueSuppliers, 1)

  return {
    portfolio_id: portfolio.id,
    total_transactions: spending.length,
    total_spend: stats.count > 0 ? spending.reduce((s, r) => s + (r.amount || 0), 0) : 0,
    distribution: stats,
    payment_patterns: {
      day_of_week: dayOfWeek,
      monthly_volumes: monthCounts,
    },
    supplier_diversity: {
      unique_suppliers: uniqueSuppliers,
      avg_transactions_per_supplier: Math.round(avgPerSupplier * 10) / 10,
    },
    known_pressures: portfolio.known_pressures || [],
    key_services: portfolio.key_services || [],
  }
}

/**
 * Calculate process efficiency score for a portfolio.
 *
 * @param {Array} spending - Portfolio spending records
 * @param {Object} options - { procurement }
 * @returns {Object} Efficiency metrics
 */
export function processEfficiency(spending, options = {}) {
  if (!spending?.length) return { score: 0, components: [] }

  const components = []
  let totalScore = 0
  let componentCount = 0

  // 1. Payment regularity (are payments evenly spread?)
  const monthCounts = {}
  for (const r of spending) {
    if (r.date) {
      const m = r.date.substring(0, 7)
      monthCounts[m] = (monthCounts[m] || 0) + 1
    }
  }
  const monthValues = Object.values(monthCounts)
  if (monthValues.length > 1) {
    const monthStats = computeDistributionStats(monthValues)
    const cv = monthStats.mean > 0 ? monthStats.stdDev / monthStats.mean : 0
    const regularity = Math.max(0, Math.min(100, 100 - cv * 100))
    components.push({ name: 'Payment Regularity', score: Math.round(regularity), max: 100 })
    totalScore += regularity
    componentCount++
  }

  // 2. Supplier diversity score
  const uniqueSuppliers = new Set(spending.map(r => r.supplier || r.supplier_canonical)).size
  const diversityScore = Math.min(100, uniqueSuppliers / spending.length * 500)
  components.push({ name: 'Supplier Diversity', score: Math.round(diversityScore), max: 100 })
  totalScore += diversityScore
  componentCount++

  // 3. Round number avoidance (lower % of round numbers = better)
  const roundCount = spending.filter(r => {
    const amt = Math.abs(r.amount || 0)
    return amt >= 1000 && amt % 1000 === 0
  }).length
  const roundPct = (roundCount / spending.length) * 100
  const roundScore = Math.max(0, 100 - roundPct * 5)
  components.push({ name: 'Pricing Precision', score: Math.round(roundScore), max: 100 })
  totalScore += roundScore
  componentCount++

  return {
    score: componentCount > 0 ? Math.round(totalScore / componentCount) : 0,
    components,
  }
}


// ═══════════════════════════════════════════════════════════════════════
// Benchmarking
// ═══════════════════════════════════════════════════════════════════════

/**
 * Benchmark a portfolio against GOV.UK peer data.
 *
 * @param {Object} portfolio - Portfolio
 * @param {Object} budgetsGovuk - budgets_govuk.json
 * @returns {Object} Benchmark results
 */
export function portfolioBenchmark(portfolio, budgetsGovuk) {
  if (!portfolio || !budgetsGovuk) return null

  const categories = portfolio.budget_categories || []
  if (!categories.length) return null

  // Find peer values for matching categories
  const results = []
  for (const cat of categories) {
    const peerData = budgetsGovuk?.services?.[cat] || budgetsGovuk?.categories?.[cat]
    if (peerData?.authorities) {
      const values = Object.values(peerData.authorities).filter(v => typeof v === 'number')
      const lccValue = peerData.authorities?.lancashire_cc || peerData.authorities?.['Lancashire']
      if (lccValue != null && values.length > 1) {
        const benchmark = peerBenchmark(lccValue, values)
        results.push({
          category: cat,
          lcc_value: lccValue,
          ...benchmark,
        })
      }
    }
  }

  return results.length > 0 ? results : null
}


// ═══════════════════════════════════════════════════════════════════════
// Implementation Tracking
// ═══════════════════════════════════════════════════════════════════════

/**
 * Score implementation progress for directives.
 *
 * @param {Array} directives - Directives with optional `status` field
 * @returns {Object} Implementation scores
 */
export function scoreImplementation(directives) {
  if (!directives?.length) return { delivered: 0, in_progress: 0, blocked: 0, not_started: 0, delivery_rate: 0, total_delivered_value: 0 }

  let delivered = 0, inProgress = 0, blocked = 0, notStarted = 0
  let deliveredValue = 0

  for (const d of directives) {
    const status = d.status || 'not_started'
    if (status === 'delivered' || status === 'completed') {
      delivered++
      deliveredValue += d.save_central || 0
    } else if (status === 'in_progress') inProgress++
    else if (status === 'blocked') blocked++
    else notStarted++
  }

  return {
    delivered,
    in_progress: inProgress,
    blocked,
    not_started: notStarted,
    total: directives.length,
    delivery_rate: directives.length > 0 ? Math.round((delivered / directives.length) * 100) : 0,
    total_delivered_value: deliveredValue,
  }
}


// ═══════════════════════════════════════════════════════════════════════
// Priority Matrix
// ═══════════════════════════════════════════════════════════════════════

/**
 * Classify directives into priority quadrants.
 *
 * @param {Array} directives - Directives with feasibility and impact scores
 * @returns {Object} Quadrant classification
 */
export function priorityMatrix(directives) {
  if (!directives?.length) return { do_now: [], plan: [], delegate: [], park: [] }

  const doNow = []
  const plan = []
  const delegate = []
  const park = []

  for (const d of directives) {
    const f = d.feasibility || 5
    const i = d.impact || 5

    if (f >= 6 && i >= 6) doNow.push(d)
    else if (f < 6 && i >= 6) plan.push(d)
    else if (f >= 6 && i < 6) delegate.push(d)
    else park.push(d)
  }

  return { do_now: doNow, plan, delegate, park }
}


// ═══════════════════════════════════════════════════════════════════════
// FOI Generation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Auto-generate FOI request from a directive.
 *
 * @param {Object} directive - A directive
 * @param {Object} portfolio - Portfolio
 * @returns {Object} FOI template
 */
export function generatePortfolioFOI(directive, portfolio) {
  if (!directive || !portfolio) return null

  const foiTypes = {
    duplicate_recovery: {
      subject: `Duplicate payment recovery — ${portfolio.title}`,
      body: `Under the Freedom of Information Act 2000, I request:\n\n1. All duplicate payment recoveries processed by ${portfolio.title} in the last 24 months\n2. The total value of duplicate payments identified\n3. The total value successfully recovered\n4. The process for identifying and recovering duplicate payments\n5. Any internal audit reports relating to duplicate payments in this area`,
    },
    split_payment: {
      subject: `Payment splitting investigation — ${portfolio.title}`,
      body: `Under the Freedom of Information Act 2000, I request:\n\n1. All instances where multiple payments to the same supplier in the same month totalled above the procurement threshold\n2. The procurement method used for each contract/payment\n3. Whether any payments were referred to the procurement team for threshold review\n4. The total number of waivers of Contract Procedure Rules granted in the last 24 months`,
    },
    savings_lever: {
      subject: `Savings delivery — ${portfolio.title}`,
      body: `Under the Freedom of Information Act 2000, I request:\n\n1. All savings targets set for ${portfolio.title} in the current financial year\n2. Progress against each target (delivered / on track / at risk / missed)\n3. Any external consultancy spend relating to savings programmes\n4. Benchmarking data used to set efficiency targets`,
    },
    concentration: {
      subject: `Supplier concentration — ${portfolio.title}`,
      body: `Under the Freedom of Information Act 2000, I request:\n\n1. The top 10 suppliers by value for ${portfolio.title}\n2. Contract start and end dates for each\n3. Whether competitive tendering was used for each\n4. Any single-source procurement waivers granted in the last 24 months`,
    },
  }

  const template = foiTypes[directive.type] || {
    subject: `${directive.action} — ${portfolio.title}`,
    body: `Under the Freedom of Information Act 2000, I request information relating to: ${directive.action}`,
  }

  return {
    ...template,
    directive_id: directive.id,
    portfolio_id: portfolio.id,
    generated_date: new Date().toISOString().slice(0, 10),
  }
}


// ═══════════════════════════════════════════════════════════════════════
// Cross-Portfolio Dependencies
// ═══════════════════════════════════════════════════════════════════════

/**
 * Identify cross-portfolio savings dependencies.
 *
 * @param {Array} portfolios - All portfolios
 * @returns {Array} Dependency links
 */
export function crossPortfolioDependencies(portfolios) {
  if (!portfolios?.length) return []

  // Known cross-portfolio dependencies in local government
  const dependencies = [
    {
      from: 'health_wellbeing',
      to: 'adult_social_care',
      type: 'prevention',
      description: 'Public health prevention programmes reduce Adult Social Care demand. £1 in falls prevention = £3.50 saved in hospital admissions and social care packages.',
      roi_timeline: '12-24 months',
    },
    {
      from: 'children_families',
      to: 'education_skills',
      type: 'early_intervention',
      description: 'Early intervention in children\'s services reduces SEND demand and exclusions. Family support reduces EHC plan escalation.',
      roi_timeline: '2-5 years',
    },
    {
      from: 'highways_transport',
      to: 'economic_development',
      type: 'infrastructure',
      description: 'Transport connectivity enables economic growth. Road condition affects business investment decisions.',
      roi_timeline: '3-10 years',
    },
    {
      from: 'data_technology',
      to: 'resources_property',
      type: 'digital_transformation',
      description: 'Digital services reduce property footprint needs and back-office processing costs.',
      roi_timeline: '12-18 months',
    },
  ]

  // Only return dependencies where both portfolios exist
  const ids = new Set(portfolios.map(p => p.id))
  return dependencies.filter(d => ids.has(d.from) && ids.has(d.to))
}


// ═══════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════

/**
 * Format a number as GBP currency string.
 */
export function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '£0'
  if (Math.abs(amount) >= 1000000000) return `£${(amount / 1000000000).toFixed(1)}B`
  if (Math.abs(amount) >= 1000000) return `£${(amount / 1000000).toFixed(1)}M`
  if (Math.abs(amount) >= 1000) return `£${(amount / 1000).toFixed(0)}K`
  return `£${amount.toFixed(0)}`
}

/**
 * Get all portfolios for a given role level.
 *
 * @param {Array} portfolios - All portfolios
 * @param {string} role - User role
 * @param {Array} portfolioIds - User's assigned portfolio IDs
 * @returns {Array} Accessible portfolios
 */
export function getAccessiblePortfolios(portfolios, role, portfolioIds = []) {
  if (!portfolios?.length) return []

  // Leader and admin see everything
  if (role === 'leader' || role === 'admin') return portfolios

  // Others see assigned portfolios
  if (portfolioIds.includes('*')) return portfolios
  return portfolios.filter(p => portfolioIds.includes(p.id))
}
