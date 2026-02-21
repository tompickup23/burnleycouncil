import { describe, it, expect } from 'vitest'
import {
  PARTY_ATTACK_DATABASE,
  REFORM_REBUTTALS,
  POLICY_AREAS,
  cleanCouncillorName,
  buildCouncillorDossier,
  predictBehaviour,
  mapAgendaToPolicyAreas,
  findCommitteeForMeeting,
  buildMeetingBriefing,
  getTopicAttackLines,
  buildReformDefenceLines,
  generatePrintBriefing,
} from './intelligenceEngine'

// ── Test fixtures ──────────────────────────────────────────────────

const mockCouncillors = [
  {
    id: 'cdowding',
    name: 'County Councillor Gina Dowding',
    moderngov_uid: '4438',
    ward: 'Lancaster Central',
    party: 'Green Party',
    email: 'gina.dowding@lancashire.gov.uk',
    roles: [],
    group_role: 'deputy_leader',
    group_name: 'Progressive Lancashire',
    notable: ['Fourth-term county councillor (since 2013)', 'Former MEP'],
  },
  {
    id: 'caali',
    name: 'County Councillor Azhar Ali OBE',
    moderngov_uid: '4455',
    ward: 'Nelson East',
    party: 'Independent',
    email: 'azhar.ali@lancashire.gov.uk',
    roles: [],
    group_role: 'leader',
    group_name: 'Progressive Lancashire',
    notable: ['Former Labour leader'],
  },
  {
    id: 'catkinson',
    name: 'County Councillor Stephen Atkinson',
    moderngov_uid: '33642',
    ward: 'Ribble Valley North East',
    party: 'Reform UK',
    email: 'stephen.atkinson@lancashire.gov.uk',
    roles: [],
    group_role: 'leader',
    group_name: 'Reform UK',
    notable: [],
  },
  {
    id: 'criggott',
    name: 'County Councillor Aidy Riggott',
    moderngov_uid: '33700',
    ward: 'Euxton, Buckshaw & Astley',
    party: 'Conservative',
    email: '',
    roles: [],
    group_role: 'leader',
    group_name: 'Conservative',
    notable: [],
  },
]

const mockVotingData = {
  votes: [
    {
      id: 'budget-2025-26-main',
      meeting: 'Full Council',
      meeting_date: '2025-02-20',
      title: 'Budget 2025/26',
      type: 'budget',
      is_amendment: false,
      amendment_by: null,
      outcome: 'carried',
      policy_area: ['budget_finance', 'council_tax'],
      significance: 'high',
      description: 'Reform UK main budget',
      for_count: 53,
      against_count: 29,
      votes_by_councillor: [
        { name: 'County Councillor Gina Dowding', uid: '4438', vote: 'against' },
        { name: 'County Councillor Azhar Ali OBE', uid: '4455', vote: 'against' },
        { name: 'County Councillor Stephen Atkinson', uid: '33642', vote: 'for' },
        { name: 'County Councillor Aidy Riggott', uid: '33700', vote: 'against' },
      ],
      votes_by_party: {
        'Green Party': { for: 0, against: 3, abstain: 0, absent: 0 },
        Independent: { for: 0, against: 8, abstain: 0, absent: 0 },
        'Reform UK': { for: 53, against: 0, abstain: 0, absent: 0 },
        Conservative: { for: 0, against: 8, abstain: 0, absent: 0 },
      },
    },
    {
      id: 'green-amendment-renewables',
      meeting: 'Full Council',
      meeting_date: '2025-02-20',
      title: 'Budget 2025/26 - Green Amendment (Renewables)',
      type: 'budget',
      is_amendment: true,
      amendment_by: 'Green',
      outcome: 'rejected',
      policy_area: ['budget_finance', 'environment_climate'],
      significance: 'medium',
      description: 'Green £40k renewables feasibility amendment',
      for_count: 31,
      against_count: 40,
      votes_by_councillor: [
        { name: 'County Councillor Gina Dowding', uid: '4438', vote: 'for' },
        { name: 'County Councillor Azhar Ali OBE', uid: '4455', vote: 'for' },
        { name: 'County Councillor Stephen Atkinson', uid: '33642', vote: 'against' },
      ],
      votes_by_party: {
        'Green Party': { for: 3, against: 0, abstain: 0, absent: 0 },
        Independent: { for: 8, against: 0, abstain: 0, absent: 0 },
        'Reform UK': { for: 0, against: 40, abstain: 0, absent: 0 },
      },
    },
    {
      id: 'halal-motion',
      meeting: 'Full Council',
      meeting_date: '2024-10-14',
      title: 'Halal Meat Supply Motion',
      type: 'motion',
      is_amendment: false,
      outcome: 'carried',
      policy_area: ['equalities_diversity'],
      significance: 'medium',
      description: 'Motion on halal meat',
      for_count: 45,
      against_count: 20,
      votes_by_councillor: [
        { name: 'County Councillor Gina Dowding', uid: '4438', vote: 'against' },
        { name: 'County Councillor Azhar Ali OBE', uid: '4455', vote: 'for' },
      ],
      votes_by_party: {
        'Green Party': { for: 0, against: 3, abstain: 0, absent: 0 },
        Independent: { for: 6, against: 2, abstain: 0, absent: 0 },
      },
    },
  ],
}

