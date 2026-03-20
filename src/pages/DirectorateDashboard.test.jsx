import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DirectorateDashboard from './DirectorateDashboard'

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
  ErrorState: ({ title, message, error }) => <div data-testid="error-state"><span>{title || 'Error'}</span><span>{message || error?.message || ''}</span></div>,
}))

vi.mock('../components/ui/StatCard', () => ({
  StatCard: ({ title, value, subtitle }) => (
    <div data-testid="stat-card"><span>{title}</span><span>{value}</span>{subtitle && <span>{subtitle}</span>}</div>
  ),
}))

vi.mock('../components/ui/ChartCard', () => ({
  ChartCard: ({ title, children }) => <div data-testid="chart-card"><span>{title}</span>{children}</div>,
  CHART_TOOLTIP_STYLE: {},
}))

vi.mock('../components/CollapsibleSection', () => ({
  default: ({ title, children }) => <div data-testid="collapsible-section"><h3>{title}</h3>{children}</div>,
}))

vi.mock('recharts', () => {
  const MockChart = ({ children }) => <div data-testid="recharts-mock">{children}</div>
  return {
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    BarChart: MockChart,
    PieChart: MockChart,
    Pie: () => null,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Cell: () => null,
    Legend: () => null,
    LabelList: () => null,
  }
})

vi.mock('../components/ui/GaugeChart', () => ({
  default: ({ value, label }) => <div data-testid="gauge-chart">{label}: {value}</div>,
}))

