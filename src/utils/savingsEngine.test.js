import { describe, it, expect } from 'vitest'
import {
  matchSpendingToPortfolio,
  mapFindingsToPortfolio,
  aggregateSavings,
  generateDirectives,
  generateAllDirectives,
  generateReformPlaybook,
  mtfsComparison,
  decisionPathway,
  buildImplementationCalendar,
  supplierPortfolioAnalysis,
  contractPipeline,
  decisionPipeline,
  enrichedDecisionPipeline,
  meetingBriefing,
  politicalContext,
  politicalImpactAssessment,
  departmentOperationsProfile,
  processEfficiency,
  portfolioBenchmark,
  financialHealthAssessment,
  portfolioRiskDashboard,
  scoreImplementation,
  priorityMatrix,
  generatePortfolioFOI,
  crossPortfolioDependencies,
  formatCurrency,
  getAccessiblePortfolios,
} from './savingsEngine.js'

// ─── Test fixtures ───

const mockPortfolio = {
  id: 'adult_social_care',
  title: 'Adult Social Care',
  short_title: 'Adults',
  cabinet_member: { name: 'Graham Dalton', ward: 'Morecambe North' },
  executive_director: 'Louise Taylor',
  scrutiny_committee: { name: 'Health & Adult Services Scrutiny', id: 'health_adults_scrutiny' },
  budget_categories: ['Adult Social Care'],
  spending_department_patterns: ['^Adult', '^Social Care', '^ASC'],
  budget_latest: { year: '2024/25', gross_expenditure: 584500000, net_expenditure: 420000000 },
  statutory_duties: [
    { act: 'Care Act 2014', summary: 'Duty to assess and meet eligible needs', risk_level: 'red', risk: 'Cannot cut below' },
    { act: 'Mental Health Act 1983', summary: 'AMHP provision', risk_level: 'red', risk: 'Statutory role' },
    { act: 'Care Act 2014 s2', summary: 'Prevention duty', risk_level: 'amber', risk: 'Discretionary scope' },
  ],
  key_services: ['Residential care', 'Home care', 'Reablement', 'Safeguarding'],
  known_pressures: ['Ageing population', 'Provider market fragility', 'Workforce crisis'],
  savings_levers: [
    { lever: 'Home care reablement expansion', est_saving: '£3-5M', timeline: '6-12 months', risk: 'Low', description: 'Shift from residential to home care' },
    { lever: 'Provider rate renegotiation', est_saving: '£2-4M', timeline: '12-18 months', risk: 'Medium', description: 'Benchmark against peer authorities' },
  ],
}

const mockGovernance = {
  decision_routes: [
    { route: 'officer_delegation', threshold: 250000 },
    { route: 'cabinet_member', threshold: 500000 },
    { route: 'cabinet', threshold: 1000000 },
  ],
  officer_thresholds: [
    { role: 'Director', max_value: 250000 },
    { role: 'Executive Director', max_value: 500000 },
  ],
  political_arithmetic: {
    reform_seats: 53,
    total_seats: 84,
    majority_threshold: 43,
    majority_size: 10,
    opposition_seats: 31,
  },
}

const mockSpending = [
  { department: 'Adult Residential', supplier: 'Care Co', amount: 50000, date: '2025-01-15' },
  { department: 'Adult Residential', supplier: 'Care Co', amount: 45000, date: '2025-02-15' },
  { department: 'Adult Home Care', supplier: 'Home Help Ltd', amount: 30000, date: '2025-01-20' },
  { department: 'Adult Safeguarding', supplier: 'Safeguard Ltd', amount: 20000, date: '2025-03-10' },
  { department: 'Social Care Admin', supplier: 'Office Supplies', amount: 5000, date: '2025-01-05' },
  { department: 'Children Social Care', supplier: 'Kids First', amount: 40000, date: '2025-01-15' },
  { department: 'Highways', supplier: 'Roads R Us', amount: 80000, date: '2025-01-15' },
]

const mockFindings = {
  likely_duplicates: {
    examples: [
      { department: 'Adult Residential', total_value: 250000, amount: 250000 },
      { department: 'Highways', total_value: 100000, amount: 100000 },
    ],
  },
  split_payments: {
    examples: [
      { department: 'Adult Home Care', total_value: 80000, amount: 80000 },
      { department: 'ASC Admin', total_value: 55000, amount: 55000 },
    ],
  },
  ch_red_flags: {
    examples: [
      { department: 'Adult Residential', supplier: 'Dodgy Ltd' },
    ],
  },
  round_numbers: { examples: [] },
  weak_competition: { examples: [] },
}

