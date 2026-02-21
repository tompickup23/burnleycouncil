import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Strategy from './Strategy'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="chart">{children}</div>,
  BarChart: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  PieChart: () => null,
  Pie: () => null,
  Cell: () => null,
}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  council_tier: 'district',
  data_sources: { elections: true },
}

const mockCountyConfig = {
  ...mockConfig,
  council_id: 'lancashire_cc',
  council_name: 'Lancashire CC',
  council_tier: 'county',
}

const mockElectionsData = {
  meta: {
    next_election: {
      date: '2026-05-07',
      type: 'borough_thirds',
      seats_up: 15,
      wards_up: ['Bank Hall', 'Briercliffe'],
      defenders: {
        'Bank Hall': { party: 'Labour' },
        'Briercliffe': { party: 'Conservative' },
      },
    },
  },
  wards: {
    'Bank Hall': {
      current_holders: [{ name: 'A', party: 'Labour' }],
      history: [
        {
          date: '2024-05-02', year: 2024, type: 'borough',
          electorate: 6234, turnout: 0.28, turnout_votes: 1746,
          candidates: [
            { name: 'A', party: 'Labour', votes: 600, pct: 0.344, elected: true },
            { name: 'B', party: 'Conservative', votes: 400, pct: 0.229, elected: false },
            { name: 'C', party: 'Reform UK', votes: 350, pct: 0.200, elected: false },
          ],
        },
        {
          date: '2022-05-05', year: 2022, type: 'borough',
          electorate: 6100, turnout: 0.25, turnout_votes: 1525,
          candidates: [
            { name: 'A', party: 'Labour', votes: 550, pct: 0.360, elected: true },
            { name: 'B', party: 'Conservative', votes: 500, pct: 0.328, elected: false },
          ],
        },
      ],
    },
    'Briercliffe': {
      current_holders: [{ name: 'D', party: 'Conservative' }],
      history: [{
        date: '2024-05-02', year: 2024, type: 'borough',
        electorate: 5000, turnout: 0.35, turnout_votes: 1750,
        candidates: [
          { name: 'D', party: 'Conservative', votes: 550, pct: 0.314, elected: true },
          { name: 'E', party: 'Labour', votes: 500, pct: 0.286, elected: false },
          { name: 'F', party: 'Reform UK', votes: 400, pct: 0.229, elected: false },
        ],
      }],
    },
    'Other Ward': {
      current_holders: [{ name: 'G', party: 'Labour' }],
      history: [],
    },
  },
}

const mockReferenceData = {
  national_polling: {
    parties: { Labour: 0.29, Conservative: 0.24, 'Reform UK': 0.22 },
    ge2024_result: { Labour: 0.337, Conservative: 0.237, 'Reform UK': 0.143 },
  },
  party_colors: {},
}

const mockPoliticsSummary = {
  total_councillors: 45,
  majority_threshold: 23,
  by_party: [
    { party: 'Labour', count: 11 },
    { party: 'Conservative', count: 10 },
    { party: 'Reform UK', count: 5 },
    { party: 'Liberal Democrats', count: 7 },
    { party: 'Independent', count: 12 },
  ],
}

const mockDemographics = {
  wards: {
    BH001: {
      name: 'Bank Hall',
      age: { 'Total: All usual residents': 5000, 'Aged 65 to 74 years': 500, 'Aged 75 to 84 years': 300, 'Aged 85 years and over': 100 },
      ethnicity: { 'White: English, Welsh, Scottish, Northern Irish or British': 4000 },
      economic_activity: { 'Total: All usual residents aged 16 years and over': 4000, 'Unemployed': 200 },
    },
  },
}

