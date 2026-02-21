import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Elections from './Elections'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

// Mock Recharts (renders to SVG which JSDOM can't measure)
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
    Pie: ({ data, label }) => (
      <div data-testid="pie-data">
        {data?.map((d, i) => <span key={i}>{d.party || d.name}: {d.seats || d.value}</span>)}
      </div>
    ),
    Cell: () => null,
    Legend: () => null,
    LineChart: MockChart,
    Line: () => null,
    ScatterChart: MockChart,
    Scatter: () => null,
    ZAxis: () => null,
    ReferenceLine: () => null,
  }
})

// Mock IntersectionObserver (used for section nav)
globalThis.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  council_tier: 'district',
  official_website: 'https://burnley.gov.uk',
  spending_threshold: 500,
}

const mockElectionsData = {
  meta: {
    council_name: 'Burnley',
    council_id: 'burnley',
    total_seats: 45,
    total_wards: 15,
    election_cycle: 'thirds',
    seats_per_ward: 3,
    next_election: {
      date: '2026-05-07',
      type: 'borough',
      seats_up: 15,
      wards_up: ['Bank Hall', 'Briercliffe', 'Coal Clough'],
    },
  },
  wards: {
    'Bank Hall': {
      history: [{
        date: '2024-05-02', year: 2024, type: 'borough', seats_contested: 1,
        turnout_votes: 1500, turnout: 0.30, electorate: 5000,
        candidates: [
          { name: 'Alice', party: 'Labour', votes: 750, pct: 0.50, elected: true },
          { name: 'Bob', party: 'Conservative', votes: 450, pct: 0.30, elected: false },
          { name: 'Carol', party: 'Green Party', votes: 300, pct: 0.20, elected: false },
        ],
        majority: 300, majority_pct: 0.20,
      }],
      current_holders: [
        { name: 'Alice Smith', party: 'Labour' },
        { name: 'Dan Jones', party: 'Labour' },
        { name: 'Eve Brown', party: 'Independent' },
      ],
      seats: 3,
      electorate: 5000,
    },
    'Briercliffe': {
      history: [{
        date: '2023-05-04', year: 2023, type: 'borough', seats_contested: 1,
        turnout_votes: 1200, turnout: 0.28, electorate: 4286,
        candidates: [
          { name: 'Frank', party: 'Conservative', votes: 600, pct: 0.50, elected: true },
          { name: 'Grace', party: 'Labour', votes: 400, pct: 0.33, elected: false },
          { name: 'Hank', party: 'Independent', votes: 200, pct: 0.17, elected: false },
        ],
        majority: 200,
      }],
      current_holders: [{ name: 'Frank Adams', party: 'Conservative' }],
      seats: 3,
    },
    'Coal Clough': {
      history: [{
        date: '2022-05-05', year: 2022, type: 'borough', seats_contested: 1,
        turnout_votes: 900, turnout: 0.25, electorate: 3600,
        candidates: [
          { name: 'Ivy', party: 'Labour', votes: 500, pct: 0.56, elected: true },
          { name: 'Jack', party: 'Conservative', votes: 400, pct: 0.44, elected: false },
        ],
      }],
      current_holders: [{ name: 'Ivy Green', party: 'Labour' }],
      seats: 3,
    },
  },
  council_history: [
    {
      year: 2024, type: 'borough',
      results_by_party: {
        Labour: { won: 8, pct: 0.42 },
        Conservative: { won: 4, pct: 0.28 },
        Independent: { won: 2, pct: 0.15 },
        'Liberal Democrats': { won: 1, pct: 0.10 },
      },
    },
    {
      year: 2023, type: 'borough',
      results_by_party: {
        Labour: { won: 7, pct: 0.40 },
        Conservative: { won: 5, pct: 0.30 },
        Independent: { won: 2, pct: 0.16 },
        'Liberal Democrats': { won: 1, pct: 0.09 },
      },
    },
  ],
  turnout_trends: [
    { year: 2024, turnout: 0.30 },
    { year: 2023, turnout: 0.28 },
    { year: 2022, turnout: 0.25 },
  ],
}

