import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Housing from './Housing'

vi.mock('../hooks/useData', () => ({
  useData: vi.fn(),
}))

vi.mock('../context/CouncilConfig', () => ({
  useCouncilConfig: vi.fn(),
}))

vi.mock('../utils/strategyEngine', () => ({
  generateHousingTalkingPoints: vi.fn(() => []),
  generateHMOTalkingPoints: vi.fn(() => []),
}))

import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { generateHousingTalkingPoints, generateHMOTalkingPoints } from '../utils/strategyEngine'

const mockConfig = {
  council_id: 'burnley',
  council_name: 'Burnley',
  council_full_name: 'Burnley Borough Council',
  official_website: 'https://burnley.gov.uk',
  data_sources: {
    housing: true,
    hmo: true,
    ward_boundaries: false,
    planning: false,
  },
}

const mockHousing = {
  meta: {
    source: 'ONS Census 2021 via Nomis API',
    council_id: 'burnley',
    council_name: 'Burnley',
    generated: '2026-03-09',
  },
  census: {
    council_totals: {
      tenure: {
        'Total: All households': 39871,
        'Owned': 23836,
        'Social rented': 6209,
        'Private rented': 9735,
        'Lives rent free': 39,
      },
      accommodation_type: {
        'Total': 39873,
        'Detached': 5650,
        'Semi-detached': 11921,
        'Terraced': 18580,
        'In a purpose-built block of flats or tenement': 2788,
      },
      overcrowding: {
        'Total: All households': 39872,
        'Occupancy rating of bedrooms: +2 or more': 10794,
        'Occupancy rating of bedrooms: +1': 16070,
        'Occupancy rating of bedrooms: 0': 11099,
        'Occupancy rating of bedrooms: -1': 1509,
        'Occupancy rating of bedrooms: -2 or less': 400,
      },
      bedrooms: {
        'Total: All households': 39871,
        '1 bedroom': 4200,
        '2 bedrooms': 13500,
        '3 bedrooms': 16000,
        '4 or more bedrooms': 6171,
      },
      household_size: {
        'Total: All households': 39871,
        '1 person in household': 14500,
        '2 people in household': 12000,
        '3 people in household': 6000,
        '4 people in household': 4500,
        '5 people in household': 1800,
        '6 people in household': 700,
        '7 people in household': 200,
        '8 or more people in household': 171,
      },
    },
    wards: {
      'E05005150': {
        name: 'Bank Hall',
        tenure: {
          'Total: All households': 2777,
          'Owned': 1071,
          'Social rented': 576,
          'Private rented': 1118,
          'Lives rent free': 4,
        },
        overcrowding: {
          'Total: All households': 2777,
          'Occupancy rating of bedrooms: -1': 211,
          'Occupancy rating of bedrooms: -2 or less': 75,
        },
      },
      'E05005151': {
        name: 'Briercliffe',
        tenure: {
          'Total: All households': 2468,
          'Owned': 1958,
          'Social rented': 200,
          'Private rented': 300,
          'Lives rent free': 10,
        },
        overcrowding: {
          'Total: All households': 2468,
          'Occupancy rating of bedrooms: -1': 50,
          'Occupancy rating of bedrooms: -2 or less': 10,
        },
      },
    },
  },
  policy: {
    article_4: {
      active: true,
      date: 'Oct 2024',
      scope: 'Selected wards',
      wards: ['Bank Hall', 'Brunshaw', 'Daneshouse with Stoneyholme'],
    },
    selective_licensing: {
      active: true,
      date: 'Apr 2025',
      wards: ['Trinity', 'Queensgate'],
    },
  },
  summary: {
    total_households: 39871,
    owned: 23836,
    owned_pct: 59.8,
    social_rented: 6209,
    social_rented_pct: 15.6,
    private_rented: 9735,
    private_rented_pct: 24.4,
    rent_free: 39,
    rent_free_pct: 0.1,
    overcrowded: 1909,
    overcrowding_pct: 4.8,
    detached_pct: 14.2,
    semi_detached_pct: 29.9,
    terraced_pct: 46.6,
    flat_pct: 9.1,
    avg_household_size: 2.35,
    has_article_4: true,
    has_selective_licensing: true,
  },
}

const mockHmo = {
  meta: { council_id: 'burnley' },
  register: [],
  planning_hmos: [
    { uid: 'FUL/2025/0115', address: '181 Manchester Road', ward: 'Trinity' },
  ],
  summary: {
    total_licensed: 0,
    total_planning_apps: 1,
    total_bed_spaces: 0,
    by_ward: {
      'Trinity': { licensed_hmos: 0, planning_applications: 1 },
    },
  },
}

