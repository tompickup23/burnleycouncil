/**
 * intelligenceEngine.js — Opposition intelligence, meeting war-gaming, and councillor dossiers.
 *
 * Pure functions for the Intelligence page. Builds councillor dossiers from voting records,
 * integrity data, register of interests, and curated party attack material. Predicts behaviour
 * for upcoming meetings and generates printable briefings.
 *
 * Reuses generateAttackLines and generateCouncilAttackLines from strategyEngine.js.
 */

import { generateAttackLines, generateCouncilAttackLines } from './strategyEngine'

// ---------------------------------------------------------------------------
// Policy Area Taxonomy (matches voting.json enrichment)
// ---------------------------------------------------------------------------

export const POLICY_AREAS = {
  budget_finance: 'Budget & Finance',
  council_tax: 'Council Tax',
  devolution_lgr: 'Devolution & LGR',
  environment_climate: 'Environment & Climate',
  health_wellbeing: 'Health & Wellbeing',
  governance_constitution: 'Governance & Constitution',
  equalities_diversity: 'Equalities & Diversity',
  social_care: 'Social Care',
  education_schools: 'Education & Schools',
  transport_highways: 'Transport & Highways',
  housing: 'Housing',
  community_safety: 'Community Safety',
}

// ---------------------------------------------------------------------------
// Agenda-to-Policy Keyword Map
// ---------------------------------------------------------------------------

const AGENDA_POLICY_MAP = [
  { keywords: /budget|financ|revenue|capital|precept|medium.term|treasury|reserves|savings|efficiency/i, area: 'budget_finance' },
  { keywords: /council.tax|band.d|precept|collection.rate/i, area: 'council_tax' },
  { keywords: /devolution|combined.county|lcca|local.government.reorganis/i, area: 'devolution_lgr' },
  { keywords: /environment|climate|carbon|net.zero|flood|renewable|waste|recycl/i, area: 'environment_climate' },
  { keywords: /health|nhs|wellbeing|hospital|a.?&.?e|mental.health|icb|integrated.care/i, area: 'health_wellbeing' },
  { keywords: /governance|constitution|standing.order|member.allowance|conduct|standards/i, area: 'governance_constitution' },
  { keywords: /equali|divers|inclusion|communit.cohes|hate.crime|modern.slavery/i, area: 'equalities_diversity' },
  { keywords: /social.care|adult.care|care.home|domiciliary|safeguard|cqc|living.better/i, area: 'social_care' },
  { keywords: /education|school|send|ehcp|pupil|academy|ofsted|children|young.people/i, area: 'education_schools' },
  { keywords: /transport|highway|road|pothole|bus|cycling|active.travel|parking|traffic/i, area: 'transport_highways' },
  { keywords: /housing|homelessness|affordable|planning.application|development.control/i, area: 'housing' },
  { keywords: /community.safety|police|crime|anti.social|domestic.abuse|fire/i, area: 'community_safety' },
]

// ---------------------------------------------------------------------------
// Curated Party Attack Database
// ---------------------------------------------------------------------------

