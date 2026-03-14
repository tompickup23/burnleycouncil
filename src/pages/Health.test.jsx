import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Health from './Health'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

vi.mock('../utils/strategyEngine', () => ({
  generateHealthTalkingPoints: vi.fn(() => []),
}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { generateHealthTalkingPoints } from '../utils/strategyEngine'

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  data_sources: {
    health: true,
    ward_boundaries: false,
  },
}

const mockHealth = {
  meta: {
    source: 'Fingertips API (OHID) + Census 2021 via Nomis',
    council_id: 'burnley',
    council_name: 'Burnley',
    ons_code: 'E07000117',
    census_date: '2021-03-21',
    generated: '2026-03-09T22:18:10',
  },
  indicators: {
    life_expectancy_male: {
      value: 77.0,
      unit: 'years',
      period: '2024',
      label: 'Life expectancy at birth (male)',
      ci_lower: 75.8,
      ci_upper: 78.2,
      compared_to_england: 'Worse',
      england_value: 79.8,
      nw_value: 78.4,
    },
    life_expectancy_female: {
      value: 80.4,
      unit: 'years',
      period: '2024',
      label: 'Life expectancy at birth (female)',
      ci_lower: 79.2,
      ci_upper: 81.6,
      compared_to_england: 'Worse',
      england_value: 83.6,
      nw_value: 82.2,
    },
    obesity_prevalence: {
      value: 70.4,
      unit: 'pct',
      period: '2023/24',
      label: 'Overweight/obese adults',
      compared_to_england: 'Worse',
      england_value: 64.5,
      nw_value: 66.7,
    },
    cvd_mortality_u75: {
      value: 125.7,
      unit: 'per 100,000',
      period: '2024',
      label: 'Under 75 CVD mortality',
      compared_to_england: 'Worse',
      england_value: 74.3,
      nw_value: 90.1,
    },
    suicide_rate: {
      value: 17.8,
      unit: 'per 100,000',
      period: '2022 - 24',
      label: 'Suicide rate',
      compared_to_england: 'Worse',
      england_value: 10.5,
      nw_value: 12.1,
    },
  },
  census: {
    council_totals: {
      general_health: {
        'Very good health': 42648,
        'Good health': 31733,
        'Fair health': 13467,
        'Bad health': 5707,
        'Very bad health': 1690,
      },
      disability: {
        'Day-to-day activities limited a lot': 8732,
        'Day-to-day activities limited a little': 10830,
        'Has long term physical or mental health condition but day-to-day activities are not limited': 4500,
        'No long term physical or mental health conditions': 70183,
      },
      unpaid_care: {
        'Provides no unpaid care': 82800,
        '9 hours or less unpaid care a week': 2400,
        '10 to 19 hours unpaid care a week': 1200,
        '20 to 34 hours unpaid care a week': 900,
        '35 to 49 hours unpaid care a week': 1100,
        '50 or more hours unpaid care a week': 2100,
      },
    },
    wards: {
      E05005150: {
        name: 'Bank Hall',
        general_health: {
          'Very good health': 2800,
          'Good health': 2200,
          'Fair health': 1000,
          'Bad health': 430,
          'Very bad health': 120,
        },
        disability: {
          'Day-to-day activities limited a lot': 580,
          'Day-to-day activities limited a little': 690,
          'No long term physical or mental health conditions': 4300,
        },
        unpaid_care: {
          'Provides no unpaid care': 5400,
          '9 hours or less unpaid care a week': 150,
          '50 or more hours unpaid care a week': 160,
        },
      },
      E05005155: {
        name: 'Daneshouse with Stoneyholme',
        general_health: {
          'Very good health': 2600,
          'Good health': 2100,
          'Fair health': 950,
          'Bad health': 480,
          'Very bad health': 150,
        },
        disability: {
          'Day-to-day activities limited a lot': 620,
          'Day-to-day activities limited a little': 710,
          'No long term physical or mental health conditions': 4100,
        },
        unpaid_care: {
          'Provides no unpaid care': 5100,
          '50 or more hours unpaid care a week': 180,
        },
      },
      E05005161: {
        name: 'Trinity',
        general_health: {
          'Very good health': 2700,
          'Good health': 2000,
          'Fair health': 900,
          'Bad health': 400,
          'Very bad health': 130,
        },
        disability: {
          'Day-to-day activities limited a lot': 500,
          'Day-to-day activities limited a little': 650,
          'No long term physical or mental health conditions': 4200,
        },
        unpaid_care: {
          'Provides no unpaid care': 5200,
        },
      },
    },
  },
  summary: {
    life_expectancy_male: 77.0,
    life_expectancy_female: 80.4,
    obesity_prevalence: 70.4,
    suicide_rate: 17.8,
    drug_misuse_deaths: 7.6,
    good_health_pct: 78.4,
    bad_health_pct: 7.0,
    disability_pct: 20.6,
    unpaid_carers_pct: 9.5,
  },
}

function setupMocks({ health = mockHealth, boundaries = null } = {}) {
  useData.mockImplementation((url) => {
    if (url === '/data/health.json') return { data: health, loading: !health && health !== null, error: null }
    if (url === '/data/ward_boundaries.json') return { data: boundaries, loading: false, error: null }
    if (url === null) return { data: null, loading: false, error: null }
    return { data: null, loading: false, error: null }
  })
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <Health />
    </MemoryRouter>
  )
}

