import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Elections from './Elections'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

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
    { year: 2024, seats: { Labour: 23, Conservative: 10, Independent: 8, 'Liberal Democrats': 4 } },
    { year: 2023, seats: { Labour: 22, Conservative: 11, Independent: 8, 'Liberal Democrats': 4 } },
  ],
  turnout_trends: [
    { year: 2024, turnout: 0.30 },
    { year: 2023, turnout: 0.28 },
  ],
}

const mockReferenceData = {
  national_polling: {
    Labour: 0.29, Conservative: 0.24, 'Reform UK': 0.22,
    'Liberal Democrats': 0.12, 'Green Party': 0.07,
  },
  ge2024_result: {
    Labour: 0.337, Conservative: 0.237, 'Reform UK': 0.143,
    'Liberal Democrats': 0.122, 'Green Party': 0.069,
  },
  lcc_2025: { results: { 'Reform UK': { pct: 0.357 } } },
}

const mockCouncillorsData = [
  { name: 'Alice Smith', ward: 'Bank Hall', party: 'Labour' },
]

const mockPoliticsSummary = {
  total_councillors: 45,
  by_party: [
    { party: 'Labour', count: 23 },
    { party: 'Conservative', count: 10 },
    { party: 'Independent', count: 8 },
    { party: 'Liberal Democrats', count: 4 },
  ],
}

// Helper: mock useData to return different values for different paths
function setupMocks({ electionsData = null, referenceData = null, loading = false, error = null } = {}) {
  useData.mockImplementation((path) => {
    if (Array.isArray(path)) {
      if (path[0] === '/data/elections.json') {
        return {
          data: electionsData ? [electionsData, referenceData || mockReferenceData, mockCouncillorsData, mockPoliticsSummary] : null,
          loading,
          error,
        }
      }
      // Optional data (demographics, deprivation)
      return { data: [null, null], loading: false, error: null }
    }
    // Single-file loads (lgr, polling, constituencies, model_coefficients)
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

describe('Elections', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

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

  it('renders the page heading with data', () => {
    setupMocks({ electionsData: mockElectionsData })
    renderComponent()
    expect(screen.getByText('Elections')).toBeInTheDocument()
  })

  it('renders section navigation with expected buttons', () => {
    setupMocks({ electionsData: mockElectionsData })
    renderComponent()
    const nav = screen.getByRole('navigation', { name: /election page sections/i })
    expect(nav).toBeInTheDocument()
    expect(within(nav).getByText('Predictions')).toBeInTheDocument()
    expect(within(nav).getByText('Coalitions')).toBeInTheDocument()
    expect(within(nav).getByText('LGR Projections')).toBeInTheDocument()
  })

  it('shows next election date when available', () => {
    setupMocks({ electionsData: mockElectionsData })
    renderComponent()
    // Date appears in overview card and predictions heading
    const dateElements = screen.getAllByText(/7 May 2026/i)
    expect(dateElements.length).toBeGreaterThanOrEqual(1)
  })

  it('displays seat and ward counts in subtitle', () => {
    setupMocks({ electionsData: mockElectionsData })
    renderComponent()
    const subtitle = screen.getByText(/45 seats across 15 wards/i)
    expect(subtitle).toBeInTheDocument()
  })

  it('shows election cycle information', () => {
    setupMocks({ electionsData: mockElectionsData })
    renderComponent()
    expect(screen.getByText(/one-third of seats each year/i)).toBeInTheDocument()
  })

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
})