export const PARTY_ATTACK_DATABASE = {
  'Green Party': {
    national: [
      { text: 'Brighton & Hove: Greens lost council control in 2023 after 12.5% council tax rise — the highest in England', severity: 'high', source: 'Brighton 2023 elections' },
      { text: 'Green Party conference voted for wealth taxes and rent controls — uncosted policies that would drive investment away from Lancashire', severity: 'medium', source: 'Green Party conference 2025' },
      { text: 'Greens oppose nuclear power — threatening 4,000+ jobs at Heysham and higher energy bills for Lancashire families', severity: 'high', source: 'Green Party energy policy' },
    ],
    local: [
      { text: 'Lancaster Green-led minority administration struggled to pass budgets, relying on Labour/Lib Dem support', severity: 'medium', source: 'Lancaster City Council' },
      { text: 'Lancaster Greens prioritised cycle lanes and LTNs over fixing potholes — resident complaints surged', severity: 'medium', source: 'Lancaster local issues' },
    ],
    lcc_record: [
      { text: 'Green budget amendment (£40k renewables feasibility) rejected 31-40 — tiny spending commitment exposed as virtue-signalling with no delivery plan', severity: 'high', source: 'LCC Budget 2025/26 recorded vote' },
      { text: 'All 3 Green/Prog Lancashire budget amendments lost on party lines — zero constructive amendments passed', severity: 'high', source: 'LCC Budget 2025/26' },
      { text: 'Greens voted against the halal meat supply motion compromise despite it protecting animal welfare AND cultural diversity', severity: 'medium', source: 'LCC recorded vote 2024-10-14' },
    ],
  },
  Labour: {
    national: [
      { text: 'Starmer government: national insurance hike hitting Lancashire businesses and workers', severity: 'high', source: 'Autumn Budget 2025' },
      { text: 'Labour council failures nationwide: Birmingham bankrupt, Nottingham bankrupt — is this the model they want for Lancashire?', severity: 'high', source: 'Section 114 notices' },
      { text: 'Labour broken promises: no wealth tax, no workers rights overhaul, pension taxation hitting pensioners', severity: 'medium', source: 'Labour manifesto failures' },
    ],
    local: [
      { text: 'Azhar Ali OBE: former Labour leader at LCC, now leads Progressive Lancashire as "Independent" after being dropped as Labour parliamentary candidate over antisemitism row', severity: 'high', source: 'Politics/elections data' },
      { text: 'Labour Preston: council tax rose while services declined, food poverty increased', severity: 'medium', source: 'Preston Council data' },
    ],
    lcc_record: [
      { text: 'Labour budget amendment demanded £35M extra capital spending with zero identified funding source — unfunded spending promises', severity: 'high', source: 'LCC Budget 2024/25 recorded vote' },
      { text: 'Labour amendment to divert £2.4M from highways maintenance would have meant more potholes on Lancashire roads', severity: 'medium', source: 'LCC Budget 2025/26' },
      { text: 'Labour voted for devolution amendment giving districts veto power — would have paralysed the Combined Authority', severity: 'medium', source: 'LCC Devolution vote 2024-03-14' },
    ],
  },
  Conservative: {
    national: [
      { text: '14 years of failure: broken levelling up promises, channel crossings tripled, NHS waiting lists doubled', severity: 'high', source: '2010-2024 record' },
      { text: 'Conservative government left Lancashire councils underfunded — real-terms cuts every year since 2010', severity: 'high', source: 'DLUHC funding data' },
    ],
    local: [],
    lcc_record: [
      { text: 'Conservatives ran LCC 2017-2025: left £28M overspend, £1.181B debt, £350M VeLTIP bond loss concealed from councillors', severity: 'high', source: 'reform_transformation.json' },
      { text: 'Conservative savings delivery rate: just 48% — promised £68.6M, delivered only £32.9M', severity: 'high', source: 'LCC efficiency review' },
      { text: 'Conservatives raised council tax to the maximum (4.99-5.99%) in 7 of 8 years in control', severity: 'high', source: 'Council tax records' },
      { text: 'Operation Sheridan: former Tory leader Geoff Driver awaiting criminal trial', severity: 'high', source: 'Court records' },
      { text: 'Oracle Fusion IT failure under Conservative watch: botched implementation cost millions', severity: 'medium', source: 'LCC internal reports' },
      { text: 'CQC rated adult social care "Requires Improvement" (2.0/4) under Conservative administration', severity: 'medium', source: 'CQC inspection' },
    ],
  },
  'Liberal Democrats': {
    national: [
      { text: 'Tuition fees betrayal (2010-2015): pledged to scrap fees, then tripled them in coalition', severity: 'medium', source: '2010 manifesto vs record' },
      { text: 'Flip-flopping positions: pro-EU one year, quiet the next — what do Lib Dems actually stand for?', severity: 'low', source: 'Policy analysis' },
    ],
    local: [],
    lcc_record: [
      { text: 'Lib Dems proposed £175k for youth workers and £2M for pothole repair — modest ambitions that pale next to Reform\'s £28M roads budget', severity: 'medium', source: 'LCC Budget 2025/26' },
      { text: '3 Lib Dems abstained on Labour devolution amendment — couldn\'t even decide whether districts should have a voice', severity: 'medium', source: 'LCC Devolution vote 2024-03-14' },
    ],
  },
  Independent: {
    national: [],
    local: [],
    lcc_record: [
      { text: 'No party machine or national support — limited influence on council policy decisions', severity: 'low', source: 'General' },
      { text: 'Independent councillors cannot form a government or deliver a manifesto — who are they accountable to?', severity: 'medium', source: 'Governance analysis' },
    ],
  },
  'Our West Lancashire': {
    national: [],
    local: [
      { text: 'Single-issue local party with no county-wide strategy or Lancashire-level policy platform', severity: 'low', source: 'Party analysis' },
      { text: 'Only 2 seats at LCC — insufficient base to influence any policy outcome', severity: 'low', source: 'politics_summary.json' },
    ],
    lcc_record: [],
  },
  'Labour & Co-operative': {
    national: [
      { text: 'Starmer government: national insurance hike hitting Lancashire businesses and workers', severity: 'high', source: 'Autumn Budget 2025' },
    ],
    local: [],
    lcc_record: [],
  },
}

// ---------------------------------------------------------------------------
// Reform Rebuttals — defence lines for common opposition attacks
// ---------------------------------------------------------------------------

