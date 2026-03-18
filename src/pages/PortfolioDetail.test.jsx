import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PortfolioDetail from './PortfolioDetail'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../firebase', () => ({
  isFirebaseEnabled: false,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: vi.fn(),
  }
})

vi.mock('../components/ui', () => ({
  LoadingState: ({ message }) => <div>{message || 'Loading...'}</div>,
  ErrorState: ({ title, message, error }) => <div data-testid="error-state"><span>{title || 'Error'}</span><span>{message || error?.message || ''}</span></div>,
}))

vi.mock('../components/ui/StatCard', () => ({
  StatCard: ({ label, value }) => <div data-testid="stat-card"><span>{label}</span><span>{value}</span></div>,
}))

vi.mock('../components/ui/ChartCard', () => ({
  ChartCard: ({ title, children }) => <div data-testid="chart-card"><span>{title}</span>{children}</div>,
}))

vi.mock('../components/CollapsibleSection', () => ({
  default: ({ title, children }) => <div data-testid="collapsible-section"><h3>{title}</h3>{children}</div>,
}))

// Mock Recharts
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
    LineChart: MockChart,
    Line: () => null,
    Legend: () => null,
    PieChart: MockChart,
    Pie: () => null,
    Cell: () => null,
    ScatterChart: MockChart,
    Scatter: () => null,
    ZAxis: () => null,
    AreaChart: MockChart,
    Area: () => null,
    Treemap: () => null,
  }
})