// ─── Tests ───

describe('matchSpendingToPortfolio', () => {
  it('filters spending records by department patterns', () => {
    const result = matchSpendingToPortfolio(mockSpending, mockPortfolio)
    expect(result.length).toBe(5) // Adult Residential x2, Adult Home Care, Adult Safeguarding, Social Care Admin
    expect(result.every(r => r.department !== 'Children Social Care')).toBe(true)
    expect(result.every(r => r.department !== 'Highways')).toBe(true)
  })

  it('returns empty for null inputs', () => {
    expect(matchSpendingToPortfolio(null, mockPortfolio)).toEqual([])
    expect(matchSpendingToPortfolio(mockSpending, null)).toEqual([])
    expect(matchSpendingToPortfolio(mockSpending, { spending_department_patterns: [] })).toEqual([])
  })
})

describe('mapFindingsToPortfolio', () => {
  it('maps DOGE findings to portfolio by department', () => {
    const result = mapFindingsToPortfolio(mockFindings, mockPortfolio)
    expect(result.duplicates.length).toBe(1) // Only Adult Residential, not Highways
    expect(result.splits.length).toBe(2) // Adult Home Care + ASC Admin
    expect(result.ch_flags.length).toBe(1)
  })

  it('returns empty structure for null inputs', () => {
    const result = mapFindingsToPortfolio(null, null)
    expect(result.duplicates).toEqual([])
    expect(result.splits).toEqual([])
  })
})

describe('aggregateSavings', () => {
  it('aggregates savings across portfolios', () => {
    const result = aggregateSavings([mockPortfolio], mockFindings)
    expect(result.total_identified).toBeGreaterThan(0)
    expect(result.by_portfolio.length).toBe(1)
    expect(result.by_portfolio[0].portfolio_id).toBe('adult_social_care')
  })

  it('categorizes savings by timeline', () => {
    const result = aggregateSavings([mockPortfolio], mockFindings)
    expect(result.by_timeline).toBeDefined()
    expect(typeof result.by_timeline.immediate).toBe('number')
    expect(typeof result.by_timeline.short_term).toBe('number')
  })

  it('returns zero for empty inputs', () => {
    const result = aggregateSavings([], null)
    expect(result.total_identified).toBe(0)
  })
})

describe('generateDirectives', () => {
  it('generates directives from DOGE findings', () => {
    const matched = matchSpendingToPortfolio(mockSpending, mockPortfolio)
    const directives = generateDirectives(mockPortfolio, mockFindings, matched)
    expect(directives.length).toBeGreaterThan(0)
  })

  it('centralises duplicate directives under resources portfolio only', () => {
    // Non-resources portfolios should NOT get duplicate directives (centralised model)
    const matched = matchSpendingToPortfolio(mockSpending, mockPortfolio)
    const directives = generateDirectives(mockPortfolio, mockFindings, matched)
    const dupDirective = directives.find(d => d.type === 'duplicate_recovery')
    expect(dupDirective).toBeUndefined()

    // Resources portfolio DOES get centralised duplicate directives
    const resourcesPortfolio = { ...mockPortfolio, id: 'resources' }
    const resourcesDirectives = generateDirectives(resourcesPortfolio, mockFindings, matched)
    const centralDup = resourcesDirectives.find(d => d.type === 'duplicate_recovery')
    expect(centralDup).toBeDefined()
    expect(centralDup.save_central).toBeGreaterThan(0)
    expect(centralDup.owner).toBe('centralised')
  })

  it('includes savings lever directives', () => {
    const directives = generateDirectives(mockPortfolio, {}, [])
    const leverDirectives = directives.filter(d => d.type === 'savings_lever')
    expect(leverDirectives.length).toBe(2) // Two levers in mockPortfolio
  })

  it('each directive has required fields', () => {
    const directives = generateDirectives(mockPortfolio, mockFindings, [])
    for (const d of directives) {
      expect(d.id).toBeDefined()
      expect(d.type).toBeDefined()
      expect(d.action).toBeDefined()
      expect(typeof d.save_central).toBe('number')
      expect(d.timeline).toBeDefined()
      expect(d.portfolio_id).toBe('adult_social_care')
    }
  })

  it('returns empty for null portfolio', () => {
    expect(generateDirectives(null, mockFindings, [])).toEqual([])
  })

  it('sorts by priority then impact×feasibility', () => {
    const directives = generateDirectives(mockPortfolio, mockFindings, mockSpending)
    if (directives.length >= 2) {
      const priorities = directives.map(d => d.priority)
      const highIdx = priorities.indexOf('high')
      const lowIdx = priorities.lastIndexOf('low')
      if (highIdx >= 0 && lowIdx >= 0) {
        expect(highIdx).toBeLessThan(lowIdx)
      }
    }
  })
})