const mockIntegrityData = {
  councillors: [
    {
      name: 'Gina Dowding',
      councillor_id: 'cdowding',
      integrity_score: 65,
      risk_level: 'elevated',
      red_flags: [
        { type: 'property_company', severity: 'info', description: 'SIC 68100 — property/holding company' },
        { type: 'multiple_directorships', severity: 'medium', description: '6 total directorships' },
      ],
      total_directorships: 6,
      active_directorships: 1,
      companies_house: {
        active_directorships: 1,
        companies: [
          { company_name: 'HAWTHORN AND SLATE LTD', company_number: '16554030', role: 'director', company_status: 'active', appointed_on: '2025-07-01', resigned_on: '', sic_codes: ['68100'], red_flags: [] },
        ],
      },
    },
  ],
}

const mockInterestsData = {
  councillors: {
    cdowding: {
      name: 'County Councillor Gina Dowding',
      declared_companies: ['Hawthorn and Slate Ltd'],
      declared_employment: ['County Councillor'],
      declared_land: ['Sensitive information held under Section 32'],
      declared_securities: [],
      declared_sponsorship: [],
      declared_memberships: ['Green Party'],
    },
  },
}

const mockCommitteesData = {
  committees: [
    {
      id: 'cabinet',
      name: 'Cabinet',
      type: 'executive',
      moderngov_cid: '122',
      members: [
        { name: 'Stephen Atkinson', uid: '33642', role: 'Leader', party: 'Reform UK' },
      ],
    },
    {
      id: 'budget-and-finance-scrutiny-committee',
      name: 'Budget and Finance Scrutiny Committee',
      type: 'scrutiny',
      moderngov_cid: '2056',
      members: [
        { name: 'Gina Dowding', uid: '4438', role: 'Member', party: 'Green Party' },
        { name: 'Azhar Ali OBE', uid: '4455', role: 'Member', party: 'Independent' },
        { name: 'Aidy Riggott', uid: '33700', role: 'Member', party: 'Conservative' },
        { name: 'Mark Jewell', uid: '33800', role: 'Member', party: 'Liberal Democrats' },
        { name: 'Joel Tetlow', uid: '33835', role: 'Chair', party: 'Reform UK' },
        { name: 'Ashley Joynes', uid: '33850', role: 'Member', party: 'Reform UK' },
      ],
    },
  ],
}

const mockPoliticsSummary = {
  total_councillors: 84,
  majority_threshold: 43,
  opposition_groups: [
    {
      name: 'Progressive Lancashire',
      formal_opposition: true,
      seats: 11,
      composition: [{ party: 'Independent', count: 7 }, { party: 'Green Party', count: 4 }],
      leader: 'Azhar Ali OBE',
      leader_ward: 'Nelson East',
      deputy_leader: 'Gina Dowding',
      deputy_leader_ward: 'Lancaster Central',
    },
    {
      name: 'Conservative',
      formal_opposition: false,
      seats: 8,
      composition: [{ party: 'Conservative', count: 8 }],
      leader: 'Aidy Riggott',
      leader_ward: 'Euxton, Buckshaw & Astley',
      deputy_leader: 'Peter Buckley',
    },
  ],
}

