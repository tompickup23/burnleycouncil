import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LGRTracker from './LGRTracker'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

// Mock Recharts (SVG not measurable in JSDOM)
vi.mock('recharts', () => {
  const MockChart = ({ children }) => <div data-testid="recharts-mock">{children}</div>
  return {
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    BarChart: MockChart,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    PieChart: MockChart,
    Pie: ({ data }) => (
      <div data-testid="pie-data">
        {data?.map((d, i) => <span key={i}>{d.name}: {d.population}</span>)}
      </div>
    ),
    Cell: () => null,
    Legend: () => null,
    LineChart: MockChart,
    Line: () => null,
    ComposedChart: MockChart,
    Area: () => null,
    ReferenceLine: () => null,
  }
})

// Mock lgrModel utilities
vi.mock('../utils/lgrModel', () => ({
  computeCashflow: vi.fn(() => [
    { year: 'Y0', costs: -50000000, savings: 0, net: -50000000, cumulative: -50000000, npv: -50000000 },
    { year: 'Y1', costs: -30000000, savings: 10000000, net: -20000000, cumulative: -70000000, npv: -68000000 },
    { year: 'Y5', costs: 0, savings: 25000000, net: 25000000, cumulative: 30000000, npv: 20000000 },
  ]),
  computeSensitivity: vi.fn(() => ({
    best: [
      { year: 'Y0', cumulative: -40000000, npv: -40000000 },
      { year: 'Y5', cumulative: 80000000, npv: 60000000 },
    ],
    central: [
      { year: 'Y0', cumulative: -50000000, npv: -50000000 },
      { year: 'Y5', cumulative: 30000000, npv: 20000000 },
    ],
    worst: [
      { year: 'Y0', cumulative: -70000000, npv: -70000000 },
      { year: 'Y5', cumulative: -20000000, npv: -30000000 },
    ],
  })),
  computeTornado: vi.fn(() => [
    { label: 'Savings realisation', lowNPV: -10000000, highNPV: 50000000, baseNPV: 20000000 },
    { label: 'Cost overrun', lowNPV: 15000000, highNPV: -5000000, baseNPV: 20000000 },
  ]),
  findBreakevenYear: vi.fn(() => 'Y4'),
  DEFAULT_ASSUMPTIONS: {
    savingsRealisationRate: 0.75,
    transitionCostOverrun: 1.0,
    discountRate: 0.035,
    inflationRate: 0.02,
  },
  MODEL_KEY_MAP: {
    'gov-2u': 'two_unitary',
    'bwd-3u': 'three_unitary',
  },
}))