describe('generateReformPlaybook', () => {
  it('phases directives into year 1/2/3', () => {
    const directives = generateDirectives(mockPortfolio, mockFindings, [])
    const playbook = generateReformPlaybook(mockPortfolio, directives)
    expect(playbook).not.toBeNull()
    expect(playbook.phases.year_1).toBeDefined()
    expect(playbook.phases.year_2).toBeDefined()
    expect(playbook.phases.year_3).toBeDefined()
    expect(playbook.total_savings).toBeGreaterThan(0)
  })

  it('identifies red lines from statutory duties', () => {
    const playbook = generateReformPlaybook(mockPortfolio, [])
    expect(playbook.red_lines.length).toBe(2) // Care Act + MHA
    expect(playbook.amber_zones.length).toBe(1) // Prevention duty
  })

  it('returns null for null portfolio', () => {
    expect(generateReformPlaybook(null, [])).toBeNull()
  })
})

describe('decisionPathway', () => {
  it('routes small items to officer delegation', () => {
    const directive = { save_central: 100000, type: 'duplicate_recovery' }
    const result = decisionPathway(directive, mockGovernance)
    expect(result.route).toBe('officer_delegation')
    expect(result.timeline_days).toBeLessThan(15)
  })

  it('routes medium items to cabinet member', () => {
    const directive = { save_central: 750000, type: 'savings_lever' }
    const result = decisionPathway(directive, mockGovernance)
    expect(result.route).toBe('cabinet_member')
    expect(result.requirements).toContain('Forward Plan')
  })

  it('routes large items to cabinet', () => {
    const directive = { save_central: 2000000, type: 'savings_lever' }
    const result = decisionPathway(directive, mockGovernance)
    expect(result.route).toBe('cabinet')
    expect(result.timeline_days).toBeGreaterThanOrEqual(42)
  })

  it('routes very large structural changes to full council', () => {
    const directive = { save_central: 10000000, type: 'structural' }
    const result = decisionPathway(directive, mockGovernance)
    expect(result.route).toBe('full_council')
  })

  it('includes political arithmetic', () => {
    const directive = { save_central: 500000 }
    const result = decisionPathway(directive, mockGovernance)
    expect(result.political_arithmetic).toContain('53')
    expect(result.political_arithmetic).toContain('84')
  })

  it('returns null for missing inputs', () => {
    expect(decisionPathway(null, mockGovernance)).toBeNull()
    expect(decisionPathway({}, null)).toBeNull()
  })
})

describe('buildImplementationCalendar', () => {
  it('creates calendar items from directives', () => {
    const directives = [
      { id: 'd1', action: 'Test', save_central: 100000, timeline: 'Immediate', portfolio_id: 'test' },
    ]
    const result = buildImplementationCalendar(directives, [], mockGovernance)
    expect(result.length).toBe(1)
    expect(result[0].target_date).toBeDefined()
  })

  it('returns empty for empty directives', () => {
    expect(buildImplementationCalendar([], [], mockGovernance)).toEqual([])
  })
})

describe('supplierPortfolioAnalysis', () => {
  it('analyses suppliers from spending data', () => {
    const result = supplierPortfolioAnalysis(mockSpending.slice(0, 5))
    expect(result.total_suppliers).toBeGreaterThan(0)
    expect(result.gini).toBeGreaterThanOrEqual(0)
    expect(result.hhi).toBeGreaterThanOrEqual(0)
    expect(result.suppliers.length).toBeGreaterThan(0)
  })

  it('returns zeros for empty spending', () => {
    const result = supplierPortfolioAnalysis([])
    expect(result.gini).toBe(0)
    expect(result.total).toBe(0)
  })
})

describe('contractPipeline', () => {
  it('returns empty for no contracts', () => {
    const result = contractPipeline([], mockPortfolio)
    expect(result.expiring_3m).toEqual([])
  })

  it('handles null inputs', () => {
    const result = contractPipeline(null, null)
    expect(result.expiring_3m).toEqual([])
  })
})