const mockReferenceData = {
  national_polling: {
    parties: {
      Labour: 0.29, Conservative: 0.24, 'Reform UK': 0.22,
      'Liberal Democrats': 0.12, 'Green Party': 0.07,
    },
    ge2024_result: {
      Labour: 0.337, Conservative: 0.237, 'Reform UK': 0.143,
      'Liberal Democrats': 0.122, 'Green Party': 0.069,
    },
  },
  lancashire_lcc_2025: { results: { 'Reform UK': { pct: 0.357 } } },
  model_parameters: { swingMultiplier: 1.0 },
  election_calendar: [
    { date: '2026-05-07', type: 'borough', council_id: 'burnley', description: 'Burnley Borough Elections' },
    { date: '2026-05-07', type: 'borough', council_id: 'hyndburn', description: 'Hyndburn Borough Elections' },
  ],
}

const mockCouncillorsData = [
  { name: 'Alice Smith', ward: 'Bank Hall', party: 'Labour' },
  { name: 'Dan Jones', ward: 'Bank Hall', party: 'Labour' },
]

const mockPoliticsSummary = {
  total_councillors: 45,
  parties: {
    Labour: { seats: 23 },
    Conservative: { seats: 10 },
    Independent: { seats: 8 },
    'Liberal Democrats': { seats: 4 },
  },
}

// Helper: mock useData to return different values for different paths
function setupMocks({
  electionsData = null,
  referenceData = null,
  politicsSummary = null,
  loading = false,
  error = null,
  lgrData = null,
  pollingData = null,
  demographicsData = null,
  deprivationData = null,
} = {}) {
  useData.mockImplementation((path) => {
    if (Array.isArray(path)) {
      if (path[0] === '/data/elections.json') {
        return {
          data: electionsData
            ? [electionsData, referenceData || mockReferenceData, mockCouncillorsData, politicsSummary || mockPoliticsSummary]
            : null,
          loading,
          error,
        }
      }
      // Optional data (demographics, deprivation)
      return { data: [demographicsData || null, deprivationData || null], loading: false, error: null }
    }
    // Single-file loads
    if (typeof path === 'string') {
      if (path.includes('lgr_tracker')) return { data: lgrData, loading: false, error: null }
      if (path.includes('polling')) return { data: pollingData, loading: false, error: null }
    }
    return { data: null, loading: false, error: null }
  })
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <Elections />
    </MemoryRouter>
  )
}

// ============================================================================
// Tests
// ============================================================================

