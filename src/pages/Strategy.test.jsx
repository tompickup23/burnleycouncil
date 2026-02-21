import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  council_tier: 'district',
  data_sources: { elections: true },
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
      history: [{
        date: '2024-05-02', year: 2024, type: 'borough',
        electorate: 6234, turnout: 0.28, turnout_votes: 1746,
        candidates: [
          { name: 'A', party: 'Labour', votes: 600, pct: 0.344, elected: true },
          { name: 'B', party: 'Conservative', votes: 400, pct: 0.229, elected: false },
          { name: 'C', party: 'Reform UK', votes: 350, pct: 0.200, elected: false },
        ],
      }],
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

function renderComponent() {
  return render(
    <MemoryRouter initialEntries={['/strategy']}>
      <Strategy />
    </MemoryRouter>
  )
}

describe('Strategy', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
  })

  it('shows loading state while data loads', () => {
    useData.mockReturnValue({ data: null, loading: true, error: null })
    renderComponent()
    expect(screen.getByText(/loading strategy data/i)).toBeInTheDocument()
  })

  it('shows error state when data fails to load', () => {
    useData.mockReturnValue({ data: null, loading: false, error: new Error('fail') })
    renderComponent()
    expect(screen.getByText(/unable to load strategy data/i)).toBeInTheDocument()
  })

  it('shows no upcoming elections when wards_up is empty', () => {
    const emptyElections = { ...mockElectionsData, meta: { next_election: { wards_up: [] } } }
    useData
      .mockReturnValueOnce({ data: [emptyElections, mockReferenceData, mockPoliticsSummary], loading: false, error: null })
      .mockReturnValue({ data: [null, null], loading: false, error: null })
    renderComponent()
    expect(screen.getByText(/no upcoming elections/i)).toBeInTheDocument()
  })

  it('renders strategy dashboard with election data', () => {
    useData
      .mockReturnValueOnce({ data: [mockElectionsData, mockReferenceData, mockPoliticsSummary], loading: false, error: null })
      .mockReturnValue({ data: [null, null], loading: false, error: null })
    renderComponent()
    expect(screen.getByText(/Burnley Strategy Engine/i)).toBeInTheDocument()
    expect(screen.getByText(/2 wards up for election/i)).toBeInTheDocument()
  })

  it('renders party selector with Reform UK as default', () => {
    useData
      .mockReturnValueOnce({ data: [mockElectionsData, mockReferenceData, mockPoliticsSummary], loading: false, error: null })
      .mockReturnValue({ data: [null, null], loading: false, error: null })
    renderComponent()
    const select = screen.getByLabelText(/strategise for/i)
    expect(select).toBeInTheDocument()
    expect(select.value).toBe('Reform UK')
  })

  it('shows restricted access banner', () => {
    useData
      .mockReturnValueOnce({ data: [mockElectionsData, mockReferenceData, mockPoliticsSummary], loading: false, error: null })
      .mockReturnValue({ data: [null, null], loading: false, error: null })
    renderComponent()
    expect(screen.getByText(/strategist access only/i)).toBeInTheDocument()
  })
})
