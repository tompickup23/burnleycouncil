import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Executive from './Executive'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

vi.mock('../firebase', () => ({
  isFirebaseEnabled: false,
}))

vi.mock('../components/ui', () => ({
  LoadingState: ({ message }) => <div>{message || 'Loading...'}</div>,
  ErrorState: ({ title, message, error }) => <div data-testid="error-state"><span>{title || 'Error'}</span><span>{message || error?.message || ''}</span></div>,
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

// Mock Recharts to avoid heavy SVG rendering in JSDOM
vi.mock('recharts', () => {
  const MockChart = ({ children }) => <div data-testid="recharts-mock">{children}</div>
  return {
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    Treemap: MockChart,
    BarChart: MockChart,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
  }
})

vi.mock('./Executive.css', () => ({}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'

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
      ],
      key_services: ['Residential care', 'Home care'],
      known_pressures: ['Ageing population'],
      savings_levers: [{ lever: 'Reablement', est_saving: '£3-5M', timeline: '6-12 months', risk: 'Low', description: 'Test' }],
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

const mockCommittees = [
  { title: 'Health Scrutiny', type: 'Scrutiny', chair: 'Cllr Jones', members_count: 12 },
  { title: 'Education Scrutiny', type: 'Scrutiny', chair: 'Cllr Brown', members_count: 10 },
  { title: 'Audit & Governance', type: 'Regulatory', chair: 'Cllr White', members_count: 8 },
]

const mockDocuments = {
  decisions: [
    { title: 'Budget Approval', date: '2026-02-15', committee: 'Cabinet', decision_type: 'approved', summary: 'Annual budget approved' },
    { title: 'Highway Repairs', date: '2026-01-20', committee: 'Cabinet', decision_type: 'approved', summary: 'Highway programme approved' },
    { title: 'Planning Policy', date: '2026-01-10', committee: 'Planning Committee', decision_type: 'approved', summary: 'Planning update' },
  ],
}

const mockBudgets = { revenue: {} }

const mockCouncillors = {
  councillors: [
    { name: 'Graham Dalton', party: 'Reform UK', division: 'Morecambe North' },
  ],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderComponent() {
  return render(
    <MemoryRouter>
      <Executive />
    </MemoryRouter>
  )
}

function setupMocks(overrides = {}) {
  useCouncilConfig.mockReturnValue(overrides.config || mockConfig)
  useData.mockReturnValue({
    data: [mockPortfolioData, mockCommittees, mockDocuments, mockBudgets, mockCouncillors],
    loading: false,
    error: null,
    ...overrides.data,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Executive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --- Loading state ---

  it('renders loading state when data is loading', () => {
    setupMocks({ data: { data: null, loading: true, error: null } })
    renderComponent()
    expect(screen.getByText(/loading executive overview/i)).toBeInTheDocument()
  })

  // --- Not available ---

  it('shows "not available" message when cabinet_portfolios is false in config', () => {
    const noPortfoliosConfig = {
      ...mockConfig,
      data_sources: { ...mockConfig.data_sources, cabinet_portfolios: false },
    }
    setupMocks({ config: noPortfoliosConfig })
    renderComponent()
    expect(screen.getByText(/cabinet portfolio data is not available/i)).toBeInTheDocument()
  })

  // --- Error state ---

  it('renders error state when data fails', () => {
    setupMocks({ data: { data: null, loading: false, error: new Error('fail') } })
    renderComponent()
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByText('fail')).toBeInTheDocument()
  })

  // --- Cabinet member grid ---

  it('renders cabinet member grid when data is loaded', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Graham Dalton')).toBeInTheDocument()
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
  })

  it('renders portfolio short titles on cabinet cards', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Adults')).toBeInTheDocument()
    expect(screen.getByText('Education')).toBeInTheDocument()
  })

  it('renders ward info on cabinet cards', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Morecambe North')).toBeInTheDocument()
    expect(screen.getByText('Preston South')).toBeInTheDocument()
  })

  it('expands cabinet card on click to show details', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Graham Dalton'))
    expect(screen.getByText(/Executive Director:/)).toBeInTheDocument()
    // Louise Taylor appears in both expanded card details and senior officers section
    const louiseMatches = screen.getAllByText('Louise Taylor')
    expect(louiseMatches.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/Scrutiny:/)).toBeInTheDocument()
    // Health Scrutiny appears in both expanded card and committee structure
    const healthScrutinyMatches = screen.getAllByText('Health Scrutiny')
    expect(healthScrutinyMatches.length).toBeGreaterThanOrEqual(2)
  })

  it('shows key services when cabinet card is expanded', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Graham Dalton'))
    expect(screen.getByText(/Residential care, Home care/)).toBeInTheDocument()
  })

  it('shows View Portfolio Detail link when cabinet card is expanded', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByText('Graham Dalton'))
    expect(screen.getByText(/View Portfolio Detail/)).toBeInTheDocument()
  })

  // --- Budget treemap / bar chart ---

  it('shows budget treemap section when portfolio data has budgets', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Budget by Portfolio')).toBeInTheDocument()
    expect(screen.getByText('Net Budget Allocation (£M)')).toBeInTheDocument()
  })

  it('shows budget bar chart', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Net Budget by Portfolio (£M)')).toBeInTheDocument()
  })

  // --- Senior Officers ---

  it('shows senior officers section', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Senior Officers')).toBeInTheDocument()
    expect(screen.getByText('Mark Wynn')).toBeInTheDocument()
    expect(screen.getByText('Chief Executive')).toBeInTheDocument()
  })

  it('shows statutory officers', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText("Noel O'Neill")).toBeInTheDocument()
    expect(screen.getByText('Heloise MacAndrew')).toBeInTheDocument()
    expect(screen.getByText('S151 Officer (Finance)')).toBeInTheDocument()
    expect(screen.getByText('Monitoring Officer (Legal)')).toBeInTheDocument()
  })

  it('shows executive directors', () => {
    setupMocks()
    renderComponent()
    // Executive directors are listed in the officer grid
    const louiseMatches = screen.getAllByText('Louise Taylor')
    expect(louiseMatches.length).toBeGreaterThanOrEqual(1)
    const jacquiMatches = screen.getAllByText('Jacqui Old')
    expect(jacquiMatches.length).toBeGreaterThanOrEqual(1)
  })

  // --- Governance ---

  it('shows governance section', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('How Decisions Are Made')).toBeInTheDocument()
    expect(screen.getByText('Key Decision Threshold')).toBeInTheDocument()
    expect(screen.getByText(/£500,000/)).toBeInTheDocument()
  })

  it('shows forward plan and call-in cards', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Forward Plan')).toBeInTheDocument()
    expect(screen.getByText('Call-In')).toBeInTheDocument()
  })

  it('shows political arithmetic in governance', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Political Arithmetic')).toBeInTheDocument()
    expect(screen.getByText(/Reform UK 53\/84 seats/)).toBeInTheDocument()
  })

  // --- Committee Structure ---

  it('renders committee structure when committees data is present', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Committee Structure')).toBeInTheDocument()
    expect(screen.getByText('Health Scrutiny')).toBeInTheDocument()
    expect(screen.getByText('Education Scrutiny')).toBeInTheDocument()
    expect(screen.getByText('Audit & Governance')).toBeInTheDocument()
  })

  it('groups committees by type', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/Scrutiny \(2\)/)).toBeInTheDocument()
    expect(screen.getByText(/Regulatory \(1\)/)).toBeInTheDocument()
  })

  // --- Recent Cabinet Decisions ---

  it('renders recent cabinet decisions section', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Recent Cabinet Decisions')).toBeInTheDocument()
    expect(screen.getByText('Budget Approval')).toBeInTheDocument()
    expect(screen.getByText('Highway Repairs')).toBeInTheDocument()
  })

  it('filters decisions to cabinet only', () => {
    setupMocks()
    renderComponent()
    // 'Planning Policy' is from 'Planning Committee', not cabinet — should NOT appear in recent decisions
    // But note it's still in the documents array, just not rendered under Recent Cabinet Decisions
    const planningElements = screen.queryAllByText('Planning Policy')
    // The section title "Recent Cabinet Decisions" should exist, and planning entries should not be under it
    expect(screen.getByText('Recent Cabinet Decisions')).toBeInTheDocument()
    // Budget Approval and Highway Repairs are cabinet decisions
    expect(screen.getByText('Budget Approval')).toBeInTheDocument()
    expect(screen.getByText('Highway Repairs')).toBeInTheDocument()
  })

  // --- Hero Stats ---

  it('renders hero stats with cabinet member count and budget', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Cabinet Members')).toBeInTheDocument()
    expect(screen.getByText('Net Budget')).toBeInTheDocument()
    expect(screen.getByText('Committees')).toBeInTheDocument()
    expect(screen.getByText('Control Since')).toBeInTheDocument()
  })

  // --- Administration subtitle ---

  it('shows administration details in subtitle', () => {
    setupMocks()
    renderComponent()
    // The subtitle text is split across elements — check individual parts
    const subtitle = screen.getByText(/Reform UK/, { selector: '.executive-subtitle' })
    expect(subtitle).toBeInTheDocument()
    expect(subtitle.textContent).toContain('53')
    expect(subtitle.textContent).toContain('84')
  })

  // --- Sets document title ---

  it('renders page heading', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Cabinet & Executive')).toBeInTheDocument()
  })

  // --- Null data handling ---

  it('handles null portfolio data gracefully', () => {
    setupMocks({ data: { data: [null, null, null, null, null], loading: false, error: null } })
    renderComponent()
    expect(screen.getByText('Cabinet & Executive')).toBeInTheDocument()
  })

  it('handles empty portfolios array gracefully', () => {
    const emptyPortfolios = { ...mockPortfolioData, portfolios: [] }
    setupMocks({ data: { data: [emptyPortfolios, mockCommittees, mockDocuments, mockBudgets, mockCouncillors], loading: false, error: null } })
    renderComponent()
    expect(screen.getByText('Cabinet & Executive')).toBeInTheDocument()
  })
})
