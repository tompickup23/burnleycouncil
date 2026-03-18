import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import DirectorateDetail from './DirectorateDetail'

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
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Cell: () => null,
    Legend: () => null,
    ScatterChart: MockChart,
    Scatter: () => null,
    ZAxis: () => null,
  }
})

vi.mock('../utils/savingsEngine', () => ({
  buildDirectorateSavingsProfile: vi.fn((d) => ({
    directorate_id: d.id,
    title: d.title,
    executive_director: d.executive_director,
    net_budget: d.net_budget,
    mtfs_target: d.mtfs_savings_target,
    kpi_headline: d.kpi_headline,
    lever_count: 5,
    savings_range: { low: 15000000, high: 35000000, midpoint: 25000000 },
    coverage_pct: 150,
    avg_evidence_strength: 55,
    prior_year: { target: 34800000, achieved: 3800000, achieved_pct: 11 },
    by_timeline: { immediate: 5000000, short_term: 8000000, medium_term: 7000000, long_term: 5000000 },
    by_tier: {},
  })),
  evidenceChainStrength: vi.fn((lever) => lever?.evidence ? 80 : 20),
  directorateKPITracker: vi.fn(() => ({
    metrics: [
      { name: 'CQC overall', value: 'RI', trend: 'declining', savings_link: 'Off-framework costs £3-5M' },
      { name: 'Home care framework', value: '31%', trend: 'stable', savings_link: 'Premium payments £3M' },
    ],
    improving: [],
    stable: [{ name: 'Home care framework', value: '31%' }],
    declining: [{ name: 'CQC overall', value: 'RI' }],
  })),
  benchmarkDirectorate: vi.fn(() => ({ peers: [], summary: 'No benchmark data' })),
  directorateRiskProfile: vi.fn(() => ({
    risk_level: 'high',
    risk_color: '#fd7e14',
    risk_score: 72,
    inspection_risk: { rating: 'Requires Improvement', detail: 'CQC RI across 9 quality statements' },
    delivery_risk: { detail: 'Prior year achieved only 11% of target' },
  })),
  generateDirectives: vi.fn(() => [
    { id: 'd1', action: 'Renegotiate framework contracts', feasibility: 8, impact: 9, save_central: 3000000, save_low: 2000000, save_high: 4000000, timeline: '3-6m' },
  ]),
  generateAllDirectives: vi.fn(() => []),
  generateReformPlaybook: vi.fn(() => ({
    year_1: [{ action: 'Establish CHC review team' }, { action: 'Audit framework contracts' }],
    year_2: [{ action: 'Expand supported living' }],
  })),
  meetingBriefing: vi.fn(() => null),
  politicalContext: vi.fn(() => ({
    opposition_attacks: [
      { vector: 'Cutting care services', counter: 'Redirecting spend to community care' },
    ],
    borough_elections: { date: 'May 7, 2026', affected_districts: ['Burnley', 'Hyndburn'] },
    reform_narrative_hooks: ['Saving taxpayer money through NHS recovery'],
  })),
  formatCurrency: vi.fn((v) => {
    if (!v && v !== 0) return '£0'
    const m = Math.round(v / 1000000)
    return m >= 1 ? `£${m}M` : `£${Math.round(v / 1000).toLocaleString()}K`
  }),
  parseSavingRange: vi.fn((s) => {
    if (!s) return { low: 0, high: 0 }
    const match = s.match(/£(\d+)-?(\d+)?M/i)
    if (match) return { low: parseInt(match[1]) * 1e6, high: (parseInt(match[2] || match[1]) * 1e6) }
    return { low: 0, high: 0 }
  }),
  timelineBucket: vi.fn((t) => {
    if (!t) return 'medium_term'
    if (t.includes('immediate') || t.includes('0-3')) return 'immediate'
    if (t.includes('3-6') || t.includes('short')) return 'short_term'
    return 'medium_term'
  }),
}))

vi.mock('./DirectorateDetail.css', () => ({}))

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

const mockDirectorate = {
  id: 'adults_health',
  title: 'Adults, Health & Wellbeing',
  executive_director: 'Helen Coombes (Interim)',
  portfolio_ids: ['adult_social_care', 'health_wellbeing'],
  net_budget: 558500000,
  mtfs_savings_target: 46700000,
  prior_year_target: 34800000,
  prior_year_achieved: 3800000,
  savings_narrative: 'Adult Social Care is the largest budget with significant savings potential.',
  kpi_headline: "CQC 'Requires Improvement'",
  performance_metrics: [
    { name: 'CQC overall rating', value: 'RI', score: 2, max: 4, savings_link: 'CQC RI exposes off-framework procurement (31% at 20% premium = £3-5M)' },
    { name: 'Off-framework home care', value: 31, unit: '%', target: 15, savings_link: '31% off-framework at 20% premium = £3-5M recoverable' },
    { name: 'CHC recovery rate', value: '4-6%', savings_link: 'Below national average — £5-12M recoverable from NHS ICB' },
  ],
}

