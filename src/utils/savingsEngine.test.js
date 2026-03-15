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
  reformNarrativeEngine,
  electoralRippleAssessment,
  scoreImplementation,
  priorityMatrix,
  generatePortfolioFOI,
  crossPortfolioDependencies,
  formatCurrency,
  getAccessiblePortfolios,
  buildDirectorateSavingsProfile,
  evidenceChainStrength,
  directorateKPITracker,
  benchmarkDirectorate,
  directorateRiskProfile,
  fundingConstraints,
  sendCostProjection,
  earlyInterventionROI,
  lacPlacementOptimisation,
  sendServiceDirectives,
  ascDemandProjection,
  ascMarketRisk,
  chcRecoveryModel,
  ascServiceDirectives,
  quantifyDemandPressures,
  budgetRealismCheck,
  inspectionRemediationTimeline,
  netFiscalTrajectory,
  highwayAssetTrajectory,
  wasteDisposalComparison,
  assetServiceDirectives,
  highwaysIntelligenceSummary,
  fiscalSystemOverview,
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

  it('generates contract expiry directives from procurement data', () => {
    const now = new Date()
    const in30d = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10)
    const procurement = [
      { id: '1', title: 'Social care home framework', awarded_supplier: 'Care Co', awarded_value: 500000, contract_end: in30d, status: 'awarded' },
    ]
    const directives = generateDirectives(mockPortfolio, {}, [], { procurement })
    const expiryDirective = directives.find(d => d.type === 'contract_renegotiation')
    expect(expiryDirective).toBeDefined()
    expect(expiryDirective.save_central).toBeGreaterThan(0)
    expect(expiryDirective.timeline).toContain('Immediate')
  })

  it('generates weak competition directives for single-bidder contracts', () => {
    const procurement = Array.from({ length: 5 }, (_, i) => ({
      id: String(i), title: 'Social care service ' + i, awarded_supplier: 'Provider ' + i, awarded_value: 100000, bid_count: i < 3 ? 1 : 3, status: 'awarded',
    }))
    const directives = generateDirectives(mockPortfolio, {}, [], { procurement })
    const compDirective = directives.find(d => d.type === 'competition_improvement')
    expect(compDirective).toBeDefined()
    expect(compDirective.action).toContain('single bidder')
  })

  it('adds funding_constraint to directives when addressable % is low', () => {
    const fundingModel = {
      ring_fenced_grants: [{ name: 'BCF', value: 200000000, portfolio: 'adult_social_care' }],
    }
    const portfolioWithBudget = { ...mockPortfolio, budget: { total: 300000000 } }
    const directives = generateDirectives(portfolioWithBudget, {}, [], { fundingModel })
    const withConstraint = directives.filter(d => d.funding_constraint)
    expect(withConstraint.length).toBeGreaterThan(0)
    expect(withConstraint[0].funding_constraint).toContain('ring-fenced')
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
    expect(result.total_contracts).toBe(0)
    expect(result.relevant).toEqual([])
  })

  it('handles null inputs', () => {
    const result = contractPipeline(null, null)
    expect(result.expiring_3m).toEqual([])
    expect(result.total_contracts).toBe(0)
  })

  it('matches contracts by key_services keywords', () => {
    const contracts = [
      { id: '1', title: 'Social care services', awarded_supplier: 'Care Co', awarded_value: 50000, status: 'awarded' },
      { id: '2', title: 'IT consulting', awarded_supplier: 'Tech Co', awarded_value: 10000, status: 'awarded' },
    ]
    const portfolio = { ...mockPortfolio, key_services: ['Social care', 'Adult residential'], spending_department_patterns: [] }
    const result = contractPipeline(contracts, portfolio)
    expect(result.total_contracts).toBe(1)
    expect(result.relevant[0].supplier).toBe('Care Co')
  })

  it('matches contracts by spending_department_patterns regex', () => {
    const contracts = [
      { id: '1', title: 'Highways resurfacing', awarded_supplier: 'Tarmac Ltd', awarded_value: 100000, status: 'awarded' },
    ]
    const portfolio = { ...mockPortfolio, key_services: [], spending_department_patterns: ['highways?'], key_contracts: [] }
    const result = contractPipeline(contracts, portfolio)
    expect(result.total_contracts).toBe(1)
  })

  it('matches contracts by key_contracts provider name', () => {
    const contracts = [
      { id: '1', title: 'Fleet vehicles', awarded_supplier: 'Ford Motor Co Ltd', awarded_value: 500000, status: 'awarded' },
    ]
    const portfolio = { ...mockPortfolio, key_services: [], spending_department_patterns: [], key_contracts: [{ provider: 'Ford Motor Co Ltd' }] }
    const result = contractPipeline(contracts, portfolio)
    expect(result.total_contracts).toBe(1)
  })

  it('normalises procurement.json field names', () => {
    const contracts = [
      { id: '1', title: 'Social care', awarded_supplier: 'Provider A', awarded_value: 75000, contract_start: '2024-01-01', contract_end: '2028-01-01', status: 'awarded', bid_count: 3, procedure_type: 'open' },
    ]
    const result = contractPipeline(contracts, mockPortfolio)
    expect(result.relevant[0].supplier).toBe('Provider A')
    expect(result.relevant[0].value).toBe(75000)
    expect(result.relevant[0].start_date).toBe('2024-01-01')
    expect(result.relevant[0].bid_count).toBe(3)
  })

  it('categorises expiring contracts by timeframe', () => {
    const now = new Date()
    const in30d = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10)
    const in120d = new Date(now.getTime() + 120 * 86400000).toISOString().slice(0, 10)
    const in300d = new Date(now.getTime() + 300 * 86400000).toISOString().slice(0, 10)
    const contracts = [
      { id: '1', title: 'Social care A', awarded_supplier: 'A', awarded_value: 10000, contract_end: in30d, status: 'awarded' },
      { id: '2', title: 'Social care B', awarded_supplier: 'B', awarded_value: 20000, contract_end: in120d, status: 'awarded' },
      { id: '3', title: 'Social care C', awarded_supplier: 'C', awarded_value: 30000, contract_end: in300d, status: 'awarded' },
    ]
    const result = contractPipeline(contracts, mockPortfolio)
    expect(result.expiring_3m.length).toBe(1)
    expect(result.expiring_6m.length).toBe(1)
    expect(result.expiring_12m.length).toBe(1)
  })

  it('calculates total value from awarded_value', () => {
    const contracts = [
      { id: '1', title: 'Social care A', awarded_supplier: 'A', awarded_value: 100000, status: 'awarded' },
      { id: '2', title: 'Social care B', awarded_supplier: 'B', awarded_value: 200000, status: 'awarded' },
    ]
    const result = contractPipeline(contracts, mockPortfolio)
    expect(result.total_value).toBe(300000)
  })
})