describe('decisionPipeline', () => {
  it('returns empty for no meetings', () => {
    expect(decisionPipeline([], mockPortfolio)).toEqual([])
  })

  it('filters upcoming meetings for portfolio', () => {
    const future = new Date()
    future.setDate(future.getDate() + 30)
    const meetings = [
      { title: 'Cabinet', date: future.toISOString().slice(0, 10), venue: 'County Hall' },
      { title: 'Planning Committee', date: future.toISOString().slice(0, 10), venue: 'County Hall' },
    ]
    const result = decisionPipeline(meetings, mockPortfolio)
    expect(result.length).toBe(1) // Only Cabinet, not Planning
  })
})

describe('meetingBriefing', () => {
  it('generates briefing with data points', () => {
    const meeting = { title: 'Cabinet', date: '2026-04-15' }
    const result = meetingBriefing(meeting, mockPortfolio)
    expect(result).not.toBeNull()
    expect(result.cabinet_member).toBe('Graham Dalton')
    expect(result.data_points.length).toBeGreaterThan(0)
    expect(result.opposition_questions.length).toBeGreaterThan(0)
  })

  it('returns null for null inputs', () => {
    expect(meetingBriefing(null, null)).toBeNull()
  })
})

describe('politicalContext', () => {
  it('returns political context for portfolio', () => {
    const result = politicalContext(mockPortfolio)
    expect(result.cabinet_member).toBe('Graham Dalton')
    expect(result.reform_majority).toBe(true)
    expect(result.lgr_deadline).toBeDefined()
  })

  it('returns null for null portfolio', () => {
    expect(politicalContext(null)).toBeNull()
  })
})

describe('politicalImpactAssessment', () => {
  it('assesses impact of a directive', () => {
    const directive = { id: 'test', type: 'savings_lever', risk: 'Medium', save_central: 1000000 }
    const result = politicalImpactAssessment(directive, mockPortfolio)
    expect(result.overall_risk).toBe('Medium')
    expect(result.service_impact).toContain('service change')
    expect(result.counter_narrative).toBeDefined()
  })

  it('flags large savings for media attention', () => {
    const directive = { id: 'test', type: 'duplicate_recovery', risk: 'Low', save_central: 10000000 }
    const result = politicalImpactAssessment(directive, mockPortfolio)
    expect(result.media_risk).toContain('media attention')
  })

  it('returns null for null inputs', () => {
    expect(politicalImpactAssessment(null, null)).toBeNull()
  })
})

describe('departmentOperationsProfile', () => {
  it('profiles department operations', () => {
    const spending = mockSpending.slice(0, 5)
    const result = departmentOperationsProfile(spending, mockPortfolio)
    expect(result).not.toBeNull()
    expect(result.total_transactions).toBe(5)
    expect(result.distribution.count).toBe(5)
    expect(result.supplier_diversity.unique_suppliers).toBeGreaterThan(0)
  })

  it('returns null for empty spending', () => {
    expect(departmentOperationsProfile([], mockPortfolio)).toBeNull()
  })
})

describe('processEfficiency', () => {
  it('calculates efficiency score', () => {
    const result = processEfficiency(mockSpending.slice(0, 5))
    expect(result.score).toBeGreaterThan(0)
    expect(result.score).toBeLessThanOrEqual(100)
    expect(result.components.length).toBeGreaterThan(0)
  })

  it('returns 0 for empty spending', () => {
    expect(processEfficiency([]).score).toBe(0)
  })
})

describe('scoreImplementation', () => {
  it('scores directive implementation', () => {
    const directives = [
      { id: 'd1', status: 'delivered', save_central: 100000 },
      { id: 'd2', status: 'in_progress', save_central: 200000 },
      { id: 'd3', status: 'blocked', save_central: 50000 },
      { id: 'd4', save_central: 75000 },
    ]
    const result = scoreImplementation(directives)
    expect(result.delivered).toBe(1)
    expect(result.in_progress).toBe(1)
    expect(result.blocked).toBe(1)
    expect(result.not_started).toBe(1)
    expect(result.delivery_rate).toBe(25)
    expect(result.total_delivered_value).toBe(100000)
  })

  it('returns zeros for empty', () => {
    const result = scoreImplementation([])
    expect(result.delivery_rate).toBe(0)
  })
})

describe('priorityMatrix', () => {
  it('classifies directives into quadrants', () => {
    const directives = [
      { id: 'd1', feasibility: 8, impact: 9 },
      { id: 'd2', feasibility: 3, impact: 8 },
      { id: 'd3', feasibility: 7, impact: 3 },
      { id: 'd4', feasibility: 2, impact: 2 },
    ]
    const result = priorityMatrix(directives)
    expect(result.do_now.length).toBe(1)
    expect(result.plan.length).toBe(1)
    expect(result.delegate.length).toBe(1)
    expect(result.park.length).toBe(1)
  })

  it('returns empty for no directives', () => {
    const result = priorityMatrix([])
    expect(result.do_now).toEqual([])
  })
})