const mockReformTransformation = {
  achievements: {
    financial_turnaround: {
      headline: 'Overspend Eliminated',
      items: [
        { metric: '£28M → near zero', label: 'Projected overspend eliminated', detail: 'Inherited £28M reduced to near zero' },
      ],
    },
    council_tax: {
      headline: 'Lowest Council Tax Rise',
      items: [
        { metric: '3.80%', label: 'Reform\'s council tax rise', detail: 'Lowest rise in 12 years' },
      ],
    },
    roads: {
      headline: 'Roads & Pothole Blitz',
      items: [
        { metric: '42%', label: 'Reduction in road defects', detail: '42% in first 6 months' },
      ],
    },
    send_improvement: {
      headline: 'SEND Transformation',
      items: [
        { metric: '677 new places', label: 'SEND pupil places created', detail: '277 + 400 announced' },
      ],
    },
  },
  comparison_table: {
    rows: [
      { metric: 'Council tax rise', reform: '3.80%', conservative: '4.99%', verdict: 'Lower' },
    ],
  },
}

const mockDogeFindings = {
  findings: [
    { label: 'Likely duplicate payments', value: '£93.6M', severity: 'critical' },
    { label: 'Suspected split payments', value: '£433.6M', severity: 'warning' },
  ],
  fraud_triangle: { overall_score: 77.1, risk_level: 'elevated' },
}

const allData = {
  councillors: mockCouncillors,
  votingData: mockVotingData,
  integrityData: mockIntegrityData,
  interestsData: mockInterestsData,
  committeesData: mockCommitteesData,
  politicsSummary: mockPoliticsSummary,
  reformTransformation: mockReformTransformation,
  dogeFindings: mockDogeFindings,
}

// ── Tests ──────────────────────────────────────────────────────────

describe('PARTY_ATTACK_DATABASE', () => {
  it('has entries for all main parties', () => {
    expect(PARTY_ATTACK_DATABASE['Green Party']).toBeDefined()
    expect(PARTY_ATTACK_DATABASE.Labour).toBeDefined()
    expect(PARTY_ATTACK_DATABASE.Conservative).toBeDefined()
    expect(PARTY_ATTACK_DATABASE['Liberal Democrats']).toBeDefined()
    expect(PARTY_ATTACK_DATABASE.Independent).toBeDefined()
    expect(PARTY_ATTACK_DATABASE['Our West Lancashire']).toBeDefined()
  })

  it('Green Party has national, local, and lcc_record entries', () => {
    const green = PARTY_ATTACK_DATABASE['Green Party']
    expect(green.national.length).toBeGreaterThan(0)
    expect(green.local.length).toBeGreaterThan(0)
    expect(green.lcc_record.length).toBeGreaterThan(0)
  })

  it('all attack lines have required fields', () => {
    for (const [, partyDb] of Object.entries(PARTY_ATTACK_DATABASE)) {
      for (const category of ['national', 'local', 'lcc_record']) {
        for (const line of partyDb[category] || []) {
          expect(line).toHaveProperty('text')
          expect(line).toHaveProperty('severity')
          expect(['high', 'medium', 'low']).toContain(line.severity)
          expect(line).toHaveProperty('source')
        }
      }
    }
  })

  it('Conservative has LCC-specific record attacks', () => {
    const con = PARTY_ATTACK_DATABASE.Conservative
    expect(con.lcc_record.some(l => l.text.includes('£28M'))).toBe(true)
    expect(con.lcc_record.some(l => l.text.includes('VeLTIP'))).toBe(true)
  })

  it('Labour has Azhar Ali attack line', () => {
    const lab = PARTY_ATTACK_DATABASE.Labour
    const allLines = [...lab.national, ...lab.local, ...lab.lcc_record]
    expect(allLines.some(l => l.text.includes('Azhar Ali'))).toBe(true)
  })
})