describe('fundingConstraints', () => {
  it('returns null for missing inputs', () => {
    expect(fundingConstraints(null, {})).toBe(null)
    expect(fundingConstraints({}, null)).toBe(null)
  })

  it('calculates ring-fenced totals for matching portfolio', () => {
    const portfolio = { id: 'education_skills', budget: { total: 300000000 } }
    const fundingModel = {
      ring_fenced_grants: [
        { name: 'DSG', value: 982000000, portfolio: 'education_skills' },
        { name: 'PH Grant', value: 77000000, portfolio: 'health_wellbeing' },
      ],
    }
    const result = fundingConstraints(portfolio, fundingModel)
    expect(result.ring_fenced_total).toBe(982000000)
    expect(result.grants.length).toBe(1)
    expect(result.addressable).toBe(0) // Budget < ring-fenced
    expect(result.addressable_pct).toBe(0)
  })

  it('returns 100% addressable when no grants match', () => {
    const portfolio = { id: 'resources', budget: { total: 50000000 } }
    const fundingModel = { ring_fenced_grants: [{ name: 'DSG', value: 982000000, portfolio: 'education_skills' }] }
    const result = fundingConstraints(portfolio, fundingModel)
    expect(result.addressable_pct).toBe(100)
    expect(result.addressable).toBe(50000000)
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

  it('includes forensic_signal from Benford analysis when spending provided', () => {
    const directive = { id: 'test', type: 'savings_lever', risk: 'Medium', save_central: 1000000 }
    const spending = Array.from({ length: 200 }, (_, i) => ({ amount: (i + 1) * 1000 + 123 }))
    const result = politicalImpactAssessment(directive, mockPortfolio, { spending })
    expect(result.forensic_signal).not.toBeNull()
    expect(result.forensic_signal.n).toBeGreaterThan(0)
    expect(typeof result.forensic_signal.significant).toBe('boolean')
  })

  it('includes market_concentration_context with Gini when spending provided', () => {
    const directive = { id: 'test', type: 'savings_lever', risk: 'Low', save_central: 500000 }
    // Create highly concentrated spending (one large, many small)
    const spending = [
      { amount: 10000000 },
      ...Array.from({ length: 50 }, () => ({ amount: 100 })),
    ]
    const result = politicalImpactAssessment(directive, mockPortfolio, { spending })
    expect(result.market_concentration_context).not.toBeNull()
    expect(result.market_concentration_context.gini).toBeGreaterThan(0.5)
    expect(['extreme', 'high', 'moderate', 'low']).toContain(result.market_concentration_context.level)
  })

  it('adds monopoly_angle to reform_pr when Gini exceeds 0.6', () => {
    const directive = { id: 'test', type: 'savings_lever', risk: 'Low', save_central: 500000 }
    // Extreme concentration: one supplier gets almost everything
    const spending = [
      { amount: 100000000 },
      ...Array.from({ length: 100 }, () => ({ amount: 1 })),
    ]
    const result = politicalImpactAssessment(directive, mockPortfolio, { spending })
    expect(result.market_concentration_context.gini).toBeGreaterThan(0.6)
    expect(result.reform_pr.monopoly_angle).toContain('monopoly')
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


// ═══════════════════════════════════════════════════════════════════════
// Politics Engine Upgrade — Reform PR, Borough Elections, Electoral Ripple
// ═══════════════════════════════════════════════════════════════════════

describe('politicalContext — borough elections & Reform narrative', () => {
  it('includes borough election context with countdown', () => {
    const result = politicalContext(mockPortfolio)
    expect(result.borough_elections).toBeDefined()
    expect(result.borough_elections.date).toBe('2026-05-07')
    expect(result.borough_elections.districts_electing).toBeInstanceOf(Array)
    expect(result.borough_elections.districts_electing.length).toBe(12)
    expect(typeof result.borough_elections.days_away).toBe('number')
  })

  it('includes Reform scrutiny premium', () => {
    const result = politicalContext(mockPortfolio)
    expect(result.scrutiny_premium).toBeDefined()
    expect(result.scrutiny_premium.factor).toBe(2.5)
    expect(result.scrutiny_premium.reason).toContain('Reform UK')
  })

  it('includes Reform narrative hooks for portfolio', () => {
    const result = politicalContext(mockPortfolio)
    expect(result.reform_narrative_hooks).toBeInstanceOf(Array)
    expect(result.reform_narrative_hooks.length).toBeGreaterThan(0)
  })

  it('includes Reform seat counts and majority', () => {
    const result = politicalContext(mockPortfolio)
    expect(result.reform_seats).toBe(53)
    expect(result.total_seats).toBe(84)
    expect(result.majority_size).toBe(10)
  })
})

describe('politicalImpactAssessment — Reform PR engine', () => {
  const mockDirective = { id: 'pr-test', type: 'savings_lever', risk: 'Medium', save_central: 3000000, timeline: 'Immediate (0-3 months)' }

  it('includes reform_pr angle with headline and hook', () => {
    const result = politicalImpactAssessment(mockDirective, mockPortfolio)
    expect(result.reform_pr).toBeDefined()
    expect(result.reform_pr.headline).toContain('Reform')
    expect(result.reform_pr.hook).toBeDefined()
    expect(result.reform_pr.tone).toBeDefined()
  })

  it('maps affected ward archetypes', () => {
    const result = politicalImpactAssessment(mockDirective, mockPortfolio)
    expect(result.affected_archetypes).toBeInstanceOf(Array)
    expect(result.affected_archetypes.length).toBeGreaterThan(0)
    // Adult social care maps to retirement, affluent_retired, deprived_diverse
    expect(result.affected_archetypes).toContain('retirement')
  })

  it('generates borough ripple assessment', () => {
    const result = politicalImpactAssessment(mockDirective, mockPortfolio)
    expect(result.borough_ripple).toBeDefined()
    expect(result.borough_ripple.affected_districts).toBeInstanceOf(Array)
    expect(result.borough_ripple.scrutiny_multiplier).toBe(2.5)
    expect(result.borough_ripple.talking_point).toContain('Reform')
  })

  it('matches a REFORM_REBUTTALS counter-narrative', () => {
    const result = politicalImpactAssessment(mockDirective, mockPortfolio)
    // Should find a rebuttal (savings_lever maps to "cutting services" pattern)
    expect(result.matched_rebuttal).not.toBeNull()
    if (result.matched_rebuttal) {
      expect(result.matched_rebuttal.attack).toBeDefined()
      expect(result.matched_rebuttal.rebuttal).toBeDefined()
    }
  })

  it('includes constituency resonance', () => {
    const result = politicalImpactAssessment(mockDirective, mockPortfolio)
    expect(result.constituency_resonance).toBeDefined()
    expect(result.constituency_resonance.national_narrative).toContain('Reform')
  })

  it('includes electoral timing with announcement recommendation', () => {
    const result = politicalImpactAssessment(mockDirective, mockPortfolio)
    expect(result.electoral_timing).toBeDefined()
    expect(typeof result.electoral_timing.days_to_borough_elections).toBe('number')
    expect(result.electoral_timing.recommended_announcement).toBeDefined()
  })

  it('generates different PR angles for different directive types', () => {
    const dupDirective = { id: 'dup', type: 'duplicate_recovery', save_central: 500000 }
    const splitDirective = { id: 'split', type: 'split_payment', save_central: 200000 }
    const dup = politicalImpactAssessment(dupDirective, mockPortfolio)
    const split = politicalImpactAssessment(splitDirective, mockPortfolio)
    expect(dup.reform_pr.tone).toBe('accountability')
    expect(split.reform_pr.tone).toBe('transparency')
  })
})

describe('meetingBriefing — Reform achievements & press hooks', () => {
  it('generates reform_achievements per agenda item', () => {
    const result = meetingBriefing(mockMeetingWithAgenda, mockPortfolio)
    expect(result.reform_achievements).toBeInstanceOf(Array)
    expect(result.reform_achievements.length).toBe(2)
    expect(result.reform_achievements[0].reform_angle).toContain('Reform')
  })

  it('flags borough election relevance for near-term meetings', () => {
    const nearTermMeeting = {
      title: 'Cabinet',
      date: '2026-04-01', // ~36 days before May 7
      enriched_agenda: [{ title: 'Budget Review' }],
    }
    const result = meetingBriefing(nearTermMeeting, mockPortfolio)
    expect(result.borough_election_relevance).toBe(true)
    expect(result.days_to_borough_elections).toBeGreaterThan(0)
  })

  it('generates press hooks', () => {
    const result = meetingBriefing(mockMeetingWithAgenda, mockPortfolio)
    expect(result.press_hooks).toBeInstanceOf(Array)
    // Should have at least the budget net expenditure hook
    expect(result.press_hooks.length).toBeGreaterThan(0)
  })

  it('tags council tax agenda items with appropriate Reform angle', () => {
    const ctMeeting = {
      title: 'Cabinet',
      date: '2026-04-01',
      enriched_agenda: [{ title: 'Council Tax Setting 2026/27' }],
    }
    const result = meetingBriefing(ctMeeting, mockPortfolio)
    const ctAchievement = result.reform_achievements.find(a => a.item.includes('Council Tax'))
    if (ctAchievement) {
      expect(ctAchievement.reform_angle).toContain('council tax')
    }
  })
})

describe('reformNarrativeEngine', () => {
  const mockDirectives = [
    { id: 'd1', type: 'duplicate_recovery', save_central: 500000, action: 'Recover duplicate payments', timeline: 'Immediate (0-3 months)' },
    { id: 'd2', type: 'savings_lever', save_central: 3000000, action: 'Home care reablement expansion', timeline: '6-12 months' },
    { id: 'd3', type: 'concentration', save_central: 1000000, action: 'Break supplier monopoly', timeline: '12-18 months' },
  ]

  it('generates comprehensive PR package', () => {
    const result = reformNarrativeEngine(mockPortfolio, mockDirectives)
    expect(result).not.toBeNull()
    expect(result.total_savings).toBe(4500000)
    expect(result.directive_count).toBe(3)
    expect(result.immediate_wins).toBe(1)
  })

  it('generates archetype-targeted messages', () => {
    const result = reformNarrativeEngine(mockPortfolio, mockDirectives)
    expect(result.archetype_messages).toBeInstanceOf(Array)
    expect(result.archetype_messages.length).toBeGreaterThan(0)
    expect(result.archetype_messages[0].archetype).toBeDefined()
    expect(result.archetype_messages[0].message).toContain('Reform')
  })

  it('generates press releases from immediate wins', () => {
    const result = reformNarrativeEngine(mockPortfolio, mockDirectives)
    expect(result.press_releases).toBeInstanceOf(Array)
    expect(result.press_releases.length).toBe(1) // Only 1 immediate win
    expect(result.press_releases[0].headline).toContain('Reform')
  })

  it('generates borough campaign material', () => {
    const result = reformNarrativeEngine(mockPortfolio, mockDirectives)
    expect(result.borough_campaign).toBeDefined()
    expect(result.borough_campaign.leaflet_line).toContain('Reform')
    expect(result.borough_campaign.social_media).toContain('#ReformDelivers')
    expect(result.borough_campaign.canvassing_script).toContain('borough council')
  })

  it('includes constituency talking points', () => {
    const result = reformNarrativeEngine(mockPortfolio, mockDirectives)
    expect(result.constituency_talking_points).toBeInstanceOf(Array)
    expect(result.constituency_talking_points.length).toBeGreaterThanOrEqual(2)
  })

  it('returns null for null portfolio', () => {
    expect(reformNarrativeEngine(null, mockDirectives)).toBeNull()
  })

  it('handles empty directives', () => {
    const result = reformNarrativeEngine(mockPortfolio, [])
    expect(result.total_savings).toBe(0)
    expect(result.press_releases).toEqual([])
  })
})

describe('electoralRippleAssessment', () => {
  const mockActions = [
    { portfolio: mockPortfolio, savings: 5000000, directives_count: 8 },
    { portfolio: { id: 'highways_transport', title: 'Highways & Transport' }, savings: 2000000, directives_count: 5 },
    { portfolio: { id: 'resources', title: 'Resources' }, savings: 10000000, directives_count: 12 },
  ]

  it('scores impact across all 12 Lancashire districts', () => {
    const result = electoralRippleAssessment(mockActions)
    expect(result.district_impact).toBeInstanceOf(Array)
    expect(result.district_impact.length).toBe(12)
    expect(result.district_impact[0].impact_score).toBeGreaterThan(0)
    expect(['high', 'medium', 'low']).toContain(result.district_impact[0].impact_level)
  })

  it('generates constituency-level messaging', () => {
    const result = electoralRippleAssessment(mockActions)
    expect(result.constituency_impact).toBeDefined()
    expect(result.constituency_impact.message).toContain('Reform')
    expect(result.constituency_impact.national_narrative).toContain('governance showcase')
    expect(result.constituency_impact.mp_challenge).toContain('Lancashire MPs')
  })

  it('calculates overall ripple score', () => {
    const result = electoralRippleAssessment(mockActions)
    expect(result.overall_score).toBeGreaterThan(0)
    expect(result.overall_score).toBeLessThanOrEqual(100)
    expect(['high', 'medium', 'low']).toContain(result.overall_level)
  })

  it('includes scrutiny premium', () => {
    const result = electoralRippleAssessment(mockActions)
    expect(result.scrutiny_premium.factor).toBe(2.5)
  })

  it('aggregates total savings and directives', () => {
    const result = electoralRippleAssessment(mockActions)
    expect(result.total_savings).toBe(17000000)
    expect(result.total_directives).toBe(25)
  })

  it('returns empty for null input', () => {
    const result = electoralRippleAssessment(null)
    expect(result.district_impact).toEqual([])
    expect(result.overall_score).toBe(0)
  })

  it('each district has a Reform talking point', () => {
    const result = electoralRippleAssessment(mockActions)
    for (const d of result.district_impact) {
      expect(d.talking_point).toContain('Reform')
      expect(d.district).toBeDefined()
    }
  })
})


// ═══════════════════════════════════════════════════════════════════════
// Directorate-Level Functions (Cabinet Command v2)
// ═══════════════════════════════════════════════════════════════════════

const mockDirectorate = {
  id: 'adults_health',
  title: 'Adults, Health & Wellbeing',
  executive_director: 'Helen Coombes',
  portfolio_ids: ['adult_social_care', 'health_wellbeing'],
  net_budget: 558500000,
  mtfs_savings_target: 46700000,
  prior_year_target: 34800000,
  prior_year_achieved: 3800000,
  savings_narrative: 'Test narrative',
  kpi_headline: 'CQC Requires Improvement',
  performance_metrics: [
    { name: 'CQC rating', value: 'RI', trend: 'first_assessment', savings_link: 'Off-framework costs' },
    { name: 'Off-framework home care', value: 31, unit: '%', trend: 'stable', savings_link: '31% at 20% premium' },
    { name: 'CHC recovery', value: '4-6%', trend: 'declining', savings_link: 'Below national avg' },
    { name: 'Assessment waiting list', value: 1075, trend: 'improving', savings_link: 'Reduced 48%' },
  ],
}

const mockHealthPortfolio = {
  id: 'health_wellbeing',
  title: 'Health & Wellbeing',
  short_title: 'Health',
  spending_department_patterns: ['^Public Health'],
  savings_levers: [
    { lever: 'HCRG recommission', est_saving: '£2-5M', timeline: '18-24 months', risk: 'High', tier: 'procurement_reform', owner: 'centralised',
      evidence: { data_points: ['85% concentration', 'HHI 3615'], benchmark: 'No comparable 85% conc', calculation: '£22M/yr × 10%', kpi_link: 'PH outcomes', implementation_steps: [{ step: 'Publish' }, { step: 'Benchmark' }, { step: 'Retender' }] } },
    { lever: 'Prevention ROI', est_saving: '£0', timeline: '2-3 years', risk: 'Low', tier: 'demand_management', owner: 'portfolio' },
  ],
  operational_context: {},
}

const mockPortfolioWithEvidence = {
  ...mockPortfolio,
  savings_levers: [
    { lever: 'Lever A', est_saving: '£5-10M', timeline: '3-6 months', tier: 'immediate_recovery', owner: 'portfolio',
      evidence: { data_points: ['Fact 1', 'Fact 2', 'Fact 3'], benchmark: 'National average is lower', calculation: '100 × £50K = £5M', kpi_link: 'CQC improvement plan mandates this', implementation_steps: [{ step: 'Step 1' }, { step: 'Step 2' }, { step: 'Step 3' }], article_refs: [{ id: 'test-article', title: 'Test' }, { id: 'test-2', title: 'Test 2' }], political_framing: 'This is a key Reform achievement showing fiscal responsibility.' } },
    { lever: 'Lever B', est_saving: '£2-4M', timeline: '12-18 months', tier: 'service_redesign', owner: 'portfolio',
      evidence: { data_points: ['One fact'], benchmark: 'Short', calculation: null, kpi_link: null, implementation_steps: [] } },
    { lever: 'Lever C', est_saving: '£1-2M', timeline: '6-12 months', tier: 'procurement_reform', owner: 'centralised' },
  ],
}


describe('evidenceChainStrength', () => {
  it('returns 0 for null/undefined', () => {
    expect(evidenceChainStrength(null)).toBe(0)
    expect(evidenceChainStrength(undefined)).toBe(0)
  })

  it('returns 0 for lever without evidence', () => {
    expect(evidenceChainStrength({ lever: 'Test', est_saving: '£1M' })).toBe(0)
  })

  it('scores 100 for fully evidenced lever', () => {
    const lever = mockPortfolioWithEvidence.savings_levers[0]
    expect(evidenceChainStrength(lever)).toBe(100)
  })

  it('scores partially for incomplete evidence', () => {
    const lever = mockPortfolioWithEvidence.savings_levers[1]
    const score = evidenceChainStrength(lever)
    expect(score).toBe(8) // 1 data_point = 8, benchmark too short, no calc/kpi/steps/refs/framing
  })

  it('gives 15 for data_points with 2+ items', () => {
    const lever = { evidence: { data_points: ['A', 'B'] } }
    expect(evidenceChainStrength(lever)).toBe(15)
  })

  it('gives 8 for data_points with 1 item', () => {
    const lever = { evidence: { data_points: ['A'] } }
    expect(evidenceChainStrength(lever)).toBe(8)
  })

  it('gives 15 for benchmark with sufficient text', () => {
    const lever = { evidence: { benchmark: 'National average is much lower than Lancashire' } }
    expect(evidenceChainStrength(lever)).toBe(15)
  })

  it('gives 8 for implementation_steps with 1-2 items', () => {
    const lever = { evidence: { implementation_steps: [{ step: 'Do something' }] } }
    expect(evidenceChainStrength(lever)).toBe(8)
  })

  it('gives 15 for implementation_steps with 3+ items', () => {
    const lever = { evidence: { implementation_steps: [{ step: 'A' }, { step: 'B' }, { step: 'C' }] } }
    expect(evidenceChainStrength(lever)).toBe(15)
  })

  it('gives 10 for article_refs with 2+ items', () => {
    const lever = { evidence: { article_refs: [{ id: 'a' }, { id: 'b' }] } }
    expect(evidenceChainStrength(lever)).toBe(10)
  })

  it('gives 5 for article_refs with 1 item', () => {
    const lever = { evidence: { article_refs: [{ id: 'a' }] } }
    expect(evidenceChainStrength(lever)).toBe(5)
  })

  it('gives 10 for political_framing with sufficient text', () => {
    const lever = { evidence: { political_framing: 'This is our key Reform achievement showing fiscal responsibility and accountability.' } }
    expect(evidenceChainStrength(lever)).toBe(10)
  })

  it('gives 0 for short political_framing', () => {
    const lever = { evidence: { political_framing: 'Short text' } }
    expect(evidenceChainStrength(lever)).toBe(0)
  })
})


describe('buildDirectorateSavingsProfile', () => {
  const portfolios = [mockPortfolioWithEvidence, mockHealthPortfolio]

  it('returns null for null directorate', () => {
    expect(buildDirectorateSavingsProfile(null, portfolios)).toBeNull()
  })

  it('aggregates levers from constituent portfolios', () => {
    const result = buildDirectorateSavingsProfile(mockDirectorate, portfolios, null, null)
    // adult_social_care has 3 levers, health_wellbeing has 2 = 5 total
    expect(result.lever_count).toBe(5)
  })

  it('calculates savings range from all levers', () => {
    const result = buildDirectorateSavingsProfile(mockDirectorate, portfolios, null, null)
    expect(result.savings_range.low).toBeGreaterThan(0)
    expect(result.savings_range.high).toBeGreaterThan(result.savings_range.low)
    expect(result.savings_range.midpoint).toBe((result.savings_range.low + result.savings_range.high) / 2)
  })

  it('calculates MTFS coverage percentage', () => {
    const result = buildDirectorateSavingsProfile(mockDirectorate, portfolios, null, null)
    expect(result.coverage_pct).toBeGreaterThan(0)
    expect(result.mtfs_target).toBe(46700000)
  })

  it('tracks prior year performance', () => {
    const result = buildDirectorateSavingsProfile(mockDirectorate, portfolios, null, null)
    expect(result.prior_year.target).toBe(34800000)
    expect(result.prior_year.achieved).toBe(3800000)
    expect(result.prior_year.gap).toBe(31000000)
    expect(result.prior_year.achieved_pct).toBe(11) // 3.8M / 34.8M
  })

  it('counts evidenced levers', () => {
    const result = buildDirectorateSavingsProfile(mockDirectorate, portfolios, null, null)
    expect(result.evidenced_count).toBe(3) // Lever A, Lever B (partial), HCRG
  })

  it('computes average evidence strength', () => {
    const result = buildDirectorateSavingsProfile(mockDirectorate, portfolios, null, null)
    expect(result.avg_evidence_strength).toBeGreaterThan(0)
    expect(result.avg_evidence_strength).toBeLessThanOrEqual(100)
  })

  it('groups savings by tier', () => {
    const result = buildDirectorateSavingsProfile(mockDirectorate, portfolios, null, null)
    expect(result.by_tier).toBeDefined()
    expect(typeof result.by_tier).toBe('object')
  })

  it('groups savings by timeline', () => {
    const result = buildDirectorateSavingsProfile(mockDirectorate, portfolios, null, null)
    expect(result.by_timeline).toBeDefined()
    expect(result.by_timeline.immediate).toBeDefined()
    expect(result.by_timeline.short_term).toBeDefined()
    expect(result.by_timeline.medium_term).toBeDefined()
    expect(result.by_timeline.long_term).toBeDefined()
  })

  it('includes narrative and headline', () => {
    const result = buildDirectorateSavingsProfile(mockDirectorate, portfolios, null, null)
    expect(result.savings_narrative).toBe('Test narrative')
    expect(result.kpi_headline).toBe('CQC Requires Improvement')
  })

  it('handles empty portfolios gracefully', () => {
    const emptyDir = { ...mockDirectorate, portfolio_ids: ['nonexistent'] }
    const result = buildDirectorateSavingsProfile(emptyDir, portfolios, null, null)
    expect(result.lever_count).toBe(0)
    expect(result.savings_range.low).toBe(0)
  })
})


describe('directorateKPITracker', () => {
  const portfolios = [mockPortfolioWithEvidence, mockHealthPortfolio]

  it('returns empty arrays for null directorate', () => {
    const result = directorateKPITracker(null, portfolios)
    expect(result.metrics).toEqual([])
    expect(result.kpi_headline).toBeNull()
  })

  it('includes directorate-level performance metrics', () => {
    const result = directorateKPITracker(mockDirectorate, portfolios)
    expect(result.metrics.length).toBeGreaterThanOrEqual(4) // 4 from directorate
  })

  it('classifies metrics by trend', () => {
    const result = directorateKPITracker(mockDirectorate, portfolios)
    expect(result.improving.length).toBeGreaterThanOrEqual(1) // assessment waiting list
    expect(result.declining.length).toBeGreaterThanOrEqual(1) // CHC recovery
  })

  it('returns kpi_headline', () => {
    const result = directorateKPITracker(mockDirectorate, portfolios)
    expect(result.kpi_headline).toBe('CQC Requires Improvement')
  })

  it('extracts CQC/Ofsted/SEND from operational context', () => {
    const portfoliosWithCtx = [{
      ...mockPortfolioWithEvidence,
      operational_context: { cqc_rating: 'Requires Improvement', cqc_date: '2025-08-15' },
    }, mockHealthPortfolio]
    const result = directorateKPITracker(mockDirectorate, portfoliosWithCtx)
    const cqcMetric = result.metrics.find(m => m.type === 'inspection' && m.name.includes('CQC'))
    expect(cqcMetric).toBeDefined()
    expect(cqcMetric.value).toBe('Requires Improvement')
  })

  it('extracts SEND inspection from operational context', () => {
    const portfoliosWithSEND = [{
      id: 'education_skills',
      spending_department_patterns: ['^Education'],
      savings_levers: [],
      operational_context: { send_inspection: { rating: 'Widespread failings', date: '2025-02-12', improvement_notice: 'DfE' } },
    }]
    const eduDir = { ...mockDirectorate, portfolio_ids: ['education_skills'] }
    const result = directorateKPITracker(eduDir, portfoliosWithSEND)
    const sendMetric = result.metrics.find(m => m.name === 'SEND Inspection')
    expect(sendMetric).toBeDefined()
  })
})


describe('benchmarkDirectorate', () => {
  const portfolios = [mockPortfolioWithEvidence, mockHealthPortfolio]

  it('returns null for null directorate', () => {
    expect(benchmarkDirectorate(null, portfolios, {})).toBeNull()
  })

  it('returns portfolio benchmarks array', () => {
    const result = benchmarkDirectorate(mockDirectorate, portfolios, null)
    expect(result.directorate_id).toBe('adults_health')
    expect(result.portfolio_benchmarks).toBeDefined()
    expect(Array.isArray(result.portfolio_benchmarks)).toBe(true)
  })

  it('handles no GOV.UK data gracefully', () => {
    const result = benchmarkDirectorate(mockDirectorate, portfolios, null)
    expect(result.summary).toBeNull()
  })

  it('includes title', () => {
    const result = benchmarkDirectorate(mockDirectorate, portfolios, null)
    expect(result.title).toBe('Adults, Health & Wellbeing')
  })
})


describe('directorateRiskProfile', () => {
  const portfolios = [
    { ...mockPortfolioWithEvidence, operational_context: { cqc_rating: 'Requires Improvement' } },
    mockHealthPortfolio,
  ]

  it('returns null for null directorate', () => {
    expect(directorateRiskProfile(null, portfolios, [])).toBeNull()
  })

  it('detects CQC inspection risk', () => {
    const result = directorateRiskProfile(mockDirectorate, portfolios, mockSpending)
    const inspectionRisk = result.risks.find(r => r.type === 'inspection')
    expect(inspectionRisk).toBeDefined()
    expect(inspectionRisk.severity).toBe('high')
  })

  it('detects savings delivery risk from prior year', () => {
    const result = directorateRiskProfile(mockDirectorate, portfolios, mockSpending)
    const deliveryRisk = result.risks.find(r => r.type === 'delivery')
    expect(deliveryRisk).toBeDefined()
    expect(deliveryRisk.severity).toBe('critical') // 3.8M/34.8M = 11%
  })

  it('returns risk score 0-100', () => {
    const result = directorateRiskProfile(mockDirectorate, portfolios, mockSpending)
    expect(result.risk_score).toBeGreaterThanOrEqual(0)
    expect(result.risk_score).toBeLessThanOrEqual(100)
  })

  it('includes risk level and color', () => {
    const result = directorateRiskProfile(mockDirectorate, portfolios, mockSpending)
    expect(['critical', 'high', 'medium', 'low']).toContain(result.risk_level)
    expect(result.risk_color).toMatch(/^#/)
  })

  it('detects DSG deficit risk', () => {
    const portfoliosWithDSG = [{
      id: 'resources',
      spending_department_patterns: ['^Finance'],
      savings_levers: [],
      known_pressures: ['DSG deficit — £22.4M (Mar 2025)'],
      operational_context: {},
    }]
    const resDir = { ...mockDirectorate, portfolio_ids: ['resources'], prior_year_target: 0 }
    const result = directorateRiskProfile(resDir, portfoliosWithDSG, [])
    const fiscalRisk = result.risks.find(r => r.type === 'fiscal')
    expect(fiscalRisk).toBeDefined()
    expect(fiscalRisk.severity).toBe('critical')
  })

  it('handles directorate with no prior year data', () => {
    const dirNoPrior = { ...mockDirectorate, prior_year_target: null, prior_year_achieved: null }
    const result = directorateRiskProfile(dirNoPrior, portfolios, mockSpending)
    const deliveryRisk = result.risks.find(r => r.type === 'delivery')
    expect(deliveryRisk).toBeUndefined()
  })

  it('detects SEND improvement notice', () => {
    const portfoliosWithSEND = [{
      id: 'education_skills',
      spending_department_patterns: ['^Education'],
      savings_levers: [],
      operational_context: { send_inspection: { rating: 'Widespread failings', improvement_notice: 'DfE Improvement Notice' } },
    }]
    const eduDir = { ...mockDirectorate, portfolio_ids: ['education_skills'], prior_year_target: 0 }
    const result = directorateRiskProfile(eduDir, portfoliosWithSEND, [])
    const sendRisk = result.risks.find(r => r.detail?.includes('SEND'))
    expect(sendRisk).toBeDefined()
  })
})

// ──────────────────────────────────────────────────────────────
// SEND & Children's Service Intelligence Tests
// ──────────────────────────────────────────────────────────────

const mockSendModel = {
  ehcp_pipeline: {
    total_ehcps: 12317,
    annual_growth_rate: 0.105,
    new_requests_per_month: 300,
    assessment_capacity_per_month: 53,
    backlog_current: 360,
    backlog_peak: 1801,
    median_weeks_to_issue: 32,
    statutory_target_weeks: 20,
    timeliness_pct: 18.2,
  },
  placement_costs: {
    mainstream: { count: 9800, avg_cost: 9100, total: 89180000 },
    special_school_maintained: { count: 3200, avg_cost: 22000, total: 70400000 },
    special_school_independent: { count: 630, avg_cost: 57000, total: 35910000 },
    residential_special: { count: 120, avg_cost: 156000, total: 18720000 },
    residential_childrens_home: { count: 262, avg_cost: 250000, total: 65500000 },
    alternative_provision: { count: 180, avg_cost: 18000, total: 3240000 },
    post_16_specialist: { count: 410, avg_cost: 32000, total: 13120000 },
    independent_sector_pct: 5.1,
    national_independent_pct: 4.2,
  },
  tribunals: {
    appeals_registered_pa: 185,
    parent_win_rate_pct: 94,
    national_parent_win_rate_pct: 96,
    avg_cost_per_tribunal: 12000,
    avg_cost_if_lost: 45000,
    mediation_rate_pct: 42,
    mediation_success_pct: 65,
    annual_tribunal_cost: 2220000,
    annual_placement_cost_from_losses: 7800000,
  },
  transport: {
    total_cost: 61000000,
    growth_2026_27: 17700000,
    eligible_pupils: 8900,
    cost_per_pupil: 6854,
    minibus_programme: { vehicles: 50, saving_per_passenger_pct: 30 },
    personal_travel_budgets: { current: 400, target: 750, avg_saving: 2800 },
    transport_assistant_grants: { current: 488, target: 750, avg_saving: 3200 },
  },
  dsg_deficit: {
    current: 22400000,
    projected_2028: 545000000,
    statutory_override_ends: '2028-03-31',
    annual_growth_rate: 0.38,
    high_needs_block: 215000000,
  },
  workforce: {
    educational_psychologists: { permanent: 11, agency: 110, agency_day_rate: 800, permanent_equivalent_day: 300, annual_agency_cost: 21120000 },
    social_workers: { permanent: 385, agency: 97, apprentices_on_programme: 97, nqsw_started_jan_2025: 20 },
    agency_premium_pct: 167,
  },
  early_intervention: {
    troubled_families_programme: { families_supported: 4200, avg_cost: 3500, estimated_saving_per_family: 18000 },
    family_safeguarding_model: { implemented: false, potential_saving_low: 8000000, potential_saving_high: 15000000, evidence_base: 'Hertfordshire: 46% reduction in children in care' },
    lac_avoidance_saving_per_child: 55000,
  },
}

const mockLacModel = {
  total_lac: 1699,
  by_placement: {
    foster_in_house: { count: 580, avg_cost: 28000 },
    foster_independent: { count: 420, avg_cost: 45000 },
    residential_in_house: { count: 95, avg_cost: 180000 },
    residential_independent: { count: 167, avg_cost: 312000 },
    kinship: { count: 285, avg_cost: 15000 },
    other: { count: 152, avg_cost: 22000 },
  },
  wocl_programme: {
    current_in_house_homes: 15,
    target_in_house_homes: 30,
    saving_per_placement_pa: 100000,
    capital_cost_per_home: 1200000,
    annual_running_cost: 450000,
  },
  residential_growth: {
    '2021': 180, '2022': 210, '2023': 238, '2024': 262,
    growth_pct_pa: 13.3,
  },
}

describe('sendCostProjection', () => {
  it('returns empty for null input', () => {
    const result = sendCostProjection(null)
    expect(result.yearly).toEqual([])
    expect(result.growth_rate).toBe(0)
    expect(result.total_5yr_cost).toBe(0)
  })

  it('returns empty for missing pipeline', () => {
    const result = sendCostProjection({})
    expect(result.yearly).toEqual([])
  })

  it('projects 5 years by default', () => {
    const result = sendCostProjection(mockSendModel)
    expect(result.yearly).toHaveLength(5)
  })

  it('projects custom number of years', () => {
    const result = sendCostProjection(mockSendModel, 3)
    expect(result.yearly).toHaveLength(3)
  })

  it('base year cost is sum of placements + transport + tribunals', () => {
    const result = sendCostProjection(mockSendModel)
    const expectedPlacements = 89180000 + 70400000 + 35910000 + 18720000 + 65500000 + 3240000 + 13120000
    const expectedTransport = 61000000
    const expectedTribunals = 2220000 + 7800000
    expect(result.base_year_cost).toBe(expectedPlacements + expectedTransport + expectedTribunals)
  })

  it('year 1 total equals base year cost (no growth)', () => {
    const result = sendCostProjection(mockSendModel)
    // Year 1 has growth factor of (1 + 0.105)^0 = 1 for placements/tribunals
    // Transport year 0 uses baseTransport directly
    expect(result.yearly[0].total).toBe(result.base_year_cost)
  })

  it('costs grow year-on-year', () => {
    const result = sendCostProjection(mockSendModel)
    for (let i = 1; i < result.yearly.length; i++) {
      expect(result.yearly[i].total).toBeGreaterThan(result.yearly[i - 1].total)
    }
  })

  it('EHCP count grows at specified rate', () => {
    const result = sendCostProjection(mockSendModel)
    expect(result.yearly[0].ehcps).toBe(12317)
    expect(result.yearly[1].ehcps).toBe(Math.round(12317 * 1.105))
  })

  it('returns growth rate from model', () => {
    const result = sendCostProjection(mockSendModel)
    expect(result.growth_rate).toBe(0.105)
  })

  it('cost driver breakdown sums to 100%', () => {
    const result = sendCostProjection(mockSendModel)
    const bd = result.cost_driver_breakdown
    // Allow 1% rounding tolerance
    expect(bd.placements.pct + bd.transport.pct + bd.tribunals.pct).toBeGreaterThanOrEqual(99)
    expect(bd.placements.pct + bd.transport.pct + bd.tribunals.pct).toBeLessThanOrEqual(101)
  })

  it('DSG trajectory tracks deficit growth', () => {
    const result = sendCostProjection(mockSendModel)
    expect(result.dsg_trajectory).toHaveLength(5)
    expect(result.dsg_trajectory[0].deficit).toBe(22400000)
    // Year 2 should be ~38% larger
    expect(result.dsg_trajectory[1].deficit).toBeGreaterThan(result.dsg_trajectory[0].deficit)
  })

  it('5yr cumulative is sum of yearly totals', () => {
    const result = sendCostProjection(mockSendModel)
    const sum = result.yearly.reduce((s, y) => s + y.total, 0)
    expect(result.total_5yr_cost).toBe(sum)
  })

  it('placement breakdown per year has correct types', () => {
    const result = sendCostProjection(mockSendModel)
    const y1 = result.yearly[0]
    expect(y1.placements.mainstream).toBeDefined()
    expect(y1.placements.special_school_independent).toBeDefined()
    expect(y1.placements.residential_childrens_home).toBeDefined()
  })

  it('handles zero growth rate gracefully', () => {
    const noGrowth = { ...mockSendModel, ehcp_pipeline: { ...mockSendModel.ehcp_pipeline, annual_growth_rate: 0 } }
    const result = sendCostProjection(noGrowth)
    // All years should have same EHCP count
    expect(result.yearly[0].ehcps).toBe(result.yearly[4].ehcps)
  })
})

describe('earlyInterventionROI', () => {
  it('returns zeros for null input', () => {
    const result = earlyInterventionROI(null, null)
    expect(result.current_reactive_cost).toBe(0)
    expect(result.net_saving).toBe(0)
    expect(result.programmes).toEqual([])
  })

  it('includes Troubled Families programme', () => {
    const result = earlyInterventionROI(mockSendModel, mockLacModel)
    const tf = result.programmes.find(p => p.name === 'Troubled Families Programme')
    expect(tf).toBeDefined()
    expect(tf.cost_pa).toBe(4200 * 3500)
    expect(tf.saving_pa).toBe(4200 * 18000)
    expect(tf.roi_ratio).toBeGreaterThan(1)
  })

  it('includes Family Safeguarding Model', () => {
    const result = earlyInterventionROI(mockSendModel, mockLacModel)
    const fsm = result.programmes.find(p => p.name === 'Family Safeguarding Model')
    expect(fsm).toBeDefined()
    expect(fsm.saving_pa).toBe((8000000 + 15000000) / 2)
    expect(fsm.implemented).toBe(false)
  })

  it('includes LAC avoidance programme', () => {
    const result = earlyInterventionROI(mockSendModel, mockLacModel)
    const lac = result.programmes.find(p => p.name === 'LAC Avoidance (Edge of Care)')
    expect(lac).toBeDefined()
    expect(lac.children_diverted).toBe(Math.round(1699 * 0.05))
    expect(lac.saving_per_child).toBe(55000)
  })

  it('includes EP agency conversion', () => {
    const result = earlyInterventionROI(mockSendModel, mockLacModel)
    const ep = result.programmes.find(p => p.name === 'EP Agency→Permanent Conversion')
    expect(ep).toBeDefined()
    expect(ep.agency_eps).toBe(110)
    expect(ep.net_saving).toBeGreaterThan(0)
  })

  it('total saving is sum of programme savings', () => {
    const result = earlyInterventionROI(mockSendModel, mockLacModel)
    const totalFromProgrammes = result.programmes.reduce((s, p) => s + (p.saving_pa || 0), 0)
    expect(result.total_saving).toBe(totalFromProgrammes)
  })

  it('net saving is total minus intervention cost', () => {
    const result = earlyInterventionROI(mockSendModel, mockLacModel)
    const netFromProgrammes = result.programmes.reduce((s, p) => s + (p.net_saving || 0), 0)
    expect(result.net_saving).toBe(netFromProgrammes)
  })

  it('payback years is positive when net saving positive', () => {
    const result = earlyInterventionROI(mockSendModel, mockLacModel)
    expect(result.payback_years).toBeGreaterThan(0)
  })

  it('reactive cost includes LAC placements + tribunals', () => {
    const result = earlyInterventionROI(mockSendModel, mockLacModel)
    const lacCost = Object.values(mockLacModel.by_placement).reduce((s, p) => s + p.count * p.avg_cost, 0)
    const tribunalCost = mockSendModel.tribunals.annual_tribunal_cost + mockSendModel.tribunals.annual_placement_cost_from_losses
    expect(result.current_reactive_cost).toBe(lacCost + tribunalCost)
  })

  it('handles missing early intervention data', () => {
    const minimalSend = { ehcp_pipeline: mockSendModel.ehcp_pipeline, workforce: mockSendModel.workforce }
    const result = earlyInterventionROI(minimalSend, mockLacModel)
    // Should still get LAC avoidance and EP conversion at minimum
    expect(result.programmes.length).toBeGreaterThan(0)
  })
})

describe('lacPlacementOptimisation', () => {
  it('returns zeros for null input', () => {
    const result = lacPlacementOptimisation(null)
    expect(result.current_cost).toBe(0)
    expect(result.saving).toBe(0)
    expect(result.placements_moved).toEqual([])
  })

  it('returns zeros for empty placements', () => {
    const result = lacPlacementOptimisation({ by_placement: {} })
    expect(result.saving).toBe(0)
  })

  it('calculates current cost correctly', () => {
    const result = lacPlacementOptimisation(mockLacModel)
    const expected = Object.values(mockLacModel.by_placement).reduce((s, p) => s + p.count * p.avg_cost, 0)
    expect(result.current_cost).toBe(expected)
  })

  it('identifies foster step-down (independent → in-house)', () => {
    const result = lacPlacementOptimisation(mockLacModel)
    const fosterMove = result.placements_moved.find(m => m.from === 'foster_independent' && m.to === 'foster_in_house')
    expect(fosterMove).toBeDefined()
    expect(fosterMove.count).toBe(Math.round(420 * 0.2)) // 20% of independent
    expect(fosterMove.unit_saving).toBe(45000 - 28000)
  })

  it('identifies WOCL residential step-down', () => {
    const result = lacPlacementOptimisation(mockLacModel)
    const woclMove = result.placements_moved.find(m => m.to === 'residential_in_house')
    expect(woclMove).toBeDefined()
    expect(woclMove.total_saving).toBeGreaterThan(0)
  })

  it('identifies residential → foster step-down', () => {
    const result = lacPlacementOptimisation(mockLacModel)
    const stepDown = result.placements_moved.find(m => m.from === 'residential_independent' && m.to === 'foster_independent')
    expect(stepDown).toBeDefined()
    expect(stepDown.unit_saving).toBe(312000 - 45000)
  })

  it('saving is positive', () => {
    const result = lacPlacementOptimisation(mockLacModel)
    expect(result.saving).toBeGreaterThan(0)
  })

  it('optimised cost equals current minus saving', () => {
    const result = lacPlacementOptimisation(mockLacModel)
    expect(result.optimised_cost).toBe(result.current_cost - result.saving)
  })

  it('saving percentage is reasonable', () => {
    const result = lacPlacementOptimisation(mockLacModel)
    expect(result.saving_pct).toBeGreaterThan(0)
    expect(result.saving_pct).toBeLessThan(50) // Shouldn't be unrealistically high
  })

  it('WOCL ROI has payback period', () => {
    const result = lacPlacementOptimisation(mockLacModel)
    expect(result.wocl_roi).toBeDefined()
    expect(result.wocl_roi.additional_homes).toBe(15)
    expect(result.wocl_roi.capital_cost).toBe(15 * 1200000)
    expect(result.wocl_roi.payback_years).toBeGreaterThan(0)
  })

  it('timeline has 4 years', () => {
    const result = lacPlacementOptimisation(mockLacModel)
    expect(result.timeline).toHaveLength(4)
    expect(result.timeline[0].year).toBe(1)
    expect(result.timeline[3].year).toBe(4)
  })

  it('timeline savings increase year on year', () => {
    const result = lacPlacementOptimisation(mockLacModel)
    for (let i = 1; i < result.timeline.length; i++) {
      expect(result.timeline[i].saving).toBeGreaterThanOrEqual(result.timeline[i - 1].saving)
    }
  })

  it('returns residential growth data', () => {
    const result = lacPlacementOptimisation(mockLacModel)
    expect(result.residential_growth).toEqual(mockLacModel.residential_growth)
  })
})

describe('sendServiceDirectives', () => {
  it('returns empty array for null input', () => {
    expect(sendServiceDirectives(null)).toEqual([])
    expect(sendServiceDirectives(undefined)).toEqual([])
  })

  it('generates EP conversion directive', () => {
    const result = sendServiceDirectives(mockSendModel, mockLacModel)
    const ep = result.find(d => d.id === 'send_ep_conversion')
    expect(ep).toBeDefined()
    expect(ep.type).toBe('service_model')
    expect(ep.save_low).toBeGreaterThan(0)
    expect(ep.save_high).toBeGreaterThan(ep.save_low)
    expect(ep.steps).toHaveLength(5)
  })

  it('generates transport optimisation directive', () => {
    const result = sendServiceDirectives(mockSendModel, mockLacModel)
    const transport = result.find(d => d.id === 'send_transport_optimisation')
    expect(transport).toBeDefined()
    expect(transport.action).toContain('personal travel budgets')
    expect(transport.priority).toBe('high')
  })

  it('generates LAC placement step-down directive', () => {
    const result = sendServiceDirectives(mockSendModel, mockLacModel)
    const lac = result.find(d => d.id === 'send_lac_placement_stepdown')
    expect(lac).toBeDefined()
    expect(lac.tier).toBe('service_redesign')
    expect(lac.governance_route).toBe('cabinet_decision')
  })

  it('generates tribunal reduction directive', () => {
    const result = sendServiceDirectives(mockSendModel, mockLacModel)
    const tribunal = result.find(d => d.id === 'send_tribunal_reduction')
    expect(tribunal).toBeDefined()
    expect(tribunal.action).toContain('mediation')
    expect(tribunal.risk).toBe('Low')
  })

  it('generates early intervention directive', () => {
    const result = sendServiceDirectives(mockSendModel, mockLacModel)
    const ei = result.find(d => d.id === 'send_early_intervention')
    expect(ei).toBeDefined()
    expect(ei.save_low).toBe(8000000)
    expect(ei.save_high).toBe(15000000)
    expect(ei.evidence).toContain('Hertfordshire')
  })

  it('all directives have standard schema fields', () => {
    const result = sendServiceDirectives(mockSendModel, mockLacModel)
    for (const d of result) {
      expect(d.id).toBeTruthy()
      expect(d.type).toBe('service_model')
      expect(d.tier).toBeTruthy()
      expect(d.action).toBeTruthy()
      expect(d.save_low).toBeGreaterThanOrEqual(0)
      expect(d.save_high).toBeGreaterThanOrEqual(d.save_low)
      expect(d.save_central).toBeGreaterThanOrEqual(0)
      expect(d.timeline).toBeTruthy()
      expect(d.legal_basis).toBeTruthy()
      expect(d.risk).toBeTruthy()
      expect(d.steps).toBeDefined()
      expect(d.governance_route).toBeTruthy()
      expect(d.priority).toBeTruthy()
      expect(typeof d.feasibility).toBe('number')
      expect(typeof d.impact).toBe('number')
    }
  })

  it('generates at least 4 directives with full data', () => {
    const result = sendServiceDirectives(mockSendModel, mockLacModel)
    expect(result.length).toBeGreaterThanOrEqual(4)
  })

  it('works without LAC model', () => {
    const result = sendServiceDirectives(mockSendModel, null)
    // Should still get EP, transport, tribunal, and early intervention
    expect(result.length).toBeGreaterThanOrEqual(3)
    const lacDirective = result.find(d => d.id === 'send_lac_placement_stepdown')
    expect(lacDirective).toBeUndefined() // No LAC model → no LAC directive
  })

  it('works with minimal send model', () => {
    const minimal = {
      workforce: {
        educational_psychologists: { agency: 50, agency_day_rate: 800, permanent_equivalent_day: 300 },
        agency_premium_pct: 167,
      },
    }
    const result = sendServiceDirectives(minimal, null)
    expect(result.length).toBeGreaterThanOrEqual(1) // At least EP conversion
  })

  it('directive savings are realistic (not exceeding budget)', () => {
    const result = sendServiceDirectives(mockSendModel, mockLacModel)
    for (const d of result) {
      // No single directive should claim more than £50M savings
      expect(d.save_high).toBeLessThan(50000000)
    }
  })
})

describe('generateDirectives integration with service model', () => {
  it('includes service model directives for education portfolio', () => {
    const eduPortfolio = {
      id: 'education_skills',
      title: 'Education & Skills',
      cabinet_member: { name: 'Test' },
      executive_director: 'Jacqui Old',
      spending_department_patterns: ['^Education'],
      budget_latest: { net_expenditure: 265000000 },
      savings_levers: [],
      operational_context: {
        service_model: {
          send_cost_model: mockSendModel,
          lac_cost_model: mockLacModel,
        },
      },
    }
    const result = generateDirectives(eduPortfolio, {}, [])
    const serviceDirectives = result.filter(d => d.type === 'service_model')
    expect(serviceDirectives.length).toBeGreaterThanOrEqual(4)
    // All should have portfolio_id set
    for (const d of serviceDirectives) {
      expect(d.portfolio_id).toBe('education_skills')
      expect(d.officer).toBe('Jacqui Old')
    }
  })

  it('does not add service model directives when no service_model', () => {
    const plainPortfolio = {
      id: 'resources',
      title: 'Resources',
      cabinet_member: { name: 'Test' },
      executive_director: 'Test',
      spending_department_patterns: ['^Resources'],
      budget_latest: { net_expenditure: 100000000 },
      savings_levers: [],
      operational_context: {},
    }
    const result = generateDirectives(plainPortfolio, {}, [])
    const serviceDirectives = result.filter(d => d.type === 'service_model')
    expect(serviceDirectives).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────────────────────
// Adult Social Care Service Intelligence Tests
// ──────────────────────────────────────────────────────────────

const mockAscModel = {
  demographics: {
    over_65: { '2024': 248000, '2029': 274000, '2034': 298000, growth_pct_pa: 2.1 },
    over_85: { '2024': 32000, '2029': 38000, '2034': 45000, growth_pct_pa: 3.5 },
    working_age_ld: { current: 4200, growth_pct_pa: 1.8 },
  },
  care_type_costs: {
    residential_older_people: { beds: 3000, avg_weekly_cost: 850, fair_cost_of_care: 987, gap_per_week: 137, providers: 413, vacancy_pct: 10 },
    residential_nursing: { beds: 1800, avg_weekly_cost: 1050 },
    home_care_framework: { hours_per_week: 60700, hourly_rate: 21.50, providers: 30 },
    home_care_off_framework: { hours_per_week: 27300, hourly_rate: 25.80, providers: 45, pct_of_total: 31 },
    ld_supported_living: { people: 1830, providers: 42, properties: 700, annual_cost: 70000000, avg_per_person: 38251 },
    direct_payments: { recipients: 2800, avg_annual: 18000, total_20mo: 161000000 },
    shared_lives: { placements: 180, cqc_rating: 'Outstanding', avg_cost: 15000, vs_residential: 28000 },
  },
  demand_pressures: {
    assessment_backlog: { waiting: 1075, max_wait_days: 226, improvement_pct: 48 },
    annual_reviews_overdue: 3500,
    ot_waiting: { waiting: 1100, max_wait_days: 262 },
    dols_applications_pa: 8500,
    dols_processed_in_time_pct: 19,
    safeguarding_referrals_pa: 12000,
  },
  chc_model: {
    current_recovery_rate_pct: 5,
    national_avg_pct: 10,
    bcf_total: 200000000,
    cases_reviewed_pa: 3600,
    successful_claims: 180,
    avg_claim_value: 28000,
    target_recovery_rate_pct: 10,
    projected_additional_income: 9000000,
  },
  market_sustainability: {
    care_home_closures_3yr: 12,
    provider_failure_risk: 'medium',
    nlw_increase_pct: 6.7,
    employer_ni_increase_pp: 1.2,
    annual_cost_inflation: 42000000,
    in_house_homes: 16,
    in_house_maintenance_backlog: 5000000,
    closure_commitment: 'No closures confirmed Feb 2026',
  },
  reablement: {
    success_rate_pct: 87.3,
    national_avg_pct: 81.8,
    offered_after_discharge_pct: 2.6,
    national_offered_pct: 2.8,
    cost_per_episode: 3500,
    residential_avoided_saving: 35000,
    potential_expansion: { additional_episodes_pa: 500, net_saving: 4500000 },
  },
}

describe('ascDemandProjection', () => {
  it('returns empty for null input', () => {
    const result = ascDemandProjection(null)
    expect(result.yearly).toEqual([])
    expect(result.total_growth).toBe(0)
  })

  it('returns empty for missing demographics', () => {
    const result = ascDemandProjection({})
    expect(result.yearly).toEqual([])
  })

  it('projects 5 years by default', () => {
    const result = ascDemandProjection(mockAscModel)
    expect(result.yearly).toHaveLength(5)
  })

  it('projects custom number of years', () => {
    const result = ascDemandProjection(mockAscModel, 3)
    expect(result.yearly).toHaveLength(3)
  })

  it('costs grow year on year', () => {
    const result = ascDemandProjection(mockAscModel)
    for (let i = 1; i < result.yearly.length; i++) {
      expect(result.yearly[i].total).toBeGreaterThan(result.yearly[i - 1].total)
    }
  })

  it('over-85 population grows faster than over-65', () => {
    const result = ascDemandProjection(mockAscModel)
    const y5 = result.yearly[4]
    const over65Growth = y5.over_65 / 248000
    const over85Growth = y5.over_85 / 32000
    expect(over85Growth).toBeGreaterThan(over65Growth)
  })

  it('base cost is positive for full model', () => {
    const result = ascDemandProjection(mockAscModel)
    expect(result.base_cost).toBeGreaterThan(0)
  })

  it('total growth is cumulative', () => {
    const result = ascDemandProjection(mockAscModel)
    expect(result.total_growth).toBeGreaterThan(0)
  })

  it('cost breakdown components are positive', () => {
    const result = ascDemandProjection(mockAscModel)
    expect(result.cost_breakdown.residential.value).toBeGreaterThan(0)
    expect(result.cost_breakdown.home_care.value).toBeGreaterThan(0)
    expect(result.cost_breakdown.ld.value).toBeGreaterThan(0)
  })

  it('blended growth rate is between individual rates', () => {
    const result = ascDemandProjection(mockAscModel)
    expect(result.blended_growth_rate).toBeGreaterThan(0.018) // > LD rate
    expect(result.blended_growth_rate).toBeLessThan(0.035)    // < over-85 rate
  })
})

describe('ascMarketRisk', () => {
  it('returns zeros for null input', () => {
    const result = ascMarketRisk(null)
    expect(result.risk_score).toBe(0)
    expect(result.mitigation_options).toEqual([])
  })

  it('counts total providers', () => {
    const result = ascMarketRisk(mockAscModel)
    expect(result.provider_count).toBe(413 + 30 + 45)
  })

  it('detects high closure trend', () => {
    const result = ascMarketRisk(mockAscModel)
    expect(result.closure_trend).toBe(12)
    expect(result.risk_score).toBeGreaterThan(0)
  })

  it('detects fair cost gap', () => {
    const result = ascMarketRisk(mockAscModel)
    expect(result.fair_cost_gap).toBe(137)
  })

  it('scores risk appropriately for full model', () => {
    const result = ascMarketRisk(mockAscModel)
    // 12 closures (25) + 10% vacancy (10) + 137 gap (25) + medium failure (10) + 31% off-fw (10) = 80
    expect(result.risk_score).toBeGreaterThanOrEqual(60)
    expect(result.risk_level).toBe('critical')
  })

  it('generates mitigation options', () => {
    const result = ascMarketRisk(mockAscModel)
    expect(result.mitigation_options.length).toBeGreaterThan(0)
    const fairCostMitigation = result.mitigation_options.find(m => m.action.includes('fair cost gap'))
    expect(fairCostMitigation).toBeDefined()
  })

  it('detects off-framework percentage', () => {
    const result = ascMarketRisk(mockAscModel)
    expect(result.off_framework_pct).toBe(31)
  })

  it('returns low risk for minimal model', () => {
    const minimal = { care_type_costs: { residential_older_people: { providers: 100, vacancy_pct: 3, gap_per_week: 20 } } }
    const result = ascMarketRisk(minimal)
    expect(result.risk_level).toBe('low')
  })
})

describe('chcRecoveryModel', () => {
  it('returns zeros for null input', () => {
    const result = chcRecoveryModel(null)
    expect(result.current_income).toBe(0)
    expect(result.gap).toBe(0)
  })

  it('calculates current income correctly', () => {
    const result = chcRecoveryModel(mockAscModel.chc_model)
    expect(result.current_income).toBe(180 * 28000)
  })

  it('calculates target income', () => {
    const result = chcRecoveryModel(mockAscModel.chc_model)
    const targetClaims = Math.round(3600 * 10 / 100) // 360 at 10%
    expect(result.target_income).toBe(targetClaims * 28000)
  })

  it('gap is positive when target > current', () => {
    const result = chcRecoveryModel(mockAscModel.chc_model)
    expect(result.gap).toBeGreaterThan(0)
  })

  it('net benefit accounts for costs', () => {
    const result = chcRecoveryModel(mockAscModel.chc_model)
    expect(result.net_benefit).toBeLessThan(result.gap) // Costs reduce the net
    expect(result.net_benefit).toBeGreaterThan(0)
  })

  it('timeline has 3 years', () => {
    const result = chcRecoveryModel(mockAscModel.chc_model)
    expect(result.timeline).toHaveLength(3)
    expect(result.timeline[2].recovery_rate).toBe(10) // Reaches target
  })

  it('income increases through timeline', () => {
    const result = chcRecoveryModel(mockAscModel.chc_model)
    for (let i = 1; i < result.timeline.length; i++) {
      expect(result.timeline[i].income).toBeGreaterThan(result.timeline[i - 1].income)
    }
  })

  it('calculates additional reviewers needed', () => {
    const result = chcRecoveryModel(mockAscModel.chc_model)
    expect(result.additional_reviewers).toBeGreaterThan(0)
  })
})

describe('ascServiceDirectives', () => {
  it('returns empty for null input', () => {
    expect(ascServiceDirectives(null)).toEqual([])
  })

  it('generates CHC recovery directive', () => {
    const result = ascServiceDirectives(mockAscModel)
    const chc = result.find(d => d.id === 'asc_chc_recovery')
    expect(chc).toBeDefined()
    expect(chc.tier).toBe('income_generation')
    expect(chc.priority).toBe('high')
  })

  it('generates off-framework reduction directive', () => {
    const result = ascServiceDirectives(mockAscModel)
    const offFw = result.find(d => d.id === 'asc_off_framework_reduction')
    expect(offFw).toBeDefined()
    expect(offFw.action).toContain('31%')
  })

  it('generates reablement expansion directive', () => {
    const result = ascServiceDirectives(mockAscModel)
    const reab = result.find(d => d.id === 'asc_reablement_expansion')
    expect(reab).toBeDefined()
    expect(reab.action).toContain('500')
    expect(reab.priority).toBe('high')
  })

  it('generates shared lives expansion directive', () => {
    const result = ascServiceDirectives(mockAscModel)
    const sl = result.find(d => d.id === 'asc_shared_lives_expansion')
    expect(sl).toBeDefined()
    expect(sl.action).toContain('Outstanding')
  })

  it('generates digital care directive', () => {
    const result = ascServiceDirectives(mockAscModel)
    const dc = result.find(d => d.id === 'asc_digital_care')
    expect(dc).toBeDefined()
    expect(dc.action).toContain('1,075')
  })

  it('generates at least 4 directives with full data', () => {
    const result = ascServiceDirectives(mockAscModel)
    expect(result.length).toBeGreaterThanOrEqual(4)
  })

  it('all directives have standard schema fields', () => {
    const result = ascServiceDirectives(mockAscModel)
    for (const d of result) {
      expect(d.id).toBeTruthy()
      expect(d.type).toBe('service_model')
      expect(d.tier).toBeTruthy()
      expect(d.action).toBeTruthy()
      expect(d.save_low).toBeGreaterThanOrEqual(0)
      expect(d.save_high).toBeGreaterThanOrEqual(d.save_low)
      expect(d.timeline).toBeTruthy()
      expect(d.legal_basis).toBeTruthy()
      expect(d.steps).toBeDefined()
      expect(d.governance_route).toBeTruthy()
    }
  })

  it('integrates with generateDirectives for ASC portfolio', () => {
    const ascPortfolio = {
      id: 'adult_social_care',
      title: 'Adult Social Care',
      cabinet_member: { name: 'Graham Dalton' },
      executive_director: 'Louise Taylor',
      spending_department_patterns: ['^Adult'],
      budget_latest: { net_expenditure: 420000000 },
      savings_levers: [],
      operational_context: { service_model: { asc_demand_model: mockAscModel } },
    }
    const result = generateDirectives(ascPortfolio, {}, [])
    const serviceDirectives = result.filter(d => d.type === 'service_model')
    expect(serviceDirectives.length).toBeGreaterThanOrEqual(4)
    for (const d of serviceDirectives) {
      expect(d.portfolio_id).toBe('adult_social_care')
      expect(d.officer).toBe('Louise Taylor')
    }
  })
})

// ──────────────────────────────────────────────────────────────
// Cross-Cutting Intelligence Engine Tests
// ──────────────────────────────────────────────────────────────

describe('quantifyDemandPressures', () => {
  it('returns zeros for null input', () => {
    const result = quantifyDemandPressures(null)
    expect(result.pressures).toEqual([])
    expect(result.total_annual).toBe(0)
  })

  it('quantifies demand pressures from text', () => {
    const portfolio = {
      budget_latest: { net_expenditure: 100000000 },
      demand_pressures: ['Demographic growth driving costs', '£5M inflation pressure', 'Backlog of assessments'],
    }
    const result = quantifyDemandPressures(portfolio)
    expect(result.pressures.length).toBe(3)
    expect(result.total_annual).toBeGreaterThan(0)
  })

  it('parses £M figures from text', () => {
    const portfolio = {
      budget_latest: { net_expenditure: 100000000 },
      demand_pressures: ['£12.5M growth in SEND transport'],
    }
    const result = quantifyDemandPressures(portfolio)
    expect(result.pressures[0].annual_impact).toBe(12500000)
  })

  it('adds service model pressures for SEND', () => {
    const portfolio = {
      budget_latest: { net_expenditure: 265000000 },
      demand_pressures: [],
      operational_context: { service_model: { send_cost_model: mockSendModel } },
    }
    const result = quantifyDemandPressures(portfolio)
    const ehcpPressure = result.pressures.find(p => p.name.includes('EHCP'))
    expect(ehcpPressure).toBeDefined()
    expect(ehcpPressure.severity).toBe('critical')
  })

  it('adds service model pressures for ASC', () => {
    const portfolio = {
      budget_latest: { net_expenditure: 420000000 },
      demand_pressures: [],
      operational_context: { service_model: { asc_demand_model: mockAscModel } },
    }
    const result = quantifyDemandPressures(portfolio)
    const inflationPressure = result.pressures.find(p => p.name.includes('inflation'))
    expect(inflationPressure).toBeDefined()
  })

  it('calculates coverage percentage', () => {
    const portfolio = {
      budget_latest: { net_expenditure: 100000000 },
      demand_pressures: ['£10M cost pressure'],
      savings_levers: [{ est_saving: '£5-8M' }],
    }
    const result = quantifyDemandPressures(portfolio)
    expect(result.coverage_pct).toBeGreaterThan(0)
    expect(result.coverage_pct).toBeLessThanOrEqual(100)
  })

  it('sorts pressures by annual impact descending', () => {
    const portfolio = {
      budget_latest: { net_expenditure: 100000000 },
      demand_pressures: ['Small backlog', '£20M massive pressure', '£5M medium pressure'],
    }
    const result = quantifyDemandPressures(portfolio)
    for (let i = 1; i < result.pressures.length; i++) {
      expect(result.pressures[i].annual_impact).toBeLessThanOrEqual(result.pressures[i - 1].annual_impact)
    }
  })
})

describe('budgetRealismCheck', () => {
  it('returns defaults for null input', () => {
    const result = budgetRealismCheck(null)
    expect(result.credibility_score).toBe(100)
    expect(result.flags).toEqual([])
  })

  it('detects lever claiming too much of budget', () => {
    const portfolio = {
      budget_latest: { net_expenditure: 50000000 },
      savings_levers: [{ lever: 'Massive saving', est_saving: '£10-15M' }],
    }
    const result = budgetRealismCheck(portfolio)
    expect(result.flags.length).toBeGreaterThan(0)
    expect(result.credibility_score).toBeLessThan(100)
  })

  it('flags levers without evidence', () => {
    const portfolio = {
      budget_latest: { net_expenditure: 100000000 },
      savings_levers: [{ lever: 'No evidence lever', est_saving: '£1-2M' }],
    }
    const result = budgetRealismCheck(portfolio)
    const noEvidence = result.flags.find(f => f.includes('no evidence'))
    expect(noEvidence).toBeDefined()
  })

  it('calculates savings as percentage of budget', () => {
    const portfolio = {
      budget_latest: { net_expenditure: 100000000 },
      savings_levers: [{ lever: 'Test', est_saving: '£3-5M', evidence_chain: {} }],
    }
    const result = budgetRealismCheck(portfolio)
    expect(result.savings_as_pct).toBeGreaterThan(0)
    expect(result.savings_as_pct).toBeLessThan(100)
  })

  it('evidence coverage is 100% when all have evidence', () => {
    const portfolio = {
      budget_latest: { net_expenditure: 100000000 },
      savings_levers: [{ lever: 'A', est_saving: '£1-2M', evidence_chain: {} }, { lever: 'B', est_saving: '£2-3M', evidence: 'data' }],
    }
    const result = budgetRealismCheck(portfolio)
    expect(result.evidence_coverage).toBe(100)
  })

  it('gives high credibility for well-evidenced moderate savings', () => {
    const portfolio = {
      budget_latest: { net_expenditure: 100000000 },
      savings_levers: [
        { lever: 'A', est_saving: '£1-2M', evidence_chain: {}, timeline: '3-6 months' },
        { lever: 'B', est_saving: '£2-3M', evidence_chain: {}, timeline: '6-12 months' },
      ],
    }
    const result = budgetRealismCheck(portfolio)
    expect(result.credibility_level).toBe('high')
  })
})

describe('inspectionRemediationTimeline', () => {
  it('returns nulls for null input', () => {
    const result = inspectionRemediationTimeline(null)
    expect(result.current_rating).toBeNull()
    expect(result.est_months).toBe(0)
  })

  it('estimates 15 months for Requires Improvement', () => {
    const result = inspectionRemediationTimeline({ cqc_rating: 'Requires Improvement', target_rating: 'Good', improvement_plan_cost: 3200000 })
    expect(result.est_months).toBe(15)
    expect(result.current_rating).toBe('Requires Improvement')
  })

  it('estimates 24 months for Inadequate', () => {
    const result = inspectionRemediationTimeline({ cqc_rating: 'Inadequate', target_rating: 'Requires Improvement' })
    expect(result.est_months).toBe(24)
  })

  it('calculates ROI with intervention cost', () => {
    const result = inspectionRemediationTimeline({
      cqc_rating: 'Requires Improvement',
      improvement_plan_cost: 3200000,
      cost_of_intervention_if_inadequate: 15000000,
    })
    expect(result.roi).toContain('£3.2M')
    expect(result.roi).toContain('£15')
    expect(result.cost_of_intervention).toBe(15000000)
  })

  it('includes key findings', () => {
    const result = inspectionRemediationTimeline({
      cqc_rating: 'Requires Improvement',
      key_findings: ['Backlogs', 'Poor records'],
    })
    expect(result.key_findings).toHaveLength(2)
  })

  it('assesses risk of decline', () => {
    const ri = inspectionRemediationTimeline({ cqc_rating: 'Requires Improvement' })
    expect(ri.risk_of_decline).toBe('medium')
    const inad = inspectionRemediationTimeline({ cqc_rating: 'Inadequate' })
    expect(inad.risk_of_decline).toBe('high')
  })
})

describe('netFiscalTrajectory', () => {
  it('returns empty for null input', () => {
    const result = netFiscalTrajectory(null)
    expect(result.yearly).toEqual([])
    expect(result.trajectory).toBe('unknown')
  })

  it('projects 5 years by default', () => {
    const portfolio = { budget_latest: { net_expenditure: 100000000 } }
    const demand = { total_annual: 10000000 }
    const directives = [{ save_central: 5000000, timeline: 'Short-term (3-6 months)' }]
    const result = netFiscalTrajectory(portfolio, demand, directives)
    expect(result.yearly).toHaveLength(5)
  })

  it('immediate savings appear in year 1', () => {
    const portfolio = { budget_latest: { net_expenditure: 100000000 } }
    const demand = { total_annual: 5000000 }
    const directives = [{ save_central: 3000000, timeline: 'Immediate (0-3 months)' }]
    const result = netFiscalTrajectory(portfolio, demand, directives)
    expect(result.yearly[0].savings_achieved).toBe(3000000)
  })

  it('detects breakeven year', () => {
    const portfolio = { budget_latest: { net_expenditure: 100000000 } }
    const demand = { total_annual: 5000000 }
    const directives = [
      { save_central: 3000000, timeline: 'Immediate (0-3 months)' },
      { save_central: 4000000, timeline: 'Short-term (3-6 months)' },
    ]
    const result = netFiscalTrajectory(portfolio, demand, directives)
    // Year 2: immediate + short = 7M vs 5M demand → net positive
    expect(result.breakeven_year).toBeDefined()
  })

  it('determines trajectory from last two years', () => {
    const portfolio = { budget_latest: { net_expenditure: 100000000 } }
    const demand = { total_annual: 2000000 }
    const directives = [{ save_central: 5000000, timeline: 'Short-term (3-6 months)' }]
    const result = netFiscalTrajectory(portfolio, demand, directives)
    expect(['improving', 'stable', 'declining']).toContain(result.trajectory)
  })

  it('cumulative net tracks running total', () => {
    const portfolio = { budget_latest: { net_expenditure: 100000000 } }
    const demand = { total_annual: 5000000 }
    const directives = [{ save_central: 3000000, timeline: 'Immediate (0-3 months)' }]
    const result = netFiscalTrajectory(portfolio, demand, directives)
    let running = 0
    for (const y of result.yearly) {
      running += y.net_position
      expect(y.cumulative_net).toBe(running)
    }
  })

  it('returns total demand and savings over projection period', () => {
    const portfolio = { budget_latest: { net_expenditure: 100000000 } }
    const demand = { total_annual: 5000000 }
    const directives = [{ save_central: 3000000, timeline: 'Immediate (0-3 months)' }]
    const result = netFiscalTrajectory(portfolio, demand, directives)
    expect(result.total_demand_5yr).toBeGreaterThan(0)
    expect(result.total_savings_5yr).toBeGreaterThan(0)
  })
})

// ============================================================
// Phase 4: Highways + Waste Asset Intelligence
// ============================================================

const mockHighwayModel = {
  asset_summary: {
    gross_replacement_cost: 10200000000,
    maintenance_backlog: 650000000,
    annual_deterioration: 45000000,
    annual_investment: 72000000,
    investment_gap: 38000000,
    investment_as_pct_of_need: 65,
    cipfa_steady_state_pct: 18,
  },
  condition_trends: {
    a_roads: { red_pct: 3.9, prev_year: 2.1, national_avg: 5.0, trend: 'deteriorating' },
    b_c_roads: { red_pct: 6.5, prev_year: 4.6, national_avg: 6.0, trend: 'rapidly_deteriorating' },
    unclassified: { red_pct: 27.6, national_avg: 17.0, trend: 'critical' },
  },
  lifecycle_cost_per_km_pa: {
    surface_dressing: 3750,
    micro_asphalt: 7143,
    thin_overlay: 6667,
    resurfacing: 9000,
    reconstruction: 18750,
  },
  managed_service: {
    defects_before: 61000,
    defects_after: 35000,
    reduction_pct: 42,
    cost_before_per_sqm: 200,
    cost_after_per_sqm: 100,
    months_live: 6,
  },
  s59_enforcement: {
    breach_threshold_pct: 30,
    overrun_charge_per_day_non_ts: 250,
    overrun_charge_per_day_ts: 2500,
    utility_works_pa: 1596,
    potential_income: 3500000,
  },
  dft_allocation_2026_2030: 268000000,
  cumulative_shortfall_14yr: 834000000,
  led_programme: {
    total_columns: 138000,
    converted: 110000,
    remaining: 28000,
    dimming_saving_pa: 2200000,
    energy_saving_pct: 73,
  },
}

const mockWasteModel = {
  disposal_costs: {
    landfill: { tonnes_pa: 170000, cost_per_tonne: 120, tax_per_tonne: 103, total: 37910000 },
    mbt: { tonnes_pa: 500000, cost_per_tonne: 85, operator: 'Lancashire Renewables', total: 42500000 },
    recycling: { tonnes_pa: 180000, revenue_per_tonne: -15, total: -2700000 },
  },
  total_disposal_cost: 77710000,
  landfill_rate_pct: 33.8,
  national_avg_landfill_pct: 5.6,
  ratio_to_national: 6.0,
  food_waste_mandate: { effective: '2026-04-01', est_annual_cost: 8000000, capital_required: 12000000 },
  efw_procurement: { status: 'paused', potential_saving_pa: 15000000, capital_cost: 300000000, timeline_years: 5 },
  market_concentration: { hhi: 4141, lancashire_renewables_spend: 71200000, suez_spend: 46200000, duopoly_pct: 87 },
  landfill_tax_trajectory: { 2024: 103, 2025: 107, 2026: 111, 2027: 115, 2028: 120, annual_increase_pct: 3.5 },
  expired_waste_strategy: '2020',
}

describe('highwayAssetTrajectory', () => {
  it('returns empty for null input', () => {
    const result = highwayAssetTrajectory(null)
    expect(result.yearly).toEqual([])
    expect(result.optimal_spend).toBe(0)
  })

  it('returns empty for model without asset_summary', () => {
    const result = highwayAssetTrajectory({ condition_trends: {} })
    expect(result.yearly).toEqual([])
  })

  it('projects backlog growth over default 5 years', () => {
    const result = highwayAssetTrajectory(mockHighwayModel)
    expect(result.yearly).toHaveLength(6) // Year 0 + 5 years
    expect(result.yearly[0].label).toBe('Current')
    expect(result.yearly[0].backlog).toBe(650000000)
  })

  it('computes negative gap when deterioration < investment', () => {
    const model = {
      ...mockHighwayModel,
      asset_summary: { ...mockHighwayModel.asset_summary, annual_deterioration: 45000000, annual_investment: 72000000 },
    }
    const result = highwayAssetTrajectory(model)
    expect(result.current_gap).toBe(-27000000) // 45M - 72M
    // Backlog should shrink over time
    expect(result.yearly[5].backlog).toBeLessThan(result.yearly[0].backlog)
  })

  it('computes positive gap when deterioration > investment', () => {
    const model = {
      ...mockHighwayModel,
      asset_summary: { ...mockHighwayModel.asset_summary, annual_deterioration: 100000000, annual_investment: 72000000 },
    }
    const result = highwayAssetTrajectory(model)
    expect(result.current_gap).toBe(28000000)
    expect(result.yearly[5].backlog).toBeGreaterThan(result.yearly[0].backlog)
  })

  it('calculates optimal spend', () => {
    const result = highwayAssetTrajectory(mockHighwayModel)
    // optimal = deterioration + backlog/10 = 45M + 65M = 110M
    expect(result.optimal_spend).toBe(110000000)
  })

  it('calculates preventative ratio from lifecycle costs', () => {
    const result = highwayAssetTrajectory(mockHighwayModel)
    // avg preventative = (3750+7143)/2 ≈ 5446, avg reactive = (9000+18750)/2 = 13875
    expect(result.preventative_ratio).toBeGreaterThan(0.3)
    expect(result.preventative_ratio).toBeLessThan(0.5)
  })

  it('calculates managed service saving percentage', () => {
    const result = highwayAssetTrajectory(mockHighwayModel)
    expect(result.managed_service_saving_pct).toBe(50) // (200-100)/200 = 50%
  })

  it('extracts condition trends', () => {
    const result = highwayAssetTrajectory(mockHighwayModel)
    expect(result.condition_trends).toHaveLength(3)
    expect(result.condition_trends[0].road_class).toBe('a_roads')
    expect(result.condition_trends[0].annual_change).toBeCloseTo(1.8, 1) // 3.9 - 2.1
  })

  it('supports custom year projection', () => {
    const result = highwayAssetTrajectory(mockHighwayModel, 10)
    expect(result.yearly).toHaveLength(11) // Year 0 + 10 years
  })

  it('includes LED and S59 data', () => {
    const result = highwayAssetTrajectory(mockHighwayModel)
    expect(result.led.total_columns).toBe(138000)
    expect(result.s59.potential_income).toBe(3500000)
    expect(result.dft_allocation).toBe(268000000)
  })
})

describe('wasteDisposalComparison', () => {
  it('returns empty for null input', () => {
    const result = wasteDisposalComparison(null)
    expect(result.current_cost).toBe(0)
    expect(result.scenarios).toEqual([])
  })

  it('returns empty for model without disposal_costs', () => {
    const result = wasteDisposalComparison({ landfill_rate_pct: 33 })
    expect(result.current_cost).toBe(0)
  })

  it('computes current total cost', () => {
    const result = wasteDisposalComparison(mockWasteModel)
    expect(result.current_cost).toBe(77710000)
  })

  it('projects landfill tax trajectory over 5 years', () => {
    const result = wasteDisposalComparison(mockWasteModel)
    expect(result.landfill_tax_5yr).toHaveLength(6) // Year 0 + 5
    expect(result.landfill_tax_5yr[0].tax_per_tonne).toBe(103)
    // Tax increases at 3.5% pa
    expect(result.landfill_tax_5yr[5].tax_per_tonne).toBeGreaterThan(103)
  })

  it('generates 3 scenarios', () => {
    const result = wasteDisposalComparison(mockWasteModel)
    expect(result.scenarios).toHaveLength(3)
    expect(result.scenarios.map(s => s.name)).toEqual(['Status Quo', 'Energy from Waste', 'Recycling Expansion'])
  })

  it('EfW scenario has lower annual cost', () => {
    const result = wasteDisposalComparison(mockWasteModel)
    const statusQuo = result.scenarios.find(s => s.name === 'Status Quo')
    const efw = result.scenarios.find(s => s.name === 'Energy from Waste')
    expect(efw.annual_cost).toBeLessThan(statusQuo.annual_cost)
  })

  it('computes EfW payback period', () => {
    const result = wasteDisposalComparison(mockWasteModel)
    expect(result.efw_payback).toBe(20) // 300M / 15M = 20 years
  })

  it('includes food waste mandate costs', () => {
    const result = wasteDisposalComparison(mockWasteModel)
    expect(result.food_waste_impact).toBe(8000000)
    expect(result.food_waste_capital).toBe(12000000)
    expect(result.food_waste_effective).toBe('2026-04-01')
  })

  it('includes market concentration data', () => {
    const result = wasteDisposalComparison(mockWasteModel)
    expect(result.market_hhi).toBe(4141)
    expect(result.duopoly_pct).toBe(87)
  })

  it('reflects expired strategy status', () => {
    const result = wasteDisposalComparison(mockWasteModel)
    expect(result.strategy_status).toBe('Expired 2020')
  })

  it('returns landfill vs national comparison', () => {
    const result = wasteDisposalComparison(mockWasteModel)
    expect(result.landfill_rate_pct).toBe(33.8)
    expect(result.national_avg_landfill_pct).toBe(5.6)
    expect(result.ratio_to_national).toBe(6.0)
  })
})

describe('assetServiceDirectives', () => {
  it('returns empty for null inputs', () => {
    const result = assetServiceDirectives(null, null)
    expect(result).toEqual([])
  })

  it('generates highway directives from highway model', () => {
    const result = assetServiceDirectives(mockHighwayModel, null)
    expect(result.length).toBeGreaterThanOrEqual(3) // LED, managed service, s59, preventative
    expect(result.every(d => d.id && d.type && d.action)).toBe(true)
  })

  it('generates LED completion directive', () => {
    const result = assetServiceDirectives(mockHighwayModel, null)
    const led = result.find(d => d.id.includes('led'))
    expect(led).toBeTruthy()
    expect(led.action).toContain('28,000')
    expect(led.save_central).toBe(2200000)
  })

  it('generates managed service expansion directive', () => {
    const result = assetServiceDirectives(mockHighwayModel, null)
    const managed = result.find(d => d.id.includes('managed'))
    expect(managed).toBeTruthy()
    expect(managed.action).toContain('42%')
    expect(managed.save_central).toBeGreaterThan(0)
  })

  it('generates s59 enforcement directive', () => {
    const result = assetServiceDirectives(mockHighwayModel, null)
    const s59 = result.find(d => d.id.includes('s59'))
    expect(s59).toBeTruthy()
    expect(s59.type).toBe('income')
    expect(s59.save_central).toBe(2450000) // 3.5M * 0.7
  })

  it('generates preventative maintenance directive', () => {
    const result = assetServiceDirectives(mockHighwayModel, null)
    const prev = result.find(d => d.id.includes('preventative'))
    expect(prev).toBeTruthy()
    expect(prev.timeline).toContain('Long-term')
  })

  it('generates waste directives from waste model', () => {
    const result = assetServiceDirectives(null, mockWasteModel)
    expect(result.length).toBeGreaterThanOrEqual(2) // EfW, food waste, market
    expect(result.every(d => d.id && d.type && d.action)).toBe(true)
  })

  it('generates EfW procurement directive', () => {
    const result = assetServiceDirectives(null, mockWasteModel)
    const efw = result.find(d => d.id.includes('efw'))
    expect(efw).toBeTruthy()
    expect(efw.type).toBe('transformation')
    expect(efw.action).toContain('33.8%')
    expect(efw.save_central).toBe(12750000) // 15M * 0.85
  })

  it('generates food waste compliance directive', () => {
    const result = assetServiceDirectives(null, mockWasteModel)
    const food = result.find(d => d.id.includes('food-waste'))
    expect(food).toBeTruthy()
    expect(food.type).toBe('statutory')
    expect(food.priority).toBe('critical')
  })

  it('generates market diversification directive for high duopoly', () => {
    const result = assetServiceDirectives(null, mockWasteModel)
    const market = result.find(d => d.id.includes('waste-market'))
    expect(market).toBeTruthy()
    expect(market.action).toContain('87%')
    expect(market.action).toContain('4141')
  })

  it('combines both highway and waste directives', () => {
    const result = assetServiceDirectives(mockHighwayModel, mockWasteModel)
    const hwCount = result.filter(d => d.id.includes('asset-led') || d.id.includes('asset-managed') || d.id.includes('asset-s59') || d.id.includes('asset-preventative')).length
    const wasteCount = result.filter(d => d.id.includes('asset-efw') || d.id.includes('asset-food') || d.id.includes('asset-waste')).length
    expect(hwCount).toBeGreaterThanOrEqual(3)
    expect(wasteCount).toBeGreaterThanOrEqual(2)
  })
})

describe('highwaysIntelligenceSummary', () => {
  it('returns defaults for null inputs', () => {
    const result = highwaysIntelligenceSummary(null, null, null)
    expect(result.condition_dashboard).toEqual([])
    expect(result.defect_trend).toBeNull()
    expect(result.roadworks_active).toBe(0)
  })

  it('builds condition dashboard from asset model', () => {
    const result = highwaysIntelligenceSummary(mockHighwayModel, null, null)
    expect(result.condition_dashboard).toHaveLength(3)
    expect(result.condition_dashboard[0].road_class).toBe('a_roads')
    expect(result.condition_dashboard[0].gap).toBeCloseTo(-1.1, 1) // 3.9 - 5.0
  })

  it('extracts defect trend from managed service', () => {
    const result = highwaysIntelligenceSummary(mockHighwayModel, null, null)
    expect(result.defect_trend.before).toBe(61000)
    expect(result.defect_trend.after).toBe(35000)
    expect(result.defect_trend.reduction_pct).toBe(42)
    expect(result.defect_trend.unit_cost_saving_pct).toBe(50)
  })

  it('calculates lifecycle savings opportunity', () => {
    const result = highwaysIntelligenceSummary(mockHighwayModel, null, null)
    // Cheapest = 3750 (surface dressing), dearest = 18750 (reconstruction)
    // (1 - 3750/18750) * 100 = 80%
    expect(result.lifecycle_savings_opportunity).toBe(80)
  })

  it('processes traffic data', () => {
    const trafficData = {
      stats: { high_jci_count: 45, junction_count: 200 },
      s59_clashes: [{ id: 1 }, { id: 2 }, { id: 3 }],
      deferrals: [{ id: 1 }],
    }
    const result = highwaysIntelligenceSummary(null, trafficData, null)
    expect(result.traffic_hotspots).toBe(45)
    expect(result.s59_breaches).toBe(3)
    expect(result.deferral_count).toBe(1)
  })

  it('processes roadworks data', () => {
    const roadworksData = {
      stats: { total: 150, by_operator: { 'Lancashire County Council': 50, 'BT Openreach': 40, 'United Utilities': 60 } },
    }
    const result = highwaysIntelligenceSummary(null, null, roadworksData)
    expect(result.roadworks_active).toBe(150)
    expect(result.utility_coordination_score).toBeGreaterThan(0)
  })

  it('combines all data sources', () => {
    const trafficData = { stats: { high_jci_count: 20 }, s59_clashes: [], deferrals: [] }
    const roadworksData = { stats: { total: 100 } }
    const result = highwaysIntelligenceSummary(mockHighwayModel, trafficData, roadworksData)
    expect(result.condition_dashboard).toHaveLength(3)
    expect(result.defect_trend).not.toBeNull()
    expect(result.roadworks_active).toBe(100)
    expect(result.traffic_hotspots).toBe(20)
  })
})

// ============================================================
// Phase 5: Unified Intelligence Dashboard
// ============================================================

describe('fiscalSystemOverview', () => {
  const mockPortfolios = [
    {
      id: 'adult_social_care',
      title: 'Adult Social Care',
      short_title: 'Adults',
      demand_pressures: [
        { pressure: 'Over-65 demographic growth: £12M/year impact' },
        { pressure: 'NLW increases: £5M pressure' },
      ],
      savings_levers: [
        { lever: 'CHC recovery', saving: '£5-12M' },
        { lever: 'Reablement', saving: '£2-4M' },
      ],
      operational_context: {
        service_model: {
          asc_demand_model: { demographics: {} },
          inspection_remediation: { cqc_rating: 'Requires Improvement', target_rating: 'Good', date: '2025-08-01' },
        },
      },
    },
    {
      id: 'education_skills',
      title: 'Education & Skills',
      short_title: 'Education',
      demand_pressures: [
        { pressure: 'EHCP growth: £8M annual impact' },
      ],
      savings_levers: [
        { lever: 'SEND transport', saving: '£3-5M' },
      ],
      operational_context: {
        service_model: {
          send_cost_model: {},
          lac_cost_model: {},
        },
      },
    },
    {
      id: 'highways_transport',
      title: 'Highways',
      short_title: 'Highways',
      demand_pressures: [],
      savings_levers: [],
      operational_context: {},
    },
  ]

  it('returns empty for null input', () => {
    const result = fiscalSystemOverview(null)
    expect(result.portfolios).toEqual([])
    expect(result.service_model_coverage).toBe(0)
  })

  it('returns empty for empty array', () => {
    const result = fiscalSystemOverview([])
    expect(result.portfolios).toEqual([])
  })

  it('identifies portfolios with service models', () => {
    const result = fiscalSystemOverview(mockPortfolios)
    expect(result.service_model_count).toBe(2)
    expect(result.total_portfolios).toBe(3)
    expect(result.service_model_coverage).toBe(67) // 2/3 = 67%
  })

  it('returns model types for modelled portfolios', () => {
    const result = fiscalSystemOverview(mockPortfolios)
    const asc = result.portfolios.find(p => p.id === 'adult_social_care')
    expect(asc.has_service_model).toBe(true)
    expect(asc.model_types).toContain('asc_demand_model')
  })

  it('identifies unmodelled portfolios', () => {
    const result = fiscalSystemOverview(mockPortfolios)
    const hw = result.portfolios.find(p => p.id === 'highways_transport')
    expect(hw.has_service_model).toBe(false)
    expect(hw.model_types).toEqual([])
  })

  it('extracts demand pressures from text', () => {
    const result = fiscalSystemOverview(mockPortfolios)
    const asc = result.portfolios.find(p => p.id === 'adult_social_care')
    expect(asc.demand_annual).toBeGreaterThan(0)
  })

  it('calculates savings from levers', () => {
    const result = fiscalSystemOverview(mockPortfolios)
    const asc = result.portfolios.find(p => p.id === 'adult_social_care')
    expect(asc.savings_central).toBeGreaterThan(0)
  })

  it('calculates coverage percentage', () => {
    const result = fiscalSystemOverview(mockPortfolios)
    expect(result.coverage_pct).toBeGreaterThan(0)
    expect(result.coverage_pct).toBeLessThanOrEqual(100)
  })

  it('extracts inspection summary', () => {
    const result = fiscalSystemOverview(mockPortfolios)
    expect(result.inspection_summary).toHaveLength(1)
    expect(result.inspection_summary[0].current_rating).toBe('Requires Improvement')
    expect(result.inspection_summary[0].target_rating).toBe('Good')
  })

  it('assigns trajectory based on net position', () => {
    const result = fiscalSystemOverview(mockPortfolios)
    for (const p of result.portfolios) {
      expect(['improving', 'stable', 'declining']).toContain(p.trajectory)
    }
  })

  it('calculates total demand and savings', () => {
    const result = fiscalSystemOverview(mockPortfolios)
    expect(result.total_demand).toBeGreaterThan(0)
    expect(result.total_savings).toBeGreaterThan(0)
  })

  it('calculates net position', () => {
    const result = fiscalSystemOverview(mockPortfolios)
    expect(result.net_position).toBe(result.total_savings - result.total_demand)
  })

  it('handles portfolios with no demand pressures or levers', () => {
    const result = fiscalSystemOverview([{ id: 'empty', title: 'Empty', operational_context: {} }])
    expect(result.portfolios).toHaveLength(1)
    expect(result.portfolios[0].demand_annual).toBe(0)
    expect(result.portfolios[0].savings_central).toBe(0)
  })
})