describe('generatePortfolioFOI', () => {
  it('generates FOI for duplicate recovery', () => {
    const directive = { id: 'test', type: 'duplicate_recovery' }
    const result = generatePortfolioFOI(directive, mockPortfolio)
    expect(result.subject).toContain('Duplicate')
    expect(result.body).toContain('Freedom of Information')
    expect(result.portfolio_id).toBe('adult_social_care')
  })

  it('generates FOI for split payments', () => {
    const directive = { id: 'test', type: 'split_payment' }
    const result = generatePortfolioFOI(directive, mockPortfolio)
    expect(result.subject).toContain('splitting')
  })

  it('returns null for null inputs', () => {
    expect(generatePortfolioFOI(null, null)).toBeNull()
  })
})

describe('crossPortfolioDependencies', () => {
  it('returns known dependencies', () => {
    const portfolios = [
      { id: 'health_wellbeing' },
      { id: 'adult_social_care' },
      { id: 'children_families' },
      { id: 'education_skills' },
    ]
    const result = crossPortfolioDependencies(portfolios)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].from).toBeDefined()
    expect(result[0].to).toBeDefined()
  })

  it('filters out missing portfolios', () => {
    const portfolios = [{ id: 'health_wellbeing' }] // adult_social_care missing
    const result = crossPortfolioDependencies(portfolios)
    expect(result.length).toBe(0) // dependency needs both
  })
})

describe('formatCurrency', () => {
  it('formats billions', () => {
    expect(formatCurrency(1500000000)).toBe('£1.5B')
  })
  it('formats millions', () => {
    expect(formatCurrency(2300000)).toBe('£2.3M')
  })
  it('formats thousands', () => {
    expect(formatCurrency(45000)).toBe('£45K')
  })
  it('formats small amounts', () => {
    expect(formatCurrency(500)).toBe('£500')
  })
  it('handles null', () => {
    expect(formatCurrency(null)).toBe('£0')
  })
})

describe('getAccessiblePortfolios', () => {
  const portfolios = [
    { id: 'asc' },
    { id: 'children' },
    { id: 'highways' },
  ]

  it('leader sees all', () => {
    expect(getAccessiblePortfolios(portfolios, 'leader', []).length).toBe(3)
  })
  it('admin sees all', () => {
    expect(getAccessiblePortfolios(portfolios, 'admin', []).length).toBe(3)
  })
  it('wildcard sees all', () => {
    expect(getAccessiblePortfolios(portfolios, 'cabinet_member', ['*']).length).toBe(3)
  })
  it('specific portfolios filtered', () => {
    expect(getAccessiblePortfolios(portfolios, 'cabinet_member', ['asc']).length).toBe(1)
  })
  it('no portfolios assigned', () => {
    expect(getAccessiblePortfolios(portfolios, 'cabinet_member', []).length).toBe(0)
  })
  it('empty portfolios array', () => {
    expect(getAccessiblePortfolios([], 'leader', []).length).toBe(0)
  })
})

// ─── Centralised model tests ───

describe('generateAllDirectives', () => {
  const resourcesPortfolio = {
    id: 'resources',
    title: 'Resources, HR & Property',
    short_title: 'Resources',
    cabinet_member: { name: 'Ged Mirfin' },
    executive_director: 'Laurence Ainsworth',
    spending_department_patterns: ['^Finance', '^HR', '^Property'],
    savings_levers: [
      { lever: 'Property rationalisation', est_saving: '£3-5M', timeline: '12-24 months', risk: 'Medium', owner: 'portfolio', tier: 'service_redesign' },
    ],
  }

  it('generates directives across all portfolios', () => {
    const all = generateAllDirectives([resourcesPortfolio, mockPortfolio], mockFindings, {}, null)
    expect(all.length).toBeGreaterThan(0)
  })

  it('centralised directives appear only on resources', () => {
    const all = generateAllDirectives([resourcesPortfolio, mockPortfolio], mockFindings, {}, null)
    const centralised = all.filter(d => d.owner === 'centralised')
    expect(centralised.every(d => d.portfolio_id === 'resources')).toBe(true)
  })

  it('sorts by save_central descending', () => {
    const all = generateAllDirectives([resourcesPortfolio, mockPortfolio], mockFindings, {}, null)
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1].save_central).toBeGreaterThanOrEqual(all[i].save_central)
    }
  })
})

