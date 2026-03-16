/**
 * Savings Engine - prescriptive directives for Reform operations.
 *
 * Pure functions that power the Cabinet Command tier. No React dependencies.
 * Reuses analytics.js (deflate, giniCoefficient, peerBenchmark, computeDistributionStats,
 * integrityWeightedHHI, reservesAdequacy, cipfaResilience, realGrowthRate, benfordSecondDigit,
 * materialityThreshold), intelligenceEngine.js (mapAgendaToPolicyAreas, getTopicAttackLines,
 * buildReformDefenceLines), strategyEngine.js (generateCouncilAttackLines, classifyWard,
 * scoreIncumbentEntrenchment), and electionModel.js (calculateFiscalStressAdjustment).
 * Connects portfolio data to spending, DOGE findings, meetings, and governance.
 *
 * Architecture: cabinet_portfolios.json is the spine. Every function takes
 * portfolio data + operational data → actionable intelligence.
 *
 * Key design principle: CENTRALISE cross-cutting functions. Duplicates, procurement,
 * contract management and commercialisation are handled ONCE under Resources/Finance,
 * not duplicated across 10 portfolios. The reform_operations section of the data
 * defines what's centralised vs portfolio-specific.
 */

import { deflate, giniCoefficient, peerBenchmark, computeDistributionStats, integrityWeightedHHI, reservesAdequacy, cipfaResilience, realGrowthRate, benfordSecondDigit, materialityThreshold } from './analytics.js'
import { mapAgendaToPolicyAreas, getTopicAttackLines, buildReformDefenceLines, REFORM_REBUTTALS } from './intelligenceEngine.js'
import { generateCouncilAttackLines, classifyWard, scoreIncumbentEntrenchment } from './strategyEngine.js'
import { calculateFiscalStressAdjustment } from './electionModel.js'

// Borough elections May 2026 - 12 Lancashire districts elect
const BOROUGH_ELECTION_DATE = '2026-05-07'
const LANCASHIRE_DISTRICTS = [
  'burnley', 'hyndburn', 'pendle', 'rossendale', 'lancaster', 'ribble_valley',
  'chorley', 'south_ribble', 'preston', 'west_lancashire', 'wyre', 'fylde',
]

// Portfolio → ward archetype resonance (which voter segments benefit from this portfolio's actions)
const PORTFOLIO_ARCHETYPE_RESONANCE = {
  adult_social_care: ['retirement', 'affluent_retired', 'deprived_diverse'],
  children_families: ['affluent_family', 'deprived_white', 'struggling'],
  education_skills: ['affluent_family', 'deprived_white', 'middle_ground'],
  highways_transport: ['affluent_family', 'middle_ground', 'affluent_retired'],
  health_wellbeing: ['retirement', 'affluent_retired', 'deprived_diverse', 'struggling'],
  resources: ['middle_ground', 'affluent_family', 'affluent_retired'],
  community_safety: ['deprived_white', 'struggling', 'middle_ground'],
  economic_development: ['struggling', 'deprived_white', 'deprived_diverse'],
  environment_climate: ['affluent_retired', 'middle_ground', 'affluent_family'],
  data_technology: ['middle_ground', 'affluent_family'],
}

// Portfolio-specific Reform PR angles for press/social media
const PORTFOLIO_PR_ANGLES = {
  adult_social_care: [
    'Reform protects the most vulnerable, while finding efficiencies the old guard ignored',
    'Data-driven care: Reform uses AI DOGE to ensure every penny reaches those who need it',
  ],
  children_families: [
    'Reform puts children first: SEND places up, bureaucracy down',
    'Protecting families while cutting waste: the Reform difference',
  ],
  education_skills: [
    'Reform invests in Lancashire\'s future: skills, schools, and standards',
    'Every child matters: Reform is delivering where others promised',
  ],
  highways_transport: [
    'Potholes filled, roads fixed: Reform delivers where Tories didn\'t for 12 years',
    '67,439 potholes: Reform is fixing Lancashire\'s infrastructure',
  ],
  health_wellbeing: [
    'Reform takes public health seriously: preventive care saves money and lives',
    'Health inequalities won\'t fix themselves: Reform is acting, not talking',
  ],
  resources: [
    'Reform runs Lancashire like a business: transparent, accountable, efficient',
    'Every pound accounted for: AI DOGE transparency the old guard fought against',
  ],
  economic_development: [
    'Reform is open for business: cutting red tape, creating opportunities',
    'Lancashire\'s economy needs Reform\'s fresh thinking, not the same old decline',
  ],
  environment_climate: [
    'Practical environmentalism: Reform balances green goals with real-world costs',
    'Clean Lancashire: Reform delivers environmental action without ideology',
  ],
  community_safety: [
    'Safer streets: Reform backs police, backs communities, backs common sense',
    'Reform tackles anti-social behaviour: the issue Labour ignores',
  ],
  data_technology: [
    'AI DOGE: Reform brings 21st century transparency to Lancashire',
    'Digital Reform: saving millions through technology the old guard couldn\'t spell',
  ],
}


// ─── Political engine helpers (private) ──────────────────────────────

function generatePortfolioNarrativeHooks(portfolio) {
  if (!portfolio) return []
  const hooks = [...(PORTFOLIO_PR_ANGLES[portfolio.id] || [`Reform is delivering real change in ${portfolio.title}`])]
  if (portfolio.budget_latest?.net_expenditure) {
    hooks.push(`Reform manages ${formatCurrency(portfolio.budget_latest.net_expenditure)} of taxpayer money with full transparency`)
  }
  for (const lever of (portfolio.savings_levers || []).slice(0, 2)) {
    hooks.push(`Reform savings target: ${lever.lever}, ${lever.est_saving} potential`)
  }
  return hooks
}

function generateReformPRAngle(directive, portfolio) {
  if (!directive) return null
  const saving = directive.save_central || 0
  const title = portfolio.short_title || portfolio.title
  const angles = {
    duplicate_recovery: {
      headline: `Reform recovers ${formatCurrency(saving)} in duplicate payments: money the old guard wasted`,
      hook: 'Previous administration paid twice for the same thing. Reform found it, Reform recovered it.',
      tone: 'accountability',
    },
    split_payment: {
      headline: `Reform exposes ${formatCurrency(saving)} in split payment evasion in ${title}`,
      hook: 'Procurement rules exist for a reason. The old guard dodged them. Reform enforces them.',
      tone: 'transparency',
    },
    savings_lever: {
      headline: `Reform delivers ${formatCurrency(saving)} savings in ${title}`,
      hook: 'Not cuts, reform. Smarter working, better outcomes, less waste.',
      tone: 'competence',
    },
    concentration: {
      headline: `Reform breaks ${title} supplier monopoly, opening competition`,
      hook: 'Cosy supplier relationships end under Reform. Competition drives value for taxpayers.',
      tone: 'disruption',
    },
    structural: {
      headline: `Reform restructures ${title}: ${formatCurrency(saving)} annual saving`,
      hook: 'Bold reform that the previous administration lacked the courage to attempt.',
      tone: 'transformation',
    },
  }
  return angles[directive.type] || {
    headline: `Reform takes action on ${title}: ${formatCurrency(saving)} identified`,
    hook: 'Reform is delivering change where others just managed decline.',
    tone: 'competence',
  }
}

function generateBoroughRipple(directive, portfolio) {
  const saving = directive.save_central || 0
  const title = portfolio.short_title || portfolio.title
  // Which districts does this portfolio directly affect?
  const countyWide = ['adult_social_care', 'children_families', 'education_skills',
    'highways_transport', 'health_wellbeing', 'resources', 'environment_climate']
  const affectedDistricts = countyWide.includes(portfolio.id)
    ? LANCASHIRE_DISTRICTS
    : ['burnley', 'hyndburn', 'pendle', 'rossendale', 'lancaster', 'preston']
  return {
    affected_districts: affectedDistricts,
    district_count: affectedDistricts.length,
    talking_point: saving > 0
      ? `Reform at LCC identified ${formatCurrency(saving)} in ${title}. Borough candidates: "We'll bring the same accountability to your council."`
      : `Reform delivers real change at LCC in ${title}. Borough candidates: "This is what Reform governance looks like."`,
    scrutiny_multiplier: 2.5,
    media_amplification: 'Reform as a new governing party gets 2-3x media coverage per action. Every success story travels further.',
  }
}

function findMatchedRebuttal(directive, portfolio) {
  if (!REFORM_REBUTTALS?.length) return null
  const type = directive.type || ''
  const portfolioId = portfolio.id || ''
  // Map directive types to likely opposition attack patterns
  const attackPatterns = {
    savings_lever: ['cutting services', 'cuts', 'austerity'],
    structural: ['cutting services', 'restructuring', 'job losses'],
    duplicate_recovery: ['wasting time', 'distraction'],
    split_payment: ['bureaucracy', 'red tape'],
    concentration: ['disrupting services', 'ideology'],
  }
  const patterns = attackPatterns[type] || ['cutting services']
  for (const rebuttal of REFORM_REBUTTALS) {
    const attackLower = (rebuttal.attack || '').toLowerCase()
    if (patterns.some(p => attackLower.includes(p))) return rebuttal
  }
  // Portfolio-specific keyword matching
  const policyMap = {
    highways_transport: ['road', 'pothole', 'transport'],
    adult_social_care: ['social care', 'care', 'elderly'],
    education_skills: ['education', 'school', 'send'],
    resources: ['council tax', 'budget', 'waste'],
  }
  const keywords = policyMap[portfolioId] || []
  for (const rebuttal of REFORM_REBUTTALS) {
    const areas = (rebuttal.policyAreas || []).join(' ').toLowerCase()
    if (keywords.some(k => areas.includes(k))) return rebuttal
  }
  return REFORM_REBUTTALS[0] || null
}

function generateConstituencyResonance(directive, portfolio, options) {
  const saving = directive.save_central || 0
  const title = portfolio.short_title || portfolio.title
  const resonance = {
    message: saving > 1000000
      ? `Reform at LCC saving ${formatCurrency(saving)} in ${title}: proof we can govern responsibly at any level`
      : `Reform brings accountability to ${title} at LCC`,
    mp_comparison: 'LCC Reform members deliver more scrutiny than most Lancashire MPs combined',
    national_narrative: 'Lancashire proves Reform can govern, not just protest',
  }
  if (options.constituencies) {
    resonance.constituencies = Object.keys(options.constituencies)
    resonance.constituency_count = resonance.constituencies.length
  }
  return resonance
}

function getArchetypeMessage(archetype, portfolio, totalSavings) {
  const title = portfolio.short_title || portfolio.title
  const saving = formatCurrency(totalSavings)
  const messages = {
    deprived_white: `Reform found ${saving} being wasted in ${title}, money that should have gone to your community. The old guard didn't care. We do.`,
    deprived_diverse: `Reform is investing in ${title} services that matter to your community, and cutting the waste that diverts resources away.`,
    affluent_retired: `Reform manages your council tax responsibly: ${saving} saved in ${title} through proper scrutiny, not ideology.`,
    affluent_family: `Reform delivers in ${title}: ${saving} saved means better services for your family without higher taxes.`,
    retirement: `Reform protects ${title} services you depend on, while finding ${saving} in waste the previous administration ignored.`,
    struggling: `${saving} wasted in ${title} under the old guard. Reform found it. Reform will reinvest it in your area.`,
    middle_ground: `Common sense reform: ${saving} saved in ${title}. That's your money, spent properly at last.`,
  }
  return messages[archetype] || messages.middle_ground
}

function daysUntilBoroughElections() {
  return Math.max(0, Math.ceil((new Date(BOROUGH_ELECTION_DATE) - new Date()) / 86400000))
}


// ═══════════════════════════════════════════════════════════════════════
// Parsing Helpers
// ═══════════════════════════════════════════════════════════════════════

/** Parse £-amount strings like "£2-10M", "£5M", "£0.5-1.2M" → { low, high } in raw £ */
export function parseSavingRange(str) {
  if (!str) return { low: 0, high: 0 }
  const m = (str || '').match(/£([\d.]+)(?:\s*-\s*([\d.]+))?\s*([MBK])?/i)
  if (!m) return { low: 0, high: 0 }
  const multiplier = (m[3] || 'M').toUpperCase() === 'B' ? 1e9 : (m[3] || 'M').toUpperCase() === 'K' ? 1e3 : 1e6
  const low = parseFloat(m[1]) * multiplier
  const high = m[2] ? parseFloat(m[2]) * multiplier : low * 1.2
  return { low, high }
}

/** Classify timeline string → bucket */
export function timelineBucket(tl) {
  const s = (tl || '').toLowerCase()
  if (s.includes('immediate') || s.includes('0-3')) return 'immediate'
  if (s.includes('3-6') || s.includes('short')) return 'short_term'
  if (s.includes('6-12') || s.includes('12-18') || s.includes('medium')) return 'medium_term'
  return 'long_term'
}

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
export function matchSpendingToPortfolio(records, portfolio, summary) {
  // If a spending summary is available, return portfolio-level aggregates from it
  if (summary?.by_portfolio?.[portfolio?.id]) {
    return summary.by_portfolio[portfolio.id]
  }
  if (!records || !portfolio?.spending_department_patterns?.length) return []
  const patterns = portfolio.spending_department_patterns.map(p => new RegExp(p, 'i'))
  return records.filter(r => {
    const dept = r.department || r.service_division || r.service_area || ''
    return patterns.some(p => p.test(dept))
  })
}

/**
 * Compare actual spend from summary against budget allocation.
 *
 * @param {Object} portfolio - Portfolio from cabinet_portfolios.json
 * @param {Object} spendingSummary - From computeSpendingSummary()
 * @returns {{ budget: number, actual: number, variance: number, variance_pct: number, alert_level: string, months_data: Object[] }|null}
 */
export function spendingBudgetVariance(portfolio, spendingSummary) {
  if (!portfolio || !spendingSummary?.by_portfolio) return null

  const portfolioSpend = spendingSummary.by_portfolio[portfolio.id]
  if (!portfolioSpend) return null

  // Determine budget from portfolio data
  const budget = portfolio.budget_latest?.gross_expenditure
    || portfolio.budget_latest?.allocation
    || portfolio.budget_latest?.allocation_2026_27
    || 0

  if (!budget) return null

  const actual = portfolioSpend.total || 0

  // Annualise actual if data covers less than 12 months
  const monthCount = portfolioSpend.by_month?.length || 1
  const annualised = monthCount < 12 ? (actual / monthCount) * 12 : actual

  const variance = annualised - budget
  const variance_pct = budget > 0 ? (variance / budget) * 100 : 0

  let alert_level = 'green'
  if (Math.abs(variance_pct) > 15) alert_level = 'red'
  else if (Math.abs(variance_pct) > 5) alert_level = 'amber'

  return {
    budget,
    actual,
    annualised,
    months_of_data: monthCount,
    variance,
    variance_pct: Math.round(variance_pct * 10) / 10,
    alert_level,
    months_data: portfolioSpend.by_month || [],
  }
}

/**
 * Compute supplier concentration metrics within a portfolio.
 *
 * @param {Object} portfolioSpending - Portfolio spending from summary.by_portfolio[id]
 * @returns {{ hhi: number, top_supplier_pct: number, unique_suppliers: number, risk_level: string, top_3: Object[] }|null}
 */