describe('REFORM_REBUTTALS', () => {
  it('has rebuttals for common attacks', () => {
    expect(REFORM_REBUTTALS.length).toBeGreaterThan(5)
  })

  it('each rebuttal has attack, rebuttal, and policyAreas', () => {
    for (const r of REFORM_REBUTTALS) {
      expect(r).toHaveProperty('attack')
      expect(r).toHaveProperty('rebuttal')
      expect(r).toHaveProperty('policyAreas')
      expect(r.policyAreas.length).toBeGreaterThan(0)
    }
  })

  it('has budget-related rebuttals', () => {
    const budgetRebuttals = REFORM_REBUTTALS.filter(r => r.policyAreas.includes('budget_finance'))
    expect(budgetRebuttals.length).toBeGreaterThan(0)
  })
})

describe('POLICY_AREAS', () => {
  it('has all 12 policy areas', () => {
    expect(Object.keys(POLICY_AREAS).length).toBe(12)
  })
})

describe('cleanCouncillorName', () => {
  it('removes County Councillor prefix', () => {
    expect(cleanCouncillorName('County Councillor Gina Dowding')).toBe('Gina Dowding')
  })

  it('removes Mr/Mrs/Dr prefixes', () => {
    expect(cleanCouncillorName('County Councillor Mr Joel Michael Tetlow')).toBe('Joel Michael Tetlow')
  })

  it('handles Councillor without County', () => {
    expect(cleanCouncillorName('Councillor Mrs Marion Atkinson')).toBe('Marion Atkinson')
  })

  it('returns empty string for null input', () => {
    expect(cleanCouncillorName(null)).toBe('')
  })

  it('returns name unchanged if no prefix', () => {
    expect(cleanCouncillorName('Stephen Atkinson')).toBe('Stephen Atkinson')
  })
})

describe('buildCouncillorDossier', () => {
  it('returns null if councillor not found', () => {
    expect(buildCouncillorDossier('Nobody', allData)).toBeNull()
  })

  it('returns null if no councillors data', () => {
    expect(buildCouncillorDossier('Gina Dowding', {})).toBeNull()
  })

  it('finds councillor by cleaned name', () => {
    const dossier = buildCouncillorDossier('Gina Dowding', allData)
    expect(dossier).not.toBeNull()
    expect(dossier.name).toBe('Gina Dowding')
    expect(dossier.party).toBe('Green Party')
    expect(dossier.ward).toBe('Lancaster Central')
  })

  it('finds councillor by full raw name', () => {
    const dossier = buildCouncillorDossier('County Councillor Gina Dowding', allData)
    expect(dossier).not.toBeNull()
    expect(dossier.name).toBe('Gina Dowding')
  })

  it('includes voting record', () => {
    const dossier = buildCouncillorDossier('Gina Dowding', allData)
    expect(dossier.votingRecord.length).toBe(3)
    expect(dossier.votingRecord[0].position).toBe('against') // Voted against budget
  })

  it('detects rebel votes', () => {
    const dossier = buildCouncillorDossier('Gina Dowding', allData)
    // Gina: Green, all Green voted against budget → she voted against → not rebel
    expect(dossier.votingRecord[0].isRebel).toBe(false)
  })

  it('computes policy positions', () => {
    const dossier = buildCouncillorDossier('Gina Dowding', allData)
    expect(dossier.policyPositions).toHaveProperty('budget_finance')
    // Against main budget + for Green amendment = 1 against + 1 for
    expect(dossier.policyPositions.budget_finance.against).toBe(1)
    expect(dossier.policyPositions.budget_finance.for).toBe(1)
  })

  it('includes integrity profile', () => {
    const dossier = buildCouncillorDossier('Gina Dowding', allData)
    expect(dossier.integrityProfile).not.toBeNull()
    expect(dossier.integrityProfile.riskLevel).toBe('elevated')
    expect(dossier.integrityProfile.totalDirectorships).toBe(6)
    expect(dossier.integrityProfile.companies.length).toBe(1)
    expect(dossier.integrityProfile.companies[0].name).toBe('HAWTHORN AND SLATE LTD')
  })

  it('includes register of interests', () => {
    const dossier = buildCouncillorDossier('Gina Dowding', allData)
    expect(dossier.interestsProfile).not.toBeNull()
    expect(dossier.interestsProfile.companies).toContain('Hawthorn and Slate Ltd')
  })

  it('includes committee memberships', () => {
    const dossier = buildCouncillorDossier('Gina Dowding', allData)
    expect(dossier.committees.length).toBeGreaterThan(0)
    expect(dossier.committees.some(c => c.name.includes('Budget'))).toBe(true)
  })

  it('includes group info for opposition leaders', () => {
    const dossier = buildCouncillorDossier('Gina Dowding', allData)
    expect(dossier.groupInfo).not.toBeNull()
    expect(dossier.groupInfo.role).toBe('Deputy Leader')
    expect(dossier.groupInfo.groupName).toBe('Progressive Lancashire')
    expect(dossier.groupInfo.formalOpposition).toBe(true)
  })

  it('includes attack lines sorted by severity', () => {
    const dossier = buildCouncillorDossier('Gina Dowding', allData)
    expect(dossier.attackLines.length).toBeGreaterThan(3)
    // First should be high severity
    const highLines = dossier.attackLines.filter(l => l.severity === 'high')
    expect(highLines.length).toBeGreaterThan(0)
  })

  it('marks opposition councillors correctly', () => {
    const gina = buildCouncillorDossier('Gina Dowding', allData)
    expect(gina.isOpposition).toBe(true)

    const stephen = buildCouncillorDossier('Stephen Atkinson', allData)
    expect(stephen.isOpposition).toBe(false)
  })

  it('includes notable facts', () => {
    const dossier = buildCouncillorDossier('Gina Dowding', allData)
    expect(dossier.notable).toContain('Former MEP')
  })

  it('handles missing optional data gracefully', () => {
    const minData = { councillors: mockCouncillors }
    const dossier = buildCouncillorDossier('Gina Dowding', minData)
    expect(dossier).not.toBeNull()
    expect(dossier.votingRecord).toEqual([])
    expect(dossier.integrityProfile).toBeNull()
    expect(dossier.interestsProfile).toBeNull()
    expect(dossier.committees).toEqual([])
  })
})