const mockPortfolioData = {
  administration: { party: 'Reform UK', seats: 53, total: 84 },
  directorates: [mockDirectorate],
  portfolios: [
    {
      id: 'adult_social_care',
      title: 'Adult Social Care',
      short_title: 'Adults',
      cabinet_member: { name: 'Graham Dalton', ward: 'Morecambe North' },
      executive_director: 'Louise Taylor',
      scrutiny_committee: { name: 'Health Scrutiny', id: 'health_scrutiny' },
      known_pressures: ['Ageing population', 'Workforce recruitment'],
      statutory_duties: ['Care Act 2014', 'Mental Health Act 1983'],
      key_contracts: [
        { name: 'Home care framework', supplier: 'Multiple', value: '£57M/yr' },
      ],
      savings_levers: [
        {
          lever: 'Home care framework renegotiation',
          est_saving: '£3-5M',
          timeline: '3-6 months',
          evidence: {
            data_points: ['31% commissioned off-framework at 20% premium'],
            benchmark: 'National average off-framework: 15%',
            calculation: '31% × £57M × 20% premium = £3.5M',
            kpi_link: 'CQC RI linked to quality concerns',
            implementation_steps: [{ step: 'Audit framework utilisation', month: '1-2', cost: '£0' }],
            political_framing: 'Ensuring taxpayers get value from care contracts.',
          },
        },
        { lever: 'CHC cost recovery', est_saving: '£5-12M', timeline: '6-18 months' },
      ],
    },
    {
      id: 'health_wellbeing',
      title: 'Health & Wellbeing',
      short_title: 'Health',
      cabinet_member: { name: 'Munsif Dad', ward: 'Bastwell and Daisyfield' },
      savings_levers: [],
      known_pressures: [],
    },
  ],
}