// Mock electionModel utilities
vi.mock('../utils/electionModel', () => ({
  projectToLGRAuthority: vi.fn(() => ({
    East: {
      totalSeats: 40,
      largestParty: 'Labour',
      largestPartySeats: 22,
      hasMajority: true,
      majorityThreshold: 21,
      seats: { Labour: 22, Conservative: 10, 'Reform UK': 5, 'Liberal Democrats': 3 },
      coalitions: [],
    },
  })),
  normalizePartyName: vi.fn((p) => p),
}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  official_website: 'https://burnley.gov.uk',
  spending_threshold: 500,
}

// --- Mock Data ---
const mockLgrData = {
  meta: { consultation_closes: '2027-04-01', source_urls: { consultation: 'https://gov.uk/lgr' } },
  overview: { title: 'Lancashire LGR', status: 'Consultation', close_date: '2027-04-01' },
  proposed_models: [
    {
      id: 'gov-2u',
      name: 'Government 2-Unitary',
      short_name: '2 UA',
      submitted_by: 'Government',
      num_authorities: 2,
      meets_threshold: true,
      description: 'Two new authorities: East Lancashire and West Lancashire.',
      doge_annual_savings: 12000000,
      doge_annual_savings_gross: 18000000,
      doge_payback_years: 4.5,
      ccn_annual_savings: 15000000,
      source_url: 'https://gov.uk/2u-proposal',
      submitter_control: 'Conservative-led when submitted',
      strengths: ['Meets 500K threshold', 'Clear geographic split'],
      weaknesses: ['Large population variation', 'Complex service splitting'],
      authorities: [
        {
          name: 'East Lancashire',
          population: 820000,
          councils: ['burnley', 'hyndburn', 'pendle', 'rossendale', 'lancashire_cc'],
          notes: 'Includes most deprived areas of Lancashire',
          demographics: { over_65_pct: 19.2, white_pct: 85.3, economically_active_pct: 72.1 },
        },
        {
          name: 'West Lancashire',
          population: 780000,
          councils: ['lancaster', 'ribble_valley', 'chorley', 'south_ribble'],
          notes: 'More affluent western corridor',
          demographics: { over_65_pct: 21.5, white_pct: 93.1, economically_active_pct: 74.8 },
        },
      ],
      political_analysis: {
        likely_control: 'Labour majority in East, NOC in West',
        councillor_reduction: '648 → ~160 (75% reduction)',
        who_benefits: 'Labour in East; Lib Dems gain influence in West',
        who_loses: 'District Conservatives lose council seats',
      },
    },
    {
      id: 'bwd-3u',
      name: 'BWD 3-Unitary',
      short_name: '3 UA',
      submitted_by: 'Blackburn with Darwen',
      num_authorities: 3,
      meets_threshold: false,
      description: 'Three new authorities including standalone BWD.',
      authorities: [
        { name: 'North', population: 450000, councils: ['lancaster'], notes: 'Below threshold' },
        { name: 'Central', population: 550000, councils: ['burnley', 'hyndburn'], notes: 'Test' },
        { name: 'South', population: 600000, councils: ['chorley'], notes: 'Test' },
      ],
    },
  ],
  timeline: [
    { date: '2025-11-01', event: 'Proposals submitted', detail: 'Five proposals received', upcoming: false },
    { date: '2026-02-05', event: 'Consultation opens', detail: 'Public consultation begins', upcoming: false },
    { date: '2027-04-01', event: 'Consultation closes', detail: 'Deadline for responses', upcoming: true },
  ],
  key_issues: [
    { id: 'dsg', title: 'DSG Deficit Transfer', severity: 'critical', description: 'LCC has £95.5M DSG deficit', figure: '£95.5M', figure_label: 'Dedicated Schools Grant deficit' },
    { id: 'veltip', title: 'VeLTIP Bond Portfolio', severity: 'high', description: 'LCC invested £519M in bonds, now worth ~£169M' },
    { id: 'oracle', title: 'Oracle Fusion IT', severity: 'medium', description: 'Failed IT system rollout' },
  ],
  precedents: [
    { area: 'Northumberland', year: 2009, councils_merged: 7, new_unitaries: 1, transition_cost: '£20M', annual_savings: '£15M', payback_period: '1.3 years', notes: 'Most successful UK LGR', actual_outcome: 'Delivered savings ahead of schedule' },
    { area: 'Cornwall', year: 2009, councils_merged: 7, new_unitaries: 1, transition_cost: '£25M', annual_savings: '£17M', payback_period: '1.5 years', notes: 'Similar geography challenges' },
  ],
  ccn_critique: {
    title: 'CCN Critique',
    summary: 'County Councils Network response to LGR proposals',
    issues: [
      { id: 'c1', title: 'Flawed Population Assumptions', severity: 'high', detail: 'CCN used outdated 2021 Census projections' },
      { id: 'c2', title: 'Underestimated Transition Costs', severity: 'medium', detail: 'Historical evidence suggests costs are 25-50% higher' },
    ],
  },
  ccn_analysis: {
    models: [
      { unitaries: 2, annual_savings: 20000000, transition_cost: 45000000, note: 'CCN preferred' },
      { unitaries: 3, annual_savings: 12000000, transition_cost: 55000000, note: 'Less efficient' },
      { unitaries: 4, annual_savings: null, transition_cost: null, note: 'Not modelled' },
    ],
  },
  independent_model: {
    subtitle: 'Bottom-up financial model from GOV.UK outturn data',
    computation_date: '2026-02-15',
    payback_analysis: [
      { model: 'two_unitary', label: '2 UAs', annual_saving: 12000000, annual_saving_gross: 18000000, transition_cost: 55000000, ten_year_net: 65000000, realistic_ten_year_net: 45000000, payback_years: 4.5, annual_saving_note: 'Net of ongoing costs' },
      { model: 'three_unitary', label: '3 UAs', annual_saving: 8000000, annual_saving_gross: 14000000, transition_cost: 65000000, ten_year_net: 15000000, realistic_ten_year_net: 5000000, payback_years: 8.1 },
    ],
    savings_breakdown: {
      components: [
        { category: 'CEO elimination', two_ua: 3000000, three_ua: 2000000, four_ua: 1000000, five_ua: 500000 },
        { category: 'Finance consolidation', two_ua: 5000000, three_ua: 4000000, four_ua: 3000000, five_ua: 2000000 },
      ],
      net_annual: {
        two_unitary: { gross: 18000000, costs: -6000000, net: 12000000 },
        three_unitary: { gross: 14000000, costs: -6000000, net: 8000000 },
      },
    },
    methodology: {
      assumptions: {
        realisation_rate: 0.75,
        overrun_factor: 1.25,
        discount_rate: 0.035,
      },
      self_critique: [
        'Does not account for non-financial service quality impacts',
        'Relies on aggregate GOV.UK data which may mask local variations',
      ],
    },
    back_office_computed: {
      previously_estimated: 120000000,
      total_central_services: 85000000,
      note: 'Actual back-office costs are 29% lower than consultant estimates',
    },
    presentation_comparison: {
      two_unitary: { newton_europe_savings: 28000000, doge_computed_savings: 18000000 },
      three_unitary: { newton_europe_savings: 20000000, doge_computed_savings: 14000000 },
    },
    transition_costs: {
      two_unitary: { total: 55000000, ict: 20000000, redundancy: 15000000, professional_fees: 10000000, other: 10000000 },
      three_unitary: { total: 65000000, ict: 25000000, redundancy: 18000000, professional_fees: 12000000, other: 10000000 },
    },
    asset_division: {
      principles: [
        { principle: 'Geographic principle', complexity: 'low', applies_to: 'Buildings and land', method: 'Transfer to geographically relevant authority', legal_basis: 'LGR Order', note: null },
        { principle: 'Population pro-rata', complexity: 'medium', applies_to: 'Financial assets and liabilities', method: 'Divide by population share', legal_basis: 'S14 Local Government Act', note: 'Excludes ring-fenced funds' },
      ],
      critical_issues: [
        {
          issue: 'Lancashire Pension Fund',
          detail: 'One of the largest LGPS funds in the country',
          options: ['Single fund with pooled governance', 'Split by employer membership'],
          recommendation: 'Maintain as single fund with joint committee',
          precedent: 'Northumberland 2009: single pension fund preserved',
        },
      ],
    },
  },
  demographic_projections: {
    title: 'Demographic Trends',
    subtitle: 'Population changes shaping the new authorities',
    lancashire_overview: {
      key_trends: ['Ageing population: 22% over 65 by 2030', 'East-West economic divide widening'],
    },
    economic_implications: {
      key_dynamics: [
        { trend: 'Rising dependency ratio', areas: ['Burnley', 'Pendle'], implication: 'Higher social care costs' },
      ],
    },
  },
  political_context: {
    title: 'Political Context',
    subtitle: 'Who controls what and who stands to gain',
    council_control: [
      { council: 'LCC', ruling_party: 'Reform UK', majority: 53, seats: 84 },
      { council: 'Burnley', ruling_party: 'Labour', majority: 27, seats: 45 },
    ],
    self_interest_analysis: [
      { proposal: '2-Unitary', submitter_motivation: 'Government preferred model based on efficiency', conflict_rating: 'low' },
      { proposal: '3-Unitary', submitter_motivation: 'BWD seeks to maintain unitary status', conflict_rating: 'high' },
    ],
    reform_uk_impact: {
      description: 'Reform UK controls LCC with 53 of 84 seats',
      key_points: ['Largest party on any UK county council', 'Would lose county council entirely under LGR'],
    },
  },
  national_context: {
    title: 'National Context',
    summary: 'LGR is happening across England',
    areas_reorganising: 21,
    councils_affected: 186,
    proposals_nationally: 44,
    key_facts: [
      { label: 'Timeline', detail: 'All new unitaries operational by April 2028' },
      { label: 'Cost estimate', detail: '£1.5B-2B nationally for transition' },
    ],
    comparison_table: [
      { wave: '1990s', councils_abolished: 48 },
      { wave: '2009', councils_abolished: 37 },
      { wave: '2019-23', councils_abolished: 16 },
      { wave: '2025-28', councils_abolished: 186 },
    ],
  },
  ai_doge_analysis: {
    title: 'AI DOGE Verdict',
    subtitle: 'Independent assessment of each proposal',
    recommendation: 'The 2-Unitary model offers the best balance of efficiency and democratic accountability.',
    assessments: [
      { model_id: 'gov-2u', score: 8, financial_score: 9, governance_score: 7, feasibility_score: 8, verdict: 'Recommended', reasoning: 'Best financial outcome with strong governance' },
      { model_id: 'bwd-3u', score: 5, financial_score: 4, governance_score: 6, feasibility_score: 5, verdict: 'Acceptable', reasoning: 'Weaker financial case but preserves BWD identity' },
    ],
    academic_basis: {
      optimal_population_range: { ai_doge_note: 'Academic evidence suggests 500K-800K optimal for unitary authorities' },
    },
  },
  ai_doge_proposals: {
    title: 'AI DOGE Alternative Proposals',
    subtitle: 'Data-driven alternatives based on efficiency analysis',
    proposals: [
      {
        id: 'doge-2ua-alt',
        name: 'Data-Optimised 2-UA',
        description: 'Alternative boundary split based on travel-to-work patterns',
        rationale: 'Better economic geography alignment',
        authorities: [
          { name: 'East Pennine', population: 850000, notes: 'M65 corridor' },
          { name: 'West Coast', population: 750000, notes: 'Coastal communities' },
        ],
        financial_case: 'Saves £14M/yr net (better than government 2-UA)',
        democratic_case: 'More equal population split',
        risk: 'Requires re-drawing boundaries',
      },
    ],
  },
}

const mockCrossCouncil = {
  councils: [
    {
      council_id: 'burnley',
      council_name: 'Burnley',
      annual_spend: 120000000,
      annual_records: 30580,
      collection_rate: 93.5,
      uncollected_ct_gbp: 2500000,
      dependency_ratio: 62.3,
      elderly_ratio: 19.8,
      youth_ratio: 20.1,
      party_seats: { Labour: 27, Conservative: 8, 'Liberal Democrats': 5, Independent: 5 },
      budget_summary: {
        reserves_total: 25000000,
        reserves_earmarked_closing: 18000000,
        reserves_unallocated_closing: 7000000,
        total_service_expenditure: 45000000,
        net_revenue_expenditure: 40000000,
        council_tax_requirement: 8000000,
      },
      reserves_trajectory: [
        { year: '2022/23', earmarked: 20000000, unallocated: 8000000, total: 28000000 },
        { year: '2023/24', earmarked: 18000000, unallocated: 7000000, total: 25000000 },
      ],
    },
    {
      council_id: 'hyndburn',
      council_name: 'Hyndburn',
      annual_spend: 80000000,
      annual_records: 29804,
      collection_rate: 91.2,
      uncollected_ct_gbp: 3200000,
      dependency_ratio: 64.5,
      elderly_ratio: 20.5,
      youth_ratio: 21.3,
      party_seats: { Labour: 21, Conservative: 8, Independent: 5 },
      budget_summary: {
        reserves_total: 15000000,
        reserves_earmarked_closing: 10000000,
        reserves_unallocated_closing: 5000000,
        total_service_expenditure: 30000000,
        net_revenue_expenditure: 28000000,
        council_tax_requirement: 6000000,
      },
      reserves_trajectory: [
        { year: '2022/23', earmarked: 12000000, unallocated: 5000000, total: 17000000 },
        { year: '2023/24', earmarked: 10000000, unallocated: 5000000, total: 15000000 },
      ],
    },
    {
      council_id: 'lancaster',
      council_name: 'Lancaster',
      annual_spend: 90000000,
      annual_records: 32574,
      collection_rate: 96.1,
      uncollected_ct_gbp: 1200000,
      dependency_ratio: 58.2,
      elderly_ratio: 18.0,
      youth_ratio: 19.5,
      party_seats: { Green: 23, Labour: 15, Conservative: 10, 'Liberal Democrats': 8, Independent: 5 },
      budget_summary: {
        reserves_total: 30000000,
        reserves_earmarked_closing: 22000000,
        reserves_unallocated_closing: 8000000,
        total_service_expenditure: 50000000,
        net_revenue_expenditure: 47000000,
        council_tax_requirement: 10000000,
      },
      reserves_trajectory: [],
    },
  ],
  generated: '2026-02-16',
}

const mockBudgetModel = {
  transition_cost_profile: [0.3, 0.4, 0.2, 0.1],
  savings_ramp_profile: [0, 0.2, 0.5, 0.8, 1.0],
  model_defaults: {
    savingsRealisationRate: 0.75,
    transitionCostOverrun: 1.0,
    discountRate: 0.035,
    inflationRate: 0.02,
  },
  per_service_savings: {
    'gov-2u': { total_annual_savings: 18000000 },
    'bwd-3u': { total_annual_savings: 14000000 },
  },
  per_authority_savings: {
    'gov-2u': {
      'East Lancashire': { annual_savings: 10000000, num_merging_entities: 5 },
      'West Lancashire': { annual_savings: 8000000, num_merging_entities: 4 },
    },
  },
  authority_balance_sheets: {
    'gov-2u': {
      'East Lancashire': { population_share_pct: 51.3, reserves_total: 40000000, lcc_debt_share: 120000000, dsg_deficit_share: 49000000, opening_net_position: -129000000 },
      'West Lancashire': { population_share_pct: 48.7, reserves_total: 38000000, lcc_debt_share: 115000000, dsg_deficit_share: 46500000, opening_net_position: -123500000 },
    },
  },
  council_tax_harmonisation: {
    'gov-2u': {
      lcc_band_d_element: 1736,
      authorities: [
        {
          name: 'East Lancashire',
          harmonised_band_d: 1985.50,
          lcc_ct_share: 350000000,
          total_ct_requirement: 410000000,
          councils: [
            { council_id: 'burnley', name: 'Burnley', current_combined_element: 1920, delta: -65.50, winner: true },
            { council_id: 'hyndburn', name: 'Hyndburn', current_combined_element: 2050, delta: 64.50, winner: false },
          ],
        },
      ],
    },
  },
  authority_composition: {
    'gov-2u': [
      {
        name: 'East Lancashire',
        services: {
          'Education services': { net: 200000000, pct: 40 },
          'Adult Social Care': { net: 150000000, pct: 30 },
          'Central services': { net: 50000000, pct: 10 },
        },
      },
    ],
  },
}

function setupMocks(overrides = {}) {
  const lgr = overrides.lgrData !== undefined ? overrides.lgrData : mockLgrData
  const cc = overrides.crossCouncil !== undefined ? overrides.crossCouncil : mockCrossCouncil
  const bm = overrides.budgetModel !== undefined ? overrides.budgetModel : mockBudgetModel
  useData.mockReturnValue({ data: [lgr, cc, bm], loading: false, error: null })
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <LGRTracker />
    </MemoryRouter>
  )
}

