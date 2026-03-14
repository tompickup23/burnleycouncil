import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CabinetDashboard from './CabinetDashboard'

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

vi.mock('../components/ui', () => ({
  LoadingState: ({ message }) => <div>{message || 'Loading...'}</div>,
}))

vi.mock('../components/ui/StatCard', () => ({
  StatCard: ({ label, value }) => <div data-testid="stat-card"><span>{label}</span><span>{value}</span></div>,
}))

vi.mock('../components/ui/ChartCard', () => ({
  ChartCard: ({ title, children }) => <div data-testid="chart-card"><span>{title}</span>{children}</div>,
  CHART_TOOLTIP_STYLE: {},
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
    PieChart: MockChart,
    Pie: () => null,
    Cell: () => null,
    Legend: () => null,
    ScatterChart: MockChart,
    Scatter: () => null,
    ZAxis: () => null,
  }
})

// Mock savingsEngine — we test the real engine separately
vi.mock('../utils/savingsEngine', () => ({
  aggregateSavings: vi.fn(() => ({
    total_identified: 15000000,
    by_timeline: { immediate: 3000000, short_term: 5000000, medium_term: 4000000, long_term: 3000000 },
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
    },
    {
      id: 'd2',
      action: 'Consolidate back-office support',
      type: 'efficiency',
      save_low: 500000,
      save_central: 800000,
      save_high: 1200000,
      timeline: '6-12 months',
      risk: 'Low',
      legal_basis: 'Best Value Duty',
      governance_route: 'officer_delegation',
      portfolio_id: 'education',
      priority: 'medium',
      feasibility: 7,
      impact: 5,
    },
  ]),
  matchSpendingToPortfolio: vi.fn(() => []),
  decisionPipeline: vi.fn(() => []),
  priorityMatrix: vi.fn(() => ({
    do_now: [
      {
        id: 'd1',
        action: 'Renegotiate adult care contracts',
        save_central: 3000000,
        save_low: 2000000,
        save_high: 4000000,
        timeline: '3-6 months',
        risk: 'Medium',
        legal_basis: 'Public Contracts Regulations 2015',
        governance_route: 'cabinet_member_decision',
        portfolio_id: 'adult_social_care',
      },
    ],
    plan_next: [],
    delegate: [],
    deprioritise: [],
  })),
  formatCurrency: vi.fn((v) => {
    if (!v && v !== 0) return '£0'
    const m = Math.round(v / 1000000)
    return m >= 1 ? `£${m}M` : `£${Math.round(v / 1000).toLocaleString()}K`
  }),
  getAccessiblePortfolios: vi.fn((portfolios) => portfolios),
  buildImplementationCalendar: vi.fn(() => []),
}))

vi.mock('./CabinetDashboard.css', () => ({}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useAuth } from '../context/AuthContext'

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
      key_services: ['Residential care', 'Home care'],
      known_pressures: ['Ageing population'],
      directors: ['Director of Adult Services'],
      lead_members: [],
      champions: [],
    },
    {
      id: 'education',
      title: 'Education & Children',
      short_title: 'Education',
      cabinet_member: { name: 'Jane Smith', ward: 'Preston South', cabinet_role: 'Member' },
      executive_director: 'Jacqui Old',
      scrutiny_committee: { name: 'Education Scrutiny', id: 'education_scrutiny' },
      budget_categories: ['Education'],
      spending_department_patterns: ['^Education', '^Schools'],
      budget_latest: { year: '2024/25', net_expenditure: 150000000, gross_expenditure: 280000000 },
      key_services: ['Schools', 'SEND'],
      known_pressures: ['SEND demand'],
      directors: ['Director of Education'],
      lead_members: [],
      champions: [],
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
  likely_duplicates: [{ supplier: 'Test Supplier', total_value: 50000, count: 3 }],
  split_payment_evasion: [],
  ch_red_flags: [],
}

const mockBudgets = { revenue: {} }

const mockMeetings = {
  meetings: [
    { title: 'Cabinet', committee: 'Cabinet', date: '2026-04-15', time: '10:00', venue: 'County Hall' },
  ],
}

const mockDocuments = { decisions: [] }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderComponent() {
  return render(
    <MemoryRouter>
      <CabinetDashboard />
    </MemoryRouter>
  )
}