function setupMocks({ housing = mockHousing, hmo = mockHmo, boundaries = null } = {}) {
  useData.mockImplementation((url) => {
    if (url === '/data/housing.json') return { data: housing, loading: !housing, error: null }
    if (url === '/data/hmo.json') return { data: hmo, loading: false, error: null }
    if (url === '/data/ward_boundaries.json') return { data: boundaries, loading: false, error: null }
    if (url === null) return { data: null, loading: false, error: null }
    return { data: null, loading: false, error: null }
  })
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <Housing />
    </MemoryRouter>
  )
}

describe('Housing', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useCouncilConfig.mockReturnValue(mockConfig)
    generateHousingTalkingPoints.mockReturnValue([])
    generateHMOTalkingPoints.mockReturnValue([])
  })

  // --- Loading states ---
  it('shows loading state while data loads', () => {
    useData.mockImplementation(() => ({ data: null, loading: true, error: null }))
    renderComponent()
    expect(document.querySelector('.loading-state, [class*="loading"]')).toBeTruthy()
  })

  it('shows error state on data error', () => {
    useData.mockImplementation((url) => {
      if (url === '/data/housing.json') return { data: null, loading: false, error: new Error('Failed') }
      return { data: null, loading: false, error: null }
    })
    renderComponent()
    expect(screen.getByText(/error loading housing data/i)).toBeInTheDocument()
  })

  it('shows empty state when no housing data', () => {
    useData.mockImplementation(() => ({ data: null, loading: false, error: null }))
    renderComponent()
    expect(screen.getByText(/no housing data available/i)).toBeInTheDocument()
  })

  // --- Page rendering ---
  it('renders the page heading', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Housing')).toBeInTheDocument()
  })

  it('renders summary statistics', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('39,871')).toBeInTheDocument()
    expect(screen.getByText('59.8%')).toBeInTheDocument()
    expect(screen.getByText('15.6%')).toBeInTheDocument()
    expect(screen.getByText('24.4%')).toBeInTheDocument()
    expect(screen.getByText('4.8%')).toBeInTheDocument()
  })

  it('renders total households label', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Total Households')).toBeInTheDocument()
  })

  it('renders tenure labels', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Owner-Occupied')).toBeInTheDocument()
    expect(screen.getByText('Social Rented')).toBeInTheDocument()
    expect(screen.getByText('Private Rented')).toBeInTheDocument()
  })

  it('renders overcrowded label', () => {
    setupMocks()
    renderComponent()
    const matches = screen.getAllByText('Overcrowded')
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  // --- Tabs ---
  it('renders tab buttons', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Ward Analysis' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'HMO & Licensing' })).toBeInTheDocument()
  })

  it('overview tab is active by default', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
  })

  it('switches to ward analysis tab', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    expect(screen.getByRole('tab', { name: 'Ward Analysis' })).toHaveAttribute('aria-selected', 'true')
    // Ward names appear in both <option> and <td>
    expect(screen.getAllByText('Bank Hall').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Briercliffe').length).toBeGreaterThanOrEqual(1)
  })

  it('switches to HMO tab', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'HMO & Licensing' }))
    expect(screen.getByRole('tab', { name: 'HMO & Licensing' })).toHaveAttribute('aria-selected', 'true')
  })

  // --- Overview tab content ---
  it('renders chart cards in overview', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Housing Tenure')).toBeInTheDocument()
    expect(screen.getByText('Accommodation Type')).toBeInTheDocument()
    expect(screen.getByText('Number of Bedrooms')).toBeInTheDocument()
    expect(screen.getByText('Overcrowding Rate')).toBeInTheDocument()
  })

  // --- Policy section ---
  it('renders Article 4 policy as active', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Article 4 Direction (HMO)')).toBeInTheDocument()
    // Find the first "Active" status badge (in the policy card)
    const activeBadges = screen.getAllByText('Active')
    expect(activeBadges.length).toBeGreaterThan(0)
  })

  it('renders selective licensing as active', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Selective Licensing')).toBeInTheDocument()
  })

  it('renders Article 4 wards', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/Bank Hall, Brunshaw, Daneshouse with Stoneyholme/)).toBeInTheDocument()
  })

  // --- Ward Analysis tab ---
  it('renders ward table with data', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    expect(screen.getByText('Ward')).toBeInTheDocument()
    expect(screen.getByText('Households')).toBeInTheDocument()
    expect(screen.getByText('Owned %')).toBeInTheDocument()
  })

  it('selects a ward from dropdown', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    const select = document.getElementById('ward-select')
    fireEvent.change(select, { target: { value: 'Bank Hall' } })
    // Ward name appears in option, h3 detail, and table td
    expect(screen.getAllByText('Bank Hall').length).toBeGreaterThanOrEqual(2)
  })

  it('shows ward detail when selected', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    const select = document.getElementById('ward-select')
    fireEvent.change(select, { target: { value: 'Bank Hall' } })
    // Ward detail card should show
    expect(screen.getByText(/2,777 households/)).toBeInTheDocument()
  })

  // --- HMO tab ---
  it('shows HMO planning apps count', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'HMO & Licensing' }))
    expect(screen.getByText('HMO Planning Apps')).toBeInTheDocument()
  })

  it('shows empty HMO state when no data', () => {
    setupMocks({ hmo: null })
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'HMO & Licensing' }))
    expect(screen.getByText(/no hmo register data available/i)).toBeInTheDocument()
  })

  it('renders regulation framework section on HMO tab', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'HMO & Licensing' }))
    expect(screen.getByText('HMO Regulation Framework')).toBeInTheDocument()
  })

  // --- Source attribution ---
  it('renders data source attribution', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/census 2021 via nomis api/i)).toBeInTheDocument()
  })

  // --- No policy ---
  it('renders inactive policy badges when no Article 4', () => {
    const noPolicy = {
      ...mockHousing,
      policy: {
        article_4: { active: false },
        selective_licensing: { active: false },
      },
      summary: {
        ...mockHousing.summary,
        has_article_4: false,
        has_selective_licensing: false,
      },
    }
    setupMocks({ housing: noPolicy })
    renderComponent()
    const badges = screen.getAllByText('Not in place')
    expect(badges.length).toBe(2)
  })

  // --- Page title ---
  it('sets page title on mount', () => {
    setupMocks()
    renderComponent()
    expect(document.title).toContain('Housing')
    expect(document.title).toContain('Burnley')
  })

  // --- Multiple wards in table ---
  it('renders multiple wards in ward table', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    const rows = document.querySelectorAll('.ward-table tbody tr')
    expect(rows.length).toBe(2)
  })

  // --- Config-dependent loading ---
  it('does not fetch ward boundaries when config disables it', () => {
    setupMocks()
    renderComponent()
    // Verify useData was called with null for ward_boundaries
    const calls = useData.mock.calls
    const nullCalls = calls.filter(c => c[0] === null)
    expect(nullCalls.length).toBeGreaterThan(0)
  })

  // --- Hero subtitle ---
  it('renders hero subtitle with ward count and household count', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText(/2 wards covering 39,871 households/)).toBeInTheDocument()
  })

  // --- Terraced stat ---
  it('shows terraced percentage stat card', () => {
    setupMocks()
    renderComponent()
    expect(screen.getByText('Terraced Houses')).toBeInTheDocument()
    expect(screen.getByText('46.6%')).toBeInTheDocument()
  })

  // --- Map metric selector (wards tab) ---
  it('hides map section when no ward boundaries', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    expect(screen.queryByText('Map metric:')).not.toBeInTheDocument()
  })

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
  it('calls generateHousingTalkingPoints when ward is selected', () => {
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    const select = document.getElementById('ward-select')
    fireEvent.change(select, { target: { value: 'Bank Hall' } })
    expect(generateHousingTalkingPoints).toHaveBeenCalledWith('Bank Hall', expect.any(Object))
  })

  it('renders Political Context section when talking points exist', () => {
    generateHousingTalkingPoints.mockReturnValue([
      { category: 'Housing', icon: 'Building', priority: 1, text: 'High social housing dependency.' },
    ])
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    const select = document.getElementById('ward-select')
    fireEvent.change(select, { target: { value: 'Bank Hall' } })
    expect(screen.getByText('Political Context')).toBeInTheDocument()
    expect(screen.getByText('High social housing dependency.')).toBeInTheDocument()
  })

  it('does not render Political Context when no talking points', () => {
    generateHousingTalkingPoints.mockReturnValue([])
    generateHMOTalkingPoints.mockReturnValue([])
    setupMocks()
    renderComponent()
    fireEvent.click(screen.getByRole('tab', { name: 'Ward Analysis' }))
    const select = document.getElementById('ward-select')
    fireEvent.change(select, { target: { value: 'Bank Hall' } })
    expect(screen.queryByText('Political Context')).not.toBeInTheDocument()
  })
})