describe('LGRTracker', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  // ==================== Loading & Error States ====================
  describe('loading and error states', () => {
    it('shows loading state while data loads', () => {
      useData.mockReturnValue({ data: null, loading: true, error: null })
      renderComponent()
      expect(screen.getByText(/loading lgr tracker/i)).toBeInTheDocument()
    })

    it('shows unavailable message when data fails to load', () => {
      useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
      renderComponent()
      expect(screen.getByText(/lgr tracking data is not yet available/i)).toBeInTheDocument()
    })

    it('shows unavailable message when lgrData is null', () => {
      useData.mockReturnValue({ data: [null, null, null], loading: false, error: null })
      renderComponent()
      expect(screen.getByText(/lgr tracking data is not yet available/i)).toBeInTheDocument()
    })
  })

  // ==================== Page Header & Section Nav ====================
  describe('page header and navigation', () => {
    it('renders the page heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Tracker')).toBeInTheDocument()
    })

    it('shows consultation countdown', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/days until consultation closes/i)).toBeInTheDocument()
    })

    it('renders council-specific context banner', () => {
      setupMocks()
      renderComponent()
      const banner = document.querySelector('.lgr-context-banner')
      expect(within(banner).getByText(/Burnley Borough Council/)).toBeInTheDocument()
      expect(within(banner).getByText(/15 Lancashire councils/)).toBeInTheDocument()
    })

    it('shows authority name in context banner when council found in model', () => {
      setupMocks()
      renderComponent()
      const banner = document.querySelector('.lgr-context-banner')
      expect(within(banner).getByText(/East Lancashire/)).toBeInTheDocument()
    })

    it('renders section navigation with all sections', () => {
      setupMocks()
      renderComponent()
      const nav = screen.getByRole('navigation', { name: /lgr tracker sections/i })
      expect(nav).toBeInTheDocument()
      expect(within(nav).getByText('Proposals')).toBeInTheDocument()
      expect(within(nav).getByText('AI DOGE Model')).toBeInTheDocument()
      expect(within(nav).getByText('Cashflow')).toBeInTheDocument()
      expect(within(nav).getByText('Sensitivity')).toBeInTheDocument()
      expect(within(nav).getByText('Council Tax')).toBeInTheDocument()
      expect(within(nav).getByText('Risks')).toBeInTheDocument()
      expect(within(nav).getByText('Precedents')).toBeInTheDocument()
    })

    it('highlights active section on click', () => {
      setupMocks()
      renderComponent()
      const risksBtn = screen.getByText('Risks').closest('button')
      fireEvent.click(risksBtn)
      expect(risksBtn.getAttribute('aria-current')).toBe('true')
    })
  })

  // ==================== Timeline ====================
  describe('timeline section', () => {
    it('renders timeline events', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByRole('heading', { level: 2, name: /Timeline/ })).toBeInTheDocument()
      expect(screen.getByText('Proposals submitted')).toBeInTheDocument()
      expect(screen.getByText('Consultation opens')).toBeInTheDocument()
      expect(screen.getByText('Consultation closes')).toBeInTheDocument()
    })

    it('shows event details', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Five proposals received')).toBeInTheDocument()
    })
  })

  // ==================== Proposed Models ====================
  describe('proposed models section', () => {
    it('renders the five proposals heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('The Five Proposals')).toBeInTheDocument()
    })

    it('renders model tabs', () => {
      setupMocks()
      renderComponent()
      const tablist = screen.getByRole('tablist', { name: /lgr proposal models/i })
      expect(tablist).toBeInTheDocument()
      const tabs = within(tablist).getAllByRole('tab')
      expect(tabs.length).toBe(2)
    })

    it('shows first model as active by default', () => {
      setupMocks()
      renderComponent()
      const tablist = screen.getByRole('tablist', { name: /lgr proposal models/i })
      const tabs = within(tablist).getAllByRole('tab')
      expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    })

    it('shows model metadata — submitted by', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/Submitted by:/)).toBeInTheDocument()
      const metaItem = screen.getByText(/Submitted by:/).closest('.model-meta-item')
      expect(metaItem.textContent).toContain('Government')
    })

    it('shows threshold badge for models', () => {
      setupMocks()
      renderComponent()
      expect(screen.getAllByText(/Above 500K/).length).toBeGreaterThanOrEqual(1)
    })

    it('shows AI DOGE savings for model', () => {
      setupMocks()
      renderComponent()
      expect(screen.getAllByText(/realistic savings/i).length).toBeGreaterThanOrEqual(1)
    })

    it('shows strengths and weaknesses', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Strengths')).toBeInTheDocument()
      expect(screen.getByText('Weaknesses')).toBeInTheDocument()
      expect(screen.getByText('Meets 500K threshold')).toBeInTheDocument()
      expect(screen.getByText('Large population variation')).toBeInTheDocument()
    })

    it('switches to second model on tab click', () => {
      setupMocks()
      renderComponent()
      const tablist = screen.getByRole('tablist', { name: /lgr proposal models/i })
      const tabs = within(tablist).getAllByRole('tab')
      fireEvent.click(tabs[1])
      // Now BWD 3-Unitary should be active
      expect(screen.getByText(/Blackburn with Darwen/)).toBeInTheDocument()
    })

    it('shows authority demographics', () => {
      setupMocks()
      renderComponent()
      expect(screen.getAllByText(/Over 65:/).length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText(/19.2%/)).toBeInTheDocument()
    })

    it('shows political analysis', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Political Analysis')).toBeInTheDocument()
      expect(screen.getByText(/Labour majority in East/)).toBeInTheDocument()
    })

    it('marks user council authority with badge', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Your council')).toBeInTheDocument()
    })
  })

  // ==================== AI DOGE Independent Model ====================
  describe('AI DOGE independent model section', () => {
    it('renders the independent model heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/AI DOGE Independent Financial Model/)).toBeInTheDocument()
    })

    it('shows savings explainer', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('How We Calculate Savings')).toBeInTheDocument()
      expect(screen.getAllByText(/75% realisation rate/).length).toBeGreaterThanOrEqual(1)
    })

    it('renders savings comparison charts', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Realistic Annual Savings by Model')).toBeInTheDocument()
      expect(screen.getByText('10-Year Net Financial Impact')).toBeInTheDocument()
    })

    it('shows savings breakdown chart', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Where the Money Comes From (and Goes)')).toBeInTheDocument()
    })

    it('shows back-office cost discovery', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/Key Discovery: Actual Back-Office Costs/)).toBeInTheDocument()
      expect(screen.getByText(/29% lower than consultant estimates/)).toBeInTheDocument()
    })

    it('shows Newton Europe comparison', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/Consultants vs AI DOGE: Gross Savings Comparison/)).toBeInTheDocument()
    })

    it('shows net annual impact', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Net Annual Impact Before Realisation Adjustment')).toBeInTheDocument()
    })

    it('shows model assumptions', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Model Assumptions (Published for Scrutiny)')).toBeInTheDocument()
      expect(screen.getByText('realisation rate')).toBeInTheDocument()
    })

    it('shows methodology self-critique', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Methodology Self-Critique')).toBeInTheDocument()
      expect(screen.getByText(/non-financial service quality/)).toBeInTheDocument()
    })
  })

  // ==================== Cashflow Section ====================
  describe('cashflow section', () => {
    it('renders cashflow heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Year-by-Year Financial Trajectory')).toBeInTheDocument()
    })

    it('shows what-if calculator toggle', () => {
      setupMocks()
      renderComponent()
      const toggle = screen.getByText(/Interactive Calculator/i).closest('button')
      expect(toggle).toBeInTheDocument()
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
    })

    it('expands what-if calculator on click', () => {
      setupMocks()
      renderComponent()
      const toggle = screen.getByText(/Interactive Calculator/i).closest('button')
      fireEvent.click(toggle)
      expect(toggle.getAttribute('aria-expanded')).toBe('true')
      // Should show sliders
      expect(screen.getByText('Savings realisation rate')).toBeInTheDocument()
      expect(screen.getByText('Transition cost overrun')).toBeInTheDocument()
      expect(screen.getByText('Discount rate')).toBeInTheDocument()
      expect(screen.getByText('Inflation rate')).toBeInTheDocument()
    })

    it('shows defaults badge initially', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Defaults')).toBeInTheDocument()
    })

    it('shows headline cashflow stats', () => {
      setupMocks()
      renderComponent()
      const headline = document.querySelector('.cashflow-headline')
      expect(within(headline).getByText('11-Year Cumulative Net')).toBeInTheDocument()
      expect(within(headline).getByText('Net Present Value')).toBeInTheDocument()
      expect(within(headline).getByText('Breakeven Year')).toBeInTheDocument()
    })

    it('renders per-authority financial cards', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Per-Authority Financial Position')).toBeInTheDocument()
      // Should show authority names from per_authority_savings
      const cards = screen.getAllByText(/annual savings/i)
      expect(cards.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ==================== Sensitivity Analysis ====================
  describe('sensitivity analysis section', () => {
    it('renders sensitivity heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Sensitivity Analysis')).toBeInTheDocument()
    })

    it('shows scenario comparison table', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Best Case')).toBeInTheDocument()
      expect(screen.getByText('Central Case')).toBeInTheDocument()
      expect(screen.getByText('Worst Case')).toBeInTheDocument()
    })

    it('shows savings realisation percentages', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Savings realisation')).toBeInTheDocument()
      // Best case 100%, Worst case 50%
      expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('50%').length).toBeGreaterThanOrEqual(1)
    })

    it('renders confidence range chart', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/Cumulative Net Position — Confidence Range/)).toBeInTheDocument()
    })

    it('renders tornado diagram', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/What Drives the Result/)).toBeInTheDocument()
    })
  })

  // ==================== Council Tax Harmonisation ====================
  describe('council tax harmonisation section', () => {
    it('renders council tax heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Council Tax Harmonisation')).toBeInTheDocument()
    })

    it('renders model selector tabs', () => {
      setupMocks()
      renderComponent()
      const tablist = screen.getByRole('tablist', { name: /council tax harmonisation model selector/i })
      expect(tablist).toBeInTheDocument()
    })

    it('shows harmonised band D rate', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('£1985.50')).toBeInTheDocument()
    })

    it('shows council names in CT bars', () => {
      setupMocks()
      renderComponent()
      // The CT section shows council-specific bars
      const ctSection = screen.getByText('Council Tax Harmonisation').closest('section')
      expect(within(ctSection).getByText('Burnley')).toBeInTheDocument()
      expect(within(ctSection).getByText('Hyndburn')).toBeInTheDocument()
    })

    it('shows delta for each council', () => {
      setupMocks()
      renderComponent()
      // Math.round(-65.50) = -65 and Math.round(64.50) = 65
      expect(screen.getByText('−£65/yr')).toBeInTheDocument()
      expect(screen.getByText('+£65/yr')).toBeInTheDocument()
    })

    it('shows how harmonisation works explainer', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('How harmonisation works')).toBeInTheDocument()
    })

    it('shows AI DOGE savings comparison', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/AI DOGE realistic savings/)).toBeInTheDocument()
    })
  })

  // ==================== Asset Division ====================
  describe('asset division section', () => {
    it('renders assets heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/Asset Division & Transition/)).toBeInTheDocument()
    })

    it('shows asset principles', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Geographic principle')).toBeInTheDocument()
      expect(screen.getByText('Population pro-rata')).toBeInTheDocument()
    })

    it('shows critical asset issues', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Critical Asset Issues')).toBeInTheDocument()
      expect(screen.getByText('Lancashire Pension Fund')).toBeInTheDocument()
    })

    it('shows asset issue recommendation', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/Maintain as single fund/)).toBeInTheDocument()
    })
  })

  // ==================== Financial Handover ====================
  describe('financial handover section', () => {
    it('renders handover heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Financial Handover Dashboard')).toBeInTheDocument()
    })

    it('renders handover model tabs', () => {
      setupMocks()
      renderComponent()
      const tablist = screen.getByRole('tablist', { name: /handover model selector/i })
      expect(tablist).toBeInTheDocument()
    })

    it('shows combined summary stats', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Combined service expenditure')).toBeInTheDocument()
      expect(screen.getByText('Combined reserves')).toBeInTheDocument()
      expect(screen.getByText('Total population')).toBeInTheDocument()
    })

    it('shows per-authority handover cards', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Your authority')).toBeInTheDocument()
    })

    it('shows spend per head comparison chart', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Spend per head by proposed authority')).toBeInTheDocument()
    })
  })

  // ==================== CCN Critique ====================
  describe('CCN critique section', () => {
    it('renders critique heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByRole('heading', { level: 2, name: /CCN Critique/ })).toBeInTheDocument()
    })

    it('shows critique issues', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Flawed Population Assumptions')).toBeInTheDocument()
      expect(screen.getByText('Underestimated Transition Costs')).toBeInTheDocument()
    })

    it('expands critique detail on click', () => {
      setupMocks()
      renderComponent()
      const card = screen.getByText('Flawed Population Assumptions').closest('[role="button"]')
      fireEvent.click(card)
      expect(screen.getByText(/outdated 2021 Census projections/)).toBeInTheDocument()
    })

    it('expands critique via keyboard', () => {
      setupMocks()
      renderComponent()
      const card = screen.getByText('Underestimated Transition Costs').closest('[role="button"]')
      fireEvent.keyDown(card, { key: 'Enter' })
      expect(screen.getByText(/Historical evidence suggests costs are 25-50% higher/)).toBeInTheDocument()
    })

    it('shows CCN vs DOGE comparison chart', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/CCN\/PwC vs AI DOGE: Realistic Annual Savings/)).toBeInTheDocument()
    })
  })

  // ==================== Key Risks ====================
  describe('key risks section', () => {
    it('renders risks heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Key Risks')).toBeInTheDocument()
    })

    it('shows all risk issues', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('DSG Deficit Transfer')).toBeInTheDocument()
      expect(screen.getByText('VeLTIP Bond Portfolio')).toBeInTheDocument()
      expect(screen.getByText('Oracle Fusion IT')).toBeInTheDocument()
    })

    it('shows severity badges', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('critical')).toBeInTheDocument()
      expect(screen.getAllByText('high').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('medium').length).toBeGreaterThanOrEqual(1)
    })

    it('expands risk detail on click', () => {
      setupMocks()
      renderComponent()
      const card = screen.getByText('DSG Deficit Transfer').closest('[role="button"]')
      fireEvent.click(card)
      expect(screen.getByText(/LCC has £95.5M DSG deficit/)).toBeInTheDocument()
    })

    it('shows risk figure', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('£95.5M')).toBeInTheDocument()
    })

    it('collapses risk on second click', () => {
      setupMocks()
      renderComponent()
      const card = screen.getByText('DSG Deficit Transfer').closest('[role="button"]')
      fireEvent.click(card)
      expect(screen.getByText(/LCC has £95.5M DSG deficit/)).toBeInTheDocument()
      fireEvent.click(card)
      expect(screen.queryByText(/LCC has £95.5M DSG deficit/)).not.toBeInTheDocument()
    })
  })

  // ==================== Precedents ====================
  describe('precedents section', () => {
    it('renders precedents heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('UK Precedents')).toBeInTheDocument()
    })

    it('shows precedent cards', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Northumberland')).toBeInTheDocument()
      expect(screen.getByText('Cornwall')).toBeInTheDocument()
    })

    it('shows precedent financials', () => {
      setupMocks()
      renderComponent()
      expect(screen.getAllByText('£20M').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('£15M').length).toBeGreaterThanOrEqual(1)
    })

    it('shows actual outcome', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Delivered savings ahead of schedule')).toBeInTheDocument()
    })
  })

  // ==================== Demographics ====================
  describe('demographics section', () => {
    it('renders demographics heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Demographic Trends')).toBeInTheDocument()
    })

    it('shows key trends', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/Ageing population: 22% over 65 by 2030/)).toBeInTheDocument()
    })

    it('shows economic implications', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Economic Implications')).toBeInTheDocument()
      expect(screen.getByText('Rising dependency ratio')).toBeInTheDocument()
    })
  })

  // ==================== Political Context ====================
  describe('political context section', () => {
    it('renders political context heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Political Context')).toBeInTheDocument()
    })

    it('shows council control table', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Who Controls Each Council')).toBeInTheDocument()
      expect(screen.getByText('Reform UK')).toBeInTheDocument()
    })

    it('shows self-interest analysis', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/Self-Interest Analysis/)).toBeInTheDocument()
      expect(screen.getByText(/BWD seeks to maintain unitary status/)).toBeInTheDocument()
    })

    it('shows conflict ratings', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('low conflict')).toBeInTheDocument()
      expect(screen.getByText('high conflict')).toBeInTheDocument()
    })

    it('shows Reform UK impact', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/Reform UK & LGR/)).toBeInTheDocument()
      expect(screen.getByText(/Largest party on any UK county council/)).toBeInTheDocument()
    })
  })

  // ==================== National Context ====================
  describe('national context section', () => {
    it('renders national context heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByRole('heading', { level: 2, name: /National Context/ })).toBeInTheDocument()
    })

    it('shows national stats', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('21')).toBeInTheDocument()
      expect(screen.getByText('186+')).toBeInTheDocument()
      expect(screen.getByText('44')).toBeInTheDocument()
    })

    it('shows key facts', () => {
      setupMocks()
      renderComponent()
      // 'Timeline' appears as both an h2 heading and a key fact h4 label
      const nationalSection = document.getElementById('lgr-national')
      expect(within(nationalSection).getByText('Timeline')).toBeInTheDocument()
      expect(within(nationalSection).getByText('Cost estimate')).toBeInTheDocument()
    })

    it('shows comparison table', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Scale Comparison: LGR Waves')).toBeInTheDocument()
      expect(screen.getByText('1990s')).toBeInTheDocument()
      expect(screen.getByText('2025-28')).toBeInTheDocument()
    })
  })

  // ==================== AI DOGE Analysis & Verdicts ====================
  describe('AI DOGE verdicts', () => {
    it('renders AI DOGE verdict heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('AI DOGE Verdict')).toBeInTheDocument()
    })

    it('shows model score cards', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Recommended')).toBeInTheDocument()
      expect(screen.getByText('Acceptable')).toBeInTheDocument()
    })

    it('shows recommendation text', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/2-Unitary model offers the best balance/)).toBeInTheDocument()
    })

    it('shows academic basis note', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/500K-800K optimal for unitary/)).toBeInTheDocument()
    })
  })

  // ==================== AI DOGE Alternative Proposals ====================
  describe('AI DOGE alternative proposals', () => {
    it('renders alternative proposals heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('AI DOGE Alternative Proposals')).toBeInTheDocument()
    })

    it('shows proposal details', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Data-Optimised 2-UA')).toBeInTheDocument()
      expect(screen.getByText(/travel-to-work patterns/)).toBeInTheDocument()
    })

    it('shows financial and democratic cases', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/Saves £14M\/yr net/)).toBeInTheDocument()
      expect(screen.getByText(/More equal population split/)).toBeInTheDocument()
    })
  })

  // ==================== Financial Comparison Charts ====================
  describe('financial comparison charts', () => {
    it('renders annual spend chart', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/Annual Spend by Proposed Authority/)).toBeInTheDocument()
    })

    it('renders population distribution chart', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Population Distribution')).toBeInTheDocument()
    })

    it('renders reserves chart', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Reserves by Proposed Authority')).toBeInTheDocument()
    })
  })

  // ==================== Revenue Risk & Service Demand ====================
  describe('revenue risk analysis', () => {
    it('renders revenue risk heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/Revenue Risk & Service Demand/)).toBeInTheDocument()
    })

    it('shows collection rate metrics', () => {
      setupMocks()
      renderComponent()
      const riskCards = screen.getAllByText('Collection rate')
      expect(riskCards.length).toBeGreaterThanOrEqual(1)
    })

    it('shows dependency ratio', () => {
      setupMocks()
      renderComponent()
      const deps = screen.getAllByText('Dependency ratio')
      expect(deps.length).toBeGreaterThanOrEqual(1)
    })

    it('shows reserves buffer', () => {
      setupMocks()
      renderComponent()
      const buffers = screen.getAllByText('Reserves buffer')
      expect(buffers.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ==================== Sources & Methodology ====================
  describe('sources section', () => {
    it('renders sources heading', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Sources & Methodology')).toBeInTheDocument()
    })

    it('contains methodology text', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/2,286,000\+/)).toBeInTheDocument()
    })
  })

  // ==================== Edge Cases ====================
  describe('edge cases', () => {
    it('renders with minimal data (no optional sections)', () => {
      const minimalLgr = {
        meta: { consultation_closes: '2027-04-01', source_urls: { consultation: 'https://gov.uk' } },
        proposed_models: [{
          id: 'gov-2u', name: 'Test Model', short_name: '2 UA', submitted_by: 'Gov',
          num_authorities: 1, authorities: [{ name: 'Test', population: 500000, councils: ['burnley'], notes: '' }],
        }],
        timeline: [{ date: '2026-01-01', event: 'Test', detail: 'Test', upcoming: false }],
        key_issues: [],
        precedents: [],
        ccn_critique: null,
        ccn_analysis: null,
        independent_model: null,
        demographic_projections: null,
        political_context: null,
        national_context: null,
        ai_doge_analysis: null,
        ai_doge_proposals: null,
      }
      setupMocks({ lgrData: minimalLgr, budgetModel: null })
      renderComponent()
      expect(screen.getByText('Tracker')).toBeInTheDocument()
      // Optional section headings should NOT render (nav buttons with same labels still exist)
      expect(screen.queryByRole('heading', { level: 2, name: /CCN Critique/ })).not.toBeInTheDocument()
      expect(screen.queryByText('Demographic Trends')).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { level: 2, name: /Political Context/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { level: 2, name: /National Context/ })).not.toBeInTheDocument()
    })

    it('handles empty cross-council array', () => {
      setupMocks({ crossCouncil: { councils: [], generated: '2026-01-01' } })
      renderComponent()
      expect(screen.getByText('Tracker')).toBeInTheDocument()
    })

    it('handles crossCouncil as array instead of object', () => {
      setupMocks({ crossCouncil: [] })
      renderComponent()
      expect(screen.getByText('Tracker')).toBeInTheDocument()
    })

    it('handles null budgetModel gracefully', () => {
      setupMocks({ budgetModel: null })
      renderComponent()
      expect(screen.getByText('Tracker')).toBeInTheDocument()
      // Cashflow section should not render without budgetModel
      expect(screen.queryByText('Year-by-Year Financial Trajectory')).not.toBeInTheDocument()
    })

    it('handles council not in any model authority', () => {
      useCouncilConfig.mockReturnValue({ ...mockConfig, council_id: 'unknown_council' })
      setupMocks()
      renderComponent()
      expect(screen.getByText('Tracker')).toBeInTheDocument()
      expect(screen.queryByText('Your council')).not.toBeInTheDocument()
    })

    it('sets document title on mount', () => {
      setupMocks()
      renderComponent()
      expect(document.title).toBe('LGR Tracker | Burnley Council Transparency')
    })
  })

  // ==================== Score Bar & Health Scorecard Sub-components ====================
  describe('ScoreBar sub-component', () => {
    it('renders score bars in AI DOGE verdict', () => {
      setupMocks()
      renderComponent()
      // Check for meter roles
      const meters = screen.getAllByRole('meter')
      expect(meters.length).toBeGreaterThanOrEqual(1)
    })

    it('shows score labels', () => {
      setupMocks()
      renderComponent()
      // Multi-score display: Financial, Governance, Feasibility, Overall
      expect(screen.getByText('Financial')).toBeInTheDocument()
      expect(screen.getByText('Governance')).toBeInTheDocument()
      expect(screen.getByText('Feasibility')).toBeInTheDocument()
    })
  })

  describe('FinancialHealthScorecard', () => {
    it('renders scorecard within authority card', () => {
      setupMocks()
      renderComponent()
      // Financial Health heading in scorecard
      expect(screen.getAllByText('Financial Health').length).toBeGreaterThanOrEqual(1)
    })
  })

  // ==================== AssumptionSlider interaction ====================
  describe('AssumptionSlider interaction', () => {
    it('shows slider ARIA attributes when expanded', () => {
      setupMocks()
      renderComponent()
      // Expand the what-if panel
      fireEvent.click(screen.getByText(/Interactive Calculator/i).closest('button'))
      const sliders = screen.getAllByRole('slider')
      expect(sliders.length).toBe(4)
      // Check ARIA on first slider
      expect(sliders[0].getAttribute('aria-label')).toBe('Savings realisation rate')
    })

    it('shows reset button after changing a slider', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText(/Interactive Calculator/i).closest('button'))
      const sliders = screen.getAllByRole('slider')
      // Change the first slider
      fireEvent.change(sliders[0], { target: { value: '0.90' } })
      expect(screen.getByText('Custom')).toBeInTheDocument()
      expect(screen.getByText(/Reset to defaults/)).toBeInTheDocument()
    })
  })
})