const mockDeprivation = {
  wards: {
    'Bank Hall': { avg_imd_decile: 2, avg_imd_score: 40 },
    'Briercliffe': { avg_imd_decile: 5, avg_imd_score: 20 },
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockCouncillorsData = [
  { id: 'c1', name: 'John Smith', party: 'Labour', ward: 'Bank Hall', roles: [] },
  { id: 'c2', name: 'Jane Doe', party: 'Conservative', ward: 'Briercliffe', roles: [{ role: 'Executive Member' }] },
]

const mockIntegrityData = {
  councillors: [
    { councillor_id: 'c1', name: 'John Smith', integrity_score: 80, risk_level: 'low', red_flags: [], total_directorships: 1 },
    { councillor_id: 'c2', name: 'Jane Doe', integrity_score: 60, risk_level: 'elevated', red_flags: [{ description: 'Late filing' }], total_directorships: 3 },
  ],
}

const mockInterestsData = {
  councillors: {
    c1: { name: 'John Smith', declared_companies: ['Smith Ltd'], declared_employment: [], declared_securities: [] },
  },
}

const mockDogeFindings = {
  fraud_triangle: { overall_score: 71, risk_level: 'elevated' },
  findings: [{ label: 'Likely Duplicate Payments', value: '£510K', severity: 'critical' }],
}

const mockBudgetSummary = {
  reserves: { total_opening: 27000000, total_closing: 26500000 },
  council_tax: { band_d_by_year: { '2023-24': 250, '2024-25': 268 } },
}

const mockCollectionRates = { latest_rate: 94.04, trend_direction: 'declining', five_year_avg: 93.56 }

const mockConstituenciesData = {
  constituencies: [{
    name: 'Burnley',
    mp: { name: 'Oliver Ryan', party: 'Labour', expenses: { total_claimed: 235000, rank_of_650: 299 } },
    ge2024: { results: [{ party: 'Reform UK', pct: 0.248, votes: 9259 }, { party: 'Labour', pct: 0.435, votes: 16243 }] },
    voting_record: { rebellions: 0, total_divisions: 100 },
    claimant_count: [{ claimant_rate_pct: 5.6, claimant_count: 3945 }],
  }],
}

const mockWardConstituencyMap = {
  'Bank Hall': { constituency_name: 'Burnley' },
  'Briercliffe': { constituency_name: 'Burnley' },
}

function setupMocks(opts = {}) {
  const {
    elections = mockElectionsData,
    reference = mockReferenceData,
    politics = mockPoliticsSummary,
    demographics = mockDemographics,
    deprivation = mockDeprivation,
    config = mockConfig,
    councillors = mockCouncillorsData,
    integrity = mockIntegrityData,
    interests = mockInterestsData,
    dogeFindings = mockDogeFindings,
    budgetSummary = mockBudgetSummary,
    collectionRates = mockCollectionRates,
    constituencies = mockConstituenciesData,
    wardMap = mockWardConstituencyMap,
  } = opts

  useCouncilConfig.mockReturnValue(config)

  // Use mockImplementation so re-renders return the correct data based on URL argument
  useData.mockImplementation((urls) => {
    if (Array.isArray(urls) && urls[0] === '/data/elections.json') {
      return { data: [elections, reference, politics], loading: false, error: null }
    }
    if (Array.isArray(urls) && urls[0] === '/data/councillors.json') {
      return { data: [councillors, integrity, interests, dogeFindings, budgetSummary, collectionRates, constituencies, wardMap], loading: false, error: null }
    }
    return { data: [demographics, deprivation], loading: false, error: null }
  })
}

function renderComponent() {
  return render(
    <MemoryRouter initialEntries={['/strategy']}>
      <Strategy />
    </MemoryRouter>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Strategy', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // Mock URL.createObjectURL/revokeObjectURL for CSV export
    global.URL.createObjectURL = vi.fn(() => 'blob:test')
    global.URL.revokeObjectURL = vi.fn()
  })

  // =========================================================================
  // Loading / Error states
  // =========================================================================

  describe('loading and error states', () => {
    it('shows loading state while data loads', () => {
      useCouncilConfig.mockReturnValue(mockConfig)
      useData.mockReturnValue({ data: null, loading: true, error: null })
      renderComponent()
      expect(screen.getByText(/loading strategy data/i)).toBeInTheDocument()
    })

    it('shows error state when data fails to load', () => {
      useCouncilConfig.mockReturnValue(mockConfig)
      useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
      renderComponent()
      expect(screen.getByText(/unable to load strategy data/i)).toBeInTheDocument()
    })

    it('shows no upcoming elections when wards_up is empty', () => {
      const emptyElections = { ...mockElectionsData, meta: { next_election: { wards_up: [] } } }
      useCouncilConfig.mockReturnValue(mockConfig)
      useData
        .mockReturnValueOnce({ data: [emptyElections, mockReferenceData, mockPoliticsSummary], loading: false, error: null })
        .mockReturnValue({ data: [null, null], loading: false, error: null })
      renderComponent()
      expect(screen.getByText(/no upcoming elections/i)).toBeInTheDocument()
    })

    it('shows no upcoming elections when wards data is missing', () => {
      const noWards = { meta: { next_election: { wards_up: ['A'] } } }
      useCouncilConfig.mockReturnValue(mockConfig)
      useData
        .mockReturnValueOnce({ data: [noWards, mockReferenceData, mockPoliticsSummary], loading: false, error: null })
        .mockReturnValue({ data: [null, null], loading: false, error: null })
      renderComponent()
      expect(screen.getByText(/no upcoming elections/i)).toBeInTheDocument()
    })
  })

  // =========================================================================
  // Header & Navigation
  // =========================================================================

  describe('header and navigation', () => {
    it('renders strategy dashboard with council name', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/Burnley Strategy Engine/i)).toBeInTheDocument()
    })

    it('shows ward count in subtitle', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/2 wards up for election/i)).toBeInTheDocument()
    })

    it('shows election date in subtitle', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/7 May 2026/)).toBeInTheDocument()
    })

    it('renders party selector with Reform UK as default', () => {
      setupMocks()
      renderComponent()
      const select = screen.getByLabelText(/strategise for/i)
      expect(select).toBeInTheDocument()
      expect(select.value).toBe('Reform UK')
    })

    it('shows restricted access banner', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/strategist access only/i)).toBeInTheDocument()
    })

    it('renders all 8 section nav buttons', () => {
      setupMocks()
      renderComponent()
      const nav = document.querySelector('.strategy-section-nav')
      const navScope = within(nav)
      expect(navScope.getByText('Dashboard')).toBeInTheDocument()
      expect(navScope.getByText('Battlegrounds')).toBeInTheDocument()
      expect(navScope.getByText('Ward Dossiers')).toBeInTheDocument()
      expect(navScope.getByText('Path to Control')).toBeInTheDocument()
      expect(navScope.getByText('Vulnerable Seats')).toBeInTheDocument()
      expect(navScope.getByText('Swing History')).toBeInTheDocument()
      expect(navScope.getByText('Resources')).toBeInTheDocument()
      expect(navScope.getByText('Ward Archetypes')).toBeInTheDocument()
    })

    it('uses Division label for county councils', () => {
      setupMocks({ config: mockCountyConfig })
      renderComponent()
      expect(screen.getByText(/2 divisions up for election/i)).toBeInTheDocument()
    })

    it('changes party when select value changes', () => {
      setupMocks()
      renderComponent()
      const select = screen.getByLabelText(/strategise for/i)
      fireEvent.change(select, { target: { value: 'Labour' } })
      expect(select.value).toBe('Labour')
    })

    it('populates party list from politicsSummary', () => {
      setupMocks()
      renderComponent()
      const select = screen.getByLabelText(/strategise for/i)
      const options = Array.from(select.querySelectorAll('option'))
      expect(options.length).toBe(5) // Labour, Conservative, Reform UK, Lib Dems, Independent
    })
  })

  // =========================================================================
  // Dashboard section
  // =========================================================================

  describe('dashboard section', () => {
    it('shows dashboard as default section', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Strategy Dashboard')).toBeInTheDocument()
    })

    it('shows stat cards with numeric values', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Current Seats')).toBeInTheDocument()
      expect(screen.getByText('Majority Threshold')).toBeInTheDocument()
      expect(screen.getByText('Top Opportunities')).toBeInTheDocument()
      // "Vulnerable Seats" appears as both stat-label and nav button; scope to stat grid
      const statGrid = document.querySelector('.strategy-stat-grid')
      expect(within(statGrid).getByText('Vulnerable Seats')).toBeInTheDocument()
    })

    it('shows seats needed or majority achieved', () => {
      setupMocks()
      renderComponent()
      // Reform UK has 5 seats, needs 23 for majority
      expect(screen.getByText('Seats Needed')).toBeInTheDocument()
    })

    it('shows wards contested stat', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Wards Contested')).toBeInTheDocument()
    })

    it('renders pie chart and bar chart containers', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText('Ward Classification')).toBeInTheDocument()
      expect(screen.getByText(/Top 10 Priority Ward/i)).toBeInTheDocument()
      expect(screen.getAllByTestId('chart').length).toBeGreaterThanOrEqual(2)
    })
  })

  // =========================================================================
  // Battlegrounds section
  // =========================================================================

  describe('battlegrounds section', () => {
    it('renders battlegrounds table on nav click', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Battlegrounds'))
      expect(screen.getByRole('heading', { level: 2, name: /Battleground Ward/ })).toBeInTheDocument()
    })

    it('shows all contested wards in table', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Battlegrounds'))
      expect(screen.getByText('Bank Hall')).toBeInTheDocument()
      expect(screen.getByText('Briercliffe')).toBeInTheDocument()
    })

    it('shows table headers', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Battlegrounds'))
      expect(screen.getByText('Class')).toBeInTheDocument()
      expect(screen.getByText('Predicted Winner')).toBeInTheDocument()
      expect(screen.getByText('Our Share')).toBeInTheDocument()
      expect(screen.getByText('Swing Req')).toBeInTheDocument()
      expect(screen.getByText('Win Prob')).toBeInTheDocument()
      expect(screen.getByText('Turnout')).toBeInTheDocument()
      expect(screen.getByText('Score')).toBeInTheDocument()
    })

    it('expands ward row to show talking points on click', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Battlegrounds'))
      // Click on the first ward row
      const wardRow = screen.getByText('Bank Hall').closest('tr')
      fireEvent.click(wardRow)
      expect(screen.getByText(/Talking Points for Bank Hall/)).toBeInTheDocument()
    })

    it('shows rank number for each ward', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Battlegrounds'))
      // Rank 1 and 2 should be visible
      const cells = document.querySelectorAll('.rank')
      expect(cells.length).toBeGreaterThanOrEqual(2)
    })

    it('ward row has keyboard navigation', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Battlegrounds'))
      const wardRow = screen.getByText('Bank Hall').closest('tr')
      expect(wardRow.getAttribute('role')).toBe('button')
      expect(wardRow.getAttribute('tabindex')).toBe('0')
    })

    it('ward row has aria-expanded attribute', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Battlegrounds'))
      const wardRow = screen.getByText('Bank Hall').closest('tr')
      expect(wardRow.getAttribute('aria-expanded')).toBe('false')
      fireEvent.click(wardRow)
      expect(wardRow.getAttribute('aria-expanded')).toBe('true')
    })
  })

  // =========================================================================
  // Path to Control section
  // =========================================================================

  describe('path to control section', () => {
    it('renders path to control section on nav click', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Path to Control'))
      expect(screen.getByRole('heading', { level: 2, name: /Path to Control/ })).toBeInTheDocument()
    })

    it('shows seats summary text', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Path to Control'))
      // Should mention current seats and majority threshold
      expect(screen.getByText(/currently holds/)).toBeInTheDocument()
      expect(screen.getByText(/Majority requires/)).toBeInTheDocument()
    })

    it('shows top gain targets', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Path to Control'))
      expect(screen.getByText('Top Gain Targets')).toBeInTheDocument()
    })

    it('shows majority achieved when party has enough seats', () => {
      const bigReform = {
        ...mockPoliticsSummary,
        by_party: [
          { party: 'Reform UK', count: 30 },
          { party: 'Labour', count: 15 },
        ],
      }
      setupMocks({ politics: bigReform })
      renderComponent()
      fireEvent.click(screen.getByText('Path to Control'))
      expect(screen.getByText(/already holds a majority/)).toBeInTheDocument()
    })
  })

  // =========================================================================
  // Vulnerable Seats section
  // =========================================================================

  describe('vulnerable seats section', () => {
    it('renders vulnerable seats section', () => {
      setupMocks()
      renderComponent()
      const nav = document.querySelector('.strategy-section-nav')
      fireEvent.click(within(nav).getByText('Vulnerable Seats'))
      expect(screen.getByRole('heading', { level: 2, name: /Vulnerable Seats/ })).toBeInTheDocument()
    })

    it('shows empty state when no vulnerable seats', () => {
      setupMocks()
      renderComponent()
      const nav = document.querySelector('.strategy-section-nav')
      fireEvent.click(within(nav).getByText('Vulnerable Seats'))
      // Reform UK doesn't defend any of the 2 wards in our mock data
      expect(screen.getByText(/strong defensive position/i)).toBeInTheDocument()
    })
  })

  // =========================================================================
  // Swing History section (Phase 18d)
  // =========================================================================

  describe('swing history section', () => {
    it('renders swing history section on nav click', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Swing History'))
      expect(screen.getByRole('heading', { level: 2, name: /Historical Swing Analysis/ })).toBeInTheDocument()
    })

    it('shows description mentioning the party', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Swing History'))
      expect(screen.getByText(/Reform UK vote share trends/)).toBeInTheDocument()
    })

    it('shows swing cards for each contested ward', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Swing History'))
      expect(screen.getByText('Bank Hall')).toBeInTheDocument()
      expect(screen.getByText('Briercliffe')).toBeInTheDocument()
    })

    it('shows trend badges', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Swing History'))
      // Should have at least one trend badge
      const badges = document.querySelectorAll('.swing-trend-badge')
      expect(badges.length).toBeGreaterThanOrEqual(2)
    })

    it('shows sparkline bars for wards with history', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Swing History'))
      const bars = document.querySelectorAll('.spark-bar')
      expect(bars.length).toBeGreaterThan(0)
    })

    it('shows swing card metadata (class, score, volatility)', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Swing History'))
      const metas = document.querySelectorAll('.swing-card-meta')
      expect(metas.length).toBeGreaterThanOrEqual(2)
    })

    it('shows footer with latest pct and avg swing', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Swing History'))
      const footers = document.querySelectorAll('.swing-card-footer')
      expect(footers.length).toBeGreaterThanOrEqual(1) // At least wards with history
    })

    it('updates swing history when party changes', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Swing History'))
      // Change to Labour
      const select = screen.getByLabelText(/strategise for/i)
      fireEvent.change(select, { target: { value: 'Labour' } })
      expect(screen.getByText(/Labour vote share trends/)).toBeInTheDocument()
    })

    it('shows empty state when no history available', () => {
      const noHistory = {
        ...mockElectionsData,
        wards: {
          'Empty Ward': { current_holders: [], history: [] },
        },
        meta: { next_election: { ...mockElectionsData.meta.next_election, wards_up: ['Empty Ward'] } },
      }
      setupMocks({ elections: noHistory })
      renderComponent()
      fireEvent.click(screen.getByText('Swing History'))
      // Should still render a card but with "No election history" text
      expect(screen.getByText(/no election history/i)).toBeInTheDocument()
    })

    it('uses Division label for county config', () => {
      setupMocks({ config: mockCountyConfig })
      renderComponent()
      fireEvent.click(screen.getByText('Swing History'))
      // "Division" appears in both subtitle and section desc; check that at least one is present
      expect(screen.getAllByText(/division/i).length).toBeGreaterThanOrEqual(1)
    })
  })

  // =========================================================================
  // Resource Allocation section (Phase 18d)
  // =========================================================================

  describe('resource allocation section', () => {
    it('renders resource allocation section on nav click', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Resources'))
      expect(screen.getByRole('heading', { level: 2, name: /Resource Allocation/ })).toBeInTheDocument()
    })

    it('shows total hours slider', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Resources'))
      expect(screen.getByLabelText(/total campaign hours/i)).toBeInTheDocument()
    })

    it('shows default 1,000 hours', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Resources'))
      expect(screen.getByText('1,000 hrs')).toBeInTheDocument()
    })

    it('updates hours when slider changes', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Resources'))
      const slider = screen.getByLabelText(/total campaign hours/i)
      fireEvent.change(slider, { target: { value: '2000' } })
      expect(screen.getByText('2,000 hrs')).toBeInTheDocument()
    })

    it('shows export CSV button', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Resources'))
      expect(screen.getByText('Export CSV')).toBeInTheDocument()
    })

    it('shows stat cards (high ROI, total hours, est. votes)', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Resources'))
      expect(screen.getByText(/High ROI/)).toBeInTheDocument()
      expect(screen.getByText('Total Hours')).toBeInTheDocument()
      expect(screen.getByText(/Est. Incremental Votes/)).toBeInTheDocument()
    })

    it('shows resource allocation table', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Resources'))
      expect(screen.getByText('Hours')).toBeInTheDocument()
      expect(screen.getByText('% of Total')).toBeInTheDocument()
      expect(screen.getByText('Est. Votes')).toBeInTheDocument()
      expect(screen.getByText('Cost/Vote')).toBeInTheDocument()
      expect(screen.getByText('ROI')).toBeInTheDocument()
    })

    it('shows ward names in resource table', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Resources'))
      expect(screen.getByText('Bank Hall')).toBeInTheDocument()
      expect(screen.getByText('Briercliffe')).toBeInTheDocument()
    })

    it('shows bar chart for hours per ward', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Resources'))
      expect(screen.getByText(/Hours per Ward/i)).toBeInTheDocument()
      expect(screen.getAllByTestId('chart').length).toBeGreaterThanOrEqual(1)
    })

    it('CSV export triggers download', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Resources'))
      const createElementSpy = vi.spyOn(document, 'createElement')
      fireEvent.click(screen.getByText('Export CSV'))
      expect(global.URL.createObjectURL).toHaveBeenCalled()
      expect(global.URL.revokeObjectURL).toHaveBeenCalled()
      createElementSpy.mockRestore()
    })

    it('uses Division label for county config in resource section', () => {
      setupMocks({ config: mockCountyConfig })
      renderComponent()
      fireEvent.click(screen.getByText('Resources'))
      expect(screen.getByText(/contested division/i)).toBeInTheDocument()
    })
  })

  // =========================================================================
  // Ward Archetypes section
  // =========================================================================

  describe('ward archetypes section', () => {
    it('renders archetypes section on nav click', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Archetypes'))
      expect(screen.getByRole('heading', { level: 2, name: /Ward Archetypes/ })).toBeInTheDocument()
    })

    it('shows archetype cards for each ward', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Archetypes'))
      expect(screen.getByText('Bank Hall')).toBeInTheDocument()
      expect(screen.getByText('Briercliffe')).toBeInTheDocument()
    })

    it('shows archetype labels and descriptions', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Archetypes'))
      const cards = document.querySelectorAll('.archetype-card')
      expect(cards.length).toBe(2)
      // Each card should have label and description
      for (const card of cards) {
        expect(card.querySelector('.archetype-label')).toBeTruthy()
        expect(card.querySelector('.archetype-desc')).toBeTruthy()
      }
    })
  })

  // =========================================================================
  // Section navigation
  // =========================================================================

  describe('section navigation', () => {
    it('switches sections when nav buttons clicked', () => {
      setupMocks()
      renderComponent()
      // Start on dashboard
      expect(screen.getByText('Strategy Dashboard')).toBeInTheDocument()
      // Switch to battlegrounds
      fireEvent.click(screen.getByText('Battlegrounds'))
      expect(screen.queryByText('Strategy Dashboard')).not.toBeInTheDocument()
      // Switch to swing history
      fireEvent.click(screen.getByText('Swing History'))
      expect(screen.getByText(/Historical Swing Analysis/)).toBeInTheDocument()
      // Switch to resources
      fireEvent.click(screen.getByText('Resources'))
      expect(screen.getByText(/Resource Allocation/)).toBeInTheDocument()
    })

    it('highlights active section button', () => {
      setupMocks()
      renderComponent()
      const dashBtn = screen.getByText('Dashboard').closest('button')
      expect(dashBtn.className).toContain('active')
      const bgBtn = screen.getByText('Battlegrounds').closest('button')
      expect(bgBtn.className).not.toContain('active')
    })

    it('sets aria-current on active nav button', () => {
      setupMocks()
      renderComponent()
      const dashBtn = screen.getByText('Dashboard').closest('button')
      expect(dashBtn.getAttribute('aria-current')).toBe('true')
    })
  })

  // =========================================================================
  // Footer
  // =========================================================================

  describe('footer', () => {
    it('shows engine attribution footer', () => {
      setupMocks()
      renderComponent()
      expect(screen.getByText(/strategy engine powered by/i)).toBeInTheDocument()
    })
  })

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('handles null optional data gracefully', () => {
      setupMocks({ demographics: null, deprivation: null })
      renderComponent()
      expect(screen.getByText(/Burnley Strategy Engine/i)).toBeInTheDocument()
    })

    it('handles missing politics_summary gracefully', () => {
      setupMocks({ politics: null })
      renderComponent()
      expect(screen.getByText(/Burnley Strategy Engine/i)).toBeInTheDocument()
    })

    it('handles empty by_party list', () => {
      setupMocks({ politics: { total_councillors: 0, by_party: [] } })
      renderComponent()
      // Should fall back to default party list in selector
      const select = screen.getByLabelText(/strategise for/i)
      expect(select).toBeInTheDocument()
    })

    it('sets page title on mount', () => {
      setupMocks()
      renderComponent()
      expect(document.title).toContain('Strategy')
      expect(document.title).toContain('Burnley')
    })
  })

  // =========================================================================
  // Ward Dossiers section (Phase 18e)
  // =========================================================================

  describe('ward dossiers section', () => {
    it('renders ward dossiers section on nav click', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Dossiers'))
      expect(screen.getByRole('heading', { level: 2, name: /Ward Dossiers/ })).toBeInTheDocument()
    })

    it('shows ward selection grid', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Dossiers'))
      const cards = document.querySelectorAll('.dossier-ward-card')
      expect(cards.length).toBe(2) // Bank Hall + Briercliffe
    })

    it('shows ward names in selection grid', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Dossiers'))
      expect(screen.getByText('Bank Hall')).toBeInTheDocument()
      expect(screen.getByText('Briercliffe')).toBeInTheDocument()
    })

    it('opens dossier view when ward card clicked', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Dossiers'))
      const bankHallCard = screen.getByText('Bank Hall').closest('.dossier-ward-card')
      fireEvent.click(bankHallCard)
      // Should show dossier header with ward name
      expect(screen.getByRole('heading', { level: 2, name: 'Bank Hall' })).toBeInTheDocument()
    })

    it('shows back button in dossier view', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Dossiers'))
      const bankHallCard = screen.getByText('Bank Hall').closest('.dossier-ward-card')
      fireEvent.click(bankHallCard)
      expect(screen.getByText(/All Wards/)).toBeInTheDocument()
    })

    it('returns to grid when back button clicked', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Dossiers'))
      const bankHallCard = screen.getByText('Bank Hall').closest('.dossier-ward-card')
      fireEvent.click(bankHallCard)
      // Click back
      fireEvent.click(screen.getByText(/All Wards/))
      // Should show grid again
      expect(document.querySelectorAll('.dossier-ward-card').length).toBe(2)
    })

    it('shows dossier tabs', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Dossiers'))
      const bankHallCard = screen.getByText('Bank Hall').closest('.dossier-ward-card')
      fireEvent.click(bankHallCard)
      const tabBar = document.querySelector('.dossier-tab-bar')
      expect(tabBar).toBeTruthy()
      expect(within(tabBar).getByText('Profile')).toBeInTheDocument()
      expect(within(tabBar).getByText('Election')).toBeInTheDocument()
      expect(within(tabBar).getByText('Councillors')).toBeInTheDocument()
      expect(within(tabBar).getByText('Council')).toBeInTheDocument()
      expect(within(tabBar).getByText('Constituency')).toBeInTheDocument()
      expect(within(tabBar).getByText('Talking Points')).toBeInTheDocument()
      expect(within(tabBar).getByText('Cheat Sheet')).toBeInTheDocument()
    })

    it('shows profile tab by default with ward stats', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Dossiers'))
      const bankHallCard = screen.getByText('Bank Hall').closest('.dossier-ward-card')
      fireEvent.click(bankHallCard)
      expect(screen.getByText('Ward Profile')).toBeInTheDocument()
      expect(screen.getByText('Population')).toBeInTheDocument()
      expect(screen.getByText('Electorate')).toBeInTheDocument()
    })

    it('switches to election tab', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Dossiers'))
      const bankHallCard = screen.getByText('Bank Hall').closest('.dossier-ward-card')
      fireEvent.click(bankHallCard)
      const tabBar = document.querySelector('.dossier-tab-bar')
      fireEvent.click(within(tabBar).getByText('Election'))
      expect(screen.getByText('Election Intelligence')).toBeInTheDocument()
    })

    it('shows councillor attack lines in councillors tab', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Dossiers'))
      const bankHallCard = screen.getByText('Bank Hall').closest('.dossier-ward-card')
      fireEvent.click(bankHallCard)
      const tabBar = document.querySelector('.dossier-tab-bar')
      fireEvent.click(within(tabBar).getByText('Councillors'))
      expect(screen.getByText('Councillor Dossiers')).toBeInTheDocument()
      // Should show attack lines
      const attackLines = document.querySelectorAll('.attack-line')
      expect(attackLines.length).toBeGreaterThan(0)
    })

    it('shows council performance tab with fraud triangle', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Dossiers'))
      const bankHallCard = screen.getByText('Bank Hall').closest('.dossier-ward-card')
      fireEvent.click(bankHallCard)
      const tabBar = document.querySelector('.dossier-tab-bar')
      fireEvent.click(within(tabBar).getByText('Council'))
      expect(screen.getByText('Council Performance')).toBeInTheDocument()
      expect(screen.getByText('Fraud Triangle')).toBeInTheDocument()
    })

    it('shows constituency tab with MP data', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Dossiers'))
      const bankHallCard = screen.getByText('Bank Hall').closest('.dossier-ward-card')
      fireEvent.click(bankHallCard)
      const tabBar = document.querySelector('.dossier-tab-bar')
      fireEvent.click(within(tabBar).getByText('Constituency'))
      expect(screen.getByText(/Burnley Constituency/)).toBeInTheDocument()
      expect(screen.getByText(/Oliver Ryan/)).toBeInTheDocument()
    })

    it('shows talking points tab with categories', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Dossiers'))
      const bankHallCard = screen.getByText('Bank Hall').closest('.dossier-ward-card')
      fireEvent.click(bankHallCard)
      const tabBar = document.querySelector('.dossier-tab-bar')
      fireEvent.click(within(tabBar).getByText('Talking Points'))
      // The panel heading says "Talking Points" — use getByRole to disambiguate from tab
      const panel = document.querySelector('.dossier-panel')
      expect(within(panel).getByText('Talking Points')).toBeInTheDocument()
    })

    it('shows cheat sheet tab with print button', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Dossiers'))
      const bankHallCard = screen.getByText('Bank Hall').closest('.dossier-ward-card')
      fireEvent.click(bankHallCard)
      const tabBar = document.querySelector('.dossier-tab-bar')
      fireEvent.click(within(tabBar).getByText('Cheat Sheet'))
      expect(screen.getByText('Campaign Cheat Sheet')).toBeInTheDocument()
      expect(screen.getByText('Print')).toBeInTheDocument()
    })

    it('cheat sheet shows key stats', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Dossiers'))
      const bankHallCard = screen.getByText('Bank Hall').closest('.dossier-ward-card')
      fireEvent.click(bankHallCard)
      const tabBar = document.querySelector('.dossier-tab-bar')
      fireEvent.click(within(tabBar).getByText('Cheat Sheet'))
      const cheatStats = document.querySelectorAll('.cheat-stat')
      expect(cheatStats.length).toBeGreaterThan(0)
    })

    it('cheat sheet shows top 5 talking points', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Dossiers'))
      const bankHallCard = screen.getByText('Bank Hall').closest('.dossier-ward-card')
      fireEvent.click(bankHallCard)
      const tabBar = document.querySelector('.dossier-tab-bar')
      fireEvent.click(within(tabBar).getByText('Cheat Sheet'))
      expect(screen.getByText('Top 5 Talking Points')).toBeInTheDocument()
    })

    it('shows score badge in dossier header', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Dossiers'))
      const bankHallCard = screen.getByText('Bank Hall').closest('.dossier-ward-card')
      fireEvent.click(bankHallCard)
      const scoreBadge = document.querySelector('.dossier-score-badge')
      expect(scoreBadge).toBeTruthy()
      expect(scoreBadge.textContent).toContain('Score:')
    })

    it('shows target line in dossier header', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Ward Dossiers'))
      const bankHallCard = screen.getByText('Bank Hall').closest('.dossier-ward-card')
      fireEvent.click(bankHallCard)
      const targetLine = document.querySelector('.dossier-target-line')
      expect(targetLine).toBeTruthy()
      expect(targetLine.textContent).toContain('Target:')
    })

    it('dossier button in battlegrounds table opens dossier', () => {
      setupMocks()
      renderComponent()
      fireEvent.click(screen.getByText('Battlegrounds'))
      const dossierBtns = document.querySelectorAll('.dossier-btn-inline')
      expect(dossierBtns.length).toBeGreaterThan(0)
      fireEvent.click(dossierBtns[0])
      // Should switch to dossiers section
      expect(document.querySelector('.ward-dossier')).toBeTruthy()
    })

    it('handles missing dossier data gracefully', () => {
      setupMocks({ councillors: null, integrity: null, interests: null, dogeFindings: null, budgetSummary: null, collectionRates: null, constituencies: null, wardMap: null })
      renderComponent()
      fireEvent.click(screen.getByText('Ward Dossiers'))
      const bankHallCard = screen.getByText('Bank Hall').closest('.dossier-ward-card')
      fireEvent.click(bankHallCard)
      // Should still render without crashing
      expect(screen.getByRole('heading', { level: 2, name: 'Bank Hall' })).toBeInTheDocument()
    })
  })
})