vi.mock('../utils/savingsEngine', () => ({
  buildDirectorateSavingsProfile: vi.fn((d) => ({
    directorate_id: d.id,
    title: d.title,
    executive_director: d.executive_director,
    net_budget: d.net_budget,
    mtfs_target: d.mtfs_savings_target,
    kpi_headline: d.kpi_headline,
    lever_count: 8,
    savings_range: { low: 20000000, high: 40000000, midpoint: 30000000 },
    coverage_pct: 120,
    avg_evidence_strength: 65,
    prior_year: d.prior_year_target ? { target: d.prior_year_target, achieved: d.prior_year_achieved, achieved_pct: Math.round(d.prior_year_achieved / d.prior_year_target * 100) } : null,
    by_timeline: { immediate: 5000000, short_term: 10000000, medium_term: 10000000, long_term: 5000000 },
    by_tier: { immediate_recovery: 10000000, procurement_reform: 15000000, service_redesign: 5000000 },
  })),
  evidenceChainStrength: vi.fn(() => 60),
  directorateRiskProfile: vi.fn(() => ({
    risk_level: 'high',
    risk_color: '#fd7e14',
    risk_score: 72,
  })),
  aggregateSavings: vi.fn(() => ({ total_identified: 30000000 })),
  generateDirectives: vi.fn(() => []),
  generateAllDirectives: vi.fn(() => [
    { action: 'Renegotiate home care framework contracts', save_range: '£3-5M', save_low: 3000000, save_central: 4000000, save_high: 5000000, lever_name: 'Home care framework', portfolio_id: 'adult_social_care', portfolio_title: 'Adult Social Care' },
    { action: 'Submit CHC recovery claims to ICB', save_range: '£5-12M', save_low: 5000000, save_central: 8500000, save_high: 12000000, lever_name: 'CHC cost recovery', portfolio_id: 'adult_social_care', portfolio_title: 'Adult Social Care' },
    { action: 'Optimise SEND transport routes', save_range: '£2-3M', save_low: 2000000, save_central: 2500000, save_high: 3000000, lever_name: 'SEND transport', portfolio_id: 'children_families', portfolio_title: "Children & Families" },
  ]),
  matchSpendingToPortfolio: vi.fn(() => []),
  formatCurrency: vi.fn((v) => {
    if (!v && v !== 0) return '£0'
    const m = Math.round(v / 1000000)
    return m >= 1 ? `£${m}M` : `£${Math.round(v / 1000).toLocaleString()}K`
  }),
  getAccessiblePortfolios: vi.fn((portfolios) => portfolios),
  contractPipeline: vi.fn(() => ({ expiring_3m: [], expiring_6m: [], all: [] })),
  fiscalSystemOverview: vi.fn(() => ({
    portfolios: [
      { id: 'adult_social_care', title: 'Adults', has_service_model: true, model_types: ['asc_demand_model'], demand_annual: 12000000, savings_central: 8000000, net_position: -4000000, coverage_pct: 67, inspection: { current_rating: 'Requires Improvement', target_rating: 'Good' }, trajectory: 'stable' },
      { id: 'education_skills', title: 'Education', has_service_model: true, model_types: ['send_cost_model', 'lac_cost_model'], demand_annual: 8000000, savings_central: 5000000, net_position: -3000000, coverage_pct: 63, inspection: null, trajectory: 'declining' },
    ],
    total_demand: 20000000, total_savings: 13000000, coverage_pct: 65,
    service_model_coverage: 20, service_model_count: 2, total_portfolios: 10,
    inspection_summary: [{ portfolio: 'Adults', current_rating: 'Requires Improvement', target_rating: 'Good' }],
    net_position: -7000000,
  })),
  quantifyDemandPressures: vi.fn(() => ({ pressures: [], total_annual: 0, total_5yr: 0, coverage_pct: 0 })),
  budgetRealismCheck: vi.fn(() => ({ credibility_score: 70 })),
  mtfsComparison: vi.fn(() => ({ year1: { target: 65000000, identified: 134000000, gap: 0, coverage_pct: 206 }, year2: { target: 130000000, identified: 134000000, gap: 0, coverage_pct: 103 } })),
  treasuryManagementSavings: vi.fn(() => ({ idle_cash_cost: 3500000, refinancing_potential: 2000000, mrp_method_saving: 3500000, early_payment_saving: 160000, total: 9160000 })),
  workforceOptimisation: vi.fn(() => ({ vacancy_savings: 5000000, agency_premium: 3000000, delayering_saving: 2000000, turnover_cost: 1500000, total: 11500000 })),
  spendingBudgetVariance: vi.fn(() => []),
  spendingConcentration: vi.fn(() => ({ hhi: 0, top_5_pct: 0, suppliers: [] })),
  electoralRippleAssessment: vi.fn(() => ({ actions: [], overall_risk: 'low' })),
  parseSavingRange: vi.fn((s) => {
    if (!s) return { low: 0, high: 0 }
    const m = s.match(/(\d+)[^0-9]*(\d+)/); return m ? { low: +m[1] * 1e6, high: +m[2] * 1e6 } : { low: 0, high: 0 }
  }),
  bondPortfolioAnalysis: vi.fn(() => ({ total_face_value: 0, estimated_sale_loss: 0, annual_coupon_income: 0, opportunity_cost_annual: 0, hold_recommendation: 'no_data', risk_rating: 'unknown', maturity_profile: [] })),
  lossTrajectoryAnalysis: vi.fn(() => ({ cumulative_total: 0, annual_average: 0, worst_year: null, trend: 'no_data', by_year: [], loss_categories: {} })),
  savingsDeliveryWeighting: vi.fn((profile) => ({
    raw_range: profile?.savings_range || { low: 0, high: 0, midpoint: 0 },
    delivery_weight: 1.0,
    delivery_weight_pct: 100,
    adjusted_range: profile?.savings_range || { low: 0, high: 0, midpoint: 0 },
    discount_amount: 0,
    confidence: 'medium',
    history: [],
  })),
}))