export const REFORM_REBUTTALS = [
  { attack: 'You\'re cutting services', rebuttal: 'We inherited a £28M overspend and have delivered near-zero while protecting frontline services. After years of underinvestment, we saved all 5 care homes through proper consultation. 677 SEND places created, £23M adult social care savings found without cutting services.', policyAreas: ['budget_finance', 'social_care'] },
  { attack: 'Council tax is still going up', rebuttal: '3.80% — the lowest rise in Lancashire in 12 years. The Tories raised it 4.99% the maximum possible, year after year. 7 of their 8 years they went to the maximum.', policyAreas: ['council_tax', 'budget_finance'] },
  { attack: 'Not enough consultation', rebuttal: 'We inherited the care homes consultation that was already in the pipeline. 1,600+ residents responded — and we listened to them. That\'s more meaningful consultation than the Conservatives delivered in 8 years of control.', policyAreas: ['social_care', 'governance_constitution'] },
  { attack: 'Road repairs are too slow', rebuttal: '42% reduction in road defects in 6 months. £28M dedicated pothole budget plus £5M emergency cabinet decision. £45M 3-year roads investment plan — compared to rising backlogs under the Tories.', policyAreas: ['transport_highways'] },
  { attack: 'SEND provision is inadequate', rebuttal: '677 new SEND places created (277 delivered + 400 announced), new 200+ pupil special school by 2027, £3M+ annual investment in Educational Psychology, new online EHCP portal. Compare that to the inherited DfE improvement notice.', policyAreas: ['education_schools'] },
  { attack: 'You\'re inexperienced', rebuttal: 'In 9 months: £28M overspend eliminated, £22M efficiency savings identified, 100% savings delivery target vs 48% under the experienced Conservatives. Results matter more than time served.', policyAreas: ['budget_finance', 'governance_constitution'] },
  { attack: 'AI and digital transformation is risky', rebuttal: 'AI is delivering 285 staff-equivalent productivity gains, cutting backlogs in SEND and social care without hiring 285 new staff. Every major council is investing in AI — we\'re leading, not following.', policyAreas: ['budget_finance', 'education_schools'] },
  { attack: 'Pension fund concerns', rebuttal: 'We exposed the £350M VeLTIP bond loss the Conservatives concealed. We stopped Councillors receiving tens of thousands of pounds in salaries for being directors of the LCC pension fund companies — a practice under the previous Conservative administration, including Cllr Alan Schofield who served as a paid director of Local Pensions Partnership Ltd. The national DOGE team is providing support on pension fund fee analysis.', policyAreas: ['budget_finance', 'governance_constitution'] },
]

// ---------------------------------------------------------------------------
// Councillor Name Matching Utilities
// ---------------------------------------------------------------------------

/**
 * Clean a councillor name by removing title prefixes.
 * "County Councillor Mr Joel Michael Tetlow" → "Joel Michael Tetlow"
 * "County Councillor Gina Dowding" → "Gina Dowding"
 */
export function cleanCouncillorName(name) {
  if (!name) return ''
  return name
    .replace(/^(County\s+)?Councillor\s+(Mrs|Miss|Ms|Mr|Dr|Prof|Cllr|Sir|Dame|Lord|Lady|Reverend|Rev)?\s*/i, '')
    .trim()
}

/**
 * Match a voting record name to a councillor. Handles prefix differences.
 * voting.json uses "County Councillor Gina Dowding"
 * councillors.json uses "County Councillor Gina Dowding" (same) or different formats
 */