// Mock savingsEngine
vi.mock('../utils/savingsEngine', () => ({
  matchSpendingToPortfolio: vi.fn(() => []),
  mapFindingsToPortfolio: vi.fn(() => ({
    duplicates: [{ supplier: 'Test Corp', total_value: 25000, count: 2 }],
    splits: [],
    ch_flags: [{ supplier: 'Dodgy Ltd' }],
    round_numbers: [{ amount: 10000 }],
  })),
  generateDirectives: vi.fn(() => [
    {
      id: 'd1',
      action: 'Renegotiate adult care contracts',
      type: 'contract_renegotiation',
      save_low: 2000000,
      save_central: 3000000,
      save_high: 4000000,
      timeline: '3-6 months',
      risk: 'Medium',
      legal_basis: 'Public Contracts Regulations 2015',
      governance_route: 'cabinet_member_decision',
      portfolio_id: 'adult_social_care',
      priority: 'high',
      feasibility: 8,
      impact: 9,
      steps: ['Review existing contracts', 'Issue new tenders'],
      evidence: 'DOGE analysis identified duplicate payments',
    },
  ]),
  generateReformPlaybook: vi.fn(() => ({
    phases: {
      year_1: { label: 'Year 1 (2025/26)', directives: [{ id: 'd1', action: 'Renegotiate adult care contracts', save_central: 3000000, risk: 'Medium' }], total_savings: 3000000 },
      year_2: { label: 'Year 2 (2026/27)', directives: [], total_savings: 0 },
      year_3: { label: 'Year 3 (2027/28)', directives: [], total_savings: 0 },
    },
    red_lines: [{ act: 'Care Act 2014', summary: 'Assess eligible needs', risk: 'Cannot cut statutory assessments' }],
    amber_zones: [{ act: 'Children Act 1989', summary: 'Safeguarding duties', risk: 'Must maintain core provision' }],
    green_space: [{ act: 'Localism Act 2011', summary: 'General power of competence' }],
    total_savings: 3000000,
    directive_count: 1,
  })),
  decisionPathway: vi.fn(() => ({
    route: 'cabinet_member_decision',
    authority: 'Cabinet Member for Adults',
    timeline_days: 28,
  })),
  supplierPortfolioAnalysis: vi.fn(() => ({ top_suppliers: [], concentration: 0 })),
  decisionPipeline: vi.fn(() => []),
  meetingBriefing: vi.fn(() => null),
  politicalContext: vi.fn(() => ({
    reform_majority: true,
    lgr_deadline: 'April 2028',
    lgr_impact: 'Services transfer to new authority',
    next_elections: 'May 2029',
    time_to_deliver: '3 years',
    opposition_parties: ['Labour', 'Conservative', 'Liberal Democrats'],
  })),
  departmentOperationsProfile: vi.fn(() => ({})),
  processEfficiency: vi.fn(() => ({})),
  priorityMatrix: vi.fn(() => ({
    do_now: [{ id: 'd1', action: 'Renegotiate adult care contracts', save_central: 3000000 }],
    plan_next: [],
    delegate: [],
    deprioritise: [],
  })),
  generatePortfolioFOI: vi.fn(() => ({
    subject: 'FOI Request: Adult Care Contracts',
    body: 'Under the Freedom of Information Act 2000...',
  })),
  crossPortfolioDependencies: vi.fn(() => []),
  contractPipeline: vi.fn(() => ({ expiring_3m: [], expiring_6m: [], expiring_12m: [], total_value: 0, total_contracts: 0, relevant: [], sme_count: 0, single_bidder_count: 0 })),
  fundingConstraints: vi.fn(() => null),
  formatCurrency: vi.fn((v) => {
    if (!v && v !== 0) return '£0'
    const m = Math.round(v / 1000000)
    return m >= 1 ? `£${m}M` : `£${Math.round(v / 1000).toLocaleString()}K`
  }),
  sendCostProjection: vi.fn(() => ({ yearly: [], growth_rate: 0, cost_driver_breakdown: {}, total_5yr_cost: 0, base_year_cost: 0, dsg_trajectory: [] })),
  earlyInterventionROI: vi.fn(() => ({ current_reactive_cost: 0, intervention_cost: 0, total_saving: 0, net_saving: 0, payback_years: 0, children_diverted: 0, programmes: [] })),
  lacPlacementOptimisation: vi.fn(() => ({ current_cost: 0, optimised_cost: 0, saving: 0, saving_pct: 0, placements_moved: [], wocl_roi: null, timeline: [] })),
  ascDemandProjection: vi.fn(() => ({ yearly: [], base_cost: 0, total_growth: 0, blended_growth_rate: 0, cost_breakdown: {} })),
  ascMarketRisk: vi.fn(() => ({ provider_count: 0, vacancy_rate: 0, closure_trend: 0, fair_cost_gap: 0, inflation_pressure: 0, risk_score: 0, risk_level: 'low', off_framework_pct: 0, mitigation_options: [] })),
  chcRecoveryModel: vi.fn(() => ({ current_income: 0, target_income: 0, gap: 0, net_benefit: 0, implementation_cost: 0, timeline: [] })),
  highwayAssetTrajectory: vi.fn(() => ({ yearly: [], optimal_spend: 0, current_gap: 0, preventative_ratio: 0.4, managed_service_saving_pct: 0, condition_trends: [], dft_allocation: 0, cumulative_shortfall: 0, led: null, s59: null })),
  wasteDisposalComparison: vi.fn(() => ({ current_cost: 0, scenarios: [], food_waste_impact: 0, efw_saving: 0, landfill_tax_5yr: [], landfill_rate_pct: 0, national_avg_landfill_pct: 0, ratio_to_national: 0, market_hhi: 0, duopoly_pct: 0, strategy_status: '' })),
  quantifyDemandPressures: vi.fn(() => ({ pressures: [], total_annual: 0, total_5yr: 0, net_after_savings: 0, coverage_pct: 0 })),
  netFiscalTrajectory: vi.fn(() => ({ yearly: [], breakeven_year: 0, trajectory: 'stable', total_demand_5yr: 0, total_savings_5yr: 0, net_5yr: 0 })),
  spendingBudgetVariance: vi.fn(() => null),
  spendingConcentration: vi.fn(() => null),
  childrenCostProjection: vi.fn(() => ({ yearly: [], base_cost: 0, total_growth: 0, cost_breakdown: {} })),
  childrenServiceDirectives: vi.fn(() => []),
  publicHealthProjection: vi.fn(() => ({ yearly: [], prevention_roi_total: 0, monopoly_risk: 0, grant_trajectory: [] })),
  publicHealthDirectives: vi.fn(() => []),
  propertyEstateProjection: vi.fn(() => ({ yearly: [], maintenance_gap: 0, disposal_trajectory: [], co_location_savings: 0 })),
  resourcesServiceDirectives: vi.fn(() => []),
}))