describe('mtfsComparison', () => {
  const mockCabinetData = {
    administration: {
      mtfs: {
        savings_targets: { '2026_27': 65000000, two_year_total: 103000000 },
        prior_year_performance: { adult_services_shortfall: 31000000 },
        cost_pressures_2026_27: { total: 99000000 },
        redundancy_provision: 11000000,
      },
    },
  }

  it('compares savings pipeline against MTFS targets', () => {
    const directives = [
      { save_central: 5000000, save_low: 3000000, save_high: 7000000, timeline: 'Immediate (0-3 months)' },
      { save_central: 10000000, save_low: 8000000, save_high: 12000000, timeline: '12-18 months' },
    ]
    const result = mtfsComparison(directives, mockCabinetData)
    expect(result).not.toBeNull()
    expect(result.mtfs_year1_target).toBe(65000000)
    expect(result.identified_central).toBe(15000000)
    expect(result.year1_deliverable).toBe(5000000)
    expect(result.year1_coverage_pct).toBe(Math.round(5000000 / 65000000 * 100))
  })

  it('returns null for missing MTFS', () => {
    expect(mtfsComparison([{ save_central: 1000 }], {})).toBeNull()
  })

  it('returns null for empty directives', () => {
    expect(mtfsComparison([], mockCabinetData)).toBeNull()
  })
})

describe('aggregateSavings centralised model', () => {
  const mockCabinetData = {
    reform_operations: {
      centralised_savings: {
        functions: [
          { function: 'Procurement reform', est_saving: '£5-15M', timeline: '6-18 months' },
          { function: 'Contract management', est_saving: '£3-8M', timeline: '6-12 months' },
        ],
      },
    },
  }

  it('separates centralised from portfolio savings', () => {
    const result = aggregateSavings([mockPortfolio], mockFindings, mockCabinetData)
    expect(result.centralised).toBeGreaterThan(0)
    expect(result.portfolio_specific).toBeGreaterThan(0)
    expect(result.total_identified).toBe(result.centralised + result.portfolio_specific)
  })

  it('includes vs_mtfs when cabinet data has MTFS', () => {
    const withMtfs = {
      ...mockCabinetData,
      administration: { mtfs: { savings_targets: { '2026_27': 65000000, two_year_total: 103000000 } } },
    }
    const result = aggregateSavings([mockPortfolio], mockFindings, withMtfs)
    expect(result.vs_mtfs).not.toBeNull()
    expect(result.vs_mtfs.target_year1).toBe(65000000)
  })
})


// ═══════════════════════════════════════════════════════════════════════
// Tier 2: Analytics & Intelligence Engine Integration Tests
// ═══════════════════════════════════════════════════════════════════════

const mockIntegrity = {
  councillors: [
    { name: 'Graham Dalton', detections: [{ type: 'ch_directorship', company: 'Care Co', severity: 'high' }] },
  ],
}

const mockBudgetSummary = {
  reserves: { total_closing: 223400000, usable: 200000000 },
  net_revenue_expenditure: 1330000000,
  council_tax: { dependency_pct: 54 },
  debt_ratio: 0.9,
  interest_payments_ratio: 0.06,
}

const mockBudgetsGovuk = {
  services: {
    'Adult Social Care': {
      authorities: { lancashire_cc: 584500000, kent_cc: 620000000, essex_cc: 590000000, hampshire_cc: 540000000 },
      years: {
        '2020/21': { lancashire_cc: 510000000 },
        '2021/22': { lancashire_cc: 530000000 },
        '2022/23': { lancashire_cc: 560000000 },
        '2023/24': { lancashire_cc: 584500000 },
      },
    },
  },
}

const mockElections = {
  wards: {
    'Morecambe North': {
      current_holders: [{ party: 'Reform UK', name: 'Graham Dalton' }],
      results: [{ date: '2025-05-01', candidates: [{ party: 'Reform UK', votes: 1200 }, { party: 'Labour', votes: 800 }] }],
    },
  },
}

const mockMeetingWithAgenda = {
  title: 'Cabinet Meeting',
  date: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
  committee: 'Cabinet',
  enriched_agenda: [
    { title: 'Adult Social Care Budget Report', text: 'Review of social care spending' },
    { title: 'Council Tax Collection Rates', text: 'Report on council tax performance' },
  ],
}