function matchCouncillorName(voteName, councillorName) {
  const a = cleanCouncillorName(voteName).toLowerCase()
  const b = cleanCouncillorName(councillorName).toLowerCase()
  if (!a || !b) return false
  // Exact match after cleaning
  if (a === b) return true
  // One contains the other (handles middle names, OBE suffixes, etc.)
  if (a.includes(b) || b.includes(a)) return true
  // Surname match + first initial
  const aParts = a.split(/\s+/)
  const bParts = b.split(/\s+/)
  if (aParts.length > 0 && bParts.length > 0) {
    const aSurname = aParts[aParts.length - 1]
    const bSurname = bParts[bParts.length - 1]
    if (aSurname === bSurname && aParts[0][0] === bParts[0][0]) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Core: Build Councillor Dossier
// ---------------------------------------------------------------------------

/**
 * Build a comprehensive intelligence dossier for a single councillor.
 * @param {string} councillorName - Name to look up (cleaned or raw)
 * @param {Object} allData - { councillors, votingData, integrityData, interestsData, committeesData, politicsSummary }
 * @returns {Object|null} Complete dossier or null if councillor not found
 */
export function buildCouncillorDossier(councillorName, allData) {
  const { councillors, votingData, integrityData, interestsData, committeesData, politicsSummary } = allData || {}
  if (!councillors) return null

  const cList = Array.isArray(councillors) ? councillors : councillors.councillors || []

  // Find councillor
  const councillor = cList.find(c => matchCouncillorName(councillorName, c.name))
  if (!councillor) return null

  const cleanName = cleanCouncillorName(councillor.name)
  const party = councillor.party || 'Unknown'

  // --- Voting record ---
  const votes = votingData?.votes || []
  const votingRecord = []
  const policyPositions = {} // policy_area → { for: N, against: N, abstain: N }

  for (const vote of votes) {
    const byCouncillor = vote.votes_by_councillor || []
    const myVote = byCouncillor.find(v => matchCouncillorName(v.name, councillor.name))
    if (!myVote || myVote.vote === 'absent') continue

    // Detect rebel: compare to party majority position
    const partyVotes = vote.votes_by_party?.[party] || {}
    const partyMajority = partyVotes.for > partyVotes.against ? 'for' : partyVotes.against > partyVotes.for ? 'against' : null
    const isRebel = partyMajority && myVote.vote !== partyMajority && myVote.vote !== 'absent'

    votingRecord.push({
      voteId: vote.id,
      title: vote.title,
      date: vote.meeting_date,
      policyAreas: vote.policy_area || [],
      position: myVote.vote,
      outcome: vote.outcome,
      isAmendment: vote.is_amendment,
      isRebel,
      description: vote.description,
      significance: vote.significance,
    })

    // Aggregate policy positions
    for (const area of vote.policy_area || []) {
      if (!policyPositions[area]) policyPositions[area] = { for: 0, against: 0, abstain: 0 }
      if (myVote.vote in policyPositions[area]) policyPositions[area][myVote.vote]++
    }
  }

  const rebelCount = votingRecord.filter(v => v.isRebel).length

  // --- Integrity ---
  const integrityList = integrityData?.councillors || []
  const integrity = integrityList.find(i =>
    matchCouncillorName(i.name, councillor.name) ||
    i.councillor_id === councillor.id
  )

  const integrityProfile = integrity ? {
    score: integrity.integrity_score,
    riskLevel: integrity.risk_level,
    redFlags: integrity.red_flags || [],
    totalDirectorships: integrity.total_directorships || 0,
    activeDirectorships: integrity.active_directorships || integrity.companies_house?.active_directorships || 0,
    companies: (integrity.companies_house?.companies || []).map(c => ({
      name: c.company_name,
      number: c.company_number,
      role: c.role,
      status: c.company_status,
      appointed: c.appointed_on,
      resigned: c.resigned_on,
      sicCodes: c.sic_codes || [],
      redFlags: c.red_flags || [],
    })),
    supplierConflicts: integrity.supplier_conflicts || [],
  } : null

  // --- Register of interests ---
  const interestsList = interestsData?.councillors || {}
  const interests = typeof interestsList === 'object' && !Array.isArray(interestsList)
    ? interestsList[councillor.id] || Object.values(interestsList).find(i => matchCouncillorName(i?.name, councillor.name))
    : null

  const interestsProfile = interests ? {
    companies: interests.declared_companies || [],
    employment: interests.declared_employment || [],
    land: interests.declared_land || [],
    securities: (interests.declared_securities || []).filter(s => s && s.toLowerCase() !== 'no' && s.toLowerCase() !== 'none'),
    sponsorship: interests.declared_sponsorship || [],
    memberships: interests.declared_memberships || [],
  } : null

  // --- Committee memberships ---
  const committees = []
  if (committeesData?.committees) {
    for (const com of committeesData.committees) {
      const member = (com.members || []).find(m =>
        m.uid === councillor.moderngov_uid || matchCouncillorName(m.name, councillor.name)
      )
      if (member) {
        committees.push({
          name: com.name,
          type: com.type,
          role: member.role,
        })
      }
    }
  }

  // --- Group info from politics_summary ---
  let groupInfo = null
  if (politicsSummary?.opposition_groups) {
    for (const group of politicsSummary.opposition_groups) {
      if (
        matchCouncillorName(group.leader, councillor.name) ||
        matchCouncillorName(group.deputy_leader, councillor.name)
      ) {
        groupInfo = {
          groupName: group.name,
          role: matchCouncillorName(group.leader, councillor.name) ? 'Leader' : 'Deputy Leader',
          seats: group.seats,
          formalOpposition: group.formal_opposition,
        }
        break
      }
    }
    // Check if this councillor is in any group (by party match)
    if (!groupInfo) {
      for (const group of politicsSummary.opposition_groups) {
        const inGroup = (group.composition || []).some(c => c.party === party)
        if (inGroup) {
          groupInfo = {
            groupName: group.name,
            role: 'Member',
            seats: group.seats,
            formalOpposition: group.formal_opposition,
          }
          break
        }
      }
    }
  }

  // --- Attack lines ---
  // Core attack lines from strategyEngine
  const coreAttackLines = generateAttackLines(councillor, integrity, interests)

  // Party-specific curated attacks
  const partyDb = PARTY_ATTACK_DATABASE[party] || PARTY_ATTACK_DATABASE.Independent || {}
  const partyAttackLines = [
    ...(partyDb.national || []),
    ...(partyDb.local || []),
    ...(partyDb.lcc_record || []),
  ]

  // Combine and sort by severity
  const allAttackLines = [
    ...coreAttackLines.map(a => ({ ...a, source: 'system', category: 'Personal' })),
    ...partyAttackLines.map(a => ({ ...a, category: 'Party' })),
  ].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
  })

  return {
    name: cleanName,
    rawName: councillor.name,
    party,
    ward: councillor.ward,
    email: councillor.email || '',
    notable: councillor.notable || [],
    groupInfo,
    committees,
    votingRecord,
    policyPositions,
    rebelCount,
    rebelRate: votingRecord.length > 0 ? rebelCount / votingRecord.length : 0,
    integrityProfile,
    interestsProfile,
    attackLines: allAttackLines,
    isOpposition: party !== 'Reform UK',
  }
}