export function spendingConcentration(portfolioSpending) {
  if (!portfolioSpending) return null

  const hhi = portfolioSpending.hhi || 0
  const topSuppliers = portfolioSpending.top_suppliers || []
  const uniqueSuppliers = portfolioSpending.unique_suppliers || 0
  const total = portfolioSpending.total || 0

  const topPct = topSuppliers[0] && total > 0 ? (topSuppliers[0].total / total * 100) : 0

  let risk_level = 'low'
  if (hhi > 2500) risk_level = 'high'
  else if (hhi > 1500) risk_level = 'moderate'

  return {
    hhi,
    top_supplier_pct: Math.round(topPct * 10) / 10,
    unique_suppliers: uniqueSuppliers,
    risk_level,
    top_3: topSuppliers.slice(0, 3).map(s => ({
      name: s.name,
      total: s.total,
      pct: Math.round(s.pct * 10) / 10,
    })),
  }
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


// ═══════════════════════════════════════════════════════════════════════
// Prescriptive Directives
// ═══════════════════════════════════════════════════════════════════════

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
    directives.push({
      id: `${portfolio.id}_commercialisation`,
      type: 'income',
      tier: 'medium_term_reform',
      owner: 'portfolio',
      action: `DO: Develop commercial income from ${portfolio.title} services. SAVE: ${formatCurrency(commResult.total)} pa. HOW: Sell expertise, traded services, sponsorship, and advertising. EVIDENCE: ${commResult.commercial_lever_count} commercial opportunities identified.`,
      save_low: Math.round(commResult.total * 0.4),
      save_high: commResult.total,
      save_central: Math.round(commResult.total * 0.7),
      timeline: 'Medium-term (6-18 months)',
      legal_basis: 'Localism Act 2011 general power of competence, LGA 2003 s93-95 trading powers',
      risk: 'Medium',
      risk_detail: 'Commercial income is not guaranteed. Requires market development and may need company vehicle for trading.',
      steps: ['Identify all tradeable services and expertise', 'Price services at cost-plus for external buyers', 'Develop marketing plan for top 3 commercial opportunities', 'Establish trading account or Teckal company if needed'],
      governance_route: 'cabinet_decision',
      evidence: `Traded: ${formatCurrency(commResult.traded_income)}. Advertising/sponsorship: ${formatCurrency(commResult.advertising_income)}. Expertise sales: ${formatCurrency(commResult.expertise_income)}.`,
      portfolio_id: portfolio.id,
      officer: portfolio.executive_director,
      priority: 'medium',
      feasibility: 5,
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
 * @param {Object} allSpending - Map of portfolio_id → spending records
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


// ═══════════════════════════════════════════════════════════════════════
// Reform Playbook
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a phased Reform Playbook for a portfolio.
 * Uses 5-tier model: immediate_recovery → procurement_reform → demand_management
 * → service_redesign → income_generation
 *
 * @param {Object} portfolio - Portfolio from cabinet_portfolios.json
 * @param {Array} directives - Output from generateDirectives()
 * @param {Object} cabinetData - Full cabinet_portfolios.json (for MTFS comparison)
 * @returns {Object} Playbook with phases, red lines, targets
 */
export function generateReformPlaybook(portfolio, directives, cabinetData) {
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

  // Group by tier for the 5-tier view
  const byTier = {}
  for (const d of directives) {
    const tier = d.tier || 'demand_management'
    if (!byTier[tier]) byTier[tier] = { directives: [], total: 0 }
    byTier[tier].directives.push(d)
    byTier[tier].total += d.save_central || 0
  }

  // Group by ownership
  const centralised = directives.filter(d => d.owner === 'centralised')
  const portfolioOwned = directives.filter(d => d.owner !== 'centralised')

  // Red lines - statutory duties rated 'red'
  const redLines = (portfolio.statutory_duties || [])
    .filter(d => d.risk_level === 'red')
    .map(d => ({ act: d.act, summary: d.summary, risk: d.risk }))

  // Amber zones - statutory duties rated 'amber'
  const amberZones = (portfolio.statutory_duties || [])
    .filter(d => d.risk_level === 'amber')
    .map(d => ({ act: d.act, summary: d.summary, risk: d.risk }))

  // Green space - statutory duties rated 'green'
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
    by_tier: byTier,
    ownership: {
      centralised: { count: centralised.length, total: sumSavings(centralised) },
      portfolio_specific: { count: portfolioOwned.length, total: sumSavings(portfolioOwned) },
    },
    total_savings: sumSavings(directives),
    directive_count: directives.length,
    red_lines: redLines,
    amber_zones: amberZones,
    green_space: greenSpace,
  }
}

/**
 * Compare total savings pipeline against MTFS targets.
 *
 * @param {Array} allDirectives - All directives from generateAllDirectives()
 * @param {Object} cabinetData - Full cabinet_portfolios.json
 * @returns {Object} MTFS comparison
 */
export function mtfsComparison(allDirectives, cabinetData) {
  const mtfs = cabinetData?.administration?.mtfs
  if (!mtfs || !allDirectives?.length) return null

  const totalCentral = allDirectives.reduce((s, d) => s + (d.save_central || 0), 0)
  const totalLow = allDirectives.reduce((s, d) => s + (d.save_low || 0), 0)
  const totalHigh = allDirectives.reduce((s, d) => s + (d.save_high || 0), 0)

  // Year 1 = immediate + short-term directives
  const year1Directives = allDirectives.filter(d => {
    const tl = (d.timeline || '').toLowerCase()
    return tl.includes('immediate') || tl.includes('0-3') || tl.includes('3-6') || tl.includes('short')
  })
  const year1Central = year1Directives.reduce((s, d) => s + (d.save_central || 0), 0)

  const target1 = mtfs.savings_targets?.['2026_27'] || 0
  const target2 = mtfs.savings_targets?.two_year_total || 0

  return {
    mtfs_year1_target: target1,
    mtfs_two_year_target: target2,
    identified_low: totalLow,
    identified_central: totalCentral,
    identified_high: totalHigh,
    year1_deliverable: year1Central,
    year1_coverage_pct: target1 ? Math.round(year1Central / target1 * 100) : null,
    two_year_coverage_pct: target2 ? Math.round(totalCentral / target2 * 100) : null,
    gap_or_surplus: totalCentral - target2,
    prior_year_shortfall: mtfs.prior_year_performance?.adult_services_shortfall || 0,
    cost_pressures: mtfs.cost_pressures_2026_27?.total || 0,
    redundancy_provision: mtfs.redundancy_provision || 0,
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
      ? `Reform ${political.reform_seats || 53}/${political.total_seats || 84}: comfortable majority (${majoritySize} over threshold)`
      : 'No overall control, requires cross-party support',
    shortcuts: value < 500000 ? ['Officer delegation: no formal member decision needed'] : [],
    call_in_risk: route === 'cabinet' || route === 'cabinet_member'
      ? `5 non-executive signatures required for call-in. ${political.opposition_seats || 31} opposition members.`
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
    total_value: normalised.reduce((s, c) => s + (c.value || 0), 0),
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
 * @returns {Object} Funding constraint analysis
 */
export function fundingConstraints(portfolio, fundingModel) {
  if (!portfolio || !fundingModel) return null
  const grants = (fundingModel.ring_fenced_grants || []).filter(g => g.portfolio === portfolio.id)
  const ringFencedTotal = grants.reduce((s, g) => s + (g.value || 0), 0)
  const totalBudget = portfolio.budget?.total || 0
  const addressable = Math.max(0, totalBudget - ringFencedTotal)
  return {
    total_budget: totalBudget,
    ring_fenced_total: ringFencedTotal,
    addressable,
    addressable_pct: totalBudget > 0 ? Math.round((addressable / totalBudget) * 1000) / 10 : 100,
    grants,
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

/**
 * Generate meeting briefing for a portfolio holder.
 *
 * @param {Object} meeting - Single meeting object
 * @param {Object} portfolio - Portfolio
 * @param {Object} data - { spending, findings, budgets, reformTransformation, dogeFindings }
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
  if (portfolio.budget_latest?.yoy_change) {
    briefing.data_points.push(`YoY change: ${portfolio.budget_latest.yoy_change}`)
  }

  // Use enriched demand_pressures if available, fall back to known_pressures
  const pressures = portfolio.demand_pressures?.length
    ? portfolio.demand_pressures.map(dp => dp.driver || dp.description || dp)
    : (portfolio.known_pressures || [])
  if (pressures.length) {
    briefing.data_points.push(`Key pressures: ${pressures.slice(0, 3).join('; ')}`)
  }

  // Key contracts awareness
  for (const contract of (portfolio.key_contracts || []).slice(0, 2)) {
    briefing.data_points.push(`Key contract: ${contract.provider}, ${contract.value || contract.note || ''}`)
  }

  // Likely opposition questions based on pressures and findings
  for (const pressure of pressures.slice(0, 3)) {
    const pressureText = typeof pressure === 'object' ? (pressure.driver || pressure.description) : pressure
    briefing.opposition_questions.push({
      question: `What is the Cabinet Member doing about: ${pressureText}?`,
      suggested_response: `Reform is addressing this through [specific action]. Unlike the previous administration, we are taking a data-driven approach with clear savings targets.`,
    })
  }

  // Tag agenda items with policy areas (from intelligenceEngine)
  const agendaItems = meeting.enriched_agenda || meeting.agenda_items || []
  const policyTagged = agendaItems.map(item => {
    const text = typeof item === 'string' ? item : (item.title || item.text || '')
    return {
      ...(typeof item === 'object' ? item : { title: item }),
      policy_areas: mapAgendaToPolicyAreas(text),
    }
  })
  briefing.agenda_policy_map = policyTagged

  // Attack and defence lines for each policy area found
  const allAreas = [...new Set(policyTagged.flatMap(i => i.policy_areas))]
  if (allAreas.length > 0) {
    briefing.attack_lines = {}
    briefing.defence_lines = {}
    for (const area of allAreas) {
      briefing.attack_lines[area] = getTopicAttackLines(area, {
        reformTransformation: data.reformTransformation,
        dogeFindings: data.dogeFindings || data.findings,
      })
      briefing.defence_lines[area] = buildReformDefenceLines(area, data.reformTransformation)
    }
  }

  // Reform achievement framing per agenda item
  briefing.reform_achievements = agendaItems.map(item => {
    const text = typeof item === 'string' ? item : (item.title || item.text || '')
    const areas = mapAgendaToPolicyAreas(text)
    return {
      item: text,
      reform_angle: areas.includes('budget_finance')
        ? 'Reform delivers transparent budgeting: every penny accounted for'
        : areas.includes('social_care')
        ? 'Reform protects frontline services while cutting waste'
        : areas.includes('transport_highways')
        ? 'Reform fixes roads: 67,439 potholes and counting'
        : areas.includes('council_tax')
        ? 'Reform keeps council tax below inflation: lowest increase in 12 years'
        : `Reform delivers on ${areas[0] || portfolio.short_title || 'local services'}`,
    }
  })

  // Borough election relevance - meetings within 120 days of May 2026
  const boroughDate = new Date(BOROUGH_ELECTION_DATE)
  const meetingDate = new Date(briefing.meeting_date)
  const daysToBorough = Math.ceil((boroughDate - meetingDate) / 86400000)
  briefing.borough_election_relevance = daysToBorough > 0 && daysToBorough < 120
  briefing.days_to_borough_elections = Math.max(0, daysToBorough)

  // Press release hooks
  briefing.press_hooks = []
  if (portfolio.budget_latest?.net_expenditure) {
    briefing.press_hooks.push(`${portfolio.cabinet_member?.name || 'Cabinet Member'} presents Reform's vision for ${formatCurrency(portfolio.budget_latest.net_expenditure)} ${portfolio.short_title || portfolio.title} portfolio`)
  }
  if (allAreas.includes('budget_finance')) {
    briefing.press_hooks.push('Reform delivers budget transparency: AI DOGE analysis reveals savings opportunities')
  }
  if (allAreas.includes('council_tax')) {
    briefing.press_hooks.push('Reform keeps council tax below inflation: lowest increase in 12 years')
  }
  if (briefing.borough_election_relevance) {
    briefing.press_hooks.push(`With borough elections ${daysToBorough} days away, Reform proves it can govern`)
  }

  return briefing
}


// ═══════════════════════════════════════════════════════════════════════
// Political Engine
// ═══════════════════════════════════════════════════════════════════════

/**
 * Assess political context for a portfolio's operations.
 *
 * Enhanced: borough election awareness (May 2026), Reform scrutiny premium,
 * PR narrative hooks, ripple effect to 12 Lancashire districts.
 *
 * @param {Object} portfolio - Portfolio
 * @param {Object} options - { elections, councillors, politicalHistory, dogeFindings, budgetSummary, collectionRates, politicsSummary }
 * @returns {Object} Political context
 */
export function politicalContext(portfolio, options = {}) {
  if (!portfolio) return null

  // Council-wide attack lines from strategy engine (when data available)
  const councilAttackLines = (options.dogeFindings || options.budgetSummary || options.collectionRates)
    ? generateCouncilAttackLines(
        options.dogeFindings,
        options.budgetSummary,
        options.collectionRates,
        options.politicsSummary
      )
    : []

  // Borough election context - May 2026
  const daysToBorough = daysUntilBoroughElections()

  return {
    portfolio_id: portfolio.id,
    cabinet_member: portfolio.cabinet_member?.name,
    ward: portfolio.cabinet_member?.ward,
    scrutiny_committee: portfolio.scrutiny_committee?.name,
    // Key political facts
    reform_majority: true,
    reform_seats: 53,
    total_seats: 84,
    majority_size: 10,
    opposition_parties: ['Progressive Lancashire', 'Conservative', 'Labour', 'Lib Dem', 'OWL'],
    // LGR context
    lgr_impact: 'Portfolio will transfer to unitary successor(s). Current reform period is window of opportunity.',
    lgr_deadline: '2028-04',
    // Electoral timing
    next_elections: '2029-05',
    time_to_deliver: 'Approx 3 years before next county elections',
    // Borough election context - Reform LCC performance directly influences borough outcomes
    borough_elections: {
      date: BOROUGH_ELECTION_DATE,
      days_away: daysToBorough,
      can_announce_before: daysToBorough > 14,
      districts_electing: LANCASHIRE_DISTRICTS,
      relevance: 'Reform LCC performance directly influences borough election prospects. Voters judge Reform locally by LCC delivery.',
    },
    // Reform scrutiny premium - new party gets disproportionate media attention
    scrutiny_premium: {
      factor: 2.5,
      reason: 'Reform UK is the first new party to control a major county council: every decision is national news potential',
      opportunity: 'Higher scrutiny means higher reward for good governance. Each success story travels further than it would for established parties.',
    },
    // PR narrative hooks for this portfolio
    reform_narrative_hooks: generatePortfolioNarrativeHooks(portfolio),
    // Intelligence engine cross-ref
    council_attack_lines: councilAttackLines,
    attack_line_count: councilAttackLines.length,
  }
}

/**
 * Assess political impact of a specific directive.
 *
 * Enhanced: Reform PR angle, affected ward archetypes, constituency resonance,
 * borough ripple effect, matched REFORM_REBUTTALS counter-narrative, electoral timing.
 *
 * @param {Object} directive - A directive
 * @param {Object} portfolio - Portfolio
 * @param {Object} options - { councillors, elections, wardPredictions, integrityData, fiscalData, constituencies }
 * @returns {Object} Impact assessment
 */
export function politicalImpactAssessment(directive, portfolio, options = {}) {
  if (!directive || !portfolio) return null

  const riskLevel = directive.risk || 'Medium'
  const isServiceChange = directive.type === 'savings_lever' || directive.type === 'structural'

  // Electoral intelligence - ward classification, entrenchment, fiscal stress
  let wardImpact = null
  const cabinetWard = portfolio.cabinet_member?.ward
  if (cabinetWard && options.elections) {
    const wardElection = options.elections.wards?.[cabinetWard]

    // Ward classification from strategy engine
    const prediction = options.wardPredictions?.[cabinetWard]
    const classification = prediction
      ? classifyWard(prediction, 'Reform UK', wardElection?.current_holders?.[0]?.party)
      : null

    // Entrenchment score from strategy engine
    const wardCouncillors = (options.councillors || []).filter(
      c => c.ward === cabinetWard || c.division === cabinetWard
    )
    const entrenchment = scoreIncumbentEntrenchment(wardElection, wardCouncillors, options.integrityData)

    // Fiscal stress from election model
    const fiscalStress = options.fiscalData
      ? calculateFiscalStressAdjustment(options.fiscalData, cabinetWard)
      : null

    wardImpact = {
      ward: cabinetWard,
      classification: classification?.classification || 'unknown',
      classification_label: classification?.label || null,
      entrenchment_score: entrenchment?.score || 0,
      entrenchment_level: entrenchment?.level || 'unknown',
      fiscal_stress: fiscalStress?.adjustment || 0,
    }
  }

  // Reform PR angle - how to frame this directive as a Reform win
  const reformPR = generateReformPRAngle(directive, portfolio)

  // Affected ward archetypes - which voter segments benefit
  const affectedArchetypes = PORTFOLIO_ARCHETYPE_RESONANCE[portfolio.id] || ['middle_ground']

  // Borough ripple - how this helps Reform borough candidates
  const boroughRipple = generateBoroughRipple(directive, portfolio)

  // Matched REFORM_REBUTTALS - best pre-scripted counter to likely opposition attack
  const matchedRebuttal = findMatchedRebuttal(directive, portfolio)

  // Constituency resonance - how this plays at Westminster level
  const constituencyResonance = generateConstituencyResonance(directive, portfolio, options)

  // Electoral timing - can this be announced before May 2026?
  const daysToBorough = daysUntilBoroughElections()
  const timeline = directive.timeline || ''
  const isImmediate = /immediate|0-3 month/i.test(timeline)

  // Forensic analytics - Benford + Gini when spending data provided
  let forensicSignal = null
  let marketConcentrationContext = null
  if (options.spending) {
    const amounts = (Array.isArray(options.spending) ? options.spending : options.spending.records || [])
      .map(r => r.amount || r.total || 0)
      .filter(a => a > 0)
    if (amounts.length > 0) {
      const benford = benfordSecondDigit(amounts)
      if (benford) {
        forensicSignal = {
          chi_squared: benford.chiSquared,
          significant: benford.significant,
          p_description: benford.pDescription,
          n: benford.n,
        }
      }
      const gini = giniCoefficient(amounts)
      marketConcentrationContext = {
        gini,
        level: gini > 0.8 ? 'extreme' : gini > 0.6 ? 'high' : gini > 0.4 ? 'moderate' : 'low',
      }
    }
  }

  // If Gini is high, enhance Reform PR angle with monopoly-breaking messaging
  const prAngle = (marketConcentrationContext && marketConcentrationContext.gini > 0.6)
    ? { ...reformPR, monopoly_angle: 'Reform is breaking supplier monopoly, opening procurement to fair competition' }
    : reformPR

  return {
    directive_id: directive.id,
    overall_risk: riskLevel,
    service_impact: isServiceChange ? 'Potential public-facing service change' : 'Internal process, no public impact',
    electoral_risk: riskLevel === 'High' ? 'Could affect Reform support in affected wards' : 'Minimal electoral risk',
    media_risk: directive.save_central > 5000000 ? 'Large savings figure may attract media attention' : 'Low media interest',
    opposition_angle: isServiceChange ? 'Opposition will characterise as "cuts to vital services"' : 'Difficult for opposition to attack internal efficiency',
    counter_narrative: isServiceChange
      ? 'Reform is reforming wasteful practices left by the previous administration while protecting frontline services'
      : 'This is good financial management: recovering money that should never have been spent',
    ward_impact: wardImpact,
    // Reform PR engine
    reform_pr: prAngle,
    affected_archetypes: affectedArchetypes,
    borough_ripple: boroughRipple,
    matched_rebuttal: matchedRebuttal,
    constituency_resonance: constituencyResonance,
    // Forensic analytics
    forensic_signal: forensicSignal,
    market_concentration_context: marketConcentrationContext,
    electoral_timing: {
      days_to_borough_elections: daysToBorough,
      can_announce_before_may: daysToBorough > 14,
      is_immediate_win: isImmediate && daysToBorough > 14,
      recommended_announcement: isImmediate && daysToBorough > 14
        ? 'Announce immediately: maximises borough election impact'
        : daysToBorough > 14
        ? 'Plan announcement for maximum impact before May'
        : 'Announce for long-term Reform credibility',
    },
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
    demand_pressures: portfolio.demand_pressures || [],
    key_contracts: portfolio.key_contracts || [],
    operational_context: portfolio.operational_context || null,
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

  // Add real-terms growth trend for LCC values where multi-year data exists
  for (const r of results) {
    const peerData = budgetsGovuk?.services?.[r.category] || budgetsGovuk?.categories?.[r.category]
    if (peerData?.years) {
      const years = Object.keys(peerData.years).sort()
      const lccValues = years.map(y => peerData.years[y]?.lancashire_cc ?? peerData.years[y]?.['Lancashire']).filter(v => v != null)
      if (lccValues.length >= 2 && years.length >= lccValues.length) {
        r.real_growth = realGrowthRate(lccValues, years.slice(0, lccValues.length))
      }
    }
  }

  return results.length > 0 ? results : null
}


/**
 * Financial health assessment combining reserves adequacy, CIPFA resilience,
 * materiality threshold and optional Benford screening.
 *
 * @param {Object} budgetSummary - Budget summary data (reserves, expenditure, council tax)
 * @param {Object} budgetsGovuk - GOV.UK budget data (for Benford screening of year totals)
 * @returns {Object|null} Financial health report
 */
export function financialHealthAssessment(budgetSummary, budgetsGovuk) {
  if (!budgetSummary) return null

  const reserves = budgetSummary.reserves?.total_closing || budgetSummary.reserves?.usable || 0
  const expenditure = budgetSummary.net_revenue_expenditure || budgetSummary.net_expenditure || 0

  const reservesResult = reservesAdequacy(reserves, expenditure)

  const resilience = cipfaResilience({
    reserves,
    expenditure,
    councilTaxDependency: budgetSummary.council_tax?.dependency_pct || null,
    debtRatio: budgetSummary.debt_ratio || null,
    interestPaymentsRatio: budgetSummary.interest_payments_ratio || null,
  })

  const matThreshold = materialityThreshold(expenditure)

  // Benford second-digit screening on year totals if enough data
  const yearTotals = []
  if (budgetsGovuk?.services) {
    for (const svc of Object.values(budgetsGovuk.services)) {
      if (svc?.authorities) {
        for (const v of Object.values(svc.authorities)) {
          if (typeof v === 'number' && v > 0) yearTotals.push(v)
        }
      }
    }
  }
  const benford = yearTotals.length >= 50 ? benfordSecondDigit(yearTotals) : null

  return {
    reserves: reservesResult,
    resilience,
    materiality: matThreshold,
    benford_screening: benford,
    summary: {
      reserves_months: reservesResult?.monthsCover || 0,
      reserves_rating: reservesResult?.rating || 'Unknown',
      overall_resilience: resilience?.overallRating || 'Unknown',
      overall_color: resilience?.overallColor || '#6c757d',
      materiality_threshold: matThreshold?.threshold || 0,
    },
  }
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


// ═══════════════════════════════════════════════════════════════════════
// Cross-Portfolio Dependencies
// ═══════════════════════════════════════════════════════════════════════

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
      const key = `${p.id}→${dep.portfolio || dep.to}`
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
    const key = `${fb.from}→${fb.to}`
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
 * @param {Object} options - { integrity, findings }
 * @returns {Object|null} Risk dashboard
 */
export function portfolioRiskDashboard(portfolio, spending, options = {}) {
  if (!portfolio) return null

  const risks = []
  let totalScore = 0

  // 1. Supplier concentration risk (existing + integrity-weighted)
  const supplierAnalysis = supplierPortfolioAnalysis(spending, { integrity: options.integrity })
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
    const pFindings = mapFindingsToPortfolio(options.findings, portfolio)
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


// ═══════════════════════════════════════════════════════════════════════
// Reform Narrative & Electoral Ripple
// ═══════════════════════════════════════════════════════════════════════

/**
 * Composite Reform PR narrative engine: generates comprehensive campaign material
 * from portfolio actions, directives, and electoral context.
 *
 * Every savings directive is campaign material. This function generates:
 * - Per-archetype messaging (targeted to ward demographics)
 * - Constituency-level talking points
 * - Press releases ready for media
 * - Borough campaign material (leaflet lines, social media, canvassing scripts)
 *
 * @param {Object} portfolio - Portfolio definition
 * @param {Array} directives - Directives for this portfolio
 * @param {Object} options - { elections, demographics, deprivation, constituencies }
 * @returns {Object|null} Comprehensive PR narrative package
 */
export function reformNarrativeEngine(portfolio, directives, options = {}) {
  if (!portfolio) return null

  const daysToBorough = daysUntilBoroughElections()

  // Classify directives by PR potential
  const prReady = (directives || []).filter(d => d.save_central > 0).sort((a, b) => b.save_central - a.save_central)
  const totalSavings = prReady.reduce((s, d) => s + d.save_central, 0)
  const immediateWins = prReady.filter(d => /immediate|0-3 month/i.test(d.timeline || ''))
  const title = portfolio.short_title || portfolio.title

  // Ward archetype messaging - which voter groups to target
  const archetypes = PORTFOLIO_ARCHETYPE_RESONANCE[portfolio.id] || ['middle_ground']
  const archetypeMessages = archetypes.map(arch => ({
    archetype: arch,
    message: getArchetypeMessage(arch, portfolio, totalSavings),
  }))

  // Constituency-level talking points
  const constituencyTalkingPoints = [
    `Reform at LCC: ${formatCurrency(totalSavings)} identified in ${title}`,
    'Lancashire proves Reform can govern responsibly, not just campaign',
    `${prReady.length} reform directives in ${title}: each one a broken promise by the old guard`,
  ]

  // "Reform Delivers" press releases from top immediate wins
  const pressReleases = immediateWins.slice(0, 3).map(d => ({
    headline: `Reform ${d.type === 'duplicate_recovery' ? 'recovers' : 'saves'} ${formatCurrency(d.save_central)} in ${title}`,
    standfirst: `${portfolio.cabinet_member?.name || 'Cabinet Member'} delivers on Reform's promise of accountability and efficiency`,
    key_fact: d.action,
    timing: daysToBorough > 14 ? 'Release before borough elections for maximum impact' : 'Release for long-term credibility',
  }))

  // Borough campaign material - leaflets, social media, canvassing scripts
  const boroughCampaign = {
    headline: `Reform at LCC: ${formatCurrency(totalSavings)} saved in ${title}`,
    leaflet_line: `Reform runs Lancashire County Council with transparency and accountability. ${formatCurrency(totalSavings)} saved in ${title} alone. Vote Reform on 7 May to bring the same standards to your borough.`,
    social_media: `Reform at LCC: ${formatCurrency(totalSavings)} identified in ${title}. The old guard missed it. We found it. #ReformDelivers #Lancashire`,
    canvassing_script: `Did you know Reform has identified ${formatCurrency(totalSavings)} in savings in ${title} at the county council? That's money wasted under the previous administration. We want to bring the same accountability to your borough council.`,
  }

  return {
    portfolio_id: portfolio.id,
    total_savings: totalSavings,
    directive_count: prReady.length,
    immediate_wins: immediateWins.length,
    // Electoral context
    days_to_borough_elections: daysToBorough,
    electoral_window: daysToBorough > 0 ? 'active' : 'post_election',
    // PR material
    archetype_messages: archetypeMessages,
    constituency_talking_points: constituencyTalkingPoints,
    press_releases: pressReleases,
    borough_campaign: boroughCampaign,
    // Narrative framing
    reform_narrative: generatePortfolioNarrativeHooks(portfolio),
    scrutiny_premium: 'Reform as a new governing party gets 2-3x media coverage. Use this: every announcement travels further.',
  }
}


/**
 * Assess the electoral ripple effect of LCC Reform actions on borough and
 * constituency elections across Lancashire.
 *
 * Reform's LCC performance has disproportionate impact because:
 * 1. First new party to control a major county council - inherently newsworthy
 * 2. Every decision gets 2-3x media scrutiny vs established parties
 * 3. Borough voters judge Reform locally by LCC delivery
 * 4. Constituency voters see LCC as proof Reform can govern nationally
 *
 * @param {Array} portfolioActions - Array of { portfolio, savings, directives_count }
 * @param {Object} options - { elections, demographics, deprivation, constituencies }
 * @returns {Object} Ripple assessment
 */
export function electoralRippleAssessment(portfolioActions, options = {}) {
  if (!portfolioActions?.length) return { district_impact: [], constituency_impact: {}, overall_score: 0 }

  const totalSavings = portfolioActions.reduce((s, a) => s + (a.savings || 0), 0)
  const totalDirectives = portfolioActions.reduce((s, a) => s + (a.directives_count || 0), 0)

  // Per-district impact scoring
  const districtImpact = LANCASHIRE_DISTRICTS.map(district => {
    const relevantActions = portfolioActions.filter(a => a.portfolio?.id && PORTFOLIO_ARCHETYPE_RESONANCE[a.portfolio.id])
    const districtSavings = relevantActions.reduce((s, a) => s + (a.savings || 0), 0)

    // Score: savings quantum + visible actions + scrutiny premium
    const savingsScore = Math.min(40, Math.round(districtSavings / 1000000))
    const visibilityScore = Math.min(30, relevantActions.length * 5)
    const scrutinyBonus = 20 // Reform always gets this
    const score = Math.min(100, savingsScore + visibilityScore + scrutinyBonus)

    return {
      district,
      impact_score: score,
      impact_level: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low',
      savings_attributed: districtSavings,
      talking_point: `Reform at LCC identified ${formatCurrency(districtSavings)} in savings affecting ${district.replace(/_/g, ' ')}. Borough candidates: bring Reform accountability to your council.`,
    }
  }).sort((a, b) => b.impact_score - a.impact_score)

  // Constituency-level impact
  const constituencyImpact = {
    message: `Reform controls LCC with 53/84 seats and has identified ${formatCurrency(totalSavings)} across ${totalDirectives} directives. Proof Reform can govern, not just protest.`,
    national_narrative: 'Lancashire is Reform\'s governance showcase. Every success undermines the "single-issue party" attack.',
    mp_challenge: `Lancashire MPs should explain why they didn't scrutinise ${formatCurrency(totalSavings)} in council waste. Reform volunteers did it for free.`,
  }

  // Overall ripple score (0-100)
  const overallScore = Math.min(100, Math.round(
    (totalSavings / 1000000) * 2 + totalDirectives * 3 + 20
  ))

  return {
    district_impact: districtImpact,
    constituency_impact: constituencyImpact,
    overall_score: overallScore,
    overall_level: overallScore >= 70 ? 'high' : overallScore >= 40 ? 'medium' : 'low',
    total_savings: totalSavings,
    total_directives: totalDirectives,
    scrutiny_premium: {
      factor: 2.5,
      explanation: 'Reform as a new governing party receives 2-3x more media attention per action. This amplifies both successes and failures.',
    },
    borough_election_date: BOROUGH_ELECTION_DATE,
    days_to_borough_elections: daysUntilBoroughElections(),
  }
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


// ═══════════════════════════════════════════════════════════════════════
// Directorate-Level Functions (Cabinet Command v2)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build a comprehensive savings profile for a directorate by aggregating
 * all its constituent portfolios' savings levers, evidence chains, and
 * MTFS targets.
 *
 * @param {Object} directorate - Directorate from cabinet_portfolios.json directorates[]
 * @param {Array} portfolios - All portfolios array
 * @param {Object} findings - doge_findings.json
 * @param {Object} cabinetData - Full cabinet_portfolios.json
 * @returns {Object} Directorate savings profile
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
  const mtfsTarget = directorate.mtfs_savings_target || 0
  const midpoint = (totalLow + totalHigh) / 2
  const coveragePct = mtfsTarget > 0 ? Math.round(midpoint / mtfsTarget * 100) : null

  // Prior year gap
  const priorTarget = directorate.prior_year_target || 0
  const priorAchieved = directorate.prior_year_achieved || 0
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
  }
}


/**
 * Score the evidence strength of a savings lever (0-100).
 *
 * Scoring: has data_points (20) + benchmark (20) + calculation (20)
 *   + kpi_link (20) + implementation_steps (20).
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
 * @returns {Object} { metrics[], improving[], stable[], declining[], kpi_headline }
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
 * @returns {Object} { directorate_id, portfolio_benchmarks[], summary }
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
 * @returns {Object} Risk dashboard
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
    const dsgForecast = p.operational_context?.dsg_write_off?.estimated_write_off
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

// ──────────────────────────────────────────────────────────────
// SEND & Children's Service Intelligence Functions
// ──────────────────────────────────────────────────────────────

/**
 * Project EHCP growth + placement costs over N years.
 * Models the cascade: EHCP identification → assessment → placement → transport → tribunal → DSG deficit.
 *
 * @param {Object} sendModel - send_cost_model from cabinet_portfolios.json
 * @param {number} years - Projection horizon (default 5)
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
  const basePlacementCost = placementTypes.reduce((sum, type) => sum + (placements[type]?.total || 0), 0)
  const baseEhcps = pipeline.total_ehcps || 12317
  const baseTransport = transport.total_cost || 0
  const baseTribunalCost = (tribunals.annual_tribunal_cost || 0) + (tribunals.annual_placement_cost_from_losses || 0)

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
    const dsgDeficit = dsg.current ? Math.round(dsg.current * Math.pow(1 + (dsg.annual_growth_rate || 0.38), y)) : 0

    // Per-placement breakdown for the year
    const placementBreakdown = {}
    for (const type of placementTypes) {
      if (!placements[type]) continue
      const count = Math.round((placements[type].count || 0) * factor)
      const cost = placements[type].avg_cost || 0
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
 * Compares cost of preventive programmes against reactive residential/foster care.
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
    const savingLow = fsm.potential_saving_low || 0
    const savingHigh = fsm.potential_saving_high || 0
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
  const avoidanceSaving = ei.lac_avoidance_saving_per_child || 55000
  const lacTotal = lac.total_lac || 0
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

  // 4. EP workforce conversion (agency → permanent)
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
      name: 'EP Agency→Permanent Conversion',
      agency_eps: ep.agency,
      conversion_target: conversionTarget,
      cost_pa: 0, // Recruitment cost offset by salary saving
      saving_pa: saving,
      net_saving: saving,
      evidence: `${ep.agency} agency EPs at £${ep.agency_day_rate}/day vs £${ep.permanent_equivalent_day}/day permanent`,
    })
  }

  const totalInterventionCost = programmes.reduce((sum, p) => sum + (p.cost_pa || 0), 0)
  const totalSaving = programmes.reduce((sum, p) => sum + (p.saving_pa || 0), 0)
  const totalNetSaving = programmes.reduce((sum, p) => sum + (p.net_saving || 0), 0)

  // Current reactive cost = residential placements + tribunal losses
  const residentialCost = Object.values(lac.by_placement || {}).reduce((sum, p) => sum + ((p.count || 0) * (p.avg_cost || 0)), 0)
  const tribunalCost = (sendModel?.tribunals?.annual_tribunal_cost || 0) + (sendModel?.tribunals?.annual_placement_cost_from_losses || 0)
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
 * Calculates savings from moving children from expensive independent placements to in-house.
 *
 * @param {Object} lacModel - lac_cost_model from cabinet_portfolios.json
 * @returns {Object} { current_cost, optimised_cost, saving, placements_moved, wocl_roi, timeline }
 */
export function lacPlacementOptimisation(lacModel) {
  if (!lacModel?.by_placement) return { current_cost: 0, optimised_cost: 0, saving: 0, placements_moved: [], wocl_roi: null, timeline: [] }

  const bp = lacModel.by_placement
  const wocl = lacModel.wocl_programme || {}

  // Current total cost
  const currentCost = Object.values(bp).reduce((sum, p) => sum + ((p.count || 0) * (p.avg_cost || 0)), 0)

  // Step-down opportunities (move from expensive → cheaper placements)
  const moves = []

  // 1. Independent fostering → In-house fostering (convert 20%)
  if (bp.foster_independent && bp.foster_in_house) {
    const moveCount = Math.round((bp.foster_independent.count || 0) * 0.2)
    const unitSaving = (bp.foster_independent.avg_cost || 0) - (bp.foster_in_house.avg_cost || 0)
    if (moveCount > 0 && unitSaving > 0) {
      moves.push({
        from: 'foster_independent',
        from_label: 'Independent Fostering',
        to: 'foster_in_house',
        to_label: 'In-house Fostering',
        count: moveCount,
        unit_saving: unitSaving,
        total_saving: moveCount * unitSaving,
        feasibility: 7,
        timeline: 'Medium-term (12-24 months)',
      })
    }
  }

  // 2. Independent residential → In-house residential (WOCL programme)
  if (bp.residential_independent && bp.residential_in_house && wocl.target_in_house_homes) {
    const additionalHomes = (wocl.target_in_house_homes || 0) - (wocl.current_in_house_homes || 0)
    const moveCount = Math.min(additionalHomes * 3, bp.residential_independent.count || 0) // ~3 children per home
    const unitSaving = wocl.saving_per_placement_pa || ((bp.residential_independent.avg_cost || 0) - (bp.residential_in_house.avg_cost || 0))
    if (moveCount > 0 && unitSaving > 0) {
      moves.push({
        from: 'residential_independent',
        from_label: 'Independent Residential',
        to: 'residential_in_house',
        to_label: 'In-house Residential (WOCL)',
        count: moveCount,
        unit_saving: unitSaving,
        total_saving: moveCount * unitSaving,
        feasibility: 6,
        timeline: 'Long-term (24-48 months)',
      })
    }
  }

  // 3. Residential → Specialist fostering (step-down)
  if (bp.residential_independent && bp.foster_independent) {
    const moveCount = Math.round((bp.residential_independent.count || 0) * 0.1) // 10% step-down
    const unitSaving = (bp.residential_independent.avg_cost || 0) - (bp.foster_independent.avg_cost || 0)
    if (moveCount > 0 && unitSaving > 0) {
      moves.push({
        from: 'residential_independent',
        from_label: 'Independent Residential',
        to: 'foster_independent',
        to_label: 'Specialist Foster Care',
        count: moveCount,
        unit_saving: unitSaving,
        total_saving: moveCount * unitSaving,
        feasibility: 5,
        timeline: 'Medium-term (12-24 months)',
      })
    }
  }

  const totalSaving = moves.reduce((sum, m) => sum + m.total_saving, 0)
  const optimisedCost = currentCost - totalSaving

  // WOCL ROI calculation
  // saving_per_placement_pa is the NET saving (independent cost minus in-house cost, running costs already included)
  let woclROI = null
  if (wocl.target_in_house_homes && wocl.current_in_house_homes) {
    const additionalHomes = wocl.target_in_house_homes - wocl.current_in_house_homes
    const capitalCost = additionalHomes * (wocl.capital_cost_per_home || 1200000)
    const annualRunning = additionalHomes * (wocl.annual_running_cost || 450000)
    const annualSaving = additionalHomes * 3 * (wocl.saving_per_placement_pa || 100000) // 3 children per home
    woclROI = {
      additional_homes: additionalHomes,
      capital_cost: capitalCost,
      annual_running_cost: annualRunning,
      annual_saving: annualSaving,
      net_annual: annualSaving, // saving_per_placement_pa already accounts for running costs vs independent placement
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
    current_cost: currentCost,
    optimised_cost: optimisedCost,
    saving: totalSaving,
    saving_pct: currentCost > 0 ? Math.round(totalSaving / currentCost * 1000) / 10 : 0,
    placements_moved: moves,
    wocl_roi: woclROI,
    timeline,
    residential_growth: lacModel.residential_growth || null,
  }
}

/**
 * Generate SEND-specific savings directives from cost model data.
 * Returns directive[] matching the standard schema for integration with generateDirectives.
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
      id: 'send_ep_conversion',
      type: 'service_model',
      tier: 'demand_management',
      owner: 'portfolio',
      action: `Convert ${Math.round(ep.agency * targetConversion)} of ${ep.agency} agency EPs to permanent. Agency premium is ${wf.agency_premium_pct || 167}%. Builds capacity AND cuts cost.`,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Medium-term (6-18 months)',
      legal_basis: 'Children and Families Act 2014: duty to provide educational psychology assessments',
      risk: 'Medium',
      risk_detail: 'Recruitment market competitive. Permanent EPs require 3-year doctorate. Consider grow-your-own via trainee programme.',
      steps: [
        'Benchmark permanent EP salary against agency day rate',
        'Launch "Grow Your Own" EP trainee programme (3 per year)',
        'Offer golden hellos (£10K) for permanent EP recruitment',
        'Negotiate volume agency rate reduction during transition',
        'Target 30% conversion in 18 months',
      ],
      governance_route: 'cabinet_decision',
      evidence: `${ep.agency} agency EPs at £${ep.agency_day_rate}/day vs £${ep.permanent_equivalent_day}/day permanent. Annual agency cost: ${formatCurrency(agencyCostPA)}`,
      priority: 'high',
      feasibility: 6,
      impact: 8,
    })
  }

  // 2. Transport Optimisation
  const transport = sendModel.transport || {}
  if (transport.total_cost > 0) {
    const ptb = transport.personal_travel_budgets || {}
    const tag = transport.transport_assistant_grants || {}
    const minibus = transport.minibus_programme || {}

    const ptbSaving = ((ptb.target || 0) - (ptb.current || 0)) * (ptb.avg_saving || 0)
    const tagSaving = ((tag.target || 0) - (tag.current || 0)) * (tag.avg_saving || 0)
    const minibusSaving = Math.round(transport.total_cost * (minibus.saving_per_passenger_pct || 0) / 100 * 0.1) // 10% of routes

    const saveLow = ptbSaving + tagSaving
    const saveHigh = ptbSaving + tagSaving + minibusSaving

    if (saveLow > 0) {
      directives.push({
        id: 'send_transport_optimisation',
        type: 'service_model',
        tier: 'demand_management',
        owner: 'portfolio',
        action: `Expand personal travel budgets (${ptb.current}→${ptb.target}) and transport assistant grants (${tag.current}→${tag.target}). Deploy ${minibus.vehicles || 0} Ford minibuses on highest-cost routes.`,
        save_low: saveLow,
        save_high: saveHigh,
        save_central: Math.round((saveLow + saveHigh) / 2),
        timeline: 'Short-term (3-6 months)',
        legal_basis: 'Education Act 1996 s.508B: home to school transport duty for EHCP pupils',
        risk: 'Low',
        risk_detail: 'Personal travel budgets are voluntary. Parents must consent. Some routes are too complex for independent travel.',
        steps: [
          `Identify ${(ptb.target || 0) - (ptb.current || 0)} additional families suitable for personal travel budgets`,
          `Recruit ${(tag.target || 0) - (tag.current || 0)} additional transport assistant grant recipients`,
          `Deploy Ford minibus fleet on top 10 highest cost-per-pupil routes`,
          'Negotiate volume taxi contract rates for remaining routes',
          'Implement route optimisation software across all SEND transport',
        ],
        governance_route: 'officer_delegation',
        evidence: `Total transport: ${formatCurrency(transport.total_cost)}, £${transport.cost_per_pupil}/pupil. Growth projection: +${formatCurrency(transport.growth_2026_27)} in 2026/27`,
        priority: 'high',
        feasibility: 8,
        impact: 7,
      })
    }
  }

  // 3. Placement Step-Down
  if (lacModel?.by_placement) {
    const optimisation = lacPlacementOptimisation(lacModel)
    if (optimisation.saving > 0) {
      directives.push({
        id: 'send_lac_placement_stepdown',
        type: 'service_model',
        tier: 'service_redesign',
        owner: 'portfolio',
        action: `Step-down ${optimisation.placements_moved.reduce((s, m) => s + m.count, 0)} LAC placements from independent to in-house. WOCL programme: ${lacModel.wocl_programme?.target_in_house_homes || 0} homes target.`,
        save_low: Math.round(optimisation.saving * 0.6),
        save_high: optimisation.saving,
        save_central: Math.round(optimisation.saving * 0.8),
        timeline: 'Long-term (18+ months)',
        legal_basis: 'Children Act 1989: sufficiency duty. Statutory guidance: in-house placements preferred.',
        risk: 'Medium',
        risk_detail: 'Requires capital investment in WOCL homes. Foster carer recruitment pipeline must expand. Ofsted registration timeline.',
        steps: optimisation.placements_moved.map(m => `Move ${m.count} from ${m.from_label} to ${m.to_label} (saving ${formatCurrency(m.unit_saving)}/placement)`),
        governance_route: 'cabinet_decision',
        evidence: `Current LAC cost: ${formatCurrency(optimisation.current_cost)}. ${optimisation.placements_moved.length} step-down pathways identified.`,
        priority: 'high',
        feasibility: 5,
        impact: 9,
      })
    }
  }

  // 4. Tribunal Reduction
  const tribunals = sendModel.tribunals || {}
  if (tribunals.appeals_registered_pa > 0) {
    const currentCost = (tribunals.annual_tribunal_cost || 0) + (tribunals.annual_placement_cost_from_losses || 0)
    const mediationTarget = 0.7 // Increase mediation to 70%
    const mediationSuccess = (tribunals.mediation_success_pct || 65) / 100
    const currentMediation = (tribunals.mediation_rate_pct || 0) / 100
    const additionalMediated = Math.round(tribunals.appeals_registered_pa * (mediationTarget - currentMediation))
    const appealsAvoided = Math.round(additionalMediated * mediationSuccess)
    const costPerAppealAvoided = (tribunals.avg_cost_per_tribunal || 0) + ((tribunals.parent_win_rate_pct || 94) / 100 * (tribunals.avg_cost_if_lost || 0))
    const saving = appealsAvoided * costPerAppealAvoided

    if (saving > 0) {
      directives.push({
        id: 'send_tribunal_reduction',
        type: 'service_model',
        tier: 'demand_management',
        owner: 'portfolio',
        action: `Increase mediation rate from ${tribunals.mediation_rate_pct}% to 70%, avoiding ~${appealsAvoided} tribunal appeals/year. Parents win ${tribunals.parent_win_rate_pct}%: early resolution is cheaper.`,
        save_low: Math.round(saving * 0.6),
        save_high: saving,
        save_central: Math.round(saving * 0.8),
        timeline: 'Medium-term (6-18 months)',
        legal_basis: 'SEND Code of Practice 2015: duty to resolve disputes without tribunal where possible',
        risk: 'Low',
        risk_detail: 'Mediation requires parental consent. Investment in SEND casework quality reduces appeals at source.',
        steps: [
          `Train ${Math.round(additionalMediated * 0.5)} additional mediators`,
          'Implement "early resolution" triage at EHCP annual review stage',
          'Publish transparent placement decision criteria',
          'Establish parent partnership service with dedicated caseworkers',
          'Monitor tribunal feedback to identify systemic decision failures',
        ],
        governance_route: 'officer_delegation',
        evidence: `${tribunals.appeals_registered_pa} appeals/year, parents win ${tribunals.parent_win_rate_pct}%. Cost: ${formatCurrency(currentCost)}/year`,
        priority: 'medium',
        feasibility: 7,
        impact: 6,
      })
    }
  }

  // 5. Early Intervention ROI-backed directive
  if (sendModel.early_intervention?.family_safeguarding_model) {
    const fsm = sendModel.early_intervention.family_safeguarding_model
    const saveLow = fsm.potential_saving_low || 8000000
    const saveHigh = fsm.potential_saving_high || 15000000
    directives.push({
      id: 'send_early_intervention',
      type: 'service_model',
      tier: 'service_redesign',
      owner: 'portfolio',
      action: `Implement Family Safeguarding Model. ${fsm.evidence_base}. Prevents children entering care system.`,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Long-term (18+ months)',
      legal_basis: 'Children Act 1989: preventive duty. DfE Innovation Programme evidence.',
      risk: 'Medium',
      risk_detail: 'Requires whole-system transformation. 2-3 year implementation. Evidence from Hertfordshire may not fully transfer.',
      steps: [
        'Commission feasibility study based on Hertfordshire model',
        'Recruit multi-disciplinary team (adult mental health, substance misuse, domestic abuse workers)',
        'Pilot in 2 districts with highest LAC rates',
        'Measure child safety outcomes at 6 and 12 months',
        'Scale across county if pilot shows >25% LAC reduction',
      ],
      governance_route: 'cabinet_decision',
      evidence: fsm.evidence_base || 'Hertfordshire: 46% reduction in children in care',
      priority: 'high',
      feasibility: 5,
      impact: 9,
    })
  }

  return directives
}

// ──────────────────────────────────────────────────────────────
// Adult Social Care Service Intelligence Functions
// ──────────────────────────────────────────────────────────────

/**
 * 5-year ASC demand projection based on demographics.
 * Models cost growth from ageing population, care type inflation, and market pressures.
 *
 * @param {Object} ascModel - asc_demand_model from cabinet_portfolios.json
 * @param {number} years - Projection horizon (default 5)
 * @returns {Object} { yearly: [], total_growth, demand_vs_savings_gap }
 */
export function ascDemandProjection(ascModel, years = 5) {
  if (!ascModel?.demographics) return { yearly: [], total_growth: 0, demand_vs_savings_gap: 0 }

  const demo = ascModel.demographics
  const costs = ascModel.care_type_costs || {}
  const market = ascModel.market_sustainability || {}
  const inflation = market.annual_cost_inflation || 42000000

  // Base year costs from care type data
  const residentialOlderCost = (costs.residential_older_people?.beds || 0) * (costs.residential_older_people?.avg_weekly_cost || 0) * 52
  const residentialNursingCost = (costs.residential_nursing?.beds || 0) * (costs.residential_nursing?.avg_weekly_cost || 0) * 52
  const homeCareFrameworkCost = (costs.home_care_framework?.hours_per_week || 0) * (costs.home_care_framework?.hourly_rate || 0) * 52
  const homeCareOffFrameworkCost = (costs.home_care_off_framework?.hours_per_week || 0) * (costs.home_care_off_framework?.hourly_rate || 0) * 52
  const ldCost = costs.ld_supported_living?.annual_cost || 0
  const dpCost = (costs.direct_payments?.recipients || 0) * (costs.direct_payments?.avg_annual || 0)
  const sharedLivesCost = (costs.shared_lives?.placements || 0) * (costs.shared_lives?.avg_cost || 0)

  const baseCost = residentialOlderCost + residentialNursingCost + homeCareFrameworkCost + homeCareOffFrameworkCost + ldCost + dpCost + sharedLivesCost

  const over65Growth = (demo.over_65?.growth_pct_pa || 2.1) / 100
  const over85Growth = (demo.over_85?.growth_pct_pa || 3.5) / 100
  const ldGrowth = (demo.working_age_ld?.growth_pct_pa || 1.8) / 100
  // Blended growth rate: 65+ drives home care, 85+ drives residential, LD has separate rate
  const blendedGrowth = (over65Growth * 0.4) + (over85Growth * 0.4) + (ldGrowth * 0.2)

  const yearly = []
  let cumulativeGrowth = 0

  for (let y = 0; y < years; y++) {
    const factor = Math.pow(1 + blendedGrowth, y)
    const inflationFactor = Math.pow(1.04, y) // 4% annual care cost inflation

    const over65 = Math.round((demo.over_65?.['2024'] || 248000) * Math.pow(1 + over65Growth, y))
    const over85 = Math.round((demo.over_85?.['2024'] || 32000) * Math.pow(1 + over85Growth, y))
    const wkAgLD = Math.round((demo.working_age_ld?.current || 4200) * Math.pow(1 + ldGrowth, y))

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

  const providerCount = (rop.providers || 0) + (costs.home_care_framework?.providers || 0) + (costs.home_care_off_framework?.providers || 0)
  const vacancyRate = rop.vacancy_pct || 0
  const closures = market.care_home_closures_3yr || 0
  const fairCostGap = rop.gap_per_week || 0
  const inflationPressure = market.annual_cost_inflation || 0

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

  const offFrameworkPct = costs.home_care_off_framework?.pct_of_total || 0
  if (offFrameworkPct > 30) riskScore += 10
  else if (offFrameworkPct > 20) riskScore += 5

  riskScore = Math.min(100, riskScore)
  const riskLevel = riskScore >= 60 ? 'critical' : riskScore >= 40 ? 'high' : riskScore >= 20 ? 'medium' : 'low'

  const mitigations = []
  if (fairCostGap > 0) mitigations.push({ action: `Close fair cost gap (£${fairCostGap}/week) to stabilise provider market`, impact: 'high', cost: Math.round(rop.beds * fairCostGap * 52) })
  if (offFrameworkPct > 20) mitigations.push({ action: `Reduce off-framework home care from ${offFrameworkPct}% to <20%`, impact: 'medium', saving: Math.round((costs.home_care_off_framework?.hours_per_week || 0) * ((costs.home_care_off_framework?.hourly_rate || 0) - (costs.home_care_framework?.hourly_rate || 0)) * 52 * 0.5) })
  if (costs.shared_lives?.placements) mitigations.push({ action: `Expand Shared Lives from ${costs.shared_lives.placements} to ${costs.shared_lives.placements + 50} placements`, impact: 'medium', saving: 50 * ((costs.shared_lives.vs_residential || 28000) - (costs.shared_lives.avg_cost || 15000)) })
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

  const currentRate = chcModel.current_recovery_rate_pct || 0
  const targetRate = chcModel.target_recovery_rate_pct || 10
  const avgClaim = chcModel.avg_claim_value || 28000
  const casesPA = chcModel.cases_reviewed_pa || 0
  const currentSuccessful = chcModel.successful_claims || 0

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
  if (chc && chc.current_recovery_rate_pct < (chc.target_recovery_rate_pct || 10)) {
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
          `Clear backlog of ${chc.cases_reviewed_pa || 0} cases per year`,
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
    const rateGap = (offFw.hourly_rate || 0) - (onFw.hourly_rate || 0)
    const hoursToConvert = Math.round((offFw.hours_per_week || 0) * 0.5) // Convert 50% to framework
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
    const netSaving = reab.potential_expansion.net_saving || 0
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
    const backlogSaving = Math.round(((demandPressures.assessment_backlog?.waiting || 0) + (demandPressures.annual_reviews_overdue || 0)) * 500) // £500 per digitally-assisted review
    directives.push({
      id: 'asc_digital_care',
      type: 'service_model',
      tier: 'service_redesign',
      owner: 'portfolio',
      action: `Deploy digital care technology to clear ${(demandPressures.assessment_backlog?.waiting || 0).toLocaleString()} assessment backlog + ${(demandPressures.annual_reviews_overdue || 0).toLocaleString()} overdue reviews. Self-service portals for lower-complexity cases.`,
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
      evidence: `${(demandPressures.assessment_backlog?.waiting || 0).toLocaleString()} waiting assessment (max ${demandPressures.assessment_backlog?.max_wait_days || 0} days), ${(demandPressures.annual_reviews_overdue || 0).toLocaleString()} overdue reviews`,
      priority: 'medium',
      feasibility: 5,
      impact: 7,
    })
  }

  return directives
}

// ──────────────────────────────────────────────────────────────
// Cross-Cutting Intelligence Engine Functions
// ──────────────────────────────────────────────────────────────

/**
 * Convert demand pressures to £M trajectories.
 * Quantifies qualitative "known_pressures" and "demand_pressures" into financial impact.
 *
 * @param {Object} portfolio - Portfolio object from cabinet_portfolios.json
 * @returns {Object} { pressures: [], total_annual, total_5yr, net_after_savings }
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
      annualImpact = (portfolio.budget_latest?.net_expenditure || 0) * 0.02 // 2% of budget
    } else if (text.match(/inflation|cost pressure|pay award|NLW|NI/i)) {
      annualImpact = (portfolio.budget_latest?.net_expenditure || 0) * 0.04 // 4% inflation
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
      const baseCost = Object.values(send.placement_costs || {}).reduce((s, p) => s + (p?.total || 0), 0)
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
      const demandGrowth = (portfolio.budget_latest?.net_expenditure || 0) * (asc.demographics.over_85.growth_pct_pa / 100)
      pressures.push({ name: 'Over-85 demographic growth (3.5% pa)', severity: 'high', annual_impact: Math.round(demandGrowth), '5yr_impact': Math.round(demandGrowth * 5) })
    }
  }

  if (serviceModel?.children_cost_model) {
    const cm = serviceModel.children_cost_model
    if (cm.lac_population?.residential_growth_pct_pa) {
      const residentialCost = (cm.lac_population?.in_residential || 0) * (cm.placement_costs?.residential_annual_per_child || 312000)
      const growth = Math.round(residentialCost * cm.lac_population.residential_growth_pct_pa / 100)
      pressures.push({ name: `Residential placement growth (${cm.lac_population.residential_growth_pct_pa}% pa)`, severity: 'critical', annual_impact: growth, '5yr_impact': growth * 5 })
    }
    if (cm.uasc_model?.annual_shortfall_total) {
      pressures.push({ name: 'UASC Home Office grant shortfall', severity: 'high', annual_impact: cm.uasc_model.annual_shortfall_total, '5yr_impact': cm.uasc_model.annual_shortfall_total * 5 })
    }
    if (cm.agency_workforce?.agency_premium_per_sw) {
      const agencyCount = cm.agency_workforce?.apprentices_uclan || 97
      const premium = cm.agency_workforce.agency_premium_per_sw * agencyCount
      pressures.push({ name: 'Agency social worker premium', severity: 'high', annual_impact: premium, '5yr_impact': premium * 5 })
    }
  }

  if (serviceModel?.public_health_model) {
    const ph = serviceModel.public_health_model
    if (ph.grant?.real_terms_decline_pct_pa) {
      const decline = Math.round((ph.grant?.total_public_health_grant || 0) * ph.grant.real_terms_decline_pct_pa / 100)
      pressures.push({ name: `PH grant real-terms decline (${ph.grant.real_terms_decline_pct_pa}% pa)`, severity: 'high', annual_impact: decline, '5yr_impact': decline * 5 })
    }
    if (ph.substance_misuse?.ssmtr_adder_value) {
      pressures.push({ name: 'SSMTR/ADDER supplemental grant cliff edge', severity: 'critical', annual_impact: ph.substance_misuse.ssmtr_adder_value, '5yr_impact': ph.substance_misuse.ssmtr_adder_value * 5 })
    }
  }

  if (serviceModel?.property_cost_model) {
    const prop = serviceModel.property_cost_model
    if (prop.disposal_programme?.backlog_growth_pct_pa) {
      const backlog = prop.estate_summary?.maintenance_backlog_known || 5000000
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
  const budget = portfolio.budget_latest?.net_expenditure || 0
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
  const cost = remediation.improvement_plan_cost || 0
  const interventionCost = remediation.cost_of_intervention_if_inadequate || 0

  // Estimate months based on improvement path
  let estMonths = 18
  if (current === 'Inadequate') estMonths = 24
  else if (current === 'Requires Improvement') estMonths = 15
  else if (current === 'Good') estMonths = 12

  const roi = interventionCost > 0
    ? `${formatCurrency(cost)} spent to avoid ${formatCurrency(interventionCost)} intervention (${Math.round(interventionCost / cost)}× return)`
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
 * @returns {Object} { yearly: [], breakeven_year, trajectory }
 */
export function netFiscalTrajectory(portfolio, demandData, directives, years = 5) {
  if (!portfolio) return { yearly: [], breakeven_year: null, trajectory: 'unknown' }

  const annualDemand = demandData?.total_annual || 0
  const totalSavings = (directives || []).reduce((s, d) => s + (d.save_central || 0), 0)

  // Categorize directives by timeline for phased saving delivery
  const immediateSavings = (directives || []).filter(d => d.timeline?.match(/immediate|0-3/i)).reduce((s, d) => s + (d.save_central || 0), 0)
  const shortTermSavings = (directives || []).filter(d => d.timeline?.match(/short|3-6/i)).reduce((s, d) => s + (d.save_central || 0), 0)
  const mediumTermSavings = (directives || []).filter(d => d.timeline?.match(/medium|6-18/i)).reduce((s, d) => s + (d.save_central || 0), 0)
  const longTermSavings = (directives || []).filter(d => d.timeline?.match(/long|18/i)).reduce((s, d) => s + (d.save_central || 0), 0)

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
 * Highway asset deterioration vs investment trajectory
 * Projects backlog growth over N years given investment and deterioration rates
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
 * Waste disposal cost comparison: landfill vs MBT vs EfW scenarios
 * Models landfill tax trajectory, food waste mandate, and EfW procurement ROI
 */
export function wasteDisposalComparison(wasteModel) {
  if (!wasteModel?.disposal_costs) return { current_cost: 0, scenarios: [], food_waste_impact: 0, efw_saving: 0, landfill_tax_5yr: [] }

  const costs = wasteModel.disposal_costs
  const currentCost = wasteModel.total_disposal_cost ?? (
    (costs.landfill?.total ?? 0) + (costs.mbt?.total ?? 0) + (costs.recycling?.total ?? 0)
  )

  // Landfill tax trajectory
  const taxTrajectory = wasteModel.landfill_tax_trajectory || {}
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
 * Generate asset-specific directives from highway and waste service models
 * Either or both models can be provided
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
        action: `DO: Complete LED conversion of remaining ${(led.remaining || 0).toLocaleString()} columns. SAVE: £${((led.dimming_saving_pa || 0) / 1000000).toFixed(1)}M/yr energy saving. HOW: Accelerate column replacement programme, target 100% conversion within 18 months.`,
        save_low: (led.dimming_saving_pa || 0) * 0.8,
        save_high: (led.dimming_saving_pa || 0) * 1.2,
        save_central: led.dimming_saving_pa || 0,
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
        action: `DO: Expand managed highways service to full network coverage. SAVE: ${managed.reduction_pct}% defect reduction, ${((1 - managed.cost_after_per_sqm / managed.cost_before_per_sqm) * 100).toFixed(0)}% unit cost reduction. EVIDENCE: ${managed.defects_before?.toLocaleString()} → ${managed.defects_after?.toLocaleString()} defects in ${managed.months_live} months. HOW: Extend managed service contract scope, integrate AI inspections.`,
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
        action: `DO: Enforce s59 NRSWA overrun charges on utility works. SAVE: £${((s59.potential_income || 0) / 1000000).toFixed(1)}M/yr potential income. LEGAL: NRSWA 1991 s59, TMA 2004. HOW: Deploy overrun monitoring, automated breach detection at ${(s59.utility_works_pa || 0).toLocaleString()} utility works/year.`,
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
      action: `DO: Shift from reactive to preventative maintenance. SAVE: Preventative treatments cost ${Math.round(((highwayModel.lifecycle_cost_per_km_pa?.surface_dressing || 3750) / (highwayModel.lifecycle_cost_per_km_pa?.reconstruction || 18750)) * 100)}% of reconstruction. EVIDENCE: £${((summary.maintenance_backlog || 0) / 1000000000).toFixed(1)}B backlog growing at £${((summary.annual_deterioration - summary.annual_investment) / 1000000).toFixed(0)}M/yr. HOW: Asset management investment strategy, lifecycle modelling, condition-based prioritisation.`,
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
    const costs = wasteModel.disposal_costs || {}
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
        action: `DO: Resume EfW procurement. SAVE: £${((efw.potential_saving_pa || 0) / 1000000).toFixed(0)}M/yr once operational. EVIDENCE: Landfill rate ${wasteModel.landfill_rate_pct}% vs national ${wasteModel.national_avg_landfill_pct}% (${wasteModel.ratio_to_national}× national). HOW: Restart procurement, secure planning, ${efw.timeline_years}-year build programme. Capital: £${((efw.capital_cost || 0) / 1000000).toFixed(0)}M.`,
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
        action: `DO: Prepare for food waste collection mandate (${foodWaste.effective || '2026'}). SAVE: Avoid non-compliance penalties. LEGAL: Environment Act 2021 s57. HOW: Procure food waste collection fleet, secure anaerobic digestion capacity. Annual cost: £${((foodWaste.est_annual_cost || 0) / 1000000).toFixed(0)}M, capital: £${((foodWaste.capital_required || 0) / 1000000).toFixed(0)}M.`,
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
    if ((market.duopoly_pct || 0) > 70) {
      directives.push({
        id: `asset-waste-market-${now}`,
        type: 'procurement',
        tier: 2,
        owner: 'corporate',
        action: `DO: Diversify waste disposal market. Current duopoly controls ${market.duopoly_pct}% (HHI: ${market.hhi}). SAVE: Competition-driven price reduction 5-10%. HOW: New waste strategy (expired ${wasteModel.expired_waste_strategy}), market engagement, lot structuring for SME access.`,
        save_low: (wasteModel.total_disposal_cost || 0) * 0.03,
        save_high: (wasteModel.total_disposal_cost || 0) * 0.08,
        save_central: (wasteModel.total_disposal_cost || 0) * 0.05,
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
 * Build unified fiscal system overview across all portfolios
 * Returns per-portfolio service model coverage, demand vs savings, inspection status
 */
export function fiscalSystemOverview(portfolios) {
  if (!Array.isArray(portfolios) || portfolios.length === 0) return { portfolios: [], total_demand: 0, total_savings: 0, coverage_pct: 0, inspection_summary: [], service_model_coverage: 0 }

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
  }
}

/**
 * Summarise highways intelligence from asset model, traffic, and roadworks data
 * Designed to wire existing highways_assets/traffic/roadworks data into Cabinet Command
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
      const utilityWorks = total - (operators['Lancashire County Council'] || 0)
      result.utility_coordination_score = total > 0 ? Math.round((1 - utilityWorks / total) * 100) : 50
    }
  }

  return result
}

/**
 * Project children's services cost trajectory.
 * Models LAC residential growth, placement costs, agency workforce premium, UASC shortfall.
 *
 * @param {Object} childrenModel - children_cost_model from cabinet_portfolios.json
 * @param {number} years - Projection horizon (default 5)
 * @returns {Object} { yearly, base_cost, total_5yr_cost, growth_rate, cost_breakdown, wocl_trajectory }
 */
export function childrenCostProjection(childrenModel, years = 5) {
  if (!childrenModel?.lac_population) return { yearly: [], base_cost: 0, total_5yr_cost: 0, growth_rate: 0, cost_breakdown: {}, wocl_trajectory: [] }

  const lac = childrenModel.lac_population
  const costs = childrenModel.placement_costs || {}
  const agency = childrenModel.agency_workforce || {}
  const uasc = childrenModel.uasc_model || {}
  const wocl = childrenModel.wocl_programme || {}
  const growthRate = (lac.residential_growth_pct_pa ?? 13.3) / 100

  // Base costs
  const baseResidentialCount = lac.in_residential || 262
  const baseResidentialCost = baseResidentialCount * (costs.residential_annual_per_child || 312000)
  const baseFosterCount = (lac.current || 1699) - baseResidentialCount - (uasc.uasc_in_care || 0)
  const baseFosterCost = baseFosterCount * (costs.fostering_annual_per_child || 30000)
  const baseAgencyPremium = (agency.apprentices_uclan || 0) * (agency.agency_premium_per_sw || 20000)
    + (agency.agency_eps_send || 0) * ((agency.ep_agency_daily || 800) - (agency.ep_permanent_daily || 300)) * 200
  const baseUascShortfall = uasc.annual_shortfall_total || 0
  const baseCost = baseResidentialCost + baseFosterCost + baseAgencyPremium + baseUascShortfall

  const yearly = []
  let cumulativeCost = 0

  for (let y = 0; y < years; y++) {
    const resFactor = Math.pow(1 + growthRate, y)
    const residentialCount = Math.round(baseResidentialCount * resFactor)
    const residentialCost = Math.round(residentialCount * (costs.residential_annual_per_child || 312000))

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
      lac_count: Math.round((lac.current || 1699) * Math.pow(1.02, y)),
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
  const currentHomes = wocl.current_homes || 15
  const targetHomes = wocl.target_homes || 30
  const homesPerYear = Math.ceil((targetHomes - currentHomes) / years)
  for (let y = 0; y < years; y++) {
    const homes = Math.min(currentHomes + homesPerYear * (y + 1), targetHomes)
    const beds = Math.round(homes * ((wocl.target_beds || 100) / (wocl.target_homes || 30)))
    const saving = (homes - currentHomes) * (wocl.saving_per_placement_pa || 100000)
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
  const wocl = childrenModel.wocl_programme || {}
  const agency = childrenModel.agency_workforce || {}
  const family = childrenModel.family_safeguarding || {}
  const uasc = childrenModel.uasc_model || {}
  const ifa = childrenModel.ifa_contract || {}

  // 1. WOCL Residential Expansion
  if (wocl.current_homes || wocl.target_homes) {
    const additionalHomes = (wocl.target_homes || 30) - (wocl.current_homes || 15)
    const saveLow = additionalHomes * (wocl.saving_per_placement_pa || 100000) * 0.5
    const saveHigh = additionalHomes * (wocl.saving_per_placement_pa || 100000)
    directives.push({
      id: 'children_wocl_expansion',
      type: 'service_model',
      tier: 'service_redesign',
      owner: 'portfolio',
      action: `DO: Expand WOCL programme from ${wocl.current_homes || 15} to ${wocl.target_homes || 30} in-house children's homes. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} pa vs agency placements at £${((childrenModel.placement_costs?.agency_residential_weekly || 6000) * 52).toLocaleString()} pa per child. HOW: Capital programme £${formatCurrency((wocl.capital_cost_per_home || 1200000) * additionalHomes)} over 3 years. EVIDENCE: In-house running cost £${formatCurrency(wocl.annual_running_cost_per_home || 450000)}/home vs agency £${formatCurrency(wocl.agency_equivalent_cost || 17400000)} equivalent.`,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Long-term (18+ months)',
      legal_basis: 'Children Act 1989 s22G: sufficiency duty to provide accommodation within local authority area',
      risk: 'Medium',
      risk_detail: 'Capital programme delivery risk; Ofsted registration required per home; staffing recruitment in competitive market',
      steps: ['Complete business cases for next 5 homes', 'Secure capital funding through prudential borrowing', 'Identify and acquire suitable properties', 'Register with Ofsted and recruit staff teams', 'Transition placements from agency to in-house'],
      governance_route: 'cabinet_decision',
      evidence: `Current: ${wocl.current_homes || 15} homes, ${wocl.current_beds || 60} beds. Target: ${wocl.target_homes || 30} homes. Net saving at capacity: ${formatCurrency(wocl.net_saving_at_capacity || 2100000)} pa.`,
      priority: 'high',
      feasibility: 6,
      impact: 8,
    })
  }

  // 2. Agency Workforce Conversion
  if (agency.apprentices_uclan || agency.agency_eps_send) {
    const swSaving = (agency.apprentices_uclan || 97) * (agency.agency_premium_per_sw || 20000)
    const epSaving = (agency.agency_eps_send || 110) * ((agency.ep_agency_daily || 800) - (agency.ep_permanent_daily || 300)) * 200
    const saveLow = Math.round((swSaving + epSaving) * 0.4)
    const saveHigh = Math.round((swSaving + epSaving) * 0.7)
    directives.push({
      id: 'children_agency_conversion',
      type: 'service_model',
      tier: 'demand_management',
      owner: 'portfolio',
      action: `DO: Convert agency social workers and EPs to permanent staff. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} pa. HOW: Accelerate UCLan apprentice programme (${agency.apprentices_uclan || 97} on programme), recruit ${agency.nqsws_jan_2025 || 20} NQSWs. EVIDENCE: Agency SW premium ${agency.agency_premium_pct_low || 40}-${agency.agency_premium_pct_high || 60}% above permanent; EP agency rate £${agency.ep_agency_daily || 800}/day vs permanent £${agency.ep_permanent_daily || 300}/day.`,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Medium-term (6-18 months)',
      legal_basis: 'Children Act 2004 s11: workforce sufficiency; Social Work England registration requirements',
      risk: 'Low',
      risk_detail: 'Competitive recruitment market; retention requires competitive packages; UCLan pipeline has 2-year lag',
      steps: ['Complete agency spend audit per team', 'Identify high-performing agency workers for conversion offers', 'Accelerate UCLan apprentice progression to qualification', 'Implement retention premiums for hard-to-fill roles', 'Set quarterly agency reduction targets by service area'],
      governance_route: 'officer_delegation',
      evidence: `Current: ${agency.apprentices_uclan || 97} apprentices, ${agency.nqsws_jan_2025 || 20} NQSWs. Agency EP cost: £${((agency.agency_eps_send || 110) * (agency.ep_agency_daily || 800) * 200).toLocaleString()} pa.`,
      priority: 'high',
      feasibility: 7,
      impact: 7,
    })
  }

  // 3. Family Safeguarding Expansion
  if (family.children_before || family.edge_of_care_posts_target) {
    const reductionRate = (family.reduction_pct || 26) / 100
    const saveLow = Math.round((family.edge_of_care_posts_target || 20) * (family.cost_per_family || 15000) * reductionRate * 0.5)
    const saveHigh = Math.round((family.edge_of_care_posts_target || 20) * (family.cost_per_family || 15000) * reductionRate)
    directives.push({
      id: 'children_family_safeguarding',
      type: 'service_model',
      tier: 'demand_management',
      owner: 'portfolio',
      action: `DO: Expand Family Safeguarding edge-of-care programme to ${family.edge_of_care_posts_target || 20} posts. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} pa through LAC diversion. HOW: Recruit edge-of-care workers at £${formatCurrency(family.edge_of_care_annual_cost || 800000)} pa total. EVIDENCE: ${family.reduction_pct || 26}% reduction in children on CP plans (${family.children_before || 388} → ${family.children_after || 286}).`,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Medium-term (6-18 months)',
      legal_basis: 'Children Act 1989 s17: duty to safeguard and promote welfare; Working Together 2023',
      risk: 'Low',
      risk_detail: 'Proven model with evidence base; risk is under-recruitment not programme design',
      steps: ['Complete business case with Hertfordshire evidence base', 'Recruit 20 edge-of-care posts', 'Establish multi-agency working protocols', 'Implement outcome tracking framework', 'Report quarterly LAC diversion rates to cabinet'],
      governance_route: 'cabinet_decision',
      evidence: `Family Safeguarding: ${family.children_before || 388} → ${family.children_after || 286} children (${family.reduction_pct || 26}% reduction). Cost per family: £${(family.cost_per_family || 15000).toLocaleString()}.`,
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
      action: `DO: Maximise UASC Home Office grant recovery. SAVE: ${formatCurrency(uasc.recoverable_estimate_low || 2000000)}-${formatCurrency(uasc.recoverable_estimate_high || 4000000)} pa. HOW: Challenge HO rates for ${uasc.uasc_in_care || 180} UASC + ${uasc.care_leavers || 58} care leavers. EVIDENCE: Daily shortfall £${uasc.daily_shortfall_estimate || 100}/child; total annual shortfall £${formatCurrency(uasc.annual_shortfall_total)}.`,
      save_low: uasc.recoverable_estimate_low || 2000000,
      save_high: uasc.recoverable_estimate_high || 4000000,
      save_central: Math.round(((uasc.recoverable_estimate_low || 2000000) + (uasc.recoverable_estimate_high || 4000000)) / 2),
      timeline: 'Short-term (3-6 months)',
      legal_basis: 'Immigration Act 2016 s69: National Transfer Scheme; Home Office UASC funding instructions',
      risk: 'Medium',
      risk_detail: 'Home Office discretionary; NTS compliance required; political sensitivity around asylum costs',
      steps: ['Audit actual costs per UASC age bracket', 'Submit evidenced claim to Home Office', 'Engage ADCS network for collective lobbying', 'Explore NTS transfer opportunities for over-quota', 'Implement monthly cost tracking per UASC'],
      governance_route: 'officer_delegation',
      evidence: `${uasc.uasc_in_care || 180} UASC in care, ${uasc.care_leavers || 58} care leavers. HO grant: £${uasc.ho_grant_under_16_daily || 143}/day (u16), £${uasc.ho_grant_16_17_daily || 200}/day (16-17). Actual cost: £${uasc.actual_cost_daily_low || 200}-${uasc.actual_cost_daily_high || 400}/day.`,
      priority: 'high',
      feasibility: 6,
      impact: 6,
    })
  }

  // 5. IFA Contract Optimisation
  if (ifa.value_total) {
    const offContractValue = Math.round((ifa.value_total || 155000000) * (ifa.off_contract_pct || 4) / 100)
    const saveLow = Math.round(offContractValue * 0.1)
    const saveHigh = Math.round(offContractValue * 0.25)
    directives.push({
      id: 'children_ifa_optimisation',
      type: 'service_model',
      tier: 'procurement',
      owner: 'portfolio',
      action: `DO: Reduce off-contract IFA placements from ${ifa.off_contract_pct || 4}% to <1%. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} pa. HOW: Enforce through-Lancashire routing (currently ${ifa.through_lancashire_pct || 85}%) on £${formatCurrency(ifa.value_total || 155000000)} ${ifa.duration_years || 9}-year framework. EVIDENCE: ${ifa.through_local_regional_pct || 96}% through local/regional providers; off-contract volume: ${formatCurrency(offContractValue)}.`,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Short-term (3-6 months)',
      legal_basis: 'Public Contracts Regulations 2015; Sufficiency Duty (Children Act 1989 s22G)',
      risk: 'Low',
      risk_detail: 'Contract terms already in place; enforcement requires operational discipline',
      steps: ['Audit all current off-contract placements', 'Issue compliance notices to commissioning teams', 'Establish escalation protocol for emergency off-contract', 'Report monthly off-contract rate to DCS', 'Benchmark rates against framework pricing'],
      governance_route: 'officer_delegation',
      evidence: `IFA framework: £${formatCurrency(ifa.value_total || 155000000)} over ${ifa.duration_years || 9} years. Through-Lancashire: ${ifa.through_lancashire_pct || 85}%. Off-contract: ${ifa.off_contract_pct || 4}%.`,
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
 * @returns {Object} { yearly, base_grant, grant_decline_5yr, total_prevention_roi, monopoly_risk_value, supplemental_cliff }
 */
export function publicHealthProjection(phModel, years = 5) {
  if (!phModel?.grant) return { yearly: [], base_grant: 0, grant_decline_5yr: 0, total_prevention_roi: 0, monopoly_risk_value: 0, supplemental_cliff: null }

  const grant = phModel.grant
  const prevention = phModel.prevention_roi || {}
  const hcrg = phModel.hcrg_monopoly || {}
  const substance = phModel.substance_misuse || {}

  const baseGrant = grant.total_public_health_grant || 0
  const supplemental = grant.drug_alcohol_supplemental || 0
  const declineRate = (grant.real_terms_decline_pct_pa ?? 2.5) / 100

  // Prevention spend & avoidance totals
  const preventionCategories = ['falls', 'smoking', 'obesity', 'physical_activity']
  const totalPreventionSpend = preventionCategories.reduce((s, cat) => s + (prevention[cat]?.annual_spend || 0), 0)
  const totalPreventionAvoidance = preventionCategories.reduce((s, cat) => {
    const p = prevention[cat]
    return s + (p?.asc_avoidance_pa || p?.nhs_avoidance_pa || p?.health_saving_pa || 0)
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
    const hcrgCost = Math.round((hcrg.annual_equivalent || 0) * Math.pow(1.03, y))

    // Substance misuse - CGL continues, supplemental ends
    const substanceCost = (substance.cgl_annual || 0) + (y === 0 ? (substance.ssmtr_adder_value || 0) : 0)

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
    monopoly_risk_value: hcrg.annual_equivalent || 0,
    supplemental_cliff: supplemental > 0 ? { value: supplemental, end_date: substance.ssmtr_adder_end_date || null } : null,
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
  const hcrg = phModel.hcrg_monopoly || {}
  const substance = phModel.substance_misuse || {}
  const prevention = phModel.prevention_roi || {}
  const inequalities = phModel.health_inequalities || {}
  const grant = phModel.grant || {}

  // 1. HCRG Recommissioning
  if (hcrg.annual_equivalent) {
    const saveLow = Math.round(hcrg.annual_equivalent * (hcrg.benchmark_saving_pct_low || 10) / 100)
    const saveHigh = Math.round(hcrg.annual_equivalent * (hcrg.benchmark_saving_pct_high || 15) / 100)
    directives.push({
      id: 'ph_hcrg_recommission',
      type: 'service_model',
      tier: 'procurement',
      owner: 'portfolio',
      action: `DO: Recommission HCRG community health contract. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} pa. HOW: Competitive tender to break HHI ${hcrg.hhi || 3615} monopoly (${hcrg.category_spend_pct || 85}% single supplier). EVIDENCE: Zero Contracts Finder publications; ${hcrg.market_alternatives || 3} alternative providers identified; benchmark savings ${hcrg.benchmark_saving_pct_low || 10}-${hcrg.benchmark_saving_pct_high || 15}%.`,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Long-term (18+ months)',
      legal_basis: 'Public Contracts Regulations 2015; Provider Selection Regime 2024; Health and Care Act 2022',
      risk: 'High',
      risk_detail: 'Service continuity risk during transition; TUPE obligations; political sensitivity; dual entity structure complicates procurement',
      steps: ['Commission independent market review', 'Publish Prior Information Notice on Contracts Finder', 'Develop lot structure to enable SME participation', 'Run competitive dialogue with minimum 3 bidders', 'Implement 6-month transition period with incumbent'],
      governance_route: 'cabinet_decision',
      evidence: `HCRG: ${formatCurrency(hcrg.annual_equivalent)} pa. HHI: ${hcrg.hhi || 3615}. Dual entity: ${hcrg.dual_entity ? 'Yes' : 'No'}. CF published: ${hcrg.contracts_finder_published ?? 0}. Monthly rebilling: ${formatCurrency(hcrg.rebilling_pattern_monthly || 0)}.`,
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
      action: `DO: Review CGL substance misuse contract ahead of SSMTR/ADDER cliff edge. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} pa. HOW: Prepare service redesign for loss of £${formatCurrency(substance.ssmtr_adder_value || 10600000)} supplemental funding (ends ${substance.ssmtr_adder_end_date || '2025-03-31'}). EVIDENCE: CGL dual entity; total substance misuse spend ${formatCurrency(substance.total_substance_misuse_annual || 25000000)} pa.`,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Medium-term (6-18 months)',
      legal_basis: 'Care Act 2014 s6B: drug and alcohol dependence; Misuse of Drugs Act 1971',
      risk: 'Medium',
      risk_detail: 'Supplemental funding cliff edge creates service gap; demand unlikely to reduce; CGL dual entity complicates novation',
      steps: ['Map all SSMTR/ADDER funded posts and activities', 'Model service levels post-supplemental', 'Negotiate CGL contract variation or exit provisions', 'Develop contingency commissioning plan', 'Brief cabinet on funding cliff timeline'],
      governance_route: 'cabinet_decision',
      evidence: `CGL: ${formatCurrency(substance.cgl_annual)} pa. SSMTR/ADDER: ${formatCurrency(substance.ssmtr_adder_value || 0)} (time-limited). We Are With You: ${formatCurrency(substance.we_are_with_you_value_20mo || 0)} (20mo).`,
      priority: 'high',
      feasibility: 6,
      impact: 7,
    })
  }

  // 3. Prevention Invest-to-Save
  const preventionCategories = ['falls', 'smoking', 'obesity', 'physical_activity']
  const totalAvoidance = preventionCategories.reduce((s, cat) => {
    const p = prevention[cat]
    return s + (p?.asc_avoidance_pa || p?.nhs_avoidance_pa || p?.health_saving_pa || 0)
  }, 0)
  if (totalAvoidance > 0) {
    const expansionPct = 0.2 // 20% expansion of prevention spend
    const totalSpend = preventionCategories.reduce((s, cat) => s + (prevention[cat]?.annual_spend || 0), 0)
    const saveLow = Math.round(totalAvoidance * expansionPct * 0.5)
    const saveHigh = Math.round(totalAvoidance * expansionPct)
    directives.push({
      id: 'ph_prevention_expansion',
      type: 'service_model',
      tier: 'demand_management',
      owner: 'portfolio',
      action: `DO: Expand prevention programmes by 20%. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} pa in ASC/NHS cost avoidance. HOW: Invest additional ${formatCurrency(Math.round(totalSpend * expansionPct))} in falls (ROI ${prevention.falls?.roi_ratio || 3.5}:1), smoking (ROI ${prevention.smoking?.roi_ratio || 2.8}:1), obesity (ROI ${prevention.obesity?.roi_ratio || 3.7}:1). EVIDENCE: Current avoidance ${formatCurrency(totalAvoidance)} pa from ${formatCurrency(totalSpend)} spend.`,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Medium-term (6-18 months)',
      legal_basis: 'Health and Social Care Act 2012 s12: public health improvement; Care Act 2014 prevention duty',
      risk: 'Low',
      risk_detail: 'Evidence-based interventions with proven ROI; savings accrue to ASC/NHS not PH budget directly',
      steps: ['Prioritise highest-ROI programmes for expansion', 'Develop joint funding agreements with NHS ICB', 'Target top deprivation quintile wards', 'Establish shared outcome tracking with ASC', 'Report prevention-to-ASC savings quarterly'],
      governance_route: 'officer_delegation',
      evidence: `Falls ROI ${prevention.falls?.roi_ratio || 3.5}:1 (${formatCurrency(prevention.falls?.annual_spend || 0)} → ${formatCurrency(prevention.falls?.asc_avoidance_pa || 0)}). Smoking ROI ${prevention.smoking?.roi_ratio || 2.8}:1. Obesity ROI ${prevention.obesity?.roi_ratio || 3.7}:1.`,
      priority: 'high',
      feasibility: 8,
      impact: 7,
    })
  }

  // 4. Health Inequalities Reduction
  if (inequalities.life_expectancy_gap_male || inequalities.asc_residential_annual) {
    const targetReduction = inequalities.prevention_asc_reduction_target_pct || 5
    const saveLow = Math.round((inequalities.asc_residential_annual || 0) * targetReduction / 100 * 0.3)
    const saveHigh = Math.round((inequalities.asc_residential_annual || 0) * targetReduction / 100)
    directives.push({
      id: 'ph_health_inequalities',
      type: 'service_model',
      tier: 'demand_management',
      owner: 'portfolio',
      action: `DO: Target health inequalities to reduce ASC demand. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} pa. HOW: Focus prevention on worst deprivation quintile (LE gap ${inequalities.life_expectancy_gap_male || 10.6} years male, ${inequalities.life_expectancy_gap_female || 8.2} years female). EVIDENCE: ${targetReduction}% ASC residential reduction target = ${formatCurrency(Math.round((inequalities.asc_residential_annual || 0) * targetReduction / 100))} from ${formatCurrency(inequalities.asc_residential_annual || 0)} base.`,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Long-term (18+ months)',
      legal_basis: 'Health and Social Care Act 2012 s12: reduce health inequalities; Equality Act 2010 PSED',
      risk: 'Medium',
      risk_detail: 'Long-term payback (3-5 years); requires cross-portfolio working; outcome attribution complex',
      steps: ['Map top 20 wards by deprivation-health gap', 'Deploy targeted prevention resources', 'Establish ward-level outcome baselines', 'Quarterly cross-portfolio impact reporting', 'Joint commissioning with NHS ICB for worst quintile'],
      governance_route: 'cabinet_decision',
      evidence: `LE gap: ${inequalities.life_expectancy_gap_male || 10.6} years (male), ${inequalities.life_expectancy_gap_female || 8.2} years (female). Deprivation quintile gap: ${inequalities.deprivation_quintile_gap_years || 10.6} years. ASC residential: ${formatCurrency(inequalities.asc_residential_annual || 0)} pa.`,
      priority: 'medium',
      feasibility: 5,
      impact: 8,
    })
  }

  // 5. Grant Maximisation
  if (grant.real_terms_decline_pct_pa) {
    const annualDecline = Math.round((grant.total_public_health_grant || 0) * grant.real_terms_decline_pct_pa / 100)
    const saveLow = Math.round(annualDecline * 0.3)
    const saveHigh = Math.round(annualDecline * 0.6)
    directives.push({
      id: 'ph_grant_maximisation',
      type: 'service_model',
      tier: 'income_generation',
      owner: 'portfolio',
      action: `DO: Mitigate PH grant real-terms decline. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} pa. HOW: Lobby DHSC for inflation uplift; redirect ring-fenced underspend to prevention ROI programmes; explore s256 NHS agreements. EVIDENCE: Grant ${formatCurrency(grant.total_public_health_grant || 0)} declining ${grant.real_terms_decline_pct_pa}% pa real terms (${formatCurrency(annualDecline)}/yr).`,
      save_low: saveLow,
      save_high: saveHigh,
      save_central: Math.round((saveLow + saveHigh) / 2),
      timeline: 'Short-term (3-6 months)',
      legal_basis: 'Health and Social Care Act 2012 s31: public health grant conditions',
      risk: 'Low',
      risk_detail: 'Grant uplift depends on DHSC settlement; s256 agreements require NHS co-operation',
      steps: ['Calculate real-terms decline trajectory to 2030', 'Prepare DHSC submission with ADPH', 'Identify ring-fenced underspend for reallocation', 'Negotiate s256 agreements with ICB', 'Report grant efficiency to cabinet quarterly'],
      governance_route: 'officer_delegation',
      evidence: `PH grant: ${formatCurrency(grant.total_public_health_grant || 0)}. Supplemental: ${formatCurrency(grant.drug_alcohol_supplemental || 0)} (time-limited). Real-terms decline: ${grant.real_terms_decline_pct_pa}% pa.`,
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
 * @returns {Object} { yearly, base_cost, backlog_trajectory, disposal_pipeline, co_location_potential, care_home_liability }
 */
export function propertyEstateProjection(propModel, years = 5) {
  if (!propModel?.estate_summary) return { yearly: [], base_cost: 0, backlog_trajectory: 0, disposal_pipeline: 0, co_location_potential: 0, care_home_liability: 0 }

  const estate = propModel.estate_summary
  const condition = propModel.condition_data || {}
  const disposal = propModel.disposal_programme || {}
  const coLoc = propModel.co_location_opportunity || {}
  const careHomes = propModel.in_house_care_homes || {}

  const baseCost = estate.property_estates_facilities_cost || 0
  const baseBacklog = estate.maintenance_backlog_known || 5000000
  const backlogGrowthRate = (disposal.backlog_growth_pct_pa ?? 8) / 100
  const disposalTarget = disposal.target_receipts || 0

  const yearly = []
  let cumulativeCost = 0

  for (let y = 0; y < years; y++) {
    // Running costs inflate at 3% pa
    const runningCost = Math.round(baseCost * Math.pow(1.03, y))

    // Backlog compounds
    const backlog = Math.round(baseBacklog * Math.pow(1 + backlogGrowthRate, y))

    // Disposal receipts spread over 5 years (front-loaded: 30% yr1, 25% yr2, 20% yr3, 15% yr4, 10% yr5)
    const disposalWeights = [0.3, 0.25, 0.2, 0.15, 0.1]
    const disposalReceipts = Math.round(disposalTarget * (disposalWeights[y] || 0))

    // Co-location savings ramp up (20% per year)
    const coLocSaving = Math.round((coLoc.total_potential || 0) * Math.min(0.2 * (y + 1), 1))

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
    co_location_potential: coLoc.total_potential || 0,
    care_home_liability: (careHomes.maintenance_backlog || 0),
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
    const estate = propModel.estate_summary || {}
    const disposal = propModel.disposal_programme || {}
    const coLoc = propModel.co_location_opportunity || {}
    const careHomes = propModel.in_house_care_homes || {}

    // 1. Estate Rationalisation
    if (disposal.target_receipts) {
      const saveLow = Math.round(disposal.target_receipts * 0.5)
      const saveHigh = disposal.target_receipts
      directives.push({
        id: 'resources_estate_rationalisation',
        type: 'service_model',
        tier: 'income_generation',
        owner: 'portfolio',
        action: `DO: Accelerate estate disposal programme. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} capital receipts. HOW: Progress ${(disposal.active_disposals || []).length} active disposals (${(disposal.active_disposals || []).slice(0, 3).join(', ')}). EVIDENCE: Target receipts ${formatCurrency(disposal.target_receipts)}; backlog growing ${disposal.backlog_growth_pct_pa || 8}% pa without disposal.`,
        save_low: saveLow,
        save_high: saveHigh,
        save_central: Math.round((saveLow + saveHigh) / 2),
        timeline: 'Medium-term (6-18 months)',
        legal_basis: 'Local Government Act 1972 s123: disposal at best consideration; CIPFA Asset Management Framework',
        risk: 'Medium',
        risk_detail: 'Market conditions affect receipts; planning permissions required; political sensitivity on community assets',
        steps: ['Complete condition surveys on surplus portfolio', 'Obtain planning consent for key sites', 'Instruct disposal via competitive marketing', 'Ring-fence receipts for backlog reduction', 'Report quarterly to cabinet on disposal progress'],
        governance_route: 'cabinet_decision',
        evidence: `${estate.total_properties || 1200} properties. Running cost: ${formatCurrency(estate.property_estates_facilities_cost || 0)} (${estate.pct_of_total_spend || 6.3}% of spend). Backlog: ${formatCurrency(estate.maintenance_backlog_known || 0)}.`,
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
        action: `DO: Implement co-location programme across ${coLoc.potential_consolidations} sites. SAVE: ${formatCurrency(coLoc.total_potential || 3000000)} pa at full implementation. HOW: Merge co-located services at ${formatCurrency(coLoc.estimated_saving_per_merge || 200000)} per consolidation. EVIDENCE: ${coLoc.potential_consolidations} potential consolidations identified; average saving ${formatCurrency(coLoc.estimated_saving_per_merge || 200000)} per merge.`,
        save_low: Math.round((coLoc.total_potential || 3000000) * 0.5),
        save_high: coLoc.total_potential || 3000000,
        save_central: Math.round((coLoc.total_potential || 3000000) * 0.75),
        timeline: 'Long-term (18+ months)',
        legal_basis: 'CIPFA Asset Management Framework; Localism Act 2011 general competence',
        risk: 'Low',
        risk_detail: 'Requires service agreement between occupying directorates; ICT infrastructure costs',
        steps: ['Identify top 5 quick-win co-locations', 'Develop business cases per site', 'Agree service-level sharing protocols', 'Implement phased migration over 24 months', 'Report occupancy efficiencies quarterly'],
        governance_route: 'officer_delegation',
        evidence: `${coLoc.potential_consolidations} potential merges. Avg saving: ${formatCurrency(coLoc.estimated_saving_per_merge || 200000)}. Total potential: ${formatCurrency(coLoc.total_potential || 0)} pa.`,
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
        action: `DO: Address ${formatCurrency(careHomes.maintenance_backlog)} care home maintenance backlog. SAVE: Avoids CQC regulatory action and emergency placement costs. HOW: Prioritise investment across ${careHomes.count || 16} in-house care homes (${careHomes.under_review || 5} under review). EVIDENCE: ${careHomes.closure_commitment || 'All 5 county care homes saved'}.`,
        save_low: 0,
        save_high: Math.round(careHomes.maintenance_backlog * 0.3),
        save_central: Math.round(careHomes.maintenance_backlog * 0.15),
        timeline: 'Medium-term (6-18 months)',
        legal_basis: 'Care Act 2014 s5: market shaping; Health and Social Care Act 2008 registration requirements',
        risk: 'High',
        risk_detail: 'CQC enforcement risk if not addressed; political commitment constrains options',
        steps: ['Complete structural surveys on all 16 homes', 'Prioritise safety-critical works', 'Develop 5-year capital programme', 'Report condition vs CQC requirements quarterly', 'Brief cabinet on investment options'],
        governance_route: 'cabinet_decision',
        evidence: `${careHomes.count || 16} in-house homes. Backlog: ${formatCurrency(careHomes.maintenance_backlog)}. Under review: ${careHomes.under_review || 5}. Commitment: ${careHomes.closure_commitment || 'none'}.`,
        priority: 'high',
        feasibility: 6,
        impact: 7,
      })
    }
  }

  // Procurement directives
  if (procModel) {
    const invoicing = procModel.invoice_processing || {}
    const concentration = procModel.supplier_concentration || {}
    const cfCoverage = procModel.contracts_finder_coverage || {}
    const dupeRisk = procModel.duplicate_risk || {}
    const automation = procModel.finance_automation_potential || {}

    // 4. E-Invoicing Automation
    if (invoicing.automation_saving_potential) {
      directives.push({
        id: 'resources_e_invoicing',
        type: 'service_model',
        tier: 'efficiency',
        owner: 'portfolio',
        action: `DO: Implement e-invoicing across ${invoicing.annual_invoices?.toLocaleString() || '600,000'} annual invoices. SAVE: ${formatCurrency(invoicing.automation_saving_potential)} pa. HOW: Move from manual (£${invoicing.manual_cost_per_invoice || 5}/invoice) to automated (£${invoicing.automated_cost_per_invoice || 0.50}/invoice) processing. EVIDENCE: ${invoicing.monthly_invoices?.toLocaleString() || '50,000'} invoices/month; current manual processing.`,
        save_low: Math.round((invoicing.automation_saving_potential || 0) * 0.6),
        save_high: invoicing.automation_saving_potential || 0,
        save_central: Math.round((invoicing.automation_saving_potential || 0) * 0.8),
        timeline: 'Medium-term (6-18 months)',
        legal_basis: 'Public Procurement (Electronic Invoices etc.) Regulations 2019; Late Payment of Commercial Debts Act 1998',
        risk: 'Low',
        risk_detail: 'Proven technology; requires ERP system upgrade; supplier onboarding effort',
        steps: ['Procure e-invoicing module/upgrade ERP', 'Pilot with top 50 suppliers (80% of volume)', 'Implement PO matching automation', 'Roll out to remaining suppliers over 12 months', 'Track processing time and exception rates'],
        governance_route: 'officer_delegation',
        evidence: `${invoicing.annual_invoices?.toLocaleString() || '600,000'} invoices pa. Manual: £${invoicing.manual_cost_per_invoice || 5}/invoice. Automated: £${invoicing.automated_cost_per_invoice || 0.50}/invoice.`,
        priority: 'high',
        feasibility: 8,
        impact: 6,
      })
    }

    // 5. Supplier Diversification
    if (concentration.overall_hhi) {
      const offContract = Math.round((cfCoverage.non_compliant_value || 0) * (concentration.off_contract_estimate_pct || 15) / 100)
      const saveLow = Math.round(offContract * 0.05)
      const saveHigh = Math.round(offContract * 0.15)
      directives.push({
        id: 'resources_supplier_diversification',
        type: 'service_model',
        tier: 'procurement',
        owner: 'portfolio',
        action: `DO: Reduce supplier concentration and off-contract spend. SAVE: ${formatCurrency(saveLow)}-${formatCurrency(saveHigh)} pa. HOW: Address ${concentration.off_contract_estimate_pct || 15}% off-contract spend; improve HHI from ${concentration.overall_hhi || 1200}. EVIDENCE: Top 10 suppliers = ${concentration.top_10_pct_of_spend || 45}% of spend; CF coverage only ${cfCoverage.overall_pct || 33}%.`,
        save_low: saveLow,
        save_high: saveHigh,
        save_central: Math.round((saveLow + saveHigh) / 2),
        timeline: 'Medium-term (6-18 months)',
        legal_basis: 'Public Contracts Regulations 2015; Procurement Act 2023 (from Feb 2025); Social Value Act 2012',
        risk: 'Medium',
        risk_detail: 'Requires cultural change in commissioning; some concentration is efficient for specialist services',
        steps: ['Audit off-contract spend by category', 'Establish framework agreements for high-value categories', 'Implement approval workflow for non-framework spend', 'Publish pipeline on Contracts Finder', 'Report quarterly on CF coverage and HHI'],
        governance_route: 'officer_delegation',
        evidence: `HHI: ${concentration.overall_hhi || 1200}. Top 10: ${concentration.top_10_pct_of_spend || 45}%. CF coverage: ${cfCoverage.overall_pct || 33}%. Non-compliant value: ${formatCurrency(cfCoverage.non_compliant_value || 0)}.`,
        priority: 'medium',
        feasibility: 7,
        impact: 6,
      })
    }

    // 6. Finance Automation
    if (automation.automation_pct) {
      const saving = automation.headcount_saving || Math.round(automation.finance_ftes * automation.automation_pct / 100 * automation.avg_salary)
      directives.push({
        id: 'resources_finance_automation',
        type: 'service_model',
        tier: 'efficiency',
        owner: 'portfolio',
        action: `DO: Automate ${automation.automation_pct}% of finance processes. SAVE: ${formatCurrency(Math.round(saving * 0.6))}-${formatCurrency(saving)} pa. HOW: Deploy RPA/AI across ${automation.finance_ftes || 80} finance FTEs for routine tasks. EVIDENCE: ${automation.automation_pct}% automatable at avg salary £${(automation.avg_salary || 35000).toLocaleString()}.`,
        save_low: Math.round(saving * 0.6),
        save_high: saving,
        save_central: Math.round(saving * 0.8),
        timeline: 'Long-term (18+ months)',
        legal_basis: 'CIPFA Financial Management Code; Accounts and Audit Regulations 2015',
        risk: 'Medium',
        risk_detail: 'Requires change management; redeployment/redundancy implications; technology investment',
        steps: ['Map finance processes by automation potential', 'Pilot RPA on highest-volume transactions', 'Develop redeployment plan for affected staff', 'Roll out across remaining processes', 'Track error rates and processing times'],
        governance_route: 'cabinet_decision',
        evidence: `${automation.finance_ftes || 80} finance FTEs. ${automation.automation_pct}% automatable. Avg salary: £${(automation.avg_salary || 35000).toLocaleString()}. Headcount saving: ${formatCurrency(saving)}.`,
        priority: 'medium',
        feasibility: 6,
        impact: 5,
      })
    }
  }

  return directives
}


// ═══════════════════════════════════════════════════════════════════════
// Treasury, Workforce, Fees & Commercialisation Models
// ═══════════════════════════════════════════════════════════════════════

/**
 * Treasury management savings model.
 * Reads administration.treasury data and calculates savings from:
 * - Idle cash optimisation (moving overnight deposits to MMFs/gilts)
 * - PWLB debt refinancing (legacy loans at above-market rates)
 * - MRP method switch (regulatory to asset life)
 * - Early payment discounts
 *
 * @param {Object} treasury - administration.treasury from cabinet_portfolios.json
 * @returns {{ idle_cash_cost: number, refinancing_potential: number, mrp_method_saving: number, early_payment_saving: number, total: number }}
 */
export function treasuryManagementSavings(treasury) {
  if (!treasury) return { idle_cash_cost: 0, refinancing_potential: 0, mrp_method_saving: 0, early_payment_saving: 0, total: 0 }

  // Idle cash: gap between benchmark yield and actual yield on cash balances
  const benchmarkIncome = treasury.investment_income_benchmark ?? 0
  const actualIncome = treasury.investment_income_actual ?? 0
  const idleCashCost = Math.max(0, benchmarkIncome - actualIncome)
  // Add any explicit idle cash opportunity from data
  const idleTotal = Math.max(idleCashCost, treasury.idle_cash_opportunity ?? 0)

  // Refinancing: legacy PWLB loans at above-market rates
  // Conservative: assume 30% of portfolio refinanceable (premium constraints)
  const rateDiff = (treasury.average_legacy_rate_pct ?? 0) - (treasury.current_pwlb_rate_pct ?? 0)
  const refinancingPotential = rateDiff > 0.5
    ? Math.round(treasury.total_borrowing * 0.3 * rateDiff / 100)
    : 0

  // MRP method switch
  const mrpSaving = treasury.asset_life_mrp_saving ?? 0

  // Early payment discount: 2% on 10-day payment terms for top suppliers
  // Assume 0.2% of debt service represents achievable early payment discount
  const earlyPaymentSaving = Math.round((treasury.annual_debt_service ?? 0) * 0.002)

  const total = idleTotal + refinancingPotential + mrpSaving + earlyPaymentSaving

  return {
    idle_cash_cost: idleTotal,
    refinancing_potential: refinancingPotential,
    mrp_method_saving: mrpSaving,
    early_payment_saving: earlyPaymentSaving,
    total,
  }
}

/**
 * Fees and charges review.
 * Scans portfolio savings levers for fee/charge/income-related items
 * and estimates the uplift potential from inflationary increases and
 * moving to full cost recovery.
 *
 * @param {Object} portfolio - Portfolio from cabinet_portfolios.json
 * @returns {{ current_income: number, inflationary_gap: number, cost_recovery_gap: number, uplift_potential: number, fee_lever_count: number }}
 */
export function feesAndChargesReview(portfolio) {
  if (!portfolio) return { current_income: 0, inflationary_gap: 0, cost_recovery_gap: 0, uplift_potential: 0, fee_lever_count: 0 }

  const FEE_KEYWORDS = /fee|charge|income|commercial|licence|permit|hire|parking|advertising|rent|sponsor/i
  const CPI_RATE = 0.032 // 3.2% CPI-H

  const feeLevers = (portfolio.savings_levers || []).filter(l =>
    FEE_KEYWORDS.test(l.lever || '') || FEE_KEYWORDS.test(l.description || '')
  )

  let totalLow = 0
  let totalHigh = 0
  for (const lever of feeLevers) {
    const { low, high } = parseSavingRange(lever.est_saving)
    totalLow += low
    totalHigh += high
  }

  // Estimate inflationary gap: budget gross expenditure * CPI * fee proportion
  const grossExp = portfolio.budget_latest?.gross_expenditure ?? 0
  const feeProportion = 0.08 // ~8% of gross is typically fee income
  const inflationary = Math.round(grossExp * feeProportion * CPI_RATE)

  // Cost recovery gap is the difference between mid-range lever savings and inflationary
  const midpoint = (totalLow + totalHigh) / 2
  const costRecoveryGap = Math.max(0, midpoint - inflationary)

  return {
    current_income: Math.round(grossExp * feeProportion),
    inflationary_gap: inflationary,
    cost_recovery_gap: costRecoveryGap,
    uplift_potential: Math.round(midpoint),
    fee_lever_count: feeLevers.length,
  }
}

/**
 * Workforce optimisation model.
 * Reads portfolio.workforce data and calculates savings from:
 * - Vacancy factor (3% budget hold)
 * - Agency premium (cost above permanent equivalent)
 * - Management delayering potential
 * - Turnover-related costs
 *
 * @param {Object} portfolio - Portfolio with workforce data
 * @returns {{ vacancy_savings: number, agency_premium: number, delayering_saving: number, turnover_cost: number, total: number }}
 */
export function workforceOptimisation(portfolio) {
  if (!portfolio?.workforce) return { vacancy_savings: 0, agency_premium: 0, delayering_saving: 0, turnover_cost: 0, total: 0 }

  const wf = portfolio.workforce
  const avgSalary = wf.average_salary ?? 32000
  const onCostMultiplier = 1.3 // NI + pension + on-costs

  // Vacancy factor: 3% of total staffing budget
  const totalStaffBudget = wf.fte_headcount * avgSalary * onCostMultiplier
  const vacancySavings = Math.round(totalStaffBudget * 0.03)

  // Agency premium: agency staff cost ~40% more than permanent
  const agencyFTE = wf.agency_fte ?? 0
  const agencySpend = wf.agency_spend ?? 0
  const permanentEquivalent = agencyFTE * avgSalary * onCostMultiplier
  const agencyPremium = Math.max(0, agencySpend - permanentEquivalent)

  // Delayering: if span of control < 7, savings from widening
  const span = wf.span_of_control ?? 6
  const layers = wf.management_layers ?? 5
  let delayeringSaving = 0
  if (span < 7 && layers > 4) {
    // Estimate management posts that could be removed
    const managementPosts = Math.round(wf.fte_headcount / (span + 1))
    const targetPosts = Math.round(wf.fte_headcount / 8) // target 1:8
    const removable = Math.max(0, managementPosts - targetPosts)
    const managementSalary = avgSalary * 1.3 // managers paid ~30% above average
    delayeringSaving = Math.round(removable * managementSalary * onCostMultiplier)
  }

  // Turnover cost: high turnover means recruitment costs
  const turnover = wf.voluntary_turnover_pct ?? 10
  const recruitmentCostPerHead = avgSalary * 0.15 // ~15% of salary
  const turnoverCost = Math.round(wf.fte_headcount * (turnover / 100) * recruitmentCostPerHead)

  return {
    vacancy_savings: vacancySavings,
    agency_premium: agencyPremium,
    delayering_saving: delayeringSaving,
    turnover_cost: turnoverCost,
    total: vacancySavings + agencyPremium + delayeringSaving,
  }
}

/**
 * Commercialisation pipeline.
 * Scans portfolio savings levers for commercial/traded/income items
 * and aggregates the revenue potential.
 *
 * @param {Object} portfolio - Portfolio from cabinet_portfolios.json
 * @returns {{ traded_income: number, advertising_income: number, expertise_income: number, commercial_lever_count: number, total: number }}
 */
export function commercialisationPipeline(portfolio) {
  if (!portfolio) return { traded_income: 0, advertising_income: 0, expertise_income: 0, commercial_lever_count: 0, total: 0 }

  const TRADED_KEYWORDS = /traded|sell|service.*academ|training|adult learning/i
  const ADVERTISING_KEYWORDS = /advertising|sponsorship|roundabout|bus shelter|naming rights/i
  const EXPERTISE_KEYWORDS = /commercial|expertise|consultancy|programme.*NHS|cost-plus/i

  const levers = portfolio.savings_levers || []
  let tradedIncome = 0
  let advertisingIncome = 0
  let expertiseIncome = 0
  let count = 0

  for (const lever of levers) {
    const text = `${lever.lever || ''} ${lever.description || ''}`
    const { low, high } = parseSavingRange(lever.est_saving)
    const mid = (low + high) / 2

    if (TRADED_KEYWORDS.test(text)) {
      tradedIncome += mid
      count++
    } else if (ADVERTISING_KEYWORDS.test(text)) {
      advertisingIncome += mid
      count++
    } else if (EXPERTISE_KEYWORDS.test(text)) {
      expertiseIncome += mid
      count++
    }
  }

  return {
    traded_income: Math.round(tradedIncome),
    advertising_income: Math.round(advertisingIncome),
    expertise_income: Math.round(expertiseIncome),
    commercial_lever_count: count,
    total: Math.round(tradedIncome + advertisingIncome + expertiseIncome),
  }
}
