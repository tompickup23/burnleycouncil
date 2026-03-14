import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Crime from './Crime'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

vi.mock('../utils/strategyEngine', () => ({
  generateCrimeTalkingPoints: vi.fn(() => []),
}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { generateCrimeTalkingPoints } from '../utils/strategyEngine'

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  data_sources: {
    crime_stats: true,
    ward_boundaries: false,
  },
}

const mockCrime = {
  borough: 'burnley',
  borough_name: 'Burnley',
  date: '2025-12',
  total_crimes: 1119,
  total_stop_and_search: 67,
  by_category: {
    'violent-crime': 364,
    'anti-social-behaviour': 234,
    'burglary': 116,
    'criminal-damage-arson': 97,
    'shoplifting': 94,
    'other-theft': 52,
    'public-order': 42,
    'vehicle-crime': 38,
    'other-crime': 37,
    'drugs': 29,
  },
  category_display: {
    'violent-crime': { name: 'Violence & sexual offences', count: 364 },
    'anti-social-behaviour': { name: 'Anti-social behaviour', count: 234 },
    'burglary': { name: 'Burglary', count: 116 },
    'criminal-damage-arson': { name: 'Criminal damage & arson', count: 97 },
    'shoplifting': { name: 'Shoplifting', count: 94 },
    'other-theft': { name: 'Other theft', count: 52 },
    'public-order': { name: 'Public order', count: 42 },
    'vehicle-crime': { name: 'Vehicle crime', count: 38 },
    'other-crime': { name: 'Other crime', count: 37 },
    'drugs': { name: 'Drugs', count: 29 },
  },
  outcomes: {
    'Investigation complete; no suspect identified': 185,
    'Under investigation': 450,
    'Unable to prosecute suspect': 150,
    'Local resolution': 43,
    'Awaiting court outcome': 33,
    'Offender given a caution': 17,
    'Offender given penalty notice': 3,
  },
  ward_count: 3,
  wards: {
    'BU1': {
      ward_id: 'BU1',
      name: 'Bank Hall - Burnley',
      total_crimes: 121,
      by_category: { 'violent-crime': 44, 'anti-social-behaviour': 29 },
      outcomes: { 'Under investigation': 50 },
      stop_and_search: { total: 14 },
    },
    'BU2': {
      ward_id: 'BU2',
      name: 'Daneshouse with Stoneyholme',
      total_crimes: 153,
      by_category: { 'violent-crime': 40, 'anti-social-behaviour': 43 },
      outcomes: { 'Under investigation': 65 },
      stop_and_search: { total: 23 },
    },
    'BU9': {
      ward_id: 'BU9',
      name: 'Trinity - Burnley',
      total_crimes: 143,
      by_category: { 'violent-crime': 34, 'anti-social-behaviour': 22 },
      outcomes: { 'Under investigation': 69 },
      stop_and_search: { total: 12 },
    },
  },
  generated_at: '2026-02-07T03:17:54.542925',
}

const mockHistory = [
  {
    date: '2025-11',
    total_crimes: 980,
    by_category: { 'violent-crime': 320, 'anti-social-behaviour': 210, 'burglary': 100 },
  },
  {
    date: '2025-12',
    total_crimes: 1119,
    by_category: { 'violent-crime': 364, 'anti-social-behaviour': 234, 'burglary': 116 },
  },
]

function setupMocks({ crime = mockCrime, history = mockHistory, boundaries = null } = {}) {
  useData.mockImplementation((url) => {
    if (url === '/data/crime_stats.json') return { data: crime, loading: !crime && crime !== null, error: null }
    if (url === '/data/crime_history.json') return { data: history, loading: false, error: null }
    if (url === '/data/ward_boundaries.json') return { data: boundaries, loading: false, error: null }
    if (url === '/data/deprivation.json') return { data: null, loading: false, error: null }
    if (url === null) return { data: null, loading: false, error: null }
    return { data: null, loading: false, error: null }
  })
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <Crime />
    </MemoryRouter>
  )
}