// ---------------------------------------------------------------------------
// Predict Behaviour
// ---------------------------------------------------------------------------

/**
 * Map an agenda item text to matching policy areas.
 */
export function mapAgendaToPolicyAreas(agendaText) {
  if (!agendaText) return []
  const areas = []
  for (const mapping of AGENDA_POLICY_MAP) {
    if (mapping.keywords.test(agendaText)) {
      areas.push(mapping.area)
    }
  }
  return [...new Set(areas)]
}

/**
 * Predict how a councillor will behave in a meeting.
 * @param {Object} dossier - From buildCouncillorDossier
 * @param {string} meetingCommittee - Committee name
 * @param {string[]} agendaItems - Agenda item texts
 * @returns {Object} Prediction with position, confidence, reasoning
 */
export function predictBehaviour(dossier, meetingCommittee, agendaItems = []) {
  if (!dossier) return { likelyPosition: 'unknown', confidence: 'none', reasoning: 'No dossier available', likelyToSpeak: false, predictedArguments: [] }

  // Map agenda to policy areas
  const meetingAreas = new Set()
  for (const item of agendaItems) {
    for (const area of mapAgendaToPolicyAreas(item)) {
      meetingAreas.add(area)
    }
  }

  // Look up past votes on matching areas
  const relevantVotes = dossier.votingRecord.filter(v =>
    (v.policyAreas || []).some(a => meetingAreas.has(a))
  )

  let likelyPosition = 'unknown'
  let confidence = 'low'
  const reasoning = []
  const predictedArguments = []

  if (relevantVotes.length > 0) {
    const forCount = relevantVotes.filter(v => v.position === 'for').length
    const againstCount = relevantVotes.filter(v => v.position === 'against').length

    if (againstCount > forCount) {
      likelyPosition = 'oppose'
      confidence = againstCount >= 3 ? 'high' : 'medium'
      reasoning.push(`Voted against in ${againstCount} of ${relevantVotes.length} related recorded votes`)
    } else if (forCount > againstCount) {
      likelyPosition = 'support'
      confidence = forCount >= 3 ? 'high' : 'medium'
      reasoning.push(`Voted for in ${forCount} of ${relevantVotes.length} related recorded votes`)
    }
  }

  // Factor in group position
  if (dossier.groupInfo?.formalOpposition) {
    if (likelyPosition === 'unknown') likelyPosition = 'oppose'
    reasoning.push(`Member of formal opposition group (${dossier.groupInfo.groupName})`)
    if (confidence === 'low') confidence = 'medium'
  }

  // Factor in party
  if (dossier.isOpposition && likelyPosition === 'unknown') {
    likelyPosition = 'oppose'
    reasoning.push('Opposition party member — likely to challenge administration proposals')
  }

  // Leaders/deputies are likely to speak
  const isLeader = dossier.groupInfo?.role === 'Leader' || dossier.groupInfo?.role === 'Deputy Leader'
  const likelyToSpeak = isLeader || meetingAreas.has('budget_finance')

  if (isLeader) {
    reasoning.push(`${dossier.groupInfo.role} of ${dossier.groupInfo.groupName} — will likely lead the group response`)
  }

  // Predicted arguments based on party attack database and past votes
  const partyDb = PARTY_ATTACK_DATABASE[dossier.party] || {}
  for (const area of meetingAreas) {
    // LCC record-based arguments
    for (const line of partyDb.lcc_record || []) {
      if (line.severity === 'high' || line.severity === 'medium') {
        predictedArguments.push(line.text)
      }
    }
  }

  return {
    likelyPosition,
    confidence,
    reasoning,
    likelyToSpeak,
    predictedArguments: [...new Set(predictedArguments)].slice(0, 5),
  }
}

// ---------------------------------------------------------------------------
// Meeting Briefing
// ---------------------------------------------------------------------------

/**
 * Find the matching committee for a meeting from committees.json.
 * Uses exact or fuzzy name matching.
 */