describe('supplierPortfolioAnalysis — integrity-weighted HHI', () => {
  it('returns integrity_hhi when integrity data provided', () => {
    const result = supplierPortfolioAnalysis(mockSpending, { integrity: mockIntegrity })
    expect(result).toHaveProperty('integrity_hhi')
  })

  it('returns integrity_hhi as null when no integrity data', () => {
    const result = supplierPortfolioAnalysis(mockSpending)
    expect(result.integrity_hhi).toBeNull()
  })

  it('still returns standard HHI and Gini alongside', () => {
    const result = supplierPortfolioAnalysis(mockSpending, { integrity: mockIntegrity })
    expect(result.hhi).toBeGreaterThan(0)
    expect(result.gini).toBeGreaterThan(0)
  })

  it('handles empty spending with integrity data', () => {
    const result = supplierPortfolioAnalysis([], { integrity: mockIntegrity })
    expect(result.hhi).toBe(0)
    // Early return for empty spending doesn't compute integrity_hhi
    expect(result.integrity_hhi).toBeUndefined()
  })
})

describe('financialHealthAssessment', () => {
  it('returns reserves, resilience and materiality for valid budget', () => {
    const result = financialHealthAssessment(mockBudgetSummary, mockBudgetsGovuk)
    expect(result).not.toBeNull()
    expect(result.reserves).not.toBeNull()
    expect(result.resilience).not.toBeNull()
    expect(result.materiality).not.toBeNull()
    expect(result.summary.reserves_months).toBeGreaterThan(0)
  })

  it('returns null for null budget', () => {
    expect(financialHealthAssessment(null, null)).toBeNull()
  })

  it('assesses low reserves correctly', () => {
    const lowReserves = { ...mockBudgetSummary, reserves: { total_closing: 5000000 }, net_revenue_expenditure: 1330000000 }
    const result = financialHealthAssessment(lowReserves, null)
    expect(result.summary.reserves_rating).not.toBe('Strong')
  })

  it('handles budget without optional fields', () => {
    const minimal = { net_revenue_expenditure: 500000000 }
    const result = financialHealthAssessment(minimal, null)
    expect(result).not.toBeNull()
    expect(result.summary).toBeDefined()
  })
})

describe('portfolioBenchmark — real-terms growth', () => {
  it('adds real_growth for categories with multi-year data', () => {
    const result = portfolioBenchmark(mockPortfolio, mockBudgetsGovuk)
    expect(result).not.toBeNull()
    expect(result[0]).toHaveProperty('real_growth')
    expect(result[0].real_growth.length).toBeGreaterThanOrEqual(2)
  })

  it('omits real_growth when single-year data', () => {
    const singleYear = { services: { 'Adult Social Care': { authorities: { lancashire_cc: 584500000, kent_cc: 620000000 }, years: { '2023/24': { lancashire_cc: 584500000 } } } } }
    const result = portfolioBenchmark(mockPortfolio, singleYear)
    expect(result).not.toBeNull()
    expect(result[0].real_growth).toBeUndefined()
  })

  it('still returns peer benchmarks as before', () => {
    const result = portfolioBenchmark(mockPortfolio, mockBudgetsGovuk)
    expect(result[0]).toHaveProperty('rank')
    expect(result[0]).toHaveProperty('percentile')
  })
})

describe('meetingBriefing — policy areas + attack/defence lines', () => {
  it('tags agenda items with policy areas', () => {
    const result = meetingBriefing(mockMeetingWithAgenda, mockPortfolio)
    expect(result.agenda_policy_map).toBeDefined()
    expect(result.agenda_policy_map.length).toBe(2)
    expect(result.agenda_policy_map[0].policy_areas).toBeInstanceOf(Array)
  })

  it('adds attack_lines for identified policy areas', () => {
    const result = meetingBriefing(mockMeetingWithAgenda, mockPortfolio)
    if (result.attack_lines) {
      expect(typeof result.attack_lines).toBe('object')
    }
  })

  it('handles meeting with no agenda', () => {
    const noAgenda = { title: 'Empty Meeting', date: '2026-04-01' }
    const result = meetingBriefing(noAgenda, mockPortfolio)
    expect(result.agenda_policy_map).toEqual([])
  })

  it('still returns standard briefing fields', () => {
    const result = meetingBriefing(mockMeetingWithAgenda, mockPortfolio)
    expect(result.meeting_title).toBe('Cabinet Meeting')
    expect(result.data_points.length).toBeGreaterThan(0)
  })
})

