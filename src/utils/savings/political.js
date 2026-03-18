/**
 * @module savings/political
 * Political messaging, electoral ripple, Reform PR narrative, and borough election intelligence.
 * Contains both private helpers and public-facing functions.
 */

import { formatCurrency } from './core.js'
import { BOROUGH_ELECTION_DATE, LANCASHIRE_DISTRICTS } from './core.js'
import { mapAgendaToPolicyAreas, getTopicAttackLines, buildReformDefenceLines, REFORM_REBUTTALS } from '../intelligenceEngine.js'
import { generateCouncilAttackLines, classifyWard, scoreIncumbentEntrenchment } from '../strategyEngine.js'
import { calculateFiscalStressAdjustment } from '../electionModel.js'
import { giniCoefficient, benfordSecondDigit } from '../analytics.js'

// Portfolio -> ward archetype resonance (which voter segments benefit from this portfolio's actions)
export const PORTFOLIO_ARCHETYPE_RESONANCE = {
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
export const PORTFOLIO_PR_ANGLES = {
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


// ---- Private helpers ----

export function generatePortfolioNarrativeHooks(portfolio) {
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

export function generateReformPRAngle(directive, portfolio) {
  if (!directive) return null
  const saving = directive.save_central ?? 0
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

export function generateBoroughRipple(directive, portfolio) {
  const saving = directive.save_central ?? 0
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

export function findMatchedRebuttal(directive, portfolio) {
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

export function generateConstituencyResonance(directive, portfolio, options) {
  const saving = directive.save_central ?? 0
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

export function getArchetypeMessage(archetype, portfolio, totalSavings) {
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

export function daysUntilBoroughElections() {
  return Math.max(0, Math.ceil((new Date(BOROUGH_ELECTION_DATE) - new Date()) / 86400000))
}


// ---- Public functions ----

/**
 * Generate meeting briefing for a portfolio holder.
 *
 * @param {Object} meeting - Single meeting object
 * @param {Object} portfolio - Portfolio
 * @param {Object} data - { spending, findings, budgets, reformTransformation, dogeFindings }
 * @returns {Object|null} Briefing object
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


/**
 * Assess political context for a portfolio's operations.
 *
 * @param {Object} portfolio - Portfolio
 * @param {Object} options - { elections, councillors, politicalHistory, dogeFindings, budgetSummary, collectionRates, politicsSummary }
 * @returns {Object|null} Political context
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
 * @param {Object} directive - A directive
 * @param {Object} portfolio - Portfolio
 * @param {Object} options - { councillors, elections, wardPredictions, integrityData, fiscalData, constituencies, spending }
 * @returns {Object|null} Impact assessment
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
      entrenchment_score: entrenchment?.score ?? 0,
      entrenchment_level: entrenchment?.level || 'unknown',
      fiscal_stress: fiscalStress?.adjustment ?? 0,
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


/**
 * Composite Reform PR narrative engine.
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
 * Assess the electoral ripple effect of LCC Reform actions on borough and constituency elections.
 *
 * @param {Array} portfolioActions - Array of { portfolio, savings, directives_count }
 * @param {Object} options - { elections, demographics, deprivation, constituencies }
 * @returns {Object} Ripple assessment
 */
export function electoralRippleAssessment(portfolioActions, options = {}) {
  if (!portfolioActions?.length) return { district_impact: [], constituency_impact: {}, overall_score: 0 }

  const totalSavings = portfolioActions.reduce((s, a) => s + (a.savings ?? 0), 0)
  const totalDirectives = portfolioActions.reduce((s, a) => s + (a.directives_count ?? 0), 0)

  // Per-district impact scoring
  const districtImpact = LANCASHIRE_DISTRICTS.map(district => {
    const relevantActions = portfolioActions.filter(a => a.portfolio?.id && PORTFOLIO_ARCHETYPE_RESONANCE[a.portfolio.id])
    const districtSavings = relevantActions.reduce((s, a) => s + (a.savings ?? 0), 0)

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