export function findCommitteeForMeeting(meetingCommittee, committeesData) {
  if (!meetingCommittee || !committeesData?.committees) return null

  const lower = meetingCommittee.toLowerCase().trim()

  // Exact match
  const exact = committeesData.committees.find(c => c.name.toLowerCase().trim() === lower)
  if (exact) return exact

  // Fuzzy: check if one contains the other
  return committeesData.committees.find(c => {
    const cLower = c.name.toLowerCase().trim()
    return cLower.includes(lower) || lower.includes(cLower)
  }) || null
}

/**
 * Build a comprehensive meeting briefing.
 * @param {Object} meeting - From meetings.json
 * @param {Object} allData - All data sources
 * @returns {Object} Meeting briefing
 */
export function buildMeetingBriefing(meeting, allData) {
  const { committeesData, councillors, votingData, dogeFindings, reformTransformation, politicsSummary } = allData || {}

  if (!meeting) return null

  // Find committee
  const committee = findCommitteeForMeeting(meeting.committee, committeesData)

  // Split members into Reform and Opposition
  const reformMembers = []
  const oppositionMembers = []

  if (committee?.members) {
    for (const member of committee.members) {
      if (member.party === 'Reform UK') {
        reformMembers.push(member)
      } else {
        // Build mini-dossier for opposition members
        const dossier = buildCouncillorDossier(member.name, allData)
        const prediction = dossier
          ? predictBehaviour(dossier, meeting.committee, meeting.agenda_items || [])
          : null

        oppositionMembers.push({
          ...member,
          dossier,
          prediction,
          topAttackLines: dossier?.attackLines?.slice(0, 3) || [],
        })
      }
    }
  }

  // Map agenda items to intelligence
  const agendaIntel = (meeting.agenda_items || []).map(item => {
    const policyAreas = mapAgendaToPolicyAreas(item)

    // Find matching past votes
    const matchingVotes = (votingData?.votes || []).filter(v =>
      (v.policy_area || []).some(a => policyAreas.includes(a))
    ).slice(0, 3)

    // Find matching DOGE findings
    const matchingFindings = []
    if (dogeFindings?.findings) {
      for (const finding of dogeFindings.findings) {
        const label = (finding.label || '').toLowerCase()
        if (policyAreas.some(a => label.includes(a.replace(/_/g, ' ')))) {
          matchingFindings.push(finding)
        }
      }
    }

    // Find matching Reform achievements
    const matchingAchievements = []
    if (reformTransformation?.achievements) {
      for (const [key, achievement] of Object.entries(reformTransformation.achievements)) {
        // Map achievement keys to policy areas
        const achievementAreas = {
          financial_turnaround: ['budget_finance'],
          council_tax: ['council_tax', 'budget_finance'],
          bonds_scandal_exposed: ['budget_finance', 'governance_constitution'],
          pension_fund_reform: ['budget_finance'],
          care_homes_saved: ['social_care'],
          councillor_allowances: ['governance_constitution', 'budget_finance'],
          ai_innovation: ['budget_finance', 'education_schools'],
          roads: ['transport_highways'],
          send_improvement: ['education_schools'],
        }
        const areas = achievementAreas[key] || []
        if (areas.some(a => policyAreas.includes(a))) {
          matchingAchievements.push(achievement)
        }
      }
    }

    // Matching rebuttals
    const matchingRebuttals = REFORM_REBUTTALS.filter(r =>
      r.policyAreas.some(a => policyAreas.includes(a))
    )

    return {
      text: item,
      policyAreas,
      matchingVotes,
      matchingFindings,
      matchingAchievements,
      matchingRebuttals,
    }
  })

  // Key battlegrounds — agenda items where opposition likely to challenge
  const keyBattlegrounds = agendaIntel
    .filter(a =>
      a.policyAreas.length > 0 && (a.matchingVotes.length > 0 || a.matchingRebuttals.length > 0 || a.policyAreas.includes('budget_finance'))
    )
    .map(a => {
      const reasons = []
      if (a.matchingVotes.length > 0) reasons.push(`${a.matchingVotes.length} related past vote(s)`)
      if (a.matchingRebuttals.length > 0) reasons.push(`${a.matchingRebuttals.length} known opposition attack line(s)`)
      if (a.policyAreas.includes('budget_finance')) reasons.push('Budget/finance topic — high political salience')
      if (a.matchingFindings.length > 0) reasons.push(`${a.matchingFindings.length} DOGE finding(s) linked`)
      return {
        item: a.text,
        reason: reasons.join('. ') || 'Relevant policy area identified',
        policyAreas: a.policyAreas,
        matchingVotes: a.matchingVotes,
        matchingRebuttals: a.matchingRebuttals,
      }
    })

  // War-game: build risk assessment
  const riskLevel = keyBattlegrounds.length >= 3 ? 'high'
    : keyBattlegrounds.length >= 1 ? 'medium'
    : 'low'

  const oppositionSpeakers = oppositionMembers.filter(m => m.prediction?.likelyToSpeak)
  const likelyOpposers = oppositionMembers.filter(m => m.prediction?.likelyPosition === 'oppose')

  // War-game: build per-agenda-item attack predictions with counters
  const warGame = agendaIntel
    .filter(a => a.policyAreas.length > 0)
    .map(a => {
      // Collect predicted attacks from all opposition members for this agenda item
      const attackPredictions = oppositionMembers
        .filter(m => m.prediction?.likelyPosition === 'oppose' || m.prediction?.likelyToSpeak)
        .map(m => {
          // Find attacks relevant to this agenda item's policy areas
          const relevantAttacks = (m.topAttackLines || [])
            .filter(al => {
              // Check if attack line's text relates to any policy area
              const attackAreas = mapAgendaToPolicyAreas(al.text)
              return attackAreas.some(area => a.policyAreas.includes(area)) || a.policyAreas.includes('budget_finance')
            })
            .slice(0, 2)

          // Predicted arguments from their behaviour prediction
          const relevantArgs = (m.prediction?.predictedArguments || []).slice(0, 3)

          if (relevantAttacks.length === 0 && relevantArgs.length === 0) return null

          return {
            name: m.name,
            party: m.party,
            role: m.role,
            likelyToSpeak: m.prediction?.likelyToSpeak,
            attackLines: relevantAttacks,
            predictedArguments: relevantArgs,
          }
        })
        .filter(Boolean)

      // Build counter-arguments from Reform rebuttals and achievements
      const counters = [
        ...a.matchingRebuttals.map(r => ({
          type: 'rebuttal',
          trigger: r.attack,
          response: r.rebuttal,
          source: r.source || 'prepared',
        })),
        ...a.matchingAchievements.map(ach => ({
          type: 'achievement',
          trigger: null,
          response: ach.title || ach.headline || (typeof ach === 'string' ? ach : ''),
          detail: ach.detail || '',
          source: 'reform_record',
        })),
      ]

      // Supporting data from DOGE findings
      const supportingData = a.matchingFindings.map(f => ({
        label: f.label,
        value: f.value,
        severity: f.severity,
      }))

      return {
        agendaItem: a.text,
        policyAreas: a.policyAreas,
        riskLevel: attackPredictions.length >= 2 ? 'high' : attackPredictions.length >= 1 ? 'medium' : 'low',
        attackPredictions,
        counters,
        supportingData,
        pastVoteContext: a.matchingVotes.map(v => ({
          title: v.title,
          date: v.date,
          outcome: v.outcome,
        })),
      }
    })
    .filter(w => w.attackPredictions.length > 0 || w.counters.length > 0)

  // Meeting documents
  const documents = (meeting.documents || []).map(doc => ({
    title: typeof doc === 'string' ? doc : doc.title || doc.name,
    url: typeof doc === 'object' ? doc.url : null,
  }))

  return {
    meeting: {
      id: meeting.id,
      date: meeting.date,
      time: meeting.time,
      committee: meeting.committee,
      type: meeting.type,
      venue: meeting.venue,
      link: meeting.link,
      agendaItems: meeting.agenda_items || [],
      documents,
    },
    committee: committee ? {
      name: committee.name,
      type: committee.type,
      totalMembers: committee.members?.length || 0,
    } : null,
    reformMembers,
    oppositionMembers,
    agendaIntel,
    keyBattlegrounds,
    warGame,
    riskAssessment: {
      level: riskLevel,
      oppositionSpeakers: oppositionSpeakers.length,
      likelyOpposers: likelyOpposers.length,
      battlegroundCount: keyBattlegrounds.length,
      totalAgendaItems: (meeting.agenda_items || []).length,
      politicalItems: agendaIntel.filter(a => a.policyAreas.length > 0).length,
    },
  }
}