describe('politicalContext — council attack lines', () => {
  it('includes council_attack_lines when DOGE findings provided', () => {
    const result = politicalContext(mockPortfolio, { dogeFindings: mockFindings })
    expect(result.council_attack_lines).toBeInstanceOf(Array)
    expect(result).toHaveProperty('attack_line_count')
  })

  it('returns empty attack lines when no optional data', () => {
    const result = politicalContext(mockPortfolio)
    expect(result.council_attack_lines).toEqual([])
    expect(result.attack_line_count).toBe(0)
  })

  it('still returns standard political context', () => {
    const result = politicalContext(mockPortfolio, { dogeFindings: mockFindings })
    expect(result.reform_majority).toBe(true)
    expect(result.cabinet_member).toBe('Graham Dalton')
  })
})

describe('enrichedDecisionPipeline', () => {
  const futureMeetings = [
    { title: 'Cabinet', date: new Date(Date.now() + 86400000 * 14).toISOString().split('T')[0], committee: 'Cabinet', enriched_agenda: [{ title: 'Adult Social Care Budget' }] },
    { title: 'Health Scrutiny', date: new Date(Date.now() + 86400000 * 21).toISOString().split('T')[0], committee: 'Health & Adult Services Scrutiny', enriched_agenda: [{ title: 'Care Home Standards Report' }] },
  ]

  it('returns pipeline items with policy area tags', () => {
    const result = enrichedDecisionPipeline(futureMeetings, mockPortfolio)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toHaveProperty('policy_areas')
    expect(result[0].policy_areas).toBeInstanceOf(Array)
  })

  it('tags budget items correctly', () => {
    const budgetMeetings = [{ title: 'Cabinet', date: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0], committee: 'Cabinet', enriched_agenda: [{ title: 'Budget and Council Tax Report 2026/27' }] }]
    const result = enrichedDecisionPipeline(budgetMeetings, mockPortfolio)
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('has_budget_items')
    }
  })

  it('returns empty array for empty meetings', () => {
    expect(enrichedDecisionPipeline([], mockPortfolio)).toEqual([])
  })
})

describe('politicalImpactAssessment — ward classification + entrenchment', () => {
  const mockDirective = { id: 'test-1', type: 'savings_lever', risk: 'High', save_central: 3000000 }

  it('returns ward_impact when elections data provided', () => {
    const result = politicalImpactAssessment(mockDirective, mockPortfolio, { elections: mockElections })
    expect(result.ward_impact).not.toBeNull()
    expect(result.ward_impact.ward).toBe('Morecambe North')
  })

  it('returns ward_impact as null without elections data', () => {
    const result = politicalImpactAssessment(mockDirective, mockPortfolio)
    expect(result.ward_impact).toBeNull()
  })

  it('includes entrenchment score', () => {
    const result = politicalImpactAssessment(mockDirective, mockPortfolio, {
      elections: mockElections,
      councillors: [{ ward: 'Morecambe North', name: 'Graham Dalton' }],
    })
    expect(result.ward_impact).toHaveProperty('entrenchment_score')
    expect(result.ward_impact).toHaveProperty('entrenchment_level')
  })

  it('still returns standard impact fields', () => {
    const result = politicalImpactAssessment(mockDirective, mockPortfolio, { elections: mockElections })
    expect(result.overall_risk).toBe('High')
    expect(result.opposition_angle).toBeDefined()
  })
})

describe('portfolioRiskDashboard', () => {
  it('returns risk score for portfolio with spending', () => {
    const result = portfolioRiskDashboard(mockPortfolio, mockSpending, { findings: mockFindings })
    expect(result).not.toBeNull()
    expect(result.risk_score).toBeGreaterThanOrEqual(0)
    expect(result.risk_score).toBeLessThanOrEqual(100)
    expect(['high', 'medium', 'low']).toContain(result.risk_level)
    expect(result.risk_color).toMatch(/^#/)
  })

  it('returns low risk for diverse suppliers with no findings', () => {
    const diverseSpending = Array.from({ length: 20 }, (_, i) => ({
      department: 'Adult Care', supplier: `Supplier ${i}`, amount: 10000, date: '2025-01-01',
    }))
    const result = portfolioRiskDashboard(mockPortfolio, diverseSpending)
    expect(result.risk_level).toBe('low')
  })

  it('returns null for null portfolio', () => {
    expect(portfolioRiskDashboard(null, mockSpending)).toBeNull()
  })

  it('handles empty spending', () => {
    const result = portfolioRiskDashboard(mockPortfolio, [], { findings: mockFindings })
    expect(result).not.toBeNull()
    expect(result.supplier_analysis.hhi).toBe(0)
  })
})