describe('mapAgendaToPolicyAreas', () => {
  it('maps budget items correctly', () => {
    const areas = mapAgendaToPolicyAreas('Revenue Budget 2026/27')
    expect(areas).toContain('budget_finance')
  })

  it('maps health items', () => {
    const areas = mapAgendaToPolicyAreas('NHS Integrated Care Board report')
    expect(areas).toContain('health_wellbeing')
  })

  it('maps transport items', () => {
    const areas = mapAgendaToPolicyAreas('Highways maintenance programme')
    expect(areas).toContain('transport_highways')
  })

  it('maps education items', () => {
    const areas = mapAgendaToPolicyAreas('SEND Improvement Plan')
    expect(areas).toContain('education_schools')
  })

  it('returns empty array for generic items', () => {
    const areas = mapAgendaToPolicyAreas('Minutes of the Last Meeting')
    expect(areas).toEqual([])
  })

  it('maps multiple areas for complex items', () => {
    const areas = mapAgendaToPolicyAreas('Council Tax Budget 2026/27')
    expect(areas).toContain('budget_finance')
    expect(areas).toContain('council_tax')
  })

  it('handles null input', () => {
    expect(mapAgendaToPolicyAreas(null)).toEqual([])
  })
})

describe('predictBehaviour', () => {
  it('predicts opposition for formal opposition member on budget', () => {
    const dossier = buildCouncillorDossier('Gina Dowding', allData)
    const pred = predictBehaviour(dossier, 'Budget and Finance Scrutiny Committee', ['Revenue Budget 2026/27'])
    expect(pred.likelyPosition).toBe('oppose')
    expect(pred.confidence).not.toBe('none')
  })

  it('returns unknown for null dossier', () => {
    const pred = predictBehaviour(null, 'Test', [])
    expect(pred.likelyPosition).toBe('unknown')
    expect(pred.confidence).toBe('none')
  })

  it('identifies leaders as likely speakers', () => {
    const dossier = buildCouncillorDossier('Azhar Ali OBE', allData)
    const pred = predictBehaviour(dossier, 'Full Council', ['Revenue Budget 2026/27'])
    expect(pred.likelyToSpeak).toBe(true)
  })

  it('includes reasoning', () => {
    const dossier = buildCouncillorDossier('Gina Dowding', allData)
    const pred = predictBehaviour(dossier, 'Full Council', ['Revenue Budget 2026/27'])
    expect(pred.reasoning.length).toBeGreaterThan(0)
  })

  it('has predicted arguments', () => {
    const dossier = buildCouncillorDossier('Gina Dowding', allData)
    const pred = predictBehaviour(dossier, 'Full Council', ['Revenue Budget 2026/27'])
    expect(pred.predictedArguments).toBeDefined()
  })

  it('handles empty agenda', () => {
    const dossier = buildCouncillorDossier('Gina Dowding', allData)
    const pred = predictBehaviour(dossier, 'Full Council', [])
    expect(pred.likelyPosition).toBeDefined()
  })
})