// ---------------------------------------------------------------------------
// Topic-Based Attack Lines
// ---------------------------------------------------------------------------

/**
 * Get all attack material relevant to a policy area.
 */
export function getTopicAttackLines(policyArea, allData) {
  const { reformTransformation, dogeFindings } = allData || {}
  const lines = []

  // Party attacks from all parties for this area
  for (const [partyName, partyDb] of Object.entries(PARTY_ATTACK_DATABASE)) {
    for (const category of ['national', 'local', 'lcc_record']) {
      for (const line of partyDb[category] || []) {
        // Keyword match — check if the attack line is relevant to this area
        const areas = mapAgendaToPolicyAreas(line.text)
        if (areas.includes(policyArea)) {
          lines.push({ ...line, party: partyName, category })
        }
      }
    }
  }

  // DOGE findings
  if (dogeFindings?.findings && (policyArea === 'budget_finance' || policyArea === 'governance_constitution')) {
    for (const finding of dogeFindings.findings) {
      if (finding.severity === 'critical' || finding.severity === 'warning') {
        lines.push({
          text: `${finding.value || ''} ${finding.label || ''}`.trim(),
          severity: finding.severity === 'critical' ? 'high' : 'medium',
          source: 'DOGE Analysis',
          category: 'spending',
        })
      }
    }
  }

  return lines
}