describe('Health', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
    generateHealthTalkingPoints.mockReturnValue([])
  })

  // --- Loading states ---
  it('shows loading state while data loads', () => {
    useData.mockImplementation(() => ({ data: null, loading: true, error: null }))
    renderComponent()
    expect(document.querySelector('.loading-state, [class*="loading"]')).toBeTruthy()
  })

  it('shows error state on data error', () => {
    useData.mockImplementation((url) => {
      if (url === '/data/health.json') return { data: null, loading: false, error: new Error('Failed') }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText(/error loading health data/i)).toBeInTheDocument()
  })

  it('shows empty state when no health data', () => {
    useData.mockImplementation(() => ({ data: null, loading: false, error: null }))
    renderComponent()
    expect(screen.getByText(/no health data available/i)).toBeInTheDocument()
  })

  // --- Page rendering ---
  it('renders the page heading', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Health & Wellbeing')).toBeInTheDocument()
  })

  it('renders life expectancy male stat', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('77.0')).toBeInTheDocument()
    expect(screen.getByText('Life Expectancy (M)')).toBeInTheDocument()
  })

  it('renders life expectancy female stat', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('80.4')).toBeInTheDocument()
    expect(screen.getByText('Life Expectancy (F)')).toBeInTheDocument()
  })

  it('renders obesity stat', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('70.4%')).toBeInTheDocument()
    expect(screen.getByText('Obesity')).toBeInTheDocument()
  })

  it('renders good health stat', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('78.4%')).toBeInTheDocument()
    expect(screen.getByText('Good Health')).toBeInTheDocument()
  })

  it('renders disability stat', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('20.6%')).toBeInTheDocument()
    const labels = screen.getAllByText('Disability')
    expect(labels.length).toBeGreaterThanOrEqual(1)
  })

  it('renders unpaid carers stat', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('9.5%')).toBeInTheDocument()
    expect(screen.getByText('Unpaid Carers')).toBeInTheDocument()
  })

  // --- Tabs ---
  it('renders tab buttons', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Ward Analysis' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Indicators' })).toBeInTheDocument()
  })

  it('overview tab is active by default', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
  })

  // --- Overview tab content ---
  it('renders general health chart in overview', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('General Health')).toBeInTheDocument()
  })

  it('renders disability chart in overview', () => {
    setupMocks()
    renderComponent()
    const labels = screen.getAllByText('Disability')
    expect(labels.length).toBeGreaterThanOrEqual(1)
  })

  it('renders mortality rates chart in overview', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Key Mortality Rates')).toBeInTheDocument()
  })

  it('renders life expectancy gauge', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Life Expectancy Gap')).toBeInTheDocument()
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
    const select = document.getElementById('health-ward-select')
    fireEvent.change(select, { target: { value: 'Bank Hall' } })
    expect(screen.getAllByText(/Bank Hall/i).length).toBeGreaterThanOrEqual(2)
  })

  it('shows ward detail when selected', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    const select = document.getElementById('health-ward-select')
    fireEvent.change(select, { target: { value: 'Bank Hall' } })
    expect(screen.getByText('General Health')).toBeInTheDocument()
  })

  it('renders ward table columns', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    expect(screen.getByText('Good Health %')).toBeInTheDocument()
    expect(screen.getByText('Bad Health %')).toBeInTheDocument()
    expect(screen.getByText('Disability %')).toBeInTheDocument()
    expect(screen.getByText('Carers %')).toBeInTheDocument()
  })

  it('hides map section when no ward boundaries', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    expect(screen.queryByText('Map metric:')).not.toBeInTheDocument()
  })

  // --- Indicators tab ---
  it('switches to indicators tab', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Indicators' }))
    expect(screen.getByText('Indicator')).toBeInTheDocument()
    expect(screen.getByText('Period')).toBeInTheDocument()
    expect(screen.getByText('England')).toBeInTheDocument()
  })

  it('renders indicator values', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Indicators' }))
    expect(screen.getByText('Life expectancy at birth (male)')).toBeInTheDocument()
    expect(screen.getByText('Overweight/obese adults')).toBeInTheDocument()
  })

  it('renders comparison badges', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Indicators' }))
    const badges = screen.getAllByText('Worse')
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })

  it('renders indicator explainer section', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Indicators' }))
    expect(screen.getByText('Understanding Health Indicators')).toBeInTheDocument()
  })

  it('shows empty indicators for county council', () => {
    setupMocks({ health: { ...mockHealth, indicators: {} } })
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Indicators' }))
    expect(screen.getByText(/no fingertips indicator data/i)).toBeInTheDocument()
  })

  // --- Source attribution ---
  it('renders data source attribution', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/fingertips\.phe\.org\.uk/i)).toBeInTheDocument()
    expect(screen.getByText(/nomisweb\.co\.uk/i)).toBeInTheDocument()
  })

  // --- Page title ---
  it('sets page title on mount', () => {
    setupMocks()
    renderComponent()
    expect(document.title).toContain('Health')
    expect(document.title).toContain('Burnley')
  })

  // --- Hero subtitle ---
  it('renders hero subtitle with indicator count', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/5 public health indicators/)).toBeInTheDocument()
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
  it('calls generateHealthTalkingPoints when ward is selected', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    const select = document.getElementById('health-ward-select')
    fireEvent.change(select, { target: { value: 'Bank Hall' } })
    expect(generateHealthTalkingPoints).toHaveBeenCalledWith('Bank Hall', expect.any(Object))
  })

  it('renders Political Context section when talking points exist', () => {
    generateHealthTalkingPoints.mockReturnValue([
      { category: 'Health', icon: 'Heart', priority: 1, text: 'Low life expectancy area.' },
    ])
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    const select = document.getElementById('health-ward-select')
    fireEvent.change(select, { target: { value: 'Bank Hall' } })
    expect(screen.getByText('Political Context')).toBeInTheDocument()
    expect(screen.getByText('Low life expectancy area.')).toBeInTheDocument()
  })

  it('does not render Political Context when no talking points', () => {
    generateHealthTalkingPoints.mockReturnValue([])
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    const select = document.getElementById('health-ward-select')
    fireEvent.change(select, { target: { value: 'Bank Hall' } })
    expect(screen.queryByText('Political Context')).not.toBeInTheDocument()
  })
})