vi.mock('../hooks/useSpendingSummary', () => ({
  useSpendingSummary: vi.fn(() => ({ summary: null, loading: false })),
}))

vi.mock('./PortfolioDetail.css', () => ({}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useAuth } from '../context/AuthContext'
import { useParams } from 'react-router-dom'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockConfig = {
  council_id: 'lancashire_cc',
  council_name: 'Lancashire',
  council_full_name: 'Lancashire County Council',
  data_sources: {
    cabinet_portfolios: true,
    executive_view: true,
    doge_investigation: true,
    budgets: true,
    meetings: true,
    politics: true,
    council_documents: true,
    integrity: true,
    procurement: true,
  },
}

const mockPortfolioData = {
  administration: { party: 'Reform UK', seats: 53, total: 84, majority_threshold: 43, control_since: '2025-05-01' },
  portfolios: [
    {
      id: 'adult_social_care',
      title: 'Adult Social Care',
      short_title: 'Adults',
      cabinet_member: { name: 'Graham Dalton', ward: 'Morecambe North', cabinet_role: 'Member' },
      executive_director: 'Louise Taylor',
      scrutiny_committee: { name: 'Health Scrutiny', id: 'health_scrutiny' },
      budget_categories: ['Adult Social Care'],
      spending_department_patterns: ['^Adult'],
      budget_latest: { year: '2024/25', net_expenditure: 420000000, gross_expenditure: 584500000 },
      statutory_duties: [
        { act: 'Care Act 2014', summary: 'Assess eligible needs', risk_level: 'red', risk: 'Cannot cut' },
        { act: 'Mental Health Act 1983', summary: 'Approved mental health professionals', risk_level: 'amber', risk: 'Must maintain AMHP service' },
        { act: 'Localism Act 2011', summary: 'General power of competence', risk_level: 'green', risk: 'Discretionary' },
      ],
      key_services: ['Residential care', 'Home care', 'Day services'],
      known_pressures: ['Ageing population', 'Provider market fragility'],
      savings_levers: [{ lever: 'Reablement', est_saving: '£3-5M', timeline: '6-12 months', risk: 'Low', description: 'Test' }],
      directors: ['Director of Adult Services'],
      lead_members: [{ name: 'Cllr Test Lead', area: 'Older People' }],
      champions: [{ name: 'Cllr Test Champion', area: 'Disability' }],
    },
  ],
  governance: {
    constitution: { key_decision_threshold: 500000 },
    decision_routes: [],
    officer_thresholds: [],
    political_arithmetic: { reform_seats: 53, total_seats: 84, majority_size: 10 },
  },
  senior_officers: {
    chief_executive: 'Mark Wynn',
    executive_directors: ['Louise Taylor', 'Jacqui Old'],
    s151_officer: "Noel O'Neill",
    monitoring_officer: 'Heloise MacAndrew',
  },
}

const mockFindings = {
  likely_duplicates: [],
  split_payment_evasion: [],
  ch_red_flags: [],
}

const mockBudgets = { revenue: {} }
const mockMeetings = { meetings: [] }
const mockDocuments = { decisions: [] }
const mockCouncillors = { councillors: [] }
const mockProcurement = { contracts: [] }
const mockIntegrity = {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderComponent() {
  return render(
    <MemoryRouter>
      <PortfolioDetail />
    </MemoryRouter>
  )
}

function setupMocks(overrides = {}) {
  useCouncilConfig.mockReturnValue(overrides.config || mockConfig)
  useAuth.mockReturnValue(overrides.auth || { isCouncillor: true, isCabinetLevel: true, role: 'cabinet_member', permissions: {} })
  useParams.mockReturnValue(overrides.params || { portfolioId: 'adult_social_care' })
  useData.mockReturnValue({
    data: [mockPortfolioData, mockFindings, mockBudgets, mockMeetings, mockDocuments, mockCouncillors, mockProcurement, mockIntegrity],
    loading: false,
    error: null,
    ...overrides.data,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PortfolioDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --- Not found ---

  it('shows not found for invalid portfolio ID', () => {
    setupMocks({ params: { portfolioId: 'nonexistent_portfolio' } })
    renderComponent()
    expect(screen.getByText('Portfolio Not Found')).toBeInTheDocument()
    expect(screen.getByText(/No portfolio with ID "nonexistent_portfolio"/)).toBeInTheDocument()
    expect(screen.getByText('← Back to Savings Dashboard')).toBeInTheDocument()
  })

  // --- Not available ---

  it('shows not available when cabinet_portfolios is false', () => {
    const noPortfoliosConfig = {
      ...mockConfig,
      data_sources: { ...mockConfig.data_sources, cabinet_portfolios: false },
    }
    setupMocks({ config: noPortfoliosConfig })
    renderComponent()
    expect(screen.getByText(/not available for this council/i)).toBeInTheDocument()
  })

  // --- Access denied ---

  it('shows access denied for non-councillor when Firebase is enabled', async () => {
    const firebaseMod = await import('../firebase')
    const originalValue = firebaseMod.isFirebaseEnabled
    Object.defineProperty(firebaseMod, 'isFirebaseEnabled', { value: true, writable: true })

    setupMocks({ auth: { isCouncillor: false, isCabinetLevel: false, role: 'viewer', permissions: {} } })
    renderComponent()
    expect(screen.getByText('Councillor Access Required')).toBeInTheDocument()

    Object.defineProperty(firebaseMod, 'isFirebaseEnabled', { value: originalValue, writable: true })
  })

  it('allows access when Firebase is not enabled (dev mode)', () => {
    setupMocks({ auth: { isCouncillor: false, isCabinetLevel: false, role: 'viewer', permissions: {} } })
    renderComponent()
    expect(screen.queryByText('Councillor Access Required')).not.toBeInTheDocument()
    expect(screen.getByText('Adult Social Care')).toBeInTheDocument()
  })

  // --- Loading state ---

  it('renders loading state', () => {
    setupMocks({ data: { data: null, loading: true, error: null } })
    renderComponent()
    expect(screen.getByText(/loading portfolio/i)).toBeInTheDocument()
  })

  // --- Error state ---

  it('renders error state', () => {
    setupMocks({ data: { data: null, loading: false, error: new Error('fail') } })
    renderComponent()
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByText('fail')).toBeInTheDocument()
  })

  // --- Overview tab (default) ---

  it('renders overview tab with people and services', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('People')).toBeInTheDocument()
    expect(screen.getByText('Cabinet Member')).toBeInTheDocument()
    expect(screen.getByText('Graham Dalton')).toBeInTheDocument()
    expect(screen.getByText('Executive Director')).toBeInTheDocument()
    expect(screen.getByText('Louise Taylor')).toBeInTheDocument()
  })

  it('shows key services on overview tab', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Key Services')).toBeInTheDocument()
    expect(screen.getByText('Residential care')).toBeInTheDocument()
    expect(screen.getByText('Home care')).toBeInTheDocument()
    expect(screen.getByText('Day services')).toBeInTheDocument()
  })

  it('shows scrutiny committee on overview tab', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Scrutiny')).toBeInTheDocument()
    expect(screen.getByText('Health Scrutiny')).toBeInTheDocument()
  })

  it('shows known pressures on overview tab', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Known Pressures')).toBeInTheDocument()
    expect(screen.getByText(/Ageing population/)).toBeInTheDocument()
    expect(screen.getByText(/Provider market fragility/)).toBeInTheDocument()
  })

  it('shows directors on overview tab', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Directors')).toBeInTheDocument()
    expect(screen.getByText('Director of Adult Services')).toBeInTheDocument()
  })

  it('shows lead members on overview tab', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Lead Member')).toBeInTheDocument()
    expect(screen.getByText(/Cllr Test Lead/)).toBeInTheDocument()
  })

  it('shows champions on overview tab', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Champion')).toBeInTheDocument()
    expect(screen.getByText(/Cllr Test Champion/)).toBeInTheDocument()
  })

  // --- Hero ---

  it('renders hero with portfolio title and cabinet member', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Adult Social Care')).toBeInTheDocument()
    expect(screen.getByText(/Graham Dalton — Morecambe North/)).toBeInTheDocument()
  })

  it('renders hero stats', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Net Budget')).toBeInTheDocument()
    expect(screen.getByText('Directives')).toBeInTheDocument()
    expect(screen.getByText('Savings Identified')).toBeInTheDocument()
    expect(screen.getByText('Do Now')).toBeInTheDocument()
  })

  it('renders back to cabinet link', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/Savings Dashboard/)).toBeInTheDocument()
  })

  // --- Tab navigation ---

  it('renders tab navigation', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Budget')).toBeInTheDocument()
    expect(screen.getByText('Spending')).toBeInTheDocument()
    expect(screen.getByText('Contracts')).toBeInTheDocument()
    expect(screen.getByText('Savings')).toBeInTheDocument()
    expect(screen.getByText('Decisions')).toBeInTheDocument()
    expect(screen.getByText('Legal & Political')).toBeInTheDocument()
  })

  it('shows playbook and operations tabs for cabinet level users', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Reform Playbook')).toBeInTheDocument()
    expect(screen.getByText('Operations')).toBeInTheDocument()
  })

  it('hides playbook and operations tabs for non-cabinet users when Firebase is enabled', async () => {
    const firebaseMod = await import('../firebase')
    const originalValue = firebaseMod.isFirebaseEnabled
    Object.defineProperty(firebaseMod, 'isFirebaseEnabled', { value: true, writable: true })

    setupMocks({ auth: { isCouncillor: true, isCabinetLevel: false, role: 'councillor', permissions: {} } })
    renderComponent()
    expect(screen.queryByText('Reform Playbook')).not.toBeInTheDocument()
    expect(screen.queryByText('Operations')).not.toBeInTheDocument()

    Object.defineProperty(firebaseMod, 'isFirebaseEnabled', { value: originalValue, writable: true })
  })

  // --- Legal tab ---

  it('shows statutory duties in legal tab', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Legal & Political'))
    expect(screen.getByText('Statutory Duties')).toBeInTheDocument()
    expect(screen.getByText('Care Act 2014')).toBeInTheDocument()
    expect(screen.getByText('Assess eligible needs')).toBeInTheDocument()
    expect(screen.getByText('Cannot cut')).toBeInTheDocument()
  })

  it('shows red/amber/green badges on statutory duties', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Legal & Political'))
    expect(screen.getByText('RED LINE')).toBeInTheDocument()
    expect(screen.getByText('AMBER ZONE')).toBeInTheDocument()
    expect(screen.getByText('GREEN SPACE')).toBeInTheDocument()
  })

  it('shows political context in legal tab', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Legal & Political'))
    expect(screen.getByText('Political Context')).toBeInTheDocument()
    expect(screen.getByText('Reform Majority')).toBeInTheDocument()
    expect(screen.getByText('LGR Deadline')).toBeInTheDocument()
    expect(screen.getByText('Next Elections')).toBeInTheDocument()
  })

  it('shows decision pathways in legal tab', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Legal & Political'))
    expect(screen.getByText('Decision Pathways')).toBeInTheDocument()
    expect(screen.getByText('Officer Delegation')).toBeInTheDocument()
    expect(screen.getByText('Cabinet Member Decision')).toBeInTheDocument()
    expect(screen.getByText('Cabinet')).toBeInTheDocument()
    expect(screen.getByText('Full Council')).toBeInTheDocument()
  })

  // --- Spending tab ---

  it('shows spending department patterns', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Spending'))
    expect(screen.getByText('Spending Department Patterns')).toBeInTheDocument()
    expect(screen.getByText('^Adult')).toBeInTheDocument()
  })

  it('shows DOGE findings for portfolio', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Spending'))
    expect(screen.getByText('DOGE Findings')).toBeInTheDocument()
    expect(screen.getByText('Likely Duplicates')).toBeInTheDocument()
    expect(screen.getByText('Split Payments')).toBeInTheDocument()
    expect(screen.getByText('CH Red Flags')).toBeInTheDocument()
    expect(screen.getByText('Round Numbers')).toBeInTheDocument()
  })

  // --- Savings tab ---

  it('shows savings directives', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Savings'))
    expect(screen.getByText('Action Directives')).toBeInTheDocument()
    expect(screen.getByText(/Renegotiate adult care contracts/)).toBeInTheDocument()
  })

  it('shows directive steps and evidence', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Savings'))
    expect(screen.getByText('Review existing contracts')).toBeInTheDocument()
    expect(screen.getByText('Issue new tenders')).toBeInTheDocument()
    expect(screen.getByText(/DOGE analysis identified duplicate payments/)).toBeInTheDocument()
  })

  // --- Playbook tab ---

  it('shows reform playbook for cabinet level users', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Reform Playbook'))
    expect(screen.getByText('Phased Delivery Plan')).toBeInTheDocument()
    expect(screen.getByText('Year 1 (2025/26)')).toBeInTheDocument()
  })

  it('shows red lines in playbook', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Reform Playbook'))
    expect(screen.getByText(/Red Lines/)).toBeInTheDocument()
    expect(screen.getByText('Care Act 2014')).toBeInTheDocument()
  })

  it('shows amber zones in playbook', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Reform Playbook'))
    expect(screen.getByText(/Amber Zones/)).toBeInTheDocument()
    expect(screen.getByText('Children Act 1989')).toBeInTheDocument()
  })

  it('shows green space in playbook', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Reform Playbook'))
    expect(screen.getByText(/Green Space/)).toBeInTheDocument()
    expect(screen.getByText('Localism Act 2011')).toBeInTheDocument()
  })

  it('shows FOI generation in playbook', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Reform Playbook'))
    expect(screen.getByText('Generate FOI Requests')).toBeInTheDocument()
    expect(screen.getByText('FOI Request: Adult Care Contracts')).toBeInTheDocument()
  })

  it('shows total savings pipeline in playbook', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Reform Playbook'))
    expect(screen.getByText('Total Savings Pipeline')).toBeInTheDocument()
  })

  // --- Budget tab ---

  it('shows budget stats on budget tab', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Budget'))
    expect(screen.getByText('Gross Expenditure')).toBeInTheDocument()
    expect(screen.getByText('Net Expenditure')).toBeInTheDocument()
  })

  it('shows budget categories on budget tab', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Budget'))
    expect(screen.getByText('Budget Categories (SeRCOP)')).toBeInTheDocument()
    // 'Adult Social Care' appears in hero title + budget category tag
    const asc = screen.getAllByText('Adult Social Care')
    expect(asc.length).toBeGreaterThanOrEqual(2)
  })

  // --- Decisions tab ---

  it('shows upcoming meetings on decisions tab', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Decisions'))
    expect(screen.getByText('Upcoming Meetings')).toBeInTheDocument()
  })

  // --- Operations tab ---

  it('shows operations tab for cabinet level users', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Operations'))
    expect(screen.getByText('Known Pressures')).toBeInTheDocument()
    expect(screen.getByText('Cross-Portfolio Dependencies')).toBeInTheDocument()
  })

  // --- Null data handling ---

  it('handles null portfolio data gracefully', () => {
    setupMocks({ data: { data: Array(8).fill(null), loading: false, error: null } })
    renderComponent()
    expect(screen.getByText('Portfolio Not Found')).toBeInTheDocument()
  })
})