// ---------------------------------------------------------------------------
// Reform Defence Lines
// ---------------------------------------------------------------------------

/**
 * Get Reform's defence/talking points for a policy area.
 */
export function buildReformDefenceLines(policyArea, reformTransformation) {
  if (!reformTransformation) return []

  const lines = []
  const achievementAreas = {
    financial_turnaround: ['budget_finance'],
    council_tax: ['council_tax', 'budget_finance'],
    bonds_scandal_exposed: ['budget_finance', 'governance_constitution'],
    pension_fund_reform: ['budget_finance'],
    care_homes_saved: ['social_care'],
    councillor_allowances: ['governance_constitution', 'budget_finance'],
    ai_innovation: ['budget_finance', 'education_schools'],
    roads: ['transport_highways'],
    send_improvement: ['education_schools'],
  }

  for (const [key, achievement] of Object.entries(reformTransformation.achievements || {})) {
    const areas = achievementAreas[key] || []
    if (areas.includes(policyArea)) {
      for (const item of achievement.items || []) {
        lines.push({
          headline: achievement.headline,
          metric: item.metric,
          label: item.label,
          detail: item.detail,
        })
      }
    }
  }

  // Add matching rebuttals
  const rebuttals = REFORM_REBUTTALS.filter(r => r.policyAreas.includes(policyArea))
  for (const r of rebuttals) {
    lines.push({
      headline: 'Rebuttal',
      metric: r.attack,
      label: 'Opposition attack',
      detail: r.rebuttal,
    })
  }

  return lines
}

// ---------------------------------------------------------------------------
// Print Briefing Generator
// ---------------------------------------------------------------------------

/**
 * Generate a printable text briefing from a meeting briefing.
 */
export function generatePrintBriefing(briefing) {
  if (!briefing) return ''

  const lines = []
  const { meeting, reformMembers, oppositionMembers, agendaIntel, keyBattlegrounds } = briefing

  lines.push('═══════════════════════════════════════════════════')
  lines.push(`MEETING INTELLIGENCE BRIEFING`)
  lines.push('═══════════════════════════════════════════════════')
  lines.push(`Committee: ${meeting.committee}`)
  lines.push(`Date: ${meeting.date} at ${meeting.time || 'TBC'}`)
  lines.push(`Venue: ${meeting.venue || 'TBC'}`)
  lines.push('')

  // Reform team
  lines.push('─── OUR TEAM ───')
  for (const m of reformMembers) {
    lines.push(`  ${m.name} (${m.role})`)
  }
  lines.push('')

  // Opposition
  lines.push('─── OPPOSITION IN THE ROOM ───')
  for (const m of oppositionMembers) {
    const pred = m.prediction
    lines.push(`  ${m.name} — ${m.party} (${m.role})`)
    if (pred) {
      lines.push(`    Predicted: ${pred.likelyPosition.toUpperCase()} (${pred.confidence} confidence)`)
      if (pred.likelyToSpeak) lines.push(`    ⚠ LIKELY TO SPEAK`)
    }
    if (m.topAttackLines.length > 0) {
      lines.push(`    Attack lines:`)
      for (const line of m.topAttackLines) {
        lines.push(`      • [${line.severity?.toUpperCase()}] ${line.text}`)
      }
    }
    lines.push('')
  }

  // Key battlegrounds
  if (keyBattlegrounds.length > 0) {
    lines.push('─── KEY BATTLEGROUND AGENDA ITEMS ───')
    for (const item of keyBattlegrounds) {
      lines.push(`  • ${item.text}`)
      if (item.matchingRebuttals.length > 0) {
        lines.push(`    Defence: ${item.matchingRebuttals[0].rebuttal.slice(0, 120)}...`)
      }
    }
    lines.push('')
  }

  // Agenda intel
  lines.push('─── AGENDA ANALYSIS ───')
  for (const item of agendaIntel) {
    if (item.policyAreas.length === 0) continue
    lines.push(`  ${item.text}`)
    lines.push(`    Topics: ${item.policyAreas.map(a => POLICY_AREAS[a] || a).join(', ')}`)
    if (item.matchingVotes.length > 0) {
      lines.push(`    Past votes: ${item.matchingVotes.map(v => `${v.title} (${v.outcome})`).join('; ')}`)
    }
    lines.push('')
  }

  lines.push('═══════════════════════════════════════════════════')
  lines.push('Generated by AI DOGE Intelligence System')
  lines.push('═══════════════════════════════════════════════════')

  return lines.join('\n')
}
