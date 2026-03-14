import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Economy from './Economy'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

vi.mock('../utils/strategyEngine', () => ({
  generateEconomyTalkingPoints: vi.fn(() => []),
}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { generateEconomyTalkingPoints } from '../utils/strategyEngine'

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  data_sources: {
    economy: true,
    ward_boundaries: false,
  },
}

const mockEconomy = {
  meta: {
    source: 'Nomis (Claimant Count + ASHE + GDHI + Census 2021)',
    council_id: 'burnley',
    council_name: 'Burnley',
    ons_code: 'E07000117',
    census_date: '2021-03-21',
    generated: '2026-03-09T23:20:26',
  },
  claimant_count: {
    latest: {
      date: '2026-01',
      month: 'January 2026',
      count: 3395,
      rate_pct: 5.6,
    },
    history: [
      { date: '2025-04', month: 'April 2025', count: 3555, rate_pct: 5.8 },
      { date: '2025-05', month: 'May 2025', count: 3490, rate_pct: 5.7 },
      { date: '2025-06', month: 'June 2025', count: 3455, rate_pct: 5.7 },
      { date: '2025-07', month: 'July 2025', count: 3370, rate_pct: 5.5 },
      { date: '2025-08', month: 'August 2025', count: 3355, rate_pct: 5.5 },
      { date: '2025-09', month: 'September 2025', count: 3325, rate_pct: 5.4 },
      { date: '2025-10', month: 'October 2025', count: 3340, rate_pct: 5.5 },
      { date: '2025-11', month: 'November 2025', count: 3340, rate_pct: 5.5 },
      { date: '2025-12', month: 'December 2025', count: 3360, rate_pct: 5.5 },
      { date: '2026-01', month: 'January 2026', count: 3395, rate_pct: 5.6 },
    ],
    wards: {
      E05005150: { name: 'Bank Hall', count: 405, rate_pct: 8.7 },
      E05005151: { name: 'Briercliffe', count: 75, rate_pct: 2.3 },
      E05005155: { name: 'Daneshouse with Stoneyholme', count: 320, rate_pct: 9.1 },
    },
  },
  earnings: {
    median_weekly_pay: 670.0,
    year: '2025',
    median_annual_pay: 33208,
    england_median_weekly: 769.5,
  },
  gdhi: null,
  census: {
    council_totals: {
      industry: {
        'Wholesale & retail trade': 7659,
        'Health & social work': 6870,
        'Manufacturing': 5234,
        'Education': 4120,
        'Construction': 3890,
        'Accommodation & food': 2150,
        'Transport & storage': 1890,
        'Professional & scientific': 1650,
        'Public administration & defence': 1420,
        'Administrative & support': 1380,
      },
      occupation: {
        '1 Managers, directors and senior officials': 3200,
        '2 Professional occupations': 6150,
        '3 Associate professional and technical': 3800,
        '4 Administrative and secretarial': 3400,
        '5 Skilled trades occupations': 3900,
        '6 Caring, leisure and other service': 3700,
        '7 Sales and customer service': 2800,
        '8 Process, plant and machine operatives': 3100,
        '9 Elementary occupations': 4200,
      },
      hours_worked: {
        'Part-time': 11854,
        'Full-time': 28180,
      },
    },
    wards: {
      E05005150: {
        name: 'Bank Hall',
        industry: {
          'Wholesale & retail trade': 520,
          'Health & social work': 480,
          'Manufacturing': 350,
        },
        occupation: {
          '1 Managers, directors and senior officials': 210,
          '2 Professional occupations': 380,
          '3 Associate professional and technical': 250,
        },
        hours_worked: {
          'Part-time': 780,
          'Full-time': 1850,
        },
      },
      E05005155: {
        name: 'Daneshouse with Stoneyholme',
        industry: {
          'Wholesale & retail trade': 480,
          'Health & social work': 520,
          'Manufacturing': 280,
        },
        occupation: {
          '1 Managers, directors and senior officials': 180,
          '2 Professional occupations': 310,
        },
        hours_worked: {
          'Part-time': 820,
          'Full-time': 1620,
        },
      },
      E05005161: {
        name: 'Trinity',
        industry: {
          'Wholesale & retail trade': 440,
          'Health & social work': 390,
        },
        occupation: {
          '1 Managers, directors and senior officials': 190,
          '2 Professional occupations': 340,
        },
        hours_worked: {
          'Part-time': 700,
          'Full-time': 1700,
        },
      },
    },
  },
  summary: {
    claimant_count: 3395,
    claimant_rate_pct: 5.6,
    claimant_trend: 'rising',
    median_weekly_pay: 670.0,
    median_annual_pay: 33208,
    top_industry: 'Wholesale & retail trade',
    top_industry_pct: 19.2,
    professional_pct: 33.8,
    part_time_pct: 29.6,
  },
}

function setupMocks({ economy = mockEconomy, boundaries = null } = {}) {
  useData.mockImplementation((url) => {
    if (url === '/data/economy.json') return { data: economy, loading: !economy && economy !== null, error: null }
    if (url === '/data/ward_boundaries.json') return { data: boundaries, loading: false, error: null }
    if (url === null) return { data: null, loading: false, error: null }
    return { data: null, loading: false, error: null }
  })
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <Economy />
    </MemoryRouter>
  )
}