function setupMocks(overrides = {}) {
  useCouncilConfig.mockReturnValue(overrides.config || mockConfig)
  useAuth.mockReturnValue(overrides.auth || { isCouncillor: true, isCabinetLevel: true, role: 'cabinet_member', permissions: {} })
  useData.mockReturnValue({
    data: [mockPortfolioData, mockFindings, mockBudgets, mockMeetings, mockDocuments],
    loading: false,
    error: null,
    ...overrides.data,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CabinetDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --- Access denied ---

  it('shows access denied when user is not councillor and Firebase is enabled', async () => {
    const firebaseMod = await import('../firebase')
    const originalValue = firebaseMod.isFirebaseEnabled
    Object.defineProperty(firebaseMod, 'isFirebaseEnabled', { value: true, writable: true })

    setupMocks({ auth: { isCouncillor: false, isCabinetLevel: false, role: 'viewer', permissions: {} } })
    renderComponent()
    expect(screen.getByText('Councillor Access Required')).toBeInTheDocument()
    expect(screen.getByText(/councillor access or above/i)).toBeInTheDocument()

    Object.defineProperty(firebaseMod, 'isFirebaseEnabled', { value: originalValue, writable: true })
  })

  it('allows access when Firebase is not enabled (dev mode)', () => {
    setupMocks({ auth: { isCouncillor: false, isCabinetLevel: false, role: 'viewer', permissions: {} } })
    renderComponent()
    // Should NOT show access denied — isFirebaseEnabled is false
    expect(screen.queryByText('Councillor Access Required')).not.toBeInTheDocument()
    expect(screen.getByText('Cabinet Dashboard')).toBeInTheDocument()
  })

  // --- Not available ---

  it('shows "not available" for non-LCC councils without cabinet_portfolios', () => {
    const noPortfoliosConfig = {
      ...mockConfig,
      council_id: 'burnley',
      data_sources: { ...mockConfig.data_sources, cabinet_portfolios: false },
    }
    setupMocks({ config: noPortfoliosConfig })
    renderComponent()
    expect(screen.getByText(/not available for this council/i)).toBeInTheDocument()
  })

  // --- Loading state ---

  it('renders loading state', () => {
    setupMocks({ data: { data: null, loading: true, error: null } })
    renderComponent()
    expect(screen.getByText(/loading cabinet data/i)).toBeInTheDocument()
  })

  // --- Error state ---

  it('renders error state', () => {
    setupMocks({ data: { data: null, loading: false, error: new Error('fail') } })
    renderComponent()
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByText('fail')).toBeInTheDocument()
  })

  // --- Operations tab (default) ---

  it('renders operations tab with directives', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/Monday Morning List/)).toBeInTheDocument()
    expect(screen.getByText(/Renegotiate adult care contracts/)).toBeInTheDocument()
  })

  it('shows savings statistics in hero stats', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Total Savings Identified')).toBeInTheDocument()
    expect(screen.getByText('Action Directives')).toBeInTheDocument()
    expect(screen.getByText('Do Now')).toBeInTheDocument()
    // 'Portfolios' appears both as stat label and tab button — use getAllByText
    const portfoliosMatches = screen.getAllByText('Portfolios')
    expect(portfoliosMatches.length).toBeGreaterThanOrEqual(2)
  })

  it('shows savings timeline', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Savings Timeline')).toBeInTheDocument()
    expect(screen.getByText(/Immediate \(0-3m\)/)).toBeInTheDocument()
    expect(screen.getByText(/Short-term \(3-12m\)/)).toBeInTheDocument()
    expect(screen.getByText(/Medium-term \(12-24m\)/)).toBeInTheDocument()
    expect(screen.getByText(/Long-term \(24m\+\)/)).toBeInTheDocument()
  })

  it('shows directive details with save range, risk, and route', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/SAVE:/)).toBeInTheDocument()
    expect(screen.getByText(/LEGAL:/)).toBeInTheDocument()
    expect(screen.getByText(/ROUTE:/)).toBeInTheDocument()
  })

  // --- Tab switching ---

  it('tab switching works — switches to portfolios tab', () => {
    setupMocks()
    renderComponent()
    // 'Portfolios' appears as both stat label and tab button — click the tab button
    const tabButtons = screen.getAllByText('Portfolios')
    const tabButton = tabButtons.find(el => el.closest('.cabinet-tab'))
    fireEvent.click(tabButton)
    // Portfolios tab should show portfolio cards
    expect(screen.getByText('Adults')).toBeInTheDocument()
    expect(screen.getByText('Education')).toBeInTheDocument()
  })

  it('tab switching works — switches to decisions tab', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Decisions'))
    expect(screen.getByText('Upcoming Meetings')).toBeInTheDocument()
  })

  it('tab switching works — switches to budget tab', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Budget'))
    expect(screen.getByText('Portfolio Budgets (£M)')).toBeInTheDocument()
  })

  // --- Portfolios tab ---

  it('shows portfolio cards on portfolios tab', () => {
    setupMocks()
    renderComponent()
    const tabButtons = screen.getAllByText('Portfolios')
    const tabButton = tabButtons.find(el => el.closest('.cabinet-tab'))
    fireEvent.click(tabButton)
    expect(screen.getByText('Graham Dalton')).toBeInTheDocument()
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
  })

  it('portfolio cards show key services', () => {
    setupMocks()
    renderComponent()
    const tabButtons = screen.getAllByText('Portfolios')
    const tabButton = tabButtons.find(el => el.closest('.cabinet-tab'))
    fireEvent.click(tabButton)
    expect(screen.getByText(/Residential care/)).toBeInTheDocument()
    expect(screen.getByText(/Schools/)).toBeInTheDocument()
  })

  // --- Hero ---

  it('shows administration info in subtitle', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/Reform Operations Centre/)).toBeInTheDocument()
    expect(screen.getByText(/Reform UK 53\/84/)).toBeInTheDocument()
  })

  // --- Null data handling ---

  it('handles null portfolio data gracefully', () => {
    setupMocks({ data: { data: [null, null, null, null, null], loading: false, error: null } })
    renderComponent()
    expect(screen.getByText('Cabinet Dashboard')).toBeInTheDocument()
  })

  it('handles empty portfolios array gracefully', () => {
    const emptyPortfolios = { ...mockPortfolioData, portfolios: [] }
    setupMocks({ data: { data: [emptyPortfolios, mockFindings, mockBudgets, mockMeetings, mockDocuments], loading: false, error: null } })
    renderComponent()
    expect(screen.getByText('Cabinet Dashboard')).toBeInTheDocument()
  })

  it('shows empty message when no high-priority directives exist', async () => {
    const savingsEngine = await import('../utils/savingsEngine')
    savingsEngine.priorityMatrix.mockReturnValue({ do_now: [], plan_next: [], delegate: [], deprioritise: [] })
    savingsEngine.generateDirectives.mockReturnValue([])

    setupMocks()
    renderComponent()
    expect(screen.getByText(/no high-priority directives/i)).toBeInTheDocument()
  })
})