describe('Elections', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  // --- Loading & Error States ---

  describe('loading and error states', () => {
    it('shows loading state while data loads', () => {
      setupMocks({ loading: true })
      renderComponent()
      expect(screen.getByText(/loading election data/i)).toBeInTheDocument()
    })

    it('shows error message when data fails to load', () => {
      setupMocks({ error: new Error('Network error') })
      renderComponent()
      expect(screen.getByText(/election data not available/i)).toBeInTheDocument()
    })

    it('shows error message when electionsData is null', () => {
      setupMocks({ electionsData: null })
      renderComponent()
      expect(screen.getByText(/election data not available/i)).toBeInTheDocument()
    })

    it('includes council name in error message', () => {
      setupMocks({ error: new Error('fail') })
      renderComponent()
      expect(screen.getByText(/burnley/i)).toBeInTheDocument()
    })
  })

  // --- Page Header & Navigation ---

  describe('page header and navigation', () => {
    it('renders the page heading', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      expect(screen.getByText('Elections')).toBeInTheDocument()
    })

    it('renders section navigation with all expected buttons', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      const nav = screen.getByRole('navigation', { name: /election page sections/i })
      expect(nav).toBeInTheDocument()
      expect(within(nav).getByText('Overview')).toBeInTheDocument()
      expect(within(nav).getByText('Predictions')).toBeInTheDocument()
      expect(within(nav).getByText('Coalitions')).toBeInTheDocument()
      expect(within(nav).getByText('LGR Projections')).toBeInTheDocument()
      expect(within(nav).getByText('Ward Explorer')).toBeInTheDocument()
      expect(within(nav).getByText('Ward Builder')).toBeInTheDocument()
      expect(within(nav).getByText('Council History')).toBeInTheDocument()
    })

    it('displays seat and ward counts in subtitle', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      expect(screen.getByText(/45 seats across 15 wards/i)).toBeInTheDocument()
    })

    it('shows election cycle information for thirds', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      expect(screen.getByText(/one-third of seats each year/i)).toBeInTheDocument()
    })

    it('shows halves cycle when applicable', () => {
      const halvesData = {
        ...mockElectionsData,
        meta: { ...mockElectionsData.meta, election_cycle: 'halves' },
      }
      setupMocks({ electionsData: halvesData })
      renderComponent()
      expect(screen.getByText(/halves/i)).toBeInTheDocument()
    })
  })

  // --- Tier-Aware Labels ---

  describe('tier-aware labels', () => {
    it('uses Division labels for county tier', () => {
      useCouncilConfig.mockReturnValue({ ...mockConfig, council_tier: 'county' })
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      const nav = screen.getByRole('navigation', { name: /election page sections/i })
      expect(within(nav).getByText('Division Explorer')).toBeInTheDocument()
      expect(within(nav).getByText('Division Builder')).toBeInTheDocument()
    })

    it('uses Ward labels for district tier', () => {
      useCouncilConfig.mockReturnValue(mockConfig)
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      const nav = screen.getByRole('navigation', { name: /election page sections/i })
      expect(within(nav).getByText('Ward Explorer')).toBeInTheDocument()
      expect(within(nav).getByText('Ward Builder')).toBeInTheDocument()
    })

    it('uses Division labels in explorer prompt for county tier', () => {
      useCouncilConfig.mockReturnValue({ ...mockConfig, council_tier: 'county' })
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      expect(screen.getByText(/select a division/i)).toBeInTheDocument()
    })
  })

  // --- Overview Section ---

  describe('overview section', () => {
    it('shows next election date', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      const dateElements = screen.getAllByText(/7 May 2026/i)
      expect(dateElements.length).toBeGreaterThanOrEqual(1)
    })

    it('shows seats up count', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      // seats_up is 15
      expect(screen.getByText('15')).toBeInTheDocument()
    })

    it('shows wards contested count', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      // wards_up length is 3
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    it('shows total council seats', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      expect(screen.getByText('45')).toBeInTheDocument()
    })

    it('shows election type as Borough', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      // "Borough" appears in multiple places — just verify at least one
      const boroughElements = screen.getAllByText(/Borough/i)
      expect(boroughElements.length).toBeGreaterThanOrEqual(1)
    })

    it('shows majority threshold', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      // floor(45/2)+1 = 23 — appears in multiple locations
      const thresholdElements = screen.getAllByText(/majority threshold: 23/i)
      expect(thresholdElements.length).toBeGreaterThanOrEqual(1)
    })

    it('renders election calendar when reference data has it', () => {
      setupMocks({ electionsData: mockElectionsData, referenceData: mockReferenceData })
      renderComponent()
      expect(screen.getByText('Upcoming Elections')).toBeInTheDocument()
      expect(screen.getByText(/Burnley Borough Elections/i)).toBeInTheDocument()
    })

    it('renders current composition when politics summary available', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      expect(screen.getByText('Current Council Composition')).toBeInTheDocument()
    })

    it('renders turnout trend section', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      expect(screen.getByText('Turnout Trend')).toBeInTheDocument()
    })

    it('handles missing next election gracefully', () => {
      const noNextElection = {
        ...mockElectionsData,
        meta: { ...mockElectionsData.meta, next_election: null },
      }
      setupMocks({ electionsData: noNextElection })
      renderComponent()
      // Should show a "no upcoming election date found" info banner
      expect(screen.getByText(/no upcoming election date found/i)).toBeInTheDocument()
    })
  })

  // --- Ward Explorer ---

  describe('ward explorer', () => {
    it('renders ward selector with all wards', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      const select = screen.getByLabelText(/select a ward/i)
      expect(select).toBeInTheDocument()
      // 3 wards + default option
      expect(select.options.length).toBe(4)
    })

    it('shows prompt to select a ward before selection', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      expect(screen.getByText(/select a ward above to explore/i)).toBeInTheDocument()
    })

    it('shows ward detail when ward is selected', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      const select = screen.getByLabelText(/select a ward/i)
      fireEvent.change(select, { target: { value: 'Bank Hall' } })

      // Ward name appears in multiple places (selector option + heading + predictions)
      expect(screen.getAllByText('Bank Hall').length).toBeGreaterThanOrEqual(2)
      // Current holders section
      expect(screen.getByText('Current Councillors')).toBeInTheDocument()
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
      expect(screen.getByText('Dan Jones')).toBeInTheDocument()
    })

    it('shows electorate stat for selected ward', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      fireEvent.change(screen.getByLabelText(/select a ward/i), { target: { value: 'Bank Hall' } })
      expect(screen.getByText('5,000')).toBeInTheDocument()
      expect(screen.getByText('Electorate')).toBeInTheDocument()
    })

    it('shows seats stat for selected ward', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      fireEvent.change(screen.getByLabelText(/select a ward/i), { target: { value: 'Bank Hall' } })
      // "3" seats and "Seats" label
      const seatLabels = screen.getAllByText('Seats')
      expect(seatLabels.length).toBeGreaterThanOrEqual(1)
    })

    it('shows election history table for selected ward', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      fireEvent.change(screen.getByLabelText(/select a ward/i), { target: { value: 'Bank Hall' } })
      expect(screen.getByText('Election History')).toBeInTheDocument()
      // Check candidate names appear
      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Bob')).toBeInTheDocument()
      expect(screen.getByText('Carol')).toBeInTheDocument()
    })

    it('shows turnout percentage in ward history', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      fireEvent.change(screen.getByLabelText(/select a ward/i), { target: { value: 'Bank Hall' } })
      // Turnout 30.0% appears in history table and possibly predictions — at least 1 match
      const turnoutElements = screen.getAllByText(/30\.0%/)
      expect(turnoutElements.length).toBeGreaterThanOrEqual(1)
    })

    it('shows elected badge for winning candidate', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      fireEvent.change(screen.getByLabelText(/select a ward/i), { target: { value: 'Bank Hall' } })
      expect(screen.getByText('Elected')).toBeInTheDocument()
    })

    it('shows vote percentages for candidates', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      fireEvent.change(screen.getByLabelText(/select a ward/i), { target: { value: 'Bank Hall' } })
      // Percentages may appear in history table AND predictions — check at least 1 match each
      expect(screen.getAllByText(/50\.0%/).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(/20\.0%/).length).toBeGreaterThanOrEqual(1)
    })

    it('formats election date correctly in history', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      fireEvent.change(screen.getByLabelText(/select a ward/i), { target: { value: 'Bank Hall' } })
      expect(screen.getByText('2 May 2024')).toBeInTheDocument()
    })
  })

  // --- Predictions Section ---

  describe('predictions section', () => {
    it('shows predictions heading with election date', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      // Heading includes formatted date
      const headings = screen.getAllByText(/7 May 2026/i)
      expect(headings.length).toBeGreaterThanOrEqual(1)
    })

    it('shows thirds rotation explanation', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      expect(screen.getByText(/thirds rotation/i)).toBeInTheDocument()
    })

    it('shows assumption sliders', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      expect(screen.getByText('Assumptions')).toBeInTheDocument()
      expect(screen.getByLabelText('Swing Multiplier')).toBeInTheDocument()
      expect(screen.getByLabelText('Turnout Adjustment')).toBeInTheDocument()
    })

    it('shows Reform UK checkbox in assumptions', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      expect(screen.getByText(/reform uk stands in all wards/i)).toBeInTheDocument()
    })

    it('shows ward-by-ward predictions heading', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      expect(screen.getByText(/ward-by-ward predictions \(3 wards\)/i)).toBeInTheDocument()
    })

    it('renders prediction table headers', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      expect(screen.getByText('Predicted Winner')).toBeInTheDocument()
      expect(screen.getByText('Defending')).toBeInTheDocument()
      expect(screen.getByText('Confidence')).toBeInTheDocument()
    })

    it('lists all wards up for election in predictions', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      // All 3 wards should appear in predictions table
      // They appear multiple times across the page — just verify they're present
      expect(screen.getAllByText('Bank Hall').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Briercliffe').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Coal Clough').length).toBeGreaterThanOrEqual(1)
    })

    it('shows workings button for each ward prediction', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      const workingsButtons = screen.getAllByLabelText(/show workings for/i)
      expect(workingsButtons.length).toBe(3)
    })

    it('shows no predictions banner when next election is missing', () => {
      const noNext = {
        ...mockElectionsData,
        meta: { ...mockElectionsData.meta, next_election: null },
      }
      setupMocks({ electionsData: noNext })
      renderComponent()
      expect(screen.getByText(/no upcoming election date found/i)).toBeInTheDocument()
    })
  })

  // --- Coalition Modeller ---

  describe('coalition modeller', () => {
    it('renders coalitions section heading', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      expect(screen.getByText('Coalition Modeller')).toBeInTheDocument()
    })

    it('shows majority threshold in coalitions description', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      expect(screen.getByText(/majority threshold: 23 of 45 seats/i)).toBeInTheDocument()
    })

    it('shows "predicted results" text when no overrides', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      expect(screen.getByText(/predicted results/i)).toBeInTheDocument()
    })
  })

  // --- Ward Builder ---

  describe('ward builder', () => {
    it('renders builder section heading', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      const nav = screen.getByRole('navigation', { name: /election page sections/i })
      expect(within(nav).getByText('Ward Builder')).toBeInTheDocument()
    })

    it('shows predicted council composition heading', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      expect(screen.getByText('Predicted Council Composition')).toBeInTheDocument()
    })
  })

  // --- Council History ---

  describe('council history', () => {
    it('renders council history section heading', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      // "Council History" appears in nav button AND section heading — verify at least 1
      const historyElements = screen.getAllByText('Council History')
      expect(historyElements.length).toBeGreaterThanOrEqual(1)
    })
  })

  // --- LGR Projections ---

  describe('lgr projections', () => {
    it('renders LGR projections section heading', () => {
      setupMocks({ electionsData: mockElectionsData })
      renderComponent()
      // "LGR Projections" appears in nav button AND section heading
      const lgrElements = screen.getAllByText('LGR Projections')
      expect(lgrElements.length).toBeGreaterThanOrEqual(1)
    })

    it('shows info banner when no LGR data available', () => {
      setupMocks({ electionsData: mockElectionsData, lgrData: null })
      renderComponent()
      // No proposed_models → shows info banner
      expect(screen.getByText(/lgr projection data not available/i)).toBeInTheDocument()
    })
  })

  // --- Edge Cases ---

  describe('edge cases', () => {
    it('handles wards with no history', () => {
      const noHistory = {
        ...mockElectionsData,
        wards: {
          ...mockElectionsData.wards,
          'Empty Ward': { history: [], current_holders: [], seats: 3 },
        },
      }
      setupMocks({ electionsData: noHistory })
      renderComponent()
      // Select the empty ward
      const select = screen.getByLabelText(/select a ward/i)
      fireEvent.change(select, { target: { value: 'Empty Ward' } })
      expect(screen.getByText(/no election history for this ward/i)).toBeInTheDocument()
    })

    it('handles elections data with no turnout trends', () => {
      const noTurnout = { ...mockElectionsData, turnout_trends: [] }
      setupMocks({ electionsData: noTurnout })
      renderComponent()
      // Should render without crashing, turnout section simply hidden
      expect(screen.getByText('Elections')).toBeInTheDocument()
    })

    it('handles elections data with no council history', () => {
      const noHistory = { ...mockElectionsData, council_history: [] }
      setupMocks({ electionsData: noHistory })
      renderComponent()
      // Should render without crashing
      expect(screen.getByText('Elections')).toBeInTheDocument()
    })

    it('handles politics summary with numeric party values', () => {
      const numericSummary = {
        total_councillors: 45,
        parties: { Labour: 23, Conservative: 10 },
      }
      setupMocks({ electionsData: mockElectionsData, politicsSummary: numericSummary })
      renderComponent()
      expect(screen.getByText('Current Council Composition')).toBeInTheDocument()
    })

    it('handles empty wards object', () => {
      const emptyWards = { ...mockElectionsData, wards: {} }
      setupMocks({ electionsData: emptyWards })
      renderComponent()
      // Ward selector should exist but have no ward options
      const select = screen.getByLabelText(/select a ward/i)
      expect(select.options.length).toBe(1) // Just the default "-- Choose a ward --"
    })
  })
})
