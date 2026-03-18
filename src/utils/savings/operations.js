/**
 * @module savings/operations
 * Decision pathway, implementation calendar, supplier portfolio analysis,
 * contract pipeline, funding constraints, meeting decision pipeline.
 */

import { giniCoefficient, integrityWeightedHHI } from '../analytics.js'
import { mapAgendaToPolicyAreas } from '../intelligenceEngine.js'

/**
 * Determine governance route for a directive.
 *
 * Uses LCC constitution thresholds from cabinet_portfolios.json:
 * - Key Decision = 500K+ or affects 2+ wards
 * - Officer delegation thresholds: Director 250K, ED 500K, Chief Exec 1M
 *
 * @param {Object} directive - A directive from generateDirectives()
 * @param {Object} governance - Governance section from cabinet_portfolios.json
 * @returns {Object|null} Route, timeline, requirements
 */
export function decisionPathway(directive, governance) {
  if (!directive || !governance) return null

  const value = directive.save_central ?? 0
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
    requirements = 'Budget/Policy Framework change. Cabinet recommendation -> Full Council vote. Reform majority 53/84.'
  }

  // Political arithmetic
  const majoritySize = political.majority_size ?? 10
  const hasMajority = majoritySize > 0

  return {
    route,
    timeline_days: timelineDays,
    authority,
    requirements,
    political_arithmetic: hasMajority
      ? `Reform ${political.reform_seats ?? 53}/${political.total_seats ?? 84}: comfortable majority (${majoritySize} over threshold)`
      : 'No overall control, requires cross-party support',
    shortcuts: value < 500000 ? ['Officer delegation: no formal member decision needed'] : [],
    call_in_risk: route === 'cabinet' || route === 'cabinet_member'
      ? `5 non-executive signatures required for call-in. ${political.opposition_seats ?? 31} opposition members.`
      : 'N/A, not a member decision',
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

/**
 * Analyse suppliers within a portfolio context.
 *
 * @param {Array} spending - Portfolio-matched spending records
 * @param {Object} options - { integrity, procurement }
 * @returns {{ suppliers: Array, gini: number, hhi: number, total_spend: number, total_suppliers: number, top_5_share: number, integrity_hhi: Object|null }}
 */
export function supplierPortfolioAnalysis(spending, options = {}) {
  if (!spending?.length) return { suppliers: [], gini: 0, hhi: 0, total: 0 }

  const supplierMap = {}
  for (const r of spending) {
    const name = r.supplier || r.supplier_canonical || 'Unknown'
    if (!supplierMap[name]) supplierMap[name] = { name, total: 0, count: 0, months: new Set() }
    supplierMap[name].total += r.amount ?? 0
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

  // Integrity-weighted HHI - amplifies concentration when councillor-connected suppliers exist
  const integrityHHI = options.integrity
    ? integrityWeightedHHI(
        suppliers.map(s => ({ name: s.name, amount: s.total })),
        options.integrity
      )
    : null

  return {
    suppliers: suppliers.slice(0, 25),
    total_suppliers: suppliers.length,
    total_spend: total,
    gini: Math.round(gini * 1000) / 1000,
    hhi: Math.round(hhi),
    top_5_share: suppliers.slice(0, 5).reduce((s, v) => s + v.total, 0) / total,
    integrity_hhi: integrityHHI,
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
  const empty = { expiring_3m: [], expiring_6m: [], expiring_12m: [], total_value: 0, total_contracts: 0, relevant: [], sme_count: 0, single_bidder_count: 0 }
  if (!contracts?.length || !portfolio) return empty

  const now = new Date()
  const m3 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
  const m6 = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000)
  const m12 = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)

  // Match via spending_department_patterns (regex), key_services keywords, AND key_contracts providers
  const patterns = (portfolio.spending_department_patterns || []).map(p => { try { return new RegExp(p, 'i') } catch { return null } }).filter(Boolean)
  const keywords = (portfolio.key_services || []).map(s => s.toLowerCase().split(' ')).flat().filter(k => k.length > 3)
  const providers = (portfolio.key_contracts || []).map(kc => kc.provider.toLowerCase().split(' ')[0]).filter(w => w.length > 3)

  const isRelevant = (contract) => {
    const text = `${contract.title || ''} ${contract.description || ''} ${contract.awarded_supplier || ''}`.toLowerCase()
    if (keywords.some(k => text.includes(k))) return true
    if (patterns.some(p => p.test(text))) return true
    const supplier = (contract.awarded_supplier || '').toLowerCase()
    if (providers.some(p => supplier.includes(p))) return true
    return false
  }

  const relevant = contracts.filter(isRelevant)

  const normalise = (c) => ({
    id: c.id,
    title: c.title,
    supplier: c.awarded_supplier || c.supplier || '',
    value: c.awarded_value || c.value || 0,
    end_date: c.contract_end || c.end_date || null,
    start_date: c.contract_start || c.start_date || null,
    status: c.status || 'unknown',
    bid_count: c.bid_count || null,
    procedure_type: c.procedure_type || null,
    is_sme: c.is_sme || false,
  })

  const normalised = relevant.map(normalise)
  const withEnd = normalised.filter(c => c.end_date)

  const expiring3m = withEnd.filter(c => new Date(c.end_date) <= m3 && new Date(c.end_date) >= now)
  const expiring6m = withEnd.filter(c => new Date(c.end_date) <= m6 && new Date(c.end_date) > m3)
  const expiring12m = withEnd.filter(c => new Date(c.end_date) <= m12 && new Date(c.end_date) > m6)

  return {
    expiring_3m: expiring3m,
    expiring_6m: expiring6m,
    expiring_12m: expiring12m,
    total_value: normalised.reduce((s, c) => s + (c.value ?? 0), 0),
    total_contracts: normalised.length,
    relevant: normalised,
    sme_count: normalised.filter(c => c.is_sme).length,
    single_bidder_count: normalised.filter(c => c.bid_count === 1).length,
  }
}

/**
 * Calculate funding constraints for a portfolio.
 *
 * @param {Object} portfolio - Portfolio object
 * @param {Object} fundingModel - funding_model from cabinet_portfolios.json
 * @returns {Object|null} Funding constraint analysis
 */
export function fundingConstraints(portfolio, fundingModel) {
  if (!portfolio || !fundingModel) return null
  const grants = (fundingModel.ring_fenced_grants || []).filter(g => g.portfolio === portfolio.id)
  const ringFencedTotal = grants.reduce((s, g) => s + (g.value ?? 0), 0)
  const totalBudget = portfolio.budget?.total ?? 0
  const addressable = Math.max(0, totalBudget - ringFencedTotal)
  return {
    total_budget: totalBudget,
    ring_fenced_total: ringFencedTotal,
    addressable,
    addressable_pct: totalBudget > 0 ? Math.round((addressable / totalBudget) * 1000) / 10 : 100,
    grants,
  }
}

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
 * Enriched decision pipeline: wraps decisionPipeline with policy area tagging.
 *
 * @param {Array} meetings - meetings.json data
 * @param {Object} portfolio - Portfolio
 * @param {Array} documents - council_documents.json data
 * @returns {Array} Pipeline items with policy_areas tags
 */
export function enrichedDecisionPipeline(meetings, portfolio, documents) {
  const pipeline = decisionPipeline(meetings, portfolio, documents)

  return pipeline.map(decision => {
    const agendaTexts = (decision.agenda_items || []).map(
      item => typeof item === 'string' ? item : (item.title || item.text || '')
    )
    const policyAreas = [...new Set(
      agendaTexts.flatMap(text => mapAgendaToPolicyAreas(text))
    )]
    return {
      ...decision,
      policy_areas: policyAreas,
      has_budget_items: policyAreas.includes('budget_finance'),
      has_social_care: policyAreas.includes('social_care'),
    }
  })
}