describe('findCommitteeForMeeting', () => {
  it('finds committee by exact name', () => {
    const result = findCommitteeForMeeting('Budget and Finance Scrutiny Committee', mockCommitteesData)
    expect(result).not.toBeNull()
    expect(result.name).toBe('Budget and Finance Scrutiny Committee')
  })

  it('finds committee by fuzzy match', () => {
    const result = findCommitteeForMeeting('Budget and Finance Scrutiny', mockCommitteesData)
    expect(result).not.toBeNull()
  })

  it('returns null for no match', () => {
    expect(findCommitteeForMeeting('Nonexistent Committee', mockCommitteesData)).toBeNull()
  })

  it('returns null for null input', () => {
    expect(findCommitteeForMeeting(null, mockCommitteesData)).toBeNull()
    expect(findCommitteeForMeeting('Test', null)).toBeNull()
  })
})

describe('buildMeetingBriefing', () => {
  const mockMeeting = {
    id: 'budget-scrutiny-2026-03-01',
    date: '2026-03-01',
    time: '09:30',
    committee: 'Budget and Finance Scrutiny Committee',
    type: 'scrutiny',
    venue: 'County Hall, Preston',
    link: 'https://council.lancashire.gov.uk/test',
    agenda_items: [
      'Revenue Budget 2026/27',
      'Capital Programme Update',
      'Minutes of the Last Meeting',
      'SEND Improvement Plan Update',
    ],
  }

  it('returns null for null meeting', () => {
    expect(buildMeetingBriefing(null, allData)).toBeNull()
  })

  it('includes meeting details', () => {
    const briefing = buildMeetingBriefing(mockMeeting, allData)
    expect(briefing.meeting.date).toBe('2026-03-01')
    expect(briefing.meeting.committee).toBe('Budget and Finance Scrutiny Committee')
  })

  it('splits members into Reform and opposition', () => {
    const briefing = buildMeetingBriefing(mockMeeting, allData)
    expect(briefing.reformMembers.length).toBeGreaterThan(0)
    expect(briefing.oppositionMembers.length).toBeGreaterThan(0)
  })

  it('includes dossiers for opposition members', () => {
    const briefing = buildMeetingBriefing(mockMeeting, allData)
    const gina = briefing.oppositionMembers.find(m => m.name === 'Gina Dowding')
    expect(gina).toBeDefined()
    expect(gina.dossier).not.toBeNull()
    expect(gina.topAttackLines.length).toBeGreaterThan(0)
  })

  it('includes predictions for opposition members', () => {
    const briefing = buildMeetingBriefing(mockMeeting, allData)
    const gina = briefing.oppositionMembers.find(m => m.name === 'Gina Dowding')
    expect(gina.prediction).not.toBeNull()
    expect(gina.prediction.likelyPosition).toBeDefined()
  })

  it('maps agenda items to intelligence', () => {
    const briefing = buildMeetingBriefing(mockMeeting, allData)
    expect(briefing.agendaIntel.length).toBe(4)
    // Budget item should have policy areas
    const budgetItem = briefing.agendaIntel.find(a => a.text.includes('Revenue Budget'))
    expect(budgetItem.policyAreas).toContain('budget_finance')
  })

  it('matches agenda to past votes', () => {
    const briefing = buildMeetingBriefing(mockMeeting, allData)
    const budgetItem = briefing.agendaIntel.find(a => a.text.includes('Revenue Budget'))
    expect(budgetItem.matchingVotes.length).toBeGreaterThan(0)
  })

  it('matches agenda to Reform achievements', () => {
    const briefing = buildMeetingBriefing(mockMeeting, allData)
    const budgetItem = briefing.agendaIntel.find(a => a.text.includes('Revenue Budget'))
    expect(budgetItem.matchingAchievements.length).toBeGreaterThan(0)
  })

  it('includes matching rebuttals', () => {
    const briefing = buildMeetingBriefing(mockMeeting, allData)
    const budgetItem = briefing.agendaIntel.find(a => a.text.includes('Revenue Budget'))
    expect(budgetItem.matchingRebuttals.length).toBeGreaterThan(0)
  })

  it('identifies key battlegrounds', () => {
    const briefing = buildMeetingBriefing(mockMeeting, allData)
    expect(briefing.keyBattlegrounds.length).toBeGreaterThan(0)
  })

  it('handles missing committee data gracefully', () => {
    const dataNoComm = { ...allData, committeesData: null }
    const briefing = buildMeetingBriefing(mockMeeting, dataNoComm)
    expect(briefing).not.toBeNull()
    expect(briefing.reformMembers).toEqual([])
    expect(briefing.oppositionMembers).toEqual([])
  })
})