const mockFindings = { likely_duplicates: [], split_payment_evasion: [], ch_red_flags: [] }
const mockBudgets = { revenue: {} }
const mockMeetings = { meetings: [{ title: 'Health Scrutiny', committee: 'Health Scrutiny', date: '2026-04-15' }] }
const mockDocuments = { decisions: [] }
const mockProcurement = { contracts: [] }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDetail(dirId = 'adults_health') {
  return render(
    <MemoryRouter initialEntries={[`/directorate/${dirId}`]}>
      <Routes>
        <Route path="/directorate/:directorateId" element={<DirectorateDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

function setupMocks(overrides = {}) {
  useCouncilConfig.mockReturnValue(overrides.config || mockConfig)
  useAuth.mockReturnValue(overrides.auth || { isCouncillor: true, isCabinetLevel: true, role: 'cabinet_member', permissions: {} })
  useData.mockReturnValue({
    data: [mockPortfolioData, mockFindings, mockBudgets, mockMeetings, mockDocuments, mockProcurement],
    loading: false,
    error: null,
    ...overrides.data,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DirectorateDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --- Access & loading ---

  it('shows not available for councils without cabinet_portfolios', () => {
    setupMocks({ config: { ...mockConfig, data_sources: { cabinet_portfolios: false } } })
    renderDetail()
    expect(screen.getByText(/not available for this council/i)).toBeInTheDocument()
  })

  it('renders loading state', () => {
    setupMocks({ data: { data: null, loading: true, error: null } })
    renderDetail()
    expect(screen.getByText(/loading directorate/i)).toBeInTheDocument()
  })

  it('renders error state', () => {
    setupMocks({ data: { data: null, loading: false, error: new Error('fail') } })
    renderDetail()
    expect(screen.getByText(/failed to load directorate data/i)).toBeInTheDocument()
  })

  it('shows not found for invalid directorate ID', () => {
    setupMocks()
    renderDetail('nonexistent_id')
    expect(screen.getByText('Directorate Not Found')).toBeInTheDocument()
  })

  // --- Hero ---

  it('renders hero with directorate title and director', () => {
    setupMocks()
    renderDetail()
    expect(screen.getByText('Adults, Health & Wellbeing')).toBeInTheDocument()
    expect(screen.getByText(/Helen Coombes/)).toBeInTheDocument()
  })

  it('shows KPI headline badge', () => {
    setupMocks()
    renderDetail()
    expect(screen.getByText("CQC 'Requires Improvement'")).toBeInTheDocument()
  })

  it('renders stat cards', () => {
    setupMocks()
    renderDetail()
    expect(screen.getByText('Net Budget')).toBeInTheDocument()
    // 'Savings Pipeline' and 'MTFS Target' appear in both stat cards and sections
    expect(screen.getAllByText('Savings Pipeline').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('MTFS Target').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Evidence Strength')).toBeInTheDocument()
  })

  it('shows back link to Savings Command Centre', () => {
    setupMocks()
    renderDetail()
    const backLink = screen.getByText(/Savings Command Centre/)
    expect(backLink).toBeInTheDocument()
    expect(backLink.closest('a')).toHaveAttribute('href', '/cabinet')
  })

  // --- Tab 1: Savings Overview (default) ---

  it('shows KPI → Savings Evidence Chains', () => {
    setupMocks()
    renderDetail()
    expect(screen.getByText(/KPI → Savings Evidence Chains/)).toBeInTheDocument()
    expect(screen.getByText('CQC overall rating')).toBeInTheDocument()
    expect(screen.getByText(/off-framework procurement/i)).toBeInTheDocument()
  })

  it('shows savings pipeline table', () => {
    setupMocks()
    renderDetail()
    expect(screen.getAllByText('Savings Pipeline').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Home care framework renegotiation')).toBeInTheDocument()
    expect(screen.getByText('CHC cost recovery')).toBeInTheDocument()
  })

  it('shows MTFS comparison bars', () => {
    setupMocks()
    renderDetail()
    expect(screen.getByText(/Savings vs MTFS Target/)).toBeInTheDocument()
  })

  it('shows savings narrative when available', () => {
    setupMocks()
    renderDetail()
    expect(screen.getByText(/Adult Social Care is the largest budget/)).toBeInTheDocument()
  })

  // --- Tab 2: Performance ---

  it('switches to Performance tab', () => {
    setupMocks()
    renderDetail()
    fireEvent.click(screen.getByText('Performance'))
    expect(screen.getByText(/Performance Metrics — Savings Links/)).toBeInTheDocument()
  })

  it('shows demand pressures on Performance tab', () => {
    setupMocks()
    renderDetail()
    fireEvent.click(screen.getByText('Performance'))
    expect(screen.getByText('Demand Pressures')).toBeInTheDocument()
    expect(screen.getByText('Ageing population')).toBeInTheDocument()
    expect(screen.getByText('Workforce recruitment')).toBeInTheDocument()
  })

  it('shows key contracts on Performance tab', () => {
    setupMocks()
    renderDetail()
    fireEvent.click(screen.getByText('Performance'))
    expect(screen.getByText('Key Contracts')).toBeInTheDocument()
    // 'Home care framework' appears in both KPI list and contracts table
    expect(screen.getAllByText(/Home care framework/).length).toBeGreaterThanOrEqual(1)
  })

  it('shows risk profile on Performance tab', () => {
    setupMocks()
    renderDetail()
    fireEvent.click(screen.getByText('Performance'))
    expect(screen.getByText('Risk Profile')).toBeInTheDocument()
    expect(screen.getByText('HIGH RISK')).toBeInTheDocument()
  })

  // --- Tab 3: Savings Detail (councillor+) ---

  it('switches to Savings Detail tab and shows expanded levers', () => {
    setupMocks()
    renderDetail()
    fireEvent.click(screen.getByText('Savings Detail'))
    expect(screen.getByText(/Savings Levers — Full Evidence/)).toBeInTheDocument()
  })

  it('shows evidence chain detail for levers with evidence', () => {
    setupMocks()
    renderDetail()
    fireEvent.click(screen.getByText('Savings Detail'))
    expect(screen.getByText(/Data Points/)).toBeInTheDocument()
    expect(screen.getByText(/31% commissioned off-framework/)).toBeInTheDocument()
    expect(screen.getByText(/Benchmark/i)).toBeInTheDocument()
  })

  it('shows evidence strength heatmap', () => {
    setupMocks()
    renderDetail()
    fireEvent.click(screen.getByText('Savings Detail'))
    expect(screen.getByText(/Evidence Strength by Lever/)).toBeInTheDocument()
  })

  it('hides Savings Detail tab for non-councillors with Firebase', async () => {
    const firebaseMod = await import('../firebase')
    const orig = firebaseMod.isFirebaseEnabled
    Object.defineProperty(firebaseMod, 'isFirebaseEnabled', { value: true, writable: true })

    setupMocks({ auth: { isCouncillor: false, isCabinetLevel: false, role: 'viewer', permissions: {} } })
    renderDetail()
    expect(screen.queryByText('Savings Detail')).not.toBeInTheDocument()

    Object.defineProperty(firebaseMod, 'isFirebaseEnabled', { value: orig, writable: true })
  })

  // --- Tab 4: Political Impact (councillor+) ---

  it('switches to Political Impact tab', () => {
    setupMocks()
    renderDetail()
    fireEvent.click(screen.getByText('Political Impact'))
    expect(screen.getByText('Political Framing')).toBeInTheDocument()
  })

  it('shows political framing for levers with evidence', () => {
    setupMocks()
    renderDetail()
    fireEvent.click(screen.getByText('Political Impact'))
    expect(screen.getByText(/Ensuring taxpayers get value/)).toBeInTheDocument()
  })

  it('shows opposition attack predictions', () => {
    setupMocks()
    renderDetail()
    fireEvent.click(screen.getByText('Political Impact'))
    expect(screen.getByText(/Opposition Attack Predictions/)).toBeInTheDocument()
    expect(screen.getByText('Cutting care services')).toBeInTheDocument()
  })

  it('shows borough election impact', () => {
    setupMocks()
    renderDetail()
    fireEvent.click(screen.getByText('Political Impact'))
    expect(screen.getByText(/Borough Election Impact/)).toBeInTheDocument()
    expect(screen.getByText(/May 7, 2026/)).toBeInTheDocument()
  })

  it('shows Reform narrative hooks', () => {
    setupMocks()
    renderDetail()
    fireEvent.click(screen.getByText('Political Impact'))
    expect(screen.getByText(/Reform Narrative Hooks/)).toBeInTheDocument()
    expect(screen.getByText(/Saving taxpayer money/)).toBeInTheDocument()
  })

  // --- Tab 5: Action Plan (cabinet+) ---

  it('switches to Action Plan tab and shows playbook', () => {
    setupMocks()
    renderDetail()
    fireEvent.click(screen.getByText('Action Plan'))
    expect(screen.getByText('Reform Playbook')).toBeInTheDocument()
    expect(screen.getByText('Establish CHC review team')).toBeInTheDocument()
  })

  it('shows statutory considerations', () => {
    setupMocks()
    renderDetail()
    fireEvent.click(screen.getByText('Action Plan'))
    expect(screen.getByText('Statutory Considerations')).toBeInTheDocument()
    expect(screen.getByText('Care Act 2014')).toBeInTheDocument()
  })

  it('shows constituent portfolio links', () => {
    setupMocks()
    renderDetail()
    fireEvent.click(screen.getByText('Action Plan'))
    expect(screen.getByText('Constituent Portfolios')).toBeInTheDocument()
    expect(screen.getByText('Adult Social Care')).toBeInTheDocument()
  })

  it('hides Action Plan tab for non-cabinet users with Firebase', async () => {
    const firebaseMod = await import('../firebase')
    const orig = firebaseMod.isFirebaseEnabled
    Object.defineProperty(firebaseMod, 'isFirebaseEnabled', { value: true, writable: true })

    setupMocks({ auth: { isCouncillor: true, isCabinetLevel: false, role: 'councillor', permissions: {} } })
    renderDetail()
    expect(screen.queryByText('Action Plan')).not.toBeInTheDocument()

    Object.defineProperty(firebaseMod, 'isFirebaseEnabled', { value: orig, writable: true })
  })

  // --- Edge cases ---

  it('handles directorate with no performance metrics', () => {
    const noMetricsData = {
      ...mockPortfolioData,
      directorates: [{ ...mockDirectorate, performance_metrics: [] }],
    }
    setupMocks({ data: { data: [noMetricsData, mockFindings, mockBudgets, mockMeetings, mockDocuments, mockProcurement], loading: false, error: null } })
    renderDetail()
    expect(screen.getByText(/No KPI→savings evidence chains/i)).toBeInTheDocument()
  })

  it('handles portfolios with no savings levers', () => {
    const noLeversData = {
      ...mockPortfolioData,
      portfolios: mockPortfolioData.portfolios.map(p => ({ ...p, savings_levers: [] })),
    }
    setupMocks({ data: { data: [noLeversData, mockFindings, mockBudgets, mockMeetings, mockDocuments, mockProcurement], loading: false, error: null } })
    renderDetail()
    expect(screen.getByText(/No savings levers identified/i)).toBeInTheDocument()
  })

  it('handles null data arrays gracefully', () => {
    setupMocks({ data: { data: [null, null, null, null, null, null], loading: false, error: null } })
    renderDetail()
    expect(screen.getByText(/failed to load directorate data/i)).toBeInTheDocument()
  })
})