describe('Economy', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
    generateEconomyTalkingPoints.mockReturnValue([])
  })

  // --- Loading states ---
  it('shows loading state while data loads', () => {
    useData.mockImplementation(() => ({ data: null, loading: true, error: null }))
    renderComponent()
    expect(document.querySelector('.loading-state, [class*="loading"]')).toBeTruthy()
  })

  it('shows error state on data error', () => {
    useData.mockImplementation((url) => {
      if (url === '/data/economy.json') return { data: null, loading: false, error: new Error('Failed') }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText(/error loading economy data/i)).toBeInTheDocument()
  })

  it('shows empty state when no economy data', () => {
    useData.mockImplementation(() => ({ data: null, loading: false, error: null }))
    renderComponent()
    expect(screen.getByText(/no economy data available/i)).toBeInTheDocument()
  })

  // --- Page rendering ---
  it('renders the page heading', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Economy & Work')).toBeInTheDocument()
  })

  it('renders claimant rate stat', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('5.6%')).toBeInTheDocument()
    expect(screen.getByText('Claimant Rate')).toBeInTheDocument()
  })

  it('renders weekly pay stat', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('£670')).toBeInTheDocument()
    expect(screen.getByText('Weekly Pay')).toBeInTheDocument()
  })

  it('renders annual pay stat', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('£33,208')).toBeInTheDocument()
    expect(screen.getByText('Annual Pay')).toBeInTheDocument()
  })

  it('renders top industry stat', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Top Industry')).toBeInTheDocument()
    expect(screen.getByText('Wholesale & retail trade')).toBeInTheDocument()
  })

  it('renders professional pct stat', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('33.8%')).toBeInTheDocument()
    expect(screen.getByText('Professional %')).toBeInTheDocument()
  })

  it('renders part-time pct stat', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('29.6%')).toBeInTheDocument()
    expect(screen.getByText('Part-time %')).toBeInTheDocument()
  })

  // --- Tabs ---
  it('renders tab buttons', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Ward Analysis' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Claimant Trends' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Earnings & Income' })).toBeInTheDocument()
  })

  it('overview tab is active by default', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
  })

  // --- Overview tab content ---
  it('renders industry chart in overview', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Industry')).toBeInTheDocument()
  })

  it('renders occupation chart in overview', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Occupation')).toBeInTheDocument()
  })

  it('renders earnings comparison chart in overview', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Earnings Comparison')).toBeInTheDocument()
  })

  // --- Ward Analysis tab ---
  it('switches to ward analysis tab', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    expect(screen.getByRole('tab', { name: 'Ward Analysis' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Ward')).toBeInTheDocument()
  })

  it('renders ward table with data', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    expect(screen.getAllByText(/Bank Hall/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Daneshouse/i).length).toBeGreaterThanOrEqual(1)
  })

  it('selects a ward from dropdown', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    const select = document.getElementById('economy-ward-select')
    fireEvent.change(select, { target: { value: 'Bank Hall' } })
    expect(screen.getAllByText(/Bank Hall/i).length).toBeGreaterThanOrEqual(2)
  })

  it('shows ward detail when selected', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    const select = document.getElementById('economy-ward-select')
    fireEvent.change(select, { target: { value: 'Bank Hall' } })
    expect(screen.getByText('Industry')).toBeInTheDocument()
  })

  it('renders ward table columns', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    expect(screen.getByText('Claimants')).toBeInTheDocument()
    expect(screen.getByText('Rate %')).toBeInTheDocument()
    expect(screen.getAllByText('Top Industry').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Professional %').length).toBeGreaterThanOrEqual(1)
  })

  it('hides map section when no ward boundaries', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    expect(screen.queryByText('Map metric:')).not.toBeInTheDocument()
  })

  // --- Claimant Trends tab ---
  it('switches to claimant trends tab', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Claimant Trends' }))
    expect(screen.getByRole('tab', { name: 'Claimant Trends' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Claimant Count Trend')).toBeInTheDocument()
  })

  it('renders claimant rate trend chart', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Claimant Trends' }))
    expect(screen.getByText('Claimant Rate Trend')).toBeInTheDocument()
  })

  it('renders ward claimant rates table', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Claimant Trends' }))
    expect(screen.getByText('Ward Claimant Rates')).toBeInTheDocument()
    expect(screen.getAllByText(/Bank Hall/i).length).toBeGreaterThanOrEqual(1)
  })

  it('shows empty claimant message when no data', () => {
    setupMocks({ economy: { ...mockEconomy, claimant_count: { latest: null, history: [], wards: {} } } })
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Claimant Trends' }))
    expect(screen.getByText(/no claimant count data/i)).toBeInTheDocument()
  })

  // --- Earnings tab ---
  it('switches to earnings tab', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Earnings & Income' }))
    expect(screen.getByRole('tab', { name: 'Earnings & Income' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Earnings Gap')).toBeInTheDocument()
  })

  it('renders weekly pay comparison chart', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Earnings & Income' }))
    expect(screen.getByText('Weekly Pay Comparison')).toBeInTheDocument()
  })

  it('renders hours worked chart', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Earnings & Income' }))
    expect(screen.getByText('Hours Worked')).toBeInTheDocument()
  })

  it('renders economy explainer section', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Earnings & Income' }))
    expect(screen.getByText('Understanding Economy Data')).toBeInTheDocument()
  })

  it('shows empty earnings for county council', () => {
    setupMocks({ economy: { ...mockEconomy, earnings: null } })
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Earnings & Income' }))
    expect(screen.getByText(/no earnings data available/i)).toBeInTheDocument()
  })

  // --- Source attribution ---
  it('renders data source attribution', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/nomisweb\.co\.uk/i)).toBeInTheDocument()
  })

  // --- Page title ---
  it('sets page title on mount', () => {
    setupMocks()
    renderComponent()
    expect(document.title).toContain('Economy')
    expect(document.title).toContain('Burnley')
  })

  // --- Hero subtitle ---
  it('renders hero subtitle with ward count', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/3 wards/)).toBeInTheDocument()
  })

  // --- Map metric selector with boundaries ---
  it('renders map metric selector when boundaries available', () => {
    useCouncilConfig.mockReturnValue({
      ...mockConfig,
      data_sources: { ...mockConfig.data_sources, ward_boundaries: true },
    })
    setupMocks({ boundaries: { type: 'FeatureCollection', features: [] } })
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    expect(screen.getByText(/Map metric/)).toBeInTheDocument()
  })

  // --- Sparkline ---
  it('renders claimant trend sparkline', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/Claimant trend/)).toBeInTheDocument()
    expect(screen.getByText('3,395')).toBeInTheDocument()
  })

  // --- Strategy talking points ---
  it('calls generateEconomyTalkingPoints when ward is selected', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    const select = document.getElementById('economy-ward-select')
    fireEvent.change(select, { target: { value: 'Bank Hall' } })
    expect(generateEconomyTalkingPoints).toHaveBeenCalledWith('Bank Hall', expect.any(Object))
  })

  it('renders Political Context section when talking points exist', () => {
    generateEconomyTalkingPoints.mockReturnValue([
      { category: 'Economy', icon: 'TrendingDown', priority: 1, text: 'High claimant rate area.' },
    ])
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    const select = document.getElementById('economy-ward-select')
    fireEvent.change(select, { target: { value: 'Bank Hall' } })
    expect(screen.getByText('Political Context')).toBeInTheDocument()
    expect(screen.getByText('High claimant rate area.')).toBeInTheDocument()
  })

  it('does not render Political Context when no talking points', () => {
    generateEconomyTalkingPoints.mockReturnValue([])
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    const select = document.getElementById('economy-ward-select')
    fireEvent.change(select, { target: { value: 'Bank Hall' } })
    expect(screen.queryByText('Political Context')).not.toBeInTheDocument()
  })
})