describe('getTopicAttackLines', () => {
  it('returns attack lines for budget_finance', () => {
    const lines = getTopicAttackLines('budget_finance', allData)
    expect(lines.length).toBeGreaterThan(0)
  })

  it('includes DOGE findings for budget topics', () => {
    const lines = getTopicAttackLines('budget_finance', allData)
    const dogeLines = lines.filter(l => l.source === 'DOGE Analysis')
    expect(dogeLines.length).toBeGreaterThan(0)
  })

  it('returns empty for unrecognized area', () => {
    const lines = getTopicAttackLines('space_exploration', allData)
    expect(lines).toEqual([])
  })
})

describe('buildReformDefenceLines', () => {
  it('returns budget_finance defence lines', () => {
    const lines = buildReformDefenceLines('budget_finance', mockReformTransformation)
    expect(lines.length).toBeGreaterThan(0)
  })

  it('returns transport_highways defence lines', () => {
    const lines = buildReformDefenceLines('transport_highways', mockReformTransformation)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.some(l => l.headline === 'Roads & Pothole Blitz')).toBe(true)
  })

  it('includes rebuttals', () => {
    const lines = buildReformDefenceLines('budget_finance', mockReformTransformation)
    const rebuttals = lines.filter(l => l.headline === 'Rebuttal')
    expect(rebuttals.length).toBeGreaterThan(0)
  })

  it('returns empty for null data', () => {
    expect(buildReformDefenceLines('budget_finance', null)).toEqual([])
  })

  it('returns education_schools lines', () => {
    const lines = buildReformDefenceLines('education_schools', mockReformTransformation)
    expect(lines.some(l => l.headline === 'SEND Transformation')).toBe(true)
  })
})

describe('generatePrintBriefing', () => {
  const mockMeeting = {
    id: 'test',
    date: '2026-03-01',
    time: '09:30',
    committee: 'Budget and Finance Scrutiny Committee',
    type: 'scrutiny',
    venue: 'County Hall, Preston',
    link: 'https://test.com',
    agenda_items: ['Revenue Budget 2026/27'],
  }

  it('returns empty string for null input', () => {
    expect(generatePrintBriefing(null)).toBe('')
  })

  it('generates formatted text', () => {
    const briefing = buildMeetingBriefing(mockMeeting, allData)
    const text = generatePrintBriefing(briefing)
    expect(text).toContain('MEETING INTELLIGENCE BRIEFING')
    expect(text).toContain('Budget and Finance Scrutiny Committee')
    expect(text).toContain('2026-03-01')
  })

  it('includes Reform team', () => {
    const briefing = buildMeetingBriefing(mockMeeting, allData)
    const text = generatePrintBriefing(briefing)
    expect(text).toContain('OUR TEAM')
  })

  it('includes opposition intel', () => {
    const briefing = buildMeetingBriefing(mockMeeting, allData)
    const text = generatePrintBriefing(briefing)
    expect(text).toContain('OPPOSITION IN THE ROOM')
    expect(text).toContain('Gina Dowding')
  })

  it('includes agenda analysis', () => {
    const briefing = buildMeetingBriefing(mockMeeting, allData)
    const text = generatePrintBriefing(briefing)
    expect(text).toContain('AGENDA ANALYSIS')
  })
})