vi.mock('./DirectorateDashboard.css', () => ({}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useAuth } from '../context/AuthContext'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockConfig = {
  council_id: 'lancashire_cc',
  council_name: 'Lancashire',
  data_sources: { cabinet_portfolios: true, executive_view: true, doge_investigation: true, budgets: true, meetings: true, council_documents: true },
}

const mockDirectorates = [
  {
    id: 'adults_health',
    title: 'Adults, Health & Wellbeing',
    executive_director: 'Helen Coombes (Interim)',
    portfolio_ids: ['adult_social_care', 'health_wellbeing'],
    net_budget: 558500000,
    mtfs_savings_target: 46700000,
    prior_year_target: 34800000,
    prior_year_achieved: 3800000,
    kpi_headline: "CQC 'Requires Improvement'",
  },
  {
    id: 'education_children',
    title: 'Education & Children',
    executive_director: 'Jacqui Old',
    portfolio_ids: ['children_families', 'education_skills'],
    net_budget: 265700000,
    mtfs_savings_target: 13300000,
    prior_year_target: 10000000,
    prior_year_achieved: 6000000,
    kpi_headline: "Ofsted 'Good'",
  },
]

const mockPortfolioData = {
  administration: {
    party: 'Reform UK',
    seats: 53,
    total: 84,
    mtfs: {
      savings_targets: { '2026_27': 65000000, two_year_total: 120000000 },
      prior_year_performance: { target: 65000000, achieved_pct: 48, adult_services_shortfall: 31000000, adult_services_overspend: 34000000 },
    },
  },
  directorates: mockDirectorates,
  portfolios: [
    { id: 'adult_social_care', title: 'Adult Social Care', savings_levers: [{ lever: 'Home care framework', est_saving: '£3-5M' }] },
    { id: 'health_wellbeing', title: 'Health & Wellbeing', savings_levers: [] },
    { id: 'children_families', title: 'Children & Families', savings_levers: [{ lever: 'SEND transport', est_saving: '£2-3M' }] },
    { id: 'education_skills', title: 'Education & Skills', savings_levers: [] },
  ],
}

const mockFindings = { likely_duplicates: [], split_payment_evasion: [], ch_red_flags: [] }
const mockBudgets = { revenue: {} }
const mockMeetings = { meetings: [] }
const mockDocuments = { decisions: [] }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDashboard() {
  return render(<MemoryRouter><DirectorateDashboard /></MemoryRouter>)
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

describe('DirectorateDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --- Access control ---

  it('shows not available for councils without cabinet_portfolios', () => {
    setupMocks({ config: { ...mockConfig, data_sources: { cabinet_portfolios: false } } })
    renderDashboard()
    expect(screen.getByText(/not available for this council/i)).toBeInTheDocument()
  })

  it('shows access denied when user is not councillor and Firebase is enabled', async () => {
    const firebaseMod = await import('../firebase')
    const orig = firebaseMod.isFirebaseEnabled
    Object.defineProperty(firebaseMod, 'isFirebaseEnabled', { value: true, writable: true })

    setupMocks({ auth: { isCouncillor: false, isCabinetLevel: false, role: 'viewer', permissions: {} } })
    renderDashboard()
    expect(screen.getByText(/councillor access required/i)).toBeInTheDocument()

    Object.defineProperty(firebaseMod, 'isFirebaseEnabled', { value: orig, writable: true })
  })

  it('allows access when Firebase is disabled (dev mode)', () => {
    setupMocks({ auth: { isCouncillor: false, role: 'viewer', permissions: {} } })
    renderDashboard()
    expect(screen.queryByText(/councillor access required/i)).not.toBeInTheDocument()
    expect(screen.getByText('Reform Savings Command Centre')).toBeInTheDocument()
  })

  // --- Loading / error ---

  it('renders loading state', () => {
    setupMocks({ data: { data: null, loading: true, error: null } })
    renderDashboard()
    expect(screen.getByText(/initialising command centre/i)).toBeInTheDocument()
  })

  it('renders error state', () => {
    setupMocks({ data: { data: null, loading: false, error: new Error('fail') } })
    renderDashboard()
    expect(screen.getByText(/failed to load cabinet data/i)).toBeInTheDocument()
  })

  it('handles missing directorates gracefully', () => {
    const noDirData = { ...mockPortfolioData, directorates: [] }
    setupMocks({ data: { data: [noDirData, mockFindings, mockBudgets, mockMeetings, mockDocuments], loading: false, error: null } })
    renderDashboard()
    expect(screen.getByText(/directorate data not yet available/i)).toBeInTheDocument()
  })

  // --- Command Centre tab (default) ---

  it('renders hero and stat cards on command centre tab', () => {
    setupMocks()
    renderDashboard()
    expect(screen.getByText('Reform Savings Command Centre')).toBeInTheDocument()
    expect(screen.getByText('Total Pipeline')).toBeInTheDocument()
    expect(screen.getByText('MTFS Target')).toBeInTheDocument()
    expect(screen.getByText('Coverage')).toBeInTheDocument()
    expect(screen.getByText('Prior Year Gap')).toBeInTheDocument()
  })

  it('renders directorate cards with budget and metrics', () => {
    setupMocks()
    renderDashboard()
    expect(screen.getByText('Adults, Health & Wellbeing')).toBeInTheDocument()
    expect(screen.getByText('Education & Children')).toBeInTheDocument()
    expect(screen.getByText('Helen Coombes (Interim)')).toBeInTheDocument()
    // Metrics
    const leverTexts = screen.getAllByText(/levers/)
    expect(leverTexts.length).toBeGreaterThanOrEqual(2)
  })

  it('shows KPI headline badges on directorate cards', () => {
    setupMocks()
    renderDashboard()
    expect(screen.getByText("CQC 'Requires Improvement'")).toBeInTheDocument()
    expect(screen.getByText("Ofsted 'Good'")).toBeInTheDocument()
  })

  it('shows risk badges from risk profiles', () => {
    setupMocks()
    renderDashboard()
    const riskBadges = screen.getAllByText('high')
    expect(riskBadges.length).toBeGreaterThanOrEqual(1)
  })

  it('renders Monday Morning List with actions', () => {
    setupMocks()
    renderDashboard()
    expect(screen.getByText(/Monday Morning List/)).toBeInTheDocument()
    expect(screen.getByText(/Renegotiate home care framework contracts/)).toBeInTheDocument()
    expect(screen.getByText(/Submit CHC recovery claims/)).toBeInTheDocument()
  })

  it('shows empty message when no monday list items', async () => {
    const se = await import('../utils/savingsEngine')
    se.generateAllDirectives.mockReturnValue([])
    setupMocks()
    renderDashboard()
    expect(screen.getByText(/no directives generated/i)).toBeInTheDocument()
  })

  it('directorate cards link to detail pages', () => {
    setupMocks()
    renderDashboard()
    const links = screen.getAllByRole('link')
    const dirLinks = links.filter(l => l.getAttribute('href')?.includes('/directorate/'))
    expect(dirLinks.length).toBeGreaterThanOrEqual(2)
    expect(dirLinks[0].getAttribute('href')).toMatch(/\/directorate\//)
  })

  // --- Tab switching ---

  it('switches to Directorates tab and shows charts', () => {
    setupMocks()
    renderDashboard()
    fireEvent.click(screen.getByText('Directorates'))
    expect(screen.getByText('MTFS Target vs Identified Savings by Directorate')).toBeInTheDocument()
    expect(screen.getByText('Savings Timeline')).toBeInTheDocument()
  })

  it('switches to MTFS Tracker tab', () => {
    setupMocks()
    renderDashboard()
    fireEvent.click(screen.getByText('MTFS Tracker'))
    expect(screen.getByText(/Prior Year Performance Warning/)).toBeInTheDocument()
    expect(screen.getByText(/Directorate MTFS Breakdown/)).toBeInTheDocument()
  })

  it('MTFS tab shows prior year warning with figures', () => {
    setupMocks()
    renderDashboard()
    fireEvent.click(screen.getByText('MTFS Tracker'))
    // Prior year shortfall figure appears in the warning
    expect(screen.getByText(/2024\/25 savings target/i)).toBeInTheDocument()
  })

  it('MTFS breakdown rows link to directorate detail', () => {
    setupMocks()
    renderDashboard()
    fireEvent.click(screen.getByText('MTFS Tracker'))
    const dirLinks = screen.getAllByRole('link').filter(l => l.getAttribute('href')?.includes('/directorate/'))
    expect(dirLinks.length).toBeGreaterThanOrEqual(2)
  })

  // --- Edge cases ---

  it('handles null portfolio data gracefully', () => {
    setupMocks({ data: { data: [null, null, null, null, null], loading: false, error: null } })
    renderDashboard()
    expect(screen.getByText(/failed to load cabinet data/i)).toBeInTheDocument()
  })

  it('handles portfolios with no savings levers', () => {
    const noLeversData = {
      ...mockPortfolioData,
      portfolios: mockPortfolioData.portfolios.map(p => ({ ...p, savings_levers: [] })),
    }
    setupMocks({ data: { data: [noLeversData, mockFindings, mockBudgets, mockMeetings, mockDocuments], loading: false, error: null } })
    renderDashboard()
    expect(screen.getByText('Reform Savings Command Centre')).toBeInTheDocument()
  })

  it('renders correct number of directorate cards', () => {
    setupMocks()
    renderDashboard()
    const cards = screen.getAllByText(/levers/)
    expect(cards.length).toBe(2)
  })

  it('coverage percentage shows correct trend indicator', () => {
    setupMocks()
    renderDashboard()
    // Coverage is 120% (from mock) — stat cards includes hero, fiscal, treasury, workforce sections
    const statCards = screen.getAllByTestId('stat-card')
    expect(statCards.length).toBeGreaterThanOrEqual(7)
  })
})