describe('Crime', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
    generateCrimeTalkingPoints.mockReturnValue([])
  })

  // --- Loading states ---
  it('shows loading state while data loads', () => {
    useData.mockImplementation(() => ({ data: null, loading: true, error: null }))
    renderComponent()
    expect(document.querySelector('.loading-state, [class*="loading"]')).toBeTruthy()
  })

  it('shows error state on data error', () => {
    useData.mockImplementation((url) => {
      if (url === '/data/crime_stats.json') return { data: null, loading: false, error: new Error('Failed') }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText(/error loading crime data/i)).toBeInTheDocument()
  })

  it('shows empty state when no crime data', () => {
    useData.mockImplementation(() => ({ data: null, loading: false, error: null }))
    renderComponent()
    expect(screen.getByText(/no crime data available/i)).toBeInTheDocument()
  })

  // --- Page rendering ---
  it('renders the page heading', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Crime & Safety')).toBeInTheDocument()
  })

  it('renders total crimes stat', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('1,119')).toBeInTheDocument()
    expect(screen.getByText('Total Crimes')).toBeInTheDocument()
  })

  it('renders violent crime stat', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('364')).toBeInTheDocument()
    expect(screen.getByText('Violent Crime')).toBeInTheDocument()
  })

  it('renders ASB stat', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('234')).toBeInTheDocument()
    expect(screen.getByText('Anti-Social Behaviour')).toBeInTheDocument()
  })

  it('renders stop and search stat', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('67')).toBeInTheDocument()
    expect(screen.getByText('Stop & Search')).toBeInTheDocument()
  })

  it('renders resolution rate stat', () => {
    setupMocks()
    renderComponent()
    const rateLabels = screen.getAllByText('Resolution Rate')
    expect(rateLabels.length).toBeGreaterThanOrEqual(1)
  })

  it('renders date period', () => {
    setupMocks()
    renderComponent()
    const dateElements = screen.getAllByText('2025-12')
    expect(dateElements.length).toBeGreaterThanOrEqual(1)
  })

  // --- Tabs ---
  it('renders tab buttons', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Ward Analysis' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Trends' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Outcomes' })).toBeInTheDocument()
  })

  it('overview tab is active by default', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
  })

  // --- Overview tab content ---
  it('renders category chart in overview', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Crime by Category')).toBeInTheDocument()
  })

  it('renders outcomes chart in overview', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Investigation Outcomes')).toBeInTheDocument()
  })

  it('renders resolution rate gauge in overview', () => {
    setupMocks()
    renderComponent()
    const rateLabels = screen.getAllByText('Resolution Rate')
    expect(rateLabels.length).toBeGreaterThanOrEqual(1)
  })

  it('renders highest crime wards chart', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Highest Crime Wards')).toBeInTheDocument()
  })

  // --- Ward Analysis tab ---
  it('switches to ward analysis tab', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    expect(screen.getByRole('tab', { name: 'Ward Analysis' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Ward')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
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
    const select = document.getElementById('crime-ward-select')
    fireEvent.change(select, { target: { value: 'Bank Hall - Burnley' } })
    expect(screen.getAllByText(/Bank Hall/i).length).toBeGreaterThanOrEqual(2)
  })

  it('shows ward detail when selected', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    const select = document.getElementById('crime-ward-select')
    fireEvent.change(select, { target: { value: 'Bank Hall - Burnley' } })
    expect(screen.getByText(/121 crimes/)).toBeInTheDocument()
  })

  it('hides map section when no ward boundaries', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    expect(screen.queryByText('Map metric:')).not.toBeInTheDocument()
  })

  // --- Trends tab ---
  it('switches to trends tab and shows trend chart', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Trends' }))
    expect(screen.getByText('Monthly Crime Trend')).toBeInTheDocument()
  })

  it('shows month-on-month change', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Trends' }))
    expect(screen.getByText('Month-on-Month Change')).toBeInTheDocument()
  })

  it('shows empty trends when no history', () => {
    setupMocks({ history: null })
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Trends' }))
    expect(screen.getByText(/no historical crime data/i)).toBeInTheDocument()
  })

  // --- Outcomes tab ---
  it('switches to outcomes tab', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Outcomes' }))
    expect(screen.getByText('All Outcomes')).toBeInTheDocument()
  })

  it('renders outcome explainer section', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Outcomes' }))
    expect(screen.getByText('Understanding Crime Outcomes')).toBeInTheDocument()
  })

  // --- Source attribution ---
  it('renders data source attribution', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/data\.police\.uk/i)).toBeInTheDocument()
  })

  // --- Page title ---
  it('sets page title on mount', () => {
    setupMocks()
    renderComponent()
    expect(document.title).toContain('Crime')
    expect(document.title).toContain('Burnley')
  })

  // --- Hero subtitle ---
  it('renders hero subtitle with ward count', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/1,119 crimes recorded/)).toBeInTheDocument()
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

  // --- Strategy talking points ---
  it('calls generateCrimeTalkingPoints when ward is selected', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    const select = document.getElementById('crime-ward-select')
    fireEvent.change(select, { target: { value: 'Bank Hall - Burnley' } })
    expect(generateCrimeTalkingPoints).toHaveBeenCalledWith('Bank Hall - Burnley', null, undefined)
  })

  it('renders Political Context section when talking points exist', () => {
    generateCrimeTalkingPoints.mockReturnValue([
      { category: 'Crime', icon: 'Shield', priority: 1, text: 'High crime deprivation area.' },
    ])
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    const select = document.getElementById('crime-ward-select')
    fireEvent.change(select, { target: { value: 'Bank Hall - Burnley' } })
    expect(screen.getByText('Political Context')).toBeInTheDocument()
    expect(screen.getByText('High crime deprivation area.')).toBeInTheDocument()
  })

  it('does not render Political Context when no talking points', () => {
    generateCrimeTalkingPoints.mockReturnValue([])
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    const select = document.getElementById('crime-ward-select')
    fireEvent.change(select, { target: { value: 'Bank Hall - Burnley' } })
    expect(screen.queryByText('Political Context')).not.toBeInTheDocument()
  })
})
